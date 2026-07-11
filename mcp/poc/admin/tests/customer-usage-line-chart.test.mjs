import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const renderersFilePath = path.join(adminRoot, 'assets/modules/renderers.js');
const stylesFilePath = path.join(adminRoot, 'assets/styles.css');

const renderers = await readFile(renderersFilePath, 'utf8');
const styles = await readFile(stylesFilePath, 'utf8');

// 当前使用柱状图渲染趋势
assert.match(renderers, /customer-trend-bar/u);
assert.match(renderers, /customer-trend-chart/u);

assert.match(styles, /\.customer-trend-chart/u);
assert.match(styles, /\.customer-trend-bar/u);
assert.match(styles, /\.customer-trend-bar \.bar/u);

console.log('customer usage chart checks passed');
