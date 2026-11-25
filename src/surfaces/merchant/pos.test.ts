import { describe, expect, it } from 'vitest';
import { productFixtures } from './catalog';
import { initialLevels, applyStockEffects, levelOf } from './inventory';
import { skusOf } from './catalog';
import {
  addToCart, checkDiscount, checkTender, closeShift, counterRefund, defaultLimits, emptyCart, expectedCash, lookup, posSkus, saleEffects,
  saleToOrder, sellableAt, splitEven, tenderState, totals, type Shift, type Tender,
} from './pos';

const products = productFixtures();
const levels = initialLevels(products.flatMap(skusOf));
const oud = posSkus(products.find((p) => p.id === 'p3')!)[0];

describe('POS lookup and cart', () => {
  it('finds an exact SKU (Arabic digits ok) and a name in either language', () => {
    expect(lookup(products, 'oud-١٠٠').exact?.sku).toBe('OUD-100');
    expect(lookup(products, 'حقيبة').products.map((p) => p.id)).toContain('p4');
    expect(lookup(products, 'abaya').products[0].id).toBe('p1');
    expect(lookup(products, 'GFT-100').exact).toBeNull(); // digital: not sold at the counter
  });
  it('never adds more than the location can sell', () => {
    const stock = sellableAt(levels, 'OUD-100', 'ryd');
    let c = emptyCart();
    for (let i = 0; i < stock; i++) c = addToCart(c, oud, stock).cart;
    expect(c.lines[0].qty).toBe(stock);
    expect(addToCart(c, oud, stock).error).toBe('exceedsStock');
    expect(addToCart(emptyCart(), oud, 0).error).toBe('noStock');
  });
});

describe('POS discounts, VAT and tender', () => {
  const cart = addToCart(emptyCart(), { ...oud }, 10, 2).cart; // 2 × 129 = 258
  it('limits discounts by role unless a manager approved', () => {
    const d = { kind: 'pct' as const, value: 20, reason: 'عميل دائم' };
    expect(checkDiscount(cart, d, 'fulfilment', defaultLimits())).toBe('overLimit');
    expect(checkDiscount(cart, { ...d, approvedBy: 'سارة' }, 'fulfilment', defaultLimits())).toBeNull();
    expect(checkDiscount(cart, { ...d, reason: ' ' }, 'owner', defaultLimits())).toBe('reason');
    expect(checkDiscount(cart, { kind: 'amount', value: 99999, reason: 'x' }, 'owner', defaultLimits())).toBe('exceedsTotal');
  });
  it('computes VAT inside the discounted total', () => {
    const t = totals({ ...cart, discount: { kind: 'pct', value: 10, reason: 'x' } });
    expect(t.subtotal).toBe(25800);
    expect(t.discount).toBe(2580);
    expect(t.total).toBe(23220);
    expect(t.vat).toBe(Math.round((23220 * 15) / 115));
  });
  it('splits payment: card cannot exceed what is owed, cash gives change', () => {
    const total = 23220;
    const tenders: Tender[] = [{ id: '1', method: 'card', amount: 10000, state: 'paid' }];
    expect(checkTender(total, tenders, { method: 'card', amount: 20000 })).toBe('overpayNonCash');
    expect(checkTender(total, tenders, { method: 'cash', amount: 20000 })).toBeNull();
    const st = tenderState(total, [...tenders, { id: '2', method: 'cash', amount: 20000, state: 'paid' }]);
    expect(st.change).toBe(6780);
    expect(st.cashNet).toBe(13220);
    expect(st.complete).toBe(true);
    expect(tenderState(total, [{ id: '1', method: 'link', amount: total, state: 'pending' }]).complete).toBe(false);
    expect(splitEven(1001, 2)).toEqual([500, 501]);
    expect(checkTender(total, [], { method: 'credit', amount: 5000 }, 4000)).toBe('creditExceeds');
  });
});

describe('POS sale, shift and counter refund', () => {
  const cart = addToCart(emptyCart(), oud, 10, 2).cart;
  const tenders: Tender[] = [{ id: '1', method: 'cash', amount: 30000, state: 'paid' }];
  const order = saleToOrder(cart, tenders, { orders: [{ ref: '10500' }], loc: 'jed', city: { ar: 'جدة', en: 'Jeddah' }, cashier: { id: 'u2', name: 'فيصل' }, role: 'fulfilment', shift: 'SH-301', now: 1 });
  it('becomes a paid, handed-over order on channel pos and takes stock at that location', () => {
    expect(order).toMatchObject({ ref: '10501', channel: 'pos', pay: 'paid', ful: 'done', ship: 'delivered' });
    expect(order.pos?.change).toBe(4200);
    const lv = initialLevels(['OUD-100']).map((l) => (l.loc === 'jed' ? { ...l, onHand: 5 } : l));
    const after = applyStockEffects(lv, saleEffects(cart, 'jed'), 'فيصل', order.ref, 'POS').levels;
    expect(levelOf(after, 'OUD-100', 'jed')!.onHand).toBe(3);
    expect(levelOf(after, 'OUD-100', 'ryd')!.onHand).toBe(levelOf(lv, 'OUD-100', 'ryd')!.onHand);
  });
  it('expects float + cash kept − cash refunds, and needs a note for any variance', () => {
    const s: Shift = { id: 'SH-301', loc: 'jed', cashier: { id: 'u2', name: 'فيصل' }, openedAt: 0, float: 50000, moves: [{ kind: 'out', amount: 1000, reason: 'x', at: 0, by: 'x' }], cashRefunds: [{ ref: 'RF', amount: 2000 }] };
    expect(expectedCash(s, [order])).toBe(50000 + 25800 - 2000 - 1000);
    expect(closeShift(s, [order], { '50000': 1 }, '', 2).error).toBe('note');
    const ok = closeShift(s, [order], { '50000': 1, '20000': 1, '1000': 2, '500': 1, '100': 3 }, '', 2);
    expect(ok.error).toBeUndefined();
    expect(ok.shift.closed?.variance).toBe(0);
  });
  it('refunds at the counter at the price paid, restocks, and never twice', () => {
    const disc = { ...order, discount: 2580 };
    const r = counterRefund(disc, [1], true, 'cash', 'مقاس غير مناسب', 'سارة', 3);
    expect(r.amount).toBe(Math.round((12900 * 23220) / 25800));
    expect(r.order.refunds[0].status).toBe('confirmed');
    expect(r.effects).toEqual([{ sku: 'OUD-100', loc: 'jed', reserved: 0, onHand: 1 }]);
    expect(counterRefund(r.order, [2], true, 'cash', 'x', 'سارة', 4).error).toBe('qty');
    expect(counterRefund(order, [1], false, 'card', 'x', 'سارة', 4).order.refunds[0].status).toBe('pending');
    expect(counterRefund(order, [0], false, 'cash', 'x', 'سارة', 4).error).toBe('nothing');
  });
});
