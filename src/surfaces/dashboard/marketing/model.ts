// Marketing: pure rules for coupons, abandoned-cart recovery and broadcast campaigns. No React.
// Reuses merchant/growth.ts (coupon engine, cart audience, test rates) as the single source of truth;
// adds only what the new screens need: effective status, edit diffs, list filters, send jobs and history.
import { createStore } from '../../../core/store';
import type { L, Order } from '../../merchant/domain';
import {
  TEST_RATE, applyCoupon, applyOffer, couponConflicts, couponFromDraft, offerDiscount, validateCoupon,
  type Cart, type Coupon, type CouponDraft, type CouponError, type MsgChannel, type OfferLine, type SampleOrder,
} from '../../merchant/growth';
import type { Product } from '../../merchant/catalog';
import { customerStats, matchesRules, segmentsOf, type Customer, type SavedSegment } from '../../merchant/workspace';
import { PLANS, entitled, type Plan } from '../../merchant/finance';

/** The fixture clock's "today" (Riyadh), shared with growth.applyCoupon. */
export const TODAY = '2026-11-24';

/* ---------- Coupons ---------- */

/** What the merchant should read in the list: stored status refined by dates and usage. */
export type CouponState = 'active' | 'scheduled' | 'paused' | 'draft' | 'expired' | 'exhausted';
export function couponState(c: Coupon, today = TODAY): CouponState {
  if (c.status === 'expired' || (c.ends !== null && c.ends < today)) return 'expired';
  if (c.status === 'draft') return 'draft';
  if (c.status === 'paused') return 'paused';
  if (c.limitTotal !== null && c.used >= c.limitTotal) return 'exhausted';
  if (c.starts > today) return 'scheduled';
  return 'active';
}

/** Saved views for the coupons list. `live` = accepted at checkout today. */
export type CouponView = 'all' | 'live' | 'scheduled' | 'drafts' | 'ended';
export const COUPON_VIEWS: CouponView[] = ['all', 'live', 'scheduled', 'drafts', 'ended'];
const IN_VIEW: Record<CouponView, (s: CouponState) => boolean> = {
  all: () => true,
  live: (s) => s === 'active',
  scheduled: (s) => s === 'scheduled',
  drafts: (s) => s === 'draft' || s === 'paused',
  ended: (s) => s === 'expired' || s === 'exhausted',
};
export function filterCoupons(list: Coupon[], f: { view: CouponView; q: string; type: string; how?: string }, today = TODAY): Coupon[] {
  const q = f.q.trim().toUpperCase();
  return list.filter((c) => IN_VIEW[f.view](couponState(c, today)) && (!q || c.code.includes(q)) && (!f.type || c.type === f.type)
    && (!f.how || (f.how === 'auto') === !!c.auto));
}

/**
 * Business result of an offer from the order book: paid orders that used it, their revenue (order totals after
 * discount, before refunds) and the discount given. Uses recorded before the order book existed show only in `used`.
 */
export function couponResult(orders: Order[], code: string) {
  const mine = orders.filter((o) => o.coupon === code && o.pay !== 'failed');
  const sub = (o: Order) => o.items.reduce((s, i) => s + i.qty * i.unit, 0);
  return {
    orders: mine.length,
    revenue: mine.reduce((s, o) => s + sub(o) - (o.discount ?? 0) + o.fee, 0),
    discount: mine.reduce((s, o) => s + (o.discount ?? 0), 0),
  };
}
export const couponViewCounts = (list: Coupon[], today = TODAY) =>
  Object.fromEntries(COUPON_VIEWS.map((v) => [v, list.filter((c) => IN_VIEW[v](couponState(c, today))).length])) as Record<CouponView, number>;

/** Share of the total limit used, 0–100, or null when unlimited. */
export const usagePct = (c: Coupon) => (c.limitTotal ? Math.min(100, Math.round((c.used * 100) / c.limitTotal)) : null);

/** Which status changes a coupon offers. Expired and exhausted coupons cannot be reactivated without editing. */
export function couponActions(c: Coupon, today = TODAY): ('activate' | 'pause')[] {
  const s = couponState(c, today);
  if (s === 'active' || s === 'scheduled') return ['pause'];
  if (s === 'draft' || s === 'paused') return ['activate'];
  return [];
}

