// Orders domain and fixtures for the merchant workspace.
// Money is integer halalas. Everything here is test data, not LAK data.

export type Lang = 'ar' | 'en';
export type L = Record<Lang, string>;
/** Payment state. Refund progress is tracked on each refund; the payment only changes once the provider confirms. */
export type Pay = 'paid' | 'failed' | 'partially_refunded' | 'refunded';
export type Ful = 'none' | 'partial' | 'done';
export type Ship = 'none' | 'label' | 'transit' | 'delivered';
export type View = 'all' | 'needs' | 'late' | 'payfail' | 'shipped' | 'returns';
export type Channel = 'online' | 'market' | 'app';
export type CarrierId = 'a' | 'b';
/** A stock location id. Locations are data (see `Location`); 'ryd' and 'jed' are the two fixture warehouses. */
export type LocId = string;

/* ---------- Locations (warehouses and branches) as data ---------- */

export type LocKind = 'warehouse' | 'branch';
export type LocDisableReason = 'closed' | 'moved' | 'seasonal' | 'other';
export interface Location {
  id: LocId;
  name: L;
  kind: LocKind;
  city: L;
  address: string;
  /** Orders can be shipped from here. */
  ships: boolean;
  /** Customers can collect orders here. */
  pickup: boolean;
  active: boolean;
  /** The default fulfilment location (used when an order has a single location). Cannot be disabled. */
  isDefault?: boolean;
  disabled?: { reason: LocDisableReason; note: string; by: string };
  version: number;
}

export function locationFixtures(): Location[] {
  return [
    { id: 'ryd', name: { ar: 'مستودع الرياض', en: 'Riyadh warehouse' }, kind: 'warehouse', city: { ar: 'الرياض', en: 'Riyadh' }, address: 'Al Sulay, 2nd Industrial City', ships: true, pickup: false, active: true, isDefault: true, version: 1 },
    { id: 'jed', name: { ar: 'مستودع جدة', en: 'Jeddah warehouse' }, kind: 'warehouse', city: { ar: 'جدة', en: 'Jeddah' }, address: 'Al Khumrah, Logistics Zone', ships: true, pickup: false, active: true, version: 1 },
  ];
}

let locSource: () => Location[] = (() => { const fx = locationFixtures(); return () => fx; })();
/** Point the live registry at the session's location store (called once by merchant/stores.ts). */
export function bindLocations(get: () => Location[]): void { locSource = get; }
/** Every known location, including disabled ones (history and old orders still name them). */
export const allLocations = (): Location[] => locSource();
/** Active location ids, in order. */
export const activeLocIds = (): LocId[] => locSource().filter((l) => l.active).map((l) => l.id);
const fallbackName = (id: string): L => ({ ar: id, en: id });

/**
 * Live name lookup `LOCATIONS[id][lang]`, kept for existing screens. Reads the location store at access time, so a
 * location added in the session is named everywhere; an unknown id falls back to the id itself instead of crashing.
 */
export const LOCATIONS: Record<LocId, L> = new Proxy({} as Record<LocId, L>, {
  get: (_t, k) => (typeof k === 'string' ? locSource().find((l) => l.id === k)?.name ?? fallbackName(k) : undefined),
  has: (_t, k) => typeof k === 'string' && locSource().some((l) => l.id === k),
  ownKeys: () => locSource().map((l) => l.id),
  getOwnPropertyDescriptor: (_t, k) => {
    const loc = typeof k === 'string' ? locSource().find((l) => l.id === k) : undefined;
    return loc ? { value: loc.name, enumerable: true, configurable: true, writable: false } : undefined;
  },
});

/** Live list of ACTIVE location ids (an array view over the location store), kept for existing screens. */
export const LOC_IDS: LocId[] = new Proxy([] as LocId[], {
  get: (_t, k) => {
    const ids = activeLocIds();
    const v = Reflect.get(ids, k);
    return typeof v === 'function' ? v.bind(ids) : v;
  },
  has: (_t, k) => Reflect.has(activeLocIds(), k),
  ownKeys: () => Reflect.ownKeys(activeLocIds()),
  getOwnPropertyDescriptor: (_t, k) => Reflect.getOwnPropertyDescriptor(activeLocIds(), k),
});

