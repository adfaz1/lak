// Per-viewer conveniences kept in this browser only: recent searches, recent tools and favourite tools.
// Losing them is harmless; every read and write is guarded.
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

function read(key: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function write(key: string, v: string[]) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* preference only */ } cache.delete(key); emit(); }
const cache = new Map<string, string[]>();
const get = (key: string) => { if (!cache.has(key)) cache.set(key, read(key)); return cache.get(key)!; };

const push = (key: string, v: string, max: number) => write(key, [v, ...get(key).filter((x) => x !== v)].slice(0, max));

export const recentSearches = () => get('lak.search.recent');
export const pushRecentSearch = (q: string) => push('lak.search.recent', q, 6);
export const pushRecentTool = (id: string) => push('lak.tools.recent', id, 8);
export const toggleFavourite = (id: string) => { const f = get('lak.tools.fav'); write('lak.tools.fav', f.includes(id) ? f.filter((x) => x !== id) : [...f, id]); };

export const useRecentTools = () => useSyncExternalStore(subscribe, () => get('lak.tools.recent'));
export const useFavourites = () => useSyncExternalStore(subscribe, () => get('lak.tools.fav'));
