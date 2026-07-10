const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'mcp/poc/admin/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/state.js'), 'utf8');

assert(index.includes('deliverableControls'), 'deliverables page should render filter controls');
assert(index.includes('deliverableRows'), 'deliverables page should render table rows');
assert(index.includes('deliverableDrawer'), 'deliverables page should include a detail drawer');
assert(index.includes('deliverableDrawerClose'), 'deliverable drawer should be dismissible');

assert(state.includes('deliverableFilters'), 'state should track deliverable filters');
assert(state.includes('selectedDeliverableId'), 'state should track the selected deliverable');
assert(state.includes('deliverableDrawerOpen'), 'state should track deliverable drawer visibility');

assert(app.includes('openDeliverableDrawer'), 'app should support opening a deliverable drawer');
assert(app.includes('closeDeliverableDrawer'), 'app should support closing a deliverable drawer');
assert(app.includes('downloadDeliverable'), 'app should support downloading a deliverable');

assert(renderers.includes('renderDeliverableDrawer'), 'renderers should render the deliverable drawer');
assert(renderers.includes('deliverable-row-action'), 'deliverables table should expose row actions');
assert(renderers.includes('data-deliverable-filter'), 'deliverables page should render filter controls');

console.log('deliverables workbench checks passed');
