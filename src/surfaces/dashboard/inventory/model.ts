// Inventory section: screen rules only (no React). Levels, adjustments, transfers and coverage come from
// merchant/inventory.ts (single source of truth); this file shapes them for the screens.
//   on hand   = units physically at the warehouse
//   reserved  = units held for paid orders not yet fulfilled
//   available = on hand − reserved (what can still be sold)
//   incoming  = units in a sent transfer, not yet received; never sold automatically
//   plus awaiting payment, unavailable, safety reserve and outgoing (merchant/inventory.ts "Full stock states")
import { LOC_IDS, allLocations, type L, type LocId, type Order } from '../../merchant/domain';
import { normaliseDigits, skusOf, variantText, type Product, type ProductType } from '../../merchant/catalog';
import { bundleParts, bundleStock, openSlots, slotLeft, traits } from '../../merchant/catalog-extras';
import {
  MAX_THRESHOLD, available, breakdown, coverage, levelOf, lowStock, type Breakdown, type Coverage, type History, type Level, type LogReason, type StockLog, type Transfer, type TransferStatus,
} from '../../merchant/inventory';

/** `noStock`: the product's type keeps no warehouse stock (download, code, service, booking); its SKU is not listed in Levels. */
export interface SkuInfo { productId: string | undefined; name: L; variant: L; noStock?: boolean }

/** Product name and variant label for every SKU in the catalogue. */
export function skuInfo(products: Product[]): Map<string, SkuInfo> {
  const m = new Map<string, SkuInfo>();
  for (const p of products) for (const s of skusOf(p)) {
    const v = p.variants.find((x) => x.sku === s);
    m.set(s, { productId: p.id, name: p.name, variant: v ? variantText(v.color, v.size) : { ar: '', en: '' }, ...(traits(p.type).warehouse || p.type === 'bundle' ? {} : { noStock: true }) });
  }
  return m;
}
export const infoFor = (m: Map<string, SkuInfo>, sku: string): SkuInfo => m.get(sku) ?? { productId: undefined, name: { ar: sku, en: sku }, variant: { ar: '', en: '' } };

/** `types`: products sold without warehouse stock (codes, bookings, bundles, downloads, services). */
export type Tab = 'levels' | 'low' | 'transfers' | 'log' | 'types';
export const readTab = (v: string | null): Tab => (v === 'low' || v === 'transfers' || v === 'log' || v === 'types' ? v : 'levels');
/** A location id from the address when it names a known location (active or not), else ''. */
export const readLoc = (v: string | null): LocId | '' => (v && allLocations().some((l) => l.id === v) ? v : '');

/** `unstocked`: the SKU has no record at this active location yet (e.g. a new branch); shown so it can be stocked. */
export interface LevelRow extends Level { key: string; available: number; low: boolean; info: SkuInfo; unstocked?: boolean; /** Every stock state (outgoing needs transfers). */ states: Breakdown }
export const levelKey = (l: Pick<Level, 'sku' | 'loc'>) => `${l.sku}@${l.loc}`;

const matches = (q: string, sku: string, i: SkuInfo) => {
  const n = q.trim().toLowerCase();
  return !n || sku.toLowerCase().includes(n) || i.name.en.toLowerCase().includes(n) || i.name.ar.includes(q.trim()) || i.variant.en.toLowerCase().includes(n) || i.variant.ar.includes(q.trim());
};

