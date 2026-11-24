import { describe, expect, it } from 'vitest';
import { allOrders, total, type Order } from './domain';
import { applyStockEffects, initialLevels } from './inventory';
import {
  addNote, approveReturn, cancelBlock, cancelOrder, cancelPlan, collected, entries, exchangeReturn, fulfilEffects, inspectReturn, markDelivered, markShipped,
  openReturn, orderShip, payView, receiveReturn, refundReturn, rejectReturn, requestCancel, returnableQty, shipExchange, stamp, storeReturnState, takeHeld,
  validVatNo, zatcaTlv, type Actor,
} from './ops';

const ME: Actor = { name: 'سارة', role: 'owner' };
const T = 1_790_000_000_000;
const byRef = (ref: string) => allOrders().find((o) => o.ref === ref)!;
const held = (o: Order): Order => ({ ...o, items: o.items.map((it) => ({ ...it, reserved: { ryd: it.qty } })) });

describe('payment as the merchant reads it', () => {
  it('shows verification and cash on delivery truthfully, never as failed or paid', () => {
    const v = { ...byRef('10479'), payment: { method: 'card' as const, state: 'verifying' as const } };
    expect(payView(v)).toBe('verifying');
    expect(collected(v)).toBe(0);
    const cod = { ...byRef('10482'), payment: { method: 'cod' as const, state: 'cod_due' as const } };
    expect(payView(cod)).toBe('cod_due');
    expect(collected(cod)).toBe(0);
    expect(payView({ ...cod, ship: 'delivered' })).toBe('cod_collected');
    expect(payView(byRef('10479'))).toBe('failed');
  });
});

describe('cancellation', () => {
  it('previews the refund, released holds and voided labels, then cancels with a log line', () => {
    const o = held(byRef('10482'));
    const plan = cancelPlan(o);
    expect(plan.refund).toBe(total(o));
    expect(plan.units).toBe(3);
    const r = cancelOrder(o, 'Out of stock', ME, T);
    expect(r.order.cancelled).toMatchObject({ by: 'سارة', reason: 'Out of stock' });
    expect(r.order.refunds.at(-1)).toMatchObject({ amount: total(o), status: 'pending' });
    expect(r.order.log.at(-1)).toMatchObject({ kind: 'refundRequested', actor: 'سارة', at: T });
    expect(r.effects.every((e) => e.reserved < 0 && e.onHand === 0)).toBe(true);
    expect(r.order.items.every((it) => !Object.keys(it.reserved ?? {}).length)).toBe(true);
    expect(cancelBlock(r.order)).toBe('already');
  });
  it('refuses once a parcel is with the carrier, and needs a reason', () => {
    expect(cancelBlock(byRef('10477'))).toBe('shipped');
    expect(cancelOrder(byRef('10482'), '  ', ME, T).order.cancelled).toBeUndefined();
  });
  it('a label that was issued is voided and its units go back on the shelf; COD refunds nothing', () => {
    const o = { ...byRef('10478'), payment: { method: 'cod' as const, state: 'cod_due' as const }, fulfilments: [{ ref: 'SIM-10478-1', loc: 'ryd', qty: [2] }] };
    const p = cancelPlan(o);
    expect(p.refund).toBe(0);
    expect(p.voidLabels).toEqual(['SIM-10478-1']);
    expect(p.restock).toEqual([{ sku: 'SHL-SLK-01', loc: 'ryd', reserved: 0, onHand: 2 }]);
  });
  it('a shopper outside the window sends a request instead', () => {
    const o = requestCancel(byRef('10482'), 'changed my mind', T);
    expect(o.cancelRequest).toMatchObject({ state: 'open' });
    expect(o.activity?.at(-1)).toMatchObject({ kind: 'cancelRequested', actor: 'customer' });
  });
});

