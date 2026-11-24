// Finance: pure rules for the money cards, payout statement, transactions table, CSV export and plan change.
// Ledger rules (reconcile, moneyCards, filterTxs, entitlements) live in merchant/finance.ts; this file only shapes them for screens.
import { formatMoney } from '../../../core/format';
import { toCsv } from '../../merchant/catalog';
import {
  FEATURES, PLANS, STAFF_LIMIT, entitled, filterTxs, moneyCards, planDiff, reconcile,
  SA_BANKS, checkBeneficiary, checkIban, formatIban,
  type BankDetails, type Hold, type Payout, type Plan, type Tx, type TxStatus, type TxType,
} from '../../merchant/finance';
import { total, type L, type Order } from '../../merchant/domain';
import { vatIncluded } from '../../../core/format';

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

/* =====================================================================================================
 * Money states, drill-downs, settlement issues, reconciliation cases, invoices and exports (owner 4).
 * ===================================================================================================== */

export interface FinanceData { txs: Tx[]; payouts: Payout[]; holds?: Hold[] }
/** Sessions saved before holds existed have no `holds`; treat as none. */
export const holdsOf = (f: FinanceData) => f.holds ?? [];
export const activeHolds = (f: FinanceData) => holdsOf(f).filter((h) => h.state !== 'released');

/** A payout the bank returned is shown as returned whatever its stored status. */
export type PayoutView = Payout['status'] | 'returned';
export const payoutView = (p: Payout): PayoutView => (p.problem ? 'returned' : p.status);

export type MoneyState = 'gross' | 'collected' | 'pending' | 'held' | 'available' | 'paidOut' | 'inTransit' | 'fees' | 'refunds';
export const MONEY_STATES: MoneyState[] = ['gross', 'collected', 'pending', 'held', 'available', 'paidOut', 'inTransit', 'fees', 'refunds'];

/**
 * The money states with one definition each (shown next to the figure). Held is a part of pending (the provider has not
 * settled it); a returned payout is back in available and no longer in transit.
 */
export function moneyStates(f: FinanceData) {
  const c = moneyCards(f.txs, f.payouts);
  const held = activeHolds(f).reduce((s, h) => s + h.amount, 0);
  const returned = f.payouts.filter((p) => p.problem).reduce((s, p) => s + (p.amount ?? 0), 0);
  const returnedInTransit = f.payouts.filter((p) => p.problem && p.status === 'in_transit').reduce((s, p) => s + (p.amount ?? 0), 0);
  const returnedPaid = returned - returnedInTransit;
  return {
    gross: c.gross, collected: c.collected, pending: c.pending, held,
    available: c.available + returned, paidOut: c.paidOut - returnedPaid, inTransit: c.inTransit - returnedInTransit,
    fees: c.fees, refunds: c.refunds, refundsPending: c.refundsPending, returned,
  };
}

export type StatusFilter = TxStatus | 'held' | 'settled';
export const STATUS_FILTERS: StatusFilter[] = ['pending', 'held', 'available', 'paid_out', 'settled'];
export interface LedgerFilter { payout: string; type: TxType | ''; status: StatusFilter | ''; q: string; from: string; to: string }

/** Transaction filters from the URL, including the sale-date period used for exports. Unknown values are dropped. */
export function readLedgerFilter(query: URLSearchParams, payouts: Payout[]): LedgerFilter {
  const base = readFilter(query, payouts);
  const st = query.get('status') ?? '';
  const d = (k: string) => { const v = query.get(k) ?? ''; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; };
  let from = d('from'), to = d('to');
  if (from && to && from > to) [from, to] = [to, from];
  return { ...base, status: (STATUS_FILTERS as string[]).includes(st) ? (st as StatusFilter) : '', from, to };
}
export function ledgerQuery(f: Partial<LedgerFilter>, extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { ...txQuery({ payout: f.payout, type: f.type, q: f.q }), status: f.status || undefined, from: f.from || undefined, to: f.to || undefined, ...extra };
}
export const hasLedgerFilter = (f: LedgerFilter) => !!(f.payout || f.type || f.status || f.q.trim() || f.from || f.to);

export function filterLedger(fd: FinanceData, f: LedgerFilter): Tx[] {
  const heldIds = new Set(activeHolds(fd).map((h) => h.txId));
  const st = f.status;
  const plain: TxStatus | '' = st === 'pending' || st === 'available' || st === 'paid_out' ? st : '';
  return filterTxs(fd.txs, { payout: f.payout, type: f.type, status: plain, q: f.q }).filter((t) =>
    (st !== 'held' || heldIds.has(t.id)) && (st !== 'settled' || t.status !== 'pending')
    && (!f.from || t.saleDay >= f.from) && (!f.to || t.saleDay <= f.to));
}

