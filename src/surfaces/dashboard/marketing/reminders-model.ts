// Reminders (`#/dashboard/marketing/reminders`): the multi-step abandoned-cart sequence and reorder reminders.
// Pure rules live in merchant/growth.ts; this file holds the session stores, simulated attribution, the run
// that ties carts, coupons and deliveries together, and the small signal the home work queue can read.
import { createStore } from '../../../core/store';
import type { L, Order } from '../../merchant/domain';
import type { Product } from '../../merchant/catalog';
import {
  CART_MAX_AGE_H, cartConverts, cartSequenceFixture, couponLive, hashOf, reorderCandidates, reorderFixtures, runReorder, runSequence, sequenceForecast, stepStats,
  type Cart, type CartSequence, type Coupon, type Delivery, type ReminderDiscount, type ReminderStep, type ReorderRule, type RunCtx,
} from '../../merchant/growth';
import type { Customer } from '../../merchant/workspace';
import { cartDiscount, TODAY } from './model';
import type { WorkItem } from '../work/model';

/* ---------- Stores (session) ---------- */

export const sequenceStore = createStore.key('dashboard.cartSequence')<CartSequence>(cartSequenceFixture);
/** Unsaved edits of the sequence, kept so leaving the page and coming back restores them. */
export const sequenceDraftStore = createStore.key('dashboard.cartSequenceDraft')<CartSequence | null>(() => null);
export const deliveriesStore = createStore.key('dashboard.reminderDeliveries')<Delivery[]>(() => []);
export const reorderStore = createStore.key('dashboard.reorderRules')<ReorderRule[]>(reorderFixtures);
export const reorderDraftStore = createStore.key('dashboard.reorderDraft')<ReorderRule | null>(() => null);
/** Review-mode simulation switches: SMS provider outage, and forcing quiet hours now. */
export const reminderSimStore = createStore.key('dashboard.reminderSim')<{ smsDown: boolean; quietNow: boolean }>(() => ({ smsDown: false, quietNow: false }));

/** Hour of the day in Riyadh (UTC+3, no daylight saving). */
export const riyadhHour = (now: number) => (new Date(now).getUTCHours() + 3) % 24;
export function runCtx(now = Date.now()): RunCtx {
  const sim = reminderSimStore.get();
  return { now, hour: sim.quietNow ? 23 : riyadhHour(now), smsDown: sim.smsDown, today: TODAY };
}

/* ---------- Editing ---------- */

export const sameSequence = (a: CartSequence, b: CartSequence) => JSON.stringify([a.steps, a.quiet]) === JSON.stringify([b.steps, b.quiet]);
export function newStep(steps: ReminderStep[]): ReminderStep {
  const last = steps[steps.length - 1];
  const id = `st${Math.max(0, ...steps.map((s) => Number(s.id.replace(/\D/g, '')) || 0)) + 1}`;
  return { id, afterHours: Math.min(168, (last?.afterHours ?? 0) * 2 || 1), channel: 'email', on: true, discount: { kind: 'none' }, text: { ar: 'تذكير من {store}: سلتك بانتظارك.', en: 'A reminder from {store}: your cart is waiting.' } };
}
export const discountLabel = (d: ReminderDiscount): L =>
  d.kind === 'none' ? { ar: 'بلا خصم', en: 'No discount' } : d.kind === 'existing' ? { ar: `كوبون ${d.code}`, en: `Coupon ${d.code}` } : { ar: `كود فردي ${d.pct}% · ${d.validDays} أيام`, en: `Single-use ${d.pct}% · ${d.validDays} days` };
export const hoursLabel = (h: number): L => (h < 24 ? { ar: `بعد ${h} ساعة`, en: `After ${h} hour${h > 1 ? 's' : ''}` } : { ar: `بعد ${h / 24} يوم`, en: `After ${h / 24} day${h > 24 ? 's' : ''}` });

/** The coupon a step's discount would use for one cart (a generated code is modelled as a fresh one-use coupon). */
export function stepCoupon(d: ReminderDiscount, coupons: Coupon[]): Coupon | undefined {
  if (d.kind === 'existing') return coupons.find((c) => c.code === d.code);
  if (d.kind === 'generated') return { code: 'PREVIEW', type: 'percent', value: d.pct, minSpend: 0, limitTotal: 1, limitPerCustomer: 1, used: 0, starts: TODAY, ends: null, status: 'active' };
  return undefined;
}
export function forecast(seq: Pick<CartSequence, 'steps'>, carts: Cart[], coupons: Coupon[], products: Product[]) {
  const rows = sequenceForecast(seq, carts, (s, c) => cartDiscount(stepCoupon(s.discount, coupons), c, products));
  return { rows, messages: rows.reduce((s, r) => s + r.messages, 0), cost: rows.reduce((s, r) => s + r.cost, 0), maxDiscount: rows.reduce((s, r) => s + r.maxDiscount, 0) };
}

/* ---------- Running (simulated) ---------- */

