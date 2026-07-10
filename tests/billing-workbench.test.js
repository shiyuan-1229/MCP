const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'mcp/poc/admin/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/state.js'), 'utf8');

assert(index.includes('billingControls'), 'billing page should render filter controls');
assert(index.includes('billingSummary'), 'billing page should render summary cards');
assert(index.includes('billingRows'), 'billing page should render table rows');
assert(index.includes('billingDrawer'), 'billing page should include a detail drawer');
assert(index.includes('billingDrawerClose'), 'billing drawer should be dismissible');

assert(state.includes('billingFilters'), 'state should track billing filters');
assert(state.includes('selectedBillingId'), 'state should track the selected bill');
assert(state.includes('billingDrawerOpen'), 'state should track billing drawer visibility');
assert(state.includes('billingOverrides'), 'state should persist billing overrides');

assert(app.includes('openBillingDrawer'), 'app should support opening a billing drawer');
assert(app.includes('closeBillingDrawer'), 'app should support closing a billing drawer');
assert(app.includes('confirmBilling'), 'app should support confirming a bill');
assert(app.includes('reconcileBilling'), 'app should support reconciling a bill');
assert(app.includes('exportBillingStatement'), 'app should support exporting a statement');

assert(renderers.includes('renderBillingDrawer'), 'renderers should render the billing drawer');
assert(renderers.includes('billing-row-action'), 'billing table should expose row actions');
assert(renderers.includes('data-billing-filter'), 'billing page should render filter controls');
assert(renderers.includes('billing-anomaly'), 'billing workbench should track anomalies');

console.log('billing workbench checks passed');
