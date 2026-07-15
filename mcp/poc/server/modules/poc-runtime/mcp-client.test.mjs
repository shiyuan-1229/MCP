import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntimeServerCode } from "./runtime-server-code.mjs";
import { callRuntimeTool, inspectRuntime } from "./mcp-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..", "..");

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(url) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error("runtime health check timed out");
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
}

test("inspects and calls a generated SSE MCP runtime", async () => {
  const port = await findOpenPort();
  const runtimeDir = await mkdtemp(path.join(serverRoot, ".poc-runtime-test-"));
  const endpoint = `http://127.0.0.1:${port}/sse`;
  let child;

  try {
    await writeFile(path.join(runtimeDir, "server.mjs"), buildRuntimeServerCode({
      instanceId: "run_sales_test",
      assetId: "mcp_sales_top",
      assetName: "sales_top_products",
      tools: [{ name: "sales_top_products", description: "销售 TopN 查询", inputSchema: { type: "object", properties: {} } }]
    }), "utf8");
    child = spawn(process.execPath, ["server.mjs"], {
      cwd: runtimeDir,
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore"
    });
    await waitForHealth(`http://127.0.0.1:${port}/health`);

    const inspection = await inspectRuntime(endpoint);
    assert.equal(inspection.ok, true, JSON.stringify(inspection));
    assert.equal(inspection.tools[0].name, "sales_top_products");

    const call = await callRuntimeTool({ endpoint, toolName: "sales_top_products", args: { top_n: 2 } });
    assert.equal(call.ok, true);
    assert.match(call.trace_id, /^trace_poc_/);
    assert.equal(call.result.data.rows.length, 2);
  } finally {
    await stopChild(child);
    await rm(runtimeDir, { recursive: true, force: true });
  }
});
