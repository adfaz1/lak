// Finance domain: transactions, payouts and reconciliation, money cards, and the plan entitlement registry.
// Integer halalas, one currency (SAR). Fee figures are test rates for the demo, not LAK pricing.
import { allOrders, total, type L, type Order, type Refund } from './domain';

export type TxType = 'sale' | 'fee' | 'refund' | 'adjustment';
export type TxStatus = 'pending' | 'available' | 'paid_out';
export interface Tx {
  id: string;
  type: TxType;
  orderRef?: string;
  provider: L;
  /** Positive for sales, fees and refunds (their direction comes from the type). Adjustments are signed. */
  amount: number;
  status: TxStatus;
  saleDay: string;
  settledDay?: string;
  payoutId?: string;
  note?: L;
}
export type PayoutStatus = 'paid' | 'in_transit' | 'scheduled';
export interface Payout { id: string; from: string; to: string; date: string; status: PayoutStatus; account: string; amount: number | null }

const CARD: L = { ar: 'مزود دفع تجريبي', en: 'Test payment provider' };
/** Test fee: 2.2% + SAR 1.00 per sale. Illustrative only. */
export const testFee = (amount: number) => Math.round((amount * 22) / 1000) + 100;

const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;

export function financeFixtures(orders: Order[] = allOrders()): { txs: Tx[]; payouts: Payout[] } {
  const settled = orders.filter((o) => o.settled && o.pay === 'paid').slice(0, 36);
  const groups: { id: string; from: number; to: number; date: number; status: PayoutStatus; list: Order[] }[] = [
    { id: 'PO-2611-01', from: 1, to: 7, date: 9, status: 'paid', list: settled.slice(24, 36) },
    { id: 'PO-2611-02', from: 8, to: 14, date: 16, status: 'paid', list: settled.slice(12, 24) },
    { id: 'PO-2611-03', from: 15, to: 21, date: 23, status: 'in_transit', list: settled.slice(0, 12) },
  ];
  const txs: Tx[] = [];
  let n = 5000;
  const id = () => `TX-${n++}`;
  for (const g of groups) {
    g.list.forEach((o, i) => {
      const saleDay = day(g.from + (i % (g.to - g.from + 1)));
      const amt = total(o);
      txs.push({ id: id(), type: 'sale', orderRef: o.ref, provider: CARD, amount: amt, status: 'paid_out', saleDay, settledDay: day(g.to), payoutId: g.id });
      txs.push({ id: id(), type: 'fee', orderRef: o.ref, provider: CARD, amount: testFee(amt), status: 'paid_out', saleDay, settledDay: day(g.to), payoutId: g.id });
    });
  }
  const r1 = groups[1].list[3];
  txs.push({ id: id(), type: 'refund', orderRef: r1.ref, provider: CARD, amount: r1.items[0].unit, status: 'paid_out', saleDay: day(12), settledDay: day(14), payoutId: 'PO-2611-02' });
  txs.push({ id: id(), type: 'adjustment', provider: CARD, amount: -1500, status: 'paid_out', saleDay: day(5), settledDay: day(7), payoutId: 'PO-2611-01', note: { ar: 'رسم اعتراض على عملية (تجريبي)', en: 'Chargeback fee (test)' } });
  txs.push({ id: id(), type: 'adjustment', provider: CARD, amount: 2000, status: 'paid_out', saleDay: day(10), settledDay: day(14), payoutId: 'PO-2611-02', note: { ar: 'تصحيح رسوم سابقة (تجريبي)', en: 'Correction of earlier fees (test)' } });
  // Settled by the provider, not yet paid out: goes to the next scheduled payout.
  for (const o of orders.filter((x) => ['10478', '10477', '10476'].includes(x.ref))) {
    const amt = total(o);
    txs.push({ id: id(), type: 'sale', orderRef: o.ref, provider: CARD, amount: amt, status: 'available', saleDay: day(22), settledDay: day(23), payoutId: 'PO-2611-04' });
    txs.push({ id: id(), type: 'fee', orderRef: o.ref, provider: CARD, amount: testFee(amt), status: 'available', saleDay: day(22), settledDay: day(23), payoutId: 'PO-2611-04' });
  }
  // Captured today, awaiting provider settlement.
  for (const o of orders.filter((x) => x.pay === 'paid' && x.hoursAgo < 12)) {
    txs.push({ id: id(), type: 'sale', orderRef: o.ref, provider: CARD, amount: total(o), status: 'pending', saleDay: day(24) });
  }
  const payouts: Payout[] = groups.map((g) => ({ id: g.id, from: day(g.from), to: day(g.to), date: day(g.date), status: g.status, account: '•••• 4821', amount: null }));
  payouts.push({ id: 'PO-2611-04', from: day(22), to: day(28), date: day(30), status: 'scheduled', account: '•••• 4821', amount: null });
  // Paid and in-transit payouts carry the amount the bank transfer was made for.
  for (const p of payouts) if (p.status !== 'scheduled') p.amount = reconcile(p, txs).net;
  return { txs, payouts: payouts.reverse() };
}

