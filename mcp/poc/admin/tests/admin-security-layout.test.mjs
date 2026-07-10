import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');
const renderersFilePath = path.join(adminRoot, 'assets/modules/renderers.js');
const stylesFilePath = path.join(adminRoot, 'assets/styles.css');

const html = await readFile(indexFilePath, 'utf8');
const renderers = await readFile(renderersFilePath, 'utf8');
const styles = await readFile(stylesFilePath, 'utf8');

for (const id of [
  'securityTestAsset',
  'securityTestResult',
  'governanceMainGrid',
  'policyChangePanel'
]) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

for (const label of [
  '安全测试台',
  '鉴权拦截',
  '限流校验',
  '脱敏校验',
  '规则变更记录'
]) {
  assert.match(html, new RegExp(label, 'u'));
}

for (const token of [
  'runSecurityTest',
  'securityTestResult',
  'governanceMainGrid',
  'policyChangePanel'
]) {
  assert.match(renderers, new RegExp(token, 'u'));
}

assert.match(styles, /governance-main-grid/u);

console.log('admin security layout checks passed');
