const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const files = [
  'PRODUCT.md',
  'mcp/poc/admin/index.html',
  'mcp/poc/admin/assets/styles.css',
  'mcp/poc/admin/assets/app.js',
  'mcp/poc/admin/assets/modules/state.js',
  'mcp/poc/admin/assets/modules/api.js',
  'mcp/poc/admin/assets/modules/ui.js',
  'mcp/poc/admin/assets/modules/renderers.js',
  'mcp/poc/DEPLOY.md',
  'mcp/poc/server/package.json',
  'mcp/poc/demo-server/package.json',
  'mcp/poc/docker-compose.yml',
  'mcp/poc/Dockerfile',
  'tests/frontend-role-and-modules.test.js',
  'tests/platform-model.test.js',
  'test_enterprise_mcp_focus.js'
];

const requiredChinese = {
  'PRODUCT.md': ['Retail data is a demo source only', 'Make role boundaries obvious'],
  'mcp/poc/admin/index.html': ['企业 MCP 交付与治理平台', '生成总览'],
  'mcp/poc/admin/assets/modules/state.js': ['生成总览', '计费结算'],
  'mcp/poc/admin/assets/modules/ui.js': ['没有权限执行此操作', '登录已过期，请重新登录'],
  'mcp/poc/admin/assets/modules/renderers.js': ['治理策略', '交付中心'],
  'mcp/poc/DEPLOY.md': ['Docker 部署指南', '管理后台', 'Demo 服务'],
  'mcp/poc/server/package.json': ['企业 MCP 交付与治理后台 POC'],
  'mcp/poc/demo-server/package.json': ['零售场景 Demo MCP Server'],
  'mcp/poc/docker-compose.yml': ['MCP Forge Docker Compose'],
  'mcp/poc/Dockerfile': ['MCP Forge Dockerfile']
};

const badPatterns = [
  /\uFFFD/,
  /\u951f/,
  /\u9983/,
  /\u9225/,
  /\u7ee0/,
  /\u93b5/,
  /\u9427/,
  /\u95bf/,
  /\u7f01/,
  /\u5a34/,
  /\u6d7c/,
  /\u9a9e/
];

for (const rel of files) {
  const file = path.join(root, rel);
  assert(fs.existsSync(file), rel + ' should exist');
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of badPatterns) {
    assert(!pattern.test(text), rel + ' contains mojibake marker ' + pattern);
  }
  for (const phrase of requiredChinese[rel] || []) {
    assert(text.includes(phrase), rel + ' should contain readable Chinese phrase: ' + phrase);
  }
}

console.log('encoding health checks passed');