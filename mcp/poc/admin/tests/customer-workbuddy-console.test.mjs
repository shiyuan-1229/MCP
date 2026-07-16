import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const pocRoot = path.resolve(adminRoot, '..');

const [html, app, renderers, server] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'app.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'modules', 'renderers.js'), 'utf8'),
  readFile(path.join(pocRoot, 'server', 'server.js'), 'utf8')
]);

for (const id of ['customerWorkBuddyAssetSelect', 'customerWorkBuddyDeployBtn', 'customerWorkBuddyMessages', 'customerWorkBuddyInput']) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

const accessPageStart = html.indexOf('<section id="my-access"');
const accessPageEnd = html.indexOf('</section>', accessPageStart);
const customerConsoleStart = html.indexOf('id="customerWorkBuddyAssetSelect"');
assert.ok(customerConsoleStart > accessPageStart && customerConsoleStart < accessPageEnd, 'customer WorkBuddy console must replace the access-guide WorkBuddy panel');
for (const token of ['customerDeployToWorkBuddy', 'sendCustomerWorkBuddyMessage', 'renderCustomerWorkBuddy']) {
assert.match(html, /WorkBuddy &#26234;&#33021;&#20307;&#32852;&#35843;&#21488;/u);
assert.match(html, /&#37096;&#32626;&#21040; WorkBuddy/u);
assert.doesNotMatch(html, /WorkBuddy Agent Test Console|Deploy to WorkBuddy/u);
  assert.match(app + renderers, new RegExp(token, 'u'));
}

assert.match(app, /Authorization: `Bearer \$\{state\.token\}`/u);
assert.match(server, /app\.get\("\/api\/workbuddy\/assets\/:id\/tools", requireAuth/u);
assert.match(server, /scopedAssets\(req\)\.some\(item => item\.id === asset_id\)/u);

console.log('customer WorkBuddy console checks passed');
