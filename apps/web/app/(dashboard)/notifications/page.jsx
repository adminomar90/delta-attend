'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '../../../lib/api';
import { useNotifications } from '../../../lib/notifications';

const typeIcon = {
  TASK_ASSIGNED: '📋',
  TASK_APPROVAL_PROGRESS: '⏳',
  TASK_APPROVED: '✅',
  GOAL_ACHIEVED: '🏆',
  ATTENDANCE_ACTIVITY: '⏱️',
  WORK_REPORT_CREATED: '📝',
  OPERATION_ACTIVITY: '📌',
  SYSTEM: '🔔',
};

const sseStateLabel = {
  disconnected: { text: 'غير متصل', cls: 'st-off' },
  connecting: { text: 'جارٍ الاتصال...', cls: 'st-warn' },
  connected: { text: 'متصل ✓', cls: 'st-on' },
  error: { text: 'خطأ / إعادة اتصال', cls: 'st-err' },
};

const swStateLabel = {
  unknown: { text: 'غير محدد', cls: 'st-warn' },
  unsupported: { text: 'غير مدعوم', cls: 'st-off' },
  registering: { text: 'جارٍ التسجيل...', cls: 'st-warn' },
  ready: { text: 'جاهز ✓', cls: 'st-on' },
  failed: { text: 'فشل التسجيل', cls: 'st-err' },
};