/** Where each money state drills down to: the transactions (or payouts) behind the figure. */
export function drillDown(s: MoneyState): { tab: 'transactions' | 'payouts'; query: Record<string, string | undefined> } {
  switch (s) {
    case 'gross': return { tab: 'transactions', query: ledgerQuery({ type: 'sale' }) };
    case 'collected': return { tab: 'transactions', query: ledgerQuery({ type: 'sale', status: 'settled' }) };
    case 'pending': return { tab: 'transactions', query: ledgerQuery({ status: 'pending' }) };
    case 'held': return { tab: 'transactions', query: ledgerQuery({ status: 'held' }) };
    case 'available': return { tab: 'transactions', query: ledgerQuery({ status: 'available' }) };
    case 'paidOut': return { tab: 'payouts', query: { tab: undefined, pstatus: 'paid' } };
    case 'inTransit': return { tab: 'payouts', query: { tab: undefined, pstatus: 'in_transit' } };
    case 'fees': return { tab: 'transactions', query: ledgerQuery({ type: 'fee' }) };
    case 'refunds': return { tab: 'transactions', query: ledgerQuery({ type: 'refund' }) };
  }
}

export type PayoutFilter = PayoutView | '';
export const readPayoutFilter = (q: URLSearchParams): PayoutFilter => {
  const v = q.get('pstatus') ?? '';
  return v === 'paid' || v === 'in_transit' || v === 'scheduled' || v === 'returned' ? v : '';
};
export const filterPayouts = (ps: Payout[], f: PayoutFilter, from = '', to = '') =>
  ps.filter((p) => (!f || payoutView(p) === f) && (!from || p.date >= from) && (!to || p.date <= to));

/* ---------- Reconciliation: mismatch analysis and cases ---------- */

export interface ReconCase { id: string; payoutId: string; diff: number; opened: string; by: string; state: 'open' | 'resolved'; adjustmentTx?: string; resolvedAt?: string }
export interface FinLog { at: string; by: string; what: L; ref?: string }
export interface FinanceOps { cases: ReconCase[]; log: FinLog[] }

/**
 * Why a payout does not reconcile. `diff` = amount sent − computed net (negative: the bank received less).
 * Candidates are transactions in the payout whose effect equals the difference (a line the provider may have left out
 * or counted twice); `smallFee` flags a difference under SAR 5 typical of a bank charge.
 */
export function mismatchAnalysis(p: Payout, txs: Tx[]) {
  const r = reconcile(p, txs);
  const diff = r.diff;
  const mine = txs.filter((t) => t.payoutId === p.id);
  const candidates = diff === 0 ? [] : mine.filter((t) => Math.abs(signedAmount(t)) === Math.abs(diff));
  return { diff, short: diff < 0, candidates, smallFee: diff !== 0 && Math.abs(diff) <= 500 };
}

export const openCaseFor = (ops: FinanceOps, payoutId: string) => ops.cases.find((c) => c.payoutId === payoutId && c.state === 'open') ?? null;
export const caseFor = (ops: FinanceOps, payoutId: string) => [...ops.cases].reverse().find((c) => c.payoutId === payoutId) ?? null;

export function openCase(ops: FinanceOps, p: Payout, diff: number, by: string, at: string): FinanceOps {
  if (openCaseFor(ops, p.id)) return ops;
  const id = `REC-${String(ops.cases.length + 1).padStart(3, '0')}`;
  return {
    cases: [...ops.cases, { id, payoutId: p.id, diff, opened: at, by, state: 'open' }],
    log: [...ops.log, { at, by, ref: id, what: { ar: `فُتحت حالة مطابقة للتحويل ${p.id}`, en: `Reconciliation case opened for ${p.id}` } }],
  };
}

/**
 * The provider settles an open case: an adjustment of −diff joins the next scheduled payout (simulated reply).
 * Returns the new ledger and ops, or null when there is no open case or no scheduled payout to carry it.
 */
