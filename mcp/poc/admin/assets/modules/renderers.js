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
      aiBadge.textContent = `AI 已就绪 · ${cfg.model || ''}`;
      aiBadge.style.cssText = 'font-size:11px;padding:2px 10px;border-radius:4px;background:#dcfce7;color:#16a34a;font-weight:600';
    } else {
      aiBadge.textContent = 'AI 未配置';
      aiBadge.style.cssText = 'font-size:11px;padding:2px 10px;border-radius:4px;background:#fef9c3;color:#a16207;font-weight:600';
    }
  }

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
  updateBatchBar();

  // 识别进度看板
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
function renderTooling() {
  const allAssets = list(state.assets);
  const policies = list(state.policies);

  // 企业筛选器
  const filter = $('toolingCustomerFilter');
  if (filter) {
    const currentVal = filter.value;
    const customerIds = [...new Set(allAssets.map(a => a.customer_id).filter(Boolean))];
    filter.innerHTML = '<option value="">全部企业</option>' + customerIds.map(cid => {
      const cname = allAssets.find(a => a.customer_id === cid)?.customer_name || cid;
      return `<option value="${cid}">${escapeHtml(cname)}</option>`;
    }).join('');
    if (currentVal) filter.value = currentVal;
  }

  const selectedCustomer = filter?.value || '';
  const assets = selectedCustomer ? allAssets.filter(a => a.customer_id === selectedCustomer) : allAssets;
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

  // Tool 映射清单 — 按企业分组
  const toolListEl = $('toolMappingList');
  if (toolListEl) {
    const grouped = {};
    assets.forEach(asset => {
      const cname = asset.customer_name || asset.project_name || '其他';
      if (!grouped[cname]) grouped[cname] = [];
      grouped[cname].push(asset);
    });

    let html = '';
    const cnames = Object.keys(grouped);
    if (!cnames.length) {
      html = emptyState('暂无 Tool 映射结果。请先在接口识别页确认 OpenAPI 草案，系统将自动映射为 MCP Tool。');
    } else {
      cnames.forEach(cname => {
        html += `<div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;padding:6px 10px;background:var(--surface-2);border-radius:4px">🏢 ${escapeHtml(cname)}</div>`;
        html += grouped[cname].map(asset => {
    const tools = list(asset.tools);
    const policy = policies.find(p => p.project_id === asset.project_id);
    const maskingRules = parseRuleList(policy?.masking_rules);
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
                <span style="margin-left:auto;display:flex;gap:4px">
                  <button type="button" class="ghost-btn small" style="font-size:11px;padding:2px 8px" onclick="editTool('${asset.id}','${escapeJs(tool.name)}')">编辑</button>
                  <button type="button" class="ghost-btn small" style="font-size:11px;padding:2px 8px;color:#dc2626" onclick="deleteTool('${asset.id}','${escapeJs(tool.name)}')">删除</button>
                </span>
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
        <button type="button" class="ghost-btn small" onclick="addTool('${asset.id}')">+ 新增 Tool</button>
        <button type="button" class="ghost-btn small" onclick="jumpToAssets('${asset.id}')">查看资产详情</button>
        <button type="button" class="ghost-btn small" onclick="jumpToPublish()">进入测试发布</button>
      </div>
    </div>`;
        }).join('');
        html += `</div>`;
      });
    }
    toolListEl.innerHTML = html;
  }
}

// ============================================================
// 5. MCP 资产 — 资产列表
// ============================================================
function renderAssets() {
  // 步骤条
  const stepBar = $('assetsStepBar');
  if (stepBar) stepBar.innerHTML = renderStepBar(4);

  renderSimpleRows('assetRows', list(state.assets).map(asset => {
    const tools = list(asset.tools);
    const aiTools = tools.filter(t => typeof t === 'object' && t !== null);
    const aiBadge = aiTools.length ? '<span class="badge info" style="font-size:10px;margin-left:4px">AI</span>' : '';
    const visBadge = asset.visibility === 'public'
      ? '<span class="badge success" style="font-size:10px">🌐 公开</span>'
      : '<span class="badge warning" style="font-size:10px">🔒 内部</span>';
    return `<tr><td><strong>${displayAssetName(asset.name)}</strong>${aiBadge}</td><td>${badge(asset.status || 'draft')}</td><td>${text(asset.version || '-')}</td><td>${text(asset.source_name || asset.source_id || '-')}</td><td>${text(asset.project_name || asset.project_id || '-')}</td><td>${visBadge}</td></tr>`;
  }), '暂无 MCP 资产', 6);

  // 复用建议与复盘汇总
  renderReuseSuggestions();
  renderRetroSummaryBoard();

  const assets = list(state.assets);

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

  // 左侧：Tool 库（汇总所有 Tool，去重）
  const toolLib = $('assetsToolLibrary');
  if (toolLib) {
    const toolMap = {};
    filteredAssets.forEach(asset => {
      list(asset.tools).forEach(t => {
        if (typeof t === 'object' && t.name && !toolMap[t.name]) {
          toolMap[t.name] = { ...t, assetName: asset.name, assetId: asset.id };
        }
      });
    });
    const tools = Object.values(toolMap);
    toolLib.innerHTML = tools.length ? tools.map(tool => {
      const visChip = tool.visibility === 'public'
        ? '<span class="badge success" style="font-size:9px">🌐</span>'
        : '<span class="badge warning" style="font-size:9px">🔒</span>';
      return `<div class="info-card" style="padding:10px;display:flex;gap:8px;align-items:start">
        <input type="checkbox" class="tool-lib-check" value="${escapeHtml(tool.name)}" style="margin-top:3px;cursor:pointer">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <strong style="font-size:12px">${text(tool.display_name || tool.name)}</strong>
            <code style="font-size:10px;color:var(--primary)">${text(tool.name)}</code>
            ${visChip}
          </div>
          <p style="margin:2px 0 0;font-size:11px;color:#64748b">${text(tool.description || '')}</p>
        </div>
      </div>`;
    }).join('') : emptyState('暂无 Tool');
  }

  // 右侧：MCP 资产列表
  const mcpList = $('assetsMcpList');
  if (mcpList) {
    if (!filteredAssets.length) {
      mcpList.innerHTML = emptyState('暂无 MCP 资产');
    } else {
      mcpList.innerHTML = filteredAssets.map(asset => {
        const tools = list(asset.tools);
        const isNew = (asset.name || '').includes('[NEW]');
        const visBadge = asset.visibility === 'public' ? '🌐 公开' : '🔒 内部';
        return `<div class="info-card" style="padding:12px;${isNew ? 'border:2px solid #7c3aed' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <input type="checkbox" class="mcp-check" value="${asset.id}" style="cursor:pointer">
              <strong style="font-size:14px">${displayAssetName(asset.name)}</strong>
              ${isNew ? '<span class="badge info" style="font-size:9px">NEW</span>' : ''}
              ${badge(asset.status || 'draft')}
              <span class="badge ${asset.visibility === 'public' ? 'success' : 'warning'}" style="font-size:9px">${visBadge}</span>
            </div>
          </div>
          <p class="muted-line" style="margin:0 0 6px;font-size:12px">${text(asset.capability || '-')}</p>
          <div style="padding:8px;background:var(--surface-2);border-radius:6px;margin-bottom:6px">
            <span class="muted-line" style="font-size:11px;font-weight:600">Tools (${tools.length})：</span>
            ${tools.map(t => {
              const tn = typeof t === 'object' ? t.name : t;
              const td = typeof t === 'object' ? (t.display_name || t.description || '') : '';
              return `<span class="badge info" style="font-size:10px;margin:2px" title="${escapeHtml(td)}">${escapeHtml(tn)}</span>`;
            }).join('')}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span class="muted-line" style="font-size:11px">v${text(asset.version || '0.1.0')}</span>
            <button type="button" class="ghost-btn small" onclick="editAsset('${asset.id}')">编辑</button>
            <button type="button" class="ghost-btn small" style="color:#dc2626" onclick="deleteSingleAsset('${asset.id}')">删除</button>
          </div>
        </div>`;
      }).join('');
    }
  }}

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
  if (stepBar) stepBar.innerHTML = renderStepBar(5);

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
  if (stepBar) stepBar.innerHTML = renderStepBar(6);
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

window.handoffBuilderRequest = function handoffBuilderRequest() {
  window.submitBuilderRequest('accepted');
  showToast('已将需求草案标记为待人工确认。', 'success');
};

window.submitBuilderRequest = function submitBuilderRequest(historyStatus = 'submitted') {
  ensureCustomerBuilderState();
  const result = state.customerBuilderResult || buildCustomerBuilderResult(state.customerBuilderDraft);
  const historyEntry = upsertCustomerBuilderHistory(historyStatus);
  const request = {
    id: `builder_${Date.now()}`,
    prompt: state.customerBuilderDraft,
    result,
    status: 'submitted',
    created_at: new Date().toISOString(),
    customer_name: state.user?.display_name || state.user?.username || '客户'
  };
  state.builderRequests = [request, ...list(state.builderRequests)];
  persistBuilderRequests();
  if (historyEntry) state.customerBuilderSelectedHistoryId = historyEntry.id;
  showToast('需求已提交给 MCP 承接流程。', 'success');
  renderAll();
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
  renderCustomerBuilder();
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
  renderBuilderValueBoard();
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
