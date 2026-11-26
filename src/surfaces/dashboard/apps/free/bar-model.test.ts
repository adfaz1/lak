import { describe, expect, it } from 'vitest';
import { BAR_DEFAULTS, barProblems, countdownFor, crossedShare, offerEnd, progressOf, threshold, timeLeft } from './bar-model';
import type { Coupon } from '../../../merchant/growth';
import type { Zone } from '../../../merchant/workspace';
import type { Order } from '../../../merchant/domain';

const zones: Zone[] = [
  { id: 'z1', name: { ar: 'الرياض', en: 'Riyadh region' }, cities: { ar: 'الرياض', en: 'Riyadh' }, rateType: 'flat', rate: 2500, perKg: 0, freeOver: 30000 },
  { id: 'z2', name: { ar: 'الغربية', en: 'Western' }, cities: { ar: 'جدة', en: 'Jeddah' }, rateType: 'flat', rate: 3000, perKg: 0, freeOver: 40000 },
  { id: 'z3', name: { ar: 'أخرى', en: 'Other cities' }, cities: { ar: 'كل المدن الأخرى', en: 'All other cities' }, rateType: 'flat', rate: 4000, perKg: 0, freeOver: null },
];
const cp = (p: Partial<Coupon>): Coupon => ({ code: 'X', type: 'percent', value: 10, minSpend: 0, limitTotal: null, limitPerCustomer: null, used: 0, starts: '2026-11-01', ends: '2026-11-30', status: 'active', ...p });
const now = Date.parse('2026-11-26T09:00:00Z');

describe('free-shipping bar', () => {
  it('uses the shopper zone threshold, else the lowest', () => {
    expect(threshold(zones, { ar: 'جدة', en: 'Jeddah' })?.from).toBe(40000);
    expect(threshold(zones, { ar: 'أبها', en: 'Abha' })).toBeUndefined();
    expect(threshold(zones)?.from).toBe(30000);
    expect(threshold(zones.map((z) => ({ ...z, freeOver: null })))).toBeUndefined();
  });
  it('computes progress', () => {
    expect(progressOf(18000, 30000)).toEqual({ left: 12000, pct: 60, reached: false });
    expect(progressOf(31000, 30000)).toEqual({ left: 0, pct: 100, reached: true });
  });
});

describe('countdown only for a real live offer', () => {
  it('ends at the end of the last day in Riyadh', () => {
    expect(offerEnd(cp({}), now)).toBe(Date.parse('2026-11-30T23:59:59+03:00'));
  });
  it('no end date, not started, ended, used up, draft or single-use = no countdown', () => {
    expect(offerEnd(cp({ ends: null }), now)).toBeNull();
    expect(offerEnd(cp({ starts: '2026-12-01', ends: '2026-12-31' }), now)).toBeNull();
    expect(offerEnd(cp({ ends: '2026-11-20' }), now)).toBeNull();
    expect(offerEnd(cp({ limitTotal: 5, used: 5 }), now)).toBeNull();
    expect(offerEnd(cp({ status: 'draft' }), now)).toBeNull();
    expect(offerEnd(cp({ origin: 'popup' }), now)).toBeNull();
  });
  it('picks the chosen offer or the soonest-ending one', () => {
    const list = [cp({ code: 'LATE', ends: '2026-12-20' }), cp({ code: 'SOON', ends: '2026-11-28' }), cp({ code: 'NOEND', ends: null })];
    expect(countdownFor(BAR_DEFAULTS, list, now)?.code).toBe('SOON');
    expect(countdownFor({ countdown: true, offer: 'LATE' }, list, now)?.code).toBe('LATE');
    expect(countdownFor({ countdown: true, offer: 'NOEND' }, list, now)).toBeNull();
    expect(countdownFor({ countdown: false, offer: '' }, list, now)).toBeNull();
    expect(barProblems({ ...BAR_DEFAULTS, offer: 'NOEND' }, list, now)).toEqual(['offer']);
  });
  it('time left never goes negative', () => {
    expect(timeLeft(now + 90061000, now)).toEqual({ d: 1, h: 1, m: 1, s: 1, over: false });
    expect(timeLeft(now - 1, now).over).toBe(true);
  });
});

describe('share of bags past the threshold', () => {
  it('counts online orders by city and carts by customer city', () => {
    const o = (city: string, unit: number, extra: Partial<Order> = {}) => ({ channel: 'online', city: { ar: city, en: city }, items: [{ qty: 1, unit }], ...extra }) as unknown as Order;
    const orders = [o('Riyadh, Al Malqa', 35000), o('Jeddah', 35000), o('Riyadh', 10000, { cancelled: { at: 0, by: '', role: '', reason: '' } }), o('Abha', 90000), { ...o('Riyadh', 90000), channel: 'pos' } as Order];
    const carts = [{ value: 31000, customerId: 'C-1' }, { value: 1000 }];
    const r = crossedShare(zones, orders, carts, [{ id: 'C-1', city: { ar: 'جدة', en: 'Jeddah' } } as never]);
    expect(r).toEqual({ bags: 4, crossed: 1, share: 0.25, noThreshold: false });
    expect(crossedShare(zones.map((z) => ({ ...z, freeOver: null })), orders, carts, []).noThreshold).toBe(true);
  });
});
