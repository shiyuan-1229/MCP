// Tool 打造台集成测试 — schema + repository + API 端到端

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const Database = require(path.resolve('mcp/poc/demo-server/node_modules/better-sqlite3'));

const repoUrl = pathToFileURL(path.resolve('mcp/poc/server/modules/governance/repository.mjs')).href;

(async () => {
  const db = new Database(':memory:');

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
    ai_tools_snapshot TEXT,
    human_tools_snapshot TEXT,
    business_rule_notes TEXT,
    boundary_warning TEXT,
    built_by TEXT,
    built_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  const { createGovernanceRepository } = await import(repoUrl);
  const repo = createGovernanceRepository(db);

  // 1) 插入候选并保存 AI + 人工 Tool
  repo.insertCandidate({
    id: 'cand_build', project_id: 'p1', source_type: 'openapi', source_ref: 's1',
    name: '订单查询', business_domain: '订单', confidence: 0.85, risk_level: 'medium',
    sensitive_hits: '[]', mapping_status: 'unknown', ai_summary: '',
    status: 'pending_review', raw_payload: '{}'
  });

  const aiTools = [
    { name: 'queryOrder', display_name: 'AI 自动命名', description: '查询订单', category: '通用', path: '/orders' }
  ];
  const humanTools = [
    { name: 'queryOrder', display_name: '查询订单详情', description: '按订单 ID 查询详情', category: '订单', path: '/orders', visibility: 'internal', write_permission_level: 'read_only' }
  ];
  const businessRules = '订单 ID 必须传入；返回金额字段为加密的，需要在网关层做脱敏';

  const saveRes = repo.saveToolBuild({
    id: 'cand_build', aiTools, humanTools, businessRules, by: '技术负责人'
  });
  assert.equal(saveRes.ok, true, 'saveToolBuild 应成功');
  assert.equal(saveRes.boundary_conflict, false, '单 Tool 应无冲突');
  assert.equal(saveRes.candidate.built_by, '技术负责人', 'built_by 已写入');
  assert.ok(saveRes.candidate.built_at, 'built_at 已写入');
  assert.equal(saveRes.candidate.business_rule_notes, businessRules, 'business_rule_notes 已写入');

  // 2) 验证 getToolSnapshots 能取回 + diff 有内容
  const snaps = repo.getToolSnapshots('cand_build');
  assert.equal(snaps.ai_tools.length, 1, 'ai_tools 应有 1 条');
  assert.equal(snaps.human_tools.length, 1, 'human_tools 应有 1 条');
  assert.equal(snaps.business_rule_notes, businessRules, '业务规则已保存');
  assert.equal(snaps.built_by, '技术负责人', 'built_by 已取回');

  // 3) 触发边界冲突
  const overMergedHuman = [
    { name: 'megaTool', paths: ['/orders', '/members', '/payments'], display_name: '统一工具', description: 'x', category: '通用' }
  ];
  const conflictRes = repo.saveToolBuild({
    id: 'cand_build', aiTools, humanTools: overMergedHuman, businessRules: '', by: '技术负责人'
  });
  assert.equal(conflictRes.ok, true, '保存应成功');
  assert.equal(conflictRes.boundary_conflict, true, '应检测到边界冲突');
  assert.ok(conflictRes.boundary_warnings.length > 0, '应有边界警告');
  assert.equal(conflictRes.boundary_warnings[0].kind, 'over_merged', '应为 over_merged 类型');
  assert.ok(conflictRes.candidate.boundary_warning, 'boundary_warning 已持久化');

  // 4) 拉取快照，边界警告应被反序列化
  const snaps2 = repo.getToolSnapshots('cand_build');
  assert.ok(snaps2.boundary_warnings.length > 0, 'boundary_warnings 应能反序列化');
  assert.equal(snaps2.boundary_warnings[0].kind, 'over_merged', '反序列化的 kind 正确');

  console.log('builder tooling integration test passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});