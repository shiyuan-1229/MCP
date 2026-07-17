import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [state, renderers] = await Promise.all([
  readFile(path.resolve(__dirname, '..', 'assets', 'modules', 'state.js'), 'utf8'),
  readFile(path.resolve(__dirname, '..', 'assets', 'modules', 'renderers.js'), 'utf8')
]);

assert.doesNotMatch(state, /mcp_release_overrides|mcp_billing_overrides|mcp_access_overrides|mcp_monitoring_issue_statuses/u, 'navigation state must not restore local display overrides');
assert.doesNotMatch(renderers, /releaseOverrides|billingOverrides|monitoringIssueStatuses/u, 'navigation renderers must not merge local overrides');

console.log('navigation no-local-overrides checks passed');
