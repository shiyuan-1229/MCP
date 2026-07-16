import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const renderersFilePath = path.join(adminRoot, 'assets', 'modules', 'renderers.js');
const appFilePath = path.join(adminRoot, 'assets', 'app.js');

const source = await readFile(renderersFilePath, 'utf8');
const appSource = await readFile(appFilePath, 'utf8');

// renderIntake 中存在 statusBadge 渲染逻辑
assert.match(source, /const statusBadge = badge\(item\.status \|\| 'draft'\);/u);
assert.match(source, /\$\{statusBadge\}/u);

assert.equal(appSource.split("from './modules/ui.js'").length - 1, 1, 'app should import ui helpers once');
assert.equal(appSource.split("from './modules/renderers.js'").length - 1, 1, 'app should import renderers once');
assert.match(appSource, /import \{ request \} from '\.\/modules\/api\.js';/u, 'app should import the request helper');
assert.match(appSource, /return request\(state, path, options, handleUnauthorized\);/u, 'login requests should use the request helper');

console.log('admin login smoke checks passed');
