import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeServerCode } from "./runtime-server-code.mjs";

test("generates an asset-specific SSE server with Trace event reporting", () => {
  const code = buildRuntimeServerCode({
    instanceId: "run_sales_1",
    assetId: "mcp_sales_top",
    assetName: "sales_top_products",
    tools: [{
      name: "sales_top_products",
      description: "销售 TopN 查询",
      inputSchema: { type: "object", properties: { top_n: { type: "number" } } }
    }]
  });

  assert.match(code, /app\.get\("\/sse"/);
  assert.match(code, /app\.get\("\/health"/);
  assert.match(code, /sales_top_products/);
  assert.match(code, /trace_poc_/);
  assert.match(code, /POC_EVENT_URL/);
});
