// Order operations (group 1): who did what and when, payment as the merchant should read it, cancellation,
// shipped/delivered per parcel, returns with stages and exchange, and the stock effect of each step.
// Pure functions only. Money is integer halalas. Simulated where an external party is involved.
import {
  refundable, refundedQty, shippingRefunded, total,
  type CarrierId, type L, type LocId, type Order, type Refund, type Ship,
} from './domain';
import { deliveryText, hasDigitalDelivery } from './catalog-extras';

/* ---------- Actors and the activity log ---------- */

export interface Actor { name: string; role: string }
export const SYSTEM: Actor = { name: 'system', role: 'system' };
export const CUSTOMER: Actor = { name: 'customer', role: 'customer' };

export type OpKind =
  | 'manualCreated' | 'confirmUndone' | 'cancelled' | 'cancelRequested' | 'cancelDeclined' | 'labelVoided'
  | 'shipped' | 'delivered' | 'codCollected' | 'noteAdded' | 'messageCopied' | 'invoicePrinted' | 'labelPrinted' | 'exported'
  | 'tagAdded' | 'tagRemoved' | 'assigned' | 'stockReserved' | 'stockReleased' | 'stockShipped'
  | 'returnRequested' | 'returnApproved' | 'returnRejected' | 'returnReceived' | 'returnInspected' | 'returnRefunded'
  | 'exchangeReserved' | 'exchangeShipped' | 'exchangeCollect' | 'transferConfirmed'
  | 'customerMessaged' | 'payDueExtended' | 'labelVoidedOnly'
  /* Sub-statuses and operating rules (see the end of this file). */
  | 'subStatusSet' | 'subStatusCleared' | 'memberNotified';

export interface Activity {
  kind: OpKind; at: number; actor: string; role: string;
  ref?: string; amount?: number; units?: number; loc?: LocId; text?: string; carrier?: CarrierId;
}

/** Append one activity line. Nothing is ever removed from the log; an undo is a new line. */
export function act(o: Order, kind: OpKind, who: Actor, now: number, extra: Partial<Activity> = {}): Order {
  return { ...o, activity: [...(o.activity ?? []), { kind, at: now, actor: who.name, role: who.role, ...extra }] };
}

/** Stamp the log lines a domain function appended (between `before` and `after`) with the actor and time. */
export function stamp(before: Order, after: Order, who: Actor, now: number): Order {
  if (after === before || after.log.length <= before.log.length) return after;
  const log = after.log.map((e, i) => (i < before.log.length || e.actor ? e : { ...e, actor: who.name, role: who.role, at: now }));
  return { ...after, log };
}

/** When the order was placed (epoch ms): recorded for store orders, derived from its age otherwise. */
export const placedAt = (o: Order, now: number) => o.placedAt ?? now - o.hoursAgo * 3_600_000;

export type Entry =
  | { source: 'log'; i: number; at: number; actor: string; role: string; e: Order['log'][number] }
  | { source: 'activity'; i: number; at: number; actor: string; role: string; a: Activity };

/** One timeline for both logs, oldest first; lines without a time take the order's placement time. */
export function entries(o: Order, now: number): Entry[] {
  const t0 = placedAt(o, now);
  const log: Entry[] = o.log.map((e, i) => ({ source: 'log', i, at: e.at ?? t0, actor: e.actor ?? (e.who === 'you' ? 'you' : 'system'), role: e.role ?? (e.who === 'you' ? '' : 'system'), e }));
  const ac: Entry[] = (o.activity ?? []).map((a, i) => ({ source: 'activity', i, at: a.at, actor: a.actor, role: a.role, a }));
  return [...log, ...ac].sort((x, y) => x.at - y.at || (x.source === y.source ? x.i - y.i : x.source === 'log' ? -1 : 1));
}

/* ---------- Payment as the merchant should read it ---------- */

/** `pay` is the money state the rest of the domain uses; this adds what it hides: verification, COD and payment links. */
export type PayView = 'paid' | 'failed' | 'verifying' | 'bank_due' | 'cod_due' | 'cod_collected' | 'link' | 'partially_refunded' | 'refunded';

export function payView(o: Order): PayView {
  if (o.pay === 'refunded' || o.pay === 'partially_refunded') return o.pay;
  const cod = o.payment?.method === 'cod' || o.manual?.pay === 'cod';
  if (cod && o.pay !== 'failed') return o.payment?.state === 'cod_collected' || o.ship === 'delivered' ? 'cod_collected' : 'cod_due';
  if (o.pay === 'failed' && o.payment?.method === 'bank' && o.payment.state === 'verifying') return 'bank_due';
  if (o.pay === 'failed') return o.payment?.state === 'verifying' ? 'verifying' : o.manual?.pay === 'link' ? 'link' : 'failed';
  return 'paid';
}

/** Money actually taken: nothing for a failed, unverified, unpaid link or uncollected cash-on-delivery order. */
export function collected(o: Order): number {
  const v = payView(o);
  return v === 'paid' || v === 'cod_collected' || v === 'partially_refunded' || v === 'refunded' ? total(o) : 0;
}

/** What can still go back to the customer: collected minus live refunds. Zero before money is taken. */
export const refundableNow = (o: Order) => (collected(o) ? refundable(o) : 0);

/**
 * The merchant saw the bank transfer arrive: the order becomes paid and is logged. Holding stock is the caller's
 * step (the store holds stock only once an order is paid). Does nothing unless a transfer is awaited.
 */
export function confirmTransfer(o: Order, who: Actor, now: number, note = ''): Order {
  if (payView(o) !== 'bank_due' || o.cancelled) return o;
  const next: Order = { ...o, pay: 'paid', payment: { method: 'bank', state: 'paid' }, log: [...o.log, { when: 'now', who: 'you', kind: 'created', actor: who.name, role: who.role, at: now }] };
  return act(next, 'transferConfirmed', who, now, { amount: total(o), text: note.trim() || undefined });
}

/* ---------- Stock effects ---------- */

/** A change to one stock level. `reserved` and `onHand` are deltas. Applied by inventory.applyStockEffects. */
export interface StockEffect { sku: string; loc: LocId; reserved: number; onHand: number }

/** Units of a line still held for the order, by location. */
export const heldFor = (o: Order, idx: number): [LocId, number][] =>
  Object.entries(o.items[idx]?.reserved ?? {}).filter((e): e is [LocId, number] => (e[1] ?? 0) > 0);

/**
 * Shipping units from a location takes them off the shelf and releases the order's hold there.
 * Orders without a recorded hold (older fixtures) release up to the units shipped; the level never goes below zero.
 */
export function fulfilEffects(o: Order, loc: LocId, picks: number[]): StockEffect[] {
  return o.items.flatMap((it, i) => {
    const q = picks[i] ?? 0;
    if (!q || !it.sku) return [];
    const held = it.reserved ? Math.min(q, it.reserved[loc] ?? 0) : q;
    return [{ sku: it.sku, loc, reserved: -held, onHand: -q }];
  });
}

/** The order after shipping `picks` from `loc`: its holds there go down by what shipped. */
export function takeHeld(o: Order, loc: LocId, picks: number[]): Order {
  return {
    ...o,
    items: o.items.map((it, i) => (it.reserved && picks[i] ? { ...it, reserved: { ...it.reserved, [loc]: Math.max(0, (it.reserved[loc] ?? 0) - picks[i]) } } : it)),
  };
}

/* ---------- Shipment per parcel ---------- */

const SHIP_ORDER: Ship[] = ['none', 'label', 'transit', 'delivered'];
export const parcelShip = (o: Order, i: number): Ship => o.fulfilments[i]?.ship ?? o.ship;
/** The order's shipment is its least advanced parcel (all delivered = delivered). */
export function orderShip(o: Order): Ship {
  if (!o.fulfilments.length) return o.ship;
  return o.fulfilments.map((_, i) => parcelShip(o, i)).reduce((m, s) => (SHIP_ORDER.indexOf(s) < SHIP_ORDER.indexOf(m) ? s : m), 'delivered' as Ship);
}

/** Parcels (by index) at a given state. Orders with no parcel record count as one parcel (-1). */
export function parcelsAt(o: Order, s: Ship): number[] {
  if (!o.fulfilments.length) return o.ship === s ? [-1] : [];
  return o.fulfilments.map((_, i) => i).filter((i) => parcelShip(o, i) === s);
}

export const canMarkShipped = (o: Order) => !o.cancelled && parcelsAt(o, 'label').length > 0;
export const canMarkDelivered = (o: Order) => !o.cancelled && parcelsAt(o, 'transit').length > 0;

function moveParcels(o: Order, from: Ship, to: Ship, which: number[] | 'all', tracking?: string): { order: Order; refs: string[] } {
  const at = parcelsAt(o, from);
  const pick = which === 'all' ? at : which.filter((i) => at.includes(i));
  if (!pick.length) return { order: o, refs: [] };
  if (pick.includes(-1)) return { order: { ...o, ship: to }, refs: [o.ref] };
  const fulfilments = o.fulfilments.map((f, i) => (pick.includes(i) ? { ...f, ship: to, ...(tracking ? { tracking } : {}) } : { ...f, ship: f.ship ?? o.ship }));
  const next = { ...o, fulfilments };
  return { order: { ...next, ship: orderShip(next) }, refs: pick.map((i) => o.fulfilments[i].ref) };
}

