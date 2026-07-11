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

// 当前治理与统计页面的核心元素
for (const id of [
  'policyRows',
  'policyChangeRows',
  'usageSummary'
]) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

for (const label of [
  '治理与统计',
  '规则变更记录'
]) {
  assert.match(html, new RegExp(label, 'u'));
}

for (const token of [
  'policyRows',
  'policyChangeRows',
  'usageSummary'
]) {
  assert.match(renderers, new RegExp(token, 'u'));
}

console.log('admin security layout checks passed');
