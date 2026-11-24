// Inventory domain: per-location levels, adjustments with optimistic versions, transfers and low-stock coverage.
// Definitions (shown in the UI as well):
//   on hand   = units physically at the location
//   reserved  = units held for paid orders not yet fulfilled
//   available = on hand − reserved (what can still be sold)
//   incoming  = units in a sent transfer, not yet received; never sold automatically
import { LOC_IDS, type LocId } from './domain';

export interface Level { sku: string; loc: LocId; onHand: number; reserved: number; incoming: number; version: number; threshold: number }
export const available = (l: Level) => l.onHand - l.reserved;

export type AdjReason = 'received' | 'count' | 'damaged' | 'returned' | 'other';
export const ADJ_REASONS: AdjReason[] = ['received', 'count', 'damaged', 'returned', 'other'];
export type LogReason = AdjReason | 'transferOut' | 'transferIn' | 'discrepancy' | 'fulfilled';
export interface StockLog { id: string; sku: string; loc: LocId; delta: number; before: number; after: number; reason: LogReason; who: string; ref?: string; note?: string }

export interface History { sku: string; days: number; sold: number }
export const MIN_HISTORY_DAYS = 14;

function hash(s: string): number { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

const OVERRIDES: Record<string, Partial<Record<LocId, Partial<Level>>>> = {
  'ABY-LIN-BLA-M': { ryd: { onHand: 2, reserved: 1 }, jed: { onHand: 3 } },
  'OUD-100': { ryd: { onHand: 4, reserved: 1 }, jed: { onHand: 0 } },
  'COF-SET-01': { ryd: { onHand: 0 }, jed: { onHand: 2 } },
  'SHL-SLK-01': { ryd: { onHand: 3, reserved: 2 }, jed: { onHand: 6, incoming: 4 } },
  'BAG-LTH-01': { ryd: { onHand: 7, reserved: 1 }, jed: { onHand: 1 } },
  'WLT-LTH-01': { ryd: { onHand: 9, reserved: 2 }, jed: { onHand: 4 } },
};

export function initialLevels(skus: string[]): Level[] {
  return skus.flatMap((sku) => LOC_IDS.map((loc) => {
    const h = hash(sku + loc);
    const base: Level = { sku, loc, onHand: 5 + (h % 20), reserved: 0, incoming: 0, version: 1, threshold: 3 };
    return { ...base, ...OVERRIDES[sku]?.[loc] };
  }));
}

export function historyFixtures(): History[] {
  return [
    { sku: 'OUD-100', days: 60, sold: 90 },
    { sku: 'ABY-LIN-BLA-M', days: 45, sold: 30 },
    { sku: 'SHL-SLK-01', days: 90, sold: 72 },
    { sku: 'COF-SET-01', days: 6, sold: 4 },
    { sku: 'BAG-LTH-01', days: 30, sold: 0 },
  ];
}

export const levelOf = (levels: Level[], sku: string, loc: LocId) => levels.find((l) => l.sku === sku && l.loc === loc);
export const totalAvailable = (levels: Level[], skus: string[]) => levels.filter((l) => skus.includes(l.sku)).reduce((s, l) => s + available(l), 0);

export type AdjError = 'zero' | 'belowZero' | 'conflict' | 'notFound' | 'reason';
export interface AdjResult { levels: Level[]; log?: StockLog; error?: AdjError; oversold?: boolean; current?: Level }

/**
 * Apply a stock adjustment. `expectedVersion` is the version the user saw when opening the form:
 * if someone else changed the level since, nothing is written and the current level is returned.
 */
export function adjust(levels: Level[], sku: string, loc: LocId, delta: number, reason: AdjReason | '', expectedVersion: number, who: string, id: string, note = ''): AdjResult {
  const cur = levelOf(levels, sku, loc);
  if (!cur) return { levels, error: 'notFound' };
  if (!reason) return { levels, error: 'reason' };
  if (!Number.isInteger(delta) || delta === 0) return { levels, error: 'zero' };
  if (cur.version !== expectedVersion) return { levels, error: 'conflict', current: cur };
  const after = cur.onHand + delta;
  if (after < 0) return { levels, error: 'belowZero' };
  const next: Level = { ...cur, onHand: after, version: cur.version + 1 };
  return {
    levels: levels.map((l) => (l === cur ? next : l)),
    log: { id, sku, loc, delta, before: cur.onHand, after, reason, who, note },
    oversold: after < cur.reserved,
  };
}

/** Simulate a colleague changing a level (used by the test tool to demonstrate conflict handling). */
export function bumpBySomeoneElse(levels: Level[], sku: string, loc: LocId, delta: number): Level[] {
  return levels.map((l) => (l.sku === sku && l.loc === loc ? { ...l, onHand: Math.max(0, l.onHand + delta), version: l.version + 1 } : l));
}

/* ---------- Transfers ---------- */

export type TransferStatus = 'draft' | 'sent' | 'partial' | 'received' | 'closed';
export interface TransferLine { sku: string; qty: number; received: number }
export interface Transfer { id: string; from: LocId; to: LocId; lines: TransferLine[]; status: TransferStatus; discrepancy: { sku: string; units: number }[]; note: string }

export function transferFixtures(): Transfer[] {
  return [
    { id: 'TR-1002', from: 'jed', to: 'ryd', status: 'draft', note: '', discrepancy: [], lines: [{ sku: 'ABY-LIN-BLA-M', qty: 2, received: 0 }, { sku: 'COF-SET-01', qty: 1, received: 0 }] },
    { id: 'TR-1001', from: 'ryd', to: 'jed', status: 'sent', note: '', discrepancy: [], lines: [{ sku: 'SHL-SLK-01', qty: 4, received: 0 }] },
  ];
}

const withLevel = (levels: Level[], sku: string, loc: LocId, f: (l: Level) => Level): Level[] => {
  const has = levelOf(levels, sku, loc);
  if (!has) return [...levels, f({ sku, loc, onHand: 0, reserved: 0, incoming: 0, version: 1, threshold: 3 })];
  return levels.map((l) => (l === has ? f(l) : l));
};

export type TransferError = 'empty' | 'sameLoc' | 'insufficient' | 'state' | 'qty';

export function validateTransferDraft(levels: Level[], t: Transfer): { error: TransferError | null; short: string[] } {
  if (t.from === t.to) return { error: 'sameLoc', short: [] };
  const lines = t.lines.filter((l) => l.qty > 0);
  if (!lines.length) return { error: 'empty', short: [] };
  if (t.lines.some((l) => !Number.isInteger(l.qty) || l.qty < 0)) return { error: 'qty', short: [] };
  const short = lines.filter((l) => { const lv = levelOf(levels, l.sku, t.from); return !lv || available(lv) < l.qty; }).map((l) => l.sku);
  return { error: short.length ? 'insufficient' : null, short };
}

/** Draft → sent. Units leave the source on hand and appear as incoming at the destination. Sending twice is a no-op. */
export function sendTransfer(levels: Level[], t: Transfer): { levels: Level[]; transfer: Transfer; error?: TransferError } {
  if (t.status !== 'draft') return { levels, transfer: t, error: 'state' };
  const v = validateTransferDraft(levels, t);
  if (v.error) return { levels, transfer: t, error: v.error };
  let next = levels;
  const lines = t.lines.filter((l) => l.qty > 0);
  for (const l of lines) {
    next = withLevel(next, l.sku, t.from, (x) => ({ ...x, onHand: x.onHand - l.qty, version: x.version + 1 }));
    next = withLevel(next, l.sku, t.to, (x) => ({ ...x, incoming: x.incoming + l.qty, version: x.version + 1 }));
  }
  return { levels: next, transfer: { ...t, lines, status: 'sent' } };
}

/** Receive some or all outstanding units. Quantities above what is outstanding are refused, so units never double. */
export function receiveTransfer(levels: Level[], t: Transfer, qty: number[]): { levels: Level[]; transfer: Transfer; error?: TransferError } {
  if (t.status !== 'sent' && t.status !== 'partial') return { levels, transfer: t, error: 'state' };
  const bad = t.lines.some((l, i) => { const q = qty[i] ?? 0; return !Number.isInteger(q) || q < 0 || q > l.qty - l.received; });
  if (bad) return { levels, transfer: t, error: 'qty' };
  if (qty.every((q) => !q)) return { levels, transfer: t, error: 'empty' };
  let next = levels;
  const lines = t.lines.map((l, i) => {
    const q = qty[i] ?? 0;
    if (q) next = withLevel(next, l.sku, t.to, (x) => ({ ...x, onHand: x.onHand + q, incoming: x.incoming - q, version: x.version + 1 }));
    return { ...l, received: l.received + q };
  });
  const done = lines.every((l) => l.received === l.qty);
  return { levels: next, transfer: { ...t, lines, status: done ? 'received' : 'partial' } };
}

/** Close a partly received transfer: what never arrived is removed from incoming and recorded as a discrepancy. */
export function closeWithDiscrepancy(levels: Level[], t: Transfer, note: string): { levels: Level[]; transfer: Transfer; error?: TransferError } {
  if (t.status !== 'partial' && t.status !== 'sent') return { levels, transfer: t, error: 'state' };
  let next = levels;
  const discrepancy = t.lines.filter((l) => l.qty > l.received).map((l) => ({ sku: l.sku, units: l.qty - l.received }));
  for (const d of discrepancy) next = withLevel(next, d.sku, t.to, (x) => ({ ...x, incoming: x.incoming - d.units, version: x.version + 1 }));
  return { levels: next, transfer: { ...t, status: 'closed', discrepancy, note } };
}

/* ---------- Low stock and coverage ---------- */

export type Coverage = { kind: 'days'; days: number; perDay: number } | { kind: 'insufficient'; days: number } | { kind: 'noSales' };
/** Days of cover at the recent sales rate, only with at least 14 days of history. */
export function coverage(availableUnits: number, h: History | undefined): Coverage {
  if (!h || h.days < MIN_HISTORY_DAYS) return { kind: 'insufficient', days: h?.days ?? 0 };
  if (h.sold === 0) return { kind: 'noSales' };
  const perDay = h.sold / h.days;
  return { kind: 'days', days: Math.floor(Math.max(0, availableUnits) / perDay), perDay: Math.round(perDay * 10) / 10 };
}

export const lowStock = (levels: Level[]) => levels.filter((l) => available(l) <= l.threshold);
