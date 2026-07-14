# MCP 治理资产流程与演示数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 MCP Forge 收敛为“AI 提议、人工逐关确认、统一门禁发布”的可审计资产链路，并以贯穿式模拟数据展示其业务价值。

**Architecture:** 候选能力、Tool 草稿、MCP 组成确认、MCP 草稿和发布决策各自拥有独立状态与审计记录。所有正式发布请求统一经过候选关联关系与完整门禁检查；管理端以流程步骤、AI/人工差异和可点击演示案例解释每一个人工控制点。

**Tech Stack:** Node.js、Express、SQLite (`better-sqlite3`)、原生 HTML/CSS/ES Modules、Node `assert` 测试。

**Local-only constraint:** 仅在当前工作区修改；不创建提交、不暂存、不推送。

---

## 当前链路与目标链路

当前已具备 `candidate_pending_review -> tool_confirmed -> mcp_draft` 的基础状态，但 Tool 草稿不是独立资产，MCP 组成确认与草稿生成合并，并存在 Release 旧入口绕过门禁的问题。

目标状态机：

```text
资料接入
-> AI 识别结果
-> 候选业务能力
-> 人工初筛
-> 人工确认 Tool 边界
-> Tool 草稿
-> 人工确认 MCP 组成
-> MCP 草稿
-> 发布前验收
-> 正式发布
```

发布必须满足：`manual_screen_decision=approve`、`tool_boundary_status=confirmed`、Tool 草稿存在、`mcp_composition_status=confirmed`、`mcp_draft_status=draft`、所有审核任务关闭、敏感字段/权限审核通过、`acceptance_passed=1`。

## 文件结构

- Modify: `mcp/poc/server/modules/governance/control-flow.mjs`
  - 统一候选、Tool 草稿、MCP 组成与发布就绪状态的纯函数。
- Modify: `mcp/poc/server/modules/governance/repository.mjs`
  - 读写 Tool 草稿、治理决策、候选与 MCP 资产的关联状态。
- Modify: `mcp/poc/server/modules/governance/manual-checks.mjs`
  - 让发布门禁显式验证完整状态机，不再只依赖审核任务和验收。
- Modify: `mcp/poc/server/server.js`
  - 创建 SQLite 表/列、拆分 MCP 确认接口、收口两个发布入口、植入演示数据和查询接口。
- Modify: `mcp/poc/admin/index.html`
  - 增加“治理链路”流程板、Tool 草稿/MCP 组成页面容器与演示数据入口。
- Modify: `mcp/poc/admin/assets/modules/state.js`
  - 保存治理链路、Tool 草稿、MCP 组成、演示数据与发布诊断状态。
- Modify: `mcp/poc/admin/assets/app.js`
  - 加载新接口数据，提交 Tool/MCP 人工确认，处理验收失败的 Trace ID 跳转。
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
  - 渲染步骤状态、AI/人工差异、MCP 组成确认和演示数据业务指标。
- Modify: `mcp/poc/admin/assets/styles.css`
  - 为流程状态、差异对比、风险标记和移动端布局定义样式。
- Modify: `tests/customer-control-flow.test.js`
  - 覆盖 Tool 草稿与 MCP 组成确认的纯状态机。
- Modify: `tests/builder-publish-block.test.js`
  - 覆盖完整发布门禁和旧 Release 发布入口的不可绕过性。
- Create: `tests/governance-demo-data.test.js`
  - 验证演示数据覆盖目标阶段、风险、失败诊断与业务指标。
- Modify: `mcp/poc/admin/tests/tool-to-asset-clarity.test.mjs`
  - 验证管理端包含 Tool 草稿和 AI/人工差异表达。
- Create: `mcp/poc/admin/tests/governance-flow-visibility.test.mjs`
  - 验证流程板、MCP 组成确认、验收 Trace ID 与总览指标表达。

### Task 1: 建立可审计的 Tool 草稿与 MCP 组成状态机

**Files:**
- Modify: `mcp/poc/server/modules/governance/control-flow.mjs`
- Modify: `tests/customer-control-flow.test.js`