export const emptyDraft = (today = TODAY, auto = false): CouponDraft => ({
  code: '', type: 'percent', value: '10', minSpend: '', limitTotal: '', limitPerCustomer: auto ? '' : '1', starts: today, ends: '',
  auto, scopeKind: 'all', scopeIds: [], buy: '2', get: '1', getPct: '100',
});
const money = (h: number) => (h / 100).toFixed(2).replace(/\.00$/, '');
export function draftFromCoupon(c: Coupon): CouponDraft {
  return {
    code: c.code, type: c.type, value: c.type === 'percent' ? String(c.value) : c.type === 'fixed' ? money(c.value) : '',
    minSpend: c.minSpend ? money(c.minSpend) : '', limitTotal: c.limitTotal === null ? '' : String(c.limitTotal),
    limitPerCustomer: c.limitPerCustomer === null ? '' : String(c.limitPerCustomer), starts: c.starts, ends: c.ends ?? '',
    auto: !!c.auto, scopeKind: c.scope?.kind ?? 'all', scopeIds: c.scope?.ids ?? [],
    buy: String(c.bogo?.buy ?? 2), get: String(c.bogo?.get ?? 1), getPct: String(c.bogo?.pct ?? 100),
  };
}

/** Validation for create and edit. When editing, the coupon's own code is not "taken". */
export function checkDraft(d: CouponDraft, all: Coupon[], parseMoney: (s: string) => number | null, editing?: string): Record<string, CouponError> {
  return validateCoupon(d, all.map((c) => c.code).filter((c) => c !== editing), parseMoney);
}

/** The coupon a draft would become, keeping usage and status of the coupon being edited. */
export function buildCoupon(d: CouponDraft, parseMoney: (s: string) => number | null, base?: Coupon): Coupon {
  const c = couponFromDraft(d, parseMoney);
  return base ? { ...c, code: base.code, used: base.used, status: base.status } : c;
}

export type CouponField = 'type' | 'value' | 'minSpend' | 'limitTotal' | 'limitPerCustomer' | 'starts' | 'ends' | 'scope' | 'bogo';
/** Fields that differ between the saved coupon and the edited one (shown before saving a live coupon). */
export function couponDiff(a: Coupon, b: Coupon): CouponField[] {
  const f: CouponField[] = ['type', 'value', 'minSpend', 'limitTotal', 'limitPerCustomer', 'starts', 'ends', 'scope', 'bogo'];
  return f.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
}

/** Sample orders for the preview: real catalogue lines, so the preview is concrete. Amounts in halalas. */
export interface Sample extends SampleOrder { id: string; skus: string[]; label: L }
export const SAMPLES: Sample[] = [
  { id: 's1', subtotal: 29000 + 9800, shipping: 2500, customerUses: 0, skus: ['ABY-LIN', 'SHL-SLK-01'], label: { ar: 'عباية وشال · عميلة جديدة', en: 'Abaya and stole · new customer' } },
  { id: 's2', subtotal: 8900, shipping: 2500, customerUses: 0, skus: ['MAT-PRY-01'], label: { ar: 'سجادة صلاة · سلة صغيرة', en: 'Prayer mat · small basket' } },
  { id: 's3', subtotal: 42000 + 12900, shipping: 0, customerUses: 1, skus: ['BAG-LTH-01', 'OUD-100'], label: { ar: 'حقيبة وعطر · استخدم الكود سابقًا', en: 'Bag and perfume · used the code before' } },
  { id: 's4', subtotal: 34500 + 6500 * 2, shipping: 2500, customerUses: 0, skus: ['OUD-ROY-50', 'BKH-MAM-01', 'BKH-MAM-01'], label: { ar: 'عطر عود وبخوران · ثلاث قطع عطور', en: 'Oud perfume and two bakhoor · three fragrance items' } },
];

/** A sample's lines priced from the live catalogue (product price, English category name). Unknown SKUs are left out. */
export function sampleLines(s: Sample, products: Product[]): OfferLine[] {
  const out: OfferLine[] = [];
  for (const sku of s.skus) {
    const p = products.find((x) => x.sku === sku || x.variants.some((v) => v.sku.startsWith(sku)));
    if (!p) continue;
    const l = out.find((x) => x.productId === p.id);
    if (l) l.qty++; else out.push({ productId: p.id, category: p.category.en, qty: 1, unit: p.price });
  }
  return out;
}

