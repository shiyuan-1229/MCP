const assert = require('assert');

(async () => {
  const {
    buildReviewTasksForCandidate,
    decideReviewLevel,
    getStageMetadata,
    evaluateToolReview,
    getToolReviewChecklist,
    buildEscalation,
    handleReviewDecision,
    checkCandidatePublishReadiness
  } = await import('../mcp/poc/server/modules/governance/review-orchestrator.mjs');
  const {
    buildManualGate,
    detectSensitiveHits,
    validateAcceptanceChecklist,
    checkPublishGate,
    formatPublishGateResult,
    validateManualDecision
  } = await import('../mcp/poc/server/modules/governance/manual-checks.mjs');
  const { REVIEW_STAGES, REVIEW_STATUS, REVIEW_ACTIONS } = await import('../mcp/poc/server/modules/governance/review-stages.mjs');

  // ============================================================
  // 1. 审核等级判定
  // ============================================================
  // 低风险 + 明确业务域 + 无敏感 = auto_pass
  assert.equal(decideReviewLevel({ risk_level: 'low', business_domain: 'retail', confidence: 0.9 }), 'auto_pass');

  // 高风险 = dual_review
  assert.equal(decideReviewLevel({ risk_level: 'high', business_domain: 'finance', confidence: 0.9 }), 'dual_review');

  // 中风险 = manual_review
  assert.equal(decideReviewLevel({ risk_level: 'medium', business_domain: 'manufacturing', confidence: 0.8 }), 'manual_review');

  // 低置信度 = manual_review
  assert.equal(decideReviewLevel({ risk_level: 'low', business_domain: 'retail', confidence: 0.5 }), 'manual_review');

  // 敏感字段 = dual_review
  assert.equal(decideReviewLevel({ risk_level: 'low', business_domain: 'retail', confidence: 0.9, sensitive_hits: [{ field: 'phone', label: '手机号' }] }), 'dual_review');

  console.log('  [PASS] 审核等级判定');

  // ============================================================
  // 2. 审核任务生成
  // ============================================================
  const tasks = buildReviewTasksForCandidate({
    id: 'cand_1',
    risk_level: 'high',
    business_domain: 'finance',
    confidence: 0.9,
    sensitive_hits: '[{"field":"phone","label":"手机号"}]',
    mapping_status: 'conflict',
    ai_tools_snapshot: '[]',
    human_tools_snapshot: '[]'
  });

  // 高风险 = dual_review -> 2 候选审核任务 + 1 Tool 审核任务 = 3
  assert.ok(tasks.length >= 2, `expected >= 2 tasks, got ${tasks.length}`);
  assert.equal(tasks[0].review_type, 'dual_review');
  assert.equal(tasks[0].review_stage, REVIEW_STAGES.CANDIDATE);

  // 低风险 auto_pass = 0 任务
  const autoTasks = buildReviewTasksForCandidate({
    id: 'cand_2',
    risk_level: 'low',
    business_domain: 'retail',
    confidence: 0.95,
    ai_tools_snapshot: '[]',
    human_tools_snapshot: '[]'
  });
  assert.equal(autoTasks.length, 0);

  console.log('  [PASS] 审核任务生成');

  // ============================================================
  // 3. 敏感字段检测
  // ============================================================
  const hits = detectSensitiveHits([
    { name: 'customer_phone' },
    { name: 'id_card_no' },
    { name: 'product_name' }
  ]);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].label, '手机号');
  assert.equal(hits[1].label, '身份证号');

  console.log('  [PASS] 敏感字段检测');

  // ============================================================
  // 4. 验收清单校验
  // ============================================================
  const validChecklist = {
    business_result_correct: true,
    sensitive_handled: true,
    permission_scoped: true,
    write_op_confirmed: true,
    delivery_doc_ready: true,
    rollback_plan_ready: true
  };
  assert.ok(validateAcceptanceChecklist(validChecklist).passed);

  const invalidChecklist = { ...validChecklist, rollback_plan_ready: false };
  const invalidResult = validateAcceptanceChecklist(invalidChecklist);
  assert.ok(!invalidResult.passed);
  assert.ok(invalidResult.missing.includes('rollback_plan_ready'));

  console.log('  [PASS] 验收清单校验');

  // ============================================================
  // 5. 发布门禁检查
  // ============================================================
  // 全部通过
  const passGate = checkPublishGate(
    { manual_screen_decision: 'approve', acceptance_passed: 1 },
    { candidate_review: { open: 0, total: 2 } }
  );
  assert.ok(passGate.open_review_tasks);
  assert.ok(passGate.manual_screen_passed);
  assert.ok(passGate.acceptance_checklist_passed);

  // 有开放任务
  const failGate1 = checkPublishGate(
    { manual_screen_decision: 'approve', acceptance_passed: 1 },
    { candidate_review: { open: 2, total: 3 } }
  );
  assert.ok(!failGate1.open_review_tasks);

  // 人工初筛未通过
  const failGate2 = checkPublishGate(
    { manual_screen_decision: 'reject', acceptance_passed: 1 },
    {}
  );
  assert.ok(!failGate2.manual_screen_passed);

  // 验收清单未完成
  const failGate3 = checkPublishGate(
    { manual_screen_decision: 'approve', acceptance_passed: 0 },
    {}
  );
  assert.ok(!failGate3.acceptance_checklist_passed);

  console.log('  [PASS] 发布门禁检查');

  // ============================================================
  // 6. Tool 审核评估
  // ============================================================
  const toolEval = evaluateToolReview({
    ai_tools_snapshot: '[]',
    human_tools_snapshot: '[]',
    risk_level: 'low'
  });
  assert.ok(toolEval.passes.length >= 0);
  assert.ok(Array.isArray(toolEval.issues));
  assert.ok(Array.isArray(toolEval.warnings));

  const checklist = getToolReviewChecklist();
  assert.ok(Object.keys(checklist).length >= 5);

  console.log('  [PASS] Tool 审核评估');

  // ============================================================
  // 7. 升级机制
  // ============================================================
  const escalation = buildEscalation({
    review_stage: REVIEW_STAGES.CANDIDATE,
    decision: REVIEW_ACTIONS.REJECT,
    decision_reason: '字段映射不正确'
  });
  assert.ok(escalation.shouldEscalate);
  assert.equal(escalation.nextAssignee, 'senior_reviewer');

  // 发布验收层拒绝不升级
  const publishReject = buildEscalation({
    review_stage: REVIEW_STAGES.PUBLISH,
    decision: REVIEW_ACTIONS.REJECT
  });
  assert.ok(!publishReject.shouldEscalate);

  console.log('  [PASS] 升级机制');

  // ============================================================
  // 8. 审核决策处理
  // ============================================================
  const approveResult = handleReviewDecision(
    { id: 'rev_1', review_stage: REVIEW_STAGES.CANDIDATE },
    'approve',
    '确认通过'
  );
  assert.equal(approveResult.status, 'resolved');

  const modifyResult = handleReviewDecision(
    { id: 'rev_2', review_stage: REVIEW_STAGES.TOOL },
    'modify',
    '需要调整参数'
  );
  assert.equal(modifyResult.status, 'modified');
  assert.equal(modifyResult.next_action, 'needs_modification_and_resubmit');

  console.log('  [PASS] 审核决策处理');

  // ============================================================
  // 9. 人工决策校验
  // ============================================================
  const validDecision = validateManualDecision({ action: 'approve' });
  assert.ok(validDecision.ok);

  const rejectNoReason = validateManualDecision({ action: 'reject' });
  assert.ok(!rejectNoReason.ok);

  console.log('  [PASS] 人工决策校验');

  // ============================================================
  // 10. 阶段元数据
  // ============================================================
  const stages = getStageMetadata();
  assert.equal(stages.length, 3);
  assert.equal(stages[0].stage, REVIEW_STAGES.CANDIDATE);
  assert.equal(stages[2].gate, true);

  console.log('  [PASS] 阶段元数据');

  console.log('\n  All review orchestrator checks passed (' + 10 + ' suites)');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
