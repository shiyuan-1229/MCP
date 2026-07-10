/**
 * 完整 MCP 协议测试 - SSE + JSON-RPC
 * 模拟 Tencent Yuanqi 的智能体行为
 */
const http = require("http");
const https = require("https");

const HOST = "137e8705.r15.cpolar.top";

// 保持 SSE 连接并监听事件
function testMcpFlow() {
  console.log("🟢 [1/4] 连接 SSE 端点...\n");
  
  const sseReq = https.get(`https://${HOST}/sse`, { rejectUnauthorized: false }, (res) => {
    console.log(`  SSE 状态码: ${res.statusCode}`);
    console.log(`  Content-Type: ${res.headers["content-type"]}\n`);
    
    let buffer = "";
    let endpoint = null;
    
    res.on("data", (chunk) => {
      buffer += chunk.toString();
      
      // 解析 SSE 事件
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep incomplete line
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          console.log(`  📡 SSE 收到: ${data}`);
          
          if (data.startsWith("/mcp?")) {
            endpoint = data;
          }
        }
      }
      
      if (endpoint) {
        const sessionId = new URLSearchParams(endpoint.split("?")[1]).get("sessionId");
        console.log(`\n🟢 [2/4] 获得 sessionId: ${sessionId}`);
        
        // 调用 tools/list
        console.log(`\n🟢 [3/4] 调用 tools/list...`);
        callMcp(sessionId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {}
        });
        
        // 稍后调用 create_order
        setTimeout(() => {
          console.log(`\n🟢 [4/4] 测试: 创建订单 + 支付...`);
          callMcp(sessionId, {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "create_order",
              arguments: {
                product_name: "可口可乐",
                quantity: 2,
                store_id: "store1"
              }
            }
          });
        }, 2000);
        
        // 再等一会测试支付
        setTimeout(() => {
          console.log(`\n🔴 现在请查看 SSE 输出中的工具调用结果...`);
        }, 5000);
      }
    });
    
    res.on("close", () => {
      console.log("\n⚠️ SSE 连接已关闭");
    });
    
    res.on("error", (err) => {
      console.error("❌ SSE 错误:", err.message);
    });
  });
  
  sseReq.on("error", (err) => {
    console.error("❌ 连接失败:", err.message);
  });
  
  // 30秒后超时退出
  setTimeout(() => {
    console.log("\n⏰ 测试超时，退出");
    process.exit(0);
  }, 30000);
}

function callMcp(sessionId, payload) {
  const data = JSON.stringify(payload);
  const req = https.request({
    hostname: HOST,
    path: `/mcp?sessionId=${sessionId}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data)
    },
    rejectUnauthorized: false
  }, (res) => {
    let body = "";
    res.on("data", (d) => body += d);
    res.on("end", () => {
      // For MCP SSE, response comes back via SSE, not HTTP response
      console.log(`  POST /mcp → ${res.statusCode}: ${body}`);
    });
  });
  
  req.write(data);
  req.end();
}

// 启动测试
console.log("╔══════════════════════════════════════╗");
console.log("║  MCP Forge · 完整协议测试             ║");
console.log("╚══════════════════════════════════════╝\n");
console.log(`  公网地址: https://${HOST}\n`);

testMcpFlow();
