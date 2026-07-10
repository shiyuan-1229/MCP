const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = __dirname;
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const product = read('PRODUCT.md');
const admin = read('mcp/poc/admin/index.html');
const app = [
  'mcp/poc/admin/assets/app.js',
  'mcp/poc/admin/assets/modules/api.js',
  'mcp/poc/admin/assets/modules/renderers.js',
  'mcp/poc/admin/assets/modules/state.js'
].map(read).join('\n');
const server = read('mcp/poc/server/server.js');
const demoServer = read('mcp/poc/demo-server/server.js');
const codegen = read('mcp/poc/server/codegen.js');
const combined = `${product}\n${admin}\n${app}\n${server}`;

assert(combined.includes('企业 MCP 交付与治理平台'), 'admin should stay on the enterprise MCP boundary');
assert(combined.includes('生成总览'), 'admin should expose the generation overview');
assert(combined.includes('资产生成'), 'admin should expose the asset factory view');
assert(combined.includes('测试发布'), 'admin should expose release flow');
assert(combined.includes('治理策略'), 'admin should expose governance');
assert(combined.includes('调用统计'), 'admin should expose usage statistics');
assert(combined.includes('交付中心'), 'admin should expose deliverables');
assert(combined.includes('Demo 数据源'), 'retail scenarios should be downgraded into demo data sources');
assert(combined.includes('Retail data is a demo source only'), 'product boundary should keep retail data outside the formal product scope');
assert(combined.includes('实施费'), 'billing copy should include implementation fees');
assert(combined.includes('年费 / 能力包'), 'billing copy should include annual fee and capability package');
assert(combined.includes('调用量 / 效果费'), 'billing copy should include usage and effect fees');
assert(combined.includes('没有权限执行此操作'), 'customer-facing errors should be readable');
assert(combined.includes('admin') && combined.includes('customer'), 'role-based boundaries should remain visible in the shell');

for (const source of [server, demoServer, codegen]) {
  assert(source.includes('sales_top_products'), 'source should include sales_top_products');
  assert(source.includes('member_expiring_benefits'), 'source should include member_expiring_benefits');
}

console.log('enterprise MCP focus checks passed');