/** Levels per SKU and warehouse, filtered by search and warehouse; low rows only on the low-stock view. */
export function levelRows(levels: Level[], info: Map<string, SkuInfo>, f: { q: string; loc: LocId | ''; lowOnly?: boolean; state?: StateFilter | '' }, transfers: Transfer[] = []): LevelRow[] {
  const have = new Set(levels.map(levelKey));
  const skus = [...new Set(levels.map((l) => l.sku))];
  // Active locations without a record for a tracked SKU (a branch added in this session) get an empty, unstocked row.
  const unstocked: LevelRow[] = f.lowOnly ? [] : LOC_IDS.flatMap((loc) => skus.filter((sku) => !have.has(`${sku}@${loc}`)).map((sku) => ({
    sku, loc, onHand: 0, reserved: 0, incoming: 0, version: 0, threshold: 0, key: `${sku}@${loc}`, available: 0, low: false, info: infoFor(info, sku), unstocked: true,
    states: breakdown({ sku, loc, onHand: 0, reserved: 0, incoming: 0, version: 0, threshold: 0 }, transfers),
  })));
  const order = (loc: LocId) => { const i = LOC_IDS.indexOf(loc); return i < 0 ? 99 : i; };
  return [...levels
    .map((l) => ({ ...l, key: levelKey(l), available: available(l), low: available(l) <= l.threshold, info: infoFor(info, l.sku), states: breakdown(l, transfers) })), ...unstocked]
    // Downloads, codes, services and bookings have no warehouse stock (stock kept from an earlier type stays stored, unlisted).
    .filter((r) => !r.info.noStock)
    .filter((r) => (!f.loc || r.loc === f.loc) && (!f.lowOnly || r.low) && (!f.state || stateMatch(r.states, f.state)) && matches(f.q, r.sku, r.info))
    .sort((a, b) => (f.lowOnly ? a.available - b.available : 0) || a.sku.localeCompare(b.sku) || order(a.loc) - order(b.loc));
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
    onHand: [seen.onHand, after], available: [available(seen), available({ ...seen, onHand: after })],
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
/**
 * A new draft between any two active locations, optionally prefilled from a low-stock row: ship to the low location
 * from the location with the most available units of that SKU (or the first other location).
 */
export function newTransfer(ts: Transfer[], sku?: string | null, to?: string | null, levels: Level[] = []): Transfer {
  const ids = [...LOC_IDS];
  const dest: LocId = to && ids.includes(to) ? to : ids[0] ?? 'ryd';
  const others = ids.filter((l) => l !== dest);
  const best = sku ? [...others].sort((a, b) => (levelOf(levels, sku, b) ? available(levelOf(levels, sku, b)!) : -1) - (levelOf(levels, sku, a) ? available(levelOf(levels, sku, a)!) : -1))[0] : undefined;
  const from = best ?? others[0] ?? dest;
  return { id: nextTransferId(ts), from, to: dest, status: 'draft', note: '', discrepancy: [], lines: sku ? [{ sku, qty: 1, received: 0 }] : [] };
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

/* ---------- Reorder points ---------- */

/** "10", "١٠" → whole number 0–9999; null otherwise. */
export function parseThreshold(input: string): number | null {
  const n = parseDelta(input);
  return n !== null && n >= 0 && n <= MAX_THRESHOLD ? n : null;
}
/** What a new reorder point would do to the chosen rows: how many become low, how many stop being low. */
export function thresholdPreview(rows: Pick<Level, 'onHand' | 'reserved' | 'threshold' | 'awaitingPay' | 'unavailable' | 'safety'>[], threshold: number | null) {
  if (threshold === null) return { becomeLow: 0, leaveLow: 0, unchanged: rows.length };
  let becomeLow = 0, leaveLow = 0;
  for (const r of rows) {
    const a = available(r as Level);
    const was = a <= r.threshold, will = a <= threshold;
    if (!was && will) becomeLow++; else if (was && !will) leaveLow++;
  }
  return { becomeLow, leaveLow, unchanged: rows.length - becomeLow - leaveLow };
}

/* ---------- Locations screen ---------- */

export interface LocationRow { id: LocId; skus: number; onHand: number; reserved: number; incoming: number; low: number; openTransfers: number }
/** Stock summary per location for the locations screen (including disabled ones, which hold nothing). */
export function locationRows(levels: Level[], transfers: Transfer[]): Map<LocId, LocationRow> {
  const m = new Map<LocId, LocationRow>();
  for (const l of allLocations()) m.set(l.id, { id: l.id, skus: 0, onHand: 0, reserved: 0, incoming: 0, low: 0, openTransfers: 0 });
  for (const l of levels) {
    const r = m.get(l.loc);
    if (!r) continue;
    if (l.onHand > 0) r.skus++;
    r.onHand += l.onHand; r.reserved += l.reserved; r.incoming += l.incoming;
    if (available(l) <= l.threshold) r.low++;
  }
  for (const t of transfers) if (isOpen(t)) for (const id of new Set([t.from, t.to])) { const r = m.get(id); if (r) r.openTransfers++; }
  return m;
}

/* ---------- Inventory export ---------- */

/** Levels as CSV rows (one per SKU and location); headers match the count import. */
export function levelsCsv(rows: LevelRow[], locName: (id: LocId) => string): (string | number)[][] {
  return [['sku', 'product', 'variant', 'location_id', 'location', 'on_hand', 'reserved', 'available', 'incoming', 'reorder_point', 'awaiting_payment', 'unavailable', 'safety_reserve', 'outgoing'],
    ...rows.filter((r) => !r.unstocked).map((r) => [r.sku, r.info.name.en, r.info.variant.en, r.loc, locName(r.loc), r.onHand, r.reserved, r.available, r.incoming, r.threshold, r.states.awaitingPay, r.states.unavailable, r.states.safety, r.states.outgoing])];
}

/* ---------- Count import (inventory CSV) ---------- */

export type CountProblem = 'sku' | 'loc' | 'qty' | 'dup';
export interface CountRow { line: number; sku: string; loc: LocId; counted: number | null; before: number; delta: number; problem: CountProblem | null; raw: string }
/**
 * Read a count file (sku, location_id, counted on hand). Every line gets the difference against what the system holds
 * now; unknown SKUs or locations, bad quantities and repeated SKU+location lines are problems and are never written.
 */
export function checkCount(rows: string[][], headers: string[], levels: Level[], known: Set<string>): CountRow[] {
  const h = headers.map((x) => x.trim().toLowerCase());
  const ci = (names: string[]) => h.findIndex((x) => names.includes(x));
  const iSku = ci(['sku']), iLoc = ci(['location_id', 'location', 'loc']), iQty = ci(['on_hand', 'counted', 'quantity', 'qty', 'count']);
  const locIds = new Set(LOC_IDS as string[]);
  const byName = new Map(allLocations().flatMap((l) => [[l.name.en.toLowerCase(), l.id], [l.name.ar, l.id]] as [string, LocId][]));
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const sku = (r[iSku] ?? '').trim().toUpperCase();
    const rawLoc = (r[iLoc] ?? '').trim();
    const loc = locIds.has(rawLoc) ? rawLoc : byName.get(rawLoc.toLowerCase()) ?? byName.get(rawLoc) ?? rawLoc;
    const raw = (r[iQty] ?? '').trim();
    const n = raw ? parseDelta(raw) : null;
    const before = levelOf(levels, sku, loc)?.onHand ?? 0;
    let problem: CountProblem | null = null;
    if (!sku || !known.has(sku)) problem = 'sku';
    else if (!locIds.has(loc)) problem = 'loc';
    else if (n === null || n < 0) problem = 'qty';
    else if (seen.has(`${sku}@${loc}`)) problem = 'dup';
    if (!problem) seen.add(`${sku}@${loc}`);
    return { line: i + 2, sku, loc, counted: n, before, delta: problem || n === null ? 0 : n - before, problem, raw };
  });
}

