// Customer wallet (store credit) and cashback: pure rules, no React, no stores (wallet-store.ts wires them).
// Every movement is one ledger line with who, when, why and what caused it (order, refund, offer, bulk batch).
// Balance = sum of movements. Credits are spent nearest-expiry first; an expired remainder becomes an "expire" line.
// Money is integer halalas. The merchant's own values (caps, cashback %, expiry) are inputs; nothing here is a LAK price.
import type { L, Order } from './domain';
import type { Product } from './catalog';
import type { Customer } from './workspace';

export type WalletKind = 'credit' | 'debit' | 'refund' | 'cashback' | 'spend' | 'expire' | 'reverse' | 'unspend';
export const WALLET_KINDS: WalletKind[] = ['credit', 'debit', 'refund', 'cashback', 'spend', 'expire', 'reverse', 'unspend'];
export interface WalletTxn {
  id: string;
  customerId: string;
  kind: WalletKind;
  /** Signed halalas: + adds to the balance, − takes from it. */
  amount: number;
  reason: string;
  /** 'system' or the person's name. */
  by: string;
  /** ISO day. */
  at: string;
  /** Credits only: the day the remainder of this credit expires (null = never). */
  expires?: string | null;
  orderRef?: string;
  refundId?: string;
  offerId?: string;
  batchId?: string;
  /** Expire lines: the credit they close. */
  lotId?: string;
}

export interface WalletSettings {
  enabled: boolean;
  /** Most a customer may pay from the wallet on one order: a share of the order total or a fixed amount. */
  capType: 'pct' | 'fixed';
  capPct: number;
  capFixed: number;
  /** Default expiry for manual credits and refunds to the wallet, in days (null = never). */
  expiryDays: number | null;
  /** Remind customers this many days before a credit expires. */
  warnOn: boolean;
  warnDays: number;
  version: number; by: string; at: string;
}

export interface CashbackOffer {
  id: string;
  name: string;
  status: 'active' | 'paused';
  kind: 'pct' | 'fixed';
  /** Percent (1–50) or halalas. */
  value: number;
  /** Most cashback per order (halalas), null = no cap. */
  cap: number | null;
  /** Smallest eligible amount on the order (halalas), null = none. */
  minOrder: number | null;
  scope: 'all' | 'products' | 'categories';
  products: string[];
  /** Category names (English, as on the product). */
  categories: string[];
  start: string;
  end: string | null;
  /** When the cashback reaches the wallet: on delivery, or once the return window has passed. */
  trigger: 'delivered' | 'returnWindow';
  /** Days the cashback stays usable, null = never expires. */
  expiryDays: number | null;
  by: string; at: string;
}

/* ---------- Dates ---------- */

export const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).trim();
export const orderDay = (o: Pick<Order, 'hoursAgo' | 'placedAt'>, today: string): string =>
  o.placedAt ? new Date(o.placedAt + 3 * 3600000).toISOString().slice(0, 10) : addDays(today, -Math.floor(o.hoursAgo / 24));

/* ---------- Balance and lots ---------- */

const isCredit = (t: WalletTxn) => t.amount > 0;
export const walletBalance = (ledger: WalletTxn[], customerId: string) => ledger.filter((t) => t.customerId === customerId).reduce((s, t) => s + t.amount, 0);

export interface Lot { id: string; customerId: string; kind: WalletKind; amount: number; left: number; expires: string | null; at: string; orderRef?: string }
/**
 * What is left of each credit. Expire lines close their own credit; every other debit uses the credit that
 * expires first (no-expiry credits last), so the customer never loses money that could have been spent.
 */
export function walletLots(ledger: WalletTxn[], customerId: string): Lot[] {
  const mine = ledger.filter((t) => t.customerId === customerId);
  const lots: Lot[] = mine.filter(isCredit).map((t) => ({ id: t.id, customerId, kind: t.kind, amount: t.amount, left: t.amount, expires: t.expires ?? null, at: t.at, orderRef: t.orderRef }))
    .sort((a, b) => (a.expires ?? '9999') .localeCompare(b.expires ?? '9999') || a.at.localeCompare(b.at));
  let pool = 0;
  for (const t of mine) {
    if (isCredit(t)) continue;
    const lot = t.lotId ? lots.find((l) => l.id === t.lotId) : undefined;
    if (lot) { const take = Math.min(lot.left, -t.amount); lot.left -= take; pool += -t.amount - take; } else pool += -t.amount;
  }
  for (const l of lots) { const take = Math.min(l.left, pool); l.left -= take; pool -= take; }
  return lots;
}