/** Handed to the carrier (for carriers without automatic updates). Each parcel moves on its own. */
export function markShipped(o: Order, which: number[] | 'all', who: Actor, now: number, tracking?: string): Order {
  if (!canMarkShipped(o)) return o;
  const r = moveParcels(o, 'label', 'transit', which, tracking?.trim() || undefined);
  return r.refs.reduce((x, ref) => act(x, 'shipped', who, now, { ref, text: tracking?.trim() || undefined }), r.order);
}

/** Delivered to the customer. Cash on delivery is collected on the last parcel. */
export function markDelivered(o: Order, which: number[] | 'all', who: Actor, now: number): Order {
  if (!canMarkDelivered(o)) return o;
  const r = moveParcels(o, 'transit', 'delivered', which);
  let next = r.refs.reduce((x, ref) => act(x, 'delivered', who, now, { ref }), r.order);
  if (next.ship === 'delivered' && payView(o) === 'cod_due') {
    next = act({ ...next, payment: { method: 'cod', state: 'cod_collected' } }, 'codCollected', who, now, { amount: total(o) });
  }
  return next;
}

/* ---------- Cancellation ---------- */

export type CancelBlock = 'already' | 'shipped' | 'refunded';
/** An order can be cancelled until a parcel is with the carrier; after that it becomes a return. */
export function cancelBlock(o: Order): CancelBlock | null {
  if (o.cancelled) return 'already';
  if (o.pay === 'refunded') return 'refunded';
  if (o.ship === 'transit' || o.ship === 'delivered' || o.fulfilments.some((_, i) => parcelShip(o, i) === 'transit' || parcelShip(o, i) === 'delivered')) return 'shipped';
  return null;
}

export interface CancelPlan { refund: number; release: StockEffect[]; restock: StockEffect[]; voidLabels: string[]; units: number }

/** What cancelling does, before it is confirmed: money back, holds released, labels voided and their units back on the shelf. */
export function cancelPlan(o: Order): CancelPlan {
  const release: StockEffect[] = o.items.flatMap((it, i) => heldFor(o, i).map(([loc, n]) => ({ sku: it.sku, loc, reserved: -n, onHand: 0 })));
  const labels = o.fulfilments.filter((_, i) => parcelShip(o, i) === 'label');
  const restock: StockEffect[] = labels.flatMap((f) => o.items.flatMap((it, i) => (f.qty[i] ? [{ sku: it.sku, loc: f.loc, reserved: 0, onHand: f.qty[i] }] : [])));
  const voidLabels = labels.map((f) => f.ref);
  if (!o.fulfilments.length && o.ship === 'label') voidLabels.push(`SIM-${o.ref}-1`);
  const units = release.reduce((s, e) => s - e.reserved, 0);
  return { refund: refundableNow(o), release, restock, voidLabels, units };
}

/**
 * Cancel an order. A collected payment becomes a full refund request (pending at the provider), holds are released,
 * issued labels are voided (simulated) and their units go back on the shelf. Returns the stock effects to apply.
 */
export function cancelOrder(o: Order, reason: string, who: Actor, now: number): { order: Order; effects: StockEffect[] } {
  if (cancelBlock(o) || !reason.trim()) return { order: o, effects: [] };
  const plan = cancelPlan(o);
  let next: Order = {
    ...o,
    items: o.items.map((it) => (it.reserved ? { ...it, reserved: {} } : it)),
    fulfilments: o.fulfilments.map((f, i) => (parcelShip(o, i) === 'label' ? { ...f, ship: 'none' as Ship } : f)),
    ship: 'none', cancelRequest: undefined,
    cancelled: { at: now, by: who.name, role: who.role, reason: reason.trim() },
  };
  for (const ref of plan.voidLabels) next = act(next, 'labelVoided', who, now, { ref });
  if (plan.units) next = act(next, 'stockReleased', who, now, { units: plan.units });
  if (plan.refund > 0) {
    const id = `RF-${o.ref}-${o.refunds.length + 1}`;
    const refund: Refund = {
      id, amount: plan.refund, qty: o.items.map((it, i) => it.qty - refundedQty(o, i)), shipping: shippingRefunded(o) ? 0 : o.fee,
      restock: o.items.map(() => 0), loc: o.fulfilments[0]?.loc ?? 'ryd', reason: reason.trim(), status: 'pending',
    };
    next = { ...next, refunds: [...next.refunds, refund], log: [...next.log, { when: 'now', who: who.role === 'system' || who.role === 'customer' ? 'system' : 'you', kind: 'refundRequested', ref: id, amount: plan.refund, actor: who.name, role: who.role, at: now }] };
  }
  next = act(next, 'cancelled', who, now, { text: reason.trim(), amount: plan.refund || undefined });
  return { order: next, effects: [...plan.release, ...plan.restock] };
}

/** The shopper asks to cancel after the self-cancel window. The merchant approves (cancelOrder) or declines. */
export function requestCancel(o: Order, reason: string, now: number): Order {
  if (cancelBlock(o) || o.cancelRequest?.state === 'open') return o;
  return act({ ...o, cancelRequest: { at: now, reason: reason.trim(), state: 'open' } }, 'cancelRequested', CUSTOMER, now, { text: reason.trim() || undefined });
}
export function declineCancel(o: Order, why: string, who: Actor, now: number): Order {
  if (o.cancelRequest?.state !== 'open') return o;
  return act({ ...o, cancelRequest: { ...o.cancelRequest, state: 'declined' } }, 'cancelDeclined', who, now, { text: why.trim() || undefined });
}

/* ---------- Returns (requested → approved → received → inspected → refunded | exchanged; or rejected) ---------- */

export type ReturnStage = 'requested' | 'approved' | 'rejected' | 'received' | 'inspected' | 'refunded' | 'exchanged';
export const RETURN_STAGES: ReturnStage[] = ['requested', 'approved', 'received', 'inspected', 'refunded'];
export interface ReturnLine { idx: number; qty: number; reason: string }
export interface Exchange { idx: number; sku: string; name: L; variant?: L; unit: number; qty: number; loc: LocId; diff: number; shipped?: string; refundId?: string }
export interface OrderReturn {
  id: string;
  source: 'store' | 'merchant';
  lines: ReturnLine[];
  stage: ReturnStage;
  at: number;
  method?: 'pickup' | 'dropoff';
  refundTo?: 'original' | 'bank';
  iban?: string;
  /** Estimate when requested; the refund is decided after inspection. */
  estimate: number;
  labelRef?: string;
  rejectReason?: string;
  inspection?: { accepted: number[]; restock: number[]; loc: LocId; note?: string };
  refundId?: string;
  exchange?: Exchange;
  history: { stage: ReturnStage; at: number; actor: string; role: string }[];
}

const rets = (o: Order) => o.returns ?? [];
export const findReturn = (o: Order, id: string) => rets(o).find((r) => r.id === id);
export const openReturns = (o: Order) => rets(o).filter((r) => r.stage !== 'rejected' && r.stage !== 'refunded' && r.stage !== 'exchanged');

/** Units of a line already in a live return (rejected returns free their units). */
export const inReturn = (o: Order, idx: number) => rets(o).filter((r) => r.stage !== 'rejected').reduce((s, r) => s + r.lines.filter((l) => l.idx === idx).reduce((a, l) => a + l.qty, 0), 0);
/** Units that can still be returned: delivered or shipped units, less refunded and already-returned units. */
export function returnableQty(o: Order, idx: number): number {
  const it = o.items[idx];
  if (!it || o.cancelled || collected(o) === 0 && payView(o) !== 'cod_due') return 0;
  const shipped = o.fulfilments.length ? o.fulfilments.reduce((s, f, i) => s + (parcelShip(o, i) === 'transit' || parcelShip(o, i) === 'delivered' ? f.qty[idx] ?? 0 : 0), 0)
    : o.ship === 'transit' || o.ship === 'delivered' ? it.qty : 0;
  return Math.max(0, shipped - refundedQty(o, idx) - inReturn(o, idx));
}

/** The paid value of returned units, less their share of any order discount. */
export function linesValue(o: Order, picks: { idx: number; qty: number }[]): number {
  const goods = picks.reduce((s, p) => s + (o.items[p.idx]?.unit ?? 0) * p.qty, 0);
  const sub = o.items.reduce((s, i) => s + i.qty * i.unit, 0);
  return o.discount && sub ? goods - Math.round((goods * o.discount) / sub) : goods;
}

const step = (r: OrderReturn, stage: ReturnStage, who: Actor, now: number): OrderReturn => ({ ...r, stage, history: [...r.history, { stage, at: now, actor: who.name, role: who.role }] });
const putReturn = (o: Order, r: OrderReturn): Order => ({ ...o, returns: rets(o).map((x) => (x.id === r.id ? r : x)) });

export type ReturnError = 'nothing' | 'qty' | 'reason';
export function validateReturnLines(o: Order, lines: ReturnLine[]): ReturnError | null {
  const live = lines.filter((l) => l.qty > 0);
  if (!live.length) return 'nothing';
  if (live.some((l) => !Number.isInteger(l.qty) || l.qty > returnableQty(o, l.idx))) return 'qty';
  if (live.some((l) => !l.reason.trim())) return 'reason';
  return null;
}

