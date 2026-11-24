import { describe, expect, it } from 'vitest';
import {
  cartFixtures, cartSequenceFixture, couponFixtures, inQuiet, renderTemplate, reminderCode, reorderCandidates, reorderFixtures, retryDelivery, runSequence, stepErrors,
  type Cart, type CartSequence, type Delivery,
} from '../../merchant/growth';
import { productFixtures } from '../../merchant/catalog';
import { allOrders } from '../../merchant/domain';
import { customerFixtures } from '../../merchant/workspace';
import { forecast, passCarts, passReorder, reminderProblems, reminderWorkItems, sequenceStats } from './reminders-model';

const active = (): CartSequence => ({ ...cartSequenceFixture(), status: 'active', version: 1 });
const ctx = { now: 1, hour: 14, today: '2026-11-24' };
const cart = (p: Partial<Cart>): Cart => ({ id: 'CRT-1', customer: { ar: 'أ', en: 'A' }, value: 10000, hoursAgo: 2, emailConsent: true, smsConsent: true, purchased: false, optedOut: false, contactedByAutomation: false, customerId: 'C-1001', items: [{ sku: 'OUD-100', name: { ar: 'عطر', en: 'Perfume' }, qty: 1, unit: 10000 }], ...p });

describe('quiet hours and templates', () => {
  it('wraps midnight', () => {
    const q = { on: true, from: 22, to: 9 };
    expect([23, 0, 8].every((h) => inQuiet(q, h))).toBe(true);
    expect([9, 14, 21].some((h) => inQuiet(q, h))).toBe(false);
    expect(inQuiet({ ...q, on: false }, 23)).toBe(false);
  });
  it('fills placeholders and flags unknown ones and missing codes', () => {
    expect(renderTemplate('{name} {code}', { name: 'سارة', code: 'LK1' })).toBe('سارة LK1');
    const s = cartSequenceFixture().steps[1];
    expect(stepErrors(s, undefined, 600, [])).toEqual([]);
    expect(stepErrors({ ...s, text: { ar: 'خصم {coupon}', en: 'x' } }, undefined, 600, [])).toEqual(expect.arrayContaining(['placeholder', 'codeMissing']));
    expect(stepErrors({ ...s, afterHours: 1 }, { ...s, afterHours: 24 }, 600, [])).toContain('order');
    expect(stepErrors(s, undefined, 40, [])).toContain('long');
  });
  it('makes stable single-use codes that avoid taken ones', () => {
    const a = reminderCode('CRT-1:st2', []);
    expect(a).toMatch(/^LK[A-Z2-9]{6}$/);
    expect(reminderCode('CRT-1:st2', [])).toBe(a);
    expect(reminderCode('CRT-1:st2', [a])).not.toBe(a);
  });
});

