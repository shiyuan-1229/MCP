import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');

const html = await readFile(indexFilePath, 'utf8');

assert.doesNotMatch(html, /\?{3,}/u);
assert.doesNotMatch(html, /客户 AI 需求池/u);
assert.doesNotMatch(html, /builderRequestRows/u);

for (const title of [
  '打造总览',
  '资料接入',
  'AI 识别结果',
  '候选业务能力',
  '人工确认 Tool 边界',
  '生成 MCP 草稿',
  '测试发布',
  '交付管理',
  '治理统计'
]) {
  assert.match(html, new RegExp(title, 'u'));
}

for (const heading of [
  '资料接入工作台',
  'OpenAPI 草案列表',
  'MCP 资产目录',
  '规则变更记录'
]) {
  assert.match(html, new RegExp(heading, 'u'));
}

console.log('admin copy checks passed');