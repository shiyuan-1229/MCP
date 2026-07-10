const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const index = read('mcp/poc/admin/index.html');
const styles = read('mcp/poc/admin/assets/styles.css');
const renderers = read('mcp/poc/admin/assets/modules/renderers.js');

assert(index.includes('access-overview-grid'), 'access overview should use a dedicated layout grid');
assert(styles.includes('.access-overview-grid'), 'styles should define a dedicated access overview grid');
assert(styles.includes('.access-overview-hero'), 'styles should define a compact access overview hero block');
assert(styles.includes('.access-overview-matrix'), 'styles should define a compact access overview matrix');
assert(renderers.includes('access-overview-hero'), 'renderAccess should render the compact access overview hero');
assert(renderers.includes('access-overview-item'), 'renderAccess should render compact access overview items');

console.log('access layout checks passed');