/* ---------- Full stock states on the screens ---------- */

/** True when part of on hand is held back from sale by something other than paid orders (the "Held" quick view). */
export const isHeld = (b: Breakdown) => b.awaitingPay + b.unavailable + b.safety > 0;
export type StateFilter = 'held' | 'awaitingPay' | 'unavailable' | 'safety' | 'transit';
export const STATE_FILTERS: StateFilter[] = ['held', 'awaitingPay', 'unavailable', 'safety', 'transit'];
export const readStateFilter = (v: string | null): StateFilter | '' => (STATE_FILTERS as string[]).includes(v ?? '') ? (v as StateFilter) : '';
export function stateMatch(b: Breakdown, f: StateFilter): boolean {
  if (f === 'held') return isHeld(b);
  if (f === 'transit') return b.incoming + b.outgoing > 0;
  return b[f] > 0;
}
export type LevelCols = 'essential' | 'all';
export const readCols = (v: string | null): LevelCols => (v === 'all' ? 'all' : 'essential');

/** Paid orders holding units of a SKU at a location, from each order line's per-location reservation. */
export function reservedBy(orders: Order[], sku: string, loc: LocId): { ref: string; qty: number }[] {
  const out: { ref: string; qty: number }[] = [];
  for (const o of orders) {
    if (o.cancelled) continue;
    const qty = o.items.filter((it) => it.sku === sku).reduce((s, it) => s + (it.reserved?.[loc] ?? 0), 0);
    if (qty > 0) out.push({ ref: o.ref, qty });
  }
  return out;
}

