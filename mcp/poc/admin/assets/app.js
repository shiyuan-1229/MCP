import { request } from './modules/api.js';
import { state, navItems, customerNavItems, isCustomerView, getNavItems } from './modules/state.js';
import { $, confirmDialog, escapeHtml, openModal, permissionDeniedMessage, showApp, showLogin, showToast } from './modules/ui.js';
import { renderAll } from './modules/renderers.js';

function list(value) { return Array.isArray(value) ? value : []; }

function handleUnauthorized() {
  localStorage.removeItem('mcp_token');
  state.token = '';
  state.user = null;
  showToast('warning');
  showLogin();
}

async function api(path, options = {}) {
  return request(state, path, options, handleUnauthorized);
}

function getDefaultPageForRole(role = 'customer', requestedPage = '') {
  const items = role === 'admin' ? navItems : customerNavItems;
  const allowedItems = items.filter(item => item.roles.includes(role || 'customer'));
  if (!allowedItems.length) return 'my-assets';
  if (requestedPage && allowedItems.some(item => item.id === requestedPage)) return requestedPage;
  return allowedItems[0].id;
}

function mergeById(primary = [], secondary = []) {
  const map = new Map();
  [...list(primary), ...list(secondary)].forEach(item => {
    if (item?.id) map.set(item.id, item);
  });
  return [...map.values()];
}

function persistLocalCollection(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(list(items)));
  } catch {}
}

function refreshLocalAdminCollections() {
  const serverSources = list(state.sources).filter(item => !item?.is_local_builder_source);
  const serverSpecs = list(state.openapiSpecs).filter(item => !item?.is_local_builder_spec);
  const serverAssets = list(state.assets).filter(item => !item?.is_local_builder_asset);
  state.sources = mergeById(serverSources, state.localIntakeSources);
  state.openapiSpecs = mergeById(serverSpecs, state.localOpenapiSpecs);
  state.assets = mergeById(serverAssets, state.localAssets);
}

function upsertLocalIntakeSource(source) {
  state.localIntakeSources = mergeById(list(state.localIntakeSources).filter(item => item.id !== source.id), [source]);
  persistLocalCollection('mcp_local_intake_sources', state.localIntakeSources);
  refreshLocalAdminCollections();
  return source;
}

function upsertLocalOpenapiSpec(spec) {
  state.localOpenapiSpecs = mergeById(list(state.localOpenapiSpecs).filter(item => item.id !== spec.id), [spec]);
  persistLocalCollection('mcp_local_openapi_specs', state.localOpenapiSpecs);
  refreshLocalAdminCollections();
  return spec;
}

function upsertLocalAsset(asset) {
  state.localAssets = mergeById(list(state.localAssets).filter(item => item.id !== asset.id), [asset]);
  persistLocalCollection('mcp_local_assets', state.localAssets);
  refreshLocalAdminCollections();
  return asset;
}

function findProjectContextForBuilderRequest(request = {}) {
  const referenceIds = list(request.result?.references).map(item => item.id);
  const matchedAsset = list(state.assets).find(asset => referenceIds.includes(asset.id));
  if (matchedAsset) {
    const matchedProject = list(state.projects).find(project => project.id === matchedAsset.project_id);
    return {
      project_id: matchedAsset.project_id || matchedProject?.id || '',
      project_name: matchedAsset.project_name || matchedProject?.name || '客户定制需求',
      customer_name: matchedProject?.customer_name || request.customer_name || '客户'
    };
  }

  const byCustomer = list(state.projects).find(project =>
    project.customer_id === request.customer_id ||
    project.customer_name === request.customer_name ||
    String(project.customer_name || '').includes(String(request.customer_name || ''))
  );
  if (byCustomer) {
    return {
      project_id: byCustomer.id,
      project_name: byCustomer.name || '客户定制需求',
      customer_name: byCustomer.customer_name || request.customer_name || '客户'
    };
  }

  return {
    project_id: '',
    project_name: '客户定制需求',
    customer_name: request.customer_name || '客户'
  };
}

function buildLocalIntakeSourceFromRequest(request = {}) {
  const context = findProjectContextForBuilderRequest(request);
  return {
    id: `src_builder_${request.id}`,
    project_id: context.project_id,
    project_name: context.project_name,
    customer_name: context.customer_name,
    name: `${request.result?.name || '目标 MCP 草案'} 需求单`,
    type: '需求描述',
    auth_mode: '自然语言输入',
    status: 'submitted',
    recognition_status: 'draft',
    builder_request_id: request.id,
    prompt: request.prompt || '',
    source_name: `${request.result?.name || '目标 MCP 草案'} 需求单`,
    is_local_builder_source: true,
    created_at: request.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
  };
}

function buildLocalOpenapiSpecFromRequest(source = {}, request = {}, sampleContent = '') {
  const tools = list(request.result?.tools);
  const paths = {};
  tools.forEach((tool, index) => {
    const path = `/builder/${source.id}/${index + 1}`;
    const method = /创建|提交|执行|催单|核销|提醒/.test(tool.name || '') ? 'post' : 'get';
    paths[path] = {
      [method]: {
        operationId: `builder_${source.id}_${index + 1}`,
        summary: tool.name || `tool_${index + 1}`,
        description: tool.note || '',
        ...(method === 'post' ? {
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    request_id: { type: 'string', description: '客户业务请求标识' },
                    payload: { type: 'object', description: '业务参数' }
                  }
                }
              }
            }
          }
        } : {
          parameters: [{ name: 'query', in: 'query', schema: { type: 'string' }, description: '查询关键词或业务标识' }]
        }),
        responses: {
          '200': {
            description: `${tool.name || 'Tool'} 返回结果`
          }
        }
      }
    };
  });

  return {
    id: `spec_builder_${source.id}`,
    source_id: source.id,
    project_id: source.project_id,
    source_name: source.name,
    title: `${request.result?.name || '目标 MCP 草案'} OpenAPI 草案`,
    spec: {
      openapi: '3.0.0',
      info: {
        title: request.result?.name || '目标 MCP 草案',
        version: '0.1.0',
        description: [request.result?.summary, request.result?.scenario, sampleContent ? `补充说明：${sampleContent}` : ''].filter(Boolean).join(' | ')
      },
      paths
    },
    status: 'draft',
    generated_at: new Date().toISOString(),
    is_local_builder_spec: true,
    builder_request_id: request.id
  };
}

function buildLocalAssetFromRequest(source = {}, request = {}) {
  const tools = list(request.result?.tools).map((tool, index) => ({
    name: `builder_tool_${index + 1}`,
    display_name: tool.name,
    description: tool.note,
    inputSchema: {
      type: 'object',
      properties: {
        payload: { type: 'object', description: '业务输入参数' }
      }
    }
  }));
  return {
    id: `mcp_builder_${source.id}`,
    project_id: source.project_id,
    project_name: source.project_name,
    source_id: source.id,
    source_name: source.name,
    name: request.result?.name || '目标 MCP 草案',
    capability: request.result?.scenario || '客户定制需求生成的 MCP 草案',
    status: 'draft',
    version: 'v0.1.0',
    endpoint: `/mcp/builder/${source.id}`,
    category: '定制',
    visibility: 'internal',
    tools,
    is_local_builder_asset: true,
    builder_request_id: request.id
  };
}

function runLocalBuilderRecognition(source, sampleContent = '') {
  const request = list(state.builderRequests).find(item => item.id === source.builder_request_id);
  if (!request) throw new Error('关联的客户需求不存在');
  const spec = buildLocalOpenapiSpecFromRequest(source, request, sampleContent);
  upsertLocalOpenapiSpec(spec);
  upsertLocalIntakeSource({
    ...source,
    recognition_status: 'done',
    status: 'generating',
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
  });
  return spec;
}

function updateLocalBuilderRequest(requestId, patch = {}) {
  state.builderRequests = list(state.builderRequests).map(item =>
    item.id === requestId ? { ...item, ...patch } : item
  );
  persistLocalCollection('mcp_builder_requests', state.builderRequests);
  return list(state.builderRequests).find(item => item.id === requestId) || null;
}

function acceptBuilderRequestIntoIntake(requestId) {
  const request = list(state.builderRequests).find(item => item.id === requestId);
  if (!request) throw new Error('Builder request not found');

  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const draftSource = buildLocalIntakeSourceFromRequest(request);
  const existing = list(state.localIntakeSources).find(item =>
    item.builder_request_id === requestId || item.id === draftSource.id
  );

  const source = upsertLocalIntakeSource({
    ...draftSource,
    ...existing,
    updated_at: timestamp
  });

  updateLocalBuilderRequest(requestId, { updated_at: timestamp });
  return source;
}

