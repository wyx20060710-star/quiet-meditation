import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(root, 'public', 'icons');
const samples = 2;

const colors = {
  background: [0xd8, 0xd3, 0xc8, 0xff],
  ring: [0xa7, 0xa2, 0x97, 0xff],
  accent: [0x48, 0x5f, 0x55, 0xff],
  center: [0x33, 0x32, 0x2e, 0xff],
};

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) {
    current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  return current >>> 0;
});

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
};

const insideRoundedSquare = (x, y) => {
  const radius = 112;
  if (x >= radius && x <= 512 - radius) return y >= 0 && y <= 512;
  if (y >= radius && y <= 512 - radius) return x >= 0 && x <= 512;
  const cornerX = x < radius ? radius : 512 - radius;
  const cornerY = y < radius ? radius : 512 - radius;
  return Math.hypot(x - cornerX, y - cornerY) <= radius;
};

const pixelColor = (x, y, maskable) => {
  if (!maskable && !insideRoundedSquare(x, y)) return [0, 0, 0, 0];

  const fromCenter = Math.hypot(x - 256, y - 256);
  let color = colors.background;
  if (Math.abs(fromCenter - 146) <= 9) color = colors.ring;

  const arcStart = [256, 110];
  const arcEnd = [382.4, 329];
  let angle = Math.atan2(y - 256, x - 256);
  if (angle < -Math.PI / 2) angle += Math.PI * 2;
  const onArc = angle >= -Math.PI / 2 && angle <= Math.PI / 6 && Math.abs(fromCenter - 146) <= 11;
  const onCap = Math.min(
    Math.hypot(x - arcStart[0], y - arcStart[1]),
    Math.hypot(x - arcEnd[0], y - arcEnd[1]),
  ) <= 11;
  if (onArc || onCap) color = colors.accent;
  if (fromCenter <= 17) color = colors.center;
  return color;
};

const render = (size, maskable = false) => {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  const scale = 512 / size;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    scanlines[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < samples; sampleY += 1) {
        for (let sampleX = 0; sampleX < samples; sampleX += 1) {
          const sourceX = (x + (sampleX + 0.5) / samples) * scale;
          const sourceY = (y + (sampleY + 0.5) / samples) * scale;
          const color = pixelColor(sourceX, sourceY, maskable);
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += color[channel];
        }
      }
      const offset = row + 1 + x * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        scanlines[offset + channel] = Math.round(totals[channel] / (samples * samples));
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, 'icon-192.png'), render(192));
writeFileSync(resolve(outputDirectory, 'icon-512.png'), render(512));
writeFileSync(resolve(outputDirectory, 'icon-maskable-512.png'), render(512, true));
