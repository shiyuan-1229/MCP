import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

function healthUrl(endpoint) {
  const url = new URL(endpoint);
  url.pathname = "/health";
  url.search = "";
  return url;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "unknown MCP error");
}

async function withClient(endpoint, callback) {
  const client = new Client(
    { name: "mcp-forge-agent-console", version: "1.0.0" },
    { capabilities: {} }
  );
  const transport = new SSEClientTransport(new URL(endpoint));
  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close();
  }
}

export async function inspectRuntime(endpoint) {
  const startedAt = Date.now();
  const steps = [];
  try {
    let response;
    try {
      response = await fetch(healthUrl(endpoint));
    } catch (error) {
      return {
        ok: false,
        steps: [{ name: "health", status: "error", detail: errorMessage(error), statusCode: 0 }],
        tools: [], latency_ms: Date.now() - startedAt,
        error: { stage: "health", message: errorMessage(error), statusCode: 0 }
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        steps: [{ name: "health", status: "error", detail: `HTTP ${response.status}`, statusCode: response.status }],
        tools: [], latency_ms: Date.now() - startedAt,
        error: { stage: "health", message: `health check returned HTTP ${response.status}`, statusCode: response.status }
      };
    }
    steps.push({ name: "health", status: "success", detail: "HTTP 200", statusCode: response.status });

    let tools;
    try {
      tools = await withClient(endpoint, async client => {
        steps.push({ name: "connect", status: "success", detail: "SSE MCP initialized" });
        const result = await client.listTools();
        return result.tools || [];
      });
    } catch (error) {
      const stage = steps.some(step => step.name === "connect") ? "list_tools" : "connect";
      return {
        ok: false,
        steps: [...steps, { name: stage, status: "error", detail: errorMessage(error) }],
        tools: [], latency_ms: Date.now() - startedAt,
        error: { stage, message: errorMessage(error) }
      };
    }

    steps.push({ name: "list_tools", status: "success", detail: `Discovered ${tools.length} tools` });
    return { ok: true, steps, tools, latency_ms: Date.now() - startedAt, error: null };
  } catch (error) {
    return {
      ok: false, steps, tools: [], latency_ms: Date.now() - startedAt,
      error: { stage: "connect", message: errorMessage(error) }
    };
  }
}

export async function callRuntimeTool({ endpoint, toolName, args = {} }) {
  const startedAt = Date.now();
  try {
    const rawResult = await withClient(endpoint, client => client.callTool({ name: toolName, arguments: args }));
    const text = rawResult.content?.find(item => item.type === "text")?.text || "{}";
    const payload = JSON.parse(text);
    return {
      ok: !rawResult.isError,
      trace_id: payload.trace_id || "",
      tool_name: toolName,
      result: payload,
      latency_ms: Date.now() - startedAt,
      statusCode: 200,
      error: rawResult.isError ? payload.error || "MCP Tool returned an error" : null
    };
  } catch (error) {
    return {
      ok: false,
      trace_id: "",
      tool_name: toolName,
      result: null,
      latency_ms: Date.now() - startedAt,
      statusCode: 0,
      error: errorMessage(error),
      stage: "call_tool"
    };
  }
}
