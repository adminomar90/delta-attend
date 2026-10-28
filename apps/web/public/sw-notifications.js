/* Delta Plus PWA + notifications. No Cache Storage, IndexedDB or user-data cache.
 * Keep this URL/scope stable to preserve existing Web Push subscriptions.
 * Updated worker code activates safely; open pages are never forcibly reloaded.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Navigation is always network-only. API, uploads, Next.js data/RSC requests,
// POSTs and cross-origin requests are left entirely to the browser.
self.addEventListener('fetch', (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin
    || /^\/(api|uploads|_next)(\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => new Response(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0d182e"><title>Delta Plus — لا يوجد اتصال</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d182e;color:#fff;font:18px system-ui,sans-serif;text-align:center}main{padding:28px;max-width:450px}h1{font-size:26px}p{line-height:1.9;color:#b6c5de}a{display:inline-block;padding:12px 22px;border-radius:10px;background:#22457d;color:white;text-decoration:none}</style></head>
<body><main><h1>Delta Plus</h1><h2>لا يوجد اتصال بالشبكة</h2><p>تحقق من الاتصال ثم افتح النظام مجددًا. يتطلب عرض البيانات وحفظ التغييرات اتصالًا بالخادم.</p><a href="/">فتح النظام</a></main></body></html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" },
  })));
});

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
    icon: data.icon || '/icon-192.png',
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
