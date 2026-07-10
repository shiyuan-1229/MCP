const BASE = location.protocol === 'file:' ? 'http://localhost:3100' : '';

export async function request(state, path, options = {}, onUnauthorized) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const url = new URL(path, BASE || location.origin);
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    });
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    onUnauthorized?.();
    const error = new Error('登录已过期，请重新登录。');
    error.status = 401;
    throw error;
  }

  if (!res.ok) {
    const message = res.status === 403
      ? '没有权限执行此操作。'
      : data.error || `请求失败（${res.status}）`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}
