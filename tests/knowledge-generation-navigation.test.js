const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');

for (const fn of [
  'jumpFromKnowledgeToOpenapi',
  'jumpFromKnowledgeToAsset',
  'jumpFromKnowledgeToRelease',
  'jumpFromKnowledgeToDeliverable'
]) {
  assert(app.includes(fn), 'app should expose knowledge downstream navigation helper: ' + fn);
}

for (const hook of [
  'window.jumpFromKnowledgeToOpenapi',
  'window.jumpFromKnowledgeToAsset',
  'window.jumpFromKnowledgeToRelease',
  'window.jumpFromKnowledgeToDeliverable'
]) {
  assert(renderers.includes(hook), 'knowledge drawer should call downstream navigation hook: ' + hook);
}

for (const label of ['查看规范', '查看资产', '查看发布', '查看交付']) {
  assert(renderers.includes(label), 'knowledge drawer should render downstream navigation CTA: ' + label);
}

for (const stateRef of ['state.selectedOpenapiSpecId', 'state.selectedTimelineAssetId']) {
  assert(renderers.includes(stateRef) || app.includes(stateRef), 'navigation should target existing downstream state: ' + stateRef);
}

console.log('knowledge generation navigation checks passed');
