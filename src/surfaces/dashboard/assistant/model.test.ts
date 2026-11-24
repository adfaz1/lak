import { describe, expect, it } from 'vitest';
import { allOrders } from '../../merchant/domain';
import { historyFixtures, initialLevels } from '../../merchant/inventory';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { automationFixtures, cartFixtures, type DayStat } from '../../merchant/growth';
import { history } from '../analytics/model';
import { headline } from '../model/home';
import { canDraft, conversionInsight, lateInsight, logDraft, parseQuestion, questionsFor, salesAnswer, stockInsight } from './model';

const orders = allOrders();
const levels = initialLevels(productFixtures().filter((p) => p.type !== 'digital').flatMap(skusOf));
const series = history();
const autos = automationFixtures();
const ctx = { levels, automations: autos, role: 'owner' as const };

describe('sales answer', () => {
  const s = salesAnswer(series, orders, 7, ctx);
  it('uses the same figures as the home headline', () => {
    if (s.kind !== 'answer') throw new Error('expected an answer');
    const net = headline(series, 7).find((f) => f.id === 'net')!;
    expect(s.net.cur).toBe(net.value);
    expect(s.net.delta).toBe(net.delta);
  });
  it('splits the difference into orders and average value that add up exactly', () => {
    if (s.kind !== 'answer') throw new Error('expected an answer');
    expect(s.effects.orders + s.effects.aov).toBe(s.net.cur - s.net.prev);
  });
  it('lists only movers in the same direction as the change', () => {
    if (s.kind !== 'answer') throw new Error('expected an answer');
    const down = s.net.cur < s.net.prev;
    for (const m of [...s.channels, ...s.products]) expect(down ? m.diff < 0 : m.diff > 0).toBe(true);
  });
  it('says the data is insufficient rather than inventing a comparison', () => {
    expect(salesAnswer(series.slice(-10), orders, 7, ctx).kind).toBe('insufficient');
    expect(salesAnswer([], [], 30, ctx).kind).toBe('insufficient');
  });
  it('proposes a draft only when sales fell', () => {
    const up: DayStat[] = series.slice(-14).map((d, i) => ({ ...d, net: i < 7 ? 100000 : 200000, orders: 10 }));
    const a = salesAnswer(up, orders, 7, ctx);
    expect(a.kind === 'answer' && a.draft).toBe(null);
    const down: DayStat[] = series.slice(-14).map((d, i) => ({ ...d, net: i < 7 ? 200000 : 100000, orders: 10, sessions: i < 7 ? 100 : 200 }));
    const b = salesAnswer(down, orders, 7, ctx);
    expect(b.kind === 'answer' && b.draft !== null).toBe(true);
  });
});

describe('stock, late and conversion', () => {
  it('stock proposes a transfer draft that opens the transfer form prefilled', () => {
    const st = stockInsight(levels, historyFixtures(), orders);
    expect(st.rows.length).toBeGreaterThan(0);
    expect(st.draft?.kind).toBe('transfer');
    expect(st.draft?.path).toBe('transfers/new');
    expect(st.draft?.query?.sku).toBe(st.rows[0].sku);
  });
  it('late orders propose the late-order alert template when no such automation runs', () => {
    const l = lateInsight(orders, autos);
    expect(l.count).toBeGreaterThan(0);
    expect(l.draft).toMatchObject({ kind: 'automation', query: { tpl: 'tpl-late' } });
    const active = autos.map((a) => ({ ...a, trigger: 'orderLate' as const, status: 'active' as const }));
    expect(lateInsight(orders, active).draft?.kind).toBe('orders');
  });
  it('conversion is honest about missing visit days', () => {
    const c = conversionInsight(series, cartFixtures(), autos);
    expect(c.kind).toBe('insufficient');
    expect(c.missingDates.length).toBeGreaterThan(2);
  });
});

describe('roles and log', () => {
  it('offers only questions whose data the role can open', () => {
    expect(questionsFor('fulfilment')).toEqual(['stock', 'late']);
    expect(questionsFor('marketing')).toEqual(['sales', 'conversion']);
    expect(parseQuestion('stock', 'marketing')).toBe('sales');
  });
  it('a draft needs the permission of the tool it opens', () => {
    const d = stockInsight(levels, historyFixtures(), orders).draft!;
    expect(canDraft('fulfilment', d)).toBe(true);
    expect(canDraft('finance', d)).toBe(false);
  });
  it('logs who opened which draft, newest first', () => {
    const l = logDraft(logDraft([], 'stock', 'transfer', 'فيصل', 1), 'late', 'automation', 'سارة', 2);
    expect(l.map((x) => x.who)).toEqual(['سارة', 'فيصل']);
  });
});
