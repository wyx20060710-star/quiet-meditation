export const SCHEMA_VERSION = 1 as const;

export type SessionStatus = 'running' | 'paused' | 'confirming';
export type SettlementReason = 'natural' | 'early';
export type ThemePreference = 'stone' | 'mist';

export interface UserPreferences {
  schemaVersion: 1;
  key: 'user';
  theme: ThemePreference;
  soundEnabled: boolean;
  musicEnabled: boolean;
}

export interface UiRuntime {
  schemaVersion: 1;
  key: 'uiRuntime';
  selectedDurationMinutes: number;
  lastCompletionId: string | null;
}

interface SessionBase {
  schemaVersion: 1;
  key: 'activeSession';
  sessionId: string;
  plannedDurationSeconds: number;
  accumulatedMs: number;
  createdAtWallMs: number;
}

export interface RunningSession extends SessionBase {
  status: 'running';
  anchorWallMs: number;
}

export interface PausedSession extends SessionBase {
  status: 'paused';
  frozenAtWallMs: number;
}

export interface ConfirmingSession extends SessionBase {
  status: 'confirming';
  frozenAtWallMs: number;
  resumeTo: 'running' | 'paused';
}

export type ActiveSession = RunningSession | PausedSession | ConfirmingSession;

export interface DailyRecord {
  schemaVersion: 1;
  dateKey: string;
  totalSeconds: number;
  completionCount: number;
  updatedAtWallMs: number;
}

export interface SettlementReceipt {
  schemaVersion: 1;
  sessionId: string;
  reason: SettlementReason;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  recorded: boolean;
  settledAtWallMs: number;
  settledDateKey: string;
  settledUtcOffsetMinutes: number;
  soundDisposition: 'not-eligible' | 'attempted' | 'failed';
}

export interface RuntimeSnapshot {
  uiRuntime: UiRuntime;
  activeSession: ActiveSession | null;
}

export interface ClockSample {
  wallMs: number;
  monoMs: number;
}

export interface LiveRunningSession {
  persisted: RunningSession;
  anchorMonoMs: number;
}

export interface SettlementCommand {
  sessionId: string;
  reason: SettlementReason;
  actualDurationSeconds: number;
  settledAtWallMs: number;
}

export const defaultUiRuntime = (): UiRuntime => ({
  schemaVersion: SCHEMA_VERSION,
  key: 'uiRuntime',
  selectedDurationMinutes: 20,
  lastCompletionId: null,
});

export const defaultPreferences = (): UserPreferences => ({
  schemaVersion: SCHEMA_VERSION,
  key: 'user',
  theme: 'stone',
  soundEnabled: true,
  musicEnabled: true,
});
