import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, renderers, guidedUi, styles] = await Promise.all([
  readFile('mcp/poc/admin/index.html', 'utf8'),
  readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8'),
  readFile('mcp/poc/admin/assets/modules/guided-ui.js', 'utf8'),
  readFile('mcp/poc/admin/assets/styles.css', 'utf8')
]);

for (const removedId of ['builderValueBoard', 'summaryCards', 'governanceValueBoard', 'governanceFlowBoard', 'governanceActionBoard', 'governanceRiskBoard', 'generationFunnel', 'generationFlowBoard', 'projectRows', 'activityList']) {
  assert.doesNotMatch(html, new RegExp(`id="${removedId}"`, 'u'));
}
assert.match(html, /data-title="&#20170;&#26085;&#24453;&#21150;"/u);
assert.match(html, /id="guidedWorkQueue"/u);
assert.match(html, /id="guidedWorkQueueSummary"/u);
assert.match(renderers, /renderGuidedWorkQueue/u);
assert.match(guidedUi, /export function renderGuidedWorkQueue\(state, \$\)/u);
assert.match(guidedUi, /decisionGroups/u);
for (const token of ['guided-work-main', 'guided-work-focus', 'guided-work-decision-list', 'guided-work-batch', 'guided-work-side', 'guided-work-summary', 'guided-summary-grid']) {
  assert.match(guidedUi, new RegExp(token, 'u'));
  assert.match(styles, new RegExp(`\\.${token}`, 'u'));
}
assert.match(guidedUi, /deriveGuidedWork\(state\)/u);
assert.match(styles, /\.guided-work-list/u);
assert.match(styles, /\.guided-work-card/u);
assert.doesNotMatch(guidedUi, /guided-work-(impact|risk|auth)/u);
assert.doesNotMatch(styles, /\.guided-work-(impact|risk|auth)/u);

console.log('guided work queue layout passed');
