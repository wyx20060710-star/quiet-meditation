import { describe, expect, it } from 'vitest';
import {
  COMPLETION_MELODY,
  COMPLETION_MUSIC_DURATION_MS,
  COMPLETION_VOLUME_SCALE,
  getMeditationLoopDurationSeconds,
  MEDITATION_SOUND_SCAPES,
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

describe('theme meditation soundscapes', () => {
  it('keeps distinct, continuous classical identities for both themes', () => {
    expect(MEDITATION_SOUND_SCAPES.stone.label).toBe('????');
    expect(MEDITATION_SOUND_SCAPES.mist.label).toBe('????');
    expect(MEDITATION_SOUND_SCAPES.stone.frequencies).not.toEqual(MEDITATION_SOUND_SCAPES.mist.frequencies);
    expect(MEDITATION_SOUND_SCAPES.stone.chords).toHaveLength(8);
    expect(MEDITATION_SOUND_SCAPES.mist.chords).toHaveLength(8);
    expect(MEDITATION_SOUND_SCAPES.stone.melody).toHaveLength(32);
    expect(MEDITATION_SOUND_SCAPES.stone.melody).not.toEqual(MEDITATION_SOUND_SCAPES.mist.melody);
    expect(MEDITATION_SOUND_SCAPES.stone.melodyVariation).toHaveLength(32);
    expect(MEDITATION_SOUND_SCAPES.mist.melodyVariation).toHaveLength(32);
    expect(MEDITATION_SOUND_SCAPES.stone.melodyVariation).not.toEqual(MEDITATION_SOUND_SCAPES.stone.melody);
    expect(MEDITATION_SOUND_SCAPES.mist.arpeggioVariation).not.toEqual(MEDITATION_SOUND_SCAPES.mist.arpeggio);
    expect(getMeditationLoopDurationSeconds('stone')).toBeGreaterThan(30);
    expect(getMeditationLoopDurationSeconds('mist')).toBeGreaterThanOrEqual(30);
    expect(MEDITATION_SOUND_SCAPES.stone.filterFrequency).toBeLessThan(MEDITATION_SOUND_SCAPES.mist.filterFrequency);
    expect(MEDITATION_SOUND_SCAPES.stone.volume).toBe(0.11);
    expect(MEDITATION_SOUND_SCAPES.mist.volume).toBe(0.09);
  });
});
