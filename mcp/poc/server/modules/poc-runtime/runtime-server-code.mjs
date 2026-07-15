function normalizeTool(tool) {
  if (typeof tool === "string") {
    return { name: tool, description: tool, inputSchema: { type: "object", properties: {} } };
  }
  return {
    name: tool?.name || "unnamed_tool",
    description: tool?.description || tool?.display_name || tool?.name || "",
    inputSchema: tool?.inputSchema || { type: "object", properties: {} }
  };
}

export function buildRuntimeServerCode({ instanceId, assetId, assetName, tools = [] }) {
  const normalizedTools = tools.map(normalizeTool);

  return `import express from "express";
import { randomBytes } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const INSTANCE_ID = ${JSON.stringify(instanceId)};
const ASSET_ID = ${JSON.stringify(assetId)};
const ASSET_NAME = ${JSON.stringify(assetName)};
const TOOLS = ${JSON.stringify(normalizedTools, null, 2)};

function makeTraceId() {
  return "trace_poc_" + Date.now().toString(36) + "_" + randomBytes(3).toString("hex");
}

function executeMockConnector(toolName, args) {
  if (toolName !== "sales_top_products") {
    throw new Error("当前 POC 仅支持 sales_top_products 只读 Tool");
  }
  const topN = Math.min(Math.max(Number(args.top_n) || 10, 1), 20);
  const products = ["鲜牛奶", "美式咖啡", "希腊酸奶", "矿泉水", "三明治", "能量饮料", "水果杯", "全麦面包", "茉莉绿茶", "便当"];
  return {
    connector: "mock",
    date_range: args.date_range || "month",
    store_id: args.store_id || "all",
    rows: Array.from({ length: topN }, (_, index) => ({
      rank: index + 1,
      product: products[index % products.length],
      revenue: 9800 - index * 520,
      quantity: 420 - index * 19,
      contribution: (18 - index * 0.9).toFixed(1) + "%"
    }))
  };
}

async function reportEvent(payload) {
  if (!process.env.POC_EVENT_URL || !process.env.POC_EVENT_TOKEN) return;
  try {
    await fetch(process.env.POC_EVENT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-poc-runtime-token": process.env.POC_EVENT_TOKEN
      },
      body: JSON.stringify({ instance_id: INSTANCE_ID, asset_id: ASSET_ID, ...payload })
    });
  } catch {
    // Monitoring must not make a Tool call fail when the admin server is restarting.
  }
}

const server = new Server(
  { name: ASSET_NAME, version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async request => {
  const traceId = makeTraceId();
  const startedAt = Date.now();
  const toolName = request.params.name;
  const args = request.params.arguments || {};
  try {
    const data = executeMockConnector(toolName, args);
    await reportEvent({
      event_type: "tool_call",
      trace_id: traceId,
      status: "success",
      latency_ms: Date.now() - startedAt,
      tool_name: toolName,
      request_params: args,
      response_summary: data
    });
    return { content: [{ type: "text", text: JSON.stringify({ trace_id: traceId, data }) }] };
  } catch (error) {
    await reportEvent({
      event_type: "tool_call",
      trace_id: traceId,
      status: "error",
      latency_ms: Date.now() - startedAt,
      tool_name: toolName,
      request_params: args,
      error: error.message
    });
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ trace_id: traceId, error: error.message }) }] };
  }
});

const app = express();
const sessions = new Map();
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/mcp", res);
  const sessionId = transport._sessionId;
  sessions.set(sessionId, transport);
  res.on("close", () => sessions.delete(sessionId));
  await server.connect(transport);
});
app.post("/mcp", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = sessions.get(sessionId);
  if (!transport) return res.status(404).json({ error: "MCP session not found" });
  await transport.handlePostMessage(req, res);
});
app.get("/health", (req, res) => {
  res.json({ status: "ok", instance_id: INSTANCE_ID, asset_id: ASSET_ID, tools: TOOLS.map(tool => tool.name) });
});

const port = Number(process.env.PORT || 0);
app.listen(port, "127.0.0.1", () => {
  console.log("[MCP POC] " + ASSET_NAME + " listening on " + port);
});
`;
}
