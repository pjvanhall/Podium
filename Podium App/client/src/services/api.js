const API_URL = 'http://localhost:3001/api';

function getHeaders() {
  const token = localStorage.getItem('podium_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request(endpoint, options = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...getHeaders(), ...options.headers },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Er is een fout opgetreden.');
  }

  return data;
}

// Auth
export const authApi = {
  signup: (email, password, name) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),
};

// Users
export const usersApi = {
  getProfile: (id) => request(`/users/${id}`),
  updateProfile: (id, data) =>
    request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAttending: (id) => request(`/users/${id}/attending`),
  search: (q) => request(`/users/search?q=${encodeURIComponent(q)}`),
};

// Theatres
export const theatresApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/theatres${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/theatres/${id}`),
};

// Performances
export const performancesApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/performances${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/performances/${id}`),
  getGenres: () => request('/performances/genres'),
};

// Attendance
export const attendanceApi = {
  markAttending: (performanceId) =>
    request('/attendance', { method: 'POST', body: JSON.stringify({ performance_id: performanceId }) }),
  removeAttending: (performanceId) =>
    request(`/attendance/${performanceId}`, { method: 'DELETE' }),
};

// Connections
export const connectionsApi = {
  sendRequest: (userId) =>
    request(`/connections/${userId}/request`, { method: 'POST' }),
  acceptRequest: (requestId) =>
    request(`/connections/${requestId}/accept`, { method: 'PUT' }),
  rejectRequest: (requestId) =>
    request(`/connections/${requestId}/reject`, { method: 'PUT' }),
  unfriend: (userId) =>
    request(`/connections/${userId}/unfriend`, { method: 'DELETE' }),
  getRequests: () => request('/connections/requests'),
  getFriends: (userId) => request(`/connections/${userId}/friends`),
  getStatus: (userId) => request(`/connections/${userId}/status`),
};

// Feed
export const feedApi = {
  getFeed: (page = 1) => request(`/feed?page=${page}`),
};
