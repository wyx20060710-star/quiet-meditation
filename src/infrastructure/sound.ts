import type { ThemePreference } from '../domain/types';

export interface SoundPort {
  playNaturalCompletion(): Promise<void>;
}

export interface MeditationMusicPort {
  start(theme: ThemePreference): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  setTheme(theme: ThemePreference): Promise<void>;
}

export const MEDITATION_SOUND_SCAPES = {
  stone: {
    label: '深岩余韵',
    frequencies: [110, 164.81, 220],
    waveforms: ['sine', 'triangle', 'sine'],
    filterFrequency: 720,
    lfoFrequency: 0.055,
    volume: 0.055,
  },
  mist: {
    label: '晨雾微光',
    frequencies: [174.61, 261.63, 392],
    waveforms: ['sine', 'sine', 'triangle'],
    filterFrequency: 1_650,
    lfoFrequency: 0.085,
    volume: 0.045,
  },
} as const;

export class ThemeMeditationMusic implements MeditationMusicPort {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: OscillatorNode[] = [];
  private theme: ThemePreference = 'stone';
  private playing = false;

  async start(theme: ThemePreference): Promise<void> {
    this.theme = theme;
    if (!this.context) this.createGraph(theme);
    if (!this.context || !this.master) throw new Error('Web Audio is unavailable');
    if (this.context.state === 'suspended') {
      await Promise.race([
        this.context.resume().catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
      ]);
    }
    const now = this.context.currentTime;
    const volume = MEDITATION_SOUND_SCAPES[theme].volume;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(volume, now + 1.8);
    this.playing = true;
  }

  async pause(): Promise<void> {
    if (!this.context || !this.master || !this.playing) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    this.playing = false;
  }

  async stop(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.master = null;
    this.voices = [];
    this.playing = false;
    if (context) await context.close().catch(() => undefined);
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    if (theme === this.theme) return;
    const wasPlaying = this.playing;
    await this.stop();
    this.theme = theme;
    if (wasPlaying) await this.start(theme);
  }

  private createGraph(theme: ThemePreference): void {
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is unavailable');
    const context = new AudioContextClass();
    const soundscape = MEDITATION_SOUND_SCAPES[theme];
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    const motion = context.createGain();
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(soundscape.filterFrequency, context.currentTime);
    filter.Q.setValueAtTime(0.45, context.currentTime);
    motion.gain.setValueAtTime(0.82, context.currentTime);
    lfo.frequency.setValueAtTime(soundscape.lfoFrequency, context.currentTime);
    lfoDepth.gain.setValueAtTime(0.12, context.currentTime);
    lfo.connect(lfoDepth);
    lfoDepth.connect(motion.gain);
    motion.connect(filter);
    filter.connect(master);
    master.connect(context.destination);
    lfo.start();

    this.voices = soundscape.frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = soundscape.waveforms[index] ?? 'sine';
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      oscillator.detune.setValueAtTime(index === 1 ? -4 : index === 2 ? 5 : 0, context.currentTime);
      gain.gain.setValueAtTime(index === 0 ? 0.5 : index === 1 ? 0.28 : 0.16, context.currentTime);
      oscillator.connect(gain);
      gain.connect(motion);
      oscillator.start();
      return oscillator;
    });
    this.context = context;
    this.master = master;
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
