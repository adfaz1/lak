// Orders section: business rules only (no React). Every list, state, amount and flow outcome on the
// orders screens comes from here and is unit-tested. The merchant domain stays the single source of truth;
// this file composes it for the screens and adds the few rules the screens need.
import {
  CARRIERS, LOC_IDS, VIEWS, VIEW_IDS, canFulfilPartial, canRefund, fulfilPartial, fulfilledQty, isMultiLocation, issueLabel,
  nextFulfilmentRef, refundedQty, refundedTotal, refundable, remainingQty, search, shipmentRef, subtotal, total, units, vatIncluded,
  bulkReason, type BulkAction, type CarrierId, type Channel, type Ful, type Ineligible, type LocId, type LogEntry, type Order,
  type Pay, type Refund, type Ship, type View,
} from '../../merchant/domain';
import { can, canSee, type Role } from '../../merchant/perms';
import type { Level, StockLog } from '../../merchant/inventory';

/* ---------- List query (lives in the URL) ---------- */

export const PAGE_SIZE = 25;
export const CHANNELS: Channel[] = ['online', 'market', 'app'];
export const PAYS: Pay[] = ['paid', 'failed', 'partially_refunded', 'refunded'];
export const FULS: Ful[] = ['none', 'partial', 'done'];
export const SHIPS: Ship[] = ['none', 'label', 'transit', 'delivered'];
export type Sort = 'new' | 'old' | 'high' | 'low';
export const SORTS: Sort[] = ['new', 'old', 'high', 'low'];

export interface ListQuery { view: View; q: string; ch?: Channel; pay?: Pay; ful?: Ful; ship?: Ship; sort: Sort; page: number }

