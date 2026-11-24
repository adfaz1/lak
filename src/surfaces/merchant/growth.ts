// Growth domain: coupons, abandoned-cart audience, automations dry-run, and analytics series.
// Deterministic fixtures; nothing is sent or charged.
import { people, seeded, type Channel, type L } from './domain';

/* ---------- Coupons ---------- */

export type CouponType = 'percent' | 'fixed' | 'freeShip';
export type CouponStatus = 'active' | 'paused' | 'draft' | 'expired';
export interface Coupon {
  code: string; type: CouponType;
  /** Percent (1–90) for percent coupons, halalas for fixed. Ignored for free shipping. */
  value: number;
  minSpend: number; limitTotal: number | null; limitPerCustomer: number | null; used: number;
  starts: string; ends: string | null; status: CouponStatus;
}

export function couponFixtures(): Coupon[] {
  return [
    { code: 'WELCOME10', type: 'percent', value: 10, minSpend: 10000, limitTotal: null, limitPerCustomer: 1, used: 214, starts: '2026-09-01', ends: null, status: 'active' },
    { code: 'SHIPFREE', type: 'freeShip', value: 0, minSpend: 30000, limitTotal: 500, limitPerCustomer: null, used: 118, starts: '2026-11-01', ends: '2026-11-30', status: 'active' },
    { code: 'NOV50', type: 'fixed', value: 5000, minSpend: 40000, limitTotal: 200, limitPerCustomer: 1, used: 200, starts: '2026-11-01', ends: '2026-11-30', status: 'active' },
    { code: 'RAMADAN15', type: 'percent', value: 15, minSpend: 0, limitTotal: 1000, limitPerCustomer: 2, used: 0, starts: '2027-02-15', ends: '2027-03-20', status: 'draft' },
  ];
}

export interface CouponDraft { code: string; type: CouponType; value: string; minSpend: string; limitTotal: string; limitPerCustomer: string; starts: string; ends: string }
export type CouponError = 'code' | 'codeTaken' | 'value' | 'percent' | 'money' | 'limit' | 'dates';

export function validateCoupon(d: CouponDraft, taken: string[], parseMoney: (s: string) => number | null): Record<string, CouponError> {
  const e: Record<string, CouponError> = {};
  if (!/^[A-Z0-9]{4,16}$/.test(d.code)) e.code = 'code';
  else if (taken.includes(d.code)) e.code = 'codeTaken';
  if (d.type === 'percent') { const v = Number(d.value); if (!Number.isInteger(v) || v < 1 || v > 90) e.value = 'percent'; }
  if (d.type === 'fixed') { const v = parseMoney(d.value); if (v === null || v === 0) e.value = 'money'; }
  if (d.minSpend.trim() && parseMoney(d.minSpend) === null) e.minSpend = 'money';
  for (const k of ['limitTotal', 'limitPerCustomer'] as const) {
    if (d[k].trim()) { const v = Number(d[k]); if (!Number.isInteger(v) || v < 1) e[k] = 'limit'; }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.starts) || (d.ends && (!/^\d{4}-\d{2}-\d{2}$/.test(d.ends) || d.ends < d.starts))) e.dates = 'dates';
  return e;
}

export function couponFromDraft(d: CouponDraft, parseMoney: (s: string) => number | null): Coupon {
  return {
    code: d.code, type: d.type, value: d.type === 'percent' ? Number(d.value) : d.type === 'fixed' ? parseMoney(d.value) ?? 0 : 0,
    minSpend: d.minSpend.trim() ? parseMoney(d.minSpend) ?? 0 : 0, limitTotal: d.limitTotal.trim() ? Number(d.limitTotal) : null,
    limitPerCustomer: d.limitPerCustomer.trim() ? Number(d.limitPerCustomer) : null, used: 0, starts: d.starts, ends: d.ends || null, status: 'draft',
  };
}

const overlaps = (a: Coupon, b: Coupon) => a.starts <= (b.ends ?? '9999') && b.starts <= (a.ends ?? '9999');
/** One code applies per order. Coupons of the same kind that run at the same time compete for the same orders. */
export function couponConflicts(c: Coupon, all: Coupon[]): Coupon[] {
  return all.filter((o) => o.code !== c.code && (o.status === 'active' || o.status === 'draft') && o.type === c.type && overlaps(c, o));
}

