// governance/review-orchestrator.mjs
// 决定候选资产的审核等级并生成对应的 review tasks。
//
// 设计要点：
//   - auto_pass     高置信、无敏感、与已有标准一致
//   - manual_review 分类模糊、字段语义不稳定、复用建议不明确
//   - dual_review   涉及账号/手机号/证件号/金额/权限/跨系统映射冲突

import crypto from 'node:crypto';
import {
  REVIEW_STAGES,
  REVIEW_STATUS,
  REVIEW_ACTIONS,
  ESCALATION_RULES,
  TOOL_REVIEW_CHECKLIST
} from './review-stages.mjs';
import {
  buildManualGate,
  checkPublishGate,
  formatPublishGateResult
} from './manual-checks.mjs';

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

function safeParseJson(value) {
  if (Array.isArray(value)) return value;
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

// ============================================================
// 审核等级判定
// ============================================================

export function decideReviewLevel(candidate) {
  const gateResult = buildManualGate(candidate);
  return gateResult.review_level;
}

// ============================================================
// 构建三层审核任务列表
// ============================================================

export function buildReviewTasksForCandidate(candidate) {
  const gateResult = buildManualGate(candidate);
  const level = gateResult.review_level;

  if (level === 'auto_pass') return [];

  const reasons = gateResult.gate_reasons;
  const tasks = [];

  // 第一层：候选资产审核
  if (level === 'dual_review') {
    tasks.push({
      id: makeId('rev'),
      candidate_id: candidate.id,
      review_stage: REVIEW_STAGES.CANDIDATE,
      review_type: 'dual_review',
      review_reason: reasons.join('; '),
      assignee_role: 'developer'
    });
    tasks.push({
      id: makeId('rev'),
      candidate_id: candidate.id,
      review_stage: REVIEW_STAGES.CANDIDATE,
      review_type: 'dual_review',
      review_reason: reasons.join('; '),
      assignee_role: 'security'
    });
  } else if (level === 'manual_review') {
    tasks.push({
      id: makeId('rev'),
      candidate_id: candidate.id,
      review_stage: REVIEW_STAGES.CANDIDATE,
      review_type: 'manual_review',
      review_reason: reasons.join('; '),
      assignee_role: 'developer'
    });
  }

  // 第二层：Tool 审核（当候选有 tools 信息或风险等级为 high/dual_review 时产生）
  const hasTools = safeParseJson(candidate.ai_tools_snapshot).length > 0 ||
                   safeParseJson(candidate.human_tools_snapshot).length > 0;
  if (hasTools || level === 'dual_review') {
    tasks.push({
      id: makeId('rev'),
      candidate_id: candidate.id,
      review_stage: REVIEW_STAGES.TOOL,
      review_type: 'tool_review',
      review_reason: 'Tool 组织和命名需要人工确认',
      assignee_role: 'developer'
    });
  }

  return tasks;
}

// ============================================================
// 阶段元数据
// ============================================================

export function getStageMetadata() {
  return [
    { stage: REVIEW_STAGES.CANDIDATE, name: '候选资产审核', order: 1, gate: false, description: '验证AI识别出来的候选是否可信' },
    { stage: REVIEW_STAGES.TOOL, name: 'Tool审核', order: 2, gate: false, description: '验证Tool的组织和命名是否合理' },
    { stage: REVIEW_STAGES.PUBLISH, name: '发布验收', order: 3, gate: true, description: '最终验证MCP是否可以发布' }
  ];
}

// ============================================================
// 发布前门禁检查
// ============================================================

export function checkCandidatePublishReadiness(candidate, stageSummary) {
  const gateResult = checkPublishGate(candidate, stageSummary);
  const formattedResult = formatPublishGateResult(gateResult);

  return {
    canPublish: formattedResult.canPublish,
    blockedReason: formattedResult.blockedReason,
    gateResult: gateResult
  };
}

// ============================================================
// Tool 审核重点
// ============================================================

export function getToolReviewChecklist() {
  return { ...TOOL_REVIEW_CHECKLIST };
}

export function evaluateToolReview(candidate, reviewResults) {
  const issues = [];
  const warnings = [];
  const passes = [];

  const aiTools = safeParseJson(candidate.ai_tools_snapshot);
  const humanTools = safeParseJson(candidate.human_tools_snapshot);
  const allTools = [...aiTools, ...humanTools];

  // 检查拆分/合并合理性
  if (allTools.length > 5) {
    issues.push('工具数量过多（>5个），建议合并或重新组织');
  } else if (allTools.length === 1 && candidate.risk_level === 'high') {
    warnings.push('高风险操作使用单一工具，建议拆分为多个工具');
  } else {
    passes.push('工具数量合理');
  }

  // 检查参数暴露
  for (const tool of allTools) {
    if (tool.parameters) {
      const sensitiveParams = tool.parameters.filter(p => p.sensitive);
      if (sensitiveParams.length > 0) {
        warnings.push(`工具${tool.name || tool.tool_name || ''}包含敏感参数：${sensitiveParams.map(p => p.name).join(', ')}`);
      }
    }
  }

  // 检查写操作风险
  const writeOps = allTools.filter(t => {
    const op = (t.operation_type || t.operation || t.verb || '').toString().toLowerCase();
    return /write|delete|update|create/.test(op);
  });
  if (writeOps.length > 0) {
    const highRiskWrites = writeOps.filter(t => t.risk_level === 'high');
    if (highRiskWrites.length > 0) {
      issues.push(`高风险写操作工具：${highRiskWrites.map(t => t.name || t.tool_name || '').filter(Boolean).join(', ')}`);
    } else {
      warnings.push(`存在写操作工具（${writeOps.length}个），需要确认权限范围`);
    }
  } else {
    passes.push('无写操作风险');
  }

  // 检查权限范围
  if (candidate.risk_level === 'high' && allTools.length > 0) {
    warnings.push('高风险候选，需确认权限范围是否合理');
  }

  return { issues, warnings, passes };
}

// ============================================================
// 升级机制 & 修改后重审闭环
// ============================================================

export function buildEscalation(rejectedTask) {
  if (!rejectedTask) return { shouldEscalate: false };
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
 * 处理审核决策，生成下一步动作建议
 * 调用方（server.js 路由）负责实际写数据库
 */
export function handleReviewDecision(task, decision, reviewNotes) {
  if (!task) throw new Error('Review task not found');

  if (decision === 'approve') {
    return { status: 'resolved', decision, review_notes: reviewNotes };
  }

  if (decision === 'reject') {
    const escalation = buildEscalation({ ...task, decision });
    if (escalation.shouldEscalate) {
      return {
        status: 'resolved',
        decision,
        review_notes: reviewNotes,
        escalate: {
          review_stage: escalation.nextStage,
          review_type: escalation.nextReviewType,
          assignee_role: escalation.nextAssignee,
          review_reason: escalation.reason,
          parent_task_id: task.id
        }
      };
    }
    return { status: 'resolved', decision, review_notes: reviewNotes };
  }

  if (decision === 'modify') {
    return {
      status: 'modified',
      decision,
      review_notes: reviewNotes,
      next_action: 'needs_modification_and_resubmit'
    };
  }

  return { status: 'resolved', decision: 'unknown', review_notes: reviewNotes };
}
