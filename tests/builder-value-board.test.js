// Builder Value Board 烟雾测试
// 验证：
// 1. server.js 暴露 /api/platform/builder/metrics 路由
// 2. server.js 暴露 /api/platform/governance/candidates/:id/manual-screen 路由
// 3. server.js 暴露 /api/platform/governance/candidates/:id/acceptance 路由
// 4. server.js 在 platform_candidate_assets 表上有 manual_screen_status / acceptance_passed 列
// 5. modules/governance/manual-checks.mjs 存在并暴露 detectSensitiveHits / buildManualGate
// 6. ai-engine.mjs 暴露 generateGovernanceCandidates 输出 needs_human_review / sensitive_hits
// 7. reuse-service.mjs 输出 reuse_category 字段（direct_reuse / adapt_reuse / suggest_new）
// 8. admin/index.html 包含 builderValueBoard 节点与 Builder 文案
// 9. admin/assets/modules/renderers.js 导出 renderBuilderValueBoard 函数
// 10. admin/assets/modules/state.js 包含 builderMetrics 字段

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SERVER_JS = path.join(ROOT, 'mcp/poc/server/server.js');
const AI_ENGINE = path.join(ROOT, 'mcp/poc/server/ai-engine.mjs');
const REUSE = path.join(ROOT, 'mcp/poc/server/modules/governance/reuse-service.mjs');
const MANUAL = path.join(ROOT, 'mcp/poc/server/modules/governance/manual-checks.mjs');
const INDEX = path.join(ROOT, 'mcp/poc/admin/index.html');
const RENDERERS = path.join(ROOT, 'mcp/poc/admin/assets/modules/renderers.js');
const STATE = path.join(ROOT, 'mcp/poc/admin/assets/modules/state.js');
const APP = path.join(ROOT, 'mcp/poc/admin/assets/app.js');

const serverSrc = fs.readFileSync(SERVER_JS, 'utf8');
const aiSrc = fs.readFileSync(AI_ENGINE, 'utf8');
const reuseSrc = fs.readFileSync(REUSE, 'utf8');
const indexSrc = fs.readFileSync(INDEX, 'utf8');
const renderersSrc = fs.readFileSync(RENDERERS, 'utf8');
const stateSrc = fs.readFileSync(STATE, 'utf8');
const appSrc = fs.readFileSync(APP, 'utf8');

// 1. metrics 路由
assert.match(serverSrc, /app\.get\("\/api\/platform\/builder\/metrics"/, 'server.js 必须暴露 /api/platform/builder/metrics 路由');

// 2. manual-screen 路由
assert.match(serverSrc, /app\.post\("\/api\/platform\/governance\/candidates\/:id\/manual-screen"/, 'server.js 必须暴露人工初筛路由');

// 3. acceptance 路由
assert.match(serverSrc, /app\.post\("\/api\/platform\/governance\/candidates\/:id\/acceptance"/, 'server.js 必须暴露发布前验收路由');

// 4. candidate 表列
assert.match(serverSrc, /manual_screen_status\s+TEXT/, 'candidate 表必须包含 manual_screen_status 列');
assert.match(serverSrc, /acceptance_passed\s+(?:INTEGER|TEXT)/, 'candidate 表必须包含 acceptance_passed 列');

// 5. manual-checks 模块存在 + 函数暴露
assert.ok(fs.existsSync(MANUAL), 'modules/governance/manual-checks.mjs 必须存在');
const manualSrc = fs.readFileSync(MANUAL, 'utf8');
assert.match(manualSrc, /export\s+function\s+detectSensitiveHits/, 'manual-checks 必须导出 detectSensitiveHits');
assert.match(manualSrc, /export\s+function\s+buildManualGate/, 'manual-checks 必须导出 buildManualGate');

// 6. ai-engine 输出 needs_human_review + sensitive_hits
assert.match(aiSrc, /needs_human_review/, 'ai-engine 输出必须包含 needs_human_review');
assert.match(aiSrc, /sensitive_hits/, 'ai-engine 输出必须包含 sensitive_hits');

// 7. reuse-service 输出 reuse_category
assert.match(reuseSrc, /reuse_category/, 'reuse-service 输出必须包含 reuse_category');

// 8. index.html Builder 文案 + 节点
assert.match(indexSrc, /builderValueBoard/, 'index.html 必须包含 builderValueBoard 节点');
assert.match(indexSrc, /企业 MCP 打造工作台|企业MCP打造工作台|企业 MCP 打造/, 'index.html 必须包含「企业 MCP 打造工作台」文案');

// 9. renderBuilderValueBoard 导出
assert.match(renderersSrc, /export\s+function\s+renderBuilderValueBoard/, 'renderers.js 必须导出 renderBuilderValueBoard');

// 10. state.builderMetrics 字段
assert.match(stateSrc, /builderMetrics/, 'state.js 必须包含 builderMetrics 字段');

// 11. app.js 调用 builder/metrics API
assert.match(appSrc, /api\(\s*'\/api\/platform\/builder\/metrics'\s*\)/, 'app.js 必须拉取 builder metrics');

console.log('builder value board smoke test passed');