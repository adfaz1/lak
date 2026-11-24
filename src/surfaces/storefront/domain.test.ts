import { describe, expect, it } from 'vitest';
import {
  DAY, MERCHANT, SHIP_METHODS, addBusinessDays, addToCart, advanceFulfilment, applyPayment, canPay, catalogue, checkoutKey,
  computeTotals, coupons, deliveryEstimate, evaluateCoupon, findVariant, listProducts, missingOptions, normalize, payEligibility,
  payTransition, pricedLines, refundEstimate, removeLine, requestReturn, returnEligibility, returnableQty, setQty, shipById,
  submitOrder, validIban, validateAddress, validateCart, vatIn,
  type Cart, type Draft, type ListQuery, type Order,
} from './domain';

const NOW = Date.UTC(2026, 10, 24, 9); // Tuesday
const products = catalogue();
const std = shipById('standard')!;
const q = (o: Partial<ListQuery> = {}): ListQuery => ({ sort: 'featured', sizes: [], colors: [], inStockOnly: false, ...o });

describe('catalogue and variants', () => {
  it('requires every option before a variant exists', () => {
    const p = products.find((x) => x.id === 'linen-abaya')!;
    expect(missingOptions(p, 'black')).toEqual(['size']);
    expect(missingOptions(p)).toEqual(['color', 'size']);
    expect(findVariant(p, 'black')).toBeUndefined();
    expect(findVariant(p, 'olive', '58')?.stock).toBe(0);
  });
  it('treats a product with one option axis correctly', () => {
    const oud = products.find((x) => x.id === 'night-oud')!;
    expect(missingOptions(oud, undefined, '100ml')).toEqual([]);
    expect(findVariant(oud, undefined, '100ml')?.price).toBe(59_500);
  });
});

describe('listing', () => {
  it('filters by category, size and stock, and keeps sold-out last in featured order', () => {
    const abayas = listProducts(products, q({ cat: 'abayas' }));
    expect(abayas.map((p) => p.id).at(-1)).toBe('embroidered-abaya');
    expect(listProducts(products, q({ cat: 'abayas', inStockOnly: true })).map((p) => p.id)).not.toContain('embroidered-abaya');
    expect(listProducts(products, q({ sizes: ['XS'], colors: ['rose'], inStockOnly: true }))).toHaveLength(0);
  });
  it('sorts by price both ways', () => {
    const asc = listProducts(products, q({ sort: 'price-asc' }));
    expect(asc[0].id).toBe('crepe-shayla');
    expect(listProducts(products, q({ sort: 'price-desc' }))[0].id).toBe('embroidered-abaya');
  });
  it('searches Arabic without caring about hamza or ta marbuta', () => {
    expect(normalize('عبايةٌ')).toBe('عبايه');
    expect(listProducts(products, q({ q: 'عبايه' })).length).toBe(3);
    expect(listProducts(products, q({ q: 'oud' })).map((p) => p.id)).toEqual(['night-oud']);
    expect(listProducts(products, q({ q: 'zzz' }))).toHaveLength(0);
  });
});

describe('cart', () => {
  const vid = 'linen-abaya~black-54';
  it('adds, merges, caps at stock and removes', () => {
    let c: Cart = { lines: [] };
    c = addToCart(c, vid, 2, 6);
    c = addToCart(c, vid, 9, 6);
    expect(c.lines).toEqual([{ vid, qty: 6 }]);
    c = setQty(c, vid, 3, 6);
    expect(c.lines[0].qty).toBe(3);
    expect(setQty(c, vid, 0, 6).lines).toHaveLength(0);
    expect(removeLine(c, vid).lines).toHaveLength(0);
  });
  it('flags lines whose stock changed after adding', () => {
    const c: Cart = { lines: [{ vid: 'olive', qty: 1 }, { vid: 'linen-abaya~olive-58', qty: 1 }, { vid: 'linen-abaya~sand-52', qty: 3 }] };
    expect(validateCart(c, products)).toEqual([
      { vid: 'olive', kind: 'missing' },
      { vid: 'linen-abaya~olive-58', kind: 'sold_out' },
      { vid: 'linen-abaya~sand-52', kind: 'reduced', available: 2 },
    ]);
  });
});

