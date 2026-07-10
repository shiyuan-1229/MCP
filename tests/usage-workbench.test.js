const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'mcp/poc/admin/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/state.js'), 'utf8');

assert(index.includes('usageControls'), 'usage page should render filter controls');
assert(index.includes('usageSummary'), 'usage page should render summary cards');
assert(index.includes('eventRows'), 'usage page should render event rows');
assert(index.includes('usageDrawer'), 'usage page should include a detail drawer');
assert(index.includes('usageDrawerClose'), 'usage drawer should be dismissible');

assert(state.includes('usageFilters'), 'state should track usage filters');
assert(state.includes('selectedUsageEventId'), 'state should track the selected usage event');
assert(state.includes('usageDrawerOpen'), 'state should track usage drawer visibility');

assert(app.includes('openUsageDrawer'), 'app should support opening a usage drawer');
assert(app.includes('closeUsageDrawer'), 'app should support closing a usage drawer');
assert(app.includes('copyUsageTrace'), 'app should support copying a trace');
assert(app.includes('exportUsageEvent'), 'app should support exporting a usage event');

assert(renderers.includes('renderUsageDrawer'), 'renderers should render the usage drawer');
assert(renderers.includes('usage-row-action'), 'usage table should expose row actions');
assert(renderers.includes('data-usage-filter'), 'usage page should render filter controls');
assert(renderers.includes('usage-anomaly'), 'usage workbench should track anomalies');

console.log('usage workbench checks passed');
