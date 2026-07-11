const assert = require('assert');
const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '..', 'mcp', 'poc', 'server', 'server.js');
const source = fs.readFileSync(serverFile, 'utf8').replace(/^\uFEFF/, '');

assert.match(source, /CREATE TABLE IF NOT EXISTS platform_candidate_assets/, 'server.js should create platform_candidate_assets');
assert.match(source, /CREATE TABLE IF NOT EXISTS platform_review_tasks/, 'server.js should create platform_review_tasks');
assert.match(source, /CREATE TABLE IF NOT EXISTS platform_published_assets/, 'server.js should create platform_published_assets');
assert.match(source, /CREATE TABLE IF NOT EXISTS platform_reuse_suggestions/, 'server.js should create platform_reuse_suggestions');
assert.match(source, /app\.get\("\/api\/platform\/governance\/candidates"/, 'server.js should expose governance candidates API');
assert.match(source, /app\.post\("\/api\/platform\/governance\/reviews\/:id\/decision"/, 'server.js should expose review decision API');
assert.match(source, /app\.post\("\/api\/platform\/governance\/candidates\/:id\/publish"/, 'server.js should expose candidate publish API');

console.log('governance api smoke check passed');