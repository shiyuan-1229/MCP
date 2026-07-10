# MCP Forge 迭代执行方案

> 版本：v1.0 | 日期：2026-07-09
> 基于代码实际审计结果制定，非泛泛建议

---

## 阶段一：闭环验证（目标：从"原型"变"产品"）

**阶段目标**：让一个从没见过这个项目的人，打开平台后能完成完整体验链路（看总览 → 选客户 → 看 MCP 资产 → 试调 → 看调用统计 → 下载交付物），且全程认为这是真实系统在运行。

**预计周期**：2-3 周

---

### 任务 1.1：搭建本地 MCP Server，让 simulate-call 走真实 JSON-RPC

#### 干什么

当前 `/admin/simulate-call` 在 Express 里用 `if (tool_name === "sales_top_products")` 硬编码返回鲜奶、咖啡数据。改为：simulate-call 通过 MCP SDK Client 真实调用一个跑在本地的 MCP Server，MCP Server 内部可以返回 mock 数据，但通信链路必须走 MCP JSON-RPC 2.0 协议。

#### 为什么

甲方点"试调"后看到返回了"鲜奶、矿泉水"，马上知道是写死的。如果调用走了真实 MCP 协议（`initialize → tools/list → tools/call`），call_events 里记录的 latency 和 trace_id 才有可信度，整个"调用统计"和"计费"模块才站得住。

#### 怎么干

**步骤 1**：在 `poc/server/` 下新建 `mcp-servers/` 目录，创建一个本地 MCP Server 文件

```
poc/server/
  mcp-servers/
    forge-demo-server.mjs    ← 新建
```

**步骤 2**：用 `@modelcontextprotocol/sdk`（已安装 v1.6.0）创建 MCP Server，注册 5 个 tool：

| Tool 名称 | 对应的客户/资产 | 输入参数 | 返回内容 |
|-----------|---------------|---------|---------|
| `sales_top_products` | 美佳零售 | `{ date_range, top_n }` | TopN 商品销售数据 |
| `member_expiring_benefits` | 美佳零售 | `{ member_id }` | 会员到期权益 |
| `work_order_lookup` | 华智制造 | `{ order_id }` | 工单详情 |
| `property_ticket_create` | 安和物业 | `{ room_no, description }` | 报修工单创建结果 |
| `campus_qa` | 知行教育 | `{ question }` | 校园知识问答 |

每个 tool 内部返回预置的 mock 数据（不需要连真实数据库），但 input_schema 必须完整、description 必须准确。

**步骤 3**：在 `server.js` 中新增一个 MCP Client 管理模块

```javascript
// 新增：MCP Client 连接池
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// 启动时 spawn MCP Server 子进程，建立 stdio 连接
// simulate-call 改为通过 client.callTool() 调用
```

**步骤 4**：改造 `/admin/simulate-call` 接口

改造前（当前代码）：
```javascript
if (tool_name === "sales_top_products") {
  const productPool = ["鲜奶", "现磨咖啡", ...];
  result = { tool: tool_name, ... };
}
```

改造后：
```javascript
// 通过 MCP Client 真实调用
const mcpResult = await mcpClient.callTool({
  name: tool_name,
  arguments: args
});
// mcpResult 是 MCP 协议标准的 CallToolResult
// 记录真实 latency（从 callTool 开始到返回的时间差）
const latency = Date.now() - startTime;
```

**步骤 5**：call_events 记录真实 latency（当前是 `120 + Math.floor(Math.random() * 180)` 假随机数）

#### 产出

- `mcp-servers/forge-demo-server.mjs`：一个可独立运行的 MCP Server，注册了 5 个 tool
- `server.js` 改造：新增 MCP Client 连接逻辑，simulate-call 走真实协议调用
- call_events 表记录真实 latency_ms

#### 验收标准