export function resolveCase(fd: FinanceData, ops: FinanceOps, caseId: string, txId: string, at: string): { fin: FinanceData; ops: FinanceOps } | null {
  const c = ops.cases.find((x) => x.id === caseId && x.state === 'open');
  const next = nextPayout(fd.payouts);
  if (!c || !next) return null;
  const tx: Tx = { id: txId, type: 'adjustment', provider: { ar: 'مزود دفع تجريبي', en: 'Test payment provider' }, amount: -c.diff, status: 'available', saleDay: at.slice(0, 10), settledDay: at.slice(0, 10), payoutId: next.id, note: { ar: `تسوية فرق ${c.payoutId} (حالة ${c.id})`, en: `Settles the ${c.payoutId} difference (case ${c.id})` } };
  return {
    fin: { ...fd, txs: [...fd.txs, tx] },
    ops: {
      cases: ops.cases.map((x) => (x.id === caseId ? { ...x, state: 'resolved' as const, adjustmentTx: txId, resolvedAt: at } : x)),
      log: [...ops.log, { at, by: 'provider', ref: c.id, what: { ar: `سوّى المزود الفرق بتسوية ${txId} في ${next.id}`, en: `Provider settled the difference with ${txId} in ${next.id}` } }],
    },
  };
}

/** Retry a payout the bank returned: it goes back to scheduled on the next payout date, its failed attempt kept. */
export function retryPayout(fd: FinanceData, ops: FinanceOps, id: string, by: string, at: string, date: string): { fin: FinanceData; ops: FinanceOps } | null {
  const p = fd.payouts.find((x) => x.id === id);
  if (!p?.problem) return null;
  const payouts = fd.payouts.map((x) => (x.id === id ? { ...x, status: 'scheduled' as const, date, problem: undefined, attempts: [...(x.attempts ?? []), { day: p.problem!.day, result: 'returned' as const }] } : x));
  return { fin: { ...fd, payouts }, ops: { ...ops, log: [...ops.log, { at, by, ref: id, what: { ar: `أُعيدت جدولة التحويل ${id} إلى ${date}`, en: `Payout ${id} rescheduled to ${date}` } }] } };
}

/* ---------- Settlement issues (signal for the home / work centre) ---------- */

export type IssueKind = 'mismatch' | 'returned' | 'held' | 'refundsPending';
export interface SettlementIssue {
  id: string; kind: IssueKind; severity: 'bad' | 'warn';
  /** Money concerned, in halalas (absolute). */
  amount: number;
  ref: string;
  title: L; detail: L;
  /** Where to resolve it: path below #/dashboard/finance and query, for sectionHref('finance', path, query). */
  path: string; query?: Record<string, string>;
}

/**
 * Everything about settlement that needs the merchant, worst first: payouts the bank returned, payouts that do not
 * reconcile (unless a case is already open or resolved), held funds, and refunds still waiting for the provider.
 * Pure: pass `financeStore.get()` and `financeOpsStore.get()`.
 */
export function settlementIssues(fd: FinanceData, ops: FinanceOps = { cases: [], log: [] }): SettlementIssue[] {
  const out: SettlementIssue[] = [];
  for (const p of fd.payouts) {
    if (p.problem) out.push({
      id: `returned-${p.id}`, kind: 'returned', severity: 'bad', amount: p.amount ?? 0, ref: p.id, path: `payouts/${p.id}`,
      title: { ar: `البنك أعاد التحويل ${p.id}`, en: `Bank returned payout ${p.id}` },
      detail: { ar: `${p.problem.reason.ar}. تحقق من الحساب ثم أعد المحاولة.`, en: `${p.problem.reason.en}. Check the account, then retry.` },
    });
  }
  for (const p of fd.payouts) {
    if (p.status === 'scheduled' || p.problem) continue;
    const r = reconcile(p, fd.txs);
    if (r.matches !== false) continue;
    const c = caseFor(ops, p.id);
    if (c?.state === 'resolved') continue;
    out.push({
      id: `mismatch-${p.id}`, kind: 'mismatch', severity: c ? 'warn' : 'bad', amount: Math.abs(r.diff), ref: p.id, path: `payouts/${p.id}`,
      title: { ar: `كشف ${p.id} غير مطابق`, en: `Payout ${p.id} does not reconcile` },
      detail: c ? { ar: `الحالة ${c.id} مفتوحة لدى المزود.`, en: `Case ${c.id} is open with the provider.` } : { ar: 'المحوّل يختلف عن الصافي المحسوب. افتح حالة مطابقة.', en: 'The amount sent differs from the computed net. Open a case.' },
    });
  }
  for (const h of activeHolds(fd)) out.push({
    id: `held-${h.id}`, kind: 'held', severity: 'warn', amount: h.amount, ref: h.id, path: `transactions/${h.txId}`,
    title: { ar: `مبلغ محجوز للطلب #${h.orderRef}`, en: `Funds held for order #${h.orderRef}` },
    detail: h.state === 'evidence_sent' ? { ar: 'أُرسلت المستندات؛ بانتظار قرار المزود.', en: 'Evidence sent; waiting for the provider.' } : { ar: `${h.reason.ar}. أرسل المستندات للمزود.`, en: `${h.reason.en}. Send evidence to the provider.` },
  });
  const rp = fd.txs.filter((t) => t.type === 'refund' && t.status === 'pending');
  if (rp.length) out.push({
    id: 'refunds-pending', kind: 'refundsPending', severity: 'warn', amount: rp.reduce((s, t) => s + t.amount, 0), ref: rp[0].id, path: '', query: { tab: 'transactions', type: 'refund', status: 'pending' },
    title: { ar: `${rp.length} استرداد بانتظار المزود`, en: `${rp.length} refund(s) awaiting the provider` },
    detail: { ar: 'تُخصم من التحويل القادم بعد تأكيد المزود.', en: 'Deducted from the next payout once the provider confirms.' },
  });
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'bad' ? -1 : 1));
}

