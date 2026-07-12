# MCP Builder Results Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the customer-side MCP builder right panel into a results-overview layout with one result header, one detail body, and one compact action area.

**Architecture:** Keep the existing left-side AI conversation intact, collapse the right-side multi-panel stack into a single summary-first experience, and reuse the current builder result data by changing only the DOM structure and rendering targets. Add one small piece of UI state for the active detail tab and keep verification lightweight with syntax checks because this static POC surface has no dedicated automated UI test harness.

**Tech Stack:** Static HTML, vanilla JS renderers, shared app state, CSS layout/styling.

---

### Task 1: Restructure the builder result DOM

**Files:**
- Modify: `D:\桌面\mcp方案\mcp\poc\admin\index.html`

- [ ] Replace the right-column six-panel stack with a compact results overview structure.
- [ ] Keep separate mount points for summary header, inline confirmation notice, detail tabs, detail body, and footer actions.
- [ ] Preserve existing button actions for draft save, handoff, and submit.

### Task 2: Update builder rendering to summary-first behavior

**Files:**
- Modify: `D:\桌面\mcp方案\mcp\poc\admin\assets\modules\state.js`
- Modify: `D:\桌面\mcp方案\mcp\poc\admin\assets\modules\renderers.js`

- [ ] Add builder detail tab state with a default of `tools`.
- [ ] Render one top summary card with name, scenario, status, summary text, and key counts.
- [ ] Render confirmations inline under the summary when they are short, otherwise route them into the detail body.
- [ ] Merge adjustments and references into a single “调整与复用依据” detail view.
- [ ] Render a single detail panel with tab switching between `Tool 组成`, `调整与复用依据`, and `待确认项`.

### Task 3: Restyle the right column as one primary result surface

**Files:**
- Modify: `D:\桌面\mcp方案\mcp\poc\admin\assets\styles.css`

- [ ] Replace the stacked-card look with a summary card, one main detail panel, and a compact footer action bar.
- [ ] Reduce visual fragmentation by giving the detail area one shared surface and lighter internal separators.
- [ ] Keep the mobile breakpoint usable by collapsing tabs and footer actions cleanly.

### Task 4: Verify the page script integrity

**Files:**
- Verify: `D:\桌面\mcp方案\mcp\poc\admin\assets\modules\renderers.js`
- Verify: `D:\桌面\mcp方案\mcp\poc\admin\assets\modules\state.js`

- [ ] Run `node --check D:\桌面\mcp方案\mcp\poc\admin\assets\modules\renderers.js` and confirm exit code 0.
- [ ] Run `node --check D:\桌面\mcp方案\mcp\poc\admin\assets\modules\state.js` and confirm exit code 0.
- [ ] Review the updated builder section diff to confirm the right column now follows the approved summary-first structure.
