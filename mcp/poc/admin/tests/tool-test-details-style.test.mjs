import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');

const [app, styles] = await Promise.all([
  readFile(path.join(adminRoot, 'assets', 'app.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'styles.css'), 'utf8')
]);

assert.match(app, /class="tool-test-details"/u);
assert.match(app, /class="tool-test-result"/u);
assert.match(styles, /\.tool-test-details\s*\{[^}]*background:/us);
assert.match(styles, /\.tool-test-result\s*\{[^}]*background:/us);

console.log('tool test details style checks passed');
