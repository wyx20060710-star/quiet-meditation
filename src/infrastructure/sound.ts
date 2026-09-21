import { AMBIENT_DEFINITIONS } from '../domain/ambient-profile';
import type { AmbientPeriod, AmbientProfile } from '../domain/ambient-profile';

export interface SoundPort {
  playNaturalCompletion(): Promise<void>;
}

export interface AmbientSoundPort {
  start(profile: AmbientProfile): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
}

export const AMBIENT_SOUND_PROFILES = {
  morning: AMBIENT_DEFINITIONS.morning.sound,
  day: AMBIENT_DEFINITIONS.day.sound,
  dusk: AMBIENT_DEFINITIONS.dusk.sound,
  night: AMBIENT_DEFINITIONS.night.sound,
} as const satisfies Record<AmbientPeriod, AmbientProfile['sound']>;

export class StudyAmbientSound implements AmbientSoundPort {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private profile: AmbientProfile | null = null;
  private playing = false;

  async start(profile: AmbientProfile): Promise<void> {
    if (this.profile?.period !== profile.period && this.context) await this.stop();
    this.profile = profile;
    if (!this.context) this.createGraph(profile);
    if (!this.context || !this.master) throw new Error('Web Audio is unavailable');
    if (this.context.state === 'suspended') {
      await Promise.race([
        this.context.resume().catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
      ]);
    }
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(profile.sound.masterVolume, now + 1.8);
    this.playing = true;
  }

  async pause(): Promise<void> {
    if (!this.context || !this.master || !this.playing) return;
    const context = this.context;
    const now = context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    this.playing = false;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 480));
    if (this.context === context && context.state === 'running') {
      await context.suspend().catch(() => undefined);
    }
  }

  async stop(): Promise<void> {
    const context = this.context;
    for (const source of this.sources) {
      try { source.stop(); } catch { /* A source may already have ended. */ }
    }
    this.sources = [];
    this.context = null;
    this.master = null;
    this.profile = null;
    this.playing = false;
    if (context) await context.close().catch(() => undefined);
  }

  private createGraph(profile: AmbientProfile): void {
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is unavailable');
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    this.createNoiseLayer(profile.sound.noiseGain, profile.sound.lowpassHz);
  }

  private createNoiseLayer(baseGain: number, frequency: number): void {
    if (!this.context || !this.master) return;
    const context = this.context;
    const length = Math.floor(context.sampleRate * 12);
    const overlap = Math.floor(context.sampleRate * 0.1);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    const noise = new Float32Array(length + overlap);
    let smoothed = 0;
    for (let index = 0; index < noise.length; index += 1) {
      smoothed = smoothed * 0.985 + (Math.random() * 2 - 1) * 0.015;
      noise[index] = smoothed * 3.2;
    }
    data.set(noise.subarray(0, length));
    // Blend the continued tail into the beginning to avoid a click at each loop.
    for (let index = 0; index < overlap; index += 1) {
      const blend = (1 - Math.cos(Math.PI * index / overlap)) / 2;
      data[index] = noise[length + index]! * (1 - blend) + noise[index]! * blend;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, context.currentTime);
    filter.Q.setValueAtTime(0.2, context.currentTime);
    gain.gain.setValueAtTime(baseGain, context.currentTime);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    this.sources.push(source);
  }
}

export const COMPLETION_MUSIC_DURATION_MS = 10_000;
export const COMPLETION_VOLUME_SCALE = 1.3;

export const COMPLETION_MELODY = [
  { delaySeconds: 0.1, frequency: 261.63 },
  { delaySeconds: 1.55, frequency: 329.63 },
  { delaySeconds: 3, frequency: 392 },
  { delaySeconds: 4.45, frequency: 523.25 },
  { delaySeconds: 5.9, frequency: 392 },
  { delaySeconds: 7.35, frequency: 329.63 },
] as const;

export class GentleChime implements SoundPort {
  async playNaturalCompletion(): Promise<void> {
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is unavailable');
    const context = new AudioContextClass();
    try {
      if (context.state === 'suspended') await context.resume();
      const started = context.currentTime;
      const ending = started + COMPLETION_MUSIC_DURATION_MS / 1000;
      const master = context.createGain();
      const warmth = context.createBiquadFilter();
      warmth.type = 'lowpass';
      warmth.frequency.setValueAtTime(2_400, started);
      warmth.Q.setValueAtTime(0.35, started);
      master.gain.setValueAtTime(0.0001, started);
      master.gain.exponentialRampToValueAtTime(0.82, started + 0.2);
      master.gain.setValueAtTime(0.82, ending - 2.1);
      master.gain.exponentialRampToValueAtTime(0.0001, ending - 0.08);
      master.connect(warmth);
      warmth.connect(context.destination);

      // A nearly inaudible open fifth keeps the ten-second cue cohesive.
      for (const frequency of [130.81, 196] as const) {
        const oscillator = context.createOscillator();
        const padGain = context.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, started);
        padGain.gain.setValueAtTime(0.0001, started);
        padGain.gain.exponentialRampToValueAtTime(0.006 * COMPLETION_VOLUME_SCALE, started + 1.4);
        padGain.gain.setValueAtTime(0.006 * COMPLETION_VOLUME_SCALE, ending - 2.2);
        padGain.gain.exponentialRampToValueAtTime(0.0001, ending - 0.1);
        oscillator.connect(padGain);
        padGain.connect(master);
        oscillator.start(started);
        oscillator.stop(ending);
      }

      // Slow C-major pentatonic notes form a restrained harp-like closing phrase.
      for (const note of COMPLETION_MELODY) {
        const onset = started + note.delaySeconds;
        const release = Math.min(ending - 0.06, onset + 2.45);
        const oscillator = context.createOscillator();
        const noteGain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(note.frequency, onset);
        noteGain.gain.setValueAtTime(0.0001, onset);
        noteGain.gain.exponentialRampToValueAtTime(0.032 * COMPLETION_VOLUME_SCALE, onset + 0.055);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, release);
        oscillator.connect(noteGain);
        noteGain.connect(master);
        oscillator.start(onset);
        oscillator.stop(release + 0.02);
      }

      await new Promise<void>((resolve) => window.setTimeout(resolve, COMPLETION_MUSIC_DURATION_MS));
    } finally {
      await context.close().catch(() => undefined);
    }
  }
}
