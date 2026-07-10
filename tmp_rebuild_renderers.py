from pathlib import Path

path = Path(r'D:/桌面/mcp方案/mcp/poc/admin/assets/modules/renderers.js')
content = r'''import { state, isCustomerView, getNavItems, displayAssetName } from './state.js';
import { $, badge, displayStatus, emptyState, escapeHtml, metric, money, text, showToast } from './ui.js';

function list(value) {
  return Array.isArray(value) ? value : [];
}

const customerPageMeta = {
  'my-assets': { title: '我的 MCP 资产', eyebrow: '已交付资产的运行总览' },
  'my-usage': { title: '调用统计', eyebrow: '近 30 天调用趋势与成功率' },
  'my-billing': { title: '账单管理', eyebrow: '当期账单与历史明细' },
  'my-deliverables': { title: '交付物下载', eyebrow: '配置包、报告、日志与复盘' },
  'my-access': { title: '运行配置', eyebrow: '证书、环境与连接状态' }
};

function allowedNavItems() {
  const role = state.user?.role || 'customer';
  return getNavItems().filter(item => item.roles.includes(role));
}

function resolveAccessiblePage(id) {
  const allowed = allowedNavItems();
  if (allowed.some(item => item.id === id)) return id;
  return allowed[0]?.id || 'summary';
}

export function renderNav() {
  const nav = $('nav');
  if (!nav || !state.user) return;
  nav.innerHTML = allowedNavItems()
    .map(item => `<button type="button" class="nav-btn ${state.currentPage === item.id ? 'active' : ''}" data-page="${item.id}">${text(item.label)}</button>`)
    .join('');
  nav.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentPage = btn.dataset.page || 'summary';
      switchPage(state.currentPage);
    });
  });
}

export function switchPage(id) {
  const pageId = resolveAccessiblePage(id);
  state.currentPage = pageId;
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === pageId));
  const page = $(pageId);
  const meta = isCustomerView() ? customerPageMeta[pageId] : null;
  $('pageTitle').textContent = meta?.title || page?.dataset?.title || '工厂总览';
  $('pageEyebrow').textContent = meta?.eyebrow || page?.dataset?.eyebrow || '业务资料 -> MCP 资产生成工厂的全链路看板';
  renderNav();
}

function renderMetricSummary(targetId, items) {
  const node = $(targetId);
  if (!node) return;
  node.innerHTML = items.map(item => metric(item.label, item.value, item.meta || '')).join('');
}

function renderSimpleRows(targetId, html, emptyMessage, colspan) {
  const node = $(targetId);
  if (!node) return;
  node.innerHTML = html.length ? html.join('') : `<tr><td colspan="${colspan}">${emptyState(emptyMessage)}</td></tr>`;
}

function renderSummary() {
  renderMetricSummary('summaryCards', [
    { label: '本周新增业务资料', value: list(state.sources).length, meta: '进入工厂的资料批次' },
    { label: '已生成 OpenAPI 草案', value: list(state.openapiSpecs).length, meta: '等待确认或继续装配' },
    { label: '已产出 MCP 资产', value: list(state.assets).length, meta: `${list(state.releases).filter(item => item.status === 'published').length} 个已发布` },
    { label: '待交付资料包', value: list(state.deliverables).filter(item => item.status !== 'ready').length, meta: '仍在整理中的交付资料' }
  ]);

  renderMetricSummary('generationFlowBoard', [
    { label: '业务资料', value: list(state.sources).length, meta: '起点' },
    { label: 'OpenAPI 草案', value: list(state.openapiSpecs).length, meta: '识别结果' },
    { label: 'Tool 装配', value: list(state.assets).reduce((sum, asset) => sum + (Array.isArray(asset.tools) ? asset.tools.length : 0), 0), meta: '能力整理' },
    { label: 'MCP 资产', value: list(state.assets).length, meta: '封装完成' }
  ]);

  renderSimpleRows(
    'projectPipelineRows',
    list(state.projects).map(project => `<tr><td>${text(project.customer_name || project.customer_id || '-')} / ${text(project.name || '-')}</td><td>${list(state.sources).filter(item => item.project_id === project.id).length}</td><td>${list(state.openapiSpecs).filter(item => item.project_id === project.id).length}</td><td>${list(state.assets).filter(item => item.project_id === project.id).length}</td><td>${list(state.assets).filter(item => item.project_id === project.id).length}</td><td>${list(state.releases).filter(item => item.project_id === project.id).length}</td><td>${list(state.deliverables).filter(item => item.project_id === project.id).length}</td><td>${text(project.stage || '进行中')}</td></tr>`),
    '暂无项目加工链路数据',
    8
  );

  const projectControls = $('projectControls');
  if (projectControls) projectControls.innerHTML = '<div class="filter-summary"><span>按项目查看当前工厂加工进度</span></div>';

  renderSimpleRows(
    'projectRows',
    list(state.projects).map(project => `<tr><td>${text(project.customer_name || '-')} / ${text(project.name || '-')}</td><td>${badge(project.stage || 'draft')}</td><td>${text(project.progress || 0)}%</td><td>${text(project.owner || '-')}</td><td>${text(project.due_date || '-')}</td><td>${text(project.updated_at || '-')}</td><td>-</td><td>${list(state.events).filter(item => item.project_id === project.id && item.status !== 'success').length}</td><td>-</td><td>-</td></tr>`),
    '暂无项目数据',
    10
  );

  const activityList = $('activityList');
  if (activityList) {
    activityList.innerHTML = list(state.releases).slice(0, 5).map(item => `<div class="info-card"><h4>${text(item.asset_name || item.asset_id || '版本')}</h4><p>${text(item.version || '-')} · ${text(displayStatus(item.status))} · ${text(item.released_at || item.tested_at || '-')}</p></div>`).join('') || emptyState('暂无加工记录');
  }
}

function renderSourceCards() {
  const listNode = $('sourceList');
  if (!listNode) return;
  const items = list(state.sources);
  listNode.innerHTML = items.length
    ? items.map(item => `<div class="info-card source-card"><h4>${text(item.name || '未命名资料')}</h4><p class="muted-line">${text(item.type || '业务资料')} · ${text(item.project_name || item.project_id || '-')}</p><p>${text(item.auth_mode || '待补充访问说明')}</p></div>`).join('')
    : emptyState('暂无业务资料。先导入 Swagger、表结构、字段说明或业务文档。');
  const hint = $('sourceEmptyHint');
  if (hint) hint.style.display = items.length ? 'none' : '';
}

function renderIntake() {
  renderSourceCards();
}

function renderRecognition() {
  const listNode = $('openapiSpecList');
  const detail = $('openapiSpecDetail');
  if (!listNode) return;
  const specs = list(state.openapiSpecs);
  listNode.innerHTML = specs.length
    ? specs.map(item => `<div class="info-card"><h4>${text(item.source_name || item.title || 'OpenAPI 草案')}</h4><p class="muted-line">${text(item.title || '-')}</p><p>${badge(item.status || 'draft')}</p></div>`).join('')
    : emptyState('暂无可继续装配的 OpenAPI 草案');
  if (detail) {
    const first = specs[0];
    if (first?.spec) {
      const value = typeof first.spec === 'string' ? first.spec : JSON.stringify(first.spec, null, 2);
      detail.style.display = 'block';
      detail.innerHTML = `<pre><code>${escapeHtml(value)}</code></pre>`;
    } else {
      detail.style.display = 'none';
      detail.innerHTML = '';
    }
  }
}

function renderTooling() {
  const listNode = $('toolMappingList');
  if (!listNode) return;
  const cards = list(state.assets).map(asset => {
    const tools = Array.isArray(asset.tools) ? asset.tools : [];
    return `<div class="info-card"><h4>${displayAssetName(asset.name)}</h4><p class="muted-line">${text(asset.capability || '-')}</p><p>${tools.length ? tools.map(tool => `<span class="badge info">${text(typeof tool === 'string' ? tool : tool?.name || '-')}</span>`).join(' ') : '<span class="muted-line">暂无 Tool</span>'}</p></div>`;
  });
  listNode.innerHTML = cards.length ? cards.join('') : emptyState('暂无 Tool 装配结果');
}

function renderAssets() {
  renderSimpleRows(
    'assetRows',
    list(state.assets).map(asset => `<tr><td>${displayAssetName(asset.name)}</td><td>${text(asset.capability || '-')}</td><td>${badge(asset.status || 'draft')}</td><td>${text(asset.version || '-')}</td><td>${text(asset.source_name || asset.source_id || '-')}</td><td>${text(asset.project_name || asset.project_id || '-')}</td></tr>`),
    '暂无 MCP 资产',
    6
  );

  const security = $('securityPreview');
  if (security) {
    security.innerHTML = list(state.policies).length
      ? list(state.policies).map(policy => `<div class="info-card"><h4>${text(policy.name || '资产规则')}</h4><p class="muted-line">${text(policy.auth_mode || '-')} · ${text(policy.rate_limit || '-')}</p><p>${text(policy.masking_rules || '无脱敏规则')}</p></div>`).join('')
      : emptyState('暂无资产规则');
  }

  const timeline = $('timelineList');
  if (timeline) {
    timeline.innerHTML = list(state.timeline).length
      ? list(state.timeline).map(item => `<div class="info-card"><h4>${text(item.asset_name || item.asset_id || '资产轨迹')}</h4><p>${text(item.stage_label || item.stage || '-')} · ${text(item.completed_at || '-')}</p><p class="muted-line">${text(item.notes || '')}</p></div>`).join('')
      : emptyState('暂无资产生成轨迹');
  }
}

function renderPublish() {
  const controls = $('publishControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>按版本查看验证发布状态</span></div>';
  renderMetricSummary('publishSummary', [
    { label: '待验证资产', value: list(state.releases).filter(item => !item.tested_at).length, meta: '尚未完成验证' },
    { label: '待发布资产', value: list(state.releases).filter(item => item.status === 'tested' || item.status === 'ready_to_publish').length, meta: '已验证可交付' },
    { label: '已交付版本', value: list(state.releases).filter(item => item.status === 'published').length, meta: '当前对外版本' },
    { label: '版本总数', value: list(state.releases).length, meta: '全部发布记录' }
  ]);
  renderSimpleRows(
    'releaseRows',
    list(state.releases).map(item => `<tr><td>${text(item.asset_name || item.asset_id || '-')}</td><td>${text(item.version || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.environment || '-')}</td><td>${text(item.tested_at || '-')}</td><td>${text(item.released_at || '-')}</td><td>${text(item.notes || '-')}</td><td>-</td></tr>`),
    '暂无发布记录',
    8
  );
}

function renderDeliverables() {
  const controls = $('deliverableControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>交付资料按项目和类型归档</span></div>';
  renderMetricSummary('deliverableSummary', [
    { label: '交付资料总数', value: list(state.deliverables).length },
    { label: '可下载', value: list(state.deliverables).filter(item => item.status === 'ready').length },
    { label: '生成中', value: list(state.deliverables).filter(item => item.status === 'generating').length },
    { label: '待处理', value: list(state.deliverables).filter(item => ['failed', 'expired', 'revoked'].includes(item.status)).length }
  ]);
  renderSimpleRows(
    'deliverableRows',
    list(state.deliverables).map(item => `<tr><td>${text(item.name || '-')}</td><td>${text(item.project_name || item.project_id || '-')}</td><td>${text(item.type || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.updated_at || '-')}</td><td>${text(item.notes || '-')}</td><td>${item.status === 'ready' ? '可下载' : '-'}</td></tr>`),
    '暂无交付资料',
    7
  );
}

function renderAccess() {
  renderMetricSummary('accessOverview', [
    { label: '已交付接入项', value: list(state.access).length, meta: '客户可用的接入条目' },
    { label: '正式环境', value: list(state.access).filter(item => item.environment === 'production').length, meta: '生产接入' },
    { label: '验证环境', value: list(state.access).filter(item => item.environment === 'sandbox').length, meta: '沙箱接入' },
    { label: '健康异常', value: list(state.access).filter(item => item.last_health_status === 'error').length, meta: '建议优先排查' }
  ]);
  renderSimpleRows(
    'accessRows',
    list(state.access).map(item => `<tr><td>${text(item.customer_name || '-')} / ${text(item.project_name || '-')}</td><td>${text(item.name || '-')}</td><td>${text(item.type || '-')}</td><td>${text(item.endpoint || item.scope || '-')}</td><td>${text(item.environment || '-')}</td><td>${text(item.credential_expires_at || '-')}</td><td>${text(item.last_health_check_at || '-')}</td><td>${badge(item.status || 'draft')}</td><td>-</td></tr>`),
    '暂无客户接入项',
    9
  );
  renderSimpleRows('accessHealthRows', list(state.accessHealth).map(item => `<tr><td>${text(item.last_health_check_at || '-')}</td><td>${text(item.name || item.id || '-')}</td><td>${text(item.last_health_status || '-')}</td><td>${text(item.last_health_detail?.latency_ms ?? '-')}</td><td>${text(item.last_health_detail?.status_code ?? '-')}</td><td>${text(item.last_health_detail?.auth_ok ?? '-')}</td><td>${text(item.last_health_detail?.trace_id || '-')}</td></tr>`), '暂无接入健康记录', 7);
  renderSimpleRows('accessAuditRows', list(state.accessAudit).map(item => `<tr><td>${text(item.changed_at || '-')}</td><td>${text(item.access_id || '-')}</td><td>${text(item.field || '-')}</td><td>${text(item.old_value || '-')}</td><td>${text(item.new_value || '-')}</td><td>${text(item.changed_by || '-')}</td></tr>`), '暂无接入变更记录', 6);
  renderSimpleRows('accessWebhookRows', list(state.accessWebhook).map(item => `<tr><td>${text(item.created_at || '-')}</td><td>${text(item.access_id || '-')}</td><td>${text(item.event_type || '-')}</td><td>${text(item.url || '-')}</td><td>${text(item.status || '-')}</td><td>${text(item.retry_count ?? '-')}</td><td>${text(item.status_code ?? '-')}</td><td>${text(item.error_message || '-')}</td></tr>`), '暂无回调记录', 8);
}

function renderGateway() {
  renderSimpleRows(
    'policyRows',
    list(state.policies).map(item => `<tr><td>${text(item.name || '-')}</td><td>${text(item.project_name || item.project_id || '-')}</td><td>${text(item.auth_mode || '-')}</td><td>${text(item.rate_limit || '-')}</td><td>${text(item.masking_rules || '-')}</td><td>-</td><td>${badge(item.status || 'draft')}</td><td>-</td></tr>`),
    '暂无资产规则',
    8
  );
}

function renderPolicyChanges() {
  renderSimpleRows(
    'policyChangeRows',
    list(state.policyChanges).map(item => `<tr><td>${text(item.changed_at || '-')}</td><td>${text(item.policy_id || '-')}</td><td>${text(item.field || '-')}</td><td>${text(item.old_value || '-')}</td><td>${text(item.new_value || '-')}</td><td>${text(item.changed_by || '-')}</td></tr>`),
    '暂无规则变更记录',
    6
  );
}

function renderUsage() {
  const controls = $('usageControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>查看已交付 MCP 的客户调用表现</span></div>';
  renderMetricSummary('usageSummary', [
    { label: '客户调用量', value: list(state.events).length, meta: '全部调用事件' },
    { label: '成功调用', value: list(state.events).filter(item => item.status === 'success').length, meta: '状态为 success' },
    { label: '异常调用', value: list(state.events).filter(item => item.status !== 'success').length, meta: '建议优先排查' },
    { label: '已关联资产', value: new Set(list(state.events).map(item => item.asset_id || item.asset_name)).size, meta: '触达的 MCP 数量' }
  ]);
  renderSimpleRows(
    'eventRows',
    list(state.events).map(item => `<tr><td>${text(item.created_at || '-')}</td><td>${text(item.customer_name || '-')} / ${text(item.project_name || '-')}</td><td>${text(item.asset_name || item.asset_id || '-')}</td><td>${text(item.caller || '-')}</td><td>${text(item.business_result || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.latency_ms ?? '-')}</td><td>${text(item.trace_id || '-')}</td><td>-</td></tr>`),
    '暂无调用记录',
    9
  );
}

function renderKnowledge() {
  const controls = $('knowledgeControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>知识资料沉淀为知识型 MCP 与交付摘要</span></div>';
  renderMetricSummary('knowledgeSummary', [
    { label: '知识资料总数', value: list(state.knowledgeBases).length },
    { label: '关联 OpenAPI', value: list(state.openapiSpecs).length },
    { label: '关联 MCP 资产', value: list(state.assets).length },
    { label: '可导出资料', value: list(state.deliverables).filter(item => item.type === 'knowledge-base').length }
  ]);
  renderSimpleRows(
    'knowledgeRows',
    list(state.knowledgeBases).map(item => `<tr><td>${text(item.customer_name || '-')} / ${text(item.project_name || '-')}</td><td>${text(item.name || item.title || '-')}</td><td>${text(item.asset_name || '-')}</td><td>${text(item.source_status || item.status || '-')}</td><td>${text(item.indexed_at || item.updated_at || '-')}</td><td>${text(item.chunk_count ?? '-')}</td><td>${text(item.updated_at || '-')}</td><td>-</td></tr>`),
    '暂无知识资料',
    8
  );
}

function renderBilling() {
  const controls = $('billingControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>结算资料按客户、项目和账期汇总</span></div>';
  renderMetricSummary('billingSummary', [
    { label: '结算资料总数', value: list(state.billing).length },
    { label: '确认账单', value: list(state.billing).filter(item => item.status === 'confirmed').length },
    { label: '待处理账单', value: list(state.billing).filter(item => item.status !== 'confirmed').length },
    { label: '账单金额', value: money(list(state.billing).reduce((sum, item) => sum + Number(item.amount || item.total_amount || 0), 0)), meta: '当前可见汇总' }
  ]);
  renderSimpleRows(
    'billingRows',
    list(state.billing).map(item => `<tr><td>${text(item.customer_name || item.customer_id || '-')}</td><td>${text(item.project_name || item.project_id || '-')}</td><td>${text(item.item || '-')}</td><td>${text(item.period || '-')}</td><td>${money(item.amount || item.total_amount || 0)}</td><td>${text(item.usage_count || item.calls || '-')}</td><td>${text(item.billing_type || '-')}</td><td>${badge(item.status || 'pending')}</td><td>-</td></tr>`),
    '暂无结算资料',
    9
  );
}

function renderProjectDrawer() {
  const drawer = $('projectDrawer');
  const backdrop = $('projectDrawerBackdrop');
  const content = $('projectDrawerContent');
  if (!drawer || !backdrop || !content) return;
  const open = Boolean(state.projectDrawerOpen && state.selectedProjectId);
  drawer.classList.toggle('hidden', !open);
  backdrop.classList.toggle('hidden', !open);
  content.innerHTML = open ? '<div class="drawer-panel"><p>项目详情暂时以列表信息为准。</p></div>' : '';
}

function renderPublishDrawer() {}
function renderUsageDrawer() {}
function renderBillingDrawer() {}
function renderDeliverableDrawer() {}
function renderKnowledgeDrawer() {}

function renderCustomerDashboard() {
  const dash = state.customerDashboard || {};
  renderMetricSummary('customerDashboardCards', [
    { label: '我的 MCP', value: dash.asset_count || list(state.assets).length, meta: `${dash.published_count || 0} 个已发布` },
    { label: '本月调用', value: dash.month_calls || 0, meta: `成功率 ${dash.success_rate || 0}%` },
    { label: '本月费用', value: money(dash.month_amount || 0), meta: dash.billing_status || '待确认' },
    { label: '最近发布', value: dash.latest_release?.version || '-', meta: dash.latest_release?.asset_name || '暂无发布' }
  ]);
  const assetCards = $('customerAssetCards');
  if (assetCards) assetCards.innerHTML = list(dash.assets || state.assets).map(item => `<div class="info-card"><h4>${text(item.name || '-')}</h4><p>${text(item.version || '-')} · ${text(displayStatus(item.status || 'draft'))}</p></div>`).join('') || emptyState('暂无资产');
  const quick = $('customerQuickActions');
  if (quick) quick.innerHTML = [
    ['我的调用', '查看调用表现', 'my-usage'],
    ['我的账单', '查看结算资料', 'my-billing'],
    ['我的交付', '下载交付物', 'my-deliverables'],
    ['我的接入', '查看接入信息', 'my-access']
  ].map(item => `<div class="info-card" style="cursor:pointer" onclick="window.switchCustomerPage('${item[2]}')"><h4>${item[0]}</h4><p>${item[1]}</p></div>`).join('');
}

function renderCustomerUsage() {
  renderMetricSummary('customerUsageCards', [
    { label: '总调用量', value: list(state.events).length },
    { label: '成功调用', value: list(state.events).filter(item => item.status === 'success').length },
    { label: '异常调用', value: list(state.events).filter(item => item.status !== 'success').length },
    { label: '平均耗时', value: list(state.events).length ? Math.round(list(state.events).reduce((sum, item) => sum + Number(item.latency_ms || 0), 0) / list(state.events).length) : 0, meta: 'ms' }
  ]);
  const chart = $('customerUsageChart');
  if (chart) chart.innerHTML = '<div class="empty-state">当前版本未绘制趋势图，已恢复基础可用性。</div>';
  renderSimpleRows('customerUsageRows', list(state.events).slice(0, 20).map(item => `<tr><td>${text(item.created_at || '-')}</td><td>${text(item.asset_name || item.asset_id || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.latency_ms ?? '-')}</td><td>${text(item.trace_id || '-')}</td></tr>`), '暂无调用记录', 5);
}

function renderCustomerBilling() {
  const summary = $('customerBillingSummary');
  if (summary) summary.innerHTML = `<div class="panel-head"><h3>我的账单</h3></div><div class="metric-grid">${metric('账单数量', list(state.billing).length)}${metric('账单总额', money(list(state.billing).reduce((sum, item) => sum + Number(item.total_amount || item.amount || 0), 0)))}${metric('已确认', list(state.billing).filter(item => item.status === 'confirmed').length)}${metric('待处理', list(state.billing).filter(item => item.status !== 'confirmed').length)}</div>`;
  const listNode = $('customerBillingList');
  if (listNode) listNode.innerHTML = list(state.billing).map(item => `<div class="panel" style="margin-top:12px"><div class="panel-head"><h4>${text(item.item || '-')}</h4><span>${money(item.total_amount || item.amount || 0)}</span></div><p>${text(item.period || '-')} · ${text(displayStatus(item.status || 'pending'))}</p></div>`).join('') || emptyState('暂无账单');
}

function renderCustomerDeliverables() {
  renderSimpleRows('customerDeliverableRows', list(state.deliverables).map(item => `<tr><td>${text(item.name || '-')}</td><td>${text(item.project_name || item.project_id || '-')}</td><td>${text(item.type || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.updated_at || '-')}</td><td>${item.status === 'ready' ? '可下载' : '-'}</td></tr>`), '暂无交付物', 6);
}

function renderCustomerAccess() {
  const listNode = $('customerAccessList');
  if (!listNode) return;
  listNode.innerHTML = list(state.access).map(item => `<div class="info-card"><h4>${text(item.name || '-')}</h4><p>${text(item.environment || '-')} · ${text(item.type || '-')}</p><p class="muted-line">${text(item.endpoint || '-')}</p></div>`).join('') || emptyState('暂无接入信息');
}

export function renderRoleControls() {
  document.body.classList.toggle('customer', isCustomerView());
  document.body.classList.toggle('admin', !isCustomerView());
}

window.switchAccessTab = function(id) {
  document.querySelectorAll('#accessTabs .tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === id));
  document.querySelectorAll('#governance .tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === id));
};

window.copyText = function(value) {
  if (!value) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(() => showToast('已复制到剪贴板', 'success')).catch(() => showToast('复制失败', 'error'));
    return;
  }
  showToast('当前环境不支持复制', 'warning');
};

window.closeAccessGuide = function() {
  const overlay = $('accessGuideOverlay');
  if (overlay) overlay.style.display = 'none';
};

window.viewAccessGuide = async function() {
  showToast('接入指引恢复为基础模式，当前可正常打开后台。', 'info');
};

window.switchCustomerPage = function(pageId) {
  state.currentPage = pageId;
  renderAll();
};

function harmonizeAdminCopy() {
  if (isCustomerView()) return;
  const pageMeta = {
    summary: ['工厂总览', '业务资料 -> MCP 资产生成工厂的全链路看板'],
    intake: ['业务资料', '业务资料进入 MCP 资产生成工厂的第一站'],
    recognition: ['OpenAPI 草案', '业务资料经过识别后，在工厂内沉淀为 OpenAPI 草案'],
    tooling: ['Tool 装配', '把识别出的 OpenAPI 草案继续装配成 MCP Tools'],
    assets: ['MCP 资产', '查看业务资料在工厂里产出的 MCP 资产与生成轨迹'],
    publish: ['验证发布', '验证工厂产出的 MCP 资产是否达到可交付标准'],
    delivery: ['交付资料', '把工厂产出的资产、报告和资料打包成交付资料'],
    governance: ['运行成效', '查看已交付 MCP 资产的接入效果、调用表现与迭代线索'],
    settings: ['资料与结算', '沉淀知识资料、交付资料和结算资料，支撑 MCP 资产持续迭代']
  };
  for (const [id, [title, eyebrow]] of Object.entries(pageMeta)) {
    const page = $(id);
    if (!page) continue;
    page.dataset.title = title;
    page.dataset.eyebrow = eyebrow;
  }
  const intakeTitles = document.querySelectorAll('#intake .panel-head h3');
  if (intakeTitles[0]) intakeTitles[0].textContent = '业务资料池';
  if (intakeTitles[1]) intakeTitles[1].textContent = '资料进入工厂前';
  const intakeHints = document.querySelectorAll('#intake .info-card p');
  if (intakeHints[0]) intakeHints[0].textContent = 'Swagger / Postman / SQL DDL / 字段说明 / 示例数据 / 业务文档';
  if (intakeHints[1]) intakeHints[1].textContent = '资料越完整，后续 OpenAPI 草案、Tool 装配和 MCP 资产生成越顺畅。';
  const recognitionHead = document.querySelector('#recognition .panel-head h3');
  if (recognitionHead) recognitionHead.textContent = 'OpenAPI 草案池';
  const recognitionSmall = document.querySelector('#recognition .panel-head small');
  if (recognitionSmall) recognitionSmall.textContent = 'AI 会把业务资料整理成可继续装配的 OpenAPI 草案';
  const toolingHead = document.querySelector('#tooling .panel-head h3');
  if (toolingHead) toolingHead.textContent = 'Tool 装配清单';
  const toolingSmall = document.querySelector('#tooling .panel-head small');
  if (toolingSmall) toolingSmall.textContent = 'OpenAPI 端点在这里被整理成可调用的 MCP Tool 能力';
  const heads = document.querySelectorAll('#assets .panel-head h3');
  if (heads[0]) heads[0].textContent = 'MCP 资产目录';
  if (heads[1]) heads[1].textContent = '加工规则预览';
  if (heads[2]) heads[2].textContent = '资产生成轨迹';
}

export function renderAll() {
  if (!state.user) return;
  $('currentUser').textContent = `${state.user.display_name || '未登录'} · ${state.user.role === 'admin' ? '平台管理员' : '客户视图'}`;
  $('roleLabel').textContent = state.user.role === 'admin' ? 'MCP 资产生成工厂' : '客户交付中心';
  renderRoleControls();
  renderNav();
  if (isCustomerView()) {
    renderCustomerDashboard();
    renderCustomerUsage();
    renderCustomerBilling();
    renderCustomerDeliverables();
    renderCustomerAccess();
  } else {
    renderSummary();
    renderIntake();
    renderRecognition();
    renderTooling();
    renderAssets();
    renderPublish();
    renderPublishDrawer();
    renderDeliverables();
    renderAccess();
    renderGateway();
    renderPolicyChanges();
    renderUsage();
    renderKnowledge();
    renderKnowledgeDrawer();
    renderBilling();
    renderBillingDrawer();
    harmonizeAdminCopy();
  }
  renderUsageDrawer();
  renderDeliverableDrawer();
  renderProjectDrawer();
  switchPage(state.currentPage || (isCustomerView() ? 'my-assets' : 'summary'));
}
'''
path.write_text(content, encoding='utf-8')
print('renderers rebuilt')