/** Expire lines for credits whose date has passed with something left. Returns the same array when nothing is due. */
export function syncExpiry(ledger: WalletTxn[], today: string): WalletTxn[] {
  const ids = [...new Set(ledger.map((t) => t.customerId))];
  const add: WalletTxn[] = [];
  for (const cid of ids) for (const l of walletLots(ledger, cid)) {
    if (l.left > 0 && l.expires && l.expires < today) add.push({ id: `WX-${l.id}`, customerId: cid, kind: 'expire', amount: -l.left, reason: `expired ${l.expires}`, by: 'system', at: l.expires, lotId: l.id, orderRef: l.orderRef });
  }
  return add.length ? [...add, ...ledger] : ledger;
}

export interface Expiring { customerId: string; amount: number; expires: string; days: number }
/** Credits with something left that expire within `days` (soonest first), one row per customer and day. */
export function expiringSoon(ledger: WalletTxn[], today: string, days: number): Expiring[] {
  const out: Expiring[] = [];
  for (const cid of [...new Set(ledger.map((t) => t.customerId))]) for (const l of walletLots(ledger, cid)) {
    if (l.left <= 0 || !l.expires || l.expires < today) continue;
    const d = daysBetween(today, l.expires);
    if (d > days) continue;
    const same = out.find((x) => x.customerId === cid && x.expires === l.expires);
    if (same) same.amount += l.left; else out.push({ customerId: cid, amount: l.left, expires: l.expires, days: d });
  }
  return out.sort((a, b) => a.expires.localeCompare(b.expires) || b.amount - a.amount);
}

/** The store's obligation: unspent, unexpired credit across all customers, split by what created it. */
export function walletLiability(ledger: WalletTxn[], today: string, soonDays = 30) {
  let outstanding = 0, noExpiry = 0, soon = 0, customers = 0;
  const bySource: Record<'credit' | 'refund' | 'cashback' | 'other', number> = { credit: 0, refund: 0, cashback: 0, other: 0 };
  for (const cid of [...new Set(ledger.map((t) => t.customerId))]) {
    let has = false;
    for (const l of walletLots(ledger, cid)) {
      if (l.left <= 0 || (l.expires && l.expires < today)) continue;
      has = true;
      outstanding += l.left;
      if (!l.expires) noExpiry += l.left; else if (daysBetween(today, l.expires) <= soonDays) soon += l.left;
      const k = l.kind === 'credit' || l.kind === 'refund' || l.kind === 'cashback' ? l.kind : 'other';
      bySource[k] += l.left;
    }
    if (has) customers++;
  }
  const sum = (k: WalletKind) => ledger.filter((t) => t.kind === k).reduce((s, t) => s + t.amount, 0);
  return {
    outstanding, noExpiry, soon, customers, bySource,
    added: ledger.filter(isCredit).filter((t) => t.kind !== 'unspend').reduce((s, t) => s + t.amount, 0),
    spent: -(sum('spend') + sum('unspend')),
    expired: -sum('expire'),
    removed: -(sum('debit') + sum('reverse')),
  };
}

/* ---------- Checkout ---------- */

export const walletCap = (s: Pick<WalletSettings, 'capType' | 'capPct' | 'capFixed'>, orderTotal: number) =>
  s.capType === 'pct' ? Math.floor((orderTotal * s.capPct) / 100) : s.capFixed;

/** How much of an order the wallet may pay: limited by the balance, the merchant's cap and the order total. */
export function walletUse(balance: number, orderTotal: number, s: Pick<WalletSettings, 'enabled' | 'capType' | 'capPct' | 'capFixed'>, want?: number) {
  if (!s.enabled || balance <= 0 || orderTotal <= 0) return { max: 0, applied: 0, cappedBy: null as null | 'balance' | 'cap' | 'total', rest: orderTotal };
  const cap = walletCap(s, orderTotal);
  const max = Math.max(0, Math.min(balance, cap, orderTotal));
  const cappedBy = max === balance ? 'balance' as const : max === cap ? 'cap' as const : 'total' as const;
  const applied = Math.max(0, Math.min(max, want ?? max));
  return { max, applied, cappedBy, rest: orderTotal - applied };
}

