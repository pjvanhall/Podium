import type { Id } from '../types';

const API_URL = 'http://localhost:3001/api';

type QueryParams = Record<string, string | number | boolean | undefined | null>;

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('podium_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function toQuery(params: QueryParams = {}) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, String(value)]);
  return new URLSearchParams(entries).toString();
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers as Record<string, string> | undefined) },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Er is een fout opgetreden.');
  }

  return data;
}

// Auth
export const authApi = {
  signup: (email: string, password: string, name: string) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),
};

// Users
export const usersApi = {
  getProfile: (id: Id) => request(`/users/${id}`),
  updateProfile: (id: Id, data: Record<string, unknown>) =>
    request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAttending: (id: Id) => request(`/users/${id}/attending`),
  search: (q: string) => request(`/users/search?q=${encodeURIComponent(q)}`),
};

// Theatres
export const theatresApi = {
  getAll: (params: QueryParams = {}) => {
    const query = toQuery(params);
    return request(`/theatres${query ? `?${query}` : ''}`);
  },
  getById: (id: Id, params: QueryParams = {}) => {
    const query = toQuery(params);
    return request(`/theatres/${id}${query ? `?${query}` : ''}`);
  },
};

// Performances
export const performancesApi = {
  getAll: (params: QueryParams = {}) => {
    const query = toQuery(params);
    return request(`/performances${query ? `?${query}` : ''}`);
  },
  getById: (id: Id) => request(`/performances/${id}`),
  getGenres: () => request('/performances/genres'),
};

// Attendance
export const attendanceApi = {
  markAttending: (performanceId: Id) =>
    request('/attendance', { method: 'POST', body: JSON.stringify({ performance_id: performanceId }) }),
  removeAttending: (performanceId: Id) =>
    request(`/attendance/${performanceId}`, { method: 'DELETE' }),
};

// Connections
export const connectionsApi = {
  sendRequest: (userId: Id) =>
    request(`/connections/${userId}/request`, { method: 'POST' }),
  acceptRequest: (requestId: Id) =>
    request(`/connections/${requestId}/accept`, { method: 'PUT' }),
  rejectRequest: (requestId: Id) =>
    request(`/connections/${requestId}/reject`, { method: 'PUT' }),
  unfriend: (userId: Id) =>
    request(`/connections/${userId}/unfriend`, { method: 'DELETE' }),
  getRequests: () => request('/connections/requests'),
  getFriends: (userId: Id) => request(`/connections/${userId}/friends`),
  getStatus: (userId: Id) => request(`/connections/${userId}/status`),
};

// Feed
export const feedApi = {
  getFeed: (page = 1) => request(`/feed?page=${page}`),
};
