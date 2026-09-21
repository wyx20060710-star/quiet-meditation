import { ambientProfileAt } from '../src/domain/ambient-profile';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AMBIENT_SOUND_PROFILES,
  StudyAmbientSound,
  COMPLETION_MELODY,
  COMPLETION_MUSIC_DURATION_MS,
  COMPLETION_VOLUME_SCALE,
} from '../src/infrastructure/sound';

describe('natural-completion music cue', () => {
  it('uses a ten-second, slow pentatonic closing phrase', () => {
    expect(COMPLETION_MUSIC_DURATION_MS).toBe(10_000);
    expect(COMPLETION_MELODY).toHaveLength(6);
    expect(COMPLETION_MELODY[0]?.delaySeconds).toBeGreaterThanOrEqual(0);
    expect(COMPLETION_MELODY.at(-1)?.delaySeconds).toBeLessThan(8);
    expect(COMPLETION_VOLUME_SCALE).toBe(1.3);
  });
});

describe('study background sound', () => {
  it('keeps a steady sound across visual periods', () => {
    expect(Object.keys(AMBIENT_SOUND_PROFILES)).toEqual(['morning', 'day', 'dusk', 'night']);
    for (const profile of Object.values(AMBIENT_SOUND_PROFILES)) {
      expect(profile).toEqual(AMBIENT_SOUND_PROFILES.day);
      expect(profile.masterVolume).toBeGreaterThan(0);
      expect(profile.masterVolume).toBeLessThanOrEqual(0.15);
      expect(profile.lowpassHz).toBeLessThanOrEqual(1000);
    }
  });
});

describe('study audio playback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loops a smooth noise buffer and releases playback resources', async () => {
    vi.useFakeTimers();
    let seed = 42;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    const data = new Float32Array(48000 * 12);
    const parameter = () => ({ value: 0.0001, setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const source = { buffer: null, loop: false, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const context = {
      state: 'running', currentTime: 0, sampleRate: 48000, destination: {},
      createGain: () => ({ gain: parameter(), connect: vi.fn() }),
      createBuffer: () => ({ getChannelData: () => data }),
      createBufferSource: vi.fn(() => source),
      createBiquadFilter: () => ({ frequency: parameter(), Q: parameter(), connect: vi.fn() }),
      suspend: vi.fn(async () => { context.state = 'suspended'; }),
      resume: vi.fn(async () => { context.state = 'running'; }),
      close: vi.fn(async () => { context.state = 'closed'; }),
    };
    vi.stubGlobal('window', { AudioContext: class { constructor() { return context; } }, setTimeout });
    const sound = new StudyAmbientSound();
    const profile = ambientProfileAt(new Date(2026, 8, 21, 12));
    await sound.start(profile);
    expect(source.loop).toBe(true);
    expect(source.start).toHaveBeenCalledOnce();
    expect(data.every(Number.isFinite)).toBe(true);
    const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    expect(rms).toBeGreaterThan(0.05);
    expect(rms).toBeLessThan(0.3);
    // A seam should be no larger than an ordinary noise sample step.
    let largestStep = 0;
    for (let i = 1; i < data.length; i += 1) largestStep = Math.max(largestStep, Math.abs(data[i]! - data[i - 1]!));
    expect(Math.abs(data[0]! - data[data.length - 1]!)).toBeLessThanOrEqual(largestStep);
    const pausing = sound.pause();
    await vi.advanceTimersByTimeAsync(480);
    await pausing;
    expect(context.suspend).toHaveBeenCalledOnce();
    await sound.start(profile);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.createBufferSource).toHaveBeenCalledOnce();
    await sound.stop();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
