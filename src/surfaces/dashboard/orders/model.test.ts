import { describe, expect, it } from 'vitest';
import { allOrders, bulkEligibility, requestRefund, runBulk, settleRefund, simBulkFails, VIEWS, type Order } from '../../merchant/domain';
import { initialLevels } from '../../merchant/inventory';
import { productFixtures, skusOf } from '../../merchant/catalog';
import {
  ageOf, applyRestock, bestLocation, canShipFrom, chunks, customerOrderCount, exceptions, fulfil, initialPlan, labelRef, lineViews,
  listOrders, moneyBreakdown, nextAction, orderPerms, PAGE_SIZE, printSlip, readQuery, selectionRefs, skipSamples, timeline, toParams, undoConfirm,
} from './model';

const all = allOrders();
const byRef = (ref: string) => all.find((o) => o.ref === ref)!;
const q = (s = '') => readQuery(new URLSearchParams(s));

describe('list query in the URL', () => {
  it('reads defaults and ignores unknown values', () => {
    expect(q()).toEqual({ view: 'all', q: '', ch: undefined, pay: undefined, ful: undefined, ship: undefined, sort: 'new', page: 1 });
    expect(q('view=nope&sort=x&page=-3&ch=fax')).toMatchObject({ view: 'all', sort: 'new', page: 1, ch: undefined });
  });
  it('round-trips and drops defaults', () => {
    const s = 'view=late&q=سارة&ch=market&pay=paid&ful=none&ship=none&sort=high&page=2';
    const r = q(s);
    expect(toParams(r)).toEqual({ view: 'late', q: 'سارة', ch: 'market', pay: 'paid', ful: 'none', ship: 'none', sort: 'high', page: '2' });
    expect(toParams(q())).toEqual({ view: undefined, q: undefined, ch: undefined, pay: undefined, ful: undefined, ship: undefined, sort: undefined, page: undefined });
  });
});

describe('listOrders', () => {
  it('counts each saved view with VIEWS, on the filtered set', () => {
    const r = listOrders(all, q());
    expect(r.counts.all).toBe(1200);
    expect(r.counts.needs).toBe(all.filter(VIEWS.needs).length);
    expect(r.counts.payfail).toBe(all.filter(VIEWS.payfail).length);
    const m = listOrders(all, q('ch=market'));
    expect(m.counts.all).toBe(all.filter((o) => o.channel === 'market').length);
    expect(m.counts.late).toBe(all.filter((o) => o.channel === 'market' && VIEWS.late(o)).length);
  });
  it('pages by 25 and clamps an out-of-range page', () => {
    const r = listOrders(all, q('page=2'));
    expect(r.pageRows.length).toBe(PAGE_SIZE);
    expect(r.pages).toBe(Math.ceil(1200 / PAGE_SIZE));
    expect(listOrders(all, q('page=999')).page).toBe(r.pages);
  });
  it('sorts by age and by total', () => {
    const n = listOrders(all, q()).rows;
    for (let i = 1; i < 50; i++) expect(n[i - 1].hoursAgo).toBeLessThanOrEqual(n[i].hoursAgo);
    const h = listOrders(all, q('sort=high')).rows;
    const tot = (o: Order) => o.items.reduce((s, it) => s + it.qty * it.unit, 0) + o.fee;
    for (let i = 1; i < 50; i++) expect(tot(h[i - 1])).toBeGreaterThanOrEqual(tot(h[i]));
  });
  it('filters by shipment and searches by ref', () => {
    expect(listOrders(all, q('ship=transit')).rows.every((o) => o.ship === 'transit')).toBe(true);
    expect(listOrders(all, q('q=%2310482')).rows.map((o) => o.ref)).toContain('10482');
    expect(listOrders(all, q('q=zzzz')).rows).toEqual([]);
    expect(listOrders(all, q('q=zzzz')).filtered).toBe(true);
  });
});

