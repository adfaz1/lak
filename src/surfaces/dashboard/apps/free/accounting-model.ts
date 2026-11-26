// Accounting export free app: pure rules. Journal entries for a period from the order book and the payment
// provider's transactions, on the merchant's chart of accounts, with a balance check and a CSV file.
// Sales are VAT-inclusive at 15%: VAT output is the VAT contained in each collected order; refunds reverse sales and
// VAT. Dates: orders by when they were placed, provider fees and adjustments by sale day, payouts by payout date.
import { total, vatIncluded, type L, type Order } from '../../../merchant/domain';
import { collected, placedAt } from '../../../merchant/ops';
import type { Payout, Tx } from '../../../merchant/finance';

export type AccountKey = 'clearing' | 'bank' | 'sales' | 'shipping' | 'vat' | 'discounts' | 'returns' | 'fees' | 'adjustments';
export const ACCOUNT_KEYS: AccountKey[] = ['clearing', 'bank', 'sales', 'shipping', 'vat', 'discounts', 'returns', 'fees', 'adjustments'];
export const ACCOUNT_ROLE: Record<AccountKey, L> = {
  clearing: { ar: 'مستحقات بوابة الدفع', en: 'Payment provider receivable' },
  bank: { ar: 'الحساب البنكي', en: 'Bank account' },
  sales: { ar: 'إيرادات المبيعات', en: 'Sales revenue' },
  shipping: { ar: 'إيرادات الشحن', en: 'Shipping income' },
  vat: { ar: 'ضريبة القيمة المضافة المستحقة', en: 'VAT output' },
  discounts: { ar: 'خصومات المبيعات', en: 'Sales discounts' },
  returns: { ar: 'مردودات المبيعات', en: 'Sales returns' },
  fees: { ar: 'رسوم الدفع', en: 'Payment fees' },
  adjustments: { ar: 'تسويات بوابة الدفع', en: 'Provider adjustments' },
};
export interface Account { code: string; name: string }
export type ChartMap = Record<AccountKey, Account>;
export const DEFAULT_MAP: ChartMap = {
  clearing: { code: '1130', name: 'مستحقات بوابة الدفع' }, bank: { code: '1110', name: 'البنك' },
  sales: { code: '4100', name: 'المبيعات' }, shipping: { code: '4200', name: 'إيرادات الشحن' },
  vat: { code: '2210', name: 'ضريبة المخرجات' }, discounts: { code: '4150', name: 'خصومات المبيعات' },
  returns: { code: '4160', name: 'مردودات المبيعات' }, fees: { code: '5310', name: 'رسوم الدفع' }, adjustments: { code: '5390', name: 'تسويات الدفع' },
};

export type Freq = 'off' | 'weekly' | 'monthly';
export interface ExportRecord { id: string; at: string; by: string; from: string; to: string; lines: number; debit: number; credit: number; file: string; scheduled?: boolean }
export interface AccountingSettings extends Record<string, unknown> {
  map: ChartMap;
  /** Column layout: a generic journal CSV, or the merchant's own label for their accounting product. */
  format: 'generic' | 'custom';
  customName: string;
  schedule: { freq: Freq; email: string };
  exports: ExportRecord[];
}
export const ACCOUNTING_DEFAULTS: AccountingSettings = { map: DEFAULT_MAP, format: 'generic', customName: '', schedule: { freq: 'off', email: '' }, exports: [] };
export const accountingSettingsOf = (raw: Partial<AccountingSettings> | undefined): AccountingSettings => ({
  ...ACCOUNTING_DEFAULTS, ...raw, map: { ...DEFAULT_MAP, ...(raw?.map ?? {}) }, schedule: { ...ACCOUNTING_DEFAULTS.schedule, ...(raw?.schedule ?? {}) },
});

export type MapError = { key: AccountKey; error: 'code' | 'name' };
/** Codes: 1–12 letters, digits, dots or dashes; names required. The same account may serve two roles. */
export function mapErrors(m: ChartMap): MapError[] {
  const out: MapError[] = [];
  for (const k of ACCOUNT_KEYS) {
    const a = m[k];
    if (!/^[A-Za-z0-9.-]{1,12}$/.test(a.code.trim())) out.push({ key: k, error: 'code' });
    if (!a.name.trim()) out.push({ key: k, error: 'name' });
  }
  return out;
}
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

/** Calendar day (Riyadh) of an epoch. */
export const riyadhDay = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
export const inRange = (day: string, from: string, to: string) => day >= from && day <= to;

export interface JLine { date: string; entry: string; key: AccountKey; debit: number; credit: number; memo: string; ref?: string }
const net = (h: number) => Math.round((h * 100) / 115);

/**
 * Journal lines for [from, to] (YYYY-MM-DD, inclusive). One entry per collected order (sale), per confirmed refund,
 * per fee and adjustment transaction, and per paid payout. Each entry balances on its own.
 */
