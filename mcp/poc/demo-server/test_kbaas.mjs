/**
 * KBaaS 单元测试 — 不依赖 better-sqlite3
 * 直接 import KBAAS 实现不现实（KBAAS 内部用 db.prepare），
 * 所以从 server.js 抠出 tokenize / chunkText / computeTF / cosineScore 复制到本文件自检
 * 仅用于算法正确性验证
 */

// ═══ 复制自 server.js（保证和实际代码一致） ═══
function tokenize(text) {
  if (!text) return [];
  const norm = String(text).toLowerCase().replace(/[\r\n\t]+/g, " ");
  const tokens = [];
  let cjkBuf = "";
  let latinBuf = "";
  const flushCjk = () => {
    if (!cjkBuf) return;
    if (cjkBuf.length === 1) { tokens.push(cjkBuf); }
    else {
      for (let j = 0; j < cjkBuf.length - 1; j++) tokens.push(cjkBuf.slice(j, j + 2));
      tokens.push(cjkBuf);
    }
    cjkBuf = "";
  };
  const flushLatin = () => { if (latinBuf) { tokens.push(latinBuf); latinBuf = ""; } };
  for (const ch of norm) {
    if (/[\u4e00-\u9fa5]/.test(ch)) { flushLatin(); cjkBuf += ch; }
    else if (/[a-z0-9]/.test(ch)) { flushCjk(); latinBuf += ch; }
    else { flushLatin(); flushCjk(); }
  }
  flushLatin();
  flushCjk();
  return tokens.filter(t => t.length >= 1);
}

function chunkText(text, maxLen = 200) {
  if (!text) return [];
  const paragraphs = text.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  for (const para of paragraphs) {
    if (para.length <= maxLen) { chunks.push(para); continue; }
    const sentences = para.split(/(?<=[。！？!?])\s*/).filter(s => s.trim().length > 0);
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > maxLen && buf) { chunks.push(buf.trim()); buf = s; }
      else buf += s;
    }
    if (buf.trim()) chunks.push(buf.trim());
  }
  return chunks.length ? chunks : [String(text)];
}

function computeTF(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const total = tokens.length || 1;
  for (const k in tf) tf[k] = tf[k] / total;
  return tf;
}

// 简化的 cosine（自包含，不需要 IDF 因为自检用统一词表）
function cosineScore(a, b) {
  let dot = 0, aN = 0, bN = 0;
  const all = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of all) {
    const av = a[k] || 0, bv = b[k] || 0;
    dot += av * bv; aN += av * av; bN += bv * bv;
  }
  return (aN && bN) ? dot / (Math.sqrt(aN) * Math.sqrt(bN)) : 0;
}

