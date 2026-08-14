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

type MeditationSoundscape = {
  readonly label: string;
  readonly frequencies: readonly number[];
  readonly filterFrequency: number;
  readonly volume: number;
  readonly tempo: number;
  readonly beatsPerLoop: number;
  readonly chords: readonly (readonly number[])[];
  readonly arpeggio: readonly number[];
  readonly arpeggioVariation: readonly number[];
  readonly melody: readonly (number | null)[];
  readonly melodyVariation: readonly (number | null)[];
  readonly echoSeconds: number;
};

export const MEDITATION_SOUND_SCAPES = {
  stone: {
    label: '深岩夜曲',
    frequencies: [110, 164.81, 220],
    filterFrequency: 2_600,
    volume: 0.11,
    tempo: 54,
    beatsPerLoop: 32,
    // An original eight-bar minor-key nocturne progression.
    chords: [
      [48, 55, 60, 63], [44, 51, 56, 60], [51, 58, 63, 67], [46, 53, 58, 62],
      [48, 55, 60, 63], [53, 60, 65, 68], [46, 53, 58, 62], [43, 50, 55, 59],
    ],
    arpeggio: [0, 2, 1, 3, 2, 1, 3, 2],
    arpeggioVariation: [0, 1, 3, 2, 1, 3, 2, 1],
    melody: [
      67, null, 63, 65, 67, 70, 68, null,
      67, 63, 60, null, 62, 65, 63, null,
      67, 70, 72, null, 70, 67, 65, null,
      63, 65, 67, 62, 63, null, 60, null,
    ],
    melodyVariation: [
      63, 65, 67, null, 70, 68, 67, 65,
      63, null, 60, 63, 65, 67, 62, null,
      63, 67, 70, 72, 70, null, 68, 67,
      65, 63, 62, 65, 63, null, 60, null,
    ],
    echoSeconds: 0.44,
  },
  mist: {
    label: '晨雾晨曲',
    frequencies: [174.61, 261.63, 392],
    filterFrequency: 3_600,
    volume: 0.09,
    tempo: 60,
    beatsPerLoop: 32,
    // An original eight-bar major-key morning piece with a lighter contour.
    chords: [
      [53, 60, 65, 69], [48, 55, 60, 64], [50, 57, 62, 65], [46, 53, 58, 62],
      [53, 60, 65, 69], [57, 64, 69, 72], [50, 57, 62, 65], [48, 55, 60, 64],
    ],
    arpeggio: [0, 1, 2, 3, 2, 1, 2, 3],
    arpeggioVariation: [0, 2, 1, 3, 1, 2, 3, 2],
    melody: [
      69, 72, 74, null, 72, 69, 67, null,
      65, 67, 69, 72, 74, null, 72, null,
      77, 76, 74, 72, 69, 72, 74, null,
      72, 69, 67, 65, 67, null, 65, null,
    ],
    melodyVariation: [
      65, 69, 72, 74, 72, null, 69, 67,
      69, 72, 77, null, 76, 74, 72, null,
      74, 77, 81, 79, 77, null, 74, 72,
      69, 72, 70, 67, 69, null, 65, null,
    ],
    echoSeconds: 0.36,
  },
} as const satisfies Record<ThemePreference, MeditationSoundscape>;

