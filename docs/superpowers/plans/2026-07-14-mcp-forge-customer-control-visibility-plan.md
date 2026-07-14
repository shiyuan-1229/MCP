# MCP Forge 客户可控性与颗粒度可视化改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让客户在 MCP Forge 中清楚看到 Tool/MCP 的封装依据、AI 建议与人工修改差异、五个人工控制门，以及由此产生的业务价值。

**Architecture:** 保留现有 `intake -> recognition -> tooling -> assets -> publish -> delivery` 主链路，继续复用 `manual-checks.mjs`、`boundary-detector.mjs`、`review-orchestrator.mjs` 和 `reuse-service.mjs`。本次以“统一数据契约 + Tool 映射决策界面 + 审核链路可视化 + 首页价值看板”为增量改造，不新建独立治理平台。

**Tech Stack:** Node.js, Express, SQLite (`better-sqlite3`), 原生 HTML/CSS/ES Modules, Node.js `assert` 测试。

---

## 现状与范围

当前代码已经具备以下基础能力：

- `manual-checks.mjs` 已支持敏感字段命中、人工门判断和发布验收清单。
- `boundary-detector.mjs` 已支持 Tool 过度合并、过度拆分和 Tool 快照差异检查。
- `review-orchestrator.mjs` 已支持候选审核、Tool 审核、发布验收三个审核阶段。
- `server.js` 已有 Builder metrics、人工初筛、验收和候选发布接口。
- `renderers.js` 已有 Builder 价值看板和审核工作台渲染入口。

因此本计划重点解决“客户看不懂、看不到、无法判断 AI 是否被人控制”的产品表达和数据追踪问题。

## 文件结构

### 新增文件

- `tests/builder-granularity.test.js`
  验证 Tool 颗粒度建议包含业务域、业务动作、读写类型、敏感字段、权限范围和合并/拆分理由。
- `tests/builder-traceability.test.js`
  验证 AI 快照、人工快照、修改原因和最终 MCP 组成关系可以被保存并读取。

### 修改文件

- `mcp/poc/server/ai-engine.mjs`
  为候选接口和 Tool 建议补齐可解释的分组依据与风险字段。
- `mcp/poc/server/server.js`
  暴露 Tool 颗粒度、快照差异、人工确认和价值指标接口，并确保发布门禁统一生效。
- `mcp/poc/server/modules/governance/boundary-detector.mjs`
  统一颗粒度规则、边界冲突和合并/拆分理由的输出结构。
- `mcp/poc/server/modules/governance/repository.mjs`
  持久化 AI 建议、人工修订、修改原因、Tool 组成和审核责任人。
- `mcp/poc/admin/index.html`
  增加 Tool 决策区、五道人工控制门、AI 与人工差异区和价值看板容器。
- `mcp/poc/admin/assets/app.js`
  加载新增数据、提交人工确认和修改原因，并在状态变化后刷新相关视图。
- `mcp/poc/admin/assets/modules/state.js`
  增加颗粒度建议、差异快照、控制门状态和价值指标状态。
- `mcp/poc/admin/assets/modules/renderers.js`
  渲染 Tool 映射决策界面、过程链路、差异对比、发布准入和首页价值卡片。
- `mcp/poc/admin/assets/styles.css`
  增加决策三栏、差异高亮、控制门状态和响应式布局样式。

## 改造后的统一数据契约

AI 对每个候选 Tool 至少输出以下字段；人工确认后保留同一份结构，并增加修订信息：

```js
{
  id: "tool_candidate_1",
  business_domain: "订单",
  business_action: "查询订单详情",
  operation_type: "read",
  source_tables: ["orders", "order_items"],
  source_endpoints: ["GET /orders/{id}"],
  suggested_group: "订单查询",
  grouping_reason: "同一业务动作、同一权限范围、均为只读操作",
  boundary_rule: "按业务能力组织 Tool，不按单表拆分",
  sensitive_hits: [],
  permission_scope: "project-only",
  risk_level: "low",
  ai_snapshot: {},
  human_snapshot: null,
  change_reason: null,
  human_confirmed: false,
  mcp_id: null
}
```

