import { describe, expect, it } from 'vitest';
import { couponFixtures, type Coupon } from '../../merchant/growth';
import { OCCASIONS, addDays, codeFor, codeIssue, conflicts, couponItems, monthGrid, pctValue, planErrors, scopesOverlap, suggestPlan, upcoming } from './model';

const cat = (id: string) => ({ p3: 'Fragrance', p13: 'Fragrance', p1: 'Abayas' } as Record<string, string>)[id];

describe('marketing calendar', () => {
  it('builds Sunday-first month grids', () => {
    const g = monthGrid('2026-11');
    expect(g[0][0]).toBe('2026-11-01');
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.at(-1)!.includes('2026-11-30')).toBe(true);
    expect(monthGrid('2027-02')[0][0]).toBe('2027-01-31');
  });
  it('marks lunar occasions approximate and fixed ones exact', () => {
    expect(OCCASIONS.find((o) => o.id === 'national-2026')).toMatchObject({ start: '2026-09-23', approx: false });
    expect(OCCASIONS.filter((o) => o.id.startsWith('ramadan') || o.id.startsWith('fitr') || o.id.startsWith('adha')).every((o) => o.approx)).toBe(true);
    expect(new Date('2026-11-27T12:00:00Z').getUTCDay()).toBe(5);
    expect(upcoming('2026-11-24').slice(0, 3).map((u) => u.o.id)).toEqual(['white-friday-2026', 'ramadan-2027', 'founding-2027']);
  });
  it('checks whether two scopes can discount the same product', () => {
    expect(scopesOverlap({ kind: 'all', ids: [] }, { kind: 'product', ids: ['p1'] }, cat)).toBe(true);
    expect(scopesOverlap({ kind: 'category', ids: ['Fragrance'] }, { kind: 'product', ids: ['p13'] }, cat)).toBe(true);
    expect(scopesOverlap({ kind: 'category', ids: ['Fragrance'] }, { kind: 'product', ids: ['p1'] }, cat)).toBe(false);
    expect(scopesOverlap({ kind: 'category', ids: ['A'] }, { kind: 'category', ids: ['B'] }, cat)).toBe(false);
  });
  it('flags overlapping discounts, ignoring paused and expired ones', () => {
    const items = couponItems(couponFixtures(), '2027-12-31');
    const cs = conflicts(items, cat);
    const pairs = cs.map((c) => [c.a.ref, c.b.ref].sort().join('+'));
    expect(pairs.sort()).toEqual(['FRAGRANCE3+SHIPFREE', 'FRAGRANCE3+WELCOME10']);
    // An always-on welcome code beside a campaign code is not a clash; a used-up coupon (NOV50) cannot clash.
    const dated = conflicts(couponItems([...couponFixtures(), { ...couponFixtures()[1], code: 'BF20' }], '2027-12-31'), cat);
    expect(dated.some((c) => c.kind === 'twoCodes' && [c.a.ref, c.b.ref].sort().join('+') === 'BF20+SHIPFREE')).toBe(true);
    expect(cs.find((c) => c.a.ref === 'FRAGRANCE3' || c.b.ref === 'FRAGRANCE3')?.kind).toBe('codeReplacesOffer');
    const paused: Coupon[] = couponFixtures().map((c) => (c.code === 'WELCOME10' ? { ...c, status: 'paused' } : c));
    expect(conflicts(couponItems(paused, '2027-12-31'), cat).some((c) => c.a.ref === 'WELCOME10' || c.b.ref === 'WELCOME10')).toBe(false);
    const two = conflicts(couponItems([{ ...couponFixtures()[4], code: 'A' }, { ...couponFixtures()[4], code: 'B' }], '2027-12-31'), cat);
    expect(two[0].kind).toBe('twoOffers');
    expect(two[0]).toMatchObject({ from: '2026-11-24', to: '2026-12-31', planned: true });
  });
  it('suggests a plan from a day and validates it', () => {
    const s = suggestPlan('2027-01-25', '2026-11-24');
    expect(s.occasion?.id).toBe('ramadan-2027');
    expect(s.end).toBe('2027-03-09');
    expect(suggestPlan('2026-07-01', '2026-11-24')).toMatchObject({ start: '2026-11-24', end: addDays('2026-11-24', 6) });
    expect(planErrors({ name: '', start: '2026-12-02', end: '2026-12-01', pieces: [] }, '2026-11-24')).toEqual(['name', 'dates', 'pieces']);
    expect(codeFor('Ramadan', '2027-02-01')).toBe('RAMADAN27');
    expect(codeIssue('WELCOME10', ['WELCOME10'])).toBe('taken');
    expect(codeIssue('ab', [])).toBe('format');
    expect(pctValue('١٥')).toBe(15);
    expect(pctValue('95')).toBeNull();
  });
});
