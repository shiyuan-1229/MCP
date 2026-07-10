import { statusText } from './state.js';

export const permissionDeniedMessage = '没有权限执行此操作。';
export const sessionExpiredMessage = '登录已过期，请重新登录。';

export function $(id) {
  return document.getElementById(id);
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function text(value) {
  if (value == null || value === '') return '-';
  return escapeHtml(value);
}

export function displayStatus(status) {
  return statusText[status] || status || '-';
}

export function money(value) {
  return `¥${Number(value || 0).toLocaleString('zh-CN')}`;
}

export function metric(label, value, meta = '') {
  return `
    <div class="metric-card">
      <div class="label">${text(label)}</div>
      <div class="value">${text(value)}</div>
      <div class="meta">${text(meta)}</div>
    </div>`;
}

export function badgeClass(status) {
  if (['published', 'running', 'connected', 'indexed', 'enabled', 'ready', 'confirmed', 'success'].includes(status)) return 'success';
  if (['testing', 'tested', 'generating', 'pending', 'debugging'].includes(status)) return 'warning';
  if (['failed', 'revoked', 'expired', 'error'].includes(status)) return 'danger';
  if (['draft', 'data-source'].includes(status)) return 'info';
  return 'info';
}

export function badge(status) {
  return `<span class="badge ${badgeClass(status)}">${text(displayStatus(status))}</span>`;
}

export function progress(value) {
  const width = Math.max(0, Math.min(100, Number(value || 0)));
  return `<div class="progress" title="${width}%"><span style="width:${width}%"></span></div>`;
}

export function emptyState(message) {
  return `<div class="empty-state">${text(message)}</div>`;
}

export function showLogin() {
  $('login').classList.remove('hidden');
  $('app').classList.add('hidden');
}

export function showApp() {
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
}

let toastTimer;
export function showToast(message, type = 'info') {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message || permissionDeniedMessage;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 2800);
}

export function toggle(value, id, attrs = '') {
  const checked = value ? 'checked' : '';
  return `<label class="toggle-switch"><input type="checkbox" id="${id}" ${checked} ${attrs}><span class="toggle-slider"></span></label>`;
}

export function confirmDialog(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box confirm-box">
      <p>${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button type="button" class="ghost-btn" data-action="cancel">取消</button>
        <button type="button" class="primary-btn danger" data-action="confirm">确认</button>
      </div>
    </div>`;

  overlay.addEventListener('click', event => {
    const action = event.target?.dataset?.action;
    if (action === 'cancel') {
      document.body.removeChild(overlay);
      return;
    }
    if (action === 'confirm') {
      document.body.removeChild(overlay);
      onConfirm?.();
      return;
    }
    if (event.target === overlay) document.body.removeChild(overlay);
  });

  document.body.appendChild(overlay);
}

export function openModal(title, fields, values, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3>${escapeHtml(title)}</h3>
      <form id="modalForm" onsubmit="return false">
        ${fields.map(field => {
          const current = values?.[field.key] ?? field.default ?? '';
          if (field.type === 'select') {
            return `<label><span>${escapeHtml(field.label)}</span><select id="modal_${field.key}">${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${(current === option.value || (!current && option.selected)) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
          }
          if (field.type === 'textarea') {
            return `<label><span>${escapeHtml(field.label)}</span><textarea id="modal_${field.key}" rows="${field.rows || 3}" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(current)}</textarea></label>`;
          }
          if (field.type === 'number') {
            return `<label><span>${escapeHtml(field.label)}</span><input type="number" id="modal_${field.key}" value="${escapeHtml(current)}" placeholder="${escapeHtml(field.placeholder || '')}"></label>`;
          }
          return `<label><span>${escapeHtml(field.label)}</span><input type="text" id="modal_${field.key}" value="${escapeHtml(current)}" placeholder="${escapeHtml(field.placeholder || '')}"></label>`;
        }).join('')}
      </form>
      <div class="modal-actions">
        <button type="button" class="ghost-btn" data-action="cancel">取消</button>
        <button type="button" class="primary-btn" data-action="save">保存</button>
      </div>
    </div>`;

  overlay.addEventListener('click', event => {
    const action = event.target?.dataset?.action;
    if (action === 'cancel') {
      document.body.removeChild(overlay);
      return;
    }
    if (action === 'save') {
      const data = {};
      fields.forEach(field => {
        const el = $(`modal_${field.key}`);
        if (el) data[field.key] = el.value;
      });
      document.body.removeChild(overlay);
      onSave?.(data);
      return;
    }
    if (event.target === overlay) document.body.removeChild(overlay);
  });

  document.body.appendChild(overlay);
}