1. 在终端能看到 MCP Server 子进程启动日志（`"MCP Server started, 5 tools registered"`）
2. 前端点"试调"后，Network 面板看到 `/admin/simulate-call` 返回的数据结构与之前一致（不破坏前端），但 latency 是真实测量值（不是假随机）
3. 故意把 MCP Server 关掉，simulate-call 返回错误 → 证明不是硬编码
4. 在 MCP Server 侧加一行 `console.log`，试调时能在终端看到调用日志 → 证明走了真实通信

---

### 任务 1.2：交付物从"静态文字"升级为"可下载的结构化文件"

#### 干什么

当前 `platform_deliverables` 只有 5 个字段（id / project_id / name / type / status），前端展示"MCP 配置包""上线测试报告"等文字，但没有文件可下载。改为：每类交付物生成真实的可下载文件。

#### 为什么

"交付平台"的核心是"交付物"。甲方看到"文件下载"页面，点开"MCP 配置包"，发现没文件 → 这是个空壳。一个可下载的 MCP 配置包 JSON，比页面上写着"MCP 配置包 - ready"有说服力 100 倍。

#### 怎么干

**步骤 1**：扩展 `platform_deliverables` 表，新增字段

```sql
ALTER TABLE platform_deliverables ADD COLUMN file_path TEXT;      -- 生成的文件路径
ALTER TABLE platform_deliverables ADD COLUMN file_size INTEGER;   -- 文件大小
ALTER TABLE platform_deliverables ADD COLUMN mime_type TEXT;      -- 文件类型
ALTER TABLE platform_deliverables ADD COLUMN generated_by TEXT;   -- 生成者
```

**步骤 2**：新建交付物生成目录

```
poc/server/
  deliverables/          ← 新建，存放生成的交付文件
    proj_retail_ai/
      mcp-config-v1.2.0.json
      test-report-2026-07.pdf (或 html)
      call-logs-2026-07.csv
```

**步骤 3**：为每类交付物编写生成逻辑

| 交付物类型 | 生成方式 | 文件格式 |
|-----------|---------|---------|
| **config**（MCP 配置包） | 从 `platform_mcp_assets` 读取该项目的所有 MCP 资产，生成一个标准化的 MCP Server 配置 JSON（含 tool 列表、input_schema、endpoint、鉴权方式） | `.json` |
| **test-report**（测试报告） | 从 `platform_call_events` 聚合该项目的调用数据（总调用数、成功率、平均延迟、异常列表），生成结构化报告 | `.html`（可打印为 PDF） |
| **log**（调用日志） | 从 `platform_call_events` 导出该项目的调用记录 | `.csv` |
| **effect-report**（效果复盘） | 从 call_events + billing_records 聚合月度数据 | `.html` |

**步骤 4**：新增 API 端点

```javascript
// 生成交付物
POST /api/platform/deliverables/:id/generate

// 下载交付物
GET /api/platform/deliverables/:id/download
```

**步骤 5**：用 `archiver`（已安装）支持打包下载——一个项目的所有交付物可以打成一个 zip 包

**步骤 6**：前端改造——交付物列表里每个 ready 状态的交付物旁边出现"下载"按钮，点击触发文件下载

#### 产出

- 4 类交付物的生成逻辑（config JSON / test-report HTML / log CSV / effect-report HTML）
- 2 个新 API（generate / download）
- 前端下载按钮
- `deliverables/` 目录结构

#### 验收标准

1. 在"文件下载"页面点击"MCP 配置包"旁的"下载"按钮 → 浏览器下载一个 `.json` 文件
2. 打开 JSON 文件，内容是结构化的 MCP Server 配置（含 tool 名称、input_schema、endpoint）
3. 点击"测试报告"下载 → 得到一个 HTML 文件，打开后能看到调用成功率、延迟分布等数据
4. 点击"调用日志"下载 → 得到一个 CSV 文件，Excel 打开后能看到每条调用记录
5. 美佳零售项目点击"打包下载" → 得到一个 zip，解压后包含上述所有文件

---

### 任务 1.3：call_events 补充真实调用数据结构

#### 干什么

