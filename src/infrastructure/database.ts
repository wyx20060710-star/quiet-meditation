import { localDateKey, localDateSequence } from '../domain/local-date';
import {
  parseActiveSession,
  parseDailyRecord,
  parseSettlement,
  parseUiRuntime,
  parsePreferences,
} from '../domain/validation';
import { defaultUiRuntime } from '../domain/types';
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

const DATABASE_NAME = 'quiet-meditation';
const DATABASE_VERSION = 1;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed')), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed')), { once: true });
  });
}

export function openDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('runtime')) database.createObjectStore('runtime', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('preferences')) database.createObjectStore('preferences', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('dailyRecords')) database.createObjectStore('dailyRecords', { keyPath: 'dateKey' });
      if (!database.objectStoreNames.contains('settlements')) {
        const store = database.createObjectStore('settlements', { keyPath: 'sessionId' });
        store.createIndex('by-settled-date', 'settledDateKey');
      }
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('Unable to open IndexedDB')), { once: true });
    request.addEventListener('blocked', () => reject(new Error('IndexedDB upgrade blocked')), { once: true });
  });
}

export class IndexedDbRepository implements SessionRepository {
  constructor(
    private readonly database: IDBDatabase,
    private readonly beforeSettlementCommit?: () => void,
  ) {}

  static async open(factory?: IDBFactory): Promise<IndexedDbRepository> {
    return new IndexedDbRepository(await openDatabase(factory));
  }

  close(): void { this.database.close(); }

  async getRuntime(): Promise<RuntimeSnapshot> {
    const tx = this.database.transaction('runtime', 'readonly');
    const store = tx.objectStore('runtime');
    const [uiValue, activeValue] = await Promise.all([
      requestResult(store.get('uiRuntime')),
      requestResult(store.get('activeSession')),
    ]);
    await transactionDone(tx);
    return { uiRuntime: parseUiRuntime(uiValue), activeSession: parseActiveSession(activeValue) };
  }

  async getRecords(): Promise<DailyRecord[]> {
    const tx = this.database.transaction('dailyRecords', 'readonly');
    const values = await requestResult(tx.objectStore('dailyRecords').getAll());
    await transactionDone(tx);
    return values.map(parseDailyRecord).filter((value): value is DailyRecord => value !== null);
  }

  async getSettlement(id: string): Promise<SettlementReceipt | null> {
    const tx = this.database.transaction('settlements', 'readonly');
    const value = await requestResult(tx.objectStore('settlements').get(id));
    await transactionDone(tx);
    return parseSettlement(value);
  }

  async getPreferences(): Promise<UserPreferences> {
    const tx = this.database.transaction('preferences', 'readonly');
    const value = await requestResult(tx.objectStore('preferences').get('user'));
    await transactionDone(tx);
    return parsePreferences(value);
  }

  async setPreferences(preferences: UserPreferences): Promise<UserPreferences> {
    const valid = parsePreferences(preferences);
    const tx = this.database.transaction('preferences', 'readwrite');
    tx.objectStore('preferences').put(valid);
    await transactionDone(tx);
    return valid;
  }

  async setSelectedMinutes(minutes: number): Promise<UiRuntime> {
    const tx = this.database.transaction('runtime', 'readwrite');
    const store = tx.objectStore('runtime');
    const current = parseUiRuntime(await requestResult(store.get('uiRuntime')));
    const next: UiRuntime = { ...current, selectedDurationMinutes: Math.min(60, Math.max(1, Math.round(minutes))) };
    store.put(next);
    await transactionDone(tx);
    return next;
  }

  async createSession(session: ActiveSession): Promise<ActiveSession> {
    const valid = parseActiveSession(session);
    if (!valid) throw new TypeError('Invalid active session');
    const tx = this.database.transaction('runtime', 'readwrite');
    const store = tx.objectStore('runtime');
    const existing = parseActiveSession(await requestResult(store.get('activeSession')));
    if (!existing) store.put(valid);
    await transactionDone(tx);
    return existing ?? valid;
  }

  async updateSession(session: ActiveSession, expectedStatus: ActiveSession['status']): Promise<ActiveSession> {
    const valid = parseActiveSession(session);
    if (!valid) throw new TypeError('Invalid active session');
    const tx = this.database.transaction('runtime', 'readwrite');
    const store = tx.objectStore('runtime');
    const existing = parseActiveSession(await requestResult(store.get('activeSession')));
    if (!existing || existing.sessionId !== valid.sessionId || existing.status !== expectedStatus) {
      tx.abort();
      await transactionDone(tx).catch(() => undefined);
      throw new StaleSessionError();
    }
    store.put(valid);
    await transactionDone(tx);
    return valid;
  }

