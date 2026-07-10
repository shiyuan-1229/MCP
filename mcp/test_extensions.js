// 测试三个扩展功能：
// 1. 订单创建时预占库存
// 2. 会员等级自动升级
// 3. 库存预警
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
          resolve({ json, status: res.statusCode });
        } catch (e) {
          resolve({ text: data, status: res.statusCode });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async function test() {
  console.log("=== 三个扩展功能测试 ===\n");

  // 1. 登录 admin
  const { json: loginJson } = await request("POST", "/auth/login", { username: "admin", password: "admin123" });
  const token = loginJson.token;
  console.log("✅ 登录成功\n");

  // 2. 先获取初始会员状态
  const { json: membersJson } = await request("GET", "/admin/members", null, token);
  const initialMember = membersJson.find(m => m.level === "黄金会员" || m.level === "白银会员");
  console.log("📊 初始会员：", initialMember ? `${initialMember.id} (${initialMember.level}, ${initialMember.points} 分)` : "无会员");

  // 3. 创建订单测试（预占库存）
  console.log("\n--- 测试 1：订单创建预占库存 ---");
  const { json: createOrderJson, status: createOrderStatus } = await request("POST", "/admin/orders", {
    store: "天河北店",
    items: "可口可乐×2,全麦面包×1",
    total: 45,
    source: "测试脚本"
  }, token);

  if (createOrderStatus !== 200) {
    console.log("❌ 订单创建失败:", createOrderJson);
    return;
  }

  console.log("✅ 订单创建成功，ID:", createOrderJson.id);
  if (createOrderJson.alerts && createOrderJson.alerts.length > 0) {
    console.log("⚠️  库存预警:", createOrderJson.alerts.map(a => `${a.productName}(${a.storeName}) ${a.qty}件`));
  } else {
    console.log("✅ 暂无库存预警");
  }

  // 4. 完成订单测试（积分 + 等级升级）
  console.log("\n--- 测试 2：订单完成触发积分 + 等级升级 ---");
  const { json: completeOrderJson } = await request("POST", `/admin/orders/${createOrderJson.id}/complete`, null, token);

  if (completeOrderJson.upgrade) {
    const { oldLevel, newLevel, newPoints } = completeOrderJson.upgrade;
    console.log("✅ 积分增加:", newPoints - (initialMember?.points || 0));
    if (oldLevel !== newLevel) {
      console.log("🎉 会员升级:", oldLevel, "→", newLevel);
    } else {
      console.log("✅ 会员等级保持:", oldLevel, "当前积分:", newPoints);
    }
  } else {
    console.log("ℹ️  无会员数据可升级");
  }

  // 5. 再次检查库存预警
  console.log("\n--- 测试 3：库存预警检查 ---");
  const { json: invJson } = await request("GET", "/admin/inventory", null, token);
  const lowStock = invJson.filter(i => i.qty <= 5);
  if (lowStock.length > 0) {
    console.log("⚠️  低库存商品:", lowStock.map(i => `${i.product_name}(${i.store_name}) ${i.qty}件`));
  } else {
    console.log("✅ 库存状态良好");
  }

  console.log("\n=== 所有测试通过 ===");
})().catch(console.error);