export type LogKind =
  | 'created' | 'payFailed' | 'labelIssued' | 'labelFailed' | 'confirmed' | 'slipPrinted'
  | 'partialFulfilled' | 'refundRequested' | 'refundConfirmed' | 'refundFailed' | 'restocked';

export interface LogEntry {
  when: 'earlier' | 'now';
  who: 'system' | 'you';
  kind: LogKind;
  carrier?: CarrierId;
  ref?: string;
  loc?: LocId;
  amount?: number;
  units?: number;
  /** Who did it (staff name, "customer" or "system") and their role, and when (epoch ms). See merchant/ops.ts. */
  actor?: string;
  role?: string;
  at?: number;
}

export interface Item {
  name: L; qty: number; unit: number; sku: string; stock?: Partial<Record<LocId, number>>;
  /** Units held for this line per location (reserved when the order was paid or created by hand). */
  reserved?: Partial<Record<LocId, number>>;
  /** Variant label (size/colour) when the line is a variant. */
  variant?: L;
}
export interface Fulfilment {
  ref: string; loc: LocId; qty: number[];
  /** Per-parcel shipment state; absent = the order's `ship`. */
  ship?: Ship;
  carrier?: CarrierId;
  /** Carrier tracking number when it differs from the label reference. */
  tracking?: string;
}
export type RefundStatus = 'pending' | 'confirmed' | 'failed';
export interface Refund { id: string; amount: number; qty: number[]; shipping: number; restock: number[]; loc: LocId; reason: string; status: RefundStatus }

export interface Order {
  ref: string;
  customer: L;
  city: L;
  hoursAgo: number;
  pay: Pay;
  ful: Ful;
  ship: Ship;
  fee: number;
  items: Item[];
  log: LogEntry[];
  confirmed: boolean;
  channel: Channel;
  fulfilments: Fulfilment[];
  refunds: Refund[];
  slips: number;
  /** Included in a payout that has already been paid out. */
  settled: boolean;
  /** Customer record (customers list) when known; older fixtures match by name. */
  customerId?: string;
  /** Order-level discount from a coupon (halalas, VAT-inclusive). Absent on fixture orders. */
  discount?: number;
  coupon?: string;
  /** How the shopper paid in the online store, and the provider's last word on it. */
  /** `bank` = bank transfer: until the merchant confirms it, its state is 'verifying' (awaiting transfer). */
  payment?: { method: 'card' | 'applepay' | 'bnpl' | 'cod' | 'bank'; state: 'paid' | 'declined' | 'verifying' | 'cod_due' | 'cod_collected' };
  /** Epoch ms when the order was placed in this session (online-store orders). */
  placedAt?: number;
  /* Operations (group 1, merchant/ops.ts). All optional: fixture orders may have none of them. */
  contact?: { phone?: string; email?: string };
  address?: { name?: string; line: string; city: L; notes?: string };
  customerNote?: string;
  gift?: { message?: string; to?: string };
  notes?: { id: string; text: string; by: string; at: number }[];
  tags?: string[];
  assignee?: string;
  /** Set when the order is cancelled. A cancelled order keeps its lines, payments and log. */
  cancelled?: { at: number; by: string; role: string; reason: string };
  /** A shopper asked to cancel after the self-cancel window; the merchant approves or declines. */
  cancelRequest?: { at: number; reason: string; state: 'open' | 'declined' };
  /** Actions that are not in `LogKind` (kept apart so older screens keep compiling). */
  activity?: import('./ops').Activity[];
  returns?: import('./ops').OrderReturn[];
  /** Created by hand in the dashboard; how it was or will be paid. */
  manual?: { pay: 'cash' | 'transfer' | 'link' | 'cod' };
}

export const CARRIERS: Record<CarrierId, { name: L; price: number }> = {
  a: { name: { ar: 'ناقل تجريبي أ · عادي', en: 'Test carrier A · standard' }, price: 2500 },
  b: { name: { ar: 'ناقل تجريبي ب · سريع', en: 'Test carrier B · express' }, price: 3900 },
};