describe('bulk scope and outcome (QA04)', () => {
  const r = listOrders(all, q());
  it('distinguishes this page from all matching results', () => {
    const sel = new Set(r.pageRows.slice(0, 3).map((o) => o.ref));
    expect(selectionRefs(r.rows, r.pageRows, sel, false)).toHaveLength(3);
    expect(selectionRefs(r.rows, r.pageRows, sel, true)).toHaveLength(1200);
  });
  it('gives sample refs for each skip reason', () => {
    const s = skipSamples(all, 'confirm');
    const e = bulkEligibility(all, 'confirm');
    for (const [reason, refs] of Object.entries(s)) {
      expect(refs!.length).toBeLessThanOrEqual(3);
      expect(e.reasons[reason as keyof typeof e.reasons]).toBeGreaterThan(0);
    }
  });
  it('retrying only the failed refs never repeats successes, and undo reverts only confirmed ones', () => {
    const refs = all.filter((o) => VIEWS.needs(o)).map((o) => o.ref);
    const first = runBulk(all, refs, 'slips', simBulkFails);
    expect(first.failed.length).toBeGreaterThan(0);
    const retry = runBulk(first.orders, first.failed, 'slips', () => false);
    expect(retry.ok.sort()).toEqual([...first.failed].sort());
    const after = retry.orders;
    expect(refs.every((ref) => after.find((o) => o.ref === ref)!.slips <= 1)).toBe(true);

    const c = runBulk(all, refs, 'confirm', () => false);
    const undone = undoConfirm(c.orders, c.ok);
    for (const ref of c.ok) expect(undone.find((o) => o.ref === ref)!.confirmed).toBe(false);
    expect(undone.find((o) => o.ref === '10478')).toBe(c.orders.find((o) => o.ref === '10478'));
  });
  it('splits work into chunks', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('next action and states', () => {
  it('asks to contact the customer when payment failed, never to fulfil', () => {
    expect(nextAction(byRef('10479'))).toMatchObject({ kind: 'contact', reason: 'payFailed' });
  });
  it('fulfils paid open orders and flags late ones', () => {
    expect(nextAction(byRef('10482'))).toMatchObject({ kind: 'fulfil', reason: 'ready' });
    const late = all.find((o) => VIEWS.late(o))!;
    expect(nextAction(late).reason).toBe('late');
    expect(exceptions(late)).toContain('late');
  });
  it('after a label the next step is "handed to carrier", then "delivered", then nothing', () => {
    expect(nextAction(byRef('10478'))).toMatchObject({ kind: 'ship', reason: 'labelIssued' });
    expect(nextAction(byRef('10477'))).toMatchObject({ kind: 'deliver', reason: 'inTransit' });
    expect(nextAction(byRef('10476')).reason).toBe('delivered');
  });
  it('formats age as hours or days', () => {
    expect(ageOf(0)).toEqual({ unit: 'now', n: 0 });
    expect(ageOf(5)).toEqual({ unit: 'h', n: 5 });
    expect(ageOf(72)).toEqual({ unit: 'd', n: 3 });
  });
});

describe('fulfilment (QA03)', () => {
  const multi = byRef('10483');
  it('starts from the location that can ship the most', () => {
    expect(bestLocation(multi)).toBe('jed');
    expect(canShipFrom(multi, 'jed')).toBe(3);
    expect(initialPlan(multi)).toMatchObject({ loc: 'jed', picks: [2, 0, 1] });
    expect(lineViews(multi)[0].stock).toEqual([{ loc: 'ryd', n: 1 }, { loc: 'jed', n: 3 }]);
  });
  it('a carrier outage keeps the order open with the same reference; retry issues exactly one label', () => {
    const plan = initialPlan(multi);
    const failed = fulfil(multi, plan, true);
    expect(failed.ok).toBe(false);
    expect(failed.order.fulfilments).toHaveLength(0);
    expect(labelRef(failed.order)).toBe(failed.ref);
    const ok = fulfil(failed.order, plan, false);
    expect(ok.ok).toBe(true);
    expect(ok.ref).toBe(failed.ref);
    expect(ok.order.fulfilments).toHaveLength(1);
    expect(ok.order.ful).toBe('partial');
    expect(ok.order.ship).toBe('label');
    expect(ok.order.log[ok.order.log.length - 1]).toMatchObject({ kind: 'partialFulfilled', carrier: 'a', units: 3 });
    // The rest from Riyadh completes it with a second, separate label.
    const rest = fulfil(ok.order, initialPlan(ok.order), false);
    expect(rest.order.ful).toBe('done');
    expect(rest.ref).not.toBe(ok.ref);
  });
  it('ships a single-location order in one label', () => {
    const r = fulfil(byRef('10482'), { ...initialPlan(byRef('10482')), carrier: 'b' }, false);
    expect(r).toMatchObject({ ok: true, ref: 'SIM-10482-1' });
    expect(r.order.ful).toBe('done');
    expect(fulfil(r.order, initialPlan(r.order), false).ok).toBe(false);
  });
  it('counts a printed slip in the timeline', () => {
    const p = printSlip(byRef('10482'));
    expect(p.slips).toBe(1);
    expect(timeline(p)[0].e.kind).toBe('slipPrinted');
  });
});

describe('money and refunds (QA06)', () => {
  const settled = byRef('10475');
  it('breaks the money down with VAT included', () => {
    const m = moneyBreakdown(settled);
    expect(m.total).toBe(m.subtotal + m.shipping);
    expect(m.vat).toBe(Math.round((m.total * 15) / 115));
    expect(m.net).toBe(m.total);
    expect(moneyBreakdown(byRef('10479'))).toMatchObject({ collected: 0, net: 0, refundable: 0 });
  });
  it('a pending refund is reserved but only a confirmed one reduces net', () => {
    const req = requestRefund(settled, [0, 1], false, [0, 1], 'ryd', 'damaged');
    const id = req.refunds[0].id;
    const pending = moneyBreakdown(req);
    expect(pending.refundPending).toBe(9800);
    expect(pending.net).toBe(pending.total);
    expect(pending.refundable).toBe(pending.total - 9800);
    const done = moneyBreakdown(settleRefund(req, id, true));
    expect(done).toMatchObject({ refunded: 9800, refundPending: 0, net: done.total - 9800 });
    const declined = moneyBreakdown(settleRefund(req, id, false));
    expect(declined).toMatchObject({ refunded: 0, refundPending: 0, refundable: declined.total });
  });
  it('restocks only the decided units at the chosen location', () => {
    const levels = initialLevels(productFixtures().flatMap(skusOf));
    const req = requestRefund(settled, [0, 2], false, [0, 1], 'jed', 'size');
    const before = levels.find((l) => l.sku === 'SHL-SLK-01' && l.loc === 'jed');
    const r = applyRestock(levels, req, req.refunds[0]);
    if (before) {
      expect(r.levels.find((l) => l.sku === 'SHL-SLK-01' && l.loc === 'jed')!.onHand).toBe(before.onHand + 1);
      expect(r.log).toHaveLength(1);
    } else expect(r.log).toHaveLength(0);
    expect(applyRestock(levels, req, { ...req.refunds[0], restock: [0, 0] }).levels).toBe(levels);
  });
});

describe('people and permissions', () => {
  it('counts orders from the same customer', () => {
    expect(customerOrderCount(all, byRef('10482'))).toBeGreaterThanOrEqual(1);
  });
  it('withholds orders from marketing and refunds from fulfilment', () => {
    expect(orderPerms('marketing').see).toBe(false);
    expect(orderPerms('fulfilment')).toMatchObject({ see: true, fulfil: true, refund: false, bulk: true });
    expect(orderPerms('finance')).toMatchObject({ see: true, fulfil: false, refund: true, bulk: false });
  });
});

/* ---------- Group 1 additions ---------- */
import { productFixtures as pf } from '../../merchant/catalog';
import { customerFixtures } from '../../merchant/workspace';
import { zoneFixtures } from '../../merchant/workspace';
import { initialLevels as il } from '../../merchant/inventory';
import { cancelOrder } from '../../merchant/ops';
import {
  createManual, emptyManual, invoiceOf, listOrders as lo, manualQuote, opsEligibility, ordersCsv, readQuery as rq, runOpsBulk, skuOptions, toParams as tp,
} from './model';

const ME = { name: 'سارة', role: 'owner' };
const NOW = Date.parse('2026-11-24T12:00:00Z');

describe('list filters: date, location, pay method, tag, assignee, cancelled view', () => {
  it('reads and writes the new keys in the URL', () => {
    const r = rq(new URLSearchParams('from=2026-11-01&to=2026-11-24&loc=jed&method=cod&tag=VIP&who=-&view=cancelled'));
    expect(r).toMatchObject({ from: '2026-11-01', to: '2026-11-24', loc: 'jed', method: 'cod', tag: 'VIP', who: '-', view: 'cancelled' });
    expect(tp(r)).toMatchObject({ from: '2026-11-01', loc: 'jed', method: 'cod', view: 'cancelled' });
    expect(rq(new URLSearchParams('from=yesterday')).from).toBeUndefined();
  });
  it('applies them and keeps tab counts on the filtered set', () => {
    const book = allOrders().map((o) => (o.ref === '10482' ? { ...o, tags: ['VIP'], placedAt: NOW - 3600_000 } : o.ref === '10481' ? cancelOrder(o, 'x', ME, NOW).order : o));
    expect(lo(book, rq(new URLSearchParams('tag=VIP')), NOW).rows.map((o) => o.ref)).toEqual(['10482']);
    const c = lo(book, rq(new URLSearchParams('view=cancelled')), NOW);
    expect(c.rows.map((o) => o.ref)).toEqual(['10481']);
    expect(c.counts.needs).toBe(book.filter((o) => VIEWS.needs(o)).length);
    expect(book.filter((o) => VIEWS.needs(o)).some((o) => o.ref === '10481')).toBe(false);
    const day = lo(book, rq(new URLSearchParams('from=2026-11-24&to=2026-11-24')), NOW);
    expect(day.rows.every((o) => o.hoursAgo < 24 || o.ref === '10482')).toBe(true);
  });
});

describe('bulk labels, shipped, invoices, export', () => {
  it('issues each label once, even when retried; multi-location orders are skipped with a reason', () => {
    const book = allOrders();
    const refs = ['10482', '10481', '10483', '10479', '10478'];
    const e = opsEligibility(book.filter((o) => refs.includes(o.ref)), 'labels');
    expect(e.eligible.map((o) => o.ref).sort()).toEqual(['10481', '10482']);
    expect(e.reasons).toMatchObject({ needsLocation: 1, payNotConfirmed: 1, alreadyFulfilled: 1 });
    const a = runOpsBulk(book, refs, 'labels', () => false, ME, NOW);
    expect(a.ok.sort()).toEqual(['10481', '10482']);
    expect(a.effects.length).toBe(2);
    const b = runOpsBulk(a.orders, refs, 'labels', () => false, ME, NOW);
    expect(b.ok).toEqual([]);
    expect(b.orders.find((o) => o.ref === '10482')!.fulfilments).toHaveLength(1);
    const s = runOpsBulk(a.orders, ['10482', '10476'], 'shipped', () => false, ME, NOW);
    expect(s.ok).toEqual(['10482']);
    expect(s.orders.find((o) => o.ref === '10482')!.ship).toBe('transit');
  });
  it('exports a CSV row per order with Arabic text and money in riyals', () => {
    const csv = ordersCsv([byRef('10482')], 'ar', NOW);
    expect(csv.startsWith('﻿ref,')).toBe(true);
    expect(csv).toContain('سارة العتيبي');
    expect(csv).toContain('511.00');
  });
});

describe('invoice', () => {
  it('matches the money breakdown: VAT 15% included, discount shown', () => {
    const o = { ...byRef('10482'), discount: 5000, coupon: 'NOUR10' };
    const inv = invoiceOf(o);
    const m = moneyBreakdown(o);
    expect(inv.total).toBe(m.total);
    expect(inv.vat).toBe(m.vat);
    expect(inv.discount).toBe(5000);
    expect(inv.excl + inv.vat).toBe(inv.total);
    expect(inv.no).toBe('INV-10482');
  });
});

describe('manual order', () => {
  const products = pf();
  const levels = il(products.flatMap((p) => (p.variants.length ? p.variants.map((v) => v.sku) : [p.sku])));
  const opts = skuOptions(products, levels);
  const customers = customerFixtures();
  const zones = zoneFixtures();
  const sku = opts.find((o) => o.total >= 2)!.sku;
  it('validates the draft (customer, city, address, items, discount, stock)', () => {
    const q = manualQuote(emptyManual(), opts, zones, customers);
    expect(q.errors).toEqual(expect.arrayContaining(['customer', 'phone', 'city', 'address', 'lines']));
    const big = manualQuote({ ...emptyManual(), lines: [{ sku, qty: '999' }], discount: 'abc' }, opts, zones, customers);
    expect(big.errors).toEqual(expect.arrayContaining(['stock', 'discount']));
  });
  it('creates a COD order for a new customer with Arabic digits, holds stock and logs who', () => {
    const d = { ...emptyManual(), newName: 'منى', newPhone: '٠٥٥١٢٣٤٥٦٧', city: 'Dammam', address: 'حي الشاطئ', lines: [{ sku, qty: '٢' }], discount: '١٠', pay: 'cod' as const };
    const r = createManual(d, { orders: allOrders(), levels, customers }, opts, zones, ME, NOW);
    expect(r.errors).toEqual([]);
    const o = r.order!;
    expect(o.ref).toBe('10484');
    expect(o.payment).toEqual({ method: 'cod', state: 'cod_due' });
    expect(o.discount).toBe(1000);
    expect(o.items[0].qty).toBe(2);
    expect(Object.values(o.items[0].reserved!).reduce((a, b) => a! + b!, 0)).toBe(2);
    expect(r.customers.length).toBe(customers.length + 1);
    const lvl = r.levels.filter((l) => l.sku === sku).reduce((s, l) => s + l.reserved, 0);
    expect(lvl).toBe(levels.filter((l) => l.sku === sku).reduce((s, l) => s + l.reserved, 0) + 2);
    expect(o.activity?.map((a) => a.kind)).toEqual(['manualCreated', 'stockReserved']);
    expect(o.log[0]).toMatchObject({ actor: 'سارة', at: NOW });
  });
});
