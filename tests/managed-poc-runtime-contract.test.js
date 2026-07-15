const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'mcp/poc/server/server.js'), 'utf8');

assert.match(server, /platform_poc_runtime_instances/, 'server should persist managed POC runtimes');
assert.match(server, /platform_poc_acceptance_runs/, 'server should persist POC acceptance runs');
assert.match(server, /app\.get\("\/api\/platform\/poc-runtimes"/, 'server should list managed runtimes');
assert.match(server, /app\.post\("\/api\/platform\/mcp-assets\/:id\/poc-runtimes"/, 'server should start a managed runtime');
assert.match(server, /app\.post\("\/api\/platform\/poc-runtimes\/:id\/stop"/, 'server should stop a managed runtime');
assert.match(server, /app\.post\("\/api\/internal\/poc-runtimes\/:id\/events"/, 'server should receive runtime call events');
assert.match(server, /createRuntimeManager/, 'server should use the managed runtime module');

console.log('managed POC runtime contract checks passed');
