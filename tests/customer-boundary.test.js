const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const state = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/state.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');

assert(state.includes("{ id: 'factory', label: '资产生成', roles: ['admin'] }"), 'factory page should be admin-only');
assert(state.includes("{ id: 'gateway', label: '治理策略', roles: ['admin'] }"), 'gateway page should be admin-only');
assert(app.includes('getDefaultPageForRole'), 'app should choose a role-specific default page');
assert(renderers.includes('我的项目'), 'customer workbench copy should focus on my-project context');
assert(renderers.includes('我的知识库') || renderers.includes('我的运行配置') || renderers.includes('客户工作台'), 'customer-facing labels should be present');

console.log('customer boundary checks passed');