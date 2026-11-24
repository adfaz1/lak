// Orders section: business rules only (no React). Every list, state, amount and flow outcome on the
// orders screens comes from here and is unit-tested. The merchant domain stays the single source of truth;
// this file composes it for the screens and adds the few rules the screens need.
import {
  CARRIERS, LOC_IDS, VIEWS, VIEW_IDS, canFulfilPartial, canRefund, fulfilPartial, fulfilledQty, isMultiLocation, issueLabel,
  nextFulfilmentRef, refundedQty, refundedTotal, remainingQty, search, shipmentRef, subtotal, total, units, vatIncluded,
  bulkReason, runBulk, type BulkAction, type CarrierId, type Channel, type Ful, type Ineligible, type L, type LocId, type LogEntry, type Order,
  type Pay, type Refund, type Ship, type View,
} from '../../merchant/domain';
import type { Customer, Zone } from '../../merchant/workspace';
import { CITIES as CITIES_LIST, nextOrderRef } from '../../merchant/domain';
import { matchCustomer, reserve, zoneFor as zoneOf } from '../../storefront/bridge';
import { shippingQuote as quoteZone } from '../settings/model';
import type { Product } from '../../merchant/catalog';
import { can, canSee, type Role } from '../../merchant/perms';
import {
  act, canMarkShipped, collected as collectedOf, confirmTransfer, fulfilEffects, markShipped, openReturns, payView, placedAt, refundableNow, stamp, takeHeld,
  type Actor, type PayView, type StockEffect,
} from '../../merchant/ops';
import { available, type Level, type StockLog } from '../../merchant/inventory';

/* ---------- List query (lives in the URL) ---------- */

export const PAGE_SIZE = 25;
export const CHANNELS: Channel[] = ['online', 'market', 'app'];
export const PAYS: Pay[] = ['paid', 'failed', 'partially_refunded', 'refunded'];
export const FULS: Ful[] = ['none', 'partial', 'done'];
export const SHIPS: Ship[] = ['none', 'label', 'transit', 'delivered'];
export type Sort = 'new' | 'old' | 'high' | 'low';
export const SORTS: Sort[] = ['new', 'old', 'high', 'low'];

export type ListView = View | 'cancelled';
export const LIST_VIEWS: ListView[] = [...VIEW_IDS, 'cancelled'];
const inView = (v: ListView) => (o: Order) => (v === 'cancelled' ? !!o.cancelled : VIEWS[v](o));
export const PAY_METHODS = ['card', 'applepay', 'bnpl', 'cod', 'bank', 'manual'] as const;
export type PayMethodFilter = (typeof PAY_METHODS)[number];
export const methodOf = (o: Order): PayMethodFilter | undefined => (o.manual ? (o.manual.pay === 'cod' ? 'cod' : 'manual') : o.payment?.method === 'bank' ? 'manual' : o.payment?.method);

export interface ListQuery {
  view: ListView; q: string; ch?: Channel; pay?: Pay; ful?: Ful; ship?: Ship; sort: Sort; page: number;
  /** Placed between these dates (YYYY-MM-DD, Riyadh), shipped-from location, payment method, tag, assignee. */
  from?: string; to?: string; loc?: LocId; method?: PayMethodFilter; tag?: string; who?: string;
}

