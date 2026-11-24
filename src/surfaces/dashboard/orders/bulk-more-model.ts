// Bulk actions added in Phase A: assign, tags, void labels, payments (payment link, more time to pay, send invoice)
// and cancel. Business rules only (no React), unit-tested. Every rule re-checks eligibility per order at run time,
// so a retry never repeats what already succeeded.
import { CARRIERS, type Order } from '../../merchant/domain';
import {
  addTag, assign, awaitingPayment, cancelBlock, cancelOrder, cancelPlan, extendPayDue, normTag, payView, removeTag, sendNotice, voidLabels, voidableLabels,
  type Actor, type NoticeChannel, type NoticeConfig, type NoticeCtx, type NoticeEvent, type StockEffect,
} from '../../merchant/ops';

export type MoreBulk = 'assign' | 'tagAdd' | 'tagRemove' | 'voidLabels' | 'payLink' | 'extendDue' | 'sendInvoice' | 'cancel';
/** Actions that reach the customer. The list keeps them apart from safe actions and always previews the message. */
export const SEND_ACTIONS: MoreBulk[] = ['payLink', 'extendDue', 'sendInvoice'];
export const isSend = (a: MoreBulk) => SEND_ACTIONS.includes(a);
export const EVENT_OF: Partial<Record<MoreBulk, NoticeEvent>> = { payLink: 'payLink', extendDue: 'payReminder', sendInvoice: 'invoice' };

export type MoreSkip = 'cancelled' | 'same' | 'noTag' | 'hasTag' | 'noLabel' | 'withCarrier' | 'notAwaiting' | 'notPaid' | 'noContact' | 'shipped' | 'refunded' | 'needsRefundRole';

export interface MoreInput {
  member?: string;
  tag?: string;
  days?: number;
  reason?: string;
  channels?: NoticeChannel[];
  /** Send the state-change message to the customer (cancel). */
  notify?: boolean;
}
export interface MoreCtx { canRefund: boolean; contact: (o: Order) => { phone?: string; email?: string } }

const reachable = (o: Order, chans: NoticeChannel[], ctx: MoreCtx) => {
  const c = ctx.contact(o);
  return chans.some((ch) => (ch === 'email' ? !!c.email : !!c.phone));
};

/** Why an order is skipped for an action, or null when it will run. */
export function moreReason(o: Order, a: MoreBulk, input: MoreInput, ctx: MoreCtx): MoreSkip | null {
  switch (a) {
    case 'assign': return (o.assignee ?? '') === (input.member ?? '') ? 'same' : null;
    case 'tagAdd': return (o.tags ?? []).includes(normTag(input.tag ?? '')) ? 'hasTag' : null;
    case 'tagRemove': return (o.tags ?? []).includes(input.tag ?? '') ? null : 'noTag';
    case 'voidLabels':
      if (o.cancelled) return 'cancelled';
      if (voidableLabels(o).length) return null;
      return o.ship === 'transit' || o.ship === 'delivered' || o.fulfilments.some((f) => f.ship === 'transit' || f.ship === 'delivered') ? 'withCarrier' : 'noLabel';
    case 'payLink': case 'extendDue':
      if (o.cancelled) return 'cancelled';
      if (!awaitingPayment(o)) return 'notAwaiting';
      return reachable(o, input.channels ?? [], ctx) ? null : 'noContact';
    case 'sendInvoice': {
      if (o.cancelled) return 'cancelled';
      const pv = payView(o);
      if (pv !== 'paid' && pv !== 'cod_collected' && pv !== 'partially_refunded') return 'notPaid';
      return reachable(o, input.channels ?? [], ctx) ? null : 'noContact';
    }
    case 'cancel': {
      const b = cancelBlock(o);
      if (b === 'already') return 'cancelled';
      if (b) return b;
      return cancelPlan(o).refund > 0 && !ctx.canRefund ? 'needsRefundRole' : null;
    }
  }
}

export interface MoreEligibility { eligible: Order[]; ineligible: number; reasons: Partial<Record<MoreSkip, number>>; samples: Partial<Record<MoreSkip, string[]>> }
export function moreEligibility(orders: Order[], a: MoreBulk, input: MoreInput, ctx: MoreCtx): MoreEligibility {
  const eligible: Order[] = [];
  const reasons: Partial<Record<MoreSkip, number>> = {};
  const samples: Partial<Record<MoreSkip, string[]>> = {};
  for (const o of orders) {
    const r = moreReason(o, a, input, ctx);
    if (!r) { eligible.push(o); continue; }
    reasons[r] = (reasons[r] ?? 0) + 1;
    const l = (samples[r] ??= []);
    if (l.length < 3) l.push(o.ref);
  }
  return { eligible, ineligible: orders.length - eligible.length, reasons, samples };
}