describe('coupons', () => {
  const all = coupons(NOW);
  const abaya = pricedLines({ lines: [{ vid: 'linen-abaya~black-54', qty: 1 }] }, products); // 429.00
  const shayla = pricedLines({ lines: [{ vid: 'crepe-shayla~black', qty: 1 }] }, products); // 99.00
  const mixed = pricedLines({ lines: [{ vid: 'linen-abaya~black-54', qty: 1 }, { vid: 'night-oud~50ml', qty: 1 }] }, products);
  it('applies a valid percentage coupon in whole halalas', () => {
    expect(evaluateCoupon(' welcome10 ', abaya, all, NOW)).toMatchObject({ status: 'valid', discount: 4_290 });
  });
  it('explains each refusal with its own reason', () => {
    expect(evaluateCoupon('AUTUMN15', abaya, all, NOW).status).toBe('expired');
    expect(evaluateCoupon('VIP100', abaya, all, NOW).status).toBe('limit_reached');
    expect(evaluateCoupon('NOPE', abaya, all, NOW).status).toBe('not_found');
    expect(evaluateCoupon('OUD50', abaya, all, NOW)).toMatchObject({ status: 'not_eligible', reason: 'category' });
    expect(evaluateCoupon('WELCOME10', shayla, all, NOW)).toMatchObject({ status: 'not_eligible', reason: 'min_subtotal', shortBy: 10_100 });
  });
  it('limits a category coupon to eligible lines', () => {
    expect(evaluateCoupon('OUD50', mixed, all, NOW)).toMatchObject({ status: 'valid', discount: 5_000 });
  });
});

describe('totals and VAT', () => {
  it('breaks down a VAT-inclusive order', () => {
    const lines = pricedLines({ lines: [{ vid: 'crepe-shayla~black', qty: 2 }] }, products); // 198.00
    const t = computeTotals(lines, { ship: std });
    expect(t).toEqual({ subtotal: 19_800, discount: 0, shipping: 2_500, codFee: 0, total: 22_300, vat: 2_909 });
    expect(t.vat).toBe(vatIn(22_300));
  });
  it('makes standard delivery free from the threshold after discount, and adds the COD fee', () => {
    const lines = pricedLines({ lines: [{ vid: 'linen-abaya~black-54', qty: 1 }] }, products);
    expect(computeTotals(lines, { ship: std, discount: 4_290 }).shipping).toBe(0);
    expect(computeTotals(lines, { ship: std, discount: 13_000 }).shipping).toBe(2_500);
    expect(computeTotals(lines, { ship: std, cod: true }).total).toBe(42_900 + MERCHANT.codFee);
  });
  it('never discounts below zero', () => {
    expect(computeTotals([{ amount: 5_000 }], { discount: 10_000 }).total).toBe(0);
  });
});

describe('delivery estimate', () => {
  it('skips the Saudi weekend', () => {
    const thu = Date.UTC(2026, 10, 26, 9);
    expect(new Date(addBusinessDays(thu, 1)).getUTCDay()).toBe(0);
  });
  it('adds handling time to the zone transit and refuses unsupported methods', () => {
    const e = deliveryEstimate(std, 'abha', NOW)!;
    expect(e.transit).toEqual([3, 5]);
    expect(e.from).toBe(addBusinessDays(NOW, 4));
    expect(deliveryEstimate(SHIP_METHODS.find((m) => m.id === 'pickup')!, 'jeddah', NOW)).toBeUndefined();
  });
});

