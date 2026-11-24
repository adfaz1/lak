import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf, type Product } from '../../merchant/catalog';
import { allOrders } from '../../merchant/domain';
import { available, initialLevels } from '../../merchant/inventory';
import { policyFixtures, providerFixtures, statusFixture, zoneFixtures } from '../../merchant/workspace';
import {
  buildRows, channelState, checksMet, countRows, decide, filterRows, includeOutcome, openMarketOrders, readTab, storeChecks, submitForReview,
  submittable, toggleImpact, type Reviews,
} from './model';

const products = productFixtures();
const levels = initialLevels(products.flatMap(skusOf));
const stockOf = (p: Product) => (p.type === 'digital' ? null : levels.filter((l) => skusOf(p).includes(l.sku)).reduce((s, l) => s + available(l), 0));
const photo = (p: Product) => p.id !== 'p7' && p.id !== 'p10';
const facts = { verified: true, status: statusFixture(), providers: providerFixtures(), zones: zoneFixtures(), policies: policyFixtures() };
const reviews: Reviews = { p1: { review: 'approved' } };
const rows = (r: Reviews = reviews, verified = true, live = true, list = products) => buildRows(list, stockOf, photo, r, verified, live);
const row = (id: string, ...a: Parameters<typeof rows>) => rows(...a).find((x) => x.product.id === id)!;

describe('store eligibility', () => {
  it('passes with the demo store and keeps commercial terms pending, not blocking', () => {
    const c = storeChecks(facts);
    expect(c.find((x) => x.id === 'terms')).toEqual({ id: 'terms', state: 'pending', required: false });
    expect(checksMet(c)).toBe(true);
    expect(channelState(true, c)).toBe('live');
    expect(channelState(false, c)).toBe('paused');
  });
  it('blocks the channel when a required check fails', () => {
    const c = storeChecks({ ...facts, status: { ...facts.status, maintenance: true } });
    expect(c.find((x) => x.id === 'published')?.state).toBe('todo');
    expect(channelState(true, c)).toBe('blocked');
    expect(channelState(true, storeChecks({ ...facts, policies: [] }))).toBe('blocked');
    expect(channelState(true, storeChecks({ ...facts, providers: facts.providers.map((p) => ({ ...p, state: 'not_connected' as const })) }))).toBe('blocked');
  });
});

describe('product listing state', () => {
  it('maps the catalogue onto the marketplace rules', () => {
    expect(row('p1').state).toBe('listed');
    expect(row('p2')).toMatchObject({ state: 'needs_fix', fixes: ['description'] });
    expect(row('p7').fixes).toEqual(['images', 'description']);
    expect(row('p9').state).toBe('opted_out'); // the merchant turned the marketplace off for this product
    expect(row('p10').state).toBe('excluded'); // digital gift card
    expect(row('p11').state).toBe('inactive'); // draft
    expect(row('p12').state).toBe('inactive'); // archived
  });
  it('hides everything when the store is not verified, and listed items when paused', () => {
    expect(row('p1', reviews, false).state).toBe('store_blocked');
    expect(row('p1', reviews, true, false).state).toBe('paused');
  });
  it('goes through review once the product is complete', () => {
    const fixed = products.map((p) => (p.id === 'p2' ? { ...p, desc: { ar: 'شال من حرير موغا الطبيعي بلون ذهبي، مناسب للمناسبات.', en: '' } } : p));
    const r0 = row('p2', reviews, true, true, fixed);
    expect(r0.state).toBe('not_submitted');
    expect(submittable(r0, true)).toBe(true);
    const sent = submitForReview(reviews, ['p2']);
    expect(row('p2', sent, true, true, fixed).state).toBe('in_review');
    expect(row('p2', decide(sent, 'p2', true), true, true, fixed).state).toBe('listed');
    const no = decide(sent, 'p2', false);
    expect(row('p2', no, true, true, fixed).state).toBe('rejected');
    expect(submittable(row('p2', no, true, true, fixed), true)).toBe(true);
    expect(decide(reviews, 'p1', false)).toBe(reviews); // only pending items get a decision
  });
  it('never submits excluded, withheld or incomplete products', () => {
    const all = rows();
    expect(all.filter((r) => submittable(r, true))).toEqual([]);
    expect(includeOutcome(row('p9'), true, true)).toBe('needs_fix'); // it still lacks a description
  });
  it('counts every product once and filters by tab and search', () => {
    const all = rows();
    expect(Object.values(countRows(all)).reduce((a, b) => a + b, 0)).toBe(products.length);
    expect(filterRows(all, 'visible', '').map((r) => r.product.id)).toEqual(['p1']);
    expect(filterRows(all, 'hidden', '').map((r) => r.product.id)).toEqual(['p9', 'p10', 'p11', 'p12']);
    expect(filterRows(all, 'all', 'عباية').map((r) => r.product.id)).toEqual(['p1']);
    expect(filterRows(all, 'all', 'BAG-LTH').map((r) => r.product.id)).toEqual(['p4']);
    expect(readTab('nope')).toBe('all');
  });
});

describe('pause / enable consequence', () => {
  it('says how many products disappear and that open orders continue', () => {
    const orders = allOrders();
    const pause = toggleImpact(rows(), orders, false);
    expect(pause).toMatchObject({ visibleNow: 1, visibleAfter: 0 });
    expect(pause.openOrders).toBe(openMarketOrders(orders).length);
    expect(pause.openOrders).toBeGreaterThan(0);
    const enable = toggleImpact(rows(reviews, true, false), orders, true);
    expect(enable).toMatchObject({ visibleNow: 0, visibleAfter: 1 });
  });
});
