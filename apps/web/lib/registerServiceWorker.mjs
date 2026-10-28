let registrationPromise;

export function registerAppServiceWorker() {
  if (typeof window === 'undefined' || !window.isSecureContext || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('/sw-notifications.js', { scope: '/', updateViaCache: 'none' }).catch((error) => {
      registrationPromise = undefined;
      throw error;
    });
  }
  return registrationPromise;
}