describe('payment eligibility', () => {
  it('shows Apple Pay only on supported devices and enforces COD and instalment limits', () => {
    const base = { total: 50_000, applePayDevice: false, openCod: 0 };
    expect(payEligibility('applepay', base)).toBe('no_device');
    expect(payEligibility('applepay', { ...base, applePayDevice: true })).toBeNull();
    expect(payEligibility('cod', { ...base, total: 100_000 + MERCHANT.codFee + 1 })).toBe('cod_over_limit');
    expect(payEligibility('cod', { ...base, openCod: 2 })).toBe('cod_open_limit');
    expect(payEligibility('cod', { ...base, ship: 'pickup' })).toBe('pickup_cod');
    expect(payEligibility('bnpl', { ...base, total: 5_000 })).toBe('bnpl_range');
  });
});

describe('payment state machine', () => {
  it('maps each simulated outcome', () => {
    expect(payTransition('awaiting', { type: 'attempt', outcome: 'success' })).toBe('paid');
    expect(payTransition('awaiting', { type: 'attempt', outcome: 'declined' })).toBe('declined');
    expect(payTransition('awaiting', { type: 'attempt', outcome: '3ds' })).toBe('challenge');
    expect(payTransition('awaiting', { type: 'attempt', outcome: 'timeout' })).toBe('verifying');
  });
  it('never starts a new charge while verifying, challenged or paid', () => {
    for (const s of ['verifying', 'challenge', 'paid', 'cod_due'] as const) {
      expect(canPay(s)).toBe(false);
      expect(payTransition(s, { type: 'attempt', outcome: 'success' })).toBe(s);
    }
  });
  it('resolves a timeout only through verification, and allows a retry after a decline', () => {
    expect(payTransition('verifying', { type: 'verify', result: 'unknown' })).toBe('verifying');
    expect(payTransition('verifying', { type: 'verify', result: 'paid' })).toBe('paid');
    expect(payTransition('verifying', { type: 'verify', result: 'failed' })).toBe('declined');
    expect(payTransition('declined', { type: 'attempt', outcome: 'success' })).toBe('paid');
    expect(payTransition('challenge', { type: 'challenge', pass: false })).toBe('declined');
  });
});

describe('orders and idempotency', () => {
  const lines = pricedLines({ lines: [{ vid: 'linen-abaya~black-54', qty: 1 }] }, products);
  const draft: Draft = { sessionId: 's1', lines, discount: 0, ship: 'standard', city: 'riyadh', method: 'card', contact: { phone: '512345678' } };

  it('returns the same order for a double submit', () => {
    const a = submitOrder([], draft, NOW);
    const b = submitOrder(a.orders, draft, NOW + 50);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.orders).toHaveLength(1);
    expect(b.order.ref).toBe(a.order.ref);
  });
  it('treats a changed basket as a new order', () => {
    const a = submitOrder([], draft, NOW);
    const other = { ...draft, lines: pricedLines({ lines: [{ vid: 'linen-abaya~black-54', qty: 2 }] }, products) };
    expect(checkoutKey(other)).not.toBe(checkoutKey(draft));
    expect(submitOrder(a.orders, other, NOW).orders).toHaveLength(2);
  });
  it('rejects a second charge and records attempts', () => {
    const { order } = submitOrder([], draft, NOW);
    const declined = applyPayment(order, { type: 'attempt', outcome: 'declined' }, 'card', NOW).order;
    const paid = applyPayment(declined, { type: 'attempt', outcome: 'success' }, 'card', NOW).order;
    const again = applyPayment(paid, { type: 'attempt', outcome: 'success' }, 'card', NOW);
    expect(paid.pay.state).toBe('paid');
    expect(paid.pay.attempts.map((x) => x.n)).toEqual([1, 2]);
    expect(again.applied).toBe(false);
    expect(again.order).toBe(paid);
  });
  it('adds the COD fee when the shopper switches to cash on delivery', () => {
    const { order } = submitOrder([], draft, NOW);
    const cod = applyPayment(order, { type: 'cod' }, 'cod', NOW).order;
    expect(cod.pay.state).toBe('cod_due');
    expect(cod.totals.codFee).toBe(MERCHANT.codFee);
    expect(cod.totals.total).toBe(order.totals.total + MERCHANT.codFee);
  });
  it('keeps payment, fulfilment and shipment separate and collects COD on delivery', () => {
    let o: Order = applyPayment(submitOrder([], draft, NOW).order, { type: 'cod' }, 'cod', NOW).order;
    const steps: string[] = [];
    while (advanceFulfilment(o, NOW) !== o) { o = advanceFulfilment(o, NOW); steps.push(`${o.ful}/${o.shipment}/${o.pay.state}`); }
    expect(steps).toEqual([
      'preparing/none/cod_due', 'packed/none/cod_due', 'fulfilled/label/cod_due',
      'fulfilled/in_transit/cod_due', 'fulfilled/out_for_delivery/cod_due', 'fulfilled/delivered/cod_collected',
    ]);
  });
  it('does not fulfil an unpaid order', () => {
    const { order } = submitOrder([], draft, NOW);
    expect(advanceFulfilment(order, NOW)).toBe(order);
  });
});

