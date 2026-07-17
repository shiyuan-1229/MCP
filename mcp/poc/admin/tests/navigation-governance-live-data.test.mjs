import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = await readFile(path.resolve(__dirname, '..', 'assets', 'app.js'), 'utf8');
const renderers = await readFile(path.resolve(__dirname, '..', 'assets', 'modules', 'renderers.js'), 'utf8');

assert.match(app, /function buildLiveGovernanceOverview\(snapshot\)/u, 'governance overview must be derived from the live snapshot');
assert.doesNotMatch(app, /\/api\/platform\/governance\/demo-overview/u, 'the browser must not load governance demo data');
assert.match(app, /const acceptanceFailures = events\.filter/u, 'governance failures must come from recorded call events');
assert.doesNotMatch(renderers, /governanceFailureEvents\(/u, 'monitoring must not inject generated demo failures');

console.log('navigation governance live-data checks passed');
