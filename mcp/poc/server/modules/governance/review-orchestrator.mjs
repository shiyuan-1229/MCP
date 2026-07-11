// governance/review-orchestrator.mjs
// 决定候选资产的审核等级并生成对应的 review tasks。
//
// 设计要点（来自 docs/superpowers/specs/...governance-design.md）：
//   - auto_pass     高置信、无敏感、与已有标准一致
//   - manual_review 分类模糊、字段语义不稳定、复用建议不明确
//   - dual_review   涉及账号/手机号/证件号/金额/权限/跨系统映射冲突
// 注意：当前实现只创建 task 并记录原因；强制"双人审核通过才能发布"的闭环
// 在 publish 路由（Task 4）里加 check。

import crypto from 'node:crypto';

export function decideReviewLevel(candidate) {
  if (candidate.risk_level === 'high') return 'dual_review';
  if (candidate.risk_level === 'medium') return 'manual_review';
  return 'auto_pass';
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

function safeParseJson(value) {
  if (Array.isArray(value)) return value;
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

export function buildReviewTasksForCandidate(candidate) {
  const level = decideReviewLevel(candidate);
  if (level === 'auto_pass') return [];

  const reasons = [];
  const hits = safeParseJson(candidate.sensitive_hits);
  if (hits.length) reasons.push(`sensitive field hit: ${hits.join(', ')}`);
  if (candidate.mapping_status === 'conflict') reasons.push('mapping conflict');
  if (typeof candidate.confidence === 'number' && candidate.confidence < 0.6) reasons.push('low confidence classification');
  if (!reasons.length) reasons.push('manual review required');

  if (level === 'dual_review') {
    return [
      {
        id: makeId('rev'),
        candidate_id: candidate.id,
        review_type: 'dual_review',
        review_reason: reasons.join('; '),
        assignee_role: 'developer'
      },
      {
        id: makeId('rev'),
        candidate_id: candidate.id,
        review_type: 'dual_review',
        review_reason: reasons.join('; '),
        assignee_role: 'security'
      }
    ];
  }

  return [
    {
      id: makeId('rev'),
      candidate_id: candidate.id,
      review_type: 'manual_review',
      review_reason: reasons.join('; '),
      assignee_role: 'developer'
    }
  ];
}