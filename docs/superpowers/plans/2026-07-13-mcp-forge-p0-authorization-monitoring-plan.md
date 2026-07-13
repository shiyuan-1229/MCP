# MCP Forge P0 凭证授权与调用监控页面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 MCP Forge 管理后台中补齐两个清晰的 P0 页面，让管理员能够先处理凭证与授权阻断，再定位调用异常，形成“可授权、可调用、可诊断”的 POC 闭环。

**Architecture:** 不新建数据模型，不重写后端链路。将现有 `治理与统计` 中的接入配置、健康检查、变更记录，以及 `设置` 中的 API Key 管理重新组织为“凭证与授权中心”；将现有调用统计和调用详情重新组织为“调用监控与诊断”。两个页面通过当前页面状态、筛选条件和详情抽屉互相跳转。

**Tech Stack:** 现有原生 HTML、CSS、ES Modules、Express API、Node.js 静态结构测试；复用 `state.js`、`renderers.js`、`app.js` 和现有 API，不引入新的前端框架或图表依赖。

---

## 1. POC 范围与成功标准

### 1.1 本轮要解决的问题

- 审核通过后，管理员能一眼知道哪些凭证、权限或接入配置阻断了调用。
- 调用失败后，管理员能从错误事件直接跳到对应凭证或授权项。
- 管理员不需要在“治理与统计”“设置”“测试发布”之间手工寻找同一条线索。
- 页面默认只展示当前动作必须的信息，详细字段通过详情抽屉查看。

### 1.2 POC 不做的内容

- 不接真实密钥托管、轮换、审批流或第三方 OAuth 授权。
- 不新建复杂的实时监控、趋势图、告警编排和计费系统。
- 不实现多租户权限模型扩展；继续使用当前 `admin` / `customer` 角色控制。
- 不删除后端已有 API；只调整页面入口、展示层和交互层。

### 1.3 成功标准

- 管理员从一个 MCP 资产进入“凭证与授权中心”，3 秒内能看到最先处理的阻断项。
- 点击调用监控中的一条 `401`、超时或字段校验失败事件，能够进入详情并获得明确的下一步动作。
- 凭证测试失败后，能够回到调用监控查看关联 Trace ID 和最近异常。
- 页面刷新后，已有接入配置、API Key、健康检查、调用事件和详情抽屉仍可正常展示。
- 现有导航、登录、发布、交付和客户侧页面测试不回归。

## 2. 页面结构决策

### 2.1 新增两个管理员一级入口

在现有管理员导航中新增两个页面 ID：

| 页面 ID | 页面名称 | 放置位置 | 主要数据 |
|---|---|---|---|
| `authorization` | 凭证与授权 | 测试发布之后 | `state.access`、`state.accessHealth`、`state.accessAudit`、API Key 数据 |
| `monitoring` | 调用监控 | 凭证与授权之后 | `state.events`、`state.assets`、`state.projects` |

现有 `governance` 保留网关策略、审计和复盘能力；现有 `settings` 保留客户、项目、计费和知识库管理。API Key 不再作为设置页的主任务入口，但底层数据和操作函数继续复用。

### 2.2 页面之间的最短闭环

```text
MCP 资产 / 测试发布
        |
        v
凭证与授权中心 -- 测试授权 --> 调用监控与诊断
        ^                         |
        |                         v
        +------ 401 / 权限失败 ---+
```

页面默认顺序固定为：

1. 先看当前阻断项。
2. 再看对应的凭证或调用记录。
3. 最后执行测试、查看详情或跳转处理。

## 3. 文件边界

### 3.1 需要修改的文件

- `mcp/poc/admin/index.html`
  - 新增 `authorization` 和 `monitoring` 两个页面容器。
  - 将现有接入配置、健康检查、API Key 和调用统计的展示入口迁移到新页面。
  - 为跨页跳转提供稳定的 DOM ID、按钮和筛选控件。
- `mcp/poc/admin/assets/modules/state.js`
  - 增加两个管理员导航项。
  - 增加 `authorizationFilters`、`monitoringFilters` 和当前聚焦对象字段。
  - 保持原有 `access`、`accessHealth`、`accessAudit`、`events` 状态字段不变。
