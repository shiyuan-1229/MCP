# PHASE 3 · KBaaS 知识库引擎（Node.js 适配版）

> MCP Forge · 零售门店 AI 助手
> 日期：2026-07-04
> 范围：在 `poc/demo-server/` 内实现轻量知识库引擎，对接公网 MCP Server

---

## 一、阶段目标

让 AI Agent 能够**直接查询**门店运营手册、商品 FAQ、促销规则等业务文档，而不是仅依赖预定义 Tool 输出固定文案。

### 核心场景

| 场景 | 用户问题 | KBaaS 返回 |
|------|---------|-----------|
| 退换货 | "食品能退换吗？" | 抽取「退换货政策」段落 + 置信度 |
| 营业时间 | "几点关门？" | 抽取「门店分布」段落 + 门店具体时段 |
| 会员升级 | "怎么升级黄金会员？" | 抽取「会员服务」段落 + 积分门槛 |
| 商品咨询 | "鲜牛奶保质期多久？" | 抽取「乳制品与鲜食」段落 |
| 活动规则 | "买2箱几折？" | 抽取「买赠与折扣规则」段落 |

---

## 二、技术选型

### 为什么不用 Python 版的 Chroma？

| 维度 | Python Chroma | Node.js TF-IDF（当前方案）|
|------|--------------|-------------------------|
| 依赖 | ~150MB HuggingFace 模型 | **零外部依赖** |
| 启动时间 | 3-5 秒（首次加载） | < 50ms |
| 公网部署 | 需 Python 3.10 + 依赖 | 跟 demo-server 同一 Node 进程 |
| 检索效果 | 语义级 | 关键词级（中文 bigram）|
| 适合数据量 | 100k+ 文档 | **< 5k 文档**（demo 场景）|
| 维护成本 | 高（需升级模型）| 低（纯算法）|

**结论**：demo 阶段 KB 数据 < 20 文档，TF-IDF + Cosine 足够；等真上线再换向量库。

---

## 三、架构

### 3.1 引擎组成

```
KBAAS = {
  tokenize(text)        // 中文 bigram + 英文/数字分词
  chunkText(text, max)  // 段落 → 句子切分
  computeTF(tokens)     // 词频归一化
  computeIDF()          // 从 kb_chunks 表统计
  vectorNorm(tf, idf)   // L2 范数
  cosineScore(qTF, cTF, idf)  // 余弦相似度
  seedIfEmpty()         // 启动时灌种子数据
  reindex()             // 增删文档后重算
}
```

### 3.2 数据模型（新增 3 张表）

```sql
CREATE TABLE kb_collections (
  id TEXT PRIMARY KEY,        -- 'store-ops' / 'product-faq' / 'promo-rules'
  name TEXT,                  -- '门店运营手册'
  description TEXT,
  created_at DATETIME
);

CREATE TABLE kb_documents (
  id TEXT PRIMARY KEY,        -- 'store-ops-1'
  collection_id TEXT,
  title TEXT,                 -- '退换货政策'
  source TEXT,                -- 'ops/return.md'
  content TEXT,               -- 完整原文
  created_at DATETIME
);

CREATE TABLE kb_chunks (
  id INTEGER PRIMARY KEY,
  doc_id TEXT,
  collection_id TEXT,
  chunk_index INTEGER,        -- 段落序号
  text TEXT,                  -- 段落内容（用于展示）
  tf TEXT,                    -- JSON: { token: tf_value }
  norm REAL                   -- 预计算的 L2 范数
);
```

### 3.3 检索流程

```
1. 启动时 seedIfEmpty() 灌入 10 篇种子文档
2. 按段落切分 → 每段计算 TF + Norm → 写入 kb_chunks
3. 用户问 "食品能退换吗？"
4. tokenize → 计算 qTF
5. 加载全部 chunks 的 TF
6. 对每个 chunk 算 cosine(qTF, cTF)
7. 排序返回 top_k 段
8. 展示原文 + 相似度百分比
```

### 3.4 Extractive QA

`kb_qa` 在 `kb_search` 之上做句子级抽取：

