import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('data-source import reads the selected type before closing its modal', async () => {
  const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const importHandler = app.slice(
    app.indexOf("response = await api('/api/platform/db/import'"),
    app.indexOf("// 根据后端解析结果显示友好提示")
  );

  assert.ok(importHandler.indexOf('const typeLabel =') >= 0, 'import handler should build a type label');
  assert.ok(importHandler.indexOf('const typeLabel =') < importHandler.indexOf('document.body.removeChild(overlay);'));
});
