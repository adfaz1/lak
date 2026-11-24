// Inventory section: screen rules only (no React). Levels, adjustments, transfers and coverage come from
// merchant/inventory.ts (single source of truth); this file shapes them for the screens.
//   on hand   = units physically at the warehouse
//   reserved  = units held for paid orders not yet fulfilled
//   available = on hand − reserved (what can still be sold)
//   incoming  = units in a sent transfer, not yet received; never sold automatically
import { LOC_IDS, type L, type LocId } from '../../merchant/domain';
import { normaliseDigits, skusOf, variantText, type Product } from '../../merchant/catalog';
import {
  available, coverage, levelOf, lowStock, type Coverage, type History, type Level, type LogReason, type StockLog, type Transfer, type TransferStatus,
} from '../../merchant/inventory';

export interface SkuInfo { productId: string | undefined; name: L; variant: L }

/** Product name and variant label for every SKU in the catalogue. */
export function skuInfo(products: Product[]): Map<string, SkuInfo> {
  const m = new Map<string, SkuInfo>();
  for (const p of products) for (const s of skusOf(p)) {
    const v = p.variants.find((x) => x.sku === s);
    m.set(s, { productId: p.id, name: p.name, variant: v ? variantText(v.color, v.size) : { ar: '', en: '' } });
  }
  return m;
}
export const infoFor = (m: Map<string, SkuInfo>, sku: string): SkuInfo => m.get(sku) ?? { productId: undefined, name: { ar: sku, en: sku }, variant: { ar: '', en: '' } };

export type Tab = 'levels' | 'low' | 'transfers' | 'log';
export const readTab = (v: string | null): Tab => (v === 'low' || v === 'transfers' || v === 'log' ? v : 'levels');
export const readLoc = (v: string | null): LocId | '' => (v === 'ryd' || v === 'jed' ? v : '');

export interface LevelRow extends Level { key: string; available: number; low: boolean; info: SkuInfo }
export const levelKey = (l: Pick<Level, 'sku' | 'loc'>) => `${l.sku}@${l.loc}`;

const matches = (q: string, sku: string, i: SkuInfo) => {
  const n = q.trim().toLowerCase();
  return !n || sku.toLowerCase().includes(n) || i.name.en.toLowerCase().includes(n) || i.name.ar.includes(q.trim()) || i.variant.en.toLowerCase().includes(n) || i.variant.ar.includes(q.trim());
};

/** Levels per SKU and warehouse, filtered by search and warehouse; low rows only on the low-stock view. */
export function levelRows(levels: Level[], info: Map<string, SkuInfo>, f: { q: string; loc: LocId | ''; lowOnly?: boolean }): LevelRow[] {
  return levels
    .map((l) => ({ ...l, key: levelKey(l), available: available(l), low: available(l) <= l.threshold, info: infoFor(info, l.sku) }))
    .filter((r) => (!f.loc || r.loc === f.loc) && (!f.lowOnly || r.low) && matches(f.q, r.sku, r.info))
    .sort((a, b) => (f.lowOnly ? a.available - b.available : 0) || a.sku.localeCompare(b.sku) || LOC_IDS.indexOf(a.loc) - LOC_IDS.indexOf(b.loc));
}

/** Days of cover for a low row, from sales across all warehouses (never estimated without 14 days of history). */
export function coverFor(levels: Level[], sku: string, history: History[]): Coverage {
  const total = levels.filter((l) => l.sku === sku).reduce((s, l) => s + available(l), 0);
  return coverage(total, history.find((h) => h.sku === sku));
}

export function tabCounts(levels: Level[], transfers: Transfer[], log: StockLog[]) {
  return { low: lowStock(levels).length, transfers: transfers.filter((t) => t.status === 'draft' || t.status === 'sent' || t.status === 'partial').length, log: log.length };
}

/* ---------- Adjustments ---------- */

/** "+5", "-2", "٥", "−3" → whole number; null when not a whole number. */
export function parseDelta(input: string): number | null {
  const s = normaliseDigits(input.replace(/[−–]/g, '-')).replace(/^\+/, '');
  return /^-?\d+$/.test(s) ? Number(s) : null;
}

export interface AdjustPreview { delta: number | null; ready: boolean; onHand: [number, number]; available: [number, number]; belowZero: boolean; oversold: boolean }
/** What the adjustment would do to the level the merchant saw when opening the form. */
export function adjustPreview(seen: Level, input: string): AdjustPreview {
  const delta = parseDelta(input);
  const after = seen.onHand + (delta ?? 0);
  return {
    delta, ready: delta !== null && delta !== 0 && after >= 0,
    onHand: [seen.onHand, after], available: [available(seen), after - seen.reserved],
    belowZero: after < 0, oversold: delta !== null && delta < 0 && after >= 0 && after < seen.reserved,
  };
}
export const nextAdjId = (log: StockLog[]) => `ADJ-${Math.max(201, ...log.filter((x) => x.id.startsWith('ADJ-')).map((x) => Number(x.id.slice(4)) || 0)) + 1}`;

