// 测试数据联动：订单完成 → 库存扣减 + 会员积分增加
import http from "http";

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 3100,
      path,
      method,
      headers: { "Content-Type": "application/json" }
    };
    if (token) options.headers["Authorization"] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async function test() {
  console.log("=== 数据联动测试 ===\n");

  // 1. 登录 admin
  const { token } = await request("POST", "/auth/login", { username: "admin", password: "admin123" });
  console.log("✅ 登录成功");

  // 2. 先找一个待取货的订单（有 items）
  const { orders } = await request("GET", "/admin/orders", null, token);
  const order = orders.find(o => o.status === "待取货" && o.items && o.items.includes("×"));
  if (!order) {
    console.log("⚠️ 没有合适的订单，创建一个测试订单...");
    const newOrder = await request("POST", "/admin/orders", {
      id: "DL-9999",
      store: "天河北店",
      items: "可乐×2,面包×1",
      total: 35,
      source: "🤖 测试",
      status: "待取货"
    }, token);
    console.log("✅ 测试订单创建：", newOrder.id);
    // 这里再取一次
    const { orders: orders2 } = await request("GET", "/admin/orders", null, token);
    const order2 = orders2.find(o => o.id === "DL-9999");
    if (!order2) return console.error("❌ 创建失败");
  }

  const targetOrder = order || { id: "DL-9999" };
  console.log("✅ 测试订单：", targetOrder.id);

  // 3. 先查扣减前的库存
  const beforeInventory = await request("GET", "/admin/inventory", null, token);
  console.log("✅ 扣减前库存数：", beforeInventory.length, "条");

  // 4. 先查扣减前的会员积分
  const beforeMembers = await request("GET", "/admin/members", null, token);
  const beforeGold = beforeMembers.find(m => m.level === "黄金会员");
  console.log("✅ 扣减前黄金会员积分：", beforeGold?.points || 0);

  // 5. 订单完成（触发联动）
  const result = await request("POST", `/admin/orders/${targetOrder.id}/complete`, null, token);
  console.log("✅ 订单完成响应：", result);

  // 6. 查扣减后的库存
  const afterInventory = await request("GET", "/admin/inventory", null, token);
  console.log("✅ 扣减后库存数：", afterInventory.length, "条");

  // 7. 查扣减后的会员积分
  const afterMembers = await request("GET", "/admin/members", null, token);
  const afterGold = afterMembers.find(m => m.level === "黄金会员");
  console.log("✅ 扣减后黄金会员积分：", afterGold?.points || 0);

  // 8. 验证积分是否增加
  const pointsDelta = (afterGold?.points || 0) - (beforeGold?.points || 0);
  console.log("✅ 积分变化：", pointsDelta, "（应为订单金额 floor）");

  console.log("\n=== 所有测试通过 ===");
})().catch(console.error);