/** Effect of an offer (scope, buy X get Y) on a sample basket, treating it as live today. */
export function previewOffer(c: Coupon, s: Sample, products: Product[], today = TODAY) {
  const live: Coupon = { ...c, status: 'active', starts: c.starts > today ? today : c.starts, ends: c.ends && c.ends < today ? today : c.ends };
  return applyOffer(live, sampleLines(s, products), { shipping: s.shipping, customerUses: s.customerUses }, today);
}

/** Categories (English name as id) and their products, for the offer scope picker. */
export function scopeOptions(products: Product[]) {
  const live = products.filter((p) => p.status === 'active');
  const cats: { id: string; name: L; count: number }[] = [];
  for (const p of live) { const c = cats.find((x) => x.id === p.category.en); if (c) c.count++; else cats.push({ id: p.category.en, name: p.category, count: 1 }); }
  return { categories: cats, products: live.map((p) => ({ id: p.id, name: p.name, sku: p.sku })) };
}

/** Effect of a (possibly not yet active) coupon on a sample order, treating it as live today. */
export function previewOn(c: Coupon, s: SampleOrder, today = TODAY) {
  const live: Coupon = { ...c, status: 'active', starts: c.starts > today ? today : c.starts, ends: c.ends && c.ends < today ? today : c.ends };
  return applyCoupon(live, s, today);
}
export { couponConflicts };

/* ---------- Message sends (abandoned carts and broadcasts) ---------- */

/** A simulated send. Nothing leaves the browser: `failsAt` lists recipients the fixture rejects. */
export interface SendJob { queue: string[]; done: number; failed: number; stopped: boolean }
export const newJob = (ids: string[]): SendJob => ({ queue: ids, done: 0, failed: 0, stopped: false });
export const isRunning = (j: SendJob) => !j.stopped && j.done < j.queue.length;
/** Advance one batch. Stopping is final; already handed-off messages are never recalled. */
export function stepJob(j: SendJob, fails: (id: string) => boolean, batch = 4): SendJob {
  if (!isRunning(j)) return j;
  const ids = j.queue.slice(j.done, j.done + batch);
  return { ...j, done: j.done + ids.length, failed: j.failed + ids.filter(fails).length };
}
export const stopJob = (j: SendJob): SendJob => (isRunning(j) ? { ...j, stopped: true } : j);
export function jobResult(j: SendJob) {
  return { handed: j.done - j.failed, failed: j.failed, notSent: j.queue.length - j.done, total: j.queue.length, pct: j.queue.length ? Math.round((j.done * 100) / j.queue.length) : 100 };
}
/** Cost charged only for messages handed to the provider (illustrative test rate). */
export const jobCost = (j: SendJob, ch: MsgChannel) => (j.done - j.failed) * TEST_RATE[ch];

/* ---------- Broadcast audience ---------- */

export type BroadcastAudience = 'all' | 'returning' | 'new' | 'highValue';
export const BROADCAST_AUDIENCES: BroadcastAudience[] = ['all', 'returning', 'new', 'highValue'];
/** Sending to all consenting customers is a Plus feature; targeting a segment needs the segments feature (Pro). */
export const audienceAllowed = (a: BroadcastAudience, plan: Plan) => (a === 'all' ? PLANS.indexOf(plan) >= PLANS.indexOf('plus') : entitled(plan, 'segments'));
export const audienceMinPlan = (a: BroadcastAudience): Plan => (a === 'all' ? 'plus' : 'pro');

export type BroadcastExclusion = 'notInSegment' | 'noConsent' | 'blocked';
/**
 * Who a broadcast reaches. `a` is a built-in audience or a saved segment (`seg:<id>`). Blocked customers and
 * customers without consent on the channel are left out, each with the first reason.
 */
export function broadcastAudience(customers: Customer[], orders: Order[], a: BroadcastAudience | string, ch: MsgChannel, saved: SavedSegment[] = []) {
  const eligible: Customer[] = [];
  const excluded: Record<BroadcastExclusion, number> = { notInSegment: 0, noConsent: 0, blocked: 0 };
  const seg = a.startsWith('seg:') ? saved.find((x) => `seg:${x.id}` === a) : undefined;
  for (const c of customers) {
    const st = customerStats(c, orders);
    const inAud = seg ? matchesRules(c, st, seg.rules) : a === 'all' || segmentsOf(c, st).includes(a as Exclude<BroadcastAudience, 'all'>);
    if (!inAud) { excluded.notInSegment++; continue; }
    if (c.blocked) { excluded.blocked++; continue; }
    if (!c.consent[ch]) { excluded.noConsent++; continue; }
    eligible.push(c);
  }
  return { eligible, excluded, excludedTotal: customers.length - eligible.length };
}
/** Deterministic simulated rejection for broadcast recipients (an invalid address in the fixture). */
export const broadcastFails = (id: string) => id.endsWith('3');

