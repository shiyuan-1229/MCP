// Tool 打造台单元测试
// 覆盖 detectBoundaryConflict + validateHumanToolEdit + diffToolSnapshots

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modUrl = pathToFileURL(path.resolve(__dirname, '..', 'mcp/poc/server/modules/governance/boundary-detector.mjs')).href;

(async () => {
  const {
    detectBoundaryConflict,
    validateHumanToolEdit,
    diffToolSnapshots
  } = await import(modUrl);

  // 1) detectBoundaryConflict — 单 tool 干净没问题
  const clean = detectBoundaryConflict([{ name: 'queryOrder', path: '/orders', method: 'GET' }]);
  assert.equal(clean.has_conflict, false, '单 tool 应无冲突');
  assert.equal(clean.warnings.length, 0, '单 tool 不应有 warning');

  // 2) detectBoundaryConflict — 把不相干端点合并 → 标记"过度合并"
  const overMerged = detectBoundaryConflict([
    { name: 'unifiedTool', paths: ['/orders', '/members', '/payments'] }
  ]);
  assert.equal(overMerged.has_conflict, true, '合并 3 个不相干域应触发冲突');
  assert.ok(
    overMerged.warnings.some(w => w.kind === 'over_merged'),
    '应有 over_merged 警告'
  );

  // 3) detectBoundaryConflict — 拆得过碎 → 标记"过度拆分"
  const overSplit = detectBoundaryConflict([
    { name: 'queryOrder_v1', path: '/orders', method: 'GET' },
    { name: 'queryOrder_v2', path: '/orders', method: 'GET' },
    { name: 'queryOrder_v3', path: '/orders', method: 'GET' },
    { name: 'queryOrder_v4', path: '/orders', method: 'GET' }
  ]);
  assert.equal(overSplit.has_conflict, true, '4 个同名路径应触发过度拆分');
  assert.ok(overSplit.warnings.some(w => w.kind === 'over_split'), '应有 over_split 警告');

  // 4) validateHumanToolEdit — 必填字段
  const validEdit = validateHumanToolEdit({
    name: 'queryOrders',
    display_name: '查询订单',
    description: '按 ID 查询订单详情',
    category: '订单',
    visibility: 'internal',
    write_permission_level: 'read_only'
  });
  assert.equal(validEdit.ok, true, '完整编辑应通过');

  const missingName = validateHumanToolEdit({ display_name: 'x' });
  assert.equal(missingName.ok, false, '缺 name 应被拒');

  const badVisibility = validateHumanToolEdit({
    name: 'x', display_name: 'x', description: 'x',
    category: 'x', visibility: 'wrong', write_permission_level: 'read_only'
  });
  assert.equal(badVisibility.ok, false, '非法 visibility 应被拒');

  // 5) diffToolSnapshots — 列出 AI 与人工版本的字段差异
  const aiTools = [
    { name: 'queryOrders', display_name: 'AI 自动命名', description: 'AI 描述', category: '通用' }
  ];
  const humanTools = [
    { name: 'queryOrders', display_name: '查询订单', description: '按 ID 查询', category: '订单' }
  ];
  const diff = diffToolSnapshots(aiTools, humanTools);
  assert.ok(Array.isArray(diff.changes), 'changes 应为数组');
  assert.ok(diff.changes.length > 0, '应有变更');
  const fields = diff.changes.map(c => c.field);
  assert.ok(fields.includes('display_name'), '应列出 display_name 差异');
  assert.ok(fields.includes('category'), '应列出 category 差异');

  // 6) diffToolSnapshots — 完全相同应返回空变更
  const sameDiff = diffToolSnapshots(humanTools, humanTools);
  assert.equal(sameDiff.changes.length, 0, '完全相同应无变更');

  console.log('builder tooling unit test passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});