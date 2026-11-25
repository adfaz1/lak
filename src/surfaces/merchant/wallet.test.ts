import { describe, expect, it } from 'vitest';
import { parseMoney, productFixtures } from './catalog';
import { allOrders, type Order } from './domain';
import { customerFixtures } from './workspace';
import {
  adjustWallet, bulkCredit, cashbackAmount, cashbackFixtures, cashbackRows, expiringSoon, offerResults, refundToWallet, reverseBatch, spendWallet, syncCashback, syncExpiry,
  unspendWallet, validateAdjust, validateOffer, validateSettings, emptyOffer, settingsDraft, walletBalance, walletFixtures, walletLiability, walletLots, walletPaid,
  walletSettingsFixture, walletUse, type WalletTxn,
} from './wallet';

const T = '2026-11-24';
const ctx = { by: 'test', today: T, seed: 1 };
const credit = (id: string, amount: number, expires: string | null, at = '2026-11-01'): WalletTxn => ({ id, customerId: 'C', kind: 'credit', amount, reason: 'r', by: 'x', at, expires });

describe('balance and lots', () => {
  it('debits use the credit that expires first', () => {
    const l = [{ id: 'D', customerId: 'C', kind: 'debit' as const, amount: -30, reason: 'r', by: 'x', at: '2026-11-10' }, credit('A', 50, null), credit('B', 40, '2026-12-01')];
    const lots = walletLots(l, 'C');
    expect(lots.find((x) => x.id === 'B')!.left).toBe(10);
    expect(lots.find((x) => x.id === 'A')!.left).toBe(50);
    expect(walletBalance(l, 'C')).toBe(60);
  });
  it('expires only the unspent remainder, once', () => {
    const l = [{ id: 'D', customerId: 'C', kind: 'spend' as const, amount: -15, reason: 'r', by: 'x', at: '2026-11-10' }, credit('B', 40, '2026-11-20')];
    const a = syncExpiry(l, T);
    expect(a[0]).toMatchObject({ kind: 'expire', amount: -25, lotId: 'B' });
    expect(walletBalance(a, 'C')).toBe(0);
    expect(syncExpiry(a, T)).toBe(a);
  });
  it('lists credits expiring soon and the liability', () => {
    const l = [credit('A', 50, '2026-11-27'), credit('B', 40, '2027-01-01'), credit('N', 10, null)];
    expect(expiringSoon(l, T, 7)).toEqual([{ customerId: 'C', amount: 50, expires: '2026-11-27', days: 3 }]);
    const li = walletLiability(l, T);
    expect(li).toMatchObject({ outstanding: 100, noExpiry: 10, soon: 50, customers: 1 });
  });
  it('fixtures reconcile: expired welcome credit drops out of the liability', () => {
    const l = syncExpiry(walletFixtures(), T);
    expect(walletBalance(l, 'C-1004')).toBe(0);
    expect(walletBalance(l, 'C-1003')).toBe(80_00);
  });
});

describe('checkout use', () => {
  const s = walletSettingsFixture();
  it('is limited by balance, the merchant cap and the total', () => {
    expect(walletUse(300_00, 400_00, s)).toMatchObject({ max: 200_00, cappedBy: 'cap', rest: 200_00 });
    expect(walletUse(50_00, 400_00, s)).toMatchObject({ max: 50_00, cappedBy: 'balance' });
    expect(walletUse(500_00, 100_00, { ...s, capType: 'fixed', capFixed: 500_00 })).toMatchObject({ max: 100_00, cappedBy: 'total', rest: 0 });
    expect(walletUse(50_00, 400_00, s, 20_00).applied).toBe(20_00);
    expect(walletUse(50_00, 400_00, { ...s, enabled: false }).max).toBe(0);
  });
  it('spends once per order and returns it if the order is not completed', () => {
    let l = [credit('A', 100, null)];
    l = spendWallet(l, { customerId: 'C', amount: 60, orderRef: 'O1' }, T);
    expect(spendWallet(l, { customerId: 'C', amount: 60, orderRef: 'O1' }, T)).toBe(l);
    expect(walletPaid(l, 'O1')).toBe(60);
    l = unspendWallet(l, 'O1', T);
    expect(walletBalance(l, 'C')).toBe(100);
    expect(walletPaid(l, 'O1')).toBe(0);
    expect(unspendWallet(l, 'O1', T)).toBe(l);
  });
});

