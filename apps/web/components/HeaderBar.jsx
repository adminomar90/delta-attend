'use client';

import { useRouter } from 'next/navigation';
import { assetUrl } from '../lib/api';
import { useNotifications } from '../lib/notifications';

export default function HeaderBar({ title, subtitle, user }) {
  const router = useRouter();
  const { unreadCount } = useNotifications();

  const initials = (user?.fullName || 'مستخدم')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <header className="header card">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/brand/delta-plus-logo.png"
            alt="Delta Plus"
            style={{ width: 32, height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
          />
          <h1>{title}</h1>
        </div>
        <p>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          className="notif-bell-btn"
          onClick={() => router.push('/notifications')}
          title="الإشعارات"
        >
          🔔
          {unreadCount > 0 ? <span className="notif-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
        </button>

        <div className="user-chip">
          {user?.avatarUrl ? (
            <img className="user-chip-avatar" src={assetUrl(user.avatarUrl)} alt={user?.fullName || 'user'} />
          ) : (
            <span className="user-chip-avatar user-chip-avatar-fallback">{initials}</span>
          )}
          <div>
            <span>{user?.fullName || 'مستخدم النظام'}</span>
            <small>{user?.jobTitle || user?.role || 'ROLE'}</small>
          </div>
        </div>
      </div>
    </header>
  );
}


