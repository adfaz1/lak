// Workspace domain: new-store setup checklist, evidence-based assistant answers, and fixtures for
// settings, team, themes, apps and help. Pure functions; the UI keeps state in stores.
import { people, total, VIEWS, type L, type LocId, type Order } from './domain';
import { available, coverage, type Coverage, type History, type Level } from './inventory';
import { summarize, type DayStat } from './growth';
import type { Plan } from './finance';
import type { Page, Role } from './perms';

/* ---------- New-store setup (QA01) ---------- */

export type StepId = 'business' | 'product' | 'payment' | 'shipping' | 'domain' | 'policies' | 'test';
export const STEP_IDS: StepId[] = ['business', 'product', 'payment', 'shipping', 'domain', 'policies', 'test'];
/** entered = data saved; verifying = waiting on an external check; ready = verified or needs no verification. */
export type StepState = 'todo' | 'entered' | 'verifying' | 'ready' | 'rejected';
export interface SetupStep { id: StepId; state: StepState; value: string }

export const setupFixture = (): SetupStep[] => STEP_IDS.map((id) => ({ id, state: id === 'business' ? 'entered' : 'todo', value: id === 'business' ? 'Demo Trading Est.' : '' }));

/** Steps whose data must be checked by someone else before they count as ready. */
const VERIFIED: StepId[] = ['business', 'payment'];

const put = (steps: SetupStep[], id: StepId, state: StepState, value?: string) =>
  steps.map((s) => (s.id === id ? { ...s, state, value: value ?? s.value } : s));

export function enterStep(steps: SetupStep[], id: StepId, value: string): SetupStep[] {
  if (id === 'test') return steps;
  if (id === 'domain') return put(steps, id, value.startsWith('custom:') ? 'verifying' : 'ready', value);
  return put(steps, id, VERIFIED.includes(id) ? 'entered' : 'ready', value);
}
export function submitStep(steps: SetupStep[], id: StepId): SetupStep[] {
  const s = steps.find((x) => x.id === id);
  return s && (s.state === 'entered' || s.state === 'rejected') && VERIFIED.includes(id) ? put(steps, id, 'verifying') : steps;
}
export function verifyStep(steps: SetupStep[], id: StepId, ok: boolean): SetupStep[] {
  const s = steps.find((x) => x.id === id);
  return s?.state === 'verifying' ? put(steps, id, ok ? 'ready' : 'rejected') : steps;
}
export function setupSummary(steps: SetupStep[]) {
  const ready = (id: StepId) => steps.find((s) => s.id === id)?.state === 'ready';
  return {
    ready: steps.filter((s) => s.state === 'ready').length,
    verifying: steps.filter((s) => s.state === 'verifying').length,
    total: steps.length,
    canTest: ready('product') && ready('payment') && ready('shipping'),
    next: steps.find((s) => s.state !== 'ready' && s.state !== 'verifying')?.id ?? null,
  };
}
export function placeTestOrder(steps: SetupStep[]): SetupStep[] {
  return setupSummary(steps).canTest ? put(steps, 'test', 'ready', 'SIM-T-0001') : steps;
}

/* ---------- Assistant answers (deterministic, from fixtures) ---------- */

export function lateAnswer(orders: Order[]) {
  const late = orders.filter(VIEWS.late).sort((a, b) => b.hoursAgo - a.hoursAgo);
  return { count: late.length, oldest: late[0]?.hoursAgo ?? 0, refs: late.map((o) => o.ref) };
}

export interface StockRisk { sku: string; total: number; cov: Coverage; byLoc: Record<LocId, number> }
export function stockAnswer(levels: Level[], history: History[]) {
  const skus = [...new Set(history.map((h) => h.sku))];
  const rows: StockRisk[] = skus.map((sku) => {
    const ls = levels.filter((l) => l.sku === sku);
    const byLoc = { ryd: 0, jed: 0 } as Record<LocId, number>;
    ls.forEach((l) => { byLoc[l.loc] = available(l); });
    const total = ls.reduce((s, l) => s + available(l), 0);
    return { sku, total, cov: coverage(total, history.find((h) => h.sku === sku)), byLoc };
  });
  const atRisk = rows.filter((r) => r.cov.kind === 'days' && r.cov.days < 14).sort((a, b) => (a.cov.kind === 'days' && b.cov.kind === 'days' ? a.cov.days - b.cov.days : 0));
  const unknown = rows.filter((r) => r.cov.kind !== 'days');
  // One proposal: move units to the location that has none, from the one that has the most, for the most urgent SKU.
  let proposal: { sku: string; from: LocId; to: LocId; qty: number } | null = null;
  const top = atRisk[0];
  if (top) {
    const from: LocId = top.byLoc.ryd >= top.byLoc.jed ? 'ryd' : 'jed';
    const to: LocId = from === 'ryd' ? 'jed' : 'ryd';
    const qty = Math.floor(top.byLoc[from] / 2);
    if (qty > 0 && top.byLoc[to] < top.byLoc[from]) proposal = { sku: top.sku, from, to, qty };
  }
  return { atRisk, unknown, proposal };
}