- `mcp/poc/admin/assets/modules/renderers.js`
  - 新增 `renderAuthorizationPage()` 和 `renderMonitoringPage()`。
  - 将现有 `renderAccess()`、`renderApiKeys()`、`renderUsage()` 的展示逻辑拆成可复用的摘要、表格和详情渲染函数。
  - 保留现有 `renderUsageDrawer()` 和接入详情能力，补充跨页动作文案。
- `mcp/poc/admin/assets/app.js`
  - 注册两个页面的刷新和渲染调用。
  - 增加“从异常跳转到授权中心”和“从授权测试跳转到监控”的页面状态切换。
  - 复用现有 `/api/platform/access-configs/:id/test`、凭证撤销和调用详情函数。
- `mcp/poc/admin/assets/styles.css`
  - 增加页面级摘要、阻断提示、异常优先表格、详情抽屉动作和跨页按钮样式。
  - 复用现有 `panel`、`metric-grid`、`badge`、`drawer` 和响应式布局样式。
- `mcp/poc/admin/tests/admin-authorization-monitoring.test.mjs`
  - 新增结构测试，验证导航、页面容器、关键 DOM ID、渲染函数和跨页入口存在。

### 3.2 明确不修改的文件

- `mcp/poc/server/server.js`：本轮复用现有接口，不新增数据库表或服务端路由。
- `mcp/poc/admin/assets/modules/api.js`：现有 API 封装满足页面读取需求。
- `mcp/poc/admin/tests/admin-login-smoke.test.mjs` 等登录与客户侧测试：只作为回归验证，不改测试目标。

## 4. 页面一：凭证与授权中心

### 4.1 页面目标

管理员进入页面后，首先回答三个问题：

- 哪个 MCP 当前不能调用？
- 缺的是哪一项凭证、权限还是接入配置？
- 我现在应该测试、申请、编辑还是跳转到调用监控？

### 4.2 默认视图

默认页面只保留以下区域：

1. **阻断摘要**
   - 待处理授权项数量。
   - 已启用凭证数量。
   - 最近测试失败数量。
   - 生产环境凭证数量仅作为风险提示，不作为主操作。
2. **当前最优先处理**
   - MCP 资产名称。
   - 客户 / 项目。
   - 阻断原因：未授权、凭证过期、健康检查失败或权限范围不足。
   - 明确按钮：`去处理`、`测试接入`。
3. **凭证与接入清单**
   - 凭证名称和脱敏 Key ID。
   - 所属项目和环境。
   - 授权范围。
   - 当前状态。
   - 最近健康检查。
   - 过期时间。
   - 操作：`测试`、`查看`、`撤销`。

### 4.3 二级内容

使用页面内的轻量 Tab 或折叠区域，不在首页同时铺开所有日志：

- **接入验证**：选择接入配置，调用现有测试接口，展示状态码、鉴权结果、延迟、Trace ID 和下一步建议。
- **变更留痕**：展示授权范围、环境、地址等字段的修改前后值和操作人。
- **回调记录**：仅在需要排查 Webhook 时展示，默认不抢占首页视觉位置。

### 4.4 状态与动作规则

| 状态 | 页面表现 | 允许动作 |
|---|---|---|
| `enabled` | 绿色“可用” | 测试、查看、撤销 |
| `disabled` | 灰色“停用” | 查看、重新启用入口保留为 POC 提示 |
| `revoked` | 红色“已撤销” | 查看历史，不允许直接调用 |
| `expired` | 红色“已过期” | 去更新凭证、查看影响范围 |
| 健康检查失败 | 黄色或红色阻断提示 | 查看详情、跳转调用监控 |

### 4.5 POC 示例数据

至少准备三条可区分状态的记录：

- `售后系统 API Key`：测试环境、已绑定、最近检查成功。
- `退款审批权限`：未授权、关联 `refund_confirm` Tool、发布阻断。
- `客户身份字段授权`：待确认、关联 `customer_query` Tool、需要人工复核。

## 5. 页面二：调用监控与诊断

