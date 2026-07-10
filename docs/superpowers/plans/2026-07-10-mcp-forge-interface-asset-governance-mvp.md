# MCP Forge Interface Asset Governance MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first end-to-end MVP for MCP Forge's enterprise interface asset governance workflow: ingest DB/OpenAPI inputs, generate AI candidate assets, route manual review tasks, publish approved assets, and surface reuse suggestions in the admin console.

**Architecture:** Keep the current Node/Express + SQLite admin server, but split new governance logic into focused modules under `mcp/poc/server/modules/governance` and `mcp/poc/server/modules/connectors`. The MVP introduces a strict boundary between candidate assets and published assets, with review orchestration in the middle and a thin admin UI for operators.

**Tech Stack:** Node.js, Express, SQLite (`better-sqlite3`), existing admin frontend (`index.html` + `assets/app.js` + `assets/modules/*.js`), plain Node test scripts using `assert`.

---

## File Structure

### New files

- `mcp/poc/server/modules/connectors/db-schema.mjs`
  Parse raw database schema payloads into normalized table / field structures.

- `mcp/poc/server/modules/connectors/openapi-parser.mjs`
  Parse OpenAPI specs into normalized endpoint / parameter / schema structures.

- `mcp/poc/server/modules/governance/candidate-builder.mjs`
  Build `CandidateAsset` objects from normalized sources and AI output.

- `mcp/poc/server/modules/governance/review-orchestrator.mjs`
  Route candidate assets into auto-pass, manual review, or escalated review buckets.

- `mcp/poc/server/modules/governance/repository.mjs`
  Encapsulate reads/writes for governance tables.

- `mcp/poc/server/modules/governance/reuse-service.mjs`
  Compute reuse suggestions from published assets.

- `tests/governance-connectors.test.js`
  Verify connector normalization behavior.

- `tests/governance-review-orchestrator.test.js`
  Verify risk routing and review task creation behavior.

- `tests/governance-reuse-service.test.js`
  Verify similarity / reuse recommendations.

- `tests/governance-api-smoke.test.js`
  Verify the new server API surface exists and is wired correctly.

### Modified files

- `mcp/poc/server/server.js`
  Add governance tables, import governance modules, expose MVP APIs.

- `mcp/poc/server/ai-engine.mjs`
  Add a governance-oriented candidate generation entry point that returns confidence and explanation metadata.

- `mcp/poc/admin/index.html`
  Add an “接口资产治理” workbench section for candidates, reviews, and published assets.

- `mcp/poc/admin/assets/app.js`
  Register navigation, fetch governance data, trigger review actions.

- `mcp/poc/admin/assets/modules/api.js`
  Add client helpers for governance endpoints.

- `mcp/poc/admin/assets/modules/state.js`
  Add governance state slices.

- `mcp/poc/admin/assets/modules/renderers.js`
  Render candidate assets, review queues, published assets, and reuse suggestions.

### Existing tests to keep green

- `tests/server-syntax.test.js`
- `mcp/poc/admin/tests/renderers-import.test.mjs`

---

### Task 1: Add Governance Domain Tables And Module Skeletons

**Files:**
- Create: `mcp/poc/server/modules/governance/repository.mjs`
- Create: `mcp/poc/server/modules/governance/review-orchestrator.mjs`
- Create: `mcp/poc/server/modules/governance/reuse-service.mjs`
- Modify: `mcp/poc/server/server.js`
- Test: `tests/governance-api-smoke.test.js`

- [ ] **Step 1: Write the failing smoke test for governance table/API wiring**

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '..', 'mcp', 'poc', 'server', 'server.js');
const source = fs.readFileSync(serverFile, 'utf8');

