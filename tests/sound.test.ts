import { describe, expect, it } from 'vitest';
import {
  AMBIENT_SOUND_PROFILES,
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

describe('procedural forest soundscapes', () => {
  it('keeps every period restrained and distinct', () => {
    expect(Object.keys(AMBIENT_SOUND_PROFILES)).toEqual(['morning', 'day', 'dusk', 'night']);
    expect(AMBIENT_SOUND_PROFILES.morning.birdsPerMinute).toBeGreaterThan(AMBIENT_SOUND_PROFILES.night.birdsPerMinute);
    expect(AMBIENT_SOUND_PROFILES.night.masterVolume).toBeLessThanOrEqual(AMBIENT_SOUND_PROFILES.day.masterVolume);
    expect(AMBIENT_SOUND_PROFILES.dusk.windGain).not.toBe(AMBIENT_SOUND_PROFILES.morning.windGain);
  });
});
