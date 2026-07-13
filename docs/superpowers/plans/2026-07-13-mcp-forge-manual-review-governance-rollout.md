# MCP Forge 人工审核与发布门禁落地计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `MCP Forge` 项目基础上，补强 AI 识别偏差下的人工干预机制，形成“候选识别审核 -> Tool 设计审核 -> MCP 发布前验收”的分层治理闭环，并把关键动作落到一个足够简洁、足够有引导性的管理员工作台中。

**Architecture:** 保持当前 `CandidateAsset -> ReviewTask -> PublishedAsset` 的治理主链路，不把审核放到最后一刻统一兜底，而是把高风险判断前置到候选与 Tool 阶段；发布前只负责做上线门禁校验。前端延续当前管理后台的产品语言，不做大而全仪表盘，而是突出“现在要处理什么、为什么拦截、下一步怎么做”。

**Tech Stack:** Node.js, Express, SQLite, 现有 admin 静态前端 (`index.html` + `assets/app.js` + `assets/modules/*.js`), 现有治理模块 (`review-orchestrator.mjs`, `manual-checks.mjs`, `repository.mjs`)

---

## 背景结论

当前项目里已经具备治理能力雏形，包括：

- `CandidateAsset` 候选资产
- `ReviewTask` 审核任务
- 人工门禁与手工检查
- Tool 快照与验收清单
- 发布阻断与复盘回流

当前真正缺的不是“再加一个审核页面”，而是把审核逻辑明确成 3 层，并让后台一眼能看懂：

1. `先审 AI 识别出来的候选是否可信`
2. `再审 Tool 是否应该这样组织`
3. `最后验收这个 MCP 是否真的可以发布`

---

## 目标范围

本轮计划只解决以下问题：

- AI 识别偏差时，哪些情况必须进入人工审核
- Tool 在封装前如何被审核，而不是等 MCP 生成后再返工
- MCP 发布前到底卡什么，阻断条件如何统一
- 管理端如何只展示必要信息，并带有明确操作引导

本轮暂不扩展：

- 新的数据接入源类型
- 新的模型能力
- 复杂 BI 统计页
- 面向客户侧的大屏或汇报页

---

## 成功标准

- 高风险候选不会直接流入 MCP 封装
- Tool 审核和 MCP 发布验收被明确拆开
- 发布前阻断条件统一为固定门禁，而不是人工口头确认
- 管理员进入页面后，可以在 10 秒内知道“现在该处理什么”
- 审核页优先展示动作与原因，而不是堆砌指标

---

### Task 1: 固化分层审核模型与状态定义

**Files:**
- Modify: `mcp/poc/server/modules/governance/review-orchestrator.mjs`
- Modify: `mcp/poc/server/modules/governance/manual-checks.mjs`
- Modify: `mcp/poc/server/modules/governance/repository.mjs`
- Modify: `mcp/poc/server/server.js`

- [ ] **Step 1: 统一三层审核阶段定义**

明确平台里的审核阶段至少包含：

- `candidate_review`
- `tool_review`
- `publish_acceptance`

并确认每个阶段的输入对象、输出状态、阻断条件都可枚举，不依赖页面文案隐式表达。

- [ ] **Step 2: 统一审核状态与决策动作**

统一状态机，至少覆盖：

- `pending`
- `auto_passed`
- `needs_manual_review`
- `approved`
- `rejected`
- `modified`
- `blocked_for_publish`

统一人工动作，至少覆盖：

- `approve`
- `reject`
- `modify`
- `escalate`

- [ ] **Step 3: 把审核原因结构化**

不要只存“审核没过”，而要结构化记录原因，例如：

- `low_confidence`
- `sensitive_hit`
- `source_conflict`
- `tool_boundary_unclear`
- `permission_scope_risk`
- `write_operation_risk`

这样后续页面才能直接展示“为什么需要你处理”。

- [ ] **Step 4: 补齐基础读写接口**

确认后端能稳定提供：

- 候选资产列表
- 审核任务列表
- 单条任务详情
- 审核决策提交
- 发布前门禁检查结果

---

### Task 2: 前置人工干预规则，先拦候选与 Tool

**Files:**
- Modify: `mcp/poc/server/modules/governance/review-orchestrator.mjs`
- Modify: `mcp/poc/server/modules/governance/manual-checks.mjs`
- Modify: `mcp/poc/server/ai-engine.mjs`

- [ ] **Step 1: 定义候选阶段的人审触发条件**

至少在以下情况触发人工初筛：

- AI 置信度低
- 命中敏感字段
- 数据库结构与 OpenAPI 描述冲突
- 字段语义解释不稳定
- 业务域无法明确归属

- [ ] **Step 2: 定义 Tool 阶段的审核重点**

Tool 审核不再重复看“识别是否存在”，而是重点确认：

- Tool 是否拆得过碎
- Tool 是否合并过头
- 参数是否暴露过多
- 敏感字段是否应该继续保留
- 权限范围是否过宽
- 是否存在写操作或跨系统风险

- [ ] **Step 3: 建立升级规则**

把审核强度至少分成三档：

- 自动通过
- 单人审核
- 双人审核

并确保涉及金额、身份信息、账号信息、权限边界、写操作、跨系统关键映射时，能自动升级而不是靠人记住。

- [ ] **Step 4: 把“修改后重审”纳入闭环**

对于 `modify` 决策，系统需要支持：

- 记录修改内容
- 记录修改原因
- 重新回到对应审核阶段
- 保留 AI 原判断与人工修正对照

