/* One store: the storefront reads the merchant's catalogue, stock, coupons and settings, and writes the orders it takes
   into the merchant's order book. Pure functions only (no React, no stores); state.ts and data.ts wire them to the
   session stores. Money is integer halalas. */
import type { L } from '../../core/lang';
import type { Product as MProduct } from '../merchant/catalog';
import { LOC_IDS, nextOrderRef, total as mTotal, type LocId, type Order as MOrder, type Pay as MPay } from '../merchant/domain';
import { available, type Level } from '../merchant/inventory';
import { CUSTOMER, openReturn, storeReturnState } from '../merchant/ops';
import { bestAutoOffer, offerDiscount, type Coupon as MCoupon, type OfferLine } from '../merchant/growth';
import { SOCIAL_IDS, normPolicy, type Customer, type Policy, type Provider, type SocialId, type StoreDetails, type Zone } from '../merchant/workspace';
import { isServed, type LinkContext, type StorePage, type StoreSeo } from '../dashboard/storefront/content';
import type { BankDetails, Plan } from '../merchant/finance';
import { shippingQuote, visibleAtCheckout } from '../dashboard/settings/model';
import {
  CITIES, DAY, MERCHANT, cityById, computeTotals, isSettled, vatIn,
  type CityId, type Coupon, type CouponResult, type FulState, type Order, type PayMethod, type PayState, type PricedLine, type Product, type ShipMethod, type ShipState, type Variant,
} from './domain';

/* ───────────── Catalogue ───────────── */

/** URL-safe category id from the merchant's English category name ("Fragrance" → "fragrance"). */
export const catSlug = (c: L): string => c.en.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';

/** Units a SKU can still sell: available (on hand − reserved) summed over warehouses, never below zero per warehouse. */
export function sellable(levels: Level[], sku: string): number {
  return levels.filter((l) => l.sku === sku).reduce((s, l) => s + Math.max(0, available(l)), 0);
}

/**
 * The storefront catalogue: active merchant products with the online channel on. Variant ids are `<product>~<SKU>`,
 * so cart lines survive edits to names and prices. Digital products have no stock limit.
 */
export function toStoreProducts(products: MProduct[], levels: Level[]): Product[] {
  const live = products.filter((p) => p.status === 'active' && p.channels.online);
  return live.map((p, i) => {
    const digital = p.type === 'digital';
    const stock = (sku: string) => (digital ? Number.POSITIVE_INFINITY : sellable(levels, sku));
    const variants: Variant[] = p.variants.length
      ? p.variants.map((v) => ({ id: `${p.id}~${v.sku}`, sku: v.sku, color: v.color || undefined, size: v.size || undefined, price: v.price, stock: stock(v.sku) }))
      : [{ id: `${p.id}~${p.sku}`, sku: p.sku, price: p.price, stock: stock(p.sku) }];
    const colors = [...new Set(variants.flatMap((v) => (v.color ? [v.color] : [])))];
    const sizes = [...new Set(variants.flatMap((v) => (v.size ? [v.size] : [])))];
    const low = Math.min(...variants.map((v) => v.price));
    const cat = catSlug(p.category);
    const details: L[] = [];
    if (p.weight && !digital) details.push({ ar: `الوزن: ${(p.weight / 1000).toLocaleString('en-US')} كجم`, en: `Weight: ${(p.weight / 1000).toLocaleString('en-US')} kg` });
    details.push({ ar: `رمز المنتج: ${p.sku}`, en: `Product code: ${p.sku}` });
    return {
      id: p.id, cat, kind: cat, catName: p.category, name: p.name, blurb: p.desc, details,
      compareAt: p.compareAt !== null && p.compareAt > low ? p.compareAt : undefined,
      rank: i + 1, added: live.length - i, colors, sizes, variants,
      weight: p.weight ?? undefined, returnable: !digital, digital,
    };
  });
}

export interface Category { id: string; name: L; count: number }
/** Categories that have at least one product in the store, in catalogue order. */
export function categoriesOf(products: Product[]): Category[] {
  const out: Category[] = [];
  for (const p of products) {
    const c = out.find((x) => x.id === p.cat);
    if (c) c.count++; else out.push({ id: p.cat, name: p.catName, count: 1 });
  }
  return out;
}

