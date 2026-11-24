// Customers: pure rules for the list and the profile. No React.
// Order history, spend and segments come from merchant/workspace.ts (single source of truth).
import { total, type Order } from '../../merchant/domain';
import { SEGMENTS, customerStats, segmentsOf, type Customer, type Segment } from '../../merchant/workspace';

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
