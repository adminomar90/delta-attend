'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, API_URL } from './api';
import { authStorage } from './auth';

const NotificationContext = createContext({
  unreadCount: 0,
  browserPermission: 'default', // 'default' | 'granted' | 'denied'
  requestPermission: () => {},
  refresh: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [browserPermission, setBrowserPermission] = useState('default');
  const sseRef = useRef(null);

  // Sync browser permission state
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    const result = await Notification.requestPermission();
    setBrowserPermission(result);
    return result;
  }, []);

  const showBrowserNotification = useCallback((title, body) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const n = new Notification(title, {
        body,
        icon: '/brand/delta-plus-logo.png',
        badge: '/brand/delta-plus-logo.png',
        dir: 'rtl',
        tag: `delta-${Date.now()}`,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (_) {
      // Notification constructor may fail in some contexts
    }
  }, []);

  // Fetch initial unread count
  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/notifications/unread-count');
      setUnreadCount(data.unreadCount || 0);
    } catch (_) {
      // ignore — user might not be logged in
    }
  }, []);

  // SSE connection
  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) return;

    refresh();

    const url = `${API_URL}/notifications/stream`;
    const es = new EventSource(`${url}?token=${encodeURIComponent(token)}`);
    sseRef.current = es;

    es.addEventListener('notification', (e) => {
      try {
        const payload = JSON.parse(e.data);
        setUnreadCount(payload.unreadCount ?? 0);
        showBrowserNotification(
          payload.notification?.titleAr || 'إشعار جديد',
          payload.notification?.messageAr || '',
        );
      } catch (_) {}
    });

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [refresh, showBrowserNotification]);

  return (
    <NotificationContext.Provider value={{ unreadCount, setUnreadCount, browserPermission, requestPermission, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
}
