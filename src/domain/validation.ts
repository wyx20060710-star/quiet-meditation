import type {
  ActiveSession,
  DailyRecord,
  SettlementReceipt,
  UiRuntime,
  UserPreferences,
} from './types';
import { defaultPreferences } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const integerBetween = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && Number.isFinite(value) && (value as number) >= min && (value as number) <= max;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function isLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseUiRuntime(value: unknown): UiRuntime {
  if (!object(value)) return { schemaVersion: 1, key: 'uiRuntime', selectedDurationMinutes: 5, lastCompletionId: null };
  const selectedDurationMinutes = integerBetween(value.selectedDurationMinutes, 1, 60)
    ? value.selectedDurationMinutes
    : 5;
  const lastCompletionId = value.lastCompletionId === null || isUuid(value.lastCompletionId)
    ? value.lastCompletionId
    : null;
  return { schemaVersion: 1, key: 'uiRuntime', selectedDurationMinutes, lastCompletionId };
}

export function parsePreferences(value: unknown): UserPreferences {
  const defaults = defaultPreferences();
  if (!object(value)) return defaults;
  return {
    schemaVersion: 2,
    key: 'user',
    soundEnabled: typeof value.soundEnabled === 'boolean' ? value.soundEnabled : defaults.soundEnabled,
    ambientEnabled: typeof value.ambientEnabled === 'boolean'
      ? value.ambientEnabled
      : typeof value.musicEnabled === 'boolean'
        ? value.musicEnabled
        : defaults.ambientEnabled,
  };
}

function validBase(value: Record<string, unknown>): boolean {
  return value.schemaVersion === 1 && value.key === 'activeSession' && isUuid(value.sessionId)
    && integerBetween(value.plannedDurationSeconds, 60, 3600)
    && value.plannedDurationSeconds % 60 === 0
    && integerBetween(value.accumulatedMs, 0, value.plannedDurationSeconds * 1000)
    && integerBetween(value.createdAtWallMs, 0, 8_640_000_000_000_000);
}

export function parseActiveSession(value: unknown): ActiveSession | null {
  if (!object(value) || !validBase(value)) return null;
  const base = value as Record<string, unknown>;
  if (base.status === 'running' && integerBetween(base.anchorWallMs, base.createdAtWallMs as number, 8_640_000_000_000_000)) {
    return value as unknown as ActiveSession;
  }
  if ((base.status === 'paused' || base.status === 'confirming')
    && integerBetween(base.frozenAtWallMs, base.createdAtWallMs as number, 8_640_000_000_000_000)) {
    if (base.status === 'confirming' && base.resumeTo !== 'running' && base.resumeTo !== 'paused') return null;
    return value as unknown as ActiveSession;
  }
  return null;
}

export function parseDailyRecord(value: unknown): DailyRecord | null {
  if (!object(value) || value.schemaVersion !== 1 || !isLocalDateKey(value.dateKey)
    || !integerBetween(value.totalSeconds, 1, Number.MAX_SAFE_INTEGER)
    || !integerBetween(value.completionCount, 1, Number.MAX_SAFE_INTEGER)
    || !integerBetween(value.updatedAtWallMs, 0, 8_640_000_000_000_000)) return null;
  return value as unknown as DailyRecord;
}

export function parseSettlement(value: unknown): SettlementReceipt | null {
  if (!object(value) || value.schemaVersion !== 1 || !isUuid(value.sessionId)
    || (value.reason !== 'natural' && value.reason !== 'early')
    || !integerBetween(value.plannedDurationSeconds, 60, 3600)
    || value.plannedDurationSeconds % 60 !== 0
    || !integerBetween(value.actualDurationSeconds, 0, value.plannedDurationSeconds)
    || typeof value.recorded !== 'boolean'
    || !integerBetween(value.settledAtWallMs, 0, 8_640_000_000_000_000)
    || !isLocalDateKey(value.settledDateKey)
    || !integerBetween(value.settledUtcOffsetMinutes, -840, 840)
    || !['not-eligible', 'attempted', 'failed'].includes(String(value.soundDisposition))) return null;
  if (value.reason === 'natural' && (value.actualDurationSeconds !== value.plannedDurationSeconds || value.recorded !== true)) return null;
  if (value.recorded === false && (value.reason !== 'early' || value.actualDurationSeconds !== 0)) return null;
  if (value.recorded === true && value.actualDurationSeconds < 1) return null;
  if (value.reason === 'early' && value.soundDisposition !== 'not-eligible') return null;
  return value as unknown as SettlementReceipt;
}
