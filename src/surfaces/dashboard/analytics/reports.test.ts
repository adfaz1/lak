import { describe, expect, it } from 'vitest';
import { allOrders } from '../../merchant/domain';
import { productFixtures } from '../../merchant/catalog';
import { cartFixtures, couponFixtures } from '../../merchant/growth';
import { financeFixtures } from '../../merchant/finance';
import { history } from './model';
import { checkRange, compareRange, lastYear, parseDay, presetRange, readPeriod } from './range';
import { REPORTS, buildReport, tableCsv, type Inputs } from './reports';
import { addView, checkViewName, currentView, viewQuery } from './views';

const x: Inputs = { orders: allOrders(), series: history(), products: productFixtures(), carts: cartFixtures(), coupons: couponFixtures(), txs: financeFixtures().txs, names: true };

describe('periods', () => {
  it('accepts Arabic digits and day-first dates, rejects bad ranges', () => {
    expect(parseDay('٢٠٢٦-١١-٠٣')).toBe('2026-11-03');
    expect(parseDay('3/11/2026')).toBe('2026-11-03');
    expect(parseDay('2026-02-30')).toBeNull();
    expect(checkRange('2026-11-10', '2026-11-01')).toEqual({ ok: false, error: 'order' });
    expect(checkRange('2026-11-01', '2026-11-24')).toEqual({ ok: false, error: 'future' });
    expect(checkRange('2026-11-01', '2026-11-24', '2026-11-24').ok).toBe(true);
  });
  it('compares with the previous equal period or the same dates last year', () => {
    const r = presetRange('30');
    expect(r.to).toBe('2026-11-23');
    const p = compareRange(r, 'prev')!;
    expect(p.days).toBe(30);
    expect(p.to < r.from).toBe(true);
    expect(compareRange(r, 'yoy')!.from).toBe(lastYear(r.from));
    expect(compareRange(r, 'off')).toBeNull();
  });
  it('falls back to 30 days on an invalid custom range in the URL and says why', () => {
    const q = new URLSearchParams('period=custom&from=2026-11-20&to=2026-11-01');
    expect(readPeriod(q)).toMatchObject({ preset: '30', error: 'order' });
  });
});

describe('reports', () => {
  const r = presetRange('30');
  it('every report builds for every comparison mode, with a definition per metric', () => {
    for (const id of REPORTS) for (const m of ['prev', 'yoy', 'off'] as const) {
      const rep = buildReport(id, x, r, compareRange(r, m));
      expect(rep.metrics.length).toBeGreaterThan(0);
      for (const k of rep.metrics) { expect(k.hint.ar.length).toBeGreaterThan(5); expect(k.hint.en.length).toBeGreaterThan(5); }
    }
  });
  it('sales: gross − discounts − refunds = net', () => {
    const rep = buildReport('sales', x, presetRange('mtd'), null);
    const v = (id: string) => rep.metrics.find((m) => m.id === id)!.value!;
    expect(v('gross') - v('discounts') - v('refunds')).toBe(v('net'));
  });
  it('order-book reports show no data (not zero) when last year is outside the book', () => {
    const rep = buildReport('channels', x, r, compareRange(r, 'yoy'));
    expect(rep.metrics[0].prev).toBeNull();
    expect(rep.metrics[0].delta).toBeNull();
  });
  it('products lists active products with no sales and margin only with a cost', () => {
    const rep = buildReport('products', x, presetRange('7'), null, { sort: 'worst' });
    const rows = rep.tables[0].rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.margin === null)).toBe(true);
  });
  it('customers: new + returning = buying customers', () => {
    const rep = buildReport('customers', x, r, null);
    const v = (id: string) => rep.metrics.find((m) => m.id === id)!.value!;
    expect(v('new') + v('returning')).toBe(v('customers'));
  });
  it('funnel steps never grow', () => {
    const rows = buildReport('funnel', x, r, null).tables[0].rows.map((row) => row.count as number);
    for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeLessThanOrEqual(rows[i - 1]);
  });
  it('CSV states the period and has one line per row', () => {
    const t = buildReport('channels', x, r, null).tables[0];
    const csv = tableCsv(t, 'en', { from: r.from, to: r.to, cmp: 'prev' });
    expect(csv.split('\r\n').filter(Boolean).length).toBe(t.rows.length + 2);
    expect(csv).toContain(r.from);
  });
});

describe('saved views', () => {
  it('keeps only report keys and refuses duplicate names', () => {
    const q = new URLSearchParams('report=sales&period=7&review=1&page=2');
    expect(viewQuery(q)).toBe('report=sales&period=7');
    const l = addView([], 'Weekly', viewQuery(q), 'owner', 'now');
    expect(checkViewName('weekly', l)).toBe('taken');
    expect(checkViewName('  ', l)).toBe('empty');
    expect(currentView(l, q)?.name).toBe('Weekly');
  });
});