/* ---------- Manual credit / debit ---------- */

export type AdjustError = 'amount' | 'exceeds' | 'reason' | 'expires' | 'customers';
export const MAX_CREDIT = 5_000_00;
export function validateAdjust(d: { dir: 'credit' | 'debit'; amount: string; reason: string; expires: string }, balance: number, parseMoney: (s: string) => number | null, today: string): Partial<Record<AdjustError, true>> {
  const e: Partial<Record<AdjustError, true>> = {};
  const v = parseMoney(d.amount);
  if (v === null || v <= 0 || v > MAX_CREDIT) e.amount = true;
  else if (d.dir === 'debit' && v > balance) e.exceeds = true;
  if (d.reason.trim().length < 3) e.reason = true;
  if (d.dir === 'credit' && d.expires && d.expires <= today) e.expires = true;
  return e;
}

let seq = 0;
const nid = (p: string, seed: number) => `${p}-${seed.toString(36).toUpperCase()}${(++seq).toString(36).toUpperCase()}`;

export function adjustWallet(ledger: WalletTxn[], d: { customerId: string; dir: 'credit' | 'debit'; amount: number; reason: string; expires: string | null; batchId?: string }, ctx: { by: string; today: string; seed: number }): { ledger: WalletTxn[]; txn: WalletTxn } {
  const txn: WalletTxn = {
    id: nid('WT', ctx.seed), customerId: d.customerId, kind: d.dir, amount: d.dir === 'credit' ? d.amount : -d.amount, reason: d.reason.trim(), by: ctx.by, at: ctx.today,
    ...(d.dir === 'credit' ? { expires: d.expires } : {}), ...(d.batchId ? { batchId: d.batchId } : {}),
  };
  return { ledger: [txn, ...ledger], txn };
}

/** Credit many customers at once (a segment). One line each, sharing a batch id so the batch can be found and reversed. */
export function bulkCredit(ledger: WalletTxn[], ids: string[], d: { amount: number; reason: string; expires: string | null }, ctx: { by: string; today: string; seed: number }): { ledger: WalletTxn[]; batchId: string; count: number } {
  const batchId = nid('WB', ctx.seed);
  const add: WalletTxn[] = [...new Set(ids)].map((cid, i) => ({ id: `${batchId}-${i + 1}`, customerId: cid, kind: 'credit', amount: d.amount, reason: d.reason.trim(), by: ctx.by, at: ctx.today, expires: d.expires, batchId }));
  return { ledger: [...add, ...ledger], batchId, count: add.length };
}

/** Undo a bulk credit: takes back what is still unspent of each line in the batch (spent money is not clawed back). */
export function reverseBatch(ledger: WalletTxn[], batchId: string, ctx: { by: string; today: string; reason: string }): { ledger: WalletTxn[]; taken: number; kept: number } {
  const lines = ledger.filter((t) => t.batchId === batchId && t.kind === 'credit');
  if (ledger.some((t) => t.batchId === batchId && t.kind === 'debit')) return { ledger, taken: 0, kept: 0 };
  let taken = 0, kept = 0;
  const add: WalletTxn[] = [];
  for (const l of lines) {
    const left = walletLots(ledger, l.customerId).find((x) => x.id === l.id)?.left ?? 0;
    const can = Math.min(left, walletBalance(ledger, l.customerId));
    if (can > 0) add.push({ id: `${l.id}-R`, customerId: l.customerId, kind: 'debit', amount: -can, reason: ctx.reason, by: ctx.by, at: ctx.today, batchId, lotId: l.id });
    taken += can; kept += l.amount - can;
  }
  return { ledger: add.length ? [...add, ...ledger] : ledger, taken, kept };
}

/** A refund paid as store credit instead of to the card: tied to the order and the refund it settles. */
export function refundToWallet(ledger: WalletTxn[], d: { customerId: string; amount: number; orderRef: string; refundId: string; reason: string; expires: string | null }, ctx: { by: string; today: string }): WalletTxn[] {
  if (ledger.some((t) => t.refundId === d.refundId)) return ledger;
  return [{ id: `WR-${d.refundId}`, customerId: d.customerId, kind: 'refund', amount: d.amount, reason: d.reason, by: ctx.by, at: ctx.today, expires: d.expires, orderRef: d.orderRef, refundId: d.refundId }, ...ledger];
}

