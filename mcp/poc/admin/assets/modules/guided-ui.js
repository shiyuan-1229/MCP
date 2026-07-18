import { deriveGuidedWork } from './guidance.js';
import { text } from './ui.js';

function escapeAttribute(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

function actionButton(task, label, className = 'ghost-btn small') {
  return `<button type="button" class="${className}" onclick="navigateToPage('${task.pageId}', { projectId: '${escapeAttribute(task.projectId)}', assetId: '${escapeAttribute(task.assetId)}', focusId: '${escapeAttribute(task.focusId)}', reason: '${escapeAttribute(task.reason)}' })">${label}</button>`;
}

function taskPriorityLabel(priority) {
  return priority <= 1 ? 'P0' : 'P1';
}

export function renderGuidedWorkQueue(state, $) {
  const root = $('guidedWorkQueue');
  const summary = $('guidedWorkQueueSummary');
  if (!root || !summary) return;

  const tasks = deriveGuidedWork(state);
  const sourceTasks = tasks.filter(task => task.stage === 'intake');
  const decisionTasks = tasks.filter(task => task.stage !== 'intake');
  const decisionGroups = Object.values(decisionTasks.reduce((groups, task) => {
    const key = `${task.stage}:${task.actionLabel}`;
    const group = groups[key] || { ...task, count: 0 };
    group.count += 1;
    groups[key] = group;
    return groups;
  }, {}));
  const focusTask = decisionGroups[0] || sourceTasks[0] || null;
  const focusIsBatch = !decisionGroups.length && sourceTasks.length > 0;
  const focusTitle = focusIsBatch
    ? `${sourceTasks.length}\u4efd\u4e1a\u52a1\u8d44\u6599\u7b49\u5f85 AI \u8bc6\u522b`
    : focusTask?.count > 1 ? `${focusTask.count}\u9879${focusTask.actionLabel}` : focusTask?.actionLabel || '';
  const focusReason = focusIsBatch
    ? '\u8d44\u6599\u5df2\u63a5\u5165\uff0c\u53ef\u4ee5\u4e00\u6b21\u63a8\u8fdb\u591a\u4e2a\u9879\u76ee\u3002'
    : focusTask?.reason || '';
  const focusAction = focusIsBatch ? '\u6279\u91cf\u63d0\u4ea4 AI \u8bc6\u522b' : focusTask?.actionLabel || '';
  const remainingDecisions = decisionGroups.slice(focusIsBatch ? 0 : 1, 3);
  const blockedAssets = (Array.isArray(state.assets) ? state.assets : []).filter(item => item.status === 'acceptance_failed').length;
  const pendingDeliverables = (Array.isArray(state.deliverables) ? state.deliverables : []).filter(item => item.status !== 'ready').length;
  const publishedAssets = (Array.isArray(state.releases) ? state.releases : []).filter(item => item.status === 'published').length;
  const failedEvents = (Array.isArray(state.events) ? state.events : []).filter(item => {
    const status = String(item.status || '').toLowerCase();
    return ['error', 'failed', 'timeout'].includes(status) || Number(item.status_code) >= 500;
  }).length;
  const blockedDeliverables = (Array.isArray(state.deliverables) ? state.deliverables : []).filter(item => ['failed', 'expired', 'revoked'].includes(item.status)).length;
  const authorizationFailures = (Array.isArray(state.events) ? state.events : []).filter(item => [401, 403].includes(Number(item.status_code))).length;

  summary.textContent = tasks.length
    ? `\u5f53\u524d\u6709 ${tasks.length} \u9879\u5f85\u63a8\u8fdb\u4e8b\u9879\uff0c${sourceTasks.length ? `${sourceTasks.length} \u4efd\u8d44\u6599\u53ef\u6279\u91cf\u5904\u7406\u3002` : '\u8bf7\u5148\u5904\u7406\u963b\u65ad\u4ea4\u4ed8\u7684\u4e8b\u9879\u3002'}`
    : '\u5f53\u524d\u6ca1\u6709\u963b\u65ad\u4ea4\u4ed8\u7684\u5f85\u529e\u3002';

  if (!tasks.length) {
    root.innerHTML = '<div class="empty-state">\u6682\u65e0\u5f85\u529e\u3002\u53ef\u524d\u5f80\u9879\u76ee\u8d44\u4ea7\u5e93\u67e5\u770b\u5df2\u5b8c\u6210\u8d44\u4ea7\u3002</div>';
    return;
  }

  root.innerHTML = `
    <div class="guided-workbench">
      <div class="guided-work-main">
      <section class="guided-work-focus">
        <div class="guided-focus-copy"><span class="guided-priority priority-${focusTask?.priority || 2}">${taskPriorityLabel(focusTask?.priority || 2)} \u5f53\u524d\u6700\u4f18\u5148</span><h4>${text(focusTitle)}</h4><p>${text(focusReason)}</p></div>
        ${actionButton(focusIsBatch ? { ...focusTask, pageId: 'intake' } : focusTask, focusAction, 'primary-btn small')}
      </section>
      ${remainingDecisions.length ? `<section class="guided-work-decision-list"><div class="guided-work-section-head"><h4>\u9700\u8981\u4eba\u5de5\u5224\u65ad</h4><span>${remainingDecisions.length} \u9879</span></div>${remainingDecisions.map(task => `<article class="guided-decision-row"><span class="guided-priority priority-${task.priority}">${taskPriorityLabel(task.priority)}</span><div><strong>${text(task.count > 1 ? `${task.count}\u9879${task.actionLabel}` : task.actionLabel)}</strong><p>${text(task.reason)}</p></div>${actionButton(task, '\u53bb\u5904\u7406')}</article>`).join('')}</section>` : ''}
      ${sourceTasks.length && !focusIsBatch ? `<section class="guided-work-batch"><div><h4>${sourceTasks.length}\u4efd\u4e1a\u52a1\u8d44\u6599\u7b49\u5f85 AI \u8bc6\u522b</h4><p>\u5df2\u6309\u9879\u76ee\u805a\u5408\uff0c\u53ef\u4ee5\u6279\u91cf\u63a8\u8fdb\u3002</p></div>${actionButton({ ...sourceTasks[0], pageId: 'intake' }, '\u6279\u91cf\u63d0\u4ea4 AI \u8bc6\u522b', 'primary-btn small')}</section>` : ''}
      </div>
      <aside class="guided-work-side">
      <section class="guided-work-impact"><div class="guided-work-section-head"><h4>\u4ea4\u4ed8\u5f71\u54cd</h4><button type="button" class="ghost-btn small" onclick="navigateToPage('monitoring')">\u67e5\u770b\u6cbb\u7406\u8fd0\u8425</button></div><div class="guided-impact-grid"><div><strong>${sourceTasks.length}</strong><span>\u5f85\u8bc6\u522b\u8d44\u6599</span></div><div><strong>${blockedAssets}</strong><span>\u963b\u585e\u53d1\u5e03</span></div><div><strong>${pendingDeliverables}</strong><span>\u5f85\u8865\u4ea4\u4ed8</span></div><div><strong>${publishedAssets}</strong><span>\u5df2\u53d1\u5e03 MCP</span></div></div></section>
        <section class="guided-work-risk"><div class="guided-work-section-head"><h4>\u8fd0\u884c\u4e0e\u4ea4\u4ed8\u98ce\u9669</h4><span>${failedEvents + blockedDeliverables} \u9879\u9700\u5173\u6ce8</span></div><div class="guided-risk-grid"><div><strong>${failedEvents}</strong><span>\u8c03\u7528\u5f02\u5e38</span></div><div><strong>${blockedDeliverables}</strong><span>\u4ea4\u4ed8\u5931\u8d25</span></div></div>${failedEvents + blockedDeliverables ? '<p class="guided-risk-note">\u8bf7\u4f18\u5148\u6392\u67e5\u5f02\u5e38\u8c03\u7528\u548c\u5931\u6548\u8d44\u6599\uff0c\u518d\u7ee7\u7eed\u53d1\u5e03\u6216\u4ea4\u4ed8\u3002</p>' : '<p class="guided-risk-note">\u5f53\u524d\u6ca1\u6709\u8fd0\u884c\u6216\u4ea4\u4ed8\u963b\u65ad\u9879\u3002</p>'}</section>
        <section class="guided-work-auth"><div class="guided-work-section-head"><h4>\u51ed\u8bc1\u4e0e\u6388\u6743</h4><span>${authorizationFailures} \u9879\u5f02\u5e38</span></div>${authorizationFailures ? '<p class="guided-risk-note">\u8bf7\u524d\u5f80\u5e73\u53f0\u8bbe\u7f6e\u5904\u7406\u5931\u6548\u51ed\u8bc1\u6216\u8bbf\u95ee\u6388\u6743\u3002</p>' : '<p class="guided-risk-note">\u5f53\u524d\u6ca1\u6709\u51ed\u8bc1\u6216\u6388\u6743\u5f02\u5e38\u3002</p>'}</section>
      </aside>
    </div>`;
}

export function renderGuidancePanels(state) {
  const stages = { intake: 'intake', recognition: 'review', tooling: 'tooling', publish: 'publish', delivery: 'delivery' };
  const labels = { intake: '\u8d44\u6599\u63a5\u5165', review: 'AI \u8bc6\u522b\u4e0e\u5ba1\u6838', tooling: '\u7ec4\u88c5 MCP \u8d44\u4ea7', publish: '\u6d4b\u8bd5\u4e0e\u53d1\u5e03', delivery: '\u4ea4\u4ed8\u786e\u8ba4' };
  const tasks = deriveGuidedWork(state);
  Object.entries(stages).forEach(([pageId, stage]) => {
    const page = document.getElementById(pageId); if (!page) return;
    const task = tasks.find(item => item.stage === stage); let root = document.getElementById(`${pageId}Guidance`);
    if (!root) { root = document.createElement('div'); root.id = `${pageId}Guidance`; root.className = 'guided-page-guidance'; page.prepend(root); }
    const action = task ? `<button type="button" class="primary-btn small" onclick="navigateToPage('${task.pageId}')">${text(task.actionLabel)}</button>` : '';
    root.innerHTML = `<article class="guided-stage-panel"><div><p class="eyebrow">\u5f53\u524d\u9636\u6bb5</p><h3>${labels[stage]}</h3><p>${text(task?.reason || '\u5f53\u524d\u9636\u6bb5\u6ca1\u6709\u963b\u65ad\u9879\u3002')}</p></div>${action}</article>`;
  });
}

export function enhanceActionableEmptyStates(state, $) {
  void state;
  const sourceRows = $('sourceRows');
  if (sourceRows?.querySelector('.empty-state')) {
    sourceRows.innerHTML = `<tr><td colspan="9"><div class="empty-state"><p>\u8fd8\u6ca1\u6709\u4e1a\u52a1\u8d44\u6599\u3002</p><button type="button" class="primary-btn small" data-guided-empty-action="upload" onclick="document.getElementById('createDataSourceBtn')?.click()">\u4e0a\u4f20\u4e1a\u52a1\u8d44\u6599</button></div></td></tr>`;
  }

  const assetsMcpList = $('assetsMcpList');
  if (assetsMcpList?.querySelector('.empty-state')) {
    assetsMcpList.innerHTML = `<div class="empty-state"><p>\u8fd8\u6ca1\u6709 MCP \u8349\u7a3f\u3002</p><button type="button" class="primary-btn small" data-guided-empty-action="tooling" onclick="navigateToPage('tooling')">\u786e\u8ba4 Tool \u8fb9\u754c</button></div>`;
  }
}

export function getGuidedRecovery(type) {
  if (['401', '403'].includes(type)) return { pageId: 'settings', label: '\u5904\u7406\u6388\u6743\u6216\u51ed\u8bc1', reason: '\u8c03\u7528\u56e0\u6388\u6743\u5931\u8d25\u88ab\u963b\u65ad' };
  if (type === '400') return { pageId: 'tooling', label: '\u786e\u8ba4 Tool \u8fb9\u754c', reason: '\u8c03\u7528\u53c2\u6570\u4e0d\u7b26\u5408 Tool \u8fb9\u754c' };
  if (type === 'timeout' || type === '5xx') return { pageId: 'intake', label: '\u68c0\u67e5\u63a5\u5165\u5065\u5eb7', reason: '\u8d44\u6599\u6e90\u6216\u63a5\u5165\u5065\u5eb7\u5f02\u5e38' };
  return { pageId: 'monitoring', label: '\u6253\u5f00 Trace', reason: '\u9700\u8981\u67e5\u770b\u8c03\u7528\u94fe\u8def' };
}