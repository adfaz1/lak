import { describe, expect, it } from 'vitest';
import {
  analyticsSeries, applyCoupon, audience, automationFixtures, canActivate, cartFixtures, change, couponConflicts, couponFixtures, dryRun,
  estimateCost, periods, summarize, TEMPLATES, validateCoupon,
} from './growth';
import { parseMoney } from './catalog';

describe('coupons', () => {
  const [welcome, ship, nov50] = couponFixtures();
  const sample = { subtotal: 48600, shipping: 2500, customerUses: 0 };
  it('previews the effect on a sample order', () => {
    expect(applyCoupon(welcome, sample)).toMatchObject({ block: null, discount: 4860, total: 48600 - 4860 + 2500 });
    expect(applyCoupon(ship, sample)).toMatchObject({ block: null, shippingOff: 2500, total: 48600 });
    expect(applyCoupon(welcome, { ...sample, subtotal: 5000 }).block).toBe('minSpend');
    expect(applyCoupon(nov50, sample).block).toBe('limit');
    expect(applyCoupon(welcome, { ...sample, customerUses: 1 }).block).toBe('perCustomer');
  });
  it('validates codes, values, limits and dates', () => {
    const d = { code: 'WELCOME10', type: 'percent' as const, value: '95', minSpend: 'x', limitTotal: '0', limitPerCustomer: '', starts: '2026-12-10', ends: '2026-12-01' };
    expect(validateCoupon(d, ['WELCOME10'], parseMoney)).toEqual({ code: 'codeTaken', value: 'percent', minSpend: 'money', limitTotal: 'limit', dates: 'dates' });
  });
  it('lists competing coupons of the same kind in the same window', () => {
    const c = { ...welcome, code: 'NEW15', starts: '2026-11-20', ends: '2026-12-31' };
    expect(couponConflicts(c, couponFixtures()).map((x) => x.code)).toEqual(['WELCOME10']);
  });
});

describe('abandoned-cart audience', () => {
  it('every cart is either eligible or excluded with a reason', () => {
    const carts = cartFixtures();
    const a = audience(carts, 'email', 2);
    const ex = Object.values(a.excluded).reduce((s, n) => s + n, 0);
    expect(a.eligible.length + ex).toBe(carts.length);
    expect(a.eligible.every((c) => c.emailConsent && !c.purchased && !c.optedOut && !c.contactedByAutomation)).toBe(true);
    expect(estimateCost(10, 'sms')).toBe(90);
  });
});

describe('automations', () => {
  it('dry-run reports act/skip with reasons, without side effects', () => {
    const r = dryRun({ ...TEMPLATES[0] });
    expect(r.map((x) => [x.event.id, x.skip])).toEqual([['E1', null], ['E2', 'condition'], ['E3', 'noConsent'], ['E4', 'dedup']]);
  });
  it('can only be activated after a dry run of the current version', () => {
    const [a] = automationFixtures();
    expect(canActivate(a)).toBe(true);
    expect(canActivate({ ...a, version: a.version + 1 })).toBe(false);
  });
});

describe('analytics', () => {
  const s = analyticsSeries();
  it('compares equal complete periods', () => {
    const { cur, prev } = periods(s, 28);
    expect(cur.length).toBe(28);
    expect(prev.length).toBe(28);
    expect(cur[0].date > prev[27].date).toBe(true);
  });
  it('keeps "no data" apart from zero', () => {
    expect(summarize([{ date: 'd', orders: 0, net: 0, sessions: null }]).conversion).toBeNull();
    expect(summarize([{ date: 'd', orders: 0, net: 0, sessions: 0 }]).conversion).toBeNull();
    expect(summarize([{ date: 'd', orders: 2, net: 100, sessions: 100 }]).conversion).toBe(2);
    expect(change(5, 0)).toBeNull();
    expect(change(110, 100)).toBe(10);
  });
});
