import type { DailyRecord } from './types';
import { localDateSequence } from './local-date';

export interface DayStatistic {
  dateKey: string;
  totalSeconds: number;
  completionCount: number;
  ratio: number;
}

export interface Statistics {
  todaySeconds: number;
  todayCount: number;
  last7Seconds: number;
  last15: DayStatistic[];
}

export function deriveStatistics(records: DailyRecord[], now: Date): Statistics {
  const byDate = new Map(records.map((record) => [record.dateKey, record]));
  const keys = localDateSequence(now, 15);
  const maximum = Math.max(0, ...keys.map((key) => byDate.get(key)?.totalSeconds ?? 0));
  const last15 = keys.map((dateKey) => {
    const record = byDate.get(dateKey);
    const totalSeconds = record?.totalSeconds ?? 0;
    return {
      dateKey,
      totalSeconds,
      completionCount: record?.completionCount ?? 0,
      ratio: maximum === 0 ? 0 : totalSeconds / maximum,
    };
  });
  const today = last15.at(-1)!;
  return {
    todaySeconds: today.totalSeconds,
    todayCount: today.completionCount,
    last7Seconds: last15.slice(-7).reduce((sum, day) => sum + day.totalSeconds, 0),
    last15,
  };
}

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
};
