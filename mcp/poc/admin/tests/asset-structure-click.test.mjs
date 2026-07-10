import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const appFilePath = path.join(adminRoot, 'assets', 'app.js');

const source = await readFile(appFilePath, 'utf8');

assert.match(source, /function viewAssetStructure\(id\)/u);
assert.match(source, /jumpToAssets\(id\)/u);
assert.match(source, /window\.viewAssetStructure = viewAssetStructure;/u);

console.log('asset structure click checks passed');
