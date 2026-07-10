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
  'customerAssetUsageBoard',
  'customerBillingAssetRows'
]) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

for (const label of [
  '使用类别',
  '总 Token',
  '累计调用量',
  'Token 账单',
  '按 MCP Token 账单'
]) {
  assert.match(html, new RegExp(label, 'u'));
}

for (const token of [
  'customerAssetUsageBoard',
  'customerBillingAssetRows',
  '内部使用',
  '外部使用',
  'Token 账单'
]) {
  assert.match(renderers, new RegExp(token, 'u'));
}

console.log('customer visibility checks passed');