1. 取 top 3 段落
2. 每段按句号切分
3. 对每个句子算「关键词重叠率 + 段落得分」加权
4. 最高分句子作为答案
5. 返回置信度（0-100%）+ 佐证 3 句

---

## 四、新增 Tool（4 个）

| Tool | 功能 | 输入 | 适用场景 |
|------|------|------|---------|
| `kb_search` | 段落级语义检索 | query, collection_id?, top_k? | "查政策"、"找说明" |
| `kb_qa` | 句子级 QA 抽取 | question, collection_id? | "怎么升级"、"几天能退" |
| `kb_list_collections` | 列出所有知识库 | 无 | Agent 初始化用 |
| `kb_collections_stats` | 知识库统计 | 无 | 监控 / 调试 |

**Tool 总数**：14 → **18**（商品 4 + 库存 2 + 会员 3 + 门店 2 + 订单 3 + KBaaS 4）

---

## 五、种子数据

3 个 collection / 10 篇文档 / 22 个段落：

| Collection | 文档 | 主题 |
|------------|------|------|
| `store-ops` 门店运营手册 | 营业时间与取货规则 | 营业时间、自提、退款 |
| | 退换货政策 | 食品/非食品退换规则 |
| | 会员服务说明 | 三级会员、积分有效期 |
| | 门店分布与服务范围 | 6 家门店位置和时段 |
| `product-faq` 商品常见问题 | 饮料类商品说明 | 元气森林/农夫山泉/可乐雪碧 |
| | 乳制品与鲜食 | 鲜牛奶/面包组合 |
| | 零食与方便食品 | 薯片/方便面 |
| `promo-rules` 促销活动规则 | 买赠与折扣规则 | 9 折/8 折/买 6 送 1 |
| | 积分兑换规则 | 500/800/2350 分兑换 |

---

## 六、测试覆盖

`test_kbaas.mjs` — **12 个单元测试**全部通过（0 依赖纯算法）：

```
1. tokenize: 中文 bigram
2. tokenize: 混合中英文
3. tokenize: 标点切分
4. chunkText: 单段
5. chunkText: 多段
6. chunkText: 长段落切分
7. computeTF: 归一化
8. cosineScore: 相同向量 = 1
9. cosineScore: 完全无关 = 0
10. 端到端: 退换货问题
11. 端到端: 营业时间问题
12. 端到端: 会员升级问题
```

---

## 七、集成改动清单

| 文件 | 改动 |
|------|------|
| `demo-server/server.js` | +KBaaS 模块（~120 行） / +3 张表 / +4 Tool / 升级 v2.1 → v2.2 |
| `demo-server/test_kbaas.mjs` | 新增（独立测试，不依赖 SQLite）|

**未改动**：`poc/server/server.js`（管理后台不直接提供 KB API；KB 由 demo-server 单点服务）

---

## 八、上线验证清单

- [ ] 用户手动 `start.bat` 起服务（沙箱内 SQLite 写受限）
- [ ] `curl http://localhost:3458/health` 返回 `kbaas: {collections: 3, documents: 10, chunks: 22}`
- [ ] 调 `kb_list_collections` 看到 3 个集合
- [ ] 调 `kb_qa question="食品能不能退换"` 返回正确段落
- [ ] 调 `kb_search query="积分有效期"` 命中会员服务文档
- [ ] 调 `kb_collections_stats` 返回段落数 = 22
- [ ] 腾讯元器插件刷新 Tool 列表，从 14 变 18

---

## 九、版本号

| 服务 | 旧版本 | 新版本 |
|------|--------|--------|
| demo-server | v2.1 | **v2.2** |
| 主服务 (poc/server) | v2.0.0 | v2.0.0（未变）|
| MCP Tool 总数 | 14 | **18** |

---

## 十、后续可优化项（非本期）

1. **向量检索**：数据量 > 1000 文档时改用 `@xenova/transformers` 本地嵌入模型
2. **文档解析**：当前是手工 JSON 种子，可加 PDF/DOCX 解析
3. **混合检索**：BM25 + 向量融合，提升长查询召回
4. **权限隔离**：每个 collection 绑定不同门店，跨店 KB 隔离
5. **增量索引**：当前 reindex 全表清空，量大时改成差量
