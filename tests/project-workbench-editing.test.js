const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'mcp/poc/server/server.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'mcp/poc/admin/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/state.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');

assert(server.includes('/api/platform/projects/:id'), 'server should expose project detail/update endpoints');
assert(server.includes('app.put("/api/platform/projects/:id"'), 'server should support project updates');

assert(index.includes('projectDrawer'), 'admin shell should include a project detail drawer');
assert(index.includes('projectDrawerClose'), 'project drawer should be dismissible');

assert(state.includes('selectedProjectId'), 'state should track selected project');
assert(state.includes('projectDrawerOpen'), 'state should track project drawer visibility');
assert(state.includes('projectDrafts'), 'state should store editable drafts');

assert(app.includes('/api/platform/projects/'), 'frontend should call project detail/update APIs');
assert(app.includes('updateProject'), 'frontend should provide a project save action');
assert(app.includes('openProjectDrawer'), 'frontend should provide a project drawer action');

assert(renderers.includes('renderProjectDrawer'), 'renderers should render the project detail drawer');
assert(renderers.includes('project-row-action'), 'workbench rows should expose project actions');
assert(renderers.includes('saveProjectDraft'), 'project drawer should render a save action');

console.log('project workbench editing checks passed');
