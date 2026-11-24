// Saved order views: the merchant names the current search, filters, tab and sort, pins the ones used daily as tabs,
// renames and deletes them. Kept per viewer (team member) for this session; the list URL stays the source of truth.
import { createStore } from '../../../core/store';
import { toParams, type ListQuery } from './model';

export interface SavedView { id: string; name: string; params: Record<string, string>; pinned: boolean; at: number }
export const VIEW_NAME_MAX = 30;
export const MAX_PINNED = 6;

/** Views by viewer name. Simulated: a real account would keep them on the server and could share them. */
export const savedViewsStore = createStore.key('dashboard.orders.savedViews')<Record<string, SavedView[]>>(() => ({}));

/** The list state a view stores: everything in the URL except the page. */
export function viewParams(q: ListQuery): Record<string, string> {
  const p = toParams(q, { page: 1 });
  return Object.fromEntries(Object.entries(p).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));
}
export const sameParams = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};
/** The saved view the list is showing now, if its stored state equals the URL's. */
export const currentView = (views: SavedView[], q: ListQuery) => { const p = viewParams(q); return views.find((v) => sameParams(v.params, p)); };

export type ViewNameError = 'empty' | 'long' | 'taken';
export function viewNameError(name: string, views: SavedView[], exceptId?: string): ViewNameError | null {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return 'empty';
  if (n.length > VIEW_NAME_MAX) return 'long';
  if (views.some((v) => v.id !== exceptId && v.name.toLowerCase() === n.toLowerCase())) return 'taken';
  return null;
}

export function addView(views: SavedView[], name: string, params: Record<string, string>, pinned: boolean, now: number): { views: SavedView[]; id?: string; error?: ViewNameError } {
  const error = viewNameError(name, views);
  if (error) return { views, error };
  const id = `V${now.toString(36)}${views.length}`;
  const pin = pinned && views.filter((v) => v.pinned).length < MAX_PINNED;
  return { views: [...views, { id, name: name.trim().replace(/\s+/g, ' '), params, pinned: pin, at: now }], id };
}
export function renameView(views: SavedView[], id: string, name: string): { views: SavedView[]; error?: ViewNameError } {
  const error = viewNameError(name, views, id);
  if (error) return { views, error };
  return { views: views.map((v) => (v.id === id ? { ...v, name: name.trim().replace(/\s+/g, ' ') } : v)) };
}
/** Pin or unpin. Pinning past the limit does nothing (the screen says why). */
export function pinView(views: SavedView[], id: string, pinned: boolean): SavedView[] {
  if (pinned && views.filter((v) => v.pinned && v.id !== id).length >= MAX_PINNED) return views;
  return views.map((v) => (v.id === id ? { ...v, pinned } : v));
}
export const removeView = (views: SavedView[], id: string) => views.filter((v) => v.id !== id);
/** Put a deleted view back where it was (undo). */
export const restoreView = (views: SavedView[], v: SavedView, at: number) => (views.some((x) => x.id === v.id) ? views : [...views.slice(0, at), v, ...views.slice(at)]);
