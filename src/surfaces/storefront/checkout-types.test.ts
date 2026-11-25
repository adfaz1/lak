// Checkout without shipping (catalog-extras types): a bag of downloads, codes, services and bookings asks only for
// contact details; a mixed bag asks an address for the shippable part; orders reach the dashboard without a shipment step.
import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf, typeFixtures } from '../merchant/catalog';
import { allOrders } from '../merchant/domain';
import { initialLevels } from '../merchant/inventory';
import { couponFixtures } from '../merchant/growth';
import { customerFixtures, shippingFixture, zoneFixtures } from '../merchant/workspace';
import { assignCodes, bagNeeds, buildOrderExtras, catalogXFixtures, deliveryText, riyadhToday } from '../merchant/catalog-extras';
import { noticeEvents } from '../merchant/ops';
import { deliveryOf, nextAction } from '../dashboard/orders/model';
import { applyPayment, pricedLines, submitOrder, validateContact, type Draft, type Order } from './domain';
import { shipOptions, syncOrder, toStoreProducts, type Book } from './bridge';

const NOW = Date.UTC(2026, 10, 24, 9);
const today = riyadhToday(NOW);
const mProducts = [...productFixtures(), ...typeFixtures()];
const levels = initialLevels(mProducts.filter((p) => p.type === 'physical' || p.type === 'food').flatMap(skusOf));
const store = toStoreProducts(mProducts, levels, catalogXFixtures(today), today);
const cfg = { zones: zoneFixtures(), shipping: shippingFixture() };
const vid = (pid: string) => store.find((p) => p.id === pid)!.variants.find((v) => v.stock > 0)!.id;

describe('what a bag asks for', () => {
  it('nothing ships: no address, an email when a code or download is sent', () => {
    const codeOnly = pricedLines({ lines: [{ vid: vid('p20'), qty: 1 }] }, store);
    expect(bagNeeds(codeOnly)).toEqual({ address: false, email: true, mode: 'none' });
    const service = pricedLines({ lines: [{ vid: vid('p21'), qty: 1 }, { vid: vid('p19'), qty: 1 }] }, store);
    expect(bagNeeds(service)).toEqual({ address: false, email: false, mode: 'none' });
    const mixed = pricedLines({ lines: [{ vid: vid('p20'), qty: 1 }, { vid: vid('p3'), qty: 1 }] }, store);
    expect(bagNeeds(mixed)).toEqual({ address: true, email: true, mode: 'mixed' });
    expect(bagNeeds([]).address).toBe(true);
  });
  it('contact-only validation: name, a Saudi mobile (Arabic digits), and email only when needed', () => {
    expect(validateContact({}, { needEmail: true })).toEqual({ name: 'required', phone: 'required', email: 'required' });
    expect(validateContact({ name: 'نورة', phone: '٠٥٥١٢٣٤٥٦٧' }, { needEmail: false })).toEqual({});
    expect(validateContact({ name: 'نورة', phone: '0551234567' }, { email: 'bad', needEmail: false })).toEqual({ email: 'format' });
  });
  it('offers one free "no delivery" option without a city; a mixed bag is quoted on the shippable part only', () => {
    const codeOnly = pricedLines({ lines: [{ vid: vid('p20'), qty: 2 }] }, store);
    const none = shipOptions(cfg, undefined, codeOnly, { now: NOW });
    expect(none.map((o) => [o.id, o.cost, o.codOk])).toEqual([['none', 0, false]]);
    const shirt = pricedLines({ lines: [{ vid: vid('p3'), qty: 1 }] }, store);
    const mixed = pricedLines({ lines: [{ vid: vid('p3'), qty: 1 }, { vid: vid('p20'), qty: 1 }] }, store);
    expect(shipOptions(cfg, undefined, mixed, { now: NOW })).toEqual([]);
    const a = shipOptions(cfg, 'riyadh', shirt, { now: NOW, goods: 50_000 }).map((o) => [o.id, o.cost]);
    expect(shipOptions(cfg, 'riyadh', mixed, { now: NOW, goods: 50_000 }).map((o) => [o.id, o.cost])).toEqual(a);
  });
});

