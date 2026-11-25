import { describe, expect, it } from 'vitest';
import { creditFixture, topUp } from '../../merchant/commercial';
import { creditWorkItem } from './credit-work';

describe('LAK credit work item', () => {
  it('appears below the alert and opens the credit page', () => {
    expect(creditWorkItem(creditFixture())).toBeNull();
    const s = topUp(creditFixture(), 2000, 'me');
    const empty = creditWorkItem({ ...s, entries: [{ ...s.entries[0], balance: 0 }] });
    expect(empty?.severity).toBe(3);
    expect(empty?.action).toEqual({ section: 'finance', query: { tab: 'billing', part: 'credit' } });
    expect(creditWorkItem(topUp(creditFixture(), 2000, 'me'))?.severity).toBe(2);
    expect(creditWorkItem(topUp(creditFixture(), 50000, 'me'))).toBeNull();
  });
});
