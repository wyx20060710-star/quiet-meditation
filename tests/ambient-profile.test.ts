import { describe, expect, it } from 'vitest';
import { ambientProfileAt, ambientPeriodAt, millisecondsUntilNextAmbientPeriod } from '../src/domain/ambient-profile';

const local = (hour: number, minute = 0) => new Date(2026, 7, 31, hour, minute, 0, 0);

describe('ambient profile', () => {
  it.each([
    [4, 59, 'night'],
    [5, 0, 'morning'],
    [10, 59, 'morning'],
    [11, 0, 'day'],
    [16, 59, 'day'],
    [17, 0, 'dusk'],
    [20, 59, 'dusk'],
    [21, 0, 'night'],
  ] as const)('maps %i:%i to %s', (hour, minute, expected) => {
    expect(ambientPeriodAt(local(hour, minute))).toBe(expected);
  });

  it('keeps the prompt stable for the same local date', () => {
    expect(ambientProfileAt(local(8)).prompt).toBe(ambientProfileAt(local(10, 30)).prompt);
  });

  it('selects the next profile boundary without a polling loop', () => {
    expect(millisecondsUntilNextAmbientPeriod(local(10, 59))).toBe(60_000);
    expect(millisecondsUntilNextAmbientPeriod(local(23))).toBe(6 * 60 * 60 * 1000);
  });
});