/** The variant id the store uses for a SKU, or undefined when no merchant product holds it. */
export function vidForSku(products: MProduct[], sku: string): { vid: string; productId: string } | undefined {
  const p = products.find((x) => x.sku === sku || x.variants.some((v) => v.sku === sku));
  return p && { vid: `${p.id}~${sku}`, productId: p.id };
}

/* ───────────── Settings ───────────── */

export interface StoreConfig {
  name: L;
  /** Cash-on-delivery fee. The merchant settings have none, so the store charges none. */
  codFee: number;
  codMin: number;
  codMax: number;
  /** Max unpaid COD orders per shopper; null = no limit. */
  codOpenLimit: number | null;
  guest: boolean;
  returnDays: number;
  /** Payment methods offered: only providers the merchant connected (and whose plan allows them). */
  methods: PayMethod[];
  bnplNames: L[];
  zones: Zone[];
  /** Bank-transfer details shown to the shopper when they choose bank transfer; null = not offered. */
  bank: BankDetails | null;
}

const FIXTURE_NAME_AR = 'دار نُوى';
/** The merchant's store name; the fixture name keeps its English spelling, anything else is shown as typed. */
export const storeName = (s: Pick<StoreDetails, 'name'>): L =>
  s.name.trim() === FIXTURE_NAME_AR ? MERCHANT.name : { ar: s.name.trim() || MERCHANT.name.ar, en: s.name.trim() || MERCHANT.name.en };

/** Return window in days, read from the published returns policy ("within 14 days"); 14 when it does not say. */
export function returnDaysFrom(policies: Policy[]): number {
  const p = policies.find((x) => x.id === 'returns');
  const live = p ? normPolicy(p).live : null;
  const m = live && `${live.en} ${live.ar}`.match(/(\d{1,3})\s*-?\s*(?:days?|يوم|أيام|يومًا|يوما)/i);
  return m ? Number(m[1]) : MERCHANT.returnDays;
}

const METHOD_OF: Record<string, PayMethod | undefined> = { mada: 'card', cards: 'card', amex: 'card', applepay: 'applepay', tabby: 'bnpl', tamara: 'bnpl', cod: 'cod', bank: 'bank' };
/** Store payment methods from connected providers. Bank transfer is offered only with bank details saved (see storeConfig); wallets the store cannot take are left out. */
export function payMethodsFrom(providers: Provider[], plan: Plan): { methods: PayMethod[]; bnplNames: L[] } {
  const live = visibleAtCheckout(providers, plan);
  const methods = (['card', 'applepay', 'bnpl', 'cod', 'bank'] as PayMethod[]).filter((m) => live.some((p) => METHOD_OF[p.id] === m));
  return { methods, bnplNames: live.filter((p) => METHOD_OF[p.id] === 'bnpl').map((p) => p.name) };
}

export function storeConfig(
  s: { store: Pick<StoreDetails, 'name'>; providers: Provider[]; plan: Plan; cod: { min: number; max: number }; policies: Policy[]; zones: Zone[]; bank?: BankDetails | null },
  checkout: { guest: boolean; codPerCustomer: number | null },
): StoreConfig {
  const pm = payMethodsFrom(s.providers, s.plan);
  return {
    name: storeName(s.store), codFee: 0, codMin: s.cod.min, codMax: s.cod.max, codOpenLimit: checkout.codPerCustomer, guest: checkout.guest,
    returnDays: returnDaysFrom(s.policies), methods: s.bank?.iban ? pm.methods : pm.methods.filter((x) => x !== 'bank'), bank: s.bank?.iban ? s.bank : null, bnplNames: pm.bnplNames, zones: s.zones,
  };
}

/* ───────────── Shipping from zones ───────────── */

