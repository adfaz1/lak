import { describe, expect, it } from 'vitest';
import { canFulfil, fixtures, issueLabel, parseWeight, search, shipmentRef, subtotal, total, vatIncluded } from './domain';

const byRef = (ref: string) => fixtures().find((o) => o.ref === ref)!;

describe('money', () => {
  it('adds lines and shipping in halalas', () => {
    const o = byRef('10482');
    expect(subtotal(o)).toBe(48600);
    expect(total(o)).toBe(51100);
  });
  it('extracts the VAT contained in an inclusive total', () => {
    expect(vatIncluded(byRef('10482'))).toBe(6665);
  });
});

describe('fulfilment', () => {
  it('issues a label once and separates fulfilment from shipment state', () => {
    const done = issueLabel(byRef('10482'), 'a', false);
    expect(done.ful).toBe('done');
    expect(done.ship).toBe('label');
    expect(done.log.at(-1)).toMatchObject({ kind: 'labelIssued', ref: shipmentRef(done) });
    expect(issueLabel(done, 'a', false)).toBe(done);
  });
  it('keeps the order untouched when the carrier is down, and logs the failure', () => {
    const failed = issueLabel(byRef('10482'), 'a', true);
    expect(failed.ship).toBe('none');
    expect(canFulfil(failed)).toBe(true);
    expect(failed.log.at(-1)?.kind).toBe('labelFailed');
  });
  it('refuses an order whose payment failed', () => {
    const o = byRef('10479');
    expect(issueLabel(o, 'a', false)).toBe(o);
  });
});

describe('views and search', () => {
  it('counts each saved view', () => {
    const all = fixtures();
    expect(search(all, 'needs', '').length).toBe(3);
    expect(search(all, 'payfail', '').length).toBe(1);
    expect(search(all, 'shipped', '').length).toBe(3);
  });
  it('finds by reference or by name in either language', () => {
    const all = fixtures();
    expect(search(all, 'all', '#10481').length).toBe(1);
    expect(search(all, 'all', 'سارة').length).toBe(1);
    expect(search(all, 'all', 'nouf').length).toBe(1);
  });
});

describe('weight', () => {
  it('accepts 0.1 to 30 kg only', () => {
    expect(parseWeight('1.5')).toBe(1.5);
    expect(parseWeight('0')).toBeNull();
    expect(parseWeight('31')).toBeNull();
    expect(parseWeight('abc')).toBeNull();
  });
});

import {
  allOrders, bulkEligibility, fulfilPartial, refundQuote, refundable, remainingQty, requestRefund, runBulk, settleRefund, validatePicks,
  TOTAL_ORDERS, VIEWS,
} from './domain';

const live = (ref: string) => allOrders().find((o) => o.ref === ref)!;

describe('order book', () => {
  it('has 1,200 unique demo orders and keeps the original seven', () => {
    const all = allOrders();
    expect(all.length).toBe(TOTAL_ORDERS);
    expect(new Set(all.map((o) => o.ref)).size).toBe(TOTAL_ORDERS);
    expect(all.slice(0, 7).map((o) => o.ref)).toEqual(fixtures().map((o) => o.ref));
  });
  it('late is a subset of needs fulfilment', () => {
    const all = allOrders();
    expect(all.filter(VIEWS.late).every(VIEWS.needs)).toBe(true);
  });
});

describe('bulk actions (QA04)', () => {
  it('splits eligible and ineligible with reasons', () => {
    const r = bulkEligibility(fixtures(), 'confirm');
    expect(r.eligible.map((o) => o.ref)).toEqual(['10482', '10481', '10480']);
    expect(r.reasons).toEqual({ payNotConfirmed: 1, alreadyFulfilled: 3 });
  });
  it('reports partial success and a retry only processes failures, never repeating successes', () => {
    const all = fixtures();
    const first = runBulk(all, ['10482', '10481', '10480', '10479'], 'confirm', (ref) => ref === '10481');
    expect(first.ok).toEqual(['10482', '10480']);
    expect(first.failed).toEqual(['10481']);
    expect(first.skipped).toEqual(['10479']);
    const retry = runBulk(first.orders, first.failed, 'confirm', () => false);
    expect(retry.ok).toEqual(['10481']);
    const again = runBulk(retry.orders, ['10482'], 'confirm', () => false);
    expect(again.ok).toEqual([]);
    expect(again.skipped).toEqual(['10482']);
  });
  it('counts packing slips once per successful print', () => {
    const r = runBulk(fixtures(), ['10482'], 'slips', () => false);
    expect(r.orders.find((o) => o.ref === '10482')!.slips).toBe(1);
  });
});

