export async function registerOfflineSupport(): Promise<void> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const url = new URL('sw.js', document.baseURI);
    await navigator.serviceWorker.register(url, { scope: new URL('./', document.baseURI).pathname });
  } catch {
    // Offline installation is an enhancement; the ordinary web app remains complete.
  }
}
