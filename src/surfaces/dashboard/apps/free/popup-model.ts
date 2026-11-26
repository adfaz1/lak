// Welcome pop-up (free app): rules only. When it shows (delay, exit intent on desktop, scroll depth), how often, on
// which pages; a sign-up needs an email or a Saudi mobile AND an explicit consent tick. Each sign-up gets its own
// single-use coupon (merchant/growth.ts Coupon, origin 'popup') and is added to customers with the consent flag.
import type { L, Order } from '../../../merchant/domain';
import { total } from '../../../merchant/domain';
import { hashOf, type Coupon } from '../../../merchant/growth';
import type { Customer } from '../../../merchant/workspace';
import { mobileKey, validEmail } from './livechat-model';

export type PopupTrigger = 'delay' | 'exit' | 'scroll';
export type PopupPage = 'home' | 'listing' | 'product' | 'cart' | 'content';
export const POPUP_PAGES: PopupPage[] = ['home', 'listing', 'product', 'cart', 'content'];

export interface PopupSettings {
  trigger: PopupTrigger;
  delaySec: number;
  scrollPct: number;
  /** Show again to the same visitor only after this many days (0 = once per visit). */
  capDays: number;
  pages: PopupPage[];
  /** Welcome discount, percent. */
  pct: number;
  validDays: number;
  /** Minimum bag value for the welcome code, halalas (0 = none). */
  minSpend: number;
  channel: 'email' | 'mobile';
  headline: L;
}
export const POPUP_DEFAULTS: PopupSettings = {
  trigger: 'delay', delaySec: 8, scrollPct: 50, capDays: 7, pages: ['home', 'listing', 'product'], pct: 10, validDays: 14, minSpend: 0, channel: 'email',
  headline: { ar: 'خصم ترحيبي لأول طلب', en: 'A welcome discount on your first order' },
};

export type PopupError = 'delay' | 'scroll' | 'cap' | 'pages' | 'pct' | 'valid' | 'headline';
export function popupProblems(s: PopupSettings): PopupError[] {
  const out: PopupError[] = [];
  const int = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  if (s.trigger === 'delay' && !int(s.delaySec, 0, 300)) out.push('delay');
  if (s.trigger === 'scroll' && !int(s.scrollPct, 10, 100)) out.push('scroll');
  if (!int(s.capDays, 0, 365)) out.push('cap');
  if (!s.pages.length) out.push('pages');
  if (!int(s.pct, 1, 50)) out.push('pct');
  if (!int(s.validDays, 1, 90)) out.push('valid');
  if (!s.headline.ar.trim() || !s.headline.en.trim() || s.headline.ar.length > 80 || s.headline.en.length > 80) out.push('headline');
  return out;
}

/** Page kind from the storefront path's first segment. Checkout, order, account and returns never show it. */
export function pageKind(first: string | undefined): PopupPage | null {
  if (first === undefined) return 'home';
  if (first === 'c' || first === 'search') return 'listing';
  if (first === 'p') return 'product';
  if (first === 'cart') return 'cart';
  if (first === 'page' || first === 'blog' || first === 'lp') return 'content';
  return null;
}

/** On phones there is no exit intent: the pop-up falls back to the scroll trigger at 50%. */
export const effectiveTrigger = (s: Pick<PopupSettings, 'trigger' | 'scrollPct'>, desktop: boolean): { trigger: PopupTrigger; scrollPct: number } =>
  s.trigger === 'exit' && !desktop ? { trigger: 'scroll', scrollPct: 50 } : { trigger: s.trigger, scrollPct: s.scrollPct };

/** May the pop-up arm on this page for this visitor now (frequency cap, signed up already, page list)? */
export function mayShow(s: Pick<PopupSettings, 'pages' | 'capDays'>, v: { page: PopupPage | null; lastShownAt?: number; signedUp?: boolean; shownThisVisit?: boolean }, now: number): boolean {
  if (!v.page || !s.pages.includes(v.page) || v.signedUp || v.shownThisVisit) return false;
  if (v.lastShownAt === undefined) return true;
  return s.capDays > 0 && now - v.lastShownAt >= s.capDays * 86_400_000;
}

