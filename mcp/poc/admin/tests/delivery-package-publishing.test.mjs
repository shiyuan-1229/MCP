import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, renderers, server] = await Promise.all([
  readFile(new URL('../assets/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../assets/modules/renderers.js', import.meta.url), 'utf8'),
  readFile(new URL('../../server/server.js', import.meta.url), 'utf8')
]);

for (const token of ['platform_delivery_packages', '/api/platform/delivery-packages', 'published_by', 'published_at', 'customer_visible']) {
  assert.match(server, new RegExp(token, 'u'));
}
for (const token of ['saveDeliveryPackage', 'deliveryPackageNote', 'deliveryPackageTitle', 'canPublishDelivery']) {
  assert.match(app + renderers, new RegExp(token, 'u'));
}

const navigationLoad = app.indexOf("const snapshot = await loadNavigationData();");
const deliveryPackageRequest = app.indexOf("api('/api/platform/delivery-packages')");
const accessHealthRequest = app.indexOf("api('/api/platform/access-configs/health-summary')");
assert.ok(navigationLoad >= 0, 'navigation data should load before delivery package records');
assert.ok(navigationLoad < deliveryPackageRequest, 'delivery package request should follow navigation data');
assert.ok(deliveryPackageRequest < accessHealthRequest, 'delivery package request should precede access health data');
assert.match(app, /deliverables: Array\.isArray\(snapshot\.deliverables\)/u);assert.match(app, /deliveryPackageRecords: Array\.isArray\(deliveryPackageRecords\)/u);
assert.match(renderers, /renderDeliveryPackageEditor\(\);/u, 'project preview should render the delivery publishing editor');
assert.match(renderers, /renderDeliveryRepairDrawer\(\);/u, 'repair action should render the delivery repair drawer');

console.log('delivery package publishing checks passed');
