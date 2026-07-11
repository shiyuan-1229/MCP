// ============================================================
// manual-checks.mjs — 人工审核辅助
//
// 用途：
//   1) detectSensitiveHits：根据字段名/路径识别敏感字段
//   2) buildManualGate：根据 candidate 业务属性判断是否需要人工介入
//   3) validateManualDecision：校验人工初筛的 approve / reject / modify 决策
//
// 不依赖数据库，单测可独立运行。
// ============================================================

const SENSITIVE_FIELD_PATTERNS = [
  { pattern: /(^|[_\-])(phone|mobile|cellphone)([_\-]|$)/i, label: '手机号' },
  { pattern: /(^|[_\-])(id_?card|idcard|id_?no|idnum)([_\-]|$)/i, label: '身份证号' },
  { pattern: /(^|[_\-])(bank_?card|account_?no|account)([_\-]|$)/i, label: '银行账号' },
  { pattern: /(^|[_\-])(email)([_\-]|$)/i, label: '邮箱' },
  { pattern: /(^|[_\-])(password|secret|token|api_?key|apikey)([_\-]|$)/i, label: '凭证' },
  { pattern: /(^|[_\-])(amount|price|total|fee|salary|wage)([_\-]|$)/i, label: '金额' },
  { pattern: /(^|[_\-])(address|home_?addr|street)([_\-]|$)/i, label: '地址' },
  { pattern: /(^|[_\-])(ssn)([_\-]|$)/i, label: '社会安全号' }
];

const HIGH_RISK_KEYWORDS = [
  /delete|remove|drop/i,
  /refund|退款/i,
  /付款|支付|支付/i,
  /转账|提现|withdraw/i,
  /权限|permission/i,
  /admin|manage/i,
  /disable|停用|禁用/i
];

const AMBIGUOUS_DOMAIN_KEYWORDS = [
  '通用', 'common', 'misc', 'temp', 'tmp', '其他', 'other'
];

/**
 * 检测字段列表里的敏感字段命中
 * @param {Array<{name:string, path?:string, type?:string}>} fields
 * @returns {Array<{field:string, label:string}>}
 */
export function detectSensitiveHits(fields) {
  if (!Array.isArray(fields)) return [];
  const hits = [];
  for (const f of fields) {
    const name = (f?.name || f?.path || '').toString();
    if (!name) continue;
    for (const rule of SENSITIVE_FIELD_PATTERNS) {
      if (rule.pattern.test(name)) {
        hits.push({ field: name, label: rule.label });
        break;
      }
    }
  }
  return hits;
}

/**
 * 评估某个 candidate 是否需要人工介入，以及介入的原因清单
 * @param {object} candidate
 *   - confidence: 0~1，< 0.7 即认为 AI 信心不足
 *   - risk_level: 'low'|'medium'|'high'
 *   - business_domain: 业务域字符串
 *   - sensitive_hits: 来自 detectSensitiveHits 的结果
 *   - operation: 'read'|'write'|'delete' 等操作类型（可选）
 * @returns {{needs_human_review:boolean, gate_reasons:string[], gate_required_for:string[]}}
 */
