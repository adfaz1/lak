/* Pure rules for the public site: input validation, search and plan matrix lookups.
   Everything here is deterministic so it can be unit-tested; no network, no real sign-up. */

export type Lang = 'ar' | 'en';
export type L = Record<Lang, string>;

/* ---------- digits & phone ---------- */

/** Arabic-Indic (٠-٩) and Eastern Arabic/Persian (۰-۹) digits become ASCII so people can type in either. */
export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * A Saudi mobile number in any common written form → `+9665XXXXXXXX`, or null if it is not one.
 * Accepts 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX with spaces/dashes.
 * The phone stays a string; it is never turned into a number.
 */
export function normalizeSaudiMobile(raw: string): string | null {
  const s = normalizeDigits(raw).replace(/[\s\-().]/g, '');
  const m = /^(?:\+966|00966|966|0)?(5\d{8})$/.exec(s);
  return m ? `+966${m[1]}` : null;
}

export function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

/* ---------- forms ---------- */

export type FieldError = 'required' | 'tooShort' | 'tooLong' | 'phone' | 'email' | 'terms';

export interface SignupDraft { storeName: string; activity: string; phone: string; plan: string; terms: boolean }
export type SignupErrors = Partial<Record<'storeName' | 'activity' | 'phone' | 'terms', FieldError>>;

export const STORE_NAME_MIN = 2;
export const STORE_NAME_MAX = 60;

export function validateSignup(d: SignupDraft): SignupErrors {
  const e: SignupErrors = {};
  const name = d.storeName.trim();
  if (!name) e.storeName = 'required';
  else if (name.length < STORE_NAME_MIN) e.storeName = 'tooShort';
  else if (name.length > STORE_NAME_MAX) e.storeName = 'tooLong';
  if (!d.activity) e.activity = 'required';
  if (!d.phone.trim()) e.phone = 'required';
  else if (!normalizeSaudiMobile(d.phone)) e.phone = 'phone';
  if (!d.terms) e.terms = 'terms';
  return e;
}

export interface ContactDraft { name: string; email: string; phone: string; topic: string; message: string }
export type ContactErrors = Partial<Record<keyof ContactDraft, FieldError>>;

export const MESSAGE_MIN = 20;
export const MESSAGE_MAX = 2000;

export function validateContact(d: ContactDraft): ContactErrors {
  const e: ContactErrors = {};
  if (!d.name.trim()) e.name = 'required';
  if (!d.email.trim()) e.email = 'required';
  else if (!isEmail(d.email)) e.email = 'email';
  if (d.phone.trim() && !normalizeSaudiMobile(d.phone)) e.phone = 'phone';
  if (!d.topic) e.topic = 'required';
  const msg = d.message.trim();
  if (!msg) e.message = 'required';
  else if (msg.length < MESSAGE_MIN) e.message = 'tooShort';
  else if (msg.length > MESSAGE_MAX) e.message = 'tooLong';
  return e;
}

export interface CommentDraft { name: string; body: string }
export function validateComment(d: CommentDraft): Partial<Record<keyof CommentDraft, FieldError>> {
  const e: Partial<Record<keyof CommentDraft, FieldError>> = {};
  if (!d.name.trim()) e.name = 'required';
  const b = d.body.trim();
  if (!b) e.body = 'required';
  else if (b.length < 5) e.body = 'tooShort';
  else if (b.length > 1000) e.body = 'tooLong';
  return e;
}

export const hasErrors = (e: object): boolean => Object.keys(e).length > 0;

/** Simulated reference for a form that was not actually sent anywhere. */
export function simRef(prefix: string, n: number): string {
  return `${prefix}-SIM-${String(n).padStart(4, '0')}`;
}

/* ---------- search ---------- */

/** Fold Arabic spelling variants and case so "الأسعار" finds "الاسعار" and "Refund" finds "refund". */
export function fold(s: string): string {
  return normalizeDigits(s)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Searchable { id: string; cat: string; title: L; summary: L; body: L[] }

/** Every word of the query must appear somewhere in the item, in either language. Title hits rank first. */
export function searchItems<T extends Searchable>(items: T[], q: string, cat?: string): T[] {
  const words = fold(q).split(' ').filter(Boolean);
  const inCat = items.filter((i) => !cat || i.cat === cat);
  if (!words.length) return inCat;
  const scored: { item: T; score: number }[] = [];
  for (const item of inCat) {
    const title = fold(`${item.title.ar} ${item.title.en}`);
    const rest = fold(`${item.summary.ar} ${item.summary.en} ${item.body.map((b) => `${b.ar} ${b.en}`).join(' ')}`);
    if (!words.every((w) => title.includes(w) || rest.includes(w))) continue;
    scored.push({ item, score: words.filter((w) => title.includes(w)).length });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}

/** Up to `n` other items in the same category first, then others. */
export function related<T extends { id: string; cat: string }>(items: T[], current: T, n = 3): T[] {
  const same = items.filter((i) => i.id !== current.id && i.cat === current.cat);
  const other = items.filter((i) => i.id !== current.id && i.cat !== current.cat);
  return [...same, ...other].slice(0, n);
}

/* ---------- plans ---------- */

export const PLAN_IDS = ['basic', 'plus', 'pro', 'special'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type Billing = 'monthly' | 'annual';

export const isPlan = (v: string | null | undefined): v is PlanId => !!v && (PLAN_IDS as readonly string[]).includes(v);
export const toBilling = (v: string | null | undefined): Billing => (v === 'annual' ? 'annual' : 'monthly');

/** A matrix cell: included, not included, a plan-specific text (e.g. "3", "Add-on"), or pending approval. */
export type Cell = { k: 'yes' } | { k: 'no' } | { k: 'text'; v: L } | { k: 'pending'; v: L };

/** Lowest plan that includes a row (anything but "no"), or null if none. Used for "from Plus" labels. */
export function lowestPlan(cells: Cell[]): PlanId | null {
  const i = cells.findIndex((c) => c.k !== 'no');
  return i < 0 ? null : PLAN_IDS[i];
}

/** Checklist progress, e.g. for the marketing guide. */
export function progress(done: Record<string, boolean>, ids: string[]): { done: number; total: number } {
  return { done: ids.filter((id) => done[id]).length, total: ids.length };
}
