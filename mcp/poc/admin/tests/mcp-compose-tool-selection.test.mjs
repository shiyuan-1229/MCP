import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const pocRoot = path.resolve(adminRoot, '..');

const [renderers, server] = await Promise.all([
  readFile(path.join(adminRoot, 'assets', 'modules', 'renderers.js'), 'utf8'),
  readFile(path.join(pocRoot, 'server', 'server.js'), 'utf8')
]);

assert.match(renderers, /data-mcp-candidate-id/u);
assert.match(renderers, /querySelectorAll\('\[data-mcp-candidate-id\]'\)/u);
assert.match(renderers, /selected_tool_names: selectedToolNames/u);
assert.doesNotMatch(renderers, /mcp-tool-check-' \+ escapeJs\(candidate\.id\)/u);

assert.match(server, /selected_tool_names/u);
assert.match(server, /mcp_tools_snapshot = \??/u);

console.log('MCP composition Tool selection checks passed');
