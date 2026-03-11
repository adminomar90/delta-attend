'use client';

import { useNotifications } from '../lib/notifications';

export default function InAppNotifToast() {
  const { inAppToast, dismissToast } = useNotifications();

  if (!inAppToast) return null;

  return (
    <div className="inapp-toast" onClick={dismissToast}>
      <div className="inapp-toast-icon">🔔</div>
      <div className="inapp-toast-body">
        <strong>{inAppToast.title}</strong>
        <p>{inAppToast.body}</p>
      </div>
      <button className="inapp-toast-close" onClick={dismissToast}>✕</button>
    </div>
  );
}
