// Workspace domain: new-store setup checklist, evidence-based assistant answers, and fixtures for
// settings, team, themes, apps and help. Pure functions; the UI keeps state in stores.
import { people, VIEWS, type L, type LocId, type Order } from './domain';
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
export const domainFixture = (): DomainSettings => ({ slug: 'demo-store', host: '', state: 'none', checks: 0 });
export const validSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 40;
export const validHost = (s: string) => /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(s.trim().toLowerCase()) && !s.includes('..');

export type PolicyId = 'returns' | 'shipping' | 'privacy' | 'terms';
export interface Policy { id: PolicyId; text: string; state: 'missing' | 'draft' | 'published' }
export const policyFixtures = (): Policy[] => [
  { id: 'returns', state: 'published', text: 'Returns are accepted within 7 days of delivery for unused items in original packaging.' },
  { id: 'shipping', state: 'draft', text: 'Orders are prepared within 2 working days.' },
  { id: 'privacy', state: 'missing', text: '' },
  { id: 'terms', state: 'missing', text: '' },
];

export type NotifyEvent = 'newOrder' | 'paymentFailed' | 'lowStock' | 'payout' | 'review';
export const NOTIFY_EVENTS: NotifyEvent[] = ['newOrder', 'paymentFailed', 'lowStock', 'payout', 'review'];
export type Notify = Record<NotifyEvent, { email: boolean; sms: boolean }>;
export const notifyFixture = (): Notify => ({
  newOrder: { email: true, sms: false }, paymentFailed: { email: true, sms: true }, lowStock: { email: true, sms: false },
  payout: { email: true, sms: false }, review: { email: false, sms: false },
});

export interface StoreDetails { name: string; category: string; email: string; phone: string; timezone: string; weightUnit: 'g' | 'kg' }
export const storeFixture = (): StoreDetails => ({ name: 'Demo Store', category: 'fashion', email: 'owner@demo-store.test', phone: '+966 5x xxx 0123', timezone: 'Asia/Riyadh', weightUnit: 'kg' });
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export interface StoreStatus { published: boolean; accepting: boolean; maintenance: boolean; message: string }
export const statusFixture = (): StoreStatus => ({ published: true, accepting: true, maintenance: false, message: '' });

/* ---------- Team ---------- */

export type MemberStatus = 'active' | 'invited' | 'expired';
export interface Member { id: string; name: string; email: string; role: Role; status: MemberStatus }
export const teamFixture = (): Member[] => [
  { id: 'u1', name: 'Noura (owner)', email: 'owner@demo-store.test', role: 'owner', status: 'active' },
  { id: 'u2', name: 'Faisal', email: 'faisal@demo-store.test', role: 'fulfilment', status: 'active' },
  { id: 'u3', name: 'Huda', email: 'huda@demo-store.test', role: 'finance', status: 'invited' },
];
/** Seats in use: active members and pending invites count; expired invites do not. */
export const seatsUsed = (m: Member[]) => m.filter((x) => x.status !== 'expired').length;

/* ---------- Themes ---------- */

export type SectionKind = 'announcement' | 'hero' | 'featured' | 'categories' | 'offers' | 'video' | 'newsletter';
export interface Section { id: string; kind: SectionKind; visible: boolean; heading: string }
export interface ThemeVersion { version: number; sections: Section[]; note: string }
export interface ThemeState { published: ThemeVersion; draft: Section[]; history: ThemeVersion[] }

export function themeFixture(): ThemeState {
  const sections: Section[] = [
    { id: 's1', kind: 'announcement', visible: true, heading: 'شحن مجاني للطلبات فوق 300 ر.س داخل الرياض' },
    { id: 's2', kind: 'hero', visible: true, heading: 'تشكيلة العبايات المطرّزة' },
    { id: 's3', kind: 'featured', visible: true, heading: 'الأكثر مبيعًا' },
    { id: 's4', kind: 'categories', visible: true, heading: 'تسوّقي حسب الفئة' },
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
  const v: ThemeVersion = { version: Math.max(...t.history.map((h) => h.version)) + 1, sections: t.draft.map((s) => ({ ...s })), note };
  return { published: v, draft: t.draft, history: [v, ...t.history] };
}
/** Roll back by publishing a copy of an earlier version as a new version; history is never rewritten. */
export function rollbackTheme(t: ThemeState, version: number): ThemeState {
  const old = t.history.find((h) => h.version === version);
  if (!old) return t;
  const v: ThemeVersion = { version: Math.max(...t.history.map((h) => h.version)) + 1, sections: old.sections.map((s) => ({ ...s })), note: `Rollback to v${version}` };
  return { published: v, draft: old.sections.map((s) => ({ ...s })), history: [v, ...t.history] };
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

export interface Customer { id: string; name: L; city: L; email: string; phone: string; consent: { email: boolean; sms: boolean }; since: string }
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
  const mine = orders.filter((o) => o.customer.en === c.name.en);
  const paid = mine.filter((o) => o.pay !== 'failed');
  const spent = paid.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty * i.unit, 0) + o.fee - o.refunds.filter((r) => r.status === 'confirmed').reduce((a, r) => a + r.amount, 0), 0);
  return { orders: mine, paidCount: paid.length, spent };
}
/** Segments are rules over order history and consent; nothing is inferred about age, gender or credit. */
export function segmentsOf(c: Customer, s: { paidCount: number; spent: number }): Segment[] {
  const out: Segment[] = [];
  if (s.paidCount >= 2) out.push('returning');
  if (s.paidCount === 1) out.push('new');
  if (s.spent >= 1000000) out.push('highValue');
  if (c.consent.email) out.push('emailConsent');
  return out;
}
