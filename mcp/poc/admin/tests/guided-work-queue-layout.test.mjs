import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, renderers, styles] = await Promise.all([
  readFile('mcp/poc/admin/index.html', 'utf8'),
  readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8'),
  readFile('mcp/poc/admin/assets/styles.css', 'utf8')
]);

assert.match(html, /id="guidedWorkQueue"/u);
assert.match(html, /id="guidedWorkQueueSummary"/u);
assert.match(renderers, /function renderGuidedWorkQueue\(\)/u);
assert.match(renderers, /deriveGuidedWork\(state\)/u);
assert.match(styles, /\.guided-work-list/u);
assert.match(styles, /\.guided-work-card/u);

console.log('guided work queue layout passed');