/** Open a return (from the store or by the merchant). The id is stable per order: RMA-<ref>-<n>. */
export function openReturn(o: Order, lines: ReturnLine[], who: Actor, now: number, extra: Partial<Pick<OrderReturn, 'source' | 'method' | 'refundTo' | 'iban' | 'id'>> = {}): { order: Order; id?: string } {
  if (validateReturnLines(o, lines)) return { order: o };
  const live = lines.filter((l) => l.qty > 0);
  const id = extra.id ?? `RMA-${o.ref.replace(/\D/g, '')}-${rets(o).length + 1}`;
  if (findReturn(o, id)) return { order: o, id };
  const r: OrderReturn = {
    id, source: extra.source ?? 'merchant', lines: live, stage: 'requested', at: now, method: extra.method, refundTo: extra.refundTo, iban: extra.iban,
    estimate: linesValue(o, live), history: [{ stage: 'requested', at: now, actor: who.name, role: who.role }],
  };
  return { order: act({ ...o, returns: [...rets(o), r] }, 'returnRequested', who, now, { ref: id, units: live.reduce((s, l) => s + l.qty, 0) }), id };
}

/** Approve: a (simulated) return label is issued for the customer. */
export function approveReturn(o: Order, id: string, who: Actor, now: number): Order {
  const r = findReturn(o, id);
  if (r?.stage !== 'requested') return o;
  const labelRef = `RTN-${id.replace(/^RMA-/, '')}`;
  return act(putReturn(o, { ...step(r, 'approved', who, now), labelRef }), 'returnApproved', who, now, { ref: id, text: labelRef });
}
/** Reject with a reason. Money and stock do not change. */
export function rejectReturn(o: Order, id: string, why: string, who: Actor, now: number): Order {
  const r = findReturn(o, id);
  if (r?.stage !== 'requested' || !why.trim()) return o;
  return act(putReturn(o, { ...step(r, 'rejected', who, now), rejectReason: why.trim() }), 'returnRejected', who, now, { ref: id, text: why.trim() });
}
export function receiveReturn(o: Order, id: string, who: Actor, now: number): Order {
  const r = findReturn(o, id);
  if (r?.stage !== 'approved') return o;
  return act(putReturn(o, step(r, 'received', who, now)), 'returnReceived', who, now, { ref: id, units: r.lines.reduce((s, l) => s + l.qty, 0) });
}

export type InspectError = 'accepted' | 'restock';
/** Inspection: units accepted for refund/exchange, and (a separate decision) units fit to sell again. */
export function validateInspection(r: OrderReturn, accepted: number[], restock: number[]): InspectError | null {
  if (r.lines.some((l, i) => !Number.isInteger(accepted[i] ?? 0) || (accepted[i] ?? 0) < 0 || (accepted[i] ?? 0) > l.qty)) return 'accepted';
  if (r.lines.some((l, i) => !Number.isInteger(restock[i] ?? 0) || (restock[i] ?? 0) < 0 || (restock[i] ?? 0) > l.qty)) return 'restock';
  return null;
}
export function inspectReturn(o: Order, id: string, accepted: number[], restock: number[], loc: LocId, note: string, who: Actor, now: number): { order: Order; effects: StockEffect[] } {
  const r = findReturn(o, id);
  if (r?.stage !== 'received' || validateInspection(r, accepted, restock)) return { order: o, effects: [] };
  const effects: StockEffect[] = r.lines.flatMap((l, i) => ((restock[i] ?? 0) > 0 ? [{ sku: o.items[l.idx].sku, loc, reserved: 0, onHand: restock[i] }] : []));
  const next = putReturn(o, { ...step(r, 'inspected', who, now), inspection: { accepted: r.lines.map((_, i) => accepted[i] ?? 0), restock: r.lines.map((_, i) => restock[i] ?? 0), loc, note: note.trim() || undefined } });
  const units = effects.reduce((s, e) => s + e.onHand, 0);
  return { order: act(next, 'returnInspected', who, now, { ref: id, units, loc: units ? loc : undefined }), effects };
}

/** The refund a return earns after inspection: accepted units at their paid price, never more than can still be refunded. */
export function returnRefundAmount(o: Order, r: OrderReturn): number {
  if (!r.inspection) return 0;
  const v = linesValue(o, r.lines.map((l, i) => ({ idx: l.idx, qty: r.inspection!.accepted[i] ?? 0 })));
  return Math.min(v, refundableNow(o));
}

/** Refund an inspected return: a refund request (pending at the provider, or to the shopper's bank for COD). */
export function refundReturn(o: Order, id: string, who: Actor, now: number): Order {
  const r = findReturn(o, id);
  if (r?.stage !== 'inspected') return o;
  const amount = returnRefundAmount(o, r);
  const rid = `RF-${o.ref}-${o.refunds.length + 1}`;
  const qty = o.items.map((_, i) => r.lines.reduce((s, l, k) => s + (l.idx === i ? r.inspection!.accepted[k] ?? 0 : 0), 0));
  let next = putReturn(o, { ...step(r, 'refunded', who, now), refundId: amount ? rid : undefined });
  if (amount > 0) {
    const refund: Refund = { id: rid, amount, qty, shipping: 0, restock: o.items.map(() => 0), loc: r.inspection!.loc, reason: `${id}`, status: 'pending' };
    next = { ...next, refunds: [...next.refunds, refund], log: [...next.log, { when: 'now', who: 'you', kind: 'refundRequested', ref: rid, amount, actor: who.name, role: who.role, at: now }] };
  }
  return act(next, 'returnRefunded', who, now, { ref: id, amount });
}

/** Price difference of an exchange: replacement value minus the accepted value of what came back. */
export function exchangeDiff(o: Order, r: OrderReturn, unit: number, qty: number): number {
  const back = linesValue(o, r.lines.map((l, i) => ({ idx: l.idx, qty: r.inspection?.accepted[i] ?? l.qty })));
  return unit * qty - back;
}

/**
 * Exchange an inspected return: the replacement is held at a location and shipped as its own parcel.
 * A cheaper replacement refunds the difference (pending at the provider); a dearer one leaves an amount to collect.
 */
export function exchangeReturn(o: Order, id: string, repl: { sku: string; name: L; variant?: L; unit: number; qty: number; loc: LocId }, who: Actor, now: number): { order: Order; effects: StockEffect[] } {
  const r = findReturn(o, id);
  if (r?.stage !== 'inspected' || repl.qty < 1) return { order: o, effects: [] };
  const line = r.lines[0];
  const diff = exchangeDiff(o, r, repl.unit, repl.qty);
  const ex: Exchange = { idx: line.idx, ...repl, diff };
  let next = putReturn(o, { ...step(r, 'exchanged', who, now), exchange: ex });
  next = act(next, 'exchangeReserved', who, now, { ref: id, units: repl.qty, loc: repl.loc, text: repl.sku });
  if (diff < 0) {
    const amount = Math.min(-diff, refundableNow(o));
    if (amount > 0) {
      const rid = `RF-${o.ref}-${o.refunds.length + 1}`;
      const refund: Refund = { id: rid, amount, qty: o.items.map(() => 0), shipping: 0, restock: o.items.map(() => 0), loc: repl.loc, reason: `${id} exchange`, status: 'pending' };
      next = putReturn({ ...next, refunds: [...next.refunds, refund], log: [...next.log, { when: 'now', who: 'you', kind: 'refundRequested', ref: rid, amount, actor: who.name, role: who.role, at: now }] }, { ...findReturn(next, id)!, exchange: { ...ex, refundId: rid } });
    }
  } else if (diff > 0) next = act(next, 'exchangeCollect', who, now, { ref: id, amount: diff });
  return { order: next, effects: [{ sku: repl.sku, loc: repl.loc, reserved: repl.qty, onHand: 0 }] };
}

/** Ship the replacement: one label (simulated), the hold is released and the units leave the shelf. */
export function shipExchange(o: Order, id: string, who: Actor, now: number): { order: Order; effects: StockEffect[]; ref?: string } {
  const r = findReturn(o, id);
  const ex = r?.exchange;
  if (!r || !ex || ex.shipped) return { order: o, effects: [] };
  const ref = `SIM-${o.ref}-X${rets(o).indexOf(r) + 1}`;
  const next = act(putReturn(o, { ...r, exchange: { ...ex, shipped: ref } }), 'exchangeShipped', who, now, { ref, units: ex.qty, loc: ex.loc });
  return { order: next, effects: [{ sku: ex.sku, loc: ex.loc, reserved: -ex.qty, onHand: -ex.qty }], ref };
}

/** How the shopper's order page reads a merchant return. */
export function storeReturnState(r: OrderReturn, refunds: Refund[]): { state: 'requested' | 'approved' | 'received' | 'closed'; refund: 'not_started' | 'pending' | 'refunded' } {
  const rf = refunds.find((x) => x.id === (r.refundId ?? r.exchange?.refundId));
  const refund = rf ? (rf.status === 'confirmed' ? 'refunded' : rf.status === 'pending' ? 'pending' : 'not_started') : 'not_started';
  const state = r.stage === 'requested' ? 'requested' : r.stage === 'approved' ? 'approved' : r.stage === 'received' || r.stage === 'inspected' ? 'received' : 'closed';
  return { state, refund };
}

/* ---------- Notes, tags, assignee ---------- */

