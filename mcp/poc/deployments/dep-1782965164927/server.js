/**
 * MCP Server - 由 MCP Forge 自动生成
 * 门店：测试
 * 生成时间：2026/7/2 12:06:04
 * 模板：商品模板
 */

var PRODUCTS = [
  { id: "p01", name: "元气森林海盐菠萝", price: 9.90, unit: "瓶", category: "饮品", promo: "买2箱享9折" },
  { id: "p02", name: "元气森林白桃", price: 9.90, unit: "瓶", category: "饮品", promo: "买2箱享9折" },
  { id: "p03", name: "农夫山泉5L", price: 9.90, unit: "桶", category: "饮品", promo: "" },
  { id: "p04", name: "农夫山泉550ml", price: 2.00, unit: "瓶", category: "饮品", promo: "整箱购买8折" },
  { id: "p05", name: "鲜牛奶", price: 12.80, unit: "盒", category: "乳品", promo: "第二件半价" },
  { id: "p06", name: "面包组合", price: 9.90, unit: "份", category: "食品", promo: "特价¥9.9" },
  { id: "p07", name: "薯片大礼包", price: 39.90, unit: "包", category: "零食", promo: "" },
  { id: "p08", name: "可乐330ml", price: 3.50, unit: "罐", category: "饮品", promo: "买6送1" },
  { id: "p09", name: "雪碧330ml", price: 3.50, unit: "罐", category: "饮品", promo: "买6送1" },
  { id: "p10", name: "方便面", price: 4.90, unit: "桶", category: "食品", promo: "买5送1" },
];

var PROMOS = [
  { id: "pr01", title: "元气森林系列 买2箱9折", desc: "全场元气森林气泡水买2箱享9折优惠", valid: "本月" },
  { id: "pr02", title: "鲜牛奶 第二件半价", desc: "指定鲜牛奶第二件半价", valid: "本月" },
  { id: "pr03", title: "面包组合 ¥9.9 特惠", desc: "精选面包组合限时特价", valid: "本周" },
  { id: "pr04", title: "会员双倍积分", desc: "全场购物享双倍会员积分", valid: "本月" },
];



import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";

const server = new Server({ name: "功能测试", version: "1.0.0" }, { capabilities: { tools: {} } });

const TOOLS = [
  {
    "name": "product_search",
    "description": "搜索商品，根据关键词匹配商品名称",
    "inputSchema": {
      "type": "object",
      "properties": {
        "keyword": {
          "type": "string",
          "description": "搜索关键词"
        }
      },
      "required": [
        "keyword"
      ]
    }
  },
  {
    "name": "product_detail",
    "description": "查询商品详情",
    "inputSchema": {
      "type": "object",
      "properties": {
        "product_name": {
          "type": "string",
          "description": "商品名称"
        }
      },
      "required": [
        "product_name"
      ]
    }
  },
  {
    "name": "price_query",
    "description": "查询商品价格",
    "inputSchema": {
      "type": "object",
      "properties": {
        "product_name": {
          "type": "string",
          "description": "商品名称"
        }
      },
      "required": [
        "product_name"
      ]
    }
  },
  {
    "name": "promo_list",
    "description": "查询当前所有促销活动",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments || {};

  if (toolName === "product_search") { const kw = args.keyword || ""; const results = PRODUCTS.filter(p => p.name.includes(kw) || p.category.includes(kw)); return { content: [{ type: "text", text: JSON.stringify(results.slice(0, 10), null, 2) }] }; }

  if (toolName === "product_detail") { const p = PRODUCTS.find(x => x.name === args.product_name); return { content: [{ type: "text", text: p ? JSON.stringify(p, null, 2) : "未找到: " + args.product_name }] }; }

  if (toolName === "price_query") { const p = PRODUCTS.find(x => x.name === args.product_name); return { content: [{ type: "text", text: p ? p.name + ": ¥" + p.price + "/" + p.unit + (p.promo ? "，" + p.promo : "") : "未找到" }] }; }

  if (toolName === "promo_list") { return { content: [{ type: "text", text: JSON.stringify(PROMOS, null, 2) }] }; }

  return { content: [{ type: "text", text: "未知 Tool: " + toolName }] };
});

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/mcp", res);
  await server.connect(transport);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", tools: 4, name: "功能测试" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("[MCP Server] " + 4 + " tools, SSE: http://localhost:" + PORT + "/sse");
});