const item = (ar: string, en: string, sku: string, qty: number, unit: number, stock?: Item['stock']): Item => ({ name: { ar, en }, qty, unit, sku, stock });
export const P = {
  abaya: (q: number, s?: Item['stock']) => item('عباية سوداء مطرّزة', 'Embroidered black abaya', 'ABY-LIN-BLA-M', q, 29000, s),
  shawl: (q: number, s?: Item['stock']) => item('شال حرير موغا', 'Muga silk stole', 'SHL-SLK-01', q, 9800, s),
  oud: (q: number, s?: Item['stock']) => item('زجاجة عطر كوبالت', 'Cobalt perfume bottle', 'OUD-100', q, 12900, s),
  bag: (q: number, s?: Item['stock']) => item('حقيبة جلد بنية', 'Tan leather handbag', 'BAG-LTH-01', q, 42000, s),
  wallet: (q: number, s?: Item['stock']) => item('محفظة جلد', 'Leather wallet', 'WLT-LTH-01', q, 16100, s),
  coffee: (q: number, s?: Item['stock']) => item('دلّة وفناجين قهوة', 'Dallah and coffee cups', 'COF-SET-01', q, 24000, s),
};

function order(
  ref: string, customer: L, city: L, hoursAgo: number, pay: Pay, ful: Ful, ship: Ship, fee: number, items: Item[],
  extra: Partial<Order> = {},
): Order {
  return {
    ref, customer, city, hoursAgo, pay, ful, ship, fee, items,
    log: [{ when: 'earlier', who: 'system', kind: pay === 'failed' ? 'payFailed' : 'created' }],
    confirmed: ful !== 'none', channel: 'online', fulfilments: [], refunds: [], slips: 0, settled: false,
    ...extra,
  };
}

/** The seven hand-written orders of the original vertical slice. */
export function fixtures(): Order[] {
  return [
    order('10482', { ar: 'سارة العتيبي', en: 'Sarah Alotaibi' }, { ar: 'الرياض، حي الملقا', en: 'Riyadh, Al Malqa' }, 5, 'paid', 'none', 'none', 2500, [P.abaya(1), P.shawl(2)]),
    order('10481', { ar: 'محمد القحطاني', en: 'Mohammed Alqahtani' }, { ar: 'جدة، حي الروضة', en: 'Jeddah, Al Rawdah' }, 3, 'paid', 'none', 'none', 2500, [P.oud(1)]),
    order('10480', { ar: 'نوف الشهري', en: 'Nouf Alshehri' }, { ar: 'الدمام، حي الشاطئ', en: 'Dammam, Al Shati' }, 2, 'paid', 'none', 'none', 0, [P.bag(1), P.wallet(2)], { channel: 'market' }),
    order('10479', { ar: 'عبدالله الدوسري', en: 'Abdullah Aldossari' }, { ar: 'الرياض، حي النرجس', en: 'Riyadh, Al Narjis' }, 1, 'failed', 'none', 'none', 2500, [P.coffee(1)]),
    order('10478', { ar: 'ريم الحربي', en: 'Reem Alharbi' }, { ar: 'المدينة المنورة', en: 'Madinah' }, 26, 'paid', 'done', 'label', 2500, [P.shawl(2)]),
    order('10477', { ar: 'فهد المطيري', en: 'Fahad Almutairi' }, { ar: 'أبها', en: 'Abha' }, 30, 'paid', 'done', 'transit', 2500, [P.oud(2)], { channel: 'app' }),
    order('10476', { ar: 'لمى الزهراني', en: 'Lama Alzahrani' }, { ar: 'الطائف', en: 'Taif' }, 72, 'paid', 'done', 'delivered', 0, [P.bag(1)]),
  ];
}

