/**
 * MCP Forge - 零售门店 AI 助手 Demo MCP Server
 * v2.2 — 库存/会员数据全部接入共享 SQLite + KBaaS 知识库（TF-IDF）
 * 
 * 门店：美佳便利店 / 鲜多多 / 鲜多生鲜
 * 启动：node server.js
 * SSE 端点：http://localhost:3458/sse
 * 健康检查：http://localhost:3458/health
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════
// 配置
// ═══════════════════════════════════════
const PORT = process.env.PORT || 3458;
const API_KEY = process.env.API_KEY || "disabled";

// ═══════════════════════════════════════
// DATABASE — 与管理后台共享 mcp_forge.db
// ═══════════════════════════════════════
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "mcp_forge.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// 补充 payments / inventory / members 表（管理后台 DB 里没有）
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    amount REAL DEFAULT 0,
    method TEXT DEFAULT '微信支付',
    status TEXT DEFAULT 'pending',
    payment_url TEXT,
    transaction_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory (
    product_id TEXT NOT NULL,
    store_id   TEXT NOT NULL,
    qty        INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, store_id)
  );

  CREATE TABLE IF NOT EXISTS members (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    level     TEXT DEFAULT '普通会员',
    points    INTEGER DEFAULT 0,
    phone     TEXT,
    email     TEXT,
    joined    TEXT
  );

  CREATE TABLE IF NOT EXISTS kb_collections (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kb_documents (
    id            TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    title         TEXT NOT NULL,
    source        TEXT,
    content       TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kb_chunks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id      TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text        TEXT NOT NULL,
    tf          TEXT NOT NULL,
    norm        REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(doc_id);
  CREATE INDEX IF NOT EXISTS idx_kb_chunks_coll ON kb_chunks(collection_id);
`);

// ── 库存种子数据 (product_id, store_id, qty) ──
const INVENTORY_SEED = [
  // 元气森林海盐菠萝 (p01)
  ['p01','thb',32],['p01','kyl',18],['p01','lkd',24],['p01','xyd',16],
  // 元气森林白桃 (p02)
  ['p02','thb',18],['p02','kyl',15],['p02','lkd',20],['p02','xyd',14],
  // 农夫山泉5L (p03)
  ['p03','thb',24],['p03','kyl',30],['p03','lkd',16],
  // 农夫山泉550ml (p04)
  ['p04','thb',48],['p04','kyl',60],['p04','lkd',42],
  // 鲜牛奶 (p05)
  ['p05','thb',15],['p05','kyl',12],['p05','lkd',9],
  // 面包组合 (p06)
  ['p06','thb',12],['p06','kyl',8],['p06','lkd',14],
  // 薯片大礼包 (p07)
  ['p07','thb',9],['p07','kyl',6],['p07','lkd',11],
  // 可乐330ml (p08)
  ['p08','thb',60],['p08','kyl',55],['p08','lkd',48],
  // 雪碧330ml (p09)
  ['p09','thb',55],['p09','kyl',50],['p09','lkd',42],
  // 方便面 (p10)
  ['p10','thb',30],['p10','kyl',35],['p10','lkd',28],
];

const upsertInventory = db.prepare(`
  INSERT INTO inventory (product_id, store_id, qty, updated_at)
  VALUES (?, ?, ?, datetime('now','localtime'))
  ON CONFLICT(product_id, store_id) DO UPDATE SET
    qty = excluded.qty,
    updated_at = datetime('now','localtime')
`);

const inventoryCount = db.prepare("SELECT COUNT(*) as c FROM inventory").get().c;
if (inventoryCount === 0) {
  const tx = db.transaction(() => {
    for (const [pid, sid, qty] of INVENTORY_SEED) upsertInventory.run(pid, sid, qty);
  });
  tx();
  console.log(`[INIT] inventory 表初始化完成：${INVENTORY_SEED.length} 条记录`);
}

// ── 会员种子数据 ──
const MEMBER_SEED = [
  { id: 'M10001', name: '小红', level: '黄金会员', points: 2350, phone: '138****5678', email: 'djiahao@example.com', joined: '2025-09-15' },
  { id: 'M10002', name: '张三',   level: '普通会员', points: 320,  phone: '139****1234', email: 'zhangsan@example.com', joined: '2026-01-08' },
  { id: 'M10003', name: '李四',   level: '白银会员', points: 1180, phone: '137****8765', email: 'lisi@example.com',     joined: '2025-11-20' },
];

const upsertMember = db.prepare(`
  INSERT INTO members (id, name, level, points, phone, email, joined)
  VALUES (@id, @name, @level, @points, @phone, @email, @joined)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, level=excluded.level, points=excluded.points,
    phone=excluded.phone, email=excluded.email, joined=excluded.joined
`);

const memberCount = db.prepare("SELECT COUNT(*) as c FROM members").get().c;
if (memberCount === 0) {
  const tx = db.transaction(() => {
    for (const m of MEMBER_SEED) upsertMember.run(m);
  });
  tx();
  console.log(`[INIT] members 表初始化完成：${MEMBER_SEED.length} 条记录`);
}

// ═══════════════════════════════════════
// KBAAS 知识库引擎 — TF-IDF + 倒排索引 + Extractive QA
// ═══════════════════════════════════════

const KBAAS = {
  // ── 1. 中文分词（字符 bigram + 标点切分，零依赖） ──
  tokenize(text) {
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
  },

  // ── 2. 段落切分（按空行/换行/句末标点） ──
  chunkText(text, maxLen = 200) {
    if (!text) return [];
    // 先按空行分段
    const paragraphs = text.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    const chunks = [];
    for (const para of paragraphs) {
      if (para.length <= maxLen) { chunks.push(para); continue; }
      // 长段落按句末标点切
      const sentences = para.split(/(?<=[。！？!?])\s*/).filter(s => s.trim().length > 0);
      let buf = "";
      for (const s of sentences) {
        if ((buf + s).length > maxLen && buf) {
          chunks.push(buf.trim());
          buf = s;
        } else {
          buf += (buf ? "" : "") + s;
        }
      }
      if (buf.trim()) chunks.push(buf.trim());
    }
    return chunks.length ? chunks : [String(text)];
  },

  // ── 3. 计算 TF 字典 ──
  computeTF(tokens) {
    const tf = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    const total = tokens.length || 1;
    for (const k in tf) tf[k] = tf[k] / total;
    return tf;
  },

  // ── 4. 计算 IDF（来自 chunks 表） ──
  computeIDF() {
    const allRows = db.prepare("SELECT tf FROM kb_chunks").all();
    const N = allRows.length || 1;
    const df = {};
    for (const row of allRows) {
      const tf = JSON.parse(row.tf);
      for (const term in tf) {
        df[term] = (df[term] || 0) + 1;
      }
    }
    const idf = {};
    for (const term in df) {
      idf[term] = Math.log(1 + N / df[term]);
    }
    return idf;
  },

  // ── 5. 向量范数 ──
  vectorNorm(tf, idf) {
    let s = 0;
    for (const term in tf) {
      const w = (tf[term] || 0) * (idf[term] || 0);
      s += w * w;
    }
    return Math.sqrt(s) || 1;
  },

  // ── 6. Cosine 相似度 ──
  cosineScore(queryTF, chunkTF, idf) {
    let dot = 0, qNorm = 0, cNorm = 0;
    for (const term in queryTF) {
      const w = queryTF[term] * (idf[term] || 0);
      qNorm += w * w;
      if (chunkTF[term]) dot += w * chunkTF[term] * (idf[term] || 0);
    }
    // 段落范数
    for (const term in chunkTF) {
      const w = chunkTF[term] * (idf[term] || 0);
      cNorm += w * w;
    }
    const denom = Math.sqrt(qNorm) * Math.sqrt(cNorm);
    return denom > 0 ? dot / denom : 0;
  },

  // ── 7. 知识库初始化（种子数据） ──
  seedIfEmpty() {
    const cnt = db.prepare("SELECT COUNT(*) as c FROM kb_collections").get().c;
    if (cnt > 0) return;
    const collections = [
      // 匹配当前管理后台分类：4 个基础集合
      {
        id: "store-hours",
        name: "门店营业",
        description: "营业时间、地址电话、门店分布",
        docs: [
          { title: "营业时间", source: "store/hours.md",
            content: "我们门店营业时间为 07:00-23:00（部分门店 24 小时）。天河北店是 24 小时营业，科韵路店 07:30-22:30，华景店 08:00-22:00，龙口西店 07:00-23:00，体育西店 06:30-23:30。节假日营业时间不变，不提前关门也不延后开门。" },
          { title: "门店地址与联系电话", source: "store/locations.md",
            content: "天河北店：广州市天河区天河北路 123 号，电话：020-12345678。科韵路店：广州市天河区科韵路 456 号，电话：020-87654321。华景店：广州市天河区华景新城华景路 789 号，电话：020-98765432。" },
          { title: "取货规则", source: "store/pickup.md",
            content: "顾客在线上下单后，凭取货码到店自提。取货码 24 小时内有效，超过 48 小时未取货，订单自动取消并退款。目前仅支持到店自提，第三方配送服务正在准备中，即将上线。" }
        ]
      },
      {
        id: "return-policy",
        name: "退货政策",
        description: "退换货规则、质量问题处理",
        docs: [
          { title: "食品退换货规则", source: "return/food.md",
            content: "食品类商品一经售出，非质量问题不退不换。因为食品属于生鲜快消，打开后无法二次销售。如果出现质量问题（过期、变质、包装漏气胀包），请保留购物小票和商品，门店无条件退换退款。" },
          { title: "非食品退换货规则", source: "return/nonfood.md",
            content: "非食品类商品 7 天内可退换，需要保持原包装完整、不影响二次销售，凭购物小票办理退换。会员卡积分抵扣的部分，退款时按原积分退回至会员账户。" },
          { title: "退款方式", source: "return/refund.md",
            content: "微信支付订单退款原路返回微信钱包，支付宝支付退回支付宝，现金退款退回现金。退款一般 1-3 个工作日到账，最长不超过 7 个自然日。" }
        ]
      },
      {
        id: "member-benefit",
        name: "会员权益",
        description: "会员等级、权益对比、积分规则",
        docs: [
          { title: "会员等级划分", source: "member/levels.md",
            content: "我们的会员分为三个等级：普通会员、白银会员、黄金会员。注册即送 100 积分成为普通会员。普通会员消费累计满 1000 积分自动升级白银会员，白银会员累计满 5000 积分自动升级黄金会员。等级越高，折扣越大，权益越多。" },
          { title: "各级会员权益对比", source: "member/benefits.md",
            content: "普通会员：消费 1 元积 1 分，生日积分 2 倍。白银会员：消费享 9.8 折，生日积分 2 倍，每月 1 张 5 元券。黄金会员：消费享 9.5 折，生日积分 2 倍，每月 1 张 10 元券，专属客服优先处理。" },
          { title: "积分有效期与获取", source: "member/points.md",
            content: "消费 1 元人民币积 1 分，会员双倍积分日（每月 1-7 日）积 2 分。会员积分有效期 2 年，从获得积分当日算起，过期未使用的积分会自动清零。积分可以兑换优惠券和商品，不能兑换现金。" },
          { title: "会员注册与实名认证", source: "member/register.md",
            content: "微信扫码关注公众号即可注册成为会员，手机号自动实名认证。一个手机号只能注册一个会员账户，不能转让会员资格。修改手机号请到门店柜台办理，需要原手机号验证码。" }
        ]
      },
      {
        id: "store-policy",
        name: "门店政策",
        description: "门店服务承诺与保障",
        docs: [
          { title: "服务承诺", source: "policy/commitment.md",
            content: "我们承诺：不卖过期商品，不售假货，所有商品明码标价。如果发现我们出售过期商品，你可以获得十倍赔偿。价格如有疑问，以门店标签标价为准，线上价格仅供参考。" },
          { title: "门店环境卫生", source: "policy/clean.md",
            content: "我们门店每日清洁消毒，货架和冷藏柜定期清理，过期商品及时下架。购物环境干净舒适，欢迎顾客监督提意见。如有卫生问题，请联系店长投诉。" }
        ]
      },
      // === 新增：三个高优先级扩展集合 ===
      {
        id: "promotion-rules",
        name: "促销活动规则",
        description: "折扣、买赠、优惠券、积分兑换",
        docs: [
          { title: "常规折扣与买赠规则", source: "promotion/discount.md",
            content: "元气森林系列买 2 箱享 9 折优惠，一箱为 12 瓶，仅限同款商品。农夫山泉 550ml 整箱 24 瓶购买享 8 折。鲜牛奶买第二件半价，需要购买同款 2 盒以上享受优惠。可乐雪碧买 6 送 1，需要同款整箱 24 罐。" },
          { title: "会员双倍积分日", source: "promotion/double-points.md",
            content: "每月 1 日至 7 日为会员双倍积分日，所有消费享受双倍积分。双倍积分日可以和其他促销活动叠加享受。活动日期如有调整，以门店公告为准。" },
          { title: "积分兑换规则", source: "promotion/redeem.md",
            content: "500 积分可以兑换 10 元无门槛优惠券。800 积分可以兑换鲜牛奶一箱兑换券。2350 积分可以兑换 23.5 元现金抵扣。所有兑换的优惠券有效期 30 天，过期自动作废不能延期。" },
          { title: "优惠券使用说明", source: "promotion/coupon.md",
            content: "优惠券不能兑换现金，只能抵扣货款，每张订单只能使用一张优惠券。满减优惠券需要满足最低消费金额才能使用，具体以优惠券说明为准。优惠券过期失效，不能补发，请及时使用。" }
        ]
      },
      {
        id: "product-faq",
        name: "商品常见问答",
        description: "成分、保质期、储存方法、购买限制",
        docs: [
          { title: "饮料类商品常见问题", source: "faq/beverage.md",
            content: "元气森林系列为 0 蔗糖气泡水，使用赤藓糖醇代糖，每瓶 480ml，保质期 12 个月，建议冷藏后饮用口感更好。农夫山泉 5L 桶装水保质期 24 个月，开封后建议 3 天内饮用完。可乐雪碧 330ml 罐装保质期 12 个月。" },
          { title: "乳制品与鲜食常见问题", source: "faq/dairy.md",
            content: "鲜牛奶为每日配送的巴氏杀菌奶，保质期 7 天，必须 0-4 摄氏度冷藏保存。如果发现胀包、异味、变色，请不要饮用，凭小票到门店办理退款。面包为当日烘焙，建议当天食用，存放超过 24 小时口感会下降。" },
          { title: "零食与方便食品", source: "faq/snacks.md",
            content: "薯片大礼包含 6 种口味，都是独立小包装，保质期 9 个月。方便面经典红烧牛肉味，每桶面饼 80g，开水冲泡 3 分钟即可食用。巧克力产品夏季容易融化，建议尽快食用或冷藏保存。" },
          { title: "烟草与彩票购买规定", source: "faq/tobacco-lottery.md",
            content: "根据国家规定，禁止向未成年人出售烟草。购买烟草需要出示身份证，确认年满 18 周岁。彩票不记名不挂失，售出后不能退换，请核对后再购买。中奖 1 万元以下门店直接兑奖，超过需要到彩票中心兑奖。" }
        ]
      },
      {
        id: "payment-methods",
        name: "支付方式说明",
        description: "支持的支付方式、发票、混合支付规则",
        docs: [
          { title: "支持哪些支付方式", source: "payment/methods.md",
            content: "我们支持微信支付、支付宝支付、银行卡刷卡、现金支付，也支持会员卡余额支付和积分抵扣。微信和支付宝都支持扫码付款和被扫付款，顾客可以选择自己习惯的方式。" },
          { title: "混合支付规则", source: "payment/mixed.md",
            content: "可以同时使用优惠券+会员卡积分+微信支付混合支付。先抵扣优惠券，再抵扣积分，剩余金额用微信或支付宝支付。会员卡余额不足时，剩余部分可以用其他方式支付。" },
          { title: "发票开具说明", source: "payment/invoice.md",
            content: "需要开具发票请到收银台办理，提供抬头和税号信息。电子发票会发送到您的邮箱，纸质发票当场打印。增值税普通发票当场开具，专用发票需要 3 个工作日后开具。团购和促销商品不开具额外发票，已经包含在团购价格中。" }
        ]
      }
    ];
    const insertColl = db.prepare("INSERT INTO kb_collections (id,name,description) VALUES (?,?,?)");
    const insertDoc = db.prepare("INSERT INTO kb_documents (id,collection_id,title,source,content) VALUES (?,?,?,?,?)");
    const insertChunk = db.prepare("INSERT INTO kb_chunks (doc_id,collection_id,chunk_index,text,tf,norm) VALUES (?,?,?,?,?,?)");
    const tx = db.transaction(() => {
      let docCount = 0, chunkCount = 0;
      for (const c of collections) {
        insertColl.run(c.id, c.name, c.description);
        for (const d of c.docs) {
          const docId = c.id + "-" + (++docCount);
          insertDoc.run(docId, c.id, d.title, d.source, d.content);
          const chunks = this.chunkText(d.content);
          for (let i = 0; i < chunks.length; i++) {
            const tokens = this.tokenize(chunks[i]);
            const tf = this.computeTF(tokens);
            const idf = this.computeIDF(); // 此时为空，全为 0，使用纯 TF 范数
            const norm = this.vectorNorm(tf, idf);
            insertChunk.run(docId, c.id, i, chunks[i], JSON.stringify(tf), norm);
            chunkCount++;
          }
        }
      }
      return { docCount, chunkCount };
    });
    const r = tx.call(this);
    console.log(`[INIT] KBaaS 初始化：${collections.length} collections, ${r.docCount} docs, ${r.chunkCount} chunks`);
  },

  // ── 8. 重新索引（增删文档后调用） ──
  reindex() {
    db.prepare("DELETE FROM kb_chunks").run();
    const allDocs = db.prepare("SELECT id,collection_id,content FROM kb_documents").all();
    const insertChunk = db.prepare("INSERT INTO kb_chunks (doc_id,collection_id,chunk_index,text,tf,norm) VALUES (?,?,?,?,?,?)");
    const idf = this.computeIDF();
    for (const doc of allDocs) {
      const chunks = this.chunkText(doc.content);
      for (let i = 0; i < chunks.length; i++) {
        const tokens = this.tokenize(chunks[i]);
        const tf = this.computeTF(tokens);
        const norm = this.vectorNorm(tf, idf);
        insertChunk.run(doc.id, doc.collection_id, i, chunks[i], JSON.stringify(tf), norm);
      }
    }
  }
};

