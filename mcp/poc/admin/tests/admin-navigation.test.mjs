import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const stateModuleUrl = pathToFileURL(path.join(adminRoot, 'assets/modules/state.js')).href;
const appFilePath = path.join(adminRoot, 'assets/app.js');
const indexFilePath = path.join(adminRoot, 'index.html');
const renderersFilePath = path.join(adminRoot, 'assets/modules/renderers.js');

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

async function verifyNavItems() {
  globalThis.localStorage = createStorage();
  const { navItems } = await import(`${stateModuleUrl}?case=nav`);

  assert.deepEqual(
    navItems.map(item => ({ id: item.id, label: item.label })),
    [
      { id: 'summary', label: '工厂总览' },
      { id: 'intake', label: '业务资料' },
      { id: 'recognition', label: 'OpenAPI 草案' },
      { id: 'tooling', label: 'Tool 装配' },
      { id: 'assets', label: 'MCP 资产' },
      { id: 'publish', label: '验证发布' },
      { id: 'delivery', label: '交付资料' },
      { id: 'governance', label: '运行成效' },
      { id: 'settings', label: '资料与结算' }
    ]
  );
}

async function verifyPageShells() {
  const html = await readFile(indexFilePath, 'utf8');

  for (const id of ['summary', 'intake', 'recognition', 'tooling', 'assets', 'publish', 'delivery', 'governance', 'settings']) {
    assert.match(html, new RegExp(`section id="${id}"`, 'u'));
  }

  assert.doesNotMatch(html, /section id="factory"/u);
  assert.doesNotMatch(html, /section id="gateway"/u);
  assert.doesNotMatch(html, /section id="billing"/u);
  assert.doesNotMatch(html, /section id="deliverables"/u);
}

async function verifyKnowledgeJumps() {
  const source = await readFile(appFilePath, 'utf8');

  assert.match(source, /state\.currentPage = 'recognition';/u);
  assert.match(source, /state\.currentPage = 'assets';/u);
  assert.match(source, /state\.currentPage = 'delivery';/u);
  assert.doesNotMatch(source, /state\.currentPage = 'factory';/u);
  assert.doesNotMatch(source, /state\.currentPage = 'deliverables';/u);
}

async function verifyRendererSplit() {
  const source = await readFile(renderersFilePath, 'utf8');

  assert.match(source, /function renderIntake\(\)/u);
  assert.match(source, /function renderRecognition\(\)/u);
  assert.match(source, /function renderTooling\(\)/u);
  assert.match(source, /function renderAssets\(\)/u);
  assert.match(source, /renderIntake\(\);/u);
  assert.match(source, /renderRecognition\(\);/u);
  assert.match(source, /renderTooling\(\);/u);
  assert.match(source, /renderAssets\(\);/u);
  assert.doesNotMatch(source, /renderFactory\(\);/u);
}

await verifyNavItems();
await verifyPageShells();
await verifyKnowledgeJumps();
await verifyRendererSplit();

console.log('admin navigation checks passed');

