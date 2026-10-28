'use client';

import { useEffect } from 'react';
import { registerAppServiceWorker } from '../lib/registerServiceWorker.mjs';

export default function PwaRegistration() {
  useEffect(() => {
    let disposed = false, registration, lastUpdateAt = 0;
    const checkUpdate = () => {
      if (disposed || !registration || document.visibilityState !== 'visible' || Date.now() - lastUpdateAt < 60000) return;
      lastUpdateAt = Date.now();
      registration.update().catch(() => {});
    };
    registerAppServiceWorker().then((reg) => {
      if (disposed || !reg) return;
      registration = reg;
      checkUpdate();
    }).catch((error) => console.warn('تعذر تسجيل خدمة التطبيق:', error.message));
    window.addEventListener('focus', checkUpdate);
    window.addEventListener('online', checkUpdate);
    document.addEventListener('visibilitychange', checkUpdate);
    const interval = setInterval(checkUpdate, 60 * 60 * 1000);
    // Never reload on controllerchange: a user may have an unsaved form open.
    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener('focus', checkUpdate);
      window.removeEventListener('online', checkUpdate);
      document.removeEventListener('visibilitychange', checkUpdate);
    };
  }, []);
  return null;
}
