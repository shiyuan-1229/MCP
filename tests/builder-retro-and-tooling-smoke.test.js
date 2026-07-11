// 烟雾测试 — 验证 retro + tooling 端点和 schema 字段都被加进 server.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '..', 'mcp', 'poc', 'server', 'server.js');
const source = fs.readFileSync(serverFile, 'utf8').replace(/^\uFEFF/, '');

// retro 端点
assert.match(source, /app\.post\("\/api\/platform\/governance\/candidates\/:id\/retro"/, '应暴露 retro POST');
assert.match(source, /app\.get\("\/api\/platform\/governance\/retro-summary"/, '应暴露 retro-summary GET');
assert.match(source, /app\.get\("\/api\/platform\/governance\/retro-reasons"/, '应暴露 retro-reasons GET');

// retro schema
assert.match(source, /retro_reason TEXT/, 'platform_candidate_assets 应有 retro_reason 列');
assert.match(source, /retro_note TEXT/, '应有 retro_note 列');
assert.match(source, /retro_recorded_by TEXT/, '应有 retro_recorded_by 列');
assert.match(source, /retro_recorded_at TEXT/, '应有 retro_recorded_at 列');

// tooling 端点
assert.match(source, /app\.post\("\/api\/platform\/governance\/candidates\/:id\/build-tool"/, '应暴露 build-tool POST');
assert.match(source, /app\.get\("\/api\/platform\/governance\/candidates\/:id\/tool-snapshots"/, '应暴露 tool-snapshots GET');
assert.match(source, /app\.get\("\/api\/platform\/governance\/tool-edit-rules"/, '应暴露 tool-edit-rules GET');

// tooling schema
assert.match(source, /ai_tools_snapshot TEXT/, '应有 ai_tools_snapshot 列');
assert.match(source, /human_tools_snapshot TEXT/, '应有 human_tools_snapshot 列');
assert.match(source, /business_rule_notes TEXT/, '应有 business_rule_notes 列');
assert.match(source, /boundary_warning TEXT/, '应有 boundary_warning 列');
assert.match(source, /built_by TEXT/, '应有 built_by 列');
assert.match(source, /built_at TEXT/, '应有 built_at 列');

// import 新模块
assert.match(source, /from "\.\/modules\/governance\/retro-service\.mjs"/, '应 import retro-service');
assert.match(source, /from "\.\/modules\/governance\/boundary-detector\.mjs"/, '应 import boundary-detector');

console.log('builder retro + tooling smoke check passed');