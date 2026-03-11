'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const response = await api.get('/notifications?limit=50');
      setNotifications(response.notifications || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل الإشعارات');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`, {});
      setNotifications((prev) => prev.map((item) => (item._id === id ? { ...item, readAt: new Date().toISOString() } : item)));
    } catch (err) {
      setError(err.message || 'تعذر تحديث الإشعار');
    }
  };

  return (
    <section className="card section">
      <h2>الإشعارات</h2>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {notifications.map((item) => (
          <article key={item._id} className="card" style={{ padding: 12, borderColor: item.readAt ? 'var(--border)' : '#9fd7c7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{item.titleAr}</strong>
                <p style={{ margin: '6px 0', color: 'var(--text-soft)' }}>{item.messageAr}</p>
                <small>{new Date(item.createdAt).toLocaleString('ar-IQ')}</small>
              </div>

              {!item.readAt ? (
                <button className="btn btn-soft" onClick={() => markRead(item._id)}>
                  تعليم كمقروء
                </button>
              ) : (
                <span className="badge">مقروء</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
