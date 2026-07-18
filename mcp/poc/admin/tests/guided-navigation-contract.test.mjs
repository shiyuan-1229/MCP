import assert from 'node:assert/strict';
import {
  ADMIN_NAVIGATION_GROUPS,
  ADMIN_PAGE_IDS,
  getNavigationIdForPage,
  isAdminPage
} from '../assets/modules/guidance.js';

assert.deepEqual(
  ADMIN_NAVIGATION_GROUPS.map(group => [group.id, group.items.map(item => item.id)]),
  [
    ['today', ['summary']],
    ['production', ['intake', 'recognition', 'tooling', 'publish', 'delivery']],
    ['support', ['assets', 'monitoring', 'settings']]
  ]
);
assert.equal(getNavigationIdForPage('review'), 'recognition');
assert.equal(getNavigationIdForPage('mcp-compose'), 'tooling');
assert.equal(getNavigationIdForPage('governance'), 'monitoring');
assert.ok(ADMIN_PAGE_IDS.includes('candidates'));
assert.equal(isAdminPage('customer-overview'), false);

console.log('guided navigation contract passed');
