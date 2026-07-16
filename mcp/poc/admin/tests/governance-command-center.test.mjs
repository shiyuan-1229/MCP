import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');

const [html, renderers, styles] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/modules/renderers.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/styles.css'), 'utf8')
]);

for (const token of [
  'governanceCommandCenter',
  'governanceHealthSummary',
  'governanceTaskQueue',
  'governanceImpactPanel',
  'governanceCoverageMatrix',
  'governanceAuditTimeline'
]) {
  assert.match(html, new RegExp(token, 'u'));
}

for (const token of [
  'function governanceTasks(',
  'function renderGovernanceCoverageMatrix(',
  'function renderGovernanceAuditTimeline(',
  'governance-task-card',
  'governance-coverage-matrix',
  'governance-audit-timeline'
]) {
  assert.match(renderers + styles, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

console.log('governance command center checks passed');