export function addNote(o: Order, text: string, who: Actor, now: number): Order {
  const t = text.trim();
  if (!t) return o;
  const id = `N-${(o.notes?.length ?? 0) + 1}`;
  return act({ ...o, notes: [...(o.notes ?? []), { id, text: t, by: who.name, at: now }] }, 'noteAdded', who, now, { text: t });
}
export const normTag = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 24);
export function addTag(o: Order, tag: string, who: Actor, now: number): Order {
  const t = normTag(tag);
  if (!t || (o.tags ?? []).includes(t)) return o;
  return act({ ...o, tags: [...(o.tags ?? []), t] }, 'tagAdded', who, now, { text: t });
}
export function removeTag(o: Order, tag: string, who: Actor, now: number): Order {
  if (!(o.tags ?? []).includes(tag)) return o;
  return act({ ...o, tags: (o.tags ?? []).filter((x) => x !== tag) }, 'tagRemoved', who, now, { text: tag });
}
export function assign(o: Order, name: string | undefined, who: Actor, now: number): Order {
  if ((o.assignee ?? '') === (name ?? '')) return o;
  return act({ ...o, assignee: name || undefined }, 'assigned', who, now, { text: name || undefined });
}

/* ---------- ZATCA simplified invoice QR (phase 1 TLV) ---------- */

/** Base64 of the TLV payload ZATCA phase 1 requires on simplified invoices: seller, VAT no., time, total, VAT. */
export function zatcaTlv(seller: string, vatNo: string, isoTime: string, totalHalalas: number, vatHalalas: number): string {
  const enc = new TextEncoder();
  const fields = [seller, vatNo, isoTime, (totalHalalas / 100).toFixed(2), (vatHalalas / 100).toFixed(2)];
  const bytes: number[] = [];
  fields.forEach((f, i) => { const b = enc.encode(f); bytes.push(i + 1, b.length, ...b); });
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
/** Saudi VAT registration number: 15 digits, starting and ending with 3. */
export const validVatNo = (s: string) => /^3\d{13}3$/.test(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\s/g, ''));

/* ---------- Customer order messages (simulated: nothing leaves the browser) ---------- */

/** Order states the customer can hear about. The last three are sent only by an explicit merchant action. */
export type NoticeEvent =
  | 'placed' | 'paid' | 'payFailed' | 'ready' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
  | 'returnRequested' | 'returnApproved' | 'returnRejected' | 'returnReceived'
  | 'payLink' | 'payReminder' | 'invoice'
  /** A custom sub-status the merchant marked «notify the customer» was set on the order. */
  | 'subStatus'
  /** A reply written by hand in the service inbox (dashboard/inbox). Never sent automatically; not in NOTICE_EVENTS. */
  | 'caseReply'
  /** Codes and download links sent when an order with digital items is paid (catalog-extras). Automatic; not in NOTICE_EVENTS. */
  | 'digitalDelivered';
export const ORDER_NOTICES: NoticeEvent[] = ['placed', 'paid', 'payFailed', 'ready', 'shipped', 'delivered', 'cancelled', 'refunded'];
export const RETURN_NOTICES: NoticeEvent[] = ['returnRequested', 'returnApproved', 'returnRejected', 'returnReceived'];
export const MANUAL_NOTICES: NoticeEvent[] = ['payLink', 'payReminder', 'invoice'];
/** Sub-status updates: one shared template; each sub-status decides whether it notifies. */
export const SUB_NOTICES: NoticeEvent[] = ['subStatus'];
export const NOTICE_EVENTS: NoticeEvent[] = [...ORDER_NOTICES, ...RETURN_NOTICES, ...MANUAL_NOTICES, ...SUB_NOTICES];
export type NoticeChannel = 'email' | 'sms' | 'whatsapp';
export const NOTICE_CHANNELS: NoticeChannel[] = ['email', 'sms', 'whatsapp'];
export const NOTICE_VARS = ['customer', 'order', 'total', 'refund', 'tracking', 'payLink', 'deadline', 'returnRef', 'store', 'status'] as const;
/** `delivery` (codes and download links) is filled for the digital-delivery message only; it is not offered in the template editor. */
export type NoticeVar = (typeof NOTICE_VARS)[number] | 'delivery';
/** Variables a template should carry for its message to make sense. */
export const NOTICE_NEEDS: Partial<Record<NoticeEvent, NoticeVar[]>> = { shipped: ['tracking'], payFailed: ['payLink'], payLink: ['payLink'], payReminder: ['payLink', 'deadline'], refunded: ['refund'], subStatus: ['status'] };

export interface NoticeTemplate { subject: L; body: L }
export interface NoticeConfig {
  channels: Record<NoticeEvent, Record<NoticeChannel, boolean>>;
  templates: Record<NoticeEvent, NoticeTemplate>;
  /** Language for customers whose order does not record one. */
  defaultLang: 'ar' | 'en';
  /** Review mode only: every message on this channel fails, to show failed states and resending. */
  simFail?: NoticeChannel | null;
}

const ch = (email: boolean, sms: boolean, whatsapp = false) => ({ email, sms, whatsapp });
export const DEFAULT_TEMPLATES: Record<NoticeEvent, NoticeTemplate> = {
  placed: { subject: { ar: 'وصلنا طلبك {order}', en: 'We have your order {order}' }, body: { ar: 'أهلًا {customer}، وصلنا طلبك {order} بقيمة {total}. نبلغك بكل خطوة. {store}', en: 'Hi {customer}, we have your order {order} ({total}). We will tell you at every step. {store}' } },
  paid: { subject: { ar: 'استلمنا دفعتك للطلب {order}', en: 'Payment received for {order}' }, body: { ar: 'استلمنا دفعتك للطلب {order} ({total}). نبدأ تجهيزه الآن.', en: 'We received your payment for {order} ({total}). We are preparing it now.' } },
  payFailed: { subject: { ar: 'لم يكتمل دفع الطلب {order}', en: 'Payment for {order} did not go through' }, body: { ar: '{customer}، لم يكتمل دفع الطلب {order} ولم يُخصم منك شيء. أكمل الدفع من هنا: {payLink}', en: '{customer}, payment for {order} did not go through and nothing was charged. Complete it here: {payLink}' } },
  ready: { subject: { ar: 'طلبك {order} جاهز', en: 'Your order {order} is packed' }, body: { ar: 'طلبك {order} جاهز وصدر ملصق شحنه. نرسل لك رابط التتبع عند تسليمه للناقل.', en: 'Your order {order} is packed and labelled. We will send the tracking link once the carrier has it.' } },
  shipped: { subject: { ar: 'طلبك {order} في الطريق', en: 'Your order {order} is on its way' }, body: { ar: 'طلبك {order} في الطريق إليك. تتبّعه من هنا: {tracking}', en: 'Your order {order} is on its way. Track it here: {tracking}' } },
  delivered: { subject: { ar: 'وصل طلبك {order}', en: 'Your order {order} was delivered' }, body: { ar: 'وصل طلبك {order}. نتمنى أن يعجبك، ويسعدنا سماع رأيك.', en: 'Your order {order} was delivered. We hope you love it and would like to hear what you think.' } },
  cancelled: { subject: { ar: 'أُلغي طلبك {order}', en: 'Your order {order} was cancelled' }, body: { ar: 'أُلغي طلبك {order}. إن كنت دفعت، نعيد {refund} إلى وسيلة دفعك.', en: 'Your order {order} was cancelled. If you paid, {refund} goes back to your payment method.' } },
  refunded: { subject: { ar: 'أعدنا مبلغًا للطلب {order}', en: 'Refund for order {order}' }, body: { ar: 'أعدنا {refund} للطلب {order} إلى وسيلة دفعك. يظهر حسب مدة بنكك.', en: 'We refunded {refund} for order {order} to your payment method. Your bank decides when it shows.' } },
  returnRequested: { subject: { ar: 'استلمنا طلب الإرجاع {returnRef}', en: 'Return request {returnRef} received' }, body: { ar: 'استلمنا طلب الإرجاع {returnRef} للطلب {order}. نراجعه ونرد عليك.', en: 'We received return request {returnRef} for order {order}. We will review it and reply.' } },
  returnApproved: { subject: { ar: 'وافقنا على الإرجاع {returnRef}', en: 'Return {returnRef} approved' }, body: { ar: 'وافقنا على الإرجاع {returnRef}. ملصق الإرجاع جاهز؛ سلّم الطرد للناقل.', en: 'Return {returnRef} is approved. Your return label is ready; hand the parcel to the carrier.' } },
  returnRejected: { subject: { ar: 'بخصوص الإرجاع {returnRef}', en: 'About return {returnRef}' }, body: { ar: 'نعتذر، لم نقبل طلب الإرجاع {returnRef}. راسلنا إن احتجت مساعدة.', en: 'Sorry, we could not accept return {returnRef}. Write to us if you need help.' } },
  returnReceived: { subject: { ar: 'وصلنا المرتجع {returnRef}', en: 'Return {returnRef} arrived' }, body: { ar: 'وصلنا المرتجع {returnRef}. نفحصه ونبلغك بالنتيجة.', en: 'Return {returnRef} arrived. We will inspect it and tell you the outcome.' } },
  payLink: { subject: { ar: 'رابط دفع الطلب {order}', en: 'Payment link for {order}' }, body: { ar: '{customer}، رابط دفع طلبك {order} بقيمة {total}: {payLink} صالح حتى {deadline}.', en: '{customer}, here is the payment link for {order} ({total}): {payLink} Valid until {deadline}.' } },
  payReminder: { subject: { ar: 'مددنا مهلة دفع الطلب {order}', en: 'More time to pay for {order}' }, body: { ar: 'مددنا مهلة دفع الطلب {order} حتى {deadline}. ادفع من هنا: {payLink}', en: 'You now have until {deadline} to pay for {order}. Pay here: {payLink}' } },
  invoice: { subject: { ar: 'فاتورة الطلب {order}', en: 'Invoice for {order}' }, body: { ar: 'فاتورتك الضريبية للطلب {order} ({total}) مرفقة. شكرًا لتسوقك من {store}.', en: 'Your tax invoice for {order} ({total}) is attached. Thank you for shopping with {store}.' } },
  subStatus: { subject: { ar: 'تحديث على طلبك {order}', en: 'Update on your order {order}' }, body: { ar: 'تحديث على طلبك {order}: {status}. {store}', en: 'Update on your order {order}: {status}. {store}' } },
  caseReply: { subject: { ar: 'بخصوص طلبك {order}', en: 'About your order {order}' }, body: { ar: '{customer}', en: '{customer}' } },
  digitalDelivered: { subject: { ar: 'مشترياتك الرقمية من الطلب {order}', en: 'Your digital items from order {order}' }, body: { ar: '{customer}، هذه مشترياتك من الطلب {order}: {delivery}', en: '{customer}, here are your items from order {order}: {delivery}' } },
};
export function noticeFixture(): NoticeConfig {
  return {
    channels: {
      placed: ch(true, true), paid: ch(true, false), payFailed: ch(true, true), ready: ch(false, false), shipped: ch(true, true, true), delivered: ch(false, true),
      cancelled: ch(true, true), refunded: ch(true, false), returnRequested: ch(true, false), returnApproved: ch(true, true), returnRejected: ch(true, false), returnReceived: ch(true, false),
      payLink: ch(false, true, true), payReminder: ch(false, true), invoice: ch(true, false), subStatus: ch(false, true), caseReply: ch(false, false),
      digitalDelivered: ch(true, true),
    },
    templates: DEFAULT_TEMPLATES, defaultLang: 'ar', simFail: null,
  };
}

