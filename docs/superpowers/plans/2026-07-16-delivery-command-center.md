# Delivery Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin delivery file ledger with an action-oriented delivery command center grouped by project.

**Architecture:** Keep existing delivery APIs and compute project delivery packages in `renderers.js` from deliverables, projects, assets, releases, and events. The page uses static HTML mounting points plus CSS for the command-center layout, while existing drawer and download actions remain the source of file detail and retrieval.

**Tech Stack:** Static HTML, vanilla JavaScript modules, CSS, Node assertion tests.

---

### Task 1: Lock the delivery command-center contract

**Files:**
- Create: `mcp/poc/admin/tests/delivery-command-center.test.mjs`
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Modify: `mcp/poc/admin/assets/styles.css`

- [ ] **Step 1: Write the failing test**

```js
for (const token of ['deliveryCommandCenter', 'deliveryHealthSummary', 'deliveryTaskQueue', 'deliveryPackageRows']) {
  assert.match(html, new RegExp(token, 'u'));
}
for (const token of ['function deliveryPackages(', 'renderDeliveryCommandCenter', 'delivery-task-card', 'delivery-package-card']) {
  assert.match(renderers + styles, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node mcp/poc/admin/tests/delivery-command-center.test.mjs`

Expected: failure because the command-center identifiers and renderer do not yet exist.

- [ ] **Step 3: Implement the delivery command-center skeleton**

Add the four HTML mounting points and define the package helper and renderer names used by the test. Keep the legacy `deliverableRows` table as the lower-level file ledger.

- [ ] **Step 4: Run test to verify it passes**

Run: `node mcp/poc/admin/tests/delivery-command-center.test.mjs`

Expected: `delivery command center checks passed`.

### Task 2: Build project delivery packages and operational queue

**Files:**
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Test: `mcp/poc/admin/tests/delivery-command-center.test.mjs`

- [ ] **Step 1: Extend the failing test with delivery package concepts**

```js
for (const token of ['完整度', '补齐资料', '预览交付包', '发布版本', '调用证据']) {
  assert.match(html + renderers, new RegExp(token, 'u'));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node mcp/poc/admin/tests/delivery-command-center.test.mjs`

Expected: failure until package cards and action labels are rendered.

- [ ] **Step 3: Implement package aggregation and queue rendering**

Create `deliveryPackages()` that groups existing delivery records by project, tracks required core files (`config`, `test-report`, `run-guide`), finds the current asset release and recent events, and computes a ready, incomplete, or blocked package status. Render operational tasks for missing core materials and assets without a completed package.

- [ ] **Step 4: Run test to verify it passes**

Run: `node mcp/poc/admin/tests/delivery-command-center.test.mjs`

Expected: `delivery command center checks passed`.

### Task 3: Style the responsive delivery workspace

**Files:**
- Modify: `mcp/poc/admin/assets/styles.css`
- Test: `mcp/poc/admin/tests/delivery-command-center.test.mjs`

- [ ] **Step 1: Extend the failing test with CSS contract selectors**

```js
for (const token of ['.delivery-command-center', '.delivery-workspace', '.delivery-package-card', '.delivery-task-card']) {
  assert.match(styles, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node mcp/poc/admin/tests/delivery-command-center.test.mjs`

Expected: failure until the responsive delivery styles exist.

- [ ] **Step 3: Add responsive command-center styles**

Use the existing panel, status badge, button and metric vocabulary. Create a desktop two-column workspace with a single-column mobile fallback, package status colors, compact evidence rows, and task-card action alignment.

- [ ] **Step 4: Run test to verify it passes**

Run: `node mcp/poc/admin/tests/delivery-command-center.test.mjs`

Expected: `delivery command center checks passed`.

### Task 4: Regression verification

**Files:**
- Test: `mcp/poc/admin/tests/delivery-command-center.test.mjs`

- [ ] **Step 1: Run focused tests**

Run: `node mcp/poc/admin/tests/delivery-command-center.test.mjs; node mcp/poc/admin/tests/deliverable-download.test.mjs; node mcp/poc/admin/tests/customer-deliverables-library.test.mjs; node mcp/poc/admin/tests/admin-copy.test.mjs`

Expected: every focused test passes.

- [ ] **Step 2: Run syntax and whitespace checks**

Run: `node --check mcp/poc/admin/assets/modules/renderers.js; node --check mcp/poc/admin/assets/app.js; git diff --check`

Expected: all commands exit with code 0.
