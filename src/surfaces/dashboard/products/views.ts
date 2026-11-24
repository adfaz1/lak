// Product list: quick filters, sort, visible columns and saved views (Salla audit MATRIX #33). Pure rules.
// A saved view is the list's address (filters, sort, columns) under a name, kept per viewer and optionally pinned
// as a tab. Opening it just opens that address, so a view is never a stale copy of the products.
import type { Category, Product } from '../../merchant/catalog';
import type { Level } from '../../merchant/inventory';
import { traits } from '../../merchant/catalog-extras';
import { hiddenReason, isLow, listPhoto, priceRange, stockOf } from './model';
import { isUncategorised, productQuality } from './quality';

/* ---------- Quick filters ---------- */

export type QuickFilter = 'noPrice' | 'hidden' | 'discounted' | 'soldOut' | 'low' | 'uncategorised' | 'noDesc' | 'noImage' | 'taxable' | 'noTax' | 'shipping' | 'needsWork';
export const QUICK_FILTERS: QuickFilter[] = ['needsWork', 'noImage', 'noDesc', 'uncategorised', 'noPrice', 'hidden', 'soldOut', 'low', 'discounted', 'taxable', 'noTax', 'shipping'];
export interface QuickCtx { levels: Level[]; cats: Category[] }

/** "noImage,low" → known filters in canonical order, no repeats. */
export function readQuick(v: string | null): QuickFilter[] {
  const want = new Set((v ?? '').split(',').map((x) => x.trim()));
  return QUICK_FILTERS.filter((f) => want.has(f));
}
export const writeQuick = (list: QuickFilter[]) => (list.length ? QUICK_FILTERS.filter((f) => list.includes(f)).join(',') : undefined);
export const toggleQuick = (list: QuickFilter[], f: QuickFilter) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]);

export function quickMatch(p: Product, f: QuickFilter, c: QuickCtx): boolean {
  switch (f) {
    case 'noPrice': return priceRange(p).min <= 0;
    case 'hidden': return hiddenReason({ status: p.status, channels: p.channels }) !== null && p.status !== 'archived';
    case 'discounted': return p.compareAt !== null && p.compareAt > priceRange(p).min;
    case 'soldOut': return stockOf(p, c.levels) === 0;
    case 'low': { const s = stockOf(p, c.levels); return s !== null && s > 0 && isLow(p, c.levels); }
    case 'uncategorised': return isUncategorised(p.category, c.cats);
    case 'noDesc': return !p.desc.ar.trim() || !p.desc.en.trim();
    case 'noImage': return !listPhoto(p);
    case 'taxable': return p.taxable !== false;
    case 'noTax': return p.taxable === false;
    case 'shipping': return traits(p.type).ships;
    case 'needsWork': return productQuality(p, c.cats).level !== 'good';
  }
}
/** Products matching every chosen quick filter (AND), so "no image + active" narrows as expected. */
export const applyQuick = (products: Product[], qf: QuickFilter[], c: QuickCtx) => (qf.length ? products.filter((p) => qf.every((f) => quickMatch(p, f, c))) : products);
/** How many of the given products each filter would show on its own (the count on each chip). */
export function quickCounts(products: Product[], c: QuickCtx): Record<QuickFilter, number> {
  return Object.fromEntries(QUICK_FILTERS.map((f) => [f, products.filter((p) => quickMatch(p, f, c)).length])) as Record<QuickFilter, number>;
}

/* ---------- Sort ---------- */

export type SortKey = 'catalogue' | 'name' | 'priceAsc' | 'priceDesc' | 'stockAsc' | 'qualityAsc' | 'newest';
export const SORTS: SortKey[] = ['catalogue', 'name', 'priceAsc', 'priceDesc', 'stockAsc', 'qualityAsc', 'newest'];
export const readSort = (v: string | null): SortKey => ((SORTS as string[]).includes(v ?? '') ? (v as SortKey) : 'catalogue');
const num = (id: string) => Number(id.replace(/\D/g, '')) || 0;
export function sortProducts(products: Product[], sort: SortKey, c: QuickCtx, lang: 'ar' | 'en' = 'ar'): Product[] {
  if (sort === 'catalogue') return products;
  const by = (f: (p: Product) => number) => [...products].sort((a, b) => f(a) - f(b) || num(a.id) - num(b.id));
  switch (sort) {
    case 'name': return [...products].sort((a, b) => a.name[lang].localeCompare(b.name[lang], lang));
    case 'priceAsc': return by((p) => priceRange(p).min);
    case 'priceDesc': return by((p) => -priceRange(p).min);
    // Digital products (no stock) go last.
    case 'stockAsc': return by((p) => stockOf(p, c.levels) ?? Number.MAX_SAFE_INTEGER);
    case 'qualityAsc': return by((p) => productQuality(p, c.cats).score);
    case 'newest': return by((p) => -num(p.id));
  }
}

/* ---------- Columns ---------- */

