import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');

const html = await readFile(indexFilePath, 'utf8');

assert.doesNotMatch(html, /\?{3,}/u);

for (const title of [
  '打造总览',
  '资料接入',
  '接口识别',
  'Tool 映射',
  'MCP 资产',
  '测试发布',
  '交付管理',
  '治理与统计'
]) {
  assert.match(html, new RegExp(title, 'u'));
}

for (const heading of [
  '资料接入工作台',
  'OpenAPI 草案列表',
  'Tool 映射看板',
  'MCP 资产目录',
  '规则变更记录'
]) {
  assert.match(html, new RegExp(heading, 'u'));
}

console.log('admin copy checks passed');
