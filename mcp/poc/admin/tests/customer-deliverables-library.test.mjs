import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const [html, renderers, app, state, styles] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/modules/renderers.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/app.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/modules/state.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/styles.css'), 'utf8')
]);

for (const id of ['customerDeliverableRecommended', 'customerDeliverableFilters', 'customerDeliverableRows']) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}
for (const token of ['deliverableTypeMeta', 'customerDeliverableFilters', 'downloadProjectReadyDeliverables', '查看接入配置']) {
  assert.match(renderers, new RegExp(token, 'u'));
}
assert.match(app, /function updateCustomerDeliverableFilters\(/u);
assert.match(app, /function downloadProjectReadyDeliverables\(/u);
assert.match(state, /customerDeliverableFilters/u);
assert.match(styles, /\.customer-deliverable-library/u);
console.log('customer deliverables library checks passed');
