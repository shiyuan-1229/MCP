const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const root = path.join(__dirname, '..');
  const moduleUrl = pathToFileURL(path.join(root, 'mcp/poc/admin/assets/modules/project-health.mjs')).href;
  const { buildProjectHealthRows, getProjectFilterOptions } = await import(moduleUrl);

  const dataset = {
    now: '2026-07-08T00:00:00',
    projects: [
      { id: 'proj_alpha', customer_id: 'cust_alpha', customer_name: '甲方零售', name: '零售 AI 项目', stage: 'published', owner: '李实施', progress: 86, due_date: '2026-07-18' },
      { id: 'proj_beta', customer_id: 'cust_beta', customer_name: '乙方制造', name: '制造测试项目', stage: 'testing', owner: '王实施', progress: 62, due_date: '2026-07-25' }
    ],
    assets: [
      { id: 'asset_alpha', project_id: 'proj_alpha', name: 'sales_top_products', status: 'published', version: 'v1.2.0' },
      { id: 'asset_beta', project_id: 'proj_beta', name: 'work_order_lookup', status: 'testing', version: 'v0.8.0' }
    ],
    releases: [
      { asset_id: 'asset_alpha', asset_name: 'sales_top_products', version: 'v1.2.0', status: 'published', tested_at: '2026-07-05 10:30', released_at: '2026-07-06 09:00' },
      { asset_id: 'asset_beta', asset_name: 'work_order_lookup', version: 'v0.8.0', status: 'tested', tested_at: '2026-07-07 11:00', released_at: '' }
    ],
    access: [
      { id: 'acc_alpha', project_id: 'proj_alpha', environment: 'production', credential_expires_at: '2026-07-20T23:59:59', last_health_status: 'ok' },
      { id: 'acc_beta', project_id: 'proj_beta', environment: 'sandbox', credential_expires_at: '2026-10-15T23:59:59', last_health_status: 'error' }
    ],
    events: [
      { asset_name: 'sales_top_products', status: 'success' },
      { asset_name: 'work_order_lookup', status: 'error' },
      { asset_name: 'work_order_lookup', status: 'error' }
    ],
    billing: [
      { customer_name: '甲方零售', status: 'confirmed' },
      { customer_name: '乙方制造', status: 'pending' }
    ]
  };

  const rows = buildProjectHealthRows(dataset);
  assert.strictEqual(rows.length, 2, 'all projects should be represented');
  assert.deepStrictEqual(rows.map(row => row.milestone), ['2026-07-18', '2026-07-25'], 'milestone should come from due_date');
  assert.strictEqual(rows[0].recentRelease.version, 'v1.2.0', 'latest release should be attached to project');
  assert.strictEqual(rows[0].certificateExpiry, '2026-07-20', 'certificate expiry should be normalized to date');
  assert.strictEqual(rows[1].callExceptionCount, 2, 'call exceptions should aggregate by project assets');
  assert.strictEqual(rows[1].billingStatus, 'pending', 'billing status should aggregate by customer');
  assert.strictEqual(rows[1].healthStatus, 'risk', 'failed health checks should mark a project as risk');

  const filtered = buildProjectHealthRows(dataset, {
    customer: 'cust_beta',
    stage: 'testing',
    environment: 'sandbox',
    owner: '王实施',
    healthStatus: 'risk',
    sortBy: 'exceptions-desc'
  });
  assert.deepStrictEqual(filtered.map(row => row.projectId), ['proj_beta'], 'filters should combine by customer, stage, environment, owner and health');

  const sorted = buildProjectHealthRows(dataset, { sortBy: 'certificate-asc' });
  assert.deepStrictEqual(sorted.map(row => row.projectId), ['proj_alpha', 'proj_beta'], 'certificate sort should put earliest expiry first');

  const options = getProjectFilterOptions(rows);
  assert.deepStrictEqual(options.environments, ['production', 'sandbox'], 'filter options should expose environments');
  assert(options.healthStatuses.includes('attention') && options.healthStatuses.includes('risk'), 'filter options should expose health statuses');

  console.log('project health checks passed');
})();
