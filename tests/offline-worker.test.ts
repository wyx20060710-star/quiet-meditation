import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const scope = 'https://example.com/app/';
const html = '<script src="./assets/app.js"></script><link href="./assets/app.css" rel="stylesheet">';

function worker(failure?: 'missing' | 'html-for-js') {
  const entries = new Map<string, Response>();
  const handlers = new Map<string, (event: any) => void>();
  const cache = {
    put: vi.fn(async (url: string, response: Response) => { entries.set(url, response.clone()); }),
    match: vi.fn(async (request: string | Request) => entries.get(typeof request === 'string' ? request : request.url)?.clone()),
  };
  const fetcher = vi.fn(async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (failure === 'missing' && url.endsWith('.css')) return new Response('', { status: 404 });
    if (failure === 'html-for-js' && url.endsWith('.js')) return new Response(html, { headers: { 'content-type': 'text/html' } });
    if (url.endsWith('index.html')) return new Response(html, { headers: { 'content-type': 'text/html' } });
    return new Response('asset', { headers: { 'content-type': url.endsWith('.js') ? 'text/javascript' : url.endsWith('.css') ? 'text/css' : 'application/octet-stream' } });
  });
  const skipWaiting = vi.fn(async () => undefined);
  runInNewContext(source, {
    URL, Response, fetch: fetcher, caches: { open: async () => cache },
    self: { registration: { scope }, location: { origin: 'https://example.com' }, skipWaiting,
      clients: { claim: async () => undefined }, addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler) },
  });
  const install = () => {
    let pending: Promise<void> | undefined;
    handlers.get('install')!({ waitUntil: (promise: Promise<void>) => { pending = promise; } });
    return pending!;
  };
  const request = (url: string, mode = 'cors') => {
    let pending: Promise<Response> | undefined;
    handlers.get('fetch')!({ request: { url, method: 'GET', mode }, respondWith: (promise: Promise<Response>) => { pending = promise; } });
    return pending!;
  };
  return { entries, fetcher, skipWaiting, install, request };
}

describe('complete offline releases', () => {
  it.each(['missing', 'html-for-js'] as const)('rejects installation with %s assets', async (failure) => {
    const app = worker(failure);
    await expect(app.install()).rejects.toThrow('Required application asset unavailable');
    expect(app.skipWaiting).not.toHaveBeenCalled();
    expect(app.entries.has(`${scope}index.html`)).toBe(false);
  });
  it('serves the full application after the network is disconnected', async () => {
    const app = worker();
    await app.install();
    expect(app.skipWaiting).toHaveBeenCalledOnce();
    app.fetcher.mockRejectedValue(new Error('offline'));
    expect(await (await app.request(scope, 'navigate')).text()).toBe(html);
    expect(await (await app.request(`${scope}assets/app.js`)).text()).toBe('asset');
    expect(await (await app.request(`${scope}assets/app.css`)).text()).toBe('asset');
  });
  it('does not replace cached HTML with an unmatched online release', async () => {
    const app = worker();
    await app.install();
    app.fetcher.mockResolvedValue(new Response('<script src="missing-new.js"></script>'));
    expect(await (await app.request(scope, 'navigate')).text()).toBe(html);
  });
});
