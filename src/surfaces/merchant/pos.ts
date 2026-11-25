// Point of sale (Phase D, channels group): a cashier screen on the store's own catalogue and stock.
// Pure rules: product lookup (barcode / SKU / name), cart totals with VAT, role-limited discounts, split tender with
// change, sale → order (channel 'pos') with stock taken at the chosen location, hold / resume, counter refunds and
// exchanges, and cash shifts with a counted drawer and variance. Money is integer halalas, prices include VAT.
// Simulated: card terminal and payment-link answers, PINs (kept in the session, not hashed), printing and WhatsApp.
// Not decided by LAK yet: hardware, terminal fees and LAK POS pricing (shown as «بانتظار الاعتماد»).
import type { L, LocId, Order } from './domain';
import { nextOrderRef } from './domain';
import { normaliseDigits, shipsWeighed, variantText, type Product } from './catalog';
import { available, levelOf, type Level } from './inventory';
import type { Role } from './perms';

/* ---------- Catalogue lookup ---------- */

/** A sellable stock-keeping unit: a product without variants, or one variant. */
export interface PosSku { productId: string; sku: string; name: L; variant?: L; unit: number; barcode: string; taxable: boolean }

/** Products the counter can sell: active, kept in stock (physical goods and food). */
export const posSellable = (p: Product) => p.status === 'active' && shipsWeighed(p.type);

export function posSkus(p: Product): PosSku[] {
  const base = { productId: p.id, name: p.name, barcode: p.barcode ?? '', taxable: p.taxable !== false };
  return p.variants.length
    ? p.variants.map((v) => ({ ...base, sku: v.sku, variant: variantText(v.color, v.size), unit: v.price, barcode: '' }))
    : [{ ...base, sku: p.sku, unit: p.price }];
}

const norm = (s: string) => normaliseDigits(s.trim()).toUpperCase();

/**
 * Scanner or typed search. An exact barcode or SKU returns that one unit (`exact`), so a scanner adds it at once;
 * otherwise products whose name (either language) or SKU contains the text.
 */
export function lookup(products: Product[], q: string): { exact: PosSku | null; products: Product[] } {
  const live = products.filter(posSellable);
  const n = norm(q);
  if (!n) return { exact: null, products: live };
  for (const p of live) {
    const hit = posSkus(p).find((s) => norm(s.sku) === n || (s.barcode && norm(s.barcode) === n) || (!p.variants.length && p.barcode && norm(p.barcode) === n));
    if (hit) return { exact: hit, products: [p] };
  }
  const t = q.trim().toLowerCase();
  return { exact: null, products: live.filter((p) => p.name.ar.includes(q.trim()) || p.name.en.toLowerCase().includes(t) || posSkus(p).some((s) => norm(s.sku).includes(n))) };
}

/** Units that can be sold at this location now (on hand minus every hold), never below zero. */
export const sellableAt = (levels: Level[], sku: string, loc: LocId) => { const l = levelOf(levels, sku, loc); return l ? Math.max(0, available(l)) : 0; };

/* ---------- Cart ---------- */

export interface PosLine extends PosSku { qty: number }
export interface PosDiscount { kind: 'pct' | 'amount'; /** Percent (0–100) or halalas. */ value: number; reason: string; /** Who approved it when above the cashier's own limit. */ approvedBy?: string }
export interface Cart { lines: PosLine[]; discount: PosDiscount | null; customerId: string | null }
export const emptyCart = (): Cart => ({ lines: [], discount: null, customerId: null });

export type AddError = 'noStock' | 'exceedsStock';
/** Add one unit (or `qty`) of a SKU. Never more than the location can sell: the counter does not oversell. */
export function addToCart(cart: Cart, s: PosSku, stock: number, qty = 1): { cart: Cart; error?: AddError } {
  const cur = cart.lines.find((l) => l.sku === s.sku);
  const want = (cur?.qty ?? 0) + qty;
  if (stock <= 0) return { cart, error: 'noStock' };
  if (want > stock) return { cart, error: 'exceedsStock' };
  return { cart: { ...cart, lines: cur ? cart.lines.map((l) => (l.sku === s.sku ? { ...l, qty: want } : l)) : [...cart.lines, { ...s, qty }] } };
}
export function setQty(cart: Cart, sku: string, qty: number, stock: number): { cart: Cart; error?: AddError } {
  if (qty <= 0) return { cart: { ...cart, lines: cart.lines.filter((l) => l.sku !== sku) } };
  if (qty > stock) return { cart, error: 'exceedsStock' };
  return { cart: { ...cart, lines: cart.lines.map((l) => (l.sku === sku ? { ...l, qty } : l)) } };
}