KBAAS.seedIfEmpty();

// Prepared Statements
const getStoresDB = db.prepare("SELECT * FROM stores WHERE online = 1 ORDER BY name");
const getStoreDB = db.prepare("SELECT * FROM stores WHERE id = ?");
const getProductsDB = db.prepare("SELECT * FROM products ORDER BY name");
const getPromosDB = db.prepare("SELECT * FROM promotions");
const getOrderDB = db.prepare("SELECT * FROM orders WHERE id = ?");
const getPaymentDB = db.prepare("SELECT * FROM payments WHERE order_id = ?");
const getInventoryByProduct = db.prepare("SELECT * FROM inventory WHERE product_id = ?");
const getInventoryByStore = db.prepare("SELECT * FROM inventory WHERE store_id = ?");
const getLowInventory = db.prepare("SELECT * FROM inventory WHERE qty < 10 ORDER BY qty ASC");
const getMemberDB = db.prepare("SELECT * FROM members WHERE id = ?");
const getAllMembers = db.prepare("SELECT * FROM members");
const insertOrder = db.prepare(
  "INSERT INTO orders (id, store, items, total, source, status, pickup, time, merchant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
const insertPayment = db.prepare(
  "INSERT INTO payments (id, order_id, amount, method, status, payment_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))"
);
const updPaymentStatus = db.prepare("UPDATE payments SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?");
const updOrderStatus = db.prepare("UPDATE orders SET status = ? WHERE id = ?");

// ═══════════════════════════════════════
// 内存数据：已废弃 — 库存和会员均迁入 SQLite
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// MCP Server 初始化
// ═══════════════════════════════════════

const mcpServer = new Server(
  { name: "retail-store-ai", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  // ── 商品模板 (4) ──
  { name: "product_search", description: "搜索商品，根据关键词匹配商品名称和分类",
    inputSchema: { type: "object", properties: { keyword: { type: "string", description: "搜索关键词" } }, required: ["keyword"] }
  },
  { name: "product_detail", description: "查询商品详细信息，包括规格、促销信息",
    inputSchema: { type: "object", properties: { product_name: { type: "string", description: "商品名称" } }, required: ["product_name"] }
  },
  { name: "price_query", description: "查询商品当前价格和单位",
    inputSchema: { type: "object", properties: { product_name: { type: "string", description: "商品名称" } }, required: ["product_name"] }
  },
  { name: "promo_list", description: "查询当前所有促销活动列表",
    inputSchema: { type: "object", properties: {} }
  },

  // ── 库存模板 (2) ──
  { name: "inventory_query", description: "查询指定商品在各门店的实时库存数量",
    inputSchema: { type: "object", properties: { product_name: { type: "string", description: "商品名称" } }, required: ["product_name"] }
  },
  { name: "inventory_alert", description: "查询所有库存不足（<10件）的商品预警",
    inputSchema: { type: "object", properties: {} }
  },

  // ── 会员模板 (3) ──
  { name: "member_info", description: "查询会员基本信息（等级、积分等）",
    inputSchema: { type: "object", properties: { member_id: { type: "string", description: "会员ID（可选，默认返回当前用户）" } } }
  },
  { name: "member_points", description: "查询会员积分及可兑换的优惠券",
    inputSchema: { type: "object", properties: { member_id: { type: "string", description: "会员ID（可选）" } } }
  },
  { name: "coupon_query", description: "查询会员当前可用的优惠券列表",
    inputSchema: { type: "object", properties: { member_id: { type: "string", description: "会员ID（可选）" } } }
  },

  // ── 门店模板 (2) ──
  { name: "store_list", description: "查询附近门店列表、地址和营业时间",
    inputSchema: { type: "object", properties: { location: { type: "string", description: "位置/区域（可选）" } } }
  },
  { name: "store_status", description: "查询指定门店的实时营业状态",
    inputSchema: { type: "object", properties: { store_name: { type: "string", description: "门店名称" } }, required: ["store_name"] }
  },

  // ── 订单模板 (3) ──
  { name: "create_order", description: "创建新订单并自动生成支付链接，返回支付URL（AI必须原样显示此URL给用户）",
    inputSchema: { type: "object", properties: { product_name: { type: "string", description: "商品名称" }, quantity: { type: "number", description: "数量" }, store_id: { type: "string", description: "门店ID（从store_list获取）" } }, required: ["product_name", "quantity", "store_id"] }
  },
  { name: "order_status", description: "查询订单当前状态和取货信息",
    inputSchema: { type: "object", properties: { order_id: { type: "string", description: "订单号" } }, required: ["order_id"] }
  },
  { name: "process_payment", description: "处理订单支付，返回微信支付链接。AI必须原样显示此链接，不可修改或总结",
    inputSchema: { type: "object", properties: { order_id: { type: "string", description: "订单号" }, payment_method: { type: "string", description: "支付方式（默认微信支付）" } }, required: ["order_id"] }
  },

  // ── 知识库 (4) ──
  { name: "kb_search", description: "在知识库中语义检索文档段落。基于 TF-IDF + 余弦相似度，返回最相关的若干段落及来源。",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "自然语言查询，例如：'退换货政策'、'营业时间'" }, collection_id: { type: "string", description: "知识库ID（可选，留空检索全部）" }, top_k: { type: "number", description: "返回结果数（默认3）" } }, required: ["query"] }
  },
  { name: "kb_qa", description: "在知识库中检索并抽取最佳答案。返回问题最相关的句子与置信度。",
    inputSchema: { type: "object", properties: { question: { type: "string", description: "自然语言问题，例如：'鲜牛奶保质期多久？'、'会员如何升级？'" }, collection_id: { type: "string", description: "知识库ID（可选）" } }, required: ["question"] }
  },
  { name: "kb_list_collections", description: "列出所有可用的知识库集合",
    inputSchema: { type: "object", properties: {} }
  },
  { name: "kb_collections_stats", description: "查看知识库的统计信息（集合数、文档数、段落数）",
    inputSchema: { type: "object", properties: {} }
  },
];

