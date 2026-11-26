import { describe, expect, it } from 'vitest';
import { UPSELL_DEFAULTS, bagSuggestion, coPurchases, suggestionsFor, topPairs, upsellProblems, upsellStats } from './upsell-model';
import type { Order } from '../../../merchant/domain';
import type { Product as MProduct } from '../../../merchant/catalog';
import type { Product } from '../../../storefront/domain';

const mp = (id: string, sku: string, variants: string[] = []) => ({ id, sku, variants: variants.map((s) => ({ sku: s })) }) as unknown as MProduct;
const products = [mp('a', 'A'), mp('b', 'B', ['B-S', 'B-M']), mp('c', 'C'), mp('d', 'D')];
const ord = (skus: string[], extra: Partial<Order> = {}) => ({ items: skus.map((sku) => ({ sku, qty: 1, unit: 1000 })), pay: 'paid', ...extra }) as unknown as Order;
const orders = [ord(['A', 'B-S']), ord(['A', 'B-M']), ord(['A', 'B-S', 'C']), ord(['A', 'C']), ord(['A', 'D'], { pay: 'failed' }), ord(['A', 'D'], { cancelled: {} as never })];
const sp = (id: string, stock = 5) => ({ id, variants: [{ id: `${id}~x`, sku: id.toUpperCase(), price: 1000, stock }] }) as unknown as Product;
const store = [sp('a'), sp('b'), sp('c'), sp('d')];

describe('co-purchases', () => {
  const co = coPurchases(orders, products);
  it('counts orders by product (variants roll up), skipping failed and cancelled', () => {
    expect(co.get('a')?.get('b')).toBe(3);
    expect(co.get('a')?.get('c')).toBe(2);
    expect(co.get('a')?.get('d')).toBeUndefined();
    expect(topPairs(co, 2)).toEqual([{ a: 'a', b: 'b', n: 3 }, { a: 'a', b: 'c', n: 2 }]);
  });
  it('suggests pairs at or above the minimum, manual first, in stock, not in bag', () => {
    const s = { ...UPSELL_DEFAULTS, minSupport: 2 };
    expect(suggestionsFor('a', co, s, store).map((x) => x.id)).toEqual(['b', 'c']);
    expect(suggestionsFor('a', co, { ...s, minSupport: 3 }, store).map((x) => x.id)).toEqual(['b']);
    expect(suggestionsFor('a', co, { ...s, manual: { a: ['d'] } }, store).map((x) => [x.id, x.manual])).toEqual([['d', true], ['b', false], ['c', false]]);
    expect(suggestionsFor('a', co, s, [sp('a'), sp('b', 0), sp('c')]).map((x) => x.id)).toEqual(['c']);
    expect(suggestionsFor('a', co, s, [sp('a'), sp('c')]).map((x) => x.id)).toEqual(['c']); // b hidden from the store
    expect(suggestionsFor('a', co, s, store, ['b']).map((x) => x.id)).toEqual(['c']);
    expect(suggestionsFor('a', co, { ...s, exclude: ['b'] }, store).map((x) => x.id)).toEqual(['c']);
  });
  it('bag suggestion adds up what is in the bag', () => {
    expect(bagSuggestion(['b', 'c'], co, { ...UPSELL_DEFAULTS, minSupport: 2 }, store)?.id).toBe('a');
    expect(bagSuggestion([], co, UPSELL_DEFAULTS, store)).toBeNull();
    expect(bagSuggestion(['d'], co, UPSELL_DEFAULTS, store)).toBeNull();
  });
  it('validates settings', () => {
    expect(upsellProblems(UPSELL_DEFAULTS)).toEqual([]);
    expect(upsellProblems({ ...UPSELL_DEFAULTS, minSupport: 0, productBlock: false, bagSuggest: false })).toEqual(['support', 'nothing']);
  });
});

describe('attribution', () => {
  it('counts a later online order line with the added SKU once', () => {
    const o = (ref: string, placedAt: number, skus: string[]) => ({ ...ord(skus), ref, placedAt, channel: 'online' }) as Order;
    const adds = [{ productId: 'c', sku: 'C', at: 100, from: 'product' as const }, { productId: 'c', sku: 'C', at: 150, from: 'bag' as const }];
    const r = upsellStats(adds, [o('1', 200, ['A', 'C']), o('2', 50, ['C']), o('3', 300, ['A'])]);
    expect(r).toEqual({ adds: 2, orders: 1, revenue: 1000 });
  });
});
