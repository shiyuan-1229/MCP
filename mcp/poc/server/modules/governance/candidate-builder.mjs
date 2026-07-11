// governance/candidate-builder.mjs
// 把归一化后的源数据 + AI 初判结果组装成 CandidateAsset 持久化对象。
// 当前不做 AI 调用，敏感字段识别在 Task 3 后续完善。

import crypto from 'node:crypto';

export function makeCandidateId() {
  return `cand_${crypto.randomBytes(5).toString('hex')}`;
}

export function buildCandidateAsset({
  projectId,
  sourceType,
  sourceRef,
  name,
  businessDomain,
  confidence,
  riskLevel,
  sensitiveHits,
  mappingStatus,
  aiSummary,
  rawPayload
}) {
  return {
    id: makeCandidateId(),
    project_id: projectId,
    source_type: sourceType,
    source_ref: sourceRef,
    name,
    business_domain: businessDomain || 'unclassified',
    confidence: typeof confidence === 'number' ? confidence : 0,
    risk_level: riskLevel || 'medium',
    sensitive_hits: JSON.stringify(sensitiveHits || []),
    mapping_status: mappingStatus || 'unknown',
    ai_summary: aiSummary || '',
    raw_payload: JSON.stringify(rawPayload || {}),
    status: 'pending_review'
  };
}