const parts = (s: string) => s.split(/[,،]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const CATCH_ALL = /other|all\b|أخرى|كل/i;

/** The shipping zone covering a city: the zone that lists it, else a zone for "all other cities". */
export function zoneFor(zones: Zone[], city: L): Zone | undefined {
  return zones.find((z) => parts(z.cities.en).includes(city.en.toLowerCase()) || parts(z.cities.ar).includes(city.ar))
    ?? zones.find((z) => CATCH_ALL.test(z.cities.en) || CATCH_ALL.test(z.cities.ar));
}

/** Typical carrier transit (business days) by the store's delivery band; an estimate shown as such. */
const TRANSIT: Record<number, [number, number]> = { 0: [1, 2], 1: [2, 3], 2: [3, 5] };

/** Standard delivery to a city, priced by the merchant's zone (flat, or base + per started kg above the first). */
export function standardFor(zones: Zone[], city: CityId | undefined, weightGrams: number): ShipMethod | undefined {
  const c = cityById(city);
  const z = c && zoneFor(zones, c.name);
  if (!c || !z) return undefined;
  const cost = shippingQuote({ ...z, freeOver: null }, 0, weightGrams / 1000);
  return {
    id: 'standard', name: { ar: 'توصيل عادي', en: 'Standard delivery' }, cost, freeFrom: z.freeOver,
    zones: [c.zone], transit: { [c.zone]: TRANSIT[c.zone] }, note: z.name,
  };
}

export const cartWeight = (lines: { qty: number; weight?: number }[]) => lines.reduce((s, l) => s + l.qty * (l.weight ?? 0), 0);

/** The lowest free-delivery threshold the merchant set, with its zone, for the bag's progress bar. */
export function freeDeliveryOffer(zones: Zone[]): { from: number; zone: L } | undefined {
  const z = zones.filter((x) => x.freeOver !== null).sort((a, b) => a.freeOver! - b.freeOver!)[0];
  return z && { from: z.freeOver!, zone: z.name };
}

/** Cities the store delivers to (a zone covers them). */
export const deliverableCities = (zones: Zone[]) => CITIES.filter((c) => !!zoneFor(zones, c.name));

/* ───────────── Coupons ───────────── */

const RIYADH = 3 * 3_600_000;
const dayStart = (iso: string) => Date.parse(`${iso}T00:00:00Z`) - RIYADH;
/** Today's date in Riyadh as YYYY-MM-DD (the merchant's coupon dates are Riyadh dates). */
export const riyadhDate = (now: number) => new Date(now + RIYADH).toISOString().slice(0, 10);

/** A merchant coupon as the checkout evaluates it. `usedByCustomer` counts this shopper's earlier paid orders with it. */
export function toStoreCoupon(c: MCoupon, usedByCustomer = 0): Coupon {
  const ends = c.ends ? dayStart(c.ends) + DAY - 1 : undefined;
  return {
    code: c.code, kind: c.type === 'bogo' ? 'percent' : c.type, value: c.type === 'bogo' ? 0 : c.value, minSubtotal: c.minSpend || undefined, used: c.used,
    limit: c.limitTotal ?? undefined, perCustomer: c.limitPerCustomer ?? undefined, usedByCustomer,
    starts: dayStart(c.starts), expires: c.status === 'expired' ? Math.min(ends ?? Infinity, dayStart(c.starts)) : ends,
    paused: c.status === 'paused', hidden: c.status === 'draft',
  };
}

/* Offers beyond a plain code (dashboard «Coupons & offers»): items in scope, buy X get Y, and automatic offers. */

/** Basket lines as the merchant's offer engine sees them (category = the product's English category name). */
export const offerLines = (lines: PricedLine[], products: MProduct[]): OfferLine[] =>
  lines.map((l) => ({ productId: l.productId, category: products.find((p) => p.id === l.productId)?.category.en ?? '', qty: l.qty, unit: l.unit }));

/**
 * A typed code's result with the merchant's scope applied: the discount counts only items in scope, and a basket
 * with none of them gets the "for <category> only" answer. Plain codes are returned unchanged.
 */
export function scopedResult(res: CouponResult, coupons: MCoupon[], lines: PricedLine[], products: MProduct[]): CouponResult {
  const mc = res.status === 'valid' ? coupons.find((c) => c.code === res.code) : undefined;
  if (res.status !== 'valid' || !mc || (!mc.scope && mc.type !== 'bogo')) return res;
  const d = offerDiscount(mc, offerLines(lines, products));
  if (d.eligible === 0) {
    const first = mc.scope?.kind === 'product' ? products.find((p) => mc.scope!.ids.includes(p.id))?.category : products.find((p) => mc.scope?.ids.includes(p.category.en))?.category;
    return { status: 'not_eligible', code: res.code, reason: 'category', cat: first ? catSlug(first) : '' };
  }
  return mc.type === 'freeShip' ? res : { ...res, discount: Math.min(d.discount, d.eligible) };
}

/** The best automatic offer for the basket (no code typed), as a checkout result; undefined when none applies. */
export function autoOfferResult(coupons: MCoupon[], lines: PricedLine[], products: MProduct[], now: number): CouponResult | undefined {
  const best = bestAutoOffer(coupons, offerLines(lines, products), { shipping: 0 }, riyadhDate(now));
  if (!best) return undefined;
  return { status: 'valid', code: best.coupon.code, discount: best.r.discount, coupon: toStoreCoupon(best.coupon), freeShip: best.coupon.type === 'freeShip' };
}

/** Times a customer used a code on orders that were paid. */
export const couponUses = (orders: MOrder[], customerId: string | undefined, code: string) =>
  customerId ? orders.filter((o) => o.customerId === customerId && o.coupon === code && o.pay !== 'failed').length : 0;

/** Record one use of a code. */
export const useCoupon = (list: MCoupon[], code: string | undefined) => (code ? list.map((c) => (c.code === code ? { ...c, used: c.used + 1 } : c)) : list);

/* ───────────── Customers ───────────── */

/** The last nine digits of a Saudi mobile, so "+966 50 000 1005", "0500001005" and "500001005" compare equal. */
export const phoneKey = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '').slice(-9);

