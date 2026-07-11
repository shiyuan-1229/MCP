# MCP Forge Builder Workbench MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `MCP Forge` 原型上，落地一个面向 B 端交付团队的“企业 MCP 打造工作台”MVP，让业务资料可以在 AI 辅助下被快速转成可复用 MCP 资产，但关键决策必须经过人工确认，避免被 AI 带偏方向。

**Architecture:** 保留当前 `intake -> recognition -> tooling -> assets -> publish -> delivery` 的主链路，不再另起一套“治理中台”。后端继续使用现有 `Node.js + Express + SQLite`，并复用 `modules/governance` 作为人工审核与复用推荐引擎；前端在现有工厂工作台上补齐人工干预卡点、价值证明卡片、协作状态和发布准入机制。

**Tech Stack:** Node.js, Express, SQLite (`better-sqlite3`), `mcp/poc/admin` 现有原生前端, `ai-engine.mjs`, 本地测试脚本。

---

## 产品定位

### 目标客群

- 企业内部 IT / 数字化团队
- 乙方交付团队 / 实施顾问 / 解决方案架构师
- 业务接口多、资料分散、希望把 API / DB / 文档快速封装成 MCP 能力的项目团队

### B 端价值主张

- 不是“让 AI 自动生成一切”，而是“让团队更快做对”
- 把分散资料沉淀成可交付、可复用、可发布的 MCP 资产
- 缩短从业务资料到上线联调的周期
- 降低 AI 误判带来的返工和业务风险
- 让交付团队、产品、技术、业务负责人在同一工作台协作

### 本期不做

- 不追求全自动无人审核发布
- 不把重点放在通用聊天体验
- 不做复杂组织权限系统和审批流平台化
- 不做大而全的资产治理平台重构

---

## 人工干预机制设计

以下 8 个节点必须是“AI 提建议，人来拍板”。

1. **资料接入确认**
   导入资料后，先由人工确认资料归属项目、业务场景、来源可信度，避免把错误资料送进识别流程。
2. **接口候选筛选**
   AI 识别出的接口、表、字段不能直接入库，必须由人工勾选“保留 / 忽略 / 待补充”。
3. **Tool 边界定义**
   对一个端点是否独立成 Tool、多个端点是否合并成业务 Tool，必须由人工决定。
4. **敏感字段与高风险参数审核**
   涉及身份证号、手机号、金额、密钥、内部状态字段时，必须人工确认脱敏、隐藏、只读或禁止暴露。
5. **权限与可见性配置**
   AI 不能自动决定 `public/internal/project-only`，由人工选择 Tool 与资产的可见范围。
6. **业务规则注入**
   提示词、FAQ、知识库、异常口径、字段含义等业务规则由人工补充，防止 AI 按泛化理解封装。
7. **发布前验收**
   沙箱测试通过后仍需人工勾选“业务可用 / 输出正确 / 风险可控 / 文档齐全”才能发版。
8. **上线后反馈回流**
   对误识别、误分类、误答复案例建立人工复盘与修正入口，沉淀为下一轮识别规则。

---

## File Structure

### New files

- `tests/builder-manual-gates.test.js`
  校验关键人工卡点字段、状态流转和接口返回结构。

- `tests/builder-value-metrics.test.js`
  校验 B 端价值指标汇总逻辑，如待审核量、审核通过率、复用率、交付周期。

- `mcp/poc/server/modules/governance/manual-checks.mjs`
  集中定义人工审核规则、敏感字段命中规则、发布准入校验。

### Modified files

- `mcp/poc/admin/index.html`
  调整工作台文案和页面结构，让“打造工作台”成为主叙事。

- `mcp/poc/admin/assets/app.js`
  加载新的审核数据、价值指标和交互动作。

- `mcp/poc/admin/assets/modules/state.js`
  新增 builder 视角的状态切片，如审核队列、人工卡点、价值指标。

- `mcp/poc/admin/assets/modules/renderers.js`
  渲染人工审核卡片、价值看板、例外队列、复用建议和发布准入清单。

- `mcp/poc/server/server.js`
  增加 Builder 版工作流接口、人工审核写入、发布前校验和复盘记录。

- `mcp/poc/server/ai-engine.mjs`
  在 AI 识别结果中输出 `confidence`、`riskLevel`、`sensitiveHits`、`suggestedAction` 等人工判定辅助字段。

- `mcp/poc/server/modules/governance/repository.mjs`
  持久化审核任务、人工结论、复用建议和发布准入记录。

- `mcp/poc/server/modules/governance/review-orchestrator.mjs`
  把当前治理审核逻辑改造成服务 Builder 工作流的人工卡点编排器。