## 实施阶段

### Task 1: 统一颗粒度规则和候选数据

**Files:**
- Modify: `mcp/poc/server/ai-engine.mjs`
- Modify: `mcp/poc/server/modules/governance/boundary-detector.mjs`
- Modify: `mcp/poc/server/modules/governance/repository.mjs`
- Modify: `mcp/poc/server/server.js`
- Test: `tests/builder-granularity.test.js`

- [ ] **Step 1: 写入失败测试，锁定颗粒度说明字段**

测试必须构造一个包含 `orders`、`order_items`、`payments` 的候选集，并断言输出包含 `business_domain`、`business_action`、`operation_type`、`sensitive_hits`、`permission_scope`、`grouping_reason` 和 `boundary_rule`。

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/builder-granularity.test.js`

Expected: FAIL，提示颗粒度说明字段缺失。

- [ ] **Step 3: 实现统一颗粒度建议**

按以下规则生成建议：

```text
同一业务域 + 同一业务动作 + 同一权限范围 + 同一读写类型 = 可合并候选
跨业务域、跨权限范围或读写风险不一致 = 必须拆分
敏感字段命中或写操作存在 = 自动进入人工审核
数据库表只作为来源证据，不作为 MCP 数量依据
```

将理由写入 `grouping_reason`，将规则写入 `boundary_rule`，并保留原始 AI 结果到 `ai_snapshot`。

- [ ] **Step 4: 保存候选的 AI 快照和颗粒度字段**

在候选资产表中增加缺失列，使用现有 `ensureColumn` 方式兼容旧数据库；repository 的 insert/update/read 方法必须返回完整数据契约。

- [ ] **Step 5: 运行测试确认通过**

Run: `node tests/builder-granularity.test.js`

Expected: PASS，能说明“为什么合并、为什么拆分、哪些风险需要人工确认”。

- [ ] **Step 6: Commit**

```bash
git add tests/builder-granularity.test.js mcp/poc/server/ai-engine.mjs mcp/poc/server/modules/governance/boundary-detector.mjs mcp/poc/server/modules/governance/repository.mjs mcp/poc/server/server.js
git commit -m "feat: expose explainable tool granularity"
```

### Task 2: 将 Tool 映射页改造成可决策的人工打造台

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/state.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/styles.css`
- Test: `tests/builder-tooling.test.js`

- [ ] **Step 1: 写入失败测试，锁定三栏信息结构**

测试检查 Tool 映射页源码和渲染函数同时出现：`AI 原建议`、`分组依据`、`业务域`、`读写类型`、`敏感字段`、`权限范围`、`人工确认后的边界` 和 `修改原因`。

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/builder-tooling.test.js`

Expected: FAIL，提示映射页缺少颗粒度解释或人工确认字段。

- [ ] **Step 3: 增加 Tool 映射三栏布局**

按以下顺序渲染：

```text
左栏：候选接口 / 数据表 / 字段来源
中栏：AI 建议的分组、合并/拆分理由、风险提示
右栏：人工最终 Tool 边界、参数、权限、业务规则和确认动作
```

页面顶部固定显示一句规则说明：“表是来源，Tool 是业务动作，MCP 是业务场景与权限边界的组合。”

- [ ] **Step 4: 增加人工操作和修改原因**

支持合并、拆分、调整 Tool 名称、调整业务域、修改读写权限和补充业务描述；当人工结果与 AI 快照不一致时，修改原因必填。

- [ ] **Step 5: 保存人工快照并生成差异**

提交后调用现有 `diffToolSnapshots`，保存 `human_snapshot`、`change_reason` 和差异字段；未确认的 Tool 不得进入 MCP 封装。

- [ ] **Step 6: 运行 Tool 相关回归测试**

Run: `node tests/builder-tooling.test.js`

Expected: PASS，能验证边界冲突、人工编辑校验和 AI/人工差异。

- [ ] **Step 7: Commit**

```bash
git add tests/builder-tooling.test.js mcp/poc/admin/index.html mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/state.js mcp/poc/admin/assets/modules/renderers.js mcp/poc/admin/assets/styles.css
git commit -m "feat: make tool boundary decisions visible"
```

### Task 3: 把“AI 建议 -> 人工修订 -> 最终发布”做成可追溯链路

**Files:**
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/server/modules/governance/repository.mjs`
- Modify: `mcp/poc/server/modules/governance/review-orchestrator.mjs`
- Modify: `mcp/poc/server/modules/governance/manual-checks.mjs`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Test: `tests/builder-traceability.test.js`
- Test: `tests/builder-publish-block.test.js`