/**
 * Simulated purchases after reminders: a customer who received a message may buy (deterministic), at the cart value
 * minus the code's discount. Marks the cart bought and recovered (so the sequence stops), and the code used.
 */
export function attributeCarts(carts: Cart[], deliveries: Delivery[], coupons: Coupon[], products: Product[]) {
  let cs = carts, ds = deliveries, cps = coupons;
  for (const d of deliveries) {
    if (d.source !== 'seq') continue;
    const cart = cs.find((c) => c.id === d.target);
    if (!cart || cart.purchased || !cartConverts(d, !!d.code)) continue;
    const coupon = d.code ? cps.find((c) => c.code === d.code) : undefined;
    const discount = coupon ? cartDiscount(coupon, cart, products) : 0;
    const result = { revenue: cart.value - discount, discount };
    ds = ds.map((x) => (x.id === d.id ? { ...x, result } : x));
    cs = cs.map((c) => (c.id === cart.id ? { ...c, purchased: true, recovered: { campaign: 'SEQ', step: d.step, revenue: result.revenue, discount, coupon: d.code } } : c));
    if (coupon) cps = cps.map((c) => (c.code === coupon.code ? { ...c, used: c.used + 1 } : c));
  }
  return { carts: cs, deliveries: ds, coupons: cps };
}

/** Simulated repeat purchase after a reorder reminder: one in four (one in three with a discount). */
export function attributeReorder(deliveries: Delivery[], source: string, value: (orderRef: string) => number, coupons: Coupon[]) {
  let cps = coupons;
  const ds = deliveries.map((d) => {
    if (d.source !== source || d.status !== 'sent' || d.result || hashOf(`re:${d.id}`) % (d.code ? 3 : 4) !== 0) return d;
    const v = value(d.target);
    const c = d.code ? cps.find((x) => x.code === d.code) : undefined;
    const discount = c && c.type === 'percent' ? Math.floor((v * c.value) / 100) : 0;
    if (c) cps = cps.map((x) => (x.code === c.code ? { ...x, used: x.used + 1 } : x));
    return { ...d, result: { revenue: v - discount, discount } };
  });
  return { deliveries: ds, coupons: cps };
}

export interface CartRun { sent: number; deferred: number; failed: number; skipped: number; recovered: number; codes: number }
/** One pass of the sequence: deliveries, generated codes, simulated purchases. Pure; the caller writes the stores. */
export function passCarts(seq: CartSequence, carts: Cart[], deliveries: Delivery[], coupons: Coupon[], products: Product[], ctx: RunCtx) {
  const r = runSequence(seq, carts, deliveries, coupons, ctx);
  const before = new Map(deliveries.map((d) => [d.id, d]));
  const allCoupons = [...r.coupons, ...coupons];
  const a = attributeCarts(carts, r.deliveries, allCoupons, products);
  const changed = a.deliveries.filter((d) => before.get(d.id)?.status !== d.status || before.get(d.id)?.attempts !== d.attempts);
  // A cart messaged by the sequence is excluded from one-off recovery sends for the same cart.
  const touched = new Set(a.deliveries.filter((d) => d.source === 'seq' && d.status === 'sent').map((d) => d.target));
  const outCarts = a.carts.map((c) => (touched.has(c.id) && !c.contactedByAutomation ? { ...c, contactedByAutomation: true } : c));
  const summary: CartRun = {
    sent: changed.filter((d) => d.status === 'sent').length, deferred: changed.filter((d) => d.status === 'deferred').length,
    failed: changed.filter((d) => d.status === 'failed').length, skipped: changed.filter((d) => d.status === 'skipped' || d.status === 'stopped').length,
    recovered: a.carts.filter((c) => c.recovered?.campaign === 'SEQ').length - carts.filter((c) => c.recovered?.campaign === 'SEQ').length, codes: r.coupons.length,
  };
  return { carts: outCarts, deliveries: a.deliveries, coupons: a.coupons, summary };
}

export function passReorder(rule: ReorderRule, rules: ReorderRule[], orders: Order[], customers: Customer[], products: Product[], deliveries: Delivery[], coupons: Coupon[], quiet: CartSequence['quiet'], ctx: RunCtx) {
  const earlier = rules.slice(0, rules.findIndex((x) => x.id === rule.id));
  const c = reorderCandidates(rule, orders, customers, products, deliveries, earlier);
  const r = runReorder(rule, c.due, deliveries, coupons, quiet, ctx);
  const allCoupons = [...r.coupons, ...coupons];
  const value = (ref: string) => c.due.find((x) => x.orderRef === ref)?.value ?? 0;
  const a = attributeReorder(r.deliveries, rule.id, value, allCoupons);
  const ds = a.deliveries;
  const before = new Map(deliveries.map((d) => [d.id, d]));
  const changed = ds.filter((d) => d.source === rule.id && (before.get(d.id)?.status !== d.status || before.get(d.id)?.attempts !== d.attempts));
  return {
    deliveries: ds, coupons: a.coupons, due: c.due.length,
    summary: { sent: changed.filter((d) => d.status === 'sent').length, deferred: changed.filter((d) => d.status === 'deferred').length, failed: changed.filter((d) => d.status === 'failed').length, codes: r.coupons.length },
  };
}