/** Open transfers that bring units of a SKU into (incoming) or out of (outgoing) a location. */
export function transfersFor(transfers: Transfer[], sku: string, loc: LocId): { incoming: { id: string; qty: number }[]; outgoing: { id: string; qty: number }[] } {
  const live = transfers.filter((t) => t.status === 'sent' || t.status === 'partial');
  const units = (t: Transfer) => t.lines.filter((l) => l.sku === sku).reduce((s, l) => s + l.qty - l.received, 0);
  return {
    incoming: live.filter((t) => t.to === loc && units(t) > 0).map((t) => ({ id: t.id, qty: units(t) })),
    outgoing: live.filter((t) => t.from === loc && units(t) > 0).map((t) => ({ id: t.id, qty: units(t) })),
  };
}

/** Next id for a state move in the stock log. */
export const nextMoveId = (log: StockLog[]) => `ST-${Math.max(100, ...log.filter((x) => x.id.startsWith('ST-')).map((x) => Number(x.id.slice(3)) || 0)) + 1}`;

/** Widths (percent) of each on-hand part for the composition bar; empty when nothing is on hand. */
export function compositionBar(b: Breakdown): { part: 'available' | 'reserved' | 'awaitingPay' | 'unavailable' | 'safety'; pct: number }[] {
  if (b.onHand <= 0) return [];
  const parts = (['available', 'reserved', 'awaitingPay', 'unavailable', 'safety'] as const).map((part) => ({ part, n: Math.max(0, b[part]) }));
  const total = parts.reduce((s, x) => s + x.n, 0) || 1;
  return parts.filter((x) => x.n > 0).map((x) => ({ part: x.part, pct: Math.round((x.n * 1000) / total) / 10 }));
}

/* ---------- Products sold without warehouse stock (catalog-extras types) ---------- */

export type TypedKind = Exclude<ProductType, 'physical' | 'food'>;
export interface TypedRow {
  id: string; sku: string; name: L; type: TypedKind; active: boolean;
  /** Code: unsold codes in the pool and codes already delivered. */
  codes?: { left: number; sold: number };
  /** Booking: open slots (today on) with places left. */
  slots?: { id: string; date: string; time: string; cap: number; left: number }[];
  /** Bundle: units the components allow (the scarcest wins) and each component's sellable units. */
  bundle?: { stock: number; parts: { sku: string; qty: number; name: L | null; available: number }[] };
}
/** How each non-warehouse product sells: codes left, booking places, a bundle's derived stock; downloads and services have no limit. */
export function typedRows(products: Product[], levels: Level[], today: string, q = ''): TypedRow[] {
  const n = q.trim().toLowerCase();
  return products.filter((p) => p.status !== 'archived' && p.type !== 'physical' && p.type !== 'food' && !!p.type)
    .filter((p) => !n || p.sku.toLowerCase().includes(n) || p.name.en.toLowerCase().includes(n) || p.name.ar.includes(q.trim()))
    .map((p) => {
      const base = { id: p.id, sku: p.sku, name: p.name, type: p.type as TypedKind, active: p.status === 'active' };
      if (p.type === 'code') { const pool = p.spec?.codes ?? []; return { ...base, codes: { left: pool.filter((c) => !c.ref).length, sold: pool.filter((c) => !!c.ref).length } }; }
      if (p.type === 'booking') return { ...base, slots: openSlots(p.spec?.slots, today).map((x) => ({ id: x.id, date: x.date, time: x.time, cap: x.cap, left: slotLeft(x) })) };
      if (p.type === 'bundle') {
        const items = p.spec?.bundle ?? [];
        return { ...base, bundle: { stock: bundleStock(items, levels), parts: bundleParts(items, products).map((x) => ({ sku: x.sku, qty: x.qty, name: x.name, available: levels.filter((l) => l.sku === x.sku).reduce((a, l) => a + Math.max(0, available(l)), 0) })) } };
      }
      return base;
    });
}
