import type { Clock } from '../src/infrastructure/clock';

export class TestClock implements Clock {
  constructor(public wall = 1_800_000_000_000, public mono = 10_000) {}
  wallNowMs(): number { return this.wall; }
  monotonicNowMs(): number { return this.mono; }
  advance(ms: number): void { this.wall += ms; this.mono += ms; }
}
