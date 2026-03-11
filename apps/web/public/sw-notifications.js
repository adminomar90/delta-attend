/* Service Worker — handles notification display on mobile & desktop */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/* ── Web Push: receive push notification from server ── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'إشعار جديد', body: event.data.text() };
  }

  const title = data.title || 'إشعار جديد';
  const options = {
    body: data.body || '',
    icon: data.icon || '/brand/delta-plus-logo.png',
    badge: data.badge || '/brand/delta-plus-logo.png',
    dir: data.dir || 'rtl',
    tag: data.tag || `delta-push-${Date.now()}`,
    vibrate: [200, 100, 200],
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* When a notification is clicked, focus the app window */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('/notifications');
    }),
  );
});
