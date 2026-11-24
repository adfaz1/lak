import { describe, expect, it } from 'vitest';
import { allOrders, VIEWS } from '../../merchant/domain';
import { historyFixtures, initialLevels, type Level } from '../../merchant/inventory';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { financeFixtures } from '../../merchant/finance';
import { appFixtures, domainFixture, providerFixtures } from '../../merchant/workspace';
import { automationFixtures, runFixtures } from '../../merchant/growth';
import {
  canWork, emptyQueueState, forRole, markDone, rank, reopen, settlementItems, snooze, snoozeUntil, split, stockItems, workQueue, type WorkInput,
} from './model';

const orders = allOrders();
const levels = initialLevels(productFixtures().filter((p) => p.type !== 'digital').flatMap(skusOf));
const fin = financeFixtures(orders);
const input: WorkInput = { orders, levels, history: historyFixtures(), payouts: fin.payouts, txs: fin.txs, apps: appFixtures(), providers: providerFixtures(), domain: domainFixture(), runs: runFixtures(), automations: automationFixtures() };
const q = workQueue(input);

describe('work queue', () => {
  it('gathers orders, stock, integrations and failed automations from store data', () => {
    const kinds = new Set(q.map((x) => x.kind));
    for (const k of ['late', 'payfail', 'fulfil', 'stock', 'integration', 'automation']) expect(kinds.has(k as never)).toBe(true);
  });
  it('is ranked by severity, then money', () => {
    for (let i = 1; i < q.length; i++) {
      expect(q[i - 1].severity >= q[i].severity).toBe(true);
      if (q[i - 1].severity === q[i].severity) expect(q[i - 1].money >= q[i].money).toBe(true);
    }
  });
  it('counts late orders once and matches the orders domain', () => {
    expect(q.find((x) => x.kind === 'late')!.orders + q.find((x) => x.kind === 'fulfil')!.orders).toBe(orders.filter(VIEWS.needs).length);
  });
  it('lists broken apps and providers needing action, each opening the screen that fixes it', () => {
    const ints = q.filter((x) => x.kind === 'integration');
    expect(ints.map((x) => x.id).sort()).toEqual(['int-app-rev', 'int-app-wa', 'int-pay-stcpay']);
    expect(ints.find((x) => x.id === 'int-app-rev')!.action).toEqual({ section: 'apps', path: 'rev' });
    expect(ints.find((x) => x.id === 'int-app-rev')!.severity).toBe(3);
  });
  it('turns failed automation runs into one item per automation', () => {
    const a = q.filter((x) => x.kind === 'automation');
    expect(a).toHaveLength(1);
    expect(a[0].action.query).toEqual({ tab: 'runs', outcome: 'failed', automation: 'AU-11' });
  });
  it('is empty for an empty store', () => {
    expect(workQueue({ ...input, orders: [], levels: [], payouts: [], txs: [], apps: [], providers: [], runs: [], domain: { ...input.domain, state: 'none' } })).toEqual([]);
  });
});

describe('stock items', () => {
  const L = (sku: string, loc: 'ryd' | 'jed', onHand: number, threshold = 3): Level => ({ sku, loc, onHand, reserved: 0, incoming: 0, version: 1, threshold });
  it('estimates sales at risk over 7 days only with enough history', () => {
    // OUD-100: 90 sold in 60 days = 1.5/day → 11 units for 7 days; 2 available → 9 short × latest price.
    const [it] = stockItems([L('OUD-100', 'ryd', 2), L('OUD-100', 'jed', 0)], historyFixtures(), orders);
    expect(it.facts.short).toBe(9);
    expect(it.money).toBe(9 * 12900);
    expect(it.moneyKind).toBe('lost');
    // COF-SET-01 has 6 days of history: no estimate.
    const [cof] = stockItems([L('COF-SET-01', 'ryd', 0), L('COF-SET-01', 'jed', 1)], historyFixtures(), orders);
    expect(cof.money).toBe(0);
    expect(cof.facts.history).toBe('insufficient');
  });
  it('proposes a transfer when the other warehouse can spare units', () => {
    const [it] = stockItems([L('BAG-LTH-01', 'ryd', 1), L('BAG-LTH-01', 'jed', 12)], historyFixtures(), orders);
    expect(it.action).toEqual({ section: 'inventory', path: 'transfers/new', query: { sku: 'BAG-LTH-01', to: 'ryd' } });
    const [none] = stockItems([L('BAG-LTH-01', 'ryd', 1), L('BAG-LTH-01', 'jed', 3)], historyFixtures(), orders);
    expect(none.action).toEqual({ section: 'inventory', query: { tab: 'low', q: 'BAG-LTH-01' } });
  });
});

