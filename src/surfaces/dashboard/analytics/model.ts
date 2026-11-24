// Analytics: pure rules for periods, equal-period comparison, daily rows and breakdowns. No React.
// Daily figures come from merchant/growth.ts (analyticsSeries, summarize, change, periods); breakdowns from the order book.
import { seeded, total, type Channel, type L, type Order } from '../../merchant/domain';
import { analyticsSeries, change, periods, summarize, type DayStat } from '../../merchant/growth';
import { topProducts } from '../model/home';
import { toCsv } from '../../merchant/catalog';
import type { Range } from './range';

export type Period = 7 | 30 | 90;
export const PERIODS: Period[] = [7, 30, 90];
export const parsePeriod = (v: string | null): Period => (v === '7' ? 7 : v === '90' ? 90 : 30);
export type ChartMetric = 'net' | 'orders';
export const parseMetric = (v: string | null): ChartMetric => (v === 'orders' ? 'orders' : 'net');

/** Today in the fixture clock (Riyadh). Today is incomplete and never part of a period. */
export const TODAY = '2026-11-24';
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Demo history long enough to compare a 90-day period with the same days last year: 460 complete days ending yesterday.
 * The latest 56 days are exactly merchant/growth `analyticsSeries()` (what the home shows); older days are generated
 * backwards from there with a fixed seed (so a shorter history is a suffix of a longer one), including a few days
 * without visit data.
 */
export const HISTORY_DAYS = 460;
export function history(days: number = HISTORY_DAYS): DayStat[] {
  const recent = analyticsSeries();
  const need = Math.max(0, days - recent.length);
  const first = Date.parse(`${recent[0].date}T00:00:00Z`);
  const r = seeded(29);
  const older: DayStat[] = [];
  for (let i = 1; i <= need; i++) {
    const t = first - i * DAY;
    const friday = new Date(t).getUTCDay() === 5;
    const orders = Math.round(10 + r() * 11 + (friday ? 5 : 0));
    const net = orders * (20000 + Math.floor(r() * 8000));
    const missing = i % 37 === 0;
    older.push({ date: iso(t), orders, net, sessions: missing ? null : Math.round(orders * (55 + r() * 25)) });
  }
  return [...older.reverse(), ...recent];
}

export interface Figure { id: 'net' | 'orders' | 'aov' | 'conversion' | 'sessions'; value: number | null; prev: number | null; delta: number | null; unit: 'money' | 'count' | 'percent' }

/** Headline figures for the period and the previous equal period. A figure without data is null, never 0. */
export function figures(series: DayStat[], len: Period) {
  const { cur, prev } = periods(series, len);
  const a = summarize(cur), b = summarize(prev);
  const visits = (d: DayStat[]) => (d.some((x) => x.sessions !== null) ? d.reduce((s, x) => s + (x.sessions ?? 0), 0) : null);
  const va = visits(cur), vb = visits(prev);
  const list: Figure[] = [
    { id: 'net', value: a.net, prev: b.net, delta: change(a.net, b.net), unit: 'money' },
    { id: 'orders', value: a.orders, prev: b.orders, delta: change(a.orders, b.orders), unit: 'count' },
    { id: 'aov', value: a.aov, prev: b.aov, delta: change(a.aov, b.aov), unit: 'money' },
    { id: 'conversion', value: a.conversion, prev: b.conversion, delta: change(a.conversion, b.conversion), unit: 'percent' },
    { id: 'sessions', value: va, prev: vb, delta: a.sessionDays === b.sessionDays ? change(va, vb) : null, unit: 'count' },
  ];
  return {
    list,
    /** Equal periods only: the comparison is withheld when the history is shorter than two periods. */
    comparable: prev.length === len,
    coverage: { known: a.sessionDays, days: a.days, missing: cur.filter((d) => d.sessions === null).map((d) => d.date) },
    prevCoverage: { known: b.sessionDays, days: b.days },
    range: { from: cur[0]?.date ?? null, to: cur[cur.length - 1]?.date ?? null, prevFrom: prev[0]?.date ?? null, prevTo: prev[prev.length - 1]?.date ?? null },
  };
}

export interface DayRow { date: string; orders: number; net: number; sessions: number | null; conversion: number | null; prev: DayStat | null }
const conv = (d: DayStat) => (d.sessions ? Math.round((d.orders * 10000) / d.sessions) / 100 : null);

/** One row per day of the period, aligned with the matching day of the previous period. Newest first. */
export function dailyRows(series: DayStat[], len: Period): DayRow[] {
  const { cur, prev } = periods(series, len);
  const offset = prev.length - cur.length;
  return cur.map((d, i) => ({ date: d.date, orders: d.orders, net: d.net, sessions: d.sessions, conversion: conv(d), prev: prev[i + offset] ?? null })).reverse();
}

export function chartPoints(series: DayStat[], len: Period, metric: ChartMetric): { key: string; value: number }[] {
  return periods(series, len).cur.map((d) => ({ key: d.date, value: metric === 'net' ? d.net : d.orders }));
}

/** Days ago of an order in whole days (0 = today, which is incomplete). */
export const dayIndex = (o: Order) => Math.floor(o.hoursAgo / 24);

/** Paid orders created on the complete days of the period (failed payments excluded). */
export const periodOrders = (orders: Order[], len: Period) => orders.filter((o) => o.pay !== 'failed' && dayIndex(o) >= 1 && dayIndex(o) <= len);

