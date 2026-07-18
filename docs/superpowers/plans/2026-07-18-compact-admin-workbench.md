# Compact Admin Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the administrator Today Work page fit its active work and essential signals into the first screen without removing any action or customer-side behavior.

**Architecture:** Keep `renderGuidedWorkQueue` as the single renderer. Replace the three stacked secondary cards with one compact summary panel that conditionally exposes authorization details only when 401 or 403 events exist. Keep task actions in the primary column and retain responsive single-column behavior below 860px.

**Tech Stack:** Vanilla JavaScript modules, HTML template strings, CSS Grid, Node assert tests.

---

## File Structure

- Modify: `mcp/poc/admin/assets/modules/guided-ui.js` - derive compact summary counts and render the primary work column plus one secondary summary.
- Modify: `mcp/poc/admin/assets/styles.css` - reduce desktop spacing, use a compact summary grid, and preserve the existing mobile breakpoint.
- Modify: `mcp/poc/admin/tests/guided-work-queue-layout.test.mjs` - lock in one summary panel and conditional authorization treatment.

### Task 1: Lock the compact summary contract

**Files:**
- Modify: `mcp/poc/admin/tests/guided-work-queue-layout.test.mjs`

- [ ] **Step 1: Write the failing layout assertions**

```js
for (const token of ['guided-work-main', 'guided-work-summary', 'guided-summary-grid']) {
  assert.match(guidedUi, new RegExp(token, 'u'));
  assert.match(styles, new RegExp(`\\.${token}`, 'u'));
}
assert.doesNotMatch(guidedUi, /guided-work-risk/u);
assert.doesNotMatch(guidedUi, /guided-work-auth/u);
```

- [ ] **Step 2: Run the layout test and verify it fails**

Run: `node mcp/poc/admin/tests/guided-work-queue-layout.test.mjs`
Expected: failure because the old separate risk and authorization cards still exist.

- [ ] **Step 3: Commit the test-only change**

```bash
git add mcp/poc/admin/tests/guided-work-queue-layout.test.mjs
git commit -m "test: define compact admin work summary"
```

### Task 2: Render one compact secondary summary

**Files:**
- Modify: `mcp/poc/admin/assets/modules/guided-ui.js`
- Test: `mcp/poc/admin/tests/guided-work-queue-layout.test.mjs`

- [ ] **Step 1: Replace separate secondary sections with one summary**

```js
const hasAuthorizationFailure = authorizationFailures > 0;
const summaryItems = [
  [sourceTasks.length, '\u5f85\u8bc6\u522b\u8d44\u6599'],
  [blockedAssets, '\u963b\u585e\u53d1\u5e03'],
  [pendingDeliverables, '\u5f85\u8865\u4ea4\u4ed8'],
  [publishedAssets, '\u5df2\u53d1\u5e03 MCP'],
  [failedEvents + blockedDeliverables, '\u8fd0\u884c\u4e0e\u4ea4\u4ed8\u98ce\u9669'],
  ...(hasAuthorizationFailure ? [[authorizationFailures, '\u51ed\u8bc1\u4e0e\u6388\u6743\u5f02\u5e38']] : [['\u6b63\u5e38', '\u51ed\u8bc1\u4e0e\u6388\u6743']])
];
```

- [ ] **Step 2: Render `guided-work-summary` with the governance link and the `guided-summary-grid` items**
- [ ] **Step 3: Run the layout test and verify it passes**

Run: `node mcp/poc/admin/tests/guided-work-queue-layout.test.mjs`
Expected: `guided work queue layout passed`.

### Task 3: Compact the visual layout

**Files:**
- Modify: `mcp/poc/admin/assets/styles.css`
- Test: `mcp/poc/admin/tests/guided-work-queue-layout.test.mjs`

- [ ] **Step 1: Make the first-screen grid denser without changing the mobile breakpoint**

```css
.guided-workbench { grid-template-columns:minmax(0,1fr) 300px; gap:12px; }
.guided-work-main { gap:12px; }
.guided-work-summary { padding:0 14px 14px; }
.guided-summary-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.guided-summary-grid > div { padding:8px 0; }
@media (max-width: 860px) { .guided-workbench { grid-template-columns:1fr; } }
```

- [ ] **Step 2: Remove `.guided-work-impact`, `.guided-work-risk`, and `.guided-work-auth` layout rules once their renderer markup is removed**
- [ ] **Step 3: Run the layout test and verify it passes**

Run: `node mcp/poc/admin/tests/guided-work-queue-layout.test.mjs`
Expected: `guided work queue layout passed`.

### Task 4: Verify administrator-only regression coverage

**Files:**
- Verify: `mcp/poc/admin/tests/*.test.mjs`

- [ ] **Step 1: Run the administrator navigation suite**

```bash
node mcp/poc/admin/tests/renderers-import.test.mjs
node mcp/poc/admin/tests/guided-work-queue.test.mjs
node mcp/poc/admin/tests/guided-work-queue-layout.test.mjs
node mcp/poc/admin/tests/guided-ui-import.test.mjs
node mcp/poc/admin/tests/admin-navigation.test.mjs
```

- [ ] **Step 2: Inspect `http://127.0.0.1:3100/admin` at desktop and 800px widths**
- [ ] **Step 3: Confirm customer files and customer navigation have no diff**
- [ ] **Step 4: Commit the production change**

```bash
git add mcp/poc/admin/assets/modules/guided-ui.js mcp/poc/admin/assets/styles.css mcp/poc/admin/tests/guided-work-queue-layout.test.mjs
git commit -m "refactor: compact admin workbench summary"
```