- `mcp/poc/server/modules/governance/reuse-service.mjs`
  输出“直接复用 / 复制后改造 / 不建议复用”的建议结果。

### Existing files to keep aligned

- `mcp/poc/admin/assets/modules/api.js`
- `mcp/poc/admin/assets/modules/ui.js`
- `mcp/poc/admin/tests/renderers-import.test.mjs`

---

## MVP Scope

本期只做一条最核心的 B 端链路：

`业务资料接入 -> AI 识别建议 -> 人工审核打造 -> MCP 资产生成 -> 沙箱联调 -> 人工验收发布 -> 交付沉淀与复用`

MVP 成功标准：

- 能让用户清楚知道“这不是 AI 自嗨，而是交付工作台”
- AI 输出的关键结果都有对应人工确认入口
- 可以形成一条真实可演示的企业打造路径
- 工作台上能看到 B 端价值指标，而不是只有技术过程

---

### Task 1: 重写工作台主叙事，明确 B 端用户和价值

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/modules/state.js`

- [ ] **Step 1: 调整顶部文案和导航语义**
  把核心表达统一为“企业 MCP 打造工作台”“面向交付的生产台”“资料到资产的打造链路”，弱化“治理平台”作为主标题，只保留为底层能力或子页面。

- [ ] **Step 2: 在总览页增加 B 端价值卡片**
  至少展示 `资料转资产周期`、`人工审核命中数`、`本周复用资产数`、`待发布项目数` 四类指标，让用户第一眼看到交付效率和业务价值。

- [ ] **Step 3: 给各页面补齐角色视角提示**
  在 `intake / recognition / tooling / publish` 页面顶部补一句“谁在这里做什么”，例如“实施顾问确认资料来源”“产品/技术确认 Tool 边界”。

- [ ] **Step 4: 运行前端导入校验**
  Run: `node mcp/poc/admin/tests/renderers-import.test.mjs`
  Expected: PASS，且现有渲染入口未被破坏。

---

### Task 2: 在资料接入和接口识别阶段加入人工校准

**Files:**
- Modify: `mcp/poc/server/ai-engine.mjs`
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Create: `mcp/poc/server/modules/governance/manual-checks.mjs`
- Test: `tests/builder-manual-gates.test.js`

- [ ] **Step 1: 扩展 AI 识别结果结构**
  在现有识别结果中统一返回：
  `confidence`、`riskLevel`、`sensitiveHits`、`unknownFields`、`suggestedToolGroups`、`needsHumanReview`。

- [ ] **Step 2: 增加“人工初筛”状态**
  为资料和候选接口增加状态：`draft -> ai_identified -> human_screening -> approved/rejected`，避免 AI 结果自动流入下一步。

- [ ] **Step 3: 在接入页增加审核动作**
  支持对识别结果逐项执行：
  `保留`、`忽略`、`待补充资料`、`标记敏感`、`转给业务确认`。

- [ ] **Step 4: 建立敏感命中规则**
  至少覆盖 `手机号`、`身份证`、`银行卡`、`地址`、`金额`、`token/key/secret`、`内部状态字段`，命中后默认进入人工审核队列。

- [ ] **Step 5: 运行人工卡点测试**
  Run: `node tests/builder-manual-gates.test.js`
  Expected: PASS，能校验敏感字段命中、状态流转和人工审核必填条件。

---

### Task 3: 把 Tool 映射页改成“人工打造台”

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/server/modules/governance/review-orchestrator.mjs`

- [ ] **Step 1: 将 Tool 映射页拆成三个决策区**
  展示 `候选接口`、`拟生成 Tool`、`人工确认配置` 三栏，让用户明确知道 AI 只是建议，不是最终结果。

- [ ] **Step 2: 增加人工可编辑项**
  每个 Tool 至少支持人工修改：
  `名称`、`业务描述`、`所属分类`、`输入参数`、`输出摘要`、`可见性`、`是否允许写操作`。

- [ ] **Step 3: 增加边界冲突提示**
  当 AI 把多个不相干端点合并，或把一个完整业务能力拆得过碎时，显示 `边界待确认` 标签并强制人工处理。

- [ ] **Step 4: 增加业务规则注入入口**
  允许在 Tool 级别挂载：
  `字段解释`、`业务限制`、`错误口径`、`FAQ`、`补充 Prompt`。

- [ ] **Step 5: 后端保存人工打造结果**
  保存的不只是最终 Tool JSON，还要保存“AI 原建议”和“人工修订后版本”，方便追溯。

---

### Task 4: 建立发布前的人审准入机制

