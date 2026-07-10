const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const planPath = path.join(root, 'mcp', 'MCP_Forge_管理员导航重构方案.md');
const prototypePath = path.join(root, 'mcp', 'MCP_Forge_管理员导航原型.html');

assert(fs.existsSync(planPath), 'admin nav plan markdown should exist');
assert(fs.existsSync(prototypePath), 'admin nav prototype html should exist');

const plan = fs.readFileSync(planPath, 'utf8');
const prototype = fs.readFileSync(prototypePath, 'utf8');

for (const label of [
  '管理员视角',
  '企业业务资料 -> MCP 资产',
  '生成总览',
  '资料接入',
  '接口识别',
  'Tool 映射',
  'MCP 资产',
  '测试发布',
  '交付管理',
  '治理与统计',
  '设置'
]) {
  assert(plan.includes(label), `plan should include label: ${label}`);
  assert(prototype.includes(label), `prototype should include label: ${label}`);
}

for (const section of [
  '导航结构',
  '页面职责',
  '主流程路径',
  '原型说明'
]) {
  assert(plan.includes(section), `plan should include section: ${section}`);
}

assert(prototype.includes('main-shell'), 'prototype should define a main shell layout');
assert(prototype.includes('side-nav'), 'prototype should define a sidebar nav');
assert(prototype.includes('nav-step'), 'prototype should show process-oriented nav states');

console.log('admin nav prototype checks passed');
