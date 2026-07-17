import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = await readFile(path.resolve(__dirname, '..', 'assets', 'app.js'), 'utf8');

assert.match(app, /function applyNavigationData\(snapshot\)/u, 'navigation state must have one snapshot applicator');
assert.match(app, /async function loadNavigationData\(\)/u, 'navigation state must load one role-scoped snapshot');
assert.match(app, /'\/api\/platform\/navigation-data'/u, 'administrator navigation must use its live snapshot route');
assert.match(app, /'\/api\/customer\/navigation-data'/u, 'customer navigation must use its live snapshot route');
assert.match(app, /async function loadAll\(\)[\s\S]*?await loadNavigationData\(\)/u, 'initial navigation load must begin with live snapshot data');

console.log('navigation state live-data checks passed');
