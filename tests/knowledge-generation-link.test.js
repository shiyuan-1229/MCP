const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');

assert(renderers.includes('buildKnowledgeGenerationLinks'), 'renderers should derive downstream generation outputs for a knowledge source');

for (const label of ['关联 OpenAPI', 'Tool 映射', 'MCP Server 产出']) {
  assert(renderers.includes(label), 'knowledge drawer should expose downstream generation section: ' + label);
}

for (const field of ['state.openapiSpecs', 'state.assets', 'state.timeline']) {
  assert(renderers.includes(field), 'knowledge drawer should link to downstream state field: ' + field);
}

console.log('knowledge generation link checks passed');
