import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');
const styleFilePath = path.join(adminRoot, 'assets', 'styles.css');

const html = await readFile(indexFilePath, 'utf8');
const css = await readFile(styleFilePath, 'utf8');

assert.match(html, /customer-builder-result-panel/u);
assert.doesNotMatch(html, /customer-builder-overview-panel/u);
assert.doesNotMatch(html, /customer-builder-detail-panel/u);
assert.doesNotMatch(html, /customer-builder-footer-bar/u);

assert.match(html, /customerBuilderResultSummary/u);
assert.match(html, /customerBuilderDetailTabs/u);
assert.match(html, /customerBuilderDetailBody/u);
assert.match(html, /customerBuilderInlineConfirmations/u);
assert.match(html, /customerBuilderHistory/u);
assert.match(html, /customer-builder-history-wrap/u);
assert.match(html, /customer-builder-history-head/u);
assert.match(html, /customer-builder-suggestion-wrap/u);
assert.match(html, /customerBuilderInput/u);
assert.match(html, /customer-builder-chat-panel/u);

assert.match(css, /\.customer-builder-layout\s*\{[^}]*align-items:\s*stretch;/u);
assert.match(css, /\.customer-builder-chat-panel/u);
assert.match(css, /\.customer-builder-chat-panel\s*\{[^}]*height:\s*calc\(100vh\s*-\s*120px\);/u);
assert.match(css, /\.customer-builder-chat-panel\s*\{[^}]*max-height:\s*calc\(100vh\s*-\s*120px\);/u);
assert.match(css, /\.customer-builder-chat-panel\s*\{[^}]*overflow:\s*hidden;/u);
assert.match(css, /\.customer-builder-chat\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto\s+auto\s+auto;/u);
assert.match(css, /\.customer-builder-chat\s*\{[^}]*min-height:\s*0;/u);
assert.match(css, /\.customer-builder-messages\s*\{[^}]*overflow-y:\s*auto;/u);
assert.match(css, /\.customer-builder-messages\s*\{[^}]*padding-right:\s*6px;/u);
assert.match(css, /\.customer-builder-history-wrap/u);
assert.match(css, /\.customer-builder-history-list\s*\{[^}]*overflow-y:\s*auto;/u);
assert.match(css, /\.customer-builder-history-item/u);

assert.match(css, /\.customer-builder-result-panel/u);
assert.match(css, /\.customer-builder-result-panel\s*\{[^}]*height:\s*calc\(100vh\s*-\s*120px\);/u);
assert.match(css, /\.customer-builder-result-main/u);
assert.match(css, /\.customer-builder-result-actions/u);
assert.match(css, /\.customer-builder-composer-hint/u);
assert.match(css, /\.customer-builder-result-panel\s*\{[^}]*max-height:\s*calc\(100vh\s*-\s*120px\);/u);
assert.match(css, /\.customer-builder-result-panel\s*\{[^}]*overflow:\s*hidden;/u);
assert.match(css, /\.customer-builder-result-main\s*\{[^}]*min-height:\s*0;/u);
assert.match(css, /\.customer-builder-detail-body\s*\{[^}]*overflow-y:\s*auto;/u);
assert.match(css, /\.customer-builder-detail-body\s*\{[^}]*padding-right:\s*6px;/u);

console.log('customer builder layout checks passed');