const FIRST: L[] = [
  { ar: 'سارة', en: 'Sarah' }, { ar: 'محمد', en: 'Mohammed' }, { ar: 'نوف', en: 'Nouf' }, { ar: 'عبدالله', en: 'Abdullah' },
  { ar: 'ريم', en: 'Reem' }, { ar: 'فهد', en: 'Fahad' }, { ar: 'لمى', en: 'Lama' }, { ar: 'خالد', en: 'Khalid' },
  { ar: 'هند', en: 'Hind' }, { ar: 'تركي', en: 'Turki' },
];
const LAST: L[] = [
  { ar: 'العتيبي', en: 'Alotaibi' }, { ar: 'القحطاني', en: 'Alqahtani' }, { ar: 'الشهري', en: 'Alshehri' }, { ar: 'الدوسري', en: 'Aldossari' },
  { ar: 'الحربي', en: 'Alharbi' }, { ar: 'المطيري', en: 'Almutairi' },
];
export const CITIES: L[] = [
  { ar: 'الرياض', en: 'Riyadh' }, { ar: 'جدة', en: 'Jeddah' }, { ar: 'الدمام', en: 'Dammam' }, { ar: 'المدينة المنورة', en: 'Madinah' },
  { ar: 'أبها', en: 'Abha' }, { ar: 'الطائف', en: 'Taif' }, { ar: 'الخبر', en: 'Khobar' }, { ar: 'بريدة', en: 'Buraidah' },
];

/** Every test person used by generated orders: first × last name, with a home city. */
export function people(): { name: L; city: L }[] {
  const out: { name: L; city: L }[] = [];
  FIRST.forEach((f, i) => LAST.forEach((l, j) => {
    out.push({ name: { ar: `${f.ar} ${l.ar}`, en: `${f.en} ${l.en}` }, city: CITIES[(i + j) % CITIES.length] });
  }));
  return out;
}

/** Deterministic pseudo-random sequence so fixtures are identical on every load. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export const TOTAL_ORDERS = 1200;

/** Orders beyond the original slice: a two-warehouse order, a settled order for refunds, and older history. */
export function extraOrders(): Order[] {
  const multi = order('10483', { ar: 'هند الحربي', en: 'Hind Alharbi' }, { ar: 'جدة، حي الشاطئ', en: 'Jeddah, Al Shati' }, 4, 'paid', 'none', 'none', 2500, [
    P.abaya(2, { ryd: 1, jed: 3 }), P.oud(1, { ryd: 2, jed: 0 }), P.coffee(1, { ryd: 0, jed: 2 }),
  ]);
  const settled = order('10475', { ar: 'خالد العتيبي', en: 'Khalid Alotaibi' }, { ar: 'الرياض', en: 'Riyadh' }, 120, 'paid', 'done', 'delivered', 2500,
    [P.bag(1), P.shawl(2)], { settled: true, channel: 'online' });
  const ppl = people();
  const rnd = seeded(42);
  const products = [P.abaya, P.shawl, P.oud, P.bag, P.wallet, P.coffee];
  const channels: Channel[] = ['online', 'online', 'online', 'market', 'app'];
  const out: Order[] = [multi, settled];
  const n = TOTAL_ORDERS - fixtures().length - out.length;
  for (let i = 0; i < n; i++) {
    const ref = String(10474 - i);
    const p = ppl[Math.floor(rnd() * ppl.length)];
    const r = rnd();
    const lines = [products[Math.floor(rnd() * products.length)](1 + Math.floor(rnd() * 2))];
    if (rnd() < 0.3) {
      const second = products[Math.floor(rnd() * products.length)](1);
      if (second.sku !== lines[0].sku) lines.push(second);
    }
    const fee = rnd() < 0.25 ? 0 : 2500;
    const ch = channels[Math.floor(rnd() * channels.length)];
    if (r < 0.02) out.push(order(ref, p.name, p.city, 12 + (i % 48), 'failed', 'none', 'none', fee, lines, { channel: ch }));
    else if (r < 0.035) out.push(order(ref, p.name, p.city, 25 + (i % 30), 'paid', 'none', 'none', fee, lines, { channel: ch, confirmed: i % 2 === 0 }));
    else if (r < 0.06) out.push(order(ref, p.name, p.city, 30 + (i % 20), 'paid', 'done', 'transit', fee, lines, { channel: ch }));
    else out.push(order(ref, p.name, p.city, 48 + i * 3, 'paid', 'done', 'delivered', fee, lines, { channel: ch, settled: true }));
  }
  return out;
}