/** `{name}` placeholders in a template, in order of appearance. */
export const varsIn = (text: string): string[] => [...text.matchAll(/\{([^{}\s]+)\}/g)].map((m) => m[1]);
export interface TemplateIssues { unknown: string[]; missing: NoticeVar[]; empty: boolean }
/** Unknown placeholders (typos), required ones left out, and empty text, for one language of a template. */
export function templateIssues(event: NoticeEvent, body: string): TemplateIssues {
  const used = varsIn(body);
  return {
    unknown: [...new Set(used.filter((v) => !(NOTICE_VARS as readonly string[]).includes(v)))],
    missing: (NOTICE_NEEDS[event] ?? []).filter((v) => !used.includes(v)),
    empty: !body.trim(),
  };
}
/** SMS parts: Arabic (UCS-2) 70 characters, 67 per part when split; Latin 160 and 153. */
export function smsParts(text: string): number {
  const ucs = /[^\u0000-\u007f]/.test(text);
  const n = [...text].length;
  if (!n) return 0;
  const [one, many] = ucs ? [70, 67] : [160, 153];
  return n <= one ? 1 : Math.ceil(n / many);
}

export type NoticeVars = Partial<Record<NoticeVar, string>>;
/** Fill `{var}` placeholders; unknown ones stay as typed so the merchant sees them in the preview. */
export const renderNotice = (text: string, vars: NoticeVars): string => text.replace(/\{([^{}\s]+)\}/g, (m, k: string) => vars[k as NoticeVar] ?? m);

/** What the message layer needs to know about the store and the customer. */
export interface NoticeCtx { store: string; trackBase: string; contact: { phone?: string; email?: string }; now: number }
const money = (h: number, lang: 'ar' | 'en') => (lang === 'ar' ? `${(h / 100).toFixed(2)} ر.س` : `SAR ${(h / 100).toFixed(2)}`);
const DAY = 86_400_000;
/** When an unpaid order (awaiting a transfer or a payment link) stops waiting: recorded, else placed + 3 days. */
export const payDeadline = (o: Order, now: number) => o.payDue ?? placedAt(o, now) + 3 * DAY;
/** Orders a payment link or a deadline applies to: not cancelled and still waiting for money. */
export const awaitingPayment = (o: Order) => !o.cancelled && ['bank_due', 'link', 'failed'].includes(payView(o));
export const customerLang = (o: Order, cfg: NoticeConfig) => o.lang ?? cfg.defaultLang;
export const payLinkOf = (o: Order) => `https://pay.example/SIM-${o.ref}`;

export function noticeVars(o: Order, ctx: NoticeCtx, lang: 'ar' | 'en', extra: NoticeVars = {}): NoticeVars {
  const parcel = [...o.fulfilments].reverse().find((f) => !f.voided && f.ship !== 'none');
  const lastRefund = [...o.refunds].reverse().find((r) => r.status !== 'failed');
  const fmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' });
  return {
    customer: lang === 'ar' ? o.customer.ar.split(' ')[0] : o.customer.en.split(' ')[0],
    order: `#${o.ref}`, total: money(total(o), lang), refund: money(lastRefund?.amount ?? refundableNow(o), lang),
    tracking: `${ctx.trackBase}${o.ref}${parcel?.tracking ? `?t=${parcel.tracking}` : ''}`, payLink: payLinkOf(o), deadline: fmt.format(payDeadline(o, ctx.now)),
    returnRef: [...(o.returns ?? [])].reverse()[0]?.id ?? '', store: ctx.store, status: o.sub?.name[lang] ?? '', delivery: deliveryText(o.extras, o.ref, lang), ...extra,
  };
}

export type MessageStatus = 'sent' | 'failed' | 'skipped';
export type SkipReason = 'noPhone' | 'noEmail' | 'muted';
export interface CustomerMessage {
  id: string; event: NoticeEvent; channel: NoticeChannel; lang: 'ar' | 'en'; to?: string; subject?: string; body: string; at: number;
  status: MessageStatus; reason?: SkipReason; actor: string; role: string;
  /** Resend of an earlier message (its id). */
  retryOf?: string;
}

/** Order state changes the customer hears about, from `before` (undefined for a new order) to `after`. */
export function noticeEvents(before: Order | undefined, after: Order): { event: NoticeEvent; returnRef?: string }[] {
  const out: { event: NoticeEvent; returnRef?: string }[] = [];
  const pv = payView(after);
  if (!before) {
    out.push({ event: pv === 'failed' ? 'payFailed' : 'placed' });
    if (pv === 'paid' && hasDigitalDelivery(after.extras)) out.push({ event: 'digitalDelivered' });
    return out;
  }
  const was = payView(before);
  if (was !== 'paid' && pv === 'paid' && !after.cancelled) out.push({ event: 'paid' });
  // Codes and download links go out once, when the order is first paid (or when codes are given to an already-paid order).
  if (!after.cancelled && pv === 'paid' && hasDigitalDelivery(after.extras) && (was !== 'paid' || !hasDigitalDelivery(before.extras))) out.push({ event: 'digitalDelivered' });
  if (was !== 'failed' && pv === 'failed' && !after.cancelled) out.push({ event: 'payFailed' });
  const labelled = (o: Order) => (o.fulfilments.length ? o.fulfilments.filter((f) => !f.voided).length : o.ship !== 'none' ? 1 : 0);
  if (!after.cancelled && labelled(after) > labelled(before) && after.ship !== 'transit' && after.ship !== 'delivered') out.push({ event: 'ready' });
  const moving = (o: Order) => (o.fulfilments.length ? o.fulfilments.filter((_, i) => ['transit', 'delivered'].includes(parcelShip(o, i))).length : ['transit', 'delivered'].includes(o.ship) ? 1 : 0);
  if (moving(after) > moving(before) && after.ship !== 'delivered') out.push({ event: 'shipped' });
  if (before.ship !== 'delivered' && after.ship === 'delivered') out.push({ event: 'delivered' });
  if (!before.cancelled && after.cancelled) out.push({ event: 'cancelled' });
  const confirmed = (o: Order) => o.refunds.filter((r) => r.status === 'confirmed').length;
  if (confirmed(after) > confirmed(before)) out.push({ event: 'refunded' });
  const stageEvent: Partial<Record<ReturnStage, NoticeEvent>> = { requested: 'returnRequested', approved: 'returnApproved', rejected: 'returnRejected', received: 'returnReceived' };
  for (const r of after.returns ?? []) {
    const prev = before.returns?.find((x) => x.id === r.id);
    const e = stageEvent[r.stage];
    if (e && prev?.stage !== r.stage) out.push({ event: e, returnRef: r.id });
  }
  if (after.sub && after.sub.notify && after.sub.id !== before.sub?.id && !after.cancelled) out.push({ event: 'subStatus' });
  return out;
}

/**
 * One message per enabled channel for an event, in the customer's language. A channel without the customer's
 * address is recorded as skipped; nothing is sent anywhere (simulated).
 */
