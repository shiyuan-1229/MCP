import { state, isCustomerView, getNavItems, displayAssetName } from './state.js';
import { $, badge, displayStatus, emptyState, escapeHtml, metric, money, text, showToast } from './ui.js';

function list(value) {
  return Array.isArray(value) ? value : [];
}

function parseRuleList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(/[,，]/).map(item => item.trim()).filter(Boolean);
  }
}

function escapeJs(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

function adminReleases() {
  return list(state.releases).map(item => ({ ...item, ...(state.releaseOverrides?.[item.id] || {}) }));
}

function adminBilling() {
  return list(state.billing).map(item => {
    const override = state.billingOverrides?.[item.id] || {};
    const baseAmount = Number(item.amount ?? item.total_amount ?? 0);
    return {
      ...item,
      ...override,
      amount: Math.round((baseAmount + Number(override.adjustment || 0)) * 100) / 100
    };
  });
}

function customerAssets() {
  return list(state.customerDashboard?.assets || state.assets);
}

const customerPageMeta = {
  'customer-overview': { title: '交付总览', eyebrow: '已交付 MCP、待处理事项与运行状态' },
  'my-assets': { title: '我的 MCP 资产', eyebrow: '已交付资产的运行总览' },
  'my-usage': { title: '调用统计', eyebrow: '近 30 天调用趋势与成功率' },
  'my-billing': { title: '账单管理', eyebrow: '当期账单与历史明细' },
  'my-deliverables': { title: '交付物下载', eyebrow: '配置包、报告、日志与复盘' },
  'my-access': { title: '接入配置', eyebrow: '地址、证书、鉴权方式与运行说明' }
};

function allowedNavItems() {
  const role = state.user?.role || 'customer';
  return getNavItems().filter(item => item.roles.includes(role));
}

function resolveAccessiblePage(id) {
  const items = allowedNavItems();
  if (items.some(item => item.id === id)) return id;
  return items[0]?.id || 'summary';
}

function getReviewPendingCount() {
  const reviewState = typeof window !== 'undefined' ? window.__state : null;
  const reviews = reviewState?.reviews;
  if (Array.isArray(reviews)) {
    return reviews.filter(item => item?.status === 'open').length;
  }

  const metrics = state.builderMetrics || {};
  const manualScreen = Number(metrics.pending_manual_screen) || 0;
  const pendingPublishes = Number(metrics.pending_publishes) || 0;
  return Math.max(0, manualScreen + pendingPublishes);
}

export function renderNav() {
  const nav = $('nav');
  if (!nav || !state.user) return;
  nav.innerHTML = allowedNavItems()
    .map(item => {
      const icon = item.icon ? `<span class="nav-icon">${item.icon}</span>` : '';
      const desc = item.desc ? ` title="${text(item.desc)}"` : '';
      const reviewCount = item.id === 'review' ? getReviewPendingCount() : 0;
      const badge = reviewCount > 0
        ? `<span class="nav-badge" aria-label="${reviewCount} 条待处理">${reviewCount}</span>`
        : '';
      return `<button type="button" class="nav-btn ${state.currentPage === item.id ? 'active' : ''}" data-page="${item.id}"${desc}>${icon}<span class="nav-label">${text(item.label)}</span>${badge}</button>`;
    })
    .join('');
  nav.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page || 'summary'));
  });
}

export function switchPage(id) {
  if (typeof document === 'undefined') return;
  const pageId = resolveAccessiblePage(id);
  state.currentPage = pageId;
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === pageId));
  const page = $(pageId);
  const meta = isCustomerView() ? customerPageMeta[pageId] : null;
  $('pageTitle').textContent = meta?.title || page?.dataset?.title || '生成总览';
  $('pageEyebrow').textContent = meta?.eyebrow || page?.dataset?.eyebrow || '';
  renderNav();
}

function renderMetricSummary(targetId, items) {
  const node = $(targetId);
  if (!node) return;
  node.innerHTML = items.map(item => {
    const card = metric(item.label, item.value, item.meta || '');
    if (!item.page) return card;
    return `<div class="metric-link" role="button" tabindex="0" onclick="jumpToPage('${item.page}')" onkeydown="if(event.key==='Enter'||event.key===' '){jumpToPage('${item.page}')}" style="cursor:pointer">${card}</div>`;
  }).join('');
}

