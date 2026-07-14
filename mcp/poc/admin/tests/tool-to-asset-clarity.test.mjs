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

assert.match(html, /id="toolingCandidateBoard" class="content-grid two-col tooling-candidate-board"/u);
assert.match(renderers, /root\.classList\.toggle\('is-empty', !candidates\.length\);/u);
assert.match(styles, /\.tooling-candidate-board\.is-empty \{ grid-template-columns: minmax\(0, 1fr\); \}/u);

console.log('tool to asset clarity checks passed');
