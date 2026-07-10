// 测试 MCP 支付流程 - 查看原始返回值
const https = require("https");
const BASE = "137e8705.r15.cpolar.top";

// 创建订单 → 支付
function run() {
  console.log("=== 步骤1: 连接 SSE 获取 sessionId ===\n");
  
  const start = Date.now();
  const sseReq = https.get(`https://${BASE}/sse`, { rejectUnauthorized: false }, (res) => {
    let buf = "", sessionId = null;
    
    res.on("data", (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/data: (\S+)/);
      if (m && !sessionId) {
        const endpoint = m[1];
        sessionId = new URLSearchParams(endpoint.split("?")[1]).get("sessionId");
        
        console.log(`SSE 连接耗时: ${Date.now() - start}ms`);
        console.log(`sessionId: ${sessionId}\n`);
        
        // 步骤2: 创建订单
        console.log("=== 步骤2: 调用 create_order ===\n");
        callTool(sessionId, "create_order", {
          product_name: "可口可乐",
          quantity: 2,
          store_id: "store1"
        }, () => {
          // 步骤3: 1.5秒后调用支付
          setTimeout(() => {
            console.log("\n=== 步骤3: 调用 process_payment ===\n");
            callTool(sessionId, "process_payment", {
              order_id: "ORD" + Date.now(), // will get real order id
              payment_method: "微信支付"
            });
          }, 1500);
        });
      }
    });
  });
  
  sseReq.on("error", (e) => console.error("SSE error:", e.message));
  setTimeout(() => { console.log("\n⏰ 超时退出"); process.exit(0); }, 15000);
}

// 发送工具调用请求 - 结果通过 SSE 返回
function callTool(sessionId, toolName, args, onDone) {
  const pid = Math.floor(Math.random() * 10000);
  const payload = {
    jsonrpc: "2.0",
    id: pid,
    method: "tools/call",
    params: { name: toolName, arguments: args }
  };
  
  const data = JSON.stringify(payload);
  const req = https.request({
    hostname: BASE,
    path: `/mcp?sessionId=${sessionId}`,
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data)
    },
    rejectUnauthorized: false
  }, (res) => {
    let body = "";
    res.on("data", d => body += d);
    res.on("end", () => {
      console.log(`POST ${toolName} → HTTP ${res.statusCode}: ${body.substring(0, 200)}`);
      if (onDone) setTimeout(onDone, 500);
    });
  });
  req.write(data);
  req.end();
}

run();
