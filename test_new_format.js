// 测试新格式输出 - 验证服务器返回内容
const https = require("https");
const BASE = "137e8705.r15.cpolar.top";

const sse = https.get(`https://${BASE}/sse`, { rejectUnauthorized: false }, (res) => {
  let buf = "";
  res.on("data", chunk => {
    buf += chunk.toString();
    if (!global.sessionId) {
      const m = buf.match(/data: (\S+)/);
      if (m) {
        global.sessionId = new URLSearchParams(m[1].split("?")[1]).get("sessionId");
        
        // 测试 create_order
        const postData = JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: "create_order", arguments: {
            product_name: "可乐330ml", quantity: 2, store_id: "store1"
          }}
        });
        
        const post = https.request({
          hostname: BASE, path: `/mcp?sessionId=${global.sessionId}`, method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData) },
          rejectUnauthorized: false
        });
        post.write(postData);
        post.end();
      }
    }
    
    // 捕获 SSE 中的响应
    const lines = buf.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(5));
          if (parsed.result) {
            const text = parsed.result.content?.[0]?.text || "";
            console.log("=== MCP 工具原始返回 ===\n");
            console.log(text);
            console.log("\n=== 结束 ===\n");
            
            // 检查是否包含支付链接
            if (text.includes("pay.weixin.qq.com")) {
              console.log("✅ 支付链接已包含在响应中!");
            }
            if (text.includes("pay.weixin.qq.com")) {
              console.log("✅ URL 是真实的微信支付链接格式");
            }
            
            setTimeout(() => process.exit(0), 1000);
          }
        } catch(e) {}
      }
    }
  });
});

setTimeout(() => process.exit(0), 15000);
