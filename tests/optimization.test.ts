import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '../src/app/controller';
import { MemoryRepository } from '../src/infrastructure/memory-repository';
import { TestClock } from './helpers';

beforeEach(() => {
  vi.stubGlobal('window', {
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(),
    setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(),
  });
});

describe('resilient session preparation', () => {
  it('keeps the chosen duration usable and reports a failed preference write', async () => {
    const repository = new MemoryRepository();
    const controller = new AppController(repository, new TestClock());
    await controller.initialize();
    vi.spyOn(repository, 'setSelectedMinutes').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(controller.setDuration(12)).resolves.toBeUndefined();
    expect(controller.snapshot().selectedMinutes).toBe(12);
    expect(controller.snapshot().notice).toContain('暂时无法保存');
    await controller.setDuration(15);
    expect(controller.snapshot().notice).toBe('');
    expect((await repository.getRuntime()).uiRuntime.selectedDurationMinutes).toBe(15);
  });

  it('rejects invalid durations and changes during an active session', async () => {
    const repository = new MemoryRepository();
    const controller = new AppController(repository, new TestClock());
    await controller.initialize();
    await controller.setDuration(Number.NaN);
    await controller.setDuration(Infinity);
    expect(controller.snapshot().selectedMinutes).toBe(5);
    await controller.start();
    await controller.setDuration(20);
    expect(controller.getRemainingSeconds()).toBe(300);
    expect(controller.snapshot().selectedMinutes).toBe(5);
  });

  it('stops ambient audio after a failed start and permits retry', async () => {
    const repository = new MemoryRepository();
    const ambient = { start: vi.fn(async () => undefined), pause: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) };
    const controller = new AppController(repository, new TestClock(), true, undefined, undefined, undefined, ambient);
    await controller.initialize();
    vi.spyOn(repository, 'createSession').mockRejectedValueOnce(new Error('storage unavailable'));
    await controller.start();
    expect(controller.snapshot().timer.tag).toBe('idle');
    expect(controller.snapshot().busy).toBe(false);
    expect(controller.snapshot().notice).toContain('暂时无法开始');
    expect(ambient.stop).toHaveBeenCalled();
    await controller.start();
    expect(controller.snapshot().timer.tag).toBe('running');
    expect(controller.snapshot().notice).toBe('');
  });

  it('allows records to be expanded at home without creating a session', async () => {
    const repository = new MemoryRepository();
    const controller = new AppController(repository, new TestClock());
    await controller.initialize();
    controller.toggleRecords();
    expect(controller.snapshot().recordsExpanded).toBe(true);
    expect((await repository.getRuntime()).activeSession).toBeNull();
    expect(controller.statistics().todaySeconds).toBe(0);
  });
});
