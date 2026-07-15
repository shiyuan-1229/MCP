import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const html = await readFile(path.join(adminRoot, 'index.html'), 'utf8');
const renderers = await readFile(path.join(adminRoot, 'assets/modules/renderers.js'), 'utf8');
const styles = await readFile(path.join(adminRoot, 'assets/styles.css'), 'utf8');

for (const id of [
  'customerBillingSummary',
  'customerBillingFeeBreakdown',
  'customerBillingUsageQuota',
  'customerBillingHistoryRows'
]) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

for (const token of [
  'function renderCustomerBilling()',
  'tierLimits',
  'customerBillingHistoryRows',
  'customer-quota-track',
  'exportBillingStatement'
]) {
  assert.match(renderers, new RegExp(token, 'u'));
}

assert.doesNotMatch(renderers, /customerBillingHighlights|customerBillingList/u);
assert.match(styles, /\.customer-billing-hero/u);
assert.match(styles, /\.customer-quota-track/u);

console.log('customer billing workspace checks passed');