import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '../src/app/controller';
import { createRunningSession, freezeRunning, openConfirmation } from '../src/domain/clock-model';
import { parsePreferences } from '../src/domain/validation';
import { MemoryRepository } from '../src/infrastructure/memory-repository';
import { TestClock } from './helpers';

const id = '4aa3b47a-0cf8-4f12-93dc-fd1509548459';

beforeEach(() => {
  vi.stubGlobal('window', {
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
  });
});

describe('phase six preferences', () => {
  it('migrates legacy music preferences and defaults damaged fields independently', () => {
    expect(parsePreferences({ schemaVersion: 1, theme: 'mist', soundEnabled: 'broken', musicEnabled: false })).toEqual({
      schemaVersion: 2, key: 'user', soundEnabled: true, ambientEnabled: false,
    });
    expect(parsePreferences({ schemaVersion: 2, soundEnabled: false, ambientEnabled: 'broken' })).toEqual({
      schemaVersion: 2, key: 'user', soundEnabled: false, ambientEnabled: true,
    });
  });

  it('persists ambient and completion-sound choices', async () => {
    const repository = new MemoryRepository();
    const controller = new AppController(repository, new TestClock());
    await controller.initialize();
    await controller.setSoundEnabled(false);
    await controller.setAmbientEnabled(false);
    expect(await repository.getPreferences()).toEqual({ schemaVersion: 2, key: 'user', soundEnabled: false, ambientEnabled: false });
  });

  it('starts, pauses, resumes and stops the ambient soundscape with the session', async () => {
    const repository = new MemoryRepository();
    const ambient = {
      start: vi.fn(async () => undefined),
      pause: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    const controller = new AppController(repository, new TestClock(), true, undefined, undefined, undefined, ambient);
    await controller.initialize();
    await controller.start();
    expect(ambient.start).toHaveBeenCalledWith(expect.objectContaining({ period: 'day' }));
    await controller.pause();
    expect(ambient.pause).toHaveBeenCalled();
    await controller.resume();
    expect(ambient.start).toHaveBeenLastCalledWith(expect.objectContaining({ period: 'day' }));
    await controller.setAmbientEnabled(false);
    expect(ambient.stop).toHaveBeenCalled();
  });
});

describe('time-aware ambience', () => {
  it('refreshes an idle page after the local period changes', async () => {
    const clock = new TestClock(new Date(2026, 7, 31, 10, 59).getTime());
    const controller = new AppController(new MemoryRepository(), clock);
    await controller.initialize();
    expect(controller.snapshot().ambientProfile.period).toBe('morning');
    clock.advance(2 * 60_000);
    await controller.handleVisibilityChange(false);
    expect(controller.snapshot().ambientProfile.period).toBe('day');
  });

  it('locks an active session to the period in which it began', async () => {
    const clock = new TestClock(new Date(2026, 7, 31, 10, 59).getTime());
    const controller = new AppController(new MemoryRepository(), clock);
    await controller.initialize();
    await controller.start();
    clock.advance(2 * 60_000);
    await controller.handleVisibilityChange(false);
    expect(controller.snapshot().ambientProfile.period).toBe('morning');
  });
});

describe('R01-R12 recovery matrix', () => {
  it('R01/R06 restores a running session from its wall checkpoint', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    await repository.createSession(createRunningSession(1, id, { wallMs: clock.wall - 5_000, monoMs: 0 }).persisted);
    const controller = new AppController(repository, clock);
    await controller.initialize();
    expect(controller.snapshot().timer.tag).toBe('running');
    expect(controller.getRemainingSeconds()).toBe(55);
  });

  it('R02 restores a paused session without adding refresh time', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    const live = createRunningSession(1, id, { wallMs: clock.wall - 30_000, monoMs: 0 });
    const paused = freezeRunning(live, { wallMs: clock.wall - 20_000, monoMs: 10_000 });
    await repository.createSession(paused);
    clock.advance(20_000);
    const controller = new AppController(repository, clock);
    await controller.initialize();
    expect(controller.snapshot().timer.tag).toBe('paused');
    expect(controller.getRemainingSeconds()).toBe(50);
  });

  it('R03 restores confirmation state and its resume target', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    const live = createRunningSession(1, id, { wallMs: clock.wall, monoMs: clock.mono });
    const confirming = openConfirmation(live, { wallMs: clock.wall + 2_000, monoMs: clock.mono + 2_000 });
    await repository.createSession(confirming);
    clock.advance(20_000);
    const controller = new AppController(repository, clock);
    await controller.initialize();
    const timer = controller.snapshot().timer;
    expect(timer.tag).toBe('confirming');
    if (timer.tag === 'confirming') expect(timer.session.resumeTo).toBe('running');
    expect(controller.getRemainingSeconds()).toBe(58);
  });

  it('R04 checkpoints before background and restores elapsed wall time on return', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    await repository.createSession(createRunningSession(1, id, { wallMs: clock.wall, monoMs: clock.mono }).persisted);
    const controller = new AppController(repository, clock);
    await controller.initialize();
    clock.advance(5_000);
    await controller.handleVisibilityChange(true);
    clock.advance(20_000);
    await controller.handleVisibilityChange(false);
    expect(controller.snapshot().timer.tag).toBe('running');
    expect(controller.getRemainingSeconds()).toBe(35);
  });

  it('R05/R07 settles an expired restored session once without playing sound', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    const sound = { playNaturalCompletion: vi.fn(async () => undefined) };
    await repository.createSession(createRunningSession(1, id, { wallMs: clock.wall - 90_000, monoMs: 0 }).persisted);
    const controller = new AppController(repository, clock, true, sound);
    await controller.initialize();
    expect(controller.snapshot().timer.tag).toBe('completed');
    expect((await repository.getRecords())[0]).toMatchObject({ totalSeconds: 60, completionCount: 1 });
    expect(sound.playNaturalCompletion).not.toHaveBeenCalled();
  });

  it('R08 uses monotonic time when a visible-document wall clock jumps', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    await repository.createSession(createRunningSession(1, id, { wallMs: clock.wall, monoMs: clock.mono }).persisted);
    const controller = new AppController(repository, clock);
    await controller.initialize();
    clock.wall += 3_600_000;
    clock.mono += 1_000;
    await controller.checkpointRunning();
    expect(controller.getRemainingSeconds()).toBe(59);
  });

  it('R09 drops a session after a cross-document wall-clock rollback', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    await repository.createSession(createRunningSession(1, id, { wallMs: clock.wall + 10_000, monoMs: 0 }).persisted);
    const controller = new AppController(repository, clock);
    await controller.initialize();
    expect(controller.snapshot().timer.tag).toBe('idle');
    expect((await repository.getRuntime()).activeSession).toBeNull();
    expect(await repository.getRecords()).toEqual([]);
  });

  it('R10 ignores a damaged active session without inventing a record', async () => {
    const repository = new MemoryRepository();
    await expect(repository.createSession({ status: 'running' } as never)).rejects.toThrow();
    expect(await repository.getRecords()).toEqual([]);
  });

  it('R11/R12 restores a completion receipt, then dismisses it permanently', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    await repository.createSession(createRunningSession(1, id, { wallMs: clock.wall, monoMs: clock.mono }).persisted);
    await repository.settleSession({ sessionId: id, reason: 'natural', actualDurationSeconds: 60, settledAtWallMs: clock.wall });
    const restored = new AppController(repository, clock);
    await restored.initialize();
    expect(restored.snapshot().timer.tag).toBe('completed');
    await restored.returnHome();
    const reopened = new AppController(repository, clock);
    await reopened.initialize();
    expect(reopened.snapshot().timer.tag).toBe('idle');
  });
});

describe('cross-document convergence and sound claim', () => {
  it('reloads the persisted state instead of trusting a message payload', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    await repository.createSession(createRunningSession(1, id, { wallMs: clock.wall, monoMs: clock.mono }).persisted);
    const first = new AppController(repository, clock);
    const second = new AppController(repository, clock);
    await first.initialize();
    await second.initialize();
    clock.advance(1_000);
    await first.pause();
    await second.synchronize();
    expect(second.snapshot().timer.tag).toBe('paused');
  });

  it('allows only one completion-sound claim across competing documents', async () => {
    const repository = new MemoryRepository();
    const clock = new TestClock();
    await repository.createSession(createRunningSession(1, id, { wallMs: clock.wall, monoMs: clock.mono }).persisted);
    await repository.settleSession({ sessionId: id, reason: 'natural', actualDurationSeconds: 60, settledAtWallMs: clock.wall });
    const claims = await Promise.all([
      repository.claimNaturalCompletionSound(id),
      repository.claimNaturalCompletionSound(id),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});