export function composeNotice(o: Order, event: NoticeEvent, cfg: NoticeConfig, ctx: NoticeCtx, who: Actor, opts: { only?: NoticeChannel[]; muted?: boolean; extra?: NoticeVars; lang?: 'ar' | 'en' } = {}): CustomerMessage[] {
  const lang = opts.lang ?? customerLang(o, cfg);
  const tpl = cfg.templates[event] ?? DEFAULT_TEMPLATES[event];
  const vars = noticeVars(o, ctx, lang, opts.extra);
  const chans = opts.only ?? NOTICE_CHANNELS.filter((c) => cfg.channels[event]?.[c]);
  const base = (o.messages ?? []).length;
  return chans.map((c, i) => {
    const to = c === 'email' ? ctx.contact.email : ctx.contact.phone;
    const status: MessageStatus = opts.muted || !to ? 'skipped' : cfg.simFail === c ? 'failed' : 'sent';
    return {
      id: `MSG-${o.ref}-${base + i + 1}`, event, channel: c, lang, to, at: ctx.now, actor: who.name, role: who.role, status,
      reason: opts.muted ? 'muted' : !to ? (c === 'email' ? 'noEmail' : 'noPhone') : undefined,
      subject: c === 'email' ? renderNotice(tpl.subject[lang], vars) : undefined, body: renderNotice(tpl.body[lang], vars),
    };
  });
}

/** Append messages to an order (ids stay unique per order). */
export const withMessages = (o: Order, msgs: CustomerMessage[]): Order => (msgs.length ? { ...o, messages: [...(o.messages ?? []), ...msgs] } : o);

/**
 * After an orders write: every order whose state changed records the messages its new state sends. Orders in `muted`
 * record them as skipped (the merchant chose not to notify for that action). Returns `after` itself when nothing changed.
 */
export function recordNotices(before: Order[], after: Order[], cfg: NoticeConfig, ctxFor: (o: Order) => NoticeCtx, muted: ReadonlySet<string> = new Set()): Order[] {
  if (before === after) return after;
  const prev = new Map(before.map((o) => [o.ref, o]));
  let changed = false;
  const next = after.map((o) => {
    const b = prev.get(o.ref);
    if (b === o) return o;
    const evs = noticeEvents(b, o);
    if (!evs.length) return o;
    const ctx = ctxFor(o);
    let x = o;
    for (const e of evs) x = withMessages(x, composeNotice(x, e.event, cfg, ctx, SYSTEM, { muted: muted.has(o.ref), extra: e.returnRef ? { returnRef: e.returnRef } : undefined }));
    if (x !== o) changed = true;
    return x;
  });
  return changed ? next : after;
}

/** A message the merchant sends on purpose (payment link, invoice, resend). Logged on the order with who sent it. */
export function sendNotice(o: Order, event: NoticeEvent, cfg: NoticeConfig, ctx: NoticeCtx, who: Actor, opts: { only?: NoticeChannel[]; retryOf?: string } = {}): Order {
  const msgs = composeNotice(o, event, cfg, ctx, who, { only: opts.only }).map((m) => (opts.retryOf ? { ...m, retryOf: opts.retryOf } : m));
  if (!msgs.length) return o;
  const sent = msgs.filter((m) => m.status === 'sent').map((m) => m.channel);
  return act(withMessages(o, msgs), 'customerMessaged', who, ctx.now, { text: `${event}:${sent.join('+') || '-'}` });
}

/** Resend one failed or skipped message on its channel. */
export function resendMessage(o: Order, id: string, cfg: NoticeConfig, ctx: NoticeCtx, who: Actor): Order {
  const m = o.messages?.find((x) => x.id === id);
  if (!m || m.status === 'sent') return o;
  if (m.event === 'caseReply') return caseMessage(o, { channel: m.channel, lang: m.lang, to: m.to, subject: m.subject, body: m.body, fail: cfg.simFail === m.channel, retryOf: m.id }, who, ctx.now);
  return sendNotice(o, m.event, cfg, ctx, who, { only: [m.channel], retryOf: m.id });
}

/** Give an unpaid order more time to pay. Days count from the later of now and the current deadline. */
export function extendPayDue(o: Order, days: number, who: Actor, now: number): Order {
  if (!awaitingPayment(o) || !Number.isInteger(days) || days < 1 || days > 30) return o;
  const due = Math.max(now, payDeadline(o, now)) + days * DAY;
  return act({ ...o, payDue: due }, 'payDueExtended', who, now, { text: String(days) });
}

/* ---------- Voiding labels without cancelling ---------- */

/** Labels that can be voided: issued and not yet with the carrier, on an order that is not cancelled. */
export function voidableLabels(o: Order): string[] {
  if (o.cancelled) return [];
  if (o.fulfilments.some((_, i) => ['transit', 'delivered'].includes(parcelShip(o, i))) || o.ship === 'transit' || o.ship === 'delivered') return [];
  if (!o.fulfilments.length) return o.ship === 'label' ? [shipmentRefOf(o)] : [];
  return o.fulfilments.filter((f, i) => !f.voided && parcelShip(o, i) === 'label').map((f) => f.ref);
}
const shipmentRefOf = (o: Order) => `SIM-${o.ref}-1`;

/**
 * Void every issued label of an order (simulated at the carrier). The order goes back to "to fulfil": its units
 * return to the shelf and, where the order held stock, the hold is restored so they are not sold to someone else.
 */
export function voidLabels(o: Order, who: Actor, now: number): { order: Order; effects: StockEffect[]; refs: string[] } {
  const refs = voidableLabels(o);
  if (!refs.length) return { order: o, effects: [], refs };
  const effects: StockEffect[] = [];
  let items = o.items;
  const back = (loc: LocId, qty: number[]) => {
    items = items.map((it, i) => {
      const q = qty[i] ?? 0;
      if (!q) return it;
      effects.push({ sku: it.sku, loc, reserved: it.reserved ? q : 0, onHand: q });
      return { ...it, ...(it.reserved ? { reserved: { ...it.reserved, [loc]: (it.reserved[loc] ?? 0) + q } } : {}), ...(it.stock ? { stock: { ...it.stock, [loc]: (it.stock[loc] ?? 0) + q } } : {}) };
    });
  };
  let fulfilments = o.fulfilments;
  if (!o.fulfilments.length) back('ryd', o.items.map((it) => it.qty));
  else {
    fulfilments = o.fulfilments.map((f) => {
      if (!refs.includes(f.ref)) return f;
      back(f.loc, f.qty);
      return { ...f, qty: f.qty.map(() => 0), ship: 'none' as Ship, voided: true };
    });
  }
  const anyLeft = fulfilments.some((f) => !f.voided && f.qty.some((q) => q > 0));
  let next: Order = { ...o, items, fulfilments, ship: anyLeft ? o.ship : 'none', ful: anyLeft ? 'partial' : 'none' };
  for (const ref of refs) next = act(next, 'labelVoidedOnly', who, now, { ref });
  return { order: next, effects, refs };
}

/* ---------- Custom sub-statuses (Phase B: operating rules) ---------- */
// A sub-status refines the main state the order is in («بانتظار تأكيد المقاس» under «قيد التجهيز»). It never
// replaces payment, fulfilment or shipment states, so reports and customer messages keep reading the real state.
// When the order leaves that main state the sub-status is cleared and the log says so.

/** The order's main operating state, derived from payment/fulfilment/shipment (never stored). */
export type MainState = 'awaitingPay' | 'processing' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
/** Main states that can carry sub-statuses: the ones where the team still has work to do. */
export const SUB_PARENTS = ['awaitingPay', 'processing', 'ready'] as const;
export type SubParent = (typeof SUB_PARENTS)[number];
export const SUB_TONES = ['brand', 'sky', 'amber', 'green', 'red', 'gray'] as const;
export type SubTone = (typeof SUB_TONES)[number];
export const SUB_MAX_PER_PARENT = 10;
export const SUB_NAME_MAX = 32;

export interface SubStatus {
  id: string; parent: SubParent; name: L; tone: SubTone;
  /** Setting it sends the shared «sub-status update» customer message (Settings → Notifications → Customer messages). */
  notify: boolean;
  /** Counted in reports and the orders view counts. Off = an internal working note only. */
  inReports: boolean;
  /** Archived: kept on orders that carry it, not offered for new orders. */
  archived?: boolean;
  by: string; at: number;
}

export function mainState(o: Order): MainState {
  if (o.cancelled) return 'cancelled';
  const pv = payView(o);
  if (pv === 'bank_due' || pv === 'link' || pv === 'failed' || pv === 'verifying') return 'awaitingPay';
  if (o.ship === 'delivered') return 'delivered';
  if (o.ship === 'transit') return 'shipped';
  if (o.ship === 'label' && o.ful === 'done') return 'ready';
  return 'processing';
}

export function subStatusFixtures(): SubStatus[] {
  const S = (id: string, parent: SubParent, ar: string, en: string, tone: SubTone, notify: boolean, inReports = true): SubStatus =>
    ({ id, parent, name: { ar, en }, tone, notify, inReports, by: 'سارة', at: Date.parse('2026-11-01T09:00:00Z') });
  return [
    S('SS-1', 'processing', 'بانتظار تأكيد المقاس', 'Awaiting size confirmation', 'amber', true),
    S('SS-2', 'processing', 'تغليف هدية', 'Gift wrapping', 'brand', false),
    S('SS-3', 'awaitingPay', 'تواصلنا مع العميل', 'Customer contacted', 'sky', false, false),
    S('SS-4', 'ready', 'بانتظار استلام المندوب', 'Awaiting courier pickup', 'gray', false),
  ];
}

/** Sub-statuses the merchant can pick for an order now: same main state, not archived. */
export const subChoices = (o: Order, subs: SubStatus[]) => { const m = mainState(o); return subs.filter((s) => s.parent === m && !s.archived); };

