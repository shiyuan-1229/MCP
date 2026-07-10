/**
 * MCP Forge - 真实代码生成引擎 v2
 * 根据选中的模板和数据源配置，生成可运行的 Node.js MCP Server 代码
 */

function h(str) {
  // Helper: create handler function body as plain string (no template literal evaluation)
  return str;
}

const TEMPLATE_TOOLS = {
  product: {
    name: "商品模板",
    generateTools: (storeName) => ([
      { name: "product_search", description: "搜索商品，根据关键词匹配商品名称",
        inputSchema: { type: "object", properties: { keyword: { type: "string", description: "搜索关键词" } }, required: ["keyword"] },
        handler: h('const kw = args.keyword || ""; const results = PRODUCTS.filter(p => p.name.includes(kw) || p.category.includes(kw)); return { content: [{ type: "text", text: JSON.stringify(results.slice(0, 10), null, 2) }] };')
      },
      { name: "product_detail", description: "查询商品详情",
        inputSchema: { type: "object", properties: { product_name: { type: "string", description: "商品名称" } }, required: ["product_name"] },
        handler: h('const p = PRODUCTS.find(x => x.name === args.product_name); return { content: [{ type: "text", text: p ? JSON.stringify(p, null, 2) : "\u672a\u627e\u5230: " + args.product_name }] };')
      },
      { name: "price_query", description: "查询商品价格",
        inputSchema: { type: "object", properties: { product_name: { type: "string", description: "商品名称" } }, required: ["product_name"] },
        handler: h('const p = PRODUCTS.find(x => x.name === args.product_name); return { content: [{ type: "text", text: p ? p.name + ": \u00a5" + p.price + "/" + p.unit + (p.promo ? "\uff0c" + p.promo : "") : "\u672a\u627e\u5230" }] };')
      },
      { name: "promo_list", description: "查询当前所有促销活动",
        inputSchema: { type: "object", properties: {} },
        handler: h('return { content: [{ type: "text", text: JSON.stringify(PROMOS, null, 2) }] };')
      },
      { name: "sales_top_products", description: "Query sales TopN products by store, date range and Top N",
        inputSchema: { type: "object", properties: { store_id: { type: "string", description: "store id, optional" }, date_range: { type: "string", description: "today/week/month" }, top_n: { type: "number", description: "Top N" } } },
        handler: h('var topN = Math.min(Math.max(Number(args.top_n) || 10, 1), 20); var rows = PRODUCTS.slice(0, topN).map(function(p, i) { var qty = (topN - i) * 18 + 12; var revenue = Math.round(qty * p.price * 100) / 100; return (i + 1) + ". " + p.name + " | sales: " + qty + " | revenue: \\u00a5" + revenue.toLocaleString(); }); return { content: [{ type: "text", text: "Sales Top" + topN + " products (" + (args.date_range || "month") + (args.store_id ? ", store: " + args.store_id : "") + ")\\n" + rows.join("\\n") }] };')
      },
    ])
  },
  inventory: {
    name: "库存模板",
    generateTools: (storeName) => ([
      { name: "inventory_query", description: "查询指定商品在各门店的库存数量",
        inputSchema: { type: "object", properties: { product_name: { type: "string", description: "商品名称" } }, required: ["product_name"] },
        handler: h('const inv = INVENTORY[args.product_name]; if (!inv) return { content: [{ type: "text", text: "\u672a\u627e\u5230: " + args.product_name }] }; const r = Object.entries(inv).map(function(e) { var k = e[0], v = e[1]; var s = STORES.find(function(x) { return x.id === k; }); return (s ? s.name : k) + "\uff1a" + (v > 0 ? v + (v > 10 ? " \u2705\u5145\u8db3" : " \u26a0\ufe0f\u5c11\u91cf") : "\u274c\u552e\u7f44"); }); return { content: [{ type: "text", text: r.join("\\n") }] };')
      },
      { name: "inventory_alert", description: "查询库存不足的商品列表（库存<10）",
        inputSchema: { type: "object", properties: {} },
        handler: h('var alerts = []; for (var name in INVENTORY) { var inv = INVENTORY[name]; for (var store in inv) { var qty = inv[store]; if (qty > 0 && qty < 10) { var s = STORES.find(function(x) { return x.id === store; }); alerts.push(name + " - " + (s ? s.name : store) + "\uff1a\u4ec5\u5269" + qty); } } } return { content: [{ type: "text", text: alerts.length ? alerts.join("\\n") : "\u6682\u65e0\u5e93\u5b58\u9884\u8b66" }] };')
      },
    ])
  },
  member: {
    name: "会员模板",
    generateTools: (storeName) => ([
      { name: "member_info", description: "查询会员信息",
        inputSchema: { type: "object", properties: { member_id: { type: "string", description: "会员ID" } } },
        handler: h('var m = { name: "\u5fae\u4fe1\u7528\u6237", level: "\u9ec4\u91d1\u4f1a\u5458", points: 2350 }; return { content: [{ type: "text", text: "\u59d3\u540d\uff1a" + m.name + "\\n\u7b49\u7ea7\uff1a" + m.level + "\\n\u79ef\u5206\uff1a" + m.points + " \u5206" }] };')
      },
      { name: "member_points", description: "查询会员积分及可兑换优惠券",
        inputSchema: { type: "object", properties: { member_id: { type: "string", description: "会员ID" } } },
        handler: h('return { content: [{ type: "text", text: "\u5f53\u524d\u79ef\u5206\uff1a2,350 \u5206\\n\\n\u53ef\u5151\u6362\uff1a\\n10\u5143\u65e0\u95e8\u69db\u5238 \u2014 500\u5206\\n\u9c9c\u725b\u5976\u7bb1\u5151\u6362\u5238 \u2014 800\u5206\\n\u73b0\u91d1\u62b5\u6263\u00a523.50 \u2014 2,350\u5206" }] };')
      },
      { name: "coupon_query", description: "查询会员可用优惠券",
        inputSchema: { type: "object", properties: { member_id: { type: "string", description: "会员ID" } } },
        handler: h('return { content: [{ type: "text", text: "\ud83c\udfab 10\u5143\u65e0\u95e8\u69db\u5238\uff08\u9700500\u5206\uff09\\n\ud83c\udfab \u9c9c\u725b\u5976\u7bb1\u5151\u6362\u5238\uff08\u9700800\u5206\uff09\\n\ud83c\udfab \u73b0\u91d1\u62b5\u6263\u00a523.50\uff08\u97002,350\u5206\uff09" }] };')
      },
      { name: "member_expiring_benefits", description: "Query member points, expiring points and expiring coupons",
        inputSchema: { type: "object", properties: { member_id: { type: "string", description: "member id" } } },
        handler: h('var memberId = args.member_id || "M10001"; var payload = { member_id: memberId, points: 2350, expiring_points: 320, expiring_points_date: "2026-07-31", expiring_coupons: [{ name: "10 yuan coupon", expire_at: "2026-07-15" }, { name: "milk exchange coupon", expire_at: "2026-07-20" }] }; return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };')
      },
    ])
  },
  store: {
    name: "门店模板",
    generateTools: (storeName) => ([
      { name: "store_list", description: "查询附近门店列表及营业状态",
        inputSchema: { type: "object", properties: { location: { type: "string", description: "位置" } } },
        handler: h('return { content: [{ type: "text", text: STORES.map(function(s) { return s.name + " \u2014 " + s.address + " " + (s.online ? "\u25cf\u8425\u4e1a\u4e2d" : "\u25cf\u5df2\u6253\u70ca") + "\uff08" + s.open + "-" + s.close + "\uff09"; }).join("\\n") }] };')
      },
      { name: "store_status", description: "查询指定门店的营业状态",
        inputSchema: { type: "object", properties: { store_name: { type: "string", description: "门店名称" } }, required: ["store_name"] },
        handler: h('var s = STORES.find(function(x) { return x.name.indexOf(args.store_name) !== -1; }); if (!s) return { content: [{ type: "text", text: "\u672a\u627e\u5230\u95e8\u5e97: " + args.store_name }] }; return { content: [{ type: "text", text: s.name + "\\n\u5730\u5740\uff1a" + s.address + "\\n\u8425\u4e1a\u65f6\u95f4\uff1a" + s.open + "-" + s.close + "\\n\u72b6\u6001\uff1a" + (s.online ? "\u25cf\u8425\u4e1a\u4e2d" : "\u25cf\u5df2\u6253\u70ca") }] };')
      },
    ])
  },
  order: {
    name: "订单模板",
    generateTools: (storeName) => ([
      { name: "create_order", description: "创建新订单，自动应用会员优惠",
        inputSchema: { type: "object", properties: { product_name: { type: "string", description: "商品名称" }, quantity: { type: "number", description: "数量" }, store_id: { type: "string", description: "门店ID" } }, required: ["product_name", "quantity", "store_id"] },
        handler: h('var p = PRODUCTS.find(function(x) { return x.name === args.product_name; }); if (!p) return { content: [{ type: "text", text: "\u5546\u54c1\u4e0d\u5b58\u5728" }] }; var s = STORES.find(function(x) { return x.id === args.store_id; }); if (!s) return { content: [{ type: "text", text: "\u95e8\u5e97\u4e0d\u5b58\u5728" }] }; var subtotal = p.price * args.quantity; var discount = subtotal >= 100 ? subtotal * 0.1 : 0; var total = subtotal - discount; var pickup = String(1000 + Math.floor(Math.random() * 9000)); return { content: [{ type: "text", text: JSON.stringify({ order_id: "ORD" + Date.now(), store: s.name, product: p.name + "x" + args.quantity, subtotal: "\u00a5" + subtotal.toFixed(2), discount: discount > 0 ? "-\u00a5" + discount.toFixed(2) : "\u65e0", total: "\u00a5" + total.toFixed(2), pickup_code: pickup, status: "\u5f85\u53d6\u8d27" }, null, 2) }] };')
      },
      { name: "order_status", description: "查询订单状态",
        inputSchema: { type: "object", properties: { order_id: { type: "string", description: "订单号" } }, required: ["order_id"] },
        handler: h('return { content: [{ type: "text", text: "\u8ba2\u5355 " + args.order_id + "\\n\u72b6\u6001\uff1a\u5f85\u53d6\u8d27\\n\u53d6\u8d27\u7801\uff1a6688\\n\u95e8\u5e97\uff1a' + storeName + '" }] };')
      },
    ])
  },
};