export function getMeditationLoopDurationSeconds(theme: ThemePreference): number {
  const soundscape = MEDITATION_SOUND_SCAPES[theme];
  return soundscape.beatsPerLoop * 60 / soundscape.tempo;
}

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export class ThemeMeditationMusic implements MeditationMusicPort {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private schedulerId: number | null = null;
  private nextLoopStart = 0;
  private loopNumber = 0;
  private pianoWave: PeriodicWave | null = null;
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
    this.startScheduler();
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
    if (this.schedulerId !== null) window.clearInterval(this.schedulerId);
    this.schedulerId = null;
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.nextLoopStart = 0;
    this.loopNumber = 0;
    this.pianoWave = null;
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
    const musicBus = context.createGain();
    const echo = context.createDelay(1.5);
    const echoFeedback = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(soundscape.filterFrequency, context.currentTime);
    filter.Q.setValueAtTime(0.35, context.currentTime);
    musicBus.gain.setValueAtTime(0.82, context.currentTime);
    echo.delayTime.setValueAtTime(soundscape.echoSeconds, context.currentTime);
    echoFeedback.gain.setValueAtTime(0.16, context.currentTime);
    musicBus.connect(filter);
    filter.connect(master);
    filter.connect(echo);
    echo.connect(echoFeedback);
    echoFeedback.connect(echo);
    echo.connect(master);
    master.connect(context.destination);
    const pianoWave = context.createPeriodicWave(
      new Float32Array([0, 0, 0, 0, 0, 0]),
      new Float32Array([0, 1, 0.38, 0.2, 0.11, 0.06]),
      { disableNormalization: false },
    );
    this.context = context;
    this.master = master;
    this.musicBus = musicBus;
    this.pianoWave = pianoWave;
    this.nextLoopStart = context.currentTime + 0.06;
  }

  private startScheduler(): void {
    if (!this.context || !this.musicBus) return;
    if (this.nextLoopStart < this.context.currentTime + 0.02) {
      this.nextLoopStart = this.context.currentTime + 0.06;
    }
    this.scheduleAhead();
    if (this.schedulerId === null) {
      this.schedulerId = window.setInterval(() => this.scheduleAhead(), 2_000);
    }
  }

  private scheduleAhead(): void {
    if (!this.context || !this.musicBus) return;
    const scheduleUntil = this.context.currentTime + 8;
    while (this.nextLoopStart < scheduleUntil) {
      this.scheduleLoop(this.nextLoopStart, MEDITATION_SOUND_SCAPES[this.theme], this.loopNumber % 2 === 1);
      this.nextLoopStart += getMeditationLoopDurationSeconds(this.theme);
      this.loopNumber += 1;
    }
  }

  private scheduleLoop(loopStart: number, soundscape: MeditationSoundscape, variation: boolean): void {
    const secondsPerBeat = 60 / soundscape.tempo;
    const beatsPerBar = 4;
    const arpeggio = variation ? soundscape.arpeggioVariation : soundscape.arpeggio;
    const melody = variation ? soundscape.melodyVariation : soundscape.melody;
    soundscape.chords.forEach((chord, barIndex) => {
      const barStart = loopStart + barIndex * beatsPerBar * secondsPerBeat;

      chord.forEach((note, noteIndex) => {
        this.scheduleNote(note, barStart, 4.45 * secondsPerBeat, noteIndex === 0 ? 0.035 : 0.024, 'pad');
      });
      this.scheduleNote(chord[0]! - 12, barStart, 3.6 * secondsPerBeat, 0.05, 'bass');

      arpeggio.forEach((chordIndex, step) => {
        const note = chord[chordIndex % chord.length]! + (step >= 4 ? 12 : 0);
        this.scheduleNote(note, barStart + step * 0.5 * secondsPerBeat, 1.75 * secondsPerBeat, 0.075, 'piano');
      });
    });

    melody.forEach((note, beat) => {
      if (note === null) return;
      this.scheduleNote(note, loopStart + beat * secondsPerBeat, 1.65 * secondsPerBeat, 0.095, 'melody');
    });
  }

  private scheduleNote(
    midiNote: number,
    onset: number,
    duration: number,
    volume: number,
    voice: 'pad' | 'bass' | 'piano' | 'melody',
  ): void {
    if (!this.context || !this.musicBus) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const attack = voice === 'pad' ? 0.58 : voice === 'bass' ? 0.12 : voice === 'piano' ? 0.012 : 0.02;
    const release = Math.max(onset + attack + 0.08, onset + duration);
    if ((voice === 'piano' || voice === 'melody') && this.pianoWave) {
      oscillator.setPeriodicWave(this.pianoWave);
    } else {
      oscillator.type = 'sine';
    }
    oscillator.frequency.setValueAtTime(midiToFrequency(midiNote), onset);
    oscillator.detune.setValueAtTime(voice === 'melody' ? 1.5 : 0, onset);
    gain.gain.setValueAtTime(0.0001, onset);
    gain.gain.exponentialRampToValueAtTime(volume, onset + attack);
    if (voice === 'piano' || voice === 'melody') {
      const decayAt = Math.min(release - 0.06, onset + (voice === 'piano' ? 0.38 : 0.62));
      gain.gain.exponentialRampToValueAtTime(volume * (voice === 'piano' ? 0.34 : 0.52), decayAt);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, release);
    oscillator.connect(gain);
    gain.connect(this.musicBus);
    oscillator.start(onset);
    oscillator.stop(release + 0.04);
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