export type SubError = 'nameAr' | 'nameEn' | 'long' | 'taken' | 'limit' | 'chars';
/** Both names required, at most 32 characters, unique (either language) under the same main state, at most 10 per state. */
export function validateSub(d: Pick<SubStatus, 'parent' | 'name'> & { id?: string }, list: SubStatus[]): Partial<Record<'ar' | 'en' | 'form', SubError>> {
  const e: Partial<Record<'ar' | 'en' | 'form', SubError>> = {};
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const same = list.filter((s) => s.parent === d.parent && s.id !== d.id && !s.archived);
  (['ar', 'en'] as const).forEach((l) => {
    const v = d.name[l].trim();
    if (!v) e[l] = l === 'ar' ? 'nameAr' : 'nameEn';
    else if (v.length > SUB_NAME_MAX) e[l] = 'long';
    else if (v.includes('|')) e[l] = 'chars';
    else if (same.some((s) => norm(s.name.ar) === norm(v) || norm(s.name.en) === norm(v))) e[l] = 'taken';
  });
  if (!d.id && same.length >= SUB_MAX_PER_PARENT) e.form = 'limit';
  return e;
}
export const nextSubId = (list: SubStatus[]) => `SS-${list.reduce((m, s) => Math.max(m, Number(s.id.replace(/\D/g, '')) || 0), 0) + 1}`;
const subText = (n: L) => `${n.ar}|${n.en}`;
/** Read the bilingual name a sub-status activity line recorded. */
export const subTextOf = (text?: string): L => { const [ar = '', en = ''] = (text ?? '').split('|'); return { ar, en: en || ar }; };

export type SubBlock = 'otherState' | 'archived' | 'same';
/** Why a sub-status cannot be set on this order, or null. */
export function subBlock(o: Order, s: SubStatus | null): SubBlock | null {
  if (!s) return o.sub ? null : 'same';
  if (s.archived) return 'archived';
  if (mainState(o) !== s.parent) return 'otherState';
  if (o.sub?.id === s.id) return 'same';
  return null;
}

/**
 * Set (or clear with null) the order's sub-status. Logged with who did it; a rule is the actor when a rule did it.
 * The customer message, when the sub-status notifies, is recorded by the message layer on the same write (recordNotices).
 */
export function setSubStatus(o: Order, s: SubStatus | null, who: Actor, now: number): Order {
  if (subBlock(o, s)) return o;
  if (!s) return act({ ...o, sub: undefined }, 'subStatusCleared', who, now, { text: subText(o.sub!.name) });
  return act({ ...o, sub: { id: s.id, parent: s.parent, name: s.name, notify: s.notify, at: now, by: who.name } }, 'subStatusSet', who, now, { text: subText(s.name) });
}

/** The sub-status to show: only while the order is still in the main state it belongs to. */
export const liveSub = (o: Order) => (o.sub && mainState(o) === o.sub.parent ? o.sub : null);

/** After any orders write: a sub-status whose main state has passed is cleared, with a system line in the log. */
export function clearStaleSubs(orders: Order[], now: number): Order[] {
  let changed = false;
  const next = orders.map((o) => {
    if (!o.sub || mainState(o) === o.sub.parent) return o;
    changed = true;
    return act({ ...o, sub: undefined }, 'subStatusCleared', SYSTEM, now, { text: subText(o.sub.name) });
  });
  return changed ? next : orders;
}

/** Orders carrying each sub-status now (archived included), for the statuses page and report counts. */
export function subCounts(orders: Order[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of orders) { const s = liveSub(o); if (s) out[s.id] = (out[s.id] ?? 0) + 1; }
  return out;
}

/* ---------- Operating rules: when an order is created/paid and matches → assign, tag, sub-status, notify ---------- */

export type RuleTrigger = 'orderCreated' | 'orderPaid';
export const RULE_TRIGGERS: RuleTrigger[] = ['orderCreated', 'orderPaid'];
export type RuleField = 'city' | 'channel' | 'totalMin' | 'totalMax' | 'product' | 'payMethod';
export const RULE_FIELDS: RuleField[] = ['city', 'channel', 'totalMin', 'totalMax', 'product', 'payMethod'];
export const RULE_PAY_METHODS = ['card', 'applepay', 'bnpl', 'cod', 'bank', 'manual'] as const;
export interface RuleCond { field: RuleField; value: string }
export type RuleAction =
  /** One member = always them; two or more = take turns (round-robin), skipping members who are not active. */
  | { kind: 'assign'; members: string[] }
  | { kind: 'tagAdd'; tag: string }
  | { kind: 'tagRemove'; tag: string }
  | { kind: 'subStatus'; id: string }
  | { kind: 'notifyMember'; member: string };
export type RuleActionKind = RuleAction['kind'];
export const RULE_ACTIONS: RuleActionKind[] = ['assign', 'tagAdd', 'tagRemove', 'subStatus', 'notifyMember'];
export const RULE_MAX_TAGS = 10;
export type RuleStatus = 'active' | 'paused' | 'draft';
export interface OpRule {
  id: string; name: L; trigger: RuleTrigger; conds: RuleCond[]; actions: RuleAction[];
  status: RuleStatus; version: number;
  /** The saved version a test run was made on; activation needs testedVersion === version. */
  testedVersion: number | null;
  /** Round-robin cursor: index of the next member to try. */
  rr: number;
  by: string; at: number;
}

export function ruleFixtures(): OpRule[] {
  return [
    { id: 'RL-1', name: { ar: 'طلبات جدة إلى فيصل', en: 'Jeddah orders to Faisal' }, trigger: 'orderPaid', conds: [{ field: 'city', value: 'Jeddah' }], actions: [{ kind: 'assign', members: ['فيصل'] }, { kind: 'tagAdd', tag: 'جدة' }], status: 'active', version: 2, testedVersion: 2, rr: 0, by: 'سارة', at: Date.parse('2026-11-10T09:00:00Z') },
    { id: 'RL-2', name: { ar: 'وسم الطلبات الكبيرة', en: 'Tag large orders' }, trigger: 'orderCreated', conds: [{ field: 'totalMin', value: '500' }], actions: [{ kind: 'tagAdd', tag: 'VIP' }, { kind: 'notifyMember', member: 'سارة' }], status: 'paused', version: 1, testedVersion: 1, rr: 0, by: 'سارة', at: Date.parse('2026-11-12T09:00:00Z') },
  ];
}

export const payMethodOf = (o: Order): (typeof RULE_PAY_METHODS)[number] | undefined =>
  (o.manual ? (o.manual.pay === 'cod' ? 'cod' : 'manual') : o.payment?.method);
const toNum = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim());

export interface RuleCtx {
  members: { name: string; status: string }[];
  subs: SubStatus[];
  /** SKUs of a catalogue product (for the «contains product» condition). */
  skusOf: (productId: string) => string[];
}

/** Does one condition hold for this order? City matches the city at the start of the address, either language. */
export function condHolds(c: RuleCond, o: Order, ctx: Pick<RuleCtx, 'skusOf'>): boolean {
  switch (c.field) {
    case 'city': { const v = c.value.trim().toLowerCase(); return !!v && (o.city.en.toLowerCase().startsWith(v) || o.city.ar.startsWith(c.value.trim()) || (o.address?.city.en ?? '').toLowerCase() === v); }
    case 'channel': return o.channel === c.value;
    case 'totalMin': return total(o) >= toNum(c.value) * 100;
    case 'totalMax': return total(o) <= toNum(c.value) * 100;
    case 'product': { const skus = ctx.skusOf(c.value); return o.items.some((i) => skus.includes(i.sku)); }
    case 'payMethod': return payMethodOf(o) === c.value;
  }
}

export type RuleError = 'name' | 'conds' | 'actions' | 'tooManyTags';
/** Problems that block saving: names, condition values (numbers ≥ 0, picks not empty), actions with their targets. */
export function validateRule(r: OpRule): { errors: Partial<Record<RuleError, true>>; badConds: number[]; badActions: number[] } {
  const errors: Partial<Record<RuleError, true>> = {};
  const badConds: number[] = []; const badActions: number[] = [];
  if (!r.name.ar.trim() || !r.name.en.trim()) errors.name = true;
  r.conds.forEach((c, i) => {
    const num = c.field === 'totalMin' || c.field === 'totalMax';
    if (num ? !(/^[\d٠-٩]+$/.test(c.value.trim()) && toNum(c.value) >= 0) : !c.value.trim()) badConds.push(i);
  });
  if (badConds.length) errors.conds = true;
  r.actions.forEach((a, i) => {
    const bad = a.kind === 'assign' ? !a.members.length : a.kind === 'tagAdd' || a.kind === 'tagRemove' ? !normTag(a.tag) : a.kind === 'subStatus' ? !a.id : !a.member;
    if (bad) badActions.push(i);
  });
  if (!r.actions.length || badActions.length) errors.actions = true;
  if (r.actions.filter((a) => a.kind === 'tagAdd').length > RULE_MAX_TAGS) errors.tooManyTags = true;
  return { errors, badConds, badActions };
}
export const ruleValid = (r: OpRule) => Object.keys(validateRule(r).errors).length === 0;

export type ChangeStatus = 'done' | 'same' | 'skipped' | 'failed';
export interface RuleChange { kind: RuleActionKind; status: ChangeStatus; text: L; why?: L }
export interface RuleResult {
  ref: string; outcome: 'succeeded' | 'failed' | 'skipped'; reason: L; changes: RuleChange[];
  /** Whether a retry could succeed without fixing anything (false: a member is not active, or the order moved on). */
  retryable?: boolean;
  order: Order; rr: number;
}
const L2 = (ar: string, en: string): L => ({ ar, en });