/** Paying part of an online order from the wallet. Once per order: a retried payment does not take twice. */
export function spendWallet(ledger: WalletTxn[], d: { customerId: string; amount: number; orderRef: string }, today: string): WalletTxn[] {
  if (d.amount <= 0 || ledger.some((t) => t.kind === 'spend' && t.orderRef === d.orderRef)) return ledger;
  const amount = Math.min(d.amount, walletBalance(ledger, d.customerId));
  if (amount <= 0) return ledger;
  return [{ id: `WS-${d.orderRef}`, customerId: d.customerId, kind: 'spend', amount: -amount, reason: 'checkout', by: 'customer', at: today, orderRef: d.orderRef }, ...ledger];
}
/** Paid from the wallet on an order that was then cancelled or never paid: the amount goes back to the wallet. */
export function unspendWallet(ledger: WalletTxn[], orderRef: string, today: string): WalletTxn[] {
  const s = ledger.find((t) => t.kind === 'spend' && t.orderRef === orderRef);
  if (!s || ledger.some((t) => t.kind === 'unspend' && t.orderRef === orderRef)) return ledger;
  return [{ id: `WU-${orderRef}`, customerId: s.customerId, kind: 'unspend', amount: -s.amount, reason: 'order not completed', by: 'system', at: today, orderRef, expires: null }, ...ledger];
}
export const walletPaid = (ledger: WalletTxn[], orderRef: string) => {
  const s = ledger.find((t) => t.kind === 'spend' && t.orderRef === orderRef);
  const back = ledger.find((t) => t.kind === 'unspend' && t.orderRef === orderRef);
  return s && !back ? -s.amount : 0;
};

/* ---------- Settings ---------- */

export type SettingsError = 'capPct' | 'capFixed' | 'expiry' | 'warnDays';
export interface SettingsDraft { enabled: boolean; capType: 'pct' | 'fixed'; capPct: string; capFixed: string; expiryDays: string; warnOn: boolean; warnDays: string }
export const settingsDraft = (s: WalletSettings): SettingsDraft => ({ enabled: s.enabled, capType: s.capType, capPct: String(s.capPct), capFixed: (s.capFixed / 100).toString(), expiryDays: s.expiryDays === null ? '' : String(s.expiryDays), warnOn: s.warnOn, warnDays: String(s.warnDays) });
const int = (s: string) => (/^\d+$/.test(toLatinDigits(s)) ? Number(toLatinDigits(s)) : null);
export function validateSettings(d: SettingsDraft, parseMoney: (s: string) => number | null): Partial<Record<SettingsError, true>> {
  const e: Partial<Record<SettingsError, true>> = {};
  const p = int(d.capPct), f = parseMoney(d.capFixed), x = d.expiryDays.trim() ? int(d.expiryDays) : 0, w = int(d.warnDays);
  if (d.capType === 'pct' && (p === null || p < 1 || p > 100)) e.capPct = true;
  if (d.capType === 'fixed' && (f === null || f < 100 || f > MAX_CREDIT)) e.capFixed = true;
  if (x === null || (d.expiryDays.trim() && (x! < 7 || x! > 1095))) e.expiry = true;
  if (d.warnOn && (w === null || w < 1 || w > 60)) e.warnDays = true;
  return e;
}
export function fromSettingsDraft(d: SettingsDraft, base: WalletSettings, parseMoney: (s: string) => number | null): WalletSettings {
  return { ...base, enabled: d.enabled, capType: d.capType, capPct: int(d.capPct) ?? base.capPct, capFixed: parseMoney(d.capFixed) ?? base.capFixed, expiryDays: d.expiryDays.trim() ? int(d.expiryDays) : null, warnOn: d.warnOn, warnDays: int(d.warnDays) ?? base.warnDays };
}

/* ---------- Cashback ---------- */

