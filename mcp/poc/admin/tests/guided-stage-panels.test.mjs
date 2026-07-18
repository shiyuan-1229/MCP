import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const renderers = await readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8');
const styles = await readFile('mcp/poc/admin/assets/styles.css', 'utf8');

assert.match(renderers, /function renderGuidancePanels\(\)/u);
assert.match(renderers, /GUIDANCE_STAGE_META/u);
for (const pageId of ['intake', 'recognition', 'tooling', 'publish', 'delivery']) {
  assert.match(renderers, new RegExp(`'${pageId}'`, 'u'));
}
assert.match(styles, /\.guided-page-guidance/u);
assert.match(styles, /\.guided-stage-panel/u);

console.log('guided stage panels passed');
