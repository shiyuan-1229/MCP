import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const stateFilePath = path.join(adminRoot, 'assets/modules/state.js');
const appFilePath = path.join(adminRoot, 'assets/app.js');
const indexFilePath = path.join(adminRoot, 'index.html');
const renderersFilePath = path.join(adminRoot, 'assets/modules/renderers.js');

async function verifyNavigationEntries() {
  const source = await readFile(stateFilePath, 'utf8');

  assert.doesNotMatch(source, /id: 'authorization', label: '凭证与授权/u);
  assert.match(source, /id: 'monitoring', label: '调用监控'/u);
  assert.match(source, /monitoringIssueStatuses/u);
  assert.match(source, /query: ''/u);
}

async function verifyPageShells() {
  const html = await readFile(indexFilePath, 'utf8');

  assert.doesNotMatch(html, /section id="authorization" class="page"/u);
  assert.match(html, /section id="monitoring" class="page"/u);
  assert.match(html, /section id="settings" class="page"/u);
  assert.match(html, /id="apiKeySummary"/u);
  assert.match(html, /id="apiKeyRows"/u);
  assert.ok(html.indexOf('id="apiKeySummary"') < html.indexOf('id="apiKeyRows"'), 'API Key 摘要应位于凭证表格上方');
  assert.match(html, /id="monitoringSummary"/u);
  assert.match(html, /id="monitoringRows"/u);
  assert.match(html, /id="monitoringFilters"/u);
  assert.match(html, /id="monitoringTrend"/u);
  assert.match(html, /monitoring-issue-list/u);
  assert.match(html, /monitoring-command-center/u);
}

async function verifyRendererWiring() {
  const source = await readFile(renderersFilePath, 'utf8');

  assert.doesNotMatch(source, /function renderAuthorizationPage\(\)/u);
  assert.match(source, /function renderMonitoringPage\(\)/u);
  assert.match(source, /function monitoringIssueKey\(/u);
  assert.match(source, /function renderMonitoringTrend\(/u);
  assert.match(source, /monitoringIssueStatusBadge/u);
  assert.match(source, /诊断链路/u);
  assert.match(source, /renderAccess\(\);/u);
  assert.match(source, /renderMonitoringPage\(\);/u);
  assert.match(source, /const summaryNode = \$\('apiKeySummary'\);/u);
  assert.match(source, /const node = \$\('apiKeyRows'\);/u);
}

async function verifyNavigationActions() {
  const source = await readFile(appFilePath, 'utf8');

  assert.match(source, /function navigateToPage\(pageId, focus = \{\}\)/u);
  assert.match(source, /state\.monitoringFocusId/u);
  assert.match(source, /function markMonitoringIssueStatus\(/u);
  assert.match(source, /mcp_monitoring_issue_statuses/u);
  assert.match(source, /access-configs\/\$\{id\}\/test/u);
  assert.match(source, /call-events/u);
}

await verifyNavigationEntries();
await verifyPageShells();
await verifyRendererWiring();
await verifyNavigationActions();

console.log('authorization and monitoring structure checks passed');