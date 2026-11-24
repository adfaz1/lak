import { describe, expect, it } from 'vitest';
import { allOrders } from '../../merchant/domain';
import { cartFixtures, reviewFixtures, runFixtures } from '../../merchant/growth';
import { customerFixtures, matchesRules, customerStats } from '../../merchant/workspace';
import { campaignFixtures } from '../marketing/model';
import { applyImport, customerRows, customersCsv, inSaved, parseImport, segmentOk, segmentProblems, timeline } from './model';

const orders = allOrders();
const customers = customerFixtures();
const src = (extra = {}) => ({ orders, notes: [], campaigns: campaignFixtures(), carts: cartFixtures(), runs: runFixtures(), events: [], reviews: reviewFixtures(), now: Date.parse('2026-11-24T12:00:00Z'), today: '2026-11-24', ...extra });

describe('customer timeline', () => {
  it('merges orders, campaign messages, carts, automation runs, notes and reviews, newest first', () => {
    const c = customers.find((x) => x.id === 'C-1001')!;
    const t = timeline(c, src({ notes: [{ id: 'N1', kind: 'internal' as const, text: 'x', by: 'y' }] }));
    const kinds = new Set(t.map((x) => x.kind));
    for (const k of ['order', 'campaign', 'cart', 'note', 'review', 'joined']) expect(kinds.has(k as never)).toBe(true);
    expect(t.every((x, i) => i === 0 || t[i - 1].hoursAgo <= x.hoursAgo)).toBe(true);
    expect(t.filter((x) => x.kind === 'campaign').map((x) => x.ref)).toEqual(['CMP-204', 'CMP-203']);
  });
  it('shows automation runs about the customer’s own carts only', () => {
    const owner = cartFixtures().find((x) => x.id === 'CRT-3104')!.customerId!;
    const c = customers.find((x) => x.id === owner)!;
    expect(timeline(c, src()).some((x) => x.kind === 'automation' && x.ref === 'RUN-901')).toBe(true);
    const other = customers.find((x) => x.id !== owner && !cartFixtures().some((k) => k.customerId === x.id && ['CRT-3104', 'CRT-3111', 'CRT-3120', 'CRT-3127', 'CRT-3102', 'CRT-3115'].includes(k.id)))!;
    expect(timeline(other, src()).some((x) => x.kind === 'automation')).toBe(false);
  });
});

describe('saved segments', () => {
  it('counts live from rules and validates before saving', () => {
    const rows = customerRows(customers, orders);
    const seg = { id: 'S', name: { ar: 'a', en: 'a' }, rules: [{ field: 'city' as const, op: 'is' as const, value: 'Riyadh' }], by: '', at: '' };
    const hits = inSaved(rows, orders, seg);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.c.city.en === 'Riyadh')).toBe(true);
    expect(segmentOk(segmentProblems('', [], []))).toBe(false);
    expect(segmentProblems('A', [{ field: 'spent', op: 'gte', value: 'x' }], ['a'])).toEqual({ name: 'taken', rules: [0] });
    const c = customers[0];
    expect(matchesRules(c, customerStats(c, orders), [{ field: 'spent', op: 'gte', value: '٠' }])).toBe(true);
  });
});

describe('export and import', () => {
  it('masks contact details for roles without access', () => {
    const csv = customersCsv(customerRows(customers.slice(0, 2), orders), false, 'en');
    expect(csv).not.toContain('customer1001@example.test');
    expect(csv.split('\n')).toHaveLength(3);
  });
  it('previews every row and adds only valid new customers', () => {
    const text = 'name,email,phone,city,email_consent,sms_consent\nNoor,noor@example.test,0551234567,Jeddah,yes,no\n,bad,123,,maybe,no\nDup,customer1001@example.test,,Riyadh,no,no\nNoor2,noor@example.test,,Jeddah,no,no\n';
    const p = parseImport(text, customers);
    expect(p.rows.map((r) => r.problems)).toEqual([[], ['name', 'email', 'phone', 'consent'], ['duplicate'], ['repeated']]);
    const r = applyImport(customers, p.rows, '2026-11-24');
    expect(r.added).toHaveLength(1);
    expect(r.added[0]).toMatchObject({ phone: '+966 55 123 4567', consent: { email: true, sms: false } });
    expect(parseImport('foo,bar\n1,2', customers).missingColumns).toEqual(['name', 'email', 'phone']);
  });
});
