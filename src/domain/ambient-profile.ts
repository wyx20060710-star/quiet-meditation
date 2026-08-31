export type AmbientPeriod = 'morning' | 'day' | 'dusk' | 'night';

export interface AmbientProfile {
  period: AmbientPeriod;
  label: string;
  prompt: string;
  themeColor: string;
  sound: {
    masterVolume: number;
    windGain: number;
    waterGain: number;
    birdsPerMinute: number;
  };
}

type AmbientDefinition = Omit<AmbientProfile, 'prompt'> & { prompts: readonly [string, string] };

export const AMBIENT_DEFINITIONS: Record<AmbientPeriod, AmbientDefinition> = {
  morning: {
    period: 'morning',
    label: '晨光林隙',
    prompts: ['慢一点，今天才刚开始。', '先回到这一口呼吸。'],
    themeColor: '#56634c',
    sound: { masterVolume: 0.075, windGain: 0.34, waterGain: 0.12, birdsPerMinute: 4 },
  },
  day: {
    period: 'day',
    label: '清透林间',
    prompts: ['把喧闹留在林外。', '此刻，只做一件事。'],
    themeColor: '#526656',
    sound: { masterVolume: 0.07, windGain: 0.4, waterGain: 0.16, birdsPerMinute: 2.5 },
  },
  dusk: {
    period: 'dusk',
    label: '暮色林间',
    prompts: ['让今天慢慢落下。', '不必带着所有事情继续走。'],
    themeColor: '#6d5d48',
    sound: { masterVolume: 0.065, windGain: 0.28, waterGain: 0.2, birdsPerMinute: 1.2 },
  },
  night: {
    period: 'night',
    label: '夜色林间',
    prompts: ['把未完成的，暂时放下。', '这一刻，不需要抵达哪里。'],
    themeColor: '#172d2d',
    sound: { masterVolume: 0.055, windGain: 0.22, waterGain: 0.24, birdsPerMinute: 0 },
  },
};

export function ambientPeriodAt(date: Date): AmbientPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'dusk';
  return 'night';
}

const stablePromptIndex = (date: Date): 0 | 1 => {
  const localDay = date.getFullYear() * 372 + date.getMonth() * 31 + date.getDate();
  return (localDay % 2) as 0 | 1;
};

export function ambientProfileAt(date: Date): AmbientProfile {
  const definition = AMBIENT_DEFINITIONS[ambientPeriodAt(date)];
  return { ...definition, prompt: definition.prompts[stablePromptIndex(date)] };
}

export function millisecondsUntilNextAmbientPeriod(date: Date): number {
  const next = new Date(date);
  const hour = date.getHours();
  const nextHour = hour < 5 ? 5 : hour < 11 ? 11 : hour < 17 ? 17 : hour < 21 ? 21 : 29;
  next.setHours(nextHour, 0, 0, 0);
  return Math.max(1, next.getTime() - date.getTime());
}
