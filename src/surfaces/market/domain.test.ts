import { describe, expect, it } from 'vitest';
import {
  addLine, canSubmit, checkoutBlock, checkoutTotals, groupCart, listingState, placeOrder, removeSeller, requestReturn,
  returnBlock, search, setQty, shippingFee, summarize, type Filters,
} from './domain';
import { PRODUCTS, SELLERS, initialListing, initialOrders } from './fixtures';

const P = (id: string) => PRODUCTS.find((p) => p.id === id)!;
const S = (id: string) => SELLERS.find((s) => s.id === id)!;
const F: Filters = { q: '', cat: '', seller: '', brand: '', city: 'riyadh', near: false, sort: 'relevance' };

describe('discovery', () => {
  it('searches across sellers in both languages and by store name', () => {
    expect(search(PRODUCTS, SELLERS, { ...F, q: 'oud' }).map((p) => p.id)).toEqual(['p4']);
    expect(search(PRODUCTS, SELLERS, { ...F, q: 'عطور' }).every((p) => p.seller === 'oud')).toBe(true);
    expect(search(PRODUCTS, SELLERS, { ...F, q: 'قهوه' }).length).toBe(0);
    expect(search(PRODUCTS, SELLERS, { ...F, q: 'نخلة' }).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
  it('filters by category, brand, seller and location, and sorts by price', () => {
    expect(search(PRODUCTS, SELLERS, { ...F, cat: 'coffee', brand: 'Hario' }).map((p) => p.id)).toEqual(['p3']);
    const near = search(PRODUCTS, SELLERS, { ...F, near: true, city: 'jeddah' });
    expect(new Set(near.map((p) => p.seller))).toEqual(new Set(['oud', 'raqmi']));
    const asc = search(PRODUCTS, SELLERS, { ...F, seller: 'nakhla', sort: 'priceAsc' }).map((p) => p.price);
    expect(asc).toEqual([5800, 6400, 8900]);
  });
});

describe('per-seller cart (QA22)', () => {
  it('keeps two sellers in separate groups with their own shipping, VAT and total', () => {
    let lines = addLine([], P('p1'), 2);
    lines = addLine(lines, P('p4'));
    lines = addLine(lines, P('p2'));
    const g = groupCart(lines, PRODUCTS, SELLERS, 'riyadh');
    expect(g.map((x) => x.seller.id)).toEqual(['nakhla', 'oud']);
    expect(g[0].subtotal).toBe(5800 * 2 + 6400);
    expect(g[0].shipping).toBe(1500);
    expect(g[0].total).toBe(18000 + 1500);
    expect(g[0].toFree).toBe(20000 - 18000);
    expect(g[1].shipping).toBe(0); // 450 SAR ≥ the seller's free-shipping threshold
    expect(g[1].vat).toBe(Math.round((45000 * 15) / 115));
  });
  it('caps quantity at stock and refuses out-of-stock items', () => {
    expect(addLine([], P('p6'))).toEqual([]);
    const l = addLine([], P('p3'), 50);
    expect(l[0].qty).toBe(6);
    expect(setQty(l, P('p3'), 0)).toEqual([]);
  });
  it('flags sellers that do not deliver to the city', () => {
    expect(shippingFee(S('sadu'), 'jeddah', 10000)).toBeNull();
    const g = groupCart(addLine([], P('p7')), PRODUCTS, SELLERS, 'jeddah')[0];
    expect(checkoutBlock(g, 'card')).toBe('noDelivery');
  });
  it('checks out one seller only and leaves the other in the cart', () => {
    const lines = addLine(addLine([], P('p1')), P('p11'));
    const [nakhla] = groupCart(lines, PRODUCTS, SELLERS, 'riyadh');
    const order = placeOrder(nakhla, 'cod', 'riyadh', '2026-11-24T10:00:00Z', 'MK-1')!;
    expect(order.seller).toBe('nakhla');
    expect(order.lines.map((l) => l.productId)).toEqual(['p1']);
    expect(order.codFee).toBe(1000);
    expect(order.total).toBe(5800 + 1500 + 1000);
    expect(order.pay).toBe('cod_due');
    expect(removeSeller(lines, PRODUCTS, 'nakhla')).toEqual([{ productId: 'p11', qty: 1 }]);
  });
  it('blocks cash on delivery where the seller does not offer it', () => {
    const g = groupCart(addLine([], P('p5')), PRODUCTS, SELLERS, 'riyadh')[0];
    expect(checkoutBlock(g, 'cod')).toBe('codUnavailable');
    expect(checkoutTotals(g, 'card').codFee).toBe(0);
  });
});

describe('returns', () => {
  it('opens within the seller window after delivery only', () => {
    const [o] = initialOrders();
    expect(returnBlock(o, S('lamsa'), '2026-11-24T10:00:00Z')).toBeNull();
    expect(returnBlock(o, S('lamsa'), '2026-12-20T10:00:00Z')).toBe('window');
    const r = requestReturn(o, S('lamsa'), '2026-11-24T10:00:00Z', 'size');
    expect(r.ret).toBe('requested');
    expect(returnBlock(r, S('lamsa'), '2026-11-24T10:00:00Z')).toBe('already');
  });
});

describe('listing eligibility (merchant side)', () => {
  const items = initialListing();
  const st = (id: string, verified = true) => listingState(items.find((i) => i.id === id)!, verified);
  it('never lists excluded categories and explains fixes', () => {
    expect(st('m9').state).toBe('excluded');
    expect(st('m8').state).toBe('excluded');
    expect(st('m6')).toEqual({ state: 'needs_fix', fixes: ['images', 'description'] });
    expect(st('m5').state).toBe('out_of_stock');
    expect(st('m7').state).toBe('rejected');
    expect(st('p1').state).toBe('listed');
    expect(st('p1', false).state).toBe('store_blocked');
  });
  it('allows submission only for eligible items', () => {
    expect(canSubmit(items.find((i) => i.id === 'm10')!, true)).toBe(true);
    expect(canSubmit(items.find((i) => i.id === 'm9')!, true)).toBe(false);
    const sum = summarize(items, true);
    expect(sum.listed).toBe(3);
    expect(Object.values(sum).reduce((a, b) => a + b, 0)).toBe(items.length);
  });
});
