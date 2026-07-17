import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = await readFile(path.resolve(__dirname, '..', '..', 'server', 'server.js'), 'utf8');

assert.match(server, /function buildPlatformNavigationData\(req\)/u, 'administrator navigation needs one live snapshot builder');
assert.match(server, /function buildCustomerNavigationData\(req\)/u, 'customer navigation needs one scoped live snapshot builder');
assert.match(server, /app\.get\("\/api\/platform\/navigation-data", requireAuth, requireAdmin/u, 'administrator snapshot route must require admin access');
assert.match(server, /app\.get\("\/api\/customer\/navigation-data", requireAuth/u, 'customer snapshot route must require authentication');
assert.match(server, /customerScope\(req\)/u, 'customer snapshot must use customer scope');

console.log('navigation data API checks passed');