/** Find the customer by id, mobile or email, or add a new one. */
export function matchCustomer(
  list: Customer[], who: { id?: string; name: string; phone: string; email?: string; city: L }, today: string,
): { customers: Customer[]; customer: Customer; created: boolean } {
  const key = phoneKey(who.phone);
  const email = who.email?.trim().toLowerCase();
  const hit = (who.id && list.find((c) => c.id === who.id))
    || (key.length === 9 && list.find((c) => phoneKey(c.phone) === key))
    || (email && list.find((c) => c.email.toLowerCase() === email));
  if (hit) return { customers: list, customer: hit, created: false };
  const n = list.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 1000) + 1;
  const name = who.name.trim();
  const customer: Customer = {
    id: `C-${n}`, name: { ar: name, en: name }, city: who.city, email: who.email?.trim() ?? '',
    phone: `+966 ${key.slice(0, 2)} ${key.slice(2, 5)} ${key.slice(5)}`, consent: { email: false, sms: false }, since: today,
  };
  return { customers: [...list, customer], customer, created: true };
}

/* ───────────── Stock reservation ───────────── */

/**
 * Reserve units for a paid order: from the first warehouse that can cover the whole line, else split across
 * warehouses in order. Never reserves more than is available; `short` is what could not be reserved.
 */
export function reserve(levels: Level[], sku: string, qty: number): { levels: Level[]; picks: Partial<Record<LocId, number>>; short: number } {
  const mine = LOC_IDS.map((loc) => levels.find((l) => l.sku === sku && l.loc === loc)).filter((l): l is Level => !!l);
  const picks: Partial<Record<LocId, number>> = {};
  const whole = mine.find((l) => available(l) >= qty);
  if (whole) picks[whole.loc] = qty;
  else {
    let left = qty;
    for (const l of mine) {
      const take = Math.min(left, Math.max(0, available(l)));
      if (take > 0) { picks[l.loc] = take; left -= take; }
    }
  }
  const taken = Object.values(picks).reduce((a: number, b) => a + (b ?? 0), 0);
  return {
    levels: levels.map((l) => (l.sku === sku && picks[l.loc] ? { ...l, reserved: l.reserved + picks[l.loc]!, version: l.version + 1 } : l)),
    picks, short: qty - taken,
  };
}

/* ───────────── Orders: storefront → merchant ───────────── */