describe('settlement items', () => {
  it('flags a payout whose transfer differs from its statement, and one in transit too long', () => {
    const p = fin.payouts.map((x) => (x.id === 'PO-2611-02' ? { ...x, amount: (x.amount ?? 0) + 500 } : x));
    const items = settlementItems(p, fin.txs, '2026-11-30');
    expect(items.find((x) => x.id === 'payout-diff-PO-2611-02')!.money).toBe(500);
    expect(items.some((x) => x.id === 'payout-late-PO-2611-03')).toBe(true);
    expect(settlementItems(fin.payouts, fin.txs, '2026-11-24')).toEqual([]);
  });
});

describe('role awareness', () => {
  it('marketing never sees payment, refund or order items', () => {
    const m = forRole('marketing', q);
    expect(m.some((x) => x.page === 'orders')).toBe(false);
    expect(m.every((x) => x.kind === 'automation')).toBe(true);
  });
  it('fulfilment sees fulfilment and stock but not payments, apps or provider settings', () => {
    const f = forRole('fulfilment', q);
    expect(f.some((x) => x.kind === 'late')).toBe(true);
    expect(f.some((x) => x.kind === 'stock')).toBe(true);
    expect(f.some((x) => x.kind === 'payfail' || x.kind === 'integration')).toBe(false);
  });
  it('finance sees failed payments but not fulfilment', () => {
    const f = forRole('finance', q);
    expect(f.some((x) => x.kind === 'payfail')).toBe(true);
    expect(f.some((x) => x.kind === 'fulfil' || x.kind === 'late')).toBe(false);
  });
  it('the owner sees everything', () => {
    expect(q.every((x) => canWork('owner', x))).toBe(true);
  });
});

describe('snooze and done', () => {
  const item = q[0];
  const now = Date.UTC(2026, 10, 24, 9);
  it('done holds until the situation changes, and is logged', () => {
    const st = markDone(emptyQueueState(), item, 'سارة', now);
    expect(split(st, [item], now).done).toHaveLength(1);
    expect(st.log[0]).toMatchObject({ who: 'سارة', act: 'done', item: item.id });
    expect(split(st, [{ ...item, fingerprint: `${item.fingerprint},new` }], now).open).toHaveLength(1);
  });
  it('snooze holds until its time, reopen brings it back', () => {
    const until = snoozeUntil('1h', new Date(now));
    const st = snooze(emptyQueueState(), item, until, 'فيصل', now);
    expect(split(st, [item], now).snoozed).toHaveLength(1);
    expect(split(st, [item], until + 1).open).toHaveLength(1);
    const back = reopen(st, item, 'فيصل', now);
    expect(split(back, [item], now).open).toHaveLength(1);
    expect(back.log.map((r) => r.act)).toEqual(['reopen', 'snooze']);
  });
  it('"tomorrow" is 08:00 the next day', () => {
    const t = new Date(snoozeUntil('tomorrow', new Date(2026, 10, 24, 22, 15)));
    expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([25, 8, 0]);
  });
  it('rank is stable for equal items', () => {
    expect(rank([...q].reverse()).map((x) => x.id)).toEqual(q.map((x) => x.id));
  });
});
