import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildRuntimeServerCode } from "./runtime-server-code.mjs";

function defaultFindOpenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function defaultWaitForHealth(runtime) {
  const url = runtime.endpoint.replace(/\/sse$/, "/health");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return { ok: true, endpoint: runtime.endpoint };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error("POC runtime health check timed out");
}

export function createRuntimeManager({
  rootDir,
  spawnProcess = spawn,
  findOpenPort = defaultFindOpenPort,
  waitForHealth = defaultWaitForHealth,
  onExit = () => {}
}) {
  const children = new Map();

  async function start({ runtime, asset, eventToken, eventUrl = "", executeUrl = "" }) {
    const port = await findOpenPort();
    const endpoint = `http://127.0.0.1:${port}/sse`;
    const runtimeDir = path.join(rootDir, runtime.id);
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(path.join(runtimeDir, "server.mjs"), buildRuntimeServerCode({
      instanceId: runtime.id,
      assetId: asset.id,
      assetName: asset.name,
      tools: asset.tools || []
    }), "utf8");

    const child = spawnProcess(process.execPath, ["server.mjs"], {
      cwd: runtimeDir,
      env: { ...process.env, PORT: String(port), POC_EVENT_TOKEN: eventToken, POC_EVENT_URL: eventUrl, POC_EXECUTE_URL: executeUrl },
      stdio: "ignore"
    });
    children.set(runtime.id, child);
    child.once("exit", (code, signal) => {
      children.delete(runtime.id);
      onExit(runtime.id, { code, signal });
    });

    const started = { ...runtime, status: "starting", port, endpoint };
    try {
      await waitForHealth(started);
      return { ...started, status: "running" };
    } catch (error) {
      await stop(runtime.id);
      throw error;
    }
  }

  async function stop(runtimeId) {
    const child = children.get(runtimeId);
    if (!child || child.exitCode !== null) {
      children.delete(runtimeId);
      return;
    }
    const exited = new Promise(resolve => child.once("exit", resolve));
    child.kill();
    await exited;
  }

  return { start, stop, get: runtimeId => children.get(runtimeId) };
}
