// Keep the customer-facing control flow explicit: AI creates candidates,
// people confirm Tool boundaries, and only confirmed Tools can form an MCP draft.

export function buildCandidateFromAi(input = {}) {
  return {
    ...input,
    source_tables: Array.isArray(input.source_tables) ? input.source_tables : [],
    source_endpoints: Array.isArray(input.source_endpoints) ? input.source_endpoints : [],
    sensitive_hits: Array.isArray(input.sensitive_hits) ? input.sensitive_hits : [],
    status: 'candidate_pending_review',
    tool_boundary_status: 'pending',
    tool_draft_id: null,
    tool_draft_status: 'not_started',
    mcp_composition_status: 'not_started',
    mcp_composition_reason: null,
    mcp_composition_by: null,
    mcp_composition_at: null,
    mcp_draft_status: 'not_started',
    human_confirmed: 0,
    mcp_id: null,
    human_tools_snapshot: null,
    tool_confirmation_reason: null
  };
}

export function canCreateToolDraft(candidate = {}) {
  return candidate.manual_screen_decision === 'approve'
    && Number(candidate.human_confirmed) === 1
    && candidate.tool_boundary_status === 'confirmed'
    && Array.isArray(candidate.human_tools_snapshot)
    && candidate.human_tools_snapshot.length > 0
    && !candidate.tool_draft_id;
}

export function buildToolDraft(candidate, { id, by, reason } = {}) {
  if (!canCreateToolDraft(candidate)) {
    throw new Error('Tool boundary must be confirmed before creating a draft');
  }

  return {
    id: id || `tool_draft_${candidate.id}`,
    source_candidate_id: candidate.id,
    project_id: candidate.project_id,
    name: `${candidate.name || 'Business capability'} Tool draft`,
    status: 'draft',
    tools: candidate.human_tools_snapshot,
    change_reason: reason || '',
    created_by: by || ''
  };
}

export function canConfirmMcpComposition(candidate = {}) {
  return candidate.tool_draft_status === 'draft'
    && Boolean(candidate.tool_draft_id)
    && !candidate.mcp_id;
}

export function confirmMcpComposition(candidate, { toolDraftIds, reason, by } = {}) {
  if (!canConfirmMcpComposition(candidate)) {
    throw new Error('A Tool draft is required before confirming MCP composition');
  }
  if (!Array.isArray(toolDraftIds) || !toolDraftIds.length) {
    throw new Error('At least one Tool draft is required');
  }
  if (!String(reason || '').trim()) {
    throw new Error('A composition reason is required');
  }

  return {
    status: 'confirmed',
    tool_draft_ids: toolDraftIds,
    reason: String(reason).trim(),
    confirmed_by: by || ''
  };
}

export function canAssembleMcp(candidate = {}) {
  return candidate.manual_screen_decision === 'approve'
    && Number(candidate.human_confirmed) === 1
    && candidate.tool_boundary_status === 'confirmed'
    && candidate.tool_draft_status === 'draft'
    && Boolean(candidate.tool_draft_id)
    && candidate.mcp_composition_status === 'confirmed'
    && Array.isArray(candidate.human_tools_snapshot)
    && candidate.human_tools_snapshot.length > 0
    && !candidate.mcp_id;
}

export function buildMcpDraft(candidate, { name, by } = {}) {
  if (!canAssembleMcp(candidate)) {
    throw new Error('请先完成人工初筛和 Tool 边界确认');
  }

  return {
    project_id: candidate.project_id,
    name: name || `${candidate.name || '业务能力'} MCP 草稿`,
    capability: candidate.business_action || candidate.name || '待补充业务能力描述',
    status: 'draft',
    version: 'v0.1.0',
    endpoint: `/mcp/draft-${candidate.id}`,
    category: candidate.business_domain || '未分类',
    tools: candidate.human_tools_snapshot,
    visibility: 'internal',
    published: false,
    assembled_by: by || ''
  };
}
