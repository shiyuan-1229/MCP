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

  assert.match(source, /id: 'authorization', label: '凭证与授权'/u);
  assert.match(source, /id: 'monitoring', label: '调用监控'/u);
}

async function verifyPageShells() {
  const html = await readFile(indexFilePath, 'utf8');

  assert.match(html, /section id="authorization" class="page"/u);
  assert.match(html, /section id="monitoring" class="page"/u);
  assert.match(html, /id="authorizationSummary"/u);
  assert.match(html, /id="authorizationRows"/u);
  assert.match(html, /id="monitoringSummary"/u);
  assert.match(html, /id="monitoringRows"/u);
  assert.match(html, /id="monitoringFilters"/u);
}

async function verifyRendererWiring() {
  const source = await readFile(renderersFilePath, 'utf8');

  assert.match(source, /function renderAuthorizationPage\(\)/u);
  assert.match(source, /function renderMonitoringPage\(\)/u);
  assert.match(source, /renderAuthorizationPage\(\);/u);
  assert.match(source, /renderMonitoringPage\(\);/u);
}

async function verifyNavigationActions() {
  const source = await readFile(appFilePath, 'utf8');

  assert.match(source, /function navigateToPage\(pageId, focus = \{\}\)/u);
  assert.match(source, /state\.authorizationFocusId/u);
  assert.match(source, /state\.monitoringFocusId/u);
  assert.match(source, /access-configs\/\$\{id\}\/test/u);
  assert.match(source, /call-events/u);
}

await verifyNavigationEntries();
await verifyPageShells();
await verifyRendererWiring();
await verifyNavigationActions();

console.log('authorization and monitoring structure checks passed');
