import { state, navItems, customerNavItems, isCustomerView, getNavItems, displayAssetName } from './modules/state.js';
import { request } from './modules/api.js';
import { $, confirmDialog, escapeHtml, openModal, permissionDeniedMessage, showApp, showLogin, showToast } from './modules/ui.js';
import { renderAll, renderNav } from './modules/renderers.js';

function list(value) { return Array.isArray(value) ? value : []; }

const loginAccounts = [
  { username: 'admin', password: 'admin123', hint: '平台管理员进入工厂侧总控台。' },
  { username: 'meijia', password: 'store123', hint: '美佳零售进入客户交付台。' },
  { username: 'hzm', password: '123456', hint: '华智制造进入客户交付台。' },
  { username: 'xrf', password: '123456', hint: '鑫融金服进入客户交付台。' },
  { username: 'ahwy', password: '123456', hint: '安和物业进入客户交付台。' },
  { username: 'zxjy', password: '123456', hint: '知行教育进入客户交付台。' },
  { username: 'lvcheng', password: 'lv2026', hint: '绿城中国进入绿城专属客户端，查看已发布绿城 MCP。' }
];

const CUSTOMER_LIVE_REFRESH_MS = 5000;
let customerLiveRefreshTimer = null;
let customerLiveRefreshInFlight = false;
let loginInFlight = false;

async function refreshCustomerLiveData() {
  const livePages = new Set(['customer-overview', 'my-assets', 'my-usage']);
  if (!isCustomerView() || document.hidden || !livePages.has(state.currentPage) || customerLiveRefreshInFlight) return;
  customerLiveRefreshInFlight = true;
  try {
    const [dashboard, overview, trends, events] = await Promise.all([
      api('/api/customer/dashboard'),
      api('/api/customer/overview'),
      api('/api/customer/usage/trends'),
      api('/api/platform/call-events')
    ]);
    state.customerDashboard = dashboard;
    state.customerOverview = overview;
    state.customerTrends = trends;
    state.assets = Array.isArray(dashboard?.assets) ? dashboard.assets : [];
    state.events = Array.isArray(events?.data) ? events.data : Array.isArray(events) ? events : [];
    state.customerLiveUpdatedAt = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    renderAll();
  } catch {
    // Keep the last successful view visible while the next interval retries.
  } finally {
    customerLiveRefreshInFlight = false;
  }
}

function startCustomerLiveRefresh() {
  stopCustomerLiveRefresh();
  if (!isCustomerView()) return;
  customerLiveRefreshTimer = window.setInterval(refreshCustomerLiveData, CUSTOMER_LIVE_REFRESH_MS);
}

function stopCustomerLiveRefresh() {
  if (customerLiveRefreshTimer) window.clearInterval(customerLiveRefreshTimer);
  customerLiveRefreshTimer = null;
  customerLiveRefreshInFlight = false;
}
function handleUnauthorized() {
  stopCustomerLiveRefresh();
  localStorage.removeItem('mcp_token');
  state.token = '';
  state.user = null;
  showToast('warning');
  showLogin();
}

async function api(path, options = {}) {
  return request(state, path, options, handleUnauthorized);
}

window.__state = state;
window.authHeader = () => state.token ? { Authorization: 'Bearer ' + state.token } : {};
window.controlFlowRequest = api;

// WebSocket 实时通知连接
let ws;
let wsReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const WS_RECONNECT_DELAY = 3000;

