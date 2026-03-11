'use client';

const TOKEN_KEY = 'delta_plus_token';
const USER_KEY = 'delta_plus_user';

export const authStorage = {
  getToken() {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem(TOKEN_KEY);
  },
  setToken(token) {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.removeItem(TOKEN_KEY);
  },
  getUser() {
    if (typeof window === 'undefined') {
      return null;
    }
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setUser(user) {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearUser() {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.removeItem(USER_KEY);
  },
  logout() {
    this.clearToken();
    this.clearUser();
  },
};
