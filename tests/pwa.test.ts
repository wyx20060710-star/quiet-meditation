import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerOfflineSupport } from '../src/infrastructure/pwa';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function setup(scope = 'https://example.com/app/') {
  const unregister = vi.fn(async () => true);
  const registration = { scope, active: { scriptURL: `${scope}sw.js` }, unregister };
  const serviceWorker = { getRegistration: vi.fn(async () => registration), register: vi.fn(async () => undefined) };
  vi.stubGlobal('document', { baseURI: 'https://example.com/app/' });
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('navigator', { serviceWorker });
  return { unregister, serviceWorker };
}

describe('offline registration', () => {
  it('unregisters only this app in development', async () => {
    const { unregister, serviceWorker } = setup();
    vi.stubEnv('DEV', true);
    await registerOfflineSupport();
    expect(unregister).toHaveBeenCalledOnce();
    expect(serviceWorker.register).not.toHaveBeenCalled();
  });
  it('preserves a parent application worker', async () => {
    const { unregister } = setup('https://example.com/');
    vi.stubEnv('DEV', true);
    await registerOfflineSupport();
    expect(unregister).not.toHaveBeenCalled();
  });
  it('registers production with subpath scope and fresh worker checks', async () => {
    const { serviceWorker } = setup();
    vi.stubEnv('DEV', false);
    await registerOfflineSupport();
    expect(serviceWorker.register).toHaveBeenCalledWith(new URL('https://example.com/app/sw.js'), { scope: '/app/', updateViaCache: 'none' });
  });
  it('keeps the app usable if browser storage access fails', async () => {
    const { serviceWorker } = setup();
    vi.stubEnv('DEV', true);
    serviceWorker.getRegistration.mockRejectedValue(new Error('storage denied'));
    await expect(registerOfflineSupport()).resolves.toBeUndefined();
  });
});