当前 call_events 记录的字段比较简单（asset_id / caller / status / latency_ms / business_result / trace_id）。补全为更真实的调用记录：新增 input_tokens、output_tokens、request_params（脱敏后）、response_summary。

#### 为什么

后续的"使用统计"和"计费"模块需要 token 维度的数据。当前 call_events 没有 token 字段，计费页面的"调用量/效果费"无法和调用记录关联。

#### 怎么干

**步骤 1**：扩展表结构

```sql
ALTER TABLE platform_call_events ADD COLUMN input_tokens INTEGER DEFAULT 0;
ALTER TABLE platform_call_events ADD COLUMN output_tokens INTEGER DEFAULT 0;
ALTER TABLE platform_call_events ADD COLUMN request_params TEXT;     -- 脱敏后的请求参数 JSON
ALTER TABLE platform_call_events ADD COLUMN response_summary TEXT;   -- 响应摘要
```

**步骤 2**：在 simulate-call 改造（任务 1.1）时，MCP Server 返回结果中附带 token 估算（input_tokens / output_tokens），写入 call_events

**步骤 3**：seed 数据补充 token 字段

**步骤 4**：前端"使用统计"页面增加 token 维度的展示（当前只有调用次数和延迟）

#### 产出

- call_events 表扩展 4 个字段
- seed 数据补充 token 值
- 前端使用统计页面增加 token 趋势图

#### 验收标准

1. call_events 每条记录都有 input_tokens / output_tokens 值
2. "使用统计"页面能看到"本月 Token 消耗"指标
3. "计费管理"页面的"调用量/效果费"行能展示对应的 token 数

---

### 任务 1.4：演示主线从零售切换为多行业对比

#### 干什么

当前演示默认走美佳零售（唯一 published 客户、simulate-call 假数据全是鲜奶咖啡）。改为：演示默认从"5 客户总览"开始，深入演示选华智制造或安和物业。

#### 为什么

甲方看到第一眼全是零售 → 认为"这是给零售店做的"。多行业对比 + 非零售深入，才能传达"通用企业平台"。

#### 怎么干

**步骤 1**：调整 seed 数据平衡——华智制造和安和物业的 MCP 资产也改为 published 状态（当前是 testing）

**步骤 2**：演示脚本（`MCP_Forge_Demo脚本.md`）重写，主线改为：
```
① 5 客户总览（30 秒，证明通用性）
② 选华智制造深入（因为制造客户的甲方感知更"企业级"）
③ 看 MCP 资产 → 工单查询 + 质检分析
④ 试调 work_order_lookup
⑤ 看调用统计和网关策略
⑥ 看计费和交付物
⑦ 切回总览，快速过一遍安和物业（物业场景）
```

**步骤 3**：simulate-call 改造后（任务 1.1），5 个 tool 覆盖 5 个行业，不再只有零售

**步骤 4**：清理前端 `assetNameText` 里 `sales_top_products` 排第一位的问题，改为按行业分组展示

#### 产出

- seed 数据调整（华智/安和资产状态升级）
- 新版演示脚本
- simulate-call 覆盖 5 行业（任务 1.1 已覆盖）

#### 验收标准

1. 演示时第一屏是 5 客户总览，而不是零售门店列表
2. 深入演示的客户是华智制造或安和物业，不是美佳零售
3. simulate-call 试调的默认 tool 是 `work_order_lookup`（制造），不是 `sales_top_products`（零售）

---

### 任务 1.5：清理历史 demo 残留

#### 干什么

server 目录下有大量调试文件、日志文件、备份文件，影响项目整洁度。

#### 清理清单

