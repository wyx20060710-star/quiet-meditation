import {
  createRunningSession,
  displayedRemainingSeconds,
  earlyActualSeconds,
  effectiveElapsedMs,
  freezeRunning,
  frozenRemainingSeconds,
  openConfirmation,
  remainingMs,
  resumeSession,
} from '../domain/clock-model';
import { deriveStatistics } from '../domain/statistics';
import { timerReducer } from '../domain/timer-machine';
import type { TimerState } from '../domain/timer-machine';
import { defaultPreferences } from '../domain/types';
import type { ActiveSession, DailyRecord, RunningSession, ThemePreference, UserPreferences } from '../domain/types';
import { BrowserClock, sampleClock } from '../infrastructure/clock';
import type { Clock } from '../infrastructure/clock';
import { NoopChannel } from '../infrastructure/channel';
import type { ChannelPort } from '../infrastructure/channel';
import type { SessionRepository } from '../infrastructure/repository';
import type { SoundPort } from '../infrastructure/sound';

const silentSound: SoundPort = { playNaturalCompletion: async () => undefined };

export interface AppSnapshot {
  timer: TimerState;
  selectedMinutes: number;
  records: DailyRecord[];
  recordsExpanded: boolean;
  controlsVisible: boolean;
  persistent: boolean;
  busy: boolean;
  preferences: UserPreferences;
}

type Listener = () => void;

export class AppController {
  private state: AppSnapshot = {
    timer: { tag: 'idle' },
    selectedMinutes: 20,
    records: [],
    recordsExpanded: false,
    controlsVisible: false,
    persistent: true,
    busy: false,
    preferences: defaultPreferences(),
  };
  private listeners = new Set<Listener>();
  private tickListeners = new Set<Listener>();
  private ticker: number | undefined;
  private controlsTimeout: number | undefined;
  private settlementLock = false;
  private checkpointLock = false;
  private synchronization: Promise<void> | null = null;
  private unsubscribeChannel: (() => void) | undefined;

