// 误识别复盘单元测试
// 覆盖 RETRO_REASONS 枚举、validateRetroReason、canRecordRetro、buildRetroHint、summarizeRetro

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modUrl = pathToFileURL(path.resolve(__dirname, '..', 'mcp/poc/server/modules/governance/retro-service.mjs')).href;

(async () => {
  const {
    RETRO_REASONS,
    validateRetroReason,
    canRecordRetro,
    buildRetroHint,
    summarizeRetro
  } = await import(modUrl);

  // 1) RETRO_REASONS — 6 类枚举 + 默认「其他」
  assert.ok(Array.isArray(RETRO_REASONS), 'RETRO_REASONS 应为数组');
  assert.ok(RETRO_REASONS.length >= 6, '至少有 6 类原因');
  const labels = RETRO_REASONS.map(r => r.value);
  for (const expected of ['classification_error', 'field_understanding_error', 'sensitivity_misjudge', 'tool_boundary_error', 'business_meaning_error', 'other']) {
    assert.ok(labels.includes(expected), `应包含枚举 ${expected}`);
  }

  // 2) validateRetroReason
  assert.equal(validateRetroReason('classification_error').ok, true, '合法 reason 应通过');
  assert.equal(validateRetroReason('something_random').ok, false, '非法 reason 应被拒');
  assert.equal(validateRetroReason(null).ok, false, 'null 应被拒');

  // 3) canRecordRetro — 只有 reject / modify 才能记录复盘
  assert.equal(canRecordRetro({ manual_screen_decision: 'reject' }), true, 'reject 应允许复盘');
  assert.equal(canRecordRetro({ manual_screen_decision: 'modify' }), true, 'modify 应允许复盘');
  assert.equal(canRecordRetro({ manual_screen_decision: 'approve' }), false, 'approve 不应允许复盘');
  assert.equal(canRecordRetro({}), false, '空对象不应允许复盘');
  assert.equal(canRecordRetro(null), false, 'null 不应允许复盘');

  // 4) buildRetroHint — 频次高时给出可读提示
  const emptyHint = buildRetroHint({});
  assert.equal(emptyHint, '', '空汇总应返回空串');

  const populatedSummary = summarizeRetro([
    { retro_reason: 'classification_error' },
    { retro_reason: 'classification_error' },
    { retro_reason: 'field_understanding_error' },
    { retro_reason: 'tool_boundary_error' }
  ]);
  assert.equal(populatedSummary.total, 4, '总数应为 4');
  assert.equal(populatedSummary.by_reason.classification_error, 2, '分类错误应有 2 次');
  assert.ok(populatedSummary.top_reason === 'classification_error', 'top_reason 应该是 classification_error');

  const hint = buildRetroHint(populatedSummary);
  assert.ok(hint.includes('classification_error') || hint.includes('分类'), 'hint 应包含高频原因');
  assert.ok(hint.includes('2'), 'hint 应包含次数');

  // 5) buildRetroHint — limit 不存在时只列前 3 个
  const manyReasons = summarizeRetro([
    { retro_reason: 'classification_error' },
    { retro_reason: 'classification_error' },
    { retro_reason: 'classification_error' },
    { retro_reason: 'field_understanding_error' },
    { retro_reason: 'field_understanding_error' },
    { retro_reason: 'sensitivity_misjudge' }
  ]);
  const topHint = buildRetroHint(manyReasons, { top: 2 });
  assert.ok(topHint.length > 0, 'top=2 时也应生成 hint');
  assert.ok(topHint.includes('分类错误'), 'top=2 应包含最高频项的 label');
  assert.ok(!topHint.includes('tool_boundary_error'), 'top=2 时不应包含低频项');

  console.log('builder retro unit test passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});