export interface SampleOrder { subtotal: number; shipping: number; customerUses: number }
export type CouponBlock = 'inactive' | 'minSpend' | 'limit' | 'perCustomer';
export function applyCoupon(c: Coupon, s: SampleOrder, today = '2026-11-24') {
  let block: CouponBlock | null = null;
  if (c.status === 'paused' || c.status === 'expired' || today < c.starts || (c.ends && today > c.ends)) block = 'inactive';
  else if (s.subtotal < c.minSpend) block = 'minSpend';
  else if (c.limitTotal !== null && c.used >= c.limitTotal) block = 'limit';
  else if (c.limitPerCustomer !== null && s.customerUses >= c.limitPerCustomer) block = 'perCustomer';
  const discount = block ? 0 : c.type === 'percent' ? Math.floor((s.subtotal * c.value) / 100) : c.type === 'fixed' ? Math.min(c.value, s.subtotal) : 0;
  const shippingOff = block || c.type !== 'freeShip' ? 0 : s.shipping;
  return { block, discount, shippingOff, total: s.subtotal - discount + s.shipping - shippingOff, before: s.subtotal + s.shipping };
}

/* ---------- Abandoned carts ---------- */

export interface Cart { id: string; customer: L; value: number; hoursAgo: number; emailConsent: boolean; smsConsent: boolean; purchased: boolean; optedOut: boolean; contactedByAutomation: boolean }
export function cartFixtures(): Cart[] {
  const ppl = people();
  const r = seeded(7);
  return Array.from({ length: 48 }, (_, i) => ({
    id: `CRT-${3100 + i}`, customer: ppl[(i * 7) % ppl.length].name, value: 5000 + Math.floor(r() * 60) * 1000, hoursAgo: 1 + Math.floor(r() * 96),
    emailConsent: r() < 0.7, smsConsent: r() < 0.45, purchased: r() < 0.12, optedOut: r() < 0.06, contactedByAutomation: r() < 0.15,
  }));
}
export type MsgChannel = 'email' | 'sms';
export type Exclusion = 'purchased' | 'optedOut' | 'tooRecent' | 'automation' | 'noConsent';
export const EXCLUSIONS: Exclusion[] = ['purchased', 'optedOut', 'tooRecent', 'automation', 'noConsent'];
export function exclusionOf(c: Cart, ch: MsgChannel, minHours: number): Exclusion | null {
  if (c.purchased) return 'purchased';
  if (c.optedOut) return 'optedOut';
  if (c.hoursAgo < minHours) return 'tooRecent';
  if (c.contactedByAutomation) return 'automation';
  if (ch === 'email' ? !c.emailConsent : !c.smsConsent) return 'noConsent';
  return null;
}
export function audience(carts: Cart[], ch: MsgChannel, minHours: number) {
  const excluded: Record<Exclusion, number> = { purchased: 0, optedOut: 0, tooRecent: 0, automation: 0, noConsent: 0 };
  const eligible: Cart[] = [];
  for (const c of carts) { const x = exclusionOf(c, ch, minHours); if (x) excluded[x]++; else eligible.push(c); }
  return { eligible, excluded, excludedTotal: carts.length - eligible.length };
}
/** Illustrative test rate per message in halalas, to be replaced by the provider's quoted rate. */
export const TEST_RATE: Record<MsgChannel, number> = { email: 2, sms: 9 };
export const estimateCost = (n: number, ch: MsgChannel) => n * TEST_RATE[ch];
/** Deterministic simulated delivery failure. */
export const simSendFails = (c: Cart) => c.id.endsWith('7');

/* ---------- Automations ---------- */

export type Trigger = 'cartAbandoned' | 'lowStock' | 'orderLate';
export type CondField = 'cartValue' | 'stockBelow' | 'hoursLate' | 'channel';
export interface Condition { field: CondField; value: string }
export type ActionKind = 'sendEmail' | 'sendSms' | 'createTask' | 'notifyStaff';
export type AutoStatus = 'active' | 'paused' | 'draft';
export interface Automation {
  id: string; name: L; trigger: Trigger; conditions: Condition[]; waitHours: number; actions: ActionKind[];
  status: AutoStatus; version: number; dryRunVersion: number | null; owner: L;
}
export const TRIGGER_FIELDS: Record<Trigger, CondField[]> = { cartAbandoned: ['cartValue', 'channel'], lowStock: ['stockBelow'], orderLate: ['hoursLate', 'channel'] };
export const TRIGGER_ACTIONS: Record<Trigger, ActionKind[]> = { cartAbandoned: ['sendEmail', 'sendSms'], lowStock: ['createTask', 'notifyStaff'], orderLate: ['notifyStaff', 'createTask'] };

