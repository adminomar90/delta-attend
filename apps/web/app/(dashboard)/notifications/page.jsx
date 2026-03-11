'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useNotifications } from '../../../lib/notifications';

const typeIcon = {
  TASK_ASSIGNED: '📋',
  TASK_APPROVAL_PROGRESS: '⏳',
  TASK_APPROVED: '✅',
  GOAL_ACHIEVED: '🏆',
  SYSTEM: '🔔',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const { unreadCount, setUnreadCount, browserPermission, requestPermission } = useNotifications();

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
      await api.post('/notifications/test', {});
      await load();
    } catch (err) {
      setError(err.message || 'فشل إرسال الإشعار التجريبي');
    } finally {
      setTesting(false);
    }
  };

  const permLabel = {
    granted: { text: 'إشعارات المتصفح مفعّلة ✓', cls: 'notif-perm-granted' },
    denied: { text: 'تم حظر إشعارات المتصفح — يمكنك تغيير ذلك من إعدادات المتصفح', cls: 'notif-perm-denied' },
    default: { text: 'لم يتم تفعيل إشعارات المتصفح بعد', cls: 'notif-perm-default' },
    unsupported: { text: 'المتصفح لا يدعم الإشعارات', cls: 'notif-perm-denied' },
  };
  const perm = permLabel[browserPermission] || permLabel.unsupported;

  return (
    <section className="card section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>الإشعارات</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {unreadCount > 0 && (
            <button className="btn btn-soft" onClick={markAllRead}>تعليم الكل كمقروء</button>
          )}
          <button className="btn" onClick={sendTest} disabled={testing}>
            {testing ? 'جارٍ الإرسال...' : '🧪 إشعار تجريبي'}
          </button>
        </div>
      </div>

      {/* Browser permission bar */}
      <div className={`notif-perm-bar ${perm.cls}`}>
        <span>{perm.text}</span>
        {browserPermission === 'default' && (
          <button className="btn btn-sm" onClick={requestPermission}>تفعيل الإشعارات</button>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {notifications.length === 0 && !error && (
          <p style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 30 }}>لا توجد إشعارات</p>
        )}
        {notifications.map((item) => (
          <article
            key={item._id}
            className={`notif-card ${item.readAt ? '' : 'unread'}`}
          >
            <div className="notif-card-icon">{typeIcon[item.type] || '🔔'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{item.titleAr}</strong>
              <p style={{ margin: '4px 0', color: 'var(--text-soft)', fontSize: 14 }}>{item.messageAr}</p>
              <small style={{ color: 'var(--text-soft)' }}>{new Date(item.createdAt).toLocaleString('ar-IQ')}</small>
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
