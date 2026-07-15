import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const [html, renderers, app, styles] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/modules/renderers.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/app.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/styles.css'), 'utf8')
]);

for (const id of [
  'customerDeliveryHero',
  'customerDeliverySummary',
  'customerDeliveryProgress',
  'customerDeliveryActions',
  'customerDeliveryPackages',
  'customerDeliveryTimeline'
]) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

for (const token of [
  'deliveryStages',
  'groupedPackages',
  'customerDeliveryProgress',
  'customerDeliveryPackages',
  'downloadReadyDeliverables'
]) {
  assert.match(renderers, new RegExp(token, 'u'));
}

assert.match(app, /function downloadReadyDeliverables\(\)/u);
assert.match(app, /window\.downloadReadyDeliverables = downloadReadyDeliverables/u);
assert.match(styles, /\.customer-delivery-hero/u);
assert.match(styles, /\.customer-delivery-stage/u);
assert.match(styles, /\.customer-delivery-package/u);

console.log('customer delivery overview checks passed');