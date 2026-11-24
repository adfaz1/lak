import { describe, expect, it } from 'vitest';
import { couponPrefill, couponQuery, prefillQty } from './prefill';

const q = (o: Record<string, string>) => new URLSearchParams(o);

describe('prefilled links', () => {
  it('round-trips a coupon draft through the URL', () => {
    const p = couponPrefill(q(couponQuery({ code: 'back10', type: 'percent', value: '10', per: '1', ends: '2026-12-08', scope: 'category', ids: ['Abayas'] })));
    expect(p).toEqual({ code: 'BACK10', type: 'percent', value: '10', limitPerCustomer: '1', ends: '2026-12-08', scopeKind: 'category', scopeIds: ['Abayas'] });
  });
  it('ignores links without the prefill marker and unknown values; reads Arabic digits', () => {
    expect(couponPrefill(q({ value: '10' }))).toBeNull();
    expect(couponPrefill(q({ cp: '1', type: 'cashback', value: '١٥', ends: 'tomorrow' }))).toEqual({ value: '15' });
  });
  it('reads a positive whole quantity, Arabic digits included', () => {
    expect(prefillQty(q({ qty: '١٢' }))).toBe(12);
    expect(prefillQty(q({ qty: '0' }))).toBeNull();
    expect(prefillQty(q({ qty: '2.5' }))).toBeNull();
    expect(prefillQty(q({}))).toBeNull();
  });
});
