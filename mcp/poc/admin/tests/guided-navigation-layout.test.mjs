import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [renderers, styles] = await Promise.all([
  readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8'),
  readFile('mcp/poc/admin/assets/styles.css', 'utf8')
]);

for (const token of ['ADMIN_NAVIGATION_GROUPS', 'getNavigationIdForPage(state.currentPage)', 'nav-group', 'nav-group-label', 'aria-current="page"']) {
  assert.ok(renderers.includes(token), `missing renderer token: ${token}`);
}
for (const token of ['.nav-group', '.nav-group-label', '.nav-btn:focus-visible']) {
  assert.ok(styles.includes(token), `missing style token: ${token}`);
}

console.log('guided navigation layout passed');