const pick = <T extends string>(v: string | null, list: readonly T[]): T | undefined =>
  (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

/** Read the list state from the URL query; unknown values fall back to defaults. */
export function readQuery(query: URLSearchParams): ListQuery {
  const g = (k: string) => query.get(k);
  return {
    view: pick(g('view'), VIEW_IDS) ?? 'all',
    q: g('q') ?? '',
    ch: pick(g('ch'), CHANNELS),
    pay: pick(g('pay'), PAYS),
    ful: pick(g('ful'), FULS),
    ship: pick(g('ship'), SHIPS),
    sort: pick(g('sort'), SORTS) ?? 'new',
    page: Math.max(1, Math.floor(Number(g('page'))) || 1),
  };
}

/** Serialise a list query for `link()`; defaults are dropped so URLs stay short. */
export function toParams(q: ListQuery, over: Partial<ListQuery> = {}): Record<string, string | undefined> {
  const m = { ...q, ...over };
  return {
    view: m.view !== 'all' ? m.view : undefined, q: m.q.trim() ? m.q : undefined, ch: m.ch, pay: m.pay, ful: m.ful, ship: m.ship,
    sort: m.sort !== 'new' ? m.sort : undefined, page: m.page > 1 ? String(m.page) : undefined,
  };
}

export const activeFilters = (q: ListQuery) => [q.ch, q.pay, q.ful, q.ship].filter(Boolean).length;

const SORTERS: Record<Sort, (a: Order, b: Order) => number> = {
  new: (a, b) => a.hoursAgo - b.hoursAgo || Number(b.ref) - Number(a.ref),
  old: (a, b) => b.hoursAgo - a.hoursAgo || Number(a.ref) - Number(b.ref),
  high: (a, b) => total(b) - total(a) || a.hoursAgo - b.hoursAgo,
  low: (a, b) => total(a) - total(b) || a.hoursAgo - b.hoursAgo,
};

export interface ListResult { counts: Record<View, number>; rows: Order[]; page: number; pages: number; pageRows: Order[]; filtered: boolean }

/**
 * Search and filters first, then the saved view. View counts are computed on the searched/filtered set,
 * so each tab's number is exactly what clicking it shows.
 */
export function listOrders(all: Order[], q: ListQuery): ListResult {
  const base = search(all, 'all', q.q, q.ch).filter((o) => (!q.pay || o.pay === q.pay) && (!q.ful || o.ful === q.ful) && (!q.ship || o.ship === q.ship));
  const counts = Object.fromEntries(VIEW_IDS.map((v) => [v, base.filter(VIEWS[v]).length])) as Record<View, number>;
  const rows = base.filter(VIEWS[q.view]).sort(SORTERS[q.sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, q.page);
  return { counts, rows, page, pages, pageRows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), filtered: !!(q.q.trim() || activeFilters(q)) };
}

/* ---------- Selection scope (QA04) ---------- */

/** What a bulk action covers: the rows ticked on this page, or every matching result. */
export function selectionRefs(rows: Order[], pageRows: Order[], selected: ReadonlySet<string>, allMatching: boolean): string[] {
  return allMatching ? rows.map((o) => o.ref) : pageRows.filter((o) => selected.has(o.ref)).map((o) => o.ref);
}

/** Up to `n` example refs per skip reason, so the merchant can open one and see why. */
export function skipSamples(orders: Order[], action: BulkAction, n = 3): Partial<Record<Ineligible, string[]>> {
  const out: Partial<Record<Ineligible, string[]>> = {};
  for (const o of orders) {
    const r = bulkReason(o, action);
    if (!r) continue;
    const list = (out[r] ??= []);
    if (list.length < n) list.push(o.ref);
  }
  return out;
}

/** Undo a bulk confirmation: only the given orders, and only the last "confirmed" entry each received. */
export function undoConfirm(all: Order[], refs: string[]): Order[] {
  const want = new Set(refs);
  return all.map((o) => {
    if (!want.has(o.ref) || !o.confirmed || o.ful !== 'none') return o;
    const i = o.log.map((e) => e.kind).lastIndexOf('confirmed');
    return { ...o, confirmed: false, log: i < 0 ? o.log : [...o.log.slice(0, i), ...o.log.slice(i + 1)] };
  });
}

/** Split the work into chunks so progress can be shown while it runs. */
export const chunks = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/* ---------- Presentation rules ---------- */

export const isLate = (o: Order) => VIEWS.late(o);
export const pendingRefund = (o: Order) => o.refunds.find((r) => r.status === 'pending');

export type Age = { unit: 'now' | 'h' | 'd'; n: number };
export function ageOf(hours: number): Age {
  if (hours < 1) return { unit: 'now', n: 0 };
  if (hours < 24) return { unit: 'h', n: hours };
  return { unit: 'd', n: Math.round(hours / 24) };
}

export type NextKind = 'fulfil' | 'fulfilRest' | 'contact' | 'none';
export type NextReason = 'payFailed' | 'late' | 'ready' | 'partial' | 'refundPending' | 'labelIssued' | 'inTransit' | 'delivered' | 'refunded';
export interface Next { kind: NextKind; reason: NextReason; remaining: number }

/**
 * The single next action for an order. A failed payment is a conversation, never fulfilment; an open
 * fulfilment comes next; otherwise nothing is needed and the reason says why.
 */
export function nextAction(o: Order): Next {
  const remaining = o.items.reduce((s, _, i) => s + remainingQty(o, i), 0);
  if (o.pay === 'failed') return { kind: 'contact', reason: 'payFailed', remaining };
  if (canFulfilPartial(o)) {
    if (o.ful === 'partial') return { kind: 'fulfilRest', reason: 'partial', remaining };
    return { kind: 'fulfil', reason: isLate(o) ? 'late' : 'ready', remaining };
  }
  if (pendingRefund(o)) return { kind: 'none', reason: 'refundPending', remaining };
  if (o.pay === 'refunded') return { kind: 'none', reason: 'refunded', remaining };
  if (o.ship === 'label') return { kind: 'none', reason: 'labelIssued', remaining };
  if (o.ship === 'transit') return { kind: 'none', reason: 'inTransit', remaining };
  return { kind: 'none', reason: 'delivered', remaining };
}

/** Exceptions shown beside the three states in the list: late, refund awaiting provider. */
export function exceptions(o: Order): ('late' | 'refundPending')[] {
  const out: ('late' | 'refundPending')[] = [];
  if (isLate(o)) out.push('late');
  if (pendingRefund(o)) out.push('refundPending');
  return out;
}

export interface MoneyBreakdown {
  subtotal: number; units: number; shipping: number; vat: number; total: number;
  collected: number; refunded: number; refundPending: number; net: number; refundable: number;
}
/**
 * Money for one order, VAT-inclusive. Only provider-confirmed refunds reduce net; a pending refund is
 * shown on its own line and already reserved against what can still be refunded.
 */
export function moneyBreakdown(o: Order): MoneyBreakdown {
  const t = total(o);
  const collected = o.pay === 'failed' ? 0 : t;
  const refunded = o.refunds.filter((r) => r.status === 'confirmed').reduce((s, r) => s + r.amount, 0);
  const refundPending = o.refunds.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
  return {
    subtotal: subtotal(o), units: units(o), shipping: o.fee, vat: vatIncluded(o), total: t,
    collected, refunded, refundPending, net: collected - refunded, refundable: refundable(o),
  };
}

/** Timeline entries, newest first. The index is kept as a stable key. */
export const timeline = (o: Order): { e: LogEntry; i: number }[] => o.log.map((e, i) => ({ e, i })).reverse();
/** Entries that stand for an effect at an external provider (carrier, printer, payment provider). */
export const SIMULATED_KINDS: LogEntry['kind'][] = ['labelIssued', 'labelFailed', 'partialFulfilled', 'refundRequested', 'refundConfirmed', 'refundFailed', 'slipPrinted'];

export interface LineView { idx: number; fulfilled: number; refunded: number; remaining: number; stock: { loc: LocId; n: number }[] }
/** Per-line progress and, for multi-location orders, stock available at each location. */
export function lineViews(o: Order): LineView[] {
  const multi = isMultiLocation(o);
  return o.items.map((it, idx) => ({
    idx, fulfilled: fulfilledQty(o, idx), refunded: refundedQty(o, idx), remaining: remainingQty(o, idx),
    stock: multi ? LOC_IDS.map((loc) => ({ loc, n: it.stock?.[loc] ?? 0 })) : [],
  }));
}

/** How many orders the same customer has in the book (by name: fixtures have no customer id). */
export const customerOrderCount = (all: Order[], o: Order) => all.filter((x) => x.customer.en === o.customer.en).length;

/* ---------- Permissions (simulated; the server must enforce the same) ---------- */

export function orderPerms(role: Role) {
  return {
    see: canSee(role, 'orders'),
    fulfil: can(role, 'order.fulfil'),
    refund: can(role, 'order.refund'),
    bulk: can(role, 'order.bulk'),
    contact: can(role, 'customer.contact'),
  };
}

/* ---------- Fulfilment (QA03) ---------- */

/** Units a location can ship now: per line, the smaller of what remains and what it holds. */
export const maxPicks = (o: Order, loc: LocId) => o.items.map((it, i) => Math.min(remainingQty(o, i), it.stock?.[loc] ?? 0));
export const canShipFrom = (o: Order, loc: LocId) => maxPicks(o, loc).reduce((a, b) => a + b, 0);
/** The location that can ship the most of what remains (first listed wins a tie). */
export const bestLocation = (o: Order): LocId => LOC_IDS.reduce((best, l) => (canShipFrom(o, l) > canShipFrom(o, best) ? l : best), LOC_IDS[0]);

export interface FulfilPlan { loc: LocId; picks: number[]; carrier: CarrierId; weight: string }
/** Starting choices: multi-location orders pick the best location and its maximum; others ship everything from Riyadh. */
export function initialPlan(o: Order): FulfilPlan {
  if (!isMultiLocation(o)) return { loc: 'ryd', picks: o.items.map((it) => it.qty), carrier: 'a', weight: '1.2' };
  const loc = bestLocation(o);
  return { loc, picks: maxPicks(o, loc), carrier: 'a', weight: '1.2' };
}

export const labelRef = (o: Order) => (isMultiLocation(o) ? nextFulfilmentRef(o) : shipmentRef(o));
export const estimatedCost = (c: CarrierId) => CARRIERS[c].price;

/**
 * Issue one label for one operation. Multi-location orders ship the picked quantities from one location;
 * others ship everything. A carrier outage leaves the order unfulfilled with a logged failure and the
 * same reference, so a retry can never produce two labels.
 */
export function fulfil(o: Order, plan: FulfilPlan, carrierDown: boolean): { order: Order; ok: boolean; ref: string } {
  const ref = labelRef(o);
  if (!isMultiLocation(o)) {
    const next = issueLabel(o, plan.carrier, carrierDown);
    return { order: next, ok: next.ship === 'label' && o.ship !== 'label', ref };
  }
  const next = fulfilPartial(o, plan.loc, plan.picks, carrierDown);
  const ok = next.fulfilments.length > o.fulfilments.length;
  if (!ok) return { order: next, ok, ref };
  const log = next.log.map((e, i) => (i === next.log.length - 1 ? { ...e, carrier: plan.carrier } : e));
  return { order: { ...next, log }, ok, ref };
}

export const printSlip = (o: Order): Order => ({ ...o, slips: o.slips + 1, log: [...o.log, { when: 'now', who: 'you', kind: 'slipPrinted' }] });

/* ---------- Refunds (QA06) ---------- */

export { canRefund, refundedTotal };

/** Restock decided in a refund: on-hand increases at the chosen location, with one stock-log line per SKU. */
export function applyRestock(levels: Level[], o: Order, r: Refund): { levels: Level[]; log: StockLog[] } {
  let next = levels;
  const log: StockLog[] = [];
  o.items.forEach((it, i) => {
    const u = r.restock[i] ?? 0;
    if (!u) return;
    const cur = next.find((l) => l.sku === it.sku && l.loc === r.loc);
    if (!cur) return;
    next = next.map((l) => (l === cur ? { ...l, onHand: l.onHand + u, version: l.version + 1 } : l));
    log.push({ id: `RS-${r.id}-${i}`, sku: it.sku, loc: r.loc, delta: u, before: cur.onHand, after: cur.onHand + u, reason: 'returned', who: 'You', ref: r.id });
  });
  return { levels: next, log };
}

export const REFUND_REASONS = ['damaged', 'size', 'mind', 'late'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** A refund amount on an order whose sale was already paid out comes from the next payout. */
export const refundFromNextPayout = (o: Order) => o.settled;
