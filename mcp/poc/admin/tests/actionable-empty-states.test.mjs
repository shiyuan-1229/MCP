import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const renderers = await readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8');

assert.match(renderers, /function enhanceActionableEmptyStates\(\)/u);
assert.match(renderers, /createDataSourceBtn/u);
assert.match(renderers, /navigateToPage\('tooling'\)/u);

console.log('actionable empty states passed');