async function loadAll() {
  if (isCustomerView()) {
    const [dashboard, trends, events, deliverables, access, billing] = await Promise.all([
      api('/api/customer/dashboard'),
      api('/api/customer/usage/trends'),
      api('/api/platform/call-events'),
      api('/api/platform/deliverables'),
      api('/api/platform/access-configs'),
      api('/api/platform/billing')
    ]);
    const eventList = Array.isArray(events?.data) ? events.data : Array.isArray(events) ? events : [];
    Object.assign(state, {
      customerDashboard: dashboard,
      customerTrends: trends,
      assets: Array.isArray(dashboard?.assets) ? dashboard.assets : [],
      events: eventList,
      deliverables,
      access,
      billing,
      accessGuide: null
    });
    return;
  }

  const [summary, customers, projects, sources, assets, releases, policies, events, billing, deliverables, access, accessHealth, accessAudit, accessWebhook, policyChanges, knowledgeBases, openapiSpecs, aiConfig, builderMetrics, retroSummary, retroReasons, reuseSuggestions] = await Promise.all([
    api('/api/platform/summary'),
    api('/api/platform/customers'),
    api('/api/platform/projects'),
    api('/api/platform/data-sources'),
    api('/api/platform/mcp-assets'),
    api('/api/platform/releases'),
    api('/api/platform/gateway-policies'),
    api('/api/platform/call-events'),
    api('/api/platform/billing'),
    api('/api/platform/deliverables'),
    api('/api/platform/access-configs'),
    api('/api/platform/access-configs/health-summary'),
    api('/api/platform/access-configs/audit-summary'),
    api('/api/platform/access-configs/webhook-summary'),
    api('/api/platform/policy-changes'),
    api('/api/platform/knowledge-bases'),
    api('/api/platform/openapi-specs'),
    api('/api/platform/ai-config').catch(() => ({ configured: false })),
    api('/api/platform/builder/metrics').catch(() => null),
    api('/api/platform/governance/retro-summary').catch(() => null),
    api('/api/platform/governance/retro-reasons').catch(() => ({ items: [] })),
    api('/api/platform/governance/reuse-suggestions').catch(() => ({ items: [] }))
  ]);

  const eventList = Array.isArray(events?.data) ? events.data : Array.isArray(events) ? events : [];

  Object.assign(state, {
    summary,
    customers,
    projects,
    sources: Array.isArray(sources) ? sources : [],
    assets: Array.isArray(assets) ? assets : [],
    releases,
    policies,
    events: eventList,
    billing,
    deliverables,
    access,
    accessHealth: accessHealth || [],
    accessAudit: accessAudit || [],
    accessWebhook: accessWebhook || [],
    policyChanges,
    knowledgeBases: Array.isArray(knowledgeBases) ? knowledgeBases : [],
    openapiSpecs: Array.isArray(openapiSpecs) ? openapiSpecs : [],
    aiConfig: aiConfig || { configured: false },
    builderMetrics: builderMetrics || null,
    retroSummary: retroSummary || null,
    retroReasons: Array.isArray(retroReasons?.items) ? retroReasons.items : [],
    reuseSuggestions: Array.isArray(reuseSuggestions?.items) ? reuseSuggestions.items : []
  });
  refreshLocalAdminCollections();
}

async function login() {
  $('loginError').textContent = '';
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('loginUser').value.trim(),
        password: $('loginPass').value
      })
    });
    state.token = data.token;
    state.user = data.user;
    state.currentPage = getDefaultPageForRole(state.user?.role, state.currentPage);
    localStorage.setItem('mcp_token', state.token);
    await bootApp();
  } catch (error) {
    $('loginError').textContent = error.message;
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  state.token = '';
  state.user = null;
  localStorage.removeItem('mcp_token');
  showLogin();
}

async function simulate() {
  const output = $('simulateResult');
  output.innerHTML = '<div style="color:#64748b;padding:12px">正在发起 MCP JSON-RPC 2.0 调用...</div>';
  try {
    const tool = $('simulateTool').value;
    const requestId = `req_${Date.now().toString(36)}`;
    const args = tool.includes('sales') || tool.includes('top')
      ? { top_n: 5, date_range: 'month' }
      : tool.includes('member') || tool.includes('benefit')
        ? { member_id: 'ENT-10001' }
        : tool.includes('kb') || tool.includes('search') || tool.includes('qa')
          ? { query: '示例查询', top_k: 3 }
          : tool.includes('order') || tool.includes('work')
            ? { work_order_id: 'WO-1024', include_logs: true }
          : tool.includes('quality') || tool.includes('inspection')
            ? { batch_no: 'QC-202607', top_n: 5 }
          : tool.includes('risk')
            ? { scan_type: 'full', level: 'high' }
          : tool.includes('ticket')
            ? { type: 'plumbing', unit: 'A栋301' }
          : tool.includes('notice') || tool.includes('broadcast')
            ? { scope: 'all', channel: 'wechat' }
          : tool.includes('course')
            ? { student_id: 'STU2001', top_k: 3 }
            : { query: 'test' };

    const data = await api('/admin/simulate-call', {
      method: 'POST',
      body: JSON.stringify({ tool_name: tool, arguments: args, request_id: requestId })
    });

    // 解析 MCP JSON-RPC 响应并格式化展示
    const meta = data.result?._meta || {};
    const usage = meta.usage || {};
    const contentText = data.result?.content?.[0]?.text || '';

    let formatted = '';
    formatted += `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin-bottom:12px">`;
    formatted += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="color:#0369a1">MCP JSON-RPC 2.0 Response</strong><span class="badge success" style="font-size:11px">${data.jsonrpc || '2.0'}</span></div>`;
    formatted += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px">`;
    formatted += `<div><span style="color:#64748b">Trace ID</span><br><code style="color:#0369a1;font-size:11px">${meta.trace_id || '-'}</code></div>`;
    formatted += `<div><span style="color:#64748b">耗时</span><br><strong>${meta.latency_ms || '-'}ms</strong></div>`;
    formatted += `<div><span style="color:#64748b">Token 用量</span><br><strong>${usage.total_tokens || '-'}</strong> <span style="color:#64748b">(in:${usage.input_tokens||0} / out:${usage.output_tokens||0})</span></div>`;
    formatted += `<div><span style="color:#64748b">资产</span><br><strong>${meta.asset_name || tool}</strong></div>`;
    formatted += `</div></div>`;

    formatted += `<details open><summary style="cursor:pointer;font-weight:600;color:#1e293b;margin-bottom:6px">返回数据（result.content）</summary>`;
    formatted += `<pre style="background:#1e293b;color:#e2e8f0;padding:14px;border-radius:6px;font-size:12px;overflow:auto;max-height:320px;white-space:pre-wrap">${escapeHtml(contentText)}</pre></details>`;

    formatted += `<details><summary style="cursor:pointer;font-weight:600;color:#64748b;margin-bottom:6px">完整原始响应</summary>`;
    formatted += `<pre style="background:#f8fafc;padding:14px;border-radius:6px;font-size:11px;overflow:auto;max-height:240px">${escapeHtml(JSON.stringify(data, null, 2))}</pre></details>`;

    output.innerHTML = formatted;
    await loadAll();
    renderAll();
  } catch (error) {
    output.innerHTML = `<div style="color:#dc2626;padding:12px;background:#fef2f2;border-radius:6px"><strong>调用失败</strong><br>${escapeHtml(error.message)}</div>`;
    showToast(error.message, 'error');
  }
}

async function fetchProjectDetail(id) {
  if (!id) return;
  state.projectDetailLoading = true;
  renderAll();
  try {
    const detail = await api(`/api/platform/projects/${id}`);
    state.projectDetails = { ...state.projectDetails, [id]: detail };
    state.projectDrafts = {
      ...state.projectDrafts,
      [id]: {
        owner: detail.project?.owner || '',
        stage: detail.project?.stage || 'draft',
        due_date: detail.project?.due_date || '',
        description: detail.project?.description || ''
      }
    };
  } finally {
    state.projectDetailLoading = false;
    renderAll();
  }
}

async function openProjectDrawer(id) {
  if (!id) return;
  state.selectedProjectId = id;
  state.projectDrawerOpen = true;
  renderAll();
  await fetchProjectDetail(id);
}

function closeProjectDrawer() {
  state.projectDrawerOpen = false;
  state.selectedProjectId = '';
  state.projectDetailLoading = false;
  renderAll();
}

function updateProjectDraft(id, patch) {
  state.projectDrafts = {
    ...state.projectDrafts,
    [id]: {
      ...(state.projectDrafts[id] || {}),
      ...patch
    }
  };
  renderAll();
}

async function updateProject(id, data) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  state.projectSaving = true;
  renderAll();
  try {
    await api(`/api/platform/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    await loadAll();
    await fetchProjectDetail(id);
    showToast('项目信息已更新。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.projectSaving = false;
    renderAll();
  }
}

async function saveProjectDraft() {
  const id = state.selectedProjectId;
  if (!id || !state.projectDrafts[id]) return;
  await updateProject(id, state.projectDrafts[id]);
}

function persistReleaseOverrides() {
  localStorage.setItem('mcp_release_overrides', JSON.stringify(state.releaseOverrides || {}));
}

function openPublishDrawer(id) {
  if (!id) return;
  state.selectedReleaseId = id;
  state.publishDrawerOpen = true;
  renderAll();
}

function closePublishDrawer() {
  state.publishDrawerOpen = false;
  state.selectedReleaseId = '';
  renderAll();
}

function setReleaseOverride(id, patch) {
  if (!id) return;
  state.releaseOverrides = {
    ...(state.releaseOverrides || {}),
    [id]: {
      ...(state.releaseOverrides?.[id] || {}),
      ...patch
    }
  };
  persistReleaseOverrides();
  renderAll();
}

function markReleaseTested(id = state.selectedReleaseId) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  const testedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  setReleaseOverride(id, { status: 'tested', tested_at: testedAt, testedBy: state.user?.display_name || '管理员' });
  showToast('已标记为测试通过。', 'success');
}

function publishRelease(id = state.selectedReleaseId) {
  if (state.user?.role !== 'admin') { showToast(permissionDeniedMessage, 'error'); return; }
  confirmDialog('确认执行发版吗？系统会将当前版本标记为已发布，企业端将同步收到。', async () => {
    try {
      await api(`/api/platform/releases/${id}/publish`, { method: 'POST' });
      await loadAll();
      renderAll();
      state.currentPage = 'delivery';
      renderAll();
      showToast('版本已发布！交付物已更新，企业端已同步。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function rollbackRelease(id = state.selectedReleaseId) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  confirmDialog('确认回滚到上一个稳定版本吗？当前版本会被标记为已回滚。', async () => {
    try {
      await api(`/api/platform/releases/${id}/rollback`, { method: 'POST' });
      await loadAll();
      renderAll();
      showToast('已回滚完成，资产恢复为测试中。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function openUsageDrawer(id) {
  if (!id) return;
  state.selectedUsageEventId = id;
  state.usageDrawerOpen = true;
  renderAll();
}

function closeUsageDrawer() {
  state.usageDrawerOpen = false;
  state.selectedUsageEventId = '';
  renderAll();
}

function copyUsageTrace(traceId = '') {
  if (!traceId) {
    showToast('Trace ID 不存在。', 'warning');
    return;
  }
  window.copyText?.(traceId);
}

function buildUsageEventPayload(id) {
  const event = state.events.find(item => (item.id || item.trace_id) === id);
  if (!event) return null;
  const asset = state.assets.find(item => item.id === event.asset_id || item.name === event.asset_name) || null;
  const project = asset ? state.projects.find(item => item.id === asset.project_id) || null : null;
  const customer = project ? state.customers.find(item => item.id === project.customer_id) || null : null;
  const release = asset ? state.releases
    .filter(item => item.asset_id === asset.id)
    .sort((a, b) => String(b.released_at || b.tested_at || '').localeCompare(String(a.released_at || a.tested_at || '')))[0] || null : null;
  return { event, asset, project, customer, release };
}

function exportUsageEvent(id = state.selectedUsageEventId) {
  const payload = buildUsageEventPayload(id);
  if (!payload) {
    showToast('调用事件不存在。', 'error');
    return;
  }
  const { event, asset, project, customer, release } = payload;
  const lines = [
    `# ${event.asset_name || asset?.name || '调用事件'}`,
    '',
    `- 客户：${customer?.name || '-'}`,
    `- 项目：${project?.name || '-'}`,
    `- MCP：${event.asset_name || asset?.name || '-'}`,
    `- 调用方：${event.caller || '-'}`,
    `- 状态：${event.status || '-'}`,
    `- 耗时：${event.latency_ms || 0}ms`,
    `- 业务结果：${event.business_result || 'query'}`,
    `- Trace ID：${event.trace_id || '-'}`,
    `- 时间：${event.created_at || '-'}`,
    '',
    '## 最近发布',
    release ? `- ${release.version || '-'} · ${release.released_at || release.tested_at || '-'}` : '- 暂无关联发布',
    '',
    '## 说明',
    '该调用事件由使用统计工作台导出，适合用于排障、业务复盘和对外同步。'
  ];
  const fileBase = `${customer?.name || 'usage'}-${event.asset_name || asset?.name || 'event'}-${event.trace_id || event.id || 'trace'}`
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-');
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileBase}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('调用事件已开始导出。', 'success');
}