/** The full demo order book used by the workspace (1,200 orders). Tests on the original slice use `fixtures()`. */
export function allOrders(): Order[] {
  return [...fixtures(), ...extraOrders()];
}

export const subtotal = (o: Order) => o.items.reduce((sum, i) => sum + i.qty * i.unit, 0);
export const total = (o: Order) => subtotal(o) - (o.discount ?? 0) + o.fee;
/** The next free order reference: one above the highest numeric reference in the book. */
export const nextOrderRef = (orders: { ref: string }[]): string => String(orders.reduce((m, o) => Math.max(m, Number(o.ref) || 0), 10000) + 1);
/** VAT contained in a VAT-inclusive total at 15%. */
export const vatIncluded = (o: Order) => Math.round((total(o) * 15) / 115);
export const units = (o: Order) => o.items.reduce((sum, i) => sum + i.qty, 0);
export const isToday = (o: Order) => o.hoursAgo < 12;
export const canFulfil = (o: Order) => o.pay === 'paid' && o.ship === 'none' && !o.cancelled;
/** Lines whose stock sits in more than one warehouse use the partial, per-location fulfilment flow. */
export const isMultiLocation = (o: Order) => o.items.some((i) => i.stock && Object.keys(i.stock).length > 1);

export const VIEWS: Record<View, (o: Order) => boolean> = {
  all: () => true,
  needs: (o) => o.pay === 'paid' && o.ful !== 'done' && !o.cancelled,
  late: (o) => o.pay === 'paid' && o.ful !== 'done' && o.hoursAgo > 24 && !o.cancelled,
  payfail: (o) => o.pay === 'failed' && !o.cancelled,
  shipped: (o) => o.ship !== 'none',
  returns: (o) => o.refunds.length > 0 || (o.returns?.length ?? 0) > 0,
};
export const VIEW_IDS = Object.keys(VIEWS) as View[];

export function search(orders: Order[], view: View, q: string, channel?: Channel): Order[] {
  const needle = q.trim().toLowerCase();
  return orders.filter(VIEWS[view]).filter((o) => !channel || o.channel === channel).filter(
    (o) => !needle || o.ref.includes(needle.replace('#', '')) || o.customer.ar.includes(needle) || o.customer.en.toLowerCase().includes(needle),
  );
}

/** One deterministic reference per order, so a retry can never create a second label. */
export const shipmentRef = (o: Order) => `SIM-${o.ref}-1`;

export function parseWeight(input: string): number | null {
  const w = Number(input.trim());
  return Number.isFinite(w) && w >= 0.1 && w <= 30 ? w : null;
}

/** Simulated label issuance. Returns the order unchanged when it is not eligible. */
export function issueLabel(o: Order, carrier: CarrierId, carrierDown: boolean): Order {
  if (!canFulfil(o)) return o;
  const ref = shipmentRef(o);
  if (carrierDown) {
    return { ...o, log: [...o.log, { when: 'now', who: 'you', kind: 'labelFailed', ref }] };
  }
  return {
    ...o, ful: 'done', ship: 'label', confirmed: true,
    fulfilments: [{ ref, loc: 'ryd', qty: o.items.map((i) => i.qty) }],
    log: [...o.log, { when: 'now', who: 'you', kind: 'labelIssued', carrier, ref }],
  };
}

