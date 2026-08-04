import { describe, expect, it } from 'vitest';
import { createRunningSession, freezeRunning } from '../src/domain/clock-model';
import { timerReducer } from '../src/domain/timer-machine';

const id = '4aa3b47a-0cf8-4f12-93dc-fd1509548459';
const staleId = '5f0e0e16-394c-49c2-b0a0-71c8e5415a5b';

describe('timer reducer', () => {
  it('moves through start and pause using one session identity', () => {
    const live = createRunningSession(20, id, { wallMs: 1_000, monoMs: 5 });
    const running = timerReducer({ tag: 'idle' }, { type: 'STARTED', session: live });
    const pausedSession = freezeRunning(live, { wallMs: 2_000, monoMs: 1_005 });
    expect(timerReducer(running, { type: 'PAUSED', session: pausedSession }).tag).toBe('paused');
  });

  it('ignores illegal events and stale session ids', () => {
    const live = createRunningSession(20, id, { wallMs: 1_000, monoMs: 5 });
    const running = timerReducer({ tag: 'idle' }, { type: 'STARTED', session: live });
    const stale = freezeRunning(createRunningSession(20, staleId, { wallMs: 1_000, monoMs: 5 }), { wallMs: 2_000, monoMs: 1_005 });
    expect(timerReducer(running, { type: 'PAUSED', session: stale })).toBe(running);
    expect(timerReducer({ tag: 'idle' }, { type: 'SETTLEMENT_STARTED', sessionId: id, reason: 'natural' })).toEqual({ tag: 'idle' });
  });
});