/* ---------- Discounts limited by role ---------- */

/** Highest discount each role may give without approval, in percent. The merchant sets these (POS settings). */
export type DiscountLimits = Record<Role, number>;
export const defaultLimits = (): DiscountLimits => ({ owner: 100, fulfilment: 10, finance: 0, marketing: 0 });

export const subtotalOf = (c: Cart) => c.lines.reduce((s, l) => s + l.unit * l.qty, 0);
export function discountAmount(c: Cart): number {
  const sub = subtotalOf(c);
  if (!c.discount) return 0;
  return Math.min(sub, c.discount.kind === 'pct' ? Math.round((sub * c.discount.value) / 100) : c.discount.value);
}
/** The discount as a percent of the subtotal (what role limits compare). */
export const discountPct = (c: Cart) => { const sub = subtotalOf(c); return sub ? (discountAmount(c) * 100) / sub : 0; };

export type DiscountError = 'value' | 'reason' | 'overLimit' | 'exceedsTotal';
/** Check a discount before applying. Over the role's limit needs a manager's approval (`approvedBy`). */
export function checkDiscount(c: Cart, d: PosDiscount, role: Role, limits: DiscountLimits): DiscountError | null {
  if (!Number.isFinite(d.value) || d.value <= 0 || (d.kind === 'pct' && d.value > 100)) return 'value';
  if (!d.reason.trim()) return 'reason';
  const sub = subtotalOf(c);
  if (d.kind === 'amount' && d.value > sub) return 'exceedsTotal';
  const pct = d.kind === 'pct' ? d.value : sub ? (d.value * 100) / sub : 0;
  if (pct > limits[role] + 1e-9 && !d.approvedBy) return 'overLimit';
  return null;
}

/** Totals. VAT is included in prices; untaxed lines carry none; the discount is shared across lines by value. */
export function totals(c: Cart) {
  const subtotal = subtotalOf(c);
  const discount = discountAmount(c);
  const total = subtotal - discount;
  const taxable = c.lines.filter((l) => l.taxable).reduce((s, l) => s + l.unit * l.qty, 0);
  const taxableAfter = subtotal ? Math.round((taxable * total) / subtotal) : 0;
  return { subtotal, discount, total, vat: Math.round((taxableAfter * 15) / 115), units: c.lines.reduce((s, l) => s + l.qty, 0) };
}

/* ---------- Split tender ---------- */

export type PayMethod = 'cash' | 'card' | 'link' | 'credit';
/** card/link wait for the (simulated) terminal or customer; cash and exchange credit are taken at once. */
export type PayState = 'pending' | 'paid' | 'declined';
export interface Tender { id: string; method: PayMethod; amount: number; state: PayState; ref?: string }

export type TenderError = 'amount' | 'overpayNonCash' | 'creditExceeds';
/**
 * Add a tender. Card and link can never exceed what is still owed (no change on a card); cash may exceed it and
 * the difference is change due. Exchange credit cannot exceed the credit available.
 */
export function checkTender(total: number, tenders: Tender[], t: Pick<Tender, 'method' | 'amount'>, creditAvailable = 0): TenderError | null {
  if (!Number.isInteger(t.amount) || t.amount <= 0) return 'amount';
  const live = tenders.filter((x) => x.state !== 'declined');
  const paid = live.reduce((s, x) => s + x.amount, 0);
  const owed = Math.max(0, total - paid);
  if (t.method === 'credit') {
    const used = live.filter((x) => x.method === 'credit').reduce((s, x) => s + x.amount, 0);
    return t.amount + used > creditAvailable ? 'creditExceeds' : null;
  }
  if ((t.method === 'card' || t.method === 'link') && t.amount > owed) return 'overpayNonCash';
  return null;
}

