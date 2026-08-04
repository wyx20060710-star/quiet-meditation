import { describe, expect, it } from 'vitest';
import { localDateKey, localDateSequence } from '../src/domain/local-date';
import { deriveStatistics } from '../src/domain/statistics';
import type { DailyRecord } from '../src/domain/types';

const record = (dateKey: string, totalSeconds: number): DailyRecord => ({
  schemaVersion: 1,
  dateKey,
  totalSeconds,
  completionCount: 1,
  updatedAtWallMs: 1,
});

describe('local calendar and statistics', () => {
  it('creates local date keys without UTC truncation', () => {
    const date = new Date(2026, 0, 1, 0, 30);
    expect(localDateKey(date)).toBe('2026-01-01');
  });

  it('walks calendar dates across month and year boundaries', () => {
    expect(localDateSequence(new Date(2026, 0, 2, 12), 4)).toEqual([
      '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
    ]);
  });

  it('fills 15 days, sums the last 7, and scales bars to the maximum', () => {
    const stats = deriveStatistics([
      record('2026-08-01', 60),
      record('2026-08-04', 120),
    ], new Date(2026, 7, 4, 12));
    expect(stats.last15).toHaveLength(15);
    expect(stats.last7Seconds).toBe(180);
    expect(stats.todaySeconds).toBe(120);
    expect(stats.last15.at(-1)?.ratio).toBe(1);
    expect(stats.last15.filter((day) => day.totalSeconds === 0)).toHaveLength(13);
  });

  it('uses a zero baseline when all days are empty', () => {
    expect(deriveStatistics([], new Date(2026, 7, 4)).last15.every((day) => day.ratio === 0)).toBe(true);
  });
});