export function formatMoney(halalas: number): string {
  return (halalas / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------- Bulk actions (QA04) ---------- */

export type BulkAction = 'confirm' | 'slips';
export type Ineligible = 'payNotConfirmed' | 'refunded' | 'alreadyFulfilled' | 'alreadyConfirmed';

/** Why an order cannot take a bulk action, or null when it can. */
export function bulkReason(o: Order, action: BulkAction): Ineligible | null {
  if (o.pay === 'failed') return 'payNotConfirmed';
  if (o.pay === 'refunded' || o.pay === 'partially_refunded') return 'refunded';
  if (o.ful === 'done') return 'alreadyFulfilled';
  if (action === 'confirm' && (o.confirmed || o.ful !== 'none')) return 'alreadyConfirmed';
  return null;
}

export function bulkEligibility(orders: Order[], action: BulkAction) {
  const eligible: Order[] = [];
  const reasons: Partial<Record<Ineligible, number>> = {};
  let ineligible = 0;
  for (const o of orders) {
    const r = bulkReason(o, action);
    if (r) { ineligible++; reasons[r] = (reasons[r] ?? 0) + 1; } else eligible.push(o);
  }
  return { eligible, ineligible, reasons };
}

/** Deterministic simulated failure: about one order in seven times out at the (simulated) document service. */
export const simBulkFails = (ref: string) => Number(ref) % 7 === 3;

/**
 * Apply a bulk action to the given refs. Eligibility is re-checked per order, so a retry never repeats
 * work that already succeeded (a confirmed order is skipped as "already confirmed").
 */
export function runBulk(all: Order[], refs: string[], action: BulkAction, fails: (ref: string) => boolean) {
  const want = new Set(refs);
  const ok: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  const orders = all.map((o) => {
    if (!want.has(o.ref)) return o;
    if (bulkReason(o, action)) { skipped.push(o.ref); return o; }
    if (fails(o.ref)) { failed.push(o.ref); return o; }
    ok.push(o.ref);
    return action === 'confirm'
      ? { ...o, confirmed: true, log: [...o.log, { when: 'now' as const, who: 'you' as const, kind: 'confirmed' as const }] }
      : { ...o, slips: o.slips + 1, log: [...o.log, { when: 'now' as const, who: 'you' as const, kind: 'slipPrinted' as const }] };
  });
  return { orders, ok, failed, skipped };
}

/* ---------- Partial, multi-location fulfilment (QA03) ---------- */

export const fulfilledQty = (o: Order, idx: number) => o.fulfilments.reduce((s, f) => s + (f.qty[idx] ?? 0), 0);
export const remainingQty = (o: Order, idx: number) => o.items[idx].qty - fulfilledQty(o, idx);
export const canFulfilPartial = (o: Order) => o.pay === 'paid' && o.ful !== 'done' && !o.cancelled;
export const nextFulfilmentRef = (o: Order) => `SIM-${o.ref}-${o.fulfilments.length + 1}`;

export type PickError = 'negative' | 'exceedsRemaining' | 'exceedsStock';
export function validatePicks(o: Order, loc: LocId, picks: number[]): { lines: (PickError | null)[]; empty: boolean } {
  const lines = o.items.map((it, idx) => {
    const q = picks[idx] ?? 0;
    if (!Number.isInteger(q) || q < 0) return 'negative' as const;
    if (q > remainingQty(o, idx)) return 'exceedsRemaining' as const;
    if (q > (it.stock?.[loc] ?? 0)) return 'exceedsStock' as const;
    return null;
  });
  return { lines, empty: picks.every((q) => !q) };
}

/** Ship part of an order from one location. One label per operation; a failed attempt keeps the same reference. */
export function fulfilPartial(o: Order, loc: LocId, picks: number[], carrierDown: boolean): Order {
  if (!canFulfilPartial(o)) return o;
  const v = validatePicks(o, loc, picks);
  if (v.empty || v.lines.some(Boolean)) return o;
  const ref = nextFulfilmentRef(o);
  if (carrierDown) return { ...o, log: [...o.log, { when: 'now', who: 'you', kind: 'labelFailed', ref }] };
  const fulfilments = [...o.fulfilments, { ref, loc, qty: o.items.map((_, i) => picks[i] ?? 0) }];
  const items = o.items.map((it, i) => (picks[i] ? { ...it, stock: { ...it.stock, [loc]: (it.stock?.[loc] ?? 0) - picks[i] } } : it));
  const next: Order = { ...o, items, fulfilments, ship: 'label', confirmed: true };
  const done = next.items.every((_, i) => remainingQty(next, i) === 0);
  return {
    ...next, ful: done ? 'done' : 'partial',
    log: [...o.log, { when: 'now', who: 'you', kind: 'partialFulfilled', ref, loc, units: picks.reduce((a, b) => a + (b || 0), 0) }],
  };
}

/* ---------- Refunds and returns (QA06) ---------- */

const live = (o: Order) => o.refunds.filter((r) => r.status !== 'failed');
/** Refunds requested or confirmed. Pending refunds count, so a second request cannot exceed what was paid. */
export const refundedTotal = (o: Order) => live(o).reduce((s, r) => s + r.amount, 0);
export const refundable = (o: Order) => (o.pay === 'failed' ? 0 : total(o) - refundedTotal(o));
export const refundedQty = (o: Order, idx: number) => live(o).reduce((s, r) => s + (r.qty[idx] ?? 0), 0);
export const shippingRefunded = (o: Order) => live(o).some((r) => r.shipping > 0);
export const canRefund = (o: Order) => o.pay !== 'failed' && refundable(o) > 0;

export type RefundError = 'nothing' | 'qty' | 'restock' | 'exceeds';
export function refundQuote(o: Order, picks: number[], withShipping: boolean, restock: number[]) {
  const lineErrors = o.items.map((it, i) => {
    const q = picks[i] ?? 0;
    if (!Number.isInteger(q) || q < 0 || q > it.qty - refundedQty(o, i)) return 'qty' as const;
    const r = restock[i] ?? 0;
    if (!Number.isInteger(r) || r < 0 || r > q) return 'restock' as const;
    return null;
  });
  const items = o.items.reduce((s, it, i) => s + (picks[i] ?? 0) * it.unit, 0);
  const shipping = withShipping && !shippingRefunded(o) ? o.fee : 0;
  const amount = items + shipping;
  let error: RefundError | null = null;
  if (lineErrors.some(Boolean)) error = lineErrors.find(Boolean)!;
  else if (amount === 0) error = 'nothing';
  else if (amount > refundable(o)) error = 'exceeds';
  return { items, shipping, amount, vat: Math.round((amount * 15) / 115), lineErrors, error, available: refundable(o) };
}

/** Record a refund request. It stays pending until the (simulated) provider confirms. Returns the order unchanged if invalid. */
export function requestRefund(o: Order, picks: number[], withShipping: boolean, restock: number[], loc: LocId, reason: string): Order {
  if (!canRefund(o)) return o;
  const q = refundQuote(o, picks, withShipping, restock);
  if (q.error) return o;
  const id = `RF-${o.ref}-${o.refunds.length + 1}`;
  const refund: Refund = { id, amount: q.amount, qty: o.items.map((_, i) => picks[i] ?? 0), shipping: q.shipping, restock: o.items.map((_, i) => restock[i] ?? 0), loc, reason, status: 'pending' };
  const log: LogEntry[] = [...o.log, { when: 'now', who: 'you', kind: 'refundRequested', ref: id, amount: q.amount }];
  const restocked = refund.restock.reduce((a, b) => a + b, 0);
  if (restocked) log.push({ when: 'now', who: 'you', kind: 'restocked', loc, units: restocked });
  return { ...o, refunds: [...o.refunds, refund], log };
}

/** The provider's answer to a pending refund. Payment state changes only on confirmation. */
export function settleRefund(o: Order, id: string, ok: boolean): Order {
  const r = o.refunds.find((x) => x.id === id);
  if (!r || r.status !== 'pending') return o;
  const refunds = o.refunds.map((x) => (x.id === id ? { ...x, status: ok ? 'confirmed' as const : 'failed' as const } : x));
  const confirmed = refunds.filter((x) => x.status === 'confirmed').reduce((s, x) => s + x.amount, 0);
  const pay: Pay = confirmed === 0 ? o.pay : confirmed >= total(o) ? 'refunded' : 'partially_refunded';
  return { ...o, refunds, pay, log: [...o.log, { when: 'now', who: 'system', kind: ok ? 'refundConfirmed' : 'refundFailed', ref: id, amount: r.amount }] };
}
