import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const {
  renderGuidedWorkQueue,
  renderGuidancePanels,
  getGuidedRecovery,
  enhanceActionableEmptyStates
} = await import('../assets/modules/guided-ui.js');

assert.equal(typeof renderGuidedWorkQueue, 'function');
assert.equal(typeof renderGuidancePanels, 'function');
assert.equal(typeof getGuidedRecovery, 'function');
assert.equal(typeof enhanceActionableEmptyStates, 'function');
console.log('guided UI import passed');
