import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const appFilePath = path.join(adminRoot, 'assets', 'app.js');
const renderersFilePath = path.join(adminRoot, 'assets', 'modules', 'renderers.js');

const [appSource, renderersSource] = await Promise.all([
  readFile(appFilePath, 'utf8'),
  readFile(renderersFilePath, 'utf8')
]);

assert.match(renderersSource, /toggleAssetVisibility\(/u);
assert.match(appSource, /async function toggleAssetVisibility\(/u);
assert.match(appSource, /window\.toggleAssetVisibility = toggleAssetVisibility;/u);

console.log('status chip action checks passed');
