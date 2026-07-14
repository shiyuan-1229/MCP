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

import { REVIEW_STAGES, REVIEW_STATUS, REVIEW_ACTIONS } from './review-stages.mjs';

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
 *   - mapping_status: 数据库映射状态
 *   - ai_summary: AI识别摘要
 * @returns {{needs_human_review:boolean, gate_reasons:string[], gate_required_for:string[], review_level:string, escalation:boolean}}
 */
export function buildManualGate(candidate) {
  const reasons = [];
  const requiredFor = [];
  const c = candidate || {};
  let reviewLevel = 'auto_pass';
  let escalation = false;

  // 1) 风险等级
  if (c.risk_level === 'high') {
    reasons.push('高风险变更（涉及账号 / 金额 / 权限 / 删除）');
    requiredFor.push('senior_reviewer');
    reviewLevel = 'dual_review';
    escalation = true;
  } else if (c.risk_level === 'medium') {
    reasons.push('中等风险，建议人工复核');
    requiredFor.push('product_owner');
    reviewLevel = 'manual_review';
  }

  // 2) 置信度
  const confidence = Number(c.confidence);
  if (Number.isFinite(confidence) && confidence < 0.7) {
    reasons.push(`AI 识别置信度偏低（${confidence.toFixed(2)} < 0.7）`);
    requiredFor.push('product_owner');
    if (reviewLevel === 'auto_pass') {
      reviewLevel = 'manual_review';
    }
  }

  // 3) 敏感字段
  const hits = Array.isArray(c.sensitive_hits) ? c.sensitive_hits : [];
  if (hits.length > 0) {
    const labels = [...new Set(hits.map(h => h.label))].join(' / ');
    reasons.push(`检测到敏感字段（${labels}），必须人工确认脱敏方案`);
    requiredFor.push('security_reviewer');
    if (reviewLevel === 'auto_pass') {
      reviewLevel = 'manual_review';
    }
    escalation = true;
  }

  // 4) 数据库与OpenAPI描述冲突
  if (c.mapping_status === 'conflict') {
    reasons.push('数据库结构与OpenAPI描述存在冲突，需要人工确认映射关系');
    requiredFor.push('developer');
    if (reviewLevel === 'auto_pass') {
      reviewLevel = 'manual_review';
    }
    escalation = true;
  }

  // 5) 字段语义解释不稳定
  if (c.ai_summary && /ambiguous|unclear|unstable/i.test(c.ai_summary)) {
    reasons.push('字段语义解释不稳定，需要人工确认业务含义');
    requiredFor.push('product_owner');
    if (reviewLevel === 'auto_pass') {
      reviewLevel = 'manual_review';
    }
  }

  // 6) 业务域无法明确归属
  const domain = (c.business_domain || '').toString().toLowerCase().trim();
  if (!domain || AMBIGUOUS_DOMAIN_KEYWORDS.some(k => domain.includes(k))) {
    reasons.push('业务域归属不明或过于通用，需要产品确认');
    requiredFor.push('product_owner');
    if (reviewLevel === 'auto_pass') {
      reviewLevel = 'manual_review';
    }
  }

  // 7) 写操作 / 删除 / 退款
  const op = (c.operation || c.verb || '').toString().toLowerCase();
  if (op && /delete|remove|refund|write|update/.test(op)) {
    reasons.push(`写操作（${op}）需要人工授权`);
    requiredFor.push('senior_reviewer');
    if (reviewLevel === 'auto_pass') {
      reviewLevel = 'manual_review';
    }
    escalation = true;
  }

  // 8) 高风险关键词扫描（备注/描述）
  const desc = `${c.name || ''} ${c.description || ''}`.toLowerCase();
  for (const kw of HIGH_RISK_KEYWORDS) {
    if (kw.test(desc)) {
      reasons.push('文本中包含高风险关键词，需确认业务语义');
      requiredFor.push('senior_reviewer');
      if (reviewLevel === 'auto_pass') {
        reviewLevel = 'manual_review';
      }
      escalation = true;
      break;
    }
  }

  // 根据风险等级和敏感程度确定审核级别
  if (escalation && reviewLevel !== 'dual_review') {
    reviewLevel = 'dual_review';
  }

  // 去重
  const uniqReasons = [...new Set(reasons)];
  const uniqRequiredFor = [...new Set(requiredFor)];

  return {
    needs_human_review: uniqReasons.length > 0,
    gate_reasons: uniqReasons,
    gate_required_for: uniqRequiredFor,
    review_level: reviewLevel,
    escalation: escalation
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

// 发布前门禁条件检查
// stageSummary 为可选参数，由调用方从 repository 传入
export function checkPublishGate(candidate, stageSummary) {
  const summary = stageSummary || {};
  return {
    open_review_tasks: !Object.values(summary).some(stage => stage && stage.open > 0),
    manual_screen_passed: candidate.manual_screen_decision === 'approve',
    tool_boundary_confirmed: candidate.tool_boundary_status === 'confirmed',
    tool_draft_created: Boolean(candidate.tool_draft_id) && candidate.tool_draft_status === 'draft',
    mcp_composition_confirmed: candidate.mcp_composition_status === 'confirmed',
    mcp_draft_created: candidate.mcp_draft_status === 'draft' && Boolean(candidate.mcp_id),
    acceptance_checklist_passed: Number(candidate.acceptance_passed) === 1
  };

  /* Legacy staged checks remain below as historical reference. */
  
  // 1. 检查开放审核任务
  const hasOpenTasks = Object.values(summary).some(stage => stage && stage.open > 0);
  if (hasOpenTasks) {
    return {
      open_review_tasks: false,
      manual_screen_passed: true,
      acceptance_checklist_passed: true
    };
  }
  
  // 2. 检查人工初筛
  const manualScreenPassed = candidate.manual_screen_decision === 'approve';
  if (!manualScreenPassed) {
    return {
      open_review_tasks: true,
      manual_screen_passed: false,
      acceptance_checklist_passed: true
    };
  }
  
  // 3. 检查验收清单
  const acceptancePassed = candidate.acceptance_passed === 1;
  if (!acceptancePassed) {
    return {
      open_review_tasks: true,
      manual_screen_passed: true,
      acceptance_checklist_passed: false
    };
  }
  
  return {
    open_review_tasks: true,
    manual_screen_passed: true,
    acceptance_checklist_passed: true
  };
}

// 发布前门禁结果格式化
export function formatPublishGateResult(gateResult) {
  const failedConditions = Object.entries(gateResult)
    .filter(([_, passed]) => !passed)
    .map(([condition, _]) => {
      switch(condition) {
        case 'open_review_tasks':
          return '还有未完成的审核任务';
        case 'manual_screen_passed':
          return '人工初筛未通过';
        case 'acceptance_checklist_passed':
          return '发布前验收清单未完成';
        default:
          return condition;
      }
    });
  
  return {
    canPublish: failedConditions.length === 0,
    failedConditions,
    blockedReason: failedConditions.length > 0 
      ? `发布被阻断：${failedConditions.join('、')}` 
      : '所有门禁条件满足，可以发布'
  };
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

// ============================================================
// 人工触发规则与升级规则
// ============================================================

/**
 * 构建人工触发审核的请求校验
 * 管理员可以手动为某个 candidate 创建审核任务，指定触发原因
 */
export function validateManualTrigger(trigger) {
  if (!trigger || typeof trigger !== 'object') {
    return { ok: false, error: 'trigger must be an object' };
  }
  const stage = trigger.stage || trigger.review_stage;
  const validStages = [REVIEW_STAGES.CANDIDATE, REVIEW_STAGES.TOOL, REVIEW_STAGES.PUBLISH];
  if (stage && !validStages.includes(stage)) {
    return { ok: false, error: `stage must be one of: ${validStages.join(', ')}` };
  }
  const reason = (trigger.reason || '').trim();
  if (!reason) {
    return { ok: false, error: 'reason is required for manual trigger' };
  }
  if (reason.length > 500) {
    return { ok: false, error: 'reason too long (max 500 chars)' };
  }
  return {
    ok: true,
    normalized: {
      stage: stage || REVIEW_STAGES.CANDIDATE,
      reason,
      trigger_source: 'manual',
      assignee_role: trigger.assignee_role || 'developer',
      review_type: trigger.review_type || 'manual_review'
    }
  };
}

// 升级规则：当某个 stage 的 task 被 reject 时，根据 stage 决定是否要升级
const ESCALATION_RULES = {
  [REVIEW_STAGES.CANDIDATE]: {
    nextStage: REVIEW_STAGES.CANDIDATE, // 候选层 reject -> 重新提交候选层（要求修正后重审）
    nextReviewType: 'escalated_review',
    nextAssignee: 'senior_reviewer',
    autoCreate: true
  },
  [REVIEW_STAGES.TOOL]: {
    nextStage: REVIEW_STAGES.TOOL, // Tool 层 reject -> 升级给 senior reviewer
    nextReviewType: 'escalated_review',
    nextAssignee: 'senior_reviewer',
    autoCreate: true
  },
  [REVIEW_STAGES.PUBLISH]: {
    nextStage: null, // 发布验收层 reject -> 不自动创建，直接阻断发布
    nextReviewType: null,
    nextAssignee: null,
    autoCreate: false
  }
};

/**
 * 根据被拒绝的审核任务，决定是否需要升级
 * @param {object} rejectedTask - 已被 reject 的审核任务（含 review_stage, decision, candidate_id）
 * @returns {{shouldEscalate:boolean, nextStage?:string, nextReviewType?:string, nextAssignee?:string, reason?:string}}
 */
export function buildEscalation(rejectedTask) {
  if (!rejectedTask) return { shouldEscalate: false };
  // 只有 decision = reject 才触发升级
  if (rejectedTask.decision !== REVIEW_ACTIONS.REJECT) {
    return { shouldEscalate: false };
  }
  const stage = rejectedTask.review_stage || REVIEW_STAGES.CANDIDATE;
  const rule = ESCALATION_RULES[stage];
  if (!rule || !rule.autoCreate) {
    return { shouldEscalate: false };
  }
  return {
    shouldEscalate: true,
    nextStage: rule.nextStage,
    nextReviewType: rule.nextReviewType,
    nextAssignee: rule.nextAssignee,
    reason: `升级审核：${stage} 层被拒绝（${rejectedTask.decision_reason || '原因未填写'}），自动升级到 ${rule.nextAssignee}`
  };
}

/**
 * 检查某个 candidate 是否满足从当前 stage 进入下一 stage 的条件
 * @param {object} stageSummary - 来自 getReviewStageSummary 的结果
 * @param {string} currentStage - 当前阶段
 * @returns {{canAdvance:boolean, blocker?:string}}
 */
export function checkStageAdvancement(stageSummary, currentStage) {
  if (!stageSummary || !stageSummary[currentStage]) {
    return { canAdvance: true }; // 该阶段没有任务，不阻断
  }
  const stageInfo = stageSummary[currentStage];
  if (stageInfo.open > 0) {
    return { canAdvance: false, blocker: `${currentStage} 还有 ${stageInfo.open} 个未完成的审核任务` };
  }
  if (stageInfo.rejected > 0) {
    return { canAdvance: false, blocker: `${currentStage} 有 ${stageInfo.rejected} 个审核被拒绝，需要修正后重新提交` };
  }
  return { canAdvance: true };
}
