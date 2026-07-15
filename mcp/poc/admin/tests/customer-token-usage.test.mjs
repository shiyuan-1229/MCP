import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const adminRoot = path.join(root, 'admin');
const [html, renderers, server, styles] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/modules/renderers.js'), 'utf8'),
  readFile(path.join(root, 'server/server.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/styles.css'), 'utf8')
]);

assert.match(html, /<th>Token 消耗<\/th>/u);
for (const token of ['tokenUsageByAsset', 'total_tokens', 'customer-token-usage', '输入', '输出']) {
  assert.match(renderers, new RegExp(token, 'u'));
}
assert.match(server, /SUM\(input_tokens\)/u);
assert.match(server, /SUM\(output_tokens\)/u);
assert.match(server, /SELECT id, status, latency_ms, business_result, trace_id, input_tokens, output_tokens, created_at/u);
assert.match(styles, /\.customer-token-usage/u);

console.log('customer token usage checks passed');