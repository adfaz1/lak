// Customers: pure rules for the list and the profile. No React.
// Order history, spend and segments come from merchant/workspace.ts (single source of truth).
import { total, type L, type Order } from '../../merchant/domain';
import {
  SEGMENTS, customerStats, matchesRules, segRuleError, segmentsOf, type Customer, type SavedSegment, type Segment, type SegRule,
} from '../../merchant/workspace';
import type { Cart, Review, Run } from '../../merchant/growth';

export { SEGMENTS, type Segment };
export const PAGE_SIZE = 25;

export interface CustomerRow {
  c: Customer;
  /** Every order placed, any payment state. */
  orderCount: number;
  /** Orders whose payment did not fail. Segments and spend use these. */
  paidCount: number;
  /** Paid order totals minus provider-confirmed refunds (halalas). */
  spent: number;
  /** Hours since the most recent order, null when the customer has none. */
  lastHours: number | null;
  segs: Segment[];
}

export function customerRows(customers: Customer[], orders: Order[]): CustomerRow[] {
  return customers.map((c) => {
    const s = customerStats(c, orders);
    return {
      c, orderCount: s.orders.length, paidCount: s.paidCount, spent: s.spent,
      lastHours: s.orders.length ? Math.min(...s.orders.map((o) => o.hoursAgo)) : null,
      segs: segmentsOf(c, s),
    };
  });
}

export const parseSegment = (v: string | null): Segment | null => (v && (SEGMENTS as string[]).includes(v) ? (v as Segment) : null);

export function segmentCounts(rows: CustomerRow[]): Record<Segment | 'all', number> {
  const out = { all: rows.length } as Record<Segment | 'all', number>;
  for (const s of SEGMENTS) out[s] = rows.filter((r) => r.segs.includes(s)).length;
  return out;
}

export type Sort = 'recent' | 'spent' | 'orders';
export const SORTS: Sort[] = ['recent', 'spent', 'orders'];
export const parseSort = (v: string | null): Sort => (v && (SORTS as string[]).includes(v) ? (v as Sort) : 'recent');

const digits = (s: string) => s.replace(/\D/g, '');

/**
 * Search name (Arabic or English), id and city; email and mobile only when the viewer may see contact
 * details, so a search cannot reveal hidden data.
 */
export function matches(r: CustomerRow, q: string, contact: boolean): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const c = r.c;
  if (c.name.ar.includes(t) || c.name.en.toLowerCase().includes(t) || c.id.toLowerCase().includes(t) || c.city.ar.includes(t) || c.city.en.toLowerCase().includes(t)) return true;
  if (!contact) return false;
  if (c.email.toLowerCase().includes(t)) return true;
  const d = digits(t);
  return d.length >= 4 && digits(c.phone).includes(d);
}

export function filterCustomers(rows: CustomerRow[], f: { q: string; seg: Segment | null; sort: Sort; contact: boolean }): CustomerRow[] {
  const out = rows.filter((r) => (!f.seg || r.segs.includes(f.seg)) && matches(r, f.q, f.contact));
  const last = (r: CustomerRow) => r.lastHours ?? Infinity;
  const by: Record<Sort, (a: CustomerRow, b: CustomerRow) => number> = {
    recent: (a, b) => last(a) - last(b) || b.spent - a.spent,
    spent: (a, b) => b.spent - a.spent || last(a) - last(b),
    orders: (a, b) => b.paidCount - a.paidCount || b.spent - a.spent,
  };
  return [...out].sort((a, b) => by[f.sort](a, b) || a.c.id.localeCompare(b.c.id));
}

export function paginate<T>(rows: T[], requested: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1));
  return { rows: rows.slice((page - 1) * size, page * size), page, pages, total: rows.length };
}

