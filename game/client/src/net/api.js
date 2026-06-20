const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

export async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Запрос не выполнен');
  return data;
}

export const authApi = {
  me: () => api('/api/auth/me'),
  register: (username, password) => api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username, password) => api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api('/api/auth/logout', { method: 'POST' })
};

export const leaderboardApi = {
  get: () => api('/api/leaderboard/pve')
};