/* ---------- Holds ---------- */

export const sendEvidence = (fd: FinanceData, holdId: string): FinanceData => ({ ...fd, holds: holdsOf(fd).map((h) => (h.id === holdId && h.state === 'held' ? { ...h, state: 'evidence_sent' as const } : h)) });
/** The provider ends a hold in the merchant's favour (simulated reply): the sale settles into the next payout. */
export function releaseHold(fd: FinanceData, holdId: string, today: string): FinanceData {
  const h = holdsOf(fd).find((x) => x.id === holdId);
  const next = nextPayout(fd.payouts);
  if (!h || h.state === 'released') return fd;
  return {
    ...fd,
    holds: holdsOf(fd).map((x) => (x.id === holdId ? { ...x, state: 'released' as const } : x)),
    txs: fd.txs.map((t) => (t.id === h.txId ? { ...t, status: 'available' as const, settledDay: today, payoutId: next?.id } : t)),
  };
}
export const holdForTx = (fd: FinanceData, txId: string) => holdsOf(fd).find((h) => h.txId === txId) ?? null;

/* ---------- Invoices ---------- */

/** LAK's invoices to the merchant (subscription and usage). Test amounts: plan prices are not approved yet. */
export interface LakInvoice { id: string; period: { from: string; to: string }; issued: string; due: string; status: 'paid' | 'due'; lines: { label: L; amount: number }[] }
export const VAT_RATE = 15;
export function lakInvoices(): LakInvoice[] {
  const months = [['2026-08-01', '2026-08-31'], ['2026-09-01', '2026-09-30'], ['2026-10-01', '2026-10-31'], ['2026-11-01', '2026-11-30']];
  const labels = [2600, 3100, 2850, 3400];
  return months.map(([from, to], i) => ({
    id: `LAK-INV-2026-${String(8 + i).padStart(2, '0')}01`, period: { from, to }, issued: from, due: i === 3 ? '2026-12-01' : `${from.slice(0, 8)}07`, status: i === 3 ? 'due' as const : 'paid' as const,
    lines: [
      { label: { ar: 'اشتراك خطة Plus (مبلغ تجريبي)', en: 'Plus plan subscription (test amount)' }, amount: 19900 },
      { label: { ar: 'بوليصات شحن لك (استخدام)', en: 'LAK shipping labels (usage)' }, amount: labels[i] * 10 },
      { label: { ar: 'رسائل SMS (استخدام)', en: 'SMS messages (usage)' }, amount: 1200 + i * 150 },
    ],
  })).reverse();
}
/** Subtotal before VAT, VAT at 15% on top, and total. Rounded per invoice, in halalas. */
export function invoiceTotals(inv: LakInvoice) {
  const subtotal = inv.lines.reduce((s, l) => s + l.amount, 0);
  const vat = Math.round((subtotal * VAT_RATE) / 100);
  return { subtotal, vat, total: subtotal + vat };
}
export function lakInvoicesCsv(list: LakInvoice[]): string {
  return toCsv([
    ['invoice', 'period_from', 'period_to', 'issued', 'due', 'status', 'subtotal_sar', 'vat_sar', 'total_sar'],
    ...list.map((i) => { const t = invoiceTotals(i); return [i.id, i.period.from, i.period.to, i.issued, i.due, i.status, sar(t.subtotal), sar(t.vat), sar(t.total)]; }),
  ]);
}
const sar = (h: number) => (h / 100).toFixed(2);

