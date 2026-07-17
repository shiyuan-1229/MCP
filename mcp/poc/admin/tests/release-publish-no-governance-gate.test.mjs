import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const server = await readFile(path.join(root, 'server', 'server.js'), 'utf8');
const start = server.indexOf('app.post("/api/platform/releases/:id/publish"');
const end = server.indexOf('app.post("/api/platform/releases/:id/rollback"', start);
assert.ok(start >= 0 && end > start, 'publish route must exist');
const route = server.slice(start, end);
assert.doesNotMatch(route, /release is blocked by governance gates|checkCandidatePublishReadiness|getCandidatePublishReadiness/u);
console.log('publish has no governance gate checks');
