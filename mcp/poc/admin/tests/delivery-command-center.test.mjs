import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');

const [html, renderers, styles] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/modules/renderers.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/styles.css'), 'utf8')
]);

assert.match(html, /assets\/styles\.css\?v=59/u);
assert.match(html, /assets\/app\.js\?v=\d+/u);

for (const token of [
  'deliveryCommandCenter',
  'deliveryHealthSummary',
  'deliveryTaskQueue',
  'deliveryEvidencePanel',
  'deliveryPackageRows'
]) {
  assert.match(html, new RegExp(token, 'u'));
}

for (const token of [
  'function deliveryPackages(',
  'projectScope = null',
  'function renderDeliveryCommandCenter(',
  'delivery-task-card',
  'delivery-package-card',
  '完整度',
  '补齐资料',
  '预览交付包',
  '发布版本',
  '调用证据'
]) {
  assert.match(html + renderers + styles, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

for (const token of [
  '.delivery-command-center',
  '.delivery-workspace',
  '.delivery-package-card',
  '.delivery-task-card'
]) {
  assert.match(styles, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

console.log('delivery command center checks passed');
