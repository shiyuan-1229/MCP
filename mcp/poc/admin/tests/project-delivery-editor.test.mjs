import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, renderers, server] = await Promise.all([
  readFile(new URL('../assets/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../assets/modules/renderers.js', import.meta.url), 'utf8'),
  readFile(new URL('../../server/server.js', import.meta.url), 'utf8')
]);

for (const token of ['description TEXT', "ensureColumn('platform_projects', 'description', 'TEXT')", 'const { name, status, implementer, progress, deadline, description }']) {
  assert.match(server, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}
assert.match(app, /name: project\.name \|\| ''/u);
assert.match(app, /description: project\.description \|\| ''/u);
const projectDraftFunction = app.match(/function updateProjectDraft\(id, patch\) \{[\s\S]*?\r?\n\}/u)?.[0] || '';
assert.doesNotMatch(projectDraftFunction, /renderAll\(\)/u);
for (const token of ['projectNameInput', 'projectDescriptionInput', 'projectImplementerInput', 'projectProgressInput', 'projectDeadlineInput', 'saveProjectDraft()']) {
  assert.match(renderers, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

console.log('project delivery editor checks passed');