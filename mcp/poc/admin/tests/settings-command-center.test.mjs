import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const [html, renderers, state, styles] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'modules', 'renderers.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'modules', 'state.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets', 'styles.css'), 'utf8')
]);

for (const id of [
  'settingsCommandCenter',
  'settingsHealthSummary',
  'settingsTabs',
  'settingsAiWorkBuddyPanel',
  'settingsNotificationPanel'
]) {
  assert.match(html, new RegExp(`id="${id}"`, 'u'));
}

assert.match(state, /settingsTab:/u);
assert.match(renderers, /function renderSettingsCenter\(\)/u);
assert.match(renderers, /window\.switchSettingsTab/u);
assert.match(renderers, /renderSettingsCenter\(\);/u);
assert.match(styles, /\.settings-command-center/u);
assert.match(styles, /\.settings-tab-button/u);