| 文件 | 操作 | 原因 |
|------|------|------|
| `diag-*.mjs` / `diag-*.js`（14 个） | 移到 `poc/server/archive/` | 一次性调试脚本，不再需要 |
| `test1.js` / `test2.js` / `test3.js` + 对应 `.log` | 移到 `archive/` | 临时测试 |
| `server.js.backup` / `server.js.broken` | 删除 | 已无用 |
| `*.log` 文件（full.log / run.log / server.*.log 等） | 清空或删除 | 运行日志不应提交 |
| `screenshot-login.mjs` / `seed-access-extras.js` | 评估是否保留 | 如果是演示辅助工具可保留 |
| `codegen.js` | 评估是否保留 | 如果是 MCP 代码生成器则保留 |

#### 产出

- `poc/server/archive/` 目录，存放历史调试文件
- server 目录干净，只有 `server.js` + `mcp-servers/` + `deliverables/` + 标准 node 目录

#### 验收标准

1. `ls poc/server/` 只看到：`server.js` / `mcp-servers/` / `deliverables/` / `node_modules/` / `package.json` / `package-lock.json`
2. 所有调试文件在 `archive/` 里可找回

---

### 阶段一总验收

打开浏览器 → `http://localhost:3100/admin` → 用 admin 登录：

1. ✅ 首页看到 5 个行业客户总览
2. ✅ 点华智制造 → 看到 MCP 资产（工单查询、质检分析）
3. ✅ 点试调 → 选 `work_order_lookup` → 返回工单数据 → latency 是真实值
4. ✅ 看使用统计 → 有调用量 + token 消耗
5. ✅ 看网关策略 → 有脱敏规则、限流、OAuth 认证
6. ✅ 看计费 → 有实施费 + 年费 + 按量计费
7. ✅ 看文件下载 → 点击下载 → 浏览器下载了真实的 JSON/CSV 文件
8. ✅ 全程没有看到"鲜奶""咖啡"等零售专用数据作为主线

---

## 阶段二：客户视角独立化（目标：客户登录后看到"我的资产"，不是 admin 阉割版）

**阶段目标**：客户角色（meijia / hzm / xrf 等）登录后看到的和 admin 完全不同——客户看到的是"资产 + 账单"，不是"项目 + 治理"。

**预计周期**：2-3 周

---

### 任务 2.1：客户专属首页

#### 干什么

当前客户角色登录后看到的是 admin 的导航（只是少了"MCP 工厂"和"网关与治理"两个 tab）。新建一个客户专属首页，展示"我的 MCP 资产"。

#### 怎么干

**步骤 1**：前端 `state.js` 新增客户导航

```javascript
export const customerNavItems = [
  { id: 'my-assets',      label: '我的 MCP 资产', roles: ['customer'] },
  { id: 'my-usage',       label: '调用统计',      roles: ['customer'] },
  { id: 'my-billing',     label: '账单管理',      roles: ['customer'] },
  { id: 'my-deliverables', label: '交付物下载',   roles: ['customer'] },
  { id: 'my-access',      label: '接入配置',      roles: ['customer'] }
];
```

**步骤 2**：`app.js` 中根据角色切换导航

```javascript
const navSource = role === 'admin' ? navItems : customerNavItems;
```

**步骤 3**：新建客户首页渲染模块

客户首页内容：
```
┌────────────────────────────────────────────────────┐
│  欢迎回来，华智工程师                                 │
│  企业：华智制造 | 套餐：专业版 | 余额：¥2,340         │
├──────────┬──────────┬──────────┬─────────────────┤
│ MCP 资产  │ 本月调用  │ Token 消耗│ 本月费用         │
│    2     │  1,234   │  45,200  │  ¥1,840         │
├──────────┴──────────┴──────────┴─────────────────┤
│                                                    │
│  我的 MCP 资产（卡片视图）                           │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ 🔧 工单查询    │  │ 🔍 质检分析    │               │
│  │ v0.8.0       │  │ v0.3.0       │               │
│  │ ✅ 已发布     │  │ 📝 草稿       │               │
│  │ 本月 542 次   │  │ 本月 0 次     │               │
│  │ [查看详情]   │  │ [查看详情]   │               │
│  └──────────────┘  └──────────────┘               │
│                                                    │
│  [查看接入指南]                                     │
└────────────────────────────────────────────────────┘
```