const logColor = { ok: '#2ecc71', info: '#5dade2', warn: '#f39c12', error: '#e74c3c' };

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const logEndRef = useRef(null);

  const {
    unreadCount,
    setUnreadCount,
    browserPermission,
    requestPermission,
    debug,
    lastNotificationAt,
    testLocalNotification,
    testBackendNotification,
    testSSE,
    runFullDiagnostic,
  } = useNotifications();

  const load = async () => {
    try {
      const response = await api.get('/notifications?limit=50');
      setNotifications(response.notifications || []);
      if (typeof response.unreadCount === 'number') setUnreadCount(response.unreadCount);
    } catch (err) {
      setError(err.message || 'تعذر تحميل الإشعارات');
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (lastNotificationAt) {
      load();
    }
  }, [lastNotificationAt]);

  // Auto-scroll debug log
  useEffect(() => {
    if (showDebug && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debug.logs.length, showDebug]);

  const markRead = async (id) => {
    try {
      const res = await api.patch(`/notifications/${id}/read`, {});
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)));
      if (typeof res.unreadCount === 'number') setUnreadCount(res.unreadCount);
    } catch (err) {
      setError(err.message || 'تعذر تحديث الإشعار');
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      setError(err.message || 'تعذر تحديث الإشعارات');
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await testBackendNotification();
      setTimeout(() => load(), 600);
    } catch (_) {
    } finally {
      setTesting(false);
    }
  };

  /* Permission bar */
  const permLabel = {
    granted: { text: 'إشعارات المتصفح مفعّلة ✓', cls: 'notif-perm-granted', icon: '✅' },
    denied: { text: 'تم حظر إشعارات المتصفح — غيّر الإعدادات من المتصفح', cls: 'notif-perm-denied', icon: '🚫' },
    default: { text: 'لم يتم تفعيل إشعارات المتصفح بعد', cls: 'notif-perm-default', icon: '⚠️' },
    unsupported: { text: 'المتصفح لا يدعم الإشعارات', cls: 'notif-perm-denied', icon: '❌' },
  };
  const perm = permLabel[browserPermission] || permLabel.unsupported;

  const sseInfo = sseStateLabel[debug.sseState] || sseStateLabel.disconnected;
  const swInfo = swStateLabel[debug.swState] || swStateLabel.unknown;

  return (
    <section className="card section">
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>الإشعارات</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {unreadCount > 0 && (
            <button className="btn btn-soft" onClick={markAllRead}>تعليم الكل كمقروء</button>
          )}
          <button className="btn" onClick={sendTest} disabled={testing}>
            {testing ? 'جارٍ الإرسال...' : '🧪 إشعار تجريبي'}
          </button>
          <button className="btn btn-soft" onClick={() => setShowDebug((v) => !v)}>
            {showDebug ? '🔽 إخفاء التشخيص' : '🔧 أدوات التشخيص'}
          </button>
        </div>
      </div>

      {/* ── Permission bar ── */}
      <div className={`notif-perm-bar ${perm.cls}`}>
        <span>{perm.icon} {perm.text}</span>
        {browserPermission === 'default' && (
          <button className="btn btn-sm" onClick={requestPermission}>تفعيل الإشعارات</button>
        )}
      </div>

      {/* ── Status indicators (always visible) ── */}
      <div className="notif-status-row">
        <div className="notif-status-chip">
          <span className={`notif-dot ${sseInfo.cls}`} />
          SSE: {sseInfo.text}
          {debug.reconnects > 0 && <small> (إعادة اتصال: {debug.reconnects})</small>}
        </div>
        <div className="notif-status-chip">
          <span className={`notif-dot ${swInfo.cls}`} />
          Service Worker: {swInfo.text}
        </div>
        {debug.lastEvent && (
          <div className="notif-status-chip">
            🕐 آخر حدث: {debug.lastEvent}
          </div>
        )}
      </div>

      {/* ── Debug panel ── */}
      {showDebug && (
        <div className="notif-debug-panel">
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>🔧 لوحة التشخيص والفحص</h3>

          {/* Quick tests */}
          <div className="notif-debug-tests">
            <button className="btn btn-sm" onClick={testLocalNotification}>
              📳 فحص إشعار محلي
            </button>
            <button className="btn btn-sm" onClick={testBackendNotification}>
              📡 فحص إشعار الخادم
            </button>
            <button className="btn btn-sm" onClick={testSSE}>
              🔌 فحص اتصال SSE
            </button>
            <button className="btn btn-sm" onClick={runFullDiagnostic}>
              🩺 فحص شامل كامل
            </button>
            <button className="btn btn-sm btn-soft" onClick={() => load()}>
              🔄 تحديث القائمة
            </button>
          </div>

          {/* Info grid */}
          <div className="notif-debug-grid">
            <div className="notif-debug-item">
              <span className="notif-debug-label">إذن المتصفح</span>
              <span className={browserPermission === 'granted' ? 'st-on' : 'st-err'}>{browserPermission}</span>
            </div>
            <div className="notif-debug-item">
              <span className="notif-debug-label">دعم الإشعارات</span>
              <span>{debug.notifSupport}</span>
            </div>
            <div className="notif-debug-item">
              <span className="notif-debug-label">SSE URL</span>
              <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{debug.sseUrl || '—'}</span>
            </div>
            <div className="notif-debug-item">
              <span className="notif-debug-label">SW Scope</span>
              <span style={{ fontSize: 11 }}>{debug.swScope || '—'}</span>
            </div>
            <div className="notif-debug-item">
              <span className="notif-debug-label">غير مقروءة</span>
              <span>{unreadCount}</span>
            </div>
          </div>

          {/* Live log */}
          <div className="notif-debug-log-header">
            <span>📜 سجل الأحداث ({debug.logs.length})</span>
          </div>
          <div className="notif-debug-log">
            {debug.logs.length === 0 && (
              <div style={{ color: 'var(--text-soft)', padding: 12 }}>لا توجد أحداث بعد — اضغط "فحص شامل" للبدء</div>
            )}
            {debug.logs.map((entry, i) => (
              <div key={i} className="notif-log-line">
                <span style={{ color: 'var(--text-soft)', minWidth: 85, fontSize: 11 }}>{entry.time}</span>
                <span style={{ color: logColor[entry.level] || '#aaa', minWidth: 14 }}>
                  {entry.level === 'ok' ? '✓' : entry.level === 'error' ? '✗' : entry.level === 'warn' ? '⚠' : '●'}
                </span>
                <span>{entry.msg}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

      {/* ── Notification list ── */}
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {notifications.length === 0 && !error && (
          <p style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 30 }}>لا توجد إشعارات</p>
        )}
        {notifications.map((item) => (
          <article key={item._id} className={`notif-card ${item.readAt ? '' : 'unread'}`}>
            <div className="notif-card-icon">{typeIcon[item.type] || '🔔'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{item.titleAr}</strong>
              <p style={{ margin: '4px 0', color: 'var(--text-soft)', fontSize: 14 }}>{item.messageAr}</p>
              <small style={{ color: 'var(--text-soft)' }}>{new Date(item.createdAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' })}</small>
            </div>
            {!item.readAt ? (
              <button className="btn btn-soft btn-sm" onClick={() => markRead(item._id)}>تعليم كمقروء</button>
            ) : (
              <span className="badge">مقروء</span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