- [ ] **Step 1: 写入 Tool 草稿与 MCP 组成确认的失败测试**

在 `tests/customer-control-flow.test.js` 导入以下新函数，并追加断言：

```js
const {
  buildCandidateFromAi,
  canCreateToolDraft,
  buildToolDraft,
  canConfirmMcpComposition,
  confirmMcpComposition,
  canAssembleMcp
} = await import(moduleUrl);

assert.equal(canCreateToolDraft(confirmed), true);
const toolDraft = buildToolDraft(confirmed, { by: '管理员', reason: '订单查询与退款查询权限不同，拆分处理' });
assert.equal(toolDraft.status, 'draft');
assert.equal(toolDraft.source_candidate_id, confirmed.id);
assert.equal(canConfirmMcpComposition({ ...confirmed, tool_draft_id: toolDraft.id }), true);
const composition = confirmMcpComposition({ ...confirmed, tool_draft_id: toolDraft.id }, {
  toolDraftIds: [toolDraft.id],
  reason: '订单查询场景只组合只读 Tool',
  by: '管理员'
});
assert.equal(composition.status, 'confirmed');
assert.equal(canAssembleMcp({ ...confirmed, tool_draft_id: toolDraft.id, mcp_composition_status: 'confirmed' }), true);
```

- [ ] **Step 2: 运行测试确认其因缺少状态机函数而失败**

Run: `node tests/customer-control-flow.test.js`

Expected: FAIL，错误指出 `canCreateToolDraft`、`buildToolDraft` 或 `confirmMcpComposition` 尚未导出。

- [ ] **Step 3: 在纯函数模块中实现状态与草稿构造**

在 `buildCandidateFromAi` 增加以下默认字段：

```js
tool_draft_id: null,
tool_draft_status: 'not_started',
mcp_composition_status: 'not_started',
mcp_composition_reason: null,
mcp_composition_by: null,
mcp_composition_at: null
```

新增函数并使用候选已有的 `human_tools_snapshot`：

```js
export function canCreateToolDraft(candidate = {}) {
  return candidate.manual_screen_decision === 'approve'
    && Number(candidate.human_confirmed) === 1
    && candidate.tool_boundary_status === 'confirmed'
    && Array.isArray(candidate.human_tools_snapshot)
    && candidate.human_tools_snapshot.length > 0
    && !candidate.tool_draft_id;
}

export function buildToolDraft(candidate, { id, by, reason } = {}) {
  if (!canCreateToolDraft(candidate)) throw new Error('Tool 边界尚未人工确认');
  return {
    id,
    source_candidate_id: candidate.id,
    project_id: candidate.project_id,
    name: `${candidate.name} Tool 草稿`,
    status: 'draft',
    tools: candidate.human_tools_snapshot,
    change_reason: reason,
    created_by: by || ''
  };
}
```

`confirmMcpComposition` 必须返回 `status: 'confirmed'`、`tool_draft_ids`、`reason`、`confirmed_by`；`canAssembleMcp` 必须额外要求 `tool_draft_id` 非空和 `mcp_composition_status === 'confirmed'`。

- [ ] **Step 4: 重新运行状态机测试**

Run: `node tests/customer-control-flow.test.js`

Expected: PASS，并证明没有 Tool 草稿或 MCP 组成确认时不能生成 MCP 草稿。

### Task 2: 持久化草稿与决策，并收紧所有发布入口

**Files:**
- Modify: `mcp/poc/server/modules/governance/repository.mjs`
- Modify: `mcp/poc/server/modules/governance/manual-checks.mjs`
- Modify: `mcp/poc/server/server.js`
- Modify: `tests/builder-publish-block.test.js`

- [ ] **Step 1: 写入发布门禁失败测试**

在 `tests/builder-publish-block.test.js` 追加纯门禁测试，要求仅验收通过仍不可发布：

```js
const incomplete = {
  manual_screen_decision: 'approve',
  acceptance_passed: 1,
  tool_boundary_status: 'confirmed',
  tool_draft_id: 'tool_draft_1',
  mcp_composition_status: 'not_started',
  mcp_draft_status: 'not_started'
};
const result = checkPublishGate(incomplete, {});
assert.equal(result.mcp_composition_confirmed, false);
assert.equal(formatPublishGateResult(result).canPublish, false);
```

