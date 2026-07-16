const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'mcp/poc/admin/index.html'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/styles.css'), 'utf8');

assert(index.includes('intake-col intake-col-select'), 'intake table should define a dedicated selection column');
assert(index.includes('<th></th><th>\u8d44\u6599\u540d\u79f0</th><th>\u6240\u5c5e\u9879\u76ee</th><th>\u7c7b\u578b</th><th>\u8ba4\u8bc1\u65b9\u5f0f</th><th>\u63a5\u5165\u72b6\u6001</th><th>\u8bc6\u522b\u8fdb\u5ea6</th><th>\u4ea7\u51fa\u7269</th><th>\u64cd\u4f5c</th>'), 'intake table should show the correct Chinese headers after the checkbox column');
assert(renderers.includes('const MAX_VISIBLE_INTAKE_ITEMS = 3;'), 'intake renderer should cap visible items at three per enterprise');
assert(renderers.includes('renderIntakeTableColgroup'), 'intake renderer should reuse the column layout for nested enterprise tables');
assert(renderers.includes('syncIntakeEnterpriseScrollHeights'), 'intake renderer should size each enterprise scroll area to three rows');
assert(renderers.includes('requestAnimationFrame(() => syncIntakeEnterpriseScrollHeights(tbody));'), 'intake renderer should measure enterprise rows after layout before applying the scroll height');
assert(renderers.includes('intake-enterprise-scroll-cell'), 'intake renderer should wrap each enterprise list in a scroll container row');
assert(renderers.includes('const hasOpenapiDraft = list(state.openapiSpecs).some(spec => spec.source_id === item.id);'), 'view-draft visibility should be driven by an actual OpenAPI draft');
assert(renderers.includes('intake-row-actions'), 'intake actions should use the dedicated aligned layout');
assert(styles.includes('.intake-row-actions > .primary-btn { margin-left: auto; }'), 'recognition actions should be pinned to the right edge');
assert(renderers.includes('${grp.items.length} \u4efd\u8d44\u6599 \u00b7 ${pendingItems.length} \u5f85\u8bc6\u522b'), 'enterprise summary should render correctly encoded Chinese copy');
assert(!renderers.includes('???'), 'new intake renderer copy should not contain encoding fallback characters');
assert(styles.includes('.intake-enterprise-scroll.is-scrollable'), 'styles should enable enterprise-level scrolling for long intake groups');
assert(styles.includes('max-height: 216px;'), 'scrollable enterprise groups should have a three-row CSS height fallback');
assert(styles.includes('.intake-enterprise-table .intake-source-row { height: 72px; }'), 'enterprise source rows should have a stable height for the three-row limit');
assert(styles.includes('.intake-enterprise-table tr:last-child td { border-bottom: 0; }'), 'styles should clean up the nested table border after the last visible row');

console.log('intake enterprise scroll checks passed');
