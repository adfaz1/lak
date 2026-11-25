import { describe, expect, it } from 'vitest';
import { productFixtures } from './catalog';
import { allOrders } from './domain';
import {
  attribution, campaignState, campaignUtm, checkCampaign, checkPixel, checkToken, cleanId, feedExclusion, maskToken, maxSpend, newToken, runDays,
  simulatedDelivery, utmUrl, type Campaign,
} from './ads';

describe('tracking IDs', () => {
  it('validates each platform’s format, accepting Arabic digits and fixing case', () => {
    expect(checkPixel('meta', '١٢٣٤٥٦٧٨٩٠١٢٣٤٥')).toBeNull();
    expect(checkPixel('meta', '12345')).toBe('format');
    expect(checkPixel('snap', '3f2b1c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBeNull();
    expect(checkPixel('tiktok', 'c4abcdefghij12345678')).toBeNull();
    expect(cleanId('tiktok', ' c4abcdefghij12345678 ')).toBe('C4ABCDEFGHIJ12345678');
    expect(checkPixel('google', 'g-abc123def')).toBeNull();
    expect(checkPixel('google', 'AW-123456789')).toBeNull();
    expect(checkPixel('x', 'o1abc')).toBeNull();
    expect(checkPixel('x', '')).toBe('required');
    expect(checkToken('short')).toBe('format');
    expect(checkToken('')).toBeNull();
    expect(maskToken('abcdefghijklmnopqrstuvwxyz')).toBe('•••• wxyz');
  });
});

describe('feed and UTM', () => {
  it('leaves out products platforms would reject, with the reason', () => {
    const p = productFixtures();
    expect(feedExclusion(p.find((x) => x.id === 'p11')!, 5, true)).toBe('inactive');
    expect(feedExclusion(p.find((x) => x.id === 'p10')!, null, true)).toBe('digital');
    expect(feedExclusion(p.find((x) => x.id === 'p3')!, 0, true)).toBe('noStock');
    expect(feedExclusion(p.find((x) => x.id === 'p3')!, 4, false)).toBe('noPhoto');
    expect(feedExclusion(p.find((x) => x.id === 'p3')!, 4, true)).toBeNull();
    expect(newToken(() => 0.5)).toHaveLength(24);
  });
  it('builds tagged links and a stable campaign tag', () => {
    expect(utmUrl('https://s.test/p', { source: 'Snap Chat', medium: 'paid', campaign: 'eid' })).toBe('https://s.test/p?utm_source=snap-chat&utm_medium=paid&utm_campaign=eid');
    expect(campaignUtm('حملة العيد', 'AD-101')).toBe('campaign-ad-101');
    expect(campaignUtm('Eid Sale 2026', 'AD-102')).toBe('eid-sale-2026-ad-102');
  });
});

describe('campaigns', () => {
  const base: Campaign = { id: 'AD-101', name: 'Eid', objective: 'sales', platforms: ['snap'], audience: 'all', budget: { kind: 'daily', amount: 10000 }, start: '2026-12-01', end: '2026-12-10', productIds: ['p3'], headline: 'عطر العيد', text: '', utm: 'eid-ad-101', status: 'draft', by: 'سارة', at: 0 };
  it('needs connected platforms, a merchant budget, future dates and a short headline', () => {
    expect(checkCampaign(base, ['snap'], '2026-11-25', null)).toEqual({});
    expect(checkCampaign(base, [], '2026-11-25', null).platforms).toBe('notConnected');
    expect(checkCampaign({ ...base, start: '2026-11-01' }, ['snap'], '2026-11-25', null).start).toBe('past');
    expect(checkCampaign({ ...base, end: '2026-11-30' }, ['snap'], '2026-11-25', null).end).toBe('order');
    expect(checkCampaign({ ...base, headline: 'x'.repeat(31) }, ['snap'], '2026-11-25', null).headline).toBe('long');
    expect(checkCampaign({ ...base, audience: 'SG-1' }, ['snap'], '2026-11-25', 0).audience).toBe('empty');
    expect(checkCampaign({ ...base, budget: { kind: 'daily', amount: 0 } }, ['snap'], '2026-11-25', null).budget).toBe('amount');
  });
  it('caps spend at daily × days, ends after the end date, and attributes only tagged orders', () => {
    expect(runDays(base)).toBe(10);
    expect(maxSpend(base)).toBe(100000);
    expect(campaignState({ ...base, status: 'live' }, '2026-12-11')).toBe('ended');
    const live = { ...base, status: 'live' as const, launchedAt: 1 };
    expect(simulatedDelivery(live, '2026-12-03').spend).toBe(30000);
    const orders = allOrders().slice(0, 5);
    orders[0] = { ...orders[0], pay: 'paid', utm: { source: 'snapchat', medium: 'paid', campaign: 'eid-ad-101' } };
    const a = attribution(live, orders, 30000);
    expect(a.orders).toBe(1);
    expect(a.bySource.find((x) => x.p === 'snap')!.orders).toBe(1);
    expect(attribution(live, allOrders().slice(0, 5), 0).orders).toBe(0);
  });
});
