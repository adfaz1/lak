// Marketing: pure rules for coupons, abandoned-cart recovery and broadcast campaigns. No React.
// Reuses merchant/growth.ts (coupon engine, cart audience, test rates) as the single source of truth;
// adds only what the new screens need: effective status, edit diffs, list filters, send jobs and history.
import { createStore } from '../../../core/store';
import type { L, Order } from '../../merchant/domain';
import {
  TEST_RATE, applyCoupon, couponConflicts, couponFromDraft, validateCoupon,
  type Coupon, type CouponDraft, type CouponError, type MsgChannel, type SampleOrder,
} from '../../merchant/growth';
import { customerStats, segmentsOf, type Customer } from '../../merchant/workspace';
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
export function filterCoupons(list: Coupon[], f: { view: CouponView; q: string; type: string }, today = TODAY): Coupon[] {
  const q = f.q.trim().toUpperCase();
  return list.filter((c) => IN_VIEW[f.view](couponState(c, today)) && (!q || c.code.includes(q)) && (!f.type || c.type === f.type));
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

export const emptyDraft = (today = TODAY): CouponDraft => ({ code: '', type: 'percent', value: '10', minSpend: '', limitTotal: '', limitPerCustomer: '1', starts: today, ends: '' });
const money = (h: number) => (h / 100).toFixed(2).replace(/\.00$/, '');
export function draftFromCoupon(c: Coupon): CouponDraft {
  return {
    code: c.code, type: c.type, value: c.type === 'percent' ? String(c.value) : c.type === 'fixed' ? money(c.value) : '',
    minSpend: c.minSpend ? money(c.minSpend) : '', limitTotal: c.limitTotal === null ? '' : String(c.limitTotal),
    limitPerCustomer: c.limitPerCustomer === null ? '' : String(c.limitPerCustomer), starts: c.starts, ends: c.ends ?? '',
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

export type CouponField = 'type' | 'value' | 'minSpend' | 'limitTotal' | 'limitPerCustomer' | 'starts' | 'ends';
/** Fields that differ between the saved coupon and the edited one (shown before saving a live coupon). */
export function couponDiff(a: Coupon, b: Coupon): CouponField[] {
  const f: CouponField[] = ['type', 'value', 'minSpend', 'limitTotal', 'limitPerCustomer', 'starts', 'ends'];
  return f.filter((k) => a[k] !== b[k]);
}

/** Sample orders for the preview: real catalogue lines, so the preview is concrete. Amounts in halalas. */
export interface Sample extends SampleOrder { id: string; skus: string[]; label: L }
export const SAMPLES: Sample[] = [
  { id: 's1', subtotal: 29000 + 9800, shipping: 2500, customerUses: 0, skus: ['ABY-LIN', 'SHL-SLK-01'], label: { ar: 'عباية وشال · عميلة جديدة', en: 'Abaya and stole · new customer' } },
  { id: 's2', subtotal: 8900, shipping: 2500, customerUses: 0, skus: ['MAT-PRY-01'], label: { ar: 'سجادة صلاة · سلة صغيرة', en: 'Prayer mat · small basket' } },
  { id: 's3', subtotal: 42000 + 12900, shipping: 0, customerUses: 1, skus: ['BAG-LTH-01', 'OUD-100'], label: { ar: 'حقيبة وعطر · استخدم الكود سابقًا', en: 'Bag and perfume · used the code before' } },
];

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

export type BroadcastExclusion = 'notInSegment' | 'noConsent';
export function broadcastAudience(customers: Customer[], orders: Order[], a: BroadcastAudience, ch: MsgChannel) {
  const eligible: Customer[] = [];
  const excluded: Record<BroadcastExclusion, number> = { notInSegment: 0, noConsent: 0 };
  for (const c of customers) {
    const segs = segmentsOf(c, customerStats(c, orders));
    if (a !== 'all' && !segs.includes(a)) { excluded.notInSegment++; continue; }
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
}
export const campaignFixtures = (): CampaignRecord[] => [
  { id: 'CMP-204', kind: 'broadcast', channel: 'email', audience: { ar: 'كل العملاء الموافقين', en: 'All consenting customers' }, when: { ar: '12 نوفمبر', en: '12 Nov' }, total: 11, handed: 10, failed: 1, notSent: 0, stopped: false, cost: 20, text: 'New autumn arrivals are in store.' },
  { id: 'CMP-203', kind: 'cart', channel: 'sms', audience: { ar: 'سلال متروكة منذ 24 ساعة', en: 'Carts abandoned 24h+' }, when: { ar: '3 نوفمبر', en: '3 Nov' }, total: 9, handed: 4, failed: 0, notSent: 5, stopped: true, cost: 36, text: 'Left something in your cart?' },
];
export const campaignsStore = createStore.key('dashboard.campaignsStore')(campaignFixtures);
export function recordCampaign(list: CampaignRecord[], r: Omit<CampaignRecord, 'id'>): CampaignRecord[] {
  const n = Math.max(200, ...list.map((c) => Number(c.id.replace('CMP-', '')) || 0)) + 1;
  return [{ ...r, id: `CMP-${n}` }, ...list];
}
export type CampaignOutcome = 'complete' | 'stopped' | 'withFailures';
export const campaignOutcome = (c: CampaignRecord): CampaignOutcome => (c.stopped ? 'stopped' : c.failed ? 'withFailures' : 'complete');

/** Message length limits: one SMS segment in Arabic is 70 characters; email body kept short. */
export const MESSAGE_MAX: Record<MsgChannel, number> = { sms: 70, email: 600 };
export const messageError = (text: string, ch: MsgChannel): 'empty' | 'long' | null => (!text.trim() ? 'empty' : text.length > MESSAGE_MAX[ch] ? 'long' : null);