/** Where the sale stands: what is owed, change due (only from cash or credit), and whether it can be completed. */
export function tenderState(total: number, tenders: Tender[]) {
  const live = tenders.filter((x) => x.state !== 'declined');
  const settled = live.filter((x) => x.state === 'paid');
  const paid = settled.reduce((s, x) => s + x.amount, 0);
  const pending = live.filter((x) => x.state === 'pending').reduce((s, x) => s + x.amount, 0);
  const owed = Math.max(0, total - paid - pending);
  const change = Math.max(0, paid + pending - total);
  const cashIn = settled.filter((x) => x.method === 'cash').reduce((s, x) => s + x.amount, 0);
  return { paid, pending, owed, change, cashIn, cashNet: cashIn - change, complete: pending === 0 && paid >= total && total >= 0 };
}

/** Split the remaining balance evenly into `n` parts (last part takes the halalas left over). */
export function splitEven(owed: number, n: number): number[] {
  if (n < 1 || owed <= 0) return [];
  const part = Math.floor(owed / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? owed - part * (n - 1) : part));
}

/* ---------- Sale → order ---------- */

export interface PosMeta {
  loc: LocId;
  cashier: { id: string; name: string };
  shift: string;
  receipt: string;
  tenders: Tender[];
  change: number;
  /** Cash kept in the drawer for this sale (cash taken − change). */
  cashNet: number;
  discountReason?: string;
  discountApprovedBy?: string;
  /** This sale is an exchange against an earlier counter order. */
  exchangeOf?: string;
}

export const WALK_IN: L = { ar: 'عميل حضوري', en: 'Walk-in customer' };

/** The paid counter sale as an order: handed over at the counter (fulfilled from `loc`, no shipment). */
export function saleToOrder(cart: Cart, tenders: Tender[], ctx: {
  orders: { ref: string }[]; loc: LocId; city: L; cashier: { id: string; name: string }; role: string; shift: string;
  customer?: { id: string; name: L; phone?: string } | null; now: number; exchangeOf?: string;
}): Order {
  const t = totals(cart);
  const st = tenderState(t.total, tenders);
  const ref = nextOrderRef(ctx.orders);
  const qty = cart.lines.map((l) => l.qty);
  const meta: PosMeta = {
    loc: ctx.loc, cashier: ctx.cashier, shift: ctx.shift, receipt: `R-${ref}`, tenders: tenders.filter((x) => x.state === 'paid'), change: st.change, cashNet: st.cashNet,
    discountReason: cart.discount?.reason, discountApprovedBy: cart.discount?.approvedBy, exchangeOf: ctx.exchangeOf,
  };
  const mainPay = tenders.filter((x) => x.state === 'paid').sort((a, b) => b.amount - a.amount)[0]?.method;
  return {
    ref, customer: ctx.customer?.name ?? WALK_IN, city: ctx.city, hoursAgo: 0, pay: 'paid', ful: 'done', ship: 'delivered', fee: 0,
    items: cart.lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, sku: l.sku, variant: l.variant, stock: { [ctx.loc]: l.qty } })),
    log: [{ when: 'now', who: 'you', kind: 'created', actor: ctx.cashier.name, role: ctx.role, at: ctx.now }],
    confirmed: true, channel: 'pos', fulfilments: [{ ref: `${ref}-POS`, loc: ctx.loc, qty, ship: 'delivered' }], refunds: [], slips: 0, settled: false,
    customerId: ctx.customer?.id, discount: t.discount || undefined, placedAt: ctx.now, contact: ctx.customer?.phone ? { phone: ctx.customer.phone } : undefined,
    payment: mainPay === 'card' || mainPay === 'link' ? { method: 'card', state: 'paid' } : undefined,
    manual: mainPay === 'cash' || mainPay === 'credit' ? { pay: 'cash' } : undefined,
    pos: meta,
  };
}

/** Stock taken off the shelf at the counter location (applied with inventory.applyStockEffects). */
export const saleEffects = (cart: Cart, loc: LocId) => cart.lines.map((l) => ({ sku: l.sku, loc, reserved: 0, onHand: -l.qty }));

