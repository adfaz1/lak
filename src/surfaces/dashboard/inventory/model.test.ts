import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { adjust, bumpBySomeoneElse, closeWithDiscrepancy, historyFixtures, initialLevels, levelOf, receiveTransfer, sendTransfer, transferFixtures } from '../../merchant/inventory';
import {
  adjustPreview, coverFor, discrepancyLog, levelRows, newTransfer, nextAdjId, nextTransferId, parseDelta, parseReceive, readTab, receiveAll, receiveLog,
  sendLog, skuInfo, stageOf, tabCounts, units,
} from './model';

const products = productFixtures();
const levels = initialLevels(products.flatMap(skusOf));
const info = skuInfo(products);

describe('levels', () => {
  it('names each SKU with its product and variant', () => {
    expect(info.get('ABY-LIN-BLA-M')).toMatchObject({ productId: 'p1', variant: { ar: 'أسود / M', en: 'Black / M' } });
    expect(info.get('OUD-100')!.variant).toEqual({ ar: '', en: '' });
  });
  it('filters by warehouse and search, and puts the emptiest first on the low view', () => {
    const r = levelRows(levels, info, { q: 'oud', loc: '' });
    expect(r.map((x) => x.key)).toEqual(['OUD-100@ryd', 'OUD-100@jed']);
    expect(r[0].available).toBe(3);
    expect(levelRows(levels, info, { q: '', loc: 'jed' }).every((x) => x.loc === 'jed')).toBe(true);
    const low = levelRows(levels, info, { q: '', loc: '', lowOnly: true });
    expect(low.every((x) => x.low)).toBe(true);
    for (let i = 1; i < low.length; i++) expect(low[i - 1].available).toBeLessThanOrEqual(low[i].available);
  });
  it('estimates cover only with enough history', () => {
    const h = historyFixtures();
    expect(coverFor(levels, 'OUD-100', h).kind).toBe('days');
    expect(coverFor(levels, 'COF-SET-01', h).kind).toBe('insufficient');
    expect(coverFor(levels, 'BAG-LTH-01', h).kind).toBe('noSales');
  });
  it('counts open transfers and low rows for the tabs', () => {
    const c = tabCounts(levels, transferFixtures(), []);
    expect(c.transfers).toBe(2);
    expect(c.low).toBeGreaterThan(0);
    expect(readTab('nope')).toBe('levels');
  });
});

describe('adjustments', () => {
  const seen = levelOf(levels, 'OUD-100', 'ryd')!; // on hand 4, reserved 1
  it('reads signed whole numbers in Latin or Arabic digits', () => {
    expect(parseDelta('+5')).toBe(5);
    expect(parseDelta('−3')).toBe(-3);
    expect(parseDelta('٢')).toBe(2);
    expect(parseDelta('1.5')).toBeNull();
  });
  it('previews on hand and available, flags oversell and refuses below zero', () => {
    expect(adjustPreview(seen, '-1')).toMatchObject({ ready: true, onHand: [4, 3], available: [3, 2], oversold: false });
    expect(adjustPreview(seen, '-4')).toMatchObject({ ready: true, oversold: true });
    expect(adjustPreview(seen, '-5')).toMatchObject({ ready: false, belowZero: true });
    expect(adjustPreview(seen, '0').ready).toBe(false);
  });
  it('detects a colleague change through the version the form saw', () => {
    const bumped = bumpBySomeoneElse(levels, 'OUD-100', 'ryd', 3);
    expect(adjust(bumped, 'OUD-100', 'ryd', 1, 'count', seen.version, 'You', 'A').error).toBe('conflict');
  });
  it('numbers adjustments after the last one', () => {
    expect(nextAdjId([{ id: 'ADJ-201', sku: 'x', loc: 'ryd', delta: 1, before: 0, after: 1, reason: 'count', who: 'a' }])).toBe('ADJ-202');
  });
});

describe('transfers', () => {
  const [draft, sent] = transferFixtures();
  it('numbers and prefills a new draft from a low-stock row', () => {
    expect(nextTransferId(transferFixtures())).toBe('TR-1003');
    expect(newTransfer(transferFixtures(), 'OUD-100', 'jed')).toMatchObject({ from: 'ryd', to: 'jed', lines: [{ sku: 'OUD-100', qty: 1 }] });
  });
  it('maps states to the stepper', () => {
    expect(stageOf('draft').index).toBe(0);
    expect(stageOf('partial').index).toBe(2);
    expect(stageOf('closed').index).toBe(3);
  });
  it('parses receipts and refuses more than outstanding', () => {
    expect(parseReceive(['2'], sent)).toEqual({ qty: [2], bad: [] });
    expect(parseReceive(['9'], sent).bad).toEqual([0]);
    expect(parseReceive([''], sent).qty).toEqual([0]);
    expect(receiveAll(sent)).toEqual(['4']);
  });
  it('logs send, receipt and discrepancy without doubling units', () => {
    const s = sendTransfer(levels, draft);
    const out = sendLog(s.transfer, s.levels, 'You');
    expect(out.map((x) => [x.sku, x.delta, x.reason])).toEqual([['ABY-LIN-BLA-M', -2, 'transferOut'], ['COF-SET-01', -1, 'transferOut']]);
    expect(out[0].before - out[0].after).toBe(2);
    const r = receiveTransfer(s.levels, s.transfer, [1, 0]);
    const inn = receiveLog(s.transfer, [1, 0], r.levels, 'You');
    expect(inn).toHaveLength(1);
    expect(inn[0]).toMatchObject({ sku: 'ABY-LIN-BLA-M', delta: 1, loc: 'ryd' });
    const c = closeWithDiscrepancy(r.levels, r.transfer, 'Lost in transit');
    const d = discrepancyLog(c.transfer, c.levels, 'You');
    expect(d.map((x) => x.sku)).toEqual(['ABY-LIN-BLA-M', 'COF-SET-01']);
    expect(d.every((x) => x.delta === 0 && x.note === 'Lost in transit')).toBe(true);
    expect(units(c.transfer)).toEqual({ qty: 3, received: 1 });
  });
});
