// «سوق لك» channel for the merchant: store-level eligibility, per-product listing state and the consequence
// of pausing or enabling the channel. Pure functions. The per-product rules are the marketplace's own
// (market/domain.ts: excluded categories, required fields, review); this file maps the merchant catalogue onto them.
// Rules, fees and review are proposed in the blueprint and await LAK approval.
import { canSubmit, listingState, type FixReason, type ListingItem, type ListingState, type Review } from '../../market/domain';
import type { Product } from '../../merchant/catalog';
import type { Order } from '../../merchant/domain';
import type { Provider, Zone, Policy, StoreStatus } from '../../merchant/workspace';

/* ---------- Store-level eligibility ---------- */

export type CheckId = 'verified' | 'published' | 'payment' | 'shipping' | 'returns' | 'terms';
/** ok = met; todo = the merchant must act; pending = waiting on LAK (not something the merchant can do). */
export type CheckState = 'ok' | 'todo' | 'pending';
export interface Check { id: CheckId; state: CheckState; required: boolean }

export interface StoreFacts { verified: boolean; status: StoreStatus; providers: Provider[]; zones: Zone[]; policies: Policy[] }

export function storeChecks(f: StoreFacts): Check[] {
  const ok = (b: boolean): CheckState => (b ? 'ok' : 'todo');
  return [
    { id: 'verified', state: ok(f.verified), required: true },
    { id: 'published', state: ok(f.status.published && f.status.accepting && !f.status.maintenance), required: true },
    { id: 'payment', state: ok(f.providers.some((p) => p.state === 'active')), required: true },
    { id: 'shipping', state: ok(f.zones.length > 0), required: true },
    { id: 'returns', state: ok(f.policies.some((p) => p.id === 'returns' && p.state === 'published')), required: true },
    // Commercial terms (commission, fees) are a LAK decision; shown honestly, not counted against the merchant.
    { id: 'terms', state: 'pending', required: false },
  ];
}

/** The channel can be switched on only when every required check the merchant controls is met. */
export const checksMet = (checks: Check[]) => checks.every((c) => !c.required || c.state === 'ok');

/* ---------- Channel state ---------- */

export type ChannelState = 'live' | 'paused' | 'blocked';
export function channelState(enabled: boolean, checks: Check[]): ChannelState {
  if (!checksMet(checks)) return 'blocked';
  return enabled ? 'live' : 'paused';
}

/* ---------- Per-product listing ---------- */

/** Marketplace state for one product: the marketplace's own states plus the merchant-side ones. */
export type RowState = ListingState | 'inactive' | 'opted_out' | 'paused';
export const ROW_STATES: RowState[] = ['listed', 'in_review', 'not_submitted', 'needs_fix', 'rejected', 'out_of_stock', 'paused', 'opted_out', 'excluded', 'inactive', 'store_blocked'];

export interface ReviewRecord { review: Review; reason?: 'claim' | 'image' }
export type Reviews = Record<string, ReviewRecord>;

export interface Row {
  product: Product;
  item: ListingItem;
  state: RowState;
  fixes: FixReason[];
  /** null for digital products (no stock). */
  stock: number | null;
  hasPhoto: boolean;
}

/** Digital codes are not supported by the marketplace in phase one (market/domain EXCLUDED: giftcards). */
export function marketCategory(p: Product): string {
  return p.type === 'digital' ? 'giftcards' : p.category.en.toLowerCase();
}

export function toItem(p: Product, stock: number | null, hasPhoto: boolean, rec: ReviewRecord | undefined): ListingItem {
  return {
    id: p.id,
    name: p.name,
    cat: marketCategory(p),
    stock: stock ?? 0,
    images: p.media.length || (hasPhoto ? 1 : 0),
    descLength: Math.max(p.desc.ar.trim().length, p.desc.en.trim().length),
    price: p.price,
    review: rec?.review ?? 'none',
    rejectReason: rec?.reason,
  };
}

export function rowState(p: Product, item: ListingItem, verified: boolean, live: boolean): { state: RowState; fixes: FixReason[] } {
  const base = listingState(item, verified);
  if (p.status !== 'active') return { state: 'inactive', fixes: [] };
  if (base.state === 'store_blocked' || base.state === 'excluded') return base;
  if (!p.channels.market) return { state: 'opted_out', fixes: [] };
  if (base.state === 'listed' && !live) return { state: 'paused', fixes: [] };
  return base;
}

