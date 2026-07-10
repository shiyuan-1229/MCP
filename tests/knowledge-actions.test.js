const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/app.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'mcp/poc/admin/assets/modules/renderers.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'mcp/poc/server/server.js'), 'utf8');

assert(app.includes('openKnowledgeUploadModal'), 'app should support uploading knowledge documents');
assert(app.includes('rebuildKnowledgeIndex'), 'app should support rebuilding a knowledge index');
assert(app.includes('runKnowledgeRetrievalTest'), 'app should support retrieval testing');

assert(renderers.includes('knowledgeUploadBtn'), 'knowledge drawer renderer should include upload controls');
assert(renderers.includes('knowledgeReindexBtn'), 'knowledge drawer renderer should include rebuild controls');
assert(renderers.includes('knowledgeTestQuery'), 'knowledge drawer renderer should include retrieval test controls');
assert(renderers.includes('knowledgeRecallLogs'), 'knowledge drawer renderer should include recall logs');

assert(server.includes('/api/platform/knowledge-bases'), 'server should expose knowledge base APIs');
assert(server.includes('/documents'), 'server should support knowledge document uploads');
assert(server.includes('/reindex'), 'server should support knowledge index rebuilds');
assert(server.includes('/retrieval-test'), 'server should support knowledge retrieval tests');
assert(server.includes('/recall-logs'), 'server should expose recall logs');
assert(server.includes('kb_recall_logs'), 'server should persist recall logs');

console.log('knowledge actions checks passed');
