import type { ClockSample } from '../domain/types';

export interface Clock {
  wallNowMs(): number;
  monotonicNowMs(): number;
}

export class BrowserClock implements Clock {
  wallNowMs(): number { return Date.now(); }
  monotonicNowMs(): number { return performance.now(); }
}

export const sampleClock = (clock: Clock): ClockSample => ({
  wallMs: Math.trunc(clock.wallNowMs()),
  monoMs: clock.monotonicNowMs(),
});
