export type StorageChange = 'runtime' | 'records' | 'preferences' | 'settled';
type Listener = (change: StorageChange) => void;

export interface ChannelPort {
  publish(change: StorageChange): void;
  subscribe(listener: Listener): () => void;
  close(): void;
}

export class NoopChannel implements ChannelPort {
  publish(): void {}
  subscribe(): () => void { return () => undefined; }
  close(): void {}
}

export class BrowserChannel implements ChannelPort {
  private readonly channel: BroadcastChannel | null;
  private readonly listeners = new Set<Listener>();

  constructor(name = 'quiet-meditation-v1') {
    try {
      this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
      this.channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (!['runtime', 'records', 'preferences', 'settled'].includes(String(event.data))) return;
        for (const listener of this.listeners) listener(event.data as StorageChange);
      });
    } catch {
      this.channel = null;
    }
  }

  publish(change: StorageChange): void {
    try { this.channel?.postMessage(change); } catch { /* Synchronization also occurs on visibility changes. */ }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void { this.channel?.close(); }
}
