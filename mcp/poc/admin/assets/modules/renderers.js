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

export function renderNav() {
  const nav = $('nav');
  if (!nav || !state.user) return;
  nav.innerHTML = allowedNavItems()
    .map(item => {
      const icon = item.icon ? `<span class="nav-icon">${item.icon}</span>` : '';
      const desc = item.desc ? ` title="${text(item.desc)}"` : '';
      return `<button type="button" class="nav-btn ${state.currentPage === item.id ? 'active' : ''}" data-page="${item.id}"${desc}>${icon}<span class="nav-label">${text(item.label)}</span></button>`;
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
  node.innerHTML = items.map(item => metric(item.label, item.value, item.meta || '')).join('');
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
    { n: 2, label: '接口识别', page: 'recognition' },
    { n: 3, label: 'Tool 映射', page: 'tooling' },
    { n: 4, label: 'MCP 资产', page: 'assets' },
    { n: 5, label: '测试发布', page: 'publish' },
    { n: 6, label: '交付管理', page: 'delivery' }
  ];
  return `<div class="step-bar">${steps.map(s => `
    <div class="step-item ${s.n <= currentStep ? 'done' : ''} ${s.n === currentStep ? 'current' : ''}" onclick="jumpToPage('${s.page}')">
      <span class="step-num">${s.n <= currentStep ? '\u2705' : s.n}</span>
      <span class="step-text">${s.label}</span>
    </div>
    ${s.n < 6 ? '<span class="step-arrow">\u2192</span>' : ''}
  `).join('')}</div>`;
}

// ============================================================
// 1. 生成总览 — 资产生成驾驶舱 + 全链路漏斗
// ============================================================
function renderSummary() {
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
function renderIntake() {
  const items = list(state.sources);

  // 步骤条
  const stepBar = $('intakeStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(1);

  // AI 引擎状态标识
  const aiBadge = $('aiStatusBadge');
  if (aiBadge) {
    const cfg = state.aiConfig || {};
    if (cfg.configured) {
      aiBadge.textContent = `AI 引擎已就绪 · ${cfg.model || ''}`;
      aiBadge.style.cssText = 'font-size:11px;padding:2px 10px;border-radius:4px;background:#dcfce7;color:#16a34a;font-weight:600';
    } else {
      aiBadge.textContent = 'AI 引擎未配置';
      aiBadge.style.cssText = 'font-size:11px;padding:2px 10px;border-radius:4px;background:#fef9c3;color:#a16207;font-weight:600';
    }
  }

  // 表格行
  renderSimpleRows('sourceRows', items.map(item => {
    const recStatus = item.recognition_status || 'draft';
    const statusBadge = badge(item.status || 'draft');
    const recBadge = recStatus === 'done' ? '<span class="badge success">已识别</span>' : recStatus === 'pending' ? '<span class="badge warning">识别中</span>' : '<span class="badge info">待识别</span>';
    const actionBtn = recStatus === 'done'
      ? `<div class="row-actions"><button type="button" class="ghost-btn small" onclick="viewSourceOpenapi('${item.id}')">查看草案</button><button type="button" class="ghost-btn small" onclick="downloadSourceReport('${item.id}')">下载识别报告</button><button type="button" class="primary-btn small" onclick="triggerRecognition('${item.id}')" title="使用真实 AI 大模型重新识别">重新识别</button></div>`
      : `<button type="button" class="primary-btn small" onclick="triggerRecognition('${item.id}')">开始识别</button>`;
    const outputInfo = recStatus === 'done'
      ? '<span class="badge success">OpenAPI 草案已生成</span>'
      : '<span class="muted-line">-</span>';
    return `<tr><td><strong>${text(item.name || '未命名资料')}</strong></td><td>${text(item.project_name || item.project_id || '-')}</td><td><span class="cap-chip">${text(item.type || '-')}</span></td><td>${text(item.auth_mode || '-')}</td><td>${statusBadge}</td><td>${recBadge}</td><td>${outputInfo}</td><td>${actionBtn}</td></tr>`;
  }), '暂无业务资料。点击右上角「导入业务资料」开始接入。', 8);

  // 识别进度看板
  const total = items.length;
  const recognized = items.filter(item => (item.recognition_status || 'draft') === 'done').length;
  const pending = items.filter(item => (item.recognition_status || 'draft') === 'pending').length;
  const draftCount = items.filter(item => (item.recognition_status || 'draft') === 'draft').length;
  renderMetricSummary('intakeProgressBoard', [
    { label: '资料总数', value: total, meta: '已接入' },
    { label: '已识别', value: recognized, meta: '等待确认后进入 Tool 映射' },
    { label: '识别中', value: pending, meta: 'AI 正在识别业务资料中的接口定义' },
    { label: '待识别', value: draftCount, meta: '等待触发识别' }
  ]);
}

// ============================================================
// 3. 接口识别 — AI 识别 + OpenAPI + 确认 + 下载
// ============================================================
function renderRecognition() {
  const specs = list(state.openapiSpecs);

  // 步骤条
  const stepBar = $('recognitionStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(2);

  // 草案列表卡片
  renderCardList('openapiSpecList', specs.map(item => {
    const isActive = state.selectedOpenapiSpecId === item.id;
    const endpoints = item.spec ? extractEndpointCount(item.spec) : 0;
    const isAISpec = (item.title || '').includes('AI');
    return `<div class="info-card" style="cursor:pointer;border:${isActive ? '2px solid var(--primary)' : '1px solid var(--line)'}" onclick="selectOpenapiSpec('${item.id}')"><h4>${text(item.source_name || item.title || 'OpenAPI 草案')}${isAISpec ? ' <span class="badge info" style="font-size:9px">AI</span>' : ''}</h4><p class="muted-line">${text(item.title || '-')}</p><p>${badge(item.status || 'draft')} \u00b7 ${endpoints} 个端点</p></div>`;
  }), '暂无 OpenAPI 草案。请先在「资料接入」页触发接口识别。');

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
function renderTooling() {
  const assets = list(state.assets);
  const policies = list(state.policies);
  const allTools = assets.reduce((sum, asset) => sum + list(asset.tools).length, 0);
  const confirmedSpecs = list(state.openapiSpecs).filter(item => item.status === 'confirmed').length;

  // 步骤条
  const stepBar = $('toolingStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(3);

  renderMetricSummary('toolingSummary', [
    { label: 'OpenAPI 草案（已确认）', value: confirmedSpecs, meta: '已确认，可进入 Tool 映射阶段' },
    { label: '已映射 MCP Tool', value: allTools, meta: '全部资产汇总' },
    { label: 'MCP 资产', value: assets.length, meta: '已完成 Tool 装配' },
    { label: '安全规则', value: policies.length, meta: '认证/限流/脱敏' }
  ]);

  renderCardList('toolMappingList', assets.map(asset => {
    const tools = list(asset.tools);
    const policy = policies.find(p => p.project_id === asset.project_id);
    const maskingRules = parseRuleList(policy?.masking_rules);
    // 区分 AI 生成的完整 tool 对象和旧的字符串数组
    const aiTools = tools.filter(t => typeof t === 'object' && t !== null);
    const isAIGenerated = aiTools.length > 0;
    const isPublic = asset.visibility === 'public';
    const visBadge = isPublic
      ? '<span class="badge success" style="font-size:10px">🌐 公开</span>'
      : '<span class="badge warning" style="font-size:10px">🔒 内部</span>';
    return `<div class="info-card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div><h4 style="margin:0">${displayAssetName(asset.name)}</h4><p class="muted-line" style="margin:4px 0 0">${text(asset.capability || '-')}</p></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${badge(asset.status || 'draft')}<span class="cap-chip">${text(asset.version || '-')}</span>${isAIGenerated ? '<span class="badge info" style="font-size:10px">AI 生成</span>' : ''}${visBadge}</div>
      </div>
      <div style="margin:8px 0;padding:8px 12px;background:${isPublic ? '#f0fdf4' : '#fffbeb'};border:1px solid ${isPublic ? '#bbf7d0' : '#fde68a'};border-radius:8px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:14px">${isPublic ? '🌐' : '🔒'}</span>
          <div>
            <strong style="font-size:13px">${isPublic ? '公开资产' : '内部资产'}</strong>
            <span style="font-size:11px;color:#64748b;margin-left:6px">${isPublic ? '对外可用，Agent 可直接调用' : '含敏感数据，仅限内部调用'}</span>
          </div>
        </div>
        <button type="button" class="${isPublic ? 'ghost-btn' : 'primary-btn'} small" onclick="toggleAssetVisibility('${asset.id}', '${isPublic ? 'internal' : 'public'}')">${isPublic ? '切换为内部' : '切换为公开'}</button>
      </div>
      <div style="margin:10px 0;padding:10px;background:var(--surface-2);border-radius:8px">
        <p class="muted-line" style="margin:0 0 6px;font-weight:650">MCP Tools（${tools.length}）</p>
        ${tools.length ? tools.map(tool => {
          if (typeof tool === 'object' && tool !== null) {
            // AI 生成的完整 tool 对象
            const params = tool.inputSchema?.properties || {};
            const required = tool.inputSchema?.required || [];
            const paramList = Object.keys(params);
            const toolVis = tool.visibility === 'public' ? 'public' : 'internal';
            const visChip = toolVis === 'public'
              ? '<span class="badge success" style="font-size:10px;padding:1px 6px">🌐 公开</span>'
              : '<span class="badge warning" style="font-size:10px;padding:1px 6px">🔒 内部</span>';
            return `<div style="padding:8px 0;border-top:1px solid var(--line)">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span class="badge success" style="font-size:11px">${text(tool.category || asset.category || '未分类')}</span>
                <strong style="font-size:13px">${text(tool.display_name || tool.name)}</strong>
                <code style="font-size:11px;color:var(--primary)">${text(tool.name)}</code>
                ${visChip}
                <span style="font-size:10px;color:#a16207;background:#fef3c7;padding:1px 6px;border-radius:3px">AI 推荐</span>
              </div>
              <p style="margin:3px 0 0;font-size:12px;color:#64748b">${text(tool.description || '')}</p>
              ${tool.sensitivity_reason ? `<p style="margin:2px 0 0;font-size:11px;color:#dc2626">⚠️ ${text(tool.sensitivity_reason)}</p>` : ''}
              ${paramList.length ? `<div style="margin-top:4px;font-size:11px;color:#94a3b8">参数：${paramList.map(p => `<code style="margin-right:6px">${p}${required.includes(p) ? ' *' : ''}</code>`).join('')}</div>` : '<div style="margin-top:4px;font-size:11px;color:#94a3b8">无参数</div>'}
            </div>`;
          }
          const toolName = typeof tool === 'string' ? tool : tool?.name || '-';
          return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span class="badge info">${text(toolName)}</span><span class="muted-line">operationId: ${text(toolName)}</span></div>`;
        }).join('') : '<span class="muted-line">暂无 Tool</span>'}
      </div>
      ${policy ? `<div style="margin-top:8px;padding:10px;background:#fff;border:1px solid var(--line);border-radius:8px">
        <p class="muted-line" style="margin:0 0 6px;font-weight:650">安全规则</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px"><span class="badge warning">${text(policy.auth_mode || '-')}</span><span class="badge info">${text(policy.rate_limit || '-')}</span></div>
        <p class="muted-line" style="margin:4px 0 0">脱敏字段：${maskingRules.length ? text(maskingRules.join(' / ')) : '无'}</p>
      </div>` : '<p class="muted-line" style="margin:8px 0 0">尚未配置安全规则</p>'}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="ghost-btn small" onclick="jumpToAssets('${asset.id}')">查看资产详情</button>
        <button type="button" class="ghost-btn small" onclick="jumpToPublish()">进入测试发布</button>
      </div>
    </div>`;
  }), '暂无 Tool 映射结果。请先在接口识别页确认 OpenAPI 草案，系统将自动映射为 MCP Tool。');
}

// ============================================================
// 5. MCP 资产 — 资产列表 + 8步生成时间线
// ============================================================
function renderAssets() {
  // 步骤条
  const stepBar = $('assetsStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(4);

  renderSimpleRows('assetRows', list(state.assets).map(asset => {
    const tools = list(asset.tools);
    const toolCount = tools.length;
    const aiTools = tools.filter(t => typeof t === 'object' && t !== null);
    const aiBadge = aiTools.length ? '<span class="badge info" style="font-size:10px;margin-left:4px">AI</span>' : '';
    const visBadge = asset.visibility === 'public'
      ? '<span class="badge success" style="font-size:10px">🌐 公开</span>'
      : '<span class="badge warning" style="font-size:10px">🔒 内部</span>';
    return `<tr><td><strong>${displayAssetName(asset.name)}</strong>${aiBadge}</td><td>${badge(asset.status || 'draft')}</td><td>${text(asset.version || '-')}</td><td>${text(asset.source_name || asset.source_id || '-')}</td><td>${text(asset.project_name || asset.project_id || '-')}</td><td>${visBadge}</td><td><button type="button" class="ghost-btn small" onclick="viewAssetTimeline('${asset.id}')">查看时间线</button></td></tr>`;
  }), '暂无 MCP 资产', 7);

  // 8步生成时间线
  renderAssetTimelineList();
}

// 8步生成时间线渲染
function renderAssetTimelineList() {
  const timeline = list(state.timeline);
  const assets = list(state.assets);

  if (!timeline.length) {
    renderCardList('timelineList', [], '暂无 MCP 资产生成轨迹');
    return;
  }

  // 按资产分组
  const grouped = {};
  timeline.forEach(item => {
    if (!grouped[item.asset_id]) grouped[item.asset_id] = [];
    grouped[item.asset_id].push(item);
  });

  const cards = Object.entries(grouped).map(([assetId, steps]) => {
    const asset = assets.find(a => a.id === assetId);
    const assetName = asset ? displayAssetName(asset.name) : (steps[0]?.asset_name || assetId);
    const completedSteps = steps.filter(s => s.status === 'done' || s.status === 'completed').length;
    const totalSteps = 8;

    const stepLabels = [
      '数据源接入', '接口识别', 'OpenAPI 生成', 'Tool 映射',
      '安全配置', '沙箱测试', '灰度发布', '生产发布'
    ];

    const stepHtml = stepLabels.map((label, i) => {
      const step = steps[i];
      const isDone = step && (step.status === 'done' || step.status === 'completed');
      const isPending = step && step.status === 'pending';
      const cls = isDone ? 'tl-step done' : isPending ? 'tl-step pending' : 'tl-step todo';
      const icon = isDone ? '\u2705' : isPending ? '\u23f3' : '\u2b55';
      const time = step?.completed_at || '';
      const operator = step?.operator || '';
      return `<div class="${cls}">
        <span class="tl-icon">${icon}</span>
        <div class="tl-info">
          <span class="tl-label">${label}</span>
          ${time ? `<span class="tl-time">${text(time)}</span>` : ''}
          ${operator ? `<span class="tl-operator">${text(operator)}</span>` : ''}
          ${step?.notes ? `<span class="tl-notes">${text(step.notes)}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    return `<div class="info-card timeline-card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div><h4 style="margin:0">${text(assetName)}</h4><p class="muted-line" style="margin:4px 0 0">${completedSteps}/${totalSteps} 步已完成</p></div>
        <div style="display:flex;gap:6px">
          <button type="button" class="ghost-btn small" onclick="jumpToAssets('${assetId}')">查看资产</button>
          <button type="button" class="ghost-btn small" onclick="jumpToPublish()">查看发布</button>
        </div>
      </div>
      <div class="timeline-track">${stepHtml}</div>
    </div>`;
  });

  renderCardList('timelineList', cards, '暂无 MCP 资产生成轨迹');
}

// ============================================================
// 6. 测试发布 — 沙箱试调 + 版本发布 + 回滚
// ============================================================
function renderPublish() {
  const releases = adminReleases();
  const stepBar = $('publishStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(5);

  // 动态填充沙箱调用的 tool dropdown，包含 AI 生成的资产
  const simSelect = $('simulateTool');
  if (simSelect) {
    const currentVal = simSelect.value;
    const aiAssets = list(state.assets).filter(a => {
      const tools = list(a.tools);
      return tools.some(t => typeof t === 'object');
    });
    // 保留原有静态选项 + 追加 AI 资产
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

  // 填充沙箱综合测试的资产选择 dropdown
  const sandboxSelect = $('sandboxAssetSelect');
  if (sandboxSelect) {
    const currentVal = sandboxSelect.value;
    let options = list(state.assets).map(asset => `<option value="${asset.id}">${displayAssetName(asset.name)}（${asset.project_name || asset.project_id}）</option>`).join('');
    sandboxSelect.innerHTML = options;
    if (currentVal) sandboxSelect.value = currentVal;
  }

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
function renderDeliverables() {
  const stepBar = $('deliveryStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(6);

  const controls = $('deliverableControls');
  if (controls) controls.innerHTML = '<div class="filter-summary"><span>交付资料按项目和类型归档</span></div>';
  renderMetricSummary('deliverableSummary', [
    { label: '交付资料总数', value: list(state.deliverables).length },
    { label: '可下载', value: list(state.deliverables).filter(item => item.status === 'ready').length },
    { label: '生成中', value: list(state.deliverables).filter(item => item.status === 'generating').length },
    { label: '待处理', value: list(state.deliverables).filter(item => ['failed', 'expired', 'revoked'].includes(item.status)).length }
  ]);
  renderSimpleRows('deliverableRows', list(state.deliverables).map(item => {
    const canDownload = item.status === 'ready';
    const typeLabel = {
      'config': '配置包',
      'test-report': '测试报告',
      'log': '调用日志',
      'effect-report': '效果报告',
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
function renderAccess() {
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

  let html = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">`;
  html += `<div class="info-card" style="padding:12px"><h4 style="margin:0;font-size:13px">总凭证数</h4><p style="font-size:22px;font-weight:700;color:#2563eb;margin:4px 0 0">${keys.length}</p></div>`;
  html += `<div class="info-card" style="padding:12px"><h4 style="margin:0;font-size:13px">已启用</h4><p style="font-size:22px;font-weight:700;color:#16a34a;margin:4px 0 0">${enabledCount}</p></div>`;
  html += `<div class="info-card" style="padding:12px"><h4 style="margin:0;font-size:13px">生产环境</h4><p style="font-size:22px;font-weight:700;color:#b45309;margin:4px 0 0">${prodCount}</p></div>`;
  html += `<div class="info-card" style="padding:12px"><h4 style="margin:0;font-size:13px">30天内过期</h4><p style="font-size:22px;font-weight:700;color:${expiringSoon > 0 ? '#dc2626' : '#64748b'};margin:4px 0 0">${expiringSoon}</p></div>`;
  html += `</div>`;

  html += keys.map(key => {
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
  if (node) node.innerHTML = html || `<tr><td colspan="9">${emptyState('暂无 API 凭证。点击「创建 API Key」为接入方生成凭证。')}</td></tr>`;
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
  renderMetricSummary('customerDashboardCards', [
    { label: '已交付 MCP', value: dashboard.asset_count || assets.length, meta: `${dashboard.published_count || 0} 个处于可用状态` },
    { label: '近月调用量', value: dashboard.month_calls || 0, meta: '当前自然月累计' },
    { label: '调用成功率', value: `${dashboard.success_rate ?? 100}%`, meta: '按调用事件统计' },
    { label: '当期金额', value: money(dashboard.month_amount || 0), meta: `账单状态：${displayStatus(dashboard.billing_status || 'pending')}` }
  ]);
  renderCardList('customerAssetCards', assets.map(asset => `<div class="info-card customer-asset-card"><h4>${displayAssetName(asset.name)}</h4><p class="muted-line">${text(asset.capability || '业务能力待补充')}</p><p>${badge(asset.status || 'published')} <span class="cap-chip">${text(asset.version || 'v1.0.0')}</span></p><div class="customer-inline-badges">${list(asset.tools).map(tool => `<span class="badge info">${text(typeof tool === 'string' ? tool : tool?.name || '-')}</span>`).join(' ') || '<span class="muted-line">暂无 Tool 清单</span>'}</div><div class="customer-action-row"><button type="button" class="ghost-btn small" onclick="viewAccessGuide('${asset.id}')">查看接入指引</button></div></div>`), '暂时没有可查看的 MCP 资产');
  renderCardList('customerQuickActions', [
    `<div class="info-card customer-quick-card"><h4>查看接入指引</h4><p>逐个资产查看地址、鉴权方式和接入约束。</p></div>`,
    `<div class="info-card customer-quick-card"><h4>下载交付资料</h4><p>配置包、测试报告、日志与复盘会持续沉淀到交付物下载页。</p></div>`,
    `<div class="info-card customer-quick-card"><h4>关注最近效果</h4><p>调用统计会同步展示近 30 天调用量、成功率和延迟趋势。</p></div>`
  ], '');
  renderCardList('customerAssetSpotlight', assets.slice(0, 3).map(asset => `<div class="info-card"><h4>${displayAssetName(asset.name)}</h4><p>${text(asset.capability || '-')}</p><p class="muted-line">版本 ${text(asset.version || '-')} \u00b7 ${text(displayStatus(asset.status || 'published'))}</p></div>`), '暂无资产运行焦点');
  renderCustomerReleaseTimeline();
}

function renderCustomerUsage() {
  const trends = list(state.customerTrends?.trends);
  const events = list(state.events);
  const maxCalls = Math.max(1, ...trends.map(item => Number(item.calls || 0)));
  renderMetricSummary('customerUsageCards', [
    { label: '累计调用量', value: state.customerTrends?.total_calls || 0, meta: '当前客户范围内累计' },
    { label: '平均延迟', value: `${state.customerTrends?.avg_latency || 0} ms`, meta: '按全部调用事件计算' },
    { label: '成功率', value: `${state.customerTrends?.success_rate ?? 100}%`, meta: '近 30 天趋势已纳入统计' },
    { label: '已使用资产', value: new Set(events.map(item => item.asset_id || item.asset_name)).size, meta: '发生过调用的 MCP 数量' }
  ]);
  const trendBars = trends.slice(-10).map(item => {
    const height = Math.max(18, Math.round(Number(item.calls || 0) / maxCalls * 140));
    return `<div class="customer-trend-bar"><strong>${text(item.calls || 0)}</strong><div class="bar" style="height:${height}px"></div><small>${text(item.date || '-')}</small></div>`;
  });
  const trendNode = $('customerUsageTrendBars');
  if (trendNode) trendNode.innerHTML = trendBars.length ? `<div class="customer-trend-chart">${trendBars.join('')}</div>` : emptyState('近 30 天还没有调用趋势数据');
  renderCardList('customerUsageHighlights', [
    `<div class="info-card"><h4>调用观察</h4><p>近月累计 ${text(state.customerTrends?.total_calls || 0)} 次调用，成功率 ${text(state.customerTrends?.success_rate ?? 100)}%。</p></div>`,
    `<div class="info-card"><h4>性能观察</h4><p>平均延迟 ${text(state.customerTrends?.avg_latency || 0)} ms，建议持续观察高峰时段变化。</p></div>`,
    `<div class="info-card"><h4>最近 Trace</h4><p>${text(events[0]?.trace_id || '暂无最近调用')}</p></div>`
  ], '暂无调用观察');
  renderSimpleRows('customerUsageRows', events.slice(0, 10).map(item => `<tr><td>${text(item.created_at || '-')}</td><td>${text(item.asset_name || item.asset_id || '-')}</td><td>${text(item.business_result || '-')}</td><td>${badge(item.status || 'draft')}</td><td>${text(item.latency_ms ?? '-')}</td><td>${text(item.trace_id || '-')}</td></tr>`), '暂无调用记录', 6);
}

function renderCustomerBilling() {
  const records = adminBilling();
  const dashboard = state.customerDashboard || {};
  const summary = $('customerBillingSummary');
  if (summary) {
    summary.innerHTML = `<div class="panel-head"><h3>当期账单摘要</h3></div><div class="customer-bill-body"><p>当期金额：<strong>${money(dashboard.month_amount || 0)}</strong></p><p>账单状态：${badge(dashboard.billing_status || 'pending')}</p><p>账单条目：${text(records.length)}</p></div>`;
  }
  renderCardList('customerBillingHighlights', [
    `<div class="info-card"><h4>账单观察</h4><p>当前账期已累计 ${money(dashboard.month_amount || 0)}，可在本页查看历史明细。</p></div>`,
    `<div class="info-card"><h4>确认状态</h4><p>${text(displayStatus(dashboard.billing_status || 'pending'))}</p></div>`,
    `<div class="info-card"><h4>最近账期</h4><p>${text(records[0]?.period || '暂无账单记录')}</p></div>`
  ], '暂无账单观察');
  const listNode = $('customerBillingList');
  if (!listNode) return;
  listNode.innerHTML = records.length ? records.slice(0, 6).map(item => `<article class="panel customer-bill-panel"><div class="panel-head"><h3>${text(item.item || '账单条目')}</h3><span>${badge(item.status || 'pending')}</span></div><div class="customer-bill-body"><p>账期：${text(item.period || '-')}</p><p>金额：${money(item.amount || 0)}</p><p>计费类型：${text(item.billing_type || '-')}</p><p>调用量：${text(item.usage_count || item.calls || '-')}</p></div></article>`).join('') : emptyState('暂无账单记录');
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
    ...assets.slice(0, 4).map(asset => `<div class="info-card"><h4>${displayAssetName(asset.name)}</h4><p>${text(asset.capability || '业务能力说明待补充')}</p><div class="customer-action-row"><button type="button" class="ghost-btn small" onclick="viewAccessGuide('${asset.id}')">查看接入指引</button></div></div>`)
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

window.switchCustomerPage = function switchCustomerPage(pageId) {
  switchPage(pageId);
};

window.jumpToPage = function jumpToPage(pageId) {
  switchPage(pageId);
  renderAll();
};

window.viewAssetTimeline = function viewAssetTimeline(assetId) {
  state.selectedTimelineAssetId = assetId;
  // 滚动到时间线区域
  const tl = $('timelineList');
  if (tl) {
    tl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
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
  renderTooling();
  renderAssets();
  renderPublish();
  renderDeliverables();
  renderAccess();
  renderGateway();
  renderPolicyChanges();
  renderUsage();
  renderApiKeys();
  renderKnowledge();
  renderBilling();
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
  switchPage(state.currentPage);
}
