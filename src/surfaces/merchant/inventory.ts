// Inventory domain: per-location levels, adjustments with optimistic versions, transfers and low-stock coverage.
// Definitions (shown in the UI as well):
//   on hand   = units physically at the location
//   reserved  = units held for paid orders not yet fulfilled
//   available = on hand − reserved (what can still be sold)
//   incoming  = units in a sent transfer, not yet received; never sold automatically
//   (added) awaiting payment, unavailable and safety reserve: optional parts of on hand that are not sold either.
//   See "Full stock states" at the end of this file. Levels without them behave exactly as before.
import { LOC_IDS, type L, type LocId, type Location } from './domain';

export interface Level {
  sku: string; loc: LocId; onHand: number; reserved: number; incoming: number; version: number; threshold: number;
  /** Units held for orders whose payment is not confirmed yet (bank transfer, payment link). Part of on hand. */
  awaitingPay?: number;
  /** Damaged or in quarantine: on the shelf but not sellable until restored or written off. Part of on hand. */
  unavailable?: number;
  /** Safety reserve the merchant keeps back from online sale. Part of on hand. */
  safety?: number;
}
/** What can still be sold: on hand − reserved − awaiting payment − unavailable − safety reserve. */
export const available = (l: Level) => l.onHand - l.reserved - (l.awaitingPay ?? 0) - (l.unavailable ?? 0) - (l.safety ?? 0);

export type AdjReason = 'received' | 'count' | 'damaged' | 'returned' | 'other';
export const ADJ_REASONS: AdjReason[] = ['received', 'count', 'damaged', 'returned', 'other'];
export type LogReason = AdjReason | 'transferOut' | 'transferIn' | 'discrepancy' | 'fulfilled';
export interface StockLog {
  id: string; sku: string; loc: LocId; delta: number; before: number; after: number; reason: LogReason; who: string; ref?: string; note?: string;
  /** Set when units moved between stock states (e.g. marked damaged); `delta` is then the change in on hand (often 0). */
  state?: StateLog;
}

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

/* ---------- Order stock effects (orders group: reserve, fulfil, cancel, return, exchange) ---------- */

/**
 * Apply order stock effects (deltas of reserved and on hand, from merchant/ops.ts). Reserved never goes below zero.
 * Each on-hand change writes one stock-log line: shipped units as 'fulfilled', units back on the shelf as 'returned'.
 */
export function applyStockEffects(
  levels: Level[], effects: { sku: string; loc: LocId; reserved: number; onHand: number }[], who: string, ref: string, idPrefix: string,
): { levels: Level[]; log: StockLog[] } {
  let next = levels;
  const log: StockLog[] = [];
  effects.forEach((e, i) => {
    if (!e.sku || (!e.reserved && !e.onHand)) return;
    const before = levelOf(next, e.sku, e.loc)?.onHand ?? 0;
    next = withLevel(next, e.sku, e.loc, (l) => ({ ...l, onHand: Math.max(0, l.onHand + e.onHand), reserved: Math.max(0, l.reserved + e.reserved), version: l.version + 1 }));
    const after = levelOf(next, e.sku, e.loc)!.onHand;
    if (after !== before) log.push({ id: `${idPrefix}-${i}`, sku: e.sku, loc: e.loc, delta: after - before, before, after, reason: e.onHand < 0 ? 'fulfilled' : 'returned', who, ref });
  });
  return { levels: next, log };
}

/* ---------- Reorder thresholds and low-stock alerts ---------- */

export const MAX_THRESHOLD = 9999;
/** Set the reorder point for some SKU/location rows. Returns null when the value is not a whole number 0–9999. */
export function setThresholds(levels: Level[], keys: { sku: string; loc: LocId }[], threshold: number): Level[] | null {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > MAX_THRESHOLD) return null;
  const want = new Set(keys.map((k) => `${k.sku}@${k.loc}`));
  return levels.map((l) => (want.has(`${l.sku}@${l.loc}`) && l.threshold !== threshold ? { ...l, threshold, version: l.version + 1 } : l));
}

export interface StockAlertEntry {
  id: string; sku: string; loc: LocId;
  /** Available units and threshold when the alert was raised. */
  available: number; threshold: number;
  when: 'earlier' | 'now';
  /** Epoch ms, for alerts raised in this session. */
  at?: number;
  /** Sent = delivered to the merchant's alert channel (simulated); resolved = stock went back above the threshold. */
  status: 'sent' | 'resolved';
}

