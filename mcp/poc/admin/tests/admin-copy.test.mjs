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
  '工厂总览',
  '业务资料',
  'OpenAPI 草案',
  'Tool 装配',
  'MCP 资产',
  '验证发布',
  '交付资料',
  '运行成效',
  '资料与结算'
]) {
  assert.match(html, new RegExp(title, 'u'));
}

for (const heading of [
  '业务资料池',
  'OpenAPI 草案池',
  'Tool 装配清单',
  'MCP 资产目录',
  '验证发布清单',
  '交付资料清单',
  '运行成效总览',
  '知识资料清单',
  '结算资料清单'
]) {
  assert.match(html, new RegExp(heading, 'u'));
}

console.log('admin copy checks passed');
