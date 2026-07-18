import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { getGuidedRecovery } = await import('../assets/modules/guided-ui.js');
const renderers = await readFile('mcp/poc/admin/assets/modules/renderers.js', 'utf8');
assert.match(renderers, /getGuidedRecovery\(type\)/u);
assert.match(renderers, /navigateToPage\('/u);

assert.deepEqual(getGuidedRecovery('401'), { pageId: 'settings', label: '\u5904\u7406\u6388\u6743\u6216\u51ed\u8bc1', reason: '\u8c03\u7528\u56e0\u6388\u6743\u5931\u8d25\u88ab\u963b\u65ad' });
assert.deepEqual(getGuidedRecovery('400'), { pageId: 'tooling', label: '\u786e\u8ba4 Tool \u8fb9\u754c', reason: '\u8c03\u7528\u53c2\u6570\u4e0d\u7b26\u5408 Tool \u8fb9\u754c' });
assert.deepEqual(getGuidedRecovery('5xx'), { pageId: 'intake', label: '\u68c0\u67e5\u63a5\u5165\u5065\u5eb7', reason: '\u8d44\u6599\u6e90\u6216\u63a5\u5165\u5065\u5eb7\u5f02\u5e38' });
assert.deepEqual(getGuidedRecovery('success'), { pageId: 'monitoring', label: '\u6253\u5f00 Trace', reason: '\u9700\u8981\u67e5\u770b\u8c03\u7528\u94fe\u8def' });

console.log('guided recovery passed');