export const TEMPLATES: Automation[] = [
  { id: 'tpl-cart', name: { ar: 'تذكير بالسلة المتروكة', en: 'Abandoned cart reminder' }, trigger: 'cartAbandoned', conditions: [{ field: 'cartValue', value: '100' }], waitHours: 4, actions: ['sendEmail'], status: 'draft', version: 1, dryRunVersion: null, owner: { ar: 'المالك', en: 'Owner' } },
  { id: 'tpl-stock', name: { ar: 'مخزون منخفض ينشئ مهمة', en: 'Low stock creates a task' }, trigger: 'lowStock', conditions: [{ field: 'stockBelow', value: '3' }], waitHours: 0, actions: ['createTask'], status: 'draft', version: 1, dryRunVersion: null, owner: { ar: 'المالك', en: 'Owner' } },
  { id: 'tpl-late', name: { ar: 'طلب متأخر ينبّه الموظف', en: 'Late order alerts staff' }, trigger: 'orderLate', conditions: [{ field: 'hoursLate', value: '24' }], waitHours: 0, actions: ['notifyStaff'], status: 'draft', version: 1, dryRunVersion: null, owner: { ar: 'المالك', en: 'Owner' } },
];

export function automationFixtures(): Automation[] {
  return [
    { ...TEMPLATES[0], id: 'AU-11', status: 'active', version: 3, dryRunVersion: 3, conditions: [{ field: 'cartValue', value: '150' }] },
    { ...TEMPLATES[1], id: 'AU-12', status: 'paused', version: 1, dryRunVersion: 1 },
  ];
}

export interface SampleEvent { id: string; trigger: Trigger; label: L; cartValue?: number; consent?: boolean; stock?: number; hoursLate?: number; channel?: Channel; alreadyMessaged?: boolean }
export const SAMPLE_EVENTS: SampleEvent[] = [
  { id: 'E1', trigger: 'cartAbandoned', label: { ar: 'سلة بقيمة 420 ر.س، عميلة موافقة على البريد', en: 'SAR 420 cart, customer consented to email' }, cartValue: 42000, consent: true, channel: 'online' },
  { id: 'E2', trigger: 'cartAbandoned', label: { ar: 'سلة بقيمة 90 ر.س', en: 'SAR 90 cart' }, cartValue: 9000, consent: true, channel: 'online' },
  { id: 'E3', trigger: 'cartAbandoned', label: { ar: 'سلة بقيمة 610 ر.س، بلا موافقة تواصل', en: 'SAR 610 cart, no marketing consent' }, cartValue: 61000, consent: false, channel: 'app' },
  { id: 'E4', trigger: 'cartAbandoned', label: { ar: 'سلة بقيمة 300 ر.س، وصلتها رسالة من حملة يدوية اليوم', en: 'SAR 300 cart, already messaged by a manual campaign today' }, cartValue: 30000, consent: true, alreadyMessaged: true, channel: 'online' },
  { id: 'E5', trigger: 'lowStock', label: { ar: 'عطر عود: متاح 3 في الرياض', en: 'Oud perfume: 3 available in Riyadh' }, stock: 3 },
  { id: 'E6', trigger: 'lowStock', label: { ar: 'شال حرير: متاح 8 في جدة', en: 'Silk shawl: 8 available in Jeddah' }, stock: 8 },
  { id: 'E7', trigger: 'orderLate', label: { ar: 'طلب مدفوع لم يُجهّز منذ 30 ساعة', en: 'Paid order unfulfilled for 30 hours' }, hoursLate: 30, channel: 'online' },
  { id: 'E8', trigger: 'orderLate', label: { ar: 'طلب مدفوع لم يُجهّز منذ 6 ساعات', en: 'Paid order unfulfilled for 6 hours' }, hoursLate: 6, channel: 'market' },
];

export type SkipReason = 'condition' | 'noConsent' | 'dedup';
function meets(c: Condition, e: SampleEvent): boolean {
  const n = Number(c.value);
  switch (c.field) {
    case 'cartValue': return (e.cartValue ?? 0) >= n * 100;
    case 'stockBelow': return (e.stock ?? Infinity) <= n;
    case 'hoursLate': return (e.hoursLate ?? 0) >= n;
    case 'channel': return !c.value || e.channel === c.value;
  }
}
/** Evaluate the automation against safe sample events. No side effects: it only reports what would happen. */
export function dryRun(a: Automation, events: SampleEvent[] = SAMPLE_EVENTS) {
  const messaging = a.actions.some((x) => x === 'sendEmail' || x === 'sendSms');
  return events.filter((e) => e.trigger === a.trigger).map((e) => {
    let skip: SkipReason | null = null;
    const failed = a.conditions.find((c) => !meets(c, e));
    if (failed) skip = 'condition';
    else if (messaging && !e.consent) skip = 'noConsent';
    else if (messaging && e.alreadyMessaged) skip = 'dedup';
    return { event: e, skip, failed: failed ?? null };
  });
}
export const canActivate = (a: Automation) => a.actions.length > 0 && a.dryRunVersion === a.version;

