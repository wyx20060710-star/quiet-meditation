import { describe, expect, it } from 'vitest';
import { clockwiseRemainingDashOffset } from '../src/ui/ring-progress';

describe('clockwise remaining-time ring', () => {
  it('opens its gap clockwise from twelve o’clock as time elapses', () => {
    expect(clockwiseRemainingDashOffset(1, 100)).toBe(-0);
    expect(clockwiseRemainingDashOffset(0.75, 100)).toBe(-25);
    expect(clockwiseRemainingDashOffset(0.5, 100)).toBe(-50);
    expect(clockwiseRemainingDashOffset(0, 100)).toBe(-100);
  });

  it('clamps invalid progress ratios to the visible range', () => {
    expect(clockwiseRemainingDashOffset(2, 100)).toBe(-0);
    expect(clockwiseRemainingDashOffset(-1, 100)).toBe(-100);
  });
});
