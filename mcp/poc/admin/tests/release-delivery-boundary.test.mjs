import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, state, renderers, server] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../assets/modules/state.js', import.meta.url), 'utf8'),
  readFile(new URL('../assets/modules/renderers.js', import.meta.url), 'utf8'),
  readFile(new URL('../../server/server.js', import.meta.url), 'utf8')
]);

assert.match(state, /\u4e0a\u7ebf MCP \u7248\u672c/u);
assert.match(html, /\u4e0a\u7ebf MCP \u7248\u672c/u);
assert.match(renderers, /\\u53d1\\u5e03\\u4ea4\\u4ed8\\u5305\\u7ed9\\u5ba2\\u6237/u);
assert.match(renderers, /canPublishDelivery/u);
for (const token of ['published MCP asset required before delivery package publishing', 'required delivery materials missing', "status = 'published'", "type IN ('config','test-report','run-guide')"]) {
  assert.match(server, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

console.log('release delivery boundary checks passed');