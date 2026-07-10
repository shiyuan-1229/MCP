// 测试 process_payment 返回值 - SSE 监听
const https = require("https");
const http = require("http");
const BASE = "137e8705.r15.cpolar.top";

// 第一步：创建订单
function createOrder(callback) {
  console.log("=== 步骤1: 创建订单 ===");
  const payload = {
    method: "tools/call",
    params: { name: "create_order", arguments: {
      product_name: "农夫山泉", quantity: 1, store_id: "store1"
    }}
  };
  
  const sse = https.get(`https://${BASE}/sse`, { rejectUnauthorized: false }, (res) => {
    let buf = "", sessionId = null, orderId = null;
    
    res.on("data", (chunk) => {
      buf += chunk.toString();
      // 获取 sessionId
      if (!sessionId) {
        const m = buf.match(/data: (\S+)/);
        if (m) {
          sessionId = new URLSearchParams(m[1].split("?")[1]).get("sessionId");
          console.log(`sessionId: ${sessionId}`);
          
          // 发创建订单请求
          postTool(sessionId, "create_order", {
            product_name: "农夫山泉", quantity: 1, store_id: "store1"
          });
        }
      }
      
      // 检查 SSE 中的响应
      if (buf.includes("ORD") && buf.includes("订单")) {
        // 提取 orderId
        const om = buf.match(/ORD\d+/);
        if (om && !orderId) {
          orderId = om[0];
          console.log(`\n订单已创建: ${orderId}`);
          console.log(`原始 SSE 响应: ${buf.substring(buf.lastIndexOf("data:"), buf.length).substring(0, 300)}`);
          
          // 3. 创建成功后调用支付
          setTimeout(() => {
            console.log(`\n=== 步骤2: 调用 process_payment(order_id=${orderId}) ===`);
            postTool(sessionId, "process_payment", { order_id: orderId });
          }, 500);
        }
      }
      
      // 检查支付响应
      if (buf.includes("PAY")) {
        console.log(`\n=== 步骤3: 支付原始 SSE 响应 ===`);
        const lines = buf.split("\n");
        lines.forEach(l => {
          if (l.startsWith("data:")) {
            try {
              const parsed = JSON.parse(l.slice(5));
              console.log("\n📦 MCP 工具原始返回:");
              console.log(JSON.stringify(parsed, null, 2));
            } catch(e) {
              console.log(`📡 SSE event: ${l}`);
            }
          }
        });
        console.log("\n✅ 测试完成");
        setTimeout(() => process.exit(0), 1000);
      }
    });
  });
  
  setTimeout(() => process.exit(0), 15000);
}

function postTool(sessionId, name, args) {
  const payload = { jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args }};
  const data = JSON.stringify(payload);
  const req = https.request({
    hostname: BASE, path: `/mcp?sessionId=${sessionId}`, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    rejectUnauthorized: false
  });
  req.write(data);
  req.end();
}

createOrder();
