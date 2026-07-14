const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(path.resolve(__dirname, '..', 'mcp/poc/server/modules/governance/control-flow.mjs')).href;

(async () => {
  const {
    buildCandidateFromAi,
    canCreateToolDraft,
    buildToolDraft,
    canConfirmMcpComposition,
    confirmMcpComposition,
    canAssembleMcp,
    buildMcpDraft
  } = await import(moduleUrl);

  const candidate = buildCandidateFromAi({
    id: 'cand_orders',
    project_id: 'proj_retail',
    source_type: 'Database',
    source_ref: 'ds_orders',
    name: '订单查询',
    business_domain: '订单',
    business_action: '查询订单详情',
    operation_type: 'read',
    source_tables: ['orders', 'order_items'],
    source_endpoints: ['GET /orders/{id}'],
    suggested_group: '订单查询',
    grouping_reason: '同一业务动作、同一权限范围、均为只读',
    boundary_rule: '按业务能力组织 Tool，不按单表拆分',
    sensitive_hits: [],
    permission_scope: 'project-only',
    risk_level: 'low'
  });

  assert.equal(candidate.status, 'candidate_pending_review');
  assert.equal(candidate.tool_boundary_status, 'pending');
  assert.equal(candidate.mcp_draft_status, 'not_started');
  assert.equal(candidate.tool_draft_status, 'not_started');
  assert.equal(candidate.mcp_composition_status, 'not_started');
  assert.equal(candidate.human_confirmed, 0);
  assert.equal(candidate.mcp_id, null);
  assert.deepEqual(candidate.source_tables, ['orders', 'order_items']);

  assert.equal(canAssembleMcp(candidate), false, '未确认 Tool 不能组装 MCP');

  const confirmed = {
    ...candidate,
    manual_screen_decision: 'approve',
    human_confirmed: 1,
    tool_boundary_status: 'confirmed',
    human_tools_snapshot: [{ name: 'query_order', operation_type: 'read' }]
  };
  assert.equal(canCreateToolDraft(confirmed), true);
  assert.equal(canAssembleMcp(confirmed), false, 'a Tool draft is required before MCP assembly');

  const toolDraft = buildToolDraft(confirmed, {
    id: 'tool_draft_orders',
    by: 'admin',
    reason: 'Separate order and refund permissions'
  });
  assert.equal(toolDraft.status, 'draft');
  assert.equal(toolDraft.source_candidate_id, confirmed.id);
  assert.deepEqual(toolDraft.tools, confirmed.human_tools_snapshot);

  const toolDraftCreated = {
    ...confirmed,
    tool_draft_id: toolDraft.id,
    tool_draft_status: 'draft'
  };
  assert.equal(canConfirmMcpComposition(toolDraftCreated), true);
  assert.equal(canAssembleMcp(toolDraftCreated), false, 'a confirmed MCP composition is required');

  const composition = confirmMcpComposition(toolDraftCreated, {
    toolDraftIds: [toolDraft.id],
    reason: 'Read-only order lookup MCP',
    by: 'admin'
  });
  assert.equal(composition.status, 'confirmed');
  assert.deepEqual(composition.tool_draft_ids, [toolDraft.id]);

  const readyToAssemble = {
    ...toolDraftCreated,
    mcp_composition_status: composition.status
  };
  assert.equal(canAssembleMcp(readyToAssemble), true);

  Object.assign(confirmed, readyToAssemble);

  const draft = buildMcpDraft(confirmed, { name: '订单查询 MCP', by: '管理员' });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.visibility, 'internal');
  assert.equal(draft.project_id, 'proj_retail');
  assert.deepEqual(draft.tools, confirmed.human_tools_snapshot);
  assert.equal(draft.published, false);

  console.log('customer control flow tests passed');
})();