function renderSimpleRows(targetId, rows, emptyMessage, colspan) {
  const node = $(targetId);
  if (!node) return;
  node.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="${colspan}">${emptyState(emptyMessage)}</td></tr>`;
}

function renderCardList(targetId, cards, emptyMessage) {
  const node = $(targetId);
  if (!node) return;
  node.innerHTML = cards.length ? cards.join('') : emptyState(emptyMessage);
}

// ============================================================
// 流程步骤条组件
// ============================================================
function renderStepBar(currentStep) {
  const steps = [
    { n: 1, label: '资料接入', page: 'intake' },
    { n: 2, label: 'AI 识别结果', page: 'recognition' },
    { n: 3, label: '候选业务能力', page: 'candidates' },
    { n: 4, label: '候选接口人工初筛', page: 'review' },
    { n: 5, label: '人工确认 Tool 边界', page: 'tooling' },
    { n: 6, label: '生成 Tool 草稿', page: 'tool-draft' },
    { n: 7, label: '人工确认 MCP 组成', page: 'mcp-compose' },
    { n: 8, label: '生成 MCP 草稿', page: 'assets' },
    { n: 9, label: '测试发布', page: 'publish' },
    { n: 10, label: '交付管理', page: 'delivery' },
    { n: 11, label: '调用监控', page: 'monitoring' },
    { n: 12, label: '治理统计', page: 'governance' }
  ];
  return `<div class="step-bar">${steps.map(s => `
    <div class="step-item ${s.n <= currentStep ? 'done' : ''} ${s.n === currentStep ? 'current' : ''}" onclick="jumpToPage('${s.page}')">
      <span class="step-num">${s.n <= currentStep ? '\u2705' : s.n}</span>
      <span class="step-text">${s.label}</span>
    </div>
    ${s.n < 12 ? '<span class="step-arrow">\u2192</span>' : ''}
  `).join('')}</div>`;
}

// ============================================================
// 1. 生成总览 — 资产生成驾驶舱 + 全链路漏斗
// ============================================================
function renderLegacySummary() {
  const sources = list(state.sources);
  const specs = list(state.openapiSpecs);
  const assets = list(state.assets);
  const releases = adminReleases();
  const deliverables = list(state.deliverables);
  const publishedCount = releases.filter(r => r.status === 'published').length;

  // 指标卡
  const publicAssets = assets.filter(a => a.visibility === 'public').length;
  const internalAssets = assets.filter(a => a.visibility !== 'public').length;
  renderMetricSummary('summaryCards', [
    { label: '已接入业务资料', value: sources.length, meta: '进入工厂的资料批次' },
    { label: '已生成 OpenAPI 草案', value: specs.length, meta: `${specs.filter(s => s.status === 'confirmed').length} 个已确认` },
    { label: '已产出 MCP 资产', value: assets.length, meta: `🌐 公开 ${publicAssets} · 🔒 内部 ${internalAssets}` },
    { label: '待交付资料包', value: deliverables.filter(d => d.status !== 'ready').length, meta: '仍在整理中' }
  ]);

  // 资产生成漏斗
  const demo = state.governanceDemoOverview;
  if (demo?.valueMetrics) {
    const metrics = demo.valueMetrics;
    renderMetricSummary('governanceValueBoard', [
      { label: '资料转资产周期', value: `${metrics.asset_cycle_days} 天`, meta: '从接入到可发布的平均周期' },
      { label: '拦截高风险项', value: metrics.risk_items_intercepted, meta: '敏感字段或写操作进入人工审核' },
      { label: '复用已有资产', value: metrics.reused_assets, meta: '避免重复梳理和重复封装' },
      { label: '减少重复工作', value: `${metrics.repeated_work_reduction}%`, meta: 'AI 识别后由人工聚焦关键差异' },
      { label: '当前可发布 MCP', value: metrics.publishable_mcps, meta: '已完成所有治理门禁' }
    ]);
    const completed = ['资料接入', 'AI 识别结果', '候选业务能力', '候选接口人工初筛', '人工确认 Tool 边界', '生成 Tool 草稿', '人工确认 MCP 组成', '生成 MCP 草稿', '测试发布', '交付管理', '调用监控', '治理统计'];
    const governanceFlowRoutes = ['intake', 'recognition', 'candidates', 'review', 'tooling', 'tool-draft', 'mcp-compose', 'assets', 'publish', 'delivery', 'monitoring', 'governance'];
    renderMetricSummary('governanceFlowBoard', completed.map((label, index) => ({
      label,
      value: index < 8 ? '已确认' : index === 8 ? '待验收' : '已发布',
      meta: index === 5 ? `${demo.toolDrafts.length} 个 Tool 草稿，前往生成 Tool 草稿` : index === 7 ? `${demo.mcpDrafts.length} 个 MCP 草稿，前往 MCP 资产` : '点击前往对应工作台',
      page: governanceFlowRoutes[index]
    })));

    renderCardList('governanceActionBoard', [
      `<div class="info-card" style="cursor:pointer" onclick="jumpToPage('review')"><h4>处理高风险审核</h4><p>${metrics.risk_items_intercepted} 个敏感字段或写操作需要人工审核</p></div>`,
      `<div class="info-card" style="cursor:pointer" onclick="jumpToPage('tooling')"><h4>确认 Tool 边界</h4><p>${demo.toolDrafts.length} 个候选等待确认 Tool 边界</p></div>`,
      `<div class="info-card" style="cursor:pointer" onclick="jumpToPage('publish')"><h4>验收并发布 MCP</h4><p>${metrics.publishable_mcps} 个 MCP 已具备发布条件</p></div>`
    ], '当前没有待处理事项');

    const failures = list(demo.acceptanceFailures);
    renderCardList('governanceRiskBoard', failures.map(item =>
      `<div class="info-card" style="cursor:pointer;border-left:3px solid #c93636" onclick="jumpToPage('monitoring')"><h4>${text(item.check || '验收失败')} · HTTP ${text(item.status_code || '-')}</h4><p>Trace ID：${text(item.trace_id || '-')} · 前往调用监控诊断</p></div>`
    ), '当前没有发布阻断风险');
  }

  ['builderValueBoard', 'summaryCards', 'generationFunnel', 'generationFlowBoard', 'projectRows', 'activityList'].forEach(id => {
    const node = $(id);
    const panel = node?.closest('.panel');
    if (panel) panel.hidden = true;
  });

  const funnelData = [
    { label: '业务资料', value: sources.length, color: '#3558d6', page: 'intake' },
    { label: 'OpenAPI 草案', value: specs.length, color: '#2563a8', page: 'recognition' },
    { label: 'Tool 映射', value: assets.reduce((s, a) => s + list(a.tools).length, 0), color: '#0f8f61', page: 'tooling' },
    { label: 'MCP 资产', value: assets.length, color: '#b46b06', page: 'assets' },
    { label: '已发布', value: publishedCount, color: '#7c3aed', page: 'publish' },
    { label: '已交付', value: deliverables.filter(d => d.status === 'ready').length, color: '#c93636', page: 'delivery' }
  ];
  const maxVal = Math.max(1, ...funnelData.map(d => d.value));
  const funnel = $('generationFunnel');
  if (funnel) {
    funnel.innerHTML = funnelData.map(d => {
      const pct = Math.round(d.value / maxVal * 100);
      return `<div class="funnel-row" onclick="jumpToPage('${d.page}')" style="cursor:pointer">
        <span class="funnel-label">${d.label}</span>
        <div class="funnel-bar-container">
          <div class="funnel-bar" style="width:${pct}%;background:${d.color}"></div>
          <span class="funnel-value">${d.value}</span>
        </div>
      </div>`;
    }).join('');
  }

  // 核心链路看板
  renderMetricSummary('generationFlowBoard', [
    { label: '业务资料', value: sources.length, meta: '起点' },
    { label: 'OpenAPI 草案', value: specs.length, meta: 'AI 识别出的草案' },
    { label: 'Tool 映射', value: assets.reduce((s, a) => s + list(a.tools).length, 0), meta: '能力整理' },
    { label: 'MCP 资产', value: assets.length, meta: 'Tool 映射完成' }
  ]);

  // 项目加工链路表
  renderSimpleRows('projectPipelineRows', list(state.projects).map(project => {
    const pSources = sources.filter(s => s.project_id === project.id).length;
    const pSpecs = specs.filter(s => s.project_id === project.id).length;
    const pAssets = assets.filter(a => a.project_id === project.id);
    const pTools = pAssets.reduce((sum, a) => sum + list(a.tools).length, 0);
    const pReleases = releases.filter(r => r.project_id === project.id).length;
    const pDeliverables = deliverables.filter(d => d.project_id === project.id).length;
    return `<tr style="cursor:pointer" onclick="openProjectDrawer('${project.id}')">
      <td>${text(project.customer_name || '-')} / ${text(project.name || '-')}</td>
      <td>${pSources}</td><td>${pSpecs}</td><td>${pTools}</td><td>${pAssets.length}</td>
      <td>${pReleases}</td><td>${pDeliverables}</td>
      <td>${badge(project.stage || '进行中')}</td>
    </tr>`;
  }), '暂无项目资产生成链路', 8);

  const projectControls = $('projectControls');
  if (projectControls) projectControls.innerHTML = '<div class="filter-summary"><span>按项目查看当前工厂加工进度</span></div>';

  // 项目健康表
  renderSimpleRows('projectRows', list(state.projects).map(project => `<tr class="project-row" onclick="openProjectDrawer('${project.id}')"><td>${text(project.customer_name || '-')} / ${text(project.name || '-')}</td><td>${badge(project.stage || 'draft')}</td><td>${text(project.progress || 0)}%</td><td>${text(project.owner || '-')}</td><td>${text(project.due_date || '-')}</td><td>${text(project.updated_at || '-')}</td><td>${releases.filter(item => item.project_id === project.id).slice(-1)[0]?.version || '-'}</td><td>${list(state.events).filter(item => item.project_id === project.id && item.status !== 'success').length}</td><td>${adminBilling().filter(item => item.project_id === project.id)[0]?.status || '-'}</td><td>${list(state.access).filter(item => item.project_id === project.id && item.last_health_status === 'error').length ? '需排查' : '稳定'}</td></tr>`), '暂无项目数据', 10);

  // 最近生成动态
  renderCardList('activityList', releases.slice(0, 5).map(item => `<div class="info-card"><h4>${text(item.asset_name || '版本')}</h4><p>${text(item.version || '-')} \u00b7 ${text(displayStatus(item.status))} \u00b7 ${text(item.released_at || item.tested_at || '-')}</p></div>`), '暂无近期动态');
}

// ============================================================
// 2. 资料接入 — 上传 + 识别 + 产出物
// ============================================================
function governanceWorkQueue(demo) {
  const candidates = list(demo?.candidates);
  const drafts = list(demo?.toolDrafts);
  const mcps = list(demo?.mcpDrafts);
  return {
    manualScreen: candidates.filter(item => item.stage === 'rejected').length,
    toolBoundary: candidates.filter(item => item.stage === 'risk_review').length,
    mcpComposition: drafts.filter(item => item.status === 'draft').length,
    acceptance: mcps.filter(item => item.status === 'acceptance_failed').length
  };
}

function removeLegacySummaryPanels() {
  if (typeof document === 'undefined') return;
  ['builderValueBoard', 'summaryCards', 'generationFunnel', 'generationFlowBoard', 'projectRows', 'activityList'].forEach(id => {
    $(id)?.closest('.panel')?.remove();
  });
}

function renderGovernanceFlow() {
  const demo = state.governanceDemoOverview;
  const metrics = demo?.valueMetrics;
  const board = $('governanceFlowBoard');
  if (!board || !metrics) return;
  board.classList.remove('metric-grid');

  const queue = governanceWorkQueue(demo);
  const steps = [
    { label: '资料接入', page: 'intake', state: 'done', status: '已完成' },
    { label: 'AI 识别结果', page: 'recognition', state: 'done', status: '已完成' },
    { label: '候选业务能力', page: 'review', state: 'done', status: '已完成' },
    { label: '候选接口人工初筛', page: 'review', state: 'blocked', status: '被拦截', count: queue.manualScreen },
    { label: '人工确认 Tool 边界', page: 'tooling', state: 'pending', status: '待处理', count: queue.toolBoundary },
    { label: '生成 Tool 草稿', page: 'tooling', state: 'done', status: '已完成' },
    { label: '人工确认 MCP 组成', page: 'tooling', state: 'pending', status: '待处理', count: queue.mcpComposition },
    { label: '生成 MCP 草稿', page: 'assets', state: 'done', status: '已完成' },
    { label: '发布前验收', page: 'publish', state: 'pending', status: '待处理', count: queue.acceptance },
    { label: '正式发布', page: 'publish', state: 'ready', status: '可发布', count: metrics.publishable_mcps }
  ];
  const current = steps.find(item => item.state === 'pending');
  board.innerHTML = `<div class="governance-flow-summary"><strong>当前卡点：${text(current?.label || '暂无待处理关口')}</strong><span>${current?.count || 0} 项待处理，按优先级进入下方待办</span></div><ol class="governance-flow-board">${steps.map((item, index) => `<li class="governance-flow-step is-${item.state}"><button type="button" onclick="jumpToPage('${item.page}')"><span class="flow-index">${index + 1}</span><span class="flow-label">${item.label}</span><span class="flow-state">${item.status}${item.count ? ` ${item.count}` : ''}</span></button></li>`).join('')}</ol>`;
}

function renderSummary() {
  removeLegacySummaryPanels();
  const demo = state.governanceDemoOverview;
  const metrics = demo?.valueMetrics;
  if (!metrics) return;

  const queue = governanceWorkQueue(demo);
  renderMetricSummary('governanceValueBoard', [
    { label: '资料转资产周期', value: `${metrics.asset_cycle_days} 天`, meta: '从接入到可发布的平均周期' },
    { label: '高风险拦截', value: metrics.risk_items_intercepted, meta: '敏感字段或写操作进入人工审核' },
    { label: '复用资产', value: metrics.reused_assets, meta: '避免重复梳理和重复封装' },
    { label: '减少重复工作', value: `${metrics.repeated_work_reduction}%`, meta: 'AI 识别后由人工聚焦关键差异' },
    { label: '可发布 MCP', value: metrics.publishable_mcps, meta: '已完成所有治理门禁' }
  ]);
  renderGovernanceFlow();

  const actions = [
    { label: '待人工初筛', count: queue.manualScreen, page: 'review', description: '案例：订单状态更新候选，需确认是否具备独立业务责任边界' },
    { label: '待确认 Tool 边界', count: queue.toolBoundary, page: 'tooling', description: '案例：客户手机号导出，需限制敏感字段与读取范围' },
    { label: '待确认 MCP 组成', count: queue.mcpComposition, page: 'tooling', description: '案例：订单查询与订单明细是否组合为一个只读 MCP' },
    { label: '待验收', count: queue.acceptance, page: 'publish', description: '案例：退款处理 MCP，先处理安全检测和发布前阻断' }
  ];
  $('governanceActionBoard')?.classList.add('governance-action-list');
  renderCardList('governanceActionBoard', actions.map((item, index) => `<button type="button" class="governance-action" onclick="jumpToPage('${item.page}')"><span class="action-priority">优先级 ${index + 1}</span><strong>${item.label}</strong><span class="action-description">${item.description}</span><span class="action-count">${item.count}</span><span class="action-link">前往处理</span></button>`), '当前没有待处理事项');

  const failures = list(demo.acceptanceFailures).slice(0, 3);
  renderCardList('governanceRiskBoard', failures.map(item => `<button type="button" class="governance-risk" onclick="navigateToPage('monitoring', { eventId: '${escapeJs(item.trace_id || '')}' })"><span class="risk-title">${text(item.check || '验收失败')} · HTTP ${text(item.status_code || '-')}</span><span class="risk-trace">Trace ID：${text(item.trace_id || '-')}</span><span class="action-link">调用监控诊断</span></button>`), '当前没有发布阻断风险');
}

function renderIntake() {
  const items = list(state.sources);
  const builderRequests = list(state.builderRequests);

  const stepBar = $('intakeStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(1);

  const aiBadge = $('aiStatusBadge');
  if (aiBadge) {
    const cfg = state.aiConfig || {};
    if (cfg.configured) {
      aiBadge.textContent = `AI 已就绪 · ${cfg.model || ''}`;
      aiBadge.style.cssText = 'font-size:11px;padding:2px 10px;border-radius:4px;background:#dcfce7;color:#16a34a;font-weight:600';
    } else {
      aiBadge.textContent = 'AI 未配置';
      aiBadge.style.cssText = 'font-size:11px;padding:2px 10px;border-radius:4px;background:#fef9c3;color:#a16207;font-weight:600';
    }
  }

  const builderPanel = $('builderRequestPanel');
  if (builderPanel) builderPanel.style.display = isCustomerView() ? 'none' : '';

  renderSimpleRows('builderRequestRows', builderRequests.map(item => {
    const tools = list(item.result?.tools);
    const toolPreview = tools.length
      ? `${tools.slice(0, 3).map(tool => `<span class="badge info">${text(tool?.name || tool?.display_name || '-')}</span>`).join('')}${tools.length > 3 ? ` <span class="muted-line">+${tools.length - 3}</span>` : ''}`
      : '<span class="muted-line">No Tools</span>';
    const requestStatus = item.intake_source_id ? 'accepted' : (item.status || 'submitted');
    const summary = item.result?.summary || item.latest_prompt || item.prompt || '-';
    const actions = item.intake_source_id
      ? `<div class="row-actions"><button type="button" class="ghost-btn small" onclick="triggerRecognition('${item.intake_source_id}')">开始识别</button></div>`
      : `<button type="button" class="primary-btn small" onclick="acceptBuilderRequestIntoIntake('${item.id}')">转入资料接入</button>`;
    return `<tr><td><strong>${text(item.customer_name || '-')}</strong><div class="muted-line">${text(item.project_name || '未分配项目')}</div></td><td><div style="max-width:360px"><strong>${text(item.result?.name || '目标 MCP')}</strong><p class="muted-line" style="margin:4px 0 0">${text(summary)}</p></div></td><td><div style="display:flex;flex-wrap:wrap;gap:6px">${toolPreview}</div></td><td>${badge(requestStatus)}</td><td>${text(item.created_at || '-')}</td><td>${actions}</td></tr>`;
  }), '暂无客户提交的 AI 需求。', 6);
  // 填充企业筛选器
  const filter = $('intakeCustomerFilter');
  if (filter) {
    const currentVal = filter.value;
    const customerIds = [...new Set(items.map(i => i.customer_id).filter(Boolean))];
    filter.innerHTML = '<option value="">全部企业</option>' + customerIds.map(cid => {
      const cname = items.find(i => i.customer_id === cid)?.customer_name || cid;
      return `<option value="${cid}">${escapeHtml(cname)}</option>`;
    }).join('');
    if (currentVal) filter.value = currentVal;
  }

  const selectedCustomer = filter?.value || '';
  const filtered = selectedCustomer ? items.filter(i => i.customer_id === selectedCustomer) : items;

  // 按企业分组
  const grouped = {};
  filtered.forEach(item => {
    const cid = item.customer_id || item.project_id || 'unknown';
    const cname = item.customer_name || item.project_name || item.project_id || '未分类';
    if (!grouped[cid]) grouped[cid] = { name: cname, id: cid, items: [] };
    grouped[cid].items.push(item);
  });

  const tbody = $('sourceRows');
  if (!tbody) return;
  let html = '';
  const customerIds = Object.keys(grouped);

  customerIds.forEach(cid => {
    const grp = grouped[cid];
    const pendingItems = grp.items.filter(i => (i.recognition_status || 'draft') !== 'done');
    // 企业分组标题行
    html += `<tr style="background:var(--surface-2)"><td colspan="9" style="padding:10px 12px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <strong style="font-size:14px">🏢 ${escapeHtml(grp.name)}</strong>
          <span class="muted-line" style="font-size:12px">${grp.items.length} 份资料 · ${pendingItems.length} 待识别</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" class="ghost-btn small" onclick="uploadFilesForCustomer('${cid}', '${escapeHtml(grp.name)}')">📁 接收文件</button>
        </div>
      </div>
    </td></tr>`;

    // 数据源行（带勾选框）
    grp.items.forEach(item => {
      const recStatus = item.recognition_status || 'draft';
      const statusBadge = badge(item.status || 'draft');
      const recBadge = recStatus === 'done' ? '<span class="badge success">已识别</span>' : recStatus === 'pending' ? '<span class="badge warning">识别中</span>' : '<span class="badge info">待识别</span>';
      const isDbConn = item.auth_mode === 'Database Connection';
      const isUpload = item.auth_mode === 'File Upload';
      const tag = isDbConn ? ' <span style="font-size:10px;color:#2563eb">🗄️直连</span>' : isUpload ? ' <span style="font-size:10px;color:#7c3aed">📎上传</span>' : '';
      const canSelect = recStatus !== 'done';
      const checkbox = canSelect ? `<input type="checkbox" class="src-check" value="${item.id}" onchange="updateBatchBar()" style="cursor:pointer">` : '<span style="padding-left:4px;color:#ccc">—</span>';
      const actionBtn = recStatus === 'done'
        ? `<div class="row-actions"><button type="button" class="ghost-btn small" onclick="viewSourceContent('${item.id}')">📄 查看文件</button><button type="button" class="ghost-btn small" onclick="viewSourceOpenapi('${item.id}')">查看草案</button>${isDbConn ? `<button type="button" class="ghost-btn small" onclick="refreshDbSource('${item.id}')">🔄 刷新</button>` : ''}<button type="button" class="primary-btn small" onclick="triggerRecognition('${item.id}')">重新识别</button></div>`
        : `<div class="row-actions"><button type="button" class="ghost-btn small" onclick="viewSourceContent('${item.id}')">📄 查看文件</button><button type="button" class="primary-btn small" onclick="triggerRecognition('${item.id}')">开始识别</button></div>`;
      const outputInfo = recStatus === 'done' ? '<span class="badge success">草案已生成</span>' : '<span class="muted-line">-</span>';
      html += `<tr><td style="padding-left:8px;text-align:center">${checkbox}</td><td style="padding-left:20px"><strong>${text(item.name || '未命名资料')}</strong>${tag}</td><td>${text(item.project_name || '-')}</td><td><span class="cap-chip">${text(item.type || '-')}</span></td><td>${text(item.auth_mode || '-')}</td><td>${statusBadge}</td><td>${recBadge}</td><td>${outputInfo}</td><td>${actionBtn}</td></tr>`;
    });
  });

  if (!customerIds.length) {
    html = `<tr><td colspan="9">${emptyState('暂无业务资料')}</td></tr>`;
  }
  tbody.innerHTML = html;

  // 更新批量操作栏
  if (typeof window !== 'undefined') window.updateBatchBar?.();

  const total = items.length;
  const recognized = items.filter(item => (item.recognition_status || 'draft') === 'done').length;
  const draftCount = items.filter(item => (item.recognition_status || 'draft') === 'draft').length;
  renderMetricSummary('intakeProgressBoard', [
    { label: '企业数', value: customerIds.length, meta: '已接入资料' },
    { label: '资料总数', value: total, meta: `已识别 ${recognized}` },
    { label: '已识别', value: recognized, meta: '等待确认后进入 Tool 映射' },
    { label: '待识别', value: draftCount, meta: '可勾选批量识别' }
  ]);
}

// ============================================================
// 3. 接口识别 — AI 识别 + OpenAPI + 确认 + 下载
// ============================================================
function renderRecognition() {
  const allSpecs = list(state.openapiSpecs);

  // 步骤条
  const stepBar = $('recognitionStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(2);

  // 企业筛选器
  const filter = $('recognitionCustomerFilter');
  const sources = list(state.sources);
  if (filter) {
    const currentVal = filter.value;
    const sourceMap = {};
    sources.forEach(s => { sourceMap[s.id] = s; });
    const customerIds = [...new Set(allSpecs.map(sp => sourceMap[sp.source_id]?.customer_id).filter(Boolean))];
    filter.innerHTML = '<option value="">全部企业</option>' + customerIds.map(cid => {
      const cname = sources.find(s => s.customer_id === cid)?.customer_name || cid;
      return `<option value="${cid}">${escapeHtml(cname)}</option>`;
    }).join('');
    if (currentVal) filter.value = currentVal;
  }

  const selectedCustomer = filter?.value || '';
  const specs = selectedCustomer
    ? allSpecs.filter(sp => sources.find(s => s.id === sp.source_id)?.customer_id === selectedCustomer)
    : allSpecs;

  // 草案列表 — 按企业分组
  const specList = $('openapiSpecList');
  if (specList) {
    const findCustName = (sourceId) => sources.find(s => s.id === sourceId)?.customer_name || sources.find(s => s.id === sourceId)?.project_name || '其他';

    const grouped = {};
    specs.forEach(item => {
      const cname = findCustName(item.source_id);
      if (!grouped[cname]) grouped[cname] = [];
      grouped[cname].push(item);
    });

    let html = '';
    const customerNames = Object.keys(grouped);
    if (!customerNames.length) {
      html = emptyState('暂无 OpenAPI 草案。请先在「资料接入」页触发接口识别。');
    } else {
      customerNames.forEach(cname => {
        html += `<div style="margin-bottom:10px"><div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:4px;padding:4px 8px;background:var(--surface-2);border-radius:4px">🏢 ${escapeHtml(cname)}</div>`;
        html += grouped[cname].map(item => {
          const isActive = state.selectedOpenapiSpecId === item.id;
          const endpoints = item.spec ? extractEndpointCount(item.spec) : 0;
          const isAISpec = (item.title || '').includes('AI');
          return `<div class="info-card" style="cursor:pointer;margin-left:12px;border:${isActive ? '2px solid var(--primary)' : '1px solid var(--line)'}" onclick="selectOpenapiSpec('${item.id}')"><h4>${text(item.source_name || item.title || 'OpenAPI 草案')}${isAISpec ? ' <span class="badge info" style="font-size:9px">AI</span>' : ''}</h4><p class="muted-line">${text(item.title || '-')}</p><p>${badge(item.status || 'draft')} · ${endpoints} 个端点</p></div>`;
        }).join('');
        html += `</div>`;
      });
    }
    specList.innerHTML = html;
  }

  // 详情区域
  const detail = $('openapiSpecDetail');
  const actions = $('openapiDetailActions');
  if (!detail) return;

  const selectedId = state.selectedOpenapiSpecId || (specs[0]?.id || '');
  const spec = specs.find(item => item.id === selectedId) || specs[0];

  if (!spec) {
    detail.innerHTML = '<div class="empty-state">选择左侧草案查看 AI 识别出的 OpenAPI 3.0 接口定义</div>';
    if (actions) actions.innerHTML = '';
    return;
  }

  let specObj = spec.spec;
  if (!specObj && spec.id) {
    detail.innerHTML = '<div class="empty-state">加载中...</div>';
  } else {
    if (typeof specObj === 'string') {
      try { specObj = JSON.parse(specObj); } catch { /* keep string */ }
    }
    const endpoints = extractEndpoints(specObj || {});
    detail.innerHTML = `
      <div style="margin-bottom:12px"><p class="muted-line" style="margin:0 0 4px">草案标题</p><strong>${text(spec.title || specObj?.info?.title || '-')}</strong></div>
      <div style="margin-bottom:12px"><p class="muted-line" style="margin:0 0 4px">来源资料</p><span>${text(spec.source_name || '-')}</span></div>
      <div style="margin-bottom:12px"><p class="muted-line" style="margin:0 0 4px">识别端点</p><div style="display:flex;flex-wrap:wrap;gap:6px">${endpoints.length ? endpoints.map(ep => `<span class="badge info">${text(ep.method)} ${text(ep.path)}</span>`).join('') : '<span class="muted-line">暂无端点</span>'}</div></div>
      <div><p class="muted-line" style="margin:0 0 4px">完整 OpenAPI JSON</p><pre><code>${escapeHtml(typeof specObj === 'string' ? specObj : JSON.stringify(specObj, null, 2))}</code></pre></div>
    `;
  }

  // 操作按钮：确认 + 下载 + 跳转
  if (actions) {
    const isConfirmed = spec.status === 'confirmed';
    actions.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${!isConfirmed ? `<button type="button" class="primary-btn small" onclick="confirmOpenapiSpec('${spec.id}')">确认草案</button>` : '<span class="badge success">已确认</span>'}
        <button type="button" class="ghost-btn small" onclick="downloadOpenapiSpec('${spec.id}')">下载 JSON</button>
        <button type="button" class="ghost-btn small" onclick="jumpToTooling()">进入 Tool 映射</button>
      </div>
    `;
  }
}

// 辅助函数：从 OpenAPI spec 中提取端点
function extractEndpoints(specObj) {
  const paths = specObj?.paths || {};
  const result = [];
  for (const [path, methods] of Object.entries(paths)) {
    if (typeof methods !== 'object' || methods === null) continue;
    for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
      if (methods[method]) {
        result.push({ method: method.toUpperCase(), path, operationId: methods[method].operationId || '' });
      }
    }
  }
  return result;
}

function extractEndpointCount(specObj) {
  if (typeof specObj === 'string') {
    try { specObj = JSON.parse(specObj); } catch { return 0; }
  }
  return extractEndpoints(specObj).length;
}

// ============================================================
// 4. Tool 映射 — OpenAPI -> MCP Tool + 安全规则配置
// ============================================================
function jsonList(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderToolingCandidates() {
  const root = $('toolingCandidateBoard');
  if (!root) return;
  const allCandidates = list(state.candidates);
  // 显示所有初筛通过（approve）的候选，包括已走完流程的
  const candidates = allCandidates.filter(c => c.manual_screen_decision === 'approve');
  if (!candidates.length) {
    root.innerHTML = '<article class="panel"><strong>暂无待确认 Tool 边界的候选</strong><p class="muted-line">请先在「候选接口人工初筛」中通过审核。</p>' +
      '<div class="row-actions" style="margin-top:10px"><button type="button" class="ghost-btn small" onclick="jumpToPage(\'review\')">去候选接口人工初筛 →</button></div></article>';
    return;
  }

  root.innerHTML = candidates.map(candidate => {
    const aiTools = jsonList(candidate.ai_tools_snapshot);
    const toolConfirmed = candidate.tool_boundary_status === 'confirmed';
    const statusBadge = toolConfirmed ? '<span class="badge success">Tool 边界已确认</span>' : '<span class="badge warning">待确认 Tool 边界</span>';

    // 每个 Tool 一个可编辑行
    const toolRowsHtml = aiTools.map((tool, index) => {
      if (typeof tool !== 'object' || tool === null) return '';
      const vis = tool.visibility === 'public' ? 'public' : 'internal';
      const visLabel = vis === 'public' ? '🌐 公开' : '🔒 内部';
      return '<div style="padding:12px;background:var(--surface);border:1px solid var(--line);border-radius:8px">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
          '<input type="checkbox" class="tool-keep-check" data-idx="' + index + '" checked style="cursor:pointer">' +
          '<input class="tool-name-input" data-idx="' + index + '" value="' + escapeHtml(tool.name || '') + '" style="flex:1;min-width:140px;padding:5px 8px;border:1px solid var(--line);border-radius:5px;font-size:12px">' +
          '<select class="tool-vis-select" data-idx="' + index + '" style="padding:5px 8px;border:1px solid var(--line);border-radius:5px;font-size:12px">' +
            '<option value="internal"' + (vis === 'internal' ? ' selected' : '') + '>🔒 内部</option>' +
            '<option value="public"' + (vis === 'public' ? ' selected' : '') + '>🌐 公开</option>' +
          '</select>' +
        '</div>' +
        '<input class="tool-desc-input" data-idx="' + index + '" value="' + escapeHtml(tool.display_name + ' - ' + (tool.description || '')) + '" placeholder="Tool 描述" style="width:100%;padding:5px 8px;border:1px solid var(--line);border-radius:5px;font-size:11px;color:#64748b;box-sizing:border-box">' +
        (tool.sensitivity_reason ? '<p style="margin:4px 0 0;font-size:10px;color:#dc2626">⚠️ ' + text(tool.sensitivity_reason) + '</p>' : '') +
      '</div>';
    }).join('');

    return '<article class="panel" style="margin-bottom:14px">' +
      '<div class="panel-head"><div><span class="eyebrow">候选业务能力</span><h3>' + text(candidate.name || '-') + '</h3></div>' + statusBadge + '</div>' +
      '<div id="toolEditList_' + escapeJs(candidate.id) + '" style="padding:14px;display:grid;gap:8px' + (toolConfirmed ? ';opacity:0.6;pointer-events:none' : '') + '">' +
        '<p style="font-size:12px;font-weight:650;color:#64748b;margin:0">' + (toolConfirmed ? '已确认的 Tool 列表' : '编辑 Tool：勾选保留、修改名称、切换公开/内部，或取消勾选删除') + '</p>' +
        toolRowsHtml +
      '</div>' +
      (!toolConfirmed ?
        '<div style="padding:0 14px 10px"><button type="button" class="ghost-btn small" onclick="addNewToolRow(\'' + escapeJs(candidate.id) + '\')">+ 添加新 Tool</button></div>' +
        '<div style="padding:0 14px 10px"><label style="font-size:12px;color:#64748b;font-weight:650;display:block;margin-bottom:4px">确认理由</label>' +
          '<input id="toolReason_' + escapeJs(candidate.id) + '" value="' + escapeHtml(candidate.tool_confirmation_reason || '人工确认：AI 建议与业务边界一致') + '" placeholder="填写确认理由" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:6px;font-size:13px;box-sizing:border-box"></div>' +
        '<div class="row-actions" style="padding:0 14px 14px"><button type="button" class="primary-btn small" onclick="confirmCandidateTool(\'' + escapeJs(candidate.id) + '\')">确认 Tool 边界</button></div>'
      : '<div class="row-actions" style="padding:0 14px 14px"><button type="button" class="ghost-btn small" onclick="jumpToPage(\'tool-draft\')">去生成 Tool 草稿 →</button></div>') +
    '</article>';
  }).join('');
}

window.addNewToolRow = function(candidateId) {
  const container = $('toolEditList_' + candidateId);
  if (!container) return;
  const idx = 'new_' + Date.now();
  const div = document.createElement('div');
  div.style.cssText = 'padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px';
  div.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
      '<input type="checkbox" class="tool-keep-check" data-idx="' + idx + '" checked style="cursor:pointer">' +
      '<span class="badge success" style="font-size:10px">新增</span>' +
      '<input class="tool-name-input" data-idx="' + idx + '" value="" placeholder="新 Tool 名称（如 create_order）" style="flex:1;min-width:140px;padding:5px 8px;border:1px solid var(--line);border-radius:5px;font-size:12px">' +
      '<select class="tool-vis-select" data-idx="' + idx + '" style="padding:5px 8px;border:1px solid var(--line);border-radius:5px;font-size:12px">' +
        '<option value="internal" selected>🔒 内部</option>' +
        '<option value="public">🌐 公开</option>' +
      '</select>' +
    '</div>' +
    '<input class="tool-desc-input" data-idx="' + idx + '" value="" placeholder="Tool 描述" style="width:100%;padding:5px 8px;border:1px solid var(--line);border-radius:5px;font-size:11px;color:#64748b;box-sizing:border-box">';
  container.appendChild(div);
};

window.confirmCandidateScreen = async function(candidateId) {
  try {
    await window.controlFlowRequest('/api/platform/governance/candidates/' + candidateId + '/manual-screen', {
      method: 'POST',
      body: JSON.stringify({ action: 'approve', reason: '人工确认候选业务能力可进入 Tool 边界审核' })
    });
    await window.refreshData();
    showToast('候选业务能力已确认，下一步请确认 Tool 边界。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.candidateScreenDecision = async function(candidateId, action) {
  const reasonInput = $('screenReason_' + candidateId);
  const reason = reasonInput?.value?.trim() || (
    action === 'approve' ? '人工确认候选可信' :
    action === 'reject' ? 'AI 识别有误，标记为误识别' :
    'AI 识别有偏差，需要修改后重新审核'
  );
  const body = { action, reason };

  // modify 模式：收集编辑过的字段
  if (action === 'modify') {
    const modified_fields = [];
    const fields = ['name', 'business_domain', 'business_action', 'operation_type', 'permission_scope', 'grouping_reason'];
    for (const field of fields) {
      const input = $('editField_' + candidateId + '_' + field);
      if (input && input.value.trim()) {
        modified_fields.push({ field, value: input.value.trim() });
      }
    }
    body.modified_fields = modified_fields;
  }

  try {
    await window.controlFlowRequest('/api/platform/governance/candidates/' + candidateId + '/manual-screen', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    await window.refreshData();
    if (action === 'approve') {
      showToast('候选已通过初筛，请前往「人工确认 Tool 边界」。', 'success');
    } else if (action === 'reject') {
      showToast('候选已标记为误识别。', 'warning');
    } else {
      showToast('候选已修改并标记为重审。修改后的字段已保存。', 'success');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.confirmCandidateTool = async function(candidateId) {
  const candidate = list(state.candidates).find(item => item.id === candidateId);
  const reason = $('toolReason_' + candidateId)?.value?.trim();
  if (!reason) {
    showToast('请填写确认理由。', 'warning');
    return;
  }

  // 从 DOM 读取编辑后的 Tool 列表
  const container = $('toolEditList_' + candidateId);
  const humanTools = [];
  if (container) {
    container.querySelectorAll('.tool-keep-check').forEach(check => {
      if (!check.checked) return; // 未勾选 = 删除
      const idx = check.dataset.idx;
      const nameInput = container.querySelector('.tool-name-input[data-idx="' + idx + '"]');
      const visSelect = container.querySelector('.tool-vis-select[data-idx="' + idx + '"]');
      const descInput = container.querySelector('.tool-desc-input[data-idx="' + idx + '"]');
      const name = nameInput?.value?.trim();
      if (!name) return;
      const aiTools = jsonList(candidate?.ai_tools_snapshot);
      const original = aiTools[parseInt(idx)] || {};
      humanTools.push({
        name,
        display_name: name,
        description: descInput?.value?.trim() || original.description || '人工确认的 Tool',
        visibility: visSelect?.value || 'internal',
        inputSchema: original.inputSchema || { type: 'object', properties: {}, required: [] }
      });
    });
  }

  if (!humanTools.length) {
    showToast('请至少保留一个 Tool。', 'warning');
    return;
  }
  if (!reason) {
    showToast('请填写 Tool 边界确认理由。', 'warning');
    return;
  }
  try {
    await window.controlFlowRequest('/api/platform/governance/candidates/' + candidateId + '/confirm-tool', {
      method: 'POST',
      body: JSON.stringify({ human_tools: humanTools, reason })
    });
    await window.refreshData();
    showToast('Tool 边界已确认，可以组装 MCP 草稿。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.createCandidateToolDraft = async function(candidateId) {
  try {
    await window.controlFlowRequest('/api/platform/governance/candidates/' + candidateId + '/create-tool-draft', {
      method: 'POST'
    });
    await window.refreshData();
    showToast('Tool 草稿已生成，请人工确认 MCP 由哪些 Tool 组成。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.confirmCandidateMcpComposition = async function(candidateId) {
  const reason = window.prompt('请填写 MCP 组成确认理由，例如：订单查询场景只组合只读 Tool。', '按业务场景、权限范围和读写风险确认 MCP 组成');
  if (!reason) return;
  const candidate = list(state.candidates).find(item => item.id === candidateId);
  try {
    await window.controlFlowRequest('/api/platform/governance/candidates/' + candidateId + '/confirm-mcp-composition', {
      method: 'POST',
      body: JSON.stringify({ tool_draft_ids: [candidate?.tool_draft_id], reason })
    });
    await window.refreshData();
    showToast('MCP 组成已确认，现在可以生成 MCP 草稿。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.confirmMcpCompositionFromUI = async function(candidateId) {
  const reasonInput = $('mcpReason_' + candidateId);
  const reason = reasonInput?.value?.trim() || '人工确认 MCP 组成';
  const candidate = list(state.candidates).find(item => item.id === candidateId);
  // 读取勾选的 Tool
  const checks = document.querySelectorAll('.mcp-tool-check-' + candidateId.replace(/[^a-zA-Z0-9_-]/g, ''));
  const selectedIndices = [];
  checks.forEach(check => { if (check.checked) selectedIndices.push(parseInt(check.dataset.idx)); });
  if (!selectedIndices.length) {
    showToast('请至少选择一个 Tool。', 'warning');
    return;
  }
  try {
    await window.controlFlowRequest('/api/platform/governance/candidates/' + candidateId + '/confirm-mcp-composition', {
      method: 'POST',
      body: JSON.stringify({ tool_draft_ids: [candidate?.tool_draft_id], reason })
    });
    await window.refreshData();
    showToast('MCP 组成已确认，现在可以组装 MCP 草稿。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.assembleCandidateMcpFromUI = async function(candidateId) {
  const nameInput = $('mcpName_' + candidateId);
  const candidate = list(state.candidates).find(item => item.id === candidateId);
  const name = nameInput?.value?.trim() || (candidate?.name || '业务能力') + ' MCP';
  try {
    await window.controlFlowRequest('/api/platform/governance/candidates/' + candidateId + '/assemble-mcp', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    await window.refreshData();
    showToast('MCP 草稿已生成，请进入测试发布。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.assembleCandidateMcp = async function(candidateId) {
  const candidate = list(state.candidates).find(item => item.id === candidateId);
  if (candidate?.tool_boundary_status === 'confirmed' && candidate?.tool_draft_status !== 'draft') {
    return window.createCandidateToolDraft(candidateId);
  }
  if (candidate?.mcp_composition_status !== 'confirmed') {
    return window.confirmCandidateMcpComposition(candidateId);
  }
  const name = window.prompt('请输入 MCP 草稿名称：', (candidate?.name || '业务能力') + ' MCP 草稿');
  if (!name) return;
  try {
    await window.controlFlowRequest('/api/platform/governance/candidates/' + candidateId + '/assemble-mcp', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    await window.refreshData();
    showToast('MCP 草稿已生成，请进入发布前人工验收。', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
};
// ============================================================
// 3. 候选业务能力 — AI 从资料中提取的业务能力候选（只读展示）
// ============================================================
function renderCandidatesPage() {
  const stepBar = $('candidatesStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(3);
  const root = $('candidatesBoard');
  if (!root) return;
  const candidates = list(state.candidates);
  if (!candidates.length) {
    root.innerHTML = '<article class="panel"><strong>暂无候选业务能力</strong><p class="muted-line">请先在「资料接入」页面上传业务资料并触发 AI 识别。</p>' +
      '<div class="row-actions" style="margin-top:10px"><button type="button" class="ghost-btn small" onclick="jumpToPage(\'intake\')">去资料接入 →</button></div></article>';
    return;
  }
  root.innerHTML = candidates.map(candidate => {
    const aiTools = jsonList(candidate.ai_tools_snapshot);
    const hits = jsonList(candidate.sensitive_hits);
    const screenDecided = candidate.manual_screen_decision && candidate.manual_screen_decision !== 'pending';
    let statusBadge;
    if (candidate.mcp_draft_status === 'draft') {
      statusBadge = '<span class="badge success">已生成 MCP 草稿</span>';
    } else if (candidate.tool_boundary_status === 'confirmed') {
      statusBadge = '<span class="badge success">Tool 边界已确认</span>';
    } else if (screenDecided && candidate.manual_screen_decision === 'approve') {
      statusBadge = '<span class="badge warning">已通过初筛</span>';
    } else if (screenDecided && candidate.manual_screen_decision === 'reject') {
      statusBadge = '<span class="badge danger">已拒绝</span>';
    } else if (screenDecided && candidate.manual_screen_decision === 'modify') {
      statusBadge = '<span class="badge warning">修改后重审</span>';
    } else {
      statusBadge = '<span class="badge info">待人工初筛</span>';
    }
    return '<article class="panel" style="margin-bottom:14px;cursor:pointer" onclick="enterCandidateReview(\'' + escapeJs(candidate.id) + '\')" onkeydown="if(event.key===\'Enter\')enterCandidateReview(\'' + escapeJs(candidate.id) + '\')" tabindex="0">' +
      '<div class="panel-head"><div><span class="eyebrow">候选业务能力</span><h3>' + text(candidate.name || '-') + '</h3></div>' + statusBadge + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:14px 16px">' +
        '<div><span style="font-size:11px;color:#94a3b8;font-weight:650">业务域</span><p style="margin:4px 0 0;font-size:13px">' + text(candidate.business_domain || '-') + '</p></div>' +
        '<div><span style="font-size:11px;color:#94a3b8;font-weight:650">接口数量</span><p style="margin:4px 0 0;font-size:13px">' + aiTools.length + ' 个</p></div>' +
        '<div><span style="font-size:11px;color:#94a3b8;font-weight:650">风险等级</span><p style="margin:4px 0 0;font-size:13px">' + text(candidate.risk_level || '-') + '</p></div>' +
      '</div>' +
      (hits.length ? '<div style="padding:0 16px 8px"><span style="font-size:11px;color:#f59e0b">⚠️ 敏感字段：' + text(hits.map(hit => typeof hit === 'string' ? hit : (hit.label || hit.field || '')).join('、')) + '</span></div>' : '') +
      '<div style="padding:0 16px 14px"><span style="font-size:12px;color:var(--primary)">点击查看接口详情并审核 →</span></div>' +
    '</article>';
  }).join('');
}

// ============================================================
// 6. 生成 Tool 草稿 — Tool 边界确认后生成草稿
// ============================================================
function renderToolDraftPage() {
  const stepBar = $('toolDraftStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(6);
  const root = $('toolDraftBoard');
  if (!root) return;
  const candidates = list(state.candidates);
  const ready = candidates.filter(c => c.tool_boundary_status === 'confirmed' && c.tool_draft_status !== 'draft');
  const done = candidates.filter(c => c.tool_draft_status === 'draft');
  if (!candidates.length) {
    root.innerHTML = '<article class="panel"><strong>暂无 Tool 草稿</strong><p class="muted-line">请先在「人工确认 Tool 边界」页面完成 Tool 边界确认，确认后将在此生成 Tool 草稿。</p>' +
      '<div class="row-actions" style="margin-top:10px"><button type="button" class="ghost-btn small" onclick="jumpToPage(\'tooling\')">去确认 Tool 边界 →</button></div></article>';
    return;
  }
  if (!ready.length && !done.length) {
    root.innerHTML = '<article class="panel"><strong>暂无待处理的 Tool 草稿</strong><p class="muted-line">请先在「人工确认 Tool 边界」页面完成 Tool 边界确认。</p>' +
      '<div class="row-actions" style="margin-top:10px"><button type="button" class="ghost-btn small" onclick="jumpToPage(\'tooling\')">去确认 Tool 边界 →</button></div></article>';
    return;
  }

  let html = '';

  // 汇总表格
  html += '<article class="panel" style="margin-bottom:14px"><div class="panel-head"><h3>Tool 草稿总览</h3><small class="muted-line">按业务能力分组，共 ' + (ready.length + done.length) + ' 个候选</small></div>';
  html += '<div class="table-wrap"><table><thead><tr><th>业务能力</th><th>Tool 名称</th><th>可见性</th><th>草稿状态</th><th>操作</th></tr></thead><tbody>';
  [...ready, ...done].forEach(candidate => {
    const isReady = candidate.tool_draft_status !== 'draft';
    const humanTools = jsonList(candidate.human_tools_snapshot);
    const toolCount = humanTools.length;
    const toolSummary = toolCount + ' 个 Tool';
    const visCounts = humanTools.filter(t => typeof t === 'object').reduce((acc, t) => {
      if (t.visibility === 'public') acc.public++; else acc.internal++;
      return acc;
    }, { public: 0, internal: 0 });
    const visText = (visCounts.public ? '🌐 公开 ' + visCounts.public : '') + (visCounts.internal ? (visCounts.public ? ' · ' : '') + '🔒 内部 ' + visCounts.internal : '') || '-';
    const statusBadge = isReady ? '<span class="badge warning">待生成</span>' : (candidate.mcp_composition_status === 'confirmed' ? '<span class="badge success">MCP 已确认</span>' : '<span class="badge success">草稿就绪</span>');
    const actionBtn = isReady
      ? '<button type="button" class="primary-btn tiny" onclick="createCandidateToolDraft(\'' + escapeJs(candidate.id) + '\')">生成</button>'
      : '<button type="button" class="ghost-btn tiny" onclick="jumpToPage(\'mcp-compose\')">去 MCP 组成 →</button>';
    html += '<tr><td><strong>' + text(candidate.name || '-') + '</strong></td><td>' + toolSummary + '</td><td style="white-space:normal">' + visText + '</td><td>' + statusBadge + '</td><td>' + actionBtn + '</td></tr>';
  });
  html += '</tbody></table></div></article>';

  // 按业务能力分组展示 Tool 详情
  html += '<article class="panel"><div class="panel-head"><h3>Tool 详情（按业务能力）</h3></div><div style="padding:14px">';
  [...ready, ...done].forEach(candidate => {
    const isReady = candidate.tool_draft_status !== 'draft';
    const humanTools = jsonList(candidate.human_tools_snapshot);
    html += '<div style="margin-bottom:16px;padding:14px;background:var(--surface-2);border-radius:8px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    html += '<div><strong style="font-size:14px">' + text(candidate.name || '-') + '</strong><span style="margin-left:8px;font-size:12px;color:#94a3b8">' + text(candidate.business_domain || '-') + '</span></div>';
    html += isReady ? '<span class="badge warning">待生成草稿</span>' : '<span class="badge success">草稿就绪</span>';
    html += '</div>';
    html += '<div style="display:grid;gap:6px">';
    humanTools.forEach(tool => {
      if (typeof tool !== 'object' || tool === null) return;
      const visChip = tool.visibility === 'public' ? '<span class="badge success" style="font-size:10px">公开</span>' : '<span class="badge warning" style="font-size:10px">内部</span>';
      const params = tool.inputSchema?.properties || {};
      const required = tool.inputSchema?.required || [];
      const paramList = Object.keys(params);
      html += '<div style="padding:10px;background:var(--surface);border:1px solid var(--line);border-radius:6px">';
      html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
      html += '<strong style="font-size:13px">' + text(tool.display_name || tool.name || '-') + '</strong>';
      html += '<code style="font-size:11px;color:var(--primary)">' + text(tool.name || '') + '</code>';
      html += visChip;
      html += '</div>';
      html += '<p style="margin:4px 0 0;font-size:12px;color:#64748b">' + text(tool.description || '') + '</p>';
      if (paramList.length) {
        html += '<div style="margin-top:4px;font-size:11px;color:#94a3b8">参数：' + paramList.map(p => '<code style="margin-right:6px">' + escapeHtml(p) + (required.includes(p) ? ' *' : '') + '</code>').join('') + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    if (!isReady) {
      html += '<div class="muted-line" style="margin-top:8px;font-size:12px">确认理由：' + text(candidate.tool_confirmation_reason || '-') + '</div>';
    }
    html += '<div class="row-actions" style="margin-top:10px">';
    if (isReady) {
      html += '<button type="button" class="primary-btn small" onclick="createCandidateToolDraft(\'' + escapeJs(candidate.id) + '\')">⚡ 生成 Tool 草稿</button>';
    } else {
      html += '<button type="button" class="ghost-btn small" onclick="jumpToPage(\'mcp-compose\')">去确认 MCP 组成 →</button>';
    }
    html += '</div>';
    html += '</div>';
  });
  html += '</div></article>';

  root.innerHTML = html;
}

// ============================================================
// 7. 人工确认 MCP 组成 — 选择 Tool 组合为 MCP
// ============================================================
function renderMcpComposePage() {
  const stepBar = $('mcpComposeStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(7);
  const root = $('mcpComposeBoard');
  if (!root) return;
  const candidates = list(state.candidates);
  // 显示所有已生成 Tool 草稿的候选，包括已组装 MCP 的
  const ready = candidates.filter(c => c.tool_draft_status === 'draft');
  if (!candidates.length) {
    root.innerHTML = '<article class="panel"><strong>暂无 MCP 组成候选</strong><p class="muted-line">请先生成 Tool 草稿，然后在此确认 MCP 由哪些 Tool 组成。</p>' +
      '<div class="row-actions" style="margin-top:10px"><button type="button" class="ghost-btn small" onclick="jumpToPage(\'tool-draft\')">去生成 Tool 草稿 →</button></div></article>';
    return;
  }
  if (!ready.length) {
    root.innerHTML = '<article class="panel"><strong>暂无 Tool 草稿</strong><p class="muted-line">请先在「生成 Tool 草稿」页面生成 Tool 草稿。</p>' +
      '<div class="row-actions" style="margin-top:10px"><button type="button" class="ghost-btn small" onclick="jumpToPage(\'tool-draft\')">去生成 Tool 草稿 →</button></div></article>';
    return;
  }
  root.innerHTML = ready.map(candidate => {
    const humanTools = jsonList(candidate.human_tools_snapshot);
    const compositionConfirmed = candidate.mcp_composition_status === 'confirmed';
    // Tool 选择列表（可勾选/取消）
    const toolCheckHtml = humanTools.map((tool, idx) => {
      if (typeof tool !== 'object') return '';
      const name = tool.name || tool.display_name || '-';
      const visChip = tool.visibility === 'public' ? '🌐' : '🔒';
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line)">' +
        '<input type="checkbox" class="mcp-tool-check-' + escapeJs(candidate.id) + '" data-idx="' + idx + '" checked style="cursor:pointer"' + (compositionConfirmed ? ' disabled' : '') + '>' +
        '<strong style="font-size:13px">' + text(name) + '</strong>' +
        '<code style="font-size:11px;color:var(--primary)">' + text(tool.name || '') + '</code>' +
        '<span style="font-size:11px">' + visChip + '</span>' +
        '<p style="margin:0;font-size:11px;color:#64748b;flex:1">' + text(tool.description || '') + '</p>' +
      '</div>';
    }).join('');

    if (!compositionConfirmed) {
      return '<article class="panel" style="margin-bottom:14px">' +
        '<div class="panel-head"><div><span class="eyebrow">MCP 组成确认</span><h3>' + text(candidate.name || '-') + '</h3></div><span class="badge warning">待确认组成</span></div>' +
        '<div style="padding:14px 16px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px">' +
          '<div><span style="font-size:11px;color:#94a3b8;font-weight:650">业务域</span><p style="margin:4px 0 0;font-size:13px">' + text(candidate.business_domain || '-') + '</p></div>' +
          '<div><span style="font-size:11px;color:#94a3b8;font-weight:650">权限范围</span><p style="margin:4px 0 0;font-size:13px">' + text(candidate.permission_scope || '-') + '</p></div>' +
        '</div>' +
        '<div style="padding:12px;background:var(--surface-2);border-radius:8px"><strong style="font-size:12px;color:#64748b">勾选要包含在 MCP 中的 Tool</strong>' + toolCheckHtml + '</div></div>' +
        '<div style="padding:0 16px 10px">' +
          '<label style="font-size:12px;color:#64748b;font-weight:650;display:block;margin-bottom:4px">MCP 名称</label>' +
          '<input id="mcpName_' + escapeJs(candidate.id) + '" value="' + escapeHtml((candidate.name || '') + ' MCP') + '" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:6px;font-size:13px;box-sizing:border-box;margin-bottom:10px">' +
          '<label style="font-size:12px;color:#64748b;font-weight:650;display:block;margin-bottom:4px">确认理由</label>' +
          '<input id="mcpReason_' + escapeJs(candidate.id) + '" placeholder="例如：按订单查询场景组合只读 Tool" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:6px;font-size:13px;box-sizing:border-box">' +
        '</div>' +
        '<div class="row-actions" style="padding:0 16px 16px"><button type="button" class="primary-btn small" onclick="confirmMcpCompositionFromUI(\'' + escapeJs(candidate.id) + '\')">确认 MCP 组成</button></div>' +
      '</article>';
    } else {
      return '<article class="panel" style="margin-bottom:14px">' +
        '<div class="panel-head"><div><span class="eyebrow">MCP 组成确认</span><h3>' + text(candidate.name || '-') + '</h3></div><span class="badge success">组成已确认</span></div>' +
        '<div style="padding:14px 16px">' +
          '<div style="padding:12px;background:var(--surface-2);border-radius:8px"><strong style="font-size:12px;color:#64748b">包含的 Tool</strong>' + toolCheckHtml + '</div>' +
          '<p class="muted-line" style="margin-top:10px">确认理由：' + text(candidate.mcp_composition_reason || '-') + '</p>' +
        '</div>' +
        '<div class="row-actions" style="padding:0 16px 16px"><button type="button" class="primary-btn small" onclick="assembleCandidateMcpFromUI(\'' + escapeJs(candidate.id) + '\')">📦 组装 MCP 草稿</button></div>' +
      '</article>';
    }
  }).join('');
}

function renderTooling() {
  renderToolingCandidates();
  const stepBar = $('toolingStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(5);
}

// ============================================================
// 8. MCP 资产 — 步骤 8：生成 MCP 草稿
// ============================================================
function renderAssets() {
  const stepBar = $('assetsStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(8);

  const assets = list(state.assets);
  const policies = list(state.policies);

  // 企业筛选器
  const filter = $('assetsCustomerFilter');
  if (filter) {
    const currentVal = filter.value;
    const customerIds = [...new Set(assets.map(a => a.customer_id).filter(Boolean))];
    filter.innerHTML = '<option value="">全部企业</option>' + customerIds.map(cid => {
      const cname = assets.find(a => a.customer_id === cid)?.customer_name || cid;
      return `<option value="${cid}">${escapeHtml(cname)}</option>`;
    }).join('');
    if (currentVal) filter.value = currentVal;
  }
  const selectedCustomer = filter?.value || '';
  const filteredAssets = selectedCustomer ? assets.filter(a => a.customer_id === selectedCustomer) : assets;

  renderSimpleRows('assetRows', filteredAssets.map(asset => {
    const tools = list(asset.tools);
    const aiTools = tools.filter(t => typeof t === 'object' && t !== null);
    const aiBadge = aiTools.length ? '<span class="badge info" style="font-size:10px;margin-left:4px">AI</span>' : '';
    const visBadge = asset.visibility === 'public'
      ? '<span class="badge success" style="font-size:10px">🌐 公开</span>'
      : '<span class="badge warning" style="font-size:10px">🔒 内部</span>';
    return `<tr><td><strong>${displayAssetName(asset.name)}</strong>${aiBadge}</td><td>${badge(asset.status || 'draft')}</td><td>${text(asset.version || '-')}</td><td>${text(asset.source_name || asset.source_id || '-')}</td><td>${text(asset.project_name || asset.project_id || '-')}</td><td>${visBadge}</td><td><span class="badge info">${tools.length}</span></td></tr>`;
  }), '暂无 MCP 资产', 7);

  // MCP 资产详情卡片
  const mcpList = $('assetsMcpList');
  if (mcpList) {
    if (!filteredAssets.length) {
      mcpList.innerHTML = emptyState('暂无 MCP 资产。请先完成候选初筛和 Tool 边界确认，然后组装 MCP 草稿。');
    } else {
      mcpList.innerHTML = filteredAssets.map(asset => {
        const tools = list(asset.tools);
        const runtime = list(state.pocRuntimes).find(item => item.asset_id === asset.id && ['starting', 'running'].includes(item.status));
        const isPublic = asset.visibility === 'public';
        const visBadge = isPublic ? '🌐 公开' : '🔒 内部';
        return `<div class="info-card" style="padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
            <div><strong style="font-size:14px">${displayAssetName(asset.name)}</strong><p class="muted-line" style="margin:4px 0 0;font-size:12px">${text(asset.capability || '-')}</p></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${badge(asset.status || 'draft')}<span class="badge ${isPublic ? 'success' : 'warning'}" style="font-size:9px">${visBadge}</span></div>
          </div>
          <div style="margin:8px 0;padding:10px;background:var(--surface-2);border-radius:8px">
            <p class="muted-line" style="margin:0 0 6px;font-size:11px;font-weight:650">MCP Tools（${tools.length}）</p>
            ${tools.length ? tools.map(tool => {
              if (typeof tool === 'object' && tool !== null) {
                const toolVis = tool.visibility === 'public' ? '🌐' : '🔒';
                const params = tool.inputSchema?.properties || {};
                const required = tool.inputSchema?.required || [];
                const paramList = Object.keys(params);
                return `<div style="padding:6px 0;border-top:1px solid var(--line)">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <strong style="font-size:13px">${text(tool.display_name || tool.name)}</strong>
                    <code style="font-size:11px;color:var(--primary)">${text(tool.name)}</code>
                    <span style="font-size:11px">${toolVis}</span>
                  </div>
                  <p style="margin:3px 0 0;font-size:12px;color:#64748b">${text(tool.description || '')}</p>
                  ${paramList.length ? `<div style="margin-top:4px;font-size:11px;color:#94a3b8">参数：${paramList.map(p => `<code style="margin-right:6px">${p}${required.includes(p) ? ' *' : ''}</code>`).join('')}</div>` : ''}
                </div>`;
              }
              return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span class="badge info">${text(typeof tool === 'string' ? tool : tool?.name || '-')}</span></div>`;
            }).join('') : '<span class="muted-line">暂无 Tool</span>'}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span class="muted-line" style="font-size:11px">v${text(asset.version || '0.1.0')}</span>
            ${runtime ? `<span class="badge success">POC 运行中</span><code style="font-size:10px">${text(runtime.endpoint || '')}</code><button type="button" class="ghost-btn small" onclick="stopPocRuntime('${runtime.id}')">停止 POC</button>` : asset.status === 'published' ? `<button type="button" class="primary-btn small" onclick="startPocRuntime('${asset.id}')">启动 POC</button>` : ''}
            <button type="button" class="ghost-btn small" onclick="jumpToPublish()">进入测试发布</button>
          </div>
        </div>`;
      }).join('');
    }
  }

  // 复用建议与复盘汇总
  renderReuseSuggestions();
  renderRetroSummaryBoard();
}

