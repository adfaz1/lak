// Recommendations & bought together (free app): rules only. «Often bought with» comes from real co-purchases in the
// order book: two products count as bought together when they share an order, and a pair is suggested only once it
// reaches the merchant's minimum number of orders. Manual picks come first. Only products the online store can sell
// right now are suggested (active, online, not hidden by a restriction, in stock), never one already in the bag.
import type { Order } from '../../../merchant/domain';
import type { Product as MProduct } from '../../../merchant/catalog';
import type { Product } from '../../../storefront/domain';

export interface UpsellSettings {
  /** Orders a pair must share before it is suggested. */
  minSupport: number;
  /** Suggestions on a product page. */
  maxShown: number;
  productBlock: boolean;
  bagSuggest: boolean;
  /** Manual picks per product id, shown first, in order. */
  manual: Record<string, string[]>;
  /** Products never suggested. */
  exclude: string[];
}
export const UPSELL_DEFAULTS: UpsellSettings = { minSupport: 3, maxShown: 3, productBlock: true, bagSuggest: true, manual: {}, exclude: [] };

export type UpsellError = 'support' | 'shown' | 'nothing';
export function upsellProblems(s: UpsellSettings): UpsellError[] {
  const out: UpsellError[] = [];
  if (!Number.isInteger(s.minSupport) || s.minSupport < 1 || s.minSupport > 100) out.push('support');
  if (!Number.isInteger(s.maxShown) || s.maxShown < 1 || s.maxShown > 6) out.push('shown');
  if (!s.productBlock && !s.bagSuggest) out.push('nothing');
  return out;
}

/** Product id that sells a SKU (the product's own SKU or one of its variants'). */
export function skuIndex(products: MProduct[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of products) { m.set(p.sku, p.id); for (const v of p.variants) m.set(v.sku, p.id); }
  return m;
}

export type CoMap = Map<string, Map<string, number>>;
/** For each product, how many orders also contained each other product. Failed and cancelled orders do not count. */
export function coPurchases(orders: Order[], products: MProduct[]): CoMap {
  const idx = skuIndex(products);
  const co: CoMap = new Map();
  for (const o of orders) {
    if (o.cancelled || o.pay === 'failed') continue;
    const ids = [...new Set(o.items.map((i) => idx.get(i.sku)).filter((x): x is string => !!x))];
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      const row = co.get(a) ?? new Map<string, number>();
      row.set(b, (row.get(b) ?? 0) + 1);
      co.set(a, row);
    }
  }
  return co;
}

const sellableNow = (p: Product | undefined) => !!p && p.variants.some((v) => v.stock > 0);

export interface Suggestion { id: string; together: number; manual: boolean }
/** Suggestions for a product page: manual picks, then pairs at or above the minimum, most orders first. */
export function suggestionsFor(id: string, co: CoMap, s: Pick<UpsellSettings, 'minSupport' | 'maxShown' | 'manual' | 'exclude'>, store: Product[], bag: string[] = []): Suggestion[] {
  const byId = new Map(store.map((p) => [p.id, p]));
  const row = co.get(id) ?? new Map<string, number>();
  const ok = (x: string) => x !== id && !bag.includes(x) && !s.exclude.includes(x) && sellableNow(byId.get(x));
  const manual = (s.manual[id] ?? []).filter(ok).map((x) => ({ id: x, together: row.get(x) ?? 0, manual: true }));
  const auto = [...row.entries()].filter(([x, n]) => n >= s.minSupport && ok(x) && !manual.some((m) => m.id === x))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([x, n]) => ({ id: x, together: n, manual: false }));
  return [...manual, ...auto].slice(0, s.maxShown);
}

/** One suggestion for the bag: the product most often bought with what is in it (manual picks of bag items first). */
export function bagSuggestion(bag: string[], co: CoMap, s: Pick<UpsellSettings, 'minSupport' | 'manual' | 'exclude'>, store: Product[]): Suggestion | null {
  if (!bag.length) return null;
  const byId = new Map(store.map((p) => [p.id, p]));
  const ok = (x: string) => !bag.includes(x) && !s.exclude.includes(x) && sellableNow(byId.get(x));
  for (const b of bag) { const m = (s.manual[b] ?? []).find(ok); if (m) return { id: m, together: co.get(b)?.get(m) ?? 0, manual: true }; }
  const sum = new Map<string, number>();
  for (const b of bag) for (const [x, n] of co.get(b) ?? []) if (n >= s.minSupport && ok(x)) sum.set(x, (sum.get(x) ?? 0) + n);
  const best = [...sum.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? { id: best[0], together: best[1], manual: false } : null;
}

/** Top pairs for the merchant's table: each pair once, most orders first. */
export function topPairs(co: CoMap, min: number, limit = 10): { a: string; b: string; n: number }[] {
  const out: { a: string; b: string; n: number }[] = [];
  for (const [a, row] of co) for (const [b, n] of row) if (a < b && n >= min) out.push({ a, b, n });
  return out.sort((x, y) => y.n - x.n || x.a.localeCompare(y.a)).slice(0, limit);
}

export interface AddEvent { productId: string; sku: string; at: number; from: 'product' | 'bag' }
/**
 * Add-to-bag from suggestions and the revenue they brought: an online order placed after the add (within 7 days)
 * that contains the added SKU counts that line once.
 */
export function upsellStats(adds: AddEvent[], orders: Order[], window = 7 * 86_400_000): { adds: number; orders: number; revenue: number } {
  const used = new Set<string>();
  let revenue = 0;
  const hit = new Set<string>();
  for (const a of adds) {
    for (const o of orders) {
      if (o.channel !== 'online' || o.placedAt === undefined || o.cancelled || o.pay === 'failed') continue;
      if (o.placedAt < a.at || o.placedAt - a.at > window) continue;
      const line = o.items.find((i) => i.sku === a.sku);
      const key = `${o.ref}:${a.sku}`;
      if (!line || used.has(key)) continue;
      used.add(key); hit.add(o.ref);
      revenue += line.qty * line.unit;
    }
  }
  return { adds: adds.length, orders: hit.size, revenue };
}
