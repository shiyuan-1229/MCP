# 客户交付与运行工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前客户侧从“已交付资产查看页”升级为可完成交付确认、接入、试调和运行观察的客户工作台，并首先在绿城中国两个已发布 MCP 上跑通闭环。

**Architecture:** 保持现有 Node.js + Express + SQLite 与原生 HTML/CSS/ES Modules 架构。后端继续以 `customer_id -> project -> published asset` 作为强制数据边界，新增的客户接口只返回本客户已发布资产；前端复用 `state.js`、`app.js` 与 `renderers.js` 的客户视图模式，不复制管理员页面。P0 只实现总览、资产详情/试调、运行效果和版本信息，工单、通知、成员权限作为后续独立阶段。

**Tech Stack:** Node.js, Express, SQLite (`better-sqlite3`), 原生 HTML/CSS/ES Modules, Node.js `assert` 测试。

---

## 产品定位

客户侧服务于三类人：业务负责人、技术接入人、财务/只读查看人。它必须让客户在不进入管理员流程的情况下回答四个问题：

1. 已交付哪些 MCP，当前版本和状态是什么？
2. 我如何接入、如何验证一个 MCP 能用？
3. 调用是否稳定，异常来自哪里？
4. 有版本变化、交付材料或待处理动作时，我该做什么？

当前客户导航包含 AI 需求生成、我的 MCP 资产、调用统计、账单管理、交付物下载和接入配置。P0 将“AI 需求生成 MCP”从主导航降级为总览和资产中心中的“发起新需求”操作入口；将接入、版本和试调聚合到资产详情，避免客户在多个页面之间反复寻找同一 MCP 的信息。

## P0 信息架构

```text
交付总览
  ├─ 待处理事项：待接入、待确认版本、异常调用
  ├─ 已交付 MCP：状态、版本、负责人、最近调用质量
  └─ 快捷操作：查看资产、下载交付物、发起新需求

MCP 服务中心
  ├─ 我的 MCP 资产：仅已发布资产
  └─ 资产详情：能力、Tool、接入说明、版本记录、在线试调、最近调用

运行与效果
  ├─ 调用趋势、成功率、延迟、异常原因
  └─ Trace 明细与关联资产详情

交付与支持
  └─ 配置包、测试报告、运行说明、后续工单入口（P1）

成本与权限
  └─ 账单、额度、成员角色与密钥管理（P2）
```

## 范围边界

### P0 包含

- 新增客户交付总览页，聚合已发布 MCP、待处理事项、交付物和调用健康度。
- 为客户资产增加详情抽屉或详情页，统一展示接入、版本、Tool、运行和交付信息。
- 新增受客户范围限制的在线试调接口和 UI，写入可审计的调用记录。
- 将调用统计升级为可定位异常的运行效果页。
- 在绿城中国的 `mcp_lvcheng_member_profile` 与 `mcp_lvcheng_order_journey` 上验证完整流程。

### P0 不包含

- 客户成员管理、细粒度客户内部角色、API Key 自助创建。
- 工单系统、消息中心、邮件或企业微信推送。
- 自动计费、配额预警和成本分摊。
- 直接调用客户真实生产系统。在线试调仅调用当前受控 MCP Runtime 或现有模拟调用逻辑。

这些内容分别在 P1 和 P2 以独立计划实施，避免把权限、通知和财务领域与客户工作台首版耦合。

## 文件结构

### 修改文件

- `mcp/poc/server/server.js`
  新增客户总览、资产详情和受限试调接口；复用 `requireAuth`、`scopedProjects`、`scopedAssets`、调用事件表和现有 MCP Runtime 调用能力。
- `mcp/poc/admin/index.html`
  新增 `customer-overview` 页面、资产详情抽屉、在线试调区域和运行异常筛选容器。
- `mcp/poc/admin/assets/app.js`
  在客户登录后的 `loadAll()` 中加载总览和详情数据；提交试调请求并在成功后刷新运行数据。
- `mcp/poc/admin/assets/modules/state.js`
  增加客户总览、当前资产详情、试调结果和运行筛选状态；调整客户导航顺序。
- `mcp/poc/admin/assets/modules/renderers.js`
  新增总览、资产详情、试调结果和异常观察渲染函数；继续使用 `text()`、`badge()`、`renderSimpleRows()` 防止未转义内容进入 DOM。
- `mcp/poc/admin/assets/styles.css`
  增加客户总览行动区、资产详情抽屉、试调结果和移动端单列布局，复用现有语义色与表格样式。

### 新增文件

