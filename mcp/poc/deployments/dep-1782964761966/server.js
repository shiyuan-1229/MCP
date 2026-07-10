/**
 * MCP Server - 由 MCP Forge 自动生成
 * 门店：测试门店B
 * 生成时间：2026/7/2 11:59:21
 * 模板：会员模板、门店模板
 */

var STORES = [{ id: "store1", name: "测试门店B", address: "地址", open: "07:00", close: "23:00", online: true }];



import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";

const server = new Server({ name: "会员门店服务", version: "1.0.0" }, { capabilities: { tools: {} } });

const TOOLS = [
  {
    "name": "member_info",
    "description": "查询会员信息",
    "inputSchema": {
      "type": "object",
      "properties": {
        "member_id": {
          "type": "string",
          "description": "会员ID"
        }
      }
    }
  },
  {
    "name": "member_points",
    "description": "查询会员积分及可兑换优惠券",
    "inputSchema": {
      "type": "object",
      "properties": {
        "member_id": {
          "type": "string",
          "description": "会员ID"
        }
      }
    }
  },
  {
    "name": "coupon_query",
    "description": "查询会员可用优惠券",
    "inputSchema": {
      "type": "object",
      "properties": {
        "member_id": {
          "type": "string",
          "description": "会员ID"
        }
      }
    }
  },
  {
    "name": "store_list",
    "description": "查询附近门店列表及营业状态",
    "inputSchema": {
      "type": "object",
      "properties": {
        "location": {
          "type": "string",
          "description": "位置"
        }
      }
    }
  },
  {
    "name": "store_status",
    "description": "查询指定门店的营业状态",
    "inputSchema": {
      "type": "object",
      "properties": {
        "store_name": {
          "type": "string",
          "description": "门店名称"
        }
      },
      "required": [
        "store_name"
      ]
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments || {};

  if (toolName === "member_info") { var m = { name: "微信用户", level: "黄金会员", points: 2350 }; return { content: [{ type: "text", text: "姓名：" + m.name + "\n等级：" + m.level + "\n积分：" + m.points + " 分" }] }; }

  if (toolName === "member_points") { return { content: [{ type: "text", text: "当前积分：2,350 分\n\n可兑换：\n10元无门槛券 — 500分\n鲜牛奶箱兑换券 — 800分\n现金抵扣¥23.50 — 2,350分" }] }; }

  if (toolName === "coupon_query") { return { content: [{ type: "text", text: "🎫 10元无门槛券（需500分）\n🎫 鲜牛奶箱兑换券（需800分）\n🎫 现金抵扣¥23.50（需2,350分）" }] }; }

  if (toolName === "store_list") { return { content: [{ type: "text", text: STORES.map(function(s) { return s.name + " — " + s.address + " " + (s.online ? "●营业中" : "●已打烊") + "（" + s.open + "-" + s.close + "）"; }).join("\n") }] }; }

  if (toolName === "store_status") { var s = STORES.find(function(x) { return x.name.indexOf(args.store_name) !== -1; }); if (!s) return { content: [{ type: "text", text: "未找到门店: " + args.store_name }] }; return { content: [{ type: "text", text: s.name + "\n地址：" + s.address + "\n营业时间：" + s.open + "-" + s.close + "\n状态：" + (s.online ? "●营业中" : "●已打烊") }] }; }

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
  res.json({ status: "ok", tools: 5, name: "会员门店服务" });
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log("[MCP Server] " + 5 + " tools, SSE: http://localhost:" + PORT + "/sse");
});
