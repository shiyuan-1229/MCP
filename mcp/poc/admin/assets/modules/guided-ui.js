import { deriveGuidedWork } from './guidance.js';
import { text } from './ui.js';

function escapeAttribute(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

export function renderGuidedWorkQueue(state, $) {
  const root = $('guidedWorkQueue');
  const summary = $('guidedWorkQueueSummary');
  if (!root || !summary) return;
  const tasks = deriveGuidedWork(state).slice(0, 8);
  summary.textContent = tasks.length ? `当前有 ${tasks.length} 项待推进事项。` : '当前暂无待办。';
  root.innerHTML = tasks.length
    ? tasks.map((task, index) => `<article class="guided-work-card priority-${task.priority}"><span class="guided-work-order">${index + 1}</span><div><strong>${text(task.reason)}</strong><p>${text(task.actionLabel)}</p></div><button type="button" class="primary-btn small" onclick="navigateToPage('${task.pageId}', { projectId: '${escapeAttribute(task.projectId)}', assetId: '${escapeAttribute(task.assetId)}', focusId: '${escapeAttribute(task.focusId)}', reason: '${escapeAttribute(task.reason)}' })">继续处理</button></article>`).join('')
    : '<div class="empty-state">暂无待办。</div>';
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