/** Lifetime figures for the profile. Average order value uses paid orders only. */
export function lifetime(c: Customer, orders: Order[]) {
  const s = customerStats(c, orders);
  const history = [...s.orders].sort((a, b) => a.hoursAgo - b.hoursAgo);
  const refunded = s.orders.reduce((a, o) => a + o.refunds.filter((r) => r.status === 'confirmed').reduce((x, r) => x + r.amount, 0), 0);
  const refundPending = s.orders.reduce((a, o) => a + o.refunds.filter((r) => r.status === 'pending').reduce((x, r) => x + r.amount, 0), 0);
  return {
    spent: s.spent,
    paidCount: s.paidCount,
    orderCount: s.orders.length,
    failed: s.orders.filter((o) => o.pay === 'failed').length,
    aov: s.paidCount ? Math.round(s.spent / s.paidCount) : null,
    refunded, refundPending,
    firstHours: history.length ? history[history.length - 1].hoursAgo : null,
    lastHours: history.length ? history[0].hoursAgo : null,
    history,
    segs: segmentsOf(c, s),
  };
}

/** Order total as charged (before refunds), for the history list. */
export const orderTotal = (o: Order) => total(o);

/* ---------- Messaging ---------- */

export type MsgChannel = 'email' | 'sms';
/** service = about one of the customer's orders; marketing = anything promotional (needs consent on the channel). */
export type Purpose = 'service' | 'marketing';
export type MsgProblem = 'empty' | 'noConsent' | 'noOrder' | 'tooLong';
export const SMS_MAX_PARTS = 3;

/** SMS parts: 160/153 characters for plain Latin text, 70/67 once any Arabic or other Unicode character is used. */
export function smsParts(text: string): { parts: number; perPart: number; unicode: boolean } {
  const unicode = /[^\x20-\x7E\n\r]/.test(text);
  const single = unicode ? 70 : 160, multi = unicode ? 67 : 153;
  const n = [...text].length;
  return { parts: n === 0 ? 0 : n <= single ? 1 : Math.ceil(n / multi), perPart: n <= single ? single : multi, unicode };
}

/** Everything that blocks sending, in the order the merchant should fix it. */
export function messageProblems(c: Customer, m: { channel: MsgChannel; purpose: Purpose; orderRef: string; text: string }): MsgProblem[] {
  const out: MsgProblem[] = [];
  if (m.purpose === 'marketing' && !c.consent[m.channel]) out.push('noConsent');
  if (m.purpose === 'service' && !m.orderRef) out.push('noOrder');
  if (!m.text.trim()) out.push('empty');
  if (m.channel === 'sms' && smsParts(m.text).parts > SMS_MAX_PARTS) out.push('tooLong');
  return out;
}

/** The contact channels on record, each with its marketing consent. */
export function channels(c: Customer): { channel: MsgChannel; value: string; consent: boolean }[] {
  return [
    { channel: 'email', value: c.email, consent: c.consent.email },
    { channel: 'sms', value: c.phone, consent: c.consent.sms },
  ];
}

