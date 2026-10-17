import { mapUser, request } from './client';

export async function loginRequest({ operatorId, passphrase }) {
  const { ok, status, data } = await request('/api/auth/login/', {
    method: 'POST',
    skipAuth: true,
    body: {
      operator_id: operatorId.trim().toLowerCase(),
      passphrase,
    },
  });

  if (!ok) {
    const message = data?.detail
      || (data?.non_field_errors && data.non_field_errors[0])
      || (status === 0 ? 'Authentication service is unreachable.' : 'Invalid username or password.');
    return { ok: false, error: Array.isArray(message) ? message[0] : message };
  }

  return {
    ok: true,
    access: data.access,
    refresh: data.refresh,
    user: mapUser(data.user),
  };
}

export async function logoutRequest(refresh) {
  try {
    await request('/api/auth/logout/', {
      method: 'POST',
      body: { refresh },
    });
  } catch {
    // Local session is cleared even if the API is down.
  }
}

export async function meRequest() {
  const { ok, data } = await request('/api/auth/me/');
  if (!ok) return null;
  return mapUser(data);
}
