export interface SoundPort {
  playNaturalCompletion(): Promise<void>;
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
