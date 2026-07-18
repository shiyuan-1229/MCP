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