/** Conversion needs session data; with more than two of the last seven days missing, the honest answer is "insufficient". */
export function conversionAnswer(series: DayStat[]) {
  const cur = series.slice(-7);
  const prev = series.slice(-14, -7);
  const missing = cur.filter((d) => d.sessions === null).length;
  if (missing > 2) return { kind: 'insufficient' as const, missing, days: cur.length };
  return { kind: 'answer' as const, cur: summarize(cur).conversion, prev: summarize(prev).conversion };
}

/* ---------- Settings fixtures ---------- */

export type ProviderState = 'not_connected' | 'pending' | 'active' | 'action_required';
export interface Provider { id: string; name: L; kind: L; minPlan: Plan; state: ProviderState }
export function providerFixtures(): Provider[] {
  const k = (ar: string, en: string): L => ({ ar, en });
  return [
    { id: 'cod', name: k('الدفع عند الاستلام', 'Cash on delivery'), kind: k('يدوي', 'Manual'), minPlan: 'basic', state: 'active' },
    { id: 'bank', name: k('تحويل بنكي', 'Bank transfer'), kind: k('يدوي', 'Manual'), minPlan: 'basic', state: 'active' },
    { id: 'mada', name: k('مدى', 'Mada'), kind: k('بطاقات محلية', 'Local cards'), minPlan: 'plus', state: 'pending' },
    { id: 'cards', name: k('فيزا / ماستركارد', 'Visa / Mastercard'), kind: k('بطاقات دولية', 'International cards'), minPlan: 'plus', state: 'not_connected' },
    { id: 'applepay', name: k('Apple Pay', 'Apple Pay'), kind: k('محفظة', 'Wallet'), minPlan: 'plus', state: 'not_connected' },
    { id: 'stcpay', name: k('STC Pay', 'STC Pay'), kind: k('محفظة', 'Wallet'), minPlan: 'plus', state: 'action_required' },
    { id: 'tabby', name: k('تابي', 'Tabby'), kind: k('اشترِ الآن وادفع لاحقًا', 'Buy now, pay later'), minPlan: 'plus', state: 'not_connected' },
    { id: 'tamara', name: k('تمارا', 'Tamara'), kind: k('اشترِ الآن وادفع لاحقًا', 'Buy now, pay later'), minPlan: 'plus', state: 'not_connected' },
    { id: 'amex', name: k('أمريكان إكسبريس', 'American Express'), kind: k('بطاقات دولية', 'International cards'), minPlan: 'plus', state: 'not_connected' },
    { id: 'mispay', name: k('MIS Pay', 'MIS Pay'), kind: k('اشترِ الآن وادفع لاحقًا', 'Buy now, pay later'), minPlan: 'plus', state: 'not_connected' },
    { id: 'madfu', name: k('مدفوع', 'Madfu'), kind: k('اشترِ الآن وادفع لاحقًا', 'Buy now, pay later'), minPlan: 'plus', state: 'not_connected' },
    { id: 'emkan', name: k('إمكان', 'Emkan'), kind: k('تمويل المشتريات', 'Purchase financing'), minPlan: 'plus', state: 'not_connected' },
    { id: 'mokafaa', name: k('مكافأة', 'Mokafaa'), kind: k('الدفع بنقاط الولاء', 'Pay with loyalty points'), minPlan: 'pro', state: 'not_connected' },
    { id: 'paypal', name: k('PayPal', 'PayPal'), kind: k('محفظة دولية', 'International wallet'), minPlan: 'pro', state: 'not_connected' },
  ];
}

export interface Zone { id: string; name: L; cities: L; rateType: 'flat' | 'weight'; rate: number; perKg: number; freeOver: number | null }
export function zoneFixtures(): Zone[] {
  return [
    { id: 'z1', name: { ar: 'منطقة الرياض', en: 'Riyadh region' }, cities: { ar: 'الرياض، الخرج، الدرعية', en: 'Riyadh, Al Kharj, Diriyah' }, rateType: 'flat', rate: 2500, perKg: 0, freeOver: 30000 },
    { id: 'z2', name: { ar: 'المنطقة الغربية', en: 'Western region' }, cities: { ar: 'جدة، مكة، المدينة، الطائف', en: 'Jeddah, Makkah, Madinah, Taif' }, rateType: 'flat', rate: 2500, perKg: 0, freeOver: null },
    { id: 'z3', name: { ar: 'بقية المملكة', en: 'Rest of Saudi Arabia' }, cities: { ar: 'كل المدن الأخرى', en: 'All other cities' }, rateType: 'weight', rate: 2500, perKg: 500, freeOver: null },
  ];
}

