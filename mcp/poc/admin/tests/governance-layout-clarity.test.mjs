import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');
const stylesFilePath = path.join(adminRoot, 'assets/styles.css');

const html = await readFile(indexFilePath, 'utf8');
const styles = await readFile(stylesFilePath, 'utf8');

assert.match(html, /switchAccessTab\('access-audit'\)">变更/u);
assert.match(html, /<div class="panel-head"><h3>变更记录<\/h3><\/div>/u);
assert.match(html, /switchAccessTab\('access-overview'\)">总览/u);
assert.match(html, /switchAccessTab\('access-health'\)">健康/u);

assert.match(styles, /\.access-overview-grid/u);

console.log('governance layout clarity checks passed');
