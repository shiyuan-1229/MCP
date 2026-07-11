// 误识别复盘集成测试 — 验证 schema / repository / API 端到端
// 用真实 better-sqlite3 内存库 + 真实 server.js 模块加载

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// 用 better-sqlite3 内存库 + 直接调 repository 来验证
const Database = require(path.resolve('mcp/poc/demo-server/node_modules/better-sqlite3'));

const repoUrl = pathToFileURL(path.resolve('mcp/poc/server/modules/governance/repository.mjs')).href;

(async () => {
  const db = new Database(':memory:');

  // 建最小 governance schema（仅 retro 相关列）
  db.exec(`CREATE TABLE platform_candidate_assets (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    source_type TEXT,
    source_ref TEXT,
    name TEXT,
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
    retro_reason TEXT,
    retro_note TEXT,
    retro_recorded_by TEXT,
    retro_recorded_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  const { createGovernanceRepository } = await import(repoUrl);
  const repo = createGovernanceRepository(db);

  // 1) 插入 3 个候选，分别给 reject / modify / approve 决策
  const seedCandidate = (id, name, domain) => repo.insertCandidate({
    id, project_id: 'p1', source_type: 'openapi', source_ref: `s_${id}`,
    name, business_domain: domain, confidence: 0.8, risk_level: 'medium',
    sensitive_hits: '[]', mapping_status: 'unknown', ai_summary: '',
    status: 'pending_review', raw_payload: '{}'
  });
  seedCandidate('cand_1', '商品查询', '商品');
  seedCandidate('cand_2', '订单查询', '订单');
  seedCandidate('cand_3', '会员查询', '会员');

  repo.updateManualScreen({ id: 'cand_1', decision: 'reject', reason: '分类错', by: '产品经理A' });
  repo.updateManualScreen({ id: 'cand_2', decision: 'modify', reason: '字段名需改', by: '技术负责人B' });
  repo.updateManualScreen({ id: 'cand_3', decision: 'approve', reason: '', by: '产品经理A' });

  // 2) 给 cand_1 / cand_2 记录复盘；cand_3 应被拒绝
  const r1 = repo.recordRetro({ id: 'cand_1', reason: 'classification_error', note: '应该是订单域', by: '产品经理A' });
  assert.equal(r1.ok, true, 'reject 应允许复盘');
  assert.equal(r1.candidate.retro_reason, 'classification_error', 'retro_reason 已写入');
  assert.equal(r1.candidate.retro_note, '应该是订单域', 'retro_note 已写入');
  assert.equal(r1.candidate.retro_recorded_by, '产品经理A', 'retro_recorded_by 已写入');
  assert.ok(r1.candidate.retro_recorded_at, 'retro_recorded_at 自动填充');

  const r2 = repo.recordRetro({ id: 'cand_2', reason: 'field_understanding_error', note: 'user_phone 应是加密字段', by: '技术负责人B' });
  assert.equal(r2.ok, true, 'modify 应允许复盘');

  const r3 = repo.recordRetro({ id: 'cand_3', reason: 'other', note: '不应该被允许', by: 'x' });
  assert.equal(r3.ok, false, 'approve 不应允许复盘');
  assert.ok(r3.error.includes('reject') || r3.error.includes('modify'), '错误信息应提示');

  // 3) retroSummary 聚合
  const summary = repo.retroSummary();
  assert.equal(summary.total_retros, 2, '应有 2 条复盘');
  assert.equal(summary.by_reason.classification_error, 1, 'classification_error 计数应为 1');
  assert.equal(summary.by_reason.field_understanding_error, 1, 'field_understanding_error 计数应为 1');
  assert.equal(summary.top_reason, 'classification_error', 'top_reason 应为 classification_error');

  console.log('builder retro integration test passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});