export type DomainState = 'none' | 'pending' | 'verified' | 'failed';
export interface DomainSettings { slug: string; host: string; state: DomainState; checks: number }
export const domainFixture = (): DomainSettings => ({ slug: 'dar-nuwa', host: '', state: 'none', checks: 0 });
export const validSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 40;
export const validHost = (s: string) => /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(s.trim().toLowerCase()) && !s.includes('..');

export type PolicyId = 'returns' | 'shipping' | 'privacy' | 'terms';
/**
 * A policy in both store languages. `text` is the working copy the merchant edits; `live` is what shoppers see
 * (null until first published). Saving a draft never changes `live`. `state` is 'published' while a live text exists.
 */
export interface Policy { id: PolicyId; text: L; live: L | null; state: 'missing' | 'draft' | 'published' }
const pl = (ar: string, en: string): L => ({ ar, en });
export const policyFixtures = (): Policy[] => {
  const returns = pl('نقبل الإرجاع خلال 14 يومًا من الاستلام للقطع غير الملبوسة وبحالتها الأصلية.', 'Returns are accepted within 14 days of delivery for unworn items in their original condition.');
  return [
    { id: 'returns', state: 'published', text: returns, live: returns },
    { id: 'shipping', state: 'draft', text: pl('نجهّز الطلبات خلال يومي عمل.', 'Orders are prepared within 2 working days.'), live: null },
    { id: 'privacy', state: 'missing', text: pl('', ''), live: null },
    { id: 'terms', state: 'missing', text: pl('', ''), live: null },
  ];
};
/** Policies saved by an earlier version kept one plain string; read them as the same text in both languages. */
export function normPolicy(p: Policy | (Omit<Policy, 'text' | 'live'> & { text: string | L; live?: L | null })): Policy {
  const text: L = typeof p.text === 'string' ? { ar: p.text, en: p.text } : p.text;
  const live = p.live !== undefined ? p.live : p.state === 'published' ? text : null;
  return { id: p.id, state: p.state, text, live };
}
/** The published text a shopper reads in their language, falling back to the other language; '' when unpublished. */
export function livePolicyText(p: Policy | undefined, lang: 'ar' | 'en'): string {
  if (!p) return '';
  const live = normPolicy(p).live;
  if (!live) return '';
  return live[lang].trim() || live[lang === 'ar' ? 'en' : 'ar'].trim();
}

export type NotifyEvent = 'newOrder' | 'paymentFailed' | 'lowStock' | 'payout' | 'review';
export const NOTIFY_EVENTS: NotifyEvent[] = ['newOrder', 'paymentFailed', 'lowStock', 'payout', 'review'];
export type Notify = Record<NotifyEvent, { email: boolean; sms: boolean }>;
export const notifyFixture = (): Notify => ({
  newOrder: { email: true, sms: false }, paymentFailed: { email: true, sms: true }, lowStock: { email: true, sms: false },
  payout: { email: true, sms: false }, review: { email: false, sms: false },
});

export type SocialId = 'instagram' | 'x' | 'tiktok' | 'snapchat' | 'facebook' | 'linkedin' | 'youtube';
export const SOCIAL_IDS: SocialId[] = ['instagram', 'x', 'tiktok', 'snapchat', 'facebook', 'linkedin', 'youtube'];
export interface StoreDetails {
  name: string; category: string; email: string; phone: string; timezone: string; weightUnit: 'g' | 'kg';
  /** Social profile links shown in the store footer (BP-P03-STP-019). Optional: sessions saved earlier have none. */
  social?: Partial<Record<SocialId, string>>;
}
export const storeFixture = (): StoreDetails => ({ name: 'دار نُوى', category: 'fashion', email: 'owner@darnuwa.test', phone: '+966 5x xxx 0123', timezone: 'Asia/Riyadh', weightUnit: 'kg' });
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export interface StoreStatus { published: boolean; accepting: boolean; maintenance: boolean; message: string }
export const statusFixture = (): StoreStatus => ({ published: true, accepting: true, maintenance: false, message: '' });

/* ---------- Team ---------- */

export type MemberStatus = 'active' | 'invited' | 'expired';
export interface Member { id: string; name: string; email: string; role: Role; status: MemberStatus }
export const teamFixture = (): Member[] => [
  { id: 'u1', name: 'سارة', email: 'owner@darnuwa.test', role: 'owner', status: 'active' },
  { id: 'u2', name: 'فيصل', email: 'faisal@darnuwa.test', role: 'fulfilment', status: 'active' },
  { id: 'u3', name: 'هدى', email: 'huda@darnuwa.test', role: 'finance', status: 'invited' },
];
/** Seats in use: active members and pending invites count; expired invites do not. */
export const seatsUsed = (m: Member[]) => m.filter((x) => x.status !== 'expired').length;

/* ---------- Themes ---------- */

export type SectionKind = 'announcement' | 'hero' | 'featured' | 'categories' | 'offers' | 'video' | 'newsletter'
  | 'grid' | 'banner' | 'testimonials' | 'richtext';