export interface OfferDraft { name: string; kind: 'pct' | 'fixed'; value: string; cap: string; minOrder: string; scope: CashbackOffer['scope']; products: string[]; categories: string[]; start: string; end: string; trigger: CashbackOffer['trigger']; expiryDays: string }
export type OfferError = 'name' | 'value' | 'cap' | 'minOrder' | 'scope' | 'end' | 'expiry';
export const emptyOffer = (today: string): OfferDraft => ({ name: '', kind: 'pct', value: '', cap: '', minOrder: '', scope: 'all', products: [], categories: [], start: today, end: '', trigger: 'returnWindow', expiryDays: '90' });
export const offerDraft = (o: CashbackOffer): OfferDraft => ({ name: o.name, kind: o.kind, value: o.kind === 'pct' ? String(o.value) : (o.value / 100).toString(), cap: o.cap === null ? '' : (o.cap / 100).toString(), minOrder: o.minOrder === null ? '' : (o.minOrder / 100).toString(), scope: o.scope, products: o.products, categories: o.categories, start: o.start, end: o.end ?? '', trigger: o.trigger, expiryDays: o.expiryDays === null ? '' : String(o.expiryDays) });
export function validateOffer(d: OfferDraft, parseMoney: (s: string) => number | null): Partial<Record<OfferError, true>> {
  const e: Partial<Record<OfferError, true>> = {};
  if (d.name.trim().length < 2) e.name = true;
  if (d.kind === 'pct') { const v = int(d.value); if (v === null || v < 1 || v > 50) e.value = true; }
  else { const v = parseMoney(d.value); if (v === null || v < 100 || v > 1_000_00) e.value = true; }
  if (d.cap.trim()) { const c = parseMoney(d.cap); if (c === null || c < 100) e.cap = true; }
  if (d.minOrder.trim() && parseMoney(d.minOrder) === null) e.minOrder = true;
  if ((d.scope === 'products' && !d.products.length) || (d.scope === 'categories' && !d.categories.length)) e.scope = true;
  if (d.end && d.end < d.start) e.end = true;
  if (d.expiryDays.trim()) { const x = int(d.expiryDays); if (x === null || x < 7 || x > 1095) e.expiry = true; }
  return e;
}
export function fromOfferDraft(d: OfferDraft, base: { id: string; status: CashbackOffer['status']; by: string; at: string }, parseMoney: (s: string) => number | null): CashbackOffer {
  return {
    ...base, name: d.name.trim(), kind: d.kind, value: d.kind === 'pct' ? int(d.value) ?? 0 : parseMoney(d.value) ?? 0,
    cap: d.cap.trim() ? parseMoney(d.cap) : null, minOrder: d.minOrder.trim() ? parseMoney(d.minOrder) : null,
    scope: d.scope, products: d.scope === 'products' ? d.products : [], categories: d.scope === 'categories' ? d.categories : [],
    start: d.start, end: d.end || null, trigger: d.trigger, expiryDays: d.expiryDays.trim() ? int(d.expiryDays) : null,
  };
}
export const offerLive = (o: CashbackOffer, today: string) => o.status === 'active' && o.start <= today && (!o.end || o.end >= today);
export type OfferState = 'active' | 'scheduled' | 'paused' | 'ended';
export const offerState = (o: CashbackOffer, today: string): OfferState => (o.end && o.end < today ? 'ended' : o.status === 'paused' ? 'paused' : o.start > today ? 'scheduled' : 'active');

const productOf = (products: Product[], sku: string) => products.find((p) => p.sku === sku || p.variants.some((v) => v.sku === sku) || sku.startsWith(`${p.sku}-`));
export function customerOf(o: Pick<Order, 'customerId' | 'customer'>, customers: Customer[]): Customer | undefined {
  return o.customerId ? customers.find((c) => c.id === o.customerId) : customers.find((c) => c.name.en === o.customer.en);
}

/** Cashback amount for one order: on eligible goods after refunds and the order discount (never on shipping). */
export function cashbackAmount(offer: Pick<CashbackOffer, 'kind' | 'value' | 'cap' | 'minOrder' | 'scope' | 'products' | 'categories'>, o: Order, products: Product[]): { base: number; amount: number; capped: boolean } {
  const refunded = (i: number) => o.refunds.filter((r) => r.status !== 'failed').reduce((s, r) => s + (r.qty[i] ?? 0), 0);
  const goods = o.items.reduce((s, it) => s + it.qty * it.unit, 0);
  let base = 0;
  o.items.forEach((it, i) => {
    const p = productOf(products, it.sku);
    const ok = offer.scope === 'all' || (offer.scope === 'products' ? !!p && offer.products.includes(p.id) : !!p && offer.categories.includes(p.category.en));
    if (ok) base += Math.max(0, it.qty - refunded(i)) * it.unit;
  });
  if (goods > 0 && o.discount) base -= Math.round((o.discount * base) / goods);
  base = Math.max(0, base);
  if (base === 0 || (offer.minOrder !== null && base < offer.minOrder)) return { base, amount: 0, capped: false };
  const raw = offer.kind === 'pct' ? Math.floor((base * offer.value) / 100) : offer.value;
  const amount = offer.cap !== null ? Math.min(raw, offer.cap) : raw;
  return { base, amount, capped: amount < raw };
}