/** The merchant's sales invoices: one per paid order. The printable invoice is the orders section's (orders/print-link printHref). */
export interface SalesInvoice { number: string; orderRef: string; day: string; total: number; vat: number; refunded: boolean }
export const salesInvoiceNumber = (ref: string) => `INV-${ref}`;
export function salesInvoices(orders: Order[], today = '2026-11-24'): SalesInvoice[] {
  const t0 = Date.parse(`${today}T00:00:00Z`);
  return orders.filter((o) => o.pay !== 'failed').map((o) => ({
    number: salesInvoiceNumber(o.ref), orderRef: o.ref, day: new Date(t0 - Math.floor(o.hoursAgo / 24) * 86400000).toISOString().slice(0, 10),
    total: total(o), vat: vatIncluded(total(o)), refunded: o.pay === 'refunded' || o.pay === 'partially_refunded',
  }));
}
export const filterSalesInvoices = (list: SalesInvoice[], q: string, from = '', to = '') => {
  const s = q.trim().replace('#', '').toUpperCase();
  return list.filter((i) => (!s || i.number.includes(s) || i.orderRef.includes(s)) && (!from || i.day >= from) && (!to || i.day <= to));
};
export function salesInvoicesCsv(list: SalesInvoice[]): string {
  return toCsv([['invoice', 'order', 'date', 'total_incl_vat_sar', 'vat_sar', 'refunded'], ...list.map((i) => [i.number, i.orderRef, i.day, sar(i.total), sar(i.vat), i.refunded ? 'yes' : 'no'])]);
}
export function payoutsCsv(list: Payout[], txs: Tx[]): string {
  return toCsv([
    ['payout', 'period_from', 'period_to', 'date', 'status', 'account', 'collected_sar', 'fees_sar', 'refunds_sar', 'adjustments_sar', 'computed_net_sar', 'amount_sent_sar', 'reconciles'],
    ...list.map((p) => { const r = reconcile(p, txs); return [p.id, p.from, p.to, p.date, payoutView(p), p.account, sar(r.collected), sar(r.fees), sar(r.refunds), sar(r.adjustments), sar(r.net), p.status === 'scheduled' || p.amount === null ? '' : sar(p.amount), r.matches === null ? 'estimate' : r.matches ? 'yes' : 'no']; }),
  ]);
}
export const periodName = (base: string, from: string, to: string, today = '2026-11-24') => `${base}${from || to ? `-${from || 'start'}-to-${to || today}` : ''}-${today}.csv`;

/* ---------- Bank-transfer account (settings / payments) ---------- */

export interface BankDraft { bankCode: string; beneficiary: string; iban: string }
export type BankErrors = Partial<Record<'bank' | 'beneficiary' | 'iban', string>>;
export const bankDraftOf = (b: BankDetails | null): BankDraft => {
  if (!b) return { bankCode: '', beneficiary: '', iban: '' };
  const code = Object.keys(SA_BANKS).find((k) => SA_BANKS[k].en === b.bank || SA_BANKS[k].ar === b.bank) ?? '';
  return { bankCode: code, beneficiary: b.beneficiary, iban: formatIban(b.iban) };
};
/** Validate a bank-transfer draft. The bank chosen must be the bank encoded in the IBAN, which catches most typos. */
export function checkBankDraft(d: BankDraft): { ok: true; bank: BankDetails } | { ok: false; errors: BankErrors } {
  const errors: BankErrors = {};
  const iban = checkIban(d.iban);
  if (!iban.ok) errors.iban = iban.error;
  const ben = checkBeneficiary(d.beneficiary);
  if (ben) errors.beneficiary = ben;
  if (!d.bankCode) errors.bank = 'empty';
  else if (iban.ok && iban.iban.slice(4, 6) !== d.bankCode) errors.bank = 'mismatch';
  if (Object.keys(errors).length || !iban.ok) return { ok: false, errors };
  return { ok: true, bank: { bank: SA_BANKS[d.bankCode].en, beneficiary: d.beneficiary.trim().replace(/\s+/g, ' '), iban: iban.iban } };
}
/** Bank transfer appears at checkout only when the method is on and an account is saved. */
export const bankAtCheckout = (on: boolean, bank: BankDetails | null) => (!on ? 'off' : bank ? 'ready' : 'needsDetails');
/** A document sent to a payment provider: PDF or image up to 5 MB. */
export function checkProviderDoc(f: { name: string; size: number; type: string }): 'type' | 'size' | null {
  if (!/^(application\/pdf|image\/(png|jpe?g))$/.test(f.type) && !/\.(pdf|png|jpe?g)$/i.test(f.name)) return 'type';
  if (f.size > 5 * 1024 * 1024) return 'size';
  return null;
}
