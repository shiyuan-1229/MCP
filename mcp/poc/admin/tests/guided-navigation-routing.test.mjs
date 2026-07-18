import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile('mcp/poc/admin/assets/app.js', 'utf8');

assert.match(app, /import\s*\{[^}]*isAdminPage[^}]*\}\s*from '\.\/modules\/guidance\.js';/u);
assert.match(app, /function navigateToPage\(pageId, focus = \{\}\)[\s\S]*?isAdminPage\(pageId\)/u);
assert.match(app, /state\.guidanceFocus\s*=\s*\{/u);
assert.match(app, /focusId:\s*focus\.focusId \|\| focus\.eventId \|\| ''/u);
assert.doesNotMatch(app, /const allowed = navItems\.some\(item => item\.id === pageId/u);

console.log('guided navigation routing passed');