function persistBillingOverrides() {
  localStorage.setItem('mcp_billing_overrides', JSON.stringify(state.billingOverrides || {}));
}

function openBillingDrawer(id) {
  if (!id) return;
  state.selectedBillingId = id;
  state.billingDrawerOpen = true;
  renderAll();
}

function closeBillingDrawer() {
  state.billingDrawerOpen = false;
  state.selectedBillingId = '';
  renderAll();
}

// === API Key 管理（设置页） ===
function setAccessOverride(id, patch) {
  if (!id) return;
  state.accessOverrides = {
    ...(state.accessOverrides || {}),
    [id]: {
      ...(state.accessOverrides?.[id] || {}),
      ...patch
    }
  };
}

function adminAccess() {
  return list(state.access).map(item => ({ ...item, ...(state.accessOverrides?.[item.id] || {}) }));
}

async function createApiKey() {
  if (state.user?.role !== 'admin') { showToast(permissionDeniedMessage, 'error'); return; }
  if (!state.customers.length) { showToast('暂无可关联的客户。', 'warning'); return; }

  openModal('创建 API Key', [
    {
      key: 'name', label: '凭证名称', placeholder: '例如：北北接口机器人接入凭证'
    },
    {
      key: 'customer_id', label: '所属客户',
      type: 'select',
      options: state.customers.map(c => ({ value: c.id, label: c.name }))
    },
    {
      key: 'auth_type', label: '认证类型',
      type: 'select',
      options: [
        { value: 'api_key', label: 'API Key', selected: true },
        { value: 'webhook', label: 'Webhook 签名' },
        { value: 'jwt', label: 'JWT Bearer Token' },
        { value: 'oauth2', label: 'OAuth 2.0' }
      ]
    },
    {
      key: 'environment', label: '环境',
      type: 'select',
      options: [
        { value: 'sandbox', label: '沙箱环境', selected: true },
        { value: 'production', label: '生产环境' }
      ]
    },
    {
      key: 'scope', label: '权限范围', placeholder: '例如：mcp_sales_top, mcp_member_benefits'
    },
    {
      key: 'expires_in', label: '有效期限（天）',
      type: 'select',
      options: [
        { value: '90', label: '90 天' },
        { value: '180', label: '180 天' },
        { value: '365', label: '1 年', selected: true },
        { value: '0', label: '永不过期' }
      ]
    }
  ], {
    customer_id: state.customers[0]?.id || '',
    auth_type: 'api_key',
    environment: 'sandbox',
    expires_in: '365'
  }, async data => {
    const name = (data.name || '').trim();
    if (!name) { showToast('请输入凭证名称。', 'warning'); return; }

    // 本地生成一个新凭证记录（演示性质）
    const newId = 'acc_' + Date.now().toString(36);
    const apiKey = 'mcp_sk_' + Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const keyPreview = apiKey.slice(0, 12) + '***' + apiKey.slice(-4);
    const expires = data.expires_in === '0' ? null : new Date(Date.now() + Number(data.expires_in) * 86400000).toISOString();

    state.access = [...(state.access || []), {
      id: newId, customer_id: data.customer_id, name, auth_type: data.auth_type,
      api_key: apiKey, api_key_preview: keyPreview, environment: data.environment,
      scope: data.scope || '全部资产', status: 'enabled',
      expires_at: expires, created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    }];

    renderAll();
    showToast(`API Key 已创建：${keyPreview}（请妥善保存）。`, 'success');
  });
}

function setBillingOverride(id, patch) {
  if (!id) return;
  state.billingOverrides = {
    ...(state.billingOverrides || {}),
    [id]: {
      ...(state.billingOverrides?.[id] || {}),
      ...patch
    }
  };
  persistBillingOverrides();
  renderAll();
}

function saveBillingNote(id = state.selectedBillingId, note = '') {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  setBillingOverride(id, { note, notedAt: new Date().toISOString() });
  showToast('对账备注已保存。', 'success');
}

function confirmBilling(id = state.selectedBillingId) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  setBillingOverride(id, { status: 'confirmed', confirmedAt: new Date().toISOString() });
  showToast('账单已确认。', 'success');
}

function markBillingInvoiced(id = state.selectedBillingId) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  setBillingOverride(id, { invoiceStatus: 'issued', invoiceAt: new Date().toISOString() });
  showToast('已标记为开票完成。', 'success');
}

function markBillingPaid(id = state.selectedBillingId) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  setBillingOverride(id, { paymentStatus: 'paid', paymentAt: new Date().toISOString() });
  showToast('已标记为回款完成。', 'success');
}

function reconcileBilling(id = state.selectedBillingId) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  setBillingOverride(id, { reconciled: true, reconciledAt: new Date().toISOString() });
  showToast('账单已完成对账。', 'success');
}

function openBillingAdjustmentModal(id = state.selectedBillingId) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  const record = state.billing.find(item => item.id === id);
  if (!record) {
    showToast('账单不存在。', 'error');
    return;
  }
  const override = state.billingOverrides?.[id] || {};
  openModal('账单调整', [
    { key: 'adjustment', label: '调整金额', type: 'number', placeholder: '正数增加，负数减少' },
    { key: 'note', label: '调整说明', type: 'textarea', rows: 3, placeholder: '记录本次调整原因' }
  ], {
    adjustment: override.adjustment ?? 0,
    note: override.note || ''
  }, data => {
    setBillingOverride(id, {
      adjustment: Number(data.adjustment || 0),
      note: data.note || '',
      adjustedAt: new Date().toISOString()
    });
    showToast(`账单“${record.item}”已更新调整项。`, 'success');
  });
}

function buildBillingStatementPayload(id) {
  const record = state.billing.find(item => item.id === id);
  if (!record) return null;
  const customer = state.customers.find(item => item.id === record.customer_id) || null;
  const projects = state.projects.filter(item => item.customer_id === record.customer_id);
  const override = state.billingOverrides?.[id] || {};
  const calls = Number(record.calls || record.usage_count || 0);
  const amount = Math.round((Number(record.amount || 0) + Number(override.adjustment || 0)) * 100) / 100;
  const status = override.status || record.status || 'pending';
  const invoiceStatus = override.invoiceStatus || (status === 'confirmed' ? 'pending' : 'none');
  const paymentStatus = override.paymentStatus || 'unpaid';
  const dueDate = /^\d{4}-\d{2}$/.test(String(record.period || '')) ? `${record.period}-28` : /^\d{4}$/.test(String(record.period || '')) ? `${record.period}-12-31` : '-';
  return { record, customer, projects, override, calls, amount, status, invoiceStatus, paymentStatus, dueDate };
}

function exportBillingStatement(id = state.selectedBillingId) {
  const payload = buildBillingStatementPayload(id);
  if (!payload) {
    showToast('账单不存在。', 'error');
    return;
  }
  const lines = [
    `# ${payload.customer?.name || '未知客户'} - ${payload.record.item}`,
    '',
    `- 账期：${payload.record.period || '-'}`,
    `- 关联项目：${payload.projects.map(item => item.name).join(' / ') || '未绑定项目'}`,
    `- 应收金额：¥${payload.amount.toLocaleString('zh-CN')}`,
    `- 调用量：${payload.calls.toLocaleString('zh-CN')}`,
    `- 计费状态：${payload.status}`,
    `- 开票状态：${payload.invoiceStatus}`,
    `- 回款状态：${payload.paymentStatus}`,
    `- 到期时间：${payload.dueDate}`,
    '',
    '## 调整说明',
    payload.override.note || '暂无备注',
    '',
    '## 导出说明',
    '该账单由前端账务工作台导出，适用于对账沟通、催收跟进和账务留痕。'
  ];
  const fileBase = `${payload.customer?.name || 'billing'}-${payload.record.item}-${payload.record.period || 'statement'}`
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-');
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileBase}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('账单已开始导出。', 'success');
}

function openDeliverableDrawer(id) {
  if (!id) return;
  state.selectedDeliverableId = id;
  state.deliverableDrawerOpen = true;
  renderAll();
}

function closeDeliverableDrawer() {
  state.deliverableDrawerOpen = false;
  state.selectedDeliverableId = '';
  renderAll();
}

function mergeKnowledgeDetail(detail) {
  if (!detail?.id) return;
  state.knowledgeDetails = { ...state.knowledgeDetails, [detail.id]: detail };
  const next = Array.isArray(state.knowledgeBases) ? [...state.knowledgeBases] : [];
  const index = next.findIndex(item => item.id === detail.id);
  if (index >= 0) next[index] = { ...next[index], ...detail };
  else next.push(detail);
  state.knowledgeBases = next;
}

