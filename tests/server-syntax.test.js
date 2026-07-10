const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const serverFile = path.join(__dirname, '..', 'mcp', 'poc', 'server', 'server.js');
const source = fs.readFileSync(serverFile, 'utf8').replace(/^\uFEFF/, '');
const transformed = source
  .replace(/^import\s.+?;\r?$/gm, '')
  .replace(/import\.meta\.url/g, '"file:///server.js"');
let error = null;

try {
  new vm.Script(transformed, { filename: serverFile });
} catch (err) {
  error = err;
}

assert.strictEqual(
  error,
  null,
  `server.js should remain syntactically valid after removing ESM-only syntax.\n${error ? error.message : ''}`
);

console.log('server syntax check passed');