// 生成 MCP Server 完整代码
export function generateServerCode(selectedTemplates, options = {}) {
  const storeName = options.storeName || "默认门店";
  const port = options.port || 3456;
  const serverName = options.serverName || "mcp-forge-generated";

  const tools = [];
  for (const tid of selectedTemplates) {
    const gen = TEMPLATE_TOOLS[tid];
    if (gen) {
      const generated = gen.generateTools(storeName);
      tools.push(...generated);
    }
  }

  const hasProduct = selectedTemplates.includes('product');
  const hasInventory = selectedTemplates.includes('inventory');
  const hasStore = selectedTemplates.includes('store');
  const mockData = generateMockData(hasProduct, hasInventory, hasStore, storeName);
  const toolList = tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));

  const serverCode = `/**
 * MCP Server - 由 MCP Forge 自动生成
 * 门店：${storeName}
 * 生成时间：${new Date().toLocaleString('zh-CN')}
 * 模板：${selectedTemplates.map(t => TEMPLATE_TOOLS[t]?.name).filter(Boolean).join('、')}
 */

${mockData}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";

const server = new Server({ name: "${serverName}", version: "1.0.0" }, { capabilities: { tools: {} } });

const TOOLS = ${JSON.stringify(toolList, null, 2)};

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments || {};

${tools.map(t => '  if (toolName === "' + t.name + '") { ' + t.handler + ' }').join('\n\n')}

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
  res.json({ status: "ok", tools: ${tools.length}, name: "${serverName}" });
});

const PORT = process.env.PORT || ${port};
app.listen(PORT, () => {
  console.log("[MCP Server] " + ${tools.length} + " tools, SSE: http://localhost:" + PORT + "/sse");
});
`;

  return {
    code: serverCode,
    tools,
    toolCount: tools.length,
    packageJson: JSON.stringify({
      name: serverName, version: "1.0.0",
      type: "module",
      description: "MCP Forge \u81ea\u52a8\u751f\u6210\u7684\u96f6\u552e\u95e8\u5e97 AI \u52a9\u624b",
      main: "server.js", scripts: { start: "node server.js" },
      dependencies: { "@modelcontextprotocol/sdk": "^1.6.0", "express": "^4.21.0" }
    }, null, 2),
    readme: "# " + serverName + "\n\n> MCP Forge \u81ea\u52a8\u751f\u6210 \u00b7 \u95e8\u5e97\uff1a" + storeName + "\n\n## \u542f\u52a8\u65b9\u5f0f\n\n\`\`\`bash\nnpm install\nnode server.js\n\`\`\`\n\n## \u8fde\u63a5\u4fe1\u606f\n\n- SSE \u7aef\u70b9\uff1ahttp://localhost:" + port + "/sse\n- \u5065\u5eb7\u68c0\u67e5\uff1ahttp://localhost:" + port + "/health\n\n## Tool \u5217\u8868\n\n" + tools.map(t => "- " + t.name + ": " + t.description).join("\n"),
  };
}

