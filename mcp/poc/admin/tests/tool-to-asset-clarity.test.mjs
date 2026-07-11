import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');
const renderersFilePath = path.join(adminRoot, 'assets/modules/renderers.js');

const html = await readFile(indexFilePath, 'utf8');
const renderers = await readFile(renderersFilePath, 'utf8');

for (const token of [
  'Tool 映射看板',
  'Tool 映射清单'
]) {
  assert.match(html, new RegExp(token, 'u'));
}

for (const token of [
  'toolingSummary',
  'toolMappingList'
]) {
  assert.match(renderers, new RegExp(token, 'u'));
}

console.log('tool to asset clarity checks passed');
