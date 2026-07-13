// review-escalation-rules.test.mjs
// 验证人工触发规则和升级规则
// 对应文档 Task 2: 人工触发规则和升级规则

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  validateManualTrigger,
  buildEscalation,
  checkStageAdvancement
} from '../../server/modules/governance/manual-checks.mjs';

import { REVIEW_STAGES, REVIEW_ACTIONS } from '../../server/modules/governance/review-stages.mjs';

// ============================================================
// 1. validateManualTrigger - 人工触发校验
// ============================================================
test('validateManualTrigger: 合法的触发请求通过校验', () => {
  const result = validateManualTrigger({
    stage: 'candidate_review',
    reason: '管理员手动触发：需要确认数据源准确性',
    assignee_role: 'developer'
  });
  assert.ok(result.ok);
  assert.equal(result.normalized.stage, 'candidate_review');
  assert.equal(result.normalized.trigger_source, 'manual');
  assert.equal(result.normalized.assignee_role, 'developer');
});

test('validateManualTrigger: 缺少 reason 时拒绝', () => {
  const result = validateManualTrigger({ stage: 'candidate_review' });
  assert.ok(!result.ok);
  assert.match(result.error, /reason is required/);
});

test('validateManualTrigger: 无效的 stage 时拒绝', () => {
  const result = validateManualTrigger({ stage: 'invalid_stage', reason: 'test' });
  assert.ok(!result.ok);
  assert.match(result.error, /stage must be one of/);
});

test('validateManualTrigger: reason 超长时拒绝', () => {
  const result = validateManualTrigger({ reason: 'x'.repeat(501) });
  assert.ok(!result.ok);
  assert.match(result.error, /reason too long/);
});

test('validateManualTrigger: 默认 stage 为 candidate_review', () => {
  const result = validateManualTrigger({ reason: 'test reason' });
  assert.ok(result.ok);
  assert.equal(result.normalized.stage, 'candidate_review');
});

// ============================================================
// 2. buildEscalation - 升级规则
// ============================================================
test('buildEscalation: candidate_review reject -> 升级', () => {
  const result = buildEscalation({
    review_stage: REVIEW_STAGES.CANDIDATE,
    decision: REVIEW_ACTIONS.REJECT,
    candidate_id: 'c1',
    decision_reason: '数据源不可靠'
  });
  assert.ok(result.shouldEscalate);
  assert.equal(result.nextStage, REVIEW_STAGES.CANDIDATE);
  assert.equal(result.nextReviewType, 'escalated_review');
  assert.equal(result.nextAssignee, 'senior_reviewer');
  assert.match(result.reason, /升级审核/);
});

test('buildEscalation: tool_review reject -> 升级', () => {
  const result = buildEscalation({
    review_stage: REVIEW_STAGES.TOOL,
    decision: REVIEW_ACTIONS.REJECT,
    candidate_id: 'c1'
  });
  assert.ok(result.shouldEscalate);
  assert.equal(result.nextStage, REVIEW_STAGES.TOOL);
  assert.equal(result.nextAssignee, 'senior_reviewer');
});

test('buildEscalation: publish_acceptance reject -> 不升级（直接阻断）', () => {
  const result = buildEscalation({
    review_stage: REVIEW_STAGES.PUBLISH,
    decision: REVIEW_ACTIONS.REJECT,
    candidate_id: 'c1'
  });
  assert.ok(!result.shouldEscalate);
});

test('buildEscalation: approve 不触发升级', () => {
  const result = buildEscalation({
    review_stage: REVIEW_STAGES.CANDIDATE,
    decision: REVIEW_ACTIONS.APPROVE,
    candidate_id: 'c1'
  });
  assert.ok(!result.shouldEscalate);
});

test('buildEscalation: 空 task 不触发升级', () => {
  const result = buildEscalation(null);
  assert.ok(!result.shouldEscalate);
});

// ============================================================
// 3. checkStageAdvancement - 阶段推进条件
// ============================================================
test('checkStageAdvancement: 有 open 任务时不能推进', () => {
  const summary = {
    candidate_review: { total: 2, open: 1, resolved: 1, rejected: 0 }
  };
  const result = checkStageAdvancement(summary, 'candidate_review');
  assert.ok(!result.canAdvance);
  assert.match(result.blocker, /未完成/);
});

test('checkStageAdvancement: 有 rejected 时不能推进', () => {
  const summary = {
    candidate_review: { total: 2, open: 0, resolved: 2, rejected: 1 }
  };
  const result = checkStageAdvancement(summary, 'candidate_review');
  assert.ok(!result.canAdvance);
  assert.match(result.blocker, /拒绝/);
});

test('checkStageAdvancement: 全部 resolved 且无 reject 时可以推进', () => {
  const summary = {
    candidate_review: { total: 2, open: 0, resolved: 2, rejected: 0 }
  };
  const result = checkStageAdvancement(summary, 'candidate_review');
  assert.ok(result.canAdvance);
});

test('checkStageAdvancement: 该阶段没有任务时不阻断', () => {
  const result = checkStageAdvancement({}, 'tool_review');
  assert.ok(result.canAdvance);
});

console.log('review-escalation-rules tests loaded');