### 5.1 页面目标

管理员进入页面后，首先回答三个问题：

- 最近有没有调用失败？
- 失败发生在哪个 MCP、哪个 Tool、哪个调用方？
- 这是授权问题、输入字段问题、上游接口问题还是响应超时？

### 5.2 默认视图

默认页面按“异常优先”组织：

1. **运行摘要**
   - 总调用量。
   - 成功率。
   - 异常调用数。
   - 平均耗时。
2. **异常筛选条**
   - MCP 资产。
   - Tool。
   - 状态：成功、授权失败、字段校验失败、超时、上游错误。
   - 时间范围：最近 24 小时、最近 7 天。
3. **最近异常表**
   - 时间。
   - MCP / 项目。
   - Tool。
   - 调用方。
   - 错误摘要。
   - 状态。
   - 耗时。
   - Trace ID。
   - 操作：`诊断`。
4. **最近成功调用**
   - 仅展示最近 5 条，用于证明人工修正后的 Tool 仍然可用。

### 5.3 诊断详情抽屉

点击一条调用记录后，抽屉只展示排障所需内容：

- 调用概览：时间、MCP、Tool、调用方、状态、耗时、Trace ID。
- 输入摘要：只展示经过脱敏的关键字段，不展示完整凭证或敏感值。
- 响应摘要：状态码、错误类型、业务结果和响应时间。
- Token 信息：输入 Token、输出 Token、总 Token。
- 关联信息：对应项目、发布版本、接入配置和凭证状态。
- 下一步动作：
  - `401 / 403`：跳转“凭证与授权中心”，自动聚焦对应接入项。
  - `400 / 字段校验失败`：跳转 Tool 映射或人工审核页面。
  - `超时 / 5xx`：保留在诊断抽屉，提示检查上游服务和健康状态。

### 5.4 错误分类规则

| 错误类型 | 管理员理解 | 主动作 |
|---|---|---|
| `401` | 凭证缺失或无效 | 去凭证与授权中心 |
| `403` | 凭证存在但权限范围不足 | 去授权范围检查 |
| `400` | Tool 输入字段不符合上游要求 | 去 Tool 映射 / 审核 |
| `timeout` | 上游响应过慢或网络异常 | 查看健康检查 |
| `5xx` | 上游服务异常 | 查看接入状态并记录异常 |
| `success` | 调用链路正常 | 查看结果或继续验证 |

### 5.5 POC 示例数据

至少准备三条异常和两条成功记录：

- `refund_submit`：`401`，可跳转凭证中心。
- `customer_query`：字段校验失败，可跳转 Tool 映射。
- `order_detail`：超时，可查看接入健康详情。
- `order_status`：成功，展示正常响应摘要。
- `refund_request_submit`：成功，证明人工拆分 Tool 后调用正常。

## 6. 共享交互与数据约定

### 6.1 状态字段

在 `state.js` 增加以下字段，默认值必须是空筛选，不影响现有页面：

```js
authorizationFilters: {
  status: 'all',
  environment: 'all',
  projectId: 'all'
},
monitoringFilters: {
  status: 'all',
  assetId: 'all',
  toolName: 'all',
  timeRange: '24h'
},
authorizationFocusId: null,
monitoringFocusId: null
```

### 6.2 跨页跳转约定

统一使用一个页面跳转函数，避免每个按钮自己修改状态：

```js
function navigateToPage(pageId, focus = {}) {
  state.currentPage = pageId;
  if (pageId === 'authorization') state.authorizationFocusId = focus.accessId || null;
  if (pageId === 'monitoring') state.monitoringFocusId = focus.eventId || null;
  renderAll();
}
```

具体行为：

- 监控异常详情的“查看关联凭证”调用 `navigateToPage('authorization', { accessId })`。
- 凭证测试失败的“查看调用异常”调用 `navigateToPage('monitoring', { eventId })`。
- 页面渲染完成后，自动滚动到聚焦行并添加短暂高亮；没有聚焦对象时不高亮任何行。

### 6.3 数据复用

继续使用现有接口：

