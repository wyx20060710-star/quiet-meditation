const CACHE_NAME = 'quiet-meditation-static-v13';
const CORE = [
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
const scope = self.registration.scope;
const indexUrl = new URL('index.html', scope).href;

// A followed redirect cannot be returned to a navigation with redirect mode manual.
// Reconstruct the response to remove its redirect URL list while preserving the body.
function navigationResponse(response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function cachedResponse(key) {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(key);
  } catch {
    // Storage denial or eviction must not prevent an online page from opening.
    return undefined;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Pages redirects index.html to the directory URL. Cache a navigation-safe response.
    const response = await fetch(scope, { cache: 'reload' });
    if (!response.ok) throw new Error('Application HTML unavailable');
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], scope))
      .filter((url) => url.origin === self.location.origin && url.pathname.startsWith(new URL(scope).pathname));
    // Required resources must all be present before the new worker can activate.
    const urls = [...new Set([...CORE.map((path) => new URL(path, scope).href), ...assets.map((url) => url.href)])];
    await Promise.all(urls.map(async (url) => {
      const asset = await fetch(url, { cache: 'reload' });
      const type = asset.headers.get('content-type') || '';
      const pathname = new URL(url).pathname;
      if (!asset.ok || (/\.js$/.test(pathname) && !/(java|ecma)script/.test(type))
        || (/\.css$/.test(pathname) && !type.includes('text/css'))) {
        throw new Error('Required application asset unavailable');
      }
      await cache.put(url, asset);
    }));
    await cache.put(indexUrl, navigationResponse(response));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Keep earlier releases for existing clients; never clear another app's cache.
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(scope).pathname) || url.pathname.endsWith('/sw.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      // Serve HTML from the same complete release as its JS/CSS, online or off.
      const cached = await cachedResponse(indexUrl);
      return cached ? navigationResponse(cached) : fetch(request);
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await cachedResponse(request);
    if (cached) return cached;
    return fetch(request);
  })());
});
