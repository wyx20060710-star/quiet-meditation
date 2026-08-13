import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

const pngDimensions = (path: string): [number, number] => {
  const png = readFileSync(path);
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe('phase eight release readiness', () => {
  it('ships installable PNG icons with explicit purposes', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8')) as {
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
    };
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }),
      expect.objectContaining({ src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }),
      expect.objectContaining({ src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }),
    ]));
    for (const icon of manifest.icons) expect(existsSync(resolve(root, 'public', icon.src))).toBe(true);
    expect(pngDimensions(resolve(root, 'public/icons/icon-192.png'))).toEqual([192, 192]);
    expect(pngDimensions(resolve(root, 'public/icons/icon-512.png'))).toEqual([512, 512]);
    expect(pngDimensions(resolve(root, 'public/icons/icon-maskable-512.png'))).toEqual([512, 512]);
  });

  it('uses relative production assets for root or subpath hosting', () => {
    const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
    expect(config).toContain("base: './'");
  });

  it('advances the offline cache when release assets change', () => {
    const worker = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
    expect(worker).toContain("quiet-meditation-static-v4");
    expect(worker).toContain("'./icons/icon-512.png'");
  });

  it('ships static security headers without overriding platform cache policy', () => {
    const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    expect(headers).not.toContain('Cache-Control');
  });
});
