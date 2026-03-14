'use client';

import { useRouter } from 'next/navigation';
import { useNotifications } from '../lib/notifications';
import UserAvatar from './UserAvatar';

export default function HeaderBar({ title, subtitle, user, onMenuToggle }) {
  const router = useRouter();
  const { unreadCount } = useNotifications();

  return (
    <header className="header card">
      <div className="header-right">
        <button className="hamburger-btn" onClick={onMenuToggle} aria-label="القائمة">
          <span /><span /><span />
        </button>
        <div className="header-title-copy">
          <div className="header-title-row">
            <img
              className="header-logo"
              src="/brand/delta-plus-logo.png"
              alt="Delta Plus"
            />
            <h1>{title}</h1>
          </div>
          <p className="header-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="header-left">
        <button
          className="notif-bell-btn"
          onClick={() => router.push('/notifications')}
          title="الإشعارات"
        >
          🔔
          {unreadCount > 0 ? <span className="notif-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
        </button>

        <div className="user-chip">
          <UserAvatar
            fullName={user?.fullName || 'مستخدم'}
            avatarUrl={user?.avatarUrl || ''}
            alt={user?.fullName || 'user'}
            imgClassName="user-chip-avatar"
            fallbackClassName="user-chip-avatar user-chip-avatar-fallback"
          />
          <div className="user-chip-info">
            <span>{user?.fullName || 'مستخدم النظام'}</span>
            <small>{user?.jobTitle || user?.role || 'ROLE'}</small>
          </div>
        </div>
      </div>
    </header>
  );
}
