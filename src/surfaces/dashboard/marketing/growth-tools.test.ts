import { describe, expect, it } from 'vitest';
import {
  applyOffer, bestAutoOffer, cardsFromOrders, couponFixtures, earnFor, giftFixtures, giftLiability, giftState, issueGift, loyaltyFixture, offerDiscount,
  publicName, redeemGift, redeemQuote, storeReviews, reviewFixtures, reviewSettingsFixture, syncEarned, validateCoupon, validateGift, looksSuspicious,
  type Coupon, type OfferLine,
} from '../../merchant/growth';
import { parseMoney, productFixtures } from '../../merchant/catalog';
import { allOrders, total } from '../../merchant/domain';
import { customerFixtures } from '../../merchant/workspace';
import { autoOfferResult, scopedResult } from '../../storefront/bridge';
import { cartFixtures } from '../../merchant/growth';
import { buildCoupon, draftFromCoupon, previewOffer, SAMPLES, recoveryCoupon, recoveryError, simulateRecovery, cartDiscount, broadcastAudience } from './model';

const L = (productId: string, category: string, qty: number, unit: number): OfferLine => ({ productId, category, qty, unit });
const base: Coupon = { code: 'X', type: 'percent', value: 10, minSpend: 0, limitTotal: null, limitPerCustomer: null, used: 0, starts: '2026-11-01', ends: null, status: 'active' };

describe('offers', () => {
  it('counts only items in scope', () => {
    const c: Coupon = { ...base, scope: { kind: 'category', ids: ['Fragrance'] } };
    const lines = [L('p13', 'Fragrance', 1, 34500), L('p1', 'Fashion', 1, 29000)];
    expect(offerDiscount(c, lines).discount).toBe(3450);
    expect(applyOffer(c, [L('p1', 'Fashion', 1, 29000)], { shipping: 0, customerUses: 0 }).block).toBe('scope');
  });
  it('buy 2 get 1 free discounts the cheapest unit of each full group', () => {
    const [, , , , frag] = couponFixtures();
    const c = { ...frag, status: 'active' as const };
    const lines = [L('p13', 'Fragrance', 1, 34500), L('p14', 'Fragrance', 2, 6500)];
    const r = applyOffer(c, lines, { shipping: 2500, customerUses: 0 });
    expect(r).toMatchObject({ block: null, discount: 6500, freeUnits: 1 });
    expect(applyOffer(c, [L('p14', 'Fragrance', 2, 6500)], { shipping: 0, customerUses: 0 }).block).toBe('qty');
  });
  it('picks the best automatic offer; drafts never apply', () => {
    const list = couponFixtures();
    const lines = [L('p13', 'Fragrance', 3, 34500)];
    expect(bestAutoOffer(list, lines, { shipping: 0 })).toBeNull();
    const live = list.map((c) => (c.auto ? { ...c, status: 'active' as const } : c));
    expect(bestAutoOffer(live, lines, { shipping: 0 })?.coupon.code).toBe('FRAGRANCE3');
  });
  it('validates buy-and-get and scope, accepting Arabic digits', () => {
    const d = { code: 'BUY2', type: 'bogo' as const, value: '', minSpend: '', limitTotal: '', limitPerCustomer: '', starts: '2026-11-24', ends: '', auto: true, scopeKind: 'category' as const, scopeIds: [], buy: '٢', get: '1', getPct: '100' };
    expect(validateCoupon(d, [], parseMoney)).toEqual({ scope: 'scope' });
    expect(validateCoupon({ ...d, scopeIds: ['Fragrance'], getPct: '0' }, [], parseMoney)).toEqual({ value: 'bogo' });
  });
  it('round-trips an automatic offer through the editor draft', () => {
    const c = couponFixtures()[4];
    expect(buildCoupon(draftFromCoupon(c), parseMoney, c)).toEqual(c);
  });
  it('previews on catalogue-priced samples', () => {
    const c = { ...couponFixtures()[4], status: 'active' as const };
    const r = previewOffer(c, SAMPLES.find((s) => s.id === 's4')!, productFixtures());
    expect(r.freeUnits).toBe(1);
    expect(r.discount).toBe(6500);
  });
  it('applies in the storefront: automatic with no code, typed codes respect their scope', () => {
    const products = productFixtures();
    const live = couponFixtures().map((c) => (c.auto ? { ...c, status: 'active' as const } : c));
    const lines = [{ vid: 'p13~OUD-ROY-50', productId: 'p13', cat: 'fragrance', qty: 1, unit: 34500, amount: 34500 }, { vid: 'p14~BKH', productId: 'p14', cat: 'fragrance', qty: 2, unit: 6500, amount: 13000 }];
    expect(autoOfferResult(live, lines, products, Date.parse('2026-11-24T12:00:00Z'))).toMatchObject({ status: 'valid', code: 'FRAGRANCE3', discount: 6500 });
    const scoped = [{ ...base, code: 'FRAG10', scope: { kind: 'category' as const, ids: ['Fragrance'] } }];
    const valid = { status: 'valid' as const, code: 'FRAG10', discount: 4750, coupon: {} as never, freeShip: false };
    expect(scopedResult(valid, scoped, [lines[0]], products)).toMatchObject({ status: 'valid', discount: 3450 });
    expect(scopedResult(valid, scoped, [{ vid: 'p1~x', productId: 'p1', cat: 'fashion', qty: 1, unit: 29000, amount: 29000 }], products)).toMatchObject({ status: 'not_eligible', reason: 'category', cat: 'fragrance' });
  });
});

