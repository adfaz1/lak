import { describe, expect, it } from 'vitest';
import { allOrders, type Order } from '../../merchant/domain';
import { productFixtures } from '../../merchant/catalog';
import {
  attributeOrder, attributionFixtures, collabResults, commissionFor, commissionLines, commissionRulesFixture, deliverableState, emptyPartnerDraft,
  partnerFixtures, partnerTotals, payoutPreview, runPayout, selfReferral, statementCsv, suggestCode, validateCollab, validatePartner, validateRules, rulesDraft,
  type Attribution, type Partner,
} from '../../merchant/growth';

const NOW = Date.UTC(2026, 10, 24, 9);
const rules = commissionRulesFixture();
const products = productFixtures();
const aff: Partner = { id: 'AF-1', kind: 'affiliate', name: 'Test', email: 'a@b.co', phone: '0551234567', handles: [], code: 'TESTER', coupon: 'TESTER', status: 'active', addedAt: '2026-11-01', by: 'x' };
const att = (ref: string, extra: Partial<Attribution> = {}): Attribution => ({ ref, partnerId: aff.id, via: 'link', at: NOW, rules, ...extra });
const order = (o: Partial<Order>): Order => ({ ...allOrders().find((x) => x.items.length === 1 && x.items[0].sku === 'OUD-100')!, ...o });

describe('affiliate attribution', () => {
  it('credits a code first, a link only inside the cookie window, never a paused partner', () => {
    expect(attributeOrder({ ref: '1', coupon: 'TESTER' }, null, [aff], rules, NOW)?.via).toBe('code');
    expect(attributeOrder({ ref: '1' }, { code: 'tester', at: NOW - 29 * 86_400_000 }, [aff], rules, NOW)?.via).toBe('link');
    expect(attributeOrder({ ref: '1' }, { code: 'TESTER', at: NOW - 31 * 86_400_000 }, [aff], rules, NOW)).toBeNull();
    expect(attributeOrder({ ref: '1', coupon: 'TESTER' }, null, [{ ...aff, status: 'paused' }], rules, NOW)).toBeNull();
  });
});

describe('commission', () => {
  it('pays percent on the net before VAT, honours category rates and exclusions, and refunds lower it', () => {
    const o = order({ discount: 0, refunds: [] });
    const net = Math.round((o.items[0].qty * o.items[0].unit) / 1.15);
    expect(commissionFor(o, att(o.ref), products).amount).toBe(Math.round(net * 0.1));
    const cat = products.find((p) => p.sku === 'OUD-100')!.category.en;
    expect(commissionFor(o, att(o.ref, { rules: { ...rules, byCategory: { [cat]: { kind: 'fixed', value: 500 } } } }), products).amount).toBe(500 * o.items[0].qty);
    expect(commissionFor(o, att(o.ref, { rules: { ...rules, excludeCategories: [cat] } }), products).amount).toBe(0);
    expect(commissionFor(o, att(o.ref, { rate: null }), products).amount).toBe(0);
    const total = o.items[0].qty * o.items[0].unit + o.fee;
    const half = order({ refunds: [{ id: 'R', amount: Math.round(total / 2), qty: [], shipping: 0, restock: [], loc: 'RUH' as never, reason: '', status: 'confirmed' }] });
    expect(commissionFor(half, att(half.ref), products).amount).toBeLessThan(commissionFor(o, att(o.ref), products).amount);
  });

  it('moves pending → approved after the return window, holds self-referrals, reverses cancelled, claws back after payment', () => {
    const fresh = order({ hoursAgo: 24, placedAt: undefined });
    const old = order({ hoursAgo: 24 * 20, ref: 'OLD' });
    const self = order({ ref: 'SELF', hoursAgo: 24 * 20, contact: { phone: '+966 55 123 4567' } });
    const gone = order({ ref: 'GONE', hoursAgo: 24 * 20, cancelled: { at: 0, by: 'x', role: 'owner', reason: 'r' } });
    const book = [fresh, old, self, gone];
    const lines = commissionLines(book, book.map((o) => att(o.ref)), [aff], products, [], 14, NOW);
    const st = (ref: string) => lines.find((l) => l.ref === ref)!.state;
    expect(st(fresh.ref)).toBe('pending');
    expect(st('OLD')).toBe('approved');
    expect(st('SELF')).toBe('held');
    expect(selfReferral(self, aff)).toBe(true);
    expect(st('GONE')).toBe('reversed');
    const po = runPayout(payoutPreview(lines, [aff], 0), 'PO-1', 'me', '2026-11-24')!;
    expect(po.lines[0].refs.map((r) => r.ref)).toEqual(['OLD']);
    const after = commissionLines(book, book.map((o) => att(o.ref)), [aff], products, [po], 14, NOW);
    expect(after.find((l) => l.ref === 'OLD')!.state).toBe('paid');
    const refunded = book.map((o) => (o.ref === 'OLD' ? { ...o, cancelled: { at: 0, by: 'x', role: 'owner', reason: 'r' } } : o));
    const claw = commissionLines(refunded, book.map((o) => att(o.ref)), [aff], products, [po], 14, NOW);
    expect(claw.find((l) => l.ref === 'OLD')!.state).toBe('clawback');
    expect(partnerTotals(claw).clawback).toBe(po.total);
    expect(payoutPreview(claw, [aff], 0)[0].skip).toBe('none');
  });

  it('skips partners under the minimum payout and exports a statement', () => {
    const old = order({ hoursAgo: 24 * 20 });
    const lines = commissionLines([old], [att(old.ref)], [aff], products, [], 14, NOW);
    expect(payoutPreview(lines, [aff], 10_000_000)[0].skip).toBe('min');
    const csv = statementCsv(aff, lines, 'en');
    expect(csv.split('\n')[1]).toContain('Commission');
    expect(csv).toContain(old.ref);
  });
});

