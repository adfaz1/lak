import { describe, expect, it } from 'vitest';
import { allOrders, type Order } from '../../merchant/domain';
import { customerFixtures } from '../../merchant/workspace';
import { channels, customerRows, filterCustomers, lifetime, mask, matches, messageProblems, paginate, parseSegment, parseSort, segmentCounts, smsParts } from './model';

const orders = allOrders();
const customers = customerFixtures();
const rows = customerRows(customers, orders);

describe('customer rows', () => {
  it('one row per customer, with last order taken from the most recent order', () => {
    expect(rows.length).toBe(customers.length);
    const sara = rows.find((r) => r.c.name.en === 'Sarah Alotaibi')!;
    const mine = orders.filter((o) => o.customer.en === 'Sarah Alotaibi');
    expect(sara.lastHours).toBe(Math.min(...mine.map((o) => o.hoursAgo)));
    expect(sara.orderCount).toBe(mine.length);
  });
  it('a customer without orders has no last order and no paid-order segment', () => {
    const [r] = customerRows([customers[0]], []);
    expect(r.lastHours).toBeNull();
    expect(r.segs.filter((s) => s !== 'emailConsent')).toEqual([]);
  });
  it('segment counts match the rows in each segment', () => {
    const n = segmentCounts(rows);
    expect(n.all).toBe(rows.length);
    expect(n.returning).toBe(rows.filter((r) => r.paidCount >= 2).length);
    expect(n.emailConsent).toBe(customers.filter((c) => c.consent.email).length);
  });
});

describe('search, segment and sort', () => {
  it('ignores unknown query values', () => {
    expect(parseSegment('vip')).toBeNull();
    expect(parseSegment('highValue')).toBe('highValue');
    expect(parseSort('nope')).toBe('recent');
  });
  it('finds by Arabic or English name, id and city', () => {
    const r = rows[0];
    expect(matches(r, r.c.name.ar.split(' ')[0], false)).toBe(true);
    expect(matches(r, r.c.name.en.toUpperCase(), false)).toBe(true);
    expect(matches(r, r.c.id.toLowerCase(), false)).toBe(true);
  });
  it('searches email and mobile only for viewers allowed to see contact details', () => {
    const r = rows[3];
    expect(matches(r, r.c.email, false)).toBe(false);
    expect(matches(r, r.c.email, true)).toBe(true);
    expect(matches(r, r.c.phone.slice(-6), true)).toBe(true);
    expect(matches(r, r.c.phone.slice(-6), false)).toBe(false);
  });
  it('filters by segment and sorts by spend', () => {
    const out = filterCustomers(rows, { q: '', seg: 'highValue', sort: 'spent', contact: true });
    expect(out.every((r) => r.segs.includes('highValue'))).toBe(true);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].spent).toBeGreaterThanOrEqual(out[i].spent);
  });
  it('sorts by most recent order with customers without orders last', () => {
    const extra = customerRows([customers[0]], [])[0];
    const out = filterCustomers([extra, ...rows], { q: '', seg: null, sort: 'recent', contact: false });
    expect(out[out.length - 1].lastHours).toBeNull();
    expect(out[0].lastHours).toBe(Math.min(...rows.filter((r) => r.lastHours !== null).map((r) => r.lastHours!)));
  });
  it('clamps the page to the available range', () => {
    expect(paginate(rows, 99).page).toBe(Math.ceil(rows.length / 25));
    expect(paginate(rows, -3).page).toBe(1);
    expect(paginate([], 1)).toMatchObject({ page: 1, pages: 1, total: 0 });
  });
});

describe('lifetime value', () => {
  const sara = customers.find((c) => c.name.en === 'Sarah Alotaibi')!;
  it('spend excludes failed payments and subtracts confirmed refunds only', () => {
    const base: Order = orders.find((o) => o.customer.en === sara.name.en && o.pay === 'paid')!;
    const withRefunds: Order = { ...base, ref: 'T1', refunds: [
      { id: 'R1', amount: 1000, qty: [], shipping: 0, restock: [], loc: 'ryd', reason: '', status: 'confirmed' },
      { id: 'R2', amount: 500, qty: [], shipping: 0, restock: [], loc: 'ryd', reason: '', status: 'pending' },
    ] };
    const failed: Order = { ...base, ref: 'T2', pay: 'failed' };
    const a = lifetime(sara, [base]);
    const b = lifetime(sara, [base, withRefunds, failed]);
    expect(b.spent).toBe(a.spent * 2 - 1000);
    expect(b.refunded).toBe(1000);
    expect(b.refundPending).toBe(500);
    expect(b.failed).toBe(1);
    expect(b.paidCount).toBe(2);
    expect(b.aov).toBe(Math.round(b.spent / 2));
  });
  it('history is newest first; first and last order come from it', () => {
    const l = lifetime(sara, orders);
    for (let i = 1; i < l.history.length; i++) expect(l.history[i - 1].hoursAgo).toBeLessThanOrEqual(l.history[i].hoursAgo);
    expect(l.lastHours).toBe(l.history[0].hoursAgo);
    expect(l.firstHours).toBe(l.history[l.history.length - 1].hoursAgo);
  });
  it('no orders gives no average rather than zero', () => {
    expect(lifetime(sara, []).aov).toBeNull();
  });
});

describe('messages to the customer', () => {
  const consentless = { ...customers[0], consent: { email: false, sms: false } };
  it('marketing needs consent on the chosen channel', () => {
    expect(messageProblems(consentless, { channel: 'email', purpose: 'marketing', orderRef: '', text: 'Hi' })).toEqual(['noConsent']);
    expect(messageProblems({ ...consentless, consent: { email: true, sms: false } }, { channel: 'email', purpose: 'marketing', orderRef: '', text: 'Hi' })).toEqual([]);
  });
  it('a service message needs an order but no marketing consent', () => {
    expect(messageProblems(consentless, { channel: 'sms', purpose: 'service', orderRef: '', text: 'Hi' })).toEqual(['noOrder']);
    expect(messageProblems(consentless, { channel: 'sms', purpose: 'service', orderRef: '10482', text: 'Hi' })).toEqual([]);
  });
  it('blocks empty text and SMS longer than three parts', () => {
    expect(messageProblems(consentless, { channel: 'sms', purpose: 'service', orderRef: '1', text: '  ' })).toEqual(['empty']);
    expect(messageProblems(consentless, { channel: 'sms', purpose: 'service', orderRef: '1', text: 'م'.repeat(202) })).toEqual(['tooLong']);
    expect(messageProblems(consentless, { channel: 'email', purpose: 'service', orderRef: '1', text: 'م'.repeat(202) })).toEqual([]);
  });
  it('counts SMS parts with the smaller Unicode size for Arabic', () => {
    expect(smsParts('')).toMatchObject({ parts: 0 });
    expect(smsParts('a'.repeat(160))).toMatchObject({ parts: 1, unicode: false });
    expect(smsParts('a'.repeat(161))).toMatchObject({ parts: 2 });
    expect(smsParts('م'.repeat(70))).toMatchObject({ parts: 1, unicode: true });
    expect(smsParts('م'.repeat(71))).toMatchObject({ parts: 2 });
  });
  it('lists both channels with their consent and masks values', () => {
    const c = customers[0];
    expect(channels(c).map((x) => [x.channel, x.consent])).toEqual([['email', c.consent.email], ['sms', c.consent.sms]]);
    expect(mask('customer1001@example.test', 'email')).toBe('cu••••••••••@example.test');
    expect(mask('+966 50 000 1001', 'sms')).toBe('•••• 1001');
  });
});
