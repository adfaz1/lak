import { describe, expect, it } from 'vitest';
import { entitled, filterTxs, financeFixtures, moneyCards, planDiff, reconcile, STAFF_LIMIT } from './finance';

describe('payout reconciliation (QA11)', () => {
  const { txs, payouts } = financeFixtures();
  it('collected − fees − refunds ± adjustments = net, and matches the paid amount', () => {
    for (const p of payouts) {
      const r = reconcile(p, txs);
      expect(r.net).toBe(r.collected - r.fees - r.refunds + r.adjustments);
      if (p.status !== 'scheduled') expect(r.matches).toBe(true);
    }
  });
  it('counts every transaction in at most one payout', () => {
    const counted = payouts.reduce((s, p) => s + reconcile(p, txs).count, 0);
    expect(counted).toBe(txs.filter((t) => t.payoutId).length);
  });
  it('detects a mismatch instead of hiding it', () => {
    const p = { ...payouts.find((x) => x.status === 'paid')!, amount: 1 };
    expect(reconcile(p, txs).matches).toBe(false);
  });
  it('separates pending, available and paid-out money', () => {
    const c = moneyCards(txs, payouts);
    expect(c.gross).toBe(c.collected + c.pending);
    expect(c.pending).toBeGreaterThan(0);
    expect(c.available).toBeGreaterThan(0);
  });
  it('filters transactions by payout and type', () => {
    const p = payouts.find((x) => x.status === 'paid')!;
    const fees = filterTxs(txs, { payout: p.id, type: 'fee' });
    expect(fees.reduce((s, t) => s + t.amount, 0)).toBe(reconcile(p, txs).fees);
  });
});

describe('plans', () => {
  it('derives entitlements and differences from one registry', () => {
    expect(entitled('basic', 'coupons')).toBe(true);
    expect(entitled('basic', 'epay')).toBe(false);
    expect(entitled('pro', 'epay')).toBe(true);
    expect(planDiff('plus', 'basic').lost).toContain('epay');
    expect(planDiff('plus', 'pro').gained).toContain('segments');
    expect(STAFF_LIMIT.plus).toBe(3);
  });
});