describe('cart recovery', () => {
  const carts = cartFixtures();
  const products = productFixtures();
  it('carts carry their items and value is their sum', () => {
    expect(carts.every((c) => c.items?.length && c.value === c.items.reduce((s, i) => s + i.qty * i.unit, 0))).toBe(true);
  });
  it('validates a new recovery code and computes its discount per cart', () => {
    expect(recoveryError({ kind: 'new', code: 'WELCOME10', pct: 10 }, couponFixtures())).toBe('codeTaken');
    expect(recoveryError({ kind: 'new', code: 'BACK10', pct: 80 }, couponFixtures())).toBe('pct');
    const c = recoveryCoupon('BACK10', 10, 5);
    expect(c).toMatchObject({ limitTotal: 5, limitPerCustomer: 1, ends: '2026-12-01', status: 'active' });
    expect(cartDiscount(c, carts[0], products)).toBe(Math.floor(carts[0].value / 10));
  });
  it('records recovered carts with revenue net of discount (simulated, deterministic)', () => {
    const ids = carts.filter((c) => !c.purchased).map((c) => c.id);
    const r = simulateRecovery(carts, ids, recoveryCoupon('BACK10', 10, ids.length), products);
    expect(r.orders).toBeGreaterThan(0);
    expect(r.revenue + r.discount).toBe(r.rows.reduce((s, x) => s + carts.find((c) => c.id === x.id)!.value, 0));
  });
  it('broadcasts leave out blocked customers and honour saved segments', () => {
    const cs = customerFixtures().map((c, i) => (i === 0 ? { ...c, blocked: { reason: 'x', by: 'y', at: 'z' } } : c));
    const a = broadcastAudience(cs, allOrders(), 'all', 'email');
    expect(a.excluded.blocked).toBe(1);
    const seg = broadcastAudience(cs, allOrders(), 'seg:SG-9', 'email', [{ id: 'SG-9', name: { ar: '', en: '' }, rules: [{ field: 'city', op: 'is', value: 'Jeddah' }], by: '', at: '' }]);
    expect(seg.eligible.every((c) => c.city.en === 'Jeddah')).toBe(true);
  });
});

describe('loyalty', () => {
  const r = loyaltyFixture();
  it('earns per riyal and records each paid order once', () => {
    expect(earnFor(r, 45099)).toBe(450);
    const once = syncEarned([], allOrders(), customerFixtures(), r, total as never);
    expect(once.length).toBeGreaterThan(0);
    expect(syncEarned(once, allOrders(), customerFixtures(), r, total as never)).toBe(once);
  });
  it('caps redemption by the share of items and the minimum balance', () => {
    expect(redeemQuote(r, 150, 45000).block).toBe('belowMin');
    expect(redeemQuote(r, 100000, 45000)).toMatchObject({ points: 2700, value: 13500, cappedBy: 'cap' });
    expect(redeemQuote({ ...r, enabled: false }, 1000, 45000).block).toBe('disabled');
  });
});

describe('gift cards', () => {
  it('redeems partially and never below zero', () => {
    const g = giftFixtures()[0];
    const a = redeemGift(g, 12000, { ref: 'X', by: 'me', today: '2026-11-24' });
    expect(a).toMatchObject({ applied: 12000, error: null });
    expect(a.card.balance).toBe(38000);
    const b = redeemGift(a.card, 99999, { ref: 'Y', by: 'me', today: '2026-11-24' });
    expect(b.applied).toBe(38000);
    expect(redeemGift(b.card, 100, { ref: 'Z', by: 'me', today: '2026-11-24' }).error).toBe('empty');
  });
  it('issues unique codes, validates input and counts only active balances as unused', () => {
    const list = giftFixtures();
    expect(giftState(list[3])).toBe('expired');
    expect(giftLiability(list)).toBe(50000 + 7500);
    const r = issueGift(list, { amount: 20000, to: 'a@b.co', expires: null }, { by: 'me', today: '2026-11-24', seed: 3 });
    expect(r.list.filter((g) => g.code === r.card.code)).toHaveLength(1);
    expect(validateGift({ amount: '5', to: 'x', expires: '2020-01-01' }, parseMoney)).toEqual({ amount: true, to: true, expires: true });
  });
  it('creates a card for each gift-card unit in a paid store order, once', () => {
    const orders = [{ ref: 'DN-1', pay: 'paid', customerId: 'C-1005', items: [{ sku: 'GFT-100', qty: 2, unit: 10000 }] }];
    const a = cardsFromOrders([], orders, '2026-11-24');
    expect(a.map((g) => g.code)).toEqual(['GC-DN-1-1', 'GC-DN-1-2']);
    expect(cardsFromOrders(a, orders, '2026-11-24')).toBe(a);
  });
});

describe('reviews', () => {
  it('shows only published entries, answered questions, masked names', () => {
    const s = storeReviews(reviewFixtures(), 'p1', reviewSettingsFixture());
    expect(s.reviews.map((r) => r.id)).toEqual(['RV-113']);
    expect(s.reviews[0].author.en).toBe('Fahad A.');
    expect(publicName({ ar: 'سارة العتيبي', en: 'Sarah Alotaibi' }, true).ar).toBe('سارة ع.');
    expect(storeReviews(reviewFixtures(), 'p13', reviewSettingsFixture()).questions).toHaveLength(1);
  });
  it('flags phone numbers and links', () => {
    expect(looksSuspicious('اتصلوا على 0500000000')).toBe(true);
    expect(looksSuspicious('Great quality')).toBe(false);
  });
});