并对发布路由文本增加断言：`/api/platform/releases/:id/publish` 必须调用统一的 `assertCandidateReadyForPublish`，而不是直接执行 `UPDATE platform_mcp_assets SET status = 'published'`。

- [ ] **Step 2: 运行测试确认新门禁尚未存在**

Run: `node tests/builder-publish-block.test.js`

Expected: FAIL，缺少 `mcp_composition_confirmed` 条件或旧 Release 路由未接入统一门禁。

- [ ] **Step 3: 添加持久化表、列和仓储方法**

在 `server.js` 初始化中创建：

```sql
CREATE TABLE IF NOT EXISTS platform_tool_drafts (
  id TEXT PRIMARY KEY,
  source_candidate_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  tools TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS platform_governance_decisions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  ai_snapshot TEXT,
  human_snapshot TEXT,
  reason TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT DEFAULT (datetime('now'))
);
```

使用 `ensureColumn` 为 `platform_candidate_assets` 增加 `tool_draft_id`、`tool_draft_status`、`mcp_composition_status`、`mcp_composition_reason`、`mcp_composition_by`、`mcp_composition_at`。在 `repository.mjs` 新增 `createToolDraft`、`getToolDraft`、`saveGovernanceDecision`、`getCandidateByMcpId`。

- [ ] **Step 4: 拆分服务端人工动作接口**

保留 `/confirm-tool` 只保存边界；新增：

```text
POST /api/platform/governance/candidates/:id/create-tool-draft
POST /api/platform/governance/candidates/:id/confirm-mcp-composition
POST /api/platform/governance/candidates/:id/assemble-mcp
```

`create-tool-draft` 只在 Tool 边界已确认时创建 `platform_tool_drafts`，并写入 `tool_draft_created` 决策。`confirm-mcp-composition` 必须接收 `tool_draft_ids` 与 `reason`，更新为 `mcp_composition_status='confirmed'`。`assemble-mcp` 仅在 MCP 组成已确认时创建 `platform_mcp_assets.status='draft'`。

- [ ] **Step 5: 实现唯一发布守卫并替换两个入口**

在 `server.js` 定义 `assertCandidateReadyForPublish(candidate)`，逐项调用 `checkPublishGate(candidate, stageSummary)`；在 `manual-checks.mjs` 返回以下条件：

```js
tool_boundary_confirmed: candidate.tool_boundary_status === 'confirmed',
tool_draft_created: Boolean(candidate.tool_draft_id),
mcp_composition_confirmed: candidate.mcp_composition_status === 'confirmed',
mcp_draft_created: candidate.mcp_draft_status === 'draft' && Boolean(candidate.mcp_id)
```

候选发布接口和 `/api/platform/releases/:id/publish` 都必须调用该守卫。Release 发布根据 `release.asset_id` 找回候选；无关联候选的历史 Release 返回 `409 legacy release requires governance migration`。候选发布成功后同步更新其 `platform_mcp_assets.status='published'` 及关联 Release 状态，避免双轨状态不一致。

- [ ] **Step 6: 运行发布门禁测试**

Run: `node tests/builder-publish-block.test.js`

Expected: PASS，确认缺少任一人工门禁时发布失败，旧 Release 入口也不能绕过。

### Task 3: 提供贯穿流程的模拟数据与业务指标

**Files:**
- Modify: `mcp/poc/server/server.js`
- Create: `tests/governance-demo-data.test.js`

- [ ] **Step 1: 写入演示数据失败测试**

创建 `tests/governance-demo-data.test.js`，读取 `server.js` 并断言存在导出的 `GOVERNANCE_DEMO_SCENARIOS`，且数据含有：

