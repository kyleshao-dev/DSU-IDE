/** Minimal editor host facade. Chromium/CDP and all DSU production code remain real. */
export class EventEmitter<T> {
  private listeners = new Set<(event: T) => unknown>();
  event = (listener: (event: T) => unknown) => {
    this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  };
  fire(event: T) { for (const listener of this.listeners) listener(event); }
  dispose() { this.listeners.clear(); }
}
export const ViewColumn = { Two: 2, Three: 3 };
export const window: Record<string, any> = {};
export const commands = { executeCommand: () => { throw new Error('Unexpected fallback browser'); } };