async function fetchKnowledgeDetail(id, options = {}) {
  if (!id) return null;
  const showLoading = !options.silent;
  if (showLoading) {
    state.knowledgeDetailLoading = true;
    renderAll();
  }
  try {
    const detail = await api(`/api/platform/knowledge-bases/${id}`);
    mergeKnowledgeDetail(detail);
    return detail;
  } finally {
    if (showLoading) {
      state.knowledgeDetailLoading = false;
      renderAll();
    }
  }
}

async function openKnowledgeDrawer(id) {
  if (!id) return;
  state.selectedKnowledgeId = id;
  state.knowledgeDrawerOpen = true;
  renderAll();
  try {
    await fetchKnowledgeDetail(id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function closeKnowledgeDrawer() {
  state.knowledgeDrawerOpen = false;
  state.selectedKnowledgeId = '';
  state.knowledgeDetailLoading = false;
  renderAll();
}
function resetKnowledgeDrawerState() {
  state.knowledgeDrawerOpen = false;
  state.selectedKnowledgeId = '';
  state.knowledgeDetailLoading = false;
}

function jumpFromKnowledgeToOpenapi(id = '') {
  state.selectedOpenapiSpecId = id || "";
  resetKnowledgeDrawerState();
  state.currentPage = 'recognition';
  renderAll();
}

function jumpFromKnowledgeToAsset(id = '') {
  resetKnowledgeDrawerState();
  state.currentPage = 'assets';
  renderAll();
}

function jumpFromKnowledgeToRelease(id = '') {
  state.selectedOpenapiSpecId = "";
  resetKnowledgeDrawerState();
  state.currentPage = 'publish';
  renderAll();
  if (id) openPublishDrawer(id);
}

function jumpFromKnowledgeToDeliverable(id = '') {
  state.selectedOpenapiSpecId = "";
  resetKnowledgeDrawerState();
  state.currentPage = 'delivery';
  renderAll();
  if (id) openDeliverableDrawer(id);
}

function openKnowledgeUploadModal(id = state.selectedKnowledgeId) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  const detail = state.knowledgeDetails[id] || state.knowledgeBases.find(item => item.id === id);
  if (!detail) {
    showToast('请先选择知识库。', 'warning');
    return;
  }
  const collectionOptions = [
    { value: '', label: '自动选择 / 新建默认集合', selected: true },
    ...(Array.isArray(detail.collectionItems) ? detail.collectionItems : []).map(item => ({ value: item.id, label: item.name }))
  ];
  openModal('上传文档', [
    { key: 'collection_id', label: '目标集合', type: 'select', options: collectionOptions },
    { key: 'title', label: '文档标题', placeholder: '例如：售后退款 FAQ' },
    { key: 'url', label: '文档地址', placeholder: 'https://...' }
  ], { collection_id: '', title: '', url: '' }, async data => {
    const title = (data.title || '').trim();
    if (!title) {
      showToast('请输入文档标题。', 'warning');
      return;
    }
    try {
      const nextDetail = await api(`/api/platform/knowledge-bases/${id}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          url: (data.url || '').trim(),
          collection_id: data.collection_id || ''
        })
      });
      mergeKnowledgeDetail(nextDetail);
      renderAll();
      showToast('文档已上传，等待重建索引。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function rebuildKnowledgeIndex(id = state.selectedKnowledgeId) {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  if (!id) {
    showToast('请先选择知识库。', 'warning');
    return;
  }
  try {
    state.knowledgeDetailLoading = true;
    renderAll();
    const detail = await api(`/api/platform/knowledge-bases/${id}/reindex`, { method: 'POST' });
    mergeKnowledgeDetail(detail);
    showToast('索引已重建。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.knowledgeDetailLoading = false;
    renderAll();
  }
}

async function runKnowledgeRetrievalTest(id = state.selectedKnowledgeId) {
  if (!id) {
    showToast('请先选择知识库。', 'warning');
    return;
  }
  const query = ($('knowledgeTestQuery')?.value || '').trim();
  if (!query) {
    showToast('请输入检索问题。', 'warning');
    return;
  }
  try {
    const result = await api(`/api/platform/knowledge-bases/${id}/retrieval-test`, {
      method: 'POST',
      body: JSON.stringify({ query, top_k: 3 })
    });
    state.knowledgeTestResults = { ...state.knowledgeTestResults, [id]: result };
    await fetchKnowledgeDetail(id, { silent: true });
    renderAll();
    showToast('检索试调已完成。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function getDeliverableExportPayload(id) {
  const deliverable = state.deliverables.find(item => item.id === id);
  if (!deliverable) return null;
  const project = state.projects.find(item => item.id === deliverable.project_id) || null;
  const customer = project ? state.customers.find(item => item.id === project.customer_id) || null : null;
  const assets = state.assets.filter(item => item.project_id === deliverable.project_id);
  const assetIds = new Set(assets.map(item => item.id));
  const releases = state.releases
    .filter(item => assetIds.has(item.asset_id))
    .sort((a, b) => String(b.released_at || b.tested_at || '').localeCompare(String(a.released_at || a.tested_at || '')));
  const events = state.events.filter(item => assetIds.has(item.asset_id) || assets.some(asset => asset.name === item.asset_name));
  const billing = customer ? state.billing.filter(item => item.customer_id === customer.id || item.customer_name === customer.name) : [];
  return { deliverable, project, customer, assets, releases, events, billing };
}

function deliverableFileMeta(deliverable) {
  const typeMeta = {
    config: { ext: 'txt', mime: 'text/plain;charset=utf-8' },
    'test-report': { ext: 'md', mime: 'text/markdown;charset=utf-8' },
    log: { ext: 'csv', mime: 'text/csv;charset=utf-8' },
    'effect-report': { ext: 'md', mime: 'text/markdown;charset=utf-8' },
    'knowledge-base': { ext: 'md', mime: 'text/markdown;charset=utf-8' }
  };
  const picked = typeMeta[deliverable?.type] || { ext: 'txt', mime: 'text/plain;charset=utf-8' };
  const baseName = String(deliverable?.name || 'deliverable')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return { ...picked, filename: `${baseName}.${picked.ext}` };
}

function buildDeliverableFileContent(payload) {
  const { deliverable, project, customer, assets, releases, events, billing } = payload;
  if (deliverable.type === 'log') {
    const rows = [['trace_id', 'asset_name', 'caller', 'status', 'latency_ms', 'created_at']];
    const exportEvents = (events.length ? events : state.events.slice(0, 10)).slice(0, 40);
    exportEvents.forEach(item => {
      rows.push([
        item.trace_id || '-',
        item.asset_name || '-',
        item.caller || '-',
        item.status || '-',
        String(item.latency_ms ?? '-'),
        item.created_at || '-'
      ]);
    });
    return rows.map(cols => cols.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  const lines = [
    `# ${deliverable.name}`,
    '',
    `- 所属项目：${project?.name || '-'}`,
    `- 所属客户：${customer?.name || '-'}`,
    `- 文件类型：${deliverable.type || '-'}`,
    `- 当前状态：${deliverable.status || '-'}`,
    `- 最近更新：${deliverable.updated_at || '-'}`,
    '',
    '## 交付摘要',
    `当前交付物由 MCP Forge 根据已有交付记录导出，用于沉淀本次交付的关键信息。`,
    '',
    '## 关联资产',
    ...(assets.length ? assets.map(item => `- ${item.name} · ${item.version || '-'} · ${item.status || '-'}`) : ['- 暂无关联资产']),
    '',
    '## 最近发布',
    ...(releases.length ? releases.slice(0, 5).map(item => `- ${item.asset_name || '-'} ${item.version || '-'} · ${item.released_at || item.tested_at || '-'}`) : ['- 暂无发布记录']),
    '',
    '## 计费状态',
    ...(billing.length ? billing.slice(0, 5).map(item => `- ${item.item || '-'} · ${item.period || '-'} · ${item.status || '-'} · ${item.amount || 0}`) : ['- 暂无计费记录']),
    '',
    '## 最近调用',
    ...(events.length ? events.slice(0, 8).map(item => `- ${item.asset_name || '-'} · ${item.caller || '-'} · ${item.status || '-'} · trace ${item.trace_id || '-'}`) : ['- 暂无调用记录'])
  ];
  return lines.join('\n');
}

function copyDeliverableSummary(id = state.selectedDeliverableId) {
  const payload = getDeliverableExportPayload(id);
  if (!payload) {
    showToast('交付物不存在。', 'error');
    return;
  }
  const text = buildDeliverableFileContent(payload);
  window.copyText?.(text);
}

function downloadDeliverable(id = state.selectedDeliverableId) {
  const items = Array.isArray(state.deliverables) ? state.deliverables : [];
  const item = items.find(d => d.id === id);
  if (!item) { showToast('交付物不存在。', 'error'); return; }
  if (item.status !== 'ready') { showToast('当前交付物还在整理中，请稍后再试。', 'warning'); return; }
  showToast('正在从服务端生成交付文件...', 'warning');
  const token = localStorage.getItem('mcp_token') || '';
  fetch(`/api/platform/deliverables/${id}/download`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const disposition = r.headers.get('Content-Disposition') || '';
    const filename = disposition.match(/filename=(.+)/)?.[1] || `deliverable-${id}`;
    return r.blob().then(blob => ({ blob, filename }));
  }).then(({ blob, filename }) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = decodeURIComponent(filename);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('交付物已下载。', 'success');
  }).catch(err => {
    showToast(`下载失败：${err.message}`, 'error');
  });
}
// ── 资料类型对应的格式说明 ──
const FORMAT_GUIDE = {
  'REST API': {
    icon: '📡',
    formats: ['Swagger JSON/YAML (.json/.yaml)', 'OpenAPI 3.0 规范文件', 'Postman Collection v2.1 (.json)', 'API 文档 PDF / Word'],
    tip: '上传接口文档后，AI 将自动识别端点、参数、响应结构，生成标准 OpenAPI 3.0 描述。'
  },
  'Database': {
    icon: '🗄️',
    formats: ['DDL SQL 文件 (.sql)', '数据库表结构 Excel (.xlsx/.csv)', 'ER 图或数据字典 PDF'],
    tip: '上传 DDL 或表结构文档，AI 将自动识别表、字段、关联关系。'
  },
  'Knowledge Base': {
    icon: '📚',
    formats: ['业务文档 (.pdf/.docx/.md)', 'FAQ 文件 (.txt/.csv)', '知识条目批量导入 (.json/.xlsx)'],
    tip: '上传业务知识资料，系统将自动分块入库并建立向量索引。'
  },
  'Industry Template': {
    icon: '📋',
    formats: ['行业模板配置文件 (.json)', '标准能力描述文档 (.md/.pdf)'],
    tip: '上传行业通用模板，可快速生成对应行业的 MCP 能力包。'
  }
};

async function createDataSource() {
  if (state.user?.role !== 'admin') { showToast(permissionDeniedMessage, 'error'); return; }
  if (!state.projects.length) { showToast('暂无可导入业务资料的项目。', 'warning'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'intakeModalOverlay';

  overlay.innerHTML = `
    <div class="modal-box" style="max-width:620px;max-height:88vh;overflow-y:auto">
      <h3>导入业务资料</h3>

      <!-- 格式指引 -->
      <div class="format-guide-bar" id="formatGuideBar">
        <div class="format-guide-icon">📡</div>
        <div class="format-guide-body">
          <strong>支持格式</strong>
          <span class="format-tags" id="formatTags"></span>
          <p class="format-tip" id="formatTip"></p>
        </div>
      </div>

      <form id="intakeForm" onsubmit="return false">
        <label><span>所属项目</span>
          <select id="ds_project">${state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)} · ${escapeHtml(p.customer_name || '')}</option>`).join('')}</select>
        </label>
        <label><span>资料名称</span>
          <input type="text" id="ds_name" placeholder="例如：工单查询 Swagger 文档">
        </label>
        <label><span>资料类型</span>
          <select id="ds_type" onchange="window.onDsTypeChange()">
            <option value="REST API">REST API（Swagger / OpenAPI）</option>
            <option value="Database">Database（表结构 / SQL）</option>
            <option value="Knowledge Base">Knowledge Base（业务文档 / FAQ）</option>
            <option value="Industry Template">Industry Template（行业样例）</option>
          </select>
        </label>
        <label><span>访问说明 / 认证方式</span>
          <select id="ds_auth">
            <option value="API Key">API Key</option>
            <option value="OAuth">OAuth 2.0</option>
            <option value="JWT">JWT Token</option>
            <option value="Internal Token">Internal Token</option>
            <option value="Basic Auth">Basic Auth</option>
            <option value="VPN">VPN 连接</option>
          </select>
        </label>

        <!-- 文件上传区域 -->
        <div class="upload-zone" id="uploadZone">
          <div class="upload-zone-inner">
            <div class="upload-icon">📁</div>
            <p class="upload-text"><strong>点击选择文件或拖拽到此处</strong></p>
            <p class="upload-hint" id="uploadHint">支持 .json .yaml .sql .xlsx .csv .pdf .docx .md</p>
          </div>
          <input type="file" id="ds_file" accept=".json,.yaml,.yml,.sql,.xlsx,.xls,.csv,.pdf,.docx,.doc,.md,.txt,.zip" hidden>
        </div>

        <!-- 已选文件信息 -->
        <div class="file-preview" id="filePreview" style="display:none">
          <div class="file-preview-item">
            <span class="file-icon">📄</span>
            <span class="file-name" id="fileName"></span>
            <span class="file-size" id="fileSize"></span>
            <button type="button" class="ghost-btn small" onclick="window.clearUploadFile()">✕ 移除</button>
          </div>
        </div>
      </form>

      <div class="modal-actions">
        <button type="button" class="ghost-btn" data-action="cancel">取消</button>
        <button type="button" class="primary-btn" data-action="save" id="dsSaveBtn">确认导入</button>
      </div>
    </div>`;

  // 填充格式指引
  function updateFormatGuide() {
    const type = $('ds_type').value;
    const guide = FORMAT_GUIDE[type] || FORMAT_GUIDE['REST API'];
    document.querySelector('.format-guide-icon').textContent = guide.icon;
    $('formatTags').innerHTML = guide.formats.map(f => `<span class="format-tag">${f}</span>`).join('');
    $('formatTip').textContent = guide.tip;

    // 更新上传提示
    const hints = {
      'REST API': '.json .yaml .yml .pdf .docx',
      'Database': '.sql .xlsx .xls .csv .pdf',
      'Knowledge Base': '.pdf .docx .md .txt .csv .xlsx .json',
      'Industry Template': '.json .md .pdf'
    };
    $('uploadHint').textContent = '支持 ' + (hints[type] || '*.*)');
  }

  window.onDsTypeChange = updateFormatGuide;

  // 文件上传交互
  let selectedFile = null;
  const uploadZone = overlay.querySelector('#uploadZone');
  const fileInput = overlay.querySelector('#ds_file');

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

  async function handleFile(file) {
    selectedFile = file;
    $('fileName').textContent = file.name;
    $('fileSize').textContent = formatFileSize(file.size);
    $('filePreview').style.display = 'block';
    uploadZone.style.display = 'none';

    // 如果是 SQL 文件，快速扫描 CREATE TABLE 数量给用户预览
    const isSQL = file.name.toLowerCase().endsWith('.sql');
    if (isSQL && file.size < 5 * 1024 * 1024) {
      try {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('read error'));
          reader.readAsText(file, 'UTF-8');
        });
        const tableCount = (text.match(/CREATE\s+TABLE\s+/gi) || []).length;
        if (tableCount > 0) {
          const hint = document.createElement('div');
          hint.id = 'ddlPreviewHint';
          hint.style.cssText = 'margin-top:8px;padding:6px 12px;background:#dcfce7;color:#16a34a;border-radius:6px;font-size:12px';
          hint.innerHTML = `✅ 已扫描到 <strong>${tableCount}</strong> 张表的 CREATE TABLE 语句，AI 将自动识别字段与关联。`;
          const preview = $('filePreview');
          const old = $('ddlPreviewHint');
          if (old) old.remove();
          preview.appendChild(hint);
        }
      } catch { /* 预览失败不影响主流程 */ }
    }
  }

  window.clearUploadFile = () => {
    selectedFile = null;
    fileInput.value = '';
    $('filePreview').style.display = 'none';
    uploadZone.style.display = '';
    const old = $('ddlPreviewHint');
    if (old) old.remove();
  };

  // 取消 / 保存
  overlay.addEventListener('click', event => {
    const action = event.target?.dataset?.action;
    if (action === 'cancel') { document.body.removeChild(overlay); return; }
    if (action === 'save') {
      const project_id = $('ds_project').value;
      const name = ($('ds_name').value || '').trim();
      const type = $('ds_type').value;
      const auth_mode = $('ds_auth').value;
      if (!name) { showToast('请输入资料名称。', 'warning'); return; }

      // 显示保存中状态
      const btn = $('dsSaveBtn');
      btn.disabled = true;
      btn.textContent = '导入中...';

      (async () => {
        try {
          // 先读取上传文件内容（如果是文本类）
          let ddlContent = null;
          let ddlFileName = null;
          let ddlFileSize = null;
          if (selectedFile) {
            ddlFileName = selectedFile.name;
            ddlFileSize = selectedFile.size;
            const textExts = ['.sql', '.csv', '.json', '.md', '.txt', '.yaml', '.yml'];
            const isText = textExts.some(ext => selectedFile.name.toLowerCase().endsWith(ext));
            if (isText) {
              // 限制 5MB 文本
              if (selectedFile.size > 5 * 1024 * 1024) {
                showToast('文本文件超过 5MB，请精简后再上传。', 'warning');
                btn.disabled = false;
                btn.textContent = '确认导入';
                return;
              }
              ddlContent = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('文件读取失败'));
                reader.readAsText(selectedFile, 'UTF-8');
              });
            } else {
              // 二进制文件（.xlsx .pdf .docx）：保存文件名，提示后续手工补充
              ddlContent = `[二进制文件占位] 文件名: ${selectedFile.name}，大小: ${formatFileSize(selectedFile.size)}。请管理员在识别结果中补充字段信息。`;
            }
          }

          const response = await api('/api/platform/data-sources', {
            method: 'POST',
            body: JSON.stringify({
              project_id,
              name,
              type,
              auth_mode,
              ddl_content: ddlContent,
              ddl_file_name: ddlFileName,
              ddl_file_size: ddlFileSize
            })
          });

          await loadAll();
          renderAll();
          document.body.removeChild(overlay);
          const typeLabel = $('ds_type').options[$('ds_type').selectedIndex].text.split('（')[0];

          // 根据后端解析结果显示友好提示
          let msg = `「${name}」已导入（${typeLabel}）。`;
          if (response?.parsed && type === 'Database') {
            const p = response.parsed;
            if (p.total_tables > 0) {
              msg += ` ✅ 已解析 ${p.total_tables} 张表，共 ${p.total_columns} 个字段。`;
            } else if (p.warnings?.length) {
              msg += ` ⚠️ ${p.warnings[0]}`;
            }
          } else if (selectedFile) {
            msg += ' 文件已接收，平台正在解析中...';
          } else {
            msg += ' 请继续完善资料详情。';
          }
          showToast(msg, 'success');
        } catch (error) {
          btn.disabled = false;
          btn.textContent = '确认导入';
          showToast(error.message, 'error');
        }
      })();
      return;
    }
    if (event.target === overlay) document.body.removeChild(overlay);
  });

  document.body.appendChild(overlay);
  updateFormatGuide();
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

window.onDsTypeChange = null;
async function createPolicy() {
  if (state.user?.role !== 'admin') {
    showToast(permissionDeniedMessage, 'error');
    return;
  }
  const projects = state.projects;
  if (!projects.length) {
    showToast('暂无可创建策略的项目。', 'warning');
    return;
  }
  openModal('新建资产规则', [
    { key: 'name', label: '规则名称', placeholder: '例如：客户数据只读访问规则' },
    { key: 'project_id', label: '归属项目', type: 'select', options: projects.map(p => ({ value: p.id, label: p.name })) },
    { key: 'auth_mode', label: '认证方式', type: 'select', options: [
      { value: 'API Key', label: 'API Key', selected: true },
      { value: 'OAuth', label: 'OAuth 2.0' },
      { value: 'mTLS', label: 'mTLS' },
      { value: 'None', label: '无认证' }
    ] },
    { key: 'authorization_scope', label: '授权范围', placeholder: 'read, write, admin' },
    { key: 'rate_limit', label: '限流配置', type: 'select', options: [
      { value: '100/min', label: '100 / 分钟', selected: true },
      { value: '1000/min', label: '1000 / 分钟' },
      { value: '10000/min', label: '10000 / 分钟' },
      { value: 'unlimited', label: '不限流' }
    ] },
    { key: 'masking_rules', label: '脱敏规则（JSON 数组）', type: 'textarea', rows: 2, default: '["phone","id_card"]', placeholder: '["phone","id_card","name"]' }
  ], { project_id: projects[0]?.id }, async data => {
    try {
      data.masking_rules = data.masking_rules || '["phone"]';
      data.status = 'enabled';
      data.audit_enabled = 1;
      await api('/api/platform/gateway-policies', { method: 'POST', body: JSON.stringify(data) });
      await loadAll();
      renderAll();
      showToast('资产规则已创建。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function editPolicy(id) {
  const policy = state.policies.find(item => item.id === id);
  if (!policy) {
    showToast('策略不存在。', 'error');
    return;
  }
  const projects = state.projects;
  openModal('编辑资产规则', [
    { key: 'name', label: '规则名称' },
    { key: 'project_id', label: '归属项目', type: 'select', options: projects.map(p => ({ value: p.id, label: p.name })) },
    { key: 'auth_mode', label: '认证方式', type: 'select', options: [
      { value: 'API Key', label: 'API Key' },
      { value: 'OAuth', label: 'OAuth 2.0' },
      { value: 'mTLS', label: 'mTLS' },
      { value: 'None', label: '无认证' }
    ] },
    { key: 'authorization_scope', label: '授权范围', placeholder: 'read, write, admin' },
    { key: 'rate_limit', label: '限流配置', type: 'select', options: [
      { value: '100/min', label: '100 / 分钟' },
      { value: '1000/min', label: '1000 / 分钟' },
      { value: '10000/min', label: '10000 / 分钟' },
      { value: 'unlimited', label: '不限流' }
    ] },
    { key: 'masking_rules', label: '脱敏规则（JSON 数组）', type: 'textarea', rows: 2 }
  ], {
    name: policy.name,
    project_id: policy.project_id,
    auth_mode: policy.auth_mode,
    authorization_scope: policy.authorization_scope || '',
    rate_limit: policy.rate_limit,
    masking_rules: policy.masking_rules || '[]'
  }, async data => {
    try {
      await api(`/api/platform/gateway-policies/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      await loadAll();
      renderAll();
      showToast('资产规则已更新。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function updatePolicy(id, data) {
  try {
    await api(`/api/platform/gateway-policies/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    await loadAll();
    renderAll();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function deletePolicy(id) {
  const policy = state.policies.find(item => item.id === id);
  confirmDialog(`确认删除策略“${policy ? policy.name : id}”吗？此操作不可恢复。`, async () => {
    try {
      await api(`/api/platform/gateway-policies/${id}`, { method: 'DELETE' });
      await loadAll();
      renderAll();
      showToast('资产规则已删除。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

// === 接入配置 CRUD ===

async function testAccessConfig(id) {
  try {
    $('accessTestResult').textContent = '测试中...';
    const data = await api(`/api/platform/access-configs/${id}/test`, { method: 'POST' });
    $('accessTestResult').textContent = JSON.stringify(data, null, 2);
    await loadAll();
    renderAll();
    showToast('测试完成', 'success');
  } catch (error) {
    $('accessTestResult').textContent = error.message;
    showToast(error.message, 'error');
  }
}

async function editAccessConfig(id) {
  const config = state.access.find(a => a.id === id);
  if (!config) { showToast('配置不存在', 'error'); return; }
  openModal('编辑接入项', [
    { key: 'name', label: '配置名称' },
    { key: 'endpoint', label: '端点 URL' },
    { key: 'api_key', label: 'API Key' },
    { key: 'scope', label: '授权范围' },
    { key: 'environment', label: '环境', type: 'select', options: [{ value: 'production', label: '生产' }, { value: 'sandbox', label: '沙箱' }] },
    { key: 'webhook_url', label: 'Webhook URL' },
    { key: 'description', label: '说明', type: 'textarea', rows: 2 },
  ], {
    name: config.name,
    endpoint: config.endpoint || '',
    api_key: config.api_key || '',
    scope: config.scope || '',
    environment: config.environment || 'production',
    webhook_url: config.webhook_url || '',
    description: config.description || ''
  }, async data => {
    try {
      await api(`/api/platform/access-configs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      await loadAll();
      renderAll();
      showToast('配置已更新', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function deleteAccessConfig(id) {
  const config = state.access.find(a => a.id === id);
  confirmDialog(`确认删除接入项「${config ? config.name : id}」？`, async () => {
    try {
      await api(`/api/platform/access-configs/${id}`, { method: 'DELETE' });
      await loadAll();
      renderAll();
      showToast('配置已删除', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

// 接入测试面板
async function runAccessTest() {
  const sel = $('accessTestConfig');
  if (!sel || !sel.value) { showToast('请选择接入项', 'warning'); return; }
  await testAccessConfig(sel.value);
}

async function viewAccessGuide(assetId) {
  if (!assetId) {
    showToast('请先选择资产。', 'warning');
    return;
  }
  try {
    state.accessGuide = await api(`/api/customer/assets/${assetId}/access-guide`);
    renderAll();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

window.createDataSource = createDataSource;
window.createPolicy = createPolicy;
window.editPolicy = editPolicy;
window.updatePolicy = updatePolicy;
window.deletePolicy = deletePolicy;
window.openProjectDrawer = openProjectDrawer;
window.closeProjectDrawer = closeProjectDrawer;
window.updateProjectDraft = updateProjectDraft;
window.updateProject = updateProject;
window.saveProjectDraft = saveProjectDraft;
window.openPublishDrawer = openPublishDrawer;
window.closePublishDrawer = closePublishDrawer;
window.markReleaseTested = markReleaseTested;
window.publishRelease = publishRelease;
window.rollbackRelease = rollbackRelease;
window.openUsageDrawer = openUsageDrawer;
window.closeUsageDrawer = closeUsageDrawer;
window.copyUsageTrace = copyUsageTrace;
window.exportUsageEvent = exportUsageEvent;
window.openBillingDrawer = openBillingDrawer;
window.closeBillingDrawer = closeBillingDrawer;
window.saveBillingNote = saveBillingNote;
window.confirmBilling = confirmBilling;
window.markBillingInvoiced = markBillingInvoiced;
window.markBillingPaid = markBillingPaid;
window.reconcileBilling = reconcileBilling;
window.openBillingAdjustmentModal = openBillingAdjustmentModal;
window.exportBillingStatement = exportBillingStatement;
window.openDeliverableDrawer = openDeliverableDrawer;
window.closeDeliverableDrawer = closeDeliverableDrawer;
window.openKnowledgeDrawer = openKnowledgeDrawer;
window.closeKnowledgeDrawer = closeKnowledgeDrawer;
window.jumpFromKnowledgeToOpenapi = jumpFromKnowledgeToOpenapi;
window.jumpFromKnowledgeToAsset = jumpFromKnowledgeToAsset;
window.jumpFromKnowledgeToRelease = jumpFromKnowledgeToRelease;
window.jumpFromKnowledgeToDeliverable = jumpFromKnowledgeToDeliverable;
window.openKnowledgeUploadModal = openKnowledgeUploadModal;
window.rebuildKnowledgeIndex = rebuildKnowledgeIndex;
window.runKnowledgeRetrievalTest = runKnowledgeRetrievalTest;
window.downloadDeliverable = downloadDeliverable;
window.copyDeliverableSummary = copyDeliverableSummary;

window.testAccessConfig = testAccessConfig;
window.editAccessConfig = editAccessConfig;
window.deleteAccessConfig = deleteAccessConfig;
window.runAccessTest = runAccessTest;
window.viewAccessGuide = viewAccessGuide;

window.createApiKey = createApiKey;
window.copyApiKey = copyApiKey;
window.revokeApiKey = revokeApiKey;

// === 资料接入 / 接口识别 / Tool 映射交互 ===

async function triggerRecognition(sourceId) {
  if (!sourceId) return;
  if (state.user?.role !== 'admin') { showToast(permissionDeniedMessage, 'error'); return; }

  // 先显示 AI 分析输入弹窗（输入样本内容）
  openAiRecognizeModal(sourceId);
}

function openAiRecognizeModal(sourceId) {
  const source = (state.sources || []).find(s => s.id === sourceId);
  if (!source) return;
  const isReRecognize = (source.recognition_status || 'draft') === 'done';
  const modalTitle = isReRecognize ? '🤖 AI 重新识别' : '🤖 AI 识别分析';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:640px;max-height:88vh;overflow-y:auto">
      <h3>${modalTitle}</h3>
      ${isReRecognize ? '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#92400e">⚠️ 该资料已有识别结果，重新识别将覆盖之前的 OpenAPI 草案和 Tool 定义</div>' : ''}
      <div style="background:var(--surface-2);border-radius:8px;padding:12px;margin-bottom:14px">
        <strong>${escapeHtml(source.name || '未命名资料')}</strong>
        <span class="badge info" style="margin-left:8px">${escapeHtml(source.type || '-')}</span>
        <span class="muted-line" style="margin-left:4px">认证: ${escapeHtml(source.auth_mode || '-')}</span>
      </div>
      <form onsubmit="return false">
        <label>
          <span>资料描述 / 样本内容（可选，提供给 AI 分析）</span>
          <textarea id="aiSampleContent" rows="6" placeholder="粘贴接口文档、DDL 语句、Excel 表头、API 示例等。内容越详细，AI 识别越准确。" style="width:100%;font-family:monospace;font-size:13px;padding:10px;border:1px solid var(--line);border-radius:6px;resize:vertical"></textarea>
        </label>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="aiUseReal" checked style="cursor:pointer">
            <span>使用真实 AI 大模型分析（取消则走静态模板识别）</span>
          </label>
        </div>
        <div id="aiStatusHint" style="margin-top:8px;font-size:12px"></div>
      </form>
      <div class="modal-actions">
        <button type="button" class="ghost-btn" data-action="cancel">取消</button>
        <button type="button" class="primary-btn" data-action="run" id="aiRunBtn">开始 AI 识别</button>
      </div>
    </div>`;

  overlay.addEventListener('click', async event => {
    const action = event.target?.dataset?.action;
    if (action === 'cancel') { document.body.removeChild(overlay); return; }
    if (event.target === overlay) { document.body.removeChild(overlay); return; }
    if (action === 'run') {
      const sampleContent = $('aiSampleContent')?.value?.trim() || '';
      const useAI = $('aiUseReal')?.checked !== false;
      const btn = $('aiRunBtn');
      const hint = $('aiStatusHint');

      btn.disabled = true;
      btn.textContent = 'AI 分析中...';
      hint.innerHTML = useAI
        ? '<span style="color:#b46b06">⏳ 正在调用大模型分析业务数据，生成 OpenAPI 和 Tool 定义...</span>'
        : '<span style="color:#64748b">正在执行静态模板识别...</span>';

      try {
        if (source.is_local_builder_source) {
          const spec = runLocalBuilderRecognition(source, sampleContent);
          updateLocalBuilderRequest(source.builder_request_id, {
            status: 'processing',
            updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
          });
          state.selectedOpenapiSpecId = spec.id;
          state.currentPage = 'recognition';
          document.body.removeChild(overlay);
          renderAll();
          showToast(`已根据客户需求生成 ${Object.keys(spec.spec?.paths || {}).length} 个接口草案。`, 'success');
          return;
        }

        const result = await api(`/api/platform/data-sources/${sourceId}/recognize`, {
          method: 'POST',
          body: JSON.stringify({ use_ai: useAI, sample_content: sampleContent, description: sampleContent })
        });

        await loadAll();
        renderAll();
        document.body.removeChild(overlay);

        if (result.ai_used) {
          // 显示 AI 分析结果面板
          showAiAnalysisResult(result);
          showToast(`AI 识别完成：识别 ${result.analysis?.endpoints?.length || 0} 个接口，生成 ${result.tools?.length || 0} 个 Tool（模型: ${result.model}）`, 'success');
        } else if (result.error) {
          showToast(`AI 失败，已回退静态识别: ${result.error}`, 'warning');
          state.currentPage = 'recognition';
          renderAll();
        } else {
          showToast('静态识别完成', 'success');
          state.currentPage = 'recognition';
          renderAll();
        }
      } catch (error) {
        btn.disabled = false;
        btn.textContent = '开始 AI 识别';
        hint.innerHTML = `<span style="color:#dc2626">❌ ${escapeHtml(error.message)}</span>`;
      }
    }
  });

  document.body.appendChild(overlay);
}

function showAiAnalysisResult(result) {
  const panel = $('aiAnalysisPanel');
  if (!panel) return;
  panel.style.display = '';

  // 模型标识
  const badge = $('aiModelBadge');
  if (badge && result.model) badge.textContent = `模型: ${result.model}`;

  // 总结
  const summaryEl = $('aiAnalysisSummary');
  const analysis = result.analysis || {};
  const endpointCount = (analysis.endpoints || []).length;
  const toolCount = (result.tools || []).length;
  const categoryNames = Object.keys(result.categories || {});
  summaryEl.innerHTML = `
    <div style="font-size:14px;line-height:1.8">
      <p style="margin:0 0 6px"><strong>分析总结：</strong>${escapeHtml(analysis.summary || 'AI 已完成业务数据分析')}</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <span><strong style="color:var(--primary)">${endpointCount}</strong> 个接口</span>
        <span><strong style="color:var(--primary)">${toolCount}</strong> 个 Tool</span>
        <span><strong style="color:var(--primary)">${categoryNames.length}</strong> 个分类</span>
        ${analysis.data_type ? `<span><span class="badge info">${escapeHtml(analysis.data_type)}</span></span>` : ''}
        ${result.usage?.total_tokens ? `<span class="muted-line">Token: ${result.usage.total_tokens}</span>` : ''}
      </div>
    </div>`;

  // 端点列表
  const endpointsEl = $('aiEndpointsList');
  const endpoints = analysis.endpoints || [];
  endpointsEl.innerHTML = endpoints.length ? endpoints.map(ep => `
    <div class="info-card" style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
        <strong>${escapeHtml(ep.name || ep.path || '接口')}</strong>
        <span class="badge ${ep.method === 'GET' ? 'success' : 'warning'}" style="font-size:11px">${escapeHtml(ep.method || 'GET')}</span>
      </div>
      <p class="muted-line" style="margin:2px 0;font-family:monospace;font-size:12px">${escapeHtml(ep.path || '/')}</p>
      <p style="margin:4px 0 0;font-size:12px">${escapeHtml(ep.description || '')}</p>
      ${ep.category ? `<span class="cap-chip" style="margin-top:4px;display:inline-block">${escapeHtml(ep.category)}</span>` : ''}
      ${ep.parameters?.length ? `<details style="margin-top:6px"><summary style="font-size:11px;color:#64748b;cursor:pointer">参数 (${ep.parameters.length})</summary><div style="margin-top:4px;font-size:12px">${ep.parameters.map(p => `<div style="padding:2px 0"><code>${escapeHtml(p.name)}</code> <span class="muted-line">${escapeHtml(p.type || 'string')}${p.required ? ' *' : ''}</span> - ${escapeHtml(p.description || '')}</div>`).join('')}</div></details>` : ''}
    </div>
  `).join('') : '<div class="empty-state">未识别到接口端点</div>';

  // 分类 Tool 列表
  const toolsEl = $('aiToolsList');
  const categories = result.categories || {};
  toolsEl.innerHTML = Object.keys(categories).length ? Object.entries(categories).map(([cat, tools]) => `
    <div class="info-card" style="padding:12px;margin-bottom:8px">
      <h4 style="margin:0 0 8px;display:flex;align-items:center;gap:6px">
        <span class="cap-chip">${escapeHtml(cat)}</span>
        <span class="muted-line" style="font-size:12px">${tools.length} 个 Tool</span>
      </h4>
      ${tools.map(t => `
        <div style="padding:6px 0;border-top:1px solid var(--line)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:13px">${escapeHtml(t.display_name || t.name)}</strong>
            <code style="font-size:11px;color:var(--primary)">${escapeHtml(t.name)}</code>
          </div>
          <p style="margin:2px 0 0;font-size:12px;color:#64748b">${escapeHtml(t.description || '')}</p>
          ${t.inputSchema?.properties && Object.keys(t.inputSchema.properties).length ? `<details style="margin-top:4px"><summary style="font-size:11px;color:#94a3b8;cursor:pointer">参数</summary><div style="margin-top:4px;font-size:12px">${Object.entries(t.inputSchema.properties).map(([k, v]) => `<div><code>${escapeHtml(k)}</code> <span class="muted-line">${escapeHtml(v.type || '')}${t.inputSchema.required?.includes(k) ? ' *' : ''}</span></div>`).join('')}</div></details>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('') : '<div class="empty-state">未生成分类 Tool</div>';

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeAiAnalysis() {
  const panel = $('aiAnalysisPanel');
  if (panel) panel.style.display = 'none';
}

async function selectOpenapiSpec(specId) {
  state.selectedOpenapiSpecId = specId;
  // 如果 spec 数据不在 state 中（列表 API 不返回完整 spec），请求详情
  const existing = (state.openapiSpecs || []).find(item => item.id === specId);
  if (existing && !existing.spec) {
    try {
      const detail = await api(`/api/platform/openapi-specs/${specId}`);
      if (detail) {
        existing.spec = detail.spec;
        existing.status = detail.status;
      }
    } catch { /* ignore */ }
  }
  renderAll();
}

async function confirmOpenapiSpec(specId) {
  if (!specId) return;
  if (state.user?.role !== 'admin') { showToast(permissionDeniedMessage, 'error'); return; }
  try {
    const localSpec = (state.openapiSpecs || []).find(item => item.id === specId);
    if (localSpec?.is_local_builder_spec) {
      const source = (state.sources || []).find(item => item.id === localSpec.source_id);
      const request = list(state.builderRequests).find(item => item.id === localSpec.builder_request_id);
      if (!source || !request) {
        throw new Error('Local builder draft is missing source or request context');
      }

      const confirmedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const asset = buildLocalAssetFromRequest(source, request);

      upsertLocalOpenapiSpec({
        ...localSpec,
        status: 'confirmed',
        confirmed_at: confirmedAt
      });
      upsertLocalAsset({
        ...asset,
        updated_at: confirmedAt
      });
      upsertLocalIntakeSource({
        ...source,
        status: 'confirmed',
        recognition_status: 'done',
        updated_at: confirmedAt
      });
      updateLocalBuilderRequest(request.id, {
        status: 'converted',
        updated_at: confirmedAt,
        result: {
          ...request.result,
          status: '已转入资料接入并生成 MCP 草案'
        }
      });

      state.currentPage = 'tooling';
      renderAll();
      showToast(`OpenAPI 草案已确认，已生成 ${list(asset.tools).length} 个 MCP Tool。`, 'success');
      return;
    }

    const result = await api(`/api/platform/openapi-specs/${specId}/confirm`, { method: 'PUT' });
    await loadAll();
    // 自动跳转到 Tool 映射页
    state.currentPage = 'tooling';
    renderAll();
    // 查找关联的资产
    const spec = (state.openapiSpecs || []).find(s => s.id === specId);
    const sourceId = spec?.source_id;
    const asset = (state.assets || []).find(a => a.id === `mcp_ai_${sourceId}`);
    const toolCount = asset ? list(asset.tools).length : 0;
    showToast(`OpenAPI 已确认，自动生成 ${toolCount} 个 MCP Tool，已进入 Tool 映射。`, 'success');
  } catch (error) { showToast(error.message, 'error'); }
}

function viewSourceOpenapi(sourceId) {
  const spec = (state.openapiSpecs || []).find(item => item.source_id === sourceId);
  state.selectedOpenapiSpecId = spec?.id || '';
  state.currentPage = 'recognition';
  renderAll();
  // 如果 spec 还没加载详情，触发加载
  if (spec && !spec.spec) {
    selectOpenapiSpec(spec.id);
  }
}

function jumpToTooling() {
  state.currentPage = 'tooling';
  renderAll();
}

function jumpToAssets(assetId = '') {
  state.currentPage = 'assets';
  if (assetId) state.selectedAssetId = assetId;
  renderAll();
}

function jumpToPublish() {
  state.currentPage = 'publish';
  renderAll();
}

// 切换 MCP 资产可见性
async function toggleAssetVisibility(assetId, visibility) {
  if (!assetId) return;
  if (state.user?.role !== 'admin') { showToast(permissionDeniedMessage, 'error'); return; }
  const label = visibility === 'public' ? '公开' : '内部';
  confirmDialog(`确认将此 MCP 资产切换为「${label}」吗？${visibility === 'public' ? '公开后外部 Agent 可直接调用。' : '内部后仅限授权范围内调用。'}`, async () => {
    try {
      await api(`/api/platform/mcp-assets/${assetId}/visibility`, {
        method: 'PUT',
        body: JSON.stringify({ visibility })
      });
      await loadAll();
      renderAll();
      showToast(`资产可见性已切换为「${label}」。`, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

// 步骤条点击跳转（被 renderers.js 中 step-item onclick 调用）
function jumpToPage(pageId) {
  const allPages = ['summary', 'intake', 'recognition', 'tooling', 'assets', 'publish', 'delivery'];
  if (!allPages.includes(pageId)) return;
  // 检查权限
  if (state.user?.role !== 'admin') return;
  state.currentPage = pageId;
  renderAll();
}

window.triggerRecognition = triggerRecognition;
window.openAiRecognizeModal = openAiRecognizeModal;
window.showAiAnalysisResult = showAiAnalysisResult;
window.closeAiAnalysis = closeAiAnalysis;
window.acceptBuilderRequestIntoIntake = acceptBuilderRequestIntoIntake;
window.toggleAssetVisibility = toggleAssetVisibility;
window.runSandboxTest = runSandboxTest;

// 沙箱综合测试（逐 Tool + 部署检查 + 安全审计）
async function runSandboxTest() {
  const select = $('sandboxAssetSelect');
  const resultEl = $('sandboxTestResult');
  if (!select || !select.value) { showToast('请先选择要测试的资产', 'warning'); return; }

  resultEl.innerHTML = '<div style="padding:14px;color:#64748b">⏳ 正在执行沙箱综合测试（逐 Tool 调用 + 部署就绪检查 + 安全审计）...</div>';

  try {
    const result = await api(`/api/platform/mcp-assets/${select.value}/sandbox-test`, { method: 'POST' });
    let html = '';

    // 总览
    const statusColor = { pass: '#16a34a', warn: '#ca8a04', fail: '#dc2626' };
    const statusIcon = { pass: '✅', warn: '⚠️', fail: '❌' };
    const statusLabel = { pass: '全部通过', warn: '有警告', fail: '存在失败' };
    const overall = result.overall_status;
    html += `<div style="background:${overall === 'pass' ? '#f0fdf4' : overall === 'warn' ? '#fffbeb' : '#fef2f2'};border:1px solid ${overall === 'pass' ? '#bbf7d0' : overall === 'warn' ? '#fde68a' : '#fecaca'};border-radius:8px;padding:14px;margin-bottom:12px">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">`;
    html += `<strong style="font-size:16px;color:${statusColor[overall]}">${statusIcon[overall]} 测试结果：${statusLabel[overall]}</strong>`;
    html += `<span style="font-size:12px;color:#64748b">耗时 ${result.total_duration_ms}ms · ${new Date(result.tested_at).toLocaleString('zh-CN')}</span>`;
    html += `</div>`;
    html += `<div style="display:flex;gap:20px;font-size:13px">`;
    html += `<span>Tool 测试：<strong style="color:${statusColor.pass}">${result.summary.passed}</strong>/${result.summary.total} 通过</span>`;
    if (result.summary.failed) html += `<span style="color:${statusColor.fail}">失败 ${result.summary.failed}</span>`;
    if (result.summary.warnings) html += `<span style="color:${statusColor.warn}">警告 ${result.summary.warnings}</span>`;
    html += `</div></div>`;

    // Tool 测试详情
    html += `<details open style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:600;margin-bottom:6px">🔧 Tool 测试详情（${result.tool_tests.length}）</summary>`;
    html += result.tool_tests.map(t => {
      const tc = statusColor[t.status] || '#64748b';
      return `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="color:${tc};font-weight:600">${statusIcon[t.status] || '○'}</span><strong>${escapeHtml(t.display_name)}</strong><code style="font-size:11px;color:var(--primary)">${escapeHtml(t.tool_name)}</code></div>${t.checks.map(c => `<div style="font-size:12px;padding:2px 0 2px 20px;color:${statusColor[c.status] || '#64748b'}">${statusIcon[c.status] || '○'} <strong>${escapeHtml(c.check)}</strong>: ${escapeHtml(c.detail)}</div>`).join('')}</div>`;
    }).join('');
    html += `</details>`;

    // 部署检查
    if (result.deployment_check) {
      const dc = result.deployment_check;
      html += `<details open style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:600;margin-bottom:6px">${statusIcon[dc.status]} 📦 部署就绪检查（${statusLabel[dc.status]}）</summary>`;
      html += dc.checks.map(c => `<div style="font-size:12px;padding:3px 0;color:${statusColor[c.status] || '#64748b'}">${statusIcon[c.status] || '○'} <strong>${escapeHtml(c.check)}</strong>: ${escapeHtml(c.detail)}</div>`).join('');
      html += `</details>`;
    }

    // 安全审计
    if (result.security_audit) {
      const sa = result.security_audit;
      html += `<details open style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:600;margin-bottom:6px">${statusIcon[sa.status]} 🛡️ 安全审计（${statusLabel[sa.status]}）</summary>`;
      html += sa.checks.map(c => `<div style="font-size:12px;padding:3px 0;color:${statusColor[c.status] || '#64748b'}">${statusIcon[c.status] || '○'} <strong>${escapeHtml(c.check)}</strong>: ${escapeHtml(c.detail)}</div>`).join('');
      html += `</details>`;
    }

    resultEl.innerHTML = html;
    await loadAll();
    renderAll();

    if (overall === 'pass') showToast('沙箱测试全部通过！资产已标记为测试通过，可进入发布流程。', 'success');
    else if (overall === 'warn') showToast('沙箱测试完成，存在警告项请关注。', 'warning');
    else showToast('沙箱测试存在失败项，请修复后重试。', 'error');
  } catch (error) {
    resultEl.innerHTML = `<div style="color:#dc2626;padding:14px">❌ 测试失败: ${escapeHtml(error.message)}</div>`;
    showToast(error.message, 'error');
  }
}
window.selectOpenapiSpec = selectOpenapiSpec;
window.confirmOpenapiSpec = confirmOpenapiSpec;
window.viewSourceOpenapi = viewSourceOpenapi;
window.jumpToTooling = jumpToTooling;
window.jumpToAssets = jumpToAssets;
window.jumpToPublish = jumpToPublish;
window.jumpToPage = jumpToPage;

async function bootApp() {
  if (!state.user) state.user = await api('/auth/me');
  state.currentPage = getDefaultPageForRole(state.user?.role, state.currentPage);
  await loadAll();
  renderAll();
  showApp();
}

function bindEvents() {
  $('loginBtn').addEventListener('click', login);
  $('logoutBtn').addEventListener('click', logout);
  $('simulateBtn').addEventListener('click', simulate);
  $('sandboxTestBtn')?.addEventListener('click', runSandboxTest);
  $('createDataSourceBtn')?.addEventListener('click', createDataSource);
  $('createPolicyBtn').addEventListener('click', createPolicy);
  $('accessTestBtn')?.addEventListener('click', runAccessTest);
  $('projectDrawerClose')?.addEventListener('click', closeProjectDrawer);
  $('projectDrawerBackdrop')?.addEventListener('click', closeProjectDrawer);
  $('publishDrawerClose')?.addEventListener('click', closePublishDrawer);
  $('publishDrawerBackdrop')?.addEventListener('click', closePublishDrawer);
  $('usageDrawerClose')?.addEventListener('click', closeUsageDrawer);
  $('usageDrawerBackdrop')?.addEventListener('click', closeUsageDrawer);
  $('billingDrawerClose')?.addEventListener('click', closeBillingDrawer);
  $('billingDrawerBackdrop')?.addEventListener('click', closeBillingDrawer);
  $('deliverableDrawerClose')?.addEventListener('click', closeDeliverableDrawer);
  $('deliverableDrawerBackdrop')?.addEventListener('click', closeDeliverableDrawer);
  $('knowledgeDrawerClose')?.addEventListener('click', closeKnowledgeDrawer);
  $('knowledgeDrawerBackdrop')?.addEventListener('click', closeKnowledgeDrawer);

  document.querySelectorAll('.quick-accounts button').forEach(btn => {
    btn.addEventListener('click', () => {
      $('loginUser').value = btn.dataset.user;
      $('loginPass').value = btn.dataset.pass;
      login();
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !$('login').classList.contains('hidden')) login();
  });

  $('customerBuilderInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      window.generateCustomerMcp();
    }
  });

  document.querySelectorAll('[data-refresh]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await loadAll();
        renderAll();
        showToast('数据已刷新。', 'success');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

bindEvents();
if (state.token) {
  bootApp().catch(error => {
    showToast(error.message, 'error');
    showLogin();
  });
} else {
  showLogin();
}




























