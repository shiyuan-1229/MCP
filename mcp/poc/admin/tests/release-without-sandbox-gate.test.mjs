import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pocRoot = path.resolve(__dirname, '..', '..');
const [html, app, renderers, server] = await Promise.all([
  readFile(path.join(pocRoot, 'admin', 'index.html'), 'utf8'),
  readFile(path.join(pocRoot, 'admin', 'assets', 'app.js'), 'utf8'),
  readFile(path.join(pocRoot, 'admin', 'assets', 'modules', 'renderers.js'), 'utf8'),
  readFile(path.join(pocRoot, 'server', 'server.js'), 'utf8')
]);

assert.doesNotMatch(html, /sandboxTestBtn/u, 'the sandbox test button must be removed');
assert.doesNotMatch(html, /sandboxTestResult/u, 'the sandbox result panel must be removed');
assert.doesNotMatch(app, /runSandboxTest/u, 'the browser must not retain sandbox test behavior');
assert.doesNotMatch(app, /markReleaseTested/u, 'the browser must not retain the obsolete manual test-pass action');
assert.doesNotMatch(server, /\/sandbox-test/u, 'the sandbox test API must be removed');
assert.match(server, /\/security-check/u, 'security checks must remain available independently');
assert.match(server, /environment = 'workbuddy'/u, 'legacy backfilled releases must use the WorkBuddy environment');
assert.match(server, /release_notes IN \('Backfilled for sandbox validation', 'Backfilled for WorkBuddy validation'\)/u, 'all legacy backfilled releases must be migrated');

const publishRoute = server.slice(
  server.indexOf('app.post("/api/platform/releases/:id/publish"'),
  server.indexOf('// 回滚发布')
);
assert.doesNotMatch(publishRoute, /release\.status !== "tested"/u, 'publishing must not require sandbox-tested status');
assert.doesNotMatch(publishRoute, /legacy release requires governance migration/u, 'legacy MCP releases must not be blocked by missing governance metadata');
assert.doesNotMatch(renderers, /markReleaseTested/u, 'the manual sandbox-test pass action must be removed');

console.log('release without sandbox gate checks passed');