export function buildManualGate(candidate) {
  const reasons = [];
  const requiredFor = [];
  const c = candidate || {};

  // 1) 风险等级
  if (c.risk_level === 'high') {
    reasons.push('高风险变更（涉及账号 / 金额 / 权限 / 删除）');
    requiredFor.push('senior_reviewer');
  } else if (c.risk_level === 'medium') {
    reasons.push('中等风险，建议人工复核');
    requiredFor.push('product_owner');
  }

  // 2) 置信度
  const confidence = Number(c.confidence);
  if (Number.isFinite(confidence) && confidence < 0.7) {
    reasons.push(`AI 置信度偏低（${confidence.toFixed(2)} < 0.7）`);
    requiredFor.push('product_owner');
  }

  // 3) 敏感字段
  const hits = Array.isArray(c.sensitive_hits) ? c.sensitive_hits : [];
  if (hits.length > 0) {
    const labels = [...new Set(hits.map(h => h.label))].join(' / ');
    reasons.push(`检测到敏感字段（${labels}），必须人工确认脱敏方案`);
    requiredFor.push('security_reviewer');
  }

  // 4) 写操作 / 删除 / 退款
  const op = (c.operation || c.verb || '').toString().toLowerCase();
  if (op && /delete|remove|refund|write|update/.test(op)) {
    reasons.push(`写操作（${op}）需要人工授权`);
    requiredFor.push('senior_reviewer');
  }

  // 5) 业务域模糊
  const domain = (c.business_domain || '').toString().toLowerCase().trim();
  if (!domain || AMBIGUOUS_DOMAIN_KEYWORDS.some(k => domain.includes(k))) {
    reasons.push('业务域归属不明或过于通用，需要产品确认');
    requiredFor.push('product_owner');
  }

  // 6) 高风险关键词扫描（备注/描述）
  const desc = `${c.name || ''} ${c.description || ''}`.toLowerCase();
  for (const kw of HIGH_RISK_KEYWORDS) {
    if (kw.test(desc)) {
      reasons.push('文本中包含高风险关键词，需确认业务语义');
      requiredFor.push('senior_reviewer');
      break;
    }
  }

  // 去重
  const uniqReasons = [...new Set(reasons)];
  const uniqRequiredFor = [...new Set(requiredFor)];

  return {
    needs_human_review: uniqReasons.length > 0,
    gate_reasons: uniqReasons,
    gate_required_for: uniqRequiredFor
  };
}

const VALID_DECISIONS = new Set(['approve', 'reject', 'modify']);

/**
 * 校验人工初筛决策
 * @param {object} decision
 * @returns {{ok:boolean, error?:string, normalized?:object}}
 */
export function validateManualDecision(decision) {
  if (!decision || typeof decision !== 'object') {
    return { ok: false, error: 'decision must be an object' };
  }
  const action = decision.action || decision.decision;
  if (!action || !VALID_DECISIONS.has(action)) {
    return { ok: false, error: 'action must be one of approve / reject / modify' };
  }
  if (action === 'reject' && !decision.reason) {
    return { ok: false, error: 'reject 必须填写 reason' };
  }
  return {
    ok: true,
    normalized: {
      action,
      reason: decision.reason || '',
      notes: decision.notes || '',
      modified_fields: Array.isArray(decision.modified_fields) ? decision.modified_fields : []
    }
  };
}

const ACCEPTANCE_REQUIRED_FIELDS = [
  'business_result_correct',
  'sensitive_handled',
  'permission_scoped',
  'write_op_confirmed',
  'delivery_doc_ready',
  'rollback_plan_ready'
];

export function getAcceptanceRequiredFields() {
  return [...ACCEPTANCE_REQUIRED_FIELDS];
}

/**
 * 校验发布前验收清单：所有必填项都必须为 true
 * @param {object} checklist
 * @returns {{passed:boolean, missing:string[], reason?:string}}
 */
export function validateAcceptanceChecklist(checklist) {
  if (!checklist || typeof checklist !== 'object') {
    return { passed: false, missing: [...ACCEPTANCE_REQUIRED_FIELDS], reason: '验收清单为空' };
  }
  const missing = ACCEPTANCE_REQUIRED_FIELDS.filter(key => checklist[key] !== true);
  if (missing.length > 0) {
    return {
      passed: false,
      missing,
      reason: `发布前验收未通过：${missing.length} 项未确认（${missing.join(' / ')}）`
    };
  }
  return { passed: true, missing: [] };
}

/**
 * 把发布前阻断原因格式化成给 UI 的短句
 */
export function explainPublishBlock(blockInfo) {
  if (!blockInfo || blockInfo.passed) return '';
  if (Array.isArray(blockInfo.missing) && blockInfo.missing.length > 0) {
    return `发布被阻断：${blockInfo.reason || '验收未完成'}。待补：${blockInfo.missing.join(' / ')}`;
  }
  return `发布被阻断：${blockInfo.reason || '前置条件未满足'}`;
}