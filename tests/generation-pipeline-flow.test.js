const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'mcp/poc/admin/index.html'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');

assert(index.includes('generationFlowBoard'), 'summary page should include a generation flow board container');
assert(index.includes('projectPipelineRows'), 'summary page should include a project pipeline table body');
assert(index.includes('核心链路看板') || index.includes('生成链路看板'), 'summary page should explain the main generation flow');

for (const label of ['业务资料', 'OpenAPI', 'Tools', 'MCP Server', '测试发布', '交付中心']) {
  assert(renderers.includes(label) || index.includes(label), 'pipeline UI should include stage label: ' + label);
}

assert(renderers.includes('renderGenerationFlow'), 'renderers should implement generation flow rendering');
assert(renderers.includes('projectPipelineRows'), 'renderers should render project pipeline rows');

console.log('generation pipeline flow checks passed');