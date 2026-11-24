import { describe, expect, it } from 'vitest';
import { allOrders, total } from '../../merchant/domain';
import { analyticsSeries, summarize } from '../../merchant/growth';
import { headline } from '../model/home';
import { byChannel, chartPoints, dailyRows, dayIndex, figures, history, parseMetric, parsePeriod, periodOrders, topCities } from './model';

const series = history();
const orders = allOrders();

describe('history and periods', () => {
  it('has 460 consecutive complete days ending yesterday (enough for a 90-day period vs last year)', () => {
    expect(series.length).toBe(460);
    expect(history(180)).toEqual(series.slice(-180));
    expect(series[series.length - 1].date).toBe('2026-11-23');
    for (let i = 1; i < series.length; i++) expect(Date.parse(series[i].date) - Date.parse(series[i - 1].date)).toBe(86400000);
  });
  it('the latest days are exactly the series the home uses', () => {
    expect(series.slice(-56)).toEqual(analyticsSeries());
    const h = headline(analyticsSeries(), 7);
    const f = figures(series, 7).list;
    expect(f.find((x) => x.id === 'net')!.value).toBe(h.find((x) => x.id === 'net')!.value);
    expect(f.find((x) => x.id === 'net')!.delta).toBe(h.find((x) => x.id === 'net')!.delta);
  });
  it('parses period and metric with safe defaults', () => {
    expect(parsePeriod('7')).toBe(7);
    expect(parsePeriod('90')).toBe(90);
    expect(parsePeriod('365')).toBe(30);
    expect(parseMetric('orders')).toBe('orders');
    expect(parseMetric('x')).toBe('net');
  });
  it('compares equal periods for 7, 30 and 90 days', () => {
    for (const len of [7, 30, 90] as const) {
      const f = figures(series, len);
      expect(f.comparable).toBe(true);
      expect(f.coverage.days).toBe(len);
      expect(f.prevCoverage.days).toBe(len);
      expect(f.range.to).toBe('2026-11-23');
    }
  });
  it('withholds the comparison when history is shorter than two periods', () => {
    const f = figures(series.slice(-40), 30);
    expect(f.comparable).toBe(false);
  });
});

describe('no data is not zero', () => {
  it('conversion uses only days with visit data and reports coverage', () => {
    const f = figures(series, 7);
    expect(f.coverage.known).toBeLessThan(7);
    expect(f.coverage.missing.length).toBe(7 - f.coverage.known);
    const conv = f.list.find((x) => x.id === 'conversion')!;
    expect(conv.value).toBe(summarize(series.slice(-7)).conversion);
  });
  it('visits are null (not 0) when no day has data, and conversion too', () => {
    const blank = series.slice(-14).map((d) => ({ ...d, sessions: null }));
    const f = figures(blank, 7).list;
    expect(f.find((x) => x.id === 'sessions')!.value).toBeNull();
    expect(f.find((x) => x.id === 'conversion')!.value).toBeNull();
  });
  it('does not compare visit totals over unequal coverage', () => {
    const f = figures(series, 7);
    if (f.coverage.known !== f.prevCoverage.known) expect(f.list.find((x) => x.id === 'sessions')!.delta).toBeNull();
  });
  it('daily rows keep a missing day as null and a true zero as 0', () => {
    const rows = dailyRows(series, 30);
    const zero = rows.find((r) => r.date === '2026-11-02')!;
    expect(zero.orders).toBe(0);
    expect(zero.net).toBe(0);
    const missing = rows.find((r) => r.sessions === null)!;
    expect(missing.conversion).toBeNull();
  });
});

describe('daily rows and chart', () => {
  it('rows are newest first and aligned with the matching previous day', () => {
    const rows = dailyRows(series, 7);
    expect(rows.length).toBe(7);
    expect(rows[0].date).toBe('2026-11-23');
    expect(rows[0].prev!.date).toBe('2026-11-16');
  });
  it('chart points follow the chosen metric in date order', () => {
    const p = chartPoints(series, 30, 'orders');
    expect(p.length).toBe(30);
    expect(p[29]).toEqual({ key: '2026-11-23', value: series[series.length - 1].orders });
  });
});

describe('breakdowns', () => {
  const po = periodOrders(orders, 30);
  it('use paid orders of complete days only (today and failed payments excluded)', () => {
    expect(po.every((o) => o.pay !== 'failed' && dayIndex(o) >= 1 && dayIndex(o) <= 30)).toBe(true);
    expect(po.length).toBeGreaterThan(0);
  });
  it('channel shares add up to 100 and revenues to the period total', () => {
    const rows = byChannel(po);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBe(100);
    expect(rows.reduce((s, r) => s + r.revenue, 0)).toBe(po.reduce((s, o) => s + total(o), 0));
    expect(byChannel([]).every((r) => r.share === 0)).toBe(true);
  });
  it('cities merge districts into one city and sort by revenue', () => {
    const cities = topCities(po, 10);
    expect(new Set(cities.map((c) => c.key)).size).toBe(cities.length);
    expect(cities.every((c) => !c.name.en.includes(','))).toBe(true);
    for (let i = 1; i < cities.length; i++) expect(cities[i - 1].revenue).toBeGreaterThanOrEqual(cities[i].revenue);
  });
});