**步骤 4**：后端新增客户首页汇总 API

```javascript
GET /api/customer/dashboard    // 返回该客户的资产数、调用量、token、费用汇总
```

#### 产出

- 前端客户专属导航和首页
- 后端 `/api/customer/dashboard` API
- 客户角色看到的不再是 admin 阉割版

#### 验收标准

1. 用 hzm（华智）登录 → 看到的是"我的 MCP 资产"首页，不是"项目工作台"
2. 首页显示该客户的资产卡片、调用统计、账单摘要
3. 看不到其他客户的数据（多租户隔离验证）

---

### 任务 2.2：MCP 接入指引页

#### 干什么

客户看到自己的 MCP 资产后，需要知道"怎么把它插到我的小程序/Agent 里"。新建一个接入指引页面。

#### 怎么干

**步骤 1**：为每个 published 状态的 MCP 资产生成接入指引

指引内容：
```
┌────────────────────────────────────────────────────┐
│  工单查询 MCP - 接入指南                              │
│                                                    │
│  ① MCP Server 地址                                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ https://api.mcpforge.io/mcp/work-orders     │  [复制] │
│  └─────────────────────────────────────────────┘   │
│                                                    │
│  ② 鉴权方式：OAuth 2.0                              │
│  Client ID: forge_hzm_xxx                          │
│  Client Secret: [申请重置]                          │
│                                                    │
│  ③ 支持的工具列表                                    │
│  • work_order_lookup(order_id) - 工单查询           │
│                                                    │
│  ④ 快速接入代码（复制即用）                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ const client = new MCPClient({              │   │
│  │   serverUrl: "https://...",                 │   │
│  │   auth: { type: "oauth", ... }              │   │
│  │ });                                          │   │
│  │ const result = await client.callTool({       │   │
│  │   name: "work_order_lookup",                │   │
│  │   arguments: { order_id: "WO20260709001" }  │   │
│  │ });                                          │   │
│  └─────────────────────────────────────────────┘   │
│                                                    │
│  ⑤ 一键下载 MCP 配置包                               │
│  [下载 mcp-config-v0.8.0.json]                     │
└────────────────────────────────────────────────────┘
```

**步骤 2**：后端新增 API

```javascript
GET /api/customer/assets/:id/access-guide    // 返回接入指引数据
```

**步骤 3**：前端在客户首页的资产卡片上增加"查看接入指南"按钮

#### 产出

- MCP 接入指引页（含地址、鉴权、工具列表、代码示例、下载配置包）
- 后端 access-guide API

#### 验收标准

1. 客户点击资产卡片的"查看接入指南" → 看到完整的接入步骤
2. 可以复制 MCP Server 地址
3. 可以复制快速接入代码
4. 可以下载 MCP 配置包（复用阶段一的交付物下载）

---

### 任务 2.3：客户侧调用统计看板

#### 干什么

当前"使用统计"页面对客户开放，但展示方式和 admin 一样（大表格 + 筛选器）。为客户角色做一个简化的调用看板。

#### 怎么干

**步骤 1**：客户侧使用统计改为看板式（图表优先）

看板内容：
- 顶部 4 个指标卡：本月调用次数 / 平均延迟 / 成功率 / Token 消耗
- 中部折线图：近 30 天每日调用量趋势（按 MCP 资产分色）
- 下部调用记录列表（简化版，只显示时间 / 工具名 / 状态 / 延迟）

**步骤 2**：用前端原生 Canvas 或 SVG 画简单折线图（不引入 Chart.js 等额外依赖）

**步骤 3**：后端新增客户侧聚合 API

```javascript
GET /api/customer/usage/trends    // 返回近 30 天每日调用量 + token 消耗
```

#### 产出

- 客户侧看板式使用统计（指标卡 + 折线图 + 记录列表）
- 后端趋势聚合 API

#### 验收标准