```js
assert.equal(GOVERNANCE_DEMO_SCENARIOS.sources.length, 6);
assert.equal(GOVERNANCE_DEMO_SCENARIOS.candidates.length, 12);
assert.equal(GOVERNANCE_DEMO_SCENARIOS.toolDrafts.length, 9);
assert.equal(GOVERNANCE_DEMO_SCENARIOS.mcpDrafts.length, 4);
assert.ok(GOVERNANCE_DEMO_SCENARIOS.acceptanceFailures.some(item => item.status_code && item.trace_id));
assert.deepEqual(GOVERNANCE_DEMO_SCENARIOS.valueMetrics, {
  asset_cycle_days: 2.6,
  risk_items_intercepted: 4,
  reused_assets: 3,
  repeated_work_reduction: 38,
  publishable_mcps: 2
});
```

- [ ] **Step 2: 运行测试确认演示数据尚不存在**

Run: `node tests/governance-demo-data.test.js`

Expected: FAIL，提示 `GOVERNANCE_DEMO_SCENARIOS` 未导出。

- [ ] **Step 3: 定义幂等演示场景与查询接口**

在 `server.js` 导出 `GOVERNANCE_DEMO_SCENARIOS`。数据需覆盖：6 份资料、12 个候选、3 个初筛驳回、4 个敏感字段/写操作高风险项、9 个 Tool 草稿、4 个 MCP 草稿、2 个待发布、1 个验收失败、1 个已发布。

验收失败案例固定字段：

```js
{
  mcp_id: 'demo_mcp_refund_write',
  check: '安全检测',
  status: 'failed',
  status_code: 403,
  trace_id: 'trace_demo_refund_403',
  monitor_path: '/admin?view=usage&trace=trace_demo_refund_403'
}
```

新增管理员接口 `GET /api/platform/governance/demo-overview` 返回场景、统计和每个案例的导航目标。种子逻辑必须按固定 `demo_` ID 使用 `INSERT OR IGNORE`，多次启动不会重复插入。

- [ ] **Step 4: 运行演示数据测试**

Run: `node tests/governance-demo-data.test.js`

Expected: PASS，场景数量、失败诊断和五项价值指标准确。

### Task 4: 在管理端呈现“AI 建议到人工发布”的可视化链路

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/modules/state.js`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/styles.css`
- Modify: `mcp/poc/admin/tests/tool-to-asset-clarity.test.mjs`
- Create: `mcp/poc/admin/tests/governance-flow-visibility.test.mjs`

- [ ] **Step 1: 写入管理端可视化失败测试**

在新测试中读取 HTML 与 renderer 文件，要求以下文本和容器存在：

```js
for (const token of ['治理链路', 'Tool 草稿', '人工确认 MCP 组成', '发布前验收', '正式发布']) {
  assert.match(html + renderers, new RegExp(token, 'u'));
}
for (const token of ['governanceFlowBoard', 'toolDraftList', 'mcpCompositionList', 'trace_id', 'asset_cycle_days']) {
  assert.match(html + renderers, new RegExp(token, 'u'));
}
```

在 `tool-to-asset-clarity.test.mjs` 增加 `AI 原建议`、`人工修改内容`、`最终 Tool 边界` 和 `Tool 草稿` 字样断言。

- [ ] **Step 2: 运行前端测试确认其失败**

Run: `node mcp/poc/admin/tests/tool-to-asset-clarity.test.mjs; node mcp/poc/admin/tests/governance-flow-visibility.test.mjs`

Expected: FAIL，缺少 Tool 草稿/MCP 组成流程容器或渲染标记。

- [ ] **Step 3: 增加总览流程板与业务价值卡**

在 `index.html` 总览页添加 `#governanceFlowBoard` 和 `#governanceValueBoard`。`renderers.js` 必须按以下顺序渲染步骤：

```text
资料接入 -> AI 识别结果 -> 候选业务能力 -> 人工初筛 -> Tool 边界确认
-> Tool 草稿 -> MCP 组成确认 -> MCP 草稿 -> 发布前验收 -> 正式发布
```

每个步骤显示 `已完成 / 待处理 / 被拦截` 状态、数量和可跳转目标。价值卡显示 2.6 天、4 个、3 个、38%、2 个，不把技术计数替代为价值指标。