/** The merchant's payment state for a storefront payment state. Anything not collected or promised reads as failed. */
export function merchantPay(s: PayState): MPay {
  if (s === 'refunded') return 'refunded';
  if (s === 'refunded_part') return 'partially_refunded';
  return isSettled(s) ? 'paid' : 'failed';
}
const paymentState = (s: PayState): NonNullable<MOrder['payment']>['state'] =>
  s === 'paid' || s === 'cod_due' || s === 'cod_collected' || s === 'verifying' ? s : s === 'challenge' || s === 'transfer_due' ? 'verifying' : 'declined';

export interface Book { orders: MOrder[]; levels: Level[]; customers: Customer[]; coupons: MCoupon[] }

/**
 * Mirror a storefront order into the merchant's book after a payment event. A first attempt that is still in a bank
 * challenge creates nothing. The merchant order is created once (same reference), its payment follows the shopper's;
 * when it becomes paid (or COD is confirmed) stock is reserved, the coupon use is recorded, and the log says so.
 */
export function syncOrder(book: Book, before: Order | undefined, after: Order, ctx: { products: Product[]; now: number; gift?: { message?: string } }): Book {
  const existing = book.orders.find((o) => o.ref === after.ref);
  if (!existing && (after.pay.state === 'awaiting' || after.pay.state === 'challenge')) return book;
  const wasPaid = !!before && isSettled(before.pay.state);
  const nowPaid = isSettled(after.pay.state);
  const becamePaid = nowPaid && !wasPaid && (!existing || existing.pay === 'failed');
  let { customers, levels, coupons } = book;

  let customerId = existing?.customerId;
  let customerName = existing?.customer;
  const city = cityById(after.address?.city);
  const cityL: L = city ? { ar: `${city.name.ar}${after.address?.district ? `، ${districtL(after.address.city, after.address.district).ar}` : ''}`, en: `${city.name.en}${after.address?.district ? `, ${after.address.district}` : ''}` } : { ar: '', en: '' };
  if (!existing) {
    const m = matchCustomer(customers, { id: after.customerId, name: after.address?.name ?? '', phone: after.contact.phone, email: after.contact.email, city: city?.name ?? { ar: '', en: '' } }, riyadhDate(ctx.now));
    customers = m.customers;
    customerId = m.customer.id;
    customerName = m.customer.name;
  }

  const picks: Record<string, Partial<Record<LocId, number>>> = {};
  if (becamePaid) {
    for (const line of after.lines) {
      if (!line.sku) continue;
      const p = ctx.products.find((x) => x.id === line.productId);
      if (p?.digital) continue;
      const r = reserve(levels, line.sku, line.qty);
      levels = r.levels;
      picks[line.sku] = r.picks;
    }
    coupons = useCoupon(coupons, after.coupon);
  }

  const items = after.lines.map((line, i) => {
    const p = ctx.products.find((x) => x.id === line.productId);
    const pk = line.sku ? picks[line.sku] : undefined;
    const prev = existing?.items[i];
    return {
      name: p?.name ?? line.name ?? prev?.name ?? { ar: line.sku ?? '', en: line.sku ?? '' }, qty: line.qty, unit: line.unit, sku: line.sku ?? '',
      // Stock per warehouse is only listed when the line was split, so the dashboard offers per-location fulfilment.
      ...(pk && Object.keys(pk).length > 1 ? { stock: pk } : prev?.stock ? { stock: prev.stock } : {}),
      // What was held for this line, per warehouse: released when it ships or the order is cancelled (merchant/ops.ts).
      ...(pk ? { reserved: pk } : prev?.reserved ? { reserved: prev.reserved } : {}),
    };
  });
  const pay = merchantPay(after.pay.state);
  const base: MOrder = existing ?? {
    ref: after.ref, customer: customerName!, city: cityL, hoursAgo: 0, pay, ful: 'none', ship: 'none', fee: 0, items,
    log: [{ when: 'now', who: 'system', kind: pay === 'paid' ? 'created' : 'payFailed' }],
    confirmed: false, channel: 'online', fulfilments: [], refunds: [], slips: 0, settled: false, placedAt: after.at,
  };
  const log = existing && existing.pay !== pay && pay === 'paid' ? [...existing.log, { when: 'now' as const, who: 'system' as const, kind: 'created' as const }] : base.log;
  const order: MOrder = {
    ...base, pay, items, log, customerId,
    fee: after.totals.shipping + after.totals.codFee, discount: after.totals.discount || undefined, coupon: after.coupon,
    payment: { method: after.pay.method, state: paymentState(after.pay.state) },
    // Contact, address and notes for the dashboard (shown by role there).
    contact: { phone: after.contact.phone ? `+966 ${after.contact.phone}` : existing?.contact?.phone, email: after.contact.email ?? existing?.contact?.email },
    ...(after.address ? { address: { name: after.address.name, line: [districtL(after.address.city, after.address.district).ar, after.address.street, after.address.building].filter(Boolean).join('، '), city: cityL, notes: after.address.notes?.trim() || undefined } } : {}),
    ...(ctx.gift || existing?.gift ? { gift: ctx.gift ?? existing?.gift } : {}),
  };
  const orders = existing ? book.orders.map((o) => (o === existing ? order : o)) : [order, ...book.orders];
  return { orders, levels, customers, coupons };
}