describe('manual and bulk', () => {
  it('validates amount, balance, reason and expiry (Arabic digits accepted)', () => {
    expect(validateAdjust({ dir: 'credit', amount: '٥٠', reason: 'سبب', expires: '' }, 0, parseMoney, T)).toEqual({});
    expect(validateAdjust({ dir: 'debit', amount: '50', reason: 'سبب', expires: '' }, 10_00, parseMoney, T)).toEqual({ exceeds: true });
    expect(validateAdjust({ dir: 'credit', amount: '0', reason: '', expires: T }, 0, parseMoney, T)).toEqual({ amount: true, reason: true, expires: true });
  });
  it('bulk credit can be reversed for what is unspent', () => {
    const b = bulkCredit([], ['C', 'D'], { amount: 20_00, reason: 'حملة', expires: null }, ctx);
    expect(b.count).toBe(2);
    const spent = spendWallet(b.ledger, { customerId: 'C', amount: 15_00, orderRef: 'X' }, T);
    const r = reverseBatch(spent, b.batchId, { by: 'x', today: T, reason: 'تراجع' });
    expect(r.taken).toBe(25_00);
    expect(r.kept).toBe(15_00);
    expect(walletBalance(r.ledger, 'D')).toBe(0);
  });
  it('a manual debit records who and why', () => {
    const r = adjustWallet([credit('A', 100, null)], { customerId: 'C', dir: 'debit', amount: 40, reason: 'خطأ', expires: null }, ctx);
    expect(r.txn).toMatchObject({ kind: 'debit', amount: -40, by: 'test', reason: 'خطأ' });
  });
  it('refund to wallet is tied to the refund and recorded once', () => {
    const l = refundToWallet([], { customerId: 'C', amount: 90, orderRef: '1', refundId: 'RF-1-1', reason: 'r', expires: null }, ctx);
    expect(l[0]).toMatchObject({ kind: 'refund', orderRef: '1', refundId: 'RF-1-1' });
    expect(refundToWallet(l, { customerId: 'C', amount: 90, orderRef: '1', refundId: 'RF-1-1', reason: 'r', expires: null }, ctx)).toBe(l);
  });
  it('settings validation', () => {
    expect(validateSettings(settingsDraft(walletSettingsFixture()), parseMoney)).toEqual({});
    expect(validateSettings({ ...settingsDraft(walletSettingsFixture()), capPct: '0', expiryDays: '3' }, parseMoney)).toEqual({ capPct: true, expiry: true });
  });
});

describe('cashback', () => {
  const products = productFixtures();
  const customers = customerFixtures();
  const offer = { ...cashbackFixtures()[0], start: '2026-11-01' };
  const o = (p: Partial<Order>): Order => ({ ...allOrders()[0], ref: 'Z1', hoursAgo: 20 * 24, pay: 'paid', ship: 'delivered', ful: 'done', refunds: [], discount: 0, fee: 2500, customerId: 'C-1001', cancelled: undefined, ...p });
  it('pays % of eligible goods after refunds, capped, never on shipping', () => {
    const ord = o({ items: [{ name: { ar: 'x', en: 'x' }, qty: 2, unit: 300_00, sku: products[0].sku }] });
    expect(cashbackAmount(offer, ord, products)).toEqual({ base: 600_00, amount: 30_00, capped: false });
    expect(cashbackAmount({ ...offer, cap: 10_00 }, ord, products).amount).toBe(10_00);
    expect(cashbackAmount({ ...offer, scope: 'products', products: ['none'] }, ord, products).amount).toBe(0);
  });
  it('waits for delivery and the return window, then credits once with expiry', () => {
    const items = [{ name: { ar: 'x', en: 'x' }, qty: 1, unit: 400_00, sku: products[0].sku }];
    const inWindow = o({ ref: 'Z2', hoursAgo: 5 * 24, items });
    const transit = o({ ref: 'Z3', hoursAgo: 15 * 24, ship: 'transit', items });
    const due = o({ ref: 'Z4', hoursAgo: 20 * 24, items });
    const rows = cashbackRows(offer, [inWindow, transit, due], products, customers, [], 14, T);
    expect(rows.map((r) => r.state)).toEqual(['in_window', 'waiting_delivery', 'due']);
    const l = syncCashback([], [offer], [inWindow, transit, due], products, customers, 14, T);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ kind: 'cashback', amount: 20_00, orderRef: 'Z4', offerId: 'CB-1', expires: '2027-01-23' });
    expect(syncCashback(l, [offer], [inWindow, transit, due], products, customers, 14, T)).toBe(l);
    expect(offerResults(cashbackRows(offer, [inWindow, transit, due], products, customers, l, 14, T))).toMatchObject({ credited: 20_00, pending: 40_00, orders: 3 });
  });
  it('takes back cashback a later refund removed, only from what is in the wallet', () => {
    const items = [{ name: { ar: 'x', en: 'x' }, qty: 2, unit: 300_00, sku: products[0].sku }];
    const ord = o({ ref: 'Z5', items });
    const l = syncCashback([], [{ ...offer, trigger: 'delivered' }], [ord], products, customers, 14, T);
    const refunded = { ...ord, refunds: [{ id: 'R', amount: 300_00, qty: [1], shipping: 0, restock: [0], loc: 'ryd' as const, reason: 'x', status: 'confirmed' as const }] };
    const l2 = syncCashback(l, [{ ...offer, trigger: 'delivered' }], [refunded], products, customers, 14, T);
    expect(l2[0]).toMatchObject({ kind: 'reverse', amount: -15_00 });
    expect(walletBalance(l2, 'C-1001')).toBe(15_00);
  });
  it('validates the merchant’s offer', () => {
    expect(validateOffer({ ...emptyOffer(T), name: 'ع', value: '٦٠' }, parseMoney)).toEqual({ name: true, value: true });
    expect(validateOffer({ ...emptyOffer(T), name: 'عرض', value: '5', scope: 'categories' }, parseMoney)).toEqual({ scope: true });
  });
});