describe('validation and fixtures', () => {
  it('validates partners (Arabic digits, unique codes) and rules', () => {
    const d = { ...emptyPartnerDraft('affiliate'), name: 'سارة', phone: '٠٥٥١٢٣٤٥٦٧', code: 'SARA' };
    expect(validatePartner(d, [aff], [])).toEqual([]);
    expect(validatePartner({ ...d, code: 'TESTER' }, [aff], [])).toContain('codeTaken');
    expect(validatePartner({ ...d, phone: '', email: '' }, [], [])).toContain('contact');
    expect(validatePartner({ ...emptyPartnerDraft('influencer'), name: 'x y', code: 'XYZ', discountPct: '10' }, [], [])).toContain('handle');
    expect(suggestCode('sara@x.com', ['SARAXCOM'])).toMatch(/^[A-Z0-9]{3,16}$/);
    expect(validateRules({ ...rulesDraft(rules), cookieDays: '٣٠' })).toEqual([]);
    expect(validateRules({ ...rulesDraft(rules), cookieDays: '120' })).toContain('cookie');
  });
  it('labels every fixture person as an example and credits real fixture orders', () => {
    expect(partnerFixtures().every((p) => p.example && p.by === 'مثال للتجربة')).toBe(true);
    const a = attributionFixtures(allOrders());
    expect(a.length).toBeGreaterThan(5);
    const lines = commissionLines(allOrders(), a, partnerFixtures(), products, [], 14, NOW);
    expect(new Set(lines.map((l) => l.state))).toEqual(new Set(['pending', 'approved']));
  });
  it('tracks deliverables and collaboration ROI', () => {
    expect(deliverableState({ id: 'd', kind: 'post', platform: 'x', due: '2026-11-20' }, '2026-11-24')).toBe('late');
    expect(validateCollab({ title: 'abc', brief: '', starts: '2026-11-01', ends: '2026-11-10', fee: '', deliverables: [{ kind: 'post', platform: 'x', due: '2026-11-12' }] })).toContain('due');
    const r = collabResults({ id: 'c', partnerId: aff.id, title: 't', brief: '', starts: '2026-01-01', ends: '2026-12-31', fee: 10000, deliverables: [], gifts: [{ ref: 'G', value: 5000 }], status: 'active', createdAt: '', by: '' }, [], [], NOW, '2026-11-24');
    expect(r.cost).toBe(15000);
    expect(r.roi).toBe(-1);
  });
});
