// Saved report views: a name for a report + period + comparison (+ sort), kept for this session.
// Pure rules first; the store is the only stateful line.
import { createStore } from '../../../core/store';

export interface SavedView { id: string; name: string; query: string; by: string; at: string }
export const MAX_VIEWS = 12;
/** Query keys a view keeps; anything else in the address (review, page) is left out. */
export const VIEW_KEYS = ['report', 'period', 'from', 'to', 'cmp', 'metric', 'sort'];

export function viewQuery(q: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const k of VIEW_KEYS) { const v = q.get(k); if (v) out.set(k, v); }
  return out.toString();
}

export type ViewError = 'empty' | 'long' | 'taken' | 'full';
export function checkViewName(name: string, list: SavedView[]): ViewError | null {
  const n = name.trim();
  if (!n) return 'empty';
  if (n.length > 40) return 'long';
  if (list.some((v) => v.name.trim().toLowerCase() === n.toLowerCase())) return 'taken';
  if (list.length >= MAX_VIEWS) return 'full';
  return null;
}
export function addView(list: SavedView[], name: string, query: string, by: string, at: string): SavedView[] {
  const n = list.reduce((m, v) => Math.max(m, Number(v.id.slice(2)) || 0), 0) + 1;
  return [...list, { id: `RV${n}`, name: name.trim(), query, by, at }];
}
export const removeView = (list: SavedView[], id: string) => list.filter((v) => v.id !== id);
/** The saved view that matches the current address exactly, if any. */
export const currentView = (list: SavedView[], q: URLSearchParams) => list.find((v) => v.query === viewQuery(q)) ?? null;

export const viewsStore = createStore.key('dashboard.analytics.views')<SavedView[]>(() => []);