export function buildRows(
  products: Product[], stockOf: (p: Product) => number | null, hasPhoto: (p: Product) => boolean,
  reviews: Reviews, verified: boolean, live: boolean,
): Row[] {
  return products.map((p) => {
    const stock = stockOf(p);
    const photo = hasPhoto(p);
    const item = toItem(p, stock, photo, reviews[p.id]);
    const st = rowState(p, item, verified, live);
    return { product: p, item, state: st.state, fixes: st.fixes, stock, hasPhoto: photo };
  });
}

/** A product can be sent to LAK review when the marketplace rules allow it and the merchant offers it there. */
export const submittable = (r: Row, verified: boolean) =>
  r.product.status === 'active' && r.product.channels.market && canSubmit(r.item, verified);
/** A product the merchant withheld can be offered again unless the category is excluded or it is not active. */
export const includable = (r: Row) => r.state === 'opted_out';

export function countRows(rows: Row[]): Record<RowState, number> {
  const out = Object.fromEntries(ROW_STATES.map((s) => [s, 0])) as Record<RowState, number>;
  for (const r of rows) out[r.state] += 1;
  return out;
}

/** Tabs: everything, what shoppers see, what needs the merchant, what waits on LAK, what is not listed by design. */
export type Tab = 'all' | 'visible' | 'action' | 'review' | 'hidden';
export const TABS: Tab[] = ['all', 'visible', 'action', 'review', 'hidden'];
const TAB_STATES: Record<Exclude<Tab, 'all'>, RowState[]> = {
  visible: ['listed'],
  action: ['needs_fix', 'rejected', 'not_submitted'],
  review: ['in_review'],
  hidden: ['out_of_stock', 'paused', 'opted_out', 'excluded', 'inactive', 'store_blocked'],
};
export const readTab = (v: string | null): Tab => (TABS.includes(v as Tab) ? (v as Tab) : 'all');
export const inTab = (r: Row, t: Tab) => t === 'all' || TAB_STATES[t].includes(r.state);

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[ً-ٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').trim();
export function filterRows(rows: Row[], tab: Tab, q: string): Row[] {
  const n = norm(q);
  return rows.filter((r) => inTab(r, tab) && (!n || norm(`${r.product.name.ar} ${r.product.name.en} ${r.product.sku}`).includes(n)));
}

/* ---------- Review actions (simulated) ---------- */

export function submitForReview(reviews: Reviews, ids: string[]): Reviews {
  const next = { ...reviews };
  for (const id of ids) next[id] = { review: 'pending' };
  return next;
}
/** LAK's decision on a pending item. Review mode only: in production this comes from LAK, never from the merchant. */
export function decide(reviews: Reviews, id: string, ok: boolean): Reviews {
  if (reviews[id]?.review !== 'pending') return reviews;
  return { ...reviews, [id]: ok ? { review: 'approved' } : { review: 'rejected', reason: 'claim' } };
}

/* ---------- Consequence previews ---------- */

/** Marketplace orders still with the merchant: they keep going whatever the channel state. */
export const openMarketOrders = (orders: Order[]) => orders.filter((o) => o.channel === 'market' && o.ship !== 'delivered' && o.pay !== 'refunded');
export const marketOrders = (orders: Order[]) => orders.filter((o) => o.channel === 'market');

export interface Impact { visibleNow: number; visibleAfter: number; openOrders: number; inReview: number }
/**
 * What switching the channel does. Pausing hides every listed product at once; open marketplace orders are not
 * cancelled and still need fulfilment. Enabling shows approved products again; items in review stay in review.
 */
export function toggleImpact(rows: Row[], orders: Order[], enabling: boolean): Impact {
  const listedIfLive = rows.filter((r) => r.state === 'listed' || r.state === 'paused').length;
  return {
    visibleNow: enabling ? 0 : listedIfLive,
    visibleAfter: enabling ? listedIfLive : 0,
    openOrders: openMarketOrders(orders).length,
    inReview: rows.filter((r) => r.state === 'in_review').length,
  };
}

/** Including a withheld product: where it lands next. */
export function includeOutcome(r: Row, verified: boolean, live: boolean): RowState {
  const p = { ...r.product, channels: { ...r.product.channels, market: true } };
  return rowState(p, r.item, verified, live).state;
}
