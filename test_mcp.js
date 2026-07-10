const http = require("http");
const https = require("https");

const BASE = "137e8705.r15.cpolar.top";

// Step 1: Connect to SSE and capture sessionId
console.log("=== 步骤 1: 连接 SSE ===");
const req = https.get(`https://${BASE}/sse`, { rejectUnauthorized: false }, (res) => {
  let data = "";
  res.on("data", (chunk) => {
    data += chunk.toString();
    // Parse the endpoint event
    const match = data.match(/data: (\/mcp\?sessionId=[^\s]+)/);
    if (match) {
      const endpoint = match[1];
      console.log("✅ 获得 endpoint:", endpoint);
      
      const sessionId = new URLSearchParams(endpoint.split("?")[1]).get("sessionId");
      console.log("✅ 获得 sessionId:", sessionId);

      // Step 2: Call tools/list
      console.log("\n=== 步骤 2: 调用 tools/list ===");
      const postData = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      });
      
      const postReq = https.request({
        hostname: BASE,
        path: `/mcp?sessionId=${sessionId}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData)
        },
        rejectUnauthorized: false
      }, (postRes) => {
        let body = "";
        postRes.on("data", (d) => body += d);
        postRes.on("end", () => {
          try {
            const tools = JSON.parse(body);
            console.log(`✅ 已加载 ${tools.result?.tools?.length || 0} 个工具`);
            tools.result?.tools?.forEach(t => console.log(`  - ${t.name}: ${t.description}`));
          } catch(e) {
            console.log("❌ 解析失败:", body);
          }
          process.exit(0);
        });
      });
      postReq.write(postData);
      postReq.end();
    }
  });
});

req.on("error", (e) => {
  console.error("❌ SSE 连接失败:", e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error("❌ 超时: 未收到 endpoint 事件");
  process.exit(1);
}, 10000);