/** What a bulk cancel does in total, before it runs: money back per order, held units released, labels voided. */
export function cancelSummary(orders: Order[]) {
  const rows = orders.map((o) => ({ ref: o.ref, ...cancelPlan(o) }));
  return {
    rows,
    refund: rows.reduce((s, r) => s + r.refund, 0),
    refunds: rows.filter((r) => r.refund > 0).length,
    released: rows.reduce((s, r) => s + r.units, 0),
    restocked: rows.reduce((s, r) => s + r.restock.reduce((a, e) => a + e.onHand, 0), 0),
    labels: rows.reduce((s, r) => s + r.voidLabels.length, 0),
  };
}

/** What voiding labels does in total: labels, units back on the shelf, and the estimated carrier fee returned. */
export function voidSummary(orders: Order[]) {
  const labels = orders.flatMap((o) => voidableLabels(o).map((ref) => ({ o, ref, f: o.fulfilments.find((x) => x.ref === ref) })));
  return {
    labels: labels.length,
    units: labels.reduce((s, l) => s + (l.f ? l.f.qty.reduce((a, b) => a + b, 0) : l.o.items.reduce((a, it) => a + it.qty, 0)), 0),
    fee: labels.reduce((s, l) => s + CARRIERS[l.f?.carrier ?? 'a'].price, 0),
  };
}

export interface MoreRun {
  orders: Order[]; ok: string[]; failed: string[]; skipped: string[];
  effects: { ref: string; effects: StockEffect[] }[];
  /** For undo: the assignee or tags each changed order had before. */
  before: Record<string, { assignee?: string; tags?: string[] }>;
}

/**
 * Run one chunk. Send actions record the messages on each order (simulated); an order where every channel failed
 * counts as failed and can be retried alone. Cancel returns stock effects and leaves refunds pending at the provider.
 */
export function runMore(all: Order[], refs: string[], a: MoreBulk, input: MoreInput, who: Actor, now: number, deps: { cfg: NoticeConfig; ctx: MoreCtx; noticeCtx: (o: Order) => NoticeCtx }): MoreRun {
  const want = new Set(refs);
  const out: MoreRun = { orders: all, ok: [], failed: [], skipped: [], effects: [], before: {} };
  out.orders = all.map((o) => {
    if (!want.has(o.ref)) return o;
    if (moreReason(o, a, input, deps.ctx)) { out.skipped.push(o.ref); return o; }
    out.before[o.ref] = { assignee: o.assignee, tags: o.tags };
    let next = o;
    switch (a) {
      case 'assign': next = assign(o, input.member || undefined, who, now); break;
      case 'tagAdd': next = addTag(o, input.tag ?? '', who, now); break;
      case 'tagRemove': next = removeTag(o, input.tag ?? '', who, now); break;
      case 'voidLabels': { const r = voidLabels(o, who, now); next = r.order; out.effects.push({ ref: o.ref, effects: r.effects }); break; }
      case 'cancel': { const r = cancelOrder(o, input.reason ?? '', who, now); next = r.order; if (r.effects.length) out.effects.push({ ref: o.ref, effects: r.effects }); break; }
      default: {
        const base = a === 'extendDue' ? extendPayDue(o, input.days ?? 0, who, now) : o;
        if (base === o && a === 'extendDue') { out.skipped.push(o.ref); return o; }
        next = sendNotice(base, EVENT_OF[a]!, deps.cfg, deps.noticeCtx(base), who, { only: input.channels });
        const fresh = (next.messages ?? []).slice((o.messages ?? []).length);
        if (!fresh.some((m) => m.status === 'sent')) { out.failed.push(o.ref); return a === 'extendDue' ? o : next; }
      }
    }
    if (next === o) { out.skipped.push(o.ref); return o; }
    out.ok.push(o.ref);
    return next;
  });
  return out;
}

/** Undo assign/tag changes: each order gets back what it had, recorded as new log lines. */
export function undoMore(all: Order[], a: MoreBulk, before: MoreRun['before'], input: MoreInput, who: Actor, now: number): Order[] {
  return all.map((o) => {
    const b = before[o.ref];
    if (!b) return o;
    if (a === 'assign') return assign(o, b.assignee, who, now);
    if (a === 'tagAdd') return removeTag(o, normTag(input.tag ?? ''), who, now);
    if (a === 'tagRemove') return addTag(o, input.tag ?? '', who, now);
    return o;
  });
}