describe('returns', () => {
  const lines = pricedLines({ lines: [{ vid: 'linen-abaya~black-54', qty: 2 }, { vid: 'night-oud~50ml', qty: 1 }] }, products);
  const base = submitOrder([], { sessionId: 's', lines, discount: 12_330, coupon: 'X', ship: 'standard', city: 'riyadh', method: 'card', contact: { phone: '512345678' } }, NOW).order;
  const delivered: Order = { ...base, pay: { ...base.pay, state: 'paid' }, ful: 'fulfilled', shipment: 'delivered', deliveredAt: NOW };

  it('allows returns within the window, excluding fragrance', () => {
    expect(returnEligibility(base, products, NOW)).toEqual({ ok: false, reason: 'not_delivered' });
    expect(returnEligibility(delivered, products, NOW + 3 * DAY).ok).toBe(true);
    expect(returnEligibility(delivered, products, NOW + 15 * DAY)).toMatchObject({ ok: false, reason: 'window_closed' });
    expect(returnableQty(delivered, 'night-oud~50ml', products)).toBe(0);
  });
  it('estimates the refund net of the discount share and blocks over-returning', () => {
    expect(refundEstimate(delivered, [{ vid: 'linen-abaya~black-54', qty: 1 }])).toBe(42_900 - Math.round((42_900 * 12_330) / 125_300));
    const once = requestReturn(delivered, { lines: [{ vid: 'linen-abaya~black-54', qty: 2, reason: 'size' }], method: 'pickup', refundTo: 'original' }, products, NOW);
    expect(once.returns[0]).toMatchObject({ state: 'requested', refund: 'not_started' });
    const twice = requestReturn(once, { lines: [{ vid: 'linen-abaya~black-54', qty: 1, reason: 'size' }], method: 'pickup', refundTo: 'original' }, products, NOW);
    expect(twice).toBe(once);
  });
});

describe('address validation', () => {
  it('requires Saudi address fields and keeps national address optional', () => {
    const ok = { name: 'Sara', phone: '+966 51 234 5678', city: 'riyadh' as const, district: 'Al Olaya', street: 'Olaya St', building: '7421' };
    expect(validateAddress(ok)).toEqual({});
    expect(validateAddress({ ...ok, phone: '0512345678' })).toEqual({});
    expect(validateAddress({ ...ok, phone: '12345' }).phone).toBe('format');
    expect(validateAddress({ ...ok, nationalCode: 'rrrd2929' })).toEqual({});
    expect(validateAddress({ ...ok, nationalCode: '29RR' }).nationalCode).toBe('format');
    expect(validateAddress({}).city).toBe('required');
    expect(validIban('SA03 8000 0000 6080 1016 7519')).toBe(true);
  });
});
