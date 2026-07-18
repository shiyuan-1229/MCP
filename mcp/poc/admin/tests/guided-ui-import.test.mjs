import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { renderGuidedWorkQueue } = await import('../assets/modules/guided-ui.js');

assert.equal(typeof renderGuidedWorkQueue, 'function');
console.log('guided UI import passed');
