import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const stateUrl = pathToFileURL('C:/tmp/mcp-forge-guided-navigation/mcp/poc/admin/assets/modules/state.js').href;
const { state, navItems } = await import(`${stateUrl}?guided-navigation-state`);

assert.deepEqual(
  navItems.map(item => item.id),
  ['summary', 'intake', 'recognition', 'tooling', 'publish', 'delivery', 'assets', 'monitoring', 'settings']
);
assert.deepEqual(state.guidanceFocus, { projectId: '', assetId: '', focusId: '', reason: '' });

console.log('guided navigation state passed');
