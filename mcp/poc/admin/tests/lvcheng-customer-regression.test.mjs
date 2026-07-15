import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pocRoot = path.resolve(__dirname, '..', '..');
const appFilePath = path.join(pocRoot, 'admin', 'assets', 'app.js');
const serverFilePath = path.join(pocRoot, 'server', 'server.js');

const appSource = await readFile(appFilePath, 'utf8');
const serverSource = await readFile(serverFilePath, 'utf8');

assert.match(
  appSource,
  /const \[dashboard, overview, trends, events, deliverables, access, billing, builderRequests, candidates, reviews\] = await Promise\.all\(/u,
  'customer loadAll should initialize overview, candidates and reviews alongside builderRequests'
);

assert.match(
  serverSource,
  /const assets = scopedAssets\(req\)\.filter\(a => a\.status === "published"\);/u,
  'customer dashboard should only expose published assets'
);

assert.match(serverSource, /mcp_lvcheng_member_profile/u);
assert.match(serverSource, /mcp_lvcheng_order_journey/u);
assert.match(serverSource, /acc_lvcheng_cdp/u);
assert.match(serverSource, /pub_lvcheng_member_profile/u);
assert.match(
  serverSource,
  /function repairLvchengDemoText\(database\) \{[\s\S]*?UPDATE platform_mcp_assets[\s\S]*?mcp_lvcheng_member_profile/u,
  'server seed should repair existing Lvcheng asset text'
);
assert.match(
  serverSource,
  /repairLvchengDemoText\(db\);/u,
  'server seed should run the Lvcheng text repair'
);

console.log('lvcheng customer regression checks passed');
