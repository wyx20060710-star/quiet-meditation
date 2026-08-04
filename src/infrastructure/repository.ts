import type {
  ActiveSession,
  DailyRecord,
  RuntimeSnapshot,
  SettlementCommand,
  SettlementReceipt,
  UiRuntime,
  UserPreferences,
} from '../domain/types';

export interface SessionRepository {
  getRuntime(): Promise<RuntimeSnapshot>;
  getRecords(): Promise<DailyRecord[]>;
  getSettlement(id: string): Promise<SettlementReceipt | null>;
  getPreferences(): Promise<UserPreferences>;
  setSelectedMinutes(minutes: number): Promise<UiRuntime>;
  setPreferences(preferences: UserPreferences): Promise<UserPreferences>;
  createSession(session: ActiveSession): Promise<ActiveSession>;
  updateSession(session: ActiveSession, expectedStatus: ActiveSession['status']): Promise<ActiveSession>;
  settleSession(command: SettlementCommand): Promise<SettlementReceipt>;
  claimNaturalCompletionSound(sessionId: string): Promise<boolean>;
  markNaturalCompletionSoundFailed(sessionId: string): Promise<void>;
  clearActiveSession(sessionId: string): Promise<void>;
  dismissCompletion(sessionId: string): Promise<void>;
}

export class StaleSessionError extends Error {
  constructor(message = 'The active session changed before the command committed.') {
    super(message);
    this.name = 'StaleSessionError';
  }
}
