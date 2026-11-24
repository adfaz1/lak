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
    // Updated for Phase B: the owner asked for returns, at-risk customers and restock questions.
    expect(questionsFor('fulfilment')).toEqual(['stock', 'late', 'returns', 'restock']);
    expect(questionsFor('marketing')).toEqual(['sales', 'conversion', 'risk']);
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

describe('refunds and returns, at-risk customers, restock first', () => {
  it('returns: honest when there is little data, and counts reasons and products', async () => {
    const { returnsInsight } = await import('./model');
    const { financeFixtures } = await import('../../merchant/finance');
    const base = returnsInsight(orders, financeFixtures(orders).txs, 30);
    expect(base.small).toBe(true);
    // A few size refunds on the same product: a driver with a product-description draft.
    const abaya = orders.filter((o) => o.pay === 'paid' && o.hoursAgo < 600 && o.items.some((i) => i.sku.startsWith('ABY'))).slice(0, 6);
    const withRefunds = orders.map((o) => abaya.includes(o) ? { ...o, refunds: [{ id: `R-${o.ref}`, amount: 10000, qty: o.items.map((i) => (i.sku.startsWith('ABY') ? 1 : 0)), shipping: 0, restock: o.items.map(() => 0), loc: 'ryd' as const, reason: 'size', status: 'confirmed' as const }] } : o);
    const r = returnsInsight(withRefunds, [], 30);
    expect(r.affected).toBe(6);
    expect(r.reasons[0]).toMatchObject({ key: 'size', count: 6, amount: 60000 });
    expect(r.small).toBe(false);
    expect(r.products[0].top).toBe('size');
    expect(r.draft).toMatchObject({ kind: 'product', section: 'products', query: { focus: 'descAr' }, need: 'product.edit' });
    expect(returnsInsight([], [], 30).draft).toBeNull();
  });
  it('risk: repeat customers later than twice their usual gap, with a prefilled win-back coupon', async () => {
    const { riskInsight, RISK_FACTOR } = await import('./model');
    const { customerFixtures } = await import('../../merchant/workspace');
    const r = riskInsight(customerFixtures(), orders, ['BACK10'], '2026-11-24');
    expect(r.count).toBeGreaterThan(0);
    for (const c of r.rows) expect(c.lastDays).toBeGreaterThanOrEqual(Math.floor(RISK_FACTOR * c.gapDays));
    expect(r.draft).toMatchObject({ kind: 'coupon', path: 'coupons/new', query: { cp: '1', type: 'percent', value: '10', per: '1', ends: '2026-12-08' }, need: 'marketing.manage' });
    expect(r.draft?.query?.code).not.toBe('BACK10');
    expect(riskInsight([], orders, [], '2026-11-24').draft).toBeNull();
  });
  it('restock: ranked by sales at risk, with reorder quantity and a transfer draft carrying the quantity', async () => {
    const { restockInsight } = await import('./model');
    const r = restockInsight(levels, historyFixtures(), orders);
    expect(r.rows.length).toBeGreaterThan(0);
    for (let i = 1; i < r.rows.length; i++) expect((r.rows[i - 1].lostWeek ?? 0) >= (r.rows[i].lostWeek ?? 0)).toBe(true);
    const t = r.rows.find((x) => x.transfer)!;
    expect(r.draft).toMatchObject({ kind: 'transfer', query: { sku: t.sku, to: t.transfer!.to, qty: String(t.transfer!.qty) } });
    expect(r.rows.every((x) => x.reorder >= 0)).toBe(true);
  });
});
