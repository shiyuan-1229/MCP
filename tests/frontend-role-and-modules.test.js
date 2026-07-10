const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const index = read('mcp/poc/admin/index.html');
const app = read('mcp/poc/admin/assets/app.js');
const state = read('mcp/poc/admin/assets/modules/state.js');

assert(index.includes('<script type="module" src="/admin/assets/app.js'), 'admin entry should load app.js as an ES module');

for (const rel of [
  'mcp/poc/admin/assets/modules/state.js',
  'mcp/poc/admin/assets/modules/api.js',
  'mcp/poc/admin/assets/modules/ui.js',
  'mcp/poc/admin/assets/modules/renderers.js'
]) {
  assert(exists(rel), rel + ' should exist after frontend split');
}

for (const importPath of ['./modules/state.js', './modules/api.js', './modules/ui.js', './modules/renderers.js']) {
  assert(app.includes(importPath), 'app.js should import ' + importPath);
}

const renderers = read('mcp/poc/admin/assets/modules/renderers.js');
assert(renderers.includes('createAssetBtn'), 'renderers should own create asset button role state');
assert(renderers.includes("state.user?.role === 'admin'"), 'create asset action should only be visible for admins');
assert(renderers.includes("body.classList.toggle('customer'"), 'customer role should be reflected on the body class');
assert(renderers.includes('admin-only'), 'admin-only controls should still be marked in the shell');

const ui = read('mcp/poc/admin/assets/modules/ui.js');
assert(ui.includes('showToast'), 'UI module should provide a toast/error surface');
assert(ui.includes('没有权限执行此操作'), '403 errors should have a readable Chinese message');

assert(state.includes('生成总览'), 'state should expose the generation overview nav label');
assert(index.includes('createPolicyBtn'), 'gateway policy control should be present in the admin shell');

console.log('frontend role and module checks passed');