1. 客户登录 → 使用统计 → 看到指标卡 + 折线图 + 记录列表
2. 折线图展示近 30 天趋势，按 MCP 资产分色
3. 不需要筛选器（客户只有自己的数据，不需要筛选客户/项目）

---

### 任务 2.4：客户侧账单详情

#### 干什么

当前计费管理对客户开放，但只展示账单列表。为客户做一个更清晰的账单视图。

#### 怎么干

**步骤 1**：客户侧账单页面分为两个区域

- **当期账单摘要**：本月费用总额 / 调用量 / 超量费用 / 状态（待付/已付）
- **历史账单列表**：按月展示，可展开查看明细

**步骤 2**：新增"充值/续费"入口（UI 占位，不需要真实支付）

```javascript
// 按钮点击后弹出提示："请联系您的客户经理进行续费"
```

#### 产出

- 客户侧账单页面（摘要 + 历史）
- 充值/续费入口（UI 占位）

#### 验收标准

1. 客户登录 → 账单管理 → 看到当期账单摘要
2. 历史账单可展开查看明细
3. 有"续费"按钮（点击后提示联系客户经理）

---

### 阶段二总验收

用 hzm（华智制造工程师）登录：

1. ✅ 首页看到"我的 MCP 资产"（2 个资产卡片）
2. ✅ 点"查看接入指南" → 看到完整的 MCP 接入步骤和代码
3. ✅ 点"调用统计" → 看到看板式统计（指标卡 + 折线图）
4. ✅ 点"账单管理" → 看到当期账单和历史明细
5. ✅ 点"交付物下载" → 能下载该项目的 MCP 配置包
6. ✅ 全程看不到其他客户的数据
7. ✅ 全程不需要理解"项目工作台""网关与治理"等运营概念

---

## 阶段三：生成流程可视化（目标：甲方看到"你是怎么把我的系统变成 MCP 的"）

**阶段目标**：让甲方理解从"数据源接入"到"MCP 发布"的完整生成链路，而不只是看到"已经生成好了"。

**预计周期**：3-4 周

---

### 任务 3.1：数据源 → OpenAPI 描述的可视化

#### 干什么

在"MCP 工厂"模块中，展示每个数据源的接口是如何被解析成 OpenAPI 描述的。

#### 怎么干

**步骤 1**：新建 `platform_openapi_specs` 表，存储每个数据源生成的 OpenAPI 描述

```sql
CREATE TABLE IF NOT EXISTS platform_openapi_specs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,        -- 关联数据源
  spec TEXT NOT NULL,             -- OpenAPI 3.0 JSON
  generated_at TEXT DEFAULT (datetime('now'))
);
```

**步骤 2**：为 seed 数据中的每个数据源预置一份 OpenAPI JSON（不需要真实 AI 识别，预置即可）

