const API_BASE = process.env.REACT_APP_API_URL || '';
const SESSION_KEY = 'ns_session';

export function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function mapUser(payload) {
  if (!payload) return null;
  return {
    operatorId: payload.operator_id || payload.operatorId,
    name: payload.name,
    initials: payload.initials,
    role: payload.role,
    clearance: payload.clearance,
    unit: payload.unit,
  };
}

export async function request(path, { method = 'GET', body, token, skipAuth = false, _retry = false } = {}) {
  const multipart = body instanceof FormData;
  const headers = multipart ? {} : { 'Content-Type': 'application/json' };
  const session = readSession();
  const access = token || session?.access;
  if (!skipAuth && access) {
    headers.Authorization = `Bearer ${access}`;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });

    let data = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { detail: text };
      }
    }

    if (response.status === 401 && !skipAuth && !_retry) {
      const refreshed = await refreshSession();
      if (refreshed?.access) {
        return request(path, { method, body, token: refreshed.access, _retry: true });
      }
    }

    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: 'API unreachable' } };
  }
}

export async function refreshSession() {
  const session = readSession();
  if (!session?.refresh) return null;
  const { ok, data } = await request('/api/auth/refresh/', {
    method: 'POST',
    body: { refresh: session.refresh },
    skipAuth: true,
  });
  if (!ok || !data?.access) {
    writeSession(null);
    return null;
  }
  const next = { ...session, access: data.access, refresh: data.refresh || session.refresh };
  writeSession(next);
  return next;
}

export { SESSION_KEY, mapUser };
