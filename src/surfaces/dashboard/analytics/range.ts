// Report periods shared by analytics and finance: presets or a custom range of complete days (Riyadh time),
// and the comparison period (previous equal period, or the same dates last year). Pure, no React.
import type { Order } from '../../merchant/domain';

/** Today in the fixture clock. Today is incomplete, so every period ends yesterday at the latest. */
export const TODAY = '2026-11-24';
export const YESTERDAY = '2026-11-23';
const DAY = 86400000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(ms(d) + n * DAY);
/** Whole days from a to b (b − a). */
export const diffDays = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
/** Same calendar date one year earlier (29 Feb becomes 28 Feb). */
export function lastYear(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y - 1, m - 1, day));
  if (t.getUTCMonth() !== m - 1) return iso(Date.UTC(y - 1, m, 0));
  return iso(t.getTime());
}

export interface Range { from: string; to: string; days: number }
export const range = (from: string, to: string): Range => ({ from, to, days: diffDays(from, to) + 1 });
export const inRange = (d: string, r: Range | null) => !!r && d >= r.from && d <= r.to;
/** Every date of a range, oldest first. */
export const daysOf = (r: Range) => Array.from({ length: r.days }, (_, i) => addDays(r.from, i));

export type Preset = '7' | '30' | '90' | 'mtd' | 'custom';
export const PRESETS: Preset[] = ['7', '30', '90', 'mtd', 'custom'];
export type CompareMode = 'prev' | 'yoy' | 'off';
export const MAX_DAYS = 366;

/** Accepts 2026-11-03, 3/11/2026 or Arabic-Indic digits (٢٠٢٦-١١-٠٣). Returns ISO or null. */
export function parseDay(input: string): string | null {
  const s = input.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[/.]/g, '-');
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else if ((mt = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s))) [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return iso(t.getTime());
}

export type RangeError = 'format' | 'order' | 'future' | 'tooLong';
/** Check a custom range typed by the merchant. The end may not be today or later (today is incomplete). */
export function checkRange(fromText: string, toText: string, max = YESTERDAY): { ok: true; range: Range } | { ok: false; error: RangeError } {
  const from = parseDay(fromText), to = parseDay(toText);
  if (!from || !to) return { ok: false, error: 'format' };
  if (from > to) return { ok: false, error: 'order' };
  if (to > max) return { ok: false, error: 'future' };
  if (diffDays(from, to) + 1 > MAX_DAYS) return { ok: false, error: 'tooLong' };
  return { ok: true, range: range(from, to) };
}

export function presetRange(p: Exclude<Preset, 'custom'>): Range {
  if (p === 'mtd') return range(`${YESTERDAY.slice(0, 8)}01`, YESTERDAY);
  return range(addDays(YESTERDAY, -(Number(p) - 1)), YESTERDAY);
}

/**
 * Period from the URL: `period=7|30|90|mtd` or `period=custom&from=&to=`. An invalid custom range falls back to
 * 30 days and reports the error, so the page never shows an empty report because of a typo in the address.
 */
export function readPeriod(q: URLSearchParams): { preset: Preset; range: Range; error: RangeError | null } {
  const p = q.get('period');
  if (p === 'custom') {
    const r = checkRange(q.get('from') ?? '', q.get('to') ?? '');
    return r.ok ? { preset: 'custom', range: r.range, error: null } : { preset: '30', range: presetRange('30'), error: r.error };
  }
  const preset: Exclude<Preset, 'custom'> = p === '7' || p === '90' || p === 'mtd' ? p : '30';
  return { preset, range: presetRange(preset), error: null };
}
export const readCompare = (q: URLSearchParams): CompareMode => {
  const c = q.get('cmp');
  return c === 'yoy' || c === 'off' ? c : 'prev';
};

/** The comparison period: the equal period right before, or the same dates last year. Null when comparison is off. */
export function compareRange(r: Range, mode: CompareMode): Range | null {
  if (mode === 'off') return null;
  if (mode === 'yoy') return range(lastYear(r.from), lastYear(r.to));
  return range(addDays(r.from, -r.days), addDays(r.from, -1));
}

/** Calendar day an order was placed in the fixture clock. */
export const orderDay = (o: Pick<Order, 'hoursAgo'>) => addDays(TODAY, -Math.floor(o.hoursAgo / 24));
/** Paid (not failed) orders placed on the days of the range. */
export const ordersIn = (orders: Order[], r: Range | null) => (r ? orders.filter((o) => o.pay !== 'failed' && inRange(orderDay(o), r)) : []);
/** Whether the data source covers the whole range (earliest = first day the source has). */
export const covered = (r: Range | null, earliest: string) => !!r && r.from >= earliest && r.to <= YESTERDAY;

/** Query keys for a period, for links and saved views. */
export function periodQuery(preset: Preset, r: Range, cmp: CompareMode): Record<string, string | undefined> {
  return {
    period: preset === '30' ? undefined : preset,
    from: preset === 'custom' ? r.from : undefined,
    to: preset === 'custom' ? r.to : undefined,
    cmp: cmp === 'prev' ? undefined : cmp,
  };
}

/** Change in percent with one decimal; null when there is nothing fair to compare with. */
export function pct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return Math.round(((cur - prev) * 1000) / prev) / 10;
}