例如华智制造的 MES 工单接口：
```json
{
  "openapi": "3.0.0",
  "info": { "title": "MES 工单接口", "version": "1.0.0" },
  "paths": {
    "/api/work-orders/{id}": {
      "get": {
        "summary": "查询工单详情",
        "parameters": [{
          "name": "id", "in": "path", "required": true,
          "schema": { "type": "string" },
          "description": "工单编号，如 WO20260709001"
        }],
        "responses": {
          "200": {
            "description": "工单详情",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "order_id": { "type": "string", "description": "工单编号" },
                    "product": { "type": "string", "description": "产品名称" },
                    "status": { "type": "string", "description": "工单状态" },
                    "quantity": { "type": "integer", "description": "生产数量" },
                    "progress": { "type": "number", "description": "完成进度（%）" }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

**步骤 3**：前端在 MCP 工厂模块中，点击数据源 → 展开 OpenAPI 描述视图

用格式化 JSON 展示（语法高亮），让甲方看到"原始接口 → 标准化描述"的转换结果。

#### 产出

- `platform_openapi_specs` 表 + seed 数据（10 个数据源各一份）
- 前端 OpenAPI 可视化展示

#### 验收标准

1. 在 MCP 工厂模块点华智制造的"MES 工单接口" → 看到格式化的 OpenAPI 3.0 描述
2. 描述包含 path、method、parameters、responses，且字段语义清晰

---

### 任务 3.2：OpenAPI → MCP Tool 映射的可视化

#### 干什么

展示 OpenAPI 描述是如何映射成 MCP Tool 的——每个 tool 的 name、description、input_schema。

#### 怎么干

**步骤 1**：前端新建一个"Tool 映射视图"

展示格式：
```
┌────────────────────────────────────────────────────┐
│  MES 工单接口 → MCP Tool 映射                        │
│                                                    │
│  原始接口：GET /api/work-orders/{id}                │
│       ↓ 映射                                        │
│  MCP Tool：work_order_lookup                        │
│  ├─ name: work_order_lookup                         │
│  ├─ description: 根据工单编号查询工单详情              │
│  └─ inputSchema:                                    │
│     {                                               │
│       "type": "object",                             │
│       "properties": {                               │
│         "order_id": {                               │
│           "type": "string",                         │
│           "description": "工单编号"                   │
│         }                                           │
│       },                                            │
│       "required": ["order_id"]                      │
│     }                                               │
│                                                    │
│  公开/内部：内部 MCP                                 │
│  脱敏规则：employee_id → 自动脱敏                    │
└────────────────────────────────────────────────────┘
```

**步骤 2**：从 `platform_mcp_assets` 的 tools 字段（JSON）读取 tool 定义，展示映射关系

#### 产出

- Tool 映射可视化视图
- 展示 OpenAPI path → MCP Tool name 的对应关系

#### 验收标准

1. 在 MCP 工厂模块点一个 MCP 资产 → 看到"原始接口 → Tool 名称 → input_schema"的映射
2. 能看到每个 Tool 的公开/内部分类和脱敏规则

---

### 任务 3.3：安全处理可视化

#### 干什么

展示网关策略中的脱敏规则是如何应用到具体字段上的——让甲方看到"敏感数据怎么被保护的"。

#### 怎么干

**步骤 1**：前端新建一个"安全处理预览"

从 `platform_gateway_policies` 的 `masking_rules` 字段读取脱敏规则，结合 MCP Tool 的返回数据，展示脱敏前后对比：

```
┌────────────────────────────────────────────────────┐
│  安全处理预览（美佳零售 AI 网关策略）                   │
│                                                    │
│  脱敏规则：mobile, member_id, order_id, amount       │
│                                                    │
│  字段脱敏对比：                                       │
│  ┌──────────────┬──────────────┬──────────────┐    │
│  │ 字段名        │ 原始值        │ 脱敏后        │    │
│  ├──────────────┼──────────────┼──────────────┤    │
│  │ mobile       │ 13812345678  │ 138****5678  │    │
│  │ member_id    │ M1000234     │ M1****34     │    │
│  │ order_id     │ ORD202607001 │ ORD****01    │    │
│  │ amount       │ 1280.50      │ ****         │    │
│  └──────────────┴──────────────┴──────────────┘    │
│                                                    │
│  认证模式：API Key + JWT                             │
│  限流：600 rpm / 客户                                │
│  审计：已开启                                        │
└────────────────────────────────────────────────────┘
```

#### 产出

- 安全处理预览组件（脱敏前后对比表）
- 在网关策略页面和 MCP 工厂模块中嵌入

#### 验收标准

1. 在网关与治理页面 → 点一个策略 → 看到脱敏规则的字段级对比
2. 甲方能回答"我的手机号是怎么被保护的"

---

### 任务 3.4：生成流程时间线

#### 干什么

在项目工作台或 MCP 工厂中，为每个 MCP 资产展示一条生成流程时间线：

```
数据源接入 → 接口识别 → OpenAPI 生成 → Tool 映射 → 安全配置 → 沙箱测试 → 灰度发布 → 生产发布
   ✅           ✅           ✅            ✅          ✅          ✅          ⏳           ⬜
 06-28        06-28        06-29        06-29       06-30       07-02       07-05       待定