export type ColKey = 'sku' | 'status' | 'price' | 'stock' | 'quality' | 'category' | 'channels';
export const COLS: ColKey[] = ['sku', 'status', 'price', 'stock', 'quality', 'category', 'channels'];
export const DEFAULT_COLS: ColKey[] = ['sku', 'status', 'price', 'stock', 'quality', 'channels'];
/** Column list from the address; empty or unknown falls back to the default. The product name is always shown. */
export function readCols(v: string | null): ColKey[] {
  const want = new Set((v ?? '').split(',').map((x) => x.trim()));
  const list = COLS.filter((c) => want.has(c));
  return list.length ? list : DEFAULT_COLS;
}
export const writeCols = (list: ColKey[]) => {
  const ordered = COLS.filter((c) => list.includes(c));
  return ordered.length === 0 || (ordered.length === DEFAULT_COLS.length && ordered.every((c) => DEFAULT_COLS.includes(c))) ? undefined : ordered.join(',');
};

/* ---------- Saved views ---------- */

/** Address keys a view stores. Page and selection are never part of a view. */
export const VIEW_KEYS = ['q', 'tab', 'cat', 'ch', 'tag', 'qf', 'sort', 'cols'] as const;
export type ViewQuery = Partial<Record<(typeof VIEW_KEYS)[number], string>>;
export interface SavedView { id: string; owner: string; name: string; query: ViewQuery; pinned: boolean; at: number }
export const MAX_PINNED = 6;
export const VIEW_NAME_MAX = 30;

/** Only the view keys, without empty values, so two addresses that show the same list compare equal. */
export function viewQuery(get: (k: string) => string | null): ViewQuery {
  const out: ViewQuery = {};
  for (const k of VIEW_KEYS) { const v = (get(k) ?? '').trim(); if (v) out[k] = v; }
  return out;
}
export const sameQuery = (a: ViewQuery, b: ViewQuery) => VIEW_KEYS.every((k) => (a[k] ?? '') === (b[k] ?? ''));
export const viewsFor = (views: SavedView[], owner: string) => views.filter((v) => v.owner === owner);

export type ViewNameError = 'required' | 'long' | 'taken';
export function validateViewName(name: string, views: SavedView[], owner: string, exceptId?: string): ViewNameError | null {
  const n = name.trim();
  if (!n) return 'required';
  if (n.length > VIEW_NAME_MAX) return 'long';
  if (viewsFor(views, owner).some((v) => v.id !== exceptId && v.name.trim().toLowerCase() === n.toLowerCase())) return 'taken';
  return null;
}
export const nextViewId = (views: SavedView[]) => `V-${Math.max(0, ...views.map((v) => num(v.id))) + 1}`;
/** Pinning beyond the limit is refused (the merchant unpins one first), so the tab row never overflows silently. */
export const canPin = (views: SavedView[], owner: string, exceptId?: string) => viewsFor(views, owner).filter((v) => v.pinned && v.id !== exceptId).length < MAX_PINNED;

export function saveView(views: SavedView[], v: Omit<SavedView, 'id' | 'at'>, at: number): { views: SavedView[]; view: SavedView } | { error: ViewNameError | 'pins' } {
  const e = validateViewName(v.name, views, v.owner);
  if (e) return { error: e };
  if (v.pinned && !canPin(views, v.owner)) return { error: 'pins' };
  const view: SavedView = { ...v, name: v.name.trim(), id: nextViewId(views), at };
  return { views: [...views, view], view };
}
export function updateView(views: SavedView[], id: string, patch: Partial<Pick<SavedView, 'name' | 'query' | 'pinned'>>): { views: SavedView[] } | { error: ViewNameError | 'pins' | 'missing' } {
  const cur = views.find((v) => v.id === id);
  if (!cur) return { error: 'missing' };
  if (patch.name !== undefined) { const e = validateViewName(patch.name, views, cur.owner, id); if (e) return { error: e }; }
  if (patch.pinned && !cur.pinned && !canPin(views, cur.owner, id)) return { error: 'pins' };
  return { views: views.map((v) => (v.id === id ? { ...v, ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) } : v)) };
}
export const deleteView = (views: SavedView[], id: string) => views.filter((v) => v.id !== id);
/** Restore a deleted view at its old place (undo). */
export const restoreView = (views: SavedView[], v: SavedView, index: number) => (views.some((x) => x.id === v.id) ? views : [...views.slice(0, index), v, ...views.slice(index)]);

/** Starter views so the feature is visible on first open; they belong to the owner and can be renamed or deleted. */
export function viewFixtures(owner: string): SavedView[] {
  return [
    { id: 'V-1', owner, name: 'تحتاج تحسينًا', query: { qf: 'needsWork', sort: 'qualityAsc' }, pinned: true, at: 0 },
    { id: 'V-2', owner, name: 'قاربت على النفاد', query: { tab: 'active', qf: 'low', sort: 'stockAsc', cols: 'sku,price,stock' }, pinned: false, at: 0 },
  ];
}
