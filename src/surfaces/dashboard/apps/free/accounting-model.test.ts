import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP, byAccount, journal, journalCsv, mapErrors, monthRange, nextRun, totals } from './accounting-model';
import { allOrders, total, vatIncluded } from '../../../merchant/domain';
import { financeFixtures } from '../../../merchant/finance';

const NOW = Date.UTC(2026, 10, 26, 9);
const orders = allOrders();
const fin = financeFixtures(orders);

describe('accounting journal', () => {
  const lines = journal(orders, fin.txs, fin.payouts, '2026-11-01', '2026-11-26', NOW);
  it('balances per entry and in total', () => {
    const t = totals(lines);
    expect(lines.length).toBeGreaterThan(0);
    expect(t.balanced).toBe(true);
    expect(t.debit).toBe(t.credit);
  });
  it('splits a sale into revenue, shipping and VAT that add up to the total', () => {
    const o = { ...orders[0], placedAt: NOW, discount: 2000 };
    const ls = journal([o], [], [], '2026-11-26', '2026-11-26', NOW);
    const get = (k: string, side: 'debit' | 'credit') => ls.filter((l) => l.key === k).reduce((t, l) => t + l[side], 0);
    expect(get('clearing', 'debit')).toBe(total(o));
    expect(get('vat', 'credit')).toBe(vatIncluded(o));
    expect(get('sales', 'credit') + get('shipping', 'credit') + get('vat', 'credit') - get('discounts', 'debit')).toBe(total(o));
  });
  it('skips cancelled and unpaid orders and other periods', () => {
    const o = { ...orders[0], placedAt: NOW };
    expect(journal([{ ...o, pay: 'failed' as const }], [], [], '2026-11-01', '2026-11-30', NOW)).toEqual([]);
    expect(journal([{ ...o, cancelled: { at: 0, by: '', role: '', reason: '' } }], [], [], '2026-11-01', '2026-11-30', NOW)).toEqual([]);
    expect(journal([o], [], [], '2026-10-01', '2026-10-31', NOW)).toEqual([]);
  });
  it('records payouts to the bank, fees and refunds', () => {
    const keys = byAccount(lines).map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['bank', 'fees', 'clearing', 'sales', 'vat']));
    const o = { ...orders[0], placedAt: NOW, refunds: [{ id: 'RF1', amount: 11500, qty: [], shipping: 0, restock: [], loc: 'ryd' as never, reason: '', status: 'confirmed' as const }] };
    const r = journal([o], [], [], '2026-11-26', '2026-11-26', NOW).filter((l) => l.entry.startsWith('R-'));
    expect(r.map((l) => [l.key, l.debit, l.credit])).toEqual([['returns', 10000, 0], ['vat', 1500, 0], ['clearing', 0, 11500]]);
  });
  it('writes a CSV with the merchant’s accounts', () => {
    const csv = journalCsv(lines.slice(0, 2), { ...DEFAULT_MAP, clearing: { code: 'X1', name: 'Clearing, provider' } });
    expect(csv.split('\n')[0]).toBe('﻿Date,Entry,Account code,Account name,Debit,Credit,Memo');
    expect(csv).toContain('"Clearing, provider"');
  });
  it('validates the chart and schedules', () => {
    expect(mapErrors({ ...DEFAULT_MAP, vat: { code: '', name: 'x' } })).toEqual([{ key: 'vat', error: 'code' }]);
    expect(monthRange('2026-11-26', -1)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthRange('2026-11-26', 0)).toEqual({ from: '2026-11-01', to: '2026-11-26' });
    expect(nextRun('weekly', '2026-11-26')).toBe('2026-11-30');
    expect(nextRun('monthly', '2026-11-26')).toBe('2026-12-01');
    expect(nextRun('off', '2026-11-26')).toBeNull();
  });
});
