import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, renderers, guidedUi, styles] = await Promise.all([
  readFile('mcp/poc/admin/index.html', 'utf8'),
  readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8'),
  readFile('mcp/poc/admin/assets/modules/guided-ui.js', 'utf8'),
  readFile('mcp/poc/admin/assets/styles.css', 'utf8')
]);

assert.match(html, /id="guidedWorkQueue"/u);
assert.match(html, /id="guidedWorkQueueSummary"/u);
assert.match(renderers, /renderGuidedWorkQueue/u);
assert.match(guidedUi, /export function renderGuidedWorkQueue\(state, \$\)/u);
assert.match(guidedUi, /decisionGroups/u);
for (const token of ['guided-work-focus', 'guided-work-decision-list', 'guided-work-batch', 'guided-work-impact']) {
  assert.match(guidedUi, new RegExp(token, 'u'));
  assert.match(styles, new RegExp(`\\.${token}`, 'u'));
}
assert.match(guidedUi, /deriveGuidedWork\(state\)/u);
assert.match(styles, /\.guided-work-list/u);
assert.match(styles, /\.guided-work-card/u);

console.log('guided work queue layout passed');