- `GET /api/platform/access-configs`
- `GET /api/platform/access-configs/health-summary`
- `GET /api/platform/access-configs/audit-summary`
- `GET /api/platform/access-configs/webhook-summary`
- `GET /api/platform/call-events`
- `POST /api/platform/access-configs/:id/test`
- `GET /api/platform/mcp-assets`
- `GET /api/platform/projects`

本轮不添加新的服务端 endpoint。若接口返回空数据，页面必须显示引导性空状态，例如“暂无调用记录，请先到测试发布执行一次沙箱测试”，不能显示空白表格。

## 7. 分阶段实施任务

### Task 1: 固定页面入口与状态边界

**Files:**
- Modify: `mcp/poc/admin/assets/modules/state.js`
- Modify: `mcp/poc/admin/index.html`
- Test: `mcp/poc/admin/tests/admin-authorization-monitoring.test.mjs`

- [ ] 在管理员 `navItems` 中加入 `authorization` 和 `monitoring`，顺序放在 `publish`、`delivery` 之后，`governance`、`settings` 之前。
- [ ] 在 `index.html` 增加两个 `<section class="page">`，分别使用 `id="authorization"` 和 `id="monitoring"`。
- [ ] 为两个页面加入稳定的 `data-title`、`data-eyebrow`、摘要容器、主表格容器和详情抽屉入口。
- [ ] 在 `state.js` 增加第 6 节定义的筛选和聚焦字段。
- [ ] 运行结构测试，确认新导航和新页面容器数量正确。

运行：

```powershell
node mcp/poc/admin/tests/admin-authorization-monitoring.test.mjs
```

预期：

```text
authorization and monitoring structure checks passed
```

### Task 2: 组装凭证与授权中心

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/styles.css`

- [ ] 在 `authorization` 页面完成“阻断摘要 → 当前最优先处理 → 凭证与接入清单”的默认结构。
- [ ] 复用 `state.access` 渲染凭证、接入项、环境、授权范围、状态和过期时间。
- [ ] 复用现有接入测试函数，按钮必须在没有选中配置时保持禁用。
- [ ] 将 API Key 的复制、撤销和脱敏展示放到该页面的接入清单或详情抽屉中，禁止在表格中渲染完整密钥。
- [ ] 将健康检查和变更记录收进二级 Tab 或抽屉，默认只展示健康摘要和最近失败项。
- [ ] 当 `authorizationFocusId` 存在时，自动定位对应行并显示“来自调用异常”的来源提示。
- [ ] 添加空状态、加载状态、测试中状态和测试失败状态文案。

验收重点：

- 点击“测试接入”能触发现有 `/api/platform/access-configs/:id/test`。
- 测试失败后，页面能显示状态码、鉴权结果、延迟和 Trace ID。
- 撤销凭证前有确认提示，撤销后状态立即刷新为不可调用。

### Task 3: 组装调用监控与诊断

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/styles.css`

- [ ] 在 `monitoring` 页面完成“运行摘要 → 异常筛选 → 最近异常 → 最近成功调用”的结构。
- [ ] 复用 `state.events` 计算总调用量、成功率、异常数和平均耗时。
- [ ] 增加状态、资产、Tool 和时间范围筛选，筛选结果必须同步更新摘要和列表。
- [ ] 复用现有调用详情抽屉，补充输入脱敏、响应摘要、Token、发布版本和关联接入项。
- [ ] 为 `401`、`403`、`400`、超时和 `5xx` 使用稳定的错误分类标签和下一步动作。
- [ ] 当 `monitoringFocusId` 存在时，自动定位对应事件并高亮详情。
- [ ] 没有调用记录时，展示“先到测试发布执行沙箱测试”的引导，不显示空白表格。

验收重点：

- 点击异常行的“诊断”能打开详情抽屉。
- 点击 `401 / 403` 的“去处理”能进入凭证与授权中心，并聚焦对应接入项。
- Trace ID 可复制，复制失败时仍有清晰错误提示。
- 敏感字段、API Key 和 Secret 不出现在列表和详情原文中。

### Task 4: 接通两个页面的跨页动作

