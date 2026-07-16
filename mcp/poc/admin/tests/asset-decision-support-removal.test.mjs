import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');

const [html, app, renderers] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/app.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/modules/renderers.js'), 'utf8')
]);

for (const token of [
  'reuseSuggestionBoard',
  'retroSummaryBoard',
  'renderReuseSuggestions',
  'renderRetroSummaryBoard',
  '/api/platform/governance/reuse-suggestions',
  '/api/platform/governance/retro-summary',
  '/api/platform/governance/retro-reasons'
]) {
  assert.ok(!`${html}\n${app}\n${renderers}`.includes(token), `asset page should not include ${token}`);
}

console.log('asset decision support removal checks passed');