/* ---------- Campaign history ---------- */

export interface CampaignRecord {
  id: string; kind: 'cart' | 'broadcast'; channel: MsgChannel; audience: L; when: L;
  total: number; handed: number; failed: number; notSent: number; stopped: boolean; cost: number; text: string;
  /** Customer ids that received it (handed to the provider), for the customer timeline. */
  recipients?: string[];
  /** Day sent (YYYY-MM-DD, Riyadh) and, for session sends, the exact time. */
  date?: string; at?: number;
  /** Discount code included in the message. */
  coupon?: string;
  /** Orders placed by recipients within the attribution window, their revenue and the discount they used (simulated). */
  result?: { orders: number; revenue: number; discount: number };
  /** Who sent it. */
  by?: string;
}
export const ATTRIBUTION_DAYS = 7;
export const campaignFixtures = (): CampaignRecord[] => [
  { id: 'CMP-204', kind: 'broadcast', channel: 'email', audience: { ar: 'كل العملاء الموافقين', en: 'All consenting customers' }, when: { ar: '12 نوفمبر', en: '12 Nov' }, total: 11, handed: 10, failed: 1, notSent: 0, stopped: false, cost: 20, text: 'New autumn arrivals are in store.',
    recipients: ['C-1001', 'C-1002', 'C-1004', 'C-1005', 'C-1007', 'C-1008', 'C-1010', 'C-1011', 'C-1014', 'C-1016'], date: '2026-11-12', result: { orders: 2, revenue: 61800, discount: 0 }, by: 'المالك' },
  { id: 'CMP-203', kind: 'cart', channel: 'sms', audience: { ar: 'سلال متروكة منذ 24 ساعة', en: 'Carts abandoned 24h+' }, when: { ar: '3 نوفمبر', en: '3 Nov' }, total: 9, handed: 4, failed: 0, notSent: 5, stopped: true, cost: 36, text: 'Left something in your cart?',
    recipients: ['C-1001', 'C-1029', 'C-1057', 'C-1025'], date: '2026-11-03', result: { orders: 1, revenue: 24000, discount: 0 }, by: 'المالك' },
];
/** Revenue per riyal of message cost, or null when nothing was spent or nothing came back yet. */
export const returnOnCost = (c: CampaignRecord) => (c.result && c.cost > 0 ? Math.round((c.result.revenue * 10) / c.cost) / 10 : null);
export const campaignsStore = createStore.key('dashboard.campaignsStore')(campaignFixtures);
export const nextCampaignId = (list: CampaignRecord[]) => `CMP-${Math.max(200, ...list.map((c) => Number(c.id.replace('CMP-', '')) || 0)) + 1}`;
export function recordCampaign(list: CampaignRecord[], r: Omit<CampaignRecord, 'id'>): CampaignRecord[] {
  return [{ ...r, id: nextCampaignId(list) }, ...list];
}
export type CampaignOutcome = 'complete' | 'stopped' | 'withFailures';
export const campaignOutcome = (c: CampaignRecord): CampaignOutcome => (c.stopped ? 'stopped' : c.failed ? 'withFailures' : 'complete');

/** Message length limits: one SMS segment in Arabic is 70 characters; email body kept short. */
export const MESSAGE_MAX: Record<MsgChannel, number> = { sms: 70, email: 600 };
export const messageError = (text: string, ch: MsgChannel): 'empty' | 'long' | null => (!text.trim() ? 'empty' : text.length > MESSAGE_MAX[ch] ? 'long' : null);

/* ---------- Recovery discount and attribution (simulated) ---------- */

