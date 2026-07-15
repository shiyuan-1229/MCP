import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const [html, app, state, renderers] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'app.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'modules', 'state.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'modules', 'renderers.js'), 'utf8')
]);

for (const id of ['customer-overview', 'customerDeliveryHero', 'customerDeliverySummary', 'customerDeliveryProgress', 'customerDeliveryActions', 'customerDeliveryPackages', 'customerDeliveryTimeline', 'customerAssetOverlay', 'customerAssetDetailContent']) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}
assert.match(state, /id: 'customer-overview'/u);
const customerNavStart = state.indexOf('export const customerNavItems = [');
const customerNavEnd = state.indexOf('];', customerNavStart);
const customerNav = state.slice(customerNavStart, customerNavEnd);
assert.doesNotMatch(customerNav, /id: 'mcp-builder'/u);
assert.match(app, /api\('\/api\/customer\/overview'\)/u);
assert.match(app, /\/api\/customer\/assets\/\$\{assetId\}\/trial/u);
assert.match(renderers, /function renderCustomerOverview\(\)/u);
assert.match(renderers, /function renderCustomerAssetOverlay\(\)/u);
assert.match(app, /const CUSTOMER_LIVE_REFRESH_MS = 5000/u);
assert.match(app, /window\.setInterval\(refreshCustomerLiveData, CUSTOMER_LIVE_REFRESH_MS\)/u);
assert.match(app, /visibilitychange/u);
assert.match(renderers, /customerUsageLiveStatus/u);
assert.match(renderers, /calls \|\| ''/u);
console.log('customer workspace layout checks passed');