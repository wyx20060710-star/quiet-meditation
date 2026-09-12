export async function registerOfflineSupport(): Promise<void> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const url = new URL('sw.js', document.baseURI);
    const scope = new URL('./', document.baseURI);
    if (import.meta.env.DEV) {
      // Only unregister this app's development worker; preserve cached releases.
      const registration = await navigator.serviceWorker.getRegistration(scope.href);
      const worker = registration?.active || registration?.waiting || registration?.installing;
      if (registration?.scope === scope.href && worker?.scriptURL === url.href) {
        await registration.unregister();
      }
      return;
    }
    await navigator.serviceWorker.register(url, { scope: scope.pathname, updateViaCache: 'none' });
  } catch {
    // Offline installation is an enhancement; the ordinary web app remains complete.
  }
}
