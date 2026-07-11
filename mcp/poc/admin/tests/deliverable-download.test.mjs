import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const appFilePath = path.join(adminRoot, 'assets', 'app.js');

const source = await readFile(appFilePath, 'utf8');

assert.match(source, /function downloadDeliverable\(/u);
assert.match(source, /function getDeliverableExportPayload\(/u);
assert.match(source, /function deliverableFileMeta\(/u);
assert.match(source, /function buildDeliverableFileContent\(/u);
assert.match(source, /new Blob\(/u);
assert.match(source, /window\.downloadDeliverable = downloadDeliverable;/u);

console.log('deliverable download fallback checks passed');
