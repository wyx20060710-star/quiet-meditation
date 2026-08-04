import { localDateKey, localDateSequence } from '../domain/local-date';
import { parseActiveSession, parsePreferences } from '../domain/validation';
import { defaultPreferences, defaultUiRuntime } from '../domain/types';
import type {
  ActiveSession,
  DailyRecord,
  RuntimeSnapshot,
  SettlementCommand,
  SettlementReceipt,
  UiRuntime,
  UserPreferences,
} from '../domain/types';
import type { SessionRepository } from './repository';
import { StaleSessionError } from './repository';

export class MemoryRepository implements SessionRepository {
  private runtime: RuntimeSnapshot = { uiRuntime: defaultUiRuntime(), activeSession: null };
  private records = new Map<string, DailyRecord>();
  private settlements = new Map<string, SettlementReceipt>();
  private preferences = defaultPreferences();

  async getRuntime(): Promise<RuntimeSnapshot> { return structuredClone(this.runtime); }
  async getRecords(): Promise<DailyRecord[]> { return structuredClone([...this.records.values()]); }
  async getSettlement(id: string): Promise<SettlementReceipt | null> {
    return structuredClone(this.settlements.get(id) ?? null);
  }
  async getPreferences(): Promise<UserPreferences> { return structuredClone(this.preferences); }
  async setPreferences(preferences: UserPreferences): Promise<UserPreferences> {
    this.preferences = parsePreferences(preferences);
    return structuredClone(this.preferences);
  }
  async setSelectedMinutes(minutes: number): Promise<UiRuntime> {
    this.runtime.uiRuntime.selectedDurationMinutes = Math.min(60, Math.max(1, Math.round(minutes)));
    return structuredClone(this.runtime.uiRuntime);
  }
  async createSession(session: ActiveSession): Promise<ActiveSession> {
    if (this.runtime.activeSession) return structuredClone(this.runtime.activeSession);
    const valid = parseActiveSession(session);
    if (!valid) throw new TypeError('Invalid active session');
    this.runtime.activeSession = structuredClone(valid);
    return structuredClone(valid);
  }
  async updateSession(session: ActiveSession, expectedStatus: ActiveSession['status']): Promise<ActiveSession> {
    const active = this.runtime.activeSession;
    if (!active || active.sessionId !== session.sessionId || active.status !== expectedStatus) throw new StaleSessionError();
    this.runtime.activeSession = structuredClone(session);
    return structuredClone(session);
  }
  async settleSession(command: SettlementCommand): Promise<SettlementReceipt> {
    const existing = this.settlements.get(command.sessionId);
    if (existing) return structuredClone(existing);
    const active = this.runtime.activeSession;
    if (!active || active.sessionId !== command.sessionId) throw new StaleSessionError();
    const planned = active.plannedDurationSeconds;
    const actual = command.reason === 'natural'
      ? planned
      : Math.min(planned, Math.max(0, Math.floor(command.actualDurationSeconds)));
    const date = new Date(command.settledAtWallMs);
    const dateKey = localDateKey(date);
    const receipt: SettlementReceipt = {
      schemaVersion: 1,
      sessionId: active.sessionId,
      reason: command.reason,
      plannedDurationSeconds: planned,
      actualDurationSeconds: actual,
      recorded: actual > 0,
      settledAtWallMs: command.settledAtWallMs,
      settledDateKey: dateKey,
      settledUtcOffsetMinutes: -date.getTimezoneOffset(),
      soundDisposition: 'not-eligible',
    };
    if (receipt.recorded) {
      const current = this.records.get(dateKey);
      this.records.set(dateKey, {
        schemaVersion: 1,
        dateKey,
        totalSeconds: (current?.totalSeconds ?? 0) + actual,
        completionCount: (current?.completionCount ?? 0) + 1,
        updatedAtWallMs: command.settledAtWallMs,
      });
    }
    this.settlements.set(receipt.sessionId, receipt);
    this.runtime.activeSession = null;
    this.runtime.uiRuntime.lastCompletionId = receipt.recorded ? receipt.sessionId : null;
    const keep = new Set(localDateSequence(date, 15));
    for (const key of this.records.keys()) if (!keep.has(key)) this.records.delete(key);
    for (const [id, item] of this.settlements) if (!keep.has(item.settledDateKey)) this.settlements.delete(id);
    return structuredClone(receipt);
  }
  async clearActiveSession(sessionId: string): Promise<void> {
    if (this.runtime.activeSession?.sessionId === sessionId) this.runtime.activeSession = null;
  }
  async dismissCompletion(sessionId: string): Promise<void> {
    if (this.runtime.uiRuntime.lastCompletionId === sessionId) this.runtime.uiRuntime.lastCompletionId = null;
  }
  async claimNaturalCompletionSound(sessionId: string): Promise<boolean> {
    const receipt = this.settlements.get(sessionId);
    if (receipt?.reason !== 'natural' || receipt.soundDisposition !== 'not-eligible') return false;
    receipt.soundDisposition = 'attempted';
    return true;
  }
  async markNaturalCompletionSoundFailed(sessionId: string): Promise<void> {
    const receipt = this.settlements.get(sessionId);
    if (receipt?.reason === 'natural' && receipt.soundDisposition === 'attempted') receipt.soundDisposition = 'failed';
  }
}
