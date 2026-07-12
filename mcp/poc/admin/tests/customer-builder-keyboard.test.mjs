import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const appFilePath = path.join(adminRoot, 'assets', 'app.js');

const source = await readFile(appFilePath, 'utf8');

assert.match(source, /customerBuilderInput'\)\?\.addEventListener\('keydown'/u);
assert.match(source, /event\.key === 'Enter'/u);
assert.match(source, /!event\.shiftKey/u);
assert.match(source, /event\.preventDefault\(\)/u);
assert.match(source, /window\.generateCustomerMcp\(\)/u);

console.log('customer builder keyboard checks passed');