function generateMockData(hasProduct, hasInventory, hasStore, storeName) {
  let data = '';
  const sn = storeName || '\u9ed8\u8ba4\u95e8\u5e97';

  if (hasStore) {
    data += 'var STORES = [{ id: "store1", name: "' + sn + '", address: "\u5730\u5740", open: "07:00", close: "23:00", online: true }];\n\n';
  }

  if (hasProduct) {
    data += `var PRODUCTS = [
  { id: "p01", name: "\u5143\u6c14\u68ee\u6797\u6d77\u76d0\u83e0\u841d", price: 9.90, unit: "\u74f6", category: "\u996e\u54c1", promo: "\u4e702\u7bb1\u4eab9\u6298" },
  { id: "p02", name: "\u5143\u6c14\u68ee\u6797\u767d\u6843", price: 9.90, unit: "\u74f6", category: "\u996e\u54c1", promo: "\u4e702\u7bb1\u4eab9\u6298" },
  { id: "p03", name: "\u519c\u592b\u5c71\u6cc95L", price: 9.90, unit: "\u6876", category: "\u996e\u54c1", promo: "" },
  { id: "p04", name: "\u519c\u592b\u5c71\u6cc9550ml", price: 2.00, unit: "\u74f6", category: "\u996e\u54c1", promo: "\u6574\u7bb1\u8d2d\u4e708\u6298" },
  { id: "p05", name: "\u9c9c\u725b\u5976", price: 12.80, unit: "\u76d2", category: "\u4e73\u54c1", promo: "\u7b2c\u4e8c\u4ef6\u534a\u4ef7" },
  { id: "p06", name: "\u9762\u5305\u7ec4\u5408", price: 9.90, unit: "\u4efd", category: "\u98df\u54c1", promo: "\u7279\u4ef7\u00a59.9" },
  { id: "p07", name: "\u85af\u7247\u5927\u793c\u5305", price: 39.90, unit: "\u5305", category: "\u96f6\u98df", promo: "" },
  { id: "p08", name: "\u53ef\u4e50330ml", price: 3.50, unit: "\u7f50", category: "\u996e\u54c1", promo: "\u4e706\u90011" },
  { id: "p09", name: "\u96ea\u78a7330ml", price: 3.50, unit: "\u7f50", category: "\u996e\u54c1", promo: "\u4e706\u90011" },
  { id: "p10", name: "\u65b9\u4fbf\u9762", price: 4.90, unit: "\u6876", category: "\u98df\u54c1", promo: "\u4e705\u90011" },
];

var PROMOS = [
  { id: "pr01", title: "\u5143\u6c14\u68ee\u6797\u7cfb\u5217 \u4e702\u7bb19\u6298", desc: "\u5168\u573a\u5143\u6c14\u68ee\u6797\u6c14\u6ce1\u6c34\u4e702\u7bb1\u4eab9\u6298\u4f18\u60e0", valid: "\u672c\u6708" },
  { id: "pr02", title: "\u9c9c\u725b\u5976 \u7b2c\u4e8c\u4ef6\u534a\u4ef7", desc: "\u6307\u5b9a\u9c9c\u725b\u5976\u7b2c\u4e8c\u4ef6\u534a\u4ef7", valid: "\u672c\u6708" },
  { id: "pr03", title: "\u9762\u5305\u7ec4\u5408 \u00a59.9 \u7279\u60e0", desc: "\u7cbe\u9009\u9762\u5305\u7ec4\u5408\u9650\u65f6\u7279\u4ef7", valid: "\u672c\u5468" },
  { id: "pr04", title: "\u4f1a\u5458\u53cc\u500d\u79ef\u5206", desc: "\u5168\u573a\u8d2d\u7269\u4eab\u53cc\u500d\u4f1a\u5458\u79ef\u5206", valid: "\u672c\u6708" },
];\n\n`;
  }

  if (hasInventory) {
    data += `var INVENTORY = {
  "\u5143\u6c14\u68ee\u6797\u6d77\u76d0\u83e0\u841d": { store1: 32 },
  "\u5143\u6c14\u68ee\u6797\u767d\u6843": { store1: 18 },
  "\u519c\u592b\u5c71\u6cc95L": { store1: 24 },
  "\u519c\u592b\u5c71\u6cc9550ml": { store1: 48 },
  "\u9c9c\u725b\u5976": { store1: 15 },
  "\u9762\u5305\u7ec4\u5408": { store1: 12 },
  "\u85af\u7247\u5927\u793c\u5305": { store1: 9 },
  "\u53ef\u4e50330ml": { store1: 60 },
  "\u96ea\u78a7330ml": { store1: 55 },
  "\u65b9\u4fbf\u9762": { store1: 30 },
};\n\n`;
  }

  return data || '// \u6682\u65e0\u6570\u636e\n';
}

export function generateProjectFiles(selectedTemplates, options = {}) {
  const result = generateServerCode(selectedTemplates, options);
  return {
    "server.js": result.code,
    "package.json": result.packageJson,
    "README.md": result.readme,
  };
}