- `mcp/poc/admin/tests/customer-overview-layout.test.mjs`
  校验总览、待办、资产健康卡和快捷操作容器存在，且总览为客户默认落地页。
- `mcp/poc/admin/tests/customer-asset-detail-flow.test.mjs`
  校验资产详情、试调入口、版本记录和访问指引渲染链路存在。
- `mcp/poc/admin/tests/customer-trial-scope.test.mjs`
  校验客户试调接口只接受已发布且属于当前客户项目的 MCP。

## API 契约

### `GET /api/customer/overview`

仅允许 `role === 'customer'` 访问。返回当前客户已发布 MCP、待处理事项、最近交付物、调用健康摘要和最近发布记录。

```js
{
  customer: { id: 'cust_lvcheng', name: '绿城中国' },
  assets: [{
    id: 'mcp_lvcheng_member_profile',
    name: '绿城会员画像查询 MCP',
    capability: '会员画像查询',
    version: 'v1.0.0',
    status: 'published',
    success_rate: 100,
    avg_latency_ms: 196,
    latest_release_at: '2026-07-13 09:30:00'
  }],
  action_items: [{
    type: 'delivery',
    asset_id: 'mcp_lvcheng_member_profile',
    title: '下载会员画像 MCP 配置包',
    priority: 'normal'
  }],
  recent_deliverables: [],
  release_updates: []
}
```

### `GET /api/customer/assets/:id`

返回一个已发布且属于当前客户项目的 MCP 详情。详情包含资产、发布版本、访问配置、可下载交付物、最近 10 条调用事件和 Tool 名称。任何不存在、未发布或跨客户资产都返回 `404`，避免泄露资产存在性。

### `POST /api/customer/assets/:id/trial`

接收可选的演示参数，调用当前已发布资产的受控 Runtime 或模拟调用逻辑。后端必须：

1. 使用 `scopedAssets(req)` 找到资产，并确认 `status === 'published'`。
2. 拒绝跨客户、未发布或不存在资产，返回 `404`。
3. 只允许白名单参数，例如 `vip_code`、`order_id`，忽略其他字段。
4. 生成 `trace_id`，写入 `platform_call_events`，并返回状态、耗时、结果摘要和 Trace ID。
5. 不返回 `api_key`、证书、完整 Webhook 地址或管理员运行时配置。

## 实施任务

### Task 1: 定义客户总览数据和租户范围测试

**Files:**
- Create: `mcp/poc/admin/tests/customer-trial-scope.test.mjs`
- Modify: `mcp/poc/server/server.js`

- [ ] **Step 1: 编写客户试调范围失败测试**

```js
assert.match(serverSource, /app\.post\("\/api\/customer\/assets\/:id\/trial", requireAuth/u);
assert.match(serverSource, /scopedAssets\(req\)\.find\(asset => asset\.id === req\.params\.id && asset\.status === "published"\)/u);
assert.match(serverSource, /return res\.status\(404\)\.json\(\{ error: "asset not found" \}\);/u);
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test mcp/poc/admin/tests/customer-trial-scope.test.mjs`

Expected: FAIL，提示客户试调路由或发布范围校验尚不存在。

- [ ] **Step 3: 新增总览聚合函数**

在 `server.js` 中新增 `buildCustomerOverview(req)`。它从 `scopedAssets(req)` 过滤 `published` 资产，按资产 ID 汇总 `platform_call_events` 的成功率和平均耗时，读取对应的 `platform_mcp_releases` 与交付物。不要在浏览器端计算跨项目数据。

```js
function buildCustomerOverview(req) {
  const assets = scopedAssets(req).filter(asset => asset.status === 'published');
  return {
    customer: scopedCustomer(req),
    assets: assets.map(asset => buildCustomerAssetHealth(asset)),
    action_items: buildCustomerActionItems(req, assets),
    recent_deliverables: scopedDeliverables(req).slice(0, 5),
    release_updates: buildCustomerReleaseUpdates(assets)
  };
}
```

- [ ] **Step 4: 新增客户总览和试调路由**

```js
app.get('/api/customer/overview', requireAuth, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ error: 'customer role required' });
  res.json(buildCustomerOverview(req));
});

app.post('/api/customer/assets/:id/trial', requireAuth, async (req, res) => {
  const asset = scopedAssets(req).find(asset => asset.id === req.params.id && asset.status === 'published');
  if (!asset) return res.status(404).json({ error: 'asset not found' });
  const result = await runCustomerTrial(asset, pickTrialParams(req.body || {}), req.user);
  res.json(result);
});
```