**Files:**
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/modules/state.js`
- Test: `mcp/poc/admin/tests/admin-authorization-monitoring.test.mjs`

- [ ] 实现统一的 `navigateToPage(pageId, focus)`，所有跨页按钮只调用该函数。
- [ ] 建立事件到接入配置的关联优先级：`access_id` 优先，其次使用事件的 `project_id` 和 `asset_id` 查找接入项。
- [ ] 401 / 403 默认跳到授权中心；400 默认跳到 Tool 映射；超时和 5xx 默认停留在监控详情。
- [ ] 授权测试失败后保留 `eventId` 或 `traceId`，可跳回监控定位最近一次失败调用。
- [ ] 从授权中心回到监控时恢复原筛选条件，不清空用户刚刚选择的时间范围和状态筛选。

### Task 5: 回归测试和 POC 交付检查

**Files:**
- Create: `mcp/poc/admin/tests/admin-authorization-monitoring.test.mjs`
- Modify: `mcp/poc/admin/tests/admin-navigation.test.mjs` only if the existing navigation assertions require the new page IDs

- [ ] 检查 `state.js` 含有 `authorization`、`monitoring` 两个管理员导航项。
- [ ] 检查 `index.html` 含有对应页面、摘要容器、筛选容器、表格容器和详情入口。
- [ ] 检查 `renderers.js` 含有两个页面渲染函数，并且 `renderAll()` 会调用它们。
- [ ] 检查 `app.js` 含有 `/api/platform/access-configs/:id/test`、`/api/platform/call-events` 和统一跨页跳转逻辑。
- [ ] 检查页面不会将 `api_key`、`secret` 或完整凭证值直接插入 HTML。
- [ ] 运行现有导航、登录、安全布局、发布清晰度和治理布局测试。

运行：

```powershell
node mcp/poc/admin/tests/admin-authorization-monitoring.test.mjs
node mcp/poc/admin/tests/admin-navigation.test.mjs
node mcp/poc/admin/tests/admin-login-smoke.test.mjs
node mcp/poc/admin/tests/admin-security-layout.test.mjs
node mcp/poc/admin/tests/admin-publish-clarity.test.mjs
node mcp/poc/admin/tests/governance-layout-clarity.test.mjs
```

预期：所有命令退出码为 `0`，并分别输出对应的 `checks passed` 文案。

## 8. POC 演示脚本

1. 进入“测试发布”，选择一个已通过 Tool 测试的 MCP 资产。
2. 点击“凭证与授权”，展示一个已授权项和一个“退款审批权限未授权”的阻断项。
3. 点击“测试接入”，展示测试成功或失败结果和 Trace ID。
4. 进入“调用监控”，先展示成功率和最近调用，再筛选 `401`。
5. 打开 `refund_submit` 的诊断抽屉，展示错误原因、关联凭证和下一步动作。
6. 点击“去凭证与授权中心”，页面自动聚焦对应授权项。
7. 完成授权状态修正后返回监控，展示一条成功调用，证明闭环完成。

## 9. 自检清单

- [ ] 两个页面的首屏都能直接回答“现在需要做什么”。
- [ ] 凭证中心首屏不展示完整密钥，不把健康日志铺满页面。
- [ ] 监控首屏优先展示异常，不用图表替代具体错误行。
- [ ] 每个异常类型都有明确的下一步动作。
- [ ] 401 / 403、400、超时和 5xx 的处理路径不混淆。
- [ ] 页面空状态、加载状态、失败状态和成功状态都有文案。
- [ ] 现有审核、Tool 映射、MCP 资产、测试发布和客户侧页面仍能进入。
- [ ] 本轮没有引入真实密钥、真实计费或新的后端依赖。

## 10. 推荐提交拆分

```text
feat(admin): add authorization and monitoring navigation
feat(admin): consolidate credential and access center
feat(admin): add call monitoring diagnosis flow
test(admin): cover authorization monitoring pages
```

完成以上四个提交后，再进行一次浏览器级 POC 演示检查，确认页面跳转、筛选、抽屉和错误引导符合“先看阻断、再看详情、最后执行动作”的顺序。