const toolCache = new Map();
const cacheTimeout = 30000;

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  const now = Date.now();
  const cached = toolCache.get('tools');
  if (cached && now - cached.timestamp < cacheTimeout) return cached.data;
  const result = { tools: TOOLS };
  toolCache.set('tools', { data: result, timestamp: now });
  return result;
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments || {};

  try {
    const startTime = Date.now();

    // ── 商品模板 ──
    if (toolName === "product_search") {
      const kw = (args.keyword || "").toLowerCase();
      const products = getProductsDB.all();
      const results = products.filter(p =>
        p.name.toLowerCase().includes(kw) || (p.category && p.category.includes(kw))
      );
      console.log(`[PERF] product_search: ${Date.now() - startTime}ms, keyword: "${kw}"`);
      return { content: [{ type: "text", text: JSON.stringify(results.slice(0, 10), null, 2) }] };
    }

    if (toolName === "product_detail") {
      const products = getProductsDB.all();
      const p = products.find(x => x.name === args.product_name);
      return { content: [{ type: "text", text: p ? JSON.stringify(p, null, 2) : "未找到商品: " + args.product_name }] };
    }

    if (toolName === "price_query") {
      const products = getProductsDB.all();
      const p = products.find(x => x.name === args.product_name);
      return { content: [{ type: "text", text: p ? `${p.name}: ¥${p.price}/${p.unit}${p.promo ? "，" + p.promo : ""}` : "未找到商品: " + args.product_name }] };
    }

    if (toolName === "promo_list") {
      const promos = getPromosDB.all();
      return { content: [{ type: "text", text: JSON.stringify(promos, null, 2) }] };
    }

    // ── 库存模板 ──
    if (toolName === "inventory_query") {
      // 从 SQLite 查库存 (product_id ←→ product_name)
      const product = db.prepare("SELECT id FROM products WHERE name = ?").get(args.product_name);
      if (!product) return { content: [{ type: "text", text: "未找到商品: " + args.product_name }] };
      const inv = getInventoryByProduct.all(product.id);
      if (inv.length === 0) return { content: [{ type: "text", text: `商品「${args.product_name}」暂无库存记录` }] };
      const stores = getStoresDB.all();
      const result = inv.map(row => {
        const s = stores.find(x => x.id === row.store_id);
        const storeName = s ? s.name : row.store_id;
        const icon = row.qty > 10 ? "✅" : row.qty > 0 ? "⚠️" : "❌";
        const label = row.qty > 10 ? "充足" : row.qty > 0 ? "少量" : "售罄";
        return `${storeName}：${row.qty} 件 ${icon}${label}`;
      });
      return { content: [{ type: "text", text: `${args.product_name} 库存：\n${result.join("\n")}` }] };
    }

    if (toolName === "inventory_alert") {
      const stores = getStoresDB.all();
      const products = getProductsDB.all();
      const lowRows = getLowInventory.all();  // qty < 10
      const alerts = lowRows.map(row => {
        const p = products.find(x => x.id === row.product_id);
        const s = stores.find(x => x.id === row.store_id);
        const name = p ? p.name : row.product_id;
        const storeName = s ? s.name : row.store_id;
        return `${name} — ${storeName}：仅剩${row.qty}件`;
      });
      return { content: [{ type: "text", text: alerts.length ? `⚠️ 库存预警（<10件）：\n${alerts.join("\n")}` : "✅ 暂无库存预警" }] };
    }

    // ── 会员模板 ──
    if (toolName === "member_info") {
      const member_id = args.member_id || "M10001";
      const member = getMemberDB.get(member_id);
      if (!member) return { content: [{ type: "text", text: `未找到会员: ${member_id}（当前已注册会员：M10001 / M10002 / M10003）` }] };
      return { content: [{ type: "text", text: `姓名：${member.name}\n等级：${member.level}\n积分：${member.points} 分\n会员号：${member.id}\n注册日期：${member.joined}\n联系电话：${member.phone || '-'}` }] };
    }

    if (toolName === "member_points") {
      const member_id = args.member_id || "M10001";
      const member = getMemberDB.get(member_id);
      if (!member) return { content: [{ type: "text", text: `未找到会员: ${member_id}` }] };
      return { content: [{ type: "text", text: `会员：${member.name} (${member.level})\n当前积分：${member.points} 分\n\n可兑换：\n🎫 10元无门槛券 — 500分\n🎫 鲜牛奶兑换券 — 800分\n🎫 现金抵扣 ¥${(member.points/100).toFixed(2)} — ${member.points.toLocaleString()}分` }] };
    }

    if (toolName === "coupon_query") {
      const coupons = ["🎫 10元无门槛券 × 1（需500分兑换）", "🎫 鲜牛奶兑换券 × 1（需800分兑换）", "🎫 现金抵扣 ¥23.50（需2,350分）", "🎫 新品体验券 × 2（可乐买1送1）", "🎫 满50减5 × 1（全场通用）"];
      return { content: [{ type: "text", text: coupons.join("\n") }] };
    }

    if (toolName === "member_expiring_benefits") {
      const member_id = args.member_id || "M10001";
      const member = getMemberDB.get(member_id);
      if (!member) return { content: [{ type: "text", text: `未找到会员: ${member_id}` }] };
      const expiringPoints = Math.min(Math.max(Math.floor((member.points || 0) * 0.28), 120), 680);
      const expiringCoupons = ["10元无门槛券（7天后到期）", "鲜牛奶兑换券（15天后到期）"];
      return { content: [{ type: "text", text: `会员：${member.name} (${member.level})\n当前积分：${member.points} 分\n即将到期积分：${expiringPoints} 分（2026-08-31）\n即将到期优惠券：\n- ${expiringCoupons.join("\n- ")}\n建议动作：优先兑换即将到期积分，并提醒使用7天内到期优惠券。` }] };
    }

    if (toolName === "sales_top_products") {
      const topN = Math.min(Math.max(Number(args.top_n) || 10, 1), 20);
      const products = getProductsDB.all().slice(0, topN);
      const rows = products.map((p, i) => {
        const qty = Math.max(12, 80 - i * 6);
        const revenue = Math.round(p.price * qty * 100) / 100;
        return { rank: i + 1, product: p.name, revenue, quantity: qty, contribution: (18 - i * 1.3).toFixed(1) + "%" };
      });
      const range = args.date_range || "month";
      const text = `销售 Top${topN} 商品（范围：${range}${args.store_id ? `，门店：${args.store_id}` : ""}）\n` + rows.map(x => `${x.rank}. ${x.product}｜销售额 ¥${x.revenue.toLocaleString()}｜销量 ${x.quantity}｜贡献 ${x.contribution}`).join("\n");
      return { content: [{ type: "text", text }] };
    }
    // ── 门店模板 ──
    if (toolName === "store_list") {
      const stores = getStoresDB.all();
      const list = stores.map(s =>
        `${s.id} | ${s.name} — ${s.address || "地址待更新"} ${s.online ? "● 营业中" : "● 已打烊"}（${s.open_time || "07:00"}-${s.close_time || "22:00"}）`
      );
      return { content: [{ type: "text", text: `附近门店（${stores.length}家）：\n${list.join("\n")}\n\n下单时请使用门店ID（如 thb / kyl / lkd）` }] };
    }

    if (toolName === "store_status") {
      const stores = getStoresDB.all();
      const s = stores.find(x => x.name.includes(args.store_name) || x.id === args.store_name);
      if (!s) return { content: [{ type: "text", text: "未找到门店: " + args.store_name }] };
      return { content: [{ type: "text", text: `${s.name}\nID：${s.id}\n地址：${s.address || "待更新"}\n营业时间：${s.open_time || "07:00"}-${s.close_time || "22:00"}\n状态：${s.online ? "● 营业中" : "● 已打烊"}` }] };
    }

    // ── 订单模板 ──
    if (toolName === "create_order") {
      const products = getProductsDB.all();
      const stores = getStoresDB.all();
      
      const p = products.find(x => x.name === args.product_name);
      if (!p) return { content: [{ type: "text", text: "商品不存在: " + args.product_name }] };
      
      const s = stores.find(x => x.id === args.store_id);
      if (!s) return { content: [{ type: "text", text: `门店不存在: ${args.store_id}。可用门店ID：${stores.map(x=>x.id).join("、")}` }] };

      const subtotal = p.price * args.quantity;
      const discount = subtotal >= 100 ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
      const total = subtotal - discount;
      const pickupCode = String(1000 + Math.floor(Math.random() * 9000));
      const orderId = "ORD" + Date.now();
      const payment_id = "PAY" + Date.now();
      const payment_url = `https://pay.weixin.qq.com/mmpayweb/pay?pr=MMZT&partner_id=1900000109&prepay_id=prepay_id_${payment_id}`;

      // 写入管理后台 orders 表
      const itemsJson = JSON.stringify([{ name: p.name, qty: args.quantity, price: p.price }]);
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      insertOrder.run(orderId, s.name, itemsJson, total, "🤖 微信 AI", "待支付", pickupCode, timeStr, s.merchant_id || "");

      // 写入 payments 表
      insertPayment.run(payment_id, orderId, total, "微信支付", "pending", payment_url);

      return { content: [{ 
        type: "text", 
        text: `✅ 订单创建成功（已同步至管理后台）

订单号：${orderId}
门店：${s.name}
商品：${p.name} × ${args.quantity}
小计：¥${subtotal.toFixed(2)}
折扣：${discount > 0 ? `-¥${discount.toFixed(2)}` : "无"}
总计：¥${total.toFixed(2)}
取货码：${pickupCode}
状态：待支付

━━━━━━━━━━━━━━━━━━━━
💳 点击下方链接完成支付（必须原样显示，不可修改）：
${payment_url}
━━━━━━━━━━━━━━━━━━━━` 
      }] };
    }

    if (toolName === "order_status") {
      const order = getOrderDB.get(args.order_id);
      if (!order) return { content: [{ type: "text", text: `订单 ${args.order_id} 不存在` }] };
      
      // 同时查询支付状态
      const payment = getPaymentDB.get(args.order_id);
      const payInfo = payment ? `\n支付方式：${payment.method}\n支付状态：${payment.status}` : "";
      
      return { content: [{ type: "text", text: `订单号：${order.id}\n门店：${order.store}\n商品：${order.items}\n金额：¥${order.total}\n来源：${order.source}\n状态：${order.status}\n取货码：${order.pickup || "—"}${payInfo}\n创建时间：${order.time || order.created_at}` }] };
    }

    if (toolName === "process_payment") {
      const order_id = args.order_id;
      const payment_method = args.payment_method || "微信支付";
      
      const order = getOrderDB.get(order_id);
      if (!order) return { content: [{ type: "text", text: `订单 ${order_id} 不存在` }] };

      if (order.status !== "待支付") {
        return { content: [{ type: "text", text: `订单 ${order_id} 当前状态：${order.status}，无需重复支付` }] };
      }

      const payment_id = "PAY" + Date.now();
      const payment_url = `https://pay.weixin.qq.com/mmpayweb/pay?pr=MMZT&partner_id=1900000109&prepay_id=prepay_id_${payment_id}`;

      // 写入 payments 表
      insertPayment.run(payment_id, order_id, order.total, payment_method, "completed", payment_url);
      // 更新订单状态
      updOrderStatus.run("支付中", order_id);

      return { content: [{ 
        type: "text",
        text: `✅ 支付请求已提交（已同步至管理后台）

订单号：${order_id}
金额：¥${order.total}
支付方式：${payment_method}
━━━━━━━━━━━━━━━━━━━━
${payment_url}
━━━━━━━━━━━━━━━━━━━━

点击上方链接完成支付`
      }] };
    }

    // ── KBAAS — 知识库语义检索 ──
    if (toolName === "kb_search") {
      const startTime = Date.now();
      const query = args.query || "";
      const topK = Math.min(Math.max(parseInt(args.top_k) || 3, 1), 10);
      const collFilter = args.collection_id;

      const qTokens = KBAAS.tokenize(query);
      if (qTokens.length === 0) {
        return { content: [{ type: "text", text: "查询语句为空，请输入问题" }] };
      }
      const qTF = KBAAS.computeTF(qTokens);
      const idf = KBAAS.computeIDF();

      let rows = db.prepare("SELECT c.id, c.doc_id, c.text, c.tf, c.norm, c.collection_id, d.title, d.source FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id").all();
      if (collFilter) rows = rows.filter(r => r.collection_id === collFilter);

      const scored = rows.map(r => {
        const cTF = JSON.parse(r.tf);
        const score = KBAAS.cosineScore(qTF, cTF, idf);
        return { ...r, score };
      }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);

      if (scored.length === 0) {
        return { content: [{ type: "text", text: `未找到与「${query}」相关的内容。试试更口语化的表达？` }] };
      }
      const result = scored.map((r, i) =>
        `[${i + 1}] ${r.title}（${r.source}）— 相似度 ${(r.score * 100).toFixed(1)}%\n${r.text}`
      ).join("\n\n");
      console.log(`[PERF] kb_search: ${Date.now() - startTime}ms, query: "${query}", hits: ${scored.length}`);
      return { content: [{ type: "text", text: `检索到 ${scored.length} 段相关内容：\n\n${result}` }] };
    }

    if (toolName === "kb_qa") {
      const startTime = Date.now();
      const question = args.question || "";
      const collFilter = args.collection_id;

      const qTokens = KBAAS.tokenize(question);
      if (qTokens.length === 0) {
        return { content: [{ type: "text", text: "问题为空，请输入具体问题" }] };
      }
      const qTF = KBAAS.computeTF(qTokens);
      const idf = KBAAS.computeIDF();

      let rows = db.prepare("SELECT c.id, c.doc_id, c.text, c.tf, c.norm, c.collection_id, d.title, d.source FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id").all();
      if (collFilter) rows = rows.filter(r => r.collection_id === collFilter);

      // 检索 top 3 段落
      const topChunks = rows.map(r => {
        const cTF = JSON.parse(r.tf);
        const chunkScore = KBAAS.cosineScore(qTF, cTF, idf);
        return { ...r, chunkScore };
      }).filter(r => r.chunkScore > 0).sort((a, b) => b.chunkScore - a.chunkScore).slice(0, 3);

      if (topChunks.length === 0) {
        return { content: [{ type: "text", text: `没有找到与「${question}」相关的信息。建议换个问法。` }] };
      }

      // 在 top 段落中按句切分，做关键词重叠打分，提取最佳答案句
      const sentenceSplit = /(?<=[。！？!?])\s*/;
      const candidates = [];
      for (const chunk of topChunks) {
        const sentences = chunk.text.split(sentenceSplit).filter(s => s.trim().length > 0);
        for (const sent of sentences) {
          const sTokens = KBAAS.tokenize(sent);
          let overlap = 0;
          for (const t of qTokens) {
            if (sTokens.includes(t)) overlap++;
          }
          const score = (overlap / Math.max(qTokens.length, 1)) * 0.6 + chunk.chunkScore * 0.4;
          candidates.push({ sentence: sent.trim(), score, source: chunk.title, sourceFile: chunk.source, chunkScore: chunk.chunkScore });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      const confidence = Math.min(best.score, 1.0);

      // 附加 top3 候选作为佐证
      const evidence = candidates.slice(0, 3).map((c, i) =>
        `  ${i + 1}. ${c.sentence}（来源：${c.source}，置信度 ${(c.score * 100).toFixed(1)}%）`
      ).join("\n");

      console.log(`[PERF] kb_qa: ${Date.now() - startTime}ms, question: "${question}", confidence: ${(confidence * 100).toFixed(1)}%`);
      return { content: [{ type: "text", text:
        `💡 答案（置信度 ${(confidence * 100).toFixed(1)}%）：\n${best.sentence}\n\n` +
        `📚 参考依据：\n${evidence}\n\n` +
        `（来源：${best.source} · ${best.sourceFile}）`
      }] };
    }

    if (toolName === "kb_list_collections") {
      const rows = db.prepare("SELECT c.id, c.name, c.description, COUNT(d.id) as doc_count FROM kb_collections c LEFT JOIN kb_documents d ON d.collection_id = c.id GROUP BY c.id ORDER BY c.id").all();
      if (rows.length === 0) return { content: [{ type: "text", text: "暂无知识库" }] };
      const list = rows.map((r, i) => `${i + 1}. ${r.name} (${r.id}) — ${r.doc_count} 篇文档\n   ${r.description}`).join("\n");
      return { content: [{ type: "text", text: `📚 可用知识库（${rows.length} 个）：\n${list}` }] };
    }

    if (toolName === "kb_collections_stats") {
      const c = db.prepare("SELECT COUNT(*) as n FROM kb_collections").get().n;
      const d = db.prepare("SELECT COUNT(*) as n FROM kb_documents").get().n;
      const ch = db.prepare("SELECT COUNT(*) as n FROM kb_chunks").get().n;
      return { content: [{ type: "text", text: `📊 知识库统计：\n  集合数：${c}\n  文档数：${d}\n  段落数：${ch}\n  引擎：TF-IDF + Cosine（零依赖）` }] };
    }

    return { content: [{ type: "text", text: "未知 Tool: " + toolName }] };

  } catch (e) {
    console.error(`[ERROR] ${toolName}:`, e.message);
    return { content: [{ type: "text", text: "Tool 执行异常: " + e.message }] };
  }
});

