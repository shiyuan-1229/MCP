import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const renderersFilePath = path.join(adminRoot, 'assets/modules/renderers.js');

const renderers = await readFile(renderersFilePath, 'utf8');

for (const token of [
  '生成的 MCP 资产',
  '这些 Tool 会被收敛到这个 MCP 资产里统一交付',
  '查看 MCP 资产',
  "jumpToAssets('${escapeJs(asset.id)}')"
]) {
  assert.match(renderers, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

console.log('tool to asset clarity checks passed');
