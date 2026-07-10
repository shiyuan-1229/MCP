import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

globalThis.localStorage = createStorage();
globalThis.window = globalThis;

const fileUrl = pathToFileURL(path.resolve('D:/桌面/mcp方案/mcp/poc/admin/assets/modules/renderers.js')).href;
const mod = await import(`${fileUrl}?case=renderers-import`);
assert.equal(typeof mod.renderAll, 'function');
console.log('renderers import check passed');
