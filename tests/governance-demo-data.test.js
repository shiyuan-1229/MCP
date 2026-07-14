const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(path.resolve(
  __dirname,
  '..',
  'mcp/poc/server/modules/governance/demo-scenarios.mjs'
)).href;

(async () => {
  const { GOVERNANCE_DEMO_SCENARIOS } = await import(moduleUrl);

  assert.equal(GOVERNANCE_DEMO_SCENARIOS.sources.length, 6);
  assert.equal(GOVERNANCE_DEMO_SCENARIOS.candidates.length, 12);
  assert.equal(GOVERNANCE_DEMO_SCENARIOS.toolDrafts.length, 9);
  assert.equal(GOVERNANCE_DEMO_SCENARIOS.mcpDrafts.length, 4);
  assert.deepEqual(
    GOVERNANCE_DEMO_SCENARIOS.reviewExamples.map(item => item.stage),
    ['candidate_review', 'tool_review', 'tool_review', 'publish_acceptance']
  );
  assert.deepEqual(
    GOVERNANCE_DEMO_SCENARIOS.acceptanceFailures.map(item => ({ status_code: item.status_code, trace_id: item.trace_id })),
    [
      { status_code: 403, trace_id: 'trace_demo_refund_403' },
      { status_code: 401, trace_id: 'trace_demo_customer_export_401' },
      { status_code: 500, trace_id: 'trace_demo_inventory_adjust_500' }
    ]
  );
  assert.deepEqual(GOVERNANCE_DEMO_SCENARIOS.valueMetrics, {
    asset_cycle_days: 2.6,
    risk_items_intercepted: 4,
    reused_assets: 3,
    repeated_work_reduction: 38,
    publishable_mcps: 2
  });

  console.log('governance demo data tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
