// Unsaved edits kept for the tab session, so leaving a page and coming back restores what was typed.
// One session store keyed by form; cleared on save or discard. Used by settings, online-store and team forms.
import { useCallback } from 'react';
import { createStore } from '../../../core/store';

export const formDraftsStore = createStore.key('dashboard.formDrafts')<Record<string, unknown>>(() => ({}));

/** [value, set, clear]: the session draft for `key` when one exists, otherwise `base`. */
export function useSessionDraft<T>(key: string, base: T): [T, (v: T) => void, () => void] {
  const all = formDraftsStore.use();
  const value = (key in all ? all[key] : base) as T;
  const set = useCallback((v: T) => formDraftsStore.set((d) => ({ ...d, [key]: v })), [key]);
  const clear = useCallback(() => formDraftsStore.set((d) => { const n = { ...d }; delete n[key]; return n; }), [key]);
  return [value, set, clear];
}
