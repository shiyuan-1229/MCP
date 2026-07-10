import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const indexFilePath = path.join(adminRoot, 'index.html');
const renderersFilePath = path.join(adminRoot, 'assets/modules/renderers.js');

const html = await readFile(indexFilePath, 'utf8');
const renderers = await readFile(renderersFilePath, 'utf8');

for (const id of [
  'customerAssetSpotlight',
  'customerReleaseTimeline',
  'customerUsageTrendBars',
  'customerUsageHighlights',
  'customerBillingHighlights',
  'customerDeliverableSummary',
  'customerDeliverableHighlights',
  'customerAccessSummary',
  'customerAccessGuideList'
]) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

for (const label of [
  '资产运行焦点',
  '最近交付版本',
  '近 30 天调用趋势',
  '调用观察',
  '账单观察',
  '交付资料总览',
  '交付建议',
  '运行配置总览',
  '使用前须知'
]) {
  assert.match(html, new RegExp(label, 'u'));
}

for (const token of [
  'customerAssetSpotlight',
  'customerReleaseTimeline',
  'customerUsageTrendBars',
  'customerUsageHighlights',
  'customerBillingHighlights',
  'customerDeliverableSummary',
  'customerDeliverableHighlights',
  'customerAccessSummary',
  'customerAccessGuideList'
]) {
  assert.match(renderers, new RegExp(token, 'u'));
}

console.log('customer page checks passed');