- [ ] **Step 4: 渲染 Tool 草稿、MCP 组成和验收诊断**

在 Tool 映射区域将候选卡固定为三栏：`AI 原建议`、`人工修改内容`、`最终 Tool 边界`，其下显示 `创建 Tool 草稿` 按钮。创建后展示 Tool 草稿版本、确认人、修改原因。

增加 `#mcpCompositionList`，左侧展示可选 Tool 草稿，中间展示 AI 推荐组合，右侧输入人工组合理由并调用 `/confirm-mcp-composition`；仅确认成功后显示 `生成 MCP 草稿`。

验收失败卡必须展示 `HTTP 403` 和 `trace_demo_refund_403`，并使用 `monitor_path` 跳转调用监控，不与凭证连通性测试混淆。

- [ ] **Step 5: 扩展状态加载与用户操作**

在 `state.js` 增加 `governanceDemoOverview`、`toolDrafts`、`mcpCompositions`。在 `app.js` 的刷新流程加载 `/api/platform/governance/demo-overview` 和草稿数据；新增 `window.createToolDraft`、`window.confirmMcpComposition`、`window.openTraceDiagnosis`。所有成功操作都刷新候选、草稿、资产、审核任务和总览数据。

- [ ] **Step 6: 添加样式并运行前端测试**

在 `styles.css` 为 `.governance-flow-board`、`.flow-step`、`.flow-step.blocked`、`.decision-diff-grid`、`.trace-diagnosis-card` 定义样式；在窄屏下令三栏差异区变为单列。

Run: `node mcp/poc/admin/tests/tool-to-asset-clarity.test.mjs; node mcp/poc/admin/tests/governance-flow-visibility.test.mjs; node mcp/poc/admin/tests/renderers-import.test.mjs`

Expected: PASS，渲染模块可导入且流程、差异、Trace ID 与价值卡均可被静态测试定位。

### Task 5: 全链路回归与旧数据保护

**Files:**
- Modify: `mcp/poc/server/server.js`
- Modify: `tests/customer-control-flow.test.js`
- Modify: `tests/builder-publish-block.test.js`
- Modify: `tests/governance-demo-data.test.js`

- [ ] **Step 1: 写入历史 Release 的失败用例**

在 `tests/builder-publish-block.test.js` 断言历史 Release 没有关联候选时返回固定迁移错误：

```js
assert.match(serverSource, /legacy release requires governance migration/u);
assert.match(serverSource, /status = 'legacy_published'/u);
```

- [ ] **Step 2: 运行测试确认旧数据迁移保护尚未完整**

Run: `node tests/builder-publish-block.test.js`

Expected: FAIL，旧 Release 未标记为 `legacy_published` 或缺少迁移提示。

- [ ] **Step 3: 加入旧资产兼容规则**

服务器启动时，将无法通过 `mcp_id` 找到候选的已发布历史资产标记为 `legacy_published`；该状态可查看与调用，但不得作为新合规 MCP 的复用来源。Release 发布遇到该资产返回 409，不得静默发布。

- [ ] **Step 4: 运行完整回归集合**

Run:

```powershell
node tests/customer-control-flow.test.js
node tests/builder-publish-block.test.js
node tests/governance-demo-data.test.js
node tests/server-syntax.test.js
node mcp/poc/admin/tests/tool-to-asset-clarity.test.mjs
node mcp/poc/admin/tests/governance-flow-visibility.test.mjs
node mcp/poc/admin/tests/admin-navigation.test.mjs
node mcp/poc/admin/tests/renderers-import.test.mjs
```

Expected: 全部 PASS。若任一失败，停止后续动作，定位失败测试对应的最小原因并修复后重跑。

- [ ] **Step 5: 人工验收本地后台**

在 `http://localhost:3100/admin` 检查：

```text
总览有五项业务价值指标和十步治理链路；
候选不会直接发布；
Tool 草稿与 MCP 组成有独立人工确认；
验收失败显示状态码与 Trace ID；
发布按钮在任一门禁未通过时不可用或返回明确阻断原因。
```

不执行 `git add`、`git commit`、`git push`。
