// 发布前验收阻断集成测试
// 不启动 server，而是直接用 better-sqlite3 在内存库验证 publishCandidate 阻断逻辑

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  // 动态加载 better-sqlite3（从 mcp/poc/demo-server/node_modules，native binding 兼容当前 Node）
  const Database = require(path.resolve(__dirname, '..', 'mcp/poc/server/node_modules/better-sqlite3'));

  const db = new Database(':memory:');

  // 建表（与 server.js 中 CREATE TABLE 完全一致）
  db.exec(`CREATE TABLE IF NOT EXISTS platform_projects (
    id TEXT PRIMARY KEY, name TEXT, customer_id TEXT
  )`);
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
    manual_screen_status TEXT DEFAULT 'pending',
    manual_screen_by TEXT,
    manual_screen_at TEXT,
    manual_screen_decision TEXT,
    manual_screen_reason TEXT,
    needs_human_review INTEGER DEFAULT 0,
    acceptance_passed INTEGER DEFAULT 0,
    acceptance_by TEXT,
    acceptance_at TEXT,
    acceptance_checklist TEXT,
    publish_block_reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_published_assets (
    id TEXT PRIMARY KEY, candidate_id TEXT, project_id TEXT, name TEXT,
    business_domain TEXT, asset_payload TEXT, published_by TEXT,
    published_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_review_tasks (
    id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, review_type TEXT NOT NULL,
    review_reason TEXT NOT NULL, assignee_role TEXT NOT NULL,
    status TEXT DEFAULT 'open', decision TEXT, decision_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')), resolved_at TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_reuse_suggestions (
    id TEXT PRIMARY KEY, project_id TEXT, candidate_id TEXT, published_asset_id TEXT,
    score REAL DEFAULT 0, suggestion_reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // 装载 repository（动态 import .mjs）
  const repoUrl = pathToFileURL(path.resolve(__dirname, '..', 'mcp/poc/server/modules/governance/repository.mjs')).href;
  const { createGovernanceRepository } = await import(repoUrl);
  const manualUrl = pathToFileURL(path.resolve(__dirname, '..', 'mcp/poc/server/modules/governance/manual-checks.mjs')).href;
  const { checkPublishGate, formatPublishGateResult, validateAcceptanceChecklist } = await import(manualUrl);

  const repo = createGovernanceRepository(db);

  const incompleteGate = checkPublishGate({
    manual_screen_decision: 'approve',
    acceptance_passed: 1,
    tool_boundary_status: 'confirmed',
    tool_draft_id: 'tool_draft_1',
    tool_draft_status: 'draft',
    mcp_composition_status: 'not_started',
    mcp_draft_status: 'not_started',
    mcp_id: null
  }, {});
  assert.equal(incompleteGate.mcp_composition_confirmed, false);
  assert.equal(formatPublishGateResult(incompleteGate).canPublish, false);

  // 准备项目
  db.prepare('INSERT INTO platform_projects (id, name, customer_id) VALUES (?, ?, ?)').run('proj_1', 'Demo Project', 'cust_1');

  // 准备 candidate：未做初筛、未做验收
  repo.insertCandidate({
    id: 'cand_1',
    project_id: 'proj_1',
    source_type: 'openapi',
    source_ref: 'spec.json',
    name: '订单查询',
    business_domain: 'orders',
    confidence: 0.9,
    risk_level: 'medium',
    sensitive_hits: '[]',
    mapping_status: 'unknown',
    ai_summary: null,
    raw_payload: '{}',
    status: 'pending_review'
  });

  const c1 = repo.getCandidate('cand_1');
  assert.equal(c1.acceptance_passed, 0, 'candidate 默认 acceptance_passed = 0');
  assert.equal(c1.manual_screen_decision, null, 'candidate 默认 manual_screen_decision 为 null');

  // 模拟 publish 路由的 3 道关卡
  function tryPublish(candidate) {
    const openTasks = repo.listOpenReviewTasksForCandidate(candidate.id);
    if (openTasks.length > 0) return { blocked: true, reason: 'open_review_tasks' };
    if (candidate.manual_screen_decision === 'reject') return { blocked: true, reason: 'manual_screen_reject' };
    if (!candidate.acceptance_passed) return { blocked: true, reason: 'acceptance_not_passed' };
    return { blocked: false };
  }

  // 第一次尝试 → 应被阻断
  let result = tryPublish(c1);
  assert.equal(result.blocked, true, '未做验收时 publish 应被阻断');
  assert.equal(result.reason, 'acceptance_not_passed', '阻断原因应为 acceptance_not_passed');

  // 做验收但不完整
  const partial = { business_result_correct: true, sensitive_handled: false };
  const valid = validateAcceptanceChecklist(partial);
  repo.updateAcceptance({
    id: 'cand_1',
    passed: valid.passed,
    checklist: partial,
    by: 'tester',
    blockReason: valid.passed ? '' : valid.reason
  });

  const c2 = repo.getCandidate('cand_1');
  assert.equal(c2.acceptance_passed, 0, '部分未勾选时 acceptance_passed 应为 0');
  result = tryPublish(c2);
  assert.equal(result.blocked, true, '部分验收未通过时 publish 应被阻断');
  assert.equal(c2.publish_block_reason.length > 0, true, '应记录 publish_block_reason');

  // 完整验收
  const fullChecklist = {
    business_result_correct: true,
    sensitive_handled: true,
    permission_scoped: true,
    write_op_confirmed: true,
    delivery_doc_ready: true,
    rollback_plan_ready: true
  };
  const fullValid = validateAcceptanceChecklist(fullChecklist);
  assert.equal(fullValid.passed, true, '完整勾选应通过');
  repo.updateAcceptance({
    id: 'cand_1',
    passed: fullValid.passed,
    checklist: fullChecklist,
    by: 'tester',
    blockReason: ''
  });

  const c3 = repo.getCandidate('cand_1');
  assert.equal(c3.acceptance_passed, 1, '完整验收后 acceptance_passed 应为 1');
  assert.equal(c3.publish_block_reason, '', '通过验收后 publish_block_reason 应被清空');

  result = tryPublish(c3);
  assert.equal(result.blocked, false, '验收通过后 publish 不应被阻断');

  // 走通 publishCandidate
  const published = repo.publishCandidate({ candidate: c3, publishedBy: 'tester' });
  assert.ok(published && published.id, 'publishCandidate 应返回新发布的资产');
  assert.equal(published.candidate_id, 'cand_1', 'published_asset 应关联到 candidate');

  // 验证 builder metrics 工作
  const metrics = repo.builderMetrics();
  assert.equal(metrics.total_published, 1, 'metrics 应记录 1 条已发布');
  assert.equal(metrics.pending_publishes, 0, '发布后 pending_publishes 应为 0');
  assert.ok(metrics.reuse_category_text, 'metrics 应包含 reuse_category_text');

  console.log('builder publish block integration test passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