// 渲染复用建议：直接复用 / 复制后改造 / 建议新建
function renderReuseSuggestions() {
  const root = $('reuseSuggestionBoard');
  if (!root) return;
  const suggestions = list(state.reuseSuggestions);
  if (!suggestions.length) {
    root.innerHTML = '<p class="muted-line">暂无复用建议。发布资产后会自动生成复用推荐。</p>';
    return;
  }
  const categoryMap = {
    'direct_reuse': { label: '可直接复用', color: '#0f766e', icon: '✅' },
    'adapt_reuse': { label: '建议复制后改造', color: '#d97706', icon: '🔧' },
    'suggest_new': { label: '建议新建', color: '#dc2626', icon: '🆕' }
  };
  const grouped = {};
  suggestions.forEach(s => {
    const cat = s.reuse_category || 'suggest_new';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  });
  root.innerHTML = Object.entries(grouped).map(([cat, items]) => {
    const meta = categoryMap[cat] || categoryMap['suggest_new'];
    return `<div style="margin-bottom:12px">
      <h4 style="display:flex;align-items:center;gap:6px;margin:0 0 6px;color:${meta.color}">${meta.icon} ${meta.label} (${items.length})</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${items.slice(0, 8).map(s => `<div style="padding:8px 12px;border:1px solid var(--line);border-radius:8px;min-width:140px">
          <strong style="font-size:13px">${text(s.candidate_name || s.candidate_id || '-')}</strong>
          <div style="font-size:11px;color:#64748b;margin-top:4px">→ ${text(s.published_asset_name || s.published_asset_id || '-')}</div>
          ${typeof s.score === 'number' ? `<div style="font-size:11px;color:${meta.color}">相似度 ${s.score.toFixed(2)}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// 渲染误识别复盘汇总：高频误判分布 + 反哺提示
function renderRetroSummaryBoard() {
  const root = $('retroSummaryBoard');
  if (!root) return;
  const summary = state.retroSummary;
  const reasons = list(state.retroReasons);
  if (!summary || !summary.total_retros) {
    root.innerHTML = '<p class="muted-line">暂无复盘记录。当候选被驳回/修改时，可记录复盘标记 AI 哪里识别错了，反哺给下一轮识别。</p>';
    return;
  }
  const reasonMap = reasons.reduce((acc, r) => { acc[r.value] = r.label; return acc; }, {});
  const ranked = Object.entries(summary.by_reason || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  root.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px">
      <div class="metric-card"><span class="metric-label">累计复盘</span><strong>${summary.total_retros}</strong></div>
      <div class="metric-card"><span class="metric-label">最常见误判</span><strong>${text(reasonMap[summary.top_reason] || summary.top_reason || '-')}</strong></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${ranked.map(([reason, count]) => {
        const pct = summary.total_retros > 0 ? Math.round((count / summary.total_retros) * 100) : 0;
        const color = pct >= 50 ? '#dc2626' : pct >= 25 ? '#d97706' : '#0f766e';
        return `<div style="padding:8px 12px;border:1px solid var(--line);border-radius:8px;min-width:160px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:13px">${text(reasonMap[reason] || reason)}</strong>
            <span style="font-size:18px;font-weight:700;color:${color}">${count}</span>
          </div>
          <div style="height:4px;background:#e2e8f0;border-radius:2px;margin-top:6px;overflow:hidden">
            <div style="height:100%;background:${color};width:${pct}%"></div>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:4px">占比 ${pct}%</div>
        </div>`;
      }).join('')}
    </div>
    <p class="muted-line" style="margin-top:12px">这些高频误判会在下次 AI 识别时作为「历史高频误判提示」自动注入到识别请求中，提醒人工重点确认。</p>
  `;
}

// ============================================================
// 6. 测试发布 — 沙箱试调 + 版本发布 + 回滚
// ============================================================
function renderPublish() {
  const allReleases = adminReleases();
  const stepBar = $('publishStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(9);

  // 企业筛选器
  const filter = $('publishCustomerFilter');
  if (filter) {
    const currentVal = filter.value;
    const allAssets = list(state.assets);
    const customerIds = [...new Set(allAssets.map(a => a.customer_id).filter(Boolean))];
    filter.innerHTML = '<option value="">全部企业</option>' + customerIds.map(cid => {
      const cname = allAssets.find(a => a.customer_id === cid)?.customer_name || cid;
      return `<option value="${escapeHtml(cid)}">${escapeHtml(cname)}</option>`;
    }).join('');
    if (currentVal) filter.value = currentVal;
  }
  const selectedCustomer = filter?.value || '';
  const scopedAssets = selectedCustomer ? list(state.assets).filter(a => a.customer_id === selectedCustomer) : list(state.assets);

  // 动态填充沙箱调用的 tool dropdown，包含 AI 生成的资产
  const simSelect = $('simulateTool');
  if (simSelect) {
    const currentVal = simSelect.value;
    const aiAssets = scopedAssets.filter(a => {
      const tools = list(a.tools);
      return tools.some(t => typeof t === 'object');
    });
    let options = '<option value="work_order_lookup">工单查询（华智制造）</option><option value="quality_inspection">质检分析（华智制造）</option><option value="risk_alert">风险预警（鑫融金服）</option><option value="property_ticket_create">物业报修（安和物业）</option><option value="course_recommendation">课程推荐（知行教育）</option><option value="campus_qa">校园问答（知行教育）</option><option value="sales_top_products">销售 TopN（美佳零售）</option><option value="member_expiring_benefits">会员权益（美佳零售）</option>';
    aiAssets.forEach(asset => {
      const tools = list(asset.tools);
      tools.forEach(tool => {
        if (typeof tool === 'object') {
          const val = escapeHtml(tool.name || asset.name);
          const label = escapeHtml(`${tool.display_name || tool.name}（${asset.name}）`);
          options += `<option value="${val}">${label}</option>`;
        }
      });
    });
    simSelect.innerHTML = options;
    if (currentVal) simSelect.value = currentVal;
  }

  // 填充沙箱综合测试的资产选择 dropdown（按企业筛选）
  const sandboxSelect = $('sandboxAssetSelect');
  if (sandboxSelect) {
    const currentVal = sandboxSelect.value;
    let options = scopedAssets.map(asset => `<option value="${asset.id}">${displayAssetName(asset.name)}（${asset.project_name || asset.project_id}）</option>`).join('');
    sandboxSelect.innerHTML = options;
    if (currentVal && scopedAssets.find(a => a.id === currentVal)) sandboxSelect.value = currentVal;
  }

  // 按企业筛选 release
  const releases = selectedCustomer
    ? allReleases.filter(item => scopedAssets.some(a => a.id === item.asset_id))
    : allReleases;

  const controls = $('publishControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>按版本查看测试发布状态</span></div>';
  renderMetricSummary('publishSummary', [
    { label: '待验证资产', value: releases.filter(item => !item.tested_at).length, meta: '尚未完成验证' },
    { label: '待发布资产', value: releases.filter(item => item.status === 'tested' || item.status === 'ready_to_publish').length, meta: '已验证可交付' },
    { label: '已交付版本', value: releases.filter(item => item.status === 'published').length, meta: '当前对外版本' },
    { label: '版本总数', value: releases.length, meta: '全部发布记录' }
  ]);
  renderSimpleRows('releaseRows', releases.map(item => {
    const isPublished = item.status === 'published';
    const isTested = item.status === 'tested' || item.status === 'ready_to_publish';
    const isRolledBack = item.status === 'rolled_back';
    const actions = `
      <div class="row-actions" style="display:flex;gap:4px;flex-wrap:wrap">
        <button type="button" class="ghost-btn small" onclick="openPublishDrawer('${item.id}')">详情</button>
        ${isTested ? `<button type="button" class="primary-btn small" onclick="publishRelease('${item.id}')">发布</button>` : ''}
        ${isPublished ? `<button type="button" class="primary-btn small danger" onclick="rollbackRelease('${item.id}')">回滚</button>` : ''}
        ${!isTested && !isPublished && !isRolledBack ? `<button type="button" class="ghost-btn small" onclick="markReleaseTested('${item.id}')">标记通过</button>` : ''}
      </div>`;
    return `<tr><td>${text(item.asset_name || item.asset_id || '-')}</td><td>${text(item.version || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.environment || '-')}</td><td>${text(item.tested_at || '-')}</td><td>${text(item.released_at || '-')}</td><td>${text(item.notes || '-')}</td><td>${actions}</td></tr>`;
  }), '暂无发布记录', 8);
}

// ============================================================
// 7. 交付管理 — 配置包/测试报告/调用日志下载
// ============================================================

// 交付闭环必需的 5 类交付资料
const CLOSURE_TYPES = [
  { type: 'poc-evidence', label: 'POC 验收凭证', icon: '🔗' },
  { type: 'config', label: '配置包', icon: '📦' },
  { type: 'test-report', label: '测试报告', icon: '📄' },
  { type: 'log', label: '调用日志', icon: '📊' },
  { type: 'run-guide', label: '运行说明', icon: '📖' },
  { type: 'retro-conclusion', label: '复盘结论', icon: '🔁' }
];

function renderDeliveryClosureBoard() {
  const root = $('deliveryClosureBoard');
  if (!root) return;
  const deliverables = list(state.deliverables);
  // 按 project_id 分组
  const byProject = {};
  deliverables.forEach(d => {
    const pid = d.project_id || d.project_name || '未知项目';
    if (!byProject[pid]) byProject[pid] = { name: d.project_name || pid, items: {} };
    byProject[pid].items[d.type] = d.status || 'draft';
  });
  const projectNames = Object.keys(byProject);
  if (projectNames.length === 0) {
    root.innerHTML = '<p class="muted-line">暂无交付数据。发布资产后交付资料会自动归档。</p>';
    return;
  }
  root.innerHTML = projectNames.map(pid => {
    const p = byProject[pid];
    const completedCount = CLOSURE_TYPES.filter(ct => {
      const s = p.items[ct.type];
      return s === 'ready';
    }).length;
    const total = CLOSURE_TYPES.length;
    const pct = Math.round((completedCount / total) * 100);
    const isComplete = completedCount === total;
    const statusColor = isComplete ? '#0f766e' : pct >= 60 ? '#d97706' : '#dc2626';
    const statusLabel = isComplete ? '齐全' : pct >= 60 ? '部分齐全' : '缺项较多';
    const itemsHtml = CLOSURE_TYPES.map(ct => {
      const s = p.items[ct.type];
      const hasIt = !!s;
      const isReady = s === 'ready';
      const iconColor = isReady ? '#0f766e' : hasIt ? '#d97706' : '#94a3b8';
      const label = isReady ? '✅' : hasIt ? '⏳' : '❌';
      return `<div style="display:flex;align-items:center;gap:4px;min-width:90px">
        <span style="font-size:12px">${ct.icon}</span>
        <span style="font-size:12px;color:${iconColor};font-weight:600">${ct.label}</span>
        <span style="font-size:11px">${label}</span>
      </div>`;
    }).join('');
    return `<div class="metric-card" style="border-left:3px solid ${statusColor}">
      <span class="metric-label">${text(p.name)}</span>
      <strong style="color:${statusColor}">${completedCount}/${total} ${statusLabel}</strong>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${itemsHtml}</div>
      <div style="height:4px;background:#e2e8f0;border-radius:2px;margin-top:8px;overflow:hidden">
        <div style="height:100%;background:${statusColor};width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');
}

function renderDeliverables() {
  const stepBar = $('deliveryStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(10);
  renderDeliveryClosureBoard();

  // 企业筛选器
  const filter = $('deliveryCustomerFilter');
  if (filter) {
    const currentVal = filter.value;
    const deliverables = list(state.deliverables);
    const projects = list(state.projects);
    const customerIds = [...new Set(deliverables.map(d => {
      const proj = projects.find(p => p.id === d.project_id);
      return proj?.customer_id;
    }).filter(Boolean))];
    filter.innerHTML = '<option value="">全部企业</option>' + customerIds.map(cid => {
      const cname = projects.find(p => p.customer_id === cid)?.customer_name || cid;
      return `<option value="${escapeHtml(cid)}">${escapeHtml(cname)}</option>`;
    }).join('');
    if (currentVal) filter.value = currentVal;
  }
  const selectedCustomer = filter?.value || '';
  const allDeliverables = list(state.deliverables);
  const projects = list(state.projects);
  const deliverables = selectedCustomer
    ? allDeliverables.filter(d => {
        const proj = projects.find(p => p.id === d.project_id);
        return proj?.customer_id === selectedCustomer;
      })
    : allDeliverables;

  const controls = $('deliverableControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>交付资料按项目和类型归档</span></div>';
  renderMetricSummary('deliverableSummary', [
    { label: '交付资料总数', value: deliverables.length },
    { label: '可下载', value: deliverables.filter(item => item.status === 'ready').length },
    { label: '生成中', value: deliverables.filter(item => item.status === 'generating').length },
    { label: '待处理', value: deliverables.filter(item => ['failed', 'expired', 'revoked'].includes(item.status)).length }
  ]);
  renderSimpleRows('deliverableRows', deliverables.map(item => {
    const canDownload = item.status === 'ready';
    const typeLabel = {
      'config': '配置包',
      'test-report': '测试报告',
      'log': '调用日志',
      'effect-report': '效果报告',
      'run-guide': '运行说明',
      'retro-conclusion': '复盘结论',
      'knowledge-base': '知识库'
    }[item.type] || item.type || '-';
    const actions = `
      <div class="row-actions" style="display:flex;gap:4px;flex-wrap:wrap">
        <button type="button" class="ghost-btn small" onclick="openDeliverableDrawer('${item.id}')">详情</button>
        ${canDownload ? `<button type="button" class="primary-btn small" onclick="downloadDeliverable('${item.id}')">下载</button>` : '<span class="muted-line">整理中</span>'}
      </div>`;
    return `<tr><td><strong>${text(item.name || '-')}</strong></td><td>${text(item.project_name || item.project_id || '-')}</td><td><span class="cap-chip">${typeLabel}</span></td><td>${badge(item.status || 'draft')}</td><td>${text(item.updated_at || '-')}</td><td>${text(item.notes || '-')}</td><td>${actions}</td></tr>`;
  }), '暂旤交付物资料', 7);
}

// ============================================================
// 8. 治理与统计 — 网关策略 + 调用监控 + 审计日志
// ============================================================
function eventToolName(event) {
  return event?.tool_name || event?.tool || event?.method || event?.operation || event?.asset_name || '-';
}

function classifyCallEvent(event) {
  const raw = `${event?.status || ''} ${event?.error_code || ''} ${event?.status_code || ''} ${event?.response_summary || ''} ${event?.business_result || ''}`.toLowerCase();
  if (raw.includes('401')) return '401';
  if (raw.includes('403')) return '403';
  if (raw.includes('400') || raw.includes('校验') || raw.includes('validation')) return '400';
  if (raw.includes('timeout') || raw.includes('超时')) return 'timeout';
  if (raw.includes('5xx') || raw.includes('500') || raw.includes('502') || raw.includes('503')) return '5xx';
  return event?.status === 'success' ? 'success' : 'error';
}

function callTypeBadge(type) {
  const labels = { '401': '401 授权失败', '403': '403 权限不足', '400': '字段校验失败', timeout: '响应超时', '5xx': '上游服务异常', error: '调用异常', success: '成功' };
  const classes = { '401': 'danger', '403': 'danger', '400': 'warning', timeout: 'warning', '5xx': 'danger', error: 'danger', success: 'success' };
  return `<span class="badge ${classes[type] || 'info'}">${labels[type] || type}</span>`;
}

function maskCallText(value) {
  return String(value ?? '')
    .replace(/(api[_-]?key|secret|token|password|authorization|身份证号|账号)(\s*[:=]\s*)(["'][^"']*["']|[^,\s}]+)/gi, '$1$2***')
    .slice(0, 600);
}

function governanceFailureEvents() {
  return list(state.governanceDemoOverview?.acceptanceFailures).map(item => ({
    id: `governance_${item.trace_id}`,
    trace_id: item.trace_id,
    asset_id: item.mcp_id,
    asset_name: item.mcp_id,
    tool_name: item.check || '安全检测',
    caller: '发布前验收',
    status: 'failed',
    status_code: item.status_code,
    response_summary: `验收失败，HTTP ${item.status_code || '-'}`,
    created_at: new Date().toISOString()
  }));
}

function renderMonitoringPage() {
  if (isCustomerView()) return;
  const filters = state.monitoringFilters || { status: 'all', assetId: 'all', toolName: 'all', timeRange: '24h' };
  const events = [...list(state.events), ...governanceFailureEvents()].map(item => {
    let inputTokens = Number(item.input_tokens) || 0;
    let outputTokens = Number(item.output_tokens) || 0;
    if (!inputTokens && !outputTokens) {
      try { const result = JSON.parse(item.business_result || '{}'); inputTokens = Number(result.input_tokens) || 0; outputTokens = Number(result.output_tokens) || 0; } catch {}
    }
    return { ...item, _input: inputTokens, _output: outputTokens, _total: inputTokens + outputTokens, _type: classifyCallEvent(item), _tool: eventToolName(item) };
  });
  const cutoff = filters.timeRange === '7d' ? Date.now() - 7 * 86400000 : filters.timeRange === '24h' ? Date.now() - 86400000 : 0;
  const filtered = events.filter(item => {
    const created = new Date(item.created_at).getTime();
    const inRange = !created || !cutoff || created >= cutoff;
    return inRange && (filters.status === 'all' || item._type === filters.status) && (filters.assetId === 'all' || item.asset_id === filters.assetId) && (filters.toolName === 'all' || item._tool === filters.toolName);
  });
  const errors = filtered.filter(item => item._type !== 'success');
  const successes = filtered.filter(item => item._type === 'success');
  const avgLatency = filtered.length ? Math.round(filtered.reduce((sum, item) => sum + Number(item.latency_ms || 0), 0) / filtered.length) : 0;
  renderMetricSummary('monitoringSummary', [
    { label: '总调用量', value: filtered.length, meta: filters.timeRange === 'all' ? '全部记录' : '最近 ' + (filters.timeRange === '7d' ? '7 天' : '24 小时') },
    { label: '成功率', value: (filtered.length ? Math.round(successes.length / filtered.length * 100) : 0) + '%', meta: '按调用事件统计' },
    { label: '异常调用', value: errors.length, meta: errors.length ? '先处理第一条异常' : '当前没有异常' },
    { label: '平均耗时', value: avgLatency + ' ms', meta: avgLatency > 300 ? '偏慢，建议检查上游' : '当前正常' }
  ]);

  const filterNode = $('monitoringFilters');
  if (filterNode) {
    const assetOptions = [...new Map(list(state.assets).map(asset => [asset.id, asset])).values()].map(asset => `<option value="${escapeJs(asset.id)}" ${filters.assetId === asset.id ? 'selected' : ''}>${text(asset.name || asset.id || '-')}</option>`).join('');
    const toolOptions = [...new Set(events.map(item => item._tool).filter(Boolean))].map(tool => `<option value="${escapeJs(tool)}" ${filters.toolName === tool ? 'selected' : ''}>${text(tool)}</option>`).join('');
    filterNode.innerHTML = `<div class="filter-summary"><span>显示 ${filtered.length} 条调用，异常优先</span><div class="filter-row"><select onchange="setMonitoringFilter('status', this.value)"><option value="all">全部类型</option><option value="401" ${filters.status === '401' ? 'selected' : ''}>401 授权失败</option><option value="403" ${filters.status === '403' ? 'selected' : ''}>403 权限不足</option><option value="400" ${filters.status === '400' ? 'selected' : ''}>字段校验失败</option><option value="timeout" ${filters.status === 'timeout' ? 'selected' : ''}>响应超时</option><option value="5xx" ${filters.status === '5xx' ? 'selected' : ''}>上游异常</option><option value="success" ${filters.status === 'success' ? 'selected' : ''}>成功</option></select><select onchange="setMonitoringFilter('assetId', this.value)"><option value="all">全部 MCP</option>${assetOptions}</select><select onchange="setMonitoringFilter('toolName', this.value)"><option value="all">全部 Tool</option>${toolOptions}</select><select onchange="setMonitoringFilter('timeRange', this.value)"><option value="24h" ${filters.timeRange === '24h' ? 'selected' : ''}>最近 24 小时</option><option value="7d" ${filters.timeRange === '7d' ? 'selected' : ''}>最近 7 天</option><option value="all" ${filters.timeRange === 'all' ? 'selected' : ''}>全部记录</option></select></div></div>`;
  }

  const focus = state.monitoringFocusId ? events.find(item => (item.id || item.trace_id) === state.monitoringFocusId) : null;
  const focusBanner = $('monitoringFocusBanner');
  if (focusBanner) {
    focusBanner.classList.toggle('hidden', !focus);
    if (focus) focusBanner.innerHTML = `<div><strong>当前聚焦异常</strong><span>${text(focus._tool)} · ${callTypeBadge(focus._type)} · Trace ID ${text(focus.trace_id || '-')}</span></div><button type="button" class="ghost-btn small" onclick="openUsageDrawer('${escapeJs(focus.id || focus.trace_id)}')">打开诊断</button>`;
  }

  const rowHtml = item => `<tr data-event-id="${escapeJs(item.id || item.trace_id)}"><td>${text(item.created_at || '-')}</td><td>${text(item.customer_name || '-')}<div class="muted-line">${text(item.project_name || item.asset_name || item.asset_id || '-')}</div></td><td><code>${text(item._tool)}</code>${String(item.business_result || '').startsWith('poc_sse:') ? '<span class="badge success" style="margin-left:4px">真实 MCP</span>' : ''}</td><td>${text(item.caller || '-')}</td><td>${callTypeBadge(item._type)}</td><td>${badge(item.status || item._type)}</td><td>${text(item.latency_ms ?? '-')} ms</td><td><code>${text(item.trace_id || '-')}</code></td><td><div class="row-actions"><button type="button" class="ghost-btn small" onclick="openUsageDrawer('${escapeJs(item.id || item.trace_id)}')">诊断</button>${['401', '403'].includes(item._type) ? `<button type="button" class="ghost-btn small" onclick="navigateToPage('governance')">去授权</button>` : item._type === '400' ? `<button type="button" class="ghost-btn small" onclick="navigateToPage('tooling')">看 Tool</button>` : ''}</div></td></tr>`;
  renderSimpleRows('monitoringRows', errors.map(rowHtml), '暂无异常调用。可以先到“测试发布”执行一次沙箱测试。', 9);
  renderSimpleRows('monitoringSuccessRows', successes.slice(0, 5).map(item => `<tr data-event-id="${escapeJs(item.id || item.trace_id)}"><td>${text(item.created_at || '-')}</td><td>${text(item.customer_name || '-')}<div class="muted-line">${text(item.project_name || item.asset_name || '-')}</div></td><td><code>${text(item._tool)}</code></td><td>${text(item.response_summary || item.business_result || '-')}</td><td>${text(item.latency_ms ?? '-')} ms</td><td><code>${text(item.trace_id || '-')}</code></td><td><button type="button" class="ghost-btn small" onclick="openUsageDrawer('${escapeJs(item.id || item.trace_id)}')">详情</button></td></tr>`), '暂无成功调用记录。先完成一次沙箱测试后，这里会显示正常调用。', 7);
  if (state.monitoringFocusId && typeof document !== 'undefined') {
    const row = document.querySelector(`#monitoringRows tr[data-event-id="${escapeJs(state.monitoringFocusId)}"]`) || document.querySelector(`#monitoringSuccessRows tr[data-event-id="${escapeJs(state.monitoringFocusId)}"]`);
    row?.classList.add('focus-row');
    row?.scrollIntoView({ block: 'nearest' });
  }
}

function renderAccess() {
  const allAccess = list(state.access);
  const blocked = allAccess.filter(item => ['disabled', 'revoked', 'expired', 'error'].includes(item.status) || item.last_health_status === 'error');
  const banner = $('accessBlockBanner');
  if (banner) {
    banner.classList.toggle('hidden', blocked.length === 0);
    if (blocked.length > 0) {
      const names = blocked.slice(0, 3).map(item => `${text(item.customer_name || '-')} / ${text(item.name || '-')}`).join('、');
      banner.innerHTML = `<div><strong>P0 · ${blocked.length} 个接入项阻断</strong><span>优先处理：${names}${blocked.length > 3 ? ' 等' : ''}</span></div><div class="row-actions"><button type="button" class="ghost-btn small" onclick="navigateToPage('monitoring')">查看调用异常</button></div>`;
    }
  }
  renderMetricSummary('accessOverview', [
    { label: '已交付接入项', value: list(state.access).length, meta: '客户可用的接入条目' },
    { label: '正式环境', value: list(state.access).filter(item => item.environment === 'production').length, meta: '生产接入' },
    { label: '验证环境', value: list(state.access).filter(item => item.environment === 'sandbox').length, meta: '沙箱接入' },
    { label: '健康异常', value: list(state.access).filter(item => item.last_health_status === 'error').length, meta: '建议优先排查' }
  ]);

  renderSimpleRows('accessRows', list(state.access).map(item => `<tr><td>${text(item.customer_name || '-')} / ${text(item.project_name || '-')}</td><td>${text(item.name || '-')}</td><td>${text(item.type || '-')}</td><td>${text(item.endpoint || item.scope || '-')}</td><td>${text(item.environment || '-')}</td><td>${text(item.credential_expires_at || '-')}</td><td>${text(item.last_health_check_at || '-')}</td><td>${badge(item.status || 'draft')}</td><td><button type="button" class="ghost-btn small" onclick="editAccessConfig('${item.id}')">编辑</button></td></tr>`), '暂无客户接入项', 9);
  renderSimpleRows('accessHealthRows', list(state.accessHealth).map(item => `<tr><td>${text(item.last_health_check_at || '-')}</td><td>${text(item.name || item.id || '-')}</td><td>${text(item.last_health_status || '-')}</td><td>${text(item.last_health_detail?.latency_ms ?? '-')}</td><td>${text(item.last_health_detail?.status_code ?? '-')}</td><td>${text(item.last_health_detail?.auth_ok ?? '-')}</td><td>${text(item.last_health_detail?.trace_id || '-')}</td></tr>`), '暂无接入健康记录', 7);
  renderSimpleRows('accessAuditRows', list(state.accessAudit).map(item => `<tr><td>${text(item.changed_at || '-')}</td><td>${text(item.access_id || '-')}</td><td>${text(item.field || '-')}</td><td>${text(item.old_value || '-')}</td><td>${text(item.new_value || '-')}</td><td>${text(item.changed_by || '-')}</td></tr>`), '暂无接入变更记录', 6);
  renderSimpleRows('accessWebhookRows', list(state.accessWebhook).map(item => `<tr><td>${text(item.created_at || '-')}</td><td>${text(item.access_id || '-')}</td><td>${text(item.event_type || '-')}</td><td>${text(item.url || '-')}</td><td>${text(item.status || '-')}</td><td>${text(item.retry_count ?? '-')}</td><td>${text(item.status_code ?? '-')}</td><td>${text(item.error_message || '-')}</td></tr>`), '暂无回调记录', 8);

  const select = $('accessTestConfig');
  const button = $('accessTestBtn');
  if (select) {
    const current = select.value;
    select.innerHTML = `<option value="">- 请选择接入项 -</option>${list(state.access).map(item => `<option value="${item.id}" ${current === item.id ? 'selected' : ''}>${text(item.customer_name || '-') } / ${text(item.name || '-')}</option>`).join('')}`;
    const syncButton = () => {
      if (button) button.disabled = !select.value;
    };
    select.onchange = syncButton;
    syncButton();
  }
}

function renderGateway() {
  renderSimpleRows('policyRows', list(state.policies).map(item => `<tr><td>${text(item.name || '-')}</td><td>${text(item.project_name || item.project_id || '-')}</td><td>${text(item.auth_mode || '-')}</td><td>${text(item.rate_limit || '-')}</td><td>${text(item.masking_rules || '-')}</td><td><button type="button" class="ghost-btn small" onclick="editPolicy('${item.id}')">编辑</button></td><td>${badge(item.status || 'draft')}</td><td><button type="button" class="ghost-btn small" onclick="deletePolicy('${item.id}')">删除</button></td></tr>`), '暂无资产规则', 8);
}

function renderPolicyChanges() {
  renderSimpleRows('policyChangeRows', list(state.policyChanges).map(item => `<tr><td>${text(item.changed_at || '-')}</td><td>${text(item.policy_id || '-')}</td><td>${text(item.field || '-')}</td><td>${text(item.old_value || '-')}</td><td>${text(item.new_value || '-')}</td><td>${text(item.changed_by || '-')}</td></tr>`), '暂无规则变更记录', 6);
}

function renderUsage() {
  const controls = $('usageControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>每次调用均记录 Trace ID、Token 用量、请求参数与响应摘要，支持全链路追踪</span></div>';

  // 使用数据库新字段 input_tokens / output_tokens（兼容旧数据从 business_result 解析）
  const eventsWithTokens = list(state.events).map(item => {
    let inputTokens = Number(item.input_tokens) || 0;
    let outputTokens = Number(item.output_tokens) || 0;
    // 兼容旧数据
    if (!inputTokens && !outputTokens) {
      try { const br = JSON.parse(item.business_result || '{}'); inputTokens = br.input_tokens || 0; outputTokens = br.output_tokens || 0; } catch {}
    }
    return { ...item, _input: inputTokens, _output: outputTokens, _total: inputTokens + outputTokens };
  });

  const totalInput = eventsWithTokens.reduce((s, e) => s + e._input, 0);
  const totalOutput = eventsWithTokens.reduce((s, e) => s + e._output, 0);
  const avgLatency = eventsWithTokens.length ? Math.round(eventsWithTokens.reduce((s,e) => s + (e.latency_ms||0), 0) / eventsWithTokens.length) : 0;
  const errorCount = eventsWithTokens.filter(item => item.status !== 'success').length;

  renderMetricSummary('usageSummary', [
    { label: '总调用量', value: eventsWithTokens.length, meta: '全部 MCP 调用事件' },
    { label: '成功调用', value: eventsWithTokens.length - errorCount, meta: `成功率 ${eventsWithTokens.length ? Math.round((eventsWithTokens.length - errorCount) / eventsWithTokens.length * 100) : 0}%` },
    { label: 'Token 总用量', value: totalInput + totalOutput, meta: `输入 ${totalInput} · 输出 ${totalOutput}` },
    { label: '平均耗时', value: avgLatency, meta: 'ms · ' + (avgLatency > 300 ? '偏慢' : '正常') }
  ]);
  renderSimpleRows('eventRows', eventsWithTokens.map(item =>
    `<tr>
      <td style="white-space:nowrap;font-size:12px">${text(item.created_at || '-')}</td>
      <td>${text(item.customer_name || '-')}/${text(item.project_name || '-')}</td>
      <td><strong>${text(item.asset_name || item.asset_id || '-')}</strong></td>
      <td>${text(item.caller || '-')}</td>
      <td title="${escapeJs(item.response_summary || item.business_result || '')}" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${text((item.response_summary || item.business_result || '-').slice(0,40))}</td>
      <td>${badge(item.status || 'draft')}</td>
      <td><span style="color:${item.latency_ms > 300 ? '#dc2626' : '#16a34a'}">${item.latency_ms ?? '-'}ms</span></td>
      <td><code style="font-size:11px;background:#f0f9ff;padding:2px 6px;border-radius:4px;color:#0369a1;cursor:pointer" onclick="navigator.clipboard.writeText('${item.trace_id||''}');showToast('Trace ID 已复制','success')" title="点击复制">${text(item.trace_id || '-')}</code></td>
      <td><span style="font-size:11px"><b style="color:#2563eb">${item._total}</b><span style="color:#94a3b8"> tok</span><br><span style="color:#94a3b8;font-size:10px">in:${item._input} out:${item._output}</span></span></td>
      <td><button type="button" class="ghost-btn small" onclick="openUsageDrawer('${item.id || item.trace_id || ''}')">详情</button></td>
    </tr>`), '暂无调用记录。在「测试发布」页执行沙箱试调后数据将在此展示。', 10);
}

// ============================================================
// 9. 设置 — 知识库 + 计费
// ============================================================
// ============================================================
// 9a. API Key 管理（设置页）
// ============================================================
function renderApiKeys() {
  const keys = list(state.access);
  // 统计
  const enabledCount = keys.filter(k => k.status === 'enabled').length;
  const prodCount = keys.filter(k => k.environment === 'production' && k.status === 'enabled').length;
  const expiringSoon = keys.filter(k => {
    if (!k.expires_at) return false;
    return new Date(k.expires_at) < new Date(Date.now() + 30 * 86400000);
  }).length;

  const summaryHtml = `
    <div class="api-key-stat"><span>总凭证数</span><strong class="is-primary">${keys.length}</strong></div>
    <div class="api-key-stat"><span>已启用</span><strong class="is-success">${enabledCount}</strong></div>
    <div class="api-key-stat"><span>生产环境</span><strong class="is-warning">${prodCount}</strong></div>
    <div class="api-key-stat"><span>30 天内过期</span><strong class="${expiringSoon > 0 ? 'is-danger' : 'is-muted'}">${expiringSoon}</strong></div>`;
  const summaryNode = $('apiKeySummary');
  if (summaryNode) summaryNode.innerHTML = summaryHtml;

  const rows = keys.map(key => {
    const keyDisplay = key.api_key_preview || (key.api_key || '').slice(0, 8) + '***';
    const envBadge = key.environment === 'production'
      ? '<span class="badge" style="background:#fef3c7;color:#92400e">生产</span>'
      : '<span class="badge info">沙箱</span>';
    const statusBadge = key.status === 'enabled'
      ? '<span class="badge success">启用</span>'
      : key.status === 'revoked' ? '<span class="badge danger">已撤销</span>' : '<span class="badge">停用</span>';
    const scopeText = key.scope || key.description || '全部资产';
    const expiresAt = key.expires_at ? new Date(key.expires_at).toLocaleDateString('zh-CN') : '永不过期';
    const isExpiring = key.expires_at && new Date(key.expires_at) < new Date(Date.now() + 30 * 86400000);

    return `<tr>
      <td><strong>${text(key.name || '-')}</strong></td>
      <td>${text(key.customer_name || '-')}</td>
      <td><code style="font-size:11px;background:#f1f5f9;padding:2px 6px;border-radius:3px">${text(keyDisplay)}</code></td>
      <td>${text(key.auth_type || 'api_key')}</td>
      <td>${envBadge}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeJs(scopeText)}">${text(scopeText)}</td>
      <td>${statusBadge}</td>
      <td style="color:${isExpiring ? '#dc2626' : ''}">${expiresAt}${isExpiring ? ' ⚠️' : ''}</td>
      <td>
        <button type="button" class="ghost-btn small" onclick="copyApiKey('${key.id}')">复制</button>
        ${key.status === 'enabled' ? `<button type="button" class="ghost-btn small" onclick="revokeApiKey('${key.id}')">撤销</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  const node = $('apiKeyRows');
  if (node) node.innerHTML = rows || `<tr><td colspan="9">${emptyState('暂无 API 凭证。点击「创建 API Key」为接入方生成凭证。')}</td></tr>`;
}

window.copyApiKey = function copyApiKey(id) {
  const key = list(state.access).find(k => k.id === id);
  if (!key?.api_key) { showToast('该凭证无可复制的密钥。', 'warning'); return; }
  navigator.clipboard.writeText(key.api_key).then(() => showToast('API Key 已复制到剪贴板。', 'success')).catch(() => showToast('复制失败，请手动复制。', 'error'));
};

window.revokeApiKey = function revokeApiKey(id) {
  confirmDialog('确认撤销此 API Key？撤销后所有使用此 Key 的调用将立即失效。', () => {
    setAccessOverride(id, { status: 'revoked', changed_by: state.user?.display_name });
    showToast('API Key 已撤销。', 'success');
    renderAll();
  });
};

function renderKnowledge() {
  const controls = $('knowledgeControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>知识资料沉淀为知识型 MCP 与交付摘要</span></div>';
  renderMetricSummary('knowledgeSummary', [
    { label: '知识资料总数', value: list(state.knowledgeBases).length },
    { label: '关联 OpenAPI', value: list(state.openapiSpecs).length },
    { label: '关联 MCP 资产', value: list(state.assets).length },
    { label: '可导出资料', value: list(state.deliverables).filter(item => item.type === 'knowledge-base').length }
  ]);
  renderSimpleRows('knowledgeRows', list(state.knowledgeBases).map(item => `<tr><td>${text(item.customer_name || '-')} / ${text(item.project_name || '-')}</td><td>${text(item.name || item.title || '-')}</td><td>${text(item.asset_name || '-')}</td><td>${text(item.source_status || item.status || '-')}</td><td>${text(item.indexed_at || item.updated_at || '-')}</td><td>${text(item.chunk_count ?? '-')}</td><td>${text(item.updated_at || '-')}</td><td><button type="button" class="ghost-btn small" onclick="openKnowledgeDrawer('${item.id}')">查看</button></td></tr>`), '暂无知识资料', 8);
}

function renderBilling() {
  const records = adminBilling();
  const controls = $('billingControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>结算资料按客户、项目和账期汇总</span></div>';
  renderMetricSummary('billingSummary', [
    { label: '结算资料总数', value: records.length },
    { label: '确认账单', value: records.filter(item => item.status === 'confirmed').length },
    { label: '待处理账单', value: records.filter(item => item.status !== 'confirmed').length },
    { label: '账单金额', value: money(records.reduce((sum, item) => sum + Number(item.amount || 0), 0)), meta: '当前可见汇总' }
  ]);
  renderSimpleRows('billingRows', records.map(item => `<tr><td>${text(item.customer_name || item.customer_id || '-')}</td><td>${text(item.project_name || item.project_id || '-')}</td><td>${text(item.item || '-')}</td><td>${text(item.period || '-')}</td><td>${money(item.amount || 0)}</td><td>${text(item.usage_count || item.calls || '-')}</td><td>${text(item.billing_type || '-')}</td><td>${badge(item.status || 'pending')}</td><td><button type="button" class="ghost-btn small" onclick="openBillingDrawer('${item.id}')">查看</button></td></tr>`), '暂无结算资料', 9);
}

// ============================================================
// Drawer 渲染函数
// ============================================================
function renderDrawer(drawerId, backdropId, titleId, contentId, open, title, body) {
  const drawer = $(drawerId);
  const backdrop = $(backdropId);
  const titleNode = $(titleId);
  const content = $(contentId);
  if (!drawer || !backdrop || !titleNode || !content) return;
  drawer.classList.toggle('hidden', !open);
  drawer.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  backdrop.classList.toggle('hidden', !open);
  backdrop.classList.toggle('open', open);
  titleNode.textContent = title || '详情';
  content.innerHTML = open ? body : '';
}

function renderProjectDrawer() {
  const id = state.selectedProjectId;
  const detail = state.projectDetails?.[id] || {};
  const project = detail.project || list(state.projects).find(item => item.id === id) || null;
  renderDrawer('projectDrawer', 'projectDrawerBackdrop', 'projectDrawerTitle', 'projectDrawerContent', Boolean(state.projectDrawerOpen && id), project?.name || '项目详情', `<div class="drawer-panel"><h4>项目概况</h4><p>${text(project?.customer_name || project?.customer_id || '-')} \u00b7 ${text(project?.stage || '-')}</p><p>${text(project?.description || '暂无项目说明')}</p></div><div class="drawer-panel"><h4>当前进度</h4><p>负责人：${text(project?.owner || '-')}</p><p>截止时间：${text(project?.due_date || '-')}</p><p>业务资料：${list(detail.sources).length || list(state.sources).filter(item => item.project_id === id).length} 份</p></div>`);
}

function renderPublishDrawer() {
  const release = adminReleases().find(item => item.id === state.selectedReleaseId);
  const isPublished = release?.status === 'published';
  const isTested = release?.status === 'tested' || release?.status === 'ready_to_publish';
  const body = `<div class="drawer-panel"><h4>版本信息</h4><p>${text(release?.version || '-')} \u00b7 ${text(displayStatus(release?.status || 'draft'))}</p><p>环境：${text(release?.environment || '-')}</p><p>验证时间：${text(release?.tested_at || '-')}</p><p>发布时间：${text(release?.released_at || '-')}</p></div>
    <div class="drawer-panel"><h4>操作</h4><div style="display:flex;gap:8px;flex-wrap:wrap">
      ${isTested ? `<button type="button" class="primary-btn small" onclick="publishRelease('${release?.id}')">执行发布</button>` : ''}
      ${isPublished ? `<button type="button" class="primary-btn small danger" onclick="rollbackRelease('${release?.id}')">执行回滚</button>` : ''}
      ${!isTested && !isPublished ? `<button type="button" class="ghost-btn small" onclick="markReleaseTested('${release?.id}')">标记测试通过</button>` : ''}
      <button type="button" class="ghost-btn small" onclick="exportReleaseReport('${release?.id}')">导出报告</button>
    </div></div>`;
  renderDrawer('publishDrawer', 'publishDrawerBackdrop', 'publishDrawerTitle', 'publishDrawerContent', Boolean(state.publishDrawerOpen && release), release?.asset_name || '发布详情', body);
}

function renderUsageDrawer() {
  const event = list(state.events).find(item => (item.id || item.trace_id) === state.selectedUsageEventId);
  let inputTok = Number(event?.input_tokens) || 0;
  let outputTok = Number(event?.output_tokens) || 0;
  if (!inputTok && !outputTok) {
    try { const br = JSON.parse(event?.business_result || '{}'); inputTok = br.input_tokens || 0; outputTok = br.output_tokens || 0; } catch {}
  }
  let reqParams = event?.request_params || '';
  try { reqParams = JSON.stringify(JSON.parse(reqParams), null, 2); } catch {}
  const respSummary = event?.response_summary || event?.business_result || '-';
  const body = `<div class="drawer-panel">
    <h4>调用概况</h4>
    <p><strong>Trace ID</strong>：<code style="font-size:12px;background:#f0f9ff;padding:2px 8px;border-radius:4px;color:#0369a1">${text(event?.trace_id || '-')}</code></p>
    <p>调用方：${text(event?.caller || '-')}</p>
    <p>状态：${badge(event?.status || 'draft')}</p>
    <p>业务结果：${text(event?.business_result || '-')}</p>
    <p>耗时：<span style="color:${(event?.latency_ms||0) > 300 ? '#dc2626' : '#16a34a'}">${text(event?.latency_ms ?? '-')} ms</span></p>
  </div>
  <div class="drawer-panel">
    <h4>Token 用量</h4>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      <div class="info-card" style="padding:10px;text-align:center"><p style="font-size:11px;color:#64748b;margin:0">输入</p><p style="font-size:20px;font-weight:700;color:#2563eb;margin:2px 0 0">${inputTok}</p></div>
      <div class="info-card" style="padding:10px;text-align:center"><p style="font-size:11px;color:#64748b;margin:0">输出</p><p style="font-size:20px;font-weight:700;color:#16a34a;margin:2px 0 0">${outputTok}</p></div>
      <div class="info-card" style="padding:10px;text-align:center"><p style="font-size:11px;color:#64748b;margin:0">总计</p><p style="font-size:20px;font-weight:700;color:#7c3aed;margin:2px 0 0">${inputTok + outputTok}</p></div>
    </div>
  </div>
  ${reqParams ? `<div class="drawer-panel"><h4>请求参数</h4><pre style="background:#1e293b;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;max-height:200px">${escapeHtml(reqParams)}</pre></div>` : ''}
  <div class="drawer-panel"><h4>响应摘要</h4><div style="background:#f8fafc;padding:10px;border-radius:8px;font-size:12px;max-height:150px;overflow-y:auto"><code>${escapeHtml(respSummary)}</code></div></div>
  <div class="drawer-panel"><h4>操作</h4><div style="display:flex;gap:8px"><button type="button" class="ghost-btn small" onclick="exportUsageEvent('${(event?.id || event?.trace_id || '')}')">导出调用报告</button></div></div>`;
  renderDrawer('usageDrawer', 'usageDrawerBackdrop', 'usageDrawerTitle', 'usageDrawerContent', Boolean(state.usageDrawerOpen && event), event?.asset_name || '调用详情', body);
}

function renderBillingDrawer() {
  const record = adminBilling().find(item => item.id === state.selectedBillingId);
  renderDrawer('billingDrawer', 'billingDrawerBackdrop', 'billingDrawerTitle', 'billingDrawerContent', Boolean(state.billingDrawerOpen && record), record?.item || '账单详情', `<div class="drawer-panel"><h4>账单摘要</h4><p>客户：${text(record?.customer_name || '-')}</p><p>账期：${text(record?.period || '-')}</p><p>金额：${money(record?.amount || 0)}</p><p>状态：${text(displayStatus(record?.status || 'pending'))}</p><p>备注：${text(record?.note || record?.notes || '暂无备注')}</p></div><div class="drawer-panel"><h4>操作</h4><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ghost-btn small" onclick="openBillingAdjustmentModal('${record?.id}')">调整</button><button type="button" class="ghost-btn small" onclick="exportBillingStatement('${record?.id}')">导出</button></div></div>`);
}

function renderDeliverableDrawer() {
  const item = list(state.deliverables).find(entry => entry.id === state.selectedDeliverableId);
  const canDownload = item?.status === 'ready';
  const body = `<div class="drawer-panel"><h4>交付摘要</h4><p>类型：${text(item?.type || '-')}</p><p>状态：${text(displayStatus(item?.status || 'draft'))}</p><p>最近更新：${text(item?.updated_at || '-')}</p><p>说明：${text(item?.notes || '暂无补充说明')}</p></div>
    <div class="drawer-panel"><h4>操作</h4><div style="display:flex;gap:8px;flex-wrap:wrap">
      ${canDownload ? `<button type="button" class="primary-btn small" onclick="downloadDeliverable('${item?.id}')">下载文件</button>` : '<span class="muted-line">当前状态不可下载</span>'}
      <button type="button" class="ghost-btn small" onclick="copyDeliverableSummary('${item?.id}')">复制摘要</button>
    </div></div>`;
  renderDrawer('deliverableDrawer', 'deliverableDrawerBackdrop', 'deliverableDrawerTitle', 'deliverableDrawerContent', Boolean(state.deliverableDrawerOpen && item), item?.name || '交付物详情', body);
}

function renderKnowledgeDrawer() {
  const detail = state.knowledgeDetails?.[state.selectedKnowledgeId] || list(state.knowledgeBases).find(item => item.id === state.selectedKnowledgeId);
  renderDrawer('knowledgeDrawer', 'knowledgeDrawerBackdrop', 'knowledgeDrawerTitle', 'knowledgeDrawerContent', Boolean(state.knowledgeDrawerOpen && detail), detail?.name || detail?.title || '知识资料详情', `<div class="drawer-panel"><h4>资料概况</h4><p>项目：${text(detail?.project_name || '-')}</p><p>关联资产：${text(detail?.asset_name || '-')}</p><p>状态：${text(detail?.source_status || detail?.status || '-')}</p><p>切片数量：${text(detail?.chunk_count ?? '-')}</p></div>`);
}

// ============================================================
// 客户侧渲染
// ============================================================
function persistBuilderRequests() {
  try { localStorage.setItem('mcp_builder_requests', JSON.stringify(list(state.builderRequests))); } catch {}
}

function persistCustomerBuilderHistory() {
  try { localStorage.setItem('mcp_customer_builder_history', JSON.stringify(list(state.customerBuilderHistory))); } catch {}
}

function sortCustomerBuilderHistory(items) {
  return list(items).slice().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

const customerBuilderSuggestions = [
  '我想做一个售后客服 MCP，包含订单查询、退款判断和工单创建。',
  '我想做一个会员营销 MCP，需要权益提醒和触达策略。',
  '我想把物流催单、售后工单和会员提醒整合到一个 MCP 里。'
];

function dedupeTools(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

function buildCustomerBuilderResult(prompt, options = {}) {
  const prompts = list(options.conversationPrompts).length ? list(options.conversationPrompts) : [prompt];
  const combined = prompts.join(' ');
  const tools = [];
  const adjustments = [];
  const confirmations = [];
  const references = [];

  if (/订单|order/i.test(combined)) tools.push({ name: '订单查询', mode: '保留', note: '连接订单状态与售后上下文。' });
  if (/工单|ticket/i.test(combined)) tools.push({ name: '工单创建', mode: '保留', note: '将复杂售后问题流转到人工或系统工单。' });
  if (/退款|refund/i.test(combined)) {
    tools.push({ name: '退款判断', mode: '新增', note: '按照售后规则辅助判断退款条件。' });
    confirmations.push('请先确认退款规则是否按商品类目、时间和客户等级区分。');
  }
  if (/物流|催单/i.test(combined)) tools.push({ name: '物流催单', mode: '新增', note: '结合运单信息与异常节点进行主动提醒。' });
  if (/会员|权益/i.test(combined)) {
    tools.push({ name: '权益到期提醒', mode: '新增', note: '结合会员标签、权益有效期与触达规则。' });
    confirmations.push('请确认会员权益数据来源和触达频次限制。');
  }

  const finalTools = dedupeTools(tools);
  if (!finalTools.length) {
    finalTools.push({ name: '需求理解与路由', mode: '新增', note: '先将自然语言需求拆解成可编排能力。' });
    confirmations.push('请补充最先要执行的业务节点和成功标准。');
  }

  if (finalTools.some(item => ['订单查询', '工单创建', '退款判断', '物流催单'].includes(item.name))) {
    references.push({ id: 'asset_after_sales', name: '售后客服能力包', note: '可直接复用售后场景中的查询、工单与逻辑编排能力。' });
    adjustments.push('已优先保留售后对话中的订单、工单与退款类能力。');
  }
  if (finalTools.some(item => item.name === '权益到期提醒')) {
    references.push({ id: 'asset_member_marketing', name: '会员营销能力包', note: '可参考标签、触达与权益提醒规则。' });
    adjustments.push('已将新增的会员权益提醒合并进现有 MCP 编排结构。');
  }
  if (!adjustments.length) adjustments.push('当前先以目标场景拆解为 Tool 能力集合，后续可再细化边界。');

  const nameParts = [];
  if (/售后|订单|退款|工单|物流/.test(combined)) nameParts.push('售后客服');
  if (/会员|权益/.test(combined)) nameParts.push('会员营销');
  if (!nameParts.length) nameParts.push('定制业务');
  const name = nameParts.length > 1 ? `${nameParts[0]} MCP / ${nameParts.slice(1).join(' + ')}` : `${nameParts[0]} MCP`; 
  const scenario = nameParts.length > 1
    ? '适用于售后与会员运营联动的客服场景。'
    : nameParts[0] === '售后客服'
      ? '适用于订单查询、售后工单、退款判断等对话场景。'
      : nameParts[0] === '会员营销'
        ? '适用于会员权益提醒与营销触达场景。'
        : '适用于将自然语言需求转成可编排 MCP 草案。';

  return {
    name,
    scenario,
    status: confirmations.length ? '待确认' : '可生成',
    summary: `基于 ${prompts.length} 轮需求对话，AI 已完成能力拆解、Tool 匹配与结构重组。`,
    tools: finalTools,
    adjustments,
    confirmations,
    references,
    reply: prompts.length > 1
      ? `已基于上一版继续补充，当前会保留 ${finalTools.map(item => item.name).join('、')} 这些核心能力。`
      : `已先生成 ${name} 草案，可继续补充更细的业务约束。`,
    rounds: prompts.length,
    prompt
  };
}

function ensureCustomerBuilderState() {
  if (!list(state.customerBuilderMessages).length) {
    state.customerBuilderMessages = [{
      role: 'assistant',
      text: '请直接用自然语言描述你想要的 MCP 业务目标，我会帮你拆解能力、匹配 Tool 并重组成目标 MCP 草案。'
    }];
  }
  if (!state.customerBuilderDraft) state.customerBuilderDraft = customerBuilderSuggestions[0];
  if (!state.customerBuilderResult) state.customerBuilderResult = buildCustomerBuilderResult(state.customerBuilderDraft);
  if (!state.customerBuilderDetailTab) state.customerBuilderDetailTab = 'tools';
  if (typeof state.customerBuilderHistoryOpen !== 'boolean') state.customerBuilderHistoryOpen = false;
}

function upsertCustomerBuilderHistory(status = 'draft') {
  ensureCustomerBuilderState();
  const messages = list(state.customerBuilderMessages);
  const userMessages = messages.filter(item => item.role === 'user');
  if (!userMessages.length) return null;

  const result = state.customerBuilderResult || buildCustomerBuilderResult(state.customerBuilderDraft, {
    conversationPrompts: userMessages.map(item => item.text)
  });
  const sessionId = state.customerBuilderCurrentSessionId || `builder_session_${Date.now()}`;
  const entry = {
    id: sessionId,
    title: result.name,
    prompt: userMessages[0]?.text || state.customerBuilderDraft || '',
    latest_prompt: userMessages[userMessages.length - 1]?.text || state.customerBuilderDraft || '',
    result,
    messages,
    rounds: userMessages.length,
    status,
    updated_at: new Date().toISOString()
  };

  state.customerBuilderCurrentSessionId = sessionId;
  state.customerBuilderHistory = sortCustomerBuilderHistory([
    entry,
    ...list(state.customerBuilderHistory).filter(item => item.id !== sessionId)
  ]);
  state.customerBuilderSelectedHistoryId = sessionId;
  persistCustomerBuilderHistory();
  return entry;
}

function renderCustomerBuilder() {
  ensureCustomerBuilderState();

  const messageNode = $('customerBuilderMessages');
  if (messageNode) {
    messageNode.innerHTML = list(state.customerBuilderMessages).map(item => `
      <div class="customer-builder-message ${item.role === 'user' ? 'user' : 'assistant'}">
        <span class="customer-builder-role">${item.role === 'user' ? '你' : 'AI'}</span>
        <div class="customer-builder-bubble">${text(item.text)}</div>
      </div>
    `).join('');
    messageNode.scrollTop = messageNode.scrollHeight;
  }

  const historyEntries = sortCustomerBuilderHistory(state.customerBuilderHistory);
  const selectedHistoryId = state.customerBuilderSelectedHistoryId || '';
  const activeHistoryEntry = historyEntries.find(entry => entry.id === selectedHistoryId) || null;
  if (!activeHistoryEntry && state.customerBuilderSelectedHistoryId) state.customerBuilderSelectedHistoryId = null;

  const liveResult = state.customerBuilderResult || buildCustomerBuilderResult(state.customerBuilderDraft);
  const result = activeHistoryEntry?.result || liveResult;
  const toolCount = list(result.tools).length;
  const referenceCount = list(result.references).length;
  const confirmationCount = list(result.confirmations).length;
  const inlineConfirmations = confirmationCount > 0 && confirmationCount <= 2 ? list(result.confirmations) : [];
  const detailTabs = [
    { id: 'tools', label: `Tool 组成 (${toolCount})` },
    { id: 'rationale', label: `调整与复用依据 (${list(result.adjustments).length + referenceCount})` },
    ...(confirmationCount > 2 ? [{ id: 'confirmations', label: `待确认项 (${confirmationCount})` }] : [])
  ];

  if (!detailTabs.some(item => item.id === state.customerBuilderDetailTab)) state.customerBuilderDetailTab = detailTabs[0]?.id || 'tools';

  renderMetricSummary('customerBuilderSummary', [
    { label: '已识别意图', value: result.scenario ? 1 : 0, meta: '当前需求已拆成 1 个目标业务场景' },
    { label: '建议 Tool 数', value: toolCount, meta: '右侧已生成可编排 Tool 草案' },
    { label: '待确认项', value: confirmationCount, meta: '生成前建议先确认关键边界' },
    { label: '复用参考', value: referenceCount, meta: '优先参考现有资产与历史能力' }
  ]);

  const historyToggleNode = $('customerBuilderHistoryToggle');
  if (historyToggleNode) {
    const historyLabel = historyEntries.length ? `对话历史 (${historyEntries.length})` : '对话历史';
    historyToggleNode.textContent = historyLabel;
    historyToggleNode.classList.toggle('active', !!state.customerBuilderHistoryOpen);
  }

  const historyPopoverNode = $('customerBuilderHistoryPopover');
  if (historyPopoverNode) historyPopoverNode.classList.toggle('hidden', !state.customerBuilderHistoryOpen);

  const historyNode = $('customerBuilderHistory');
  if (historyNode) {
    historyNode.innerHTML = historyEntries.length ? historyEntries.map(entry => `
      <div class="customer-builder-history-item ${selectedHistoryId === entry.id ? 'active' : ''}" onclick="previewCustomerBuilderHistory('${escapeJs(entry.id)}')">
        <div class="customer-builder-history-top"><strong>${text(entry.title || '历史会话')}</strong>${selectedHistoryId === entry.id ? '<span class="badge info">当前查看</span>' : `<span class="badge">${text(displayStatus(entry.status || 'draft'))}</span>`}</div>
        <p>${text(entry.prompt || '-')}</p>
        <small>${text(`共 ${entry.rounds || 1} 轮对话 · ${displayStatus(entry.status || 'draft')}`)}</small>
      </div>`).join('') : '<div class="muted-line">这里只展示已保存或已提交的整段会话，当前聊天中的每一句补充不会单独记入历史。</div>';
  }

  const suggestionNode = $('customerBuilderSuggestionChips');
  if (suggestionNode) suggestionNode.innerHTML = customerBuilderSuggestions.map(prompt => `<button type="button" class="customer-builder-chip" onclick="applyBuilderPrompt('${escapeJs(prompt)}', true)">${text(prompt)}</button>`).join('');

  const input = $('customerBuilderInput');
  if (input) input.value = state.customerBuilderDraft || '';

  const summaryNode = $('customerBuilderResultSummary');
  if (summaryNode) {
    summaryNode.innerHTML = `
      <div class="customer-builder-overview-card">
        <div class="customer-builder-overview-top">
          <div class="customer-builder-overview-title">
            <span class="cap-chip">目标 MCP</span>
            <h4>${text(result.name)}</h4>
            <p>${text(result.scenario)}</p>
          </div>
          <span class="badge warning">${text(result.status)}</span>
        </div>
        <p class="customer-builder-overview-summary">${text(result.summary)}</p>
        <div class="customer-builder-overview-kpis">
          <div class="customer-builder-overview-kpi"><span>Tool 组成</span><strong>${toolCount}</strong><small>已拆解出的核心能力</small></div>
          <div class="customer-builder-overview-kpi"><span>复用能力</span><strong>${referenceCount}</strong><small>可直接参考的现有资产</small></div>
          <div class="customer-builder-overview-kpi"><span>待确认</span><strong>${confirmationCount}</strong><small>需要先确认的业务边界</small></div>
        </div>
        <div class="customer-builder-overview-notes">
          <div class="customer-builder-overview-note"><span>${activeHistoryEntry ? '历史会话' : '当前会话'}</span><strong>${text(activeHistoryEntry ? (activeHistoryEntry.rounds || 1) : list(state.customerBuilderMessages).filter(item => item.role === 'user').length || 1)}</strong></div>
          <div class="customer-builder-overview-note"><span>${activeHistoryEntry ? '当前查看' : '当前需求'}</span><p>${text(activeHistoryEntry?.latest_prompt || result.prompt || state.customerBuilderDraft || '-')}</p></div>
        </div>
      </div>`;
  }

  const inlineConfirmationNode = $('customerBuilderInlineConfirmations');
  if (inlineConfirmationNode) {
    inlineConfirmationNode.innerHTML = inlineConfirmations.length ? `
      <div class="customer-builder-inline-alert">
        <strong>提交前建议先确认</strong>
        <div class="customer-builder-inline-list">${inlineConfirmations.map(item => `<div class="customer-builder-inline-item">${text(item)}</div>`).join('')}</div>
      </div>` : '';
  }

  const tabsNode = $('customerBuilderDetailTabs');
  if (tabsNode) tabsNode.innerHTML = detailTabs.map(item => `<button type="button" class="customer-builder-detail-tab ${state.customerBuilderDetailTab === item.id ? 'active' : ''}" onclick="switchCustomerBuilderDetailTab('${item.id}')">${text(item.label)}</button>`).join('');

  const detailBodyNode = $('customerBuilderDetailBody');
  if (detailBodyNode) {
    if (state.customerBuilderDetailTab === 'tools') {
      detailBodyNode.innerHTML = toolCount ? `
        <div class="customer-builder-tool-list">${list(result.tools).map(tool => `
          <div class="customer-builder-tool-row">
            <div class="customer-builder-tool-row-top">
              <h4>${text(tool.name)}</h4>
              <span class="customer-builder-mode ${tool.mode === '新增' ? 'is-new' : tool.mode === '调整' ? 'is-adjust' : 'is-keep'}">${text(tool.mode)}</span>
            </div>
            <p>${text(tool.note)}</p>
          </div>`).join('')}
        </div>` : emptyState('暂无 Tool 草案');
    } else if (state.customerBuilderDetailTab === 'rationale') {
      detailBodyNode.innerHTML = `
        <div class="customer-builder-detail-group">
          <div class="customer-builder-detail-heading">调整依据</div>
          <div class="customer-builder-detail-list">${list(result.adjustments).map(item => `<div class="customer-builder-detail-item">${text(item)}</div>`).join('') || emptyState('暂无调整说明')}</div>
        </div>
        <div class="customer-builder-detail-group">
          <div class="customer-builder-detail-heading">复用参考</div>
          <div class="customer-builder-reference-list">${list(result.references).length ? list(result.references).map(item => `
            <div class="customer-builder-reference-row">
              <div class="customer-builder-reference-top">
                <h4>${text(item.name)}</h4>
                <span class="badge info">复用参考</span>
              </div>
              <p>${text(item.note || '-')}</p>
              <small>ID: ${text(item.id || '-')}</small>
            </div>`).join('') : emptyState('暂无可复用资产')}</div>
        </div>`;
    } else {
      detailBodyNode.innerHTML = list(result.confirmations).length ? `
        <div class="customer-builder-confirmation-list">${list(result.confirmations).map(item => `<div class="customer-builder-confirmation-item">${text(item)}</div>`).join('')}</div>` : emptyState('暂无待确认项');
    }
  }
}

function renderCustomerOverview() {
  const overview = state.customerOverview || {};
  const assets = list(overview.assets);
  const actions = list(overview.action_items);
  const releases = list(overview.release_updates);
  const sourceItems = list(state.deliverables).length ? list(state.deliverables) : list(overview.recent_deliverables);
  const items = [...sourceItems].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const readyItems = items.filter(item => item.status === 'ready');
  const latestRelease = releases[0] || null;
  const projectNames = [...new Set(items.map(item => item.project_name || item.project_id).filter(Boolean))];
  const deliveryTitle = projectNames.length === 1 ? projectNames[0] : projectNames.length ? `${projectNames.length} 个交付项目` : '当前客户项目';
  const readyConfig = readyItems.filter(item => item.type === 'config').length;
  const readyTests = readyItems.filter(item => ['test-report', 'poc-evidence'].includes(item.type)).length;
  const publishedAssets = assets.filter(item => item.status === 'published').length;
  const needsAcceptance = readyTests > 0 && publishedAssets > 0;
  const hero = $('customerDeliveryHero');

  if (hero) {
    hero.innerHTML = `
      <div class="customer-delivery-hero-copy">
        <p class="eyebrow">本次交付 · ${text(deliveryTitle)}</p>
        <h3>${readyItems.length ? `${readyItems.length} 项资料已就绪，可进入验收` : '正在准备本次交付资料'}</h3>
        <p class="muted-line">${latestRelease ? `${text(latestRelease.asset_name || 'MCP 服务')} ${text(latestRelease.version || '')} 已同步至交付记录。` : '交付资料、版本发布与接入支持会持续汇总在此。'}</p>
      </div>
      <div class="customer-delivery-hero-actions">
        ${readyItems.length ? `<button type="button" class="primary-btn" onclick="downloadReadyDeliverables()">下载全部就绪资料</button>` : '<span class="badge warning">资料整理中</span>'}
        <button type="button" class="ghost-btn" onclick="openCustomerPage('my-deliverables')">查看交付与支持</button>
      </div>`;
  }

  renderMetricSummary('customerDeliverySummary', [
    { label: '已交付', value: readyItems.length, meta: '当前可下载的交付资料' },
    { label: '待确认', value: needsAcceptance ? 1 : 0, meta: needsAcceptance ? '请核验联调与上线结果' : '暂无待确认验收项' },
    { label: '当前版本', value: latestRelease?.version || '-', meta: latestRelease?.asset_name || '暂无发布版本' },
    { label: '最近更新', value: items[0]?.updated_at || latestRelease?.released_at || '-', meta: '交付资料或版本的最新留痕' }
  ]);

  const deliveryStages = [
    { label: '配置交付', detail: readyConfig ? `${readyConfig} 份配置资料已就绪` : '等待配置包生成', complete: readyConfig > 0 },
    { label: '联调验证', detail: readyTests ? `${readyTests} 份测试或验收材料已就绪` : '等待联调验证材料', complete: readyTests > 0 },
    { label: '正式发布', detail: publishedAssets ? `${publishedAssets} 个 MCP 服务已发布` : '等待正式发布', complete: publishedAssets > 0 },
    { label: '客户验收', detail: needsAcceptance ? '请核验交付材料并反馈验收结果' : '完成前置交付后进入验收', complete: false, active: needsAcceptance }
  ];
  const progress = $('customerDeliveryProgress');
  if (progress) {
    progress.innerHTML = deliveryStages.map((stage, index) => `
      <div class="customer-delivery-stage ${stage.complete ? 'is-complete' : ''} ${stage.active ? 'is-active' : ''}">
        <span class="customer-delivery-stage-index">${stage.complete ? '✓' : index + 1}</span>
        <div><strong>${stage.label}</strong><p>${stage.detail}</p></div>
      </div>`).join('');
  }

  const customerActions = [
    ...actions.map(item => {
      const isDeliverable = item.type === 'deliverable';
      const button = isDeliverable
        ? `<button type="button" class="ghost-btn small" onclick="downloadDeliverable('${escapeJs(item.target_id || '')}')">下载资料</button>`
        : `<button type="button" class="ghost-btn small" onclick="openCustomerAsset('${escapeJs(item.target_id || '')}')">查看接入说明</button>`;
      return `<div class="info-card customer-delivery-action"><div><h4>${text(item.title || '待处理事项')}</h4><p>${text(item.priority === 'high' ? '建议优先处理，避免影响上线或使用。' : '可按项目节奏完成。')}</p></div>${button}</div>`;
    }),
    ...(needsAcceptance ? [`<div class="info-card customer-delivery-action"><div><h4>核验联调与验收材料</h4><p>请查阅测试报告和运行说明，完成内部核验后反馈交付负责人。</p></div><button type="button" class="ghost-btn small" onclick="openCustomerPage('my-deliverables')">查看材料</button></div>`] : [])
  ];
  renderCardList('customerDeliveryActions', customerActions, '当前没有待处理事项，交付资料会持续在此更新。');

  const groupedPackages = new Map();
  items.forEach(item => {
    const key = item.project_id || item.project_name || 'unassigned';
    if (!groupedPackages.has(key)) groupedPackages.set(key, { name: item.project_name || item.project_id || '未归属项目', id: item.project_id || '', items: [] });
    groupedPackages.get(key).items.push(item);
  });
  const assetByProject = new Map(assets.map(item => [item.project_id, item]));
  const typeLabels = { config: '配置包', 'test-report': '联调验收报告', 'run-guide': '运行说明', log: '调用日志', 'poc-evidence': 'POC 验收凭证', 'knowledge-base': '知识库导出' };
  const packageNode = $('customerDeliveryPackages');
  if (packageNode) {
    packageNode.innerHTML = groupedPackages.size ? [...groupedPackages.values()].map(group => {
      const projectAsset = assetByProject.get(group.id);
      const readyCount = group.items.filter(item => item.status === 'ready').length;
      return `<article class="customer-delivery-package">
        <div class="customer-delivery-package-head">
          <div><h4>${text(group.name)}</h4><p>${readyCount}/${group.items.length} 项资料可下载${projectAsset?.version ? ` · 当前版本 ${text(projectAsset.version)}` : ''}</p></div>
          <div class="customer-action-row">
            ${projectAsset ? `<button type="button" class="ghost-btn small" onclick="openCustomerAsset('${escapeJs(projectAsset.id)}')">查看服务</button><button type="button" class="ghost-btn small" onclick="viewAccessGuide('${escapeJs(projectAsset.id)}')">接入配置</button>` : ''}
          </div>
        </div>
        <div class="customer-delivery-file-list">${group.items.map(item => `<div class="customer-delivery-file">
          <div><strong>${text(typeLabels[item.type] || item.type || '交付资料')}</strong><span>${text(item.name || '-')} · ${text(item.updated_at || '-')}</span></div>
          <div class="customer-action-row">${badge(item.status || 'draft')}${item.status === 'ready' ? `<button type="button" class="primary-btn small" onclick="downloadDeliverable('${escapeJs(item.id)}')">下载</button>` : '<span class="muted-line">整理中</span>'}</div>
        </div>`).join('')}</div>
      </article>`;
    }).join('') : '<div class="customer-delivery-empty">当前暂无可展示的交付资料，请等待交付负责人完成归档。</div>';
  }

  const timelineItems = [
    ...releases.map(item => ({ date: item.released_at || item.tested_at || '', title: `${item.asset_name || 'MCP 服务'} ${item.version || ''} 已发布`, detail: item.notes || '已完成版本发布', kind: '版本发布' })),
    ...items.slice(0, 8).map(item => ({ date: item.updated_at || '', title: item.name || '交付资料已更新', detail: `${typeLabels[item.type] || item.type || '交付资料'} · ${displayStatus(item.status || 'draft')}`, kind: '交付资料' }))
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  const timeline = $('customerDeliveryTimeline');
  if (timeline) timeline.innerHTML = timelineItems.length ? timelineItems.map(item => `<div class="customer-delivery-timeline-item"><span class="customer-delivery-timeline-dot"></span><div><p class="eyebrow">${text(item.kind)} · ${text(item.date || '-')}</p><strong>${text(item.title)}</strong><p>${text(item.detail)}</p></div></div>`).join('') : '<div class="customer-delivery-empty">暂无版本发布或交付资料更新记录。</div>';
}
function renderCustomerAssetOverlay() {
  const overlay = $('customerAssetOverlay');
  const title = $('customerAssetDetailTitle');
  const content = $('customerAssetDetailContent');
  const detail = state.customerAssetDetail;
  if (!overlay || !title || !content) return;
  if (!detail?.asset) {
    overlay.style.display = 'none';
    content.innerHTML = '';
    return;
  }
  const asset = detail.asset;
  const tools = list(asset.tools).map(tool => typeof tool === 'string' ? tool : tool?.display_name || tool?.name || '-');
  const releases = list(detail.releases);
  const events = list(detail.recent_events);
  const inputTokens = Number(asset.input_tokens || 0);
  const outputTokens = Number(asset.output_tokens || 0);
  const totalTokens = Number(asset.total_tokens ?? inputTokens + outputTokens);
  const isMemberAsset = String(asset.id || '').includes('member');
  const isOrderAsset = String(asset.id || '').includes('order');
  const trial = state.customerTrialResult?.assetId === asset.id ? state.customerTrialResult : null;
  const eventRows = events.map(item => {
    let input = Number(item.input_tokens || 0);
    let output = Number(item.output_tokens || 0);
    if (!input && !output) {
      try { const result = JSON.parse(item.business_result || '{}'); input = Number(result.input_tokens || 0); output = Number(result.output_tokens || 0); } catch {}
    }
    return `<tr><td>${text(item.created_at || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.latency_ms ?? '-')} ms</td><td>${input.toLocaleString('zh-CN')} / ${output.toLocaleString('zh-CN')} / <strong>${(input + output).toLocaleString('zh-CN')}</strong></td><td>${text(item.business_result || '-')}</td><td><code>${text(item.trace_id || '-')}</code></td></tr>`;
  });
  title.textContent = `${displayAssetName(asset.name)} 服务详情`;
  overlay.style.display = 'grid';
  content.innerHTML = `
    <div class="customer-detail-grid">
      <section class="info-card"><h4>服务能力</h4><p>${text(asset.capability || '-')}</p><p class="muted-line">版本 ${text(asset.version || '-')} · ${text(displayStatus(asset.status || 'published'))}</p></section>
      <section class="info-card"><h4>接入信息</h4><p>环境：${text(detail.access?.environment || '-')}</p><p>鉴权：${text(detail.access?.type || '-')}</p><p>范围：${text(detail.access?.scope || '-')}</p><p class="muted-line">${text(detail.access?.description || '暂无接入说明')}</p></section>
    </div>
    <section class="info-card customer-detail-section"><h4>累计 Token 消耗</h4><div class="customer-token-summary"><div><span>总 Token</span><strong>${totalTokens.toLocaleString('zh-CN')}</strong></div><div><span>输入</span><strong>${inputTokens.toLocaleString('zh-CN')}</strong></div><div><span>输出</span><strong>${outputTokens.toLocaleString('zh-CN')}</strong></div></div></section>
    <section class="info-card customer-detail-section"><h4>可调用 Tool</h4><p>${text(tools.join(' / ') || '暂无 Tool 清单')}</p></section>
    <section class="info-card customer-detail-section"><h4>在线试调</h4><p class="muted-line">试调会生成可追踪的 Trace ID，并记录到运行与效果页面。</p><div class="customer-trial-form">${isMemberAsset ? '<label>会员编号<input id="customerTrialVipCode" value="GC10001" maxlength="64"></label>' : ''}${isOrderAsset ? '<label>订单编号<input id="customerTrialOrderId" value="GC-ORDER-20260712" maxlength="64"></label>' : ''}<button type="button" class="primary-btn" onclick="runCustomerTrial('${escapeJs(asset.id)}')">执行在线试调</button></div>${trial ? `<div class="customer-trial-result"><strong>${text(displayStatus(trial.status || 'success'))}</strong><span>${text(trial.latency_ms || 0)} ms</span><code>${text(trial.trace_id || '-')}</code><p>${text(trial.summary || '试调完成')}</p></div>` : ''}</section>
    <section class="customer-detail-section"><h4>版本记录</h4><div class="card-list customer-detail-list">${releases.length ? releases.map(item => `<div class="info-card"><h4>${text(item.version || '-')}</h4><p>${text(item.released_at || item.tested_at || '-')}</p><p class="muted-line">${text(item.notes || '已完成发布')}</p></div>`).join('') : emptyState('暂无版本记录')}</div></section>
    <section class="customer-detail-section"><h4>最近调用</h4><div class="table-wrap"><table><thead><tr><th>时间</th><th>状态</th><th>耗时</th><th>Token（输入 / 输出 / 总）</th><th>结果</th><th>Trace ID</th></tr></thead><tbody>${eventRows.length ? eventRows.join('') : '<tr><td colspan="6" class="muted-line">暂无调用记录</td></tr>'}</tbody></table></div></section>
  `;
}
function renderCustomerReleaseTimeline() {
  const dashboard = state.customerDashboard || {};
  const cards = [];
  if (dashboard.latest_release) {
    cards.push(`<div class="info-card"><h4>${text(dashboard.latest_release.asset_name || '最近交付版本')}</h4><p>${text(dashboard.latest_release.version || '-')} \u00b7 ${text(dashboard.latest_release.released_at || '-')}</p></div>`);
  }
  list(state.deliverables).slice(0, 3).forEach(item => {
    cards.push(`<div class="info-card"><h4>${text(item.name || '交付资料')}</h4><p>${text(item.type || '-')} \u00b7 ${text(displayStatus(item.status || 'draft'))}</p></div>`);
  });
  renderCardList('customerReleaseTimeline', cards, '最近还没有新的交付版本');
}

function renderCustomerDashboard() {
  const dashboard = state.customerDashboard || {};
  const assets = customerAssets();
  const tokenUsageByAsset = new Map(assets.map(asset => {
    const input = Number(asset.input_tokens || 0);
    const output = Number(asset.output_tokens || 0);
    return [asset.id, { input, output, total: Number(asset.total_tokens ?? input + output) }];
  }));
  renderMetricSummary('customerDashboardCards', [
    { label: '已交付 MCP', value: dashboard.asset_count || assets.length, meta: `${dashboard.published_count || 0} 个处于可用状态` },
    { label: '近月调用量', value: dashboard.month_calls || 0, meta: '当前自然月累计' },
    { label: '调用成功率', value: `${dashboard.success_rate ?? 100}%`, meta: '按调用事件统计' },
    { label: '当期金额', value: money(dashboard.month_amount || 0), meta: `账单状态：${displayStatus(dashboard.billing_status || 'pending')}` }
  ]);
  renderCardList('customerAssetCards', assets.map(asset => {
    const usage = tokenUsageByAsset.get(asset.id) || { input: 0, output: 0, total: 0 };
    return `<div class="info-card customer-asset-card"><h4>${displayAssetName(asset.name)}</h4><p class="muted-line">${text(asset.capability || '业务能力待补充')}</p><p>${badge(asset.status || 'published')} <span class="cap-chip">${text(asset.version || 'v1.0.0')}</span></p><div class="customer-inline-badges">${list(asset.tools).map(tool => `<span class="badge info">${text(typeof tool === 'string' ? tool : tool?.name || '-')}</span>`).join(' ') || '<span class="muted-line">暂无 Tool 清单</span>'}</div><div class="customer-token-usage"><span>累计 Token 消耗</span><strong>${usage.total.toLocaleString('zh-CN')}</strong><small>输入 ${usage.input.toLocaleString('zh-CN')} · 输出 ${usage.output.toLocaleString('zh-CN')}</small></div><div class="customer-action-row"><button type="button" class="primary-btn small" onclick="openCustomerAsset('${escapeJs(asset.id)}')">查看服务详情</button><button type="button" class="ghost-btn small" onclick="viewAccessGuide('${escapeJs(asset.id)}')">查看接入指引</button></div></div>`;
  }), '暂时没有可查看的 MCP 资产');
  renderCardList('customerQuickActions', [
    `<div class="info-card customer-quick-card"><h4>查看接入指引</h4><p>逐个资产查看地址、鉴权方式和接入约束。</p></div>`,
    `<div class="info-card customer-quick-card"><h4>下载交付资料</h4><p>配置包、测试报告、日志与复盘会持续沉淀到交付与支持页面。</p></div>`,
    `<div class="info-card customer-quick-card"><h4>关注 Token 消耗</h4><p>每个 MCP 的累计输入、输出和总 Token 可在资产卡或服务详情中查看。</p></div>`
  ], '');
  renderCardList('customerAssetSpotlight', assets.slice(0, 3).map(asset => `<div class="info-card"><h4>${displayAssetName(asset.name)}</h4><p>${text(asset.capability || '-')}</p><p class="muted-line">版本 ${text(asset.version || '-')} · ${text(displayStatus(asset.status || 'published'))}</p></div>`), '暂无资产运行焦点');
  renderCustomerReleaseTimeline();
}
function renderCustomerUsage() {
  const trends = list(state.customerTrends?.trends);
  const events = list(state.events);
  const assets = customerAssets();
  const tokenUsageByAsset = new Map(assets.map(asset => {
    const input = Number(asset.input_tokens || 0);
    const output = Number(asset.output_tokens || 0);
    return [asset.id, { input, output, total: Number(asset.total_tokens ?? input + output) }];
  }));
  const totalTokens = [...tokenUsageByAsset.values()].reduce((sum, item) => sum + item.total, 0);
  const maxCalls = Math.max(1, ...trends.map(item => Number(item.calls || 0)));
  renderMetricSummary('customerUsageCards', [
    { label: '累计调用量', value: state.customerTrends?.total_calls || 0, meta: '当前客户范围内累计' },
    { label: '平均延迟', value: `${state.customerTrends?.avg_latency || 0} ms`, meta: '按全部调用事件计算' },
    { label: '成功率', value: `${state.customerTrends?.success_rate ?? 100}%`, meta: '近 30 天趋势已纳入统计' },
    { label: 'Token 总消耗', value: totalTokens.toLocaleString('zh-CN'), meta: '按各 MCP 全部调用累计' }
  ]);
  const trendBars = trends.slice(-10).map(item => {
    const calls = Number(item.calls || 0);
    const height = calls ? Math.max(22, Math.round(calls / maxCalls * 140)) : 4;
    return `<div class="customer-trend-bar ${calls ? 'has-data' : 'is-zero'}"><strong>${calls || ''}</strong><div class="bar" style="height:${height}px"></div><small>${text(item.date || '-')}</small></div>`;
  });
  const liveStatus = $('customerUsageLiveStatus');
  if (liveStatus) liveStatus.textContent = state.customerLiveUpdatedAt ? `已更新 ${state.customerLiveUpdatedAt}` : '自动刷新';
  const trendNode = $('customerUsageTrendBars');
  if (trendNode) trendNode.innerHTML = trendBars.length ? `<div class="customer-trend-chart">${trendBars.join('')}</div>` : emptyState('近 30 天还没有调用趋势数据');
  renderCardList('customerUsageHighlights', assets.map(asset => {
    const usage = tokenUsageByAsset.get(asset.id) || { input: 0, output: 0, total: 0 };
    return `<div class="info-card customer-token-usage"><h4>${displayAssetName(asset.name)}</h4><strong>${usage.total.toLocaleString('zh-CN')}</strong><p>输入 ${usage.input.toLocaleString('zh-CN')} · 输出 ${usage.output.toLocaleString('zh-CN')}</p></div>`;
  }), '暂无 MCP Token 消耗记录');
  renderSimpleRows('customerUsageRows', events.slice(0, 10).map(item => {
    let input = Number(item.input_tokens || 0);
    let output = Number(item.output_tokens || 0);
    if (!input && !output) {
      try { const result = JSON.parse(item.business_result || '{}'); input = Number(result.input_tokens || 0); output = Number(result.output_tokens || 0); } catch {}
    }
    return `<tr><td>${text(item.created_at || '-')}</td><td>${text(item.asset_name || item.asset_id || '-')}</td><td>${text(item.business_result || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.latency_ms ?? '-')} ms</td><td>${input.toLocaleString('zh-CN')} / ${output.toLocaleString('zh-CN')} / <strong>${(input + output).toLocaleString('zh-CN')}</strong></td><td>${text(item.trace_id || '-')}</td></tr>`;
  }), '暂无调用记录', 7);
}
function renderCustomerBilling() {
  const records = adminBilling().sort((a, b) =>
    String(b.period || '').localeCompare(String(a.period || ''))
  );
  const currentMonth = new Date().toISOString().slice(0, 7);
  const record = records.find(item => String(item.period || '').startsWith(currentMonth)) || records[0] || null;
  const summary = $('customerBillingSummary');

  if (!record) {
    if (summary) summary.innerHTML = `<div class="panel-head"><h3>本期账单</h3></div><div class="customer-billing-empty">当前没有可查看的账单记录。</div>`;
    renderCardList('customerBillingFeeBreakdown', [], '暂无费用明细');
    const quota = $('customerBillingUsageQuota');
    if (quota) quota.innerHTML = '<div class="customer-billing-empty">暂无调用额度数据。</div>';
    renderSimpleRows('customerBillingHistoryRows', [], '暂无历史账单', 6);
    return;
  }

  const tierLimits = { enterprise: 50000, professional: 10000, standard: 3000, basic: 1000 };
  const limit = tierLimits[record.tier] || 10000;
  const usage = Number(record.usage_count || record.calls || 0);
  const remaining = Math.max(0, limit - usage);
  const usagePercent = Math.min(100, Math.round(usage / Math.max(1, limit) * 100));
  const dueDate = /^\d{4}-\d{2}$/.test(String(record.period || '')) ? `${record.period}-28` : '-';
  const subscription = Number(record.base_amount ?? record.amount ?? record.total_amount ?? 0);
  const overage = Number(record.overage_amount || 0);
  const total = Number(record.amount ?? record.total_amount ?? subscription + overage);
  const typeLabel = { subscription: '订阅服务', addon: '增值服务', usage: '按量调用' }[record.billing_type] || record.billing_type || '服务费用';

  if (summary) {
    summary.innerHTML = `
      <div class="customer-billing-hero">
        <div>
          <p class="eyebrow">本期账单 · ${text(record.period || '-')}</p>
          <div class="customer-billing-amount">${money(total)}</div>
          <p class="muted-line">${text(record.item || '账单条目')} · 到期日 ${text(dueDate)}</p>
        </div>
        <div class="customer-billing-hero-actions">
          <span>${badge(record.status || 'pending')}</span>
          <button type="button" class="primary-btn" onclick="exportBillingStatement('${record.id}')">导出对账单</button>
        </div>
      </div>`;
  }

  renderCardList('customerBillingFeeBreakdown', [
    `<div class="customer-charge-row"><span>订阅服务</span><strong>${money(subscription)}</strong></div>`,
    `<div class="customer-charge-row"><span>超额调用</span><strong>${money(overage)}</strong></div>`,
    `<div class="customer-charge-row total"><span>应付合计</span><strong>${money(total)}</strong></div>`,
    `<div class="customer-charge-note">${text(record.notes || `${typeLabel}，账期内调用 ${usage.toLocaleString('zh-CN')} 次。`)}</div>`
  ], '暂无费用明细');

  const quotaNode = $('customerBillingUsageQuota');
  if (quotaNode) quotaNode.innerHTML = `
    <div class="customer-quota-main">
      <div><strong>${usage.toLocaleString('zh-CN')}</strong><span> / ${limit.toLocaleString('zh-CN')} 次</span></div>
      <span>${usagePercent}%</span>
    </div>
    <div class="customer-quota-track"><span style="width:${usagePercent}%"></span></div>
    <p class="muted-line">本期剩余 ${remaining.toLocaleString('zh-CN')} 次调用。${usagePercent >= 80 ? '已接近额度上限，请关注使用量。' : '当前使用量处于正常范围。'}</p>`;

  renderSimpleRows(
    'customerBillingHistoryRows',
    records.map(item => `<tr>
      <td>${text(item.period || '-')}</td>
      <td>${text(item.item || '-')}</td>
      <td>${money(item.amount || item.total_amount || 0)}</td>
      <td>${text(item.usage_count || item.calls || 0)}</td>
      <td>${badge(item.status || 'pending')}</td>
      <td><button type="button" class="ghost-btn small" onclick="exportBillingStatement('${item.id}')">导出</button></td>
    </tr>`),
    '暂无历史账单',
    6
  );
}
function renderCustomerDeliverables() {
  const items = list(state.deliverables);
  renderMetricSummary('customerDeliverableSummary', [
    { label: '交付物总数', value: items.length, meta: '全部交付资料' },
    { label: '可下载', value: items.filter(item => item.status === 'ready').length, meta: '可直接获取' },
    { label: '生成中', value: items.filter(item => item.status === 'generating').length, meta: '正在整理' },
    { label: '待处理', value: items.filter(item => !['ready', 'generating'].includes(item.status)).length, meta: '需继续跟进' }
  ]);
  renderCardList('customerDeliverableHighlights', [
    `<div class="info-card"><h4>交付资料总览</h4><p>配置包、测试报告、调用日志与复盘材料会持续归档到这里。</p></div>`,
    `<div class="info-card"><h4>当前建议</h4><p>${items.some(item => item.status === 'ready') ? '优先下载状态为可下载的交付资料。' : '当前没有可下载文件，建议先关注生成中的资料。'}</p></div>`,
    `<div class="info-card"><h4>最近更新</h4><p>${text(items[0]?.updated_at || '暂无更新记录')}</p></div>`
  ], '暂无交付建议');
  renderSimpleRows('customerDeliverableRows', items.map(item => `<tr><td>${text(item.name || '-')}</td><td>${text(item.project_name || item.project_id || '-')}</td><td>${text(item.type || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.updated_at || '-')}</td><td>${item.status === 'ready' ? `<div class="customer-row-actions"><button type="button" class="primary-btn small" onclick="downloadDeliverable('${item.id}')">下载</button></div>` : '<span class="muted-line">整理中</span>'}</td></tr>`), '暂无交付物记录', 6);
}

function renderCustomerAccess() {
  const access = list(state.access);
  const assets = customerAssets();
  renderMetricSummary('customerAccessSummary', [
    { label: '接入条目', value: access.length, meta: '当前可见配置' },
    { label: '生产环境', value: access.filter(item => item.environment === 'production').length, meta: '正式接入' },
    { label: '沙箱环境', value: access.filter(item => item.environment === 'sandbox').length, meta: '联调用途' },
    { label: '可查看指引', value: assets.length, meta: '每个 MCP 都可查看接入指引' }
  ]);
  renderCardList('customerAccessGuideList', [
    `<div class="info-card"><h4>使用前须知</h4><p>先确认资产名称、环境地址、鉴权方式，再安排联调。</p></div>`,
    ...assets.slice(0, 4).map(asset => `<div class="info-card"><h4>${displayAssetName(asset.name)}</h4><p>${text(asset.capability || '业务能力说明待补充')}</p><div class="customer-action-row"><button type="button" class="primary-btn small" onclick="openCustomerAsset('${asset.id}')">查看服务详情</button><button type="button" class="ghost-btn small" onclick="viewAccessGuide('${asset.id}')">查看接入指引</button></div></div>`)
  ], '暂无可查看的接入指引');
  renderCardList('customerAccessList', access.map(item => `<div class="info-card customer-access-card"><h4>${text(item.name || '接入项')}</h4><p class="muted-line">${text(item.project_name || '-')} \u00b7 ${text(item.environment || '-')}</p><p>地址：${text(item.endpoint || '-')}</p><p>范围：${text(item.scope || '-')}</p><div class="customer-action-row">${item.endpoint ? `<button type="button" class="ghost-btn small" onclick="copyText('${escapeJs(item.endpoint)}')">复制地址</button>` : ''}</div></div>`), '暂无接入配置');
}

function renderAccessGuideOverlay() {
  const overlay = $('accessGuideOverlay');
  const title = $('accessGuideTitle');
  const content = $('accessGuideContent');
  if (!overlay || !title || !content) return;
  const guide = state.accessGuide;
  if (!guide) {
    overlay.style.display = 'none';
    content.innerHTML = '';
    return;
  }
  overlay.style.display = 'grid';
  title.textContent = `${displayAssetName(guide.asset?.name)} 接入指引`;
  const masking = parseRuleList(guide.guide?.masking_rules);
  content.innerHTML = `<div class="customer-guide-shell"><div class="customer-guide-grid"><div class="info-card"><h4>服务地址</h4><p>${text(guide.guide?.server_url || '-')}</p><div class="customer-action-row"><button type="button" class="ghost-btn small" onclick="copyText('${escapeJs(guide.guide?.server_url || '')}')">复制地址</button></div></div><div class="info-card"><h4>鉴权方式</h4><p>${text(guide.guide?.auth_mode || '-')}</p><p class="muted-line">范围：${text(guide.guide?.auth_scope || '默认范围')}</p></div><div class="info-card"><h4>客户端凭证</h4><p>Client ID：${text(guide.guide?.client_id || '-')}</p><p class="muted-line">Secret：${text(guide.guide?.client_secret_hint || '首次交付时单独发送')}</p></div><div class="info-card"><h4>限流与脱敏</h4><p>限流：${text(guide.guide?.rate_limit || '-')}</p><p class="muted-line">脱敏：${masking.length ? text(masking.join(' / ')) : '无额外脱敏规则'}</p></div></div><div class="info-card"><h4>可调用 Tool</h4><p>${list(guide.guide?.tools).length ? list(guide.guide.tools).map(tool => typeof tool === 'string' ? tool : tool?.name || '-').join(' / ') : '暂无 Tool 清单'}</p></div></div>`;
}

// ============================================================
// 全局函数
// ============================================================
window.switchAccessTab = function switchAccessTab(tabId) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('#accessTabs .tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === tabId));
};

window.copyText = async function copyText(value = '') {
  const content = String(value || '');
  if (!content) {
    showToast('没有可复制的内容。', 'warning');
    return;
  }
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else if (typeof document !== 'undefined') {
      const input = document.createElement('textarea');
      input.value = content;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    showToast('已复制到剪贴板。', 'success');
  } catch {
    showToast('复制失败，请手动复制。', 'warning');
  }
};

window.closeAccessGuide = function closeAccessGuide() {
  state.accessGuide = null;
  renderAll();
};

window.applyBuilderPrompt = function applyBuilderPrompt(prompt = '', autoSend = false) {
  state.customerBuilderDraft = prompt;
  if (autoSend) {
    window.generateCustomerMcp(state.customerBuilderDraft);
    return;
  }
  renderAll();
};

window.generateCustomerMcp = function generateCustomerMcp(prompt = '') {
  ensureCustomerBuilderState();
  const draftValue = $('customerBuilderInput')?.value || '';
  const value = String(prompt || draftValue || state.customerBuilderDraft || '').trim();
  if (!value) {
    showToast('请先输入你的业务需求。', 'warning');
    return;
  }
  state.customerBuilderDraft = value;
  state.customerBuilderSelectedHistoryId = null;
  state.customerBuilderMessages = [...list(state.customerBuilderMessages), { role: 'user', text: value }];
  const conversationPrompts = list(state.customerBuilderMessages).filter(item => item.role === 'user').map(item => item.text);
  state.customerBuilderResult = buildCustomerBuilderResult(value, { conversationPrompts });
  state.customerBuilderMessages = [...list(state.customerBuilderMessages), { role: 'assistant', text: state.customerBuilderResult.reply }];
  renderAll();
};

window.clearCustomerBuilder = function clearCustomerBuilder() {
  state.customerBuilderMessages = [];
  state.customerBuilderResult = null;
  state.customerBuilderDraft = customerBuilderSuggestions[0];
  state.customerBuilderDetailTab = 'tools';
  state.customerBuilderSelectedHistoryId = null;
  state.customerBuilderCurrentSessionId = '';
  renderAll();
};

window.saveBuilderDraft = function saveBuilderDraft() {
  const entry = upsertCustomerBuilderHistory('draft');
  try {
    localStorage.setItem('mcp_customer_builder_draft', state.customerBuilderDraft || '');
  } catch {}
  showToast(entry ? '已将当前会话保存为草稿。' : '暂无可保存的会话。', entry ? 'success' : 'warning');
  renderAll();
};

window.handoffBuilderRequest = async function handoffBuilderRequest() {
  const created = await window.submitBuilderRequest('accepted');
  if (created) showToast('已转交管理员继续处理。', 'success');
};

window.submitBuilderRequest = async function submitBuilderRequest(historyStatus = 'submitted') {
  ensureCustomerBuilderState();
  const result = state.customerBuilderResult || buildCustomerBuilderResult(state.customerBuilderDraft);
  const historyEntry = upsertCustomerBuilderHistory(historyStatus);
  const userRoundCount = list(state.customerBuilderMessages).filter(item => item.role === 'user').length || 1;
  const payload = {
    prompt: historyEntry?.prompt || state.customerBuilderDraft || '',
    latest_prompt: historyEntry?.latest_prompt || state.customerBuilderDraft || '',
    result,
    rounds: historyEntry?.rounds || userRoundCount
  };

  if (historyEntry) state.customerBuilderSelectedHistoryId = historyEntry.id;

  try {
    if (typeof window.syncBuilderRequestToServer !== 'function') {
      throw new Error('提交通道未初始化');
    }
    const created = await window.syncBuilderRequestToServer(payload);
    if (!created?.id) throw new Error('管理员端未收到该需求');
    state.builderRequests = [created, ...list(state.builderRequests).filter(item => item.id !== created.id)];
    persistBuilderRequests();
    showToast('需求已提交，管理员端已收到。', 'success');
    renderAll();
    return created;
  } catch (error) {
    showToast(error?.message || '提交失败，管理员端未收到该需求。', 'error');
    renderAll();
    return null;
  }
};

window.adminUpdateBuilderRequestStatus = async function adminUpdateBuilderRequestStatus(id, status) {
  const request = list(state.builderRequests).find(item => item.id === id);
  if (!request) {
    showToast('需求记录不存在。', 'error');
    return;
  }
  state.builderRequests = list(state.builderRequests).map(item => item.id === id ? { ...item, status, updated_at: new Date().toISOString() } : item);
  persistBuilderRequests();
  showToast('需求状态已更新。', 'success');
  renderAll();
};

window.switchCustomerBuilderDetailTab = function switchCustomerBuilderDetailTab(tabId) {
  state.customerBuilderDetailTab = tabId;
  renderAll();
};

window.toggleCustomerBuilderHistory = function toggleCustomerBuilderHistory(forceOpen) {
  ensureCustomerBuilderState();
  state.customerBuilderHistoryOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.customerBuilderHistoryOpen;
  renderAll();
};

window.previewCustomerBuilderHistory = function previewCustomerBuilderHistory(historyId) {
  state.customerBuilderSelectedHistoryId = historyId || null;
  state.customerBuilderHistoryOpen = false;
  renderAll();
};

window.switchCustomerPage = function switchCustomerPage(pageId) {
  switchPage(pageId);
};

window.jumpToPage = function jumpToPage(pageId) {
  switchPage(pageId);
  renderAll();
};

window.downloadOpenapiSpec = function downloadOpenapiSpec(specId) {
  const spec = list(state.openapiSpecs).find(item => item.id === specId);
  if (!spec) { showToast('OpenAPI 草案不存在。', 'error'); return; }
  showToast('正在生成 OpenAPI 3.0 规范文件...', 'warning');
  // 直接从后端下载真实 JSON（后端会返回完整的 openapi_body）
  const token = localStorage.getItem('mcp_token') || '';
  fetch(`/api/platform/openapi-specs/${specId}/download`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.blob();
  }).then(blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `openapi-${spec.title || spec.source_name || specId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('OpenAPI 3.0 规范已下载。', 'success');
  }).catch(err => {
    // fallback: 从 state 数据生成
    let content = spec.spec;
    if (typeof content === 'string') { try { content = JSON.parse(content); } catch {} }
    content = JSON.stringify(content || spec.openapi_body || {}, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `openapi-${specId}.json`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('OpenAPI JSON 已下载（本地模式）。', 'success');
  });
};

window.downloadSourceReport = function downloadSourceReport(sourceId) {
  const source = list(state.sources).find(item => item.id === sourceId);
  if (!source) {
    showToast('资料不存在。', 'error');
    return;
  }
  const spec = list(state.openapiSpecs).find(item => item.source_id === sourceId);
  const endpoints = spec?.spec ? extractEndpointCount(spec.spec) : 0;
  const lines = [
    `# 资料识别报告 - ${source.name || sourceId}`,
    '',
    `- 资料名称：${source.name || '-'}`,
    `- 资料类型：${source.type || '-'}`,
    `- 所属项目：${source.project_name || source.project_id || '-'}`,
    `- 认证方式：${source.auth_mode || '-'}`,
    `- 识别状态：${source.recognition_status === 'done' ? '已识别' : '待识别'}`,
    `- 识别端点数：${endpoints}`,
    `- 识别时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    '',
    '## 说明',
    '本报告由 MCP Forge 资料接入工作台生成，记录资料AI 识别出的草案摘要。',
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `source-report-${source.name || sourceId}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('识别报告已下载。', 'success');
};

window.exportReleaseReport = function exportReleaseReport(releaseId) {
  const release = adminReleases().find(item => item.id === releaseId);
  if (!release) {
    showToast('发布记录不存在。', 'error');
    return;
  }
  const lines = [
    `# 发布报告 - ${release.asset_name || releaseId}`,
    '',
    `- 版本：${release.version || '-'}`,
    `- 状态：${release.status || '-'}`,
    `- 环境：${release.environment || '-'}`,
    `- 验证时间：${release.tested_at || '-'}`,
    `- 发布时间：${release.released_at || '-'}`,
    `- 备注：${release.notes || '无'}`,
    '',
    '## 说明',
    '本报告由 MCP Forge 测试发布工作台导出。',
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `release-report-${release.asset_name || releaseId}-${release.version || 'v1'}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('发布报告已下载。', 'success');
};

function harmonizeAdminCopy() {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('customer', isCustomerView());
  const roleLabel = $('roleLabel');
  const currentUser = $('currentUser');
  if (roleLabel) roleLabel.textContent = isCustomerView() ? '客户交付台' : 'MCP 资产生成工厂';
  if (currentUser) currentUser.textContent = state.user ? `${state.user.display_name || state.user.username || '用户'} \u00b7 ${isCustomerView() ? '客户侧' : '工厂侧'}` : '未登录';
}

export function renderAll() {
  if (typeof document === 'undefined') return;
  harmonizeAdminCopy();
  renderSummary();
  renderIntake();
  renderRecognition();
  renderCandidatesPage();
  renderTooling();
  renderToolDraftPage();
  renderMcpComposePage();
  renderAssets();
  renderPublish();
  renderDeliverables();
  renderMonitoringPage();
  renderAccess();
  renderGateway();
  renderPolicyChanges();
  renderUsage();
  renderApiKeys();
  renderKnowledge();
  renderBilling();
  renderCustomerBuilder();
  renderCustomerOverview();
  renderCustomerDashboard();
  renderCustomerUsage();
  renderCustomerBilling();
  renderCustomerDeliverables();
  renderCustomerAccess();
  renderProjectDrawer();
  renderPublishDrawer();
  renderUsageDrawer();
  renderBillingDrawer();
  renderDeliverableDrawer();
  renderKnowledgeDrawer();
  renderAccessGuideOverlay();
  renderCustomerAssetOverlay();
  renderBuilderValueBoard();
  renderReviewWorkbench();
  switchPage(state.currentPage);
}

// ============================================================
// 企业 MCP 打造工作台：B 端价值看板
// 渲染 Builder Workbench MVP 关键指标，让评委/客户一眼看到 AI + 人工协作带来的交付价值
// ============================================================
export function renderBuilderValueBoard() {
  const root = $('builderValueBoard');
  if (!root) return;
  const m = state.builderMetrics;
  if (!m) {
    root.innerHTML = `
      <div class="metric-card"><span class="metric-label">B 端价值指标</span><strong class="muted-line">加载中...</strong><span class="muted-line">暂无数据，等待人工卡点或发布数据</span></div>
    `;
    return;
  }
  const cycleText = m.avg_build_cycle_hours
    ? `${m.avg_build_cycle_hours} 小时`
    : '暂无样本';
  const passText = m.pass_rate
    ? `${(m.pass_rate * 100).toFixed(0)}%`
    : '—';
  const reuseRateText = m.reuse_rate
    ? `${(m.reuse_rate * 100).toFixed(0)}%`
    : '—';
  const reuseText = m.reuse_category_text || {};
  const breakdown = m.reuse_breakdown || {};
  const breakdownItems = Object.keys(reuseText).map(key => ({
    label: reuseText[key] || key,
    value: breakdown[key] || 0
  }));

  root.innerHTML = `
    <div class="metric-card">
      <span class="metric-label">资料转资产周期（平均）</span>
      <strong>${cycleText}</strong>
      <span class="muted-line">从候选入站到正式发布的平均耗时</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">本周复用资产数</span>
      <strong>${m.week_reuses}</strong>
      <span class="muted-line">7 天内生成的复用建议</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">通过率（发布 / 已决策）</span>
      <strong>${passText}</strong>
      <span class="muted-line">${m.total_published} 已发布 / ${m.total_candidates} 候选</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">待发布项目数</span>
      <strong>${m.pending_publishes}</strong>
      <span class="muted-line">验收通过、等待最终发布</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">人工审核命中数</span>
      <strong>${m.human_review_hits}</strong>
      <span class="muted-line">AI 标记需要人工拍板的候选</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">待人工初筛</span>
      <strong>${m.pending_manual_screen}</strong>
      <span class="muted-line">进入初筛队列、未拍板</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">复用率（直接复用占比）</span>
      <strong>${reuseRateText}</strong>
      <span class="muted-line">${breakdownItems.map(b => `${b.label} ${b.value}`).join(' · ') || '暂无复用记录'}</span>
    </div>
  `;
}

// ============================================================
// 分层审核工作台渲染（引导式）
// ============================================================
const REVIEW_STAGE_LABELS = {
  candidate_review: '候选资产审核',
  tool_review: 'Tool 审核',
  publish_acceptance: '发布验收'
};

const REVIEW_STAGE_GUIDE = {
  candidate_review: { action: '先审 AI 识别出来的候选是否可信', next: '通过后进入 Tool 审核' },
  tool_review: { action: '再审 Tool 是否应该这样组织', next: '通过后进入 MCP 封装' },
  publish_acceptance: { action: '最后验收 MCP 是否真的可以发布', next: '通过后正式上线' }
};

let currentReviewStage = 'candidate_review';

// 优先级排序：双人审核 > 高风险 > 发布阻断 > 普通
function sortReviewsByPriority(reviews) {
  const candidates = window.__state?.candidates || [];
  const priorityMap = {};
  for (const c of candidates) priorityMap[c.id] = c;

  return [...reviews].sort((a, b) => {
    // open 状态优先
    if (a.status === 'open' && b.status !== 'open') return -1;
    if (a.status !== 'open' && b.status === 'open') return 1;
    // 双人审核优先
    const aDual = a.review_type === 'dual_review' ? 1 : 0;
    const bDual = b.review_type === 'dual_review' ? 1 : 0;
    if (aDual !== bDual) return bDual - aDual;
    // 高风险候选优先
    const ca = priorityMap[a.candidate_id];
    const cb = priorityMap[b.candidate_id];
    const aRisk = ca?.risk_level === 'high' ? 1 : ca?.risk_level === 'medium' ? 0.5 : 0;
    const bRisk = cb?.risk_level === 'high' ? 1 : cb?.risk_level === 'medium' ? 0.5 : 0;
    if (aRisk !== bRisk) return bRisk - aRisk;
    // 发布验收阶段优先
    if (a.review_stage === 'publish_acceptance' && b.review_stage !== 'publish_acceptance') return -1;
    if (a.review_stage !== 'publish_acceptance' && b.review_stage === 'publish_acceptance') return 1;
    return 0;
  });
}

function renderReviewExamples() {
  const board = $('reviewExampleBoard');
  if (!board) return;
  const examples = list(state.governanceDemoOverview?.reviewExamples);
  if (!examples.length) {
    board.innerHTML = '';
    return;
  }
  board.innerHTML = `<div class="review-example-head"><strong>审核案例参考</strong><span>案例仅用于说明 AI 建议如何经过人工审核，不影响下方真实任务</span></div><div class="review-example-list">${examples.map(item => `<article class="review-example-card"><div class="review-example-top"><span class="badge ${item.risk === '高风险' ? 'danger' : item.risk === '中风险' ? 'warning' : 'success'}">${text(item.risk)}</span><span class="muted-line">${text(REVIEW_STAGE_LABELS[item.stage] || item.stage)}</span></div><h4>${text(item.title)}</h4><p><strong>AI 建议：</strong>${text(item.ai_suggestion)}</p><p><strong>人工判断：</strong>${text(item.human_decision)}</p><p class="muted-line"><strong>审核原因：</strong>${text(item.reason)}${item.trace_id ? ` · Trace ID：${text(item.trace_id)}` : ''}</p></article>`).join('')}</div>`;
}

export function renderReviewWorkbench() {
  const stepBar = $('reviewStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(4);

  const screenRoot = $('candidateScreenBoard');
  if (!screenRoot) return;

  const allCandidates = list(state.candidates);
  if (!allCandidates.length) {
    screenRoot.innerHTML = '<article class="panel"><strong>暂无候选业务能力</strong><p class="muted-line">请先在「资料接入」页面上传业务资料并触发 AI 识别。</p>' +
      '<div class="row-actions" style="margin-top:10px"><button type="button" class="ghost-btn small" onclick="jumpToPage(\'intake\')">去资料接入 -></button></div></article>';
    return;
  }

  const selected = state.selectedCandidateId
    ? allCandidates.find(c => c.id === state.selectedCandidateId)
    : null;
  const pendingCandidates = allCandidates.filter(c => !c.manual_screen_decision || c.manual_screen_decision === 'pending');

  let html = '';
  html += '<div style="margin-bottom:14px"><button type="button" class="ghost-btn small" onclick="jumpToPage(\'candidates\')">← 返回候选业务能力</button></div>';

  if (selected) {
    const aiTools = jsonList(selected.ai_tools_snapshot);
    const hits = jsonList(selected.sensitive_hits);
    const screenDecided = selected.manual_screen_decision && selected.manual_screen_decision !== 'pending';

    html += '<article class="panel" style="margin-bottom:14px">';
    html += '<div class="panel-head"><div><span class="eyebrow">候选业务能力</span><h3>' + text(selected.name || '-') + '</h3></div>';

    if (screenDecided) {
      const dt = selected.manual_screen_decision === 'approve' ? '已通过' : selected.manual_screen_decision === 'reject' ? '已拒绝' : '修改后重审';
      const dc = selected.manual_screen_decision === 'approve' ? 'success' : selected.manual_screen_decision === 'reject' ? 'danger' : 'warning';
      html += '<span class="badge ' + dc + '">' + dt + '</span></div>';
      // 业务信息
      html += '<div style="padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:16px">';
      html += '<div><span style="font-size:11px;color:#94a3b8;font-weight:650">业务域</span><p style="margin:4px 0 0;font-size:13px">' + text(selected.business_domain || '-') + '</p>';
      html += '<span style="font-size:11px;color:#94a3b8;font-weight:650;display:block;margin-top:8px">读写类型</span><p style="margin:4px 0 0;font-size:13px">' + text(selected.operation_type || '-') + '</p></div>';
      html += '<div><span style="font-size:11px;color:#94a3b8;font-weight:650">审核理由</span><p style="margin:4px 0 0;font-size:13px">' + text(selected.manual_screen_reason || '-') + '</p></div>';
      html += '</div>';
      // 接口列表
      html += '<div style="margin:0 16px 14px"><p style="font-size:12px;font-weight:650;color:#64748b;margin:0 0 8px">包含接口（' + aiTools.length + '）</p><div style="padding:14px;background:var(--surface-2);border-radius:8px">';
      aiTools.forEach(tool => {
        if (typeof tool !== 'object' || tool === null) return;
        const visChip = tool.visibility === 'public' ? '<span class="badge success" style="font-size:10px">公开</span>' : '<span class="badge warning" style="font-size:10px">内部</span>';
        const params = tool.inputSchema?.properties || {};
        const required = tool.inputSchema?.required || [];
        const paramList = Object.keys(params);
        html += '<div style="padding:10px 0;border-top:1px solid var(--line)">';
        html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><strong style="font-size:14px">' + text(tool.display_name || tool.name || '-') + '</strong><code style="font-size:11px;color:var(--primary)">' + text(tool.name || '') + '</code>' + visChip + '</div>';
        html += '<p style="margin:4px 0 0;font-size:12px;color:#64748b">' + text(tool.description || '') + '</p>';
        if (tool.sensitivity_reason) html += '<p style="margin:2px 0 0;font-size:11px;color:#dc2626">⚠️ ' + text(tool.sensitivity_reason) + '</p>';
        if (paramList.length) html += '<div style="margin-top:4px;font-size:11px;color:#94a3b8">参数：' + paramList.map(p => '<code style="margin-right:6px">' + escapeHtml(p) + (required.includes(p) ? ' *' : '') + '</code>').join('') + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
      if (selected.manual_screen_decision === 'approve') {
        html += '<div class="row-actions" style="padding:0 16px 16px"><button type="button" class="primary-btn small" onclick="jumpToPage(\'tooling\')">去确认 Tool 边界 →</button></div>';
      }
    } else {
      const riskBadge = selected.risk_level === 'high' ? '<span class="badge danger">高风险</span>' : selected.risk_level === 'medium' ? '<span class="badge warning">中风险</span>' : '<span class="badge success">低风险</span>';
      html += riskBadge + '</div>';
      // AI 识别信息（只读）
      html += '<div style="padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:16px">';
      html += '<div><span style="font-size:11px;color:#94a3b8;font-weight:650">业务域</span><p style="margin:4px 0 0;font-size:13px">' + text(selected.business_domain || '-') + '</p>';
      html += '<span style="font-size:11px;color:#94a3b8;font-weight:650;display:block;margin-top:8px">读写类型</span><p style="margin:4px 0 0;font-size:13px">' + text(selected.operation_type || '-') + '</p></div>';
      html += '<div><span style="font-size:11px;color:#94a3b8;font-weight:650">权限范围</span><p style="margin:4px 0 0;font-size:13px">' + text(selected.permission_scope || '-') + '</p>';
      html += '<span style="font-size:11px;color:#94a3b8;font-weight:650;display:block;margin-top:8px">分组理由</span><p style="margin:4px 0 0;font-size:13px">' + text(selected.grouping_reason || '-') + '</p></div>';
      html += '</div>';
      if (hits.length) {
        html += '<div style="margin:0 16px 10px;padding:10px 14px;background:#fef3c7;border-radius:8px;border-left:3px solid #f59e0b"><strong style="font-size:12px">⚠️ 敏感字段命中：</strong><span style="font-size:12px">' + text(hits.map(hit => typeof hit === 'string' ? hit : (hit.label || hit.field || '')).join('、')) + '</span></div>';
      }
      // 接口列表
      html += '<div style="margin:0 16px 14px"><p style="font-size:12px;font-weight:650;color:#64748b;margin:0 0 8px">包含接口（' + aiTools.length + '）</p><div style="padding:14px;background:var(--surface-2);border-radius:8px">';
      aiTools.forEach(tool => {
        if (typeof tool !== 'object' || tool === null) return;
        const visChip = tool.visibility === 'public' ? '<span class="badge success" style="font-size:10px">公开</span>' : '<span class="badge warning" style="font-size:10px">内部</span>';
        const params = tool.inputSchema?.properties || {};
        const required = tool.inputSchema?.required || [];
        const paramList = Object.keys(params);
        html += '<div style="padding:10px 0;border-top:1px solid var(--line)">';
        html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><strong style="font-size:14px">' + text(tool.display_name || tool.name || '-') + '</strong><code style="font-size:11px;color:var(--primary)">' + text(tool.name || '') + '</code>' + visChip + '</div>';
        html += '<p style="margin:4px 0 0;font-size:12px;color:#64748b">' + text(tool.description || '') + '</p>';
        if (tool.sensitivity_reason) html += '<p style="margin:2px 0 0;font-size:11px;color:#dc2626">⚠️ ' + text(tool.sensitivity_reason) + '</p>';
        if (paramList.length) html += '<div style="margin-top:4px;font-size:11px;color:#94a3b8">参数：' + paramList.map(p => '<code style="margin-right:6px">' + escapeHtml(p) + (required.includes(p) ? ' *' : '') + '</code>').join('') + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
      // 审核理由
      html += '<div style="margin:0 16px 10px"><label style="font-size:12px;color:#64748b;font-weight:650;display:block;margin-bottom:4px">审核理由</label><input id="screenReason_' + escapeJs(selected.id) + '" placeholder="例如：业务能力识别合理，接口边界清晰" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
      // 操作按钮
      html += '<div class="row-actions" style="padding:0 16px 16px">';
      html += '<button type="button" class="primary-btn small" onclick="candidateScreenDecision(\'' + escapeJs(selected.id) + '\',\'approve\')">通过：识别可信</button>';
      html += '<button type="button" class="ghost-btn small" onclick="toggleModifyFields(\'' + escapeJs(selected.id) + '\')">修改后重审：识别有偏差</button>';
      html += '<button type="button" class="danger-btn small" onclick="candidateScreenDecision(\'' + escapeJs(selected.id) + '\',\'reject\')">拒绝：误识别</button>';
      html += '</div>';
      // 修改后重审：可编辑字段（默认隐藏）
      html += '<div id="modifyFields_' + escapeJs(selected.id) + '" style="display:none;padding:0 16px 16px">';
      html += '<div class="panel" style="background:#f0f9ff;border:1px solid #bae6fd;padding:14px;border-radius:8px;margin-bottom:10px">';
      html += '<strong style="font-size:13px;color:#0369a1">修改后重审 — 填写需要修改的字段</strong>';
      html += '<p class="muted-line" style="font-size:12px;margin:4px 0 10px">如果 AI 识别的业务域、名称或权限有误，在此修改后点击「提交修改」</p>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
      html += '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:4px">业务能力名称</label><input id="editField_' + escapeJs(selected.id) + '_name" value="' + escapeHtml(selected.name || '') + '" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
      html += '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:4px">业务域</label><input id="editField_' + escapeJs(selected.id) + '_business_domain" value="' + escapeHtml(selected.business_domain || '') + '" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
      html += '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:4px">读写类型</label><input id="editField_' + escapeJs(selected.id) + '_operation_type" value="' + escapeHtml(selected.operation_type || '') + '" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
      html += '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:4px">权限范围</label><input id="editField_' + escapeJs(selected.id) + '_permission_scope" value="' + escapeHtml(selected.permission_scope || '') + '" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
      html += '<div style="grid-column:1/-1"><label style="font-size:11px;color:#64748b;display:block;margin-bottom:4px">分组理由</label><input id="editField_' + escapeJs(selected.id) + '_grouping_reason" value="' + escapeHtml(selected.grouping_reason || '') + '" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
      html += '</div>';
      html += '<div class="row-actions" style="margin-top:10px"><button type="button" class="primary-btn small" onclick="candidateScreenDecision(\'' + escapeJs(selected.id) + '\',\'modify\')">提交修改并标记重审</button></div>';
      html += '</div></div>';
    }
    html += '</article>';
  }

  // 候选列表
  const listCandidates = selected ? allCandidates.filter(c => c.id !== selected.id) : allCandidates;
  if (listCandidates.length) {
    html += '<div class="panel" style="margin-bottom:10px"><div class="panel-head"><h3>' + (selected ? '其他候选业务能力' : '选择候选业务能力查看接口详情') + '</h3>' + (!selected && pendingCandidates.length ? '<small class="muted-line">' + pendingCandidates.length + ' 个待初筛</small>' : '') + '</div></div>';
    html += listCandidates.map(c => {
      const aiTools = jsonList(c.ai_tools_snapshot);
      const screenDecided = c.manual_screen_decision && c.manual_screen_decision !== 'pending';
      let badgeHtml = '<span class="badge info">待初筛</span>';
      if (screenDecided) {
        if (c.manual_screen_decision === 'approve') badgeHtml = '<span class="badge success">已通过</span>';
        else if (c.manual_screen_decision === 'reject') badgeHtml = '<span class="badge danger">已拒绝</span>';
        else badgeHtml = '<span class="badge warning">修改后重审</span>';
      }
      return '<article class="panel" style="margin-bottom:8px;cursor:pointer" onclick="enterCandidateReview(\'' + escapeJs(c.id) + '\')" tabindex="0"><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px"><div><strong style="font-size:14px">' + text(c.name || '-') + '</strong><span style="margin-left:8px;font-size:12px;color:#94a3b8">' + aiTools.length + ' 个接口 · ' + text(c.business_domain || '-') + '</span></div>' + badgeHtml + '</div></article>';
    }).join('');
  }

  screenRoot.innerHTML = html;
}

window.toggleModifyFields = function(candidateId) {
  const panel = $('modifyFields_' + candidateId);
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
};

window.enterCandidateReview = function(candidateId) {
  state.selectedCandidateId = candidateId;
  state.currentPage = 'review';
  renderAll();
};

// 切换审核阶段 Tab（保留兼容，不再有 UI 触发）
window.switchReviewStageTab = function(stage) {
  currentReviewStage = stage;
  document.querySelectorAll('#reviewStageTabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.stage === stage);
  });
  renderReviewWorkbench();
};

// 审核决策
window.reviewDecision = async function(reviewId, decision) {
  const decisionLabels = { approve: '通过', reject: '拒绝', modify: '修改后重审' };
  const guideText = {
    approve: '通过后，这条任务将关闭，候选资产进入下一阶段审核。',
    reject: '拒绝后，系统会根据审核阶段自动升级或退回。',
    modify: '修改后，任务会标记为"已修改"，需要重新提交审核。'
  };

  let reason = '';
  if (decision === 'reject') {
    reason = prompt('请输入拒绝原因（必填）：\n' + guideText.reject);
    if (!reason) return;
  } else if (decision === 'modify') {
    reason = prompt('请输入修改说明：\n' + guideText.modify);
    if (!reason) return;
  } else if (decision === 'approve') {
    if (!confirm('确认通过？\n' + guideText.approve)) return;
  }

  try {
    const resp = await fetch('/api/platform/governance/reviews/' + reviewId + '/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...window.authHeader() },
      body: JSON.stringify({ decision, reason })
    });
    const data = await resp.json();
    if (data.ok) {
      if (data.escalation) {
        alert('已处理。系统自动升级到 senior_reviewer。');
      } else if (data.modification) {
        alert('修改已记录。系统已自动创建重审任务，当前任务标记为"已修改"。\n下一步：请根据修改说明调整候选内容，然后提交重审。');
      } else {
        alert(decisionLabels[decision] + '操作已完成。');
      }
      await window.refreshData();
    } else {
      alert(data.error || '操作失败');
    }
  } catch (e) {
    alert('网络错误：' + e.message);
  }
};

// 发布候选资产
window.publishCandidate = async function(candidateId) {
  if (!confirm('确认发布该候选资产？')) return;
  try {
    const resp = await fetch('/api/platform/governance/candidates/' + candidateId + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...window.authHeader() },
      body: JSON.stringify({})
    });
    const data = await resp.json();
    if (data.published) {
      alert('发布成功！');
      await window.refreshData();
    } else {
      alert('发布被阻断：' + (data.error || '未知原因'));
    }
  } catch (e) {
    alert('网络错误：' + e.message);
  }
};