/** Optional discount on a cart-recovery message: an existing coupon, or a new one-use code made for this send. */
export type RecoveryDiscount = { kind: 'none' } | { kind: 'existing'; code: string } | { kind: 'new'; code: string; pct: number };
export type RecoveryError = 'code' | 'codeTaken' | 'pct' | 'missing';
export function recoveryError(d: RecoveryDiscount, all: Coupon[]): RecoveryError | null {
  if (d.kind === 'none') return null;
  if (d.kind === 'existing') return all.some((c) => c.code === d.code) ? null : 'missing';
  if (!/^[A-Z0-9]{4,16}$/.test(d.code)) return 'code';
  if (all.some((c) => c.code === d.code)) return 'codeTaken';
  if (!Number.isInteger(d.pct) || d.pct < 1 || d.pct > 50) return 'pct';
  return null;
}
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** The coupon a "new code" recovery discount creates: one use per customer, valid 7 days, limited to the recipients. */
export const recoveryCoupon = (code: string, pct: number, recipients: number, today = TODAY): Coupon => ({
  code, type: 'percent', value: pct, minSpend: 0, limitTotal: Math.max(1, recipients), limitPerCustomer: 1, used: 0, starts: today, ends: addDays(today, ATTRIBUTION_DAYS), status: 'active',
});
/** Discount a coupon would give on one cart's items (0 if it does not apply). */
export function cartDiscount(c: Coupon | undefined, cart: Cart, products: Product[], today = TODAY): number {
  if (!c || !cart.items?.length) return 0;
  const lines: OfferLine[] = cart.items.map((it) => {
    const p = products.find((x) => x.sku === it.sku || x.variants.some((v) => v.sku === it.sku));
    return { productId: p?.id ?? it.sku, category: p?.category.en ?? '', qty: it.qty, unit: it.unit };
  });
  const r = applyOffer({ ...c, status: 'active', starts: c.starts > today ? today : c.starts }, lines, { shipping: 0, customerUses: 0 }, today);
  return r.discount;
}
/** Upper bound of the discount cost if every recipient completes their cart with the code. */
export const maxDiscountCost = (c: Coupon | undefined, carts: Cart[], products: Product[]) => carts.reduce((s, x) => s + cartDiscount(c, x, products), 0);

/**
 * Simulated attribution: which handed-over carts were completed within the window. Deterministic so the demo is
 * stable: every fourth cart (by number) completes; with a discount, every third. Real attribution needs orders
 * linked to the message (click or code) on the server.
 */
export function simulateRecovery(carts: Cart[], handedIds: string[], coupon: Coupon | undefined, products: Product[]) {
  const every = coupon ? 3 : 4;
  const recovered = carts.filter((c) => handedIds.includes(c.id) && !c.purchased && Number(c.id.replace(/\D/g, '')) % every === 0);
  const rows = recovered.map((c) => { const d = cartDiscount(coupon, c, products); return { id: c.id, customerId: c.customerId, revenue: c.value - d, discount: d }; });
  return { rows, orders: rows.length, revenue: rows.reduce((s, r) => s + r.revenue, 0), discount: rows.reduce((s, r) => s + r.discount, 0) };
}
/** Simulated broadcast attribution: one in five recipients orders within the window, at their own average order. */
export function simulateBroadcastResult(recipients: string[], customers: Customer[], orders: Order[]) {
  const buyers = recipients.filter((id) => Number(id.replace(/\D/g, '')) % 5 === 0);
  const revenue = buyers.reduce((s, id) => {
    const c = customers.find((x) => x.id === id);
    const st = c ? customerStats(c, orders) : null;
    return s + (st && st.paidCount ? Math.round(st.spent / st.paidCount) : 25000);
  }, 0);
  return { orders: buyers.length, revenue, discount: 0 };
}
/** Abandoned carts list view: all, still open (not bought), recovered by a message, bought on their own. */
export type CartView = 'open' | 'recovered' | 'purchased' | 'all';
export const CART_VIEWS: CartView[] = ['open', 'recovered', 'purchased', 'all'];
export const cartView = (c: Cart): Exclude<CartView, 'all'> => (c.recovered ? 'recovered' : c.purchased ? 'purchased' : 'open');
export function filterCarts(list: Cart[], f: { view: CartView; q: string }) {
  const q = f.q.trim().toLowerCase();
  return list.filter((c) => (f.view === 'all' || cartView(c) === f.view) && (!q || c.id.toLowerCase().includes(q) || c.customer.ar.includes(q) || c.customer.en.toLowerCase().includes(q)));
}
export const recoveryTotals = (list: Cart[]) => {
  const r = list.filter((c) => c.recovered);
  return { carts: r.length, revenue: r.reduce((s, c) => s + (c.recovered?.revenue ?? 0), 0), discount: r.reduce((s, c) => s + (c.recovered?.discount ?? 0), 0) };
};
export { offerDiscount };
