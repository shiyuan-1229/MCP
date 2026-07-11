const assert = require('assert');

(async () => {
  const { buildReviewTasksForCandidate, decideReviewLevel } = await import('../mcp/poc/server/modules/governance/review-orchestrator.mjs');

  assert.equal(decideReviewLevel({ risk_level: 'low' }), 'auto_pass');
  assert.equal(decideReviewLevel({ risk_level: 'medium' }), 'manual_review');
  assert.equal(decideReviewLevel({ risk_level: 'high' }), 'dual_review');

  const tasks = buildReviewTasksForCandidate({
    id: 'cand_1',
    risk_level: 'high',
    sensitive_hits: '["phone"]',
    mapping_status: 'conflict'
  });

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].review_type, 'dual_review');
  assert.match(tasks[0].review_reason, /sensitive|conflict/i);

  console.log('review orchestrator checks passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});