`runCustomerTrial()` 必须写入调用事件并返回 `trace_id`。它只使用资产公开的 Tool 与模拟/受控 Runtime，不读取访问配置中的凭据。

- [ ] **Step 5: 运行范围测试**

Run: `node --test mcp/poc/admin/tests/customer-trial-scope.test.mjs`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add mcp/poc/server/server.js mcp/poc/admin/tests/customer-trial-scope.test.mjs
git commit -m "feat: add scoped customer overview and trial API"
```

### Task 2: 建立客户总览页面和默认导航

**Files:**
- Create: `mcp/poc/admin/tests/customer-overview-layout.test.mjs`
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/modules/state.js`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/styles.css`

- [ ] **Step 1: 编写总览布局失败测试**

```js
for (const id of ['customer-overview', 'customerOverviewActions', 'customerOverviewAssets', 'customerOverviewReleases']) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}
assert.match(stateSource, /id: 'customer-overview', label: '交付总览'/u);
assert.match(appSource, /api\('\/api\/customer\/overview'\)/u);
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test mcp/poc/admin/tests/customer-overview-layout.test.mjs`

Expected: FAIL，提示总览容器、导航项或数据加载缺失。

- [ ] **Step 3: 调整客户导航与默认页**

在 `customerNavItems` 的首项增加 `customer-overview`，并在 `getDefaultPageForRole()` 中让客户默认落地到该页面。将“AI 需求生成 MCP”保留为页面内操作入口，不再放在客户导航的第一位。

- [ ] **Step 4: 增加总览 HTML 与数据状态**

总览页必须包含待处理事项、资产健康概览、版本更新与三个快捷操作容器：查看资产、下载交付物、发起新需求。`state` 增加 `customerOverview`，`loadAll()` 增加 `/api/customer/overview` 并在成功后调用 `renderCustomerOverview()`。

- [ ] **Step 5: 渲染行动优先的总览**

`renderCustomerOverview()` 第一屏按下列顺序渲染：待处理事项、已交付 MCP 健康状态、最近版本、快捷操作。每个资产卡必须显示名称、版本、状态、成功率、平均延迟以及“查看详情”按钮；无资产时显示“当前没有已发布 MCP，请联系交付负责人确认发布状态”。

- [ ] **Step 6: 完成响应式样式**

桌面端资产健康卡采用自适应网格；小于 `760px` 时切为单列。状态颜色只使用现有 `--success`、`--warning`、`--danger`、`--info` 语义变量，保持当前克制的控制台视觉。

- [ ] **Step 7: 运行总览测试**

Run: `node --test mcp/poc/admin/tests/customer-overview-layout.test.mjs mcp/poc/admin/tests/customer-pages.test.mjs`

Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add mcp/poc/admin/index.html mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/state.js mcp/poc/admin/assets/modules/renderers.js mcp/poc/admin/assets/styles.css mcp/poc/admin/tests/customer-overview-layout.test.mjs
git commit -m "feat: add customer delivery overview"
```

### Task 3: 统一 MCP 资产详情、接入和版本信息

