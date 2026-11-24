// Settings: business rules only (no React). Reuses merchant/{workspace,perms,finance,catalog} as the source of truth;
// only rules those files do not have yet are written here, each with a test in model.test.ts.
import type { L } from '../../../core/lang';
import { parseMoney } from '../../merchant/catalog';
import { STATUS_TONE, type VStatus } from '../../merchant/verification';
import { PLANS, STAFF_LIMIT, type Plan } from '../../merchant/finance';
import { MATRIX_ACTIONS, MATRIX_PAGES, ROLES, can, canSee, canSeeSettings, type Action, type Page, type Role, type SettingsCat } from '../../merchant/perms';
import {
  NOTIFY_EVENTS, normPolicy, seatsUsed, validEmail, validHost, validSlug,
  type DomainSettings, type Member, type Notify, type Policy, type PolicyId, type Provider, type ProviderState, type SocialId, type StoreDetails, type Zone,
} from '../../merchant/workspace';

/* ---------- Categories and search ---------- */

/** Settings pages of the new dashboard. `checkout` extends the merchant categories (blueprint pp.15–16). */
export type CatId = Exclude<SettingsCat, 'billing'> | 'checkout' | 'account' | 'verification' | 'order-statuses';
export interface Category { id: CatId; title: L; desc: L; keys: string }

export const CATEGORIES: Category[] = [
  { id: 'store', title: { ar: 'بيانات المتجر', en: 'Store details' }, desc: { ar: 'الاسم والفئة ووسائل التواصل', en: 'Name, category and contact' }, keys: 'name email phone category timezone weight الاسم البريد الجوال الفئة' },
  { id: 'team', title: { ar: 'الفريق والصلاحيات', en: 'Team & permissions' }, desc: { ar: 'الأعضاء والأدوار والدعوات والسجل', en: 'Members, roles, invites and log' }, keys: 'staff roles invite rbac seats موظف دور دعوة صلاحية مقاعد سجل' },
  { id: 'payments', title: { ar: 'المدفوعات', en: 'Payments' }, desc: { ar: 'مزوّدو الدفع وحدود الدفع عند الاستلام', en: 'Payment providers and COD limits' }, keys: 'mada visa mastercard apple pay stc tabby tamara cod bank مدى تابي تمارا استلام تحويل' },
  { id: 'shipping', title: { ar: 'الشحن', en: 'Shipping' }, desc: { ar: 'الطرق والقواعد ووعود التوصيل', en: 'Methods, rules and delivery promises' }, keys: 'zones rates free weight carriers rules express same day international hs customs cod warehouse مناطق أسعار مجاني وزن ناقل شركات قواعد سريع نفس اليوم دولي جمارك استلام مستودع' },
  { id: 'checkout', title: { ar: 'إتمام الطلب', en: 'Checkout' }, desc: { ar: 'الشراء كضيف والإلغاء الذاتي وحد الدفع عند الاستلام', en: 'Guest checkout, self-cancel, COD per customer' }, keys: 'guest cancel cod limit ضيف إلغاء حد' },
  { id: 'verification', title: { ar: 'توثيق المتجر', en: 'Store verification' }, desc: { ar: 'الكيان النظامي ووثائقه، وشرط بدء التحويلات', en: 'Legal entity and documents; needed for payouts' }, keys: 'kyc verify verification identity documents cr commercial registration vat tax number national id iqama iban payouts held توثيق موثق هوية إقامة سجل تجاري رقم ضريبي وثائق كيان مؤسسة شركة جهة خيرية تحويلات محجوزة' },
  { id: 'domains', title: { ar: 'النطاقات', en: 'Domains' }, desc: { ar: 'الرابط المجاني ونطاقك الخاص', en: 'Free link and your own domain' }, keys: 'domain dns cname txt slug link نطاق رابط' },
  { id: 'policies', title: { ar: 'السياسات', en: 'Policies' }, desc: { ar: 'الاسترجاع والشحن والخصوصية والشروط', en: 'Returns, shipping, privacy, terms' }, keys: 'returns privacy terms refund استرجاع خصوصية شروط' },
  { id: 'notifications', title: { ar: 'الإشعارات', en: 'Notifications' }, desc: { ar: 'تنبيهاتك ورسائل العملاء لكل حالة طلب', en: 'Your alerts and customer messages per order state' }, keys: 'alerts email sms whatsapp customer template tracking تنبيه إشعار بريد رسائل واتساب عميل قالب تتبع' },
  { id: 'account', title: { ar: 'حسابي', en: 'My account' }, desc: { ar: 'ملفك والأمان والأجهزة وتنبيهاتك', en: 'Your profile, security, devices and alerts' }, keys: 'profile account password 2fa two-factor sessions devices security ملف حساب كلمة مرور تحقق خطوتين جلسات أجهزة أمان' },
  { id: 'order-statuses', title: { ar: 'حالات الطلب', en: 'Order statuses' }, desc: { ar: 'حالات فرعية تحت كل حالة طلب', en: 'Sub-statuses under each order state' }, keys: 'order status sub-status custom statuses workflow stage processing حالات الطلب حالة فرعية تخصيص الحالات مرحلة تجهيز' },
  { id: 'language', title: { ar: 'اللغة والمنطقة', en: 'Language & region' }, desc: { ar: 'لغة اللوحة ولغات المتجر والتوقيت', en: 'Admin language, store languages, time zone' }, keys: 'language currency timezone units لغة عملة توقيت وحدة' },
];