/**
 * Keep alerts in step with levels: one alert per SKU and location each time it drops to its threshold (never a second
 * one while the first is open), and an open alert is resolved once available is above the threshold again.
 */
export function syncStockAlerts(levels: Level[], alerts: StockAlertEntry[], when: 'earlier' | 'now' = 'now', now?: number): { alerts: StockAlertEntry[]; raised: StockAlertEntry[]; resolved: number } {
  const low = new Map(lowStock(levels).map((l) => [`${l.sku}@${l.loc}`, l]));
  let resolved = 0;
  const next = alerts.map((a) => {
    if (a.status !== 'sent' || low.has(`${a.sku}@${a.loc}`)) return a;
    resolved++;
    return { ...a, status: 'resolved' as const };
  });
  const open = new Set(next.filter((a) => a.status === 'sent').map((a) => `${a.sku}@${a.loc}`));
  let n = alerts.reduce((m, a) => Math.max(m, Number(a.id.replace(/\D/g, '')) || 0), 500);
  const raised: StockAlertEntry[] = [];
  for (const [k, l] of low) {
    if (open.has(k)) continue;
    raised.push({ id: `ALR-${++n}`, sku: l.sku, loc: l.loc, available: available(l), threshold: l.threshold, when, at: now, status: 'sent' });
  }
  return { alerts: [...raised, ...next], raised, resolved };
}

/* ---------- Locations: usage, validation and disabling ---------- */

export interface LocUsage { onHand: number; reserved: number; incoming: number; skus: number; openTransfers: number }
export function locationUsage(loc: LocId, levels: Level[], transfers: Transfer[]): LocUsage {
  const mine = levels.filter((l) => l.loc === loc);
  return {
    onHand: mine.reduce((s, l) => s + l.onHand, 0), reserved: mine.reduce((s, l) => s + l.reserved, 0), incoming: mine.reduce((s, l) => s + l.incoming, 0),
    skus: mine.filter((l) => l.onHand > 0).length,
    openTransfers: transfers.filter((t) => (t.from === loc || t.to === loc) && (t.status === 'draft' || t.status === 'sent' || t.status === 'partial')).length,
  };
}

export type DisableBlock = 'default' | 'stock' | 'reserved' | 'incoming' | 'transfers' | 'lastShipping';
/** Why a location cannot be disabled now (empty = it can). Stock must be moved out and open transfers finished first. */
export function disableBlocks(loc: Location, all: Location[], levels: Level[], transfers: Transfer[]): DisableBlock[] {
  const u = locationUsage(loc.id, levels, transfers);
  const out: DisableBlock[] = [];
  if (loc.isDefault) out.push('default');
  if (u.onHand > 0) out.push('stock');
  if (u.reserved > 0) out.push('reserved');
  if (u.incoming > 0) out.push('incoming');
  if (u.openTransfers > 0) out.push('transfers');
  if (loc.ships && !all.some((x) => x.id !== loc.id && x.active && x.ships)) out.push('lastShipping');
  return out;
}

export type LocationError = 'required' | 'taken';
export function validateLocation(l: Pick<Location, 'id' | 'name' | 'city'>, all: Location[]): Partial<Record<'nameAr' | 'nameEn' | 'cityAr' | 'cityEn', LocationError>> {
  const e: Partial<Record<'nameAr' | 'nameEn' | 'cityAr' | 'cityEn', LocationError>> = {};
  const others = all.filter((x) => x.id !== l.id);
  if (!l.name.ar.trim()) e.nameAr = 'required';
  else if (others.some((x) => x.name.ar.trim() === l.name.ar.trim())) e.nameAr = 'taken';
  if (!l.name.en.trim()) e.nameEn = 'required';
  else if (others.some((x) => x.name.en.trim().toLowerCase() === l.name.en.trim().toLowerCase())) e.nameEn = 'taken';
  if (!l.city.ar.trim()) e.cityAr = 'required';
  if (!l.city.en.trim()) e.cityEn = 'required';
  return e;
}