**Files:**
- Create: `mcp/poc/admin/tests/customer-asset-detail-flow.test.mjs`
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/state.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/styles.css`

- [ ] **Step 1: 编写资产详情失败测试**

```js
assert.match(html, /id="customerAssetDrawer"/u);
assert.match(html, /id="customerAssetTrialForm"/u);
assert.match(renderers, /function renderCustomerAssetDetail\(\)/u);
assert.match(appSource, /\/api\/customer\/assets\/\$\{assetId\}/u);
assert.match(serverSource, /app\.get\("\/api\/customer\/assets\/:id", requireAuth/u);
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test mcp/poc/admin/tests/customer-asset-detail-flow.test.mjs`

Expected: FAIL，提示详情抽屉、详情接口或渲染函数缺失。

- [ ] **Step 3: 新增受限资产详情接口**

详情接口使用当前用户项目范围查询资产、版本、交付物、访问指引和最近调用。返回字段必须使用下列结构：

```js
{
  asset: { id, name, capability, version, status, tools },
  releases: [{ version, released_at, notes }],
  access: { type, endpoint, scope, environment, expires_at },
  deliverables: [{ id, name, type, status, updated_at }],
  recent_events: [{ trace_id, status, latency_ms, business_result, created_at }]
}
```

- [ ] **Step 4: 在资产中心增加详情入口**

每个客户资产卡保留“查看接入指引”，并新增“查看服务详情”。点击后调用详情接口，打开抽屉。抽屉按“服务能力、Tool、接入、版本、最近调用、交付物、在线试调”顺序展示，避免把 API Key 或证书传给浏览器。

- [ ] **Step 5: 增加版本差异的可读表达**

版本区显示版本号、发布时间、发布说明；如果只有一个版本，显示“当前为首个已发布版本”。不要伪造不存在的 diff 数据；真正字段级变更在 P1 的版本与变更计划中处理。

- [ ] **Step 6: 运行详情测试**

Run: `node --test mcp/poc/admin/tests/customer-asset-detail-flow.test.mjs mcp/poc/admin/tests/customer-visibility.test.mjs`

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add mcp/poc/server/server.js mcp/poc/admin/index.html mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/state.js mcp/poc/admin/assets/modules/renderers.js mcp/poc/admin/assets/styles.css mcp/poc/admin/tests/customer-asset-detail-flow.test.mjs
git commit -m "feat: add customer MCP asset detail workspace"
```

### Task 4: 实现客户在线试调与可追溯调用记录

**Files:**
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/styles.css`
- Test: `mcp/poc/admin/tests/customer-trial-scope.test.mjs`
- Test: `mcp/poc/admin/tests/customer-usage-line-chart.test.mjs`

- [ ] **Step 1: 扩展失败测试，锁定试调审计结果**

```js
assert.match(serverSource, /const traceId = makeId\("trace"\);/u);
assert.match(serverSource, /INSERT INTO platform_call_events/u);
assert.match(serverSource, /trace_id: traceId/u);
assert.match(appSource, /\/api\/customer\/assets\/\$\{assetId\}\/trial/u);
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test mcp/poc/admin/tests/customer-trial-scope.test.mjs`

Expected: FAIL，提示试调未生成 Trace 或未写入调用记录。

- [ ] **Step 3: 仅接受白名单试调参数**

```js
function pickTrialParams(input) {
  return {
    vip_code: String(input.vip_code || '').slice(0, 64),
    order_id: String(input.order_id || '').slice(0, 64)
  };
}
```

根据资产 Tool 名称显示对应输入框。会员画像 MCP 只显示 `vip_code`，订单旅程 MCP 只显示 `order_id`；其他资产只提供“使用示例参数”按钮，不允许任意 JSON 输入。

- [ ] **Step 4: 写入试调调用事件并返回可读结果**

结果区显示状态、耗时、Trace ID 和脱敏摘要。失败时保留 Trace ID 并提示“请将 Trace ID 提交给交付负责人”，不得把后端异常堆栈直接展示给客户。

- [ ] **Step 5: 成功后刷新总览和运行统计**

试调成功或失败后重新请求 `/api/customer/overview`、`/api/customer/usage/trends` 与当前资产详情，使总览、趋势和最近调用同步更新。

- [ ] **Step 6: 运行试调与调用回归测试**

Run: `node --test mcp/poc/admin/tests/customer-trial-scope.test.mjs mcp/poc/admin/tests/customer-usage-line-chart.test.mjs`

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add mcp/poc/server/server.js mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/renderers.js mcp/poc/admin/assets/styles.css mcp/poc/admin/tests/customer-trial-scope.test.mjs
git commit -m "feat: add auditable customer MCP trial"
```

### Task 5: 将调用统计升级为运行与效果页面

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/styles.css`
- Test: `mcp/poc/admin/tests/customer-pages.test.mjs`
- Test: `mcp/poc/admin/tests/customer-usage-line-chart.test.mjs`

- [ ] **Step 1: 编写失败测试，锁定异常观察区**

```js
assert.match(html, /id="customerUsageExceptions"/u);
assert.match(renderers, /customerUsageExceptions/u);
assert.match(renderers, /trace_id/u);
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test mcp/poc/admin/tests/customer-pages.test.mjs mcp/poc/admin/tests/customer-usage-line-chart.test.mjs`

Expected: FAIL，提示异常观察容器或 Trace 展示缺失。

- [ ] **Step 3: 增加异常观察区域**

在趋势图下方增加“调用观察”面板：显示成功率、平均延迟、异常数量和最近异常列表。异常列表包含时间、资产、状态、Trace ID 和结果摘要；点击资产名打开对应资产详情抽屉。

- [ ] **Step 4: 增加空状态和运行状态文案**

无调用记录时显示“尚未产生调用记录。可在 MCP 服务中心使用在线试调验证接入。”；无异常时显示“近期调用稳定，暂无异常记录。”。

- [ ] **Step 5: 运行调用页面测试**

Run: `node --test mcp/poc/admin/tests/customer-pages.test.mjs mcp/poc/admin/tests/customer-usage-line-chart.test.mjs`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add mcp/poc/admin/index.html mcp/poc/admin/assets/modules/renderers.js mcp/poc/admin/assets/styles.css mcp/poc/admin/tests/customer-pages.test.mjs
git commit -m "feat: surface customer MCP runtime exceptions"
```

### Task 6: 绿城验收、权限回归与上线验证

**Files:**
- Modify: `mcp/poc/admin/tests/lvcheng-customer-regression.test.mjs`
- Test: `mcp/poc/admin/tests/customer-login-flow.test.mjs`
- Test: `mcp/poc/admin/tests/customer-visibility.test.mjs`
- Test: `mcp/poc/admin/tests/deliverable-download.test.mjs`

- [ ] **Step 1: 增加绿城验收断言**

```js
assert.match(serverSource, /mcp_lvcheng_member_profile/u);
assert.match(serverSource, /mcp_lvcheng_order_journey/u);
assert.match(serverSource, /\/api\/customer\/overview/u);
assert.match(serverSource, /\/api\/customer\/assets\/:id\/trial/u);
```

- [ ] **Step 2: 验证绿城登录与接口范围**

Run:

```powershell
$login = Invoke-RestMethod -Uri 'http://127.0.0.1:3100/auth/login' -Method Post -ContentType 'application/json' -Body (@{ username = 'lvcheng'; password = 'lv2026' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod -Uri 'http://127.0.0.1:3100/api/customer/overview' -Headers $headers
```

Expected: 返回 `绿城中国`、两个已发布 MCP，且不包含其他客户资产。

- [ ] **Step 3: 验证试调写入调用记录**

使用绿城令牌调用会员画像 MCP 试调接口，记录返回的 `trace_id`；随后请求 `/api/platform/call-events`，断言该 Trace ID 只属于绿城资产。

- [ ] **Step 4: 运行完整客户回归**

Run:

```bash
node --test mcp/poc/admin/tests/admin-login-smoke.test.mjs mcp/poc/admin/tests/customer-login-flow.test.mjs mcp/poc/admin/tests/customer-pages.test.mjs mcp/poc/admin/tests/customer-visibility.test.mjs mcp/poc/admin/tests/customer-overview-layout.test.mjs mcp/poc/admin/tests/customer-asset-detail-flow.test.mjs mcp/poc/admin/tests/customer-trial-scope.test.mjs mcp/poc/admin/tests/lvcheng-customer-regression.test.mjs mcp/poc/admin/tests/deliverable-download.test.mjs
```

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add mcp/poc/admin/tests/lvcheng-customer-regression.test.mjs
git commit -m "test: verify Lvcheng customer delivery workspace"
```

## 后续路线图

### P1: 版本与变更、交付与支持

- 发布变更中心：版本差异、影响资产、客户确认、回滚申请。
- 支持工单：从异常 Trace 或交付物直接发起，管理员和客户共享处理状态。
- 通知中心：发布、异常、交付完成和工单状态变更的站内通知。

P1 需要新建 `customer_support_tickets`、`customer_notifications` 两张表，并分别由独立计划实现数据模型、权限规则、管理员工作台和客户视图。

### P2: 成本、成员与自助权限

- 客户成员、业务负责人/技术接入人/财务查看人/只读成员四种角色。
- API Key 生命周期、密钥轮换和审计导出。
- 额度、成本分摊、预算阈值和费用预警。

P2 需要扩展 `platform_users` 的客户内部角色，并引入不可逆权限变更的审计记录；在 P0 客户行为稳定后再实施。

## 验收标准

- 绿城客户登录后默认进入交付总览，能看到两个已发布 MCP、其版本和近期运行状态。
- 客户只能查看、试调和下载自己项目下的已发布 MCP；跨客户和未发布资产均返回 `404`。
- 每次在线试调生成 Trace ID 并进入调用统计，客户可从运行与效果页追溯到资产详情。
- 资产详情不泄露 API Key、证书、完整 Webhook 或管理员 Runtime 配置。
- 桌面和移动端均可完成查看资产、打开详情、发起试调、查看 Trace 和下载交付物。
- 现有管理员登录、客户登录、客户可见性和交付物下载测试无回归。

## 计划自检

- P0 覆盖了客户最关键的“看交付、做接入、可试调、能观测”闭环。
- 每个新增客户接口都有明确租户范围和公开数据边界。
- 每个实施任务均以失败测试开始，并在实现后运行针对性回归。
- P1 与 P2 的工单、通知、成员和财务能力已明确拆分，避免首版扩大范围。