export const isCat = (s: string | undefined): s is CatId => !!s && CATEGORIES.some((c) => c.id === s);

/** Arabic letters vary in hamza/ta marbuta/alef maqsura; normalise so "اعدادات" finds "إعدادات". */
export function normalise(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u0625\u0623\u0622]/g, '\u0627').replace(/\u0629/g, '\u0647').replace(/\u0649/g, '\u064A').trim();
}

/** Categories whose names, descriptions or keywords (either language) contain every word of the query. */
export function searchCategories(q: string, cats: Category[] = CATEGORIES): Category[] {
  const words = normalise(q).split(/\s+/).filter(Boolean);
  if (!words.length) return cats;
  return cats.filter((c) => {
    const hay = normalise(`${c.title.ar} ${c.title.en} ${c.desc.ar} ${c.desc.en} ${c.keys}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Who may open a category. Checkout is a store setting and follows `settings.manage`. */
export function canOpen(role: Role, cat: CatId): boolean {
  if (cat === 'account') return true;
  // Verification decides where payouts go: owner and finance (billing.manage) only.
  if (cat === 'verification') return canSeeSettings(role, 'billing');
  // Sub-statuses are an operations setting: whoever fulfils orders can define them.
  if (cat === 'order-statuses') return can(role, 'order.fulfil');
  return canSeeSettings(role, cat === 'checkout' ? 'store' : cat);
}
/** The roles that can open a category, to tell a refused member whom to ask. */
export const rolesFor = (cat: CatId): Role[] => ROLES.filter((r) => canOpen(r, cat));

/* ---------- Store details ---------- */

export const STORE_CATEGORIES = ['fashion', 'beauty', 'home', 'food', 'electronics', 'digital', 'dropshipping', 'charity'] as const;
export const NAME_MAX = 60;
export type StoreErrors = Partial<Record<'name' | 'email' | 'phone', 'required' | 'tooLong' | 'invalid'>>;
export function validateStore(d: StoreDetails): StoreErrors {
  const e: StoreErrors = {};
  if (!d.name.trim()) e.name = 'required';
  else if (d.name.trim().length > NAME_MAX) e.name = 'tooLong';
  if (!d.email.trim()) e.email = 'required';
  else if (!validEmail(d.email)) e.email = 'invalid';
  // Saudi numbers as typed by merchants: +966 5x…, 05x…, with spaces; masked fixtures (x) are accepted as-is.
  const digits = d.phone.replace(/[\s-]/g, '');
  if (digits && !/^(\+9665|9665|05|5)[0-9x]{8}$/i.test(digits)) e.phone = 'invalid';
  return e;
}
export const hasErrors = (e: object) => Object.keys(e).length > 0;

/** Shallow structural equality for form drafts, so the save bar appears only for a real change. */
export const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- Team ---------- */

export const INVITE_DAYS = 7;
const DAY = 86_400_000;

export interface Seats { used: number; limit: number | null; full: boolean; left: number | null }
export function seats(members: Member[], plan: Plan): Seats {
  const used = seatsUsed(members);
  const limit = STAFF_LIMIT[plan];
  return { used, limit, full: limit !== null && used >= limit, left: limit === null ? null : Math.max(0, limit - used) };
}

/** The lowest plan whose seat limit would fit one more member, or null when none is needed. */
export function planForSeats(members: Member[], plan: Plan): Plan | null {
  if (!seats(members, plan).full) return null;
  const need = seatsUsed(members) + 1;
  return PLANS.slice(PLANS.indexOf(plan) + 1).find((p) => STAFF_LIMIT[p] === null || STAFF_LIMIT[p]! >= need) ?? null;
}

export type InviteError = 'email' | 'duplicate' | 'seats' | 'role';
export function inviteError(members: Member[], plan: Plan, email: string, role: Role): InviteError | null {
  if (!validEmail(email)) return 'email';
  if (role === 'owner') return 'role';
  const e = email.trim().toLowerCase();
  if (members.some((m) => m.email.toLowerCase() === e && m.status !== 'expired')) return 'duplicate';
  if (seats(members, plan).full) return 'seats';
  return null;
}

/** When each pending invite was sent (ISO). Kept beside the team store because `Member` has no date. */
export type InviteDates = Record<string, string>;
export interface InviteStatus { expired: boolean; daysLeft: number; expiresOn: string }
export function inviteStatus(sentAt: string, now: Date): InviteStatus {
  const sent = new Date(sentAt).getTime();
  const end = sent + INVITE_DAYS * DAY;
  const left = Math.ceil((end - now.getTime()) / DAY);
  return { expired: left <= 0, daysLeft: Math.max(0, left), expiresOn: new Date(end).toISOString().slice(0, 10) };
}

/** Members with invite expiry applied: a pending invite past its date shows as expired and frees its seat. */
export function withExpiry(members: Member[], dates: InviteDates, now: Date): Member[] {
  return members.map((m) => (m.status === 'invited' && dates[m.id] && inviteStatus(dates[m.id], now).expired ? { ...m, status: 'expired' } : m));
}

export function invite(members: Member[], email: string, role: Role, id: string): Member[] {
  const e = email.trim();
  return [...members.filter((m) => !(m.email.toLowerCase() === e.toLowerCase() && m.status === 'expired')), { id, name: e.split('@')[0], email: e, role, status: 'invited' }];
}
export const changeRole = (members: Member[], id: string, role: Role): Member[] =>
  members.map((m) => (m.id === id && m.role !== 'owner' && role !== 'owner' ? { ...m, role } : m));
export const removeMember = (members: Member[], id: string): Member[] => members.filter((m) => m.id !== id || m.role === 'owner');
export const resend = (members: Member[], id: string): Member[] => members.map((m) => (m.id === id && m.status !== 'active' ? { ...m, status: 'invited' } : m));

/** Team log entries are stored as JSON in `teamStore.log[].what` so they can be shown in either language. */
export type LogEvent =
  | { k: 'invite'; email: string; role: Role; at: string }
  | { k: 'role'; name: string; from: Role; to: Role; at: string }
  | { k: 'remove'; name: string; at: string }
  | { k: 'revoke'; email: string; at: string }
  | { k: 'resend'; email: string; at: string };
export const encodeLog = (e: LogEvent) => JSON.stringify(e);
export function decodeLog(what: string): LogEvent | null {
  if (!what.startsWith('{')) return null;
  try { const v = JSON.parse(what) as LogEvent; return v && typeof v.k === 'string' ? v : null; } catch { return null; }
}

export interface MatrixRow { kind: 'page' | 'action'; id: Page | Action; allowed: Record<Role, boolean> }
/** Read-only permission matrix built from the same tables the checks use. */
export function matrix(): MatrixRow[] {
  const row = (kind: MatrixRow['kind'], id: Page | Action, f: (r: Role) => boolean): MatrixRow => ({ kind, id, allowed: Object.fromEntries(ROLES.map((r) => [r, f(r)])) as Record<Role, boolean> });
  return [...MATRIX_PAGES.map((p) => row('page', p, (r) => canSee(r, p))), ...MATRIX_ACTIONS.map((a) => row('action', a, (r) => can(r, a)))];
}

/* ---------- Payments ---------- */

export const inPlan = (plan: Plan, p: Provider) => PLANS.indexOf(plan) >= PLANS.indexOf(p.minPlan);

export type ProviderCmd = 'connect' | 'approve' | 'requestDoc' | 'sendDoc' | 'disconnect';
/** The provider lifecycle. Approval and document requests come from the provider, so they are simulation-only. */
export function nextState(s: ProviderState, cmd: ProviderCmd): ProviderState {
  switch (cmd) {
    case 'connect': return s === 'not_connected' ? 'pending' : s;
    case 'approve': return s === 'pending' ? 'active' : s;
    case 'requestDoc': return s === 'pending' || s === 'active' ? 'action_required' : s;
    case 'sendDoc': return s === 'action_required' ? 'pending' : s;
    case 'disconnect': return s === 'not_connected' ? s : 'not_connected';
  }
}
export const applyProvider = (list: Provider[], id: string, cmd: ProviderCmd): Provider[] => list.map((p) => (p.id === id ? { ...p, state: nextState(p.state, cmd) } : p));

/** Shoppers see a method only when it is active and inside the plan. */
export const visibleAtCheckout = (list: Provider[], plan: Plan) => list.filter((p) => p.state === 'active' && inPlan(plan, p));

export interface ProviderSummary { active: number; pending: number; action: number }
export function providerSummary(list: Provider[]): ProviderSummary {
  return { active: list.filter((p) => p.state === 'active').length, pending: list.filter((p) => p.state === 'pending').length, action: list.filter((p) => p.state === 'action_required').length };
}

export type CodError = 'min' | 'max' | 'order';
/** COD min/max typed in riyals; max must be above min. Empty min means 0. */
export function parseCod(minText: string, maxText: string): { ok: true; min: number; max: number } | { ok: false; error: CodError } {
  const min = minText.trim() ? parseMoney(minText) : 0;
  if (min === null) return { ok: false, error: 'min' };
  const max = parseMoney(maxText);
  if (max === null || max === 0) return { ok: false, error: 'max' };
  if (max <= min) return { ok: false, error: 'order' };
  return { ok: true, min, max };
}
export const riyals = (halalas: number) => (halalas / 100).toFixed(2);

/* ---------- Shipping ---------- */

export interface ZoneDraft { id: string; name: string; cities: string; rateType: Zone['rateType']; rate: string; perKg: string; free: string }
export const zoneDraft = (z: Zone | null, lang: 'ar' | 'en', id: string): ZoneDraft => z
  ? { id: z.id, name: z.name[lang], cities: z.cities[lang], rateType: z.rateType, rate: riyals(z.rate), perKg: riyals(z.perKg), free: z.freeOver === null ? '' : riyals(z.freeOver) }
  : { id, name: '', cities: '', rateType: 'flat', rate: '25.00', perKg: '5.00', free: '' };

export type ZoneErrors = Partial<Record<'name' | 'cities' | 'rate' | 'perKg' | 'free', true>>;
/** Validates a zone draft; names typed in one language are kept for both until translated. */
export function parseZone(d: ZoneDraft, prev: Zone | null, lang: 'ar' | 'en'): { ok: true; zone: Zone } | { ok: false; errors: ZoneErrors } {
  const errors: ZoneErrors = {};
  const rate = parseMoney(d.rate);
  const perKg = d.rateType === 'weight' ? parseMoney(d.perKg) : 0;
  const free = d.free.trim() ? parseMoney(d.free) : null;
  if (!d.name.trim()) errors.name = true;
  if (!d.cities.trim()) errors.cities = true;
  if (rate === null) errors.rate = true;
  if (perKg === null || (d.rateType === 'weight' && perKg === 0)) errors.perKg = true;
  if (d.free.trim() && (free === null || free === 0)) errors.free = true;
  if (hasErrors(errors)) return { ok: false, errors };
  const both = (v: string, old?: L): L => ({ ar: lang === 'ar' ? v.trim() : old?.ar || v.trim(), en: lang === 'en' ? v.trim() : old?.en || v.trim() });
  return { ok: true, zone: { id: d.id, name: both(d.name, prev?.name), cities: both(d.cities, prev?.cities), rateType: d.rateType, rate: rate!, perKg: perKg!, freeOver: free } };
}
export const upsertZone = (list: Zone[], z: Zone) => (list.some((x) => x.id === z.id) ? list.map((x) => (x.id === z.id ? z : x)) : [...list, z]);

/** Shipping charged for a cart in a zone: free above the threshold, else flat, else base + per started kg above the first. */
export function shippingQuote(z: Zone, subtotal: number, weightKg: number): number {
  if (z.freeOver !== null && subtotal >= z.freeOver) return 0;
  if (z.rateType === 'flat') return z.rate;
  return z.rate + Math.max(0, Math.ceil(weightKg) - 1) * z.perKg;
}

/* ---------- Checkout (blueprint pp.15–16) ---------- */

export interface CheckoutSettings { guest: boolean; cancelMinutes: number | null; codPerCustomer: number | null }
export const checkoutFixture = (): CheckoutSettings => ({ guest: true, cancelMinutes: 30, codPerCustomer: 2 });
export const CANCEL_OPTIONS = [null, 15, 30, 60, 120, 1440] as const;

export interface CheckoutDraft { guest: boolean; cancelMinutes: number | null; codLimitOn: boolean; codPerCustomer: string }
export function parseCheckout(d: CheckoutDraft): { ok: true; value: CheckoutSettings } | { ok: false; error: 'cod' } {
  if (!d.codLimitOn) return { ok: true, value: { guest: d.guest, cancelMinutes: d.cancelMinutes, codPerCustomer: null } };
  const n = Number(d.codPerCustomer.trim());
  if (!/^\d+$/.test(d.codPerCustomer.trim()) || n < 1 || n > 20) return { ok: false, error: 'cod' };
  return { ok: true, value: { guest: d.guest, cancelMinutes: d.cancelMinutes, codPerCustomer: n } };
}
/** A shopper may cancel by themself only inside the window and before anything has been fulfilled. */
export const canSelfCancel = (s: CheckoutSettings, minutesSinceOrder: number, fulfilled: boolean) =>
  s.cancelMinutes !== null && !fulfilled && minutesSinceOrder <= s.cancelMinutes;
/** COD stays available while the shopper's unpaid COD orders are below the limit. */
export const codAllowed = (s: CheckoutSettings, openCodOrders: number) => s.codPerCustomer === null || openCodOrders < s.codPerCustomer;

/* ---------- Domains ---------- */

export const PLATFORM_HOST = 'lak.store';
export const CNAME_TARGET = 'stores.lak.store';
export const verifyToken = (host: string) => `lak-verify=${[...host].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(8, '0').slice(0, 8)}`;

export interface DnsRecord { type: 'CNAME' | 'TXT'; name: string; value: string }
export function dnsRecords(host: string): DnsRecord[] {
  return [{ type: 'CNAME', name: host, value: CNAME_TARGET }, { type: 'TXT', name: `_lak.${host}`, value: verifyToken(host) }];
}
export type DomainCheck = { record: DnsRecord['type']; ok: boolean };
/** Result of one simulated DNS check. `found` lists the records the lookup saw. */
export function checkDomain(d: DomainSettings, found: DnsRecord['type'][]): { next: DomainSettings; checks: DomainCheck[] } {
  const checks: DomainCheck[] = (['CNAME', 'TXT'] as const).map((r) => ({ record: r, ok: found.includes(r) }));
  const ok = checks.every((c) => c.ok);
  return { next: { ...d, state: ok ? 'verified' : 'failed', checks: d.checks + 1 }, checks };
}
export const normaliseHost = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
export type SlugError = 'format' | 'same';
export function slugError(next: string, current: string): SlugError | null {
  if (next === current) return 'same';
  return validSlug(next) ? null : 'format';
}
export const hostOk = (s: string) => validHost(normaliseHost(s));

/* ---------- Policies ---------- */

export const POLICY_MIN = 20;
export const POLICY_IDS: PolicyId[] = ['returns', 'shipping', 'privacy', 'terms'];
export type StoreLangs = { ar: boolean; en: boolean };
/** Store languages still missing a publishable text (at least POLICY_MIN characters). */
export const policyMissingLangs = (text: L, langs: StoreLangs = { ar: true, en: true }): ('ar' | 'en')[] =>
  (['ar', 'en'] as const).filter((l) => langs[l] && text[l].trim().length < POLICY_MIN);
/** Publishable when every enabled store language has a text of at least POLICY_MIN characters. */
export const canPublish = (text: L, langs?: StoreLangs) => policyMissingLangs(text, langs).length === 0;
/** The draft differs from what shoppers see (or nothing is published yet and something is written). */
export const policyHasDraft = (p: Policy) => {
  const n = normPolicy(p);
  return n.live ? !same(n.text, n.live) : !!(n.text.ar.trim() || n.text.en.trim());
};
/** Saving a draft never touches the live text; publishing copies the draft to live. */
export function savePolicy(list: Policy[], id: PolicyId, text: L, publish: boolean): Policy[] {
  return list.map((raw) => {
    if (raw.id !== id) return raw;
    const p = normPolicy(raw);
    if (publish) return { ...p, text, live: text, state: 'published' };
    return { ...p, text, state: p.live ? 'published' : text.ar.trim() || text.en.trim() ? 'draft' : 'missing' };
  });
}

/* ---------- Notifications ---------- */

export function notifyCount(n: Notify): { email: number; sms: number } {
  return { email: NOTIFY_EVENTS.filter((e) => n[e].email).length, sms: NOTIFY_EVENTS.filter((e) => n[e].sms).length };
}
/** A payment failure must reach someone: at least one channel stays on for it. */
export const notifyError = (n: Notify): 'paymentFailed' | null => (!n.paymentFailed.email && !n.paymentFailed.sms ? 'paymentFailed' : null);

/* ---------- Language & region ---------- */

export const TIMEZONES = ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Africa/Cairo'] as const;
export const storeLangsError = (l: { ar: boolean; en: boolean }) => (!l.ar && !l.en ? 'none' : null);

/* ---------- Labels and index status ---------- */

export const ROLE_LABEL: Record<Role, L> = {
  owner: { ar: 'المالك', en: 'Owner' },
  fulfilment: { ar: 'التجهيز', en: 'Fulfilment' },
  finance: { ar: 'المالية', en: 'Finance' },
  marketing: { ar: 'التسويق', en: 'Marketing' },
};

export type StatusTone = 'green' | 'amber' | 'red' | 'gray';
export interface CatStatus { tone: StatusTone; code: 'ok' | 'zones' | 'action' | 'pending' | 'missing' | 'seats' | 'notConnected' | 'failed' | 'kyc'; n?: number; kyc?: VStatus }
/** One short status per category card so the index shows where attention is needed. Null when there is nothing to say. */
export function categoryStatus(id: CatId, d: { providers: Provider[]; zones: Zone[]; domain: DomainSettings; policies: Policy[]; members: Member[]; plan: Plan; verification?: VStatus }): CatStatus | null {
  switch (id) {
    case 'verification': {
      // The same status the payouts notice and the work centre read (merchant/verification.ts).
      if (!d.verification) return null;
      return { tone: STATUS_TONE[d.verification], code: 'kyc', kyc: d.verification };
    }
    case 'payments': {
      const s = providerSummary(d.providers);
      if (s.action) return { tone: 'red', code: 'action', n: s.action };
      if (s.pending) return { tone: 'amber', code: 'pending', n: s.pending };
      return s.active ? { tone: 'green', code: 'ok', n: s.active } : { tone: 'red', code: 'notConnected' };
    }
    case 'shipping': return d.zones.length ? { tone: 'green', code: 'zones', n: d.zones.length } : { tone: 'red', code: 'missing' };
    case 'domains': return d.domain.state === 'verified' ? { tone: 'green', code: 'ok' } : d.domain.state === 'pending' ? { tone: 'amber', code: 'pending' } : d.domain.state === 'failed' ? { tone: 'red', code: 'failed' } : null;
    case 'policies': {
      const missing = d.policies.filter((p) => p.state !== 'published').length;
      return missing ? { tone: 'amber', code: 'missing', n: missing } : { tone: 'green', code: 'ok' };
    }
    case 'team': {
      const s = seats(d.members, d.plan);
      return s.full ? { tone: 'amber', code: 'seats', n: s.used } : null;
    }
    default: return null;
  }
}

/** Plan & billing lives in Finance; the index still finds it by name. */
export const billingMatches = (q: string) => !normalise(q) || normalise('الخطة والفوترة plan billing invoice subscription خطة فوترة اشتراك فاتورة').includes(normalise(q));

/** What a role change grants and withdraws, shown before it is confirmed. */
export function roleDiff(from: Role, to: Role): { gains: (Page | Action)[]; loses: (Page | Action)[] } {
  const rows = matrix();
  return {
    gains: rows.filter((r) => !r.allowed[from] && r.allowed[to]).map((r) => r.id),
    loses: rows.filter((r) => r.allowed[from] && !r.allowed[to]).map((r) => r.id),
  };
}

export const PERM_LABEL: Partial<Record<Page | Action, L>> = {
  orders: { ar: 'الطلبات', en: 'Orders' }, products: { ar: 'المنتجات', en: 'Products' }, inventory: { ar: 'المخزون', en: 'Inventory' },
  customers: { ar: 'العملاء', en: 'Customers' }, analytics: { ar: 'التحليلات', en: 'Analytics' }, finance: { ar: 'المالية', en: 'Finance' },
  marketing: { ar: 'التسويق', en: 'Marketing' }, automations: { ar: 'الأتمتة', en: 'Automations' }, storefront: { ar: 'المتجر الإلكتروني', en: 'Online store' },
  apps: { ar: 'التطبيقات', en: 'Apps' },
  'order.fulfil': { ar: 'تجهيز الطلبات', en: 'Fulfil orders' }, 'order.refund': { ar: 'رد المبالغ', en: 'Issue refunds' }, 'product.edit': { ar: 'تعديل المنتجات', en: 'Edit products' },
  'inventory.adjust': { ar: 'تعديل المخزون', en: 'Adjust stock' }, 'customer.message': { ar: 'مراسلة العملاء', en: 'Message customers' }, 'marketing.send': { ar: 'إرسال الحملات', en: 'Send campaigns' },
  'theme.publish': { ar: 'نشر الثيم', en: 'Publish theme' }, 'apps.manage': { ar: 'ربط التطبيقات', en: 'Connect apps' }, 'team.manage': { ar: 'إدارة الفريق', en: 'Manage team' },
  'billing.manage': { ar: 'الفوترة', en: 'Billing' },
};

/* ---------- Social links (BP-P03-STP-019) ---------- */

/** Expected host per platform, so an Instagram link is not saved under TikTok by mistake. */
export const SOCIAL_HOST: Record<SocialId, RegExp> = {
  instagram: /(^|\.)instagram\.com$/, x: /(^|\.)(x|twitter)\.com$/, tiktok: /(^|\.)tiktok\.com$/, snapchat: /(^|\.)snapchat\.com$/,
  facebook: /(^|\.)(facebook|fb)\.com$/, linkedin: /(^|\.)linkedin\.com$/, youtube: /(^|\.)(youtube\.com|youtu\.be)$/,
};
/** Accepts "instagram.com/x", "https://…" or "@handle"; returns the https URL to store, or an error. */
export function parseSocial(id: SocialId, raw: string): { ok: true; url: string } | { ok: false; error: 'format' | 'host' } {
  const v = raw.trim();
  if (!v) return { ok: true, url: '' };
  const handle = /^@?([A-Za-z0-9_.-]{2,30})$/.exec(v);
  const base: Record<SocialId, string> = { instagram: 'instagram.com/', x: 'x.com/', tiktok: 'tiktok.com/@', snapchat: 'snapchat.com/add/', facebook: 'facebook.com/', linkedin: 'linkedin.com/company/', youtube: 'youtube.com/@' };
  const url = handle && !v.includes('.') ? `https://${base[id]}${handle[1]}` : /^https?:\/\//i.test(v) ? v.replace(/^http:/i, 'https:') : `https://${v}`;
  let host: string;
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return { ok: false, error: 'format' }; }
  if (!host.includes('.')) return { ok: false, error: 'format' };
  return SOCIAL_HOST[id].test(host) ? { ok: true, url } : { ok: false, error: 'host' };
}

/* ---------- Custom roles (BP-P03-STF-002, Pro) ---------- */

export interface CustomRole { id: string; name: L; base: Exclude<Role, 'owner'>; pages: Page[]; actions: Action[] }
export const CUSTOM_ROLE_PLAN: Plan = 'pro';
export const customRoleFixtures = (): CustomRole[] => [
  { id: 'cr1', name: { ar: 'خدمة العملاء', en: 'Customer care' }, base: 'marketing', pages: ['orders', 'customers'], actions: ['customer.contact', 'customer.note', 'customer.message'] },
];
/** Start a custom role from a fixed role's permissions. */
export function roleFrom(base: Exclude<Role, 'owner'>, id: string): CustomRole {
  return { id, name: { ar: '', en: '' }, base, pages: MATRIX_PAGES.filter((p) => canSee(base, p)), actions: MATRIX_ACTIONS.filter((a) => can(base, a)) };
}
export type CustomRoleErrors = Partial<Record<'name' | 'pages' | 'billing', 'required' | 'taken' | 'needsFinance'>>;
export function customRoleErrors(r: CustomRole, all: CustomRole[]): CustomRoleErrors {
  const e: CustomRoleErrors = {};
  const n = (s: string) => s.trim().toLowerCase();
  if (!r.name.ar.trim() && !r.name.en.trim()) e.name = 'required';
  else if (all.some((x) => x.id !== r.id && ((r.name.ar.trim() && n(x.name.ar) === n(r.name.ar)) || (r.name.en.trim() && n(x.name.en) === n(r.name.en))) )
    || ROLES.some((x) => n(ROLE_LABEL[x].ar) === n(r.name.ar) || n(ROLE_LABEL[x].en) === n(r.name.en))) e.name = 'taken';
  if (!r.pages.length) e.pages = 'required';
  // An action is meaningless without the page it lives on.
  if (r.actions.includes('billing.manage') && !r.pages.includes('finance')) e.billing = 'needsFinance';
  return e;
}
/** Toggling a page off also removes the actions that belong to it. */
const ACTION_PAGE: Partial<Record<Action, Page>> = {
  'order.fulfil': 'orders', 'order.refund': 'orders', 'product.edit': 'products', 'inventory.adjust': 'inventory', 'customer.message': 'customers',
  'marketing.send': 'marketing', 'theme.publish': 'storefront', 'apps.manage': 'apps', 'billing.manage': 'finance',
};
export function togglePerm(r: CustomRole, id: Page | Action, on: boolean): CustomRole {
  if ((MATRIX_PAGES as string[]).includes(id)) {
    const pages = on ? [...new Set([...r.pages, id as Page])] : r.pages.filter((p) => p !== id);
    const actions = on ? r.actions : r.actions.filter((a) => ACTION_PAGE[a] !== id);
    return { ...r, pages, actions };
  }
  const a = id as Action;
  const page = ACTION_PAGE[a];
  return { ...r, actions: on ? [...new Set([...r.actions, a])] : r.actions.filter((x) => x !== a), pages: on && page && !r.pages.includes(page) ? [...r.pages, page] : r.pages };
}
export const customAllows = (r: CustomRole, id: Page | Action) => (r.pages as string[]).includes(id) || (r.actions as string[]).includes(id);