export type SignupError = 'contact' | 'consent';
export function signupProblems(channel: PopupSettings['channel'], contact: string, consent: boolean): SignupError[] {
  const out: SignupError[] = [];
  if (channel === 'email' ? !validEmail(contact) : !mobileKey(contact)) out.push('contact');
  if (!consent) out.push('consent');
  return out;
}

const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Single-use code: "HI" + 6 letters/digits (no 0/O/1/I), stable for a seed. */
export function welcomeCode(seed: string, taken: string[]): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let n = 0; ; n++) {
    let h = hashOf(`${seed}#${n}`), out = 'HI';
    for (let i = 0; i < 6; i++) { out += A[h % A.length]; h = Math.floor(h / A.length) || hashOf(out); }
    if (!taken.includes(out)) return out;
  }
}

export interface Signup { code: string; customerId: string; channel: 'email' | 'mobile'; at: number; created: boolean }
export interface SignupResult { customers: Customer[]; coupons: Coupon[]; signup: Signup; repeat: boolean }

/**
 * A visitor signs up. An existing customer (same email or mobile) gets the consent flag turned on; a new one is added
 * with only that consent. A visitor who already has a welcome code gets the same one back (no second discount).
 */
export function signUp(state: { customers: Customer[]; coupons: Coupon[]; signups: Signup[] }, s: Pick<PopupSettings, 'channel' | 'pct' | 'validDays' | 'minSpend'>, contact: string, now: number, today: string): SignupResult {
  const email = s.channel === 'email' ? contact.trim().toLowerCase() : '';
  const key = s.channel === 'mobile' ? mobileKey(contact) ?? '' : '';
  const hit = state.customers.find((c) => (email && c.email.toLowerCase() === email) || (key && c.phone.replace(/\D/g, '').slice(-9) === key));
  const prior = hit && state.signups.find((x) => x.customerId === hit.id);
  if (hit && prior) return { customers: state.customers, coupons: state.coupons, signup: prior, repeat: true };
  let customers = state.customers;
  let customer = hit;
  if (customer) {
    const c = customer;
    customers = customers.map((x) => (x.id === c.id ? { ...x, consent: { ...x.consent, [s.channel === 'email' ? 'email' : 'sms']: true } } : x));
  } else {
    const n = customers.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 1000) + 1;
    const label = s.channel === 'email' ? email.split('@')[0] : `05${key.slice(1, 3)}••••${key.slice(-2)}`;
    customer = {
      id: `C-${n}`, name: { ar: label, en: label }, city: { ar: '', en: '' }, email, phone: key ? `+966 ${key.slice(0, 2)} ${key.slice(2, 5)} ${key.slice(5)}` : '',
      consent: { email: s.channel === 'email', sms: s.channel === 'mobile' }, since: today,
    };
    customers = [...customers, customer];
  }
  const code = welcomeCode(`${customer.id}:${now}`, state.coupons.map((c) => c.code));
  const coupon: Coupon = { code, type: 'percent', value: s.pct, minSpend: s.minSpend, limitTotal: 1, limitPerCustomer: 1, used: 0, starts: today, ends: plusDays(today, s.validDays), status: 'active', origin: 'popup' };
  return { customers, coupons: [...state.coupons, coupon], signup: { code, customerId: customer.id, channel: s.channel, at: now, created: !hit }, repeat: false };
}

export interface PopupStats { signups: number; newCustomers: number; used: number; revenue: number; orders: number }
/** Sign-ups, codes used and revenue of the orders that used a welcome code (after refunds are not deducted here). */
export function popupStats(signups: Signup[], coupons: Coupon[], orders: Order[]): PopupStats {
  const codes = new Set(signups.map((x) => x.code));
  const used = coupons.filter((c) => codes.has(c.code) && c.used > 0).length;
  const paid = orders.filter((o) => o.coupon && codes.has(o.coupon) && (o.pay === 'paid' || o.pay === 'partially_refunded') && !o.cancelled);
  return { signups: signups.length, newCustomers: signups.filter((x) => x.created).length, used, revenue: paid.reduce((s, o) => s + total(o), 0), orders: paid.length };
}