describe('partial fulfilment across two warehouses (QA03)', () => {
  it('validates per-line quantity against remaining and location stock', () => {
    const o = live('10483');
    expect(validatePicks(o, 'ryd', [2, 0, 0]).lines[0]).toBe('exceedsStock');
    expect(validatePicks(o, 'ryd', [3, 0, 0]).lines[0]).toBe('exceedsRemaining');
    expect(validatePicks(o, 'jed', [0, 1, 0]).lines[1]).toBe('exceedsStock');
    expect(validatePicks(o, 'ryd', [0, 0, 0]).empty).toBe(true);
  });
  it('ships part from each location with one reference per operation and separate states', () => {
    const o = live('10483');
    const failed = fulfilPartial(o, 'ryd', [1, 1, 0], true);
    expect(failed.fulfilments.length).toBe(0);
    const a = fulfilPartial(failed, 'ryd', [1, 1, 0], false);
    expect(a.fulfilments[0].ref).toBe('SIM-10483-1');
    expect(a.ful).toBe('partial');
    expect(a.ship).toBe('label');
    expect(remainingQty(a, 0)).toBe(1);
    expect(a.items[0].stock?.ryd).toBe(0);
    const b = fulfilPartial(a, 'jed', [1, 0, 1], false);
    expect(b.fulfilments[1].ref).toBe('SIM-10483-2');
    expect(b.ful).toBe('done');
    expect(fulfilPartial(b, 'jed', [1, 0, 0], false)).toBe(b);
  });
});

describe('refunds (QA06)', () => {
  const o = live('10475');
  it('quotes the amount from lines and optional shipping, VAT included', () => {
    const q = refundQuote(o, [0, 1], true, [0, 1]);
    expect(q.amount).toBe(9800 + 2500);
    expect(q.vat).toBe(Math.round((12300 * 15) / 115));
    expect(q.available).toBe(42000 + 19600 + 2500);
  });
  it('restock is separate but cannot exceed refunded units', () => {
    expect(refundQuote(o, [0, 1], false, [0, 0]).error).toBeNull();
    expect(refundQuote(o, [0, 1], false, [0, 2]).error).toBe('restock');
  });
  it('stays pending until the provider confirms, and pending amounts block a duplicate', () => {
    const a = requestRefund(o, [1, 2], true, [1, 2], 'ryd', 'damaged');
    expect(a.refunds[0].status).toBe('pending');
    expect(a.pay).toBe('paid');
    expect(refundable(a)).toBe(0);
    expect(requestRefund(a, [0, 1], false, [0, 0], 'ryd', 'x')).toBe(a);
    const done = settleRefund(a, 'RF-10475-1', true);
    expect(done.pay).toBe('refunded');
  });
  it('a partial confirmed refund marks partial; a failed one frees the amount again', () => {
    const a = requestRefund(o, [0, 1], false, [0, 0], 'ryd', 'size');
    expect(settleRefund(a, 'RF-10475-1', true).pay).toBe('partially_refunded');
    const f = settleRefund(a, 'RF-10475-1', false);
    expect(f.pay).toBe('paid');
    expect(refundable(f)).toBe(refundable(o));
  });
  it('refuses a refund on a failed payment', () => {
    const failed = fixtures().find((x) => x.ref === '10479')!;
    expect(refundable(failed)).toBe(0);
  });
});