/* ---------- Results ---------- */

export const sequenceStats = (seq: CartSequence, deliveries: Delivery[]) => seq.steps.map((s) => ({ step: s, stats: stepStats(deliveries, 'seq', s.id) }));
export const ruleStats = (r: ReorderRule, deliveries: Delivery[]) => stepStats(deliveries, r.id, r.id);
export const openCartsForSequence = (carts: Cart[]) => carts.filter((c) => !c.purchased && !c.optedOut && c.hoursAgo <= CART_MAX_AGE_H).length;

/* ---------- Problems and the home work-queue signal ---------- */

export type ReminderProblem =
  | { kind: 'failing'; source: string; step: string; count: number; reason: 'provider' | 'coupon' }
  | { kind: 'couponDead'; source: string; step: string; code: string };

/**
 * What needs the merchant: a step failing for a reason they can act on (provider down, coupon not working) and active
 * steps whose coupon stopped working. Single addresses the provider rejected are shown on the page, not raised here.
 */
export function reminderProblems(seq: CartSequence, rules: ReorderRule[], deliveries: Delivery[], coupons: Coupon[], today = TODAY): ReminderProblem[] {
  const out: ReminderProblem[] = [];
  const sources: { source: string; step: string; discount: ReminderDiscount; active: boolean }[] = [
    ...seq.steps.filter((s) => s.on).map((s) => ({ source: 'seq', step: s.id, discount: s.discount, active: seq.status === 'active' })),
    ...rules.map((r) => ({ source: r.id, step: r.id, discount: r.discount, active: r.status === 'active' })),
  ];
  for (const s of sources) {
    const failed = deliveries.filter((d) => d.source === s.source && d.step === s.step && d.status === 'failed' && d.reason !== 'rejected');
    if (failed.length) {
      const reasons = (['coupon', 'provider'] as const).map((r) => [r, failed.filter((d) => d.reason === r).length] as const).sort((a, b) => b[1] - a[1]);
      out.push({ kind: 'failing', source: s.source, step: s.step, count: failed.length, reason: reasons[0][0] });
    } else if (s.active && s.discount.kind === 'existing' && !couponLive(coupons.find((c) => c.code === (s.discount as { code: string }).code), today)) {
      out.push({ kind: 'couponDead', source: s.source, step: s.step, code: s.discount.code });
    }
  }
  return out;
}

/**
 * Work-queue items for the home (`#/dashboard`): one per reminder step that needs the merchant, empty when all is
 * well. Shaped like `work/model.ts` WorkItem (kind `automation`), opening the reminders page on the right part.
 * Read-only: the home decides whether and where to show them.
 */
export function reminderWorkItems(i: { seq: CartSequence; rules: ReorderRule[]; deliveries: Delivery[]; coupons: Coupon[] }): WorkItem[] {
  return reminderProblems(i.seq, i.rules, i.deliveries, i.coupons).map((p) => {
    const isSeq = p.source === 'seq';
    const idx = i.seq.steps.findIndex((s) => s.id === p.step) + 1;
    const subject: L = isSeq ? { ar: `تذكير السلة ${idx}`, en: `Cart reminder ${idx}` } : { ar: `تذكير إعادة الشراء ${p.source}`, en: `Reorder reminder ${p.source}` };
    const facts: WorkItem['facts'] = p.kind === 'failing'
      ? { failed: p.count, reasonAr: { coupon: 'الكوبون لا يعمل', provider: 'مزوّد الرسائل لا يستجيب' }[p.reason], reasonEn: { coupon: 'The coupon does not work', provider: 'The message provider is not responding' }[p.reason] }
      : { failed: 0, reasonAr: `الكوبون ${p.code} لم يعد يعمل`, reasonEn: `Coupon ${p.code} no longer works` };
    return {
      id: `reminder-${p.source}-${p.step}`, kind: 'automation', severity: 2, money: 0, moneyKind: 'none',
      orders: 0, customers: p.kind === 'failing' ? p.count : 0, skus: [], oldestHours: null, subject, facts,
      action: { section: 'marketing', path: 'reminders', query: (isSeq ? { step: p.step } : { r: 'reorder', rule: p.source }) as Record<string, string> },
      page: 'marketing', need: ['marketing.send'], fingerprint: `${p.kind}:${p.source}:${p.step}:${p.kind === 'failing' ? p.count : p.code}`,
    } satisfies WorkItem;
  });
}
/** Convenience for the home: reads the current session stores. */
export const reminderSignals = (coupons: Coupon[]) => reminderWorkItems({ seq: sequenceStore.get(), rules: reorderStore.get(), deliveries: deliveriesStore.get(), coupons });
