// One place that knows whether the open page has unsaved edits. Editors call useUnsaved(dirty, label);
// the dashboard keeps the current page mounted when the address changes (link, search, Back) and asks first,
// so edits are never dropped silently. Closing or reloading the tab asks the browser.
import { useEffect, useId, useSyncExternalStore } from 'react';
import type { L } from '../merchant/domain';

const dirty = new Map<string, L>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach((l) => l()); };

export function useUnsaved(isDirty: boolean, label: L) {
  const id = useId();
  useEffect(() => {
    if (isDirty) dirty.set(id, label); else dirty.delete(id);
    emit();
    return () => { if (dirty.delete(id)) emit(); };
  }, [id, isDirty, label.ar, label.en]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const hasUnsaved = () => dirty.size > 0;
export const unsavedLabels = (): L[] => [...dirty.values()];
/** Forget every registration (used when the merchant chooses to leave without saving). */
export const discardUnsaved = () => { dirty.clear(); emit(); };
export const useUnsavedVersion = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } });
}
