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

for (const id of [
  'toolPackagingFlow',
  'assetStructurePreview'
]) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

for (const label of [
  'Tool 封装关系',
  '封装预览',
  '内部使用',
  '外部使用',
  '包含 Tool',
  '资产结构预览',
  '查看结构'
]) {
  assert.match(html, new RegExp(label, 'u'));
}

for (const token of [
  'toolPackagingFlow',
  'assetStructurePreview',
  '内部使用',
  '外部使用',
  '查看结构'
]) {
  assert.match(renderers, new RegExp(token, 'u'));
}

console.log('admin asset packaging checks passed');