/** A short, stable id from the English city or name ("Dammam branch" → "dammam"); never reuses an existing id. */
export function newLocationId(name: L, all: Location[]): LocId {
  const base = (name.en.trim().toLowerCase().match(/[a-z0-9]+/g) ?? ['loc'])[0].slice(0, 12) || 'loc';
  const ids = new Set(all.map((l) => l.id));
  if (!ids.has(base)) return base;
  let i = 2;
  while (ids.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

/* ---------- Full stock states (products & inventory group; Salla audit MATRIX #42) ---------- */
// Every unit on the shelf is in exactly one of five parts, so the numbers always add up:
//   on hand = available + reserved + awaiting payment + unavailable + safety reserve
// Incoming and outgoing are in transit between locations and are NOT part of on hand at either end:
//   incoming = sent to this location in a transfer, not received yet
//   outgoing = sent from this location in a transfer, not received at the destination yet (already left on hand)
// Customer shipments leave on hand when they ship (orders own that), so they are not "outgoing" here.

export type StockState = 'onHand' | 'available' | 'reserved' | 'awaitingPay' | 'unavailable' | 'safety' | 'incoming' | 'outgoing';
export const STOCK_STATES: StockState[] = ['onHand', 'available', 'reserved', 'awaitingPay', 'unavailable', 'safety', 'incoming', 'outgoing'];
/** The parts that make up on hand, in the order they are drawn. */
export const ON_HAND_PARTS: StockState[] = ['available', 'reserved', 'awaitingPay', 'unavailable', 'safety'];
export type Breakdown = Record<StockState, number>;

/** Units that left `loc` in a sent or partly received transfer and have not arrived yet. */
export function outgoingOf(transfers: Transfer[], sku: string, loc: LocId): number {
  return transfers.filter((t) => t.from === loc && (t.status === 'sent' || t.status === 'partial'))
    .reduce((s, t) => s + t.lines.filter((l) => l.sku === sku).reduce((n, l) => n + Math.max(0, l.qty - l.received), 0), 0);
}

/** Every state of one level. `available` may be negative when on hand dropped below what is held (oversold). */
export function breakdown(l: Level, transfers: Transfer[] = []): Breakdown {
  return {
    onHand: l.onHand, available: available(l), reserved: l.reserved, awaitingPay: l.awaitingPay ?? 0, unavailable: l.unavailable ?? 0, safety: l.safety ?? 0,
    incoming: l.incoming, outgoing: outgoingOf(transfers, l.sku, l.loc),
  };
}
/** Sum of states over many levels (e.g. one SKU across locations). */
export function sumBreakdown(levels: Level[], transfers: Transfer[] = []): Breakdown {
  const out = Object.fromEntries(STOCK_STATES.map((s) => [s, 0])) as Breakdown;
  for (const l of levels) { const b = breakdown(l, transfers); for (const s of STOCK_STATES) out[s] += b[s]; }
  return out;
}

/** Moving units between states on the shelf. Each needs a reason and is logged; on hand changes only on write-off. */
export type StateMove = 'damage' | 'restore' | 'writeOff' | 'setSafety' | 'releasePay' | 'confirmPay';
export const STATE_MOVES: StateMove[] = ['damage', 'restore', 'writeOff', 'setSafety', 'releasePay', 'confirmPay'];
export type StateReason = 'damaged' | 'quarantine' | 'inspected' | 'disposed' | 'buffer' | 'store' | 'expired' | 'paid' | 'other';
export const MOVE_REASONS: Record<StateMove, StateReason[]> = {
  damage: ['damaged', 'quarantine', 'other'],
  restore: ['inspected', 'other'],
  writeOff: ['disposed', 'other'],
  setSafety: ['buffer', 'store', 'other'],
  releasePay: ['expired', 'other'],
  confirmPay: ['paid', 'other'],
};
/** Where the units come from and go to. For the safety reserve the direction depends on whether it grows or shrinks. */
export const MOVE_PATH: Record<StateMove, [StockState, StockState | 'gone']> = {
  damage: ['available', 'unavailable'], restore: ['unavailable', 'available'], writeOff: ['unavailable', 'gone'],
  setSafety: ['available', 'safety'], releasePay: ['awaitingPay', 'available'], confirmPay: ['awaitingPay', 'reserved'],
};
export interface StateLog { move: StateMove; qty: number; reason: StateReason; from: StockState; to: StockState | 'gone' }
export type MoveError = 'qty' | 'exceeds' | 'same' | 'reason' | 'conflict' | 'notFound';

/** The most units a move can take now. For `setSafety` it is the largest reserve that can be set. */
export function moveLimit(l: Level, move: StateMove): number {
  const free = Math.max(0, available(l));
  switch (move) {
    case 'damage': return free;
    case 'restore': case 'writeOff': return l.unavailable ?? 0;
    case 'setSafety': return (l.safety ?? 0) + free;
    case 'releasePay': case 'confirmPay': return l.awaitingPay ?? 0;
  }
}

/** Check a move before showing or applying it. `qty` is the number of units, or the new reserve for `setSafety`. */
export function checkMove(l: Level, move: StateMove, qty: number | null): MoveError | null {
  if (qty === null || !Number.isInteger(qty) || qty < 0 || (move !== 'setSafety' && qty === 0)) return 'qty';
  if (move === 'setSafety' && qty === (l.safety ?? 0)) return 'same';
  return qty > moveLimit(l, move) ? 'exceeds' : null;
}

function applyMove(l: Level, move: StateMove, qty: number): Level {
  const u = l.unavailable ?? 0, p = l.awaitingPay ?? 0;
  switch (move) {
    case 'damage': return { ...l, unavailable: u + qty };
    case 'restore': return { ...l, unavailable: u - qty };
    case 'writeOff': return { ...l, unavailable: u - qty, onHand: l.onHand - qty };
    case 'setSafety': return { ...l, safety: qty };
    case 'releasePay': return { ...l, awaitingPay: p - qty };
    case 'confirmPay': return { ...l, awaitingPay: p - qty, reserved: l.reserved + qty };
  }
}

/** Before and after for every state, as the merchant sees it in the preview. Nothing is written. */
export function movePreview(l: Level, move: StateMove, qty: number | null, transfers: Transfer[] = []): { before: Breakdown; after: Breakdown; error: MoveError | null; units: number } {
  const error = checkMove(l, move, qty);
  const before = breakdown(l, transfers);
  const after = error ? before : breakdown(applyMove(l, move, qty!), transfers);
  const units = error ? 0 : move === 'setSafety' ? Math.abs(qty! - (l.safety ?? 0)) : qty!;
  return { before, after, error, units };
}

/**
 * Move units between states with a reason. Uses the same optimistic version as `adjust`: if the level changed since the
 * merchant opened the form, nothing is written and the current level is returned. Logged like any stock movement.
 */
export function moveStock(
  levels: Level[], sku: string, loc: LocId, move: StateMove, qty: number | null, reason: StateReason | '', expectedVersion: number, who: string, id: string, note = '',
): { levels: Level[]; log?: StockLog; error?: MoveError; current?: Level } {
  const cur = levelOf(levels, sku, loc);
  if (!cur) return { levels, error: 'notFound' };
  if (!reason || !MOVE_REASONS[move].includes(reason)) return { levels, error: 'reason' };
  if (cur.version !== expectedVersion) return { levels, error: 'conflict', current: cur };
  const err = checkMove(cur, move, qty);
  if (err) return { levels, error: err };
  const next = { ...applyMove(cur, move, qty!), version: cur.version + 1 };
  const shrink = move === 'setSafety' && qty! < (cur.safety ?? 0);
  const [from, to] = shrink ? (['safety', 'available'] as const) : MOVE_PATH[move];
  const units = move === 'setSafety' ? Math.abs(qty! - (cur.safety ?? 0)) : qty!;
  return {
    levels: levels.map((l) => (l === cur ? next : l)),
    log: {
      id, sku, loc, delta: next.onHand - cur.onHand, before: cur.onHand, after: next.onHand, who, note,
      reason: move === 'damage' || move === 'writeOff' ? 'damaged' : 'other',
      state: { move, qty: units, reason, from, to },
    },
  };
}

/** Demo holds on a few SKUs so every state has an example. Applied to the fixture store only; tests keep plain levels. */
export function withStateFixtures(levels: Level[]): Level[] {
  const extra: Record<string, Partial<Level>> = {
    'WLT-LTH-01@ryd': { awaitingPay: 1, safety: 2 },
    'BAG-LTH-01@ryd': { unavailable: 1 },
    'ABY-LIN-NAV-L@jed': { unavailable: 1 },
    'THB-COT-WHI-56@ryd': { safety: 3, awaitingPay: 2 },
  };
  return levels.map((l) => {
    const e = extra[`${l.sku}@${l.loc}`];
    if (!e) return l;
    const want = (e.awaitingPay ?? 0) + (e.unavailable ?? 0) + (e.safety ?? 0);
    return available(l) >= want ? { ...l, ...e } : l;
  });
}