export interface Section {
  id: string; kind: SectionKind; visible: boolean; heading: string;
  /* Additive, per kind (store identity, BP-P03-STP-004/005/006). Absent on sections saved earlier. */
  /** Short text under the heading (hero, banner) or the paragraphs of a rich-text section. */
  body?: string;
  /** Where the section leads: a store path ("/c/abayas") or an https:// link. */
  link?: string;
  /** Picture: "p:<productId>" (a product photo) or "m:<mediaId>" (an upload kept in the session). */
  image?: string;
  /** Product grid source: "cat:<slug>" or "col:<collectionId>". */
  source?: string;
  /** Announcement bar colours (#rrggbb) and schedule (yyyy-mm-dd, Riyadh day, inclusive). */
  bg?: string; fg?: string; start?: string; end?: string;
}
/** The store's look (BP-P03-STP-004/005): logo, favicon, brand colour, button shape, typeface and header layout. */
export type ButtonStyle = 'soft' | 'pill' | 'square';
export type StoreFont = 'plex' | 'system' | 'naskh';
export type HeaderLayout = 'classic' | 'centered' | 'minimal';
export interface StoreIdentity {
  /** "m:<mediaId>" references to session uploads, or null for the store name / default icon. */
  logo: string | null; favicon: string | null;
  accent: string; button: ButtonStyle; font: StoreFont; header: HeaderLayout;
}
export const identityFixture = (): StoreIdentity => ({ logo: null, favicon: null, accent: '#84603d', button: 'soft', font: 'plex', header: 'classic' });
/** `identity` and `draftIdentity` are optional so sessions saved before identity existed keep working (fixture look). */
export interface ThemeVersion { version: number; sections: Section[]; note: string; identity?: StoreIdentity }
export interface ThemeState { published: ThemeVersion; draft: Section[]; history: ThemeVersion[]; draftIdentity?: StoreIdentity }

export function themeFixture(): ThemeState {
  const sections: Section[] = [
    { id: 's1', kind: 'announcement', visible: true, heading: 'توصيل مجاني للطلبات من 300 ر.س في منطقة الرياض' },
    { id: 's2', kind: 'hero', visible: true, heading: 'تشكيلة العبايات المطرّزة' },
    { id: 's3', kind: 'featured', visible: true, heading: 'الأكثر مبيعًا' },
    { id: 's4', kind: 'categories', visible: true, heading: 'تسوّق حسب الفئة' },
    { id: 's5', kind: 'offers', visible: false, heading: 'عروض هذا الأسبوع' },
    { id: 's6', kind: 'video', visible: false, heading: 'كيف نصنع عباياتنا' },
    { id: 's7', kind: 'newsletter', visible: true, heading: 'كوني أول من يعرف بالجديد' },
  ];
  const v6: ThemeVersion = { version: 6, note: 'تحديث البانر', sections: sections.map((s) => (s.id === 's2' ? { ...s, heading: 'وصل حديثًا لموسم الخريف' } : s)) };
  const v7: ThemeVersion = { version: 7, note: 'تشكيلة المطرّزات', sections };
  return { published: v7, draft: sections.map((s) => ({ ...s })), history: [v7, v6] };
}