export type CashbackState = 'credited' | 'waiting_delivery' | 'in_window' | 'due' | 'void';
export interface CashbackRow { offerId: string; orderRef: string; customerId: string; base: number; amount: number; state: CashbackState; dueOn: string | null; credited: number }

/**
 * Where each order stands for an offer: placed while the offer was live, paid, not cancelled, a known customer.
 * Credit day = delivery (approximated by the order day when the delivery day is not recorded) + the return window.
 */
export function cashbackRows(offer: CashbackOffer, orders: Order[], products: Product[], customers: Customer[], ledger: WalletTxn[], returnDays: number, today: string): CashbackRow[] {
  const out: CashbackRow[] = [];
  for (const o of orders) {
    const day = orderDay(o, today);
    if (day < offer.start || (offer.end && day > offer.end)) continue;
    if (offer.status === 'paused' && !ledger.some((t) => t.offerId === offer.id && t.orderRef === o.ref)) continue;
    const c = customerOf(o, customers);
    if (!c) continue;
    const credited = ledger.filter((t) => t.offerId === offer.id && t.orderRef === o.ref && (t.kind === 'cashback' || t.kind === 'reverse')).reduce((s, t) => s + t.amount, 0);
    const failed = o.pay === 'failed' || !!o.cancelled;
    const q = cashbackAmount(offer, o, products);
    if (q.amount === 0 && credited === 0) continue;
    const delivered = o.ship === 'delivered' || (o.items.length > 0 && o.items.every((i) => !!i.noShip) && o.ful === 'done');
    const dueOn = delivered ? (offer.trigger === 'delivered' ? day : addDays(day, returnDays)) : null;
    const state: CashbackState = failed || q.amount === 0 ? (credited > 0 ? 'credited' : 'void')
      : credited > 0 ? 'credited' : !delivered ? 'waiting_delivery' : dueOn! > today ? 'in_window' : 'due';
    out.push({ offerId: offer.id, orderRef: o.ref, customerId: c.id, base: q.base, amount: failed ? 0 : q.amount, state, dueOn, credited });
  }
  return out;
}

/**
 * Credit cashback that is due, and take back cashback a later refund removed (only what is still in the wallet).
 * Returns the same array when nothing changes.
 */
export function syncCashback(ledger: WalletTxn[], offers: CashbackOffer[], orders: Order[], products: Product[], customers: Customer[], returnDays: number, today: string): WalletTxn[] {
  let next = ledger;
  for (const offer of offers) for (const r of cashbackRows(offer, orders, products, customers, next, returnDays, today)) {
    if (r.state === 'due' && r.credited === 0 && r.amount > 0) {
      next = [{ id: `WC-${offer.id}-${r.orderRef}`, customerId: r.customerId, kind: 'cashback', amount: r.amount, reason: offer.name, by: 'system', at: today, expires: offer.expiryDays === null ? null : addDays(today, offer.expiryDays), orderRef: r.orderRef, offerId: offer.id }, ...next];
    } else if (r.credited > r.amount) {
      const take = Math.min(r.credited - r.amount, walletBalance(next, r.customerId));
      if (take > 0) next = [{ id: `WV-${offer.id}-${r.orderRef}-${next.length}`, customerId: r.customerId, kind: 'reverse', amount: -take, reason: offer.name, by: 'system', at: today, orderRef: r.orderRef, offerId: offer.id }, ...next];
    }
  }
  return next;
}

