import { describe, expect, it } from 'vitest';
import { parseMoney } from '../../merchant/catalog';
import { allOrders } from '../../merchant/domain';
import { couponFixtures, type Coupon } from '../../merchant/growth';
import { customerFixtures } from '../../merchant/workspace';
import {
  SAMPLES, audienceAllowed, broadcastAudience, buildCoupon, campaignFixtures, campaignOutcome, checkDraft, couponActions, couponDiff, couponState,
  couponViewCounts, draftFromCoupon, filterCoupons, jobCost, jobResult, messageError, newJob, previewOn, recordCampaign, stepJob, stopJob, usagePct,
} from './model';

const [welcome, ship, nov50, ramadan] = couponFixtures();

describe('coupon state', () => {
  it('refines the stored status by dates and usage', () => {
    expect(couponState(welcome)).toBe('active');
    expect(couponState(nov50)).toBe('exhausted');
    expect(couponState(ramadan)).toBe('draft');
    expect(couponState({ ...ramadan, status: 'active' })).toBe('scheduled');
    expect(couponState(ship, '2026-12-01')).toBe('expired');
  });
  it('offers only meaningful status changes', () => {
    expect(couponActions(welcome)).toEqual(['pause']);
    expect(couponActions(ramadan)).toEqual(['activate']);
    expect(couponActions(nov50)).toEqual([]);
  });
  it('filters by saved view, code search and type, and counts views', () => {
    const all = couponFixtures();
    expect(filterCoupons(all, { view: 'live', q: '', type: '' }).map((c) => c.code)).toEqual(['WELCOME10', 'SHIPFREE']);
    expect(filterCoupons(all, { view: 'all', q: 'ship', type: '' }).map((c) => c.code)).toEqual(['SHIPFREE']);
    expect(filterCoupons(all, { view: 'all', q: '', type: 'fixed' }).map((c) => c.code)).toEqual(['NOV50']);
    expect(couponViewCounts(all)).toEqual({ all: 5, live: 2, scheduled: 0, drafts: 2, ended: 1 });
  });
  it('reports usage as a share of the limit', () => {
    expect(usagePct(welcome)).toBeNull();
    expect(usagePct(ship)).toBe(24);
    expect(usagePct(nov50)).toBe(100);
  });
});

describe('coupon editing', () => {
  it('round-trips a coupon through the draft form', () => {
    for (const c of couponFixtures()) expect(buildCoupon(draftFromCoupon(c), parseMoney, c)).toEqual(c);
  });
  it('does not treat the coupon’s own code as taken when editing', () => {
    expect(checkDraft(draftFromCoupon(welcome), couponFixtures(), parseMoney, 'WELCOME10')).toEqual({});
    expect(checkDraft(draftFromCoupon(welcome), couponFixtures(), parseMoney)).toEqual({ code: 'codeTaken' });
  });
  it('lists changed fields for review before saving a live coupon', () => {
    const edited: Coupon = { ...welcome, value: 15, ends: '2026-12-31' };
    expect(couponDiff(welcome, edited)).toEqual(['value', 'ends']);
  });
  it('previews a draft or scheduled coupon as if live today', () => {
    expect(previewOn(ramadan, SAMPLES[0])).toMatchObject({ block: null, discount: Math.floor((38800 * 15) / 100) });
    expect(previewOn(welcome, SAMPLES[1]).block).toBe('minSpend');
    expect(previewOn(welcome, SAMPLES[2]).block).toBe('perCustomer');
    expect(previewOn(ship, SAMPLES[2])).toMatchObject({ block: null, shippingOff: 0, total: 54900 });
  });
});

describe('simulated send job', () => {
  const fails = (id: string) => id.endsWith('7');
  it('advances in batches, counts failures and charges handed-over messages only', () => {
    let j = newJob(['A1', 'A7', 'A3', 'B7', 'B1']);
    j = stepJob(j, fails, 2);
    expect(jobResult(j)).toEqual({ handed: 1, failed: 1, notSent: 3, total: 5, pct: 40 });
    j = stepJob(stepJob(j, fails, 2), fails, 2);
    expect(jobResult(j)).toMatchObject({ handed: 3, failed: 2, notSent: 0, pct: 100 });
    expect(jobCost(j, 'sms')).toBe(3 * 9);
  });
  it('stopping is final and leaves the rest unsent', () => {
    const j = stopJob(stepJob(newJob(['A1', 'A2', 'A3']), fails, 1));
    expect(stepJob(j, fails)).toBe(j);
    expect(jobResult(j)).toMatchObject({ handed: 1, notSent: 2 });
  });
});

describe('broadcast audience', () => {
  const customers = customerFixtures();
  const orders = allOrders();
  it('every customer is eligible or excluded with a reason', () => {
    for (const aud of ['all', 'returning', 'highValue'] as const) {
      const a = broadcastAudience(customers, orders, aud, 'email');
      expect(a.eligible.length + a.excluded.notInSegment + a.excluded.noConsent).toBe(customers.length);
      expect(a.eligible.every((c) => c.consent.email)).toBe(true);
    }
  });
  it('separates plan limits from permissions: segments need Pro, broadcast needs Plus', () => {
    expect(audienceAllowed('all', 'basic')).toBe(false);
    expect(audienceAllowed('all', 'plus')).toBe(true);
    expect(audienceAllowed('returning', 'plus')).toBe(false);
    expect(audienceAllowed('returning', 'pro')).toBe(true);
  });
});

describe('campaign history', () => {
  it('records a new campaign with the next id and classifies outcomes', () => {
    const list = recordCampaign(campaignFixtures(), { ...campaignFixtures()[0], stopped: true });
    expect(list[0].id).toBe('CMP-205');
    expect(campaignOutcome(list[0])).toBe('stopped');
    expect(campaignOutcome(campaignFixtures()[0])).toBe('withFailures');
  });
  it('checks message length per channel', () => {
    expect(messageError('  ', 'email')).toBe('empty');
    expect(messageError('x'.repeat(71), 'sms')).toBe('long');
    expect(messageError('x'.repeat(71), 'email')).toBeNull();
  });
});
