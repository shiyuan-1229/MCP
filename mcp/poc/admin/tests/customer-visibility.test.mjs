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
  'customerAssetCards',
  'customerBillingSummary'
]) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

for (const label of [
  '我的 MCP 资产',
  '当期账单',
  '近 30 天调用趋势'
]) {
  assert.match(html, new RegExp(label, 'u'));
}

for (const token of [
  'customerAssetCards',
  'customerBillingSummary'
]) {
  assert.match(renderers, new RegExp(token, 'u'));
}

console.log('customer visibility checks passed');