const pick = <T extends string>(v: string | null, list: readonly T[]): T | undefined =>
  (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

/** Read the list state from the URL query; unknown values fall back to defaults. */
export function readQuery(query: URLSearchParams): ListQuery {
  const g = (k: string) => query.get(k);
  return {
    view: pick(g('view'), LIST_VIEWS) ?? 'all',
    q: g('q') ?? '',
    ch: pick(g('ch'), CHANNELS),
    pay: pick(g('pay'), PAYS),
    ful: pick(g('ful'), FULS),
    ship: pick(g('ship'), SHIPS),
    sort: pick(g('sort'), SORTS) ?? 'new',
    page: Math.max(1, Math.floor(Number(g('page'))) || 1),
    ...(isDate(g('from')) ? { from: g('from')! } : {}), ...(isDate(g('to')) ? { to: g('to')! } : {}),
    ...(g('loc') ? { loc: g('loc')! } : {}), ...(pick(g('method'), PAY_METHODS) ? { method: pick(g('method'), PAY_METHODS) } : {}),
    ...(g('tag') ? { tag: g('tag')! } : {}), ...(g('who') ? { who: g('who')! } : {}),
  };
}
const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Serialise a list query for `link()`; defaults are dropped so URLs stay short. */
export function toParams(q: ListQuery, over: Partial<ListQuery> = {}): Record<string, string | undefined> {
  const m = { ...q, ...over };
  return {
    view: m.view !== 'all' ? m.view : undefined, q: m.q.trim() ? m.q : undefined, ch: m.ch, pay: m.pay, ful: m.ful, ship: m.ship,
    sort: m.sort !== 'new' ? m.sort : undefined, page: m.page > 1 ? String(m.page) : undefined,
    ...(m.from || m.to || m.loc || m.method || m.tag || m.who ? { from: m.from, to: m.to, loc: m.loc, method: m.method, tag: m.tag, who: m.who } : {}),
  };
}

export const activeFilters = (q: ListQuery) => [q.ch, q.pay, q.ful, q.ship, q.from || q.to, q.loc, q.method, q.tag, q.who].filter(Boolean).length;
/** Every filter key cleared (search kept). */
export const NO_FILTERS: Partial<ListQuery> = { ch: undefined, pay: undefined, ful: undefined, ship: undefined, from: undefined, to: undefined, loc: undefined, method: undefined, tag: undefined, who: undefined };

const RIYADH_MS = 3 * 3_600_000;
/** The Riyadh calendar date an order was placed on. */
export const placedDay = (o: Order, now: number) => new Date(placedAt(o, now) + RIYADH_MS).toISOString().slice(0, 10);
/** Locations an order ships from or holds stock at. */
export const orderLocs = (o: Order): LocId[] => [...new Set([...o.fulfilments.map((f) => f.loc), ...o.items.flatMap((it) => Object.entries(it.reserved ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([l]) => l))])];
function extraFilter(q: ListQuery, now: number) {
  return (o: Order) => {
    if (q.from || q.to) { const d = placedDay(o, now); if ((q.from && d < q.from) || (q.to && d > q.to)) return false; }
    if (q.loc && !orderLocs(o).includes(q.loc)) return false;
    if (q.method && methodOf(o) !== q.method) return false;
    if (q.tag && !(o.tags ?? []).includes(q.tag)) return false;
    if (q.who && (q.who === '-' ? !!o.assignee : o.assignee !== q.who)) return false;
    return true;
  };
}

const SORTERS: Record<Sort, (a: Order, b: Order) => number> = {
  new: (a, b) => a.hoursAgo - b.hoursAgo || Number(b.ref) - Number(a.ref),
  old: (a, b) => b.hoursAgo - a.hoursAgo || Number(a.ref) - Number(b.ref),
  high: (a, b) => total(b) - total(a) || a.hoursAgo - b.hoursAgo,
  low: (a, b) => total(a) - total(b) || a.hoursAgo - b.hoursAgo,
};

export interface ListResult { counts: Record<ListView, number>; rows: Order[]; page: number; pages: number; pageRows: Order[]; filtered: boolean }

/**
 * Search and filters first, then the saved view. View counts are computed on the searched/filtered set,
 * so each tab's number is exactly what clicking it shows.
 */
export function listOrders(all: Order[], q: ListQuery, now = Date.now()): ListResult {
  const base = search(all, 'all', q.q, q.ch).filter((o) => (!q.pay || o.pay === q.pay) && (!q.ful || o.ful === q.ful) && (!q.ship || o.ship === q.ship)).filter(extraFilter(q, now));
  const counts = Object.fromEntries(LIST_VIEWS.map((v) => [v, base.filter(inView(v)).length])) as Record<ListView, number>;
  const rows = base.filter(inView(q.view)).sort(SORTERS[q.sort]);
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

/** Undo a bulk confirmation for the given orders. The log keeps the confirmation and records the undo as a new line. */
export function undoConfirm(all: Order[], refs: string[], who: Actor = { name: 'you', role: '' }, now = Date.now()): Order[] {
  const want = new Set(refs);
  return all.map((o) => (!want.has(o.ref) || !o.confirmed || o.ful !== 'none' ? o : act({ ...o, confirmed: false }, 'confirmUndone', who, now)));
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

export type NextKind = 'fulfil' | 'fulfilRest' | 'contact' | 'ship' | 'deliver' | 'cancelRequest' | 'returns' | 'transfer' | 'none';
export type NextReason = 'payFailed' | 'late' | 'ready' | 'partial' | 'refundPending' | 'labelIssued' | 'inTransit' | 'delivered' | 'refunded'
  | 'verifying' | 'link' | 'cancelled' | 'cancelRequest' | 'returnOpen' | 'bankDue';
export interface Next { kind: NextKind; reason: NextReason; remaining: number }

/**
 * The single next action for an order. A failed payment is a conversation, never fulfilment; an open
 * fulfilment comes next; otherwise nothing is needed and the reason says why.
 */
export function nextAction(o: Order): Next {
  const remaining = o.items.reduce((s, _, i) => s + remainingQty(o, i), 0);
  if (o.cancelled) return { kind: 'none', reason: o.refunds.some((r) => r.status === 'pending') ? 'refundPending' : 'cancelled', remaining };
  if (o.cancelRequest?.state === 'open') return { kind: 'cancelRequest', reason: 'cancelRequest', remaining };
  const pv = payView(o);
  if (pv === 'verifying') return { kind: 'none', reason: 'verifying', remaining };
  if (pv === 'bank_due') return { kind: 'transfer', reason: 'bankDue', remaining };
  if (pv === 'link') return { kind: 'contact', reason: 'link', remaining };
  if (o.pay === 'failed') return { kind: 'contact', reason: 'payFailed', remaining };
  if (openReturns(o).length) return { kind: 'returns', reason: 'returnOpen', remaining };
  if (canFulfilPartial(o)) {
    if (o.ful === 'partial') return { kind: 'fulfilRest', reason: 'partial', remaining };
    return { kind: 'fulfil', reason: isLate(o) ? 'late' : 'ready', remaining };
  }
  if (pendingRefund(o)) return { kind: 'none', reason: 'refundPending', remaining };
  if (o.pay === 'refunded') return { kind: 'none', reason: 'refunded', remaining };
  if (o.ship === 'label') return { kind: 'ship', reason: 'labelIssued', remaining };
  if (o.ship === 'transit') return { kind: 'deliver', reason: 'inTransit', remaining };
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
  /** Coupon or manual discount (VAT-inclusive) and its code; cash still to collect on delivery. */
  discount: number; coupon?: string; codDue: number; pay: PayView;
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
  const pv = payView(o);
  const got = collectedOf(o);
  return {
    subtotal: subtotal(o), units: units(o), shipping: o.fee, vat: vatIncluded(o), total: t,
    collected: o.pay === 'failed' ? collected : got, refunded, refundPending, net: got - refunded, refundable: refundableNow(o),
    discount: o.discount ?? 0, coupon: o.coupon, codDue: pv === 'cod_due' && !o.cancelled ? t : 0, pay: pv,
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

/* ---------- Group 1: operations on top of merchant/ops.ts ---------- */

/** The signed-in member acting under the review role: the first active team member with that role. */
export function actorFor(role: Role, members: { name: string; role: Role; status: string }[]): Actor {
  const m = members.find((x) => x.role === role && x.status === 'active');
  return { name: m?.name ?? role, role };
}

/** Customer contact for an order: what the order recorded, else the customer record (by id, then by name). */
export function contactOf(o: Order, customers: Customer[]): { id?: string; phone?: string; email?: string; address?: string; city: L } {
  const c = customers.find((x) => x.id === o.customerId) ?? customers.find((x) => x.name.en === o.customer.en);
  return { id: c?.id ?? o.customerId, phone: o.contact?.phone ?? c?.phone, email: o.contact?.email ?? c?.email, address: o.address?.line, city: o.address?.city ?? o.city };
}

/** Pay states as the list filter offers them. */
export const canRefundOrder = (o: Order) => !o.cancelled && canRefund(o) && refundableNow(o) > 0;

/* ---------- Bulk (extended) ---------- */

export type OpsBulk = BulkAction | 'labels' | 'shipped' | 'invoices' | 'export';
export type OpsIneligible = Ineligible | 'cancelled' | 'needsLocation' | 'noLabel' | 'verifying';

/** Why an order cannot take a bulk action. Export takes everything; invoices need a sale that is or will be collected. */
export function opsBulkReason(o: Order, action: OpsBulk): OpsIneligible | null {
  if (action === 'export') return null;
  if (o.cancelled) return 'cancelled';
  if (action === 'confirm' || action === 'slips') return bulkReason(o, action);
  const pv = payView(o);
  if (pv === 'verifying') return 'verifying';
  if (o.pay === 'failed') return 'payNotConfirmed';
  if (action === 'invoices') return null;
  if (action === 'shipped') return canMarkShipped(o) ? null : o.ship === 'none' ? 'noLabel' : 'alreadyFulfilled';
  if (o.ship !== 'none' || o.ful !== 'none') return 'alreadyFulfilled';
  if (o.pay === 'refunded' || o.pay === 'partially_refunded') return 'refunded';
  if (isMultiLocation(o)) return 'needsLocation';
  return null;
}

export function opsEligibility(orders: Order[], action: OpsBulk) {
  const eligible: Order[] = [];
  const reasons: Partial<Record<OpsIneligible, number>> = {};
  const samples: Partial<Record<OpsIneligible, string[]>> = {};
  for (const o of orders) {
    const r = opsBulkReason(o, action);
    if (!r) { eligible.push(o); continue; }
    reasons[r] = (reasons[r] ?? 0) + 1;
    const l = (samples[r] ??= []);
    if (l.length < 3) l.push(o.ref);
  }
  return { eligible, ineligible: orders.length - eligible.length, reasons, samples };
}

/** Estimated carrier cost of labels for the eligible orders (default carrier). */
export const labelsCost = (n: number, carrier: CarrierId = 'a') => n * CARRIERS[carrier].price;

/**
 * Run one bulk step. Eligibility is re-checked per order, so a retry never repeats work that succeeded: an order whose
 * label was issued is skipped as already fulfilled, never labelled twice. Stock effects of issued labels are returned.
 */
export function runOpsBulk(all: Order[], refs: string[], action: OpsBulk, fails: (ref: string) => boolean, who: Actor, now: number) {
  if (action === 'confirm' || action === 'slips') {
    const r = runBulk(all, refs, action, fails);
    const before = new Map(all.map((o) => [o.ref, o]));
    return { ...r, orders: r.orders.map((o) => stamp(before.get(o.ref)!, o, who, now)), effects: [] as { ref: string; effects: StockEffect[] }[] };
  }
  const want = new Set(refs);
  const ok: string[] = []; const failed: string[] = []; const skipped: string[] = [];
  const effects: { ref: string; effects: StockEffect[] }[] = [];
  const orders = all.map((o) => {
    if (!want.has(o.ref)) return o;
    if (opsBulkReason(o, action)) { skipped.push(o.ref); return o; }
    if (action !== 'invoices' && action !== 'export' && fails(o.ref)) { failed.push(o.ref); return o; }
    ok.push(o.ref);
    if (action === 'shipped') return markShipped(o, 'all', who, now);
    if (action === 'invoices') return act(o, 'invoicePrinted', who, now, { ref: invoiceNo(o) });
    if (action === 'export') return o;
    const plan = initialPlan(o);
    const loc = o.items[0]?.reserved ? (Object.entries(o.items[0].reserved).find(([, n]) => (n ?? 0) > 0)?.[0] ?? plan.loc) : plan.loc;
    const r = fulfil(o, { ...plan, loc }, false);
    if (!r.ok) { ok.pop(); failed.push(o.ref); return o; }
    const fixed: Order = { ...r.order, fulfilments: r.order.fulfilments.map((f, i) => (i === r.order.fulfilments.length - 1 ? { ...f, loc, carrier: plan.carrier } : f)) };
    effects.push({ ref: o.ref, effects: fulfilEffects(o, loc, o.items.map((it) => it.qty)) });
    return stamp(o, takeHeld(fixed, loc, o.items.map((it) => it.qty)), who, now);
  });
  return { orders, ok, failed, skipped, effects };
}

/* ---------- CSV export ---------- */

const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** One row per order. Money in riyals with two decimals; UTF-8 with BOM so Excel shows Arabic. */
export function ordersCsv(orders: Order[], lang: 'ar' | 'en', now: number): string {
  const head = ['ref', 'date', 'customer', 'city', 'channel', 'payment', 'pay_method', 'fulfilment', 'shipment', 'cancelled', 'items', 'units', 'subtotal', 'discount', 'shipping', 'total', 'vat', 'refunded', 'tags'];
  const rows = orders.map((o) => {
    const m = moneyBreakdown(o);
    return [o.ref, placedDay(o, now), o.customer[lang], o.city[lang], o.channel, payView(o), methodOf(o) ?? '', o.ful, o.ship, o.cancelled ? 'yes' : '',
      o.items.map((i) => `${i.sku} x${i.qty}`).join(' | '), m.units, (m.subtotal / 100).toFixed(2), (m.discount / 100).toFixed(2), (m.shipping / 100).toFixed(2),
      (m.total / 100).toFixed(2), (m.vat / 100).toFixed(2), (m.refunded / 100).toFixed(2), (o.tags ?? []).join(' | ')];
  });
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

/* ---------- Invoice ---------- */

export const invoiceNo = (o: Order) => `INV-${o.ref}`;
export interface InvoiceLine { name: L; variant?: L; sku: string; qty: number; unit: number; amount: number; vat: number }
export interface Invoice { no: string; lines: InvoiceLine[]; subtotal: number; discount: number; shipping: number; total: number; vat: number; excl: number }
/** Simplified tax invoice figures, VAT-inclusive at 15%. Totals equal moneyBreakdown (same total and VAT). */
export function invoiceOf(o: Order): Invoice {
  const m = moneyBreakdown(o);
  const lines = o.items.map((it) => ({ name: it.name, variant: it.variant, sku: it.sku, qty: it.qty, unit: it.unit, amount: it.qty * it.unit, vat: Math.round((it.qty * it.unit * 15) / 115) }));
  return { no: invoiceNo(o), lines, subtotal: m.subtotal, discount: m.discount, shipping: m.shipping, total: m.total, vat: m.vat, excl: m.total - m.vat };
}

/* ---------- Fulfil with live stock ---------- */

/**
 * Lines without per-location stock get it from the inventory: what each location can ship for this order is its
 * available stock plus this order's own hold there (or on hand when the order recorded no hold). This lets every
 * order choose a location and split into several parcels.
 */
export function withLiveStock(o: Order, levels: Level[], locs: LocId[]): Order {
  return {
    ...o,
    items: o.items.map((it) => {
      if (it.stock) return it;
      const stock: Partial<Record<LocId, number>> = {};
      for (const loc of locs) {
        const l = levels.find((x) => x.sku === it.sku && x.loc === loc);
        if (!l) continue;
        // Sellable units only: damaged, quarantined, payment holds and safety reserve never count.
        stock[loc] = Math.max(0, available(l) + (it.reserved ? (it.reserved[loc] ?? 0) : l.reserved));
      }
      return { ...it, stock };
    }),
  };
}
/** Drop stock attached by withLiveStock (keep the order's own per-location stock, as updated by fulfilment). */
export const withoutLiveStock = (orig: Order, next: Order): Order => ({ ...next, items: next.items.map((it, i) => (orig.items[i]?.stock ? it : { ...it, stock: undefined })) });

/* ---------- Catalogue choices (manual orders, exchanges) ---------- */

export interface SkuOption { productId: string; sku: string; name: L; variant?: L; unit: number; weight: number; avail: Partial<Record<LocId, number>>; total: number }
const variantLabel = (v: { color: string; size: string }): L | undefined => {
  const s = [v.color, v.size].filter(Boolean).join(' · ');
  return s ? { ar: s, en: s } : undefined;
};
/** Sellable SKUs of active physical products with what each location can still sell (on hand − reserved). */
export function skuOptions(products: Product[], levels: Level[]): SkuOption[] {
  return products.filter((p) => p.status === 'active' && p.type !== 'digital').flatMap((p) => {
    const vs = p.variants.length ? p.variants.map((v) => ({ sku: v.sku, unit: v.price, variant: variantLabel(v) })) : [{ sku: p.sku, unit: p.price, variant: undefined }];
    return vs.map((v) => {
      const avail: Partial<Record<LocId, number>> = {};
      levels.filter((l) => l.sku === v.sku).forEach((l) => { avail[l.loc] = Math.max(0, available(l)); });
      return { productId: p.id, sku: v.sku, name: p.name, variant: v.variant, unit: v.unit, weight: p.weight ?? 0, avail, total: Object.values(avail).reduce<number>((a, b) => a + (b ?? 0), 0) };
    });
  });
}
/** Other variants of the same product as a SKU (exchange choices), with stock. */
export function siblings(options: SkuOption[], sku: string): SkuOption[] {
  const own = options.find((o) => o.sku === sku);
  return own ? options.filter((o) => o.productId === own.productId && o.sku !== sku) : [];
}
/** The location with the most sellable units of a SKU (first listed wins a tie), or undefined when none has any. */
export function bestStockLoc(o: SkuOption, locs: LocId[], need = 1): LocId | undefined {
  return locs.filter((l) => (o.avail[l] ?? 0) >= need).sort((a, b) => (o.avail[b] ?? 0) - (o.avail[a] ?? 0))[0];
}

/** Confirm a bank transfer and hold stock for each line, as the store does for paid orders. */
export function confirmTransferWithStock(o: Order, levels: Level[], who: Actor, now: number, note = ''): { order: Order; levels: Level[] } {
  const paid = confirmTransfer(o, who, now, note);
  if (paid === o) return { order: o, levels };
  let lv = levels;
  let held = 0;
  const items = paid.items.map((it) => {
    if (!it.sku || it.reserved || !lv.some((l) => l.sku === it.sku)) return it;
    const r = reserve(lv, it.sku, it.qty);
    lv = r.levels;
    held += it.qty - r.short;
    return { ...it, reserved: r.picks };
  });
  const order = { ...paid, items };
  return { order: held ? act(order, 'stockReserved', who, now, { units: held }) : order, levels: lv };
}

/* ---------- Manual order (`#/dashboard/orders/new`) ---------- */

export type ManualPay = 'cash' | 'transfer' | 'cod' | 'link';
export interface ManualDraft {
  customerId: string; newName: string; newPhone: string; newEmail: string;
  city: string; address: string; addressNote: string; customerNote: string;
  lines: { sku: string; qty: string }[];
  freeShipping: boolean; discount: string; pay: ManualPay;
}
export const emptyManual = (): ManualDraft => ({ customerId: '', newName: '', newPhone: '', newEmail: '', city: '', address: '', addressNote: '', customerNote: '', lines: [], freeShipping: false, discount: '', pay: 'cash' });

export type DraftError = 'customer' | 'phone' | 'email' | 'city' | 'address' | 'lines' | 'qty' | 'stock' | 'discount' | 'zone';
const normDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
const intOf = (s: string) => (/^\d+$/.test(normDigits(s.trim())) ? Number(normDigits(s.trim())) : NaN);
const moneyOf = (s: string): number | null => { const t = normDigits(s.trim()).replace(/[,،\s]/g, '').replace('٫', '.'); return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : null; };
export const validPhone = (s: string) => /^(\+?966|0)?5\d{8}$/.test(normDigits(s).replace(/[\s-]/g, ''));

export interface ManualQuote {
  lines: { opt: SkuOption; qty: number; amount: number; error: 'qty' | 'stock' | null }[];
  subtotal: number; discount: number; shipping: number; total: number; vat: number; weightKg: number; zone?: Zone; errors: DraftError[];
}

/** Totals and errors for a manual order draft. Prices are VAT-inclusive; shipping comes from the merchant's zones. */
export function manualQuote(d: ManualDraft, options: SkuOption[], zones: Zone[], customers: Customer[]): ManualQuote {
  const errors: DraftError[] = [];
  const lines = d.lines.map((l) => {
    const opt = options.find((o) => o.sku === l.sku)!;
    const qty = intOf(l.qty);
    const error = !opt || !Number.isInteger(qty) || qty < 1 ? 'qty' as const : qty > opt.total ? 'stock' as const : null;
    return { opt, qty: Number.isInteger(qty) ? qty : 0, amount: opt ? opt.unit * (Number.isInteger(qty) ? qty : 0) : 0, error };
  }).filter((l) => l.opt);
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const disc = d.discount.trim() ? moneyOf(d.discount) : 0;
  const discount = disc ?? 0;
  const city = CITIES_LIST.find((c) => c.en === d.city);
  const zone = city ? zoneOf(zones, city) : undefined;
  const weightKg = lines.reduce((s, l) => s + l.qty * l.opt.weight, 0) / 1000;
  const shipping = d.freeShipping || !zone ? 0 : quoteZone(zone, subtotal - discount, weightKg);
  const total = Math.max(0, subtotal - discount) + shipping;
  if (!d.customerId) {
    if (!d.newName.trim()) errors.push('customer');
    if (!validPhone(d.newPhone)) errors.push('phone');
    if (d.newEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.newEmail.trim())) errors.push('email');
  } else if (!customers.some((c) => c.id === d.customerId)) errors.push('customer');
  if (!city) errors.push('city');
  else if (!zone && !d.freeShipping) errors.push('zone');
  if (!d.address.trim()) errors.push('address');
  if (!lines.length) errors.push('lines');
  if (lines.some((l) => l.error === 'qty')) errors.push('qty');
  if (lines.some((l) => l.error === 'stock')) errors.push('stock');
  if (disc === null || discount > subtotal) errors.push('discount');
  return { lines, subtotal, discount, shipping, total, vat: Math.round((total * 15) / 115), weightKg, zone, errors };
}

/**
 * Create the order: a new reference, the customer (new ones are added), stock held per line (whole line from one
 * warehouse where possible), payment as chosen. A payment link leaves it unpaid (simulated; real links need a server).
 */
export function createManual(
  d: ManualDraft, book: { orders: Order[]; levels: Level[]; customers: Customer[] }, options: SkuOption[], zones: Zone[], who: Actor, now: number,
): { order?: Order; levels: Level[]; customers: Customer[]; errors: DraftError[] } {
  const q = manualQuote(d, options, zones, book.customers);
  if (q.errors.length) return { levels: book.levels, customers: book.customers, errors: q.errors };
  const city = CITIES_LIST.find((c) => c.en === d.city)!;
  let customers = book.customers;
  let customer = customers.find((c) => c.id === d.customerId);
  if (!customer) {
    const m = matchCustomer(customers, { name: d.newName, phone: d.newPhone, email: d.newEmail || undefined, city }, new Date(now + 3 * 3_600_000).toISOString().slice(0, 10));
    customers = m.customers; customer = m.customer;
  }
  let levels = book.levels;
  const items = q.lines.map((l) => {
    const r = reserve(levels, l.opt.sku, l.qty);
    levels = r.levels;
    return { name: l.opt.name, variant: l.opt.variant, qty: l.qty, unit: l.opt.unit, sku: l.opt.sku, reserved: r.picks };
  });
  const paid = d.pay !== 'link';
  const ref = nextOrderRef(book.orders);
  let order: Order = {
    ref, customer: customer.name, city, hoursAgo: 0, pay: paid ? 'paid' : 'failed', ful: 'none', ship: 'none', fee: q.shipping, items,
    log: [{ when: 'now', who: 'you', kind: 'created', actor: who.name, role: who.role, at: now }],
    confirmed: true, channel: 'online', fulfilments: [], refunds: [], slips: 0, settled: false, customerId: customer.id,
    discount: q.discount || undefined, placedAt: now, manual: { pay: d.pay },
    ...(d.pay === 'cod' ? { payment: { method: 'cod' as const, state: 'cod_due' as const } } : {}),
    contact: { phone: d.customerId ? customer.phone : normDigits(d.newPhone).replace(/[\s-]/g, ''), email: (d.customerId ? customer.email : d.newEmail.trim()) || undefined },
    address: { name: customer.name.ar, line: d.address.trim(), city, notes: d.addressNote.trim() || undefined },
    customerNote: d.customerNote.trim() || undefined,
  };
  order = act(order, 'manualCreated', who, now, { text: d.pay });
  const held = items.reduce((s, it) => s + Object.values(it.reserved).reduce<number>((a, b) => a + (b ?? 0), 0), 0);
  if (held) order = act(order, 'stockReserved', who, now, { units: held });
  return { order, levels, customers, errors: [] };
}