describe('orders without a shipment step', () => {
  const book = (): Book => ({ orders: allOrders(), levels, customers: customerFixtures(), coupons: couponFixtures() });
  const place = (lines: { vid: string; qty: number }[], extra: Partial<Draft> = {}) => {
    const priced = pricedLines({ lines }, store);
    const ship = shipOptions(cfg, extra.city, priced, { now: NOW, locations: [] })[0];
    const d: Draft = { sessionId: 's9', lines: priced, discount: 0, ship: ship.id, method: 'card', ref: '10490', contact: { phone: '551234567', email: 'n@example.test', name: 'Noura' }, shipMethod: ship, codFee: 0, ...extra };
    const rec0: Order = submitOrder([], d, NOW).order;
    const rec = applyPayment(rec0, { type: 'attempt', outcome: 'success' }, 'card', NOW, 0).order;
    // As state.ts does on payment: codes are given from the pool, then the order is mirrored.
    const extras0 = buildOrderExtras(priced, store, [], {}, null);
    const given = assignCodes(mProducts, rec.lines.map((l) => ({ productId: l.productId, sku: l.sku ?? '', qty: l.qty })), rec.ref);
    const extras = { ...extras0, ...(given.codes.length ? { codes: given.codes } : {}) };
    const w = syncOrder(book(), rec0, rec, { products: store, now: NOW, extras });
    return { rec, o: w.orders[0], w };
  };
  it('a code-only order: no address, customer from the contact name, done on payment, codes in the delivery message', () => {
    const { rec, o, w } = place([{ vid: vid('p20'), qty: 2 }]);
    expect(rec.address).toBeUndefined();
    expect(rec.totals.shipping).toBe(0);
    expect(o).toMatchObject({ pay: 'paid', ful: 'done', ship: 'none', confirmed: true, fee: 0 });
    expect(o.address).toBeUndefined();
    expect(o.items[0]).toMatchObject({ sku: 'CLB-OUD-1M', noShip: 'code' });
    expect(w.customers.find((c) => c.id === o.customerId)!.name.en).toBe('Noura');
    expect(deliveryOf(o)).toBe('digital');
    expect(nextAction(o)).toMatchObject({ kind: 'none', reason: 'digital', remaining: 0 });
    expect(o.extras?.codes?.[0].codes).toEqual(['OUD-7Q2K-91', 'OUD-3M8P-44']);
    expect(noticeEvents(undefined, o).map((e) => e.event)).toEqual(['placed', 'digitalDelivered']);
    expect(deliveryText(o.extras, o.ref, 'en')).toBe('Codes: OUD-7Q2K-91, OUD-3M8P-44');
    // Nothing was held in a warehouse.
    expect(w.levels).toBe(levels);
  });
  it('a booking or service order is scheduled, not shipped', () => {
    const { o } = place([{ vid: vid('p19'), qty: 1 }]);
    expect(o).toMatchObject({ ful: 'done', ship: 'none' });
    expect(o.items[0].noShip).toBe('booking');
    expect(nextAction(o).reason).toBe('scheduled');
  });
  it('a mixed order fulfils only the shippable line; the code line counts as done', () => {
    const { o } = place([{ vid: vid('p3'), qty: 1 }, { vid: vid('p20'), qty: 1 }], {
      city: 'riyadh', address: { name: 'Noura', phone: '551234567', city: 'riyadh', district: 'Al Olaya', street: 'X', building: '1' },
    });
    expect(o.ful).toBe('none');
    expect(deliveryOf(o)).toBe('mixed');
    expect(nextAction(o)).toMatchObject({ kind: 'fulfil', remaining: 1 });
  });
  it('a failed payment sends no codes or links', () => {
    const o = { ...place([{ vid: vid('p20'), qty: 1 }]).o, pay: 'failed' as const };
    expect(noticeEvents(undefined, o).map((e) => e.event)).toEqual(['payFailed']);
  });
});
