import { describe, expect, it } from 'vitest';
import { POPUP_DEFAULTS, effectiveTrigger, mayShow, pageKind, popupProblems, popupStats, signUp, signupProblems, welcomeCode } from './popup-model';
import type { Customer } from '../../../merchant/workspace';
import type { Order } from '../../../merchant/domain';

const cust = (id: string, email: string, phone: string): Customer => ({ id, name: { ar: id, en: id }, city: { ar: '', en: '' }, email, phone, consent: { email: false, sms: false }, since: '2025-01-01' });
const D = 86_400_000;

describe('popup rules', () => {
  it('validates settings', () => {
    expect(popupProblems(POPUP_DEFAULTS)).toEqual([]);
    expect(popupProblems({ ...POPUP_DEFAULTS, pct: 0, pages: [], delaySec: Number.NaN })).toEqual(['delay', 'pages', 'pct']);
  });
  it('maps pages and never shows on checkout or account', () => {
    expect(pageKind(undefined)).toBe('home');
    expect(pageKind('p')).toBe('product');
    expect(pageKind('checkout')).toBeNull();
    expect(pageKind('account')).toBeNull();
  });
  it('exit intent falls back to scroll on phones', () => {
    expect(effectiveTrigger({ trigger: 'exit', scrollPct: 80 }, false)).toEqual({ trigger: 'scroll', scrollPct: 50 });
    expect(effectiveTrigger({ trigger: 'exit', scrollPct: 80 }, true).trigger).toBe('exit');
  });
  it('respects the frequency cap, pages and earlier sign-ups', () => {
    const s = { pages: POPUP_DEFAULTS.pages, capDays: 7 };
    expect(mayShow(s, { page: 'home' }, 0)).toBe(true);
    expect(mayShow(s, { page: 'cart' }, 0)).toBe(false);
    expect(mayShow(s, { page: 'home', lastShownAt: 0 }, 3 * D)).toBe(false);
    expect(mayShow(s, { page: 'home', lastShownAt: 0 }, 8 * D)).toBe(true);
    expect(mayShow(s, { page: 'home', signedUp: true }, 0)).toBe(false);
    expect(mayShow({ ...s, capDays: 0 }, { page: 'home', lastShownAt: 0 }, 99 * D)).toBe(false);
  });
  it('needs a valid contact and an explicit consent tick', () => {
    expect(signupProblems('email', 'bad', false)).toEqual(['contact', 'consent']);
    expect(signupProblems('mobile', '0551234567', true)).toEqual([]);
  });
});

describe('popup sign-ups', () => {
  const base = { customers: [cust('C-1001', 'a@x.sa', '+966 55 123 4567')], coupons: [], signups: [] };
  it('adds a new customer with only that consent and a single-use code', () => {
    const r = signUp(base, { channel: 'email', pct: 10, validDays: 14, minSpend: 0 }, 'New@X.sa', 1, '2026-11-26');
    expect(r.signup.created).toBe(true);
    const c = r.customers.find((x) => x.id === r.signup.customerId)!;
    expect(c).toMatchObject({ id: 'C-1002', email: 'new@x.sa', consent: { email: true, sms: false } });
    expect(r.coupons[0]).toMatchObject({ code: r.signup.code, value: 10, limitTotal: 1, limitPerCustomer: 1, ends: '2026-12-10', origin: 'popup', status: 'active' });
  });
  it('turns on consent for an existing customer and never gives a second code', () => {
    const r = signUp(base, { channel: 'mobile', pct: 10, validDays: 14, minSpend: 0 }, '٠٥٥١٢٣٤٥٦٧', 1, '2026-11-26');
    expect(r.signup).toMatchObject({ customerId: 'C-1001', created: false });
    expect(r.customers[0].consent).toEqual({ email: false, sms: true });
    const again = signUp({ customers: r.customers, coupons: r.coupons, signups: [r.signup] }, { channel: 'mobile', pct: 10, validDays: 14, minSpend: 0 }, '0551234567', 2, '2026-11-26');
    expect(again.repeat).toBe(true);
    expect(again.coupons).toHaveLength(1);
  });
  it('codes are unique and stable', () => {
    expect(welcomeCode('s', [])).toMatch(/^HI[A-HJ-NP-Z2-9]{6}$/);
    expect(welcomeCode('s', [welcomeCode('s', [])])).not.toBe(welcomeCode('s', []));
  });
  it('counts codes used and revenue of paid orders with them', () => {
    const r = signUp(base, { channel: 'email', pct: 10, validDays: 14, minSpend: 0 }, 'n@x.sa', 1, '2026-11-26');
    const coupons = r.coupons.map((c) => ({ ...c, used: 1 }));
    const order = { ref: '1', coupon: r.signup.code, pay: 'paid', items: [{ qty: 1, unit: 20000 }], fee: 0, discount: 2000 } as unknown as Order;
    const failed = { ...order, ref: '2', pay: 'failed' } as Order;
    expect(popupStats([r.signup], coupons, [order, failed])).toEqual({ signups: 1, newCustomers: 1, used: 1, revenue: 18000, orders: 1 });
  });
});
