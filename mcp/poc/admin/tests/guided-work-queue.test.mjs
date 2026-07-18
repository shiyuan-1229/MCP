import assert from 'node:assert/strict';
import { deriveGuidedWork } from '../assets/modules/guidance.js';

const work = deriveGuidedWork({
  sources: [{ id: 'source-1', project_id: 'project-1', status: 'connected', recognition_status: 'pending' }],
  candidates: [{ id: 'candidate-1', project_id: 'project-1', stage: 'risk_review', risk_level: 'high' }],
  reviews: [], toolDrafts: [], assets: [], releases: [], deliverables: [], events: []
});

assert.equal(work[0].stage, 'review');
assert.equal(work[0].pageId, 'review');
assert.equal(work[0].actionLabel, '处理高风险审核');
assert.equal(work[1].stage, 'intake');
assert.equal(work[1].actionLabel, '提交 AI 识别');

const publishBlocked = deriveGuidedWork({
  sources: [], candidates: [], reviews: [], toolDrafts: [],
  assets: [{ id: 'asset-1', project_id: 'project-1', status: 'acceptance_failed' }],
  releases: [], deliverables: [],
  events: [{ id: 'event-1', asset_id: 'asset-1', status_code: 500, trace_id: 'trace-1' }]
});

assert.equal(publishBlocked[0].stage, 'publish');
assert.equal(publishBlocked[0].pageId, 'publish');
assert.equal(publishBlocked[0].focusId, 'event-1');

console.log('guided work queue passed');
