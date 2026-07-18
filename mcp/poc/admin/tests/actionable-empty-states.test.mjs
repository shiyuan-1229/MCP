import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [renderers, guidedUi] = await Promise.all([
  readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8'),
  readFile('mcp/poc/admin/assets/modules/guided-ui.js', 'utf8')
]);

assert.match(renderers, /enhanceActionableEmptyStates\(state, \$\)/u);
assert.match(guidedUi, /export function enhanceActionableEmptyStates\(state, \$\)/u);
assert.match(guidedUi, /createDataSourceBtn/u);
assert.match(guidedUi, /navigateToPage\('tooling'\)/u);

console.log('actionable empty states passed');