**Files:**
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/server/modules/governance/manual-checks.mjs`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Test: `tests/builder-manual-gates.test.js`

- [ ] **Step 1: 将沙箱测试与人工验收分开**
  现有 `sandbox test` 继续负责技术验证，但只有通过人工验收清单后才能进入 `publish`。

- [ ] **Step 2: 增加发布准入清单**
  至少包含：
  `业务结果正确`
  `敏感字段已处理`
  `权限范围已确认`
  `写操作风险已确认`
  `交付说明已补齐`
  `回滚方案可用`

- [ ] **Step 3: 后端增加发布前校验接口**
  如果人工验收项未完成，`/publish` 相关动作必须返回明确阻断原因，而不是默认成功。

- [ ] **Step 4: 在发布页展示责任归属**
  明确记录“谁测试通过、谁业务验收、谁最终发布”，加强协作闭环。

- [ ] **Step 5: 回归验证沙箱与发布链路**
  Run: `node tests/builder-manual-gates.test.js`
  Expected: PASS，未勾选人工验收项时不可发布。

---

### Task 5: 用复用和交付指标证明 B 端价值

**Files:**
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/server/modules/governance/reuse-service.mjs`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Test: `tests/builder-value-metrics.test.js`

- [ ] **Step 1: 定义一组最小价值指标**
  统一输出：
  `资料数`
  `识别候选数`
  `人工通过率`
  `平均打造周期`
  `已发布资产数`
  `直接复用数`
  `复制改造数`
  `问题回流数`

- [ ] **Step 2: 调整复用建议结果**
  不只返回相似度分数，还要返回三类建议：
  `可直接复用`
  `建议复制后改造`
  `建议新建`

- [ ] **Step 3: 在总览和资产页增加价值解释**
  每个核心数字旁边给出一句业务解释，例如“本周 3 个项目复用了已有 Tool，减少重复打造”。

- [ ] **Step 4: 增加交付闭环视图**
  在 `delivery` 页让用户看到每个资产对应的 `配置包 / 测试报告 / 调用日志 / 运行说明 / 复盘结论` 是否齐全。

- [ ] **Step 5: 运行价值指标测试**
  Run: `node tests/builder-value-metrics.test.js`
  Expected: PASS，指标汇总与复用分类逻辑正确。

---

### Task 6: 建立误识别复盘与持续修正机制

**Files:**
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/server/ai-engine.mjs`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`

- [ ] **Step 1: 为每个被驳回或被改写的 AI 结果记录原因**
  原因可选：
  `分类错误`
  `字段理解错误`
  `敏感判断不足`
  `Tool 边界错误`
  `业务口径错误`
  `其他`

- [ ] **Step 2: 在页面增加“误识别案例”列表**
  让团队可以快速看到哪些问题最常出现，避免每次都重复踩坑。

- [ ] **Step 3: 把复盘结果反哺到识别建议**
  后续 AI 识别时可引用“历史高频误判提示”，优先提醒人工关注高风险项。

- [ ] **Step 4: 保持 MVP 简洁**
  本期只做“记录 + 展示 + 下次提示”，不做复杂的训练平台和自动规则平台。

---

## Data Model Notes

建议在现有数据结构之上补充以下核心字段：

- `confidence`
- `risk_level`
- `sensitive_hits`
- `needs_human_review`
- `human_decision`
- `human_reason`
- `tool_visibility`
- `write_permission_level`
- `business_rule_notes`
- `acceptance_status`
- `acceptance_by`
- `retro_reason`

这些字段优先加在现有识别结果、审核任务、资产记录或发布记录上，不建议为了 MVP 重新设计一套大表体系。

---

## 验证清单

- [ ] `intake` 页能看见 AI 建议与人工初筛动作
- [ ] `recognition` 页不会让 AI 结果自动越过人工确认
- [ ] `tooling` 页可以人工修改 Tool 边界与参数
- [ ] 敏感字段命中后会自动进入人工审核
- [ ] 未完成人工验收时不可发布
- [ ] 总览页能清楚展示 B 端价值指标
- [ ] 资产页能看到复用建议与复盘信息
- [ ] 交付页能展示完整交付闭环

---

## 风险与取舍

- 最大风险不是“AI 不够强”，而是“AI 给了看起来像对的结果，团队就直接用了”
- 本期优先做关键卡点和价值表达，不做复杂审批流
- 后端可以继续复用 `governance` 命名的模块，前端和产品表达统一改成 `Builder / 打造工作台`
- 旧的治理版计划可保留为历史草稿，但当前实施应以这份 Builder 版计划为准

---

## 执行建议

推荐落地顺序：

1. 先改工作台叙事与价值指标，让方向彻底对齐
2. 再补 `intake / recognition / tooling` 三个关键人工卡点
3. 最后补发布准入、复盘与复用指标

按这个顺序做，能最快让原型从“AI 演示台”变成“B 端可交付工作台”。
