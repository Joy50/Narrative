import { request } from './client';

export async function gpobGet(path) {
  return request(`/api/gpob/${path}`);
}

export async function gpobSend(path, { method = 'POST', body } = {}) {
  return request(`/api/gpob/${path}`, { method, body });
}

export function exportGpobUrl() {
  const base = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : '');
  return `${base}/api/gpob/export/`;
}
