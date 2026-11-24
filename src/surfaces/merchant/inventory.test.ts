import { describe, expect, it } from 'vitest';
import {
  adjust, available, bumpBySomeoneElse, closeWithDiscrepancy, coverage, initialLevels, levelOf, receiveTransfer, sendTransfer,
  transferFixtures, validateTransferDraft,
} from './inventory';

const skus = ['ABY-LIN-BLA-M', 'OUD-100', 'COF-SET-01', 'SHL-SLK-01'];

describe('levels', () => {
  it('available = on hand − reserved', () => {
    const l = levelOf(initialLevels(skus), 'OUD-100', 'ryd')!;
    expect(available(l)).toBe(3);
  });
});

describe('adjustments', () => {
  it('needs a reason and a non-zero change, and never goes below zero', () => {
    const lv = initialLevels(skus);
    expect(adjust(lv, 'OUD-100', 'ryd', 2, '', 1, 'me', 'A1').error).toBe('reason');
    expect(adjust(lv, 'OUD-100', 'ryd', 0, 'count', 1, 'me', 'A1').error).toBe('zero');
    expect(adjust(lv, 'OUD-100', 'ryd', -5, 'damaged', 1, 'me', 'A1').error).toBe('belowZero');
    const ok = adjust(lv, 'OUD-100', 'ryd', -4, 'damaged', 1, 'me', 'A1');
    expect(ok.log).toMatchObject({ before: 4, after: 0, delta: -4, reason: 'damaged' });
    expect(ok.oversold).toBe(true);
  });
  it('refuses to overwrite a level someone else changed', () => {
    const lv = bumpBySomeoneElse(initialLevels(skus), 'OUD-100', 'ryd', 5);
    const r = adjust(lv, 'OUD-100', 'ryd', 1, 'count', 1, 'me', 'A1');
    expect(r.error).toBe('conflict');
    expect(r.current?.onHand).toBe(9);
    expect(r.levels).toBe(lv);
  });
});

describe('transfers', () => {
  const [draft] = transferFixtures();
  it('blocks sending more than is available at the source', () => {
    const lv = initialLevels(skus);
    expect(validateTransferDraft(lv, { ...draft, lines: [{ sku: 'COF-SET-01', qty: 5, received: 0 }] })).toEqual({ error: 'insufficient', short: ['COF-SET-01'] });
    expect(validateTransferDraft(lv, { ...draft, to: 'jed' }).error).toBe('sameLoc');
  });
  it('draft → sent → partial → closed with discrepancy, never doubling units', () => {
    const lv = initialLevels(skus);
    const before = levelOf(lv, 'ABY-LIN-BLA-M', 'jed')!.onHand;
    const s = sendTransfer(lv, draft);
    expect(s.transfer.status).toBe('sent');
    expect(levelOf(s.levels, 'ABY-LIN-BLA-M', 'jed')!.onHand).toBe(before - 2);
    expect(levelOf(s.levels, 'ABY-LIN-BLA-M', 'ryd')!.incoming).toBe(2);
    expect(sendTransfer(s.levels, s.transfer).error).toBe('state');
    const r = receiveTransfer(s.levels, s.transfer, [1, 1]);
    expect(r.transfer.status).toBe('partial');
    expect(receiveTransfer(r.levels, r.transfer, [2, 0]).error).toBe('qty');
    const ryd = levelOf(r.levels, 'ABY-LIN-BLA-M', 'ryd')!;
    expect(ryd.onHand).toBe(3);
    expect(ryd.incoming).toBe(1);
    const c = closeWithDiscrepancy(r.levels, r.transfer, 'box damaged');
    expect(c.transfer.status).toBe('closed');
    expect(c.transfer.discrepancy).toEqual([{ sku: 'ABY-LIN-BLA-M', units: 1 }]);
    expect(levelOf(c.levels, 'ABY-LIN-BLA-M', 'ryd')!.incoming).toBe(0);
  });
});

describe('coverage', () => {
  it('is shown only with at least 14 days of history', () => {
    expect(coverage(6, { sku: 'x', days: 60, sold: 90 })).toEqual({ kind: 'days', days: 4, perDay: 1.5 });
    expect(coverage(6, { sku: 'x', days: 6, sold: 4 })).toEqual({ kind: 'insufficient', days: 6 });
    expect(coverage(6, undefined).kind).toBe('insufficient');
    expect(coverage(6, { sku: 'x', days: 30, sold: 0 }).kind).toBe('noSales');
  });
});
