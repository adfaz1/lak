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
