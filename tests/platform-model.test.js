const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'mcp/poc/server/server.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'mcp/poc/admin/index.html'), 'utf8');
const app = [
  'mcp/poc/admin/assets/app.js',
  'mcp/poc/admin/assets/modules/api.js',
  'mcp/poc/admin/assets/modules/renderers.js',
  'mcp/poc/admin/assets/modules/state.js'
].map(rel => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n');

for (const table of [
  'platform_users',
  'platform_sessions',
  'platform_customers',
  'platform_projects',
  'platform_data_sources',
  'platform_mcp_assets',
  'platform_mcp_releases',
  'platform_gateway_policies',
  'platform_call_events',
  'platform_deliverables',
  'platform_billing_records',
  'platform_access_configs'
]) {
  assert(server.includes(`CREATE TABLE IF NOT EXISTS ${table}`), 'server should define ' + table);
}

for (const endpoint of [
  '/api/platform/summary',
  '/api/platform/projects',
  '/api/platform/data-sources',
  '/api/platform/mcp-assets',
  '/api/platform/gateway-policies',
  '/api/platform/call-events',
  '/api/platform/deliverables',
  '/api/platform/billing',
  '/api/platform/access-configs'
]) {
  assert(server.includes(endpoint), 'server should expose ' + endpoint);
  assert(app.includes(endpoint), 'frontend should consume ' + endpoint);
}

for (const page of ['生成总览', '资产生成', '业务材料', '运行配置', '测试发布', '治理策略', '调用统计', '计费结算', '交付中心']) {
  assert(admin.includes(page) || app.includes(page), 'admin IA should include ' + page);
}

assert(admin.includes('admin-only'), 'admin shell should mark privileged actions explicitly');
assert(app.includes('customer'), 'frontend should keep role-based navigation');
assert(fs.readFileSync(path.join(root, 'PRODUCT.md'), 'utf8').includes('Retail data is a demo source only'), 'product boundary should keep retail data as demo only');

console.log('platform model checks passed');