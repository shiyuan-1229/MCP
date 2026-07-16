const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const renderers = read('mcp/poc/admin/assets/modules/renderers.js');
const app = read('mcp/poc/admin/assets/app.js');
const index = read('mcp/poc/admin/index.html');

assert(!renderers.includes('startPocRuntime'), 'asset cards should not offer a POC runtime start action');
assert(renderers.includes('state.pendingWorkBuddyAssetId = assetId;'), 'WorkBuddy asset action should pass the selected asset to the publish page');
assert(renderers.includes("window.jumpToPage?.('publish');"), 'WorkBuddy asset action should navigate to the publish page');
assert(!renderers.includes('window.deployToWorkBuddy?.();'), 'navigating from an asset should not start a deployment automatically');
assert(renderers.includes('const pendingWorkBuddyAssetId = state.pendingWorkBuddyAssetId;'), 'publish rendering should consume the pending WorkBuddy asset');
assert(app.includes('window.deployToWorkBuddy = deployToWorkBuddy;'), 'WorkBuddy deployment should remain available without POC');
assert(index.indexOf('agentChatBox') < index.indexOf('releaseRows'), 'the agent integration panel should appear before the release checklist');
assert(index.includes('onclick="deployToWorkBuddy()"'), 'the agent panel should deploy to WorkBuddy without connecting a POC runtime');

console.log('WorkBuddy navigation without POC checks passed');
