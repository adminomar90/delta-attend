'use client';

import { authStorage } from './auth';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const API_BASE = API_URL.replace(/\/api\/?$/, '');

export function assetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const api = {
  async request(path, options = {}) {
    const token = authStorage.getToken();
    const isFormData = options.body instanceof FormData;

    try {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(payload.message || 'Request failed');
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }

      return response.blob();
    } catch (error) {
      // Re-throw with more details
      if (error instanceof TypeError) {
        throw new Error('Failed to connect to server');
      }
      throw error;
    }
  },

  get(path) {
    return this.request(path);
  },

  post(path, body) {
    return this.request(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  patch(path, body) {
    return this.request(path, {
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  put(path, body) {
    return this.request(path, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  delete(path, body) {
    return this.request(path, {
      method: 'DELETE',
      ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
    });
  },

  async downloadBlob(path) {
    const token = authStorage.getToken();
    const response = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: 'فشل التصدير' }));
      throw new Error(payload.message || 'فشل التصدير');
    }
    return response.blob();
  },
};


