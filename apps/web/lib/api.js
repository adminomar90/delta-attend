'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const API_BASE = API_URL.replace(/\/api\/?$/, '');

// Global auth-expired event — AuthContext listens for this
export const AUTH_EXPIRED_EVENT = 'auth:expired';

function emitAuthExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

export function assetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const api = {
  async request(path, options = {}) {
    const isFormData = options.body instanceof FormData;

    try {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: 'include',
        headers: {
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...(options.headers || {}),
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        // Emit auth-expired for 401 on non-auth endpoints
        if (response.status === 401) {
          emitAuthExpired();
        }
        const payload = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(payload.message || 'Request failed');
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }

      return response.blob();
    } catch (error) {
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

  /**
   * POST with upload progress tracking via XMLHttpRequest.
   * @param {string} path - API path
   * @param {FormData} formData - Must be FormData
   * @param {{ onProgress?: (e: {loaded:number, total:number, percent:number}) => void }} options
   * @returns {Promise<any>}
   */
  postWithProgress(path, formData, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}${path}`);
      xhr.withCredentials = true;
      xhr.timeout = 180000; // 3 minutes

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress({
              loaded: e.loaded,
              total: e.total,
              percent: Math.round((e.loaded / e.total) * 100),
            });
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve(xhr.responseText);
          }
        } else {
          if (xhr.status === 401) emitAuthExpired();
          try {
            const payload = JSON.parse(xhr.responseText);
            reject(new Error(payload.message || 'فشل الإرسال'));
          } catch {
            reject(new Error('فشل الإرسال'));
          }
        }
      });

      xhr.addEventListener('error', () => reject(new Error('تعذر الاتصال بالسيرفر')));
      xhr.addEventListener('timeout', () => reject(new Error('انتهت مهلة الرفع — حاول تقليل حجم الصور')));
      xhr.addEventListener('abort', () => reject(new Error('تم إلغاء الرفع')));

      xhr.send(formData);
    });
  },

  /**
   * PATCH with upload progress (for adding images in batches).
   */
  patchWithProgress(path, formData, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', `${API_URL}${path}`);
      xhr.withCredentials = true;
      xhr.timeout = 300000; // 5 minutes per batch

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress({
              loaded: e.loaded,
              total: e.total,
              percent: Math.round((e.loaded / e.total) * 100),
            });
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve(xhr.responseText);
          }
        } else {
          if (xhr.status === 401) emitAuthExpired();
          try {
            const payload = JSON.parse(xhr.responseText);
            reject(new Error(payload.message || 'فشل الإرسال'));
          } catch {
            reject(new Error('فشل الإرسال'));
          }
        }
      });

      xhr.addEventListener('error', () => reject(new Error('تعذر الاتصال بالسيرفر')));
      xhr.addEventListener('timeout', () => reject(new Error('انتهت مهلة الرفع — حاول تقليل حجم الصور')));
      xhr.addEventListener('abort', () => reject(new Error('تم إلغاء الرفع')));

      xhr.send(formData);
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
    const response = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
    });
    if (response.status === 401) {
      emitAuthExpired();
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: 'فشل التصدير' }));
      throw new Error(payload.message || 'فشل التصدير');
    }
    return response.blob();
  },
};


