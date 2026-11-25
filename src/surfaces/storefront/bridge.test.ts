import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf } from '../merchant/catalog';
import { allOrders, issueLabel, total } from '../merchant/domain';
import { initialLevels, available } from '../merchant/inventory';
import { couponFixtures } from '../merchant/growth';
import { customerFixtures, customerStats, policyFixtures, providerFixtures, zoneFixtures } from '../merchant/workspace';
import { applyPayment, evaluateCoupon, pricedLines, submitOrder, validateCart, type Draft, type Order } from './domain';
import {
  catSlug, categoriesOf, fromMerchant, matchCustomer, phoneKey, reserve, returnDaysFrom, sellable, standardFor, storeConfig, syncOrder,
  toStoreCoupon, toStoreProducts, withMerchant, type Book,
} from './bridge';

const NOW = Date.UTC(2026, 10, 24, 9);
const mProducts = productFixtures();
const levels = initialLevels(mProducts.filter((p) => p.type !== 'digital').flatMap(skusOf));
const store = toStoreProducts(mProducts, levels);

describe('catalogue from the merchant', () => {
  it('lists only active products with the online channel on', () => {
    expect(store.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p13', 'p14', 'p15', 'p16', 'p17', 'p18']);
    const offline = mProducts.map((p) => (p.id === 'p2' ? { ...p, channels: { ...p.channels, online: false } } : p));
    expect(toStoreProducts(offline, levels).some((p) => p.id === 'p2')).toBe(false);
  });
  it('keeps names, prices, compare-at, categories and variants, with SKU-based variant ids', () => {
    const p1 = store.find((p) => p.id === 'p1')!;
    expect(p1.name.ar).toBe('عباية سوداء مطرّزة');
    expect(p1.compareAt).toBe(34000);
    expect(p1.cat).toBe('fashion');
    expect(p1.colors).toEqual(['Black', 'Navy']);
    expect(p1.sizes).toEqual(['S', 'M', 'L']);
    expect(p1.variants.find((v) => v.sku === 'ABY-LIN-BLA-M')?.id).toBe('p1~ABY-LIN-BLA-M');
    expect(categoriesOf(store).map((c) => c.id)).toEqual(['fashion', 'fragrance', 'bags', 'home', 'gifts']);
    expect(catSlug({ ar: 'عطور', en: 'Fragrance' })).toBe('fragrance');
  });
  it('sells what is available across warehouses; digital products have no stock limit', () => {
    // ABY-LIN-BLA-M: Riyadh 2 on hand − 1 reserved, Jeddah 3 → 4
    expect(sellable(levels, 'ABY-LIN-BLA-M')).toBe(4);
    expect(store.find((p) => p.id === 'p1')!.variants.find((v) => v.sku === 'ABY-LIN-BLA-M')!.stock).toBe(4);
    expect(store.find((p) => p.id === 'p10')!.variants[0].stock).toBe(Infinity);
    const zero = levels.map((l) => (l.sku === 'OUD-100' ? { ...l, onHand: l.reserved } : l));
    expect(toStoreProducts(mProducts, zero).find((p) => p.id === 'p3')!.variants[0].stock).toBe(0);
  });
  it('reflects a dashboard price edit immediately', () => {
    const edited = mProducts.map((p) => (p.id === 'p3' ? { ...p, price: 9900 } : p));
    expect(toStoreProducts(edited, levels).find((p) => p.id === 'p3')!.variants[0].price).toBe(9900);
  });
});

describe('settings', () => {
  const settings = { store: { name: 'دار نُوى' }, providers: providerFixtures(), plan: 'plus' as const, cod: { min: 0, max: 200000 }, policies: policyFixtures(), zones: zoneFixtures() };
  it('offers only connected payment providers, mapped to store methods', () => {
    expect(storeConfig(settings, { guest: true, codPerCustomer: 2 }).methods).toEqual(['card', 'cod']); // the demo store accepts Visa/Mastercard and cash on delivery
    const more = { ...settings, providers: settings.providers.map((p) => (p.id === 'mada' || p.id === 'applepay' ? { ...p, state: 'active' as const } : p)) };
    expect(storeConfig(more, { guest: true, codPerCustomer: null }).methods).toEqual(['card', 'applepay', 'cod']);
  });
  it('reads the return window from the published returns policy', () => {
    expect(returnDaysFrom(policyFixtures())).toBe(14);
    const t30 = { ar: 'الإرجاع خلال 30 يومًا.', en: 'Returns within 30 days.' };
    expect(returnDaysFrom([{ id: 'returns', state: 'published', text: t30, live: t30 }])).toBe(30);
    // A draft edit does not change the window shoppers are promised.
    expect(returnDaysFrom([{ id: 'returns', state: 'published', text: t30, live: { ar: 'خلال 7 أيام', en: 'within 7 days' } }])).toBe(7);
  });
  it('prices standard delivery from the city zone, flat or by weight, with the zone free threshold', () => {
    const zones = zoneFixtures();
    expect(standardFor(zones, 'riyadh', 500)).toMatchObject({ cost: 2500, freeFrom: 30000 });
    expect(standardFor(zones, 'jeddah', 500)).toMatchObject({ cost: 2500, freeFrom: null });
    // Rest of the kingdom: 25 + 5 per started kg above the first (2.4 kg → 2 extra kg)
    expect(standardFor(zones, 'abha', 2400)).toMatchObject({ cost: 3500 });
    expect(standardFor(zones.slice(0, 2), 'abha', 500)).toBeUndefined();
  });
});

describe('coupons from the merchant', () => {
  const lines = pricedLines({ lines: [{ vid: 'p4~BAG-LTH-01', qty: 1 }] }, store);
  const all = couponFixtures();
  const list = (uses = 0) => all.map((c) => toStoreCoupon(c, uses));
  it('accepts a live coupon and keeps each refusal reason', () => {
    expect(evaluateCoupon('welcome10', lines, list(), NOW)).toMatchObject({ status: 'valid', discount: 4200 });
    expect(evaluateCoupon('WELCOME10', lines, list(1), NOW).status).toBe('per_customer');
    expect(evaluateCoupon('NOV50', lines, list(), NOW).status).toBe('limit_reached');
    expect(evaluateCoupon('RAMADAN15', lines, list(), NOW).status).toBe('not_found');
    expect(evaluateCoupon('SHIPFREE', lines, list(), NOW)).toMatchObject({ status: 'valid', freeShip: true, discount: 0 });
    const paused = all.map((c) => toStoreCoupon(c.code === 'WELCOME10' ? { ...c, status: 'paused' } : c));
    expect(evaluateCoupon('WELCOME10', lines, paused, NOW).status).toBe('inactive');
    const small = pricedLines({ lines: [{ vid: 'p8~MAT-PRY-01', qty: 1 }] }, store);
    expect(evaluateCoupon('SHIPFREE', small, list(), NOW)).toMatchObject({ status: 'not_eligible', reason: 'min_subtotal' });
  });
});

describe('customers', () => {
  const list = customerFixtures();
  it('matches by mobile in any format or by email, and adds new shoppers', () => {
    expect(phoneKey('+966 50 000 1005')).toBe('500001005');
    expect(matchCustomer(list, { name: 'x', phone: '0500001005', city: { ar: '', en: '' } }, '2026-11-24').customer.id).toBe('C-1005');
    expect(matchCustomer(list, { name: 'x', phone: '599999999', email: 'CUSTOMER1003@example.test', city: { ar: '', en: '' } }, '2026-11-24').customer.id).toBe('C-1003');
    const n = matchCustomer(list, { name: 'Noor', phone: '599999999', city: { ar: 'جدة', en: 'Jeddah' } }, '2026-11-24');
    expect(n.created).toBe(true);
    expect(n.customer).toMatchObject({ id: `C-${1000 + list.length + 1}`, phone: '+966 59 999 9999', since: '2026-11-24' });
  });
});

describe('orders into the merchant book', () => {
  const book = (): Book => ({ orders: allOrders(), levels, customers: customerFixtures(), coupons: couponFixtures() });
  const draft = (_b: Book, extra: Partial<Draft> = {}): Draft => {
    const lines = pricedLines({ lines: [{ vid: 'p1~ABY-LIN-BLA-M', qty: 3 }, { vid: 'p10~GFT-100', qty: 1 }] }, store);
    return {
      sessionId: 's1', lines, discount: 0, ship: 'standard', city: 'jeddah', method: 'card', ref: '10484',
      address: { name: 'Noor', phone: '599999999', city: 'jeddah', district: 'Ar Rawdah', street: 'X', building: '1' },
      contact: { phone: '599999999' }, shipMethod: standardFor(zoneFixtures(), 'jeddah', 1950), codFee: 0, ...extra,
    };
  };
  const place = (b: Book, d: Draft, events: Parameters<typeof applyPayment>[1][], method: Draft['method'] = 'card') => {
    let rec: Order = submitOrder([], d, NOW).order;
    let w = b;
    for (const e of events) {
      const before = rec;
      rec = applyPayment(rec, e, method, NOW, 0).order;
      w = syncOrder(w, before, rec, { products: store, now: NOW });
    }
    return { rec, w };
  };

  it('a paid checkout becomes an online order at the top, reserves stock and adds the customer', () => {
    const b = book();
    const { rec, w } = place(b, draft(b), [{ type: 'attempt', outcome: 'success' }]);
    const o = w.orders[0];
    expect(o).toMatchObject({ ref: '10484', channel: 'online', pay: 'paid', ful: 'none', ship: 'none', hoursAgo: 0, payment: { method: 'card', state: 'paid' } });
    expect(o.items.map((i) => [i.sku, i.qty])).toEqual([['ABY-LIN-BLA-M', 3], ['GFT-100', 1]]);
    expect(total(o)).toBe(rec.totals.total);
    expect(o.log).toEqual([{ when: 'now', who: 'system', kind: 'created' }]);
    // 3 units: Riyadh has 1 available, Jeddah 3 → the whole line from Jeddah.
    const jed = w.levels.find((l) => l.sku === 'ABY-LIN-BLA-M' && l.loc === 'jed')!;
    expect(jed.reserved).toBe(3);
    expect(sellable(w.levels, 'ABY-LIN-BLA-M')).toBe(1);
    // The new shopper is a customer whose profile counts the order.
    const c = w.customers.find((x) => x.id === o.customerId)!;
    expect(c.name.en).toBe('Noor');
    expect(customerStats(c, w.orders).paidCount).toBe(1);
  });
  it('a declined payment leaves a failed order with nothing reserved; a successful retry pays the same order', () => {
    const b = book();
    const d = draft(b);
    const first = place(b, d, [{ type: 'attempt', outcome: 'declined' }]);
    expect(first.w.orders[0]).toMatchObject({ ref: '10484', pay: 'failed', log: [{ kind: 'payFailed' }] });
    expect(first.w.levels).toBe(b.levels);
    const second = place(b, d, [{ type: 'attempt', outcome: 'declined' }, { type: 'attempt', outcome: 'success' }]);
    expect(second.w.orders.filter((o) => o.ref === '10484')).toHaveLength(1);
    expect(second.w.orders[0].pay).toBe('paid');
    expect(second.w.orders[0].log.map((e) => e.kind)).toEqual(['payFailed', 'created']);
    expect(sellable(second.w.levels, 'ABY-LIN-BLA-M')).toBe(1);
  });
  it('creates nothing while the bank challenge is open, and records pending verification as not collected', () => {
    const b = book();
    expect(place(b, draft(b), [{ type: 'attempt', outcome: '3ds' }]).w).toBe(b);
    const v = place(b, draft(b), [{ type: 'attempt', outcome: 'timeout' }]).w.orders[0];
    expect(v).toMatchObject({ pay: 'failed', payment: { state: 'verifying' } });
  });
  it('confirms cash on delivery as an order to fulfil, and counts the coupon use', () => {
    const b = book();
    const { w } = place(b, draft(b, { coupon: 'WELCOME10', discount: 1000 }), [{ type: 'cod' }], 'cod');
    expect(w.orders[0]).toMatchObject({ pay: 'paid', payment: { method: 'cod', state: 'cod_due' }, coupon: 'WELCOME10', discount: 1000 });
    expect(w.coupons.find((c) => c.code === 'WELCOME10')!.used).toBe(215);
  });
  it('shows the merchant’s fulfilment to the shopper', () => {
    const b = book();
    const { rec, w } = place(b, draft(b), [{ type: 'attempt', outcome: 'success' }]);
    expect(withMerchant(rec, w.orders[0], NOW)).toMatchObject({ ful: 'unfulfilled', shipment: 'none' });
    const labelled = issueLabel(w.orders[0], 'a', false);
    expect(withMerchant(rec, labelled, NOW)).toMatchObject({ ful: 'fulfilled', shipment: 'label', trackingNo: 'SIM-10484-1' });
    expect(withMerchant(rec, { ...labelled, ship: 'delivered' }, NOW).shipment).toBe('delivered');
  });
  it('turns merchant history into shopper orders with line names and the customer’s mobile', () => {
    const m = allOrders().find((o) => o.ref === '10476')!;
    const c = customerFixtures().find((x) => x.name.en === m.customer.en);
    const o = fromMerchant(m, mProducts, c, NOW);
    expect(o).toMatchObject({ ref: '10476', key: 'm-10476', shipment: 'delivered', ful: 'fulfilled', pay: { state: 'paid' } });
    expect(o.lines[0]).toMatchObject({ vid: 'p4~BAG-LTH-01', sku: 'BAG-LTH-01' });
    expect(o.totals.total).toBe(total(m));
  });
  it('reserves from one warehouse when it can, otherwise splits', () => {
    const r = reserve(levels, 'ABY-LIN-BLA-M', 4);
    expect(r.picks).toEqual({ ryd: 1, jed: 3 });
    expect(r.short).toBe(0);
    expect(r.levels.filter((l) => l.sku === 'ABY-LIN-BLA-M').every((l) => available(l) === 0)).toBe(true);
    expect(validateCart({ lines: [{ vid: 'p1~ABY-LIN-BLA-M', qty: 5 }] }, store)).toEqual([{ vid: 'p1~ABY-LIN-BLA-M', kind: 'reduced', available: 4 }]);
  });
});

/* Group 1: shopper returns and cancellation reach the merchant */
import { mirrorReturns as mirrorR, withMerchant as withM } from './bridge';
import { allOrders as allM } from '../merchant/domain';
import { approveReturn as approveR } from '../merchant/ops';
import type { Order as SOrder } from './domain';

describe('store return requests become merchant returns', () => {
  it('mirrors once with the same RMA id, and the merchant stage flows back', () => {
    const m = allM().find((o) => o.ref === '10476')!;
    const s = { ref: '10476', returns: [{ id: 'RMA-10476-1', lines: [{ vid: 'p~BAG-LTH-01', qty: 1, reason: 'damaged' }], method: 'pickup', refundTo: 'original', state: 'requested', refund: 'not_started', at: 1, amount: 42000 }],
      lines: [{ vid: 'p~BAG-LTH-01', productId: 'p', qty: 1, unit: 42000, amount: 42000, sku: 'BAG-LTH-01' }], pay: { method: 'card', state: 'paid', attempts: [] }, at: 0 } as unknown as SOrder;
    const a = mirrorR(m, s);
    expect(a.returns).toHaveLength(1);
    expect(a.returns![0]).toMatchObject({ id: 'RMA-10476-1', source: 'store', stage: 'requested' });
    expect(mirrorR(a, s)).toBe(a);
    const b = approveR(a, 'RMA-10476-1', { name: 'x', role: 'owner' }, 2);
    expect(withM(s, b, 3).returns[0].state).toBe('approved');
  });
});