export function offerResults(rows: CashbackRow[]) {
  const by = (s: CashbackState) => rows.filter((r) => r.state === s);
  const sales = rows.filter((r) => r.state !== 'void').reduce((s, r) => s + r.base, 0);
  const credited = rows.reduce((s, r) => s + r.credited, 0);
  const pending = [...by('waiting_delivery'), ...by('in_window'), ...by('due')].reduce((s, r) => s + r.amount, 0);
  return {
    orders: rows.filter((r) => r.state !== 'void').length, customers: new Set(rows.filter((r) => r.state !== 'void').map((r) => r.customerId)).size,
    credited, pending, sales, costPct: sales ? Math.round(((credited + pending) * 1000) / sales) / 10 : null,
    waiting: by('waiting_delivery').length + by('in_window').length, voided: by('void').length,
  };
}

/** Sample preview: what one order of `total` earns. */
export const cashbackPreview = (o: Pick<CashbackOffer, 'kind' | 'value' | 'cap' | 'minOrder'>, total: number) => {
  if (o.minOrder !== null && total < o.minOrder) return 0;
  const raw = o.kind === 'pct' ? Math.floor((total * o.value) / 100) : o.value;
  return o.cap !== null ? Math.min(raw, o.cap) : raw;
};

/* ---------- Expiry reminders ---------- */

export function expiryMessage(lang: 'ar' | 'en', d: { name: string; amount: string; expires: string; store: string }): string {
  return lang === 'ar'
    ? `مرحبًا ${d.name}، رصيدك ${d.amount} ر.س في محفظة ${d.store} ينتهي ${d.expires}. استخدمه في طلبك القادم قبل انتهائه.`
    : `Hi ${d.name}, SAR ${d.amount} of store credit at ${d.store} expires on ${d.expires}. Use it on your next order before then.`;
}

/* ---------- Fixtures (the merchant's own demo data) ---------- */

export const walletSettingsFixture = (): WalletSettings => ({ enabled: true, capType: 'pct', capPct: 50, capFixed: 200_00, expiryDays: 180, warnOn: true, warnDays: 7, version: 1, by: 'المالك', at: '2026-11-02' });

export function cashbackFixtures(): CashbackOffer[] {
  return [{ id: 'CB-1', name: 'كاش باك نوفمبر 5%', status: 'active', kind: 'pct', value: 5, cap: 50_00, minOrder: 100_00, scope: 'all', products: [], categories: [], start: '2026-11-06', end: '2026-11-30', trigger: 'returnWindow', expiryDays: 60, by: 'المالك', at: '2026-10-30' }];
}

export function walletFixtures(): WalletTxn[] {
  const t = (id: string, customerId: string, kind: WalletKind, amount: number, reason: string, at: string, extra: Partial<WalletTxn> = {}): WalletTxn => ({ id, customerId, kind, amount, reason, by: 'المالك', at, ...extra });
  return [
    t('WT-F6', 'C-1003', 'spend', -40_00, 'checkout', '2026-11-17', { by: 'customer', orderRef: '10433' }),
    t('WT-F5', 'C-1002', 'credit', 25_00, 'تعويض عن تأخر الشحن', '2026-11-18', { expires: '2026-11-29' }),
    t('WT-F4', 'C-1005', 'credit', 30_00, 'هدية عيد ميلاد', '2026-10-28', { expires: '2026-11-27' }),
    t('WT-F3', 'C-1003', 'credit', 120_00, 'تعويض: وصل الطلب متأخرًا 5 أيام', '2026-11-12', { expires: '2027-05-11', orderRef: '10346' }),
    t('WT-F2', 'C-1001', 'credit', 50_00, 'اعتذار عن قطعة ناقصة', '2026-11-05', { expires: null }),
    t('WT-F1', 'C-1004', 'credit', 20_00, 'رصيد ترحيبي', '2026-09-01', { expires: '2026-10-31' }),
  ];
}

export const kindLabel: Record<WalletKind, L> = {
  credit: { ar: 'إضافة يدوية', en: 'Manual credit' }, debit: { ar: 'خصم يدوي', en: 'Manual debit' }, refund: { ar: 'استرداد كرصيد', en: 'Refund as credit' },
  cashback: { ar: 'كاش باك', en: 'Cashback' }, spend: { ar: 'دفع في طلب', en: 'Paid on order' }, expire: { ar: 'انتهت صلاحيته', en: 'Expired' },
  reverse: { ar: 'سحب كاش باك لاسترداد', en: 'Cashback taken back (refund)' }, unspend: { ar: 'أُعيد من طلب لم يكتمل', en: 'Returned from unfinished order' },
};