export function journal(orders: Order[], txs: Tx[], payouts: Payout[], from: string, to: string, now: number): JLine[] {
  const out: JLine[] = [];
  const add = (l: Omit<JLine, 'debit' | 'credit'> & { debit?: number; credit?: number }) => { if ((l.debit ?? 0) || (l.credit ?? 0)) out.push({ debit: 0, credit: 0, ...l }); };
  for (const o of orders) {
    if (o.cancelled || !collected(o)) continue;
    const day = riyadhDay(placedAt(o, now));
    if (!inRange(day, from, to)) continue;
    const gross = total(o);
    const vat = vatIncluded(o);
    const ship = net(o.fee);
    const disc = net(o.discount ?? 0);
    const sales = gross - vat - ship + disc;
    const entry = `S-${o.ref}`;
    const memo = `Order #${o.ref}`;
    add({ date: day, entry, key: 'clearing', debit: gross, memo, ref: o.ref });
    add({ date: day, entry, key: 'discounts', debit: disc, memo, ref: o.ref });
    add({ date: day, entry, key: 'sales', credit: sales, memo, ref: o.ref });
    add({ date: day, entry, key: 'shipping', credit: ship, memo, ref: o.ref });
    add({ date: day, entry, key: 'vat', credit: vat, memo, ref: o.ref });
    o.refunds.filter((r) => r.status === 'confirmed').forEach((r, i) => {
      const rv = Math.round((r.amount * 15) / 115);
      const e = `R-${o.ref}-${i + 1}`;
      add({ date: day, entry: e, key: 'returns', debit: r.amount - rv, memo: `Refund ${r.id} · #${o.ref}`, ref: o.ref });
      add({ date: day, entry: e, key: 'vat', debit: rv, memo: `Refund ${r.id} · #${o.ref}`, ref: o.ref });
      add({ date: day, entry: e, key: 'clearing', credit: r.amount, memo: `Refund ${r.id} · #${o.ref}`, ref: o.ref });
    });
  }
  for (const t of txs) {
    if (!inRange(t.saleDay, from, to)) continue;
    if (t.type === 'fee') {
      add({ date: t.saleDay, entry: t.id, key: 'fees', debit: t.amount, memo: `Fee${t.orderRef ? ` · #${t.orderRef}` : ''}`, ref: t.orderRef });
      add({ date: t.saleDay, entry: t.id, key: 'clearing', credit: t.amount, memo: `Fee${t.orderRef ? ` · #${t.orderRef}` : ''}`, ref: t.orderRef });
    } else if (t.type === 'adjustment') {
      const a = Math.abs(t.amount);
      if (t.amount < 0) { add({ date: t.saleDay, entry: t.id, key: 'adjustments', debit: a, memo: 'Provider adjustment' }); add({ date: t.saleDay, entry: t.id, key: 'clearing', credit: a, memo: 'Provider adjustment' }); }
      else { add({ date: t.saleDay, entry: t.id, key: 'clearing', debit: a, memo: 'Provider adjustment' }); add({ date: t.saleDay, entry: t.id, key: 'adjustments', credit: a, memo: 'Provider adjustment' }); }
    }
  }
  for (const p of payouts) {
    if (p.status !== 'paid' || p.amount === null || !inRange(p.date, from, to)) continue;
    add({ date: p.date, entry: p.id, key: 'bank', debit: p.amount, memo: `Payout ${p.id}` });
    add({ date: p.date, entry: p.id, key: 'clearing', credit: p.amount, memo: `Payout ${p.id}` });
  }
  return out.sort((a, b) => (a.date === b.date ? a.entry.localeCompare(b.entry) : a.date.localeCompare(b.date)));
}

export function totals(lines: JLine[]) {
  const debit = lines.reduce((t, l) => t + l.debit, 0);
  const credit = lines.reduce((t, l) => t + l.credit, 0);
  // Every entry must balance on its own, not only the grand total.
  const byEntry = new Map<string, number>();
  for (const l of lines) byEntry.set(l.entry, (byEntry.get(l.entry) ?? 0) + l.debit - l.credit);
  const unbalanced = [...byEntry.entries()].filter(([, v]) => v !== 0).map(([k]) => k);
  return { debit, credit, balanced: debit === credit && !unbalanced.length, unbalanced, entries: byEntry.size };
}
/** Debit and credit per account role, for the summary table. */
export function byAccount(lines: JLine[]): { key: AccountKey; debit: number; credit: number }[] {
  return ACCOUNT_KEYS.map((key) => ({ key, debit: lines.filter((l) => l.key === key).reduce((t, l) => t + l.debit, 0), credit: lines.filter((l) => l.key === key).reduce((t, l) => t + l.credit, 0) }))
    .filter((r) => r.debit || r.credit);
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const sar = (h: number) => (h / 100).toFixed(2);
/** CSV: date, entry, account code, account name, debit, credit, memo (SAR with two decimals). UTF-8 with BOM for spreadsheet apps. */
export function journalCsv(lines: JLine[], map: ChartMap): string {
  const head = ['Date', 'Entry', 'Account code', 'Account name', 'Debit', 'Credit', 'Memo'];
  const rows = lines.map((l) => [l.date, l.entry, map[l.key].code.trim(), map[l.key].name.trim(), l.debit ? sar(l.debit) : '', l.credit ? sar(l.credit) : '', l.memo]);
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}
export const fileName = (from: string, to: string, s: Pick<AccountingSettings, 'format' | 'customName'>) => {
  const tag = s.format === 'custom' && s.customName.trim() ? s.customName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'journal' : 'journal';
  return `${tag}-${from}_${to}.csv`;
};

/** Month presets: this month so far and the previous full month, as of `today` (YYYY-MM-DD). */
export function monthRange(today: string, offset: 0 | -1): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const from = d.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { from, to: offset === 0 ? today : end };
}
/** Next scheduled run (simulated): Monday 06:00 for weekly, the 1st for monthly; null when off. */
export function nextRun(freq: Freq, today: string): string | null {
  if (freq === 'off') return null;
  const d = new Date(`${today}T00:00:00Z`);
  if (freq === 'weekly') { const add = ((8 - d.getUTCDay()) % 7) || 7; d.setUTCDate(d.getUTCDate() + add); }
  else d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}
