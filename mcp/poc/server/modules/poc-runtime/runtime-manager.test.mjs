import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRuntimeManager } from "./runtime-manager.mjs";

test("starts an asset runtime and returns a local SSE endpoint", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "mcp-runtime-manager-"));
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = () => {
    child.exitCode = 0;
    child.emit("exit", 0);
  };
  const manager = createRuntimeManager({
    rootDir,
    findOpenPort: async () => 4567,
    spawnProcess: () => child,
    waitForHealth: async runtime => ({ ok: true, endpoint: runtime.endpoint })
  });

  try {
    const runtime = await manager.start({
      runtime: { id: "run_1" },
      asset: { id: "mcp_sales_top", name: "sales_top_products", tools: [] },
      eventToken: "token"
    });
    assert.equal(runtime.status, "running");
    assert.equal(runtime.endpoint, "http://127.0.0.1:4567/sse");
    assert.equal(manager.get("run_1"), child);
    await manager.stop("run_1");
    assert.equal(manager.get("run_1"), undefined);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