  async settleSession(command: SettlementCommand): Promise<SettlementReceipt> {
    const tx = this.database.transaction(['runtime', 'dailyRecords', 'settlements'], 'readwrite');
    const runtime = tx.objectStore('runtime');
    const records = tx.objectStore('dailyRecords');
    const settlements = tx.objectStore('settlements');
    try {
      const existing = parseSettlement(await requestResult(settlements.get(command.sessionId)));
      if (existing) {
        await transactionDone(tx);
        return existing;
      }
      const active = parseActiveSession(await requestResult(runtime.get('activeSession')));
      if (!active || active.sessionId !== command.sessionId) throw new StaleSessionError();
      const planned = active.plannedDurationSeconds;
      const actual = command.reason === 'natural'
        ? planned
        : Math.min(planned, Math.max(0, Math.floor(command.actualDurationSeconds)));
      const settledDate = new Date(command.settledAtWallMs);
      const settledDateKey = localDateKey(settledDate);
      const receipt: SettlementReceipt = {
        schemaVersion: 1,
        sessionId: active.sessionId,
        reason: command.reason,
        plannedDurationSeconds: planned,
        actualDurationSeconds: actual,
        recorded: actual > 0,
        settledAtWallMs: command.settledAtWallMs,
        settledDateKey,
        settledUtcOffsetMinutes: -settledDate.getTimezoneOffset(),
        soundDisposition: 'not-eligible',
      };
      if (receipt.recorded) {
        const current = parseDailyRecord(await requestResult(records.get(settledDateKey)));
        records.put({
          schemaVersion: 1,
          dateKey: settledDateKey,
          totalSeconds: (current?.totalSeconds ?? 0) + actual,
          completionCount: (current?.completionCount ?? 0) + 1,
          updatedAtWallMs: command.settledAtWallMs,
        } satisfies DailyRecord);
      }
      settlements.put(receipt);
      runtime.delete('activeSession');
      const ui = parseUiRuntime(await requestResult(runtime.get('uiRuntime')));
      runtime.put({ ...ui, lastCompletionId: receipt.recorded ? receipt.sessionId : null });
      const keep = new Set(localDateSequence(settledDate, 15));
      const [allRecords, allSettlements] = await Promise.all([
        requestResult(records.getAll()),
        requestResult(settlements.getAll()),
      ]);
      for (const value of allRecords) {
        const record = parseDailyRecord(value);
        if (!record || !keep.has(record.dateKey)) records.delete(record?.dateKey ?? String((value as { dateKey?: unknown }).dateKey));
      }
      for (const value of allSettlements) {
        const item = parseSettlement(value);
        if (!item || !keep.has(item.settledDateKey)) settlements.delete(item?.sessionId ?? String((value as { sessionId?: unknown }).sessionId));
      }
      this.beforeSettlementCommit?.();
      await transactionDone(tx);
      return receipt;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may already be inactive. */ }
      await transactionDone(tx).catch(() => undefined);
      throw error;
    }
  }

  async clearActiveSession(sessionId: string): Promise<void> {
    const tx = this.database.transaction('runtime', 'readwrite');
    const store = tx.objectStore('runtime');
    const existing = parseActiveSession(await requestResult(store.get('activeSession')));
    if (existing?.sessionId === sessionId) store.delete('activeSession');
    await transactionDone(tx);
  }

  async dismissCompletion(sessionId: string): Promise<void> {
    const tx = this.database.transaction('runtime', 'readwrite');
    const store = tx.objectStore('runtime');
    const ui = parseUiRuntime(await requestResult(store.get('uiRuntime')));
    if (ui.lastCompletionId === sessionId) store.put({ ...ui, lastCompletionId: null } satisfies UiRuntime);
    await transactionDone(tx);
  }


  async claimNaturalCompletionSound(sessionId: string): Promise<boolean> {
    const tx = this.database.transaction('settlements', 'readwrite');
    const store = tx.objectStore('settlements');
    const receipt = parseSettlement(await requestResult(store.get(sessionId)));
    const claimed = receipt?.reason === 'natural' && receipt.soundDisposition === 'not-eligible';
    if (claimed && receipt) store.put({ ...receipt, soundDisposition: 'attempted' } satisfies SettlementReceipt);
    await transactionDone(tx);
    return claimed;
  }

  async markNaturalCompletionSoundFailed(sessionId: string): Promise<void> {
    const tx = this.database.transaction('settlements', 'readwrite');
    const store = tx.objectStore('settlements');
    const receipt = parseSettlement(await requestResult(store.get(sessionId)));
    if (receipt?.reason === 'natural' && receipt.soundDisposition === 'attempted') {
      store.put({ ...receipt, soundDisposition: 'failed' } satisfies SettlementReceipt);
    }
    await transactionDone(tx);
  }
}

export async function ensureRuntimeDefaults(repository: SessionRepository): Promise<void> {
  const runtime = await repository.getRuntime();
  if (!runtime.uiRuntime) await repository.setSelectedMinutes(defaultUiRuntime().selectedDurationMinutes);
}
