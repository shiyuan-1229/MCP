import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [renderers, guidedUi] = await Promise.all([
  readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8'),
  readFile('mcp/poc/admin/assets/modules/guided-ui.js', 'utf8')
]);
const styles = await readFile('mcp/poc/admin/assets/styles.css', 'utf8');

assert.match(renderers, /renderGuidancePanels/u);
assert.match(guidedUi, /export function renderGuidancePanels\(state\)/u);
for (const pageId of ['intake', 'recognition', 'tooling', 'publish', 'delivery']) {
  assert.match(guidedUi, new RegExp(`${pageId}:`, 'u'));
}
assert.match(styles, /\.guided-page-guidance/u);
assert.match(styles, /\.guided-stage-panel/u);

console.log('guided stage panels passed');
