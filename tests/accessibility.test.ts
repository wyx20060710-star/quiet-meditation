import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isQuickMinuteSelected } from '../src/ui/render';

const relativeLuminance = (hex: string): number => {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (foreground: string, background: string): number => {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

describe('immersive palette accessibility', () => {
  it.each([
    ['scene primary text over content scrim', '#fffaf0', '#405247'],
    ['scene secondary text over content scrim', '#e4e3d4', '#405247'],
    ['primary button text', '#24372d', '#f3ead5'],
    ['settings panel text', '#26342d', '#f1eee5'],
    ['settings panel secondary text', '#59665f', '#f1eee5'],
  ])('%s meets WCAG AA for normal text', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('duration control accessibility', () => {
  it('marks a quick time as selected only when it matches the slider value', () => {
    expect(isQuickMinuteSelected(5, 5)).toBe(true);
    expect(isQuickMinuteSelected(1, 5)).toBe(false);
    expect(isQuickMinuteSelected(20, 20)).toBe(true);
  });

  it('offers a labelled 1–60 minute range directly on the home screen', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/ui/render.ts'), 'utf8');
    expect(source).toContain('for="home-duration-range"');
    expect(source).toContain('id="home-duration-range"');
    expect(source).toContain('data-duration-range type="range" min="1" max="60" step="1"');
    expect(source).toContain('aria-valuetext="${state.selectedMinutes} 分钟"');
  });

  it('ships a labelled modal settings surface with keyboard escape handling', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/ui/render.ts'), 'utf8');
    expect(source).toContain('aria-labelledby="settings-title"');
    expect(source).toContain('data-settings-panel');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("button:not(:disabled), input:not(:disabled)");
  });
});
