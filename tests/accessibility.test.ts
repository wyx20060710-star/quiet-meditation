import { describe, expect, it } from 'vitest';

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

describe('theme accessibility', () => {
  it.each([
    ['stone secondary text', '#5a5751', '#d8d3c8'],
    ['stone accent text', '#485f55', '#d8d3c8'],
    ['stone button text', '#f5f2eb', '#485f55'],
    ['mist secondary text', '#596965', '#e4e8e6'],
    ['mist accent text', '#526b69', '#e4e8e6'],
    ['mist button text', '#f7faf8', '#526b69'],
  ])('%s meets WCAG AA for normal text', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
