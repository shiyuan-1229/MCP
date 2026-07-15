import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverFile = path.resolve(__dirname, '..', '..', 'server', 'server.js');
const server = await readFile(serverFile, 'utf8');

assert.match(server, /app\.get\("\/api\/customer\/overview", requireAuth/u);
assert.match(server, /app\.get\("\/api\/customer\/assets\/:id", requireAuth/u);
assert.match(server, /app\.post\("\/api\/customer\/assets\/:id\/trial", requireAuth/u);
assert.match(server, /function customerPublishedAsset\(req, assetId\)/u);
assert.match(server, /asset\.id === assetId && asset\.status === "published"/u);
assert.match(server, /return res\.status\(404\)\.json\(\{ error: "asset not found" \}\);/u);
assert.match(server, /INSERT INTO platform_call_events/u);

console.log('customer trial scope checks passed');