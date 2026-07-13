# MCP Forge Admin Manual Review Workbench Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone mid-fidelity HTML prototype for the admin manual review workbench, focused on risk interception and aligned with the current MCP Forge admin surface.

**Architecture:** Create a single self-contained HTML prototype that borrows the existing admin UI language, but isolates the new review workbench concept into one reference page. Pair it with a design spec saved under `docs/superpowers/specs`, then manually verify layout, hierarchy, and Chinese copy rendering in a browser.

**Tech Stack:** Static HTML, inline CSS, current product copy conventions

---

### Task 1: Save The Confirmed Design Brief

**Files:**
- Create: `docs/superpowers/specs/2026-07-13-mcp-forge-admin-manual-review-workbench-design.md`

- [ ] **Step 1: Write the confirmed design brief**

Save a design brief that covers:

- feature summary
- primary user action
- design direction
- scope
- layout strategy
- key states
- interaction model
- content requirements

- [ ] **Step 2: Review the brief for ambiguity**

Check that the document explicitly says:

- this is an admin surface
- risk interception is the first priority
- the prototype should stay close to the current admin shell

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-13-mcp-forge-admin-manual-review-workbench-design.md
git commit -m "docs: add manual review workbench design brief"
```

### Task 2: Build The Standalone Prototype Page

**Files:**
- Create: `mcp/MCP_Forge_管理员人工审核工作台原型.html`
- Reference: `mcp/poc/admin/index.html`
- Reference: `mcp/poc/admin/assets/styles.css`

- [ ] **Step 1: Draft the page shell**

Create a standalone page with:

- a left admin navigation rail
- a top header
- a page title for `人工审核工作台`
- a restrained product UI palette matching MCP Forge

- [ ] **Step 2: Add the risk dashboard section**

Render five KPI cards for:

- 待人工审核
- 高风险候选
- 低置信度
- 敏感字段命中
- 发布阻断中

- [ ] **Step 3: Add the review queue and detail split**

Render a two-column workbench:

- left: prioritized review queue
- right: selected candidate detail

Include:

- project name
- candidate name
- risk level
- confidence
- gate reasons
- required reviewers

- [ ] **Step 4: Add the detail decision zones**

Render the detail area with:

- AI 识别摘要
- 风险原因
- 敏感字段命中
- 来源冲突对比
- AI 版 vs 人工修订版
- 人工决策按钮

- [ ] **Step 5: Add publish blocking and retro sections**

Render:

- 审核任务清零状态
- 人工初筛状态
- 6 项验收清单
- 误判复盘汇总

- [ ] **Step 6: Run a quick static sanity check**

Open the file locally and check:

- Chinese text renders correctly
- the two-column layout is readable
- the hierarchy matches the design brief

- [ ] **Step 7: Commit**

```bash
git add mcp/MCP_Forge_管理员人工审核工作台原型.html
git commit -m "feat: add admin manual review workbench prototype"
```

### Task 3: Visual Review And Handoff

**Files:**
- Review: `mcp/MCP_Forge_管理员人工审核工作台原型.html`

- [ ] **Step 1: Check the page against the design brief**

Confirm the prototype visibly answers:

- what needs human intervention now
- why a candidate is blocked
- what the reviewer should do next

- [ ] **Step 2: Check product UI consistency**

Confirm:

- restrained color usage
- no marketing-style hero sections
- no oversized decorative cards
- queue and decision areas feel like a real tool

- [ ] **Step 3: Share the output**

Return the file path and summarize:

- what the page shows
- how it maps to the current admin product
- what could be developed next from the prototype
