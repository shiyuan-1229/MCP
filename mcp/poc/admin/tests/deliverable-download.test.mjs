import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const appFilePath = path.join(adminRoot, 'assets', 'app.js');

const source = await readFile(appFilePath, 'utf8');
const match = source.match(/function downloadDeliverable\(id = state\.selectedDeliverableId\) \{([\s\S]*?)\n\}/u);
assert.ok(match, 'downloadDeliverable function should exist');

const body = match[1];
assert.match(body, /fetch\(`/u);
assert.match(body, /getDeliverableExportPayload\(id\)/u);
assert.match(body, /deliverableFileMeta\(/u);
assert.match(body, /buildDeliverableFileContent\(/u);
assert.match(body, /new Blob\(/u);

console.log('deliverable download fallback checks passed');