// ═══ 测试套件 ═══
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); fail++; }
};
const eq = (a, b, msg = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\n     got:      ${JSON.stringify(a)}\n     expected: ${JSON.stringify(b)}`); };
const gt = (a, b) => { if (!(a > b)) throw new Error(`expected ${a} > ${b}`); };

console.log("\n━━━ KBaaS 单元测试 ━━━\n");

t("1. tokenize: 中文 bigram", () => {
  const r = tokenize("退换货政策");
  // 期望: ["退换","换货","退货","政策"]（4 个 bigram，无单独字）
  if (r.length < 3) throw new Error("bigram 切分不够细: " + JSON.stringify(r));
  if (!r.includes("退换")) throw new Error("缺少 '退换' bigram");
  if (!r.includes("政策")) throw new Error("缺少 '政策'");
});

t("2. tokenize: 混合中英文", () => {
  const r = tokenize("美佳便利店 M10001 会员");
  if (!r.some(x => x === "m10001")) throw new Error("英文数字应保留: " + JSON.stringify(r));
  if (!r.includes("美佳")) throw new Error("中文应保留: " + JSON.stringify(r));
});

t("3. tokenize: 标点切分", () => {
  const r = tokenize("你好，世界！");
  if (r.some(x => /[!！,，.]/.test(x))) throw new Error("标点不该进 token: " + JSON.stringify(r));
});

t("4. chunkText: 单段", () => {
  const r = chunkText("营业时间 07:00-23:00");
  eq(r.length, 1);
  eq(r[0], "营业时间 07:00-23:00");
});

t("5. chunkText: 多段", () => {
  const r = chunkText("第一段内容。\n\n第二段内容。");
  eq(r.length, 2);
  eq(r[0], "第一段内容。");
  eq(r[1], "第二段内容。");
});

t("6. chunkText: 长段落切句", () => {
  const long = "食品类商品（非质量原因）不退不换。如出现质量问题（过期、变质、漏气），请保留小票，门店无条件退换。非食品类商品 7 天内可凭小票退换，需保持原包装完整。会员卡积分购买的部分按原积分退回。";
  const r = chunkText(long, 50);
  if (r.length < 2) throw new Error("长段落应被切分: " + JSON.stringify(r));
  r.forEach(c => { if (c.length > 80) throw new Error("切分后段落仍过长: " + c); });
});

t("7. computeTF: 归一化", () => {
  const tf = computeTF(["a", "b", "a", "c", "a"]);
  eq(tf.a, 0.6);
  eq(tf.b, 0.2);
  eq(tf.c, 0.2);
});

t("8. cosineScore: 相同向量 = 1", () => {
  const tf = { "退换": 0.5, "货": 0.5 };
  const s = cosineScore(tf, tf);
  if (Math.abs(s - 1) > 0.001) throw new Error("相同向量应=1，实际=" + s);
});

t("9. cosineScore: 完全无关 = 0", () => {
  const s = cosineScore({ "a": 1 }, { "b": 1 });
  eq(s, 0);
});

t("10. 端到端：退换货问题", () => {
  const docs = {
    "退换货政策": "食品类商品（非质量原因）不退不换。如出现质量问题（过期、变质、漏气），请保留小票，门店无条件退换。非食品类商品 7 天内可凭小票退换。",
    "营业时间": "门店营业时间为 07:00-23:00。顾客到店自提时凭取货码取货，取货码 24 小时内有效。"
  };
  const question = "食品类能不能退换";
  const qTF = computeTF(tokenize(question));
  const scores = Object.entries(docs).map(([title, content]) => {
    const dTF = computeTF(tokenize(content));
    return { title, score: cosineScore(qTF, dTF) };
  });
  scores.sort((a, b) => b.score - a.score);
  if (scores[0].title !== "退换货政策") throw new Error("期望 '退换货政策' 排第一，实际: " + scores[0].title);
  gt(scores[0].score, scores[1].score);
});

t("11. 端到端：营业时间问题", () => {
  const docs = {
    "退换货政策": "食品类商品（非质量原因）不退不换。如出现质量问题请保留小票，门店无条件退换。",
    "营业时间": "门店营业时间为 07:00-23:00，顾客到店自提时凭取货码取货，取货码 24 小时内有效。",
    "会员服务": "会员分为普通、白银、黄金三个等级。"
  };
  const question = "门店营业时间是几点";
  const qTF = computeTF(tokenize(question));
  const scores = Object.entries(docs).map(([title, content]) => ({
    title,
    score: cosineScore(qTF, computeTF(tokenize(content)))
  })).sort((a, b) => b.score - a.score);
  if (scores[0].title !== "营业时间") throw new Error("期望 '营业时间' 排第一，实际: " + scores[0].title);
});

t("12. 端到端：会员升级问题", () => {
  const docs = {
    "营业时间": "门店营业时间为 07:00-23:00。",
    "会员服务": "普通会员满 1000 分升级白银，白银满 5000 分升级黄金。",
    "退换货": "非食品 7 天可退。"
  };
  const question = "黄金会员怎么升级";
  const qTF = computeTF(tokenize(question));
  const scores = Object.entries(docs).map(([title, content]) => ({
    title,
    score: cosineScore(qTF, computeTF(tokenize(content)))
  })).sort((a, b) => b.score - a.score);
  if (scores[0].title !== "会员服务") throw new Error("期望 '会员服务' 排第一，实际: " + scores[0].title);
});

console.log(`\n━━━ 结果: ${pass} 通过 / ${fail} 失败 ━━━\n`);
process.exit(fail > 0 ? 1 : 0);