describe('cart sequence run', () => {
  it('does nothing while not active', () => {
    expect(runSequence(cartSequenceFixture(), [cart({})], [], [], ctx).deliveries).toEqual([]);
  });
  it('sends only the latest due step to an old cart and skips earlier ones', () => {
    const r = runSequence(active(), [cart({ hoursAgo: 30 })], [], [], ctx);
    expect(r.deliveries.map((d) => [d.step, d.status])).toEqual([['st1', 'skipped'], ['st2', 'sent']]);
    expect(r.coupons).toHaveLength(1);
    expect(r.coupons[0]).toMatchObject({ limitTotal: 1, limitPerCustomer: 1, value: 10, origin: 'reminder', ends: '2026-11-27' });
    expect(r.deliveries[1].code).toBe(r.coupons[0].code);
  });
  it('respects consent, opt-out, purchase and age', () => {
    const seq = active();
    const r = runSequence(seq, [cart({ id: 'a', emailConsent: false }), cart({ id: 'b', optedOut: true }), cart({ id: 'c', purchased: true }), cart({ id: 'd', hoursAgo: 200 })], [], [], ctx);
    const by = Object.fromEntries(r.deliveries.map((d) => [d.target, d.reason]));
    expect(by).toEqual({ a: 'noConsent', b: 'optedOut', d: 'tooOld' });
  });
  it('defers in quiet hours and sends after; never sends a step twice', () => {
    const seq = active();
    const night = runSequence(seq, [cart({})], [], [], { ...ctx, hour: 23 });
    expect(night.deliveries[0]).toMatchObject({ status: 'deferred', reason: 'quiet', attempts: 0 });
    const day = runSequence(seq, [cart({})], night.deliveries, [], ctx);
    expect(day.deliveries).toHaveLength(1);
    expect(day.deliveries[0].status).toBe('sent');
    expect(runSequence(seq, [cart({})], day.deliveries, [], ctx).deliveries).toEqual(day.deliveries);
  });
  it('stops after a purchase and fails a step whose coupon no longer works', () => {
    const seq = active();
    const first = runSequence(seq, [cart({ hoursAgo: 2 })], [], [], ctx).deliveries;
    const later = runSequence(seq, [cart({ hoursAgo: 30, purchased: true })], first, [], ctx).deliveries;
    expect(later.find((d) => d.step === 'st2')).toMatchObject({ status: 'stopped', reason: 'bought' });
    const withCoupon: CartSequence = { ...seq, steps: seq.steps.map((s) => (s.id === 'st2' ? { ...s, discount: { kind: 'existing', code: 'NOV50' } } : s)) };
    const r = runSequence(withCoupon, [cart({ hoursAgo: 30 })], [], couponFixtures(), ctx); // NOV50 is exhausted
    expect(r.deliveries.find((d) => d.step === 'st2')).toMatchObject({ status: 'failed', reason: 'coupon' });
    expect(reminderProblems(withCoupon, [], r.deliveries, couponFixtures())).toEqual([{ kind: 'failing', source: 'seq', step: 'st2', count: 1, reason: 'coupon' }]);
  });
  it('fails SMS when the provider is down and recovers on retry', () => {
    const r = runSequence(active(), [cart({ hoursAgo: 80 })], [], [], { ...ctx, smsDown: true });
    const d = r.deliveries.find((x) => x.step === 'st3') as Delivery;
    expect(d).toMatchObject({ status: 'failed', reason: 'provider', attempts: 1 });
    const items = reminderWorkItems({ seq: active(), rules: [], deliveries: r.deliveries, coupons: [] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'automation', page: 'marketing', action: { section: 'marketing', path: 'reminders', query: { step: 'st3' } } });
    expect(retryDelivery(d, ctx, active().quiet, false)).toMatchObject({ status: 'sent', attempts: 2 });
  });
  it('a full pass on the fixtures records results per step from the carts', () => {
    const products = productFixtures();
    const p = passCarts(active(), cartFixtures(), [], couponFixtures(), products, ctx);
    expect(p.summary.sent).toBeGreaterThan(5);
    const stats = sequenceStats(active(), p.deliveries);
    const recovered = p.carts.filter((c) => c.recovered?.campaign === 'SEQ');
    expect(stats.reduce((s, x) => s + x.stats.recovered, 0)).toBe(recovered.length);
    expect(stats.reduce((s, x) => s + x.stats.revenue, 0)).toBe(recovered.reduce((s, c) => s + (c.recovered?.revenue ?? 0), 0));
    // Codes used by recovered carts are counted on the coupon.
    for (const c of recovered.filter((x) => x.recovered?.coupon)) expect(p.coupons.find((k) => k.code === c.recovered!.coupon)?.used).toBe(1);
    // Rejected addresses are on the page but are not raised on the home queue.
    expect(reminderWorkItems({ seq: active(), rules: [], deliveries: p.deliveries, coupons: p.coupons })).toEqual([]);
  });
  it('forecasts messages and discount for the open carts', () => {
    const f = forecast(active(), cartFixtures(), couponFixtures(), productFixtures());
    expect(f.rows).toHaveLength(3);
    expect(f.rows[0].avgDiscount).toBe(0);
    expect(f.rows[1].avgDiscount).toBeGreaterThan(0);
    expect(f.cost).toBe(f.rows.reduce((s, r) => s + r.cost, 0));
  });
});

describe('reorder reminders', () => {
  const orders = allOrders(), customers = customerFixtures(), products = productFixtures();
  it('finds customers due by their latest purchase in scope, with consent', () => {
    const r = reorderFixtures()[0];
    const c = reorderCandidates(r, orders, customers, products, []);
    for (const x of [...c.due, ...c.week]) {
      expect(x.sku).toBe('OUD-100');
      expect(customers.find((k) => k.id === x.customerId)?.consent.email).toBe(true);
    }
    expect(c.due.every((x) => x.dueIn <= 0 && x.dueIn >= -7)).toBe(true);
    expect(c.week.every((x) => x.dueIn > 0 && x.dueIn <= 6)).toBe(true);
  });
  it('sends once per order and does not remind twice', () => {
    const rules = reorderFixtures();
    const quiet = { on: false, from: 22, to: 9 };
    const once = passReorder(rules[0], rules, orders, customers, products, [], [], quiet, ctx);
    const twice = passReorder(rules[0], rules, orders, customers, products, once.deliveries, once.coupons, quiet, ctx);
    expect(twice.summary.sent).toBe(0);
    expect(twice.deliveries.length).toBe(once.deliveries.length);
  });
  it('a later rule leaves out customers an earlier active rule covers', () => {
    const rules = [...reorderFixtures(), { ...reorderFixtures()[0], id: 'RR-2', scope: { kind: 'category' as const, id: 'Fragrance' } }];
    const c = reorderCandidates(rules[1], orders, customers, products, [], [rules[0]]);
    expect(c.due.length + c.week.length).toBe(0);
  });
});