/** Masked value for viewers without contact permission, and for previews. */
export function mask(value: string, channel: MsgChannel): string {
  if (channel === 'email') {
    const [user, domain] = value.split('@');
    return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain ?? ''}`;
  }
  return `${'•'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`.replace(/•+/, '•••• ');
}

/* ---------- Saved segments (rule-based) ---------- */

/** Rows matching a saved segment's rules (live: recomputed from the current orders). */
export function inSaved(rows: CustomerRow[], orders: Order[], seg: SavedSegment): CustomerRow[] {
  return rows.filter((r) => matchesRules(r.c, customerStats(r.c, orders), seg.rules));
}
export const savedId = (v: string | null) => (v && v.startsWith('custom:') ? v.slice(7) : null);
export const emptyRule = (): SegRule => ({ field: 'spent', op: 'gte', value: '' });
export function segmentProblems(name: string, rules: SegRule[], taken: string[]): { name?: 'empty' | 'taken'; rules: number[]; none?: true } {
  const out: { name?: 'empty' | 'taken'; rules: number[]; none?: true } = { rules: [] };
  if (!name.trim()) out.name = 'empty';
  else if (taken.some((t) => t.trim().toLowerCase() === name.trim().toLowerCase())) out.name = 'taken';
  if (!rules.length) out.none = true;
  rules.forEach((r, i) => { if (segRuleError(r)) out.rules.push(i); });
  return out;
}
export const segmentOk = (p: ReturnType<typeof segmentProblems>) => !p.name && !p.none && !p.rules.length;

/* ---------- Unified timeline ---------- */

export type TimelineKind = 'order' | 'refund' | 'message' | 'campaign' | 'cart' | 'automation' | 'note' | 'event' | 'review' | 'joined';
export const TIMELINE_KINDS: TimelineKind[] = ['order', 'refund', 'message', 'campaign', 'cart', 'automation', 'note', 'event', 'review'];
export interface TimelineItem {
  id: string; kind: TimelineKind;
  /** Hours before now; used to order the timeline (newest first). */
  hoursAgo: number;
  ref?: string; amount?: number;
  /** Plain-language status or outcome. */
  status?: string;
  text?: string; by?: string; channel?: 'email' | 'sms';
  outcome?: 'succeeded' | 'failed' | 'skipped';
}
export interface TimelineSources {
  orders: Order[];
  notes: { id: string; kind: 'internal' | 'message'; text: string; channel?: 'email' | 'sms'; by: string; at?: number }[];
  campaigns: { id: string; kind: 'cart' | 'broadcast'; channel: 'email' | 'sms'; recipients?: string[]; date?: string; at?: number; text: string; by?: string; coupon?: string }[];
  carts: Cart[];
  runs: Run[];
  events: { id: string; kind: string; text: string; by: string; at: number }[];
  reviews: Review[];
  now: number; today: string;
}
const H = 3_600_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
/** Hours ago of a note: new notes carry their time; the id of older ones holds it (N<ms>); fixtures without one sort as old. */
const noteHours = (n: { id: string; at?: number }, now: number) => {
  const ms = n.at ?? Number(n.id.replace(/\D/g, ''));
  return ms > 1e12 ? Math.max(0, (now - ms) / H) : 24 * 30;
};
/** Hours ago of a fixture run label ("Today 09:40", "Yesterday 22:05", "3 days ago"); runs recorded now carry `at`. */
export function runHours(r: Run, now: number): number {
  if (r.at) return Math.max(0, (now - r.at) / H);
  const w = r.when.en;
  const hm = /(\d{1,2}):(\d{2})/.exec(w);
  const days = /^Yesterday/.test(w) ? 1 : Number(/(\d+) days? ago/.exec(w)?.[1] ?? 0);
  return days * 24 + (hm ? Math.max(0, 24 - Number(hm[1])) % 24 : 12);
}

/**
 * Everything that happened with one customer, newest first: orders and refunds, messages sent from the profile,
 * campaign and cart-recovery messages, abandoned carts, automation runs about their carts, internal notes,
 * account events (block, consent, points, gift cards) and their reviews. Only records that name the customer.
 */
export function timeline(c: Customer, s: TimelineSources): TimelineItem[] {
  const out: TimelineItem[] = [];
  const mine = customerStats(c, s.orders).orders;
  for (const o of mine) {
    out.push({ id: `o-${o.ref}`, kind: 'order', hoursAgo: o.hoursAgo, ref: o.ref, amount: total(o), status: o.pay });
    o.refunds.forEach((r, i) => out.push({ id: `r-${r.id}`, kind: 'refund', hoursAgo: Math.max(0, o.hoursAgo - 1 - i), ref: o.ref, amount: r.amount, status: r.status, text: r.reason }));
  }
  for (const n of s.notes) out.push({ id: `n-${n.id}`, kind: n.kind === 'internal' ? 'note' : 'message', hoursAgo: noteHours(n, s.now), text: n.text, by: n.by, channel: n.channel });
  for (const m of s.campaigns) {
    if (!m.recipients?.includes(c.id)) continue;
    const h = m.at ? (s.now - m.at) / H : m.date ? daysBetween(m.date, s.today) * 24 + 6 : 24 * 14;
    out.push({ id: `c-${m.id}`, kind: 'campaign', hoursAgo: Math.max(0, h), ref: m.id, text: m.text, channel: m.channel, status: m.kind, by: m.by });
  }
  const myCarts = s.carts.filter((x) => x.customerId === c.id);
  for (const x of myCarts) out.push({ id: `k-${x.id}`, kind: 'cart', hoursAgo: x.hoursAgo, ref: x.id, amount: x.value, status: x.recovered ? 'recovered' : x.purchased ? 'purchased' : 'open' });
  const cartIds = new Set(myCarts.map((x) => x.id));
  for (const r of s.runs) {
    const cart = /CRT-\d+/.exec(r.subject.en)?.[0];
    if (!cart || !cartIds.has(cart)) continue;
    out.push({ id: `a-${r.id}`, kind: 'automation', hoursAgo: runHours(r, s.now), ref: r.id, text: r.reason.en, outcome: r.outcome, status: r.automation });
  }
  for (const e of s.events) out.push({ id: `e-${e.id}`, kind: 'event', hoursAgo: Math.max(0, (s.now - e.at) / H), text: e.text, by: e.by, status: e.kind });
  for (const r of s.reviews) if (r.customerId === c.id) out.push({ id: `v-${r.id}`, kind: 'review', hoursAgo: Math.max(0, daysBetween(r.at, s.today) * 24), ref: r.id, text: r.text, status: r.status });
  out.push({ id: 'joined', kind: 'joined', hoursAgo: Math.max(0, daysBetween(c.since, s.today) * 24), text: c.since });
  return out.sort((a, b) => a.hoursAgo - b.hoursAgo);
}

/** Delivery addresses used on the customer's orders (city and district), most recent first, without repeats. */
export function addresses(c: Customer, orders: Order[]): { label: L; orders: number; lastHours: number }[] {
  const out: { label: L; orders: number; lastHours: number }[] = [];
  for (const o of [...customerStats(c, orders).orders].sort((a, b) => a.hoursAgo - b.hoursAgo)) {
    if (!o.city.en && !o.city.ar) continue;
    const hit = out.find((x) => x.label.en === o.city.en);
    if (hit) hit.orders++; else out.push({ label: o.city, orders: 1, lastHours: o.hoursAgo });
  }
  return out;
}

/** What blocking would affect now: unshipped paid orders and unpaid cash-on-delivery orders. */
export function blockImpact(c: Customer, orders: Order[]) {
  const mine = customerStats(c, orders).orders;
  const open = mine.filter((o) => o.pay !== 'failed' && o.ship !== 'delivered' && o.pay !== 'refunded');
  return { open: open.length, cod: open.filter((o) => o.payment?.method === 'cod').length, refs: open.slice(0, 5).map((o) => o.ref) };
}

/* ---------- Export and import ---------- */

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** CSV of the listed customers. Without contact permission the email and mobile columns are masked. */
export function customersCsv(rows: CustomerRow[], contact: boolean, lang: 'ar' | 'en'): string {
  const head = lang === 'ar'
    ? ['المعرف', 'الاسم', 'المدينة', 'البريد', 'الجوال', 'موافقة البريد', 'موافقة الرسائل', 'طلبات مدفوعة', 'الإنفاق (ر.س)', 'محظور']
    : ['Id', 'Name', 'City', 'Email', 'Mobile', 'Email consent', 'SMS consent', 'Paid orders', 'Spent (SAR)', 'Blocked'];
  const yes = (b: boolean) => (b ? (lang === 'ar' ? 'نعم' : 'yes') : (lang === 'ar' ? 'لا' : 'no'));
  const lines = rows.map((r) => [
    r.c.id, r.c.name[lang], r.c.city[lang], contact ? r.c.email : mask(r.c.email, 'email'), contact ? r.c.phone : mask(r.c.phone, 'sms'),
    yes(r.c.consent.email), yes(r.c.consent.sms), String(r.paidCount), (r.spent / 100).toFixed(2), yes(!!r.c.blocked),
  ].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n');
}

export type ImportProblem = 'name' | 'email' | 'phone' | 'contact' | 'consent' | 'duplicate' | 'repeated';
export interface ImportRow { line: number; name: string; email: string; phone: string; city: string; consentEmail: boolean; consentSms: boolean; problems: ImportProblem[]; existing?: string }
const IMPORT_COLS = ['name', 'email', 'phone', 'city', 'email_consent', 'sms_consent'];
export const IMPORT_TEMPLATE = `${IMPORT_COLS.join(',')}\nNoor Alghamdi,noor@example.test,0551234567,Jeddah,yes,no\n`;

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
const phoneKey9 = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '').slice(-9);
/**
 * Read an import file (header row with name,email,phone,city,email_consent,sms_consent). Each row lists its
 * problems; rows that match an existing customer (mobile or email) or repeat an earlier row are not added.
 * Consent is only "yes" when the file says so explicitly.
 */
export function parseImport(text: string, existing: Customer[]): { rows: ImportRow[]; missingColumns: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], missingColumns: IMPORT_COLS };
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const missingColumns = ['name', 'email', 'phone'].filter((c) => !head.includes(c));
  if (missingColumns.length) return { rows: [], missingColumns };
  const col = (cells: string[], k: string) => cells[head.indexOf(k)] ?? '';
  const seen = new Set<string>();
  const yesNo = (v: string) => (/^(yes|y|1|true|نعم)$/i.test(v) ? true : /^(no|n|0|false|لا|)$/i.test(v) ? false : null);
  const rows = lines.slice(1).map((l, i): ImportRow => {
    const cells = splitCsv(l);
    const name = col(cells, 'name'), email = col(cells, 'email').toLowerCase(), phone = col(cells, 'phone'), city = col(cells, 'city');
    const ce = yesNo(col(cells, 'email_consent')), cs = yesNo(col(cells, 'sms_consent'));
    const problems: ImportProblem[] = [];
    if (!name) problems.push('name');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) problems.push('email');
    const pk = phoneKey9(phone);
    if (phone && !/^5\d{8}$/.test(pk)) problems.push('phone');
    if (!email && !phone) problems.push('contact');
    if (ce === null || cs === null) problems.push('consent');
    const hit = existing.find((c) => (pk.length === 9 && phoneKey9(c.phone) === pk) || (email && c.email.toLowerCase() === email));
    const key = pk || email;
    if (hit) problems.push('duplicate');
    else if (key && seen.has(key)) problems.push('repeated');
    if (key) seen.add(key);
    return { line: i + 2, name, email, phone, city, consentEmail: !!ce, consentSms: !!cs, problems, existing: hit?.id };
  });
  return { rows, missingColumns: [] };
}
/** Add the valid rows as new customers (ids continue the sequence). */
export function applyImport(list: Customer[], rows: ImportRow[], today: string): { customers: Customer[]; added: Customer[] } {
  let n = list.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 1000);
  const added = rows.filter((r) => !r.problems.length).map((r): Customer => {
    const k = phoneKey9(r.phone);
    return {
      id: `C-${++n}`, name: { ar: r.name, en: r.name }, city: { ar: r.city, en: r.city }, email: r.email,
      phone: k.length === 9 ? `+966 ${k.slice(0, 2)} ${k.slice(2, 5)} ${k.slice(5)}` : '', consent: { email: r.consentEmail, sms: r.consentSms }, since: today,
    };
  });
  return { customers: [...list, ...added], added };
}
