import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const renderersFilePath = path.join(adminRoot, 'assets', 'modules', 'renderers.js');

const source = await readFile(renderersFilePath, 'utf8');

// renderIntake 中存在 statusBadge 渲染逻辑
assert.match(source, /const statusBadge = badge\(item\.status \|\| 'draft'\);/u);
assert.match(source, /\$\{statusBadge\}/u);

console.log('admin login smoke checks passed');
