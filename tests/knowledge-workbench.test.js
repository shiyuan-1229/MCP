const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'mcp/poc/admin/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/state.js'), 'utf8');

assert(index.includes('id="knowledge"'), 'knowledge page should exist in admin shell');
assert(index.includes('knowledgeControls'), 'knowledge page should render filter controls');
assert(index.includes('knowledgeSummary'), 'knowledge page should render summary cards');
assert(index.includes('knowledgeRows'), 'knowledge page should render table rows');
assert(index.includes('knowledgeDrawer'), 'knowledge page should include a detail drawer');
assert(index.includes('knowledgeDrawerClose'), 'knowledge drawer should be dismissible');

assert(state.includes("{ id: 'knowledge', label: '业务材料'"), 'nav should expose a business materials page');
assert(state.includes('knowledgeFilters'), 'state should track knowledge filters');
assert(state.includes('selectedKnowledgeId'), 'state should track selected knowledge row');
assert(state.includes('knowledgeDrawerOpen'), 'state should track knowledge drawer visibility');

assert(app.includes('openKnowledgeDrawer'), 'app should support opening a knowledge drawer');
assert(app.includes('closeKnowledgeDrawer'), 'app should support closing a knowledge drawer');

assert(renderers.includes('renderKnowledge'), 'renderers should render the knowledge page');
assert(renderers.includes('renderKnowledgeDrawer'), 'renderers should render the knowledge drawer');
assert(renderers.includes('data-knowledge-filter'), 'knowledge page should render filter controls');
assert(renderers.includes('knowledge-row-action'), 'knowledge table should expose row actions');

console.log('knowledge workbench checks passed');