/** Any line now short at the location (stock changed since it was added, or a held sale was resumed). */
export function shortLines(cart: Cart, levels: Level[], loc: LocId): string[] {
  return cart.lines.filter((l) => l.qty > sellableAt(levels, l.sku, loc)).map((l) => l.sku);
}

/* ---------- Hold and resume ---------- */

export interface HeldSale { id: string; cart: Cart; loc: LocId; by: string; at: number; note: string }
export const nextHeldId = (list: HeldSale[]) => `H-${list.reduce((m, h) => Math.max(m, Number(h.id.replace(/\D/g, '')) || 0), 100) + 1}`;

/* ---------- Cashiers and PINs (simulated) ---------- */

/** PIN: 4 to 6 digits; Arabic digits accepted. */
export const validPin = (pin: string) => /^\d{4,6}$/.test(normaliseDigits(pin));
export const pinMatches = (pins: Record<string, string>, memberId: string, pin: string) => !!pins[memberId] && pins[memberId] === normaliseDigits(pin);
/** Roles that may run the counter. Finance sees shifts and sales; marketing has no counter access. */
export const canSell = (r: Role) => r === 'owner' || r === 'fulfilment';
/** Roles whose PIN approves a discount above the cashier's limit or a counter refund. */
export const canApprove = (r: Role, what: 'discount' | 'refund', limits: DiscountLimits, pct = 0) =>
  what === 'refund' ? r === 'owner' || r === 'finance' : limits[r] >= pct;

/* ---------- Shifts and cash count ---------- */

export interface CashMove { kind: 'in' | 'out'; amount: number; reason: string; at: number; by: string }
export interface Shift {
  id: string; loc: LocId; cashier: { id: string; name: string }; openedAt: number; float: number;
  moves: CashMove[];
  /** Cash handed back at the counter for refunds and exchanges during this shift. */
  cashRefunds: { ref: string; amount: number }[];
  closed?: { at: number; counted: number; expected: number; variance: number; note: string; counts: Record<string, number> };
}
export const nextShiftId = (list: Shift[]) => `SH-${list.reduce((m, s) => Math.max(m, Number(s.id.replace(/\D/g, '')) || 0), 300) + 1}`;
export const openShiftAt = (list: Shift[], loc: LocId) => list.find((s) => s.loc === loc && !s.closed);

/** Saudi riyal notes and coins a drawer is counted in (halalas). */
export const DENOMS = [50000, 20000, 10000, 5000, 1000, 500, 200, 100, 50, 25, 10, 5];

/** Cash the drawer should hold: opening float + cash kept from sales − cash refunds + paid in − paid out. */
export function expectedCash(s: Shift, orders: Order[]): number {
  const sales = orders.filter((o) => o.pos?.shift === s.id).reduce((t, o) => t + (o.pos?.cashNet ?? 0), 0);
  const refunds = s.cashRefunds.reduce((t, r) => t + r.amount, 0);
  const moves = s.moves.reduce((t, m) => t + (m.kind === 'in' ? m.amount : -m.amount), 0);
  return s.float + sales - refunds + moves;
}

/** Summary of a shift for the close screen and the shift report. */
export function shiftSummary(s: Shift, orders: Order[]) {
  const mine = orders.filter((o) => o.pos?.shift === s.id);
  const by = (m: PayMethod) => mine.reduce((t, o) => t + (o.pos?.tenders ?? []).filter((x) => x.method === m).reduce((a, x) => a + x.amount, 0), 0);
  const gross = mine.reduce((t, o) => t + o.items.reduce((a, i) => a + i.qty * i.unit, 0) - (o.discount ?? 0), 0);
  return { sales: mine.length, gross, cash: by('cash'), card: by('card'), link: by('link'), credit: by('credit'), change: mine.reduce((t, o) => t + (o.pos?.change ?? 0), 0), refunds: s.cashRefunds.reduce((t, r) => t + r.amount, 0), expected: expectedCash(s, orders) };
}

export const countTotal = (counts: Record<string, number>) => DENOMS.reduce((t, d) => t + d * (counts[String(d)] ?? 0), 0);

