import { useSyncExternalStore } from 'react';

/**
 * In-memory fixture store. Simulated state only: it is not a ledger or a permission system.
 * A store created with a key is mirrored to sessionStorage, so a reload or a deep link opened
 * in the same tab keeps the work done in this session. "Reset data" clears it.
 */
export interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  reset: () => void;
  use: () => T;
}

const all: Store<unknown>[] = [];
const PREFIX = 'lak.fx.';

function load<T>(key: string | undefined): { ok: true; value: T } | { ok: false } {
  if (!key) return { ok: false };
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw === null ? { ok: false } : { ok: true, value: JSON.parse(raw) as T };
  } catch { return { ok: false }; }
}

function save(key: string | undefined, value: unknown): void {
  if (!key) return;
  try { sessionStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* quota or private mode: stay in memory */ }
}

export function createStore<T>(init: () => T, key?: string): Store<T> {
  const saved = load<T>(key);
  let state = saved.ok ? saved.value : init();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  const store: Store<T> = {
    get: () => state,
    set: (next) => { state = typeof next === 'function' ? (next as (p: T) => T)(state) : next; save(key, state); emit(); },
    reset: () => {
      state = init();
      if (key) try { sessionStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
      emit();
    },
    use: () => useSyncExternalStore(subscribe, () => state),
  };
  all.push(store as Store<unknown>);
  return store;
}

/** `createStore.key('surface.name')(init)`: a store that survives reloads within the tab session. */
createStore.key = (key: string) => <T,>(init: () => T): Store<T> => createStore(init, key);

/** Restore every surface's fixtures to their initial state, including stores not yet loaded. */
export function resetAll(): void {
  all.forEach((s) => s.reset());
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
