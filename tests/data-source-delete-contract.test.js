import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const server = fs.readFileSync(path.join(root, 'mcp/poc/server/server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');

test('data sources can be deleted while generated MCP assets remain protected', () => {
  assert.match(server, /app\.delete\("\/api\/platform\/data-sources\/:id"/);
  assert.match(server, /资料已生成 MCP 草稿或正式发布资产，不能直接删除/);
  assert.match(server, /DELETE FROM platform_candidate_assets/);
  assert.match(app, /window\.deleteDataSource = deleteDataSource/);
  assert.match(renderers, /deleteDataSource\('/);
});