/**
 * Run one rule on one order (pure). The rule is the actor of every change it makes, so the order log names it.
 * Used for live runs, the test run (preview, discard the order) and retries.
 */
export function runRule(r: OpRule, o: Order, ctx: RuleCtx, now: number): RuleResult {
  const failedCond = r.conds.find((c) => !condHolds(c, o, ctx));
  if (failedCond) return { ref: o.ref, outcome: 'skipped', reason: L2('الطلب لا يطابق الشروط', 'The order does not match the conditions'), changes: [], order: o, rr: r.rr };
  if (o.cancelled) return { ref: o.ref, outcome: 'skipped', reason: L2('الطلب ملغى', 'The order is cancelled'), changes: [], order: o, rr: r.rr };
  const who: Actor = { name: r.id, role: 'rule' };
  let x = o; let rr = r.rr;
  const changes: RuleChange[] = [];
  const active = (n: string) => ctx.members.some((m) => m.name === n && m.status === 'active');
  for (const a of r.actions) {
    if (a.kind === 'assign') {
      let pick: string | undefined;
      if (a.members.length === 1) pick = active(a.members[0]) ? a.members[0] : undefined;
      else for (let k = 0; k < a.members.length; k++) { const i = (rr + k) % a.members.length; if (active(a.members[i])) { pick = a.members[i]; rr = i + 1; break; } }
      if (!pick) { changes.push({ kind: 'assign', status: 'failed', text: L2(`إسناد إلى ${a.members.join('، ')}`, `Assign to ${a.members.join(', ')}`), why: L2('لا عضو نشط بين المختارين', 'None of the chosen members is active') }); continue; }
      if (x.assignee === pick) { changes.push({ kind: 'assign', status: 'same', text: L2(`مسند أصلًا إلى ${pick}`, `Already assigned to ${pick}`) }); continue; }
      const from = x.assignee;
      x = assign(x, pick, who, now);
      changes.push({ kind: 'assign', status: 'done', text: from ? L2(`المسؤول: ${from} ← ${pick}`, `Assignee: ${from} → ${pick}`) : L2(`أُسند إلى ${pick}`, `Assigned to ${pick}`) });
    } else if (a.kind === 'tagAdd') {
      const t = normTag(a.tag);
      if ((x.tags ?? []).includes(t)) { changes.push({ kind: 'tagAdd', status: 'same', text: L2(`الوسم «${t}» موجود`, `Tag “${t}” already there`) }); continue; }
      x = addTag(x, t, who, now);
      changes.push({ kind: 'tagAdd', status: 'done', text: L2(`+ وسم «${t}»`, `+ tag “${t}”`) });
    } else if (a.kind === 'tagRemove') {
      const t = normTag(a.tag);
      if (!(x.tags ?? []).includes(t)) { changes.push({ kind: 'tagRemove', status: 'same', text: L2(`لا وسم «${t}»`, `No tag “${t}”`) }); continue; }
      x = removeTag(x, t, who, now);
      changes.push({ kind: 'tagRemove', status: 'done', text: L2(`− وسم «${t}»`, `− tag “${t}”`) });
    } else if (a.kind === 'subStatus') {
      const s = ctx.subs.find((y) => y.id === a.id);
      if (!s) { changes.push({ kind: 'subStatus', status: 'failed', text: L2('حالة فرعية محذوفة', 'Deleted sub-status'), why: L2('عدّل القاعدة واختر حالة موجودة', 'Edit the rule and pick an existing sub-status') }); continue; }
      const b = subBlock(x, s);
      if (b === 'same') { changes.push({ kind: 'subStatus', status: 'same', text: L2(`الحالة الفرعية «${s.name.ar}» مضبوطة`, `Sub-status “${s.name.en}” already set`) }); continue; }
      if (b) { changes.push({ kind: 'subStatus', status: 'skipped', text: L2(`حالة «${s.name.ar}»`, `Sub-status “${s.name.en}”`), why: b === 'archived' ? L2('الحالة مؤرشفة', 'The sub-status is archived') : L2('الطلب ليس في الحالة الرئيسية التي تتبعها', 'The order is not in the main state it belongs to') }); continue; }
      x = setSubStatus(x, s, who, now);
      changes.push({ kind: 'subStatus', status: 'done', text: L2(`الحالة الفرعية ← «${s.name.ar}»${s.notify ? ' (يُبلَّغ العميل)' : ''}`, `Sub-status → “${s.name.en}”${s.notify ? ' (customer notified)' : ''}`) });
    } else {
      if (!active(a.member)) { changes.push({ kind: 'notifyMember', status: 'failed', text: L2(`تنبيه ${a.member}`, `Notify ${a.member}`), why: L2('العضو غير نشط في الفريق', 'The member is not active on the team') }); continue; }
      x = act(x, 'memberNotified', who, now, { text: a.member });
      changes.push({ kind: 'notifyMember', status: 'done', text: L2(`تنبيه داخلي لـ ${a.member}`, `In-app alert to ${a.member}`) });
    }
  }
  const failed = changes.filter((c) => c.status === 'failed');
  const done = changes.filter((c) => c.status === 'done');
  if (failed.length) return { ref: o.ref, outcome: 'failed', reason: L2(`لم يُنفّذ: ${failed.map((c) => c.why!.ar).join('؛ ')}`, `Not done: ${failed.map((c) => c.why!.en).join('; ')}`), changes, retryable: false, order: x, rr };
  if (!done.length) return { ref: o.ref, outcome: 'skipped', reason: L2('لا شيء يتغير: الطلب عليه ما تطلبه القاعدة', 'Nothing to change: the order already has what the rule sets'), changes, order: x, rr };
  return { ref: o.ref, outcome: 'succeeded', reason: L2(`طُبّق ${done.length} تغيير`, `${done.length} change(s) applied`), changes, order: x, rr };
}

/** The events an orders write fires for rules: a new order (and paid, when it arrives paid), or an order that became paid. */
export function ruleEvents(before: Order | undefined, after: Order): RuleTrigger[] {
  if (after.cancelled) return [];
  const paid = (o: Order) => payView(o) === 'paid' || payView(o) === 'cod_collected';
  if (!before) return paid(after) ? ['orderCreated', 'orderPaid'] : ['orderCreated'];
  return !paid(before) && paid(after) ? ['orderPaid'] : [];
}

/**
 * After an orders write: clear sub-statuses whose main state has passed, then run every ACTIVE rule on the orders
 * whose events match, in rule order. Returns the new orders (or `after` itself), the results to log as runs, and the
 * round-robin cursors that moved. Paused and draft rules never run.
 */
export function applyRulesOnWrite(before: Order[], after: Order[], rules: OpRule[], ctx: RuleCtx, now: number): { orders: Order[]; results: (RuleResult & { rule: string; trigger: RuleTrigger })[]; rr: Record<string, number> } {
  const results: (RuleResult & { rule: string; trigger: RuleTrigger })[] = [];
  const rr: Record<string, number> = {};
  if (before === after) return { orders: after, results, rr };
  let orders = clearStaleSubs(after, now);
  const live = rules.filter((r) => r.status === 'active');
  if (!live.length) return { orders, results, rr };
  const prev = new Map(before.map((o) => [o.ref, o]));
  let changed = orders !== after;
  orders = orders.map((o) => {
    const b = prev.get(o.ref);
    if (b === o) return o;
    const evs = ruleEvents(b, o);
    if (!evs.length) return o;
    let x = o;
    for (const r of live) {
      if (!evs.includes(r.trigger)) continue;
      const res = runRule({ ...r, rr: rr[r.id] ?? r.rr }, x, ctx, now);
      if (res.outcome === 'skipped' && !res.changes.length) continue; // not matching: no run logged
      if (res.rr !== (rr[r.id] ?? r.rr)) rr[r.id] = res.rr;
      results.push({ ...res, rule: r.id, trigger: r.trigger });
      if (res.order !== x) { x = res.order; changed = true; }
    }
    return x;
  });
  return { orders: changed ? orders : after, results, rr };
}

/* ---------- Service inbox replies (dashboard/inbox). Additive. ---------- */

/**
 * A reply the merchant wrote in the service inbox, recorded in the order's message log like any other customer
 * message (simulated: nothing is sent). Skipped when the customer has no address on the channel.
 */
export function caseMessage(o: Order, m: { channel: NoticeChannel; lang: 'ar' | 'en'; to?: string; subject?: string; body: string; fail?: boolean; retryOf?: string; caseId?: string }, who: Actor, now: number): Order {
  const status: MessageStatus = !m.to ? 'skipped' : m.fail ? 'failed' : 'sent';
  const msg: CustomerMessage = {
    id: `MSG-${o.ref}-${(o.messages ?? []).length + 1}`, event: 'caseReply', channel: m.channel, lang: m.lang, to: m.to, at: now, actor: who.name, role: who.role, status,
    reason: !m.to ? (m.channel === 'email' ? 'noEmail' : 'noPhone') : undefined, subject: m.channel === 'email' ? m.subject : undefined, body: m.body, retryOf: m.retryOf,
  };
  return act(withMessages(o, [msg]), 'customerMessaged', who, now, { text: `caseReply:${status === 'sent' ? m.channel : '-'}`, ref: m.caseId });
}