/** collected − fees − refunds ± adjustments = net. Each figure comes from the payout's own transactions, counted once. */
export function reconcile(p: Payout, txs: Tx[]) {
  const mine = txs.filter((t) => t.payoutId === p.id);
  const sum = (type: TxType) => mine.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const collected = sum('sale');
  const fees = sum('fee');
  const refunds = sum('refund');
  const adjustments = sum('adjustment');
  const net = collected - fees - refunds + adjustments;
  return { collected, fees, refunds, adjustments, net, count: mine.length, matches: p.amount === null ? null : p.amount === net, diff: p.amount === null ? 0 : p.amount - net };
}

/** The money cards. Definitions are in the UI next to each figure. */
export function moneyCards(txs: Tx[], payouts: Payout[]) {
  const s = (f: (t: Tx) => boolean) => txs.filter(f).reduce((a, t) => a + t.amount, 0);
  const sales = (t: Tx) => t.type === 'sale';
  const availableNet = s((t) => t.status === 'available' && t.type === 'sale') - s((t) => t.status === 'available' && (t.type === 'fee' || t.type === 'refund'))
    + s((t) => t.status === 'available' && t.type === 'adjustment');
  return {
    gross: s(sales),
    collected: s((t) => sales(t) && t.status !== 'pending'),
    pending: s((t) => sales(t) && t.status === 'pending'),
    available: availableNet,
    paidOut: payouts.filter((p) => p.status === 'paid').reduce((a, p) => a + (p.amount ?? 0), 0),
    inTransit: payouts.filter((p) => p.status === 'in_transit').reduce((a, p) => a + (p.amount ?? 0), 0),
    fees: s((t) => t.type === 'fee'),
    refunds: s((t) => t.type === 'refund'),
    refundsPending: s((t) => t.type === 'refund' && t.status === 'pending'),
  };
}

/** Ledger line for a refund confirmed by the provider: deducted from the next scheduled payout. */
export function refundTx(o: Order, r: Refund, nextId: string, payoutId: string | undefined, confirmed: boolean): Tx {
  return { id: nextId, type: 'refund', orderRef: o.ref, provider: CARD, amount: r.amount, status: confirmed ? 'available' : 'pending', saleDay: day(24), payoutId: confirmed ? payoutId : undefined };
}

export function filterTxs(txs: Tx[], f: { payout?: string; type?: TxType | ''; status?: TxStatus | ''; q?: string }): Tx[] {
  const q = (f.q ?? '').trim().replace('#', '').toUpperCase();
  return txs.filter((t) => (!f.payout || t.payoutId === f.payout) && (!f.type || t.type === f.type) && (!f.status || t.status === f.status)
    && (!q || t.id.includes(q) || (t.orderRef ?? '').includes(q)));
}

/* ---------- Plans (working names from the source; prices are not approved) ---------- */

export type Plan = 'basic' | 'plus' | 'pro' | 'special';
export const PLANS: Plan[] = ['basic', 'plus', 'pro', 'special'];
export type Feature =
  | 'catalog' | 'coupons' | 'reviews' | 'cod' | 'marketplace' | 'epay' | 'labels' | 'loyalty' | 'ads' | 'wholesale' | 'themeCode'
  | 'multiStore' | 'segments' | 'affiliate' | 'tierPricing' | 'routing' | 'fullReports' | 'erp' | 'sla' | 'appMaker';
export const FEATURE_MIN: Record<Feature, Plan> = {
  catalog: 'basic', coupons: 'basic', reviews: 'basic', cod: 'basic', marketplace: 'basic',
  epay: 'plus', labels: 'plus', loyalty: 'plus', ads: 'plus', wholesale: 'plus', themeCode: 'plus', appMaker: 'plus',
  multiStore: 'pro', segments: 'pro', affiliate: 'pro', tierPricing: 'pro', routing: 'pro', fullReports: 'pro',
  erp: 'special', sla: 'special',
};
export const FEATURES = Object.keys(FEATURE_MIN) as Feature[];
/** Staff seats per plan as written in the source matrix (null = unlimited). */
export const STAFF_LIMIT: Record<Plan, number | null> = { basic: 1, plus: 3, pro: null, special: null };

export const entitled = (plan: Plan, f: Feature) => PLANS.indexOf(plan) >= PLANS.indexOf(FEATURE_MIN[f]);
export function planDiff(from: Plan, to: Plan) {
  return { gained: FEATURES.filter((f) => !entitled(from, f) && entitled(to, f)), lost: FEATURES.filter((f) => entitled(from, f) && !entitled(to, f)) };
}
