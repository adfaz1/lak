// Finance: pure rules for the money cards, payout statement, transactions table, CSV export and plan change.
// Ledger rules (reconcile, moneyCards, filterTxs, entitlements) live in merchant/finance.ts; this file only shapes them for screens.
import { formatMoney } from '../../../core/format';
import { toCsv } from '../../merchant/catalog';
import {
  FEATURES, PLANS, STAFF_LIMIT, entitled, filterTxs, moneyCards, planDiff, reconcile,
  type Payout, type Plan, type Tx, type TxStatus, type TxType,
} from '../../merchant/finance';

export { FEATURES, PLANS, STAFF_LIMIT, entitled, moneyCards, reconcile };
export const PAGE_SIZE = 25;
export const TX_TYPES: TxType[] = ['sale', 'fee', 'refund', 'adjustment'];
export const TX_STATUSES: TxStatus[] = ['pending', 'available', 'paid_out'];

export type Tab = 'payouts' | 'transactions' | 'billing';
export const TABS: Tab[] = ['payouts', 'transactions', 'billing'];
export const parseTab = (v: string | null): Tab => (v && (TABS as string[]).includes(v) ? (v as Tab) : 'payouts');

export interface TxFilter { payout: string; type: TxType | ''; status: TxStatus | ''; q: string }

/** Read transaction filters from the URL; unknown values are dropped rather than producing an empty table. */
export function readFilter(query: URLSearchParams, payouts: Payout[]): TxFilter {
  const type = query.get('type') ?? '';
  const status = query.get('status') ?? '';
  const payout = query.get('payout') ?? '';
  return {
    payout: payouts.some((p) => p.id === payout) ? payout : '',
    type: (TX_TYPES as string[]).includes(type) ? (type as TxType) : '',
    status: (TX_STATUSES as string[]).includes(status) ? (status as TxStatus) : '',
    q: query.get('q') ?? '',
  };
}

/** URL query for the transactions tab with these filters (empty values dropped by link()). */
export function txQuery(f: Partial<TxFilter>, extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { tab: 'transactions', payout: f.payout || undefined, type: f.type || undefined, status: f.status || undefined, q: f.q || undefined, ...extra };
}
export const hasFilter = (f: TxFilter) => !!(f.payout || f.type || f.status || f.q.trim());

export const filterTransactions = (txs: Tx[], f: TxFilter) => filterTxs(txs, f);

/** Effect of a transaction on what the merchant receives: sales in, fees and refunds out, adjustments as signed. */
export const signedAmount = (t: Tx) => (t.type === 'sale' || t.type === 'adjustment' ? t.amount : -t.amount);
export const netOf = (txs: Tx[]) => txs.reduce((s, t) => s + signedAmount(t), 0);

export interface StatementLine { type: TxType; amount: number; count: number; sign: '+' | '−' }
/**
 * Payout statement: one line per transaction type, each signed and linked to its transactions.
 * collected − fees − refunds ± adjustments = net. Every transaction belongs to exactly one payout, so nothing is counted twice.
 */
export function statement(p: Payout, txs: Tx[]) {
  const r = reconcile(p, txs);
  const mine = txs.filter((t) => t.payoutId === p.id);
  const count = (type: TxType) => mine.filter((t) => t.type === type).length;
  const lines: StatementLine[] = [
    { type: 'sale', amount: r.collected, count: count('sale'), sign: '+' },
    { type: 'fee', amount: r.fees, count: count('fee'), sign: '−' },
    { type: 'refund', amount: r.refunds, count: count('refund'), sign: '−' },
    { type: 'adjustment', amount: Math.abs(r.adjustments), count: count('adjustment'), sign: r.adjustments < 0 ? '−' : '+' },
  ];
  /** The figure reaches the bank only for paid and in-transit payouts; a scheduled one is an estimate. */
  const transferred = p.status === 'scheduled' ? null : p.amount;
  return { lines, net: r.net, transferred, matches: r.matches, diff: r.diff, count: r.count };
}

export const nextPayout = (payouts: Payout[]) => payouts.filter((p) => p.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

/** CSV of ledger lines. Amounts are signed SAR with two decimals; no customer names or contact data are exported. */
export function txCsv(txs: Tx[]): string {
  return toCsv([
    ['transaction_id', 'type', 'order', 'provider', 'amount_sar', 'currency', 'status', 'sale_date', 'settled_date', 'payout', 'note'],
    ...txs.map((t) => [t.id, t.type, t.orderRef ?? '', t.provider.en, (signedAmount(t) < 0 ? '-' : '') + formatMoney(Math.abs(t.amount)).replace(/,/g, ''), 'SAR', t.status, t.saleDay, t.settledDay ?? '', t.payoutId ?? '', t.note?.en ?? '']),
  ]);
}
export function csvName(f: TxFilter, today = '2026-11-24'): string {
  const parts = ['lak-transactions', f.payout, f.type, f.status].filter(Boolean);
  return `${parts.join('-')}-${today}.csv`;
}

/** What changes when moving from one plan to another, before anything is requested. */
export function planImpact(from: Plan, to: Plan, seatsInUse: number) {
  const d = planDiff(from, to);
  const limit = STAFF_LIMIT[to];
  return {
    direction: PLANS.indexOf(to) > PLANS.indexOf(from) ? 'upgrade' as const : 'downgrade' as const,
    gained: d.gained, lost: d.lost,
    seatLimit: limit,
    /** Seats above the new limit; members are kept, but some must be removed before the change can apply. */
    seatsOver: limit === null ? 0 : Math.max(0, seatsInUse - limit),
  };
}

/** A transaction's dates kept apart: sale, provider settlement, and the bank payout. */
export function txTimeline(t: Tx, payouts: Payout[]) {
  const p = payouts.find((x) => x.id === t.payoutId) ?? null;
  return { sale: t.saleDay, settled: t.settledDay ?? null, payout: p, payoutDate: p?.date ?? null, paid: p?.status === 'paid' };
}

export function paginate<T>(rows: T[], requested: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1));
  return { rows: rows.slice((page - 1) * size, page * size), page, pages, total: rows.length };
}
