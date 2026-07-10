import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');
const renderersFilePath = path.join(adminRoot, 'assets', 'modules', 'renderers.js');

const [html, renderersSource] = await Promise.all([
  readFile(indexFilePath, 'utf8'),
  readFile(renderersFilePath, 'utf8')
]);

assert.match(
  html,
  /<thead><tr><th>MCP 资产<\/th><th>版本<\/th><th>状态<\/th><th>环境<\/th><th>测试时间<\/th><th>发布时间<\/th><th>发布说明<\/th><th>发布对象<\/th><th>操作<\/th><\/tr><\/thead>/u
);
assert.doesNotMatch(html, /<thead><tr><th>MCP \?\?<\/th>/u);

assert.match(renderersSource, /publishRelease\(/u);
assert.match(renderersSource, /markReleaseTested\(/u);
assert.match(renderersSource, /rollbackRelease\(/u);
assert.match(renderersSource, /发布范围/u);
assert.match(renderersSource, /发布对象/u);

console.log('admin publish clarity checks passed');