---

### Task 3: 固化 MCP 发布前的三道门禁

**Files:**
- Modify: `mcp/poc/server/modules/governance/manual-checks.mjs`
- Modify: `mcp/poc/server/modules/governance/repository.mjs`
- Modify: `mcp/poc/server/server.js`

- [ ] **Step 1: 固定发布阻断条件**

发布前统一只看 3 个阻断条件：

1. `open review tasks = 0`
2. `manual screen passed = true`
3. `acceptance checklist passed = true`

只要有一项不满足，就不能进入正式发布。

- [ ] **Step 2: 验收清单结构化**

把验收项至少拆成：

- 业务结果正确
- 敏感字段已处理
- 权限范围已确认
- 写操作风险已确认
- 交付说明已补齐
- 回滚方案可用

不要让发布验收停留在备注文本里。

- [ ] **Step 3: 输出可直接展示的门禁结果**

后端返回结果时，前端应能直接展示：

- 是否可发布
- 卡在哪一项
- 需要谁来处理
- 处理完后会进入哪一步

---

### Task 4: 把管理端改成“引导式人工审核工作台”

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/api.js`
- Modify: `mcp/poc/admin/assets/modules/state.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Reference: `mcp/MCP_Forge_管理员人工审核工作台原型.html`

- [ ] **Step 1: 页面只保留必要结构**

工作台建议只保留 3 个核心区块：

- `今天要处理什么`
- `当前待审队列`
- `当前项为什么被拦截，以及现在该怎么决定`

避免一开始展示大量 KPI、复杂趋势图、非必要统计。

- [ ] **Step 2: 队列按“先处理什么”排序**

优先排序维度建议为：

- 双人审核优先
- 高风险优先
- 发布阻断优先
- 临近交付时间优先

让管理员不需要自己判断优先级。

- [ ] **Step 3: 详情区只展示决策必需信息**

详情区建议只展示：

- 候选名称 / Tool 名称
- 风险等级
- 触发原因
- AI 判断摘要
- 冲突来源
- 敏感字段命中
- 推荐动作
- 审核按钮

其它资料收纳到折叠区，默认不抢视线。

- [ ] **Step 4: 强化引导性文案**

页面文案避免抽象表达，直接告诉管理员：

- `这条为什么轮到你`
- `你现在要做什么`
- `做完会发生什么`

例如：

- `现在先判断这个 Tool 是否应该保留手机号字段`
- `如果通过，这条会进入 MCP 封装`
- `如果驳回，这条会退回 Tool 调整`

- [ ] **Step 5: 保证中文可读性与信息密度克制**

延续当前后台“冷静、精确、可信”的产品气质：

- 不做营销式大卡片
- 不堆砌装饰性文案
- 修复中文编码与显示问题
- 保持桌面端与常见笔记本分辨率下都可直接使用

---

### Task 5: 把审核流程嵌入现有产品导航与叙事

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Reference: `mcp/MCP_Forge_admin_handoff_2026-07-09.md`

- [ ] **Step 1: 对齐当前后台的一级流程**

让审核逻辑顺着当前产品主线表达：

- `资料接入`
- `接口识别`
- `Tool 映射`
- `MCP 资产`
- `测试发布`

不要把人工审核做成脱离主流程的孤岛页面。

- [ ] **Step 2: 在关键页面显示“下一步”**

每个相关页面都明确指出当前项接下来会进入：

- 人工初筛
- Tool 审核
- MCP 封装
- 发布前验收
- 正式发布

- [ ] **Step 3: 统一团队说法**

后台文案统一成这套表达：

- 先审候选是否可信
- 再审 Tool 是否合理
- 最后验收 MCP 是否可发布

避免页面上同时出现多种相互冲突的解释。

---

### Task 6: 补测试、补样例、补验证闭环

**Files:**
- Modify: `tests/governance-review-orchestrator.test.js`
- Modify: `tests/governance-api-smoke.test.js`
- Modify: `mcp/poc/admin/tests/renderers-import.test.mjs`
- Optional: add focused governance fixture tests if missing

- [ ] **Step 1: 覆盖审核分流测试**

至少验证：

- 高风险候选进入人工审核
- 敏感字段候选升级审核
- Tool 边界风险不会自动通过
- 发布阻断条件不满足时无法发布

- [ ] **Step 2: 覆盖页面渲染基础检查**

至少验证：

- 审核工作台模块能导入
- 关键区块标题存在
- 审核按钮和状态标签能渲染

- [ ] **Step 3: 用一组真实感样例走通链路**

建议准备 3 类样例：

- 低风险自动通过样例
- 单人审核样例
- 双人审核并阻断发布样例

确保整个流程不只停留在结构上成立。

---

## 推荐实施顺序

1. 先做后端分层审核状态与门禁统一
2. 再做人工触发规则和升级规则
3. 再做管理端引导式工作台
4. 最后补发布门禁页与验证样例

这样可以避免先做页面，再倒推后端状态，导致反复返工。

---

## 最终交付物

本轮完成后，至少应形成以下结果：

- 一套可执行的分层审核状态机
- 一套可落地的人工干预触发规则
- 一套固定的 MCP 发布前三道门禁
- 一个“只展示必要内容”的管理员审核工作台
- 一组可复用的测试与样例数据

---

## 一句话总结

`先把 AI 识别出来的候选和 Tool 审清楚，再封装成 MCP；封装后发布前，再用统一门禁确认这个 MCP 是否真的可以上线。`
