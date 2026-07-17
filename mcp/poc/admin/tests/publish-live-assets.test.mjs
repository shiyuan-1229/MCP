import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pocRoot = path.resolve(__dirname, '..', '..');
const server = await readFile(path.join(pocRoot, 'server', 'server.js'), 'utf8');

assert.match(server, /function ensureReleaseDraft\(asset/u, 'every MCP asset needs a release-draft helper');
assert.match(server, /function backfillMissingReleaseDrafts\(\)/u, 'legacy MCP assets need release backfill');
assert.match(server, /const release = ensureReleaseDraft\(asset/u, 'new MCP drafts must create a release record immediately');
assert.match(server, /seed\(\);\s*backfillMissingReleaseDrafts\(\);/u, 'startup must backfill missing release records after seeds load');

console.log('live publish asset checks passed');