```

#### 怎么干

**步骤 1**：新建 `platform_asset_timeline` 表

```sql
CREATE TABLE IF NOT EXISTS platform_asset_timeline (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  stage TEXT NOT NULL,        -- source-connected / api-identified / openapi-generated / tool-mapped / security-configured / sandbox-tested / canary-published / production-published
  status TEXT NOT NULL,       -- done / in-progress / pending
  operator TEXT,
  completed_at TEXT,
  notes TEXT
);
```

**步骤 2**：为 seed 数据中每个 MCP 资产预置时间线（published 的资产全部 done，testing 的资产到 sandbox-tested，draft 的资产到 tool-mapped）

**步骤 3**：前端在资产详情或项目工作台中渲染时间线组件

#### 产出

- `platform_asset_timeline` 表 + seed 数据
- 前端时间线组件

#### 验收标准

1. 点华智制造的"工单查询"资产 → 看到 8 步时间线
2. 每步有状态图标（✅完成 / ⏳进行中 / ⬜待处理）和完成日期
3. 时间线进度和资产当前状态一致（testing → 停在"沙箱测试"之后）

---

### 任务 3.5：MCP 工厂主流程页面整合

#### 干什么

把任务 3.1-3.4 的可视化组件整合到一个连贯的"MCP 工厂"主流程页面中。

#### 怎么干

**步骤 1**：MCP 工厂页面改为分步骤引导式

```
步骤 1：选择数据源         → 展示数据源列表
步骤 2：查看接口识别结果     → 展示 OpenAPI 描述（任务 3.1）
步骤 3：确认 Tool 映射      → 展示 Tool 列表 + input_schema（任务 3.2）
步骤 4：配置安全策略        → 展示脱敏预览 + 认证配置（任务 3.3）
步骤 5：沙箱测试            → 触发 simulate-call（阶段一已完成）
步骤 6：发布               → 展示时间线最终步骤（任务 3.4）
```

**步骤 2**：admin 可以点击"下一步"逐步推进（每步的产出物都可见）

**步骤 3**：底部显示完整时间线（任务 3.4）

#### 产出

- MCP 工厂主流程页面（6 步引导 + 每步产出物可视化 + 时间线）

#### 验收标准

1. admin 进入 MCP 工厂 → 看到分步骤引导
2. 每步都能看到具体的产出物（OpenAPI JSON / Tool Schema / 脱敏预览 / 调用结果 / 时间线）
3. 可以通过"下一步"推进流程
4. 甲方看完后能回答："你们是怎么把我的系统变成 MCP 的"——并且对每一步有具体认知

---

### 阶段三总验收

用 admin 登录 → 进入 MCP 工厂：

1. ✅ 选华智制造的"MES 工单接口"数据源
2. ✅ 看到 OpenAPI 描述（格式化 JSON，字段语义清晰）
3. ✅ 看到 Tool 映射（work_order_lookup + input_schema）
4. ✅ 看到安全处理预览（employee_id 字段脱敏前后对比）
5. ✅ 沙箱测试 → 返回工单数据（走真实 MCP 协议）
6. ✅ 看到完整时间线（8 步，每步有状态和日期）
7. ✅ 甲方能说清楚"从我的接口到 MCP Server 经过了哪些步骤"

---

## 三阶段总结

| 阶段 | 周期 | 核心改变 | 一句话 |
|------|------|---------|--------|
| **一** | 2-3 周 | 真实调用 + 可下载交付物 + 多行业演示 | 从"原型"变"产品" |
| **二** | 2-3 周 | 客户独立首页 + 接入指引 + 客户看板 | 从"admin 工具"变"双角色平台" |
| **三** | 3-4 周 | 生成流程全链路可视化 | 从"变好了"变"看到怎么变的" |

**总计**：7-10 周，5+5+5 = 15 个子任务。每个子任务独立可验收，不依赖前一阶段的全部完成（但推荐按顺序执行）。