// ═══════════════════════════════════════
// Express 应用
// ═══════════════════════════════════════

const app = express();
app.use((req, res, next) => {
  if (req.path === "/mcp") return next();
  express.json()(req, res, next);
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

function apiKeyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers["x-api-key"];
  let providedKey = null;
  if (authHeader && authHeader.startsWith("Bearer ")) providedKey = authHeader.slice(7);
  else if (apiKeyHeader) providedKey = apiKeyHeader;
  if (!API_KEY || API_KEY === "disabled") return next();
  if (!providedKey || providedKey !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/health", (req, res) => {
  const storeCount = db.prepare("SELECT COUNT(*) as c FROM stores").get();
  const orderCount = db.prepare("SELECT COUNT(*) as c FROM orders").get();
  const kbColl = db.prepare("SELECT COUNT(*) as c FROM kb_collections").get().c;
  const kbDocs = db.prepare("SELECT COUNT(*) as c FROM kb_documents").get().c;
  const kbChunks = db.prepare("SELECT COUNT(*) as c FROM kb_chunks").get().c;
  res.json({
    status: "ok",
    name: "retail-store-ai",
    version: "2.2",
    tools: TOOLS.length,
    db: "SQLite (synced with admin :3100)",
    stores: storeCount.c,
    orders: orderCount.c,
    kbaas: { collections: kbColl, documents: kbDocs, chunks: kbChunks, engine: "TF-IDF + Cosine" },
    auth: !!API_KEY && API_KEY !== "disabled",
    uptime: process.uptime().toFixed(0) + "s",
  });
});

const mcpSessions = new Map();

app.get("/sse", apiKeyAuth, async (req, res) => {
  const transport = new SSEServerTransport("/mcp", res);
  const sessionId = transport._sessionId;
  mcpSessions.set(sessionId, transport);
  res.on("close", () => mcpSessions.delete(sessionId));
  await mcpServer.connect(transport);
});

app.post("/mcp", apiKeyAuth, async (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });
  const transport = mcpSessions.get(sessionId);
  if (!transport) return res.status(404).json({ error: "Session not found" });
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  const storeCount = db.prepare("SELECT COUNT(*) as c FROM stores").get();
  const productCount = db.prepare("SELECT COUNT(*) as c FROM products").get();
  const kbColl = db.prepare("SELECT COUNT(*) as c FROM kb_collections").get().c;
  const kbDocs = db.prepare("SELECT COUNT(*) as c FROM kb_documents").get().c;
  console.log("═".repeat(50));
  console.log("  MCP Forge · 零售门店 AI 助手 v2.2");
  console.log(`  💾 数据库：SQLite (与管理后台 :3100 共享)`);
  console.log(`  🏪 门店：${storeCount.c} 家 | 📦 商品：${productCount.c} 个 | 📚 知识库：${kbColl} 集合 / ${kbDocs} 文档`);
  console.log(`  🔧 Tools：${TOOLS.length} (含 4 个 KBaaS)`);
  console.log("═".repeat(50));
  console.log(`  SSE 端点：http://localhost:${PORT}/sse`);
  console.log(`  健康检查：http://localhost:${PORT}/health`);
  if (API_KEY && API_KEY !== "disabled") {
    console.log(`  🔑 API Key：${API_KEY}`);
  } else {
    console.log("  ⚠️  API Key 未启用，无认证模式");
  }
  console.log("═".repeat(50));
  
  setInterval(() => {
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    console.log(`[MONITOR] Uptime: ${uptime.toFixed(0)}s | Memory: ${Math.round(mem.heapUsed/1024/1024)}MB/${Math.round(mem.heapTotal/1024/1024)}MB`);
  }, 60000);
});