function initWebSocket() {
  if (ws) {
    ws.close();
  }
  
  const token = state.token;
  const wsUrl = `ws://localhost:3100/ws?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket 连接已建立');
    wsReconnectAttempts = 0;
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (error) {
      console.error('WebSocket 消息解析错误:', error);
    }
  };
  
  ws.onclose = () => {
    console.log('WebSocket 连接已关闭');
    if (wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      wsReconnectAttempts++;
      setTimeout(initWebSocket, WS_RECONNECT_DELAY);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
  };
}

function handleWebSocketMessage(data) { if (['builder_metrics_update', 'review_update'].includes(data.type)) loadAll().then(renderAll).catch(() => {}); }

// 初始化 WebSocket 连接
window.initWebSocket = initWebSocket;

window.syncBuilderRequestToServer = async function syncBuilderRequestToServer(payload = {}) {
  return api('/api/platform/builder/requests', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

function getDefaultPageForRole(role = 'customer', requestedPage = '') {
  const items = role === 'admin' ? navItems : customerNavItems;
  const allowedItems = items.filter(item => item.roles.includes(role || 'customer'));
  if (!allowedItems.length) return 'my-assets';
  if (requestedPage && allowedItems.some(item => item.id === requestedPage)) return requestedPage;
  return allowedItems[0].id;
}

async function acceptBuilderRequestIntoIntake(requestId) {
  const result = await api(`/api/platform/builder/requests/${requestId}/accept`, { method: 'POST' });
  await loadAll();
  state.currentPage = 'intake';
  renderAll();
  return result?.source || null;
}

function buildLiveGovernanceOverview(snapshot) {
  const candidates = list(snapshot.candidates);
  const reviews = list(snapshot.reviews);
  const toolDrafts = list(snapshot.toolDrafts);
  const assets = list(snapshot.assets);
  const releases = list(snapshot.releases);
  const events = list(snapshot.events);
  const acceptanceFailures = events.filter(event => event.status !== 'success').map(event => ({
    trace_id: event.trace_id || event.id,
    mcp_id: event.asset_id,
    check: event.tool_name || event.asset_name || 'MCP call',
    status_code: event.status_code || '-',
    status: event.status
  }));
  return { valueMetrics: { asset_cycle_days: 0, risk_items_intercepted: candidates.filter(candidate => candidate.risk_level === 'high').length, reused_assets: 0, repeated_work_reduction: 0, publishable_mcps: releases.filter(release => release.status === 'ready_to_publish').length }, candidates, reviews, toolDrafts, mcpDrafts: assets.filter(asset => ['draft', 'tooling', 'mcp_draft'].includes(asset.status)), acceptanceFailures, reviewExamples: reviews.slice(0, 3) };
}

function applyNavigationData(snapshot) {
  Object.assign(state, {
    summary: snapshot.summary || null, customers: Array.isArray(snapshot.customers) ? snapshot.customers : [], projects: Array.isArray(snapshot.projects) ? snapshot.projects : [], sources: Array.isArray(snapshot.sources) ? snapshot.sources : [], assets: Array.isArray(snapshot.assets) ? snapshot.assets : [], releases: Array.isArray(snapshot.releases) ? snapshot.releases : [], events: Array.isArray(snapshot.events) ? snapshot.events : [], deliverables: Array.isArray(snapshot.deliverables) ? snapshot.deliverables : [], policies: Array.isArray(snapshot.policies) ? snapshot.policies : [], access: Array.isArray(snapshot.access) ? snapshot.access : [], billing: Array.isArray(snapshot.billing) ? snapshot.billing : [], openapiSpecs: Array.isArray(snapshot.openapiSpecs) ? snapshot.openapiSpecs : [], knowledgeBases: Array.isArray(snapshot.knowledgeBases) ? snapshot.knowledgeBases : [], builderRequests: Array.isArray(snapshot.builderRequests) ? snapshot.builderRequests : [], candidates: Array.isArray(snapshot.candidates) ? snapshot.candidates : [], reviews: Array.isArray(snapshot.reviews) ? snapshot.reviews : [], toolDrafts: Array.isArray(snapshot.toolDrafts) ? snapshot.toolDrafts : [], customerDashboard: snapshot.customerDashboard || state.customerDashboard, customerOverview: snapshot.customerOverview || state.customerOverview, customerTrends: snapshot.customerTrends || state.customerTrends
  });
}

async function loadNavigationData() {
  const path = isCustomerView() ? '/api/customer/navigation-data' : '/api/platform/navigation-data';
  const snapshot = await api(path);
  applyNavigationData(snapshot);
  return snapshot;
}

async function loadAll() {
  const snapshot = await loadNavigationData();
  if (isCustomerView()) {
    const [dashboard, overview, trends] = await Promise.all([api('/api/customer/dashboard'), api('/api/customer/overview'), api('/api/customer/usage/trends')]);
    Object.assign(state, { customerDashboard: dashboard, customerOverview: overview, customerTrends: trends, assets: Array.isArray(dashboard?.assets) ? dashboard.assets : state.assets, accessGuide: null });
    return snapshot;
  }
  const [deliveryPackageRecords, accessHealth, accessAudit, accessWebhook, policyChanges, aiConfig, builderMetrics] = await Promise.all([
    api('/api/platform/delivery-packages'), api('/api/platform/access-configs/health-summary'), api('/api/platform/access-configs/audit-summary'), api('/api/platform/access-configs/webhook-summary'), api('/api/platform/policy-changes'), api('/api/platform/ai-config').catch(() => ({ configured: false })), api('/api/platform/builder/metrics').catch(() => null)
  ]);
  Object.assign(state, { deliveryPackageRecords: Array.isArray(deliveryPackageRecords) ? deliveryPackageRecords : [], accessHealth: Array.isArray(accessHealth) ? accessHealth : [], accessAudit: Array.isArray(accessAudit) ? accessAudit : [], accessWebhook: Array.isArray(accessWebhook) ? accessWebhook : [], policyChanges: Array.isArray(policyChanges) ? policyChanges : [], aiConfig: aiConfig || { configured: false }, builderMetrics: builderMetrics || null, governanceDemoOverview: buildLiveGovernanceOverview(snapshot) });
  return snapshot;
}

window.refreshData = async function refreshData() { await loadAll(); renderAll(); };

async function login() {
  if (loginInFlight) return;
  const loginButton = $('loginBtn');
  const originalLabel = loginButton?.textContent || '进入工作台';
  loginInFlight = true;
  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent = '进入中...';
  }
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
  } finally {
    loginInFlight = false;
    if (loginButton && !state.token) {
      loginButton.disabled = false;
      loginButton.textContent = originalLabel;
    }
  }
}
async function logout() {
  stopCustomerLiveRefresh();
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
    const project = detail.project || detail || {};
    state.projectDetails = { ...state.projectDetails, [id]: detail };
    state.projectDrafts = {
      ...state.projectDrafts,
      [id]: {
        name: project.name || '',
        status: project.status || 'draft',
        implementer: project.implementer || '',
        progress: project.progress ?? '',
        deadline: project.deadline || '',
        description: project.description || ''
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

async function saveDeliveryPackage(projectId, customerVisible) {
  const title = document.getElementById('deliveryPackageTitle')?.value || '';
  const deliveryNote = document.getElementById('deliveryPackageNote')?.value || '';
  try {
    await api('/api/platform/delivery-packages/' + projectId, {
      method: 'PUT',
      body: JSON.stringify({ title, delivery_note: deliveryNote, customer_visible: customerVisible })
    });
    await loadAll();
    renderAll();
    showToast(customerVisible ? 'Delivery package published.' : 'Delivery package withdrawn.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}
window.saveDeliveryPackage = saveDeliveryPackage;

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

function publishRelease(id = state.selectedReleaseId) {
  if (state.user?.role !== 'admin') { showToast(permissionDeniedMessage, 'error'); return; }
  confirmDialog('确认上线 MCP 版本吗？系统会将当前版本标记为已发布，企业端将可调用该 MCP。', async () => {
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

function openDeliveryRepairDrawer(projectId) {
  if (!projectId || state.user?.role !== 'admin') return;
  state.deliveryRepairProjectId = projectId;
  state.deliveryRepairDrawerOpen = true;
  renderAll();
}

function closeDeliveryRepairDrawer() {
  state.deliveryRepairDrawerOpen = false;
  state.deliveryRepairProjectId = '';
  renderAll();
}

async function generateDeliveryMaterial(projectId, type) {
  if (!projectId || !type) return;
  try {
    await api('/api/platform/deliverables/generate', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, type })
    });
    await loadAll();
    renderAll();
    showToast('交付资料已自动生成。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function prepareAiDeliveryMaterial(projectId, type) {
  if (!projectId || !type) return;
  try {
    const deliverable = await api('/api/platform/deliverables/generate', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, type })
    });
    await loadAll();
    openDeliverableDrawer(deliverable.id);
    showToast('请填写客户背景与交付要求，再生成 AI 草稿。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function uploadDeliveryMaterial(projectId) {
  const input = $('deliveryUploadFile');
  const type = $('deliveryUploadType')?.value || 'manual-document';
  const file = input?.files?.[0];
  if (!projectId || !file) {
    showToast('请选择要上传的交付文件。', 'warning');
    return;
  }
  const form = new FormData();
  form.append('project_id', projectId);
  form.append('type', type);
  form.append('file', file);
  try {
    const response = await fetch('/api/platform/deliverables/upload', {
      method: 'POST',
      headers: window.authHeader(),
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'HTTP ' + response.status);
    await loadAll();
    renderAll();
    showToast('交付文件已上传。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}
async function loadDeliverableVersions(id) {
  if (!id) return;
  try {
    state.selectedDeliverableVersions = await api(`/api/platform/deliverables/${id}/versions`);
    renderAll();
  } catch (error) {
    state.selectedDeliverableVersions = [];
    showToast(error.message, 'error');
  }
}

function openDeliverableDrawer(id) {
  if (!id) return;
  state.selectedDeliverableId = id;
  state.selectedDeliverableVersions = [];
  state.deliverableDrawerOpen = true;
  renderAll();
  void loadDeliverableVersions(id);
}

function closeDeliverableDrawer() {
  state.deliverableDrawerOpen = false;
  state.selectedDeliverableId = '';
  state.selectedDeliverableVersions = [];
  renderAll();
}

async function generateAiDeliveryDraft(id) {
  const requirements = $('deliveryAiRequirements')?.value.trim() || '';
  state.deliveryAiRequirements = requirements;
  state.deliveryVersionSaving = true;
  try {
    await api(`/api/platform/deliverables/${id}/ai-drafts`, { method: 'POST', body: JSON.stringify({ requirements }) });
    await loadDeliverableVersions(id);
    await loadAll();
    renderAll();
    showToast('AI 草稿已生成，请编辑后提交审核。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.deliveryVersionSaving = false;
    renderAll();
  }
}

async function saveDeliveryVersion(versionId) {
  const raw = $(`deliveryVersionContent-${versionId}`)?.value || '';
  const changeSummary = $(`deliveryVersionSummary-${versionId}`)?.value.trim() || '管理员编辑';
  try {
    const content = JSON.parse(raw);
    await api(`/api/platform/deliverable-versions/${versionId}`, { method: 'PUT', body: JSON.stringify({ content, change_summary: changeSummary }) });
    await loadDeliverableVersions(state.selectedDeliverableId);
    showToast('已保存为新的草稿版本。', 'success');
  } catch (error) {
    showToast(error instanceof SyntaxError ? '草稿内容必须是有效 JSON。' : error.message, 'error');
  }
}

async function submitDeliveryVersion(versionId) {
  try {
    await api(`/api/platform/deliverable-versions/${versionId}/submit`, { method: 'POST' });
    await loadDeliverableVersions(state.selectedDeliverableId);
    showToast('草稿已提交审核。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function approveDeliveryVersion(versionId) {
  try {
    await api(`/api/platform/deliverable-versions/${versionId}/approve`, { method: 'POST' });
    await loadDeliverableVersions(state.selectedDeliverableId);
    await loadAll();
    renderAll();
    showToast('交付资料版本已批准。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function rejectDeliveryVersion(versionId) {
  const reason = $(`deliveryRejectionReason-${versionId}`)?.value.trim() || '';
  if (!reason) { showToast('请填写驳回原因。', 'warning'); return; }
  try {
    await api(`/api/platform/deliverable-versions/${versionId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    await loadDeliverableVersions(state.selectedDeliverableId);
    showToast('版本已驳回，可编辑后重新提交。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
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
            <option value="Database Connection">🗄️ 数据库直连（实时读取表结构）</option>
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

      <div id="dbConnectionForm" style="display:none;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin-bottom:10px">
        <strong style="display:block;margin-bottom:8px">🗄️ 数据库连接信息</strong>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label style="font-size:12px">主机地址<input id="dbHost" placeholder="10.20.8.102" style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:4px;font-size:13px;margin-top:3px"></label>
          <label style="font-size:12px">端口<input id="dbPort" placeholder="3306" value="3306" style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:4px;font-size:13px;margin-top:3px"></label>
          <label style="font-size:12px">用户名<input id="dbUser" placeholder="dev" style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:4px;font-size:13px;margin-top:3px"></label>
          <label style="font-size:12px">密码<input id="dbPassword" type="password" placeholder="密码" style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:4px;font-size:13px;margin-top:3px"></label>
          <label style="font-size:12px;grid-column:span 2">Schema 名称<input id="dbDatabase" placeholder="lvchengcdp_member；多个用逗号分隔，* 为全部可访问 Schema" style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:4px;font-size:13px;margin-top:3px"><span style="display:block;color:#64748b;margin-top:3px">导入表、视图、存储过程、函数和触发器的定义；只读取每张表最多 2 行样例，不会复制整库数据。</span></label>
        </div>
        <button type="button" class="ghost-btn small" id="dbTestBtn" style="margin-top:8px">🔌 测试连接</button>
        <span id="dbTestResult" style="margin-left:8px;font-size:12px"></span>
      </div>

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

    const isDbConn = type === 'Database Connection';
    const uploadZone = overlay.querySelector('#uploadZone');
    const dbForm = overlay.querySelector('#dbConnectionForm');
    const dbTestBtn = overlay.querySelector('#dbTestBtn');

    if (isDbConn) {
      if (uploadZone) uploadZone.style.display = 'none';
      if (dbForm) dbForm.style.display = '';
      $('uploadHint').textContent = '通过数据库连接实时读取表结构';
      $('formatTags').innerHTML = '<span class="format-tag">MySQL 直连</span><span class="format-tag">自动读取 DDL</span>';
      $('formatTip').textContent = '输入数据库连接信息，系统将读取可访问 Schema 中的表、视图、存储过程、函数和触发器定义，以及极少量样例数据，供 AI 识别。多个 Schema 用逗号分隔；填写 * 可导入全部可访问的业务 Schema。';

      // 绑定测试连接
      if (dbTestBtn) {
        dbTestBtn.onclick = async () => {
          const cfg = {
            host: $('dbHost')?.value?.trim(),
            port: $('dbPort')?.value?.trim() || '3306',
            user: $('dbUser')?.value?.trim(),
            password: $('dbPassword')?.value || '',
            database: $('dbDatabase')?.value?.trim()
          };
          if (!cfg.host || !cfg.user || !cfg.database) {
            $('dbTestResult').innerHTML = '<span style="color:#dc2626">请填写完整连接信息</span>';
            return;
          }
          $('dbTestResult').innerHTML = '<span style="color:#64748b">⏳ 测试中...</span>';
          try {
            const result = await api('/api/platform/db/test-connection', { method: 'POST', body: JSON.stringify(cfg) });
            $('dbTestResult').innerHTML = result.ok
              ? '<span style="color:#16a34a">✅ 连接成功</span>'
              : `<span style="color:#dc2626">❌ ${escapeHtml(result.message)}</span>${(result.guidance || []).map(item => `<div class="muted-line" style="margin-top:4px">• ${escapeHtml(item)}</div>`).join('')}`;
          } catch (e) {
            $('dbTestResult').innerHTML = `<span style="color:#dc2626">❌ ${escapeHtml(e.message)}</span>`;
          }
        };
      }
    } else {
      if (uploadZone) uploadZone.style.display = '';
      if (dbForm) dbForm.style.display = 'none';
      const hints = {
        'REST API': '.json .yaml .yml .pdf .docx',
        'Database': '.sql .xlsx .xls .csv .pdf',
        'Knowledge Base': '.pdf .docx .md .txt .csv .xlsx .json',
        'Industry Template': '.json .md .pdf'
      };
      $('uploadHint').textContent = '支持 ' + (hints[type] || '*.*)');
    }
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

          let response;
          if (type === 'Database Connection') {
            const database = $('dbDatabase')?.value?.trim();
            const connection = {
              project_id,
              name,
              host: $('dbHost')?.value?.trim(),
              port: $('dbPort')?.value?.trim() || '3306',
              user: $('dbUser')?.value?.trim(),
              password: $('dbPassword')?.value || '',
              database
            };
            if (!connection.host || !connection.user || !connection.database) throw new Error('请填写完整数据库连接信息和 Schema 名称');
            response = await api('/api/platform/db/import', { method: 'POST', body: JSON.stringify(connection) });
          } else {
            response = await api('/api/platform/data-sources', {
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
          }

          await loadAll();
          renderAll();
          document.body.removeChild(overlay);
          const typeLabel = $('ds_type').options[$('ds_type').selectedIndex].text.split('（')[0];

          // 根据后端解析结果显示友好提示
          let msg = `「${name}」已导入（${typeLabel}）。`;
          if (type === 'Database Connection') {
            msg += ` 已读取 ${response.table_count || 0} 张表、${response.view_count || 0} 个视图、${response.routine_count || 0} 个存储过程/函数、${response.trigger_count || 0} 个触发器，AI 可以开始识别。`;
            if (response.truncated) msg += ' 对象数量超过安全上限，已截取前 300 个对象；如需全部导入，请按 Schema 分批导入。';
          } else if (response?.parsed && type === 'Database') {
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

async function testAccessConfig(id, resultId = 'accessTestResult') {
  try {
    $(resultId).textContent = '测试中...';
    const data = await api(`/api/platform/access-configs/${id}/test`, { method: 'POST' });
    $(resultId).textContent = JSON.stringify(data, null, 2);
    await loadAll();
    renderAll();
    showToast('测试完成', 'success');
  } catch (error) {
    $(resultId).textContent = error.message;
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

async function openCustomerAsset(assetId) {
  if (!assetId) return;
  try {
    state.customerAssetDetail = await api(`/api/customer/assets/${assetId}`);
    state.customerTrialResult = null;
    renderAll();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function closeCustomerAsset() {
  state.customerAssetDetail = null;
  state.customerTrialResult = null;
  renderAll();
}

async function runCustomerTrial(assetId) {
  const vipCode = $('customerTrialVipCode')?.value || '';
  const orderId = $('customerTrialOrderId')?.value || '';
  try {
    const result = await api(`/api/customer/assets/${assetId}/trial`, {
      method: 'POST',
      body: JSON.stringify({ vip_code: vipCode, order_id: orderId })
    });
    state.customerTrialResult = { assetId, ...result };
    await loadAll();
    state.customerAssetDetail = await api(`/api/customer/assets/${assetId}`);
    renderAll();
    showToast('在线试调已完成，可在运行与效果页面查看 Trace。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function downloadReadyDeliverables() {
  const items = Array.isArray(state.deliverables) ? state.deliverables : [];
  const readyItems = items.filter(item => item.status === 'ready');
  if (!readyItems.length) { showToast('当前没有可下载的交付资料。', 'warning'); return; }
  showToast(`正在准备下载 ${readyItems.length} 份交付资料。`, 'warning');
  readyItems.forEach((item, index) => {
    window.setTimeout(() => downloadDeliverable(item.id), index * 300);
  });
}
function updateCustomerDeliverableFilters(field, value) {
  state.customerDeliverableFilters = { ...(state.customerDeliverableFilters || {}), [field]: value };
  renderAll();
}

function downloadProjectReadyDeliverables(projectId = 'all') {
  const items = Array.isArray(state.deliverables) ? state.deliverables : [];
  const readyItems = items.filter(item => item.status === 'ready' && (projectId === 'all' || item.project_id === projectId));
  if (!readyItems.length) { showToast('当前项目没有可下载的交付资料。', 'warning'); return; }
  showToast(`正在准备下载 ${readyItems.length} 份项目交付资料。`, 'warning');
  readyItems.forEach((item, index) => window.setTimeout(() => downloadDeliverable(item.id), index * 300));
}
function openCustomerPage(pageId) {
  if (!isCustomerView() || !customerNavItems.some(item => item.id === pageId)) return;
  state.currentPage = pageId;
  renderAll();
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
window.openDeliveryRepairDrawer = openDeliveryRepairDrawer;
window.closeDeliveryRepairDrawer = closeDeliveryRepairDrawer;
window.generateDeliveryMaterial = generateDeliveryMaterial;
window.prepareAiDeliveryMaterial = prepareAiDeliveryMaterial;
window.uploadDeliveryMaterial = uploadDeliveryMaterial;
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
window.generateAiDeliveryDraft = generateAiDeliveryDraft;
window.saveDeliveryVersion = saveDeliveryVersion;
window.submitDeliveryVersion = submitDeliveryVersion;
window.approveDeliveryVersion = approveDeliveryVersion;
window.rejectDeliveryVersion = rejectDeliveryVersion;

window.testAccessConfig = testAccessConfig;
window.editAccessConfig = editAccessConfig;
window.deleteAccessConfig = deleteAccessConfig;
window.runAccessTest = runAccessTest;
window.viewAccessGuide = viewAccessGuide;
window.openCustomerAsset = openCustomerAsset;
window.closeCustomerAsset = closeCustomerAsset;
window.runCustomerTrial = runCustomerTrial;
window.downloadReadyDeliverables = downloadReadyDeliverables;
window.downloadProjectReadyDeliverables = downloadProjectReadyDeliverables;
window.updateCustomerDeliverableFilters = updateCustomerDeliverableFilters;
window.openCustomerPage = openCustomerPage;

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
    <div class="modal-box" style="max-width:480px">
      <h3>${modalTitle}</h3>
      <div style="background:var(--surface-2);border-radius:8px;padding:12px;margin-bottom:14px">
        <strong>${escapeHtml(source.name || '未命名资料')}</strong>
        <span class="badge info" style="margin-left:8px">${escapeHtml(source.type || '-')}</span>
      </div>
      <div style="margin-bottom:12px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e40af">
        <strong>第一步：能力预览</strong><br>
        AI 快速扫描数据，列出其中包含的业务能力。扫描完成后会在页面下方展开能力列表，你可以在那里勾选、筛选并提封装要求。
      </div>
      <div id="aiStatusHint" style="font-size:12px"></div>
      <div class="modal-actions">
        <button type="button" class="ghost-btn" data-action="cancel">取消</button>
        <button type="button" class="primary-btn" data-action="scan" id="aiScanBtn">🔍 开始扫描能力（约 30 秒）</button>
      </div>
    </div>`;

  overlay.addEventListener('click', async event => {
    const action = event.target?.dataset?.action;
    if (action === 'cancel') { document.body.removeChild(overlay); return; }
    if (event.target === overlay) { document.body.removeChild(overlay); return; }

    if (action === 'scan') {
      const btn = $('aiScanBtn');
      const hint = $('aiStatusHint');
      btn.disabled = true;
      btn.textContent = '⏳ AI 正在扫描...';
      hint.innerHTML = '<span style="color:#b46b06">正在分析数据，请稍候（约 20-40 秒）...</span>';

      // 从数据源获取样本内容
      let sampleContent = '';
      if (source.sample_ddl) {
        sampleContent = source.sample_ddl;
      } else {
        // 尝试从 AI 分析缓存中获取
        const cacheSource = (state.sources || []).find(s => s.id === sourceId);
        if (cacheSource?.sample_ddl) sampleContent = cacheSource.sample_ddl;
      }

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

        // 第一步只做能力预览；确认勾选后才在下方“开始封装”调用 recognize 生成 OpenAPI/Tool。
        // recognize 的返回值没有 capabilities 字段，曾导致页面把已识别结果错误显示为 0。
        const result = await api(`/api/platform/data-sources/${sourceId}/preview`, {
          method: 'POST',
          body: JSON.stringify({ use_ai: true, sample_content: sampleContent || source.sample_ddl || '', description: sampleContent || '' })
        });

        await loadAll();
        renderAll();
        document.body.removeChild(overlay);
        // 在页面上展示能力预览
        window._currentPreviewSourceId = sourceId;
        showCapabilityPanel(result);
        showToast(`扫描完成！发现 ${result.capabilities?.length || 0} 个业务能力`, 'success');
      } catch (error) {
        btn.disabled = false;
        btn.textContent = '🔍 重新扫描';
        hint.innerHTML = `<span style="color:#dc2626">❌ ${escapeHtml(error.message)}</span>`;
      }
    }
  });

  document.body.appendChild(overlay);
}

// 能力预览面板（铺在页面上）
function showCapabilityPanel(result) {
  const panel = $('capabilityPanel');
  if (!panel) return;
  panel.style.display = '';

  const caps = result.capabilities || [];
  window._currentCapabilities = caps;

  // 模型标识
  const badge = $('capModelBadge');
  if (badge && result.model) badge.textContent = `模型: ${result.model}`;

  // 来源文件名
  const sourceId = window._currentPreviewSourceId || '';
  const source = (state.sources || []).find(s => s.id === sourceId);
  const sourceName = source?.name || '';
  const projectName = source?.project_name || source?.customer_name || '';

  const titleEl = $('capPanelTitle');
  if (titleEl && sourceName) titleEl.textContent = `🔍 能力预览 — ${sourceName}`;

  // 总结
  const summaryEl = $('capSummary');
  summaryEl.innerHTML = `
    <div style="font-size:14px;line-height:1.8">
      ${sourceName ? `<p style="margin:0 0 4px"><strong>📂 来源：</strong>${escapeHtml(sourceName)}${projectName ? `（${escapeHtml(projectName)}）` : ''}</p>` : ''}
      <p style="margin:0 0 6px"><strong>扫描总结：</strong>${escapeHtml(result.summary || 'AI 已完成数据扫描')}</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <span><strong style="color:var(--primary)">${caps.length}</strong> 个能力</span>
        <span><strong style="color:var(--primary)">${result.table_count || 0}</strong> 张表</span>
        <span><strong style="color:var(--primary)">${result.total_fields || 0}</strong> 个字段</span>
        <span>🌐 公开 <strong style="color:#16a34a">${caps.filter(c => c.visibility === 'public').length}</strong></span>
        <span>🔒 内部 <strong style="color:#ca8a04">${caps.filter(c => c.visibility !== 'public').length}</strong></span>
      </div>
    </div>`;

  // 分类筛选下拉
  const catFilter = $('capCategoryFilter');
  if (catFilter) {
    const categories = [...new Set(caps.map(c => c.category).filter(Boolean))];
    catFilter.innerHTML = '<option value="">全部分类</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }

  renderCapList(caps);
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCapList(caps) {
  const list = $('capList');
  if (!list) return;

  list.innerHTML = caps.map((cap, i) => {
    const visColor = cap.visibility === 'public' ? '#16a34a' : '#ca8a04';
    const visIcon = cap.visibility === 'public' ? '🌐' : '🔒';
    return `<div class="cap-item" data-idx="${i}" style="padding:10px 12px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:start;${i % 2 ? 'background:var(--surface-2)' : ''}" data-name="${escapeHtml((cap.name || '').toLowerCase())}" data-category="${escapeHtml(cap.category || '')}" data-visibility="${escapeHtml(cap.visibility || '')}">
      <input type="checkbox" class="cap-check" data-idx="${i}" checked style="margin-top:3px;cursor:pointer">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="badge info" style="font-size:10px">${escapeHtml(cap.category || '未分类')}</span>
          <strong style="font-size:13px">${escapeHtml(cap.name || '')}</strong>
          <span style="font-size:10px;color:${visColor}">${visIcon} ${cap.visibility === 'public' ? '公开' : '内部'}</span>
        </div>
        <p style="margin:3px 0 0;font-size:12px;color:#64748b">${escapeHtml(cap.description || '')}</p>
      </div>
    </div>`;
  }).join('');

  // 绑定勾选事件
  list.querySelectorAll('.cap-check').forEach(cb => {
    cb.addEventListener('change', updateCapSelectCount);
  });
  updateCapSelectCount();
}

function updateCapSelectCount() {
  const checks = document.querySelectorAll('.cap-check');
  const checked = document.querySelectorAll('.cap-check:checked');
  const el = $('capSelectCount');
  if (el && checks.length) el.textContent = `已选 ${checked.length}/${checks.length}`;
}

function filterCapabilities() {
  const keyword = ($('capFilter')?.value || '').toLowerCase().trim();
  const cat = $('capCategoryFilter')?.value || '';
  const vis = $('capVisFilter')?.value || '';
  document.querySelectorAll('.cap-item').forEach(item => {
    const name = item.dataset.name || '';
    const category = item.dataset.category || '';
    const visibility = item.dataset.visibility || '';
    const matchKeyword = !keyword || name.includes(keyword);
    const matchCat = !cat || category === cat;
    const matchVis = !vis || visibility === vis;
    item.style.display = (matchKeyword && matchCat && matchVis) ? '' : 'none';
  });
}

function toggleAllCaps(checked) {
  document.querySelectorAll('.cap-item:not([style*="display: none"]) .cap-check, .cap-item .cap-check').forEach(cb => {
    const item = cb.closest('.cap-item');
    if (item && item.style.display !== 'none') cb.checked = checked;
  });
  updateCapSelectCount();
}

async function packageSelectedCapabilities() {
  const sourceId = window._currentPreviewSourceId;
  if (!sourceId) { showToast('未找到数据源', 'error'); return; }

  const checked = document.querySelectorAll('.cap-check:checked');
  const allChecks = document.querySelectorAll('.cap-check');
  const selectedCaps = Array.from(checked).map(cb => window._currentCapabilities[Number(cb.dataset.idx)]).filter(Boolean);
  const selectedNames = selectedCaps.map(c => c.name);
  const customInstructions = $('capCustomInstructions')?.value?.trim() || '';

  // 自动构建封装要求
  let effectiveInstructions = customInstructions;
  if (selectedCaps.length < allChecks.length) {
    const deselected = Array.from(allChecks).filter(cb => !cb.checked).map(cb => window._currentCapabilities[Number(cb.dataset.idx)]?.name).filter(Boolean);
    effectiveInstructions = (customInstructions ? customInstructions + '\n\n' : '') + `请只封装以下能力：${selectedNames.join('、')}。\n不需要封装的能力：${deselected.join('、')}`;
  }

  const btn = $('capPackageBtn');
  const hint = $('capStatusHint');
  btn.disabled = true;
  btn.textContent = 'AI 封装中...';
  hint.innerHTML = '<span style="color:#b46b06">⏳ 正在调用大模型封装 Tool 定义（约 40-60 秒）...</span>';

  try {
    const result = await api(`/api/platform/data-sources/${sourceId}/recognize`, {
      method: 'POST',
      body: JSON.stringify({ use_ai: true, custom_instructions: effectiveInstructions })
    });

    await loadAll();
    renderAll();

    // 隐藏能力预览面板，显示结果面板
    $('capabilityPanel').style.display = 'none';

    if (result.ai_used) {
      showAiAnalysisResult(result);
      showToast(`AI 封装完成：${result.tools?.length || 0} 个 Tool`, 'success');
    } else if (result.error) {
      showToast(`AI 失败: ${result.error}`, 'warning');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = '开始封装选中能力';
    hint.innerHTML = `<span style="color:#dc2626">❌ ${escapeHtml(error.message)}</span>`;
  }
}

function closeCapabilityPanel() {
  const panel = $('capabilityPanel');
  if (panel) panel.style.display = 'none';
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
    const result = await api(`/api/platform/openapi-specs/${specId}/confirm`, { method: 'PUT' });
    await loadAll();
    // 自动跳转到候选业务能力页
    const spec = (state.openapiSpecs || []).find(s => s.id === specId);
    const source = (state.sources || []).find(item => item.id === spec?.source_id);
    const project = (state.projects || []).find(item => item.id === spec?.project_id);
    state.candidateSourceFilter = specId;
    state.candidateCustomerFilter = source?.customer_id || project?.customer_id || '';
    state.selectedCandidateId = null;
    state.currentPage = 'candidates';
    renderAll();
    // 查找关联的资产
    const candidateCount = Array.isArray(result?.candidates) ? result.candidates.length : (state.candidates || []).filter(item => item.source_ref === specId).length;
    showToast(`OpenAPI 已确认，已生成 ${candidateCount} 个候选业务能力；请先完成人工初筛。`, 'success');
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

function jumpToCandidateCapabilities(specId = '') {
  const spec = (state.openapiSpecs || []).find(item => item.id === specId);
  if (!spec) {
    showToast('未找到对应的 OpenAPI 草案', 'error');
    return;
  }
  if (spec.status !== 'confirmed') {
    showToast('请先确认 OpenAPI 草案，系统才会生成候选业务能力进入人工初筛。', 'warning');
    return;
  }
  const source = (state.sources || []).find(item => item.id === spec.source_id);
  const project = (state.projects || []).find(item => item.id === spec.project_id);
  state.candidateSourceFilter = spec.id;
  state.candidateCustomerFilter = source?.customer_id || project?.customer_id || '';
  state.selectedCandidateId = null;
  state.currentPage = 'candidates';
  const count = (state.candidates || []).filter(item => item.source_ref === spec.id).length;
  renderAll();
  showToast(`已进入该草案对应的 ${count} 个候选业务能力，请先完成候选接口人工初筛。`, 'success');
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

// 编辑 Tool
function editTool(assetId, toolName) {
  const asset = (state.assets || []).find(a => a.id === assetId);
  if (!asset) return;
  const tools = list(asset.tools);
  const tool = tools.find(t => typeof t === 'object' && t.name === toolName);
  if (!tool) { showToast('Tool 不存在', 'error'); return; }

  openModal(`编辑 Tool: ${tool.display_name || tool.name}`, [
    { key: 'display_name', label: '显示名称', placeholder: '中文名' },
    { key: 'name', label: '工具标识', placeholder: 'snake_case 英文名' },
    { key: 'description', label: '功能描述', type: 'textarea', rows: 2 },
    { key: 'category', label: '分类' },
    { key: 'visibility', label: '可见性', type: 'select', options: [
      { value: 'internal', label: '🔒 内部' },
      { value: 'public', label: '🌐 公开' }
    ]},
    { key: 'sensitivity_reason', label: '敏感原因（可选）', type: 'textarea', rows: 1 }
  ], {
    display_name: tool.display_name || '',
    name: tool.name,
    description: tool.description || '',
    category: tool.category || '',
    visibility: tool.visibility || 'internal',
    sensitivity_reason: tool.sensitivity_reason || ''
  }, async data => {
    try {
      await api(`/api/platform/mcp-assets/${assetId}/tools/${toolName}`, { method: 'PUT', body: JSON.stringify(data) });
      await loadAll();
      renderAll();
      showToast(`Tool 「${data.display_name || data.name}」已更新`, 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

// 删除 Tool
function deleteTool(assetId, toolName) {
  confirmDialog(`确认删除 Tool「${toolName}」吗？此操作不可恢复。`, async () => {
    try {
      await api(`/api/platform/mcp-assets/${assetId}/tools/${toolName}`, { method: 'DELETE' });
      await loadAll();
      renderAll();
      showToast(`Tool「${toolName}」已删除`, 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

// 新增 Tool
function addTool(assetId) {
  openModal('新增 Tool', [
    { key: 'name', label: '工具标识', placeholder: 'snake_case 英文名，如 get_order_list' },
    { key: 'display_name', label: '显示名称', placeholder: '中文名' },
    { key: 'description', label: '功能描述', type: 'textarea', rows: 2 },
    { key: 'category', label: '分类', placeholder: '如 订单管理' },
    { key: 'visibility', label: '可见性', type: 'select', options: [
      { value: 'internal', label: '🔒 内部', selected: true },
      { value: 'public', label: '🌐 公开' }
    ]}
  ], { visibility: 'internal' }, async data => {
    if (!data.name?.trim()) { showToast('请输入工具标识', 'warning'); return; }
    try {
      await api(`/api/platform/mcp-assets/${assetId}/tools`, { method: 'POST', body: JSON.stringify(data) });
      await loadAll();
      renderAll();
      showToast(`Tool「${data.display_name || data.name}」已添加`, 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

// 刷新数据库直连数据源
async function refreshDbSource(sourceId) {
  const source = (state.sources || []).find(s => s.id === sourceId);
  if (!source) return;
  openModal('刷新数据库连接', [
    { key: 'host', label: '主机地址' },
    { key: 'port', label: '端口', default: '3306' },
    { key: 'user', label: '用户名' },
    { key: 'password', label: '密码', type: 'password' },
    { key: 'database', label: 'Schema 名称（多个用逗号分隔，* 为全部可访问 Schema）' }
  ], { host: '', port: '3306', user: '', password: '', database: '' }, async data => {
    if (!data.host || !data.user || !data.database) { showToast('请填写完整连接信息', 'warning'); return; }
    try {
      const result = await api(`/api/platform/data-sources/${sourceId}/refresh-db`, { method: 'POST', body: JSON.stringify(data) });
      await loadAll();
      renderAll();
      showToast(`数据库已刷新：${result.table_count || 0} 张表、${result.view_count || 0} 个视图、${result.routine_count || 0} 个存储过程/函数、${result.trigger_count || 0} 个触发器`, 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

async function deleteDataSource(sourceId) {
  const source = (state.sources || []).find(item => item.id === sourceId);
  if (!source) return;
  confirmDialog(`确认删除「${source.name}」吗？未生成 MCP 的识别、候选、审核和 Tool 草稿会一并删除。已生成 MCP 草稿或已发布资产的资料会被保护，不能误删。`, async () => {
    try {
      const result = await api(`/api/platform/data-sources/${sourceId}`, { method: 'DELETE' });
      await loadAll();
      renderAll();
      showToast(`已删除资料及 ${result.deleted_candidate_count || 0} 条下游候选`, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}
window.deleteDataSource = deleteDataSource;

// AI 重组 MCP — 从 Tool 库勾选工具封装为新 MCP
async function aiRecomposeMcp() {
  const checked = Array.from(document.querySelectorAll('.tool-lib-check:checked')).map(cb => cb.value);
  if (!checked.length) { showToast('请先在左侧 Tool 库勾选要封装的 Tool', 'warning'); return; }
  const instruction = $('recomposeInstruction')?.value?.trim() || '';
  const mcpName = $('recomposeMcpName')?.value?.trim() || '';
  const statusEl = $('recomposeStatus');

  // 找到第一个选中的 tool 所属的资产
  const assets = list(state.assets);
  const filter = $('assetsCustomerFilter')?.value || '';
  const scoped = filter ? assets.filter(a => a.customer_id === filter) : assets;
  let targetAsset = scoped.find(a => list(a.tools).some(t => typeof t === 'object' && checked.includes(t.name)));
  if (!targetAsset) { showToast('未找到选中的 Tool 所属资产', 'error'); return; }

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '封装中...'; }
  if (statusEl) statusEl.innerHTML = '<span style="color:#b46b06">⏳ 正在封装...</span>';

  try {
    const result = await api(`/api/platform/mcp-assets/${targetAsset.id}/recompose`, {
      method: 'POST',
      body: JSON.stringify({ tool_names: checked, mcp_name: mcpName, mcp_description: instruction, ai_instruction: instruction })
    });
    await loadAll();
    renderAll();
    showToast(`新 MCP「${result.name}」已创建，包含 ${result.tool_count} 个 Tool`, 'success');
    $('recomposeInstruction').value = '';
    $('recomposeMcpName').value = '';
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ 选中 Tool 封装新 MCP'; }
    if (statusEl) statusEl.innerHTML = '';
  }
}

// 批量删除 MCP 资产
function batchDeleteAssets() {
  const checked = Array.from(document.querySelectorAll('.mcp-check:checked')).map(cb => cb.value);
  if (!checked.length) { showToast('请先勾选要删除的 MCP', 'warning'); return; }
  confirmDialog(`确认删除选中的 ${checked.length} 个 MCP 资产吗？此操作不可恢复。`, async () => {
    try {
      await api('/api/platform/mcp-assets/batch-delete', { method: 'POST', body: JSON.stringify({ asset_ids: checked }) });
      await loadAll();
      renderAll();
      showToast(`已删除 ${checked.length} 个 MCP 资产`, 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

// 删除单个资产
function deleteSingleAsset(assetId) {
  confirmDialog(`确认删除这个 MCP 资产吗？`, async () => {
    try {
      await api('/api/platform/mcp-assets/batch-delete', { method: 'POST', body: JSON.stringify({ asset_ids: [assetId] }) });
      await loadAll();
      renderAll();
      showToast('MCP 资产已删除', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

// 编辑 MCP 资产属性
function editAsset(assetId) {
  const asset = (state.assets || []).find(a => a.id === assetId);
  if (!asset) { showToast('资产不存在', 'error'); return; }
  openModal(`编辑 MCP: ${displayAssetName(asset.name)}`, [
    { key: 'name', label: '资产名称' },
    { key: 'capability', label: '能力描述', type: 'textarea', rows: 2 },
    { key: 'status', label: '状态', type: 'select', options: [
      { value: 'draft', label: '草稿' },
      { value: 'tooling', label: 'Tooling' },
      { value: 'testing', label: '测试中' },
      { value: 'published', label: '已发布' }
    ]},
    { key: 'visibility', label: '可见性', type: 'select', options: [
      { value: 'internal', label: '🔒 内部' },
      { value: 'public', label: '🌐 公开' }
    ]},
    { key: 'version', label: '版本号' }
  ], {
    name: asset.name, capability: asset.capability, status: asset.status,
    visibility: asset.visibility || 'internal', version: asset.version || 'v1.0.0'
  }, async data => {
    try {
      await api(`/api/platform/mcp-assets/${assetId}`, { method: 'PUT', body: JSON.stringify(data) });
      await loadAll(); renderAll();
      showToast(`MCP「${data.name}」已更新`, 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

function filterAssetsByCustomer() { renderAll(); }
function filterRecognitionByCustomer() { renderAll(); }
function filterToolingByCustomer() { renderAll(); }
function filterPublishByCustomer() { renderAll(); }
function filterDeliveryByCustomer() { renderAll(); }

// 按企业批量识别（旧接口保留兼容）
async function batchRecognize(customerId, customerName, count) {
  confirmDialog(`确认对「${customerName}」下 ${count} 份待识别资料执行批量 AI 识别吗？`, async () => {
    showToast(`正在批量识别 ${customerName} 的资料...`, 'warning');
    try {
      const result = await api('/api/platform/data-sources/batch-recognize', { method: 'POST', body: JSON.stringify({ customer_id: customerId }) });
      await loadAll(); renderAll();
      showToast(`批量识别完成：成功 ${result.success}/${result.total}`, result.failed ? 'warning' : 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

// 勾选模式批量识别
function updateBatchBar() {
  const checks = document.querySelectorAll('.src-check');
  const checked = document.querySelectorAll('.src-check:checked');
  const bar = $('batchActionBar');
  const countEl = $('batchSelectCount');
  if (bar) bar.style.display = checks.length > 0 ? '' : 'none';
  if (countEl && checks.length) countEl.textContent = `已选 ${checked.length}/${checks.length} 份待识别资料`;
}

function filterIntakeByCustomer() {
  renderAll();
}

async function batchRecognizeSelected() {
  const checked = Array.from(document.querySelectorAll('.src-check:checked')).map(cb => cb.value);
  if (!checked.length) { showToast('请先勾选要识别的资料', 'warning'); return; }
  confirmDialog(`确认对选中的 ${checked.length} 份资料执行批量 AI 识别？`, async () => {
    showToast(`正在批量识别 ${checked.length} 份资料...`, 'warning');
    try {
      const result = await api('/api/platform/data-sources/batch-recognize-selected', {
        method: 'POST', body: JSON.stringify({ source_ids: checked })
      });
      await loadAll(); renderAll();
      showToast(`批量识别完成：成功 ${result.success}/${result.total}`, result.failed ? 'warning' : 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

// 查看数据源文件内容
async function viewSourceContent(sourceId) {
  openModal('查看文件内容', [], {}, null);
  const overlay = document.querySelector('.modal-overlay:last-child .modal-box');
  if (overlay) {
    overlay.innerHTML = '<h3>📄 文件内容</h3><div style="padding:14px;color:#64748b">加载中...</div>';
  }
  try {
    const data = await api(`/api/platform/data-sources/${sourceId}/content`);
    if (overlay) {
      let html = `<h3>📄 ${escapeHtml(data.source_name || '文件内容')}</h3>`;
      html += `<div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap"><span class="badge info">${escapeHtml(data.source_type || '-')}</span><span class="muted-line">来源: ${escapeHtml(data.source || '-')}</span></div>`;
      if (data.content) {
        html += `<pre style="background:#1e293b;color:#e2e8f0;padding:14px;border-radius:8px;font-size:12px;max-height:400px;overflow:auto;white-space:pre-wrap">${escapeHtml(data.content.slice(0, 20000))}</pre>`;
        if (data.content.length > 20000) html += '<p class="muted-line" style="margin-top:6px;font-size:11px">（仅显示前 20000 字符）</p>';
      } else {
        html += '<div class="empty-state">该资料没有缓存的文件内容</div>';
      }
      html += '<div class="modal-actions"><button type="button" class="ghost-btn" onclick="this.closest(\'.modal-overlay\').remove()">关闭</button></div>';
      overlay.innerHTML = html;
    }
  } catch (error) {
    if (overlay) overlay.innerHTML = `<h3>📄 文件内容</h3><div style="color:#dc2626;padding:14px">${escapeHtml(error.message)}</div><div class="modal-actions"><button type="button" class="ghost-btn" onclick="this.closest(\'.modal-overlay\').remove()">关闭</button></div>`;
  }
}

// 接收企业上传文件（保留原有功能）
function uploadFilesForCustomer(customerId, customerName) {
  // 找到该企业下的第一个项目
  const projects = (state.projects || []).filter(p => p.customer_id === customerId);
  if (!projects.length) { showToast('该企业下没有项目，请先创建', 'warning'); return; }
  const projectId = projects[0].id;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:500px">
      <h3>📁 接收文件 — ${escapeHtml(customerName)}</h3>
      <p class="muted-line" style="margin-bottom:12px">上传接口文档、DDL、Excel 等业务资料，系统会自动创建数据源</p>
      <div class="upload-zone" id="batchUploadZone" style="cursor:pointer;text-align:center;padding:30px;border:2px dashed var(--line);border-radius:8px;margin-bottom:10px">
        <div style="font-size:32px;margin-bottom:6px">📂</div>
        <p style="margin:0;font-size:13px"><strong>点击或拖拽文件到此处</strong></p>
        <p style="margin:4px 0 0;font-size:11px;color:#94a3b8">支持 .json .yaml .sql .csv .xlsx .md .txt</p>
        <input type="file" id="batchFileInput" multiple accept=".json,.yaml,.yml,.sql,.csv,.xlsx,.xls,.md,.txt,.pdf,.docx" hidden>
      </div>
      <div id="batchFileList"></div>
      <div class="modal-actions">
        <button type="button" class="ghost-btn" data-action="cancel">取消</button>
        <button type="button" class="primary-btn" data-action="upload" id="batchUploadBtn" disabled>上传</button>
      </div>
    </div>`;

  const fileInput = overlay.querySelector('#batchFileInput');
  const zone = overlay.querySelector('#batchUploadZone');
  const fileList = overlay.querySelector('#batchFileList');
  let selectedFiles = [];

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--primary)'; });
  zone.addEventListener('dragleave', () => zone.style.borderColor = 'var(--line)');
  zone.addEventListener('drop', e => { e.preventDefault(); zone.style.borderColor = 'var(--line)'; handleFiles(e.dataTransfer.files); });
  fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFiles(fileInput.files); });

  function handleFiles(files) {
    selectedFiles = Array.from(files);
    fileList.innerHTML = selectedFiles.map(f => `<div style="padding:6px 0;font-size:12px">📄 ${escapeHtml(f.name)} <span class="muted-line">(${(f.size / 1024).toFixed(1)} KB)</span></div>`).join('');
    overlay.querySelector('#batchUploadBtn').disabled = !selectedFiles.length;
  }

  overlay.addEventListener('click', async event => {
    const action = event.target?.dataset?.action;
    if (action === 'cancel' || event.target === overlay) { document.body.removeChild(overlay); return; }
    if (action === 'upload') {
      const btn = overlay.querySelector('#batchUploadBtn');
      btn.disabled = true;
      btn.textContent = '上传中...';
      const formData = new FormData();
      formData.append('project_id', projectId);
      selectedFiles.forEach(f => formData.append('files', f));
      try {
        const token = localStorage.getItem('mcp_token') || '';
        const resp = await fetch('/api/platform/data-sources/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Upload failed');
        document.body.removeChild(overlay);
        await loadAll();
        renderAll();
        showToast(`已上传 ${result.created} 个文件，已创建数据源`, 'success');
      } catch (error) {
        btn.disabled = false;
        btn.textContent = '上传';
        showToast(error.message, 'error');
      }
    }
  });
  document.body.appendChild(overlay);
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

function navigateToPage(pageId, focus = {}) {
  if (state.user?.role !== 'admin') return;
  const allowed = navItems.some(item => item.id === pageId && item.roles.includes('admin'));
  if (!allowed) return;
  state.currentPage = pageId;
  if (pageId === 'monitoring') state.monitoringFocusId = focus.eventId || null;
  renderAll();
}

function persistMonitoringIssueStatuses() {
  try { localStorage.setItem('mcp_monitoring_issue_statuses', JSON.stringify(state.monitoringIssueStatuses || {})); } catch {}
}

function markMonitoringIssueStatus(issueKey, status) {
  if (!issueKey) return;
  state.monitoringIssueStatuses = {
    ...(state.monitoringIssueStatuses || {}),
    [issueKey]: { status, updated_at: new Date().toISOString() }
  };
  persistMonitoringIssueStatuses();
  renderAll();
  showToast(`异常已标记为${status}`, status === '已恢复' ? 'success' : 'info');
}
function setMonitoringFilter(key, value) {
  if (!state.monitoringFilters) state.monitoringFilters = { status: 'all', assetId: 'all', toolName: 'all', timeRange: '24h', query: '' };
  if (!Object.prototype.hasOwnProperty.call(state.monitoringFilters, key)) return;
  state.monitoringFilters[key] = value;
  renderAll();
}

// 步骤条点击跳转（被 renderers.js 中 step-item onclick 调用）
function jumpToPage(pageId) {
  const allPages = ['summary', 'intake', 'recognition', 'candidates', 'review', 'tooling', 'tool-draft', 'mcp-compose', 'assets', 'publish', 'delivery', 'monitoring', 'governance', 'settings'];
  if (!allPages.includes(pageId)) return;
  // 检查权限
  if (state.user?.role !== 'admin') return;
  if (pageId === 'candidates') state.candidateSourceFilter = '';
  state.currentPage = pageId;
  renderAll();
}

window.triggerRecognition = triggerRecognition;
window.showCapabilityPanel = showCapabilityPanel;
window.filterCapabilities = filterCapabilities;
window.toggleAllCaps = toggleAllCaps;
window.packageSelectedCapabilities = packageSelectedCapabilities;
window.closeCapabilityPanel = closeCapabilityPanel;
window.updateCapSelectCount = updateCapSelectCount;
window.openAiRecognizeModal = openAiRecognizeModal;
window.showAiAnalysisResult = showAiAnalysisResult;
window.closeAiAnalysis = closeAiAnalysis;
window.acceptBuilderRequestIntoIntake = acceptBuilderRequestIntoIntake;
window.aiRecomposeMcp = aiRecomposeMcp;
window.batchDeleteAssets = batchDeleteAssets;
window.deleteSingleAsset = deleteSingleAsset;
window.editAsset = editAsset;
window.filterAssetsByCustomer = filterAssetsByCustomer;
window.filterRecognitionByCustomer = filterRecognitionByCustomer;
window.filterToolingByCustomer = filterToolingByCustomer;
window.filterPublishByCustomer = filterPublishByCustomer;
window.filterDeliveryByCustomer = filterDeliveryByCustomer;
window.batchRecognize = batchRecognize;
window.batchRecognizeSelected = batchRecognizeSelected;
window.updateBatchBar = updateBatchBar;
window.filterIntakeByCustomer = filterIntakeByCustomer;
window.viewSourceContent = viewSourceContent;
window.uploadFilesForCustomer = uploadFilesForCustomer;window.toggleAssetVisibility = toggleAssetVisibility;
window.editTool = editTool;
window.deleteTool = deleteTool;
window.addTool = addTool;
window.refreshDbSource = refreshDbSource;
window.sendAgentMessage = sendAgentMessage;
window.deployToWorkBuddy = deployToWorkBuddy;
window.onSandboxAssetChange = onSandboxAssetChange;

// 智能体联调 — 通过 WorkBuddy Tool Call 协议
let _agentHistory = [];
let _workbuddyDeployed = false;
let _connectedRuntimeId = '';

// 模型凭据只保留在服务端 .env；浏览器端不传递 API Key，避免泄露给企业用户。
const WORKBUDDY_DEFAULT_MODEL = {};

// 部署 MCP 资产到 WorkBuddy
async function deployToWorkBuddy() {
  const assetSelect = $('sandboxAssetSelect');
  const statusEl = $('workbuddyDeployStatus');
  if (!assetSelect?.value) { showToast('请先选择要部署的 MCP 资产', 'warning'); return; }

  statusEl.innerHTML = '<div style="padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e40af">⏳ 正在部署到 WorkBuddy（加载 Tool 定义 + 连接 TTKC-AUTO 模型）...</div>';

  try {
    // 获取 Tool 定义
    const resp = await fetch(`/api/workbuddy/assets/${assetSelect.value}/tools`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    const tools = data.tools || [];
    if (!tools.length) throw new Error('该资产没有可用的 Tool，无法部署');

    // 显示部署成功状态 + Tool 清单
    let html = '<div style="padding:12px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:8px">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:16px">✅</span><strong style="color:#16a34a;font-size:14px">已部署到 WorkBuddy</strong><span style="font-size:11px;color:#64748b;margin-left:auto">模型：TTKC-AUTO · ' + tools.length + ' 个 Tool 已加载</span></div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
    tools.forEach(function(t) {
      html += '<span style="font-size:11px;background:#fff;border:1px solid var(--line);padding:2px 8px;border-radius:4px">🔧 ' + escapeHtml(t.function.name) + '</span>';
    });
    html += '</div></div>';
    statusEl.innerHTML = html;

    // 启用对话输入
    var inputEl = $('agentInput');
    var sendBtn = $('agentSendBtn');
    if (inputEl) { inputEl.disabled = false; inputEl.placeholder = '输入问题测试，如：查询账户列表...'; }
    if (sendBtn) sendBtn.disabled = false;

    // 清空对话历史
    _agentHistory = [];
    _workbuddyDeployed = true;
    var msgBox = $('agentMessages');
    if (msgBox) msgBox.innerHTML = '<div style="text-align:center;color:#16a34a;font-size:12px;padding:16px 0">✅ MCP 资产已部署到 WorkBuddy，现在可以输入问题进行测试</div>';

    showToast('已部署 ' + tools.length + ' 个 Tool 到 WorkBuddy，可以开始测试', 'success');
  } catch (error) {
    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#dc2626">❌ 部署失败：' + escapeHtml(describeWorkBuddyFailure(error)) + '</div>';
    _workbuddyDeployed = false;
    showToast(error.message, 'error');
  }
}

function describeWorkBuddyFailure(error) {
  const message = String(error?.message || error || '').trim();
  if (/endpoint not supported|not_found|404/i.test(message)) {
    return '\u6a21\u578b\u670d\u52a1\u5730\u5740\u6682\u4e0d\u652f\u6301\u5bf9\u8bdd\u8c03\u7528\uff0c\u8bf7\u68c0\u67e5\u63a5\u5165\u5730\u5740\u540e\u91cd\u8bd5\u3002';
  }
  if (/401|403|unauthorized|api key/i.test(message)) {
    return '\u6a21\u578b\u670d\u52a1\u9274\u6743\u5931\u8d25\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u68c0\u67e5\u63a5\u5165\u914d\u7f6e\u3002';
  }
  if (/AI service request failed|fetch failed|timeout/i.test(message)) {
    return '\u6a21\u578b\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';
  }
  return message || '\u8054\u8c03\u6682\u65f6\u65e0\u6cd5\u5b8c\u6210\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';
}
let _customerWorkBuddyHistory = [];
let _customerWorkBuddyDeployedAssetId = '';

function resetCustomerWorkBuddy() {
  _customerWorkBuddyHistory = [];
  _customerWorkBuddyDeployedAssetId = '';
  const status = $('customerWorkBuddyDeployStatus');
  const input = $('customerWorkBuddyInput');
  const sendButton = $('customerWorkBuddySendBtn');
  const messages = $('customerWorkBuddyMessages');
  if (status) status.innerHTML = '';
  if (input) { input.disabled = true; input.placeholder = '\u8bf7\u5148\u90e8\u7f72 MCP \u8d44\u4ea7\uff0c\u518d\u8f93\u5165\u95ee\u9898...'; }
  if (sendButton) sendButton.disabled = true;
  if (messages) messages.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px 0">\u9009\u62e9 MCP \u8d44\u4ea7\uff0c\u90e8\u7f72\u5230 WorkBuddy \u540e\u5373\u53ef\u5f00\u59cb\u6d4b\u8bd5\u3002</div>';
}

function onCustomerWorkBuddyAssetChange() {
  resetCustomerWorkBuddy();
}

async function customerDeployToWorkBuddy() {
  const select = $('customerWorkBuddyAssetSelect');
  const status = $('customerWorkBuddyDeployStatus');
  const input = $('customerWorkBuddyInput');
  const sendButton = $('customerWorkBuddySendBtn');
  const messages = $('customerWorkBuddyMessages');
  if (!select?.value) { showToast('\u8bf7\u5148\u9009\u62e9 MCP \u8d44\u4ea7\u3002', 'warning'); return; }
  if (status) status.innerHTML = '<div style="padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e40af">\u6b63\u5728\u52a0\u8f7d WorkBuddy Tool \u5b9a\u4e49...</div>';
  try {
    const response = await fetch(`/api/workbuddy/assets/${select.value}/tools`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
    const tools = Array.isArray(data.tools) ? data.tools : [];
    if (!tools.length) throw new Error('\u8be5 MCP \u8d44\u4ea7\u6682\u65e0\u53ef\u7528 Tool\u3002');
    if (status) status.innerHTML = `<div style="padding:12px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px"><strong style="color:#16a34a">WorkBuddy \u5df2\u51c6\u5907\u5c31\u7eea</strong><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${tools.map(tool => `<span style="font-size:11px;background:#fff;border:1px solid var(--line);padding:2px 8px;border-radius:4px">${escapeHtml(tool.function?.name || '-')}</span>`).join('')}</div></div>`;
    _customerWorkBuddyHistory = [];
    _customerWorkBuddyDeployedAssetId = select.value;
    if (input) { input.disabled = false; input.placeholder = '\u8bf7\u8f93\u5165\u95ee\u9898\uff0c\u6d4b\u8bd5\u8be5 MCP \u8d44\u4ea7...'; input.focus(); }
    if (sendButton) sendButton.disabled = false;
    if (messages) messages.innerHTML = '<div style="text-align:center;color:#16a34a;font-size:12px;padding:16px 0">MCP \u8d44\u4ea7\u5df2\u90e8\u7f72\u5230 WorkBuddy\uff0c\u73b0\u5728\u53ef\u4ee5\u5f00\u59cb\u6d4b\u8bd5\u3002</div>';
  } catch (error) {
    _customerWorkBuddyDeployedAssetId = '';
    if (status) status.innerHTML = `<div style="padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#dc2626">${escapeHtml(describeWorkBuddyFailure(error))}</div>`;
    showToast(error.message, 'error');
  }
}

async function sendCustomerWorkBuddyMessage() {
  const select = $('customerWorkBuddyAssetSelect');
  const input = $('customerWorkBuddyInput');
  const messages = $('customerWorkBuddyMessages');
  if (!input?.value?.trim()) return;
  if (!select?.value || _customerWorkBuddyDeployedAssetId !== select.value) { showToast('\u8bf7\u5148\u90e8\u7f72\u5f53\u524d\u9009\u4e2d\u7684 MCP \u8d44\u4ea7\u3002', 'warning'); return; }
  const message = input.value.trim();
  input.value = '';
  messages.innerHTML += `<div class="workbuddy-message workbuddy-message--user" style="align-self:flex-end;background:var(--primary);color:#fff;padding:8px 12px;border-radius:12px 12px 2px 12px;max-width:80%">${escapeHtml(message)}</div>`;
  messages.innerHTML += '<div id="customerWorkBuddyTyping" class="workbuddy-message workbuddy-message--typing" style="align-self:flex-start;background:#f1f5f9;padding:8px 12px;border-radius:12px 12px 12px 2px;color:#64748b;font-size:12px">WorkBuddy \u6b63\u5728\u8c03\u7528\u5de5\u5177...</div>';
  messages.scrollTop = messages.scrollHeight;
  try {
    const response = await fetch('/api/workbuddy/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ asset_id: select.value, message, history: _customerWorkBuddyHistory.slice(-10), model_config: WORKBUDDY_DEFAULT_MODEL })
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || `HTTP ${response.status}`);
    _customerWorkBuddyHistory.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply || '' });
    $('customerWorkBuddyTyping')?.remove();
    (result.tool_calls || []).forEach(call => {
      const trace = document.createElement('div');
      trace.className = 'workbuddy-execution';
      trace.style.cssText = 'align-self:center;width:100%;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:6px 12px;font-size:12px';
      trace.innerHTML = `<details><summary style="color:#7c3aed;font-weight:600">${escapeHtml(call.display_name || call.tool_name || '\u5de5\u5177\u8c03\u7528')}</summary><div style="margin-top:6px;font-family:Consolas,monospace;font-size:11px;color:#64748b">\u53c2\u6570\uff1a${escapeHtml(JSON.stringify(call.arguments || {}))}<br>\u7ed3\u679c\uff1a${escapeHtml(JSON.stringify(call.result || {}))}</div></details>`;
      messages.appendChild(trace);
    });
    const reply = document.createElement('div');
    reply.className = 'workbuddy-message workbuddy-message--assistant';
    reply.style.cssText = 'align-self:flex-start;background:#f1f5f9;padding:10px 14px;border-radius:12px 12px 12px 2px;max-width:85%;line-height:1.7';
    reply.innerHTML = renderMarkdown(result.reply || '');
    messages.appendChild(reply);
    messages.scrollTop = messages.scrollHeight;
  } catch (error) {
    $('customerWorkBuddyTyping')?.remove();
    messages.innerHTML += `<div class="workbuddy-message workbuddy-message--error" style="align-self:flex-start;background:#fef2f2;color:#dc2626;padding:8px 12px;border-radius:12px 12px 12px 2px;max-width:85%">${escapeHtml(describeWorkBuddyFailure(error))}</div>`;
    messages.scrollTop = messages.scrollHeight;
  }
}

window.customerDeployToWorkBuddy = customerDeployToWorkBuddy;
window.onCustomerWorkBuddyAssetChange = onCustomerWorkBuddyAssetChange;
window.sendCustomerWorkBuddyMessage = sendCustomerWorkBuddyMessage;
function syncLoginSelection(forcePassword = true) {
  const accountSelect = $('loginUserSelect');
  const legacyUserInput = $('loginUser');
  const passwordInput = $('loginPass');
  const hint = $('loginAccountHint');
  const selected = accountSelect?.selectedOptions?.[0];
  if (!selected) return;
  const account = loginAccounts.find(item => item.username === selected.value);
  if (legacyUserInput) legacyUserInput.value = selected.value;
  if (passwordInput && (forcePassword || !passwordInput.value)) {
    passwordInput.value = selected.dataset.password || account?.password || '';
  }
  if (hint) hint.textContent = account?.hint || '选择客户后进入对应交付台。';
}

// 切换资产时重置部署状态
function onSandboxAssetChange() {
  _agentHistory = [];
  _workbuddyDeployed = false;
  _connectedRuntimeId = '';
  var statusEl = $('workbuddyDeployStatus');
  if (statusEl) statusEl.innerHTML = '';
  var inputEl = $('agentInput');
  var sendBtn = $('agentSendBtn');
  if (inputEl) { inputEl.disabled = true; inputEl.placeholder = '先部署到 WorkBuddy，再输入问题...'; }
  if (sendBtn) sendBtn.disabled = true;
  var mb = $('agentMessages');
  if (mb) mb.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px 0">选择 MCP 资产 → 点击「部署到 WorkBuddy」→ 输入问题测试</div>';
}

// 轻量 Markdown 渲染（支持表格、粗体、列表、代码块、标题）
function renderMarkdown(text) {
  if (!text) return '';
  // 先转义 HTML 防止 XSS
  var html = escapeHtml(text);

  // 代码块 ```
  html = html.replace(/```[\s\S]*?```/g, function(m) {
    var code = m.replace(/```\w*\n?/g, '').replace(/```$/g, '');
    return '<pre style="background:#1e293b;color:#e2e8f0;padding:10px 14px;border-radius:6px;font-size:12px;overflow-x:auto;margin:6px 0">' + code + '</pre>';
  });

  // 表格
  var lines = html.split('\n');
  var output = [];
  var inTable = false;
  var tableRows = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    // 检测表格分隔行（|---|---|）
    if (/^\|[\s\-:|]+\|$/i.test(line.trim())) {
      inTable = true;
      continue;
    }

    if (/^\|.*\|/.test(line.trim())) {
      tableRows.push(line.trim());
      // 如果下一行不是表格行，输出表格
      var nextLine = lines[i + 1] || '';
      if (!/^\|.*\|/.test(nextLine.trim()) || /^\|[\s\-:|]+\|$/i.test(nextLine.trim())) {
        if (tableRows.length > 0) {
          var tableHtml = '<table style="width:100%;border-collapse:collapse;margin:6px 0;font-size:12px">';
          tableRows.forEach(function(row, ri) {
            var cells = row.split('|').filter(function(c, ci, arr) { return ci > 0 && ci < arr.length - 1; });
            var tag = ri === 0 ? 'th' : 'td';
            var bg = ri === 0 ? 'background:#e2e8f0;font-weight:600' : '';
            tableHtml += '<tr>' + cells.map(function(c) {
              return '<' + tag + ' style="border:1px solid #cbd5e1;padding:4px 8px;text-align:left;' + bg + '">' + c.trim() + '</' + tag + '>';
            }).join('') + '</tr>';
          });
          tableHtml += '</table>';
          output.push(tableHtml);
          tableRows = [];
        }
        inTable = false;
      }
      continue;
    }

    // 非表格行
    if (!inTable) {
      output.push(line);
    }
  }

  html = output.join('\n');

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:14px">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 4px;font-size:15px">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h3 style="margin:10px 0 4px;font-size:16px">$1</h3>');

  // 粗体 + 斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code style="background:#e2e8f0;padding:1px 5px;border-radius:3px;font-size:12px">$1</code>');

  // 无序列表
  html = html.replace(/^[\-\*] (.+)$/gm, '<li style="margin-left:18px;list-style:disc">$1</li>');

  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:18px;list-style:decimal">$1</li>');

  // 段落换行（连续 <li> 不加 <br>，连续空行变成段落间距）
  html = html.replace(/\n\n+/g, '</p><p style="margin:6px 0">');
  html = html.replace(/\n/g, '<br>');

  // 清理 <li> 前后的 <br>
  html = html.replace(/<br>(<li)/g, '$1');
  html = html.replace(/(<\/li>)<br>/g, '$1');

  return '<div style="font-size:13px">' + html + '</div>';
}

async function sendAgentMessage() {
  const input = $('agentInput');
  const msgBox = $('agentMessages');
  const assetSelect = $('sandboxAssetSelect');
  if (!_workbuddyDeployed) { showToast('请先点击「部署到 WorkBuddy」', 'warning'); return; }
  if (!input?.value?.trim()) return;
  if (!assetSelect?.value) { showToast('请先选择要测试的 MCP 资产', 'warning'); return; }

  const userMsg = input.value.trim();
  input.value = '';

  // 显示用户消息
  msgBox.innerHTML += `<div class="workbuddy-message workbuddy-message--user" style="align-self:flex-end;background:var(--primary);color:#fff;padding:8px 12px;border-radius:12px 12px 2px 12px;max-width:80%">${escapeHtml(userMsg)}</div>`;
  msgBox.innerHTML += `<div id="agentTyping" class="workbuddy-message workbuddy-message--typing" style="align-self:flex-start;background:#f1f5f9;padding:8px 12px;border-radius:12px 12px 12px 2px;color:#64748b;font-size:12px">⏳ WorkBuddy (TTKC-AUTO) 正在分析并调用工具...</div>`;
  msgBox.scrollTop = msgBox.scrollHeight;

  try {
    // 使用 WorkBuddy chat API（OpenAI function calling 协议）
    const resp = await fetch('/api/workbuddy/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({
        asset_id: assetSelect.value,
        message: userMsg,
        history: _agentHistory.slice(-10),
        model_config: WORKBUDDY_DEFAULT_MODEL,
        runtime_id: _connectedRuntimeId
      })
    });
    const result = await resp.json();

    if (result.error) throw new Error(result.error);

    // 更新历史
    _agentHistory.push({ role: 'user', content: userMsg }, { role: 'assistant', content: result.reply });

    // 移除 typing
    const typing = $('agentTyping');
    if (typing) typing.remove();

    // 显示 Tool 调用过程（折叠式，不占太多空间）
    if (result.tool_calls?.length) {
      result.tool_calls.forEach(tc => {
        var tcCard = document.createElement('div');
        tcCard.className = 'workbuddy-execution';
        tcCard.style.cssText = 'align-self:center;width:100%;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:6px 12px;font-size:12px';
        tcCard.innerHTML = '<details style="cursor:pointer"><summary style="color:#7c3aed;font-weight:600">🔧 ' + escapeHtml(tc.display_name) + ' - 调用成功</summary>'
          + '<div style="margin-top:6px;padding:6px 8px;background:#fff;border-radius:4px;font-size:11px;color:#64748b;font-family:Consolas,monospace">'
          + (tc.arguments && Object.keys(tc.arguments).length ? '参数：' + escapeHtml(JSON.stringify(tc.arguments)) + '<br>' : '<无参数><br>')
          + '<span style="color:#16a34a">结果：</span>' + escapeHtml(JSON.stringify(tc.result))
          + '</div></details>';
        msgBox.appendChild(tcCard);
      });
    }

    // 显示 AI 回复（Markdown 渲染）
    var replyDiv = document.createElement('div');
    replyDiv.className = 'workbuddy-message workbuddy-message--assistant';
    replyDiv.style.cssText = 'align-self:flex-start;background:#f1f5f9;padding:10px 14px;border-radius:12px 12px 12px 2px;max-width:85%;line-height:1.7';
    replyDiv.innerHTML = renderMarkdown(result.reply);
    msgBox.appendChild(replyDiv);
    msgBox.scrollTop = msgBox.scrollHeight;
  } catch (error) {
    const typing = $('agentTyping');
    if (typing) typing.remove();
    msgBox.innerHTML += `<div class="workbuddy-message workbuddy-message--error" style="align-self:flex-start;background:#fef2f2;color:#dc2626;padding:8px 12px;border-radius:12px 12px 12px 2px;max-width:85%">❌ ${escapeHtml(describeWorkBuddyFailure(error))}</div>`;
    msgBox.scrollTop = msgBox.scrollHeight;
  }
}

// 切换 MCP 资产时清空对话
window.resetAgentChat = function() { _agentHistory = []; const mb = $('agentMessages'); if (mb) mb.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px 0">选择 MCP 资产后，输入问题测试 AI 是否能正确调用 Tool</div>'; };

// 沙箱综合测试
window.selectOpenapiSpec = selectOpenapiSpec;
window.confirmOpenapiSpec = confirmOpenapiSpec;
window.viewSourceOpenapi = viewSourceOpenapi;
window.jumpToCandidateCapabilities = jumpToCandidateCapabilities;
window.jumpToAssets = jumpToAssets;
window.jumpToPublish = jumpToPublish;
window.jumpToPage = jumpToPage;
window.navigateToPage = navigateToPage;
window.setMonitoringFilter = setMonitoringFilter;
window.markMonitoringIssueStatus = markMonitoringIssueStatus;

async function bootApp() {
  if (!state.user) state.user = await api('/auth/me');
  state.currentPage = getDefaultPageForRole(state.user?.role, state.currentPage);
  await loadAll();
  renderAll();
  showApp();
  
  // 初始化 WebSocket 连接
  if (state.user?.role === 'admin') {
    initWebSocket();
  }
  
  startCustomerLiveRefresh();
}

function bindEvents() {
  syncLoginSelection(false);
  $('loginUserSelect')?.addEventListener('change', () => {
    $('loginError').textContent = '';
    syncLoginSelection();
  });
  $('loginBtn').addEventListener('click', login);
  $('logoutBtn').addEventListener('click', logout);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user) loadAll().then(renderAll).catch(() => {}); });
  $('simulateBtn')?.addEventListener('click', simulate);
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
  $('deliveryRepairClose')?.addEventListener('click', closeDeliveryRepairDrawer);
  $('deliveryRepairBackdrop')?.addEventListener('click', closeDeliveryRepairDrawer);
  $('deliverableDrawerBackdrop')?.addEventListener('click', closeDeliverableDrawer);
  $('knowledgeDrawerClose')?.addEventListener('click', closeKnowledgeDrawer);
  $('knowledgeDrawerBackdrop')?.addEventListener('click', closeKnowledgeDrawer);

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




























