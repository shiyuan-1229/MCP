import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const renderers = await readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8');

assert.match(renderers, /function monitoringGuidedNextAction\(type\)/u);
assert.match(renderers, /pageId: 'settings'/u);
assert.match(renderers, /pageId: 'tooling'/u);
assert.match(renderers, /pageId: 'intake'/u);
assert.match(renderers, /monitoringGuidedNextAction\(latest\._type\)/u);

console.log('guided recovery passed');
