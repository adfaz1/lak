// Growth domain: coupons, abandoned-cart audience, automations dry-run, and analytics series.
// Deterministic fixtures; nothing is sent or charged.
import { people, seeded, type Channel, type L, type Order } from './domain';

/* ---------- Coupons ---------- */

export type CouponType = 'percent' | 'fixed' | 'freeShip' | 'bogo';
export type CouponStatus = 'active' | 'paused' | 'draft' | 'expired';
/** Which items an offer counts: everything, some categories (English category name) or some products (product id). */
export interface OfferScope { kind: 'all' | 'category' | 'product'; ids: string[] }
export interface Coupon {
  code: string; type: CouponType;
  /** Percent (1–90) for percent coupons, halalas for fixed. Ignored for free shipping and buy-X-get-Y. */
  value: number;
  minSpend: number; limitTotal: number | null; limitPerCustomer: number | null; used: number;
  starts: string; ends: string | null; status: CouponStatus;
  /** Automatic offer: applied at checkout without a code (the code is its internal name). Absent = typed code. */
  auto?: boolean;
  /** Items the discount counts. Absent = all items. */
  scope?: OfferScope;
  /** Buy-X-get-Y: for every `buy` units in scope, the next `get` cheapest units are `pct`% off (100 = free). */
  bogo?: { buy: number; get: number; pct: number };
  /** Made by a reminder or the welcome pop-up (single-use code for one customer), not by hand. Absent = made by the merchant. */
  origin?: 'reminder' | 'popup';
}

export function couponFixtures(): Coupon[] {
  return [
    { code: 'WELCOME10', type: 'percent', value: 10, minSpend: 10000, limitTotal: null, limitPerCustomer: 1, used: 214, starts: '2026-09-01', ends: null, status: 'active' },
    { code: 'SHIPFREE', type: 'freeShip', value: 0, minSpend: 30000, limitTotal: 500, limitPerCustomer: null, used: 118, starts: '2026-11-01', ends: '2026-11-30', status: 'active' },
    { code: 'NOV50', type: 'fixed', value: 5000, minSpend: 40000, limitTotal: 200, limitPerCustomer: 1, used: 200, starts: '2026-11-01', ends: '2026-11-30', status: 'active' },
    { code: 'RAMADAN15', type: 'percent', value: 15, minSpend: 0, limitTotal: 1000, limitPerCustomer: 2, used: 0, starts: '2027-02-15', ends: '2027-03-20', status: 'draft' },
    // Automatic offer (no code): buy 2 fragrance items, the cheapest third is free. A draft until the merchant activates it.
    { code: 'FRAGRANCE3', type: 'bogo', value: 0, minSpend: 0, limitTotal: null, limitPerCustomer: null, used: 0, starts: '2026-11-24', ends: '2026-12-31', status: 'draft', auto: true, scope: { kind: 'category', ids: ['Fragrance'] }, bogo: { buy: 2, get: 1, pct: 100 } },
  ];
}

export interface CouponDraft {
  code: string; type: CouponType; value: string; minSpend: string; limitTotal: string; limitPerCustomer: string; starts: string; ends: string;
  auto?: boolean; scopeKind?: OfferScope['kind']; scopeIds?: string[]; buy?: string; get?: string; getPct?: string;
}
export type CouponError = 'code' | 'codeTaken' | 'value' | 'percent' | 'money' | 'limit' | 'dates' | 'scope' | 'bogo';

export function validateCoupon(d: CouponDraft, taken: string[], parseMoney: (s: string) => number | null): Record<string, CouponError> {
  const e: Record<string, CouponError> = {};
  if (!/^[A-Z0-9]{4,16}$/.test(d.code)) e.code = 'code';
  else if (taken.includes(d.code)) e.code = 'codeTaken';
  if (d.type === 'percent') { const v = Number(toLatin(d.value)); if (!Number.isInteger(v) || v < 1 || v > 90) e.value = 'percent'; }
  if (d.type === 'fixed') { const v = parseMoney(d.value); if (v === null || v === 0) e.value = 'money'; }
  if (d.minSpend.trim() && parseMoney(d.minSpend) === null) e.minSpend = 'money';
  for (const k of ['limitTotal', 'limitPerCustomer'] as const) {
    if (d[k].trim()) { const v = Number(toLatin(d[k])); if (!Number.isInteger(v) || v < 1) e[k] = 'limit'; }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.starts) || (d.ends && (!/^\d{4}-\d{2}-\d{2}$/.test(d.ends) || d.ends < d.starts))) e.dates = 'dates';
  if (d.scopeKind && d.scopeKind !== 'all' && !(d.scopeIds ?? []).length) e.scope = 'scope';
  if (d.type === 'bogo') {
    const b = Number(toLatin(d.buy ?? '')), g = Number(toLatin(d.get ?? '')), p = Number(toLatin(d.getPct ?? ''));
    if (![b, g].every((x) => Number.isInteger(x) && x >= 1 && x <= 10) || !Number.isInteger(p) || p < 1 || p > 100) e.value = 'bogo';
  }
  return e;
}

/** Arabic-Indic digits typed by the merchant read as Latin digits. */
export const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).trim();

