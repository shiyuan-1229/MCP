// review-stages-definition.test.mjs
// 验证三层审核阶段常量定义、review-orchestrator 分层逻辑和状态转换规则
//
// 对应文档：docs/superpowers/specs/2026-07-13-mcp-forge-manual-review-governance-rollout.md
// Task 1: 固化分层审核模型与状态定义

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  REVIEW_STAGES,
  REVIEW_STATUS,
  REVIEW_ACTIONS,
  REVIEW_REASON,
  STAGE_CONFIG,
  STATUS_TRANSITIONS
} from '../../server/modules/governance/review-stages.mjs';

import {
  decideReviewLevel,
  buildReviewTasksForCandidate,
  getStageMetadata
} from '../../server/modules/governance/review-orchestrator.mjs';

// ============================================================
// 1. 审核阶段常量完整性
// ============================================================
test('REVIEW_STAGES 包含三层审核阶段', () => {
  assert.equal(REVIEW_STAGES.CANDIDATE, 'candidate_review');
  assert.equal(REVIEW_STAGES.TOOL, 'tool_review');
  assert.equal(REVIEW_STAGES.PUBLISH, 'publish_acceptance');
});

test('REVIEW_STATUS 包含完整的审核状态', () => {
  assert.ok(REVIEW_STATUS.PENDING);
  assert.ok(REVIEW_STATUS.APPROVED);
  assert.ok(REVIEW_STATUS.REJECTED);
  assert.ok(REVIEW_STATUS.NEEDS_REVIEW);
  assert.ok(REVIEW_STATUS.AUTOMATED_PASS);
  assert.ok(REVIEW_STATUS.AUTOMATED_FAIL);
});

test('REVIEW_ACTIONS 包含完整的审核动作', () => {
  assert.ok(REVIEW_ACTIONS.APPROVE);
  assert.ok(REVIEW_ACTIONS.REJECT);
  assert.ok(REVIEW_ACTIONS.ESCALATE);
  assert.ok(REVIEW_ACTIONS.RESUBMIT);
  assert.ok(REVIEW_ACTIONS.AUTO_APPROVE);
  assert.ok(REVIEW_ACTIONS.AUTO_REJECT);
});

test('STAGE_CONFIG 三个阶段都有配置且 order 正确', () => {
  assert.equal(STAGE_CONFIG[REVIEW_STAGES.CANDIDATE].order, 1);
  assert.equal(STAGE_CONFIG[REVIEW_STAGES.TOOL].order, 2);
  assert.equal(STAGE_CONFIG[REVIEW_STAGES.PUBLISH].order, 3);
  // 发布验收是门禁阶段
  assert.equal(STAGE_CONFIG[REVIEW_STAGES.PUBLISH].gate, true);
  assert.equal(STAGE_CONFIG[REVIEW_STAGES.CANDIDATE].gate, false);
  assert.equal(STAGE_CONFIG[REVIEW_STAGES.TOOL].gate, false);
});

// ============================================================
// 2. 状态转换规则
// ============================================================
test('STATUS_TRANSITIONS pending 状态可以 approve/reject/auto', () => {
  const fromPending = STATUS_TRANSITIONS[REVIEW_STATUS.PENDING];
  assert.equal(fromPending[REVIEW_ACTIONS.APPROVE], REVIEW_STATUS.APPROVED);
  assert.equal(fromPending[REVIEW_ACTIONS.REJECT], REVIEW_STATUS.REJECTED);
});

test('STATUS_TRANSITIONS needs_review 状态可以 escalate', () => {
  const fromNeeds = STATUS_TRANSITIONS[REVIEW_STATUS.NEEDS_REVIEW];
  assert.equal(fromNeeds[REVIEW_ACTIONS.ESCALATE], REVIEW_STATUS.PENDING);
});

// ============================================================
// 3. review-orchestrator 分层逻辑
// ============================================================
test('decideReviewLevel: low risk -> auto_pass', () => {
  assert.equal(decideReviewLevel({ risk_level: 'low', business_domain: 'retail', confidence: 0.9 }), 'auto_pass');
});