export interface ChannelRow { channel: Channel; orders: number; revenue: number; share: number }
/** Sales by channel; share is of revenue, rounded so that shares of a non-empty period add up to 100. */
export function byChannel(orders: Order[]): ChannelRow[] {
  const ids: Channel[] = ['online', 'market', 'app'];
  const rev = (c: Channel) => orders.filter((o) => o.channel === c).reduce((s, o) => s + total(o), 0);
  const all = orders.reduce((s, o) => s + total(o), 0);
  const rows = ids.map((c) => ({ channel: c, orders: orders.filter((o) => o.channel === c).length, revenue: rev(c), share: all ? Math.round((rev(c) * 100) / all) : 0 }));
  if (all) {
    const drift = 100 - rows.reduce((s, r) => s + r.share, 0);
    const top = rows.reduce((a, b) => (b.revenue > a.revenue ? b : a));
    top.share += drift;
  }
  return rows.sort((a, b) => b.revenue - a.revenue);
}

const base = (s: string, sep: string) => s.split(sep)[0].trim();
export interface CityRow { key: string; name: L; orders: number; revenue: number; share: number }
/** Top cities by revenue; district names are dropped so "Riyadh, Al Malqa" counts as Riyadh. */
export function topCities(orders: Order[], limit = 5): CityRow[] {
  const m = new Map<string, CityRow>();
  for (const o of orders) {
    const key = base(o.city.en, ',');
    const cur = m.get(key) ?? { key, name: { ar: base(o.city.ar, '،'), en: key }, orders: 0, revenue: 0, share: 0 };
    cur.orders += 1; cur.revenue += total(o);
    m.set(key, cur);
  }
  const all = orders.reduce((s, o) => s + total(o), 0);
  return [...m.values()].map((c) => ({ ...c, share: all ? Math.round((c.revenue * 100) / all) : 0 })).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export const periodProducts = (orders: Order[], limit = 5) => topProducts(orders, limit);

/* ---------- Any range (custom periods and year-over-year) ---------- */

/** Days of the series inside a range; null when the series does not cover the whole range. */
export function slice(series: DayStat[], r: Range | null): DayStat[] | null {
  if (!r) return null;
  const ds = series.filter((d) => d.date >= r.from && d.date <= r.to);
  return ds.length === r.days ? ds : null;
}

/** Headline figures for a range and its comparison range. A comparison the history does not cover is withheld, not zero. */
export function figuresFor(series: DayStat[], r: Range, c: Range | null) {
  const cur = slice(series, r) ?? [];
  const prev = slice(series, c);
  const a = summarize(cur), b = prev ? summarize(prev) : null;
  const visits = (d: DayStat[]) => (d.some((x) => x.sessions !== null) ? d.reduce((s, x) => s + (x.sessions ?? 0), 0) : null);
  const va = cur.length ? visits(cur) : null, vb = prev ? visits(prev) : null;
  const has = cur.length > 0;
  const list: Figure[] = [
    { id: 'net', value: has ? a.net : null, prev: b?.net ?? null, delta: b ? change(a.net, b.net) : null, unit: 'money' },
    { id: 'orders', value: has ? a.orders : null, prev: b?.orders ?? null, delta: b ? change(a.orders, b.orders) : null, unit: 'count' },
    { id: 'aov', value: has ? a.aov : null, prev: b?.aov ?? null, delta: b ? change(a.aov, b.aov) : null, unit: 'money' },
    { id: 'conversion', value: has ? a.conversion : null, prev: b?.conversion ?? null, delta: b ? change(a.conversion, b.conversion) : null, unit: 'percent' },
    { id: 'sessions', value: va, prev: vb, delta: b && a.sessionDays === b.sessionDays ? change(va, vb) : null, unit: 'count' },
  ];
  return {
    list, comparable: !!prev, covered: cur.length === r.days,
    coverage: { known: a.sessionDays, days: cur.length, missing: cur.filter((d) => d.sessions === null).map((d) => d.date) },
  };
}

export interface RangeRow { date: string; orders: number; net: number; sessions: number | null; conversion: number | null; prev: DayStat | null }
/** One row per day of the range, aligned with the matching day of the comparison range. Newest first. */
export function rangeRows(series: DayStat[], r: Range, c: Range | null): RangeRow[] {
  const cur = slice(series, r) ?? [];
  const prev = slice(series, c);
  return cur.map((d, i) => ({ date: d.date, orders: d.orders, net: d.net, sessions: d.sessions, conversion: conv(d), prev: prev ? prev[i] ?? null : null })).reverse();
}
export const rangePoints = (series: DayStat[], r: Range, metric: ChartMetric) =>
  (slice(series, r) ?? []).map((d) => ({ key: d.date, value: metric === 'net' ? d.net : d.orders }));

/** Day-by-day CSV of the overview, with the comparison day when there is one. */
export function overviewCsv(rows: RangeRow[]): string {
  return toCsv([
    ['date', 'orders', 'net_sales_sar', 'visits', 'conversion_pct', 'comparison_date', 'comparison_orders', 'comparison_net_sar'],
    ...rows.map((r) => [r.date, r.orders, (r.net / 100).toFixed(2), r.sessions ?? 'no data', r.conversion ?? '', r.prev?.date ?? '', r.prev?.orders ?? '', r.prev ? (r.prev.net / 100).toFixed(2) : '']),
  ]);
}