function districtL(city: CityId | undefined, d: string): L {
  return cityById(city)?.districts.find((x) => x.en === d) ?? { ar: d, en: d };
}

/** Next reference for a new storefront order: free in the merchant's book and among this session's checkouts. */
export const nextStoreRef = (merchant: { ref: string }[], store: { ref: string }[]) => nextOrderRef([...merchant, ...store]);

/* ───────────── Orders: merchant → shopper ───────────── */

const FUL: Record<MOrder['ful'], FulState> = { none: 'unfulfilled', partial: 'preparing', done: 'fulfilled' };
const SHIP: Record<MOrder['ship'], ShipState> = { none: 'none', label: 'label', transit: 'in_transit', delivered: 'delivered' };

/** What the shopper sees of the merchant's work: fulfilment, shipment, tracking reference, refunds, COD collected. */
export function withMerchant(o: Order, m: MOrder | undefined, now: number): Order {
  if (!m) return o;
  const ful: FulState = m.ful === 'none' && m.confirmed ? 'preparing' : FUL[m.ful];
  const shipment = SHIP[m.ship];
  let state = o.pay.state;
  if (m.pay === 'refunded') state = 'refunded';
  else if (m.pay === 'partially_refunded') state = 'refunded_part';
  else if (state === 'cod_due' && shipment === 'delivered') state = 'cod_collected';
  const delivered = shipment === 'delivered';
  // Return stages and refund progress come from the merchant's handling of each request (same RMA id).
  const returns = o.returns.map((r) => {
    const mr = m.returns?.find((x) => x.id === r.id);
    return mr ? { ...r, ...storeReturnState(mr, m.refunds) } : r;
  });
  return {
    ...o, ful, shipment, pay: { ...o.pay, state }, returns,
    trackingNo: m.fulfilments.at(-1)?.tracking ?? m.fulfilments.at(-1)?.ref ?? o.trackingNo,
    deliveredAt: delivered ? o.deliveredAt ?? Math.min(now, Math.max(o.at, o.eta?.to ?? o.at)) : undefined,
    cancelled: m.cancelled ? { at: m.cancelled.at, by: m.cancelled.by === 'customer' ? 'customer' : 'store' } : undefined,
    cancelRequest: m.cancelRequest?.state,
  };
}

const RETURN_REASON: Record<string, string> = { size: 'مقاس غير مناسب · Wrong size', not_as_described: 'غير مطابق للوصف · Not as described', damaged: 'تالف · Damaged', changed_mind: 'غيّر رأيه · Changed mind' };
/** Return requests the shopper sent from the store become merchant returns with the same RMA id (once each). */
export function mirrorReturns(m: MOrder, o: Order): MOrder {
  let next = m;
  for (const r of o.returns) {
    if ((next.returns ?? []).some((x) => x.id === r.id)) continue;
    const lines = r.lines.map((l) => {
      const sku = o.lines.find((x) => x.vid === l.vid)?.sku ?? l.vid.split('~')[1];
      return { idx: next.items.findIndex((it) => it.sku === sku), qty: l.qty, reason: RETURN_REASON[l.reason] ?? l.reason };
    }).filter((l) => l.idx >= 0);
    next = openReturn(next, lines, CUSTOMER, r.at, { id: r.id, source: 'store', method: r.method, refundTo: r.refundTo, iban: r.iban }).order;
  }
  return next;
}

