import { describe, expect, it } from 'vitest';
import { parseActiveSession, parseDailyRecord, parseUiRuntime } from '../src/domain/validation';

describe('runtime validation', () => {
  it('defaults preference-like runtime fields independently', () => {
    expect(parseUiRuntime({ selectedDurationMinutes: 99, lastCompletionId: 'bad' })).toMatchObject({
      selectedDurationMinutes: 5,
      lastCompletionId: null,
    });
  });

  it('isolates a malformed daily record', () => {
    expect(parseDailyRecord({ schemaVersion: 1, dateKey: '2026-02-31', totalSeconds: 20, completionCount: 1, updatedAtWallMs: 1 })).toBeNull();
  });

  it('rejects an active session with inconsistent bounds', () => {
    expect(parseActiveSession({
      schemaVersion: 1,
      key: 'activeSession',
      sessionId: '4aa3b47a-0cf8-4f12-93dc-fd1509548459',
      status: 'running',
      plannedDurationSeconds: 60,
      accumulatedMs: 60_001,
      createdAtWallMs: 100,
      anchorWallMs: 100,
    })).toBeNull();
  });
});
