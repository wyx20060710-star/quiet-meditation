import { describe, expect, it } from 'vitest';
import {
  createRunningSession,
  displayedRemainingSeconds,
  earlyActualSeconds,
  freezeRunning,
  openConfirmation,
  remainingMs,
  resumeSession,
} from '../src/domain/clock-model';

const id = '4aa3b47a-0cf8-4f12-93dc-fd1509548459';

describe('clock model', () => {
  it.each([1, 20, 60])('starts %i minute sessions at the full displayed duration', (minutes) => {
    const live = createRunningSession(minutes, id, { wallMs: 1_000, monoMs: 10 });
    expect(displayedRemainingSeconds(live, { wallMs: 1_001, monoMs: 10.1 })).toBe(minutes * 60);
  });

  it('uses ceil for display and clamps naturally at zero', () => {
    const live = createRunningSession(1, id, { wallMs: 1_000, monoMs: 100 });
    expect(displayedRemainingSeconds(live, { wallMs: 1_001, monoMs: 100.1 })).toBe(60);
    expect(displayedRemainingSeconds(live, { wallMs: 60_999, monoMs: 60_099 })).toBe(1);
    expect(displayedRemainingSeconds(live, { wallMs: 61_000, monoMs: 60_100 })).toBe(0);
    expect(remainingMs(live, { wallMs: 90_000, monoMs: 90_000 })).toBe(0);
  });

  it('freezes confirmation time and returns to the original state', () => {
    const live = createRunningSession(1, id, { wallMs: 1_000, monoMs: 100 });
    const confirming = openConfirmation(live, { wallMs: 2_500, monoMs: 1_600 });
    expect(confirming.accumulatedMs).toBe(1_500);
    expect(confirming.resumeTo).toBe('running');
    expect(earlyActualSeconds(confirming)).toBe(1);
    const resumed = resumeSession(confirming, { wallMs: 12_500, monoMs: 8_000 });
    expect(resumed.persisted.accumulatedMs).toBe(1_500);
    expect(resumed.anchorMonoMs).toBe(8_000);
  });

  it('covers the 0 and 1 second early-end boundary', () => {
    const live = createRunningSession(1, id, { wallMs: 0, monoMs: 0 });
    expect(earlyActualSeconds(openConfirmation(live, { wallMs: 999, monoMs: 999 }))).toBe(0);
    expect(earlyActualSeconds(openConfirmation(live, { wallMs: 1_000, monoMs: 1_000 }))).toBe(1);
    expect(freezeRunning(live, { wallMs: 1_000, monoMs: 1_000 }).accumulatedMs).toBe(1_000);
  });

  it('normalizes high-resolution fractional clock samples to contract-safe integer milliseconds', () => {
    const live = createRunningSession(1, id, { wallMs: 1_000, monoMs: 10.25 });
    const paused = freezeRunning(live, { wallMs: 2_234, monoMs: 1_244.875 });
    expect(paused.accumulatedMs).toBe(1_234);
    expect(Number.isInteger(paused.accumulatedMs)).toBe(true);
  });
});
