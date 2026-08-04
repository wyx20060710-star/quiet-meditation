import type {
  ConfirmingSession,
  LiveRunningSession,
  PausedSession,
  SettlementReason,
  SettlementReceipt,
} from './types';

export type TimerState =
  | { tag: 'idle' }
  | { tag: 'running'; session: LiveRunningSession }
  | { tag: 'paused'; session: PausedSession }
  | { tag: 'confirming'; session: ConfirmingSession }
  | { tag: 'settling'; sessionId: string; reason: SettlementReason }
  | { tag: 'completed'; receipt: SettlementReceipt };

export type TimerEvent =
  | { type: 'STARTED'; session: LiveRunningSession }
  | { type: 'PAUSED'; session: PausedSession }
  | { type: 'RESUMED'; session: LiveRunningSession }
  | { type: 'CONFIRM_OPENED'; session: ConfirmingSession }
  | { type: 'CONFIRM_CANCELLED'; session: LiveRunningSession | PausedSession }
  | { type: 'SETTLEMENT_STARTED'; sessionId: string; reason: SettlementReason }
  | { type: 'SETTLED'; receipt: SettlementReceipt }
  | { type: 'RETURN_HOME' };

const sameSession = (state: TimerState, id: string): boolean => {
  if (state.tag === 'running') return state.session.persisted.sessionId === id;
  if (state.tag === 'paused' || state.tag === 'confirming') return state.session.sessionId === id;
  if (state.tag === 'settling') return state.sessionId === id;
  return false;
};

export function timerReducer(state: TimerState, event: TimerEvent): TimerState {
  switch (event.type) {
    case 'STARTED':
      return state.tag === 'idle' || state.tag === 'completed' ? { tag: 'running', session: event.session } : state;
    case 'PAUSED':
      return state.tag === 'running' && sameSession(state, event.session.sessionId) ? { tag: 'paused', session: event.session } : state;
    case 'RESUMED':
      return (state.tag === 'paused' || state.tag === 'confirming') && sameSession(state, event.session.persisted.sessionId)
        ? { tag: 'running', session: event.session }
        : state;
    case 'CONFIRM_OPENED':
      return (state.tag === 'running' || state.tag === 'paused') && sameSession(state, event.session.sessionId)
        ? { tag: 'confirming', session: event.session }
        : state;
    case 'CONFIRM_CANCELLED': {
      if (state.tag !== 'confirming' || !sameSession(state, 'persisted' in event.session ? event.session.persisted.sessionId : event.session.sessionId)) return state;
      return 'persisted' in event.session ? { tag: 'running', session: event.session } : { tag: 'paused', session: event.session };
    }
    case 'SETTLEMENT_STARTED':
      return sameSession(state, event.sessionId) ? { tag: 'settling', sessionId: event.sessionId, reason: event.reason } : state;
    case 'SETTLED':
      return state.tag === 'settling' && state.sessionId === event.receipt.sessionId
        ? event.receipt.recorded ? { tag: 'completed', receipt: event.receipt } : { tag: 'idle' }
        : state;
    case 'RETURN_HOME':
      return state.tag === 'completed' ? { tag: 'idle' } : state;
  }
}