export type CloseError = 'counts' | 'note';
/** Close a shift with a counted drawer. Any difference from expected needs a note (who explains the gap). */
export function closeShift(s: Shift, orders: Order[], counts: Record<string, number>, note: string, now: number): { shift: Shift; error?: CloseError } {
  if (Object.values(counts).some((n) => !Number.isInteger(n) || n < 0)) return { shift: s, error: 'counts' };
  const counted = countTotal(counts);
  const expected = expectedCash(s, orders);
  const variance = counted - expected;
  if (variance !== 0 && !note.trim()) return { shift: s, error: 'note' };
  return { shift: { ...s, closed: { at: now, counted, expected, variance, note: note.trim(), counts } } };
}

/* ---------- Counter refunds and exchanges ---------- */

/** Units of a counter order line that can still come back (bought − already refunded). */
export const returnableAt = (o: Order, idx: number) => o.items[idx].qty - o.refunds.filter((r) => r.status !== 'failed').reduce((s, r) => s + (r.qty[idx] ?? 0), 0);

/**
 * Value of the picked units, the price actually paid: the order's discount is shared across lines by value,
 * so a refund never returns more than the customer paid.
 */
export function returnValue(o: Order, picks: number[]): number {
  const sub = o.items.reduce((s, i) => s + i.qty * i.unit, 0);
  const raw = o.items.reduce((s, it, i) => s + (picks[i] ?? 0) * it.unit, 0);
  return sub ? Math.round((raw * (sub - (o.discount ?? 0))) / sub) : 0;
}

export type CounterRefundError = 'nothing' | 'qty' | 'reason';
/**
 * Refund picked units at the counter. Cash goes back from the drawer at once (confirmed); a card refund waits for
 * the (simulated) provider. Restocked units go back on the shelf at the order's counter location.
 */
export function counterRefund(o: Order, picks: number[], restock: boolean, method: 'cash' | 'card' | 'credit', reason: string, who: string, now: number):
  { order: Order; effects: { sku: string; loc: LocId; reserved: number; onHand: number }[]; amount: number; error?: CounterRefundError } {
  const none = { order: o, effects: [], amount: 0 };
  if (!reason.trim()) return { ...none, error: 'reason' };
  if (o.items.some((_, i) => { const q = picks[i] ?? 0; return !Number.isInteger(q) || q < 0 || q > returnableAt(o, i); })) return { ...none, error: 'qty' };
  const amount = returnValue(o, picks);
  if (!picks.some((q) => q > 0) || amount <= 0) return { ...none, error: 'nothing' };
  const loc = o.pos?.loc ?? o.fulfilments[0]?.loc ?? 'ryd';
  const id = `RF-${o.ref}-${o.refunds.length + 1}`;
  const qty = o.items.map((_, i) => picks[i] ?? 0);
  const back = restock ? qty : qty.map(() => 0);
  const status = method === 'card' ? 'pending' as const : 'confirmed' as const;
  const refunds = [...o.refunds, { id, amount, qty, shipping: 0, restock: back, loc, reason: reason.trim(), status }];
  const confirmed = refunds.filter((r) => r.status === 'confirmed').reduce((s, r) => s + r.amount, 0);
  const paidTotal = o.items.reduce((s, i) => s + i.qty * i.unit, 0) - (o.discount ?? 0);
  const log = [...o.log, { when: 'now' as const, who: 'you' as const, kind: 'refundRequested' as const, ref: id, amount, actor: who, at: now }];
  if (status === 'confirmed') log.push({ when: 'now', who: 'you', kind: 'refundConfirmed', ref: id, amount, actor: who, at: now });
  const units = back.reduce((a, b) => a + b, 0);
  if (units) log.push({ when: 'now', who: 'you', kind: 'restocked', loc, units, actor: who, at: now } as never);
  const pay = confirmed === 0 ? o.pay : confirmed >= paidTotal ? 'refunded' as const : 'partially_refunded' as const;
  return { order: { ...o, refunds, pay, log }, effects: o.items.map((it, i) => ({ sku: it.sku, loc, reserved: 0, onHand: back[i] })).filter((e) => e.onHand > 0), amount };
}
