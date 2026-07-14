import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const html = await readFile(path.join(adminRoot, 'index.html'), 'utf8');
const renderers = await readFile(path.join(adminRoot, 'assets/modules/renderers.js'), 'utf8');
const styles = await readFile(path.join(adminRoot, 'assets/styles.css'), 'utf8');

for (const token of [
  '治理链路',
  'Tool 草稿',
  'MCP 组成确认',
  '发布前验收',
  '正式发布',
  'governanceFlowBoard',
  'governanceValueBoard',
  'governanceActionBoard',
  'governanceRiskBoard',
  '待处理事项',
  '风险提示',
  'governanceFlowRoutes',
  "'review'",
  'createCandidateToolDraft',
  'confirmCandidateMcpComposition'
]) {
  assert.match(html + renderers, new RegExp(token, 'u'));
}

for (const token of [
  "{ n: 1, label: '资料接入', page: 'intake' }",
  "{ n: 2, label: 'AI 识别结果', page: 'recognition' }",
  "{ n: 3, label: '候选业务能力', page: 'review' }",
  "{ n: 4, label: '候选接口人工初筛', page: 'review' }",
  "{ n: 5, label: '人工确认 Tool 边界', page: 'tooling' }",
  "{ n: 6, label: '生成 Tool 草稿', page: 'tooling' }",
  "{ n: 7, label: '人工确认 MCP 组成', page: 'tooling' }",
  "{ n: 8, label: '生成 MCP 草稿', page: 'assets' }",
  "{ n: 9, label: '发布前验收', page: 'publish' }",
  "{ n: 10, label: '正式发布', page: 'publish' }",
  's.n < 10'
]) {
  assert.match(renderers, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

for (const token of [
  'function renderGovernanceFlow()',
  'function governanceFailureEvents()',
  '...governanceFailureEvents()',
  'governance-flow-board',
  'governance-action-list',
  "classList.remove('metric-grid')",
  '待人工初筛',
  '待确认 Tool 边界',
  '待确认 MCP 组成',
  '待验收',
  'slice(0, 3)',
  '被拦截',
  '可发布'
]) {
  assert.match(renderers, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

for (const token of ['reviewExampleBoard', 'function renderReviewExamples()', 'AI 建议', '人工判断', '审核案例参考']) {
  assert.match(html + renderers, new RegExp(token, 'u'));
}

assert.match(renderers, /function removeLegacySummaryPanels\(\)/u);
assert.doesNotMatch(styles, /content:'已完成'/u);
assert.match(styles, /#reviewStageSummary\s*\{\s*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);\s*\}/u);
assert.doesNotMatch(renderers, /border-color:var\(--accent\)/u);
for (const id of ['builderValueBoard', 'summaryCards', 'generationFunnel', 'generationFlowBoard', 'projectRows', 'activityList']) {
  assert.match(renderers, new RegExp(`'${id}'`, 'u'));
}

console.log('governance flow visibility tests passed');