test('decideReviewLevel: medium risk -> manual_review', () => {
  assert.equal(decideReviewLevel({ risk_level: 'medium', business_domain: 'manufacturing', confidence: 0.8 }), 'manual_review');
});

test('decideReviewLevel: high risk -> dual_review', () => {
  assert.equal(decideReviewLevel({ risk_level: 'high', business_domain: 'finance', confidence: 0.9 }), 'dual_review');
});

test('buildReviewTasksForCandidate: auto_pass 不产生审核任务', () => {
  const tasks = buildReviewTasksForCandidate({ id: 'c1', risk_level: 'low', business_domain: 'retail', confidence: 0.95, ai_tools_snapshot: '[]', human_tools_snapshot: '[]' });
  assert.equal(tasks.length, 0);
});

test('buildReviewTasksForCandidate: medium risk 产生 candidate_review 层任务', () => {
  const tasks = buildReviewTasksForCandidate({
    id: 'c1',
    risk_level: 'medium',
    business_domain: 'manufacturing',
    confidence: 0.8,
    sensitive_hits: '["phone"]',
    ai_tools_snapshot: '[]',
    human_tools_snapshot: '[]'
  });
  assert.ok(tasks.length > 0);
  // 每个任务都应该有 review_stage
  for (const t of tasks) {
    assert.ok(t.review_stage, 'task should have review_stage');
  }
});

test('buildReviewTasksForCandidate: high risk 产生 candidate_review 层 dual 任务', () => {
  const tasks = buildReviewTasksForCandidate({
    id: 'c2',
    risk_level: 'high',
    business_domain: 'finance',
    sensitive_hits: '["id_card"]',
    mapping_status: 'conflict',
    confidence: 0.4,
    ai_tools_snapshot: '[]',
    human_tools_snapshot: '[]'
  });
  assert.ok(tasks.length >= 2);
  const stages = [...new Set(tasks.map(t => t.review_stage))];
  assert.ok(stages.includes(REVIEW_STAGES.CANDIDATE), 'should include candidate_review');
});

test('buildReviewTasksForCandidate: 有 tools 时产生 tool_review 层任务', () => {
  const tasks = buildReviewTasksForCandidate({
    id: 'c3',
    risk_level: 'high',
    business_domain: 'finance',
    confidence: 0.9,
    ai_tools_snapshot: JSON.stringify([{ name: 'queryOrder', description: 'test' }]),
    human_tools_snapshot: '[]'
  });
  const stages = [...new Set(tasks.map(t => t.review_stage))];
  assert.ok(stages.includes(REVIEW_STAGES.TOOL), 'should include tool_review');
  const toolTask = tasks.find(t => t.review_stage === REVIEW_STAGES.TOOL);
  assert.equal(toolTask.review_type, 'tool_review');
});

test('getStageMetadata 返回三个阶段的完整配置', () => {
  const meta = getStageMetadata();
  assert.equal(meta.length, 3);
  assert.equal(meta[0].stage, REVIEW_STAGES.CANDIDATE);
  assert.equal(meta[1].stage, REVIEW_STAGES.TOOL);
  assert.equal(meta[2].stage, REVIEW_STAGES.PUBLISH);
  // 每个阶段都有 name, order, gate, description
  for (const m of meta) {
    assert.ok(m.name, 'stage should have name');
    assert.ok(typeof m.order === 'number');
    assert.ok(typeof m.gate === 'boolean');
    assert.ok(m.description);
  }
});

// ============================================================
// 4. REVIEW_REASON 结构验证
// ============================================================
test('REVIEW_REASON 包含四大类原因', () => {
  assert.ok(REVIEW_REASON.AI_IDENTIFICATION);
  assert.ok(REVIEW_REASON.TOOL_ORGANIZATION);
  assert.ok(REVIEW_REASON.BUSINESS_RULES);
  assert.ok(REVIEW_REASON.PUBLISHING);
});

console.log('review-stages-definition tests loaded');
