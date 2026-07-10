const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'mcp/poc/admin/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/state.js'), 'utf8');

assert(index.includes('publishControls'), 'publish page should render filter controls');
assert(index.includes('publishSummary'), 'publish page should render summary cards');
assert(index.includes('releaseRows'), 'publish page should render release rows');
assert(index.includes('publishDrawer'), 'publish page should include a detail drawer');
assert(index.includes('publishDrawerClose'), 'publish drawer should be dismissible');

assert(state.includes('publishFilters'), 'state should track publish filters');
assert(state.includes('selectedReleaseId'), 'state should track the selected release');
assert(state.includes('publishDrawerOpen'), 'state should track publish drawer visibility');
assert(state.includes('releaseOverrides'), 'state should persist publish overrides');

assert(app.includes('openPublishDrawer'), 'app should support opening a publish drawer');
assert(app.includes('closePublishDrawer'), 'app should support closing a publish drawer');
assert(app.includes('markReleaseTested'), 'app should support marking a release tested');
assert(app.includes('publishRelease'), 'app should support publishing a release');
assert(app.includes('rollbackRelease'), 'app should support rolling back a release');

assert(renderers.includes('renderPublishDrawer'), 'renderers should render the publish drawer');
assert(renderers.includes('publish-row-action'), 'publish table should expose row actions');
assert(renderers.includes('data-publish-filter'), 'publish page should render filter controls');
assert(renderers.includes('publish-risk'), 'publish workbench should track risks');

console.log('publish workbench checks passed');
