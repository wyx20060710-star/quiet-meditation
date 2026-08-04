import type {
  ClockSample,
  ConfirmingSession,
  LiveRunningSession,
  PausedSession,
  RunningSession,
} from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createRunningSession(
  minutes: number,
  sessionId: string,
  sample: ClockSample,
): LiveRunningSession {
  const plannedDurationSeconds = clamp(Math.round(minutes), 1, 60) * 60;
  const persisted: RunningSession = {
    schemaVersion: 1,
    key: 'activeSession',
    sessionId,
    status: 'running',
    plannedDurationSeconds,
    accumulatedMs: 0,
    createdAtWallMs: sample.wallMs,
    anchorWallMs: sample.wallMs,
  };
  return { persisted, anchorMonoMs: sample.monoMs };
}

export function effectiveElapsedMs(live: LiveRunningSession, sample: ClockSample): number {
  const plannedMs = live.persisted.plannedDurationSeconds * 1000;
  return Math.trunc(clamp(
    live.persisted.accumulatedMs + Math.max(0, sample.monoMs - live.anchorMonoMs),
    0,
    plannedMs,
  ));
}

export function remainingMs(live: LiveRunningSession, sample: ClockSample): number {
  return Math.max(0, live.persisted.plannedDurationSeconds * 1000 - effectiveElapsedMs(live, sample));
}

export function displayedRemainingSeconds(live: LiveRunningSession, sample: ClockSample): number {
  return Math.ceil(remainingMs(live, sample) / 1000);
}

export function freezeRunning(
  live: LiveRunningSession,
  sample: ClockSample,
): PausedSession {
  return {
    schemaVersion: 1,
    key: 'activeSession',
    sessionId: live.persisted.sessionId,
    status: 'paused',
    plannedDurationSeconds: live.persisted.plannedDurationSeconds,
    accumulatedMs: effectiveElapsedMs(live, sample),
    createdAtWallMs: live.persisted.createdAtWallMs,
    frozenAtWallMs: sample.wallMs,
  };
}

export function openConfirmation(
  session: LiveRunningSession | PausedSession,
  sample: ClockSample,
): ConfirmingSession {
  const frozen = 'persisted' in session ? freezeRunning(session, sample) : session;
  return {
    ...frozen,
    status: 'confirming',
    frozenAtWallMs: sample.wallMs,
    resumeTo: 'persisted' in session ? 'running' : 'paused',
  };
}

export function resumeSession(session: PausedSession | ConfirmingSession, sample: ClockSample): LiveRunningSession {
  const persisted: RunningSession = {
    schemaVersion: 1,
    key: 'activeSession',
    sessionId: session.sessionId,
    status: 'running',
    plannedDurationSeconds: session.plannedDurationSeconds,
    accumulatedMs: session.accumulatedMs,
    createdAtWallMs: session.createdAtWallMs,
    anchorWallMs: sample.wallMs,
  };
  return { persisted, anchorMonoMs: sample.monoMs };
}

export const frozenRemainingSeconds = (session: PausedSession | ConfirmingSession): number =>
  Math.ceil(Math.max(0, session.plannedDurationSeconds * 1000 - session.accumulatedMs) / 1000);

export const earlyActualSeconds = (session: ConfirmingSession): number =>
  Math.floor(session.accumulatedMs / 1000);