export type SectionChange = { id: string; kind: 'moved' | 'shown' | 'hidden' | 'edited' | 'unchanged' };
export function diffSections(pub: Section[], draft: Section[]): SectionChange[] {
  return draft.map((d, i) => {
    const p = pub.find((x) => x.id === d.id);
    if (!p) return { id: d.id, kind: 'edited' };
    if (p.visible !== d.visible) return { id: d.id, kind: d.visible ? 'shown' : 'hidden' };
    if (p.heading !== d.heading) return { id: d.id, kind: 'edited' };
    if (pub.indexOf(p) !== i) return { id: d.id, kind: 'moved' };
    return { id: d.id, kind: 'unchanged' };
  });
}
export function moveSection(list: Section[], id: string, dir: -1 | 1): Section[] {
  const i = list.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
export function publishTheme(t: ThemeState, note: string): ThemeState {
  const identity = t.draftIdentity ?? t.published.identity;
  const v: ThemeVersion = { version: Math.max(...t.history.map((h) => h.version)) + 1, sections: t.draft.map((s) => ({ ...s })), note, ...(identity ? { identity: { ...identity } } : {}) };
  return { ...t, published: v, draft: t.draft, history: [v, ...t.history] };
}
/** Roll back by publishing a copy of an earlier version as a new version; history is never rewritten. */
export function rollbackTheme(t: ThemeState, version: number): ThemeState {
  const old = t.history.find((h) => h.version === version);
  if (!old) return t;
  const v: ThemeVersion = { version: Math.max(...t.history.map((h) => h.version)) + 1, sections: old.sections.map((s) => ({ ...s })), note: `Rollback to v${version}`, ...(old.identity ? { identity: { ...old.identity } } : {}) };
  return { published: v, draft: old.sections.map((s) => ({ ...s })), history: [v, ...t.history], ...(old.identity ? { draftIdentity: { ...old.identity } } : {}) };
}

/* ---------- Apps ---------- */

export type AppState = 'not_connected' | 'connected' | 'reauth' | 'error';
export type Scope = 'orders.read' | 'orders.write' | 'customers.read' | 'products.read' | 'products.write' | 'inventory.read' | 'messages.send';
export const PERSONAL_SCOPES: Scope[] = ['customers.read', 'orders.read', 'messages.send'];
export interface App { id: string; name: L; desc: L; category: L; scopes: Scope[]; minPlan: Plan; state: AppState; lastSync: L | null }
export function appFixtures(): App[] {
  const k = (ar: string, en: string): L => ({ ar, en });
  return [
    { id: 'acc', name: k('مزامنة محاسبية (نموذج)', 'Accounting sync (sample)'), desc: k('يرسل الطلبات والرسوم إلى برنامج محاسبة.', 'Sends orders and fees to an accounting tool.'), category: k('مالية', 'Finance'), scopes: ['orders.read', 'products.read'], minPlan: 'plus', state: 'connected', lastSync: k('قبل 20 دقيقة', '20 minutes ago') },
    { id: 'wa', name: k('إشعارات واتساب (نموذج)', 'WhatsApp notifications (sample)'), desc: k('يرسل تأكيد الطلب للعميل الموافق.', 'Sends order confirmations to consenting customers.'), category: k('تواصل', 'Messaging'), scopes: ['orders.read', 'customers.read', 'messages.send'], minPlan: 'basic', state: 'reauth', lastSync: k('أمس', 'Yesterday') },
    { id: 'ga', name: k('Google Analytics 4 (نموذج)', 'Google Analytics 4 (sample)'), desc: k('يرسل أحداث الزيارة والشراء عند موافقة الزائر.', 'Sends visit and purchase events when the visitor consents.'), category: k('تحليلات', 'Analytics'), scopes: ['orders.read', 'products.read'], minPlan: 'basic', state: 'not_connected', lastSync: null },
    { id: 'rev', name: k('مستورد التقييمات (نموذج)', 'Reviews importer (sample)'), desc: k('يستورد تقييمات المنتجات من ملف.', 'Imports product reviews from a file.'), category: k('تقييمات', 'Reviews'), scopes: ['products.read', 'products.write'], minPlan: 'basic', state: 'error', lastSync: k('قبل يومين', '2 days ago') },
    { id: 'erp', name: k('ربط مستودعات متقدم (نموذج)', 'Advanced warehouse link (sample)'), desc: k('يزامن المخزون مع نظام مستودعات خارجي.', 'Syncs stock with an external warehouse system.'), category: k('مخزون', 'Inventory'), scopes: ['inventory.read', 'orders.read', 'orders.write'], minPlan: 'pro', state: 'not_connected', lastSync: null },
  ];
}

/* ---------- Help ---------- */

export interface Article { id: string; page: Page; title: L; steps: L[] }
export function articles(): Article[] {
  const a = (id: string, page: Page, tAr: string, tEn: string, steps: [string, string][]): Article => ({ id, page, title: { ar: tAr, en: tEn }, steps: steps.map(([ar, en]) => ({ ar, en })) });
  return [
    a('h1', 'orders', 'تجهيز طلب من مستودعين', 'Fulfil an order from two warehouses', [['افتح الطلب واختر الموقع.', 'Open the order and choose a location.'], ['حدد الكمية لكل سطر من المتوفر في ذلك الموقع.', 'Pick quantities per line from what that location has.'], ['راجع ثم أصدر الملصق. كرر للموقع الثاني.', 'Review, then issue the label. Repeat for the second location.']]),
    a('h2', 'orders', 'رد مبلغ وإعادة المخزون', 'Refund and restock', [['من تفاصيل الطلب اختر «استرداد».', 'From the order, choose “Refund”.'], ['حدد الأسطر والكميات؛ إعادة المخزون قرار منفصل.', 'Pick lines and quantities; restocking is a separate decision.'], ['أكد المبلغ. يبقى الاسترداد معلقًا حتى يؤكده مزود الدفع.', 'Confirm the amount. The refund stays pending until the provider confirms.']]),
    a('h3', 'products', 'استيراد منتجات من ملف CSV', 'Import products from CSV', [['نزّل الملف النموذجي.', 'Download the template.'], ['ارفع ملفك وطابق الأعمدة.', 'Upload your file and map the columns.'], ['راجع الأخطاء والمكرر واختر سياسة التعارض ثم أكد.', 'Review errors and duplicates, choose a conflict policy, then confirm.']]),
    a('h4', 'inventory', 'تحويل مخزون بين المستودعات', 'Transfer stock between warehouses', [['أنشئ مسودة تحويل.', 'Create a transfer draft.'], ['أرسلها: تخرج الوحدات من المصدر وتظهر «واردة» في الوجهة.', 'Send it: units leave the source and show as incoming at the destination.'], ['استلم كليًا أو جزئيًا، وأغلق الفرق بسبب.', 'Receive fully or partly, and close any discrepancy with a reason.']]),
    a('h5', 'finance', 'قراءة كشف التسوية', 'Read a payout statement', [['المحصل − الرسوم − الاستردادات ± التسويات = الصافي.', 'Collected − fees − refunds ± adjustments = net.'], ['كل بند يفتح الحركات المكوّنة له.', 'Every line opens the transactions behind it.']]),
    a('h6', 'settings', 'دعوة موظف وتحديد دوره', 'Invite a team member with a role', [['الإعدادات ← الفريق والصلاحيات.', 'Settings → Team & permissions.'], ['أدخل البريد واختر الدور ثم أرسل الدعوة.', 'Enter the email, choose a role, send the invite.']]),
    a('h7', 'marketing', 'إنشاء كوبون ومعاينته', 'Create and preview a coupon', [['حدد النوع والقيمة والحدود.', 'Set type, value and limits.'], ['راجع التعارضات ومعاينة طلب مثال قبل التفعيل.', 'Check conflicts and the sample order preview before activating.']]),
  ];
}

/* ---------- Customers ---------- */

export interface Customer {
  id: string; name: L; city: L; email: string; phone: string; consent: { email: boolean; sms: boolean }; since: string;
  /** Blocked from placing new orders in this store, with the reason and who decided. */
  blocked?: { reason: string; by: string; at: string };
}
export function customerFixtures(): Customer[] {
  const list = [...people(), { name: { ar: 'لمى الزهراني', en: 'Lama Alzahrani' }, city: { ar: 'الطائف', en: 'Taif' } }];
  return list.map((p, i) => ({
    id: `C-${1001 + i}`, name: p.name, city: p.city,
    email: `customer${1001 + i}@example.test`, phone: `+966 50 000 ${String(1001 + i).slice(-4)}`,
    consent: { email: i % 3 !== 2, sms: i % 4 === 0 }, since: `202${4 + (i % 3)}-0${1 + (i % 9)}-1${i % 9}`,
  }));
}
export type Segment = 'returning' | 'new' | 'highValue' | 'emailConsent';
export const SEGMENTS: Segment[] = ['returning', 'new', 'highValue', 'emailConsent'];
export function customerStats(c: Customer, orders: Order[]) {
  // Orders from the online store carry the customer id; older fixtures are matched by name.
  const mine = orders.filter((o) => (o.customerId ? o.customerId === c.id : o.customer.en === c.name.en));
  const paid = mine.filter((o) => o.pay !== 'failed');
  const spent = paid.reduce((s, o) => s + total(o) - o.refunds.filter((r) => r.status === 'confirmed').reduce((a, r) => a + r.amount, 0), 0);
  return { orders: mine, paidCount: paid.length, spent };
}
/* ---------- Custom segments (rules the merchant saves) ---------- */

export type SegField = 'spent' | 'orders' | 'lastDays' | 'city' | 'emailConsent' | 'smsConsent' | 'product';
export type SegOp = 'gte' | 'lte' | 'is';
export interface SegRule { field: SegField; op: SegOp; value: string }
export interface SavedSegment { id: string; name: L; rules: SegRule[]; by: string; at: string }
export const SEG_FIELDS: SegField[] = ['spent', 'orders', 'lastDays', 'city', 'emailConsent', 'smsConsent', 'product'];
/** Operators each field takes. Numbers compare; city, consent and product are equality. */
export const SEG_OPS: Record<SegField, SegOp[]> = { spent: ['gte', 'lte'], orders: ['gte', 'lte'], lastDays: ['lte', 'gte'], city: ['is'], emailConsent: ['is'], smsConsent: ['is'], product: ['is'] };
const latin = (x: string) => x.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim();
export function segRuleError(r: SegRule): boolean {
  if (!SEG_OPS[r.field].includes(r.op)) return true;
  if (r.field === 'spent' || r.field === 'orders' || r.field === 'lastDays') { const n = Number(latin(r.value)); return !/^\d+$/.test(latin(r.value)) || (r.field !== 'spent' && r.field !== 'lastDays' && n < 0); }
  if (r.field === 'emailConsent' || r.field === 'smsConsent') return r.value !== 'yes' && r.value !== 'no';
  return !r.value.trim();
}
/**
 * Whether a customer matches every rule. Spend is in riyals (paid orders after confirmed refunds); "last order"
 * is days since the most recent order (customers with none never match it); product matches a SKU prefix bought.
 */
export function matchesRules(c: Customer, st: { orders: Order[]; paidCount: number; spent: number }, rules: SegRule[]): boolean {
  return rules.every((r) => {
    const v = latin(r.value);
    const cmp = (x: number, y: number) => (r.op === 'gte' ? x >= y : x <= y);
    switch (r.field) {
      case 'spent': return cmp(st.spent, Number(v) * 100);
      case 'orders': return cmp(st.paidCount, Number(v));
      case 'lastDays': {
        if (!st.orders.length) return false;
        return cmp(Math.floor(Math.min(...st.orders.map((o) => o.hoursAgo)) / 24), Number(v));
      }
      case 'city': return c.city.en.toLowerCase() === v.toLowerCase() || c.city.ar === v;
      case 'emailConsent': return c.consent.email === (v === 'yes');
      case 'smsConsent': return c.consent.sms === (v === 'yes');
      case 'product': return st.orders.some((o) => o.pay !== 'failed' && o.items.some((it) => it.sku.toUpperCase().startsWith(v.toUpperCase())));
    }
  });
}
export const segmentFixtures = (): SavedSegment[] => [
  { id: 'SG-1', name: { ar: 'منفقون غابوا 30 يومًا', en: 'Big spenders away 30 days' }, rules: [{ field: 'spent', op: 'gte', value: '2000' }, { field: 'lastDays', op: 'gte', value: '30' }], by: 'المالك', at: '2026-11-10' },
];

/** Segments are rules over order history and consent; nothing is inferred about age, gender or credit. */
export function segmentsOf(c: Customer, s: { paidCount: number; spent: number }): Segment[] {
  const out: Segment[] = [];
  if (s.paidCount >= 2) out.push('returning');
  if (s.paidCount === 1) out.push('new');
  if (s.spent >= 1000000) out.push('highValue');
  if (c.consent.email) out.push('emailConsent');
  return out;
}

/* ---------- Shipping setup: methods, carriers, rules, delivery promises, international readiness, COD ---------- */
// Additive (shipping group). The rules engine lives in dashboard/settings/shipping-model.ts; the online store reads
// the same setup at checkout and on product pages (storefront/bridge.ts). Carriers are simulated.

/** Delivery categories a method belongs to. `sameday` = same-day in selected cities; `cold` = refrigerated. */
export type ShipCat = 'standard' | 'express' | 'economy' | 'sameday' | 'cold' | 'intl' | 'pickup';
export const SHIP_CATS: ShipCat[] = ['standard', 'express', 'economy', 'sameday', 'cold', 'intl', 'pickup'];
/** A carrier as the store knows it (simulated account): cities served ('*' = all of Saudi Arabia), countries, base price, typical transit. */
export interface Carrier {
  id: string; name: L;
  /** City ids served in Saudi Arabia; ['*'] = every city. */
  cities: string[];
  /** ISO country codes served abroad; [] = domestic only. */
  countries: string[];
  /** Base price (halalas) for the first kg and each extra started kg. */
  price: number; perKg: number;
  /** Typical transit in business days after handover. */
  eta: [number, number];
  cod: boolean; cold: boolean;
  /** Connection state of the simulated account. */
  state: 'connected' | 'action_required';
}
export interface ShipMethodCfg {
  id: string; cat: ShipCat; name: L; on: boolean;
  /** Carrier id; null for showroom pickup. */
  carrier: string | null;
  /** Halalas for the first kg; null = the price of the shipping zone that covers the city. */
  price: number | null;
  perKg: number;
  /** Goods value (after discount) from which this method is free; null = never. */
  freeOver: number | null;
  /** Restrict to these city ids; [] = wherever the carrier goes. */
  cities: string[];
  /** Shown only when the cart holds one of these product categories (category keys); [] = any cart. */
  onlyCats: string[];
  /** Heaviest cart (kg) the method takes; null = no limit. */
  maxKg: number | null;
  /** Cash on delivery offered with this method (the carrier must also support it). */
  cod: boolean;
  /** Pickup only: the location shoppers collect from. */
  pickupLoc?: string;
}
/** When a rule applies: every condition given must hold. Money in halalas, weight in kg, categories as keys. */
export interface ShipWhen { cities?: string[]; cartMin?: number; cartMax?: number; kgMin?: number; kgMax?: number; cats?: string[]; cod?: boolean }
export type ShipThen = { kind: 'hide' } | { kind: 'free' } | { kind: 'price'; v: number } | { kind: 'surcharge'; v: number };
export interface ShipRule { id: string; name: L; on: boolean; /** Method ids; [] = every method. */ methods: string[]; when: ShipWhen; then: ShipThen }
/** Delivery promise per shipping zone: preparation days before handover, and extra transit days for remote areas. */
export interface ShipPromise { zoneId: string; handling: number; extra: number }
/** Customs data per product for international shipping. Weight comes from the product itself. */
export interface IntlData { hs: string; origin: string; descAr: string; descEn: string }
export interface CodRules { exceptCities: string[]; exceptCats: string[]; maxKg: number | null }
export interface ShippingSetup {
  carriers: Carrier[];
  methods: ShipMethodCfg[];
  rules: ShipRule[];
  promises: ShipPromise[];
  /** Same-day orders placed before this Riyadh hour leave today. */
  sameDayCutoff: number;
  intl: Record<string, IntlData>;
  cod: CodRules;
  /** Pick the shipping warehouse by the customer's zone. */
  autoWarehouse: boolean;
  warehouseByZone: Record<string, string>;
  /** Ask the recipient to confirm their mobile by code before a COD order is accepted (simulated). */
  verifyPhone: boolean;
}

export function shippingFixture(): ShippingSetup {
  const k = (ar: string, en: string): L => ({ ar, en });
  return {
    carriers: [
      { id: 'ca', name: k('ناقل تجريبي أ', 'Test carrier A'), cities: ['*'], countries: [], price: 2500, perKg: 500, eta: [2, 4], cod: true, cold: false, state: 'connected' },
      { id: 'cb', name: k('ناقل تجريبي ب', 'Test carrier B'), cities: ['riyadh', 'jeddah', 'dammam', 'khobar', 'makkah', 'madinah'], countries: [], price: 3900, perKg: 700, eta: [1, 1], cod: true, cold: false, state: 'connected' },
      { id: 'cc', name: k('مندوب المدينة', 'City courier'), cities: ['riyadh', 'jeddah'], countries: [], price: 4900, perKg: 0, eta: [0, 0], cod: false, cold: false, state: 'connected' },
      { id: 'cd', name: k('ناقل تجريبي ج · مبرّد', 'Test carrier C · chilled'), cities: ['riyadh', 'jeddah', 'dammam', 'khobar'], countries: [], price: 3500, perKg: 800, eta: [1, 2], cod: false, cold: true, state: 'connected' },
      { id: 'ce', name: k('ناقل تجريبي د · دولي', 'Test carrier D · international'), cities: [], countries: ['AE', 'KW', 'BH', 'QA', 'OM', 'JO', 'GB', 'US'], price: 6500, perKg: 2500, eta: [4, 7], cod: false, cold: false, state: 'action_required' },
    ],
    methods: [
      { id: 'standard', cat: 'standard', name: k('توصيل عادي', 'Standard delivery'), on: true, carrier: 'ca', price: null, perKg: 0, freeOver: null, cities: [], onlyCats: [], maxKg: null, cod: true },
      { id: 'express', cat: 'express', name: k('توصيل سريع', 'Express delivery'), on: true, carrier: 'cb', price: 3900, perKg: 700, freeOver: null, cities: [], onlyCats: [], maxKg: 20, cod: true },
      { id: 'economy', cat: 'economy', name: k('توصيل اقتصادي', 'Economy delivery'), on: false, carrier: 'ca', price: 1500, perKg: 300, freeOver: null, cities: [], onlyCats: [], maxKg: null, cod: false },
      { id: 'sameday', cat: 'sameday', name: k('توصيل في نفس اليوم', 'Same-day delivery'), on: true, carrier: 'cc', price: 4900, perKg: 0, freeOver: null, cities: ['riyadh'], onlyCats: [], maxKg: 10, cod: false },
      { id: 'cold', cat: 'cold', name: k('توصيل مبرّد للعطور', 'Chilled delivery for fragrance'), on: false, carrier: 'cd', price: 3500, perKg: 800, freeOver: null, cities: [], onlyCats: ['fragrance'], maxKg: 15, cod: false },
      { id: 'intl', cat: 'intl', name: k('شحن دولي', 'International shipping'), on: false, carrier: 'ce', price: 6500, perKg: 2500, freeOver: null, cities: [], onlyCats: [], maxKg: 30, cod: false },
      { id: 'pickup', cat: 'pickup', name: k('استلام من المعرض', 'Showroom pickup'), on: false, carrier: null, price: 0, perKg: 0, freeOver: null, cities: [], onlyCats: [], maxKg: null, cod: false, pickupLoc: 'ryd' },
    ],
    rules: [
      { id: 'r1', name: k('سريع مجاني فوق 500 ر.س في الرياض', 'Free express over SAR 500 in Riyadh'), on: true, methods: ['express'], when: { cities: ['riyadh'], cartMin: 50000 }, then: { kind: 'free' } },
      { id: 'r2', name: k('إخفاء السريع للطلبات الثقيلة', 'Hide express for heavy carts'), on: true, methods: ['express'], when: { kgMin: 15 }, then: { kind: 'hide' } },
    ],
    promises: [
      { zoneId: 'z1', handling: 1, extra: 0 },
      { zoneId: 'z2', handling: 1, extra: 0 },
      { zoneId: 'z3', handling: 2, extra: 1 },
    ],
    sameDayCutoff: 14,
    intl: {
      p1: { hs: '6204.49', origin: 'SA', descAr: 'عباية نسائية من الكتان', descEn: 'Women’s linen abaya' },
      p3: { hs: '7013.99', origin: 'SA', descAr: '', descEn: 'Glass perfume bottle' },
    },
    cod: { exceptCities: [], exceptCats: ['gifts'], maxKg: null },
    autoWarehouse: true,
    warehouseByZone: { z1: 'ryd', z2: 'jed', z3: 'ryd' },
    verifyPhone: false,
  };
}