export function couponFromDraft(d: CouponDraft, parseMoney: (s: string) => number | null): Coupon {
  return {
    code: d.code, type: d.type, value: d.type === 'percent' ? Number(toLatin(d.value)) : d.type === 'fixed' ? parseMoney(d.value) ?? 0 : 0,
    minSpend: d.minSpend.trim() ? parseMoney(d.minSpend) ?? 0 : 0, limitTotal: d.limitTotal.trim() ? Number(toLatin(d.limitTotal)) : null,
    limitPerCustomer: d.limitPerCustomer.trim() ? Number(toLatin(d.limitPerCustomer)) : null, used: 0, starts: d.starts, ends: d.ends || null, status: 'draft',
    ...(d.auto ? { auto: true } : {}),
    ...(d.scopeKind && d.scopeKind !== 'all' ? { scope: { kind: d.scopeKind, ids: [...(d.scopeIds ?? [])] } } : {}),
    ...(d.type === 'bogo' ? { bogo: { buy: Number(toLatin(d.buy ?? '1')), get: Number(toLatin(d.get ?? '1')), pct: Number(toLatin(d.getPct ?? '100')) } } : {}),
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

/* ---------- Offers: scope, buy X get Y, automatic ---------- */

/** One basket line as an offer sees it. `category` is the product's English category name. */
export interface OfferLine { productId: string; category: string; qty: number; unit: number }

export const inScope = (c: Coupon, l: OfferLine) =>
  !c.scope || c.scope.kind === 'all' || (c.scope.kind === 'category' ? c.scope.ids.includes(l.category) : c.scope.ids.includes(l.productId));

/**
 * Discount of an offer on basket lines, ignoring dates and limits. Percent and fixed count only items in scope;
 * buy-X-get-Y sorts the units in scope from dearest to cheapest and, in each full group of buy+get, takes the
 * `get` cheapest units `pct`% off. Free shipping removes the shipping charge.
 */
export function offerDiscount(c: Coupon, lines: OfferLine[], shipping = 0) {
  const scoped = lines.filter((l) => inScope(c, l));
  const eligible = scoped.reduce((s, l) => s + l.qty * l.unit, 0);
  let discount = 0, freeUnits = 0;
  if (c.type === 'percent') discount = Math.floor((eligible * c.value) / 100);
  else if (c.type === 'fixed') discount = Math.min(c.value, eligible);
  else if (c.type === 'bogo' && c.bogo) {
    const units = scoped.flatMap((l) => Array.from({ length: l.qty }, () => l.unit)).sort((a, b) => b - a);
    const size = c.bogo.buy + c.bogo.get;
    for (let g = 0; g + size <= units.length; g += size) {
      const free = units.slice(g + c.bogo.buy, g + size);
      freeUnits += free.length;
      discount += free.reduce((s, u) => s + Math.floor((u * c.bogo!.pct) / 100), 0);
    }
  }
  return { eligible, discount, shippingOff: c.type === 'freeShip' && eligible > 0 ? shipping : 0, freeUnits, units: scoped.reduce((s, l) => s + l.qty, 0) };
}

export type OfferBlock = CouponBlock | 'scope' | 'qty';
/** The offer on a basket as checkout would apply it today, with the first reason it does not. */
export function applyOffer(c: Coupon, lines: OfferLine[], s: { shipping: number; customerUses: number }, today = '2026-11-24') {
  const subtotal = lines.reduce((a, l) => a + l.qty * l.unit, 0);
  const base = applyCoupon(c, { subtotal, shipping: s.shipping, customerUses: s.customerUses }, today);
  const d = offerDiscount(c, lines, s.shipping);
  let block: OfferBlock | null = base.block;
  if (!block && d.eligible === 0) block = 'scope';
  if (!block && c.type === 'bogo' && c.bogo && d.units < c.bogo.buy + c.bogo.get) block = 'qty';
  const discount = block ? 0 : d.discount;
  const shippingOff = block ? 0 : d.shippingOff;
  return { block, discount, shippingOff, freeUnits: block ? 0 : d.freeUnits, eligible: d.eligible, total: subtotal - discount + s.shipping - shippingOff, before: subtotal + s.shipping, subtotal };
}

/** The best automatic offer for a basket (largest saving), or null. Automatic offers do not stack. */
export function bestAutoOffer(list: Coupon[], lines: OfferLine[], s: { shipping: number; customerUses?: number }, today = '2026-11-24') {
  let best: { coupon: Coupon; saving: number; r: ReturnType<typeof applyOffer> } | null = null;
  for (const c of list) {
    if (!c.auto || c.status === 'draft') continue;
    const r = applyOffer(c, lines, { shipping: s.shipping, customerUses: s.customerUses ?? 0 }, today);
    const saving = r.discount + r.shippingOff;
    if (!r.block && saving > 0 && (!best || saving > best.saving)) best = { coupon: c, saving, r };
  }
  return best;
}

/* ---------- Abandoned carts ---------- */

export interface CartItem { sku: string; name: L; qty: number; unit: number }
export interface Cart {
  id: string; customer: L; value: number; hoursAgo: number; emailConsent: boolean; smsConsent: boolean; purchased: boolean; optedOut: boolean; contactedByAutomation: boolean;
  /** Customer record (C-…) and the items left in the cart. Value = sum of items. */
  customerId?: string; items?: CartItem[];
  /** Set when a recovery message led to the order (simulated attribution). */
  recovered?: { campaign: string; revenue: number; discount: number; coupon?: string; step?: string };
}
const CART_ITEMS: CartItem[] = [
  { sku: 'ABY-LIN-BLA-M', name: { ar: 'عباية سوداء مطرّزة', en: 'Embroidered black abaya' }, qty: 1, unit: 29000 },
  { sku: 'SHL-SLK-01', name: { ar: 'شال حرير موغا', en: 'Muga silk stole' }, qty: 1, unit: 9800 },
  { sku: 'OUD-100', name: { ar: 'زجاجة عطر كوبالت', en: 'Cobalt perfume bottle' }, qty: 1, unit: 12900 },
  { sku: 'BAG-LTH-01', name: { ar: 'حقيبة جلد بنية', en: 'Tan leather handbag' }, qty: 1, unit: 42000 },
  { sku: 'WLT-LTH-01', name: { ar: 'محفظة جلد', en: 'Leather wallet' }, qty: 1, unit: 16100 },
  { sku: 'COF-SET-01', name: { ar: 'دلّة وفناجين قهوة', en: 'Dallah and coffee cups' }, qty: 1, unit: 24000 },
  { sku: 'MAT-PRY-01', name: { ar: 'سجادة صلاة', en: 'Prayer mat' }, qty: 1, unit: 8900 },
  { sku: 'BKH-MAM-01', name: { ar: 'بخور معمول فاخر', en: 'Premium mamoul bakhoor' }, qty: 2, unit: 6500 },
];
export function cartFixtures(): Cart[] {
  const ppl = people();
  const r = seeded(7);
  const ri = seeded(23);
  return Array.from({ length: 48 }, (_, i) => {
    const n = 1 + Math.floor(ri() * 3);
    const items = Array.from({ length: n }, (_, k) => CART_ITEMS[(i * 3 + k * 5) % CART_ITEMS.length]).filter((x, k, a) => a.findIndex((y) => y.sku === x.sku) === k);
    const p = (i * 7) % ppl.length;
    r(); // the draw that used to set a random value: kept so consent and status fields stay as before
    return {
      id: `CRT-${3100 + i}`, customer: ppl[p].name, value: items.reduce((s, x) => s + x.qty * x.unit, 0), hoursAgo: 1 + Math.floor(r() * 96),
      emailConsent: r() < 0.7, smsConsent: r() < 0.45, purchased: r() < 0.12, optedOut: r() < 0.06, contactedByAutomation: r() < 0.15,
      customerId: `C-${1001 + p}`, items,
    };
  });
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

export type Trigger = 'cartAbandoned' | 'lowStock' | 'orderLate' | 'customerCreated' | 'orderDelivered' | 'backInStock';
export type CondField = 'cartValue' | 'stockBelow' | 'hoursLate' | 'channel' | 'orderTotal' | 'subscribers';
export interface Condition { field: CondField; value: string }
export type ActionKind = 'sendEmail' | 'sendSms' | 'createTask' | 'notifyStaff';
export type AutoStatus = 'active' | 'paused' | 'draft';
export interface Automation {
  id: string; name: L; trigger: Trigger; conditions: Condition[]; waitHours: number; actions: ActionKind[];
  status: AutoStatus; version: number; dryRunVersion: number | null; owner: L;
}
export const TRIGGER_FIELDS: Record<Trigger, CondField[]> = {
  cartAbandoned: ['cartValue', 'channel'], lowStock: ['stockBelow'], orderLate: ['hoursLate', 'channel'],
  customerCreated: ['channel'], orderDelivered: ['orderTotal', 'channel'], backInStock: ['subscribers'],
};
export const TRIGGER_ACTIONS: Record<Trigger, ActionKind[]> = {
  cartAbandoned: ['sendEmail', 'sendSms'], lowStock: ['createTask', 'notifyStaff'], orderLate: ['notifyStaff', 'createTask'],
  customerCreated: ['sendEmail', 'sendSms'], orderDelivered: ['sendEmail', 'sendSms'], backInStock: ['sendEmail', 'sendSms', 'notifyStaff'],
};

export const TEMPLATES: Automation[] = [
  { id: 'tpl-cart', name: { ar: 'تذكير بالسلة المتروكة', en: 'Abandoned cart reminder' }, trigger: 'cartAbandoned', conditions: [{ field: 'cartValue', value: '100' }], waitHours: 4, actions: ['sendEmail'], status: 'draft', version: 1, dryRunVersion: null, owner: { ar: 'المالك', en: 'Owner' } },
  { id: 'tpl-stock', name: { ar: 'مخزون منخفض ينشئ مهمة', en: 'Low stock creates a task' }, trigger: 'lowStock', conditions: [{ field: 'stockBelow', value: '3' }], waitHours: 0, actions: ['createTask'], status: 'draft', version: 1, dryRunVersion: null, owner: { ar: 'المالك', en: 'Owner' } },
  { id: 'tpl-late', name: { ar: 'طلب متأخر ينبّه الموظف', en: 'Late order alerts staff' }, trigger: 'orderLate', conditions: [{ field: 'hoursLate', value: '24' }], waitHours: 0, actions: ['notifyStaff'], status: 'draft', version: 1, dryRunVersion: null, owner: { ar: 'المالك', en: 'Owner' } },
  { id: 'tpl-welcome', name: { ar: 'ترحيب بالعميل الجديد', en: 'Welcome a new customer' }, trigger: 'customerCreated', conditions: [], waitHours: 1, actions: ['sendEmail'], status: 'draft', version: 1, dryRunVersion: null, owner: { ar: 'المالك', en: 'Owner' } },
  { id: 'tpl-review', name: { ar: 'طلب تقييم بعد التسليم', en: 'Ask for a review after delivery' }, trigger: 'orderDelivered', conditions: [], waitHours: 72, actions: ['sendEmail'], status: 'draft', version: 1, dryRunVersion: null, owner: { ar: 'المالك', en: 'Owner' } },
  { id: 'tpl-back', name: { ar: 'تنبيه عودة المخزون', en: 'Back-in-stock alert' }, trigger: 'backInStock', conditions: [{ field: 'subscribers', value: '1' }], waitHours: 0, actions: ['sendEmail'], status: 'draft', version: 1, dryRunVersion: null, owner: { ar: 'المالك', en: 'Owner' } },
];

export function automationFixtures(): Automation[] {
  return [
    { ...TEMPLATES[0], id: 'AU-11', status: 'active', version: 3, dryRunVersion: 3, conditions: [{ field: 'cartValue', value: '150' }] },
    { ...TEMPLATES[1], id: 'AU-12', status: 'paused', version: 1, dryRunVersion: 1 },
  ];
}

export interface SampleEvent { id: string; trigger: Trigger; label: L; cartValue?: number; consent?: boolean; stock?: number; hoursLate?: number; channel?: Channel; alreadyMessaged?: boolean; orderTotal?: number; subscribers?: number }
export const SAMPLE_EVENTS: SampleEvent[] = [
  { id: 'E1', trigger: 'cartAbandoned', label: { ar: 'سلة بقيمة 420 ر.س، عميلة موافقة على البريد', en: 'SAR 420 cart, customer consented to email' }, cartValue: 42000, consent: true, channel: 'online' },
  { id: 'E2', trigger: 'cartAbandoned', label: { ar: 'سلة بقيمة 90 ر.س', en: 'SAR 90 cart' }, cartValue: 9000, consent: true, channel: 'online' },
  { id: 'E3', trigger: 'cartAbandoned', label: { ar: 'سلة بقيمة 610 ر.س، بلا موافقة تواصل', en: 'SAR 610 cart, no marketing consent' }, cartValue: 61000, consent: false, channel: 'app' },
  { id: 'E4', trigger: 'cartAbandoned', label: { ar: 'سلة بقيمة 300 ر.س، وصلتها رسالة من حملة يدوية اليوم', en: 'SAR 300 cart, already messaged by a manual campaign today' }, cartValue: 30000, consent: true, alreadyMessaged: true, channel: 'online' },
  { id: 'E5', trigger: 'lowStock', label: { ar: 'زجاجة عطر كوبالت: متاح 3 في الرياض', en: 'Oud perfume: 3 available in Riyadh' }, stock: 3 },
  { id: 'E6', trigger: 'lowStock', label: { ar: 'شال حرير: متاح 8 في جدة', en: 'Silk shawl: 8 available in Jeddah' }, stock: 8 },
  { id: 'E7', trigger: 'orderLate', label: { ar: 'طلب مدفوع لم يُجهّز منذ 30 ساعة', en: 'Paid order unfulfilled for 30 hours' }, hoursLate: 30, channel: 'online' },
  { id: 'E8', trigger: 'orderLate', label: { ar: 'طلب مدفوع لم يُجهّز منذ 6 ساعات', en: 'Paid order unfulfilled for 6 hours' }, hoursLate: 6, channel: 'market' },
  { id: 'E9', trigger: 'customerCreated', label: { ar: 'عميلة جديدة من المتجر، موافقة على البريد', en: 'New store customer, consented to email' }, consent: true, channel: 'online' },
  { id: 'E10', trigger: 'customerCreated', label: { ar: 'عميل جديد من التطبيق، بلا موافقة تسويق', en: 'New app customer, no marketing consent' }, consent: false, channel: 'app' },
  { id: 'E11', trigger: 'orderDelivered', label: { ar: 'طلب بقيمة 450 ر.س سُلّم اليوم، العميلة موافقة', en: 'SAR 450 order delivered today, customer consented' }, orderTotal: 45000, consent: true, channel: 'online' },
  { id: 'E12', trigger: 'orderDelivered', label: { ar: 'طلب بقيمة 80 ر.س سُلّم، طُلب تقييمه سابقًا', en: 'SAR 80 order delivered, review already requested' }, orderTotal: 8000, consent: true, alreadyMessaged: true, channel: 'online' },
  { id: 'E13', trigger: 'backInStock', label: { ar: 'عاد عطر عود ملكي، 12 مشتركًا ينتظرونه', en: 'Royal oud is back, 12 subscribers waiting' }, subscribers: 12, consent: true },
  { id: 'E14', trigger: 'backInStock', label: { ar: 'عادت محفظة جلد، لا مشتركين', en: 'Leather wallet is back, no subscribers' }, subscribers: 0, consent: true },
];

export type SkipReason = 'condition' | 'noConsent' | 'dedup';
function meets(c: Condition, e: SampleEvent): boolean {
  const n = Number(c.value);
  switch (c.field) {
    case 'cartValue': return (e.cartValue ?? 0) >= n * 100;
    case 'stockBelow': return (e.stock ?? Infinity) <= n;
    case 'hoursLate': return (e.hoursLate ?? 0) >= n;
    case 'channel': return !c.value || e.channel === c.value;
    case 'orderTotal': return (e.orderTotal ?? 0) >= n * 100;
    case 'subscribers': return (e.subscribers ?? 0) >= n;
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
export interface Run {
  id: string; automation: string; when: L; subject: L; outcome: RunOutcome; reason: L;
  /** Epoch ms for runs recorded in this session (fixtures carry only the `when` label). */
  at?: number;
  /** 1 for the first attempt; a retry links to the first run of the chain. */
  attempt?: number; retryOf?: string;
  /** Whether a failure is worth retrying (provider timeout) or will fail again until fixed (invalid address). */
  retryable?: boolean;
  /** Who started it: the flow itself, a retry by staff, or a test run. */
  by?: string;
  /** Message cost charged at the test rate (halalas), when a message was handed to the provider. */
  cost?: number;
  /** Operating-rule runs (merchant/ops.ts runRule): the order it ran on and what it changed, in plain words. */
  order?: string; changes?: { text: L; status: string; why?: L }[];
}
export function runFixtures(): Run[] {
  const R = (id: string, a: string, wAr: string, wEn: string, sAr: string, sEn: string, o: RunOutcome, rAr: string, rEn: string): Run =>
    ({ id, automation: a, when: { ar: wAr, en: wEn }, subject: { ar: sAr, en: sEn }, outcome: o, reason: { ar: rAr, en: rEn } });
  return [
    R('RUN-901', 'AU-11', 'اليوم 09:40', 'Today 09:40', 'سلة CRT-3104', 'Cart CRT-3104', 'succeeded', 'سُلّم البريد إلى مزود الإرسال (محاكاة)', 'Email handed to the sending provider (simulated)'),
    R('RUN-900', 'AU-11', 'اليوم 08:15', 'Today 08:15', 'سلة CRT-3111', 'Cart CRT-3111', 'skipped', 'العميل اشترى قبل انتهاء الانتظار', 'Customer purchased before the wait ended'),
    R('RUN-899', 'AU-11', 'أمس 22:05', 'Yesterday 22:05', 'سلة CRT-3120', 'Cart CRT-3120', 'skipped', 'لا موافقة على التواصل بالبريد', 'No email marketing consent'),
    R('RUN-898', 'AU-11', 'أمس 19:30', 'Yesterday 19:30', 'سلة CRT-3127', 'Cart CRT-3127', 'failed', 'رفض المزود العنوان: بريد غير صالح. لن يُعاد تلقائيًا', 'Provider rejected the address: invalid email. Not retried automatically'),
    R('RUN-897', 'AU-11', 'أمس 16:00', 'Yesterday 16:00', 'سلة CRT-3102', 'Cart CRT-3102', 'skipped', 'وصلته رسالة للسلة نفسها من مسار آخر (منع التكرار)', 'Already messaged for this cart by another flow (deduplicated)'),
    R('RUN-896', 'AU-12', 'قبل 3 أيام', '3 days ago', 'زجاجة عطر كوبالت · الرياض', 'Oud perfume · Riyadh', 'succeeded', 'أُنشئت مهمة إعادة طلب للمخزون', 'Restock task created'),
    { ...R('RUN-895', 'AU-11', 'قبل 3 أيام', '3 days ago', 'سلة CRT-3115', 'Cart CRT-3115', 'failed', 'انتهت مهلة مزود الإرسال قبل الرد', 'The sending provider timed out before answering'), retryable: true },
  ].map((r) => (r.outcome === 'failed' && r.retryable === undefined ? { ...r, retryable: false } : r.outcome === 'succeeded' && r.automation === 'AU-11' ? { ...r, cost: TEST_RATE.email } : r));
}

/* ---------- Run steps and retries ---------- */

export type StepOutcome = 'ok' | 'skipped' | 'failed' | 'notReached';
export interface RunStep { kind: 'event' | 'conditions' | 'wait' | 'action'; outcome: StepOutcome; action?: ActionKind }
/**
 * Per-step outcome of a run, in plain order: event received, conditions, wait, then each action.
 * A skipped run stops at the step that skipped it; a failed run fails at the first action.
 */
export function runSteps(run: Run, a: Pick<Automation, 'actions' | 'waitHours'> | undefined): RunStep[] {
  const actions = a?.actions.length ? a.actions : (['sendEmail'] as ActionKind[]);
  const en = run.reason.en.toLowerCase();
  const skipAt: RunStep['kind'] | null = run.outcome !== 'skipped' ? null
    : /purchased|during the wait|before the wait/.test(en) ? 'wait' : /consent|dedup|already messaged/.test(en) ? 'action' : 'conditions';
  const order: RunStep['kind'][] = ['event', 'conditions', 'wait'];
  const steps: RunStep[] = order.map((k) => ({ kind: k, outcome: skipAt === k ? 'skipped' : skipAt && order.indexOf(k) > order.indexOf(skipAt as typeof k) ? 'notReached' : 'ok' }));
  actions.forEach((x, i) => {
    let outcome: StepOutcome = 'ok';
    if (skipAt === 'action') outcome = i === 0 ? 'skipped' : 'notReached';
    else if (skipAt) outcome = 'notReached';
    else if (run.outcome === 'failed') outcome = i === 0 ? 'failed' : 'notReached';
    steps.push({ kind: 'action', outcome, action: x });
  });
  return steps;
}

export const MAX_ATTEMPTS = 3;
/** The first run of a retry chain. */
export const rootOf = (r: Run) => r.retryOf ?? r.id;
/** Every attempt of a chain, oldest first. */
export const attemptsOf = (runs: Run[], root: string) => runs.filter((r) => rootOf(r) === root).sort((a, b) => (a.attempt ?? 1) - (b.attempt ?? 1));
/** The latest attempt of each chain, so a retried failure is not counted twice. */
export const latestAttempts = (runs: Run[]) => runs.filter((r) => !runs.some((x) => x.id !== r.id && rootOf(x) === rootOf(r) && (x.attempt ?? 1) > (r.attempt ?? 1)));

export type RetryBlock = 'notFailed' | 'superseded' | 'maxAttempts';
export function retryBlock(runs: Run[], r: Run): RetryBlock | null {
  if (r.outcome !== 'failed') return 'notFailed';
  const chain = attemptsOf(runs, rootOf(r));
  if (chain[chain.length - 1]?.id !== r.id) return 'superseded';
  if ((r.attempt ?? 1) >= MAX_ATTEMPTS) return 'maxAttempts';
  return null;
}
/** Failed chains that need a person: out of attempts, or a failure that will repeat until its cause is fixed. */
export const needsFollowUp = (runs: Run[]) =>
  latestAttempts(runs).filter((r) => r.outcome === 'failed' && ((r.attempt ?? 1) >= MAX_ATTEMPTS || r.retryable === false));

/**
 * Retry one failed run (simulated). Only the failed step is repeated: steps that succeeded are not run again.
 * A retryable failure (timeout) succeeds; a permanent one (invalid address) fails again with the same cause.
 */
export function retryRun(runs: Run[], id: string, ctx: { now: number; by: string }): { runs: Run[]; run: Run | null } {
  const r = runs.find((x) => x.id === id);
  if (!r || retryBlock(runs, r)) return { runs, run: null };
  const n = Math.max(900, ...runs.map((x) => Number(x.id.replace(/\D/g, '')) || 0)) + 1;
  const ok = r.retryable === true;
  const run: Run = {
    id: `RUN-${n}`, automation: r.automation, subject: r.subject, when: { ar: 'الآن', en: 'Just now' }, at: ctx.now,
    attempt: (r.attempt ?? 1) + 1, retryOf: rootOf(r), retryable: r.retryable, by: ctx.by,
    outcome: ok ? 'succeeded' : 'failed',
    reason: ok ? { ar: 'نجحت إعادة المحاولة: سُلّم لمزود الإرسال (محاكاة)', en: 'Retry succeeded: handed to the sending provider (simulated)' } : r.reason,
    ...(ok ? { cost: TEST_RATE.email } : {}),
  };
  return { runs: [run, ...runs], run };
}

/**
 * Log operating-rule results as runs (newest first), one per order, numbered after the existing runs. A retry links to
 * the first run of its chain. Results come from merchant/ops.ts runRule; this file only records them.
 */
export function appendRuleRuns(
  runs: Run[],
  results: { rule: string; ref: string; outcome: RunOutcome; reason: L; changes: { text: L; status: string; why?: L }[]; retryable?: boolean }[],
  ctx: { now: number; by: string; retryOf?: Run },
): { runs: Run[]; added: Run[] } {
  let n = Math.max(900, ...runs.map((x) => Number(x.id.replace(/\D/g, '')) || 0));
  const added: Run[] = results.map((r) => ({
    id: `RUN-${++n}`, automation: r.rule, order: r.ref, subject: { ar: `طلب #${r.ref}`, en: `Order #${r.ref}` }, when: { ar: 'الآن', en: 'Just now' }, at: ctx.now,
    outcome: r.outcome, reason: r.reason, changes: r.changes, by: ctx.by,
    ...(r.outcome === 'failed' ? { retryable: r.retryable ?? false } : {}),
    ...(ctx.retryOf ? { attempt: (ctx.retryOf.attempt ?? 1) + 1, retryOf: rootOf(ctx.retryOf) } : {}),
  }));
  return { runs: added.length ? [...[...added].reverse(), ...runs] : runs, added };
}

/* ---------- Loyalty points ---------- */

/** Earn and redeem rules. Points are whole numbers; a point is worth `pointValue` halalas at checkout. */
export interface LoyaltyRules {
  enabled: boolean;
  /** Points per SAR 1 paid (after discount, before shipping is not separated in fixtures: the order total). */
  earnPerSar: number;
  pointValue: number;
  /** Smallest balance that can be used at checkout. */
  minRedeem: number;
  /** Largest share of the items subtotal points may pay (%). */
  maxRedeemPct: number;
  version: number; by: string; at: string;
}
export const loyaltyFixture = (): LoyaltyRules => ({ enabled: true, earnPerSar: 1, pointValue: 5, minRedeem: 200, maxRedeemPct: 30, version: 1, by: 'المالك', at: '2026-10-01' });

export interface PointsTxn { id: string; customerId: string; delta: number; kind: 'earn' | 'redeem' | 'adjust' | 'reverse'; ref?: string; note?: string; at: string; by: string }

export type LoyaltyError = 'earn' | 'value' | 'min' | 'pct';
export function validateLoyalty(d: { earnPerSar: string; pointValue: string; minRedeem: string; maxRedeemPct: string }): Partial<Record<LoyaltyError, true>> {
  const n = (x: string) => Number(toLatin(x));
  const e: Partial<Record<LoyaltyError, true>> = {};
  if (!Number.isInteger(n(d.earnPerSar)) || n(d.earnPerSar) < 1 || n(d.earnPerSar) > 20) e.earn = true;
  if (!Number.isInteger(n(d.pointValue)) || n(d.pointValue) < 1 || n(d.pointValue) > 100) e.value = true;
  if (!Number.isInteger(n(d.minRedeem)) || n(d.minRedeem) < 0) e.min = true;
  if (!Number.isInteger(n(d.maxRedeemPct)) || n(d.maxRedeemPct) < 1 || n(d.maxRedeemPct) > 100) e.pct = true;
  return e;
}

/** Points earned on a paid amount (halalas): whole riyals × points per riyal. */
export const earnFor = (r: Pick<LoyaltyRules, 'earnPerSar'>, amount: number) => Math.floor(amount / 100) * r.earnPerSar;
export const pointsBalance = (ledger: PointsTxn[], customerId: string) => ledger.reduce((s, t) => (t.customerId === customerId ? s + t.delta : s), 0);

/**
 * Record points for paid orders that have none yet (idempotent: one earn entry per order), and take back the
 * points of confirmed refunds. Points are recorded with the rules in force when they are recorded, so a rule
 * change applies to new orders only. Orders without a customer record are skipped.
 */
export function syncEarned(
  ledger: PointsTxn[], orders: { ref: string; customer: L; customerId?: string; pay: string; refunds: { id: string; amount: number; status: string }[]; hoursAgo: number }[],
  customers: { id: string; name: L }[], rules: LoyaltyRules, total: (o: never) => number,
): PointsTxn[] {
  if (!rules.enabled) return ledger;
  const byName = new Map(customers.map((c) => [c.name.en, c.id]));
  const has = new Set(ledger.map((t) => t.ref));
  const add: PointsTxn[] = [];
  for (const o of orders) {
    if (o.pay === 'failed') continue;
    const cid = o.customerId ?? byName.get(o.customer.en);
    if (!cid) continue;
    if (!has.has(o.ref)) add.push({ id: `PT-${o.ref}`, customerId: cid, delta: earnFor(rules, total(o as never)), kind: 'earn', ref: o.ref, at: o.hoursAgo < 24 ? 'today' : `${Math.floor(o.hoursAgo / 24)}d`, by: 'system' });
    for (const r of o.refunds) {
      if (r.status !== 'confirmed' || has.has(r.id)) continue;
      add.push({ id: `PT-${r.id}`, customerId: cid, delta: -earnFor(rules, r.amount), kind: 'reverse', ref: r.id, at: 'today', by: 'system' });
    }
  }
  return add.length ? [...add, ...ledger] : ledger;
}

export type RedeemBlock = 'disabled' | 'belowMin' | 'none';
/** How many points this basket can use, and their value. Points never pay shipping or more than the cap. */
export function redeemQuote(r: LoyaltyRules, balance: number, subtotal: number, want?: number) {
  const capValue = Math.floor((subtotal * r.maxRedeemPct) / 100);
  const maxPoints = Math.max(0, Math.min(balance, Math.floor(capValue / r.pointValue)));
  const block: RedeemBlock | null = !r.enabled ? 'disabled' : balance < r.minRedeem || balance <= 0 ? 'belowMin' : maxPoints === 0 ? 'none' : null;
  const points = block ? 0 : Math.max(0, Math.min(maxPoints, want ?? maxPoints));
  return { block, points, value: points * r.pointValue, maxPoints, capValue, cappedBy: maxPoints < balance ? ('cap' as const) : ('balance' as const) };
}
/** Value of every unredeemed point (what the store owes in discounts if all were used). */
export const pointsLiability = (ledger: PointsTxn[], r: Pick<LoyaltyRules, 'pointValue'>) =>
  Math.max(0, ledger.reduce((s, t) => s + t.delta, 0)) * r.pointValue;

/* ---------- Gift cards ---------- */

export interface GiftTxn { id: string; kind: 'issue' | 'redeem' | 'disable' | 'enable'; amount: number; ref?: string; by: string; at: string }
export interface GiftCard {
  code: string; initial: number; balance: number; to: string; customerId?: string;
  source: 'manual' | 'order'; orderRef?: string; status: 'active' | 'disabled'; expires: string | null; issued: string; log: GiftTxn[];
}
export function giftFixtures(): GiftCard[] {
  const card = (code: string, initial: number, balance: number, to: string, customerId: string | undefined, issued: string, expires: string | null, status: GiftCard['status'] = 'active'): GiftCard => {
    const log: GiftTxn[] = [{ id: `${code}-1`, kind: 'issue', amount: initial, by: 'المالك', at: issued }];
    if (balance < initial) log.unshift({ id: `${code}-2`, kind: 'redeem', amount: initial - balance, ref: '10476', by: 'system', at: issued });
    return { code, initial, balance, to, customerId, source: 'manual', status, expires, issued, log };
  };
  return [
    card('GC-7Q4K-2M9P', 50000, 50000, 'customer1007@example.test', 'C-1007', '2026-11-02', '2027-11-02'),
    card('GC-3H8D-6T1R', 20000, 7500, 'customer1013@example.test', 'C-1013', '2026-08-14', '2027-08-14'),
    card('GC-9W2B-4N7X', 10000, 0, 'customer1020@example.test', 'C-1020', '2026-03-01', '2027-03-01'),
    card('GC-5J6C-8L3V', 30000, 30000, 'customer1031@example.test', 'C-1031', '2025-06-10', '2026-06-10'),
  ];
}
export type GiftState = 'active' | 'used' | 'expired' | 'disabled';
export const giftState = (g: GiftCard, today = '2026-11-24'): GiftState =>
  g.status === 'disabled' ? 'disabled' : g.expires && g.expires < today ? 'expired' : g.balance === 0 ? 'used' : 'active';

export type GiftError = 'amount' | 'to' | 'expires';
export function validateGift(d: { amount: string; to: string; expires: string }, parseMoney: (s: string) => number | null, today = '2026-11-24'): Partial<Record<GiftError, true>> {
  const e: Partial<Record<GiftError, true>> = {};
  const v = parseMoney(d.amount);
  if (v === null || v < 1000 || v > 500000) e.amount = true;
  if (!/^\S+@\S+\.\S+$/.test(d.to.trim()) && !/^\+?[\d\s٠-٩]{9,15}$/.test(d.to.trim())) e.to = true;
  if (d.expires && (!/^\d{4}-\d{2}-\d{2}$/.test(d.expires) || d.expires <= today)) e.expires = true;
  return e;
}
/** A new card code that is not in the list: GC- and two groups of four (no 0/O/1/I to avoid misreading). */
export function newGiftCode(taken: string[], seed: number): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = seeded(seed);
  for (;;) {
    const g = () => Array.from({ length: 4 }, () => A[Math.floor(r() * A.length)]).join('');
    const code = `GC-${g()}-${g()}`;
    if (!taken.includes(code)) return code;
  }
}
export function issueGift(list: GiftCard[], d: { amount: number; to: string; customerId?: string; expires: string | null }, ctx: { by: string; today: string; seed: number }): { list: GiftCard[]; card: GiftCard } {
  const code = newGiftCode(list.map((g) => g.code), ctx.seed);
  const card: GiftCard = {
    code, initial: d.amount, balance: d.amount, to: d.to.trim(), customerId: d.customerId, source: 'manual', status: 'active', expires: d.expires, issued: ctx.today,
    log: [{ id: `${code}-1`, kind: 'issue', amount: d.amount, by: ctx.by, at: ctx.today }],
  };
  return { list: [card, ...list], card };
}
export type RedeemGiftError = 'disabled' | 'expired' | 'empty' | 'amount';
/** Use part or all of a card's balance against an order. The amount used never exceeds the balance or the order. */
export function redeemGift(g: GiftCard, orderTotal: number, ctx: { ref: string; by: string; today: string }): { card: GiftCard; applied: number; error: RedeemGiftError | null } {
  const st = giftState(g, ctx.today);
  const error: RedeemGiftError | null = st === 'disabled' ? 'disabled' : st === 'expired' ? 'expired' : g.balance === 0 ? 'empty' : orderTotal <= 0 ? 'amount' : null;
  if (error) return { card: g, applied: 0, error };
  const applied = Math.min(g.balance, orderTotal);
  return {
    card: { ...g, balance: g.balance - applied, log: [{ id: `${g.code}-${g.log.length + 1}`, kind: 'redeem', amount: applied, ref: ctx.ref, by: ctx.by, at: ctx.today }, ...g.log] },
    applied, error: null,
  };
}
export function setGiftStatus(g: GiftCard, status: GiftCard['status'], ctx: { by: string; today: string }): GiftCard {
  return { ...g, status, log: [{ id: `${g.code}-${g.log.length + 1}`, kind: status === 'disabled' ? 'disable' : 'enable', amount: 0, by: ctx.by, at: ctx.today }, ...g.log] };
}
/**
 * Cards bought in the store: one card per gift-card unit in a paid order (the digital gift-card product, SKU GFT-…),
 * worth the unit price, sent to the buyer. Idempotent by code (GC-<order>-<n>).
 */
export function cardsFromOrders(list: GiftCard[], orders: { ref: string; pay: string; customerId?: string; items: { sku: string; qty: number; unit: number }[] }[], today: string): GiftCard[] {
  const have = new Set(list.map((g) => g.code));
  const add: GiftCard[] = [];
  for (const o of orders) {
    if (o.pay === 'failed') continue;
    let n = 0;
    for (const it of o.items) {
      if (!it.sku.startsWith('GFT-')) continue;
      for (let k = 0; k < it.qty; k++) {
        const code = `GC-${o.ref}-${++n}`;
        if (have.has(code)) continue;
        add.push({ code, initial: it.unit, balance: it.unit, to: o.customerId ?? '', customerId: o.customerId, source: 'order', orderRef: o.ref, status: 'active', expires: null, issued: today, log: [{ id: `${code}-1`, kind: 'issue', amount: it.unit, ref: o.ref, by: 'system', at: today }] });
      }
    }
  }
  return add.length ? [...add, ...list] : list;
}
/** Unused balance of cards that can still be used: money received that customers may still spend. */
export const giftLiability = (list: GiftCard[], today = '2026-11-24') => list.filter((g) => giftState(g, today) === 'active').reduce((s, g) => s + g.balance, 0);

/* ---------- Reviews and questions ---------- */

export type ReviewKind = 'review' | 'question';
export type ReviewStatus = 'pending' | 'published' | 'hidden';
export interface Review {
  id: string; kind: ReviewKind; productId: string; customerId?: string; author: L;
  /** 1–5 for reviews; absent for questions. */
  rating?: number;
  text: string; at: string; status: ReviewStatus;
  /** Bought the product (a paid order on record). */
  verified: boolean;
  reply?: { text: string; by: string; at: string };
  /** Sent to LAK for an abuse check; the review stays hidden meanwhile. */
  report?: { reason: 'abuse' | 'spam' | 'personal'; by: string; at: string };
  log: { what: 'published' | 'hidden' | 'replied' | 'reported' | 'restored'; by: string; at: string }[];
}
export interface ReviewSettings { products: boolean; moderation: boolean; maskNames: boolean; questions: boolean; questionsSignedIn: boolean; showOnCategory: boolean }
export const reviewSettingsFixture = (): ReviewSettings => ({ products: true, moderation: true, maskNames: true, questions: true, questionsSignedIn: false, showOnCategory: true });

export function reviewFixtures(): Review[] {
  const R = (id: string, kind: ReviewKind, productId: string, customerId: string, ar: string, en: string, text: string, at: string, status: ReviewStatus, rating?: number, extra: Partial<Review> = {}): Review =>
    ({ id, kind, productId, customerId, author: { ar, en }, text, at, status, rating, verified: kind === 'review', log: [], ...extra });
  return [
    R('RV-118', 'review', 'p1', 'C-1001', 'سارة العتيبي', 'Sarah Alotaibi', 'التطريز أجمل من الصور، والمقاس مطابق للجدول.', '2026-11-23', 'pending', 5),
    R('RV-117', 'review', 'p3', 'C-1008', 'محمد القحطاني', 'Mohammed Alqahtani', 'الزجاجة وصلت سليمة لكن الغطاء أصغر مما توقعت.', '2026-11-22', 'pending', 3),
    R('RV-116', 'review', 'p4', 'C-1015', 'نوف الشهري', 'Nouf Alshehri', 'Great leather, the strap is a bit short for me.', '2026-11-21', 'pending', 4),
    R('RV-115', 'review', 'p6', 'C-1022', 'عبدالله الدوسري', 'Abdullah Aldossari', 'اتصلوا على 0500000000 للطلب الجماعي!!! أرخص سعر', '2026-11-21', 'pending', 1),
    R('RV-114', 'review', 'p2', 'C-1029', 'ريم الحربي', 'Reem Alharbi', 'لون ذهبي طبيعي وخفيف جدًا. يستحق.', '2026-11-18', 'published', 5, { log: [{ what: 'published', by: 'فيصل', at: '2026-11-18' }] }),
    R('RV-113', 'review', 'p1', 'C-1036', 'فهد المطيري', 'Fahad Almutairi', 'تأخر التوصيل يومين، لكن العباية ممتازة.', '2026-11-15', 'published', 4, { reply: { text: 'شكرًا فهد، نعتذر عن التأخير وأبلغنا شركة الشحن.', by: 'المالك', at: '2026-11-15' }, log: [{ what: 'published', by: 'المالك', at: '2026-11-15' }, { what: 'replied', by: 'المالك', at: '2026-11-15' }] }),
    R('RV-112', 'review', 'p13', 'C-1043', 'لمى العتيبي', 'Lama Alotaibi', 'Lasts all day on my abaya. Strong but elegant.', '2026-11-12', 'published', 5, { log: [{ what: 'published', by: 'المالك', at: '2026-11-12' }] }),
    R('RV-111', 'review', 'p5', 'C-1050', 'خالد القحطاني', 'Khalid Alqahtani', 'خياطة الحواف بدأت تتفكك بعد شهر.', '2026-11-08', 'hidden', 2, { log: [{ what: 'hidden', by: 'فيصل', at: '2026-11-09' }] }),
    R('QA-208', 'question', 'p1', 'C-1004', 'سارة الدوسري', 'Sarah Aldossari', 'هل يتوفر مقاس XL قريبًا؟', '2026-11-23', 'pending'),
    R('QA-207', 'question', 'p13', 'C-1011', 'محمد الحربي', 'Mohammed Alharbi', 'Is this the 50 ml or the 100 ml bottle?', '2026-11-20', 'published', undefined, { reply: { text: '50 ml. The 100 ml size is coming in December.', by: 'المالك', at: '2026-11-20' }, log: [{ what: 'replied', by: 'المالك', at: '2026-11-20' }] }),
    R('QA-206', 'question', 'p4', 'C-1018', 'نوف المطيري', 'Nouf Almutairi', 'هل الحزام قابل للتعديل؟', '2026-11-19', 'pending'),
  ];
}

/** Name as shown publicly: first name and the initial of the family name when masking is on. */
export function publicName(n: L, mask: boolean): L {
  if (!mask) return n;
  const m = (s: string) => { const [f, ...rest] = s.trim().split(/\s+/); const last = rest.join(' ').replace(/^ال/, ''); return last ? `${f} ${last[0]}.` : f; };
  return { ar: m(n.ar), en: m(n.en) };
}
/** What a shopper sees on a product page: published entries only, newest first, with the merchant's reply. */
export function storeReviews(list: Review[], productId: string, s: ReviewSettings) {
  const pub = list.filter((r) => r.productId === productId && r.status === 'published');
  const reviews = s.products ? pub.filter((r) => r.kind === 'review') : [];
  const questions = s.questions ? pub.filter((r) => r.kind === 'question' && r.reply) : [];
  const avg = reviews.length ? Math.round((reviews.reduce((a, r) => a + (r.rating ?? 0), 0) / reviews.length) * 10) / 10 : null;
  const show = (r: Review) => ({ ...r, author: publicName(r.author, s.maskNames) });
  return { reviews: reviews.map(show), questions: questions.map(show), avg, count: reviews.length };
}
/** A review's text that looks like contact details or spam (phone, link, repeated punctuation): flagged for a closer look. */
export const looksSuspicious = (text: string) => /(\+?9665|05)\d{8}|https?:\/\/|www\.|!!!/.test(text.replace(/\s/g, ''));

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

/* ---------- Coupon redemptions (reports: BP-P03-ANA-009) ---------- */

export interface Redemption { code: string; orderRef: string; hoursAgo: number; discount: number; revenue: number; demo: boolean }
/**
 * Coupon uses on orders. Orders placed in the online store carry their real code and discount; the older demo order book
 * has none, so a fixed-seed demo ledger attributes active coupons to some paid orders (within the coupon dates and
 * minimum spend). Demo rows are flagged so reports can say where each number comes from.
 */
export function couponRedemptions(orders: Order[], coupons: Coupon[], today = '2026-11-24'): Redemption[] {
  const out: Redemption[] = [];
  const t0 = Date.parse(`${today}T00:00:00Z`);
  for (const o of orders) {
    if (o.pay === 'failed') continue;
    const sub = o.items.reduce((s, i) => s + i.qty * i.unit, 0);
    if (o.coupon) { out.push({ code: o.coupon, orderRef: o.ref, hoursAgo: o.hoursAgo, discount: o.discount ?? 0, revenue: sub - (o.discount ?? 0) + o.fee, demo: false }); continue; }
    const r = seeded(Number(o.ref) || 1)();
    if (r > 0.14) continue;
    const day = new Date(t0 - Math.floor(o.hoursAgo / 24) * 86400000).toISOString().slice(0, 10);
    const live = coupons.filter((c) => c.status !== 'draft' && !c.origin && c.starts <= day && (!c.ends || c.ends >= day) && sub >= c.minSpend);
    if (!live.length) continue;
    const c = live[Math.floor(r * 1000) % live.length];
    const discount = c.type === 'percent' ? Math.round((sub * c.value) / 100) : c.type === 'fixed' ? Math.min(c.value, sub) : o.fee;
    out.push({ code: c.code, orderRef: o.ref, hoursAgo: o.hoursAgo, discount, revenue: sub + o.fee - discount, demo: true });
  }
  return out;
}

/* ---------- Reminders: multi-step abandoned-cart sequence and reorder reminders (Salla audit #65, #76) ---------- */
// A reminder is a message the store sends on its own after an event (a cart left, a purchase N days ago). Rules here
// are pure: who is due, what they receive, what it may cost. Sending is simulated; consent is always required and
// the sequence stops for a customer as soon as they buy.

/** Discount in a reminder: none, an existing code-based coupon, or a single-use code made for each customer. */
export type ReminderDiscount = { kind: 'none' } | { kind: 'existing'; code: string } | { kind: 'generated'; pct: number; validDays: number };
export interface ReminderStep {
  id: string;
  /** Hours after the cart was left. */
  afterHours: number;
  channel: MsgChannel;
  /** Template per language; placeholders: {name} {store} {items} {code} {expiry}. */
  text: L;
  discount: ReminderDiscount;
  on: boolean;
}
/** Hours of the day (Riyadh, 0–23) when nothing is sent; messages wait until `to`. `from > to` wraps midnight. */
export interface QuietHours { on: boolean; from: number; to: number }
export type ReminderStatus = 'active' | 'paused' | 'draft';
export interface CartSequence { status: ReminderStatus; steps: ReminderStep[]; quiet: QuietHours; version: number; by: string; at: string }

export const REMINDER_HOURS = [1, 2, 4, 12, 24, 48, 72, 120];
export const MAX_STEPS = 4;
/** Carts older than this are not messaged: the customer has moved on. */
export const CART_MAX_AGE_H = 168;

export const cartSequenceFixture = (): CartSequence => ({
  status: 'draft', version: 0, by: '', at: '',
  quiet: { on: true, from: 22, to: 9 },
  steps: [
    { id: 'st1', afterHours: 1, channel: 'email', on: true, discount: { kind: 'none' },
      text: { ar: 'مرحبًا {name}، تركت في سلتك: {items}. أكمل طلبك من {store} متى ناسبك.', en: 'Hi {name}, you left {items} in your cart. Complete your order at {store} whenever suits you.' } },
    { id: 'st2', afterHours: 24, channel: 'email', on: true, discount: { kind: 'generated', pct: 10, validDays: 3 },
      text: { ar: '{name}، سلتك ما زالت محفوظة. خصم 10% بالكود {code} حتى {expiry}.', en: '{name}, your cart is still saved. 10% off with {code} until {expiry}.' } },
    { id: 'st3', afterHours: 72, channel: 'sms', on: true, discount: { kind: 'none' },
      text: { ar: 'آخر تذكير من {store}: سلتك تنتظرك.', en: 'Last reminder from {store}: your cart is waiting.' } },
  ],
});

export const inQuiet = (q: QuietHours, hour: number) => q.on && q.from !== q.to && (q.from < q.to ? hour >= q.from && hour < q.to : hour >= q.from || hour < q.to);

/** Fill a template. Unknown placeholders stay visible so the merchant notices them. */
export function renderTemplate(text: string, v: Partial<Record<'name' | 'store' | 'items' | 'code' | 'expiry', string>>): string {
  return text.replace(/\{(name|store|items|code|expiry)\}/g, (m, k: keyof typeof v) => v[k] ?? m);
}
const PLACEHOLDER = /\{(\w+)\}/g;
export const unknownPlaceholders = (text: string) => [...text.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((k) => !['name', 'store', 'items', 'code', 'expiry'].includes(k));

export type StepError = 'textAr' | 'textEn' | 'long' | 'placeholder' | 'pct' | 'days' | 'coupon' | 'order' | 'codeMissing';
/**
 * Problems in one step. `maxLen` is the channel limit; the length is checked on the longest rendering (sample values).
 * A step with a discount must show the code ({code}) in both languages; steps must be in increasing time order.
 */
export function stepErrors(s: ReminderStep, prev: ReminderStep | undefined, maxLen: number, coupons: Coupon[]): StepError[] {
  const e: StepError[] = [];
  if (!s.text.ar.trim()) e.push('textAr');
  if (!s.text.en.trim()) e.push('textEn');
  if (unknownPlaceholders(s.text.ar + s.text.en).length) e.push('placeholder');
  const sample = { name: 'عبدالرحمن العبدالله', store: 'دار نوى', items: 'عباية سوداء مطرّزة، شال حرير', code: 'LKABCDEF', expiry: '2026-12-01' };
  if (Math.max(renderTemplate(s.text.ar, sample).length, renderTemplate(s.text.en, sample).length) > maxLen) e.push('long');
  if (s.discount.kind === 'generated') {
    if (!Number.isInteger(s.discount.pct) || s.discount.pct < 1 || s.discount.pct > 50) e.push('pct');
    if (!Number.isInteger(s.discount.validDays) || s.discount.validDays < 1 || s.discount.validDays > 14) e.push('days');
  }
  const d = s.discount;
  if (d.kind === 'existing' && !coupons.some((c) => c.code === d.code)) e.push('coupon');
  if (s.discount.kind !== 'none' && !(/\{code\}/.test(s.text.ar) && /\{code\}/.test(s.text.en))) e.push('codeMissing');
  if (prev && s.afterHours <= prev.afterHours) e.push('order');
  return e;
}

/** A coupon accepted at checkout today (status, dates and total limit). */
export const couponLive = (c: Coupon | undefined, today = '2026-11-24') =>
  !!c && c.status === 'active' && c.starts <= today && (!c.ends || c.ends >= today) && (c.limitTotal === null || c.used < c.limitTotal);

/** Deterministic 32-bit hash, so codes and simulated outcomes are stable across reloads. */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** Single-use code for one customer and one reminder: "LK" + 6 letters/digits (no 0/O/1/I). */
export function reminderCode(seed: string, taken: string[]): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let n = 0; ; n++) {
    let h = hashOf(`${seed}#${n}`), out = 'LK';
    for (let i = 0; i < 6; i++) { out += A[h % A.length]; h = Math.floor(h / A.length) || hashOf(out); }
    if (!taken.includes(out)) return out;
  }
}
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const reminderCoupon = (code: string, pct: number, validDays: number, today = '2026-11-24'): Coupon => ({
  code, type: 'percent', value: pct, minSpend: 0, limitTotal: 1, limitPerCustomer: 1, used: 0, starts: today, ends: plusDays(today, validDays), status: 'active', origin: 'reminder',
});

/* Deliveries: one record per cart and step (or per customer and reorder rule). */
export type DeliveryStatus = 'sent' | 'failed' | 'deferred' | 'skipped' | 'stopped';
export type DeliveryReason = 'noConsent' | 'optedOut' | 'caughtUp' | 'tooOld' | 'provider' | 'rejected' | 'coupon' | 'quiet' | 'bought';
export interface Delivery {
  id: string;
  /** Cart sequence: `seq`; reorder: the rule id. */
  source: string;
  step: string;
  /** Cart id, or the order ref the reorder reminder is about. */
  target: string;
  customerId?: string;
  channel: MsgChannel;
  status: DeliveryStatus;
  reason?: DeliveryReason;
  code?: string; expires?: string;
  /** Simulated: email opens are tracked by a pixel; SMS opens cannot be measured. */
  opened?: boolean;
  /** Simulated outcome attributed to this message (cart bought / product bought again). */
  result?: { revenue: number; discount: number };
  attempts: number;
  at: number;
  version?: number;
}
export interface RunCtx { hour: number; now: number; smsDown?: boolean; today?: string }
const simOpened = (id: string, ch: MsgChannel) => (ch === 'email' ? hashOf(`open:${id}`) % 100 < 46 : undefined);

/** Outcome of handing one message to the (simulated) provider: quiet hours, outage and rejected addresses. */
function handOff(base: Omit<Delivery, 'status' | 'attempts' | 'at'> & { attempts?: number }, ctx: RunCtx, fails: boolean, quiet: QuietHours): Delivery {
  const d = { ...base, attempts: (base.attempts ?? 0) + 1, at: ctx.now };
  if (inQuiet(quiet, ctx.hour)) return { ...d, attempts: base.attempts ?? 0, status: 'deferred', reason: 'quiet' };
  if (base.channel === 'sms' && ctx.smsDown) return { ...d, status: 'failed', reason: 'provider' };
  if (fails) return { ...d, status: 'failed', reason: 'rejected' };
  return { ...d, status: 'sent', reason: undefined, opened: simOpened(d.id, d.channel) };
}

/**
 * One pass of the cart sequence over the carts. For each cart: the latest due step is sent (earlier due steps are
 * skipped as "caught up", so an old cart never receives three messages at once); bought carts stop; no consent or
 * opted out = skipped; quiet hours = deferred until they end. Existing deliveries are kept, deferred ones retried.
 * Returns the new delivery list and the coupons generated for this pass.
 */
export function runSequence(seq: CartSequence, carts: Cart[], deliveries: Delivery[], coupons: Coupon[], ctx: RunCtx) {
  const today = ctx.today ?? '2026-11-24';
  const steps = seq.steps.filter((s) => s.on).sort((a, b) => a.afterHours - b.afterHours);
  const out = [...deliveries];
  const made: Coupon[] = [];
  const taken = coupons.map((c) => c.code);
  if (seq.status !== 'active') return { deliveries: out, coupons: made };
  const find = (cart: string, step: string) => out.findIndex((d) => d.source === 'seq' && d.target === cart && d.step === step);
  for (const c of carts) {
    const due = steps.filter((s) => c.hoursAgo >= s.afterHours);
    // Steps after the last one already handled (a step added later never goes out after a later step).
    const doneIdx = due.reduce((m, s, i) => { const k = find(c.id, s.id); return k >= 0 && out[k].status !== 'deferred' ? i : m; }, -1);
    const open = due.slice(doneIdx + 1);
    if (!open.length) continue;
    const latest = open[open.length - 1];
    const put = (d: Delivery) => { const i = find(d.target, d.step); if (i >= 0) out[i] = d; else out.push(d); };
    const base = { id: `${c.id}:${latest.id}`, source: 'seq', step: latest.id, target: c.id, customerId: c.customerId, channel: latest.channel, version: seq.version };
    for (const s of open.slice(0, -1)) if (find(c.id, s.id) < 0) put({ ...base, id: `${c.id}:${s.id}`, step: s.id, channel: s.channel, status: 'skipped', reason: 'caughtUp', attempts: 0, at: ctx.now });
    const sentBefore = out.some((d) => d.source === 'seq' && d.target === c.id && d.status === 'sent');
    if (c.purchased) { if (sentBefore) put({ ...base, status: 'stopped', reason: 'bought', attempts: 0, at: ctx.now }); continue; }
    if (c.optedOut) { put({ ...base, status: 'skipped', reason: 'optedOut', attempts: 0, at: ctx.now }); continue; }
    if (c.hoursAgo > CART_MAX_AGE_H) { put({ ...base, status: 'skipped', reason: 'tooOld', attempts: 0, at: ctx.now }); continue; }
    if (latest.channel === 'email' ? !c.emailConsent : !c.smsConsent) { put({ ...base, status: 'skipped', reason: 'noConsent', attempts: 0, at: ctx.now }); continue; }
    if (latest.discount.kind === 'existing' && !couponLive(coupons.find((x) => x.code === (latest.discount as { code: string }).code), today)) {
      put({ ...base, status: 'failed', reason: 'coupon', attempts: 1, at: ctx.now }); continue;
    }
    const prev = out[find(c.id, latest.id)];
    let d = handOff({ ...base, attempts: prev?.attempts ?? 0 }, ctx, simSendFails(c), seq.quiet);
    if (d.status === 'sent' && latest.discount.kind !== 'none') {
      if (latest.discount.kind === 'existing') d = { ...d, code: latest.discount.code };
      else {
        const code = reminderCode(`${c.id}:${latest.id}`, taken);
        taken.push(code);
        const cp = reminderCoupon(code, latest.discount.pct, latest.discount.validDays, today);
        made.push(cp);
        d = { ...d, code, expires: cp.ends ?? undefined };
      }
    }
    put(d);
  }
  return { deliveries: out, coupons: made };
}

/** Retry one failed delivery: same message, one more attempt (a still-failing cause fails again). */
export function retryDelivery(d: Delivery, ctx: RunCtx, quiet: QuietHours, fails: boolean, couponOk = true): Delivery {
  if (d.status !== 'failed') return d;
  if (d.reason === 'coupon' && !couponOk) return { ...d, attempts: d.attempts + 1, at: ctx.now };
  return handOff({ ...d, reason: undefined }, ctx, fails, quiet);
}

/**
 * Simulated attribution: some customers who received a message buy within the code's validity (with a discount
 * one in three, without one in five). Deterministic per cart and step. Real attribution needs the server to link the
 * order to the message (link click or code).
 */
export function cartConverts(d: Delivery, withDiscount: boolean) {
  return d.status === 'sent' && !d.result && hashOf(`buy:${d.id}`) % (withDiscount ? 3 : 5) === 0;
}

export interface StepStats { sent: number; opened: number; openable: number; failed: number; deferred: number; skipped: number; stopped: number; recovered: number; revenue: number; discount: number; cost: number }
export function stepStats(deliveries: Delivery[], source: string, step: string): StepStats {
  const mine = deliveries.filter((d) => d.source === source && d.step === step);
  const sent = mine.filter((d) => d.status === 'sent');
  const won = sent.filter((d) => d.result);
  return {
    sent: sent.length, opened: sent.filter((d) => d.opened).length, openable: sent.filter((d) => d.channel === 'email').length,
    failed: mine.filter((d) => d.status === 'failed').length, deferred: mine.filter((d) => d.status === 'deferred').length,
    skipped: mine.filter((d) => d.status === 'skipped').length, stopped: mine.filter((d) => d.status === 'stopped').length,
    recovered: won.length, revenue: won.reduce((s, d) => s + (d.result?.revenue ?? 0), 0), discount: won.reduce((s, d) => s + (d.result?.discount ?? 0), 0),
    cost: sent.reduce((s, d) => s + TEST_RATE[d.channel], 0),
  };
}

/**
 * What a sequence would do for the carts open today if each one reached every step: messages per step (consent on
 * the step's channel, not bought, not opted out, not too old) and the message cost at the test rate. The discount
 * is given only when someone buys with the code, so it is shown as an average per recovered cart and a maximum.
 */
export function sequenceForecast(seq: Pick<CartSequence, 'steps'>, carts: Cart[], cartDisc: (step: ReminderStep, c: Cart) => number) {
  const open = carts.filter((c) => !c.purchased && !c.optedOut && c.hoursAgo <= CART_MAX_AGE_H);
  return seq.steps.filter((s) => s.on).map((s) => {
    const who = open.filter((c) => (s.channel === 'email' ? c.emailConsent : c.smsConsent));
    const disc = s.discount.kind === 'none' ? [] : who.map((c) => cartDisc(s, c));
    const max = disc.reduce((a, b) => a + b, 0);
    return { step: s.id, messages: who.length, cost: who.length * TEST_RATE[s.channel], avgDiscount: disc.length ? Math.round(max / disc.length) : 0, maxDiscount: max };
  });
}

/* ---------- Reorder (replenishment) reminders ---------- */

export interface ReorderRule {
  id: string;
  /** A product (product id) or a category (English category name). */
  scope: { kind: 'product' | 'category'; id: string };
  /** Remind this many days after the last purchase in scope. */
  days: number;
  channel: MsgChannel;
  text: L;
  discount: ReminderDiscount;
  status: ReminderStatus;
  by: string; at: string;
}
export const reorderFixtures = (): ReorderRule[] => [
  { id: 'RR-1', scope: { kind: 'product', id: 'p3' }, days: 45, channel: 'email', status: 'active', by: 'المالك', at: '2026-11-02', discount: { kind: 'none' },
    text: { ar: '{name}، هل قارب عطرك من {store} على النفاد؟ اطلب عبوة جديدة متى ناسبك.', en: '{name}, running low on your perfume from {store}? Order a new bottle whenever suits you.' } },
];
/** Minimal views the reorder rules need, so this stays independent of the catalogue and customers modules. */
export interface ReorderProduct { id: string; sku: string; variants: { sku: string }[]; category: L; name: L }
export interface ReorderCustomer { id: string; name: L; consent: { email: boolean; sms: boolean }; blocked?: unknown }
export type ReorderExclusion = 'noConsent' | 'blocked' | 'reminded' | 'otherRule';
export interface ReorderCandidate { customerId: string; name: L; orderRef: string; sku: string; item: L; value: number; daysSince: number; dueIn: number }

const productOfSku = (products: ReorderProduct[], sku: string) => products.find((p) => p.sku === sku || p.variants.some((v) => v.sku === sku) || sku.startsWith(`${p.sku}-`));
export const inReorderScope = (r: ReorderRule, sku: string, products: ReorderProduct[]) => {
  const p = productOfSku(products, sku);
  return !!p && (r.scope.kind === 'product' ? p.id === r.scope.id : p.category.en === r.scope.id);
};

/**
 * Customers a rule concerns, from each customer's latest paid order with an item in scope:
 * `due` = the reminder day has come (up to a week late, e.g. a rule just activated), `week` = it comes in the
 * next 7 days. A newer purchase in scope moves the date, so customers who already bought again are not reminded.
 * `earlier` are rules that come first; a customer gets one reorder reminder per order.
 */
export function reorderCandidates(r: ReorderRule, orders: Order[], customers: ReorderCustomer[], products: ReorderProduct[], deliveries: Delivery[], earlier: ReorderRule[] = []) {
  const due: ReorderCandidate[] = [], week: ReorderCandidate[] = [];
  const excluded: Record<ReorderExclusion, number> = { noConsent: 0, blocked: 0, reminded: 0, otherRule: 0 };
  for (const c of customers) {
    const mine = orders.filter((o) => o.pay !== 'failed' && (o.customerId ? o.customerId === c.id : o.customer.en === c.name.en));
    let best: { o: Order; sku: string; item: L; value: number } | null = null;
    for (const o of mine) for (const i of o.items) {
      if (!inReorderScope(r, i.sku, products)) continue;
      if (!best || o.hoursAgo < best.o.hoursAgo) best = { o, sku: i.sku, item: i.name, value: i.qty * i.unit };
    }
    if (!best) continue;
    const daysSince = Math.floor(best.o.hoursAgo / 24);
    const dueIn = r.days - daysSince;
    if (dueIn > 6 || dueIn < -7) continue;
    const cand: ReorderCandidate = { customerId: c.id, name: c.name, orderRef: best.o.ref, sku: best.sku, item: best.item, value: best.value, daysSince, dueIn };
    if (c.blocked) { excluded.blocked++; continue; }
    if (!c.consent[r.channel]) { excluded.noConsent++; continue; }
    if (deliveries.some((d) => d.source === r.id && d.target === best!.o.ref && d.status !== 'failed' && d.status !== 'deferred')) { excluded.reminded++; continue; }
    if (earlier.some((e) => e.status === 'active' && inReorderScope(e, best!.sku, products))) { excluded.otherRule++; continue; }
    (dueIn <= 0 ? due : week).push(cand);
  }
  const byDue = (a: ReorderCandidate, b: ReorderCandidate) => a.dueIn - b.dueIn || a.name.en.localeCompare(b.name.en);
  return { due: due.sort(byDue), week: week.sort(byDue), excluded };
}

/** Send a rule's due reminders (simulated). Same hand-off rules as the cart sequence; quiet hours are shared. */
export function runReorder(r: ReorderRule, cands: ReorderCandidate[], deliveries: Delivery[], coupons: Coupon[], quiet: QuietHours, ctx: RunCtx) {
  const today = ctx.today ?? '2026-11-24';
  const out = [...deliveries];
  const made: Coupon[] = [];
  const taken = coupons.map((c) => c.code);
  if (r.status !== 'active') return { deliveries: out, coupons: made };
  for (const c of cands) {
    const i = out.findIndex((d) => d.source === r.id && d.target === c.orderRef);
    if (i >= 0 && out[i].status !== 'deferred') continue;
    const base = { id: `${r.id}:${c.orderRef}`, source: r.id, step: r.id, target: c.orderRef, customerId: c.customerId, channel: r.channel, attempts: i >= 0 ? out[i].attempts : 0 };
    let d: Delivery;
    if (r.discount.kind === 'existing' && !couponLive(coupons.find((x) => x.code === (r.discount as { code: string }).code), today)) d = { ...base, status: 'failed', reason: 'coupon', attempts: 1, at: ctx.now };
    else d = handOff(base, ctx, c.customerId.endsWith('7'), quiet);
    if (d.status === 'sent' && r.discount.kind === 'existing') d = { ...d, code: r.discount.code };
    if (d.status === 'sent' && r.discount.kind === 'generated') {
      const code = reminderCode(`${r.id}:${c.orderRef}`, taken);
      taken.push(code);
      const cp = reminderCoupon(code, r.discount.pct, r.discount.validDays, today);
      made.push(cp);
      d = { ...d, code, expires: cp.ends ?? undefined };
    }
    if (i >= 0) out[i] = d; else out.push(d);
  }
  return { deliveries: out, coupons: made };
}

/* ---------- Affiliates and influencer collaborations (P03-AFF, P03-INF) ---------- */
// The merchant's own programme: people the merchant adds, a tracked link and/or code each, the merchant's commission
// rules, attribution of store orders, commission states and payout runs. Whether LAK runs a managed affiliate network
// or pays affiliates itself is an open decision: here payouts are recorded by the merchant (paid outside LAK).
// No marketplace of people: every partner is added by the merchant; fixture entries are labelled «مثال».

export type CommissionKind = 'percent' | 'fixed';
/** percent: % of the eligible items' net value (after discount, before VAT and shipping). fixed: halalas per eligible unit. */
export interface Rate { kind: CommissionKind; value: number }
export interface CommissionRules {
  base: Rate;
  /** Category (English name) → rate that replaces the base for items in it. */
  byCategory: Record<string, Rate>;
  excludeCategories: string[];
  /** Product ids that never earn commission. */
  excludeProducts: string[];
  /** Days a link visit stays attributable (1–90). */
  cookieDays: number;
  /** An affiliate is paid once owed at least this much (halalas). */
  minPayout: number;
  version: number; by: string; at: string;
}
export type PartnerKind = 'affiliate' | 'influencer';
export type PartnerStatus = 'invited' | 'active' | 'paused';
export type SocialPlatform = 'instagram' | 'tiktok' | 'snapchat' | 'x' | 'youtube';
export const SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok', 'snapchat', 'x', 'youtube'];
export interface Partner {
  id: string; kind: PartnerKind; name: string; email?: string; phone?: string;
  handles: { platform: SocialPlatform; handle: string }[];
  /** Tracked link parameter (`?ref=CODE`) and, when `coupon` is set, the code shoppers type at checkout. */
  code: string;
  /** Coupon code that backs the code at checkout (a discount for followers). Absent = link only. */
  coupon?: string;
  /** Own rate instead of the programme base; null = no commission (e.g. an influencer paid a fee). */
  rate?: Rate | null;
  status: PartnerStatus; addedAt: string; by: string;
  /** Fixture entry, shown with «مثال». */
  example?: boolean;
}
/** Which partner an order is credited to, how, and the rules in force when it was placed (later edits apply to new orders). */
export interface Attribution {
  ref: string; partnerId: string; via: 'link' | 'code'; at: number;
  rules: Pick<CommissionRules, 'base' | 'byCategory' | 'excludeCategories' | 'excludeProducts'>; rate?: Rate | null;
  /** Fraud review: a held order the merchant approved anyway, or rejected (no commission). */
  review?: { decision: 'approved' | 'rejected'; by: string; at: string };
}
export interface PayoutLine { partnerId: string; refs: { ref: string; amount: number }[]; total: number }
export interface Payout { id: string; at: string; by: string; lines: PayoutLine[]; total: number; method: 'outside' }

const AFF_DAY = 86_400_000;
export const CODE_RE = /^[A-Z0-9]{3,16}$/;
const digitsOf = (s: string) => toLatin(s).replace(/\D/g, '');
const phoneTail = (s?: string) => (s ? digitsOf(s).slice(-9) : '');
const emailKey = (s?: string) => (s ?? '').trim().toLowerCase();

/** Tracked link to the storefront (any store path) for a partner code. */
export const partnerLink = (code: string, path = '') => `#/store${path}?ref=${encodeURIComponent(code)}`;
/** A suggested free code from a seed (latin letters/digits from the name or e-mail, else P + number). */
export function suggestCode(seed: string, taken: string[]): string {
  const up = new Set(taken.map((t) => t.toUpperCase()));
  const base = (toLatin(seed).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)) || 'P';
  if (base.length >= 3 && !up.has(base)) return base;
  for (let i = 10; i < 10_000; i++) { const c = `${base.length >= 3 ? base.slice(0, 8) : 'PARTNER'.slice(0, Math.max(1, 3 - base.length) + 4)}${i}`; if (!up.has(c)) return c; }
  return `P${Date.now()}`.slice(0, 16);
}

export interface PartnerDraft {
  kind: PartnerKind; name: string; email: string; phone: string; code: string;
  handles: { platform: SocialPlatform; handle: string }[];
  /** Give followers a discount: creates a coupon with the same code. */
  discount: boolean; discountPct: string;
  /** '' = programme base; 'none' = no commission; else own rate. */
  rateMode: '' | 'none' | CommissionKind; rateValue: string;
}
export const emptyPartnerDraft = (kind: PartnerKind): PartnerDraft => ({
  kind, name: '', email: '', phone: '', code: '', handles: kind === 'influencer' ? [{ platform: 'instagram', handle: '' }] : [],
  discount: kind === 'influencer', discountPct: '', rateMode: kind === 'influencer' ? 'none' : '', rateValue: '',
});
export type PartnerError = 'name' | 'contact' | 'email' | 'phone' | 'code' | 'codeTaken' | 'pct' | 'rate' | 'handle';
const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const validSaPhone = (s: string) => /^(\+?966|0)?5\d{8}$/.test(digitsOf(s).replace(/^00/, ''));
/** Number from merchant input (Arabic digits, Arabic decimal comma). NaN when not a plain number. */
export const numIn = (s: string) => { const t = toLatin(s).replace('٫', '.').replace(/[,،\s]/g, ''); return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN; };

export function validatePartner(d: PartnerDraft, partners: Partner[], coupons: Coupon[], editingId?: string): PartnerError[] {
  const e: PartnerError[] = [];
  if (d.name.trim().length < 2) e.push('name');
  // Affiliates get an invitation, so they need a way to be reached; influencers may be added by handle only.
  if (d.kind === 'affiliate' && !d.email.trim() && !d.phone.trim()) e.push('contact');
  if (d.email.trim() && !validEmail(d.email)) e.push('email');
  if (d.phone.trim() && !validSaPhone(d.phone)) e.push('phone');
  if (d.kind === 'influencer' && !d.handles.some((h) => h.handle.trim())) e.push('handle');
  const code = toLatin(d.code).toUpperCase();
  if (!CODE_RE.test(code)) e.push('code');
  else if (partners.some((p) => p.id !== editingId && p.code === code) || (!editingId && coupons.some((c) => c.code === code))) e.push('codeTaken');
  if (d.discount && !editingId) { const p = numIn(d.discountPct); if (!Number.isInteger(p) || p < 1 || p > 90) e.push('pct'); }
  if (d.rateMode === 'percent') { const v = numIn(d.rateValue); if (!(v > 0 && v <= 90)) e.push('rate'); }
  if (d.rateMode === 'fixed') { const v = numIn(d.rateValue); if (!(v > 0 && v <= 10_000)) e.push('rate'); }
  return e;
}
export function rateFromDraft(d: Pick<PartnerDraft, 'rateMode' | 'rateValue'>): Rate | null | undefined {
  if (d.rateMode === '') return undefined;
  if (d.rateMode === 'none') return null;
  const v = numIn(d.rateValue);
  return d.rateMode === 'percent' ? { kind: 'percent', value: v } : { kind: 'fixed', value: Math.round(v * 100) };
}
export function partnerFromDraft(d: PartnerDraft, id: string, by: string, today: string): Partner {
  const code = toLatin(d.code).toUpperCase();
  return {
    id, kind: d.kind, name: d.name.trim(), email: d.email.trim() || undefined, phone: d.phone.trim() ? digitsOf(d.phone) : undefined,
    handles: d.handles.filter((h) => h.handle.trim()).map((h) => ({ platform: h.platform, handle: h.handle.trim().replace(/^@?/, '@') })),
    code, ...(d.discount ? { coupon: code } : {}), rate: rateFromDraft(d), status: d.kind === 'affiliate' ? 'invited' : 'active', addedAt: today, by,
  };
}
/** The coupon that lets followers type the partner's code at checkout. One use per customer; the merchant can edit it later. */
export const partnerCoupon = (code: string, pct: number, today: string): Coupon =>
  ({ code, type: 'percent', value: pct, minSpend: 0, limitTotal: null, limitPerCustomer: 1, used: 0, starts: today, ends: null, status: 'active' });

export interface RulesDraft { baseKind: CommissionKind; baseValue: string; cookieDays: string; minPayout: string; byCategory: { cat: string; kind: CommissionKind; value: string }[]; excludeCategories: string[]; excludeProducts: string[] }
const rateText = (r: Rate) => (r.kind === 'percent' ? String(r.value) : (r.value / 100).toFixed(2).replace(/\.00$/, ''));
export const rulesDraft = (r: CommissionRules): RulesDraft => ({
  baseKind: r.base.kind, baseValue: rateText(r.base), cookieDays: String(r.cookieDays), minPayout: (r.minPayout / 100).toFixed(2).replace(/\.00$/, ''),
  byCategory: Object.entries(r.byCategory).map(([cat, x]) => ({ cat, kind: x.kind, value: rateText(x) })), excludeCategories: [...r.excludeCategories], excludeProducts: [...r.excludeProducts],
});
export type RulesError = 'base' | 'cookie' | 'min' | 'cat' | 'catDup';
const rateOk = (kind: CommissionKind, s: string) => { const v = numIn(s); return kind === 'percent' ? v >= 0 && v <= 90 : v >= 0 && v <= 10_000; };
export function validateRules(d: RulesDraft): RulesError[] {
  const e: RulesError[] = [];
  if (!rateOk(d.baseKind, d.baseValue)) e.push('base');
  const c = numIn(d.cookieDays); if (!Number.isInteger(c) || c < 1 || c > 90) e.push('cookie');
  if (!(numIn(d.minPayout) >= 0)) e.push('min');
  if (d.byCategory.some((x) => !x.cat || !rateOk(x.kind, x.value))) e.push('cat');
  if (new Set(d.byCategory.map((x) => x.cat)).size !== d.byCategory.length) e.push('catDup');
  return e;
}
const toRate = (kind: CommissionKind, s: string): Rate => (kind === 'percent' ? { kind, value: numIn(s) } : { kind, value: Math.round(numIn(s) * 100) });
export function rulesFromDraft(d: RulesDraft, prev: CommissionRules, by: string, at: string): CommissionRules {
  return {
    base: toRate(d.baseKind, d.baseValue), byCategory: Object.fromEntries(d.byCategory.map((x) => [x.cat, toRate(x.kind, x.value)])),
    excludeCategories: d.excludeCategories, excludeProducts: d.excludeProducts, cookieDays: numIn(d.cookieDays), minPayout: Math.round(numIn(d.minPayout) * 100),
    version: prev.version + 1, by, at,
  };
}

/* Attribution: a code typed at checkout wins over a link visit; a link counts within the cookie window. Paused partners earn nothing new. */
export interface AffTouch { code: string; at: number }
export function attributeOrder(order: { ref: string; coupon?: string }, touch: AffTouch | null, partners: Partner[], rules: CommissionRules, now: number): Attribution | null {
  const live = partners.filter((p) => p.status !== 'paused');
  const byCode = order.coupon ? live.find((p) => p.coupon && p.coupon === order.coupon) : undefined;
  const byLink = !byCode && touch && now - touch.at <= rules.cookieDays * AFF_DAY ? live.find((p) => p.code === touch.code.toUpperCase()) : undefined;
  const p = byCode ?? byLink;
  if (!p) return null;
  const { base, byCategory, excludeCategories, excludeProducts } = rules;
  return { ref: order.ref, partnerId: p.id, via: byCode ? 'code' : 'link', at: now, rules: { base, byCategory, excludeCategories, excludeProducts }, ...(p.rate !== undefined ? { rate: p.rate } : {}) };
}

type CProduct = { id: string; sku: string; category: L; variants: { sku: string }[] };
const productBySku = (products: CProduct[]) => {
  const m = new Map<string, CProduct>();
  for (const p of products) { m.set(p.sku, p); for (const v of p.variants) m.set(v.sku, p); }
  return m;
};
export interface CommissionItem { sku: string; name: L; category?: L; units: number; net: number; rate: Rate | null; amount: number; excluded?: 'category' | 'product' }
/** Share of the order total refunded (confirmed refunds), 0–1. */
export const refundShare = (o: Order) => { const t = o.items.reduce((s, i) => s + i.qty * i.unit, 0) - (o.discount ?? 0) + o.fee; const r = o.refunds.filter((x) => x.status === 'confirmed').reduce((s, x) => s + x.amount, 0); return t > 0 ? Math.min(1, r / t) : 0; };
/** Commission on an attributed order with the rules recorded at attribution. Net = after the order discount, before VAT, without shipping. */
export function commissionFor(o: Order, a: Attribution, products: CProduct[]): { items: CommissionItem[]; base: number; amount: number } {
  const bySku = productBySku(products);
  const gross = o.items.reduce((s, i) => s + i.qty * i.unit, 0);
  const keep = gross > 0 ? Math.max(0, gross - (o.discount ?? 0)) / gross : 0;
  const left = 1 - refundShare(o);
  const items = o.items.filter((i) => i.unit > 0).map((i): CommissionItem => {
    const p = bySku.get(i.sku);
    const units = Math.round(i.qty * left * 100) / 100;
    const net = Math.round((i.qty * i.unit * keep * left) / 1.15);
    const base = { sku: i.sku, name: i.name, category: p?.category, units, net };
    if (p && a.rules.excludeProducts.includes(p.id)) return { ...base, rate: null, amount: 0, excluded: 'product' };
    if (p && a.rules.excludeCategories.includes(p.category.en)) return { ...base, rate: null, amount: 0, excluded: 'category' };
    const rate = a.rate === null ? null : (p && a.rules.byCategory[p.category.en]) || a.rate || a.rules.base;
    const amount = !rate ? 0 : rate.kind === 'percent' ? Math.round((net * rate.value) / 100) : Math.round(rate.value * units);
    return { ...base, rate, amount };
  });
  return { items, base: items.filter((x) => !x.excluded).reduce((s, x) => s + x.net, 0), amount: items.reduce((s, x) => s + x.amount, 0) };
}

/** Fraud checks: the partner bought through their own link or code (same phone or e-mail). */
export function selfReferral(o: Order, p: Partner): boolean {
  const ph = phoneTail(o.contact?.phone);
  const em = emailKey(o.contact?.email);
  return (!!ph && ph === phoneTail(p.phone)) || (!!em && em === emailKey(p.email));
}

/**
 * pending: inside the return window · approved: window over, payable · held: fraud check, waiting for the merchant ·
 * paid: fully paid in a payout · reversed: cancelled/refunded before payment (or rejected) · clawback: paid, then refunded,
 * so the next payout deducts the difference.
 */
export type CommissionState = 'pending' | 'approved' | 'held' | 'paid' | 'reversed' | 'clawback';
export interface CommissionLine { ref: string; partnerId: string; via: Attribution['via']; at: number; ageDays: number; revenue: number; base: number; amount: number; paid: number; owed: number; state: CommissionState; flags: ('self' | 'refund' | 'cancelled')[]; approvesIn: number }
export const orderAgeDays = (o: Order, now: number) => (o.placedAt ? (now - o.placedAt) / AFF_DAY : o.hoursAgo / 24);
export function paidByRef(payouts: Payout[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const po of payouts) for (const l of po.lines) for (const r of l.refs) m.set(r.ref, (m.get(r.ref) ?? 0) + r.amount);
  return m;
}
export function commissionLines(orders: Order[], atts: Attribution[], partners: Partner[], products: CProduct[], payouts: Payout[], returnDays: number, now: number): CommissionLine[] {
  const byRef = new Map(orders.map((o) => [o.ref, o]));
  const paid = paidByRef(payouts);
  const out: CommissionLine[] = [];
  for (const a of atts) {
    const o = byRef.get(a.ref);
    const p = partners.find((x) => x.id === a.partnerId);
    if (!o || !p) continue;
    const cancelled = !!o.cancelled || o.pay === 'failed';
    const refunded = refundShare(o);
    const flags: CommissionLine['flags'] = [];
    if (selfReferral(o, p)) flags.push('self');
    if (refunded > 0) flags.push('refund');
    if (cancelled) flags.push('cancelled');
    const rejected = a.review?.decision === 'rejected';
    const c = cancelled || rejected ? { base: 0, amount: 0 } : commissionFor(o, a, products);
    const got = paid.get(a.ref) ?? 0;
    const age = orderAgeDays(o, now);
    const revenue = cancelled ? 0 : Math.round((o.items.reduce((s, i) => s + i.qty * i.unit, 0) - (o.discount ?? 0)) * (1 - refunded));
    let state: CommissionState;
    if (got > c.amount) state = 'clawback';
    else if (c.amount === 0 && (cancelled || rejected || refunded >= 1)) state = 'reversed';
    else if (got > 0 && got === c.amount) state = 'paid';
    else if (flags.includes('self') && a.review?.decision !== 'approved') state = 'held';
    else if (age < returnDays) state = 'pending';
    else state = 'approved';
    out.push({ ref: a.ref, partnerId: a.partnerId, via: a.via, at: a.at, ageDays: age, revenue, base: c.base, amount: c.amount, paid: got, owed: c.amount - got, state, flags, approvesIn: Math.max(0, Math.ceil(returnDays - age)) });
  }
  return out.sort((x, y) => x.ageDays - y.ageDays);
}

export interface PartnerTotals { orders: number; revenue: number; pending: number; approved: number; paid: number; held: number; clawback: number }
export function partnerTotals(lines: CommissionLine[], partnerId?: string): PartnerTotals {
  const l = partnerId ? lines.filter((x) => x.partnerId === partnerId) : lines;
  const sum = (s: CommissionState[], f: (x: CommissionLine) => number) => l.filter((x) => s.includes(x.state)).reduce((a, x) => a + f(x), 0);
  return {
    orders: l.filter((x) => x.state !== 'reversed').length, revenue: l.reduce((a, x) => a + x.revenue, 0),
    pending: sum(['pending'], (x) => x.owed), approved: sum(['approved'], (x) => x.owed), held: sum(['held'], (x) => x.owed),
    paid: l.reduce((a, x) => a + x.paid, 0), clawback: sum(['clawback'], (x) => -x.owed),
  };
}

/** Who a payout run would pay now: approved owed minus clawbacks, per partner; under the minimum or nothing owed = skipped. */
export interface PayoutPreviewRow { partner: Partner; refs: { ref: string; amount: number }[]; approved: number; clawback: number; total: number; skip?: 'min' | 'none' | 'paused' }
export function payoutPreview(lines: CommissionLine[], partners: Partner[], minPayout: number): PayoutPreviewRow[] {
  return partners.map((p) => {
    const mine = lines.filter((l) => l.partnerId === p.id && (l.state === 'approved' || l.state === 'clawback'));
    const refs = mine.map((l) => ({ ref: l.ref, amount: l.owed }));
    const approved = refs.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const clawback = -refs.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
    const total = approved - clawback;
    const skip = !refs.length || total <= 0 ? 'none' as const : p.status === 'paused' ? 'paused' as const : total < minPayout ? 'min' as const : undefined;
    return { partner: p, refs, approved, clawback, total, ...(skip ? { skip } : {}) };
  }).filter((r) => r.refs.length > 0);
}
export function runPayout(preview: PayoutPreviewRow[], id: string, by: string, at: string): Payout | null {
  const lines = preview.filter((r) => !r.skip).map((r) => ({ partnerId: r.partner.id, refs: r.refs, total: r.total }));
  return lines.length ? { id, at, by, lines, total: lines.reduce((s, l) => s + l.total, 0), method: 'outside' } : null;
}

const STATE_TEXT: Record<CommissionState, L> = {
  pending: { ar: 'معلّقة حتى انتهاء مهلة الإرجاع', en: 'Pending (return window)' }, approved: { ar: 'معتمدة', en: 'Approved' }, held: { ar: 'موقوفة للمراجعة', en: 'Held for review' },
  paid: { ar: 'مدفوعة', en: 'Paid' }, reversed: { ar: 'ملغاة', en: 'Reversed' }, clawback: { ar: 'تُخصم من الدفعة القادمة', en: 'Deducted next payout' },
};
export const commissionStateText = (s: CommissionState) => STATE_TEXT[s];
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** Statement for one partner: every attributed order with its commission and state. Amounts in SAR. */
export function statementCsv(p: Partner, lines: CommissionLine[], lang: 'ar' | 'en'): string {
  const sar = (h: number) => (h / 100).toFixed(2);
  const head = lang === 'ar' ? ['الطلب', 'المصدر', 'عمر الطلب (يوم)', 'المبيعات', 'أساس العمولة', 'العمولة', 'مدفوع', 'المتبقي', 'الحالة'] : ['Order', 'Source', 'Order age (days)', 'Sales', 'Commission base', 'Commission', 'Paid', 'Owed', 'State'];
  const rows = lines.filter((l) => l.partnerId === p.id).map((l) => [l.ref, l.via === 'code' ? (lang === 'ar' ? 'كود' : 'Code') : (lang === 'ar' ? 'رابط' : 'Link'), Math.floor(l.ageDays), sar(l.revenue), sar(l.base), sar(l.amount), sar(l.paid), sar(l.owed), STATE_TEXT[l.state][lang]]);
  const t = partnerTotals(lines, p.id);
  return [[`${p.name} · ${p.code}`], head, ...rows, [], [lang === 'ar' ? 'الإجمالي المدفوع' : 'Total paid', sar(t.paid)], [lang === 'ar' ? 'معتمد غير مدفوع' : 'Approved unpaid', sar(t.approved)], [lang === 'ar' ? 'معلّق' : 'Pending', sar(t.pending)]]
    .map((r) => r.map(csvCell).join(',')).join('\n');
}

/* Influencer collaborations: the merchant's brief, deliverables with dates, gifted products (zero-priced manual orders), cost and results. */
export type DeliverableKind = 'post' | 'story' | 'reel' | 'video' | 'live';
export const DELIVERABLE_KINDS: DeliverableKind[] = ['post', 'story', 'reel', 'video', 'live'];
export interface Deliverable { id: string; kind: DeliverableKind; platform: SocialPlatform; due: string; done?: { at: string; url?: string }; missed?: boolean }
export interface Collab {
  id: string; partnerId: string; title: string; brief: string; starts: string; ends: string;
  /** What the merchant pays the influencer (halalas), entered by the merchant. */
  fee: number;
  deliverables: Deliverable[];
  /** Zero-priced manual orders sent as gifts; `value` = cost of the goods (product cost, else price before VAT). */
  gifts: { ref: string; value: number }[];
  status: 'active' | 'done' | 'cancelled'; createdAt: string; by: string; example?: boolean;
}
export type DeliverableState = 'planned' | 'due' | 'late' | 'delivered' | 'missed';
export function deliverableState(d: Deliverable, today: string): DeliverableState {
  if (d.done) return 'delivered';
  if (d.missed) return 'missed';
  if (d.due < today) return 'late';
  return d.due === today ? 'due' : 'planned';
}
export interface CollabDraft { title: string; brief: string; starts: string; ends: string; fee: string; deliverables: { kind: DeliverableKind; platform: SocialPlatform; due: string }[] }
export type CollabError = 'title' | 'dates' | 'fee' | 'deliverables' | 'due';
export function validateCollab(d: CollabDraft): CollabError[] {
  const e: CollabError[] = [];
  if (d.title.trim().length < 3) e.push('title');
  if (!d.starts || !d.ends || d.ends < d.starts) e.push('dates');
  if (d.fee.trim() && !(numIn(d.fee) >= 0)) e.push('fee');
  if (!d.deliverables.length) e.push('deliverables');
  if (d.deliverables.some((x) => !x.due || x.due < d.starts || x.due > d.ends)) e.push('due');
  return e;
}
export function collabFromDraft(d: CollabDraft, id: string, partnerId: string, by: string, today: string): Collab {
  return {
    id, partnerId, title: d.title.trim(), brief: d.brief.trim(), starts: d.starts, ends: d.ends, fee: d.fee.trim() ? Math.round(numIn(d.fee) * 100) : 0,
    deliverables: d.deliverables.map((x, i) => ({ id: `${id}-D${i + 1}`, kind: x.kind, platform: x.platform, due: x.due })), gifts: [], status: 'active', createdAt: today, by,
  };
}
/** Results of a collaboration: orders credited to the influencer from its start to 7 days after it ends, and the return on its cost. */
export function collabResults(c: Collab, lines: CommissionLine[], orders: Order[], now: number, today: string) {
  const dayOf = (ref: string) => { const o = orders.find((x) => x.ref === ref); return o ? new Date(now - orderAgeDays(o, now) * AFF_DAY + 3 * 3_600_000).toISOString().slice(0, 10) : ''; };
  const end = new Date(Date.parse(`${c.ends}T00:00:00Z`) + 7 * AFF_DAY).toISOString().slice(0, 10);
  const mine = lines.filter((l) => l.partnerId === c.partnerId && l.state !== 'reversed' && dayOf(l.ref) >= c.starts && dayOf(l.ref) <= end);
  const revenue = mine.reduce((s, l) => s + l.revenue, 0);
  const commission = mine.reduce((s, l) => s + l.amount, 0);
  const gifts = c.gifts.reduce((s, g) => s + g.value, 0);
  const cost = c.fee + gifts + commission;
  const delivered = c.deliverables.filter((d) => deliverableState(d, today) === 'delivered').length;
  return { orders: mine.length, revenue, commission, gifts, fee: c.fee, cost, roi: cost > 0 ? (revenue - cost) / cost : null, delivered, total: c.deliverables.length, late: c.deliverables.filter((d) => deliverableState(d, today) === 'late').length };
}

/* Fixtures: one example affiliate and one example influencer, labelled «مثال», credited with a few existing orders. */
export function commissionRulesFixture(): CommissionRules {
  return { base: { kind: 'percent', value: 10 }, byCategory: {}, excludeCategories: [], excludeProducts: [], cookieDays: 30, minPayout: 10000, version: 1, by: 'مثال للتجربة', at: '2026-11-01' };
}
export function partnerFixtures(): Partner[] {
  return [
    { id: 'AF-EX1', kind: 'affiliate', name: 'مسوّق تجريبي', email: 'affiliate@example.com', handles: [], code: 'EXAMPLE', rate: undefined, status: 'active', addedAt: '2026-10-01', by: 'مثال للتجربة', example: true },
    { id: 'IN-EX1', kind: 'influencer', name: 'حساب مؤثر تجريبي', handles: [{ platform: 'instagram', handle: '@example' }], code: 'EXAMPLEIG', rate: null, status: 'active', addedAt: '2026-11-10', by: 'مثال للتجربة', example: true },
  ];
}
export function attributionFixtures(orders: Order[], rules = commissionRulesFixture()): Attribution[] {
  const { base, byCategory, excludeCategories, excludeProducts } = rules;
  const r = { base, byCategory, excludeCategories, excludeProducts };
  const paid = orders.filter((o) => o.pay !== 'failed' && !o.cancelled && !o.manual);
  const pick = (from: number, to: number, step: number, n: number) => paid.filter((o) => o.hoursAgo >= from && o.hoursAgo <= to).filter((_, i) => i % step === 0).slice(0, n);
  const aff = [...pick(0, 300, 9, 4), ...pick(400, 900, 11, 5)];
  const inf = pick(100, 330, 13, 3).filter((o) => !aff.includes(o));
  return [
    ...aff.map((o, i): Attribution => ({ ref: o.ref, partnerId: 'AF-EX1', via: i % 3 === 0 ? 'code' : 'link', at: 0, rules: r })),
    ...inf.map((o): Attribution => ({ ref: o.ref, partnerId: 'IN-EX1', via: 'link', at: 0, rules: r, rate: null })),
  ];
}
export function collabFixtures(): Collab[] {
  return [{
    id: 'CO-EX1', partnerId: 'IN-EX1', title: 'حملة عطور الشتاء', brief: 'مثال للتجربة: مراجعة صادقة لعطر العود مع ذكر الرابط.', starts: '2026-11-10', ends: '2026-11-30', fee: 50000,
    deliverables: [
      { id: 'CO-EX1-D1', kind: 'reel', platform: 'instagram', due: '2026-11-15', done: { at: '2026-11-15' } },
      { id: 'CO-EX1-D2', kind: 'story', platform: 'instagram', due: '2026-11-22' },
      { id: 'CO-EX1-D3', kind: 'post', platform: 'instagram', due: '2026-11-28' },
    ],
    gifts: [], status: 'active', createdAt: '2026-11-10', by: 'مثال للتجربة', example: true,
  }];
}