- [ ] **Step 1: 写入失败测试，验证五道控制门**

测试必须覆盖以下状态：资料接入确认、候选人工初筛、Tool 边界确认、敏感字段/权限审核、发布前人工验收；任一必需门未通过时，发布接口返回明确的 `publish_block_reason`。

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/builder-traceability.test.js`

Expected: FAIL，提示人工快照、修改原因或控制门链路缺失。

- [ ] **Step 3: 增加过程事件和责任字段**

每次状态变化记录 `stage`、`status`、`actor`、`timestamp`、`ai_snapshot`、`human_snapshot`、`change_reason`；发布记录必须关联最终 Tool 列表和 MCP ID。

- [ ] **Step 4: 渲染控制门和差异对比**

在审核页和发布页展示五个控制门，状态统一为 `待处理 / 已通过 / 已阻断`；差异区按字段显示“AI 值、人工值、修改原因”，而不是只显示最终 JSON。

- [ ] **Step 5: 保证发布门禁后端优先**

发布接口必须依次检查：开放审核任务为零、人工初筛不是 reject、Tool 边界已确认、敏感字段和权限已审核、发布验收清单全部通过。前端隐藏按钮不能替代后端阻断。

- [ ] **Step 6: 运行发布回归测试**

Run: `node tests/builder-manual-gates.test.js; node tests/builder-publish-block.test.js; node tests/builder-traceability.test.js`

Expected: PASS；未完成任一门时发布被阻断，完成全部门后可发布且能读取完整追溯记录。

- [ ] **Step 7: Commit**

```bash
git add tests/builder-traceability.test.js tests/builder-publish-block.test.js mcp/poc/server/server.js mcp/poc/server/modules/governance/repository.mjs mcp/poc/server/modules/governance/review-orchestrator.mjs mcp/poc/server/modules/governance/manual-checks.mjs mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/renderers.js
git commit -m "feat: visualize human control and publish traceability"
```

### Task 4: 将客户真正关心的业务价值放到总览第一页

**Files:**
- Modify: `mcp/poc/server/modules/governance/repository.mjs`
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/state.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/styles.css`
- Test: `tests/builder-value-board.test.js`

- [ ] **Step 1: 写入失败测试，锁定五类首页指标**

