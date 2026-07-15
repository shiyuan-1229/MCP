import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');
const appFilePath = path.join(adminRoot, 'assets', 'app.js');

const html = await readFile(indexFilePath, 'utf8');
const appSource = await readFile(appFilePath, 'utf8');

assert.match(html, /<select id="loginUserSelect"[^>]*>/u);
assert.match(html, /<option value="lvcheng"[^>]*>[^<]*绿城中国/u);
assert.match(html, /id="loginPass"[^>]*value="admin123"/u);
assert.match(appSource, /function syncLoginSelection\(/u);
assert.match(appSource, /\$\('loginUserSelect'\)/u);
assert.match(appSource, /selectedOptions\?\.\[0\]/u);
assert.match(appSource, /selected\.dataset\.password/u);

console.log('customer login flow checks passed');
