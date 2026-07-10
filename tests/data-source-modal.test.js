const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');

assert(app.includes("openModal('导入业务资料', ["), 'data source action should use structured openModal fields');
assert(!app.includes('const modal = openModal(html);'), 'data source action should not use the legacy modal html signature');
assert(!app.includes('modal.close()'), 'data source action should not depend on a modal.close helper');

console.log('data source modal checks passed');
