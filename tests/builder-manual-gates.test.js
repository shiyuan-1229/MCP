// 人工卡点单元测试
// 覆盖 detectSensitiveHits / buildManualGate / validateManualDecision / validateAcceptanceChecklist

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modUrl = pathToFileURL(path.resolve(__dirname, '..', 'mcp/poc/server/modules/governance/manual-checks.mjs')).href;

(async () => {
  const mod = await import(modUrl);
  const {
    detectSensitiveHits,
    buildManualGate,
    validateManualDecision,
    validateAcceptanceChecklist,
    getAcceptanceRequiredFields,
    explainPublishBlock
  } = mod;

  // 1) detectSensitiveHits — 命中手机号、身份证、金额
  const hits = detectSensitiveHits([
    { name: 'user_phone' },
    { name: 'id_card' },
    { name: 'order_amount' },
    { name: 'safe_field' }
  ]);
  const labels = hits.map(h => h.label).sort();
  assert.deepEqual(labels, ['手机号', '身份证号', '金额'], '敏感字段识别应包含手机号 / 身份证号 / 金额');

  // 2) buildManualGate — 高风险 / 敏感 / 低置信度 均应要求人工
  const gateHigh = buildManualGate({
    risk_level: 'high',
    confidence: 0.95,
    business_domain: 'orders',
    sensitive_hits: [{ field: 'phone', label: '手机号' }]
  });
  assert.equal(gateHigh.needs_human_review, true, '高风险 + 敏感字段应要求人工');
  assert.ok(gateHigh.gate_required_for.includes('senior_reviewer'), '高风险应要求 senior_reviewer');
  assert.ok(gateHigh.gate_required_for.includes('security_reviewer'), '敏感字段应要求 security_reviewer');

  const gateLowConfidence = buildManualGate({
    risk_level: 'low',
    confidence: 0.55,
    business_domain: 'orders'
  });
  assert.equal(gateLowConfidence.needs_human_review, true, '低置信度应要求人工');
  assert.ok(gateLowConfidence.gate_reasons.some(r => r.includes('置信度')), '低置信度原因应被列出');

  const gateSafe = buildManualGate({
    risk_level: 'low',
    confidence: 0.95,
    business_domain: 'orders'
  });
  assert.equal(gateSafe.needs_human_review, false, '低风险 + 高置信度 + 明确业务域应无需人工');

  // 3) validateManualDecision
  assert.equal(validateManualDecision({ action: 'approve' }).ok, true, 'approve 应通过');
  assert.equal(validateManualDecision({ action: 'reject' }).ok, false, 'reject 缺 reason 应被拒');
  assert.equal(
    validateManualDecision({ action: 'reject', reason: '权限过大' }).ok,
    true,
    'reject 带 reason 应通过'
  );
  assert.equal(validateManualDecision({ action: 'unknown' }).ok, false, '未知 action 应被拒');

  // 4) validateAcceptanceChecklist
  const required = getAcceptanceRequiredFields();
  assert.ok(required.length >= 6, '应有 ≥6 项验收必填项');
  const fullPass = {};
  for (const k of required) fullPass[k] = true;
  assert.equal(validateAcceptanceChecklist(fullPass).passed, true, '全部勾选应通过');

  const partial = { ...fullPass, sensitive_handled: false };
  const blocked = validateAcceptanceChecklist(partial);
  assert.equal(blocked.passed, false, '部分未勾选应阻断');
  assert.ok(blocked.missing.includes('sensitive_handled'), '缺失项应包含 sensitive_handled');

  const empty = validateAcceptanceChecklist({});
  assert.equal(empty.passed, false, '空清单应阻断');

  // 5) explainPublishBlock
  const explain = explainPublishBlock(blocked);
  assert.ok(explain.includes('发布被阻断'), '阻断原因解释应包含「发布被阻断」');
  assert.ok(explain.includes('sensitive_handled'), '解释应列出缺失项');

  console.log('builder manual gates unit test passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});