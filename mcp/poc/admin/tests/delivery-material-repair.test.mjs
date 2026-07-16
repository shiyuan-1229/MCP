import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '..');
const pocRoot = path.resolve(adminRoot, '..');

const [html, app, renderers, server] = await Promise.all([
  readFile(path.join(adminRoot, 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/app.js'), 'utf8'),
  readFile(path.join(adminRoot, 'assets/modules/renderers.js'), 'utf8'),
  readFile(path.join(pocRoot, 'server/server.js'), 'utf8')
]);

for (const token of [
  'deliveryRepairDrawer',
  'deliveryRepairBackdrop',
  'openDeliveryRepairDrawer',
  'generateDeliveryMaterial',
  'uploadDeliveryMaterial',
  '自动生成',
  '上传文件'
]) {
  assert.match(html + app + renderers, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

for (const token of [
  'file_name TEXT',
  'content_type TEXT',
  'file_content BLOB',
  'origin TEXT',
  '/api/platform/deliverables/generate',
  '/api/platform/deliverables/upload',
  'requireAdmin',
  "upload.single('file')",
  'item.file_content'
]) {
  assert.match(server, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
}

console.log('delivery material repair checks passed');
