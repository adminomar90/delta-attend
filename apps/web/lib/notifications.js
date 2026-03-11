'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, API_URL } from './api';
import { authStorage } from './auth';

const NotificationContext = createContext({
  unreadCount: 0,
  browserPermission: 'default',
  requestPermission: () => {},
  refresh: () => {},
  debug: {},
});

export const useNotifications = () => useContext(NotificationContext);

/* ── helpers ── */
function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 });
}

export function NotificationProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [browserPermission, setBrowserPermission] = useState('default');
  const sseRef = useRef(null);
  const swRegRef = useRef(null);

  /* ── Debug state ── */
  const [debug, setDebug] = useState({
    logs: [],
    sseState: 'disconnected',   // disconnected | connecting | connected | error
    swState: 'unknown',         // unknown | unsupported | registering | ready | failed
    notifSupport: 'checking',   // checking | full | partial | none
    lastEvent: null,
    lastError: null,
    sseUrl: '',
    swScope: '',
    reconnects: 0,
  });

  const addLog = useCallback((level, msg) => {
    setDebug((prev) => ({
      ...prev,
      logs: [...prev.logs.slice(-99), { time: ts(), level, msg }],
    }));
  }, []);

  const updateDebug = useCallback((patch) => {
    setDebug((prev) => ({ ...prev, ...patch }));
  }, []);

  /* ── Detect notification support ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setBrowserPermission('unsupported');
      updateDebug({ notifSupport: 'none' });
      addLog('warn', 'Notification API غير مدعوم في هذا المتصفح');
      return;
    }
    setBrowserPermission(Notification.permission);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const hasSW = 'serviceWorker' in navigator;
    if (hasSW) {
      updateDebug({ notifSupport: 'full' });
      addLog('info', `دعم الإشعارات: كامل (SW + Notification API) — ${isMobile ? 'موبايل' : 'حاسوب'}`);
    } else {
      updateDebug({ notifSupport: 'partial' });
      addLog('info', 'دعم الإشعارات: جزئي (بدون Service Worker)');
    }
  }, [addLog, updateDebug]);

  /* ── Register Service Worker ── */
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      updateDebug({ swState: 'unsupported' });
      return;
    }
    updateDebug({ swState: 'registering' });
    addLog('info', 'جارٍ تسجيل Service Worker...');

    navigator.serviceWorker
      .register('/sw-notifications.js')
      .then((reg) => {
        swRegRef.current = reg;
        updateDebug({ swState: 'ready', swScope: reg.scope });
        addLog('ok', `Service Worker جاهز — scope: ${reg.scope}`);
      })
      .catch((err) => {
        updateDebug({ swState: 'failed', lastError: err.message });
        addLog('error', `فشل تسجيل Service Worker: ${err.message}`);
      });
  }, [addLog, updateDebug]);

  /* ── In-app toast fallback ── */
  const [inAppToast, setInAppToast] = useState(null);
  const toastTimerRef = useRef(null);

  const showInAppToast = useCallback((title, body) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setInAppToast({ title, body, time: Date.now() });
    toastTimerRef.current = setTimeout(() => setInAppToast(null), 6000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setInAppToast(null);
  }, []);

  /* ── Request permission ── */
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      addLog('error', 'Notification API غير مدعوم');
      return 'denied';
    }
    addLog('info', 'جارٍ طلب إذن الإشعارات...');
    try {
      const result = await Notification.requestPermission();
      setBrowserPermission(result);
      addLog(result === 'granted' ? 'ok' : 'warn', `نتيجة طلب الإذن: ${result}`);

      // If granted, send a welcome notification to confirm it works
      if (result === 'granted') {
        setTimeout(() => {
          fireNotification('تم تفعيل الإشعارات ✓', 'ستصلك الإشعارات الآن بنجاح', { tag: 'perm-granted' });
        }, 500);
      }

      return result;
    } catch (err) {
      addLog('error', `خطأ في طلب الإذن: ${err.message}`);
      return 'denied';
    }
  }, [addLog]);

  /* ── Fire notification — auto-requests permission if default ── */
  const fireNotification = useCallback(async (title, body, options = {}) => {
    if (typeof window === 'undefined') return;

    // Always show in-app toast as fallback
    showInAppToast(title, body);

    if (!('Notification' in window)) {
      addLog('warn', 'لا يدعم المتصفح الإشعارات — يظهر إشعار داخلي فقط');
      return;
    }

    // Re-read permission from the browser (not React state which may be stale)
    let perm = Notification.permission;

    // Auto-request if default
    if (perm === 'default') {
      addLog('info', 'الإذن default — جارٍ الطلب تلقائياً...');
      try {
        perm = await Notification.requestPermission();
        setBrowserPermission(perm);
        addLog(perm === 'granted' ? 'ok' : 'warn', `نتيجة الطلب التلقائي: ${perm}`);
      } catch (err) {
        addLog('error', `فشل الطلب التلقائي: ${err.message}`);
        return;
      }
    }

    if (perm !== 'granted') {
      addLog('warn', `الإذن ${perm} — يظهر إشعار داخلي فقط`);
      return;
    }

    const notifOptions = {
      body,
      icon: '/brand/delta-plus-logo.png',
      badge: '/brand/delta-plus-logo.png',
      dir: 'rtl',
      tag: options.tag || `delta-${Date.now()}`,
      vibrate: [200, 100, 200],
      requireInteraction: false,
      ...options,
    };

    // Try Service Worker first (works on mobile + desktop)
    const reg = swRegRef.current;
    if (reg) {
      reg.showNotification(title, notifOptions)
        .then(() => addLog('ok', `إشعار SW: ${title}`))
        .catch((err) => {
          addLog('warn', `فشل إشعار SW: ${err.message} — محاولة بديلة...`);
          fallbackNotification(title, notifOptions);
        });
    } else {
      fallbackNotification(title, notifOptions);
    }
  }, [addLog, showInAppToast]);

  const fallbackNotification = useCallback((title, options) => {
    try {
      const n = new Notification(title, options);
      n.onclick = () => { window.focus(); n.close(); };
      addLog('ok', `إشعار (constructor): ${title}`);
    } catch (err) {
      addLog('error', `فشل إشعار constructor: ${err.message}`);
    }
  }, [addLog]);

  /* ── Fetch unread count ── */
  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/notifications/unread-count');
      setUnreadCount(data.unreadCount || 0);
      addLog('info', `عدد غير المقروءة: ${data.unreadCount || 0}`);
    } catch (err) {
      addLog('error', `فشل جلب العدد: ${err.message}`);
    }
  }, [addLog]);

  /* ── SSE connection with reconnect ── */
  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) return;

    refresh();

    const sseUrl = `${API_URL}/notifications/stream?token=${encodeURIComponent(token)}`;
    updateDebug({ sseUrl, sseState: 'connecting' });
    addLog('info', `جارٍ الاتصال بـ SSE...`);

    const es = new EventSource(sseUrl);
    sseRef.current = es;

    es.addEventListener('connected', () => {
      updateDebug({ sseState: 'connected' });
      addLog('ok', 'SSE متصل بنجاح ✓');
    });

    es.addEventListener('notification', (e) => {
      try {
        const payload = JSON.parse(e.data);
        const newCount = payload.unreadCount ?? 0;
        setUnreadCount(newCount);
        updateDebug({ lastEvent: ts() });
        addLog('info', `حدث SSE: إشعار جديد (غير مقروءة: ${newCount})`);

        fireNotification(
          payload.notification?.titleAr || 'إشعار جديد',
          payload.notification?.messageAr || '',
        );
      } catch (err) {
        addLog('error', `خطأ في تحليل حدث SSE: ${err.message}`);
      }
    });

    es.onopen = () => {
      updateDebug({ sseState: 'connected' });
    };

    es.onerror = () => {
      updateDebug((prev) => ({
        ...prev,
        sseState: 'error',
        reconnects: (prev.reconnects || 0) + 1,
      }));
      setDebug((prev) => ({
        ...prev,
        sseState: 'error',
        reconnects: (prev.reconnects || 0) + 1,
      }));
      addLog('warn', 'SSE خطأ / إعادة اتصال تلقائي...');
    };

    return () => {
      es.close();
      sseRef.current = null;
      updateDebug({ sseState: 'disconnected' });
      addLog('info', 'SSE مغلق');
    };
  }, [refresh, fireNotification, addLog, updateDebug]);

  /* ── Manual test: local browser notification (no backend) ── */
  const testLocalNotification = useCallback(async () => {
    addLog('info', '▶ فحص إشعار محلي (بدون سيرفر)...');

    if (typeof window !== 'undefined' && !('Notification' in window)) {
      addLog('error', '✗ Notification API غير مدعوم');
      showInAppToast('فحص محلي', 'المتصفح لا يدعم الإشعارات — يظهر إشعار داخلي فقط');
      return { success: false, reason: 'UNSUPPORTED' };
    }

    await fireNotification('فحص محلي ✓', 'هذا إشعار تجريبي محلي — يعمل بدون الخادم', {
      tag: 'local-test',
    });
    return { success: true };
  }, [addLog, fireNotification, showInAppToast]);

  /* ── Manual test: backend test notification ── */
  const testBackendNotification = useCallback(async () => {
    addLog('info', '▶ فحص إشعار من الخادم...');
    try {
      const res = await api.post('/notifications/test', {});
      addLog('ok', `✓ الخادم أرسل إشعار تجريبي: ${res.message}`);
      return { success: true };
    } catch (err) {
      addLog('error', `✗ فشل إرسال إشعار الخادم: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }, [addLog]);

  /* ── Manual test: SSE connectivity ── */
  const testSSE = useCallback(() => {
    addLog('info', '▶ فحص اتصال SSE...');
    const state = sseRef.current?.readyState;
    const stateLabels = { 0: 'CONNECTING', 1: 'OPEN', 2: 'CLOSED' };
    const label = stateLabels[state] ?? 'NULL';
    addLog(state === 1 ? 'ok' : 'error', `حالة EventSource: ${label} (${state ?? 'غير موجود'})`);
    return { readyState: state, label };
  }, [addLog]);

  /* ── Full diagnostic report ── */
  const runFullDiagnostic = useCallback(async () => {
    addLog('info', '═══════════════ بدء الفحص الشامل ═══════════════');

    // 1. Browser support
    addLog('info', `المتصفح: ${navigator.userAgent}`);
    addLog('info', `الجهاز: ${/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'موبايل' : 'حاسوب'}`);
    addLog('info', `HTTPS: ${location.protocol === 'https:' ? 'نعم ✓' : 'لا (مطلوب للموبايل) ⚠'}`);
    addLog('info', `Notification API: ${'Notification' in window ? 'مدعوم ✓' : 'غير مدعوم ✗'}`);
    addLog('info', `Service Worker: ${'serviceWorker' in navigator ? 'مدعوم ✓' : 'غير مدعوم ✗'}`);

    // 2. Permission
    if ('Notification' in window) {
      addLog('info', `إذن الإشعارات: ${Notification.permission}`);
    }

    // 3. Service Worker state
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        addLog('info', `عدد Service Workers المسجلة: ${regs.length}`);
        for (const r of regs) {
          addLog('info', `  SW scope: ${r.scope} — active: ${!!r.active}`);
        }
      } catch (err) {
        addLog('error', `فشل فحص SW: ${err.message}`);
      }
    }

    // 4. SSE connectivity
    testSSE();

    // 5. API connectivity
    addLog('info', 'فحص اتصال API...');
    try {
      const data = await api.get('/notifications/unread-count');
      addLog('ok', `✓ API يعمل — غير مقروءة: ${data.unreadCount}`);
    } catch (err) {
      addLog('error', `✗ فشل اتصال API: ${err.message}`);
    }

    // 6. Local notification test
    testLocalNotification();

    addLog('info', '═══════════════ انتهى الفحص الشامل ═══════════════');
  }, [addLog, testSSE, testLocalNotification]);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        setUnreadCount,
        browserPermission,
        requestPermission,
        refresh,
        debug,
        inAppToast,
        dismissToast,
        testLocalNotification,
        testBackendNotification,
        testSSE,
        runFullDiagnostic,
        fireNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
