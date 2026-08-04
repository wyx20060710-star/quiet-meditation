import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createRunningSession } from '../src/domain/clock-model';
import { IndexedDbRepository, openDatabase } from '../src/infrastructure/database';
import { MemoryRepository } from '../src/infrastructure/memory-repository';

const id = '4aa3b47a-0cf8-4f12-93dc-fd1509548459';
const now = new Date(2026, 7, 4, 12).getTime();

describe('settlement contract', () => {
  it('records no daily aggregate for a zero-second early end', async () => {
    const repository = new MemoryRepository();
    await repository.createSession(createRunningSession(1, id, { wallMs: now, monoMs: 0 }).persisted);
    const receipt = await repository.settleSession({ sessionId: id, reason: 'early', actualDurationSeconds: 0, settledAtWallMs: now });
    expect(receipt.recorded).toBe(false);
    expect(await repository.getRecords()).toEqual([]);
  });

  it('records one second and returns the same receipt on duplicate settlement', async () => {
    const repository = new MemoryRepository();
    await repository.createSession(createRunningSession(1, id, { wallMs: now, monoMs: 0 }).persisted);
    const command = { sessionId: id, reason: 'early' as const, actualDurationSeconds: 1, settledAtWallMs: now };
    const first = await repository.settleSession(command);
    const duplicate = await repository.settleSession(command);
    expect(duplicate).toEqual(first);
    expect((await repository.getRecords())[0]).toMatchObject({ totalSeconds: 1, completionCount: 1 });
  });
});

describe('IndexedDB atomicity', () => {
  it('lets natural and early settlement race but increments once', async () => {
    const factory = new IDBFactory();
    const repository = await IndexedDbRepository.open(factory);
    await repository.createSession(createRunningSession(1, id, { wallMs: now, monoMs: 0 }).persisted);
    const [a, b] = await Promise.all([
      repository.settleSession({ sessionId: id, reason: 'natural', actualDurationSeconds: 60, settledAtWallMs: now }),
      repository.settleSession({ sessionId: id, reason: 'early', actualDurationSeconds: 12, settledAtWallMs: now }),
    ]);
    expect(a).toEqual(b);
    const records = await repository.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.completionCount).toBe(1);
    repository.close();
  });

  it('rolls back aggregate, receipt, runtime deletion, and last completion together', async () => {
    const factory = new IDBFactory();
    const database = await openDatabase(factory);
    const repository = new IndexedDbRepository(database, () => { throw new Error('injected abort'); });
    await repository.createSession(createRunningSession(1, id, { wallMs: now, monoMs: 0 }).persisted);
    await expect(repository.settleSession({ sessionId: id, reason: 'natural', actualDurationSeconds: 60, settledAtWallMs: now })).rejects.toThrow('injected abort');
    expect(await repository.getRecords()).toEqual([]);
    expect(await repository.getSettlement(id)).toBeNull();
    const runtime = await repository.getRuntime();
    expect(runtime.activeSession?.sessionId).toBe(id);
    expect(runtime.uiRuntime.lastCompletionId).toBeNull();
    repository.close();
  });
});