describe('stock effects', () => {
  it('fulfilling releases the hold and takes units off the shelf; cancelling releases holds', () => {
    const levels = initialLevels(['OUD-100']);
    const o = { ...byRef('10481'), items: [{ ...byRef('10481').items[0], reserved: { ryd: 1 } }] };
    const before = levels.find((l) => l.loc === 'ryd')!;
    const eff = fulfilEffects(o, 'ryd', [1]);
    expect(eff).toEqual([{ sku: 'OUD-100', loc: 'ryd', reserved: -1, onHand: -1 }]);
    const r = applyStockEffects(levels, eff, 'سارة', '10481', 'T');
    const after = r.levels.find((l) => l.loc === 'ryd')!;
    expect(after.onHand).toBe(before.onHand - 1);
    expect(after.reserved).toBe(before.reserved - 1);
    expect(r.log[0]).toMatchObject({ reason: 'fulfilled', delta: -1 });
    expect(takeHeld(o, 'ryd', [1]).items[0].reserved).toEqual({ ryd: 0 });
  });
  it('never takes reserved below zero', () => {
    const levels = initialLevels(['BAG-LTH-01']);
    const r = applyStockEffects(levels, [{ sku: 'BAG-LTH-01', loc: 'jed', reserved: -5, onHand: 0 }], 'x', 'r', 'T');
    expect(r.levels.find((l) => l.loc === 'jed')!.reserved).toBe(0);
    expect(r.log).toEqual([]);
  });
});

describe('shipped and delivered, per parcel', () => {
  const two: Order = { ...byRef('10483'), ful: 'done', ship: 'label', fulfilments: [{ ref: 'SIM-10483-1', loc: 'jed', qty: [2, 0, 1] }, { ref: 'SIM-10483-2', loc: 'ryd', qty: [0, 1, 0] }] };
  it('moves each parcel on its own; the order follows its least advanced parcel', () => {
    const a = markShipped(two, [0], ME, T, 'TRK1');
    expect(a.fulfilments[0]).toMatchObject({ ship: 'transit', tracking: 'TRK1' });
    expect(a.fulfilments[1].ship).toBe('label');
    expect(orderShip(a)).toBe('label');
    const b = markShipped(a, 'all', ME, T + 1);
    expect(b.ship).toBe('transit');
    const c = markDelivered(b, [0], ME, T + 2);
    expect(c.ship).toBe('transit');
    expect(markDelivered(c, 'all', ME, T + 3).ship).toBe('delivered');
    expect(c.activity?.filter((x) => x.kind === 'shipped')).toHaveLength(2);
  });
  it('collects cash on delivery when the last parcel arrives', () => {
    const o = { ...byRef('10477'), payment: { method: 'cod' as const, state: 'cod_due' as const } };
    const d = markDelivered(o, 'all', ME, T);
    expect(d.payment?.state).toBe('cod_collected');
    expect(d.activity?.at(-1)).toMatchObject({ kind: 'codCollected', amount: total(o) });
  });
});