/** A merchant order the shopper did not place in this session (history, other customers), seen from the store. */
export function fromMerchant(m: MOrder, products: MProduct[], customer: Customer | undefined, now: number): Order {
  const at = m.placedAt ?? now - m.hoursAgo * 3_600_000;
  const lines = m.items.map((i) => {
    const v = vidForSku(products, i.sku);
    return { vid: v?.vid ?? `?~${i.sku}`, productId: v?.productId ?? '', qty: i.qty, unit: i.unit, amount: i.qty * i.unit, sku: i.sku, name: i.name };
  });
  const totals = { ...computeTotals(lines, { discount: m.discount ?? 0, shipping: m.fee }), total: mTotal(m) };
  const method = m.payment?.method ?? 'card';
  const state: PayState = m.pay === 'failed' ? (m.payment?.state === 'verifying' ? 'verifying' : 'declined')
    : method === 'cod' ? (m.ship === 'delivered' ? 'cod_collected' : 'cod_due') : 'paid';
  const base: Order = {
    ref: m.ref, key: `m-${m.ref}`, at, customerId: m.customerId ?? customer?.id,
    contact: { phone: customer ? phoneKey(customer.phone) : '', email: customer?.email },
    lines, coupon: m.coupon, totals: { ...totals, vat: vatIn(totals.total) }, ship: 'standard',
    shipName: { ar: 'توصيل عادي', en: 'Standard delivery' },
    pay: { method, state, attempts: [] }, ful: 'unfulfilled', shipment: 'none', returns: [],
  };
  const seen = withMerchant(base, m, now);
  // History orders have no recorded delivery time; take the order time plus a typical three days.
  return seen.shipment === 'delivered' ? { ...seen, deliveredAt: Math.min(now, at + 3 * DAY) } : seen;
}

/** The coupon to advertise on the homepage: the first one the checkout would accept today (any basket permitting). */
export function liveOffer(list: MCoupon[], now: number): MCoupon | undefined {
  return list.find((c) => {
    // The banner says "use code X on everything": automatic and item-scoped offers do not fit that sentence.
    if (c.auto || c.scope || c.type === 'bogo') return false;
    const s = toStoreCoupon(c);
    return !s.hidden && !s.paused && (s.starts ?? 0) <= now && (s.expires === undefined || now <= s.expires) && (s.limit === undefined || s.used < s.limit);
  });
}

/* ───────────── Pages, menus and SEO (dashboard/storefront/content.ts) ───────────── */

/** Everything a menu link can point at, from the merchant's live catalogue, pages and policies. */
export function linkContext(products: MProduct[], levels: Level[], pages: StorePage[], policies: Policy[]): LinkContext {
  const store = toStoreProducts(products, levels);
  return {
    categories: categoriesOf(store).map((c) => ({ id: c.id, name: c.name })),
    products: products.filter((p) => p.status !== 'archived').map((p) => ({ id: p.id, name: p.name, live: store.some((s) => s.id === p.id) })),
    pages,
    policies: policies.map((p) => ({ id: p.id, live: !!normPolicy(p).live })),
  };
}
/** A served information page by its slug (published and not hidden), else undefined. */
export const servedPage = (pages: StorePage[], slug: string | undefined) => pages.find((p) => p.slug === slug && isServed(p));
/** Browser tab title for a store page: the page's own SEO title, else "<page> | <store SEO title or name>". */
export function docTitle(seo: StoreSeo, storeName: L, lang: 'ar' | 'en', page?: string): string {
  const site = seo.title[lang].trim() || storeName[lang];
  return page ? `${page} | ${storeName[lang]}` : site;
}
/** Social links the merchant saved, in a fixed order, https only. */
export const socialLinks = (s: Partial<Record<SocialId, string>> | undefined) =>
  SOCIAL_IDS.flatMap((id) => (s?.[id] && /^https:\/\//i.test(s[id]!.trim()) ? [{ id, url: s[id]!.trim() }] : []));
