import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { initialLevels, transferFixtures, withStateFixtures, type Level } from '../../merchant/inventory';
import { allOrders } from '../../merchant/domain';
import { adjustPreview, compositionBar, levelRows, levelsCsv, nextMoveId, readCols, readStateFilter, reservedBy, skuInfo, thresholdPreview, transfersFor } from './model';

const products = productFixtures();
const info = skuInfo(products);
const levels = withStateFixtures(initialLevels(products.filter((p) => p.type !== 'digital').flatMap(skusOf)));
const transfers = transferFixtures();

describe('stock states on the inventory screen', () => {
  it('filters rows by state and keeps every state on the row', () => {
    const held = levelRows(levels, info, { q: '', loc: '', state: 'held' }, transfers);
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((r) => r.states.awaitingPay + r.states.unavailable + r.states.safety > 0)).toBe(true);
    const transit = levelRows(levels, info, { q: '', loc: '', state: 'transit' }, transfers);
    expect(transit.map((r) => r.key).sort()).toEqual(['SHL-SLK-01@jed', 'SHL-SLK-01@ryd']);
    expect(transit.find((r) => r.loc === 'ryd')!.states.outgoing).toBe(4);
    expect(readStateFilter('safety')).toBe('safety');
    expect(readStateFilter('nope')).toBe('');
    expect(readCols('all')).toBe('all');
    expect(readCols(null)).toBe('essential');
  });
  it('previews adjustments and reorder points with every hold counted', () => {
    const l: Level = { sku: 'X', loc: 'ryd', onHand: 10, reserved: 1, incoming: 0, version: 1, threshold: 5, safety: 3, unavailable: 1 };
    expect(adjustPreview(l, '-2').available).toEqual([5, 3]);
    expect(thresholdPreview([l], 4)).toMatchObject({ leaveLow: 1 });
  });
  it('exports the new states as extra columns after the existing ones', () => {
    const csv = levelsCsv(levelRows(levels, info, { q: 'WLT-LTH-01', loc: 'ryd' }, transfers), (id) => id);
    expect(csv[0].slice(0, 10)).toEqual(['sku', 'product', 'variant', 'location_id', 'location', 'on_hand', 'reserved', 'available', 'incoming', 'reorder_point']);
    expect(csv[0].slice(10)).toEqual(['awaiting_payment', 'unavailable', 'safety_reserve', 'outgoing']);
    expect(csv[1].slice(10, 13)).toEqual([1, 0, 2]);
  });
  it('names the orders and transfers behind reserved, incoming and outgoing', () => {
    const order = { ...allOrders()[0], items: [{ ...allOrders()[0].items[0], sku: 'X', reserved: { ryd: 2 } }] };
    expect(reservedBy([order], 'X', 'ryd')).toEqual([{ ref: order.ref, qty: 2 }]);
    expect(reservedBy([{ ...order, cancelled: { at: 0, by: '', role: '', reason: '' } }], 'X', 'ryd')).toEqual([]);
    expect(transfersFor(transfers, 'SHL-SLK-01', 'ryd').outgoing).toEqual([{ id: 'TR-1001', qty: 4 }]);
    expect(transfersFor(transfers, 'SHL-SLK-01', 'jed').incoming).toEqual([{ id: 'TR-1001', qty: 4 }]);
  });
  it('draws the on-hand composition and numbers state moves', () => {
    const bar = compositionBar({ onHand: 10, available: 5, reserved: 2, awaitingPay: 1, unavailable: 1, safety: 1, incoming: 3, outgoing: 0 });
    expect(bar.map((b) => b.part)).toEqual(['available', 'reserved', 'awaitingPay', 'unavailable', 'safety']);
    expect(bar.reduce((s, b) => s + b.pct, 0)).toBeCloseTo(100, 0);
    expect(compositionBar({ onHand: 0, available: 0, reserved: 0, awaitingPay: 0, unavailable: 0, safety: 0, incoming: 2, outgoing: 0 })).toEqual([]);
    expect(nextMoveId([])).toBe('ST-101');
    expect(nextMoveId([{ id: 'ST-140', sku: 'X', loc: 'ryd', delta: 0, before: 0, after: 0, reason: 'other', who: 'You' }])).toBe('ST-141');
  });
});
