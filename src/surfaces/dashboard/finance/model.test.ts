import { describe, expect, it } from 'vitest';
import { financeFixtures } from '../../merchant/finance';
import { csvName, filterTransactions, hasFilter, netOf, nextPayout, parseTab, planImpact, readFilter, signedAmount, statement, txCsv, txQuery, txTimeline } from './model';

const { txs, payouts } = financeFixtures();

describe('URL state', () => {
  it('defaults to payouts and ignores unknown tabs', () => {
    expect(parseTab(null)).toBe('payouts');
    expect(parseTab('billing')).toBe('billing');
    expect(parseTab('overview')).toBe('payouts');
  });
  it('drops unknown filter values instead of showing an empty table', () => {
    const f = readFilter(new URLSearchParams('payout=PO-X&type=bonus&status=available&q=104'), payouts);
    expect(f).toEqual({ payout: '', type: '', status: 'available', q: '104' });
    expect(hasFilter(f)).toBe(true);
    expect(hasFilter(readFilter(new URLSearchParams(''), payouts))).toBe(false);
  });
  it('round-trips filters through the query', () => {
    const f = { payout: payouts[1].id, type: 'fee' as const, status: '' as const, q: '' };
    const q = new URLSearchParams(Object.entries(txQuery(f)).filter(([, v]) => v) as [string, string][]);
    expect(q.get('tab')).toBe('transactions');
    expect(readFilter(q, payouts)).toEqual(f);
  });
});

describe('payout statement (QA11)', () => {
  it('lines add up to the net and the net equals the transferred amount', () => {
    for (const p of payouts) {
      const s = statement(p, txs);
      const sum = s.lines.reduce((a, l) => a + (l.sign === '+' ? l.amount : -l.amount), 0);
      expect(sum).toBe(s.net);
      if (p.status === 'scheduled') expect(s.transferred).toBeNull();
      else { expect(s.transferred).toBe(s.net); expect(s.matches).toBe(true); }
    }
  });
  it('each line equals the total of the transactions it links to', () => {
    for (const p of payouts) {
      for (const l of statement(p, txs).lines) {
        const linked = filterTransactions(txs, { payout: p.id, type: l.type, status: '', q: '' });
        expect(linked.length).toBe(l.count);
        expect(Math.abs(linked.reduce((a, t) => a + signedAmount(t), 0))).toBe(l.amount);
      }
    }
  });
  it('a negative adjustment is shown as a deduction', () => {
    const p = payouts.find((x) => x.id === 'PO-2611-01')!;
    const adj = statement(p, txs).lines.find((l) => l.type === 'adjustment')!;
    expect(adj).toMatchObject({ sign: '−', amount: 1500, count: 1 });
  });
  it('the next payout is the earliest scheduled one', () => {
    expect(nextPayout(payouts)?.id).toBe('PO-2611-04');
    expect(nextPayout([])).toBeNull();
  });
});

describe('transactions', () => {
  it('signs sales in, fees and refunds out, adjustments as recorded', () => {
    expect(signedAmount({ ...txs[0], type: 'sale', amount: 100 })).toBe(100);
    expect(signedAmount({ ...txs[0], type: 'fee', amount: 100 })).toBe(-100);
    expect(signedAmount({ ...txs[0], type: 'refund', amount: 100 })).toBe(-100);
    expect(signedAmount({ ...txs[0], type: 'adjustment', amount: -100 })).toBe(-100);
    const p = payouts.find((x) => x.status === 'paid')!;
    expect(netOf(txs.filter((t) => t.payoutId === p.id))).toBe(statement(p, txs).net);
  });
  it('keeps sale, settlement and payout dates apart', () => {
    const t = txs.find((x) => x.status === 'paid_out')!;
    const tl = txTimeline(t, payouts);
    expect(tl.sale).toBe(t.saleDay);
    expect(tl.settled).toBe(t.settledDay);
    expect(tl.payoutDate).toBe(payouts.find((p) => p.id === t.payoutId)!.date);
    const pending = txs.find((x) => x.status === 'pending')!;
    expect(txTimeline(pending, payouts)).toMatchObject({ settled: null, payout: null });
  });
});

describe('CSV export', () => {
  it('exports exactly the filtered rows with signed SAR amounts and no customer data', () => {
    const rows = filterTransactions(txs, { payout: '', type: 'fee', status: '', q: '' });
    const csv = txCsv(rows);
    const lines = csv.trim().split('\r\n');
    expect(lines.length).toBe(rows.length + 1);
    expect(lines[0]).toBe('transaction_id,type,order,provider,amount_sar,currency,status,sale_date,settled_date,payout,note');
    expect(lines[1].split(',')[4].startsWith('-')).toBe(true);
    expect(csv).not.toMatch(/@|Alotaibi|العتيبي/);
  });
  it('writes amounts without thousands separators so spreadsheets read them as numbers', () => {
    const big = { ...txs[0], type: 'sale' as const, amount: 123456789 };
    expect(txCsv([big]).split('\r\n')[1].split(',')[4]).toBe('1234567.89');
  });
  it('names the file after its filters', () => {
    expect(csvName({ payout: 'PO-2611-02', type: 'fee', status: '', q: '' })).toBe('lak-transactions-PO-2611-02-fee-2026-11-24.csv');
    expect(csvName({ payout: '', type: '', status: '', q: '' })).toBe('lak-transactions-2026-11-24.csv');
  });
});

describe('plan change impact (QA18)', () => {
  it('lists gains on upgrade and losses on downgrade', () => {
    const up = planImpact('plus', 'pro', 2);
    expect(up.direction).toBe('upgrade');
    expect(up.gained).toContain('segments');
    expect(up.lost).toEqual([]);
    const down = planImpact('plus', 'basic', 3);
    expect(down.direction).toBe('downgrade');
    expect(down.lost).toContain('epay');
  });
  it('reports seats above the new limit, and none for unlimited plans', () => {
    expect(planImpact('plus', 'basic', 3).seatsOver).toBe(2);
    expect(planImpact('plus', 'pro', 30).seatsOver).toBe(0);
  });
});
