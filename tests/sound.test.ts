import { describe, expect, it } from 'vitest';
import {
  COMPLETION_MELODY,
  COMPLETION_MUSIC_DURATION_MS,
  COMPLETION_VOLUME_SCALE,
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
  it('keeps distinct, gentle musical identities for both themes', () => {
    expect(MEDITATION_SOUND_SCAPES.stone.label).toBe('深岩余韵');
    expect(MEDITATION_SOUND_SCAPES.mist.label).toBe('晨雾微光');
    expect(MEDITATION_SOUND_SCAPES.stone.frequencies).not.toEqual(MEDITATION_SOUND_SCAPES.mist.frequencies);
    expect(MEDITATION_SOUND_SCAPES.stone.filterFrequency).toBeLessThan(MEDITATION_SOUND_SCAPES.mist.filterFrequency);
    expect(MEDITATION_SOUND_SCAPES.stone.volume).toBeLessThan(0.06);
    expect(MEDITATION_SOUND_SCAPES.mist.volume).toBeLessThan(0.06);
  });
});