断言 metrics 和总览页同时提供：`资料转资产周期`、`高风险项拦截数`、`复用资产数`、`减少重复梳理工作量`、`当前可发布 MCP 数`。

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/builder-value-board.test.js`

Expected: FAIL，提示一个或多个客户价值指标未暴露。

- [ ] **Step 3: 明确指标计算口径**

```text
资料转资产周期 = published_at - source_created_at
高风险项拦截数 = 被人工 reject 或修改的 high-risk / sensitive candidates
复用资产数 = reuse_category 为 direct_reuse 或 adapt_reuse 的已采用资产
减少重复梳理工作量 = 被复用 Tool 数 × 默认人工梳理小时数
当前可发布 MCP 数 = 通过测试、审核任务清零且 acceptance_passed 的候选数
```

所有指标由后端计算，前端只负责展示和跳转到对应证据列表。

- [ ] **Step 4: 重排总览页信息层级**

第一屏先显示价值卡片和当前待处理控制门；技术漏斗和项目明细放在第二层。每个数字旁边补一句业务解释，例如“本周复用了 3 个 Tool，减少重复打造”。

- [ ] **Step 5: 运行价值指标测试**

Run: `node tests/builder-value-board.test.js`

Expected: PASS，旧字段仍兼容，新增指标有稳定口径和可追溯来源。

- [ ] **Step 6: Commit**

```bash
git add tests/builder-value-board.test.js mcp/poc/server/modules/governance/repository.mjs mcp/poc/server/server.js mcp/poc/admin/index.html mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/state.js mcp/poc/admin/assets/modules/renderers.js mcp/poc/admin/assets/styles.css
git commit -m "feat: lead builder overview with business value"
```

### Task 5: 演示链路和全量回归

**Files:**
- Modify: `mcp/poc/admin/tests/customer-builder-conversation.test.js` if the customer demo flow needs updated copy.
- Modify: `mcp/poc/admin/tests/tool-to-asset-clarity.test.mjs` if the Tool/MCP boundary assertions need updated labels.
- Test: `tests/builder-tooling-integration.test.js`
- Test: `tests/builder-retro-integration.test.js`

- [ ] **Step 1: 固定一条客户演示数据链路**

使用同一个订单场景演示：多张表接入、AI 建议分组、人工拆分支付写操作、敏感字段拦截、生成订单查询 MCP、发布前验收、最终显示复用和拦截价值。

- [ ] **Step 2: 验证客户能回答五个问题**

演示过程中必须能直接回答：为什么这样分 Tool、AI 建议了什么、人改了什么、为什么不能直接发布、这次封装带来了什么业务价值。

- [ ] **Step 3: 运行完整 Builder 回归**

Run: `node tests/builder-manual-gates.test.js; node tests/builder-tooling.test.js; node tests/builder-tooling-integration.test.js; node tests/builder-publish-block.test.js; node tests/builder-retro-integration.test.js; node tests/builder-value-board.test.js`

Expected: 全部 PASS。

- [ ] **Step 4: 运行管理端测试**

Run: `npm test -- --runInBand`

Expected: 既有管理端导航、发布清晰度、资产结构和审核阶段测试不回归。

- [ ] **Step 5: Commit**

```bash
git add mcp/poc/admin/tests/customer-builder-conversation.test.js mcp/poc/admin/tests/tool-to-asset-clarity.test.mjs tests/builder-tooling-integration.test.js tests/builder-retro-integration.test.js
git commit -m "test: verify customer control and value journey"
```

## 交付顺序与里程碑

| 里程碑 | 完成内容 | 客户可感知结果 |
|---|---|---|
| M1 颗粒度可解释 | Task 1 | 不再按表数量猜 MCP 数量，能看到 Tool 分组依据 |
| M2 人工可控 | Task 2 | 能在 Tool 映射页合并、拆分和确认边界 |
| M3 全程可追溯 | Task 3 | 能看到 AI 建议、人工修改、修改原因和发布阻断 |
| M4 价值可证明 | Task 4 | 首页能看到周期、风险拦截、复用和可发布资产 |
| M5 可演示可回归 | Task 5 | 一条真实业务链路完整跑通，客户能复述产品价值 |

## 完成定义

- Tool 映射页能解释每个分组的业务域、业务动作、读写类型、敏感字段、权限和合并/拆分理由。
- 五个人工控制门在界面上始终可见，后端对未通过门禁的发布动作返回明确原因。
- 每个最终 MCP 都能追溯到来源资料、AI 原建议、人工修改、修改原因、最终 Tool 列表和发布责任人。
- 总览首页第一屏展示五类业务价值指标，并可跳转到证据明细。
- Builder 单元、集成和管理端回归测试全部通过。

## 计划自检

- 颗粒度规则覆盖了业务域、业务动作、读写类型、敏感字段、权限和合并/拆分理由。
- 人控关系覆盖了资料接入、候选初筛、Tool 边界、敏感字段/权限、发布验收五道门。
- 可视化覆盖了 AI 原建议、人工修改、修改原因、最终 MCP 组成和发布状态。
- 业务价值覆盖了周期、风险拦截、资产复用、减少重复工作和可发布 MCP 数。
- 计划复用现有治理模块和前端链路，没有引入独立治理平台或复杂审批系统。