describe('returns', () => {
  const o0 = byRef('10476'); // delivered bag
  const open = () => openReturn(o0, [{ idx: 0, qty: 1, reason: 'Damaged' }], { name: 'customer', role: 'customer' }, T, { source: 'store' });
  it('requested → approved → received → inspected → refunded, each step logged', () => {
    const { order, id } = open();
    expect(id).toBe('RMA-10476-1');
    expect(returnableQty(order, 0)).toBe(0);
    let o = approveReturn(order, id!, ME, T + 1);
    expect(o.returns![0].labelRef).toBe('RTN-10476-1');
    o = receiveReturn(o, id!, ME, T + 2);
    const ins = inspectReturn(o, id!, [1], [0], 'ryd', 'scratched', ME, T + 3);
    expect(ins.effects).toEqual([]);
    o = refundReturn(ins.order, id!, ME, T + 4);
    expect(o.returns![0].stage).toBe('refunded');
    expect(o.refunds.at(-1)).toMatchObject({ amount: 42000, status: 'pending' });
    expect(o.activity!.map((a) => a.kind)).toEqual(['returnRequested', 'returnApproved', 'returnReceived', 'returnInspected', 'returnRefunded']);
    expect(storeReturnState(o.returns![0], o.refunds)).toEqual({ state: 'closed', refund: 'pending' });
  });
  it('rejecting changes no money', () => {
    const { order, id } = open();
    const o = rejectReturn(order, id!, 'Outside window', ME, T);
    expect(o.refunds).toEqual(order.refunds);
    expect(o.returns![0].stage).toBe('rejected');
    expect(returnableQty(o, 0)).toBe(1);
  });
  it('restocking at inspection is its own decision', () => {
    const { order, id } = open();
    const o = receiveReturn(approveReturn(order, id!, ME, T), id!, ME, T);
    expect(inspectReturn(o, id!, [1], [1], 'jed', '', ME, T).effects).toEqual([{ sku: 'BAG-LTH-01', loc: 'jed', reserved: 0, onHand: 1 }]);
    expect(inspectReturn(o, id!, [2], [0], 'jed', '', ME, T).order).toBe(o);
  });
  it('exchange holds the replacement, refunds a cheaper difference, and ships once', () => {
    const base = byRef('10476');
    let o = openReturn(base, [{ idx: 0, qty: 1, reason: 'size' }], ME, T).order;
    const id = o.returns![0].id;
    o = inspectReturn(receiveReturn(approveReturn(o, id, ME, T), id, ME, T), id, [1], [1], 'ryd', '', ME, T).order;
    const x = exchangeReturn(o, id, { sku: 'BAG-LTH-02', name: { ar: 'حقيبة', en: 'Bag' }, unit: 40000, qty: 1, loc: 'ryd' }, ME, T);
    expect(x.effects).toEqual([{ sku: 'BAG-LTH-02', loc: 'ryd', reserved: 1, onHand: 0 }]);
    expect(x.order.returns![0].exchange?.diff).toBe(-2000);
    expect(x.order.refunds.at(-1)).toMatchObject({ amount: 2000, status: 'pending' });
    const s = shipExchange(x.order, id, ME, T);
    expect(s.effects).toEqual([{ sku: 'BAG-LTH-02', loc: 'ryd', reserved: -1, onHand: -1 }]);
    expect(shipExchange(s.order, id, ME, T).effects).toEqual([]);
  });
});

describe('log with who and when', () => {
  it('stamps new domain log lines and merges activity in time order; notes add a line', () => {
    const o = byRef('10482');
    const after = { ...o, log: [...o.log, { when: 'now' as const, who: 'you' as const, kind: 'confirmed' as const }] };
    const s = stamp(o, after, ME, T);
    expect(s.log.at(-1)).toMatchObject({ actor: 'سارة', role: 'owner', at: T });
    const n = addNote(s, 'Call before delivery', ME, T + 5);
    const e = entries(n, T + 10);
    expect(e.map((x) => (x.source === 'log' ? x.e.kind : x.a.kind))).toEqual(['created', 'confirmed', 'noteAdded']);
  });
});

describe('ZATCA QR and VAT number', () => {
  it('encodes the five phase-1 TLV fields in base64', () => {
    const b = atob(zatcaTlv('Shop', '310123456700003', '2026-11-24T12:00:00Z', 11500, 1500));
    expect(b.charCodeAt(0)).toBe(1);
    expect(b.slice(2, 6)).toBe('Shop');
    expect(b).toContain('115.00');
    expect(b).toContain('15.00');
  });
  it('validates 15-digit numbers starting and ending with 3, Arabic digits accepted', () => {
    expect(validVatNo('310123456700003')).toBe(true);
    expect(validVatNo('٣١٠١٢٣٤٥٦٧٠٠٠٠٣')).toBe(true);
    expect(validVatNo('210123456700003')).toBe(false);
  });
});
