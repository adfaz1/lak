import { useSyncExternalStore } from 'react';

/** In-memory fixture store. Simulated state only: it resets on reload and is not a ledger or a permission system. */
export interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  reset: () => void;
  use: () => T;
}

const all: Store<unknown>[] = [];

export function createStore<T>(init: () => T): Store<T> {
  let state = init();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  const store: Store<T> = {
    get: () => state,
    set: (next) => { state = typeof next === 'function' ? (next as (p: T) => T)(state) : next; emit(); },
    reset: () => { state = init(); emit(); },
    use: () => useSyncExternalStore(subscribe, () => state),
  };
  all.push(store as Store<unknown>);
  return store;
}

/** Restore every surface's fixtures to their initial state. */
export function resetAll(): void {
  all.forEach((s) => s.reset());
}
