import { describe, expect, it } from 'vitest';
import { PROOF_DEFAULTS, agoL, cityOnly, initialOf, lowStockLeft, proofLine, proofProblems, recentBuys } from './proof-model';
import type { Order } from '../../../merchant/domain';

const H = 3_600_000;
const now = 1_000 * H;
const o = (ref: string, hoursAgo: number, extra: Partial<Order> = {}) => ({ ref, hoursAgo, pay: 'paid', customer: { ar: 'سارة العتيبي', en: 'Sarah Alotaibi' }, city: { ar: 'الرياض، حي الملقا', en: 'Riyadh, Al Malqa' }, items: [{ sku: 'OUD', qty: 1, unit: 1 }], ...extra }) as unknown as Order;

describe('honest social proof', () => {
  it('uses only real paid orders in the window, newest first, never the full name', () => {
    const list = [o('1', 30), o('2', 2), o('3', 1, { pay: 'failed' }), o('4', 1, { cancelled: {} as never }), o('5', 60), o('6', 1, { items: [{ sku: 'X' }] as never })];
    const r = recentBuys(list, ['OUD'], PROOF_DEFAULTS, now);
    expect(r.map((x) => x.ref)).toEqual(['2', '1']);
    expect(r[0].name).toEqual({ ar: 'س.', en: 'S.' });
    expect(r[0].city).toEqual({ ar: 'الرياض', en: 'Riyadh' });
    expect(JSON.stringify(r)).not.toContain('العتيبي');
    expect(recentBuys(list, ['OUD'], { ...PROOF_DEFAULTS, name: 'none', city: false }, now)[0]).toMatchObject({ name: null, city: null });
    expect(recentBuys(list, ['NONE'], PROOF_DEFAULTS, now)).toEqual([]);
  });
  it('session orders use their placed time', () => {
    expect(recentBuys([o('9', 999, { placedAt: now - H })], ['OUD'], PROOF_DEFAULTS, now)).toHaveLength(1);
  });
  it('low stock only at or below the threshold and above zero', () => {
    expect(lowStockLeft(3, PROOF_DEFAULTS)).toBe(3);
    expect(lowStockLeft(4, PROOF_DEFAULTS)).toBeNull();
    expect(lowStockLeft(0, PROOF_DEFAULTS)).toBeNull();
    expect(lowStockLeft(Number.POSITIVE_INFINITY, PROOF_DEFAULTS)).toBeNull();
    expect(lowStockLeft(2, { lowStock: false, lowAt: 3 })).toBeNull();
  });
  it('reads naturally in both languages', () => {
    expect(agoL(now - 2 * H, now)).toEqual({ ar: 'قبل ساعتين', en: '2 hours ago' });
    expect(agoL(now - 15 * H, now).ar).toBe('قبل 15 ساعة');
    expect(proofLine({ ref: '1', at: now - 2 * H, name: initialOf({ ar: 'سارة', en: 'Sarah' }), city: cityOnly({ ar: 'جدة', en: 'Jeddah' }) }, now))
      .toEqual({ ar: 'س. من جدة اشترى هذا قبل ساعتين', en: 'S. in Jeddah bought this 2 hours ago' });
    expect(proofLine({ ref: '1', at: now - 2 * H, name: null, city: null }, now).en).toBe('Someone bought this 2 hours ago');
  });
  it('validates settings', () => {
    expect(proofProblems(PROOF_DEFAULTS)).toEqual([]);
    expect(proofProblems({ ...PROOF_DEFAULTS, recent: false, lowStock: false, lowAt: 0 })).toEqual(['nothing', 'lowAt']);
  });
});
