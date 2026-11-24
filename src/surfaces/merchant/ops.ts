// Order operations (group 1): who did what and when, payment as the merchant should read it, cancellation,
// shipped/delivered per parcel, returns with stages and exchange, and the stock effect of each step.
// Pure functions only. Money is integer halalas. Simulated where an external party is involved.
import {
  refundable, refundedQty, shippingRefunded, total,
  type CarrierId, type L, type LocId, type Order, type Refund, type Ship,
} from './domain';

/* ---------- Actors and the activity log ---------- */

export interface Actor { name: string; role: string }
export const SYSTEM: Actor = { name: 'system', role: 'system' };
export const CUSTOMER: Actor = { name: 'customer', role: 'customer' };

export type OpKind =
  | 'manualCreated' | 'confirmUndone' | 'cancelled' | 'cancelRequested' | 'cancelDeclined' | 'labelVoided'
  | 'shipped' | 'delivered' | 'codCollected' | 'noteAdded' | 'messageCopied' | 'invoicePrinted' | 'labelPrinted' | 'exported'
  | 'tagAdded' | 'tagRemoved' | 'assigned' | 'stockReserved' | 'stockReleased' | 'stockShipped'
  | 'returnRequested' | 'returnApproved' | 'returnRejected' | 'returnReceived' | 'returnInspected' | 'returnRefunded'
  | 'exchangeReserved' | 'exchangeShipped' | 'exchangeCollect';

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
export type PayView = 'paid' | 'failed' | 'verifying' | 'cod_due' | 'cod_collected' | 'link' | 'partially_refunded' | 'refunded';

export function payView(o: Order): PayView {
  if (o.pay === 'refunded' || o.pay === 'partially_refunded') return o.pay;
  const cod = o.payment?.method === 'cod' || o.manual?.pay === 'cod';
  if (cod && o.pay !== 'failed') return o.payment?.state === 'cod_collected' || o.ship === 'delivered' ? 'cod_collected' : 'cod_due';
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