export type RunOutcome = 'succeeded' | 'failed' | 'skipped';
export interface Run { id: string; automation: string; when: L; subject: L; outcome: RunOutcome; reason: L }
export function runFixtures(): Run[] {
  const R = (id: string, a: string, wAr: string, wEn: string, sAr: string, sEn: string, o: RunOutcome, rAr: string, rEn: string): Run =>
    ({ id, automation: a, when: { ar: wAr, en: wEn }, subject: { ar: sAr, en: sEn }, outcome: o, reason: { ar: rAr, en: rEn } });
  return [
    R('RUN-901', 'AU-11', 'اليوم 09:40', 'Today 09:40', 'سلة CRT-3104', 'Cart CRT-3104', 'succeeded', 'سُلّم البريد إلى مزود الإرسال (محاكاة)', 'Email handed to the sending provider (simulated)'),
    R('RUN-900', 'AU-11', 'اليوم 08:15', 'Today 08:15', 'سلة CRT-3111', 'Cart CRT-3111', 'skipped', 'العميل اشترى قبل انتهاء الانتظار', 'Customer purchased before the wait ended'),
    R('RUN-899', 'AU-11', 'أمس 22:05', 'Yesterday 22:05', 'سلة CRT-3120', 'Cart CRT-3120', 'skipped', 'لا موافقة على التواصل بالبريد', 'No email marketing consent'),
    R('RUN-898', 'AU-11', 'أمس 19:30', 'Yesterday 19:30', 'سلة CRT-3127', 'Cart CRT-3127', 'failed', 'رفض المزود العنوان: بريد غير صالح. لن يُعاد تلقائيًا', 'Provider rejected the address: invalid email. Not retried automatically'),
    R('RUN-897', 'AU-11', 'أمس 16:00', 'Yesterday 16:00', 'سلة CRT-3102', 'Cart CRT-3102', 'skipped', 'وصلته رسالة للسلة نفسها من مسار آخر (منع التكرار)', 'Already messaged for this cart by another flow (deduplicated)'),
    R('RUN-896', 'AU-12', 'قبل 3 أيام', '3 days ago', 'عطر عود · الرياض', 'Oud perfume · Riyadh', 'succeeded', 'أُنشئت مهمة إعادة طلب للمخزون', 'Restock task created'),
  ];
}

/* ---------- Analytics ---------- */

export interface DayStat { date: string; orders: number; net: number; sessions: number | null }
/** 56 complete days ending yesterday (2026-11-23, Riyadh time). Today is excluded because it is incomplete. */
export function analyticsSeries(): DayStat[] {
  const r = seeded(11);
  const out: DayStat[] = [];
  const end = Date.UTC(2026, 10, 23);
  for (let i = 55; i >= 0; i--) {
    const d = new Date(end - i * 86400000);
    const date = d.toISOString().slice(0, 10);
    const weekend = d.getUTCDay() === 5;
    const orders = date === '2026-11-02' ? 0 : Math.round(14 + r() * 12 + (weekend ? 6 : 0) + (i < 28 ? 0 : -2));
    const net = orders * (21000 + Math.floor(r() * 8000));
    const missing = i === 1 || i === 2 || i === 4 || i === 5 || i === 6 || i === 40;
    out.push({ date, orders, net, sessions: missing ? null : Math.round(orders * (55 + r() * 25)) });
  }
  return out;
}

export function summarize(days: DayStat[]) {
  const orders = days.reduce((s, d) => s + d.orders, 0);
  const net = days.reduce((s, d) => s + d.net, 0);
  const known = days.filter((d) => d.sessions !== null);
  const sessions = known.reduce((s, d) => s + (d.sessions ?? 0), 0);
  const knownOrders = known.reduce((s, d) => s + d.orders, 0);
  return {
    orders, net, aov: orders ? Math.round(net / orders) : null,
    /** Conversion is computed only on days with session data; null when there is none (not 0%). */
    conversion: sessions ? Math.round((knownOrders * 10000) / sessions) / 100 : null,
    sessionDays: known.length, days: days.length,
  };
}

/** Percentage change, or null when the previous value is zero or missing (no fair comparison). */
export function change(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return Math.round(((cur - prev) * 1000) / prev) / 10;
}

/** Current and previous equal-length periods of complete days. */
export function periods(series: DayStat[], len: number) {
  return { cur: series.slice(-len), prev: series.slice(-2 * len, -len) };
}