  constructor(
    private readonly repository: SessionRepository,
    private readonly clock: Clock = new BrowserClock(),
    persistent = true,
    private readonly sound: SoundPort = silentSound,
    private readonly channel: ChannelPort = new NoopChannel(),
    private readonly isVisible: () => boolean = () => typeof document === 'undefined' || document.visibilityState === 'visible',
  ) {
    this.state.persistent = persistent;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeTick(listener: Listener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  snapshot(): AppSnapshot { return this.state; }

  statistics() { return deriveStatistics(this.state.records, new Date(this.clock.wallNowMs())); }

  async initialize(): Promise<void> {
    const [runtime, records, preferences] = await Promise.all([
      this.repository.getRuntime(),
      this.repository.getRecords(),
      this.repository.getPreferences(),
    ]);
    this.state.selectedMinutes = runtime.uiRuntime.selectedDurationMinutes;
    this.state.records = records;
    this.state.preferences = preferences;
    const active = runtime.activeSession;
    if (active) await this.restoreActive(active);
    else if (runtime.uiRuntime.lastCompletionId) {
      const receipt = await this.repository.getSettlement(runtime.uiRuntime.lastCompletionId);
      if (receipt?.recorded) this.state.timer = { tag: 'completed', receipt };
    }
    this.unsubscribeChannel = this.channel.subscribe(() => { void this.synchronize(); });
    this.emit();
  }

  private async restoreActive(active: ActiveSession): Promise<void> {
    const sample = sampleClock(this.clock);
    if (active.status === 'running') {
      if (sample.wallMs < active.anchorWallMs - 2_000) {
        await this.repository.clearActiveSession(active.sessionId);
        this.channel.publish('runtime');
        this.state.timer = { tag: 'idle' };
        return;
      }
      const plannedMs = active.plannedDurationSeconds * 1000;
      const accumulatedMs = Math.min(plannedMs, active.accumulatedMs + Math.max(0, sample.wallMs - active.anchorWallMs));
      const persisted = { ...active, accumulatedMs, anchorWallMs: sample.wallMs };
      try {
        await this.repository.updateSession(persisted, 'running');
      } catch {
        return;
      }
      const live = { persisted, anchorMonoMs: sample.monoMs };
      this.state.timer = { tag: 'running', session: live };
      if (accumulatedMs >= plannedMs) await this.settleNatural(false);
      else this.startTicker();
    } else if (active.status === 'paused') {
      this.state.timer = { tag: 'paused', session: active };
      this.state.controlsVisible = true;
    } else {
      this.state.timer = { tag: 'confirming', session: active };
      this.state.controlsVisible = true;
    }
  }

  async synchronize(): Promise<void> {
    if (this.synchronization) return this.synchronization;
    this.synchronization = this.performSynchronization().finally(() => { this.synchronization = null; });
    return this.synchronization;
  }

  private async performSynchronization(): Promise<void> {
    try {
      const [runtime, records, preferences] = await Promise.all([
        this.repository.getRuntime(),
        this.repository.getRecords(),
        this.repository.getPreferences(),
      ]);
      this.stopTicker();
      this.state.records = records;
      this.state.preferences = preferences;
      this.state.selectedMinutes = runtime.uiRuntime.selectedDurationMinutes;
      this.state.controlsVisible = false;
      if (runtime.activeSession) {
        await this.restoreActive(runtime.activeSession);
      } else if (runtime.uiRuntime.lastCompletionId) {
        const receipt = await this.repository.getSettlement(runtime.uiRuntime.lastCompletionId);
        this.state.timer = receipt?.recorded ? { tag: 'completed', receipt } : { tag: 'idle' };
      } else {
        this.state.timer = { tag: 'idle' };
      }
      this.emit();
    } catch {
      // A transient synchronization failure must not disturb the current in-memory session.
      if (this.state.timer.tag === 'running') this.startTicker();
    }
  }

  async setDuration(minutes: number, notify = true): Promise<void> {
    const value = Math.min(60, Math.max(1, Math.round(minutes)));
    this.state.selectedMinutes = value;
    await this.repository.setSelectedMinutes(value);
    this.channel.publish('runtime');
    if (notify) this.emit();
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    if (theme !== 'stone' && theme !== 'mist') return;
    this.state.preferences = { ...this.state.preferences, theme };
    this.emit();
    try {
      await this.repository.setPreferences(this.state.preferences);
      this.channel.publish('preferences');
    } catch { /* The in-memory choice remains valid for this document. */ }
  }

  async setSoundEnabled(soundEnabled: boolean): Promise<void> {
    this.state.preferences = { ...this.state.preferences, soundEnabled };
    this.emit();
    try {
      await this.repository.setPreferences(this.state.preferences);
      this.channel.publish('preferences');
    } catch { /* The in-memory choice remains valid for this document. */ }
  }

  async start(): Promise<void> {
    if (this.state.busy || (this.state.timer.tag !== 'idle' && this.state.timer.tag !== 'completed')) return;
    this.state.busy = true;
    this.emit();
    try {
      const sample = sampleClock(this.clock);
      const requested = createRunningSession(this.state.selectedMinutes, crypto.randomUUID(), sample);
      const stored = await this.repository.createSession(requested.persisted);
      if (stored.status === 'running') {
        const live = stored.sessionId === requested.persisted.sessionId
          ? requested
          : { persisted: stored, anchorMonoMs: sample.monoMs };
        this.state.timer = timerReducer(this.state.timer, { type: 'STARTED', session: live });
        this.state.controlsVisible = false;
        this.state.recordsExpanded = false;
        this.startTicker();
      } else if (stored.status === 'paused') {
        this.state.timer = { tag: 'paused', session: stored };
        this.state.controlsVisible = true;
      } else {
        this.state.timer = { tag: 'confirming', session: stored };
        this.state.controlsVisible = true;
      }
      this.channel.publish('runtime');
    } catch {
      await this.synchronize();
    } finally {
      this.state.busy = false;
      this.emit();
    }
  }

  async pause(): Promise<void> {
    if (this.state.timer.tag !== 'running' || this.state.busy) return;
    const previous = this.state.timer;
    const paused = freezeRunning(previous.session, sampleClock(this.clock));
    this.state.busy = true;
    try {
      await this.repository.updateSession(paused, 'running');
      this.state.timer = timerReducer(previous, { type: 'PAUSED', session: paused });
      this.stopTicker();
      this.state.controlsVisible = true;
      this.channel.publish('runtime');
    } catch {
      await this.synchronize();
    } finally {
      this.state.busy = false;
      this.emit();
    }
  }

  async resume(): Promise<void> {
    if (this.state.timer.tag !== 'paused' || this.state.busy) return;
    const previous = this.state.timer;
    const live = resumeSession(previous.session, sampleClock(this.clock));
    this.state.busy = true;
    try {
      await this.repository.updateSession(live.persisted, 'paused');
      this.state.timer = timerReducer(previous, { type: 'RESUMED', session: live });
      this.state.controlsVisible = true;
      this.startTicker();
      this.scheduleControlsHide();
      this.channel.publish('runtime');
    } catch {
      await this.synchronize();
    } finally {
      this.state.busy = false;
      this.emit();
    }
  }

  async openEndConfirmation(): Promise<void> {
    const current = this.state.timer;
    if ((current.tag !== 'running' && current.tag !== 'paused') || this.state.busy) return;
    const confirmation = openConfirmation(current.session, sampleClock(this.clock));
    this.state.busy = true;
    try {
      await this.repository.updateSession(confirmation, current.tag);
      this.state.timer = timerReducer(current, { type: 'CONFIRM_OPENED', session: confirmation });
      this.stopTicker();
      this.state.controlsVisible = true;
      this.channel.publish('runtime');
    } catch {
      await this.synchronize();
    } finally {
      this.state.busy = false;
      this.emit();
    }
  }

  async cancelEndConfirmation(): Promise<void> {
    if (this.state.timer.tag !== 'confirming' || this.state.busy) return;
    const previous = this.state.timer;
    const sample = sampleClock(this.clock);
    const next = previous.session.resumeTo === 'running'
      ? resumeSession(previous.session, sample)
      : {
          schemaVersion: 1 as const,
          key: 'activeSession' as const,
          sessionId: previous.session.sessionId,
          status: 'paused' as const,
          plannedDurationSeconds: previous.session.plannedDurationSeconds,
          accumulatedMs: previous.session.accumulatedMs,
          createdAtWallMs: previous.session.createdAtWallMs,
          frozenAtWallMs: sample.wallMs,
        };
    this.state.busy = true;
    try {
      await this.repository.updateSession('persisted' in next ? next.persisted : next, 'confirming');
      this.state.timer = timerReducer(previous, { type: 'CONFIRM_CANCELLED', session: next });
      if ('persisted' in next) {
        this.startTicker();
        this.scheduleControlsHide();
      }
      this.channel.publish('runtime');
    } catch {
      await this.synchronize();
    } finally {
      this.state.busy = false;
      this.emit();
    }
  }

  async confirmEnd(): Promise<void> {
    if (this.state.timer.tag !== 'confirming') return;
    const session = this.state.timer.session;
    await this.settle(session.sessionId, 'early', earlyActualSeconds(session));
  }

  private async settleNatural(allowSound = true): Promise<void> {
    if (this.state.timer.tag !== 'running') return;
    await this.settle(
      this.state.timer.session.persisted.sessionId,
      'natural',
      this.state.timer.session.persisted.plannedDurationSeconds,
      allowSound,
    );
  }

  private async settle(
    sessionId: string,
    reason: 'natural' | 'early',
    actualDurationSeconds: number,
    allowSound = false,
  ): Promise<void> {
    if (this.settlementLock) return;
    this.settlementLock = true;
    const previous = this.state.timer;
    this.state.timer = timerReducer(previous, { type: 'SETTLEMENT_STARTED', sessionId, reason });
    this.state.busy = true;
    this.stopTicker();
    this.emit();
    try {
      const receipt = await this.repository.settleSession({
        sessionId,
        reason,
        actualDurationSeconds,
        settledAtWallMs: Math.trunc(this.clock.wallNowMs()),
      });
      this.state.timer = timerReducer(this.state.timer, { type: 'SETTLED', receipt });
      this.state.records = await this.repository.getRecords();
      this.state.controlsVisible = false;
      this.channel.publish('settled');
      if (allowSound && reason === 'natural' && this.state.preferences.soundEnabled && this.isVisible()) {
        void this.attemptCompletionSound(sessionId);
      }
    } catch {
      await this.synchronize();
    } finally {
      this.state.busy = false;
      this.settlementLock = false;
      this.emit();
    }
  }

  private async attemptCompletionSound(sessionId: string): Promise<void> {
    try {
      if (!await this.repository.claimNaturalCompletionSound(sessionId)) return;
      try {
        await this.sound.playNaturalCompletion();
      } catch {
        await this.repository.markNaturalCompletionSoundFailed(sessionId).catch(() => undefined);
      }
    } catch { /* Sound is an optional effect and never changes the completion flow. */ }
  }

  async repeat(): Promise<void> {
    if (this.state.timer.tag !== 'completed') return;
    const receipt = this.state.timer.receipt;
    this.state.selectedMinutes = receipt.plannedDurationSeconds / 60;
    this.state.timer = timerReducer(this.state.timer, { type: 'RETURN_HOME' });
    await this.repository.dismissCompletion(receipt.sessionId).catch(() => undefined);
    await this.start();
  }

  async returnHome(): Promise<void> {
    const receipt = this.state.timer.tag === 'completed' ? this.state.timer.receipt : null;
    this.state.timer = timerReducer(this.state.timer, { type: 'RETURN_HOME' });
    this.state.recordsExpanded = false;
    this.emit();
    if (receipt) {
      await this.repository.dismissCompletion(receipt.sessionId).catch(() => undefined);
      this.channel.publish('runtime');
    }
  }

  async handleVisibilityChange(hidden: boolean): Promise<void> {
    if (hidden) await this.checkpointRunning();
    else await this.synchronize();
  }

  async checkpointRunning(): Promise<void> {
    if (this.checkpointLock || this.state.timer.tag !== 'running') return;
    this.checkpointLock = true;
    const previous = this.state.timer.session;
    const sample = sampleClock(this.clock);
    const persisted: RunningSession = {
      ...previous.persisted,
      accumulatedMs: effectiveElapsedMs(previous, sample),
      anchorWallMs: sample.wallMs,
    };
    try {
      await this.repository.updateSession(persisted, 'running');
      if (this.state.timer.tag === 'running'
        && this.state.timer.session.persisted.sessionId === persisted.sessionId) {
        this.state.timer = { tag: 'running', session: { persisted, anchorMonoMs: sample.monoMs } };
      }
      this.channel.publish('runtime');
    } catch {
      await this.synchronize();
    } finally {
      this.checkpointLock = false;
    }
  }

  toggleRecords(): void { this.state.recordsExpanded = !this.state.recordsExpanded; this.emit(); }

  revealControls(): void {
    if (this.state.timer.tag !== 'running') return;
    this.state.controlsVisible = true;
    this.emit();
    this.scheduleControlsHide();
  }

  getRemainingSeconds(): number {
    const timer = this.state.timer;
    if (timer.tag === 'running') return displayedRemainingSeconds(timer.session, sampleClock(this.clock));
    if (timer.tag === 'paused' || timer.tag === 'confirming') return frozenRemainingSeconds(timer.session);
    return 0;
  }

  getProgress(): number {
    const timer = this.state.timer;
    if (timer.tag === 'running') {
      const planned = timer.session.persisted.plannedDurationSeconds * 1000;
      return remainingMs(timer.session, sampleClock(this.clock)) / planned;
    }
    if (timer.tag === 'paused' || timer.tag === 'confirming') {
      return Math.max(0, timer.session.plannedDurationSeconds * 1000 - timer.session.accumulatedMs)
        / (timer.session.plannedDurationSeconds * 1000);
    }
    return 0;
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = window.setInterval(() => {
      if (this.state.timer.tag !== 'running') return;
      const sample = sampleClock(this.clock);
      const live = this.state.timer.session;
      const wallDelta = sample.wallMs - live.persisted.anchorWallMs;
      const monoDelta = sample.monoMs - live.anchorMonoMs;
      if (Math.abs(wallDelta - monoDelta) > 2_000) void this.checkpointRunning();
      if (displayedRemainingSeconds(live, sample) <= 0) void this.settleNatural();
      else for (const listener of this.tickListeners) listener();
    }, 200);
  }

  private stopTicker(): void {
    if (this.ticker !== undefined) window.clearInterval(this.ticker);
    this.ticker = undefined;
  }

  private scheduleControlsHide(): void {
    if (this.controlsTimeout !== undefined) window.clearTimeout(this.controlsTimeout);
    this.controlsTimeout = window.setTimeout(() => {
      if (this.state.timer.tag === 'running') {
        this.state.controlsVisible = false;
        this.emit();
      }
    }, 4_000);
  }

  private emit(): void { for (const listener of this.listeners) listener(); }
}
