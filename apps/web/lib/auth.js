'use client';

// ── In-memory auth state — never persisted to localStorage ──
// Session cookie (HttpOnly) is the primary auth mechanism.
// Token is kept in memory only for SSE streaming.
let _token = null;
let _user = null;

// One-time cleanup of legacy localStorage data
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('delta_plus_token');
    window.localStorage.removeItem('delta_plus_user');
  } catch {
    // ignore
  }
}

export const authStorage = {
  getToken() {
    return _token;
  },
  setToken(token) {
    _token = token || null;
  },
  clearToken() {
    _token = null;
  },
  getUser() {
    return _user;
  },
  setUser(user) {
    _user = user || null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('user-updated', { detail: user }));
    }
  },
  clearUser() {
    _user = null;
  },
  logout() {
    _token = null;
    _user = null;
  },
};
