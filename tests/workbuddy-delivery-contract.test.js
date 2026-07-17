import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const server = fs.readFileSync(path.join(root, 'mcp/poc/server/server.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'mcp/poc/admin/workbuddy.html'), 'utf8');

test('WorkBuddy deployment is authenticated and can fall back to the deployed MCP', () => {
  assert.match(server, /app\.get\("\/api\/workbuddy\/assets", requireAuth/);
  assert.match(server, /app\.post\("\/api\/workbuddy\/assets\/:id\/execute", requireAuth/);
  assert.match(server, /runDirectWorkBuddyFallback/);
  assert.match(server, /source: runtime \? 'poc_sse' : 'mock'/);
  assert.match(page, /function authHeaders\(\)/);
  assert.match(page, /Authorization: `Bearer \$\{token\}`/);
});