assert.match(source, /platform_candidate_assets/, 'server.js should create platform_candidate_assets');
assert.match(source, /platform_review_tasks/, 'server.js should create platform_review_tasks');
assert.match(source, /platform_published_assets/, 'server.js should create platform_published_assets');
assert.match(source, /platform_reuse_suggestions/, 'server.js should create platform_reuse_suggestions');
assert.match(source, /app\.get\("\/api\/platform\/governance\/candidates"/, 'server.js should expose governance candidates API');
assert.match(source, /app\.post\("\/api\/platform\/governance\/reviews\/:id\/decision"/, 'server.js should expose review decision API');

console.log('governance api smoke check passed');
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `node tests/governance-api-smoke.test.js`  
Expected: FAIL with missing governance tables or routes in `server.js`.

- [ ] **Step 3: Add minimal governance tables and repository/orchestrator skeletons**

```js
// mcp/poc/server/modules/governance/repository.mjs
export function createGovernanceRepository(db) {
  return {
    listCandidates() {
      return db.prepare("SELECT * FROM platform_candidate_assets ORDER BY created_at DESC").all();
    },
    listReviewTasks() {
      return db.prepare("SELECT * FROM platform_review_tasks ORDER BY created_at DESC").all();
    },
    listPublishedAssets() {
      return db.prepare("SELECT * FROM platform_published_assets ORDER BY published_at DESC").all();
    }
  };
}
```

```js
// mcp/poc/server/modules/governance/review-orchestrator.mjs
export function decideReviewLevel(candidate) {
  if (candidate.risk_level === 'high') return 'dual_review';
  if (candidate.risk_level === 'medium') return 'manual_review';
  return 'auto_pass';
}
```

```js
// mcp/poc/server/server.js (inside runMigrations)
db.exec(`CREATE TABLE IF NOT EXISTS platform_candidate_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  name TEXT NOT NULL,
  business_domain TEXT,
  confidence REAL DEFAULT 0,
  risk_level TEXT DEFAULT 'medium',
  sensitive_hits TEXT DEFAULT '[]',
  mapping_status TEXT DEFAULT 'unknown',
  ai_summary TEXT,
  raw_payload TEXT,
  status TEXT DEFAULT 'pending_review',
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS platform_review_tasks (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  review_type TEXT NOT NULL,
  review_reason TEXT NOT NULL,
  assignee_role TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  decision TEXT,
  decision_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS platform_published_assets (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  business_domain TEXT,
  asset_payload TEXT NOT NULL,
  published_by TEXT,
  published_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS platform_reuse_suggestions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  published_asset_id TEXT NOT NULL,
  score REAL DEFAULT 0,
  suggestion_reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
```

```js
// mcp/poc/server/server.js (route skeletons)
app.get("/api/platform/governance/candidates", requireAuth, (req, res) => {
  res.json({ items: governanceRepo.listCandidates() });
});

app.post("/api/platform/governance/reviews/:id/decision", requireAuth, (req, res) => {
  res.json({ ok: true, review_id: req.params.id });
});
```

- [ ] **Step 4: Run the smoke test again**

Run: `node tests/governance-api-smoke.test.js`  
Expected: PASS with `governance api smoke check passed`.

- [ ] **Step 5: Commit the domain skeleton**

```bash
git add tests/governance-api-smoke.test.js mcp/poc/server/server.js mcp/poc/server/modules/governance/repository.mjs mcp/poc/server/modules/governance/review-orchestrator.mjs mcp/poc/server/modules/governance/reuse-service.mjs
git commit -m "feat: add governance domain tables and API skeleton"
```

### Task 2: Normalize DB/OpenAPI Inputs Into Candidate Assets

**Files:**
- Create: `mcp/poc/server/modules/connectors/db-schema.mjs`
- Create: `mcp/poc/server/modules/connectors/openapi-parser.mjs`
- Create: `mcp/poc/server/modules/governance/candidate-builder.mjs`
- Modify: `mcp/poc/server/ai-engine.mjs`
- Test: `tests/governance-connectors.test.js`

- [ ] **Step 1: Write failing connector normalization tests**

```js
const assert = require('assert');

(async () => {
  const { normalizeDbSchema } = await import('../mcp/poc/server/modules/connectors/db-schema.mjs');
  const { normalizeOpenApiSpec } = await import('../mcp/poc/server/modules/connectors/openapi-parser.mjs');

  const dbResult = normalizeDbSchema({
    tables: [{ name: 'orders', columns: [{ name: 'id', type: 'INTEGER' }, { name: 'customer_phone', type: 'TEXT' }] }]
  });
  assert.equal(dbResult.tables[0].name, 'orders');
  assert.equal(dbResult.tables[0].fields[1].name, 'customer_phone');

  const apiResult = normalizeOpenApiSpec({
    openapi: '3.0.3',
    paths: { '/orders': { get: { summary: 'List orders', parameters: [] } } }
  });
  assert.equal(apiResult.endpoints[0].path, '/orders');
  assert.equal(apiResult.endpoints[0].method, 'GET');

  console.log('governance connector checks passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run connector tests to verify they fail**

Run: `node tests/governance-connectors.test.js`  
Expected: FAIL because connector modules do not exist yet.

- [ ] **Step 3: Implement connector normalization and candidate builder entry points**

```js
// mcp/poc/server/modules/connectors/db-schema.mjs
export function normalizeDbSchema(input) {
  const tables = Array.isArray(input?.tables) ? input.tables : [];
  return {
    tables: tables.map(table => ({
      name: table.name,
      fields: (table.columns || []).map(column => ({
        name: column.name,
        type: column.type,
        nullable: column.nullable !== false
      }))
    }))
  };
}
```

```js
// mcp/poc/server/modules/connectors/openapi-parser.mjs
export function normalizeOpenApiSpec(spec) {
  const endpoints = [];
  for (const [path, methods] of Object.entries(spec?.paths || {})) {
    for (const [method, operation] of Object.entries(methods || {})) {
      endpoints.push({
        path,
        method: method.toUpperCase(),
        summary: operation.summary || '',
        parameters: operation.parameters || []
      });
    }
  }
  return { endpoints };
}
```

```js
// mcp/poc/server/modules/governance/candidate-builder.mjs
export function buildCandidateAsset({ projectId, sourceType, sourceRef, name, businessDomain, confidence, riskLevel, sensitiveHits, rawPayload, aiSummary }) {
  return {
    project_id: projectId,
    source_type: sourceType,
    source_ref: sourceRef,
    name,
    business_domain: businessDomain || 'unclassified',
    confidence: confidence ?? 0,
    risk_level: riskLevel || 'medium',
    sensitive_hits: JSON.stringify(sensitiveHits || []),
    raw_payload: JSON.stringify(rawPayload || {}),
    ai_summary: aiSummary || ''
  };
}
```

```js
// mcp/poc/server/ai-engine.mjs
export async function generateGovernanceCandidates({ sourceName, normalizedSource }) {
  return [{
    name: sourceName,
    businessDomain: 'customer-service',
    confidence: 0.72,
    riskLevel: 'medium',
    sensitiveHits: []
  }];
}
```

- [ ] **Step 4: Re-run connector tests**

Run: `node tests/governance-connectors.test.js`  
Expected: PASS with `governance connector checks passed`.

- [ ] **Step 5: Commit connector and candidate generation support**

```bash
git add tests/governance-connectors.test.js mcp/poc/server/modules/connectors/db-schema.mjs mcp/poc/server/modules/connectors/openapi-parser.mjs mcp/poc/server/modules/governance/candidate-builder.mjs mcp/poc/server/ai-engine.mjs
git commit -m "feat: normalize inputs into governance candidates"
```

### Task 3: Add Review Routing, Review Decisions, And Published Asset Writes

**Files:**
- Modify: `mcp/poc/server/modules/governance/review-orchestrator.mjs`
- Modify: `mcp/poc/server/modules/governance/repository.mjs`
- Modify: `mcp/poc/server/server.js`
- Test: `tests/governance-review-orchestrator.test.js`

- [ ] **Step 1: Write failing review routing tests**

```js
const assert = require('assert');

(async () => {
  const { buildReviewTasksForCandidate, decideReviewLevel } = await import('../mcp/poc/server/modules/governance/review-orchestrator.mjs');

  assert.equal(decideReviewLevel({ risk_level: 'low' }), 'auto_pass');
  assert.equal(decideReviewLevel({ risk_level: 'medium' }), 'manual_review');
  assert.equal(decideReviewLevel({ risk_level: 'high' }), 'dual_review');

  const tasks = buildReviewTasksForCandidate({
    id: 'cand_1',
    risk_level: 'high',
    sensitive_hits: '["phone"]',
    mapping_status: 'conflict'
  });

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].review_type, 'dual_review');
  assert.match(tasks[0].review_reason, /sensitive|conflict/i);

  console.log('review orchestrator checks passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the review routing tests to verify they fail**

Run: `node tests/governance-review-orchestrator.test.js`  
Expected: FAIL because `buildReviewTasksForCandidate` is not implemented.

- [ ] **Step 3: Implement routing rules and review decision persistence**

```js
// mcp/poc/server/modules/governance/review-orchestrator.mjs
import crypto from 'node:crypto';

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

export function decideReviewLevel(candidate) {
  if (candidate.risk_level === 'high') return 'dual_review';
  if (candidate.risk_level === 'medium') return 'manual_review';
  return 'auto_pass';
}

export function buildReviewTasksForCandidate(candidate) {
  const level = decideReviewLevel(candidate);
  if (level === 'auto_pass') return [];

  const reasons = [];
  if ((candidate.sensitive_hits || '').includes('phone')) reasons.push('sensitive field hit');
  if (candidate.mapping_status === 'conflict') reasons.push('mapping conflict');
  if (!reasons.length) reasons.push('low confidence classification');

  if (level === 'dual_review') {
    return [
      { id: makeId('rev'), candidate_id: candidate.id, review_type: 'dual_review', review_reason: reasons.join(', '), assignee_role: 'developer' },
      { id: makeId('rev'), candidate_id: candidate.id, review_type: 'dual_review', review_reason: reasons.join(', '), assignee_role: 'security' }
    ];
  }

  return [
    { id: makeId('rev'), candidate_id: candidate.id, review_type: 'manual_review', review_reason: reasons.join(', '), assignee_role: 'developer' }
  ];
}
```

```js
// mcp/poc/server/modules/governance/repository.mjs
saveReviewTasks(tasks) {
  const stmt = db.prepare(`INSERT INTO platform_review_tasks (id, candidate_id, review_type, review_reason, assignee_role, status) VALUES (@id, @candidate_id, @review_type, @review_reason, @assignee_role, 'open')`);
  const insertMany = db.transaction(items => items.forEach(item => stmt.run(item)));
  insertMany(tasks);
},
recordReviewDecision({ reviewId, decision, reason }) {
  db.prepare(`UPDATE platform_review_tasks SET status = 'resolved', decision = ?, decision_reason = ?, resolved_at = datetime('now') WHERE id = ?`).run(decision, reason, reviewId);
}
```

```js
// mcp/poc/server/server.js
app.post("/api/platform/governance/reviews/:id/decision", requireAuth, (req, res) => {
  const { decision, reason } = req.body || {};
  governanceRepo.recordReviewDecision({ reviewId: req.params.id, decision, reason });
  res.json({ ok: true, review_id: req.params.id, decision, reason });
});
```

- [ ] **Step 4: Re-run review routing tests**

Run: `node tests/governance-review-orchestrator.test.js`  
Expected: PASS with `review orchestrator checks passed`.

- [ ] **Step 5: Commit review flow logic**

```bash
git add tests/governance-review-orchestrator.test.js mcp/poc/server/modules/governance/review-orchestrator.mjs mcp/poc/server/modules/governance/repository.mjs mcp/poc/server/server.js
git commit -m "feat: add governance review routing and decisions"
```

### Task 4: Publish Approved Assets And Generate Reuse Suggestions

**Files:**
- Modify: `mcp/poc/server/modules/governance/repository.mjs`
- Modify: `mcp/poc/server/modules/governance/reuse-service.mjs`
- Modify: `mcp/poc/server/server.js`
- Test: `tests/governance-reuse-service.test.js`

- [ ] **Step 1: Write failing reuse recommendation tests**

```js
const assert = require('assert');

(async () => {
  const { suggestReuse } = await import('../mcp/poc/server/modules/governance/reuse-service.mjs');

  const suggestions = suggestReuse({
    candidate: { name: 'Customer Order Query', business_domain: 'orders' },
    publishedAssets: [
      { id: 'pub_1', name: 'Order Query', business_domain: 'orders' },
      { id: 'pub_2', name: 'Inventory Sync', business_domain: 'inventory' }
    ]
  });

  assert.equal(suggestions[0].published_asset_id, 'pub_1');
  assert.ok(suggestions[0].score > suggestions[1].score);
  console.log('governance reuse checks passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the reuse tests to verify they fail**

Run: `node tests/governance-reuse-service.test.js`  
Expected: FAIL because `suggestReuse` is not implemented.

- [ ] **Step 3: Implement publish and reuse logic**

```js
// mcp/poc/server/modules/governance/reuse-service.mjs
function similarityScore(candidate, asset) {
  let score = 0;
  if (candidate.business_domain === asset.business_domain) score += 0.6;
  const candidateWords = String(candidate.name || '').toLowerCase().split(/\s+/);
  const assetWords = String(asset.name || '').toLowerCase().split(/\s+/);
  const overlap = candidateWords.filter(word => assetWords.includes(word)).length;
  score += Math.min(0.4, overlap * 0.2);
  return score;
}

export function suggestReuse({ candidate, publishedAssets }) {
  return publishedAssets
    .map(asset => ({
      published_asset_id: asset.id,
      score: similarityScore(candidate, asset),
      suggestion_reason: candidate.business_domain === asset.business_domain ? 'same business domain' : 'name similarity'
    }))
    .sort((a, b) => b.score - a.score);
}
```

```js
// mcp/poc/server/modules/governance/repository.mjs
publishCandidate({ candidate, publishedBy }) {
  const id = candidate.id.replace('cand_', 'pub_');
  db.prepare(`INSERT INTO platform_published_assets (id, candidate_id, project_id, name, business_domain, asset_payload, published_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, candidate.id, candidate.project_id, candidate.name, candidate.business_domain, candidate.raw_payload, publishedBy);
  return db.prepare("SELECT * FROM platform_published_assets WHERE id = ?").get(id);
},
saveReuseSuggestions({ candidateId, projectId, suggestions }) {
  const stmt = db.prepare(`INSERT INTO platform_reuse_suggestions (id, project_id, candidate_id, published_asset_id, score, suggestion_reason) VALUES (?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(items => {
    items.forEach((item, index) => stmt.run(`reuse_${candidateId}_${index}`, projectId, candidateId, item.published_asset_id, item.score, item.suggestion_reason));
  });
  tx(suggestions);
}
```

```js
// mcp/poc/server/server.js
app.post("/api/platform/governance/candidates/:id/publish", requireAuth, (req, res) => {
  const candidate = governanceRepo.getCandidate(req.params.id);
  const published = governanceRepo.publishCandidate({ candidate, publishedBy: req.user.display_name });
  const suggestions = suggestReuse({ candidate, publishedAssets: governanceRepo.listPublishedAssets() });
  governanceRepo.saveReuseSuggestions({ candidateId: candidate.id, projectId: candidate.project_id, suggestions });
  res.json({ published, suggestions });
});
```

- [ ] **Step 4: Re-run reuse recommendation tests**

Run: `node tests/governance-reuse-service.test.js`  
Expected: PASS with `governance reuse checks passed`.

- [ ] **Step 5: Commit publish/reuse support**

```bash
git add tests/governance-reuse-service.test.js mcp/poc/server/modules/governance/reuse-service.mjs mcp/poc/server/modules/governance/repository.mjs mcp/poc/server/server.js
git commit -m "feat: publish reviewed assets and suggest reuse"
```

### Task 5: Add Admin Governance Workbench UI

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/poc/admin/assets/app.js`
- Modify: `mcp/poc/admin/assets/modules/api.js`
- Modify: `mcp/poc/admin/assets/modules/state.js`
- Modify: `mcp/poc/admin/assets/modules/renderers.js`
- Test: `mcp/poc/admin/tests/renderers-import.test.mjs`

- [ ] **Step 1: Extend the UI import smoke check to require governance rendering hooks**

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function createStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
}

globalThis.localStorage = createStorage();
globalThis.window = globalThis;

const fileUrl = pathToFileURL(path.resolve('D:/桌面/mcp方案/mcp/poc/admin/assets/modules/renderers.js')).href;
const mod = await import(`${fileUrl}?case=renderers-import`);
assert.equal(typeof mod.renderAll, 'function');
assert.equal(typeof mod.renderGovernanceWorkbench, 'function');
console.log('renderers import check passed');
```

- [ ] **Step 2: Run the UI import test to verify it fails**

Run: `node mcp/poc/admin/tests/renderers-import.test.mjs`  
Expected: FAIL because `renderGovernanceWorkbench` does not exist.

- [ ] **Step 3: Add governance UI state, API helpers, and renderers**

```js
// mcp/poc/admin/assets/modules/state.js
export const state = {
  // existing fields...
  governance: {
    candidates: [],
    reviewTasks: [],
    publishedAssets: [],
    reuseSuggestions: []
  }
};
```

```js
// mcp/poc/admin/assets/modules/api.js
export async function fetchGovernanceCandidates(token) {
  const res = await fetch('/api/platform/governance/candidates', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}
```

```js
// mcp/poc/admin/assets/modules/renderers.js
export function renderGovernanceWorkbench(root, governance) {
  root.innerHTML = `
    <section class="governance-workbench">
      <h2>接口资产治理</h2>
      <div class="governance-summary">
        <span>候选资产 ${governance.candidates.length}</span>
        <span>待审核 ${governance.reviewTasks.filter(item => item.status === 'open').length}</span>
        <span>已发布 ${governance.publishedAssets.length}</span>
      </div>
    </section>
  `;
}
```

```js
// mcp/poc/admin/assets/app.js
import { fetchGovernanceCandidates } from './modules/api.js';
import { renderGovernanceWorkbench } from './modules/renderers.js';
```

```html
<!-- mcp/poc/admin/index.html -->
<section id="governance-workbench" data-view="governance"></section>
```

- [ ] **Step 4: Re-run the UI import smoke test**

Run: `node mcp/poc/admin/tests/renderers-import.test.mjs`  
Expected: PASS with `renderers import check passed`.

- [ ] **Step 5: Commit the governance workbench UI**

```bash
git add mcp/poc/admin/index.html mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/api.js mcp/poc/admin/assets/modules/state.js mcp/poc/admin/assets/modules/renderers.js mcp/poc/admin/tests/renderers-import.test.mjs
git commit -m "feat: add governance workbench UI"
```

### Task 6: Verify The End-To-End MVP And Document Operator Flow

**Files:**
- Modify: `mcp/poc/HANDOVER.md`
- Test: `tests/governance-api-smoke.test.js`
- Test: `tests/governance-connectors.test.js`
- Test: `tests/governance-review-orchestrator.test.js`
- Test: `tests/governance-reuse-service.test.js`
- Test: `tests/server-syntax.test.js`
- Test: `mcp/poc/admin/tests/renderers-import.test.mjs`

- [ ] **Step 1: Add a handover section for the governance operator flow**

```md
## Governance MVP Flow

1. Import DB/OpenAPI source into the governance pipeline.
2. Review generated candidate assets and risk labels.
3. Resolve open review tasks and record decision reasons.
4. Publish approved assets to the asset repository.
5. Validate generated reuse suggestions for the next project.
```

- [ ] **Step 2: Run all governance/server smoke tests**

Run: `node tests/governance-api-smoke.test.js`  
Expected: PASS

Run: `node tests/governance-connectors.test.js`  
Expected: PASS

Run: `node tests/governance-review-orchestrator.test.js`  
Expected: PASS

Run: `node tests/governance-reuse-service.test.js`  
Expected: PASS

Run: `node tests/server-syntax.test.js`  
Expected: PASS with `server syntax check passed`

Run: `node mcp/poc/admin/tests/renderers-import.test.mjs`  
Expected: PASS with `renderers import check passed`

- [ ] **Step 3: Fix any failing wiring with the smallest possible changes**

```js
// Example minimal fix pattern
if (!candidate.business_domain) {
  candidate.business_domain = 'unclassified';
}
```

```js
// Example route guard pattern
if (!req.body?.decision) {
  return res.status(400).json({ error: 'decision is required' });
}
```

- [ ] **Step 4: Re-run the full verification set**

Run: `node tests/governance-api-smoke.test.js && node tests/governance-connectors.test.js && node tests/governance-review-orchestrator.test.js && node tests/governance-reuse-service.test.js && node tests/server-syntax.test.js && node mcp/poc/admin/tests/renderers-import.test.mjs`  
Expected: all commands PASS.

- [ ] **Step 5: Commit the verified MVP handoff**

```bash
git add mcp/poc/HANDOVER.md tests/governance-api-smoke.test.js tests/governance-connectors.test.js tests/governance-review-orchestrator.test.js tests/governance-reuse-service.test.js tests/server-syntax.test.js mcp/poc/admin/tests/renderers-import.test.mjs
git commit -m "docs: verify governance MVP operator flow"
```