/* ---------- Log ---------- */

export function logRows(log: StockLog[], info: Map<string, SkuInfo>, f: { q: string; loc: LocId | '' }): (StockLog & { info: SkuInfo })[] {
  return log.map((x) => ({ ...x, info: infoFor(info, x.sku) })).filter((x) => (!f.loc || x.loc === f.loc) && (matches(f.q, x.sku, x.info) || (x.ref ?? '').toLowerCase().includes(f.q.trim().toLowerCase()) || x.id.toLowerCase().includes(f.q.trim().toLowerCase())));
}
export const REASON_ORDER: LogReason[] = ['received', 'count', 'damaged', 'returned', 'other', 'transferOut', 'transferIn', 'discrepancy', 'fulfilled'];

/* ---------- Transfers ---------- */

export const units = (t: Transfer) => ({ qty: t.lines.reduce((s, l) => s + l.qty, 0), received: t.lines.reduce((s, l) => s + l.received, 0) });
export const isOpen = (t: Transfer) => t.status === 'draft' || t.status === 'sent' || t.status === 'partial';

export function nextTransferId(ts: Transfer[]): string {
  return `TR-${Math.max(1002, ...ts.map((t) => Number(t.id.slice(3)) || 0)) + 1}`;
}
/** A new draft, optionally prefilled from a low-stock row: ship to the low warehouse from the other one. */
export function newTransfer(ts: Transfer[], sku?: string | null, to?: string | null): Transfer {
  const dest: LocId = to === 'jed' ? 'jed' : 'ryd';
  return { id: nextTransferId(ts), from: dest === 'ryd' ? 'jed' : 'ryd', to: dest, status: 'draft', note: '', discrepancy: [], lines: sku ? [{ sku, qty: 1, received: 0 }] : [] };
}

/** Steps for the transfer stepper; partial receipt and discrepancy show on the third/fourth step. */
export type Stage = 'draft' | 'sent' | 'receiving' | 'done';
export function stageOf(s: TransferStatus): { index: number; stages: Stage[] } {
  const stages: Stage[] = ['draft', 'sent', 'receiving', 'done'];
  const index = { draft: 0, sent: 1, partial: 2, received: 3, closed: 3 }[s];
  return { index, stages };
}

/** Parse "receive now" inputs; blank counts as zero. Invalid entries are reported per line. */
export function parseReceive(inputs: string[], t: Transfer): { qty: number[]; bad: number[] } {
  const qty: number[] = [];
  const bad: number[] = [];
  t.lines.forEach((l, i) => {
    const raw = (inputs[i] ?? '').trim();
    const n = raw ? parseDelta(raw) : 0;
    if (n === null || n < 0 || n > l.qty - l.received) bad.push(i);
    qty.push(n ?? 0);
  });
  return { qty, bad };
}
/** Fill every line with what is still outstanding. */
export const receiveAll = (t: Transfer) => t.lines.map((l) => String(l.qty - l.received));

/** Log entries for a sent transfer (units leave the source). `after` is the level list after sending. */
export function sendLog(t: Transfer, after: Level[], who: string): StockLog[] {
  return t.lines.filter((l) => l.qty > 0).map((l, i) => {
    const lv = levelOf(after, l.sku, t.from)!;
    return { id: `${t.id}-O${i + 1}`, sku: l.sku, loc: t.from, delta: -l.qty, before: lv.onHand + l.qty, after: lv.onHand, reason: 'transferOut', who, ref: t.id };
  });
}
/** Log entries for a receipt (units arrive at the destination). */
export function receiveLog(t: Transfer, qty: number[], after: Level[], who: string): StockLog[] {
  return t.lines.flatMap((l, i) => {
    const n = qty[i] ?? 0;
    if (!n) return [];
    const lv = levelOf(after, l.sku, t.to)!;
    return [{ id: `${t.id}-I${i + 1}-${l.received + n}`, sku: l.sku, loc: t.to, delta: n, before: lv.onHand - n, after: lv.onHand, reason: 'transferIn' as const, who, ref: t.id }];
  });
}
/** Discrepancy entries: units that never arrived (on hand unchanged; recorded for the audit trail). */
export function discrepancyLog(t: Transfer, levels: Level[], who: string): StockLog[] {
  return t.discrepancy.map((d, i) => {
    const lv = levelOf(levels, d.sku, t.to);
    return { id: `${t.id}-D${i + 1}`, sku: d.sku, loc: t.to, delta: 0, before: lv?.onHand ?? 0, after: lv?.onHand ?? 0, reason: 'discrepancy' as const, who, ref: t.id, note: t.note };
  });
}
