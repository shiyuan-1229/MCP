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

globalThis.localStorage = {
  getItem: () => '',
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};
const { renderGuidedWorkQueue } = await import('../assets/modules/guided-ui.js');
const renderNodes = {
  guidedWorkQueue: { innerHTML: '' },
  guidedWorkQueueSummary: { textContent: '' }
};
renderGuidedWorkQueue({
  sources: [{ id: 'source-1', project_id: 'project-1', status: 'connected', recognition_status: 'pending' }],
  candidates: [], reviews: [], toolDrafts: [], assets: [], releases: [], deliverables: [],
  events: [{ id: 'event-1', status_code: 500 }, { id: 'event-2', status_code: 401 }]
}, id => renderNodes[id]);
assert.match(renderNodes.guidedWorkQueue.innerHTML, /class="guided-work-summary"/u);
assert.match(renderNodes.guidedWorkQueue.innerHTML, /<strong>1<\/strong><span>\u8fd0\u884c\u4e0e\u4ea4\u4ed8\u98ce\u9669<\/span>/u);
assert.match(renderNodes.guidedWorkQueue.innerHTML, /<strong>1<\/strong><span>\u51ed\u8bc1\u4e0e\u6388\u6743<\/span>/u);
assert.match(renderNodes.guidedWorkQueue.innerHTML, /navigateToPage\('monitoring'\)/u);

console.log('guided work queue layout passed');
