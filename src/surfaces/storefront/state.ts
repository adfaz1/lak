/* Storefront session state and actions. The catalogue, stock, coupons, settings, customers and the order book are the
   merchant's stores (merchant/stores.ts); this file keeps only what belongs to the shopper's session: the bag, the
   checkout form, the account (saved addresses, wishlist) and the checkout record of each order placed here (payment
   attempts, address, returns). Simulated state for the tab session; "Reset data" clears it. */
import { createStore } from '../../core/store';
import { catalogXStore, couponsStore, customersStore, financeStore, levelsStore, locationsStore, ordersStore as merchantOrders, productsStore, settingsStore, wishEventsStore } from '../merchant/stores';
import { assignCodes, bagNeeds, bookSlots, campaignTake, type OrderExtras } from '../merchant/catalog-extras';
import { addWish } from '../merchant/demand';
import { CUSTOMER as CUSTOMER_ACTOR, cancelBlock, cancelOrder, requestCancel } from '../merchant/ops';
import { applyStockEffects } from '../merchant/inventory';
import { refundTx } from '../merchant/finance';
import { canSelfCancel } from '../dashboard/settings/model';
import { customerFixtures } from '../merchant/workspace';
import { checkoutStore as checkoutSettingsStore } from '../dashboard/settings/stores';
import {
  applyPayment, evaluateCoupon, isSettled, pricedLines, submitOrder,
  type Address, type Cart, type CityId, type Draft, type Order, type Outcome, type PayEvent, type PayMethod, type Product, type ShipId,
} from './domain';
import {
  autoOfferResult, couponUses, matchCustomer, scopedResult, nextStoreRef, phoneKey, shipFrom, shipOptions, storeConfig, syncOrder, toStoreCoupon, toStoreProducts,
  mirrorReturns, withMerchant, riyadhDate, type StoreConfig,
} from './bridge';

import { attributeOrder } from '../dashboard/storefront/state';
import { creditPartnerOrder } from '../dashboard/marketing/affiliates-store';
import { attributeLinkOrder } from '../dashboard/apps/free/integrations-state';

const sid = () => Math.random().toString(36).slice(2, 10);

/* ───────────── Live reads of the merchant's data ───────────── */

export const liveCatalog = (): Product[] => toStoreProducts(productsStore.get(), levelsStore.get(), catalogXStore.get());
export const liveConfig = (): StoreConfig => storeConfig(settingsStore.get(), checkoutSettingsStore.get());

export const cartStore = createStore.key('storefront.cartStore')<Cart>(() => ({ lines: [] }));

export interface SavedAddress extends Address { id: string; label: string }
/** The test shopper is an existing customer of the store (C-1005), so signed-in orders land on her profile. */
const me = customerFixtures().find((c) => c.id === 'C-1005')!;
export const CUSTOMER = { id: me.id, name: me.name, phone: phoneKey(me.phone), email: me.email };

export interface Account { signedIn: boolean; addresses: SavedAddress[]; defaultId?: string; wishlist: string[] }
export const accountStore = createStore.key('storefront.accountStore')<Account>(() => ({
  signedIn: false,
  wishlist: ['p4'],
  defaultId: 'a1',
  addresses: [
    { id: 'a1', label: 'home', name: me.name.en, phone: CUSTOMER.phone, city: 'riyadh', district: 'Al Malqa', street: 'Anas Ibn Malik Rd', building: '8132', nationalCode: 'RMLA8132' },
    { id: 'a2', label: 'work', name: me.name.en, phone: CUSTOMER.phone, city: 'riyadh', district: 'Al Olaya', street: 'Olaya St', building: '7421' },
  ],
}));

export interface CheckoutState {
  sessionId: string;
  mode: 'guest' | 'account';
  email: string;
  addr: Partial<Address>;
  savedId?: string;
  ship: ShipId;
  method: PayMethod;
  gift: boolean;
  giftMsg: string;
  /** Last payment problem shown on the checkout, kept until the next attempt. */
  notice?: { kind: 'declined' | 'challenge' | 'verify_failed'; ref: string };
  /** Answers to the store's checkout questions (order custom fields, appointment dates), by question id. */
  answers?: Record<string, string>;
  /** The shopper confirmed the minimum age a restricted product asks for. */
  ageOk?: boolean;
}
const freshCheckout = (): CheckoutState => ({ sessionId: sid(), mode: 'guest', email: '', addr: {}, ship: 'standard', method: 'card', gift: false, giftMsg: '' });
export const checkoutStore = createStore.key('storefront.checkoutStore')<CheckoutState>(freshCheckout);

export interface TestState { open: boolean; applePay: boolean; outcome: Outcome; verify: 'paid' | 'failed' | 'unknown' }
export const testStore = createStore.key('storefront.testStore')<TestState>(() => ({ open: false, applePay: false, outcome: 'success', verify: 'paid' }));

/**
 * Checkout records of orders placed in this session: payment attempts, address and return requests. The order itself
 * lives in the merchant's book under the same reference; fulfilment and shipment are read from there.
 */
export const ordersStore = createStore.key('storefront.checkouts')<Order[]>(() => []);

/* ───────────── Actions ───────────── */

/** The customer this checkout belongs to: the signed-in shopper, or an existing customer matching the typed mobile/email. */
export function checkoutCustomerId(): string | undefined {
  const co = checkoutStore.get();
  if (co.mode === 'account' && accountStore.get().signedIn) return CUSTOMER.id;
  const phone = co.addr.phone ? phoneKey(co.addr.phone) : '';
  if (phone.length !== 9 && !co.email.trim()) return undefined;
  const m = matchCustomer(customersStore.get(), { name: '', phone, email: co.email, city: { ar: '', en: '' } }, '');
  return m.created ? undefined : m.customer.id;
}

export function couponResult(cart: Cart, products: Product[]) {
  // No code typed: the merchant's best automatic offer (buy X get Y, category discount…) applies on its own.
  if (!cart.coupon) return autoOfferResult(couponsStore.get(), pricedLines(cart, products), productsStore.get(), Date.now());
  const code = cart.coupon.trim().toUpperCase();
  const uses = couponUses(merchantOrders.get(), checkoutCustomerId(), code);
  const list = couponsStore.get().map((c) => toStoreCoupon(c, c.code === code ? uses : 0));
  return scopedResult(evaluateCoupon(cart.coupon, pricedLines(cart, products), list, Date.now()), couponsStore.get(), pricedLines(cart, products), productsStore.get());
}

export function buildDraft(): Draft {
  const cart = cartStore.get();
  const products = liveCatalog();
  const cfg = liveConfig();
  const co = checkoutStore.get();
  const acc = accountStore.get();
  const lines = pricedLines(cart, products);
  const c = couponResult(cart, products);
  const signed = co.mode === 'account' && acc.signedIn;
  // Nothing ships (downloads, codes, services, bookings): no address and no city, only contact details.
  const needs = bagNeeds(lines);
  const city = needs.address ? (co.addr.city as CityId | undefined) : undefined;
  // The delivery method the shopper picked among those the merchant's shipping setup offers for this city and bag.
  const discount = c?.status === 'valid' ? c.discount : 0;
  const opts = shipOptions(cfg, city, lines, { now: Date.now(), goods: lines.reduce((s, l) => s + l.amount, 0) - discount, cod: co.method === 'cod', locations: locationsStore.get() });
  const chosen = opts.find((x) => x.id === co.ship) ?? opts[0];
  return {
    sessionId: co.sessionId, lines, coupon: c?.status === 'valid' ? c.code : undefined, discount: c?.status === 'valid' ? c.discount : 0,
    freeShip: c?.status === 'valid' && c.freeShip, ship: chosen?.id ?? co.ship, city, method: co.method,
    address: needs.address ? (co.addr as Address) : undefined,
    contact: { phone: co.addr.phone ?? '', email: co.email || undefined, ...(needs.address ? {} : { name: co.addr.name?.trim() || undefined }) },
    customerId: signed ? CUSTOMER.id : undefined, codFee: cfg.codFee,
    shipMethod: chosen,
    ref: nextStoreRef(merchantOrders.get(), ordersStore.get()),
  };
}

/** What the checkout adds to each order (answers, pre-order terms, bookings…), by order reference. Catalogue extras. */
export const extrasStore = createStore.key('storefront.orderExtras')<Record<string, OrderExtras>>(() => ({}));

/** Idempotent: the same draft returns the same order. `extras` (answers, pre-order…) are kept for that order. */
export function submit(draft: Draft, extras?: OrderExtras): { order: Order; created: boolean } {
  let res!: ReturnType<typeof submitOrder>;
  ordersStore.set((all) => { res = submitOrder(all, draft, Date.now()); return res.orders; });
  if (res.created) attributeOrder(res.order.ref);
  if (res.created) creditPartnerOrder(res.order);
  if (res.created) attributeLinkOrder(res.order.ref);
  if (extras && !isSettled(res.order.pay.state)) extrasStore.set((m) => ({ ...m, [res.order.ref]: extras }));
  return { order: res.order, created: res.created };
}

/** A checkout record seen with the merchant's progress (fulfilment, shipment, refunds). */
export function getOrder(ref: string): Order | undefined {
  const o = ordersStore.get().find((x) => x.ref === ref);
  return o && withMerchant(o, merchantOrders.get().find((m) => m.ref === ref), Date.now());
}

/**
 * Change the shopper's record of an order (received, return request). An order from the merchant's history has no
 * record yet: `seed` (the order as the shopper sees it) starts one.
 */
export function updateOrder(ref: string, fn: (o: Order) => Order, seed?: Order): void {
  ordersStore.set((all) => (all.some((o) => o.ref === ref) ? all.map((o) => (o.ref === ref ? fn(o) : o)) : seed ? [...all, fn(seed)] : all));
  // A return request reaches the merchant's order as a return to handle (same RMA id).
  const o = ordersStore.get().find((x) => x.ref === ref);
  const m = merchantOrders.get().find((x) => x.ref === ref);
  if (o && m && o.returns.length) {
    const next = mirrorReturns(m, o);
    if (next !== m) merchantOrders.set((list) => list.map((x) => (x.ref === ref ? next : x)));
  }
}

/**
 * The shopper cancels: inside the merchant's self-cancel window and before anything ships, the order is cancelled at
 * once (refund requested, stock released); after it, the merchant receives a cancel request to approve or decline.
 */
export function cancelFromStore(ref: string, reason: string): 'cancelled' | 'requested' | 'blocked' {
  const m = merchantOrders.get().find((x) => x.ref === ref);
  if (!m || cancelBlock(m) || m.cancelRequest?.state === 'open') return 'blocked';
  const now = Date.now();
  const mins = (now - (m.placedAt ?? now - m.hoursAgo * 3_600_000)) / 60_000;
  const why = reason.trim() || 'إلغاء من العميل · Cancelled by the customer';
  if (canSelfCancel(checkoutSettingsStore.get(), mins, m.ful !== 'none' || m.ship !== 'none')) {
    const r = cancelOrder(m, why, CUSTOMER_ACTOR, now);
    if (r.order === m) return 'blocked';
    merchantOrders.set((list) => list.map((x) => (x.ref === ref ? r.order : x)));
    if (r.effects.length) levelsStore.set((ls) => applyStockEffects(ls, r.effects, 'customer', ref, `CX-${ref}`).levels);
    const rf = r.order.refunds.length > m.refunds.length ? r.order.refunds[r.order.refunds.length - 1] : undefined;
    if (rf) financeStore.set((f) => ({ ...f, txs: [...f.txs, refundTx(r.order, rf, `TX-${rf.id}`, undefined, false)] }));
    return 'cancelled';
  }
  merchantOrders.set((list) => list.map((x) => (x.ref === ref ? requestCancel(x, reason, now) : x)));
  return 'requested';
}

/** Whether the shopper can still cancel by themself (window open, nothing shipped or fulfilled). */
export function selfCancelOpen(ref: string, now = Date.now()): boolean {
  const m = merchantOrders.get().find((x) => x.ref === ref);
  if (!m || cancelBlock(m)) return false;
  return canSelfCancel(checkoutSettingsStore.get(), (now - (m.placedAt ?? now - m.hoursAgo * 3_600_000)) / 60_000, m.ful !== 'none' || m.ship !== 'none');
}

/**
 * Apply a payment event to the checkout record and mirror it into the merchant's order book: the order appears there
 * with its payment state, and once paid (or COD confirmed) stock is reserved and the coupon use counted.
 */
export function payEvent(ref: string, e: PayEvent, method: PayMethod): Order | undefined {
  const before = ordersStore.get().find((o) => o.ref === ref);
  if (!before) return undefined;
  const { order, applied } = applyPayment(before, e, method, Date.now(), liveConfig().codFee);
  if (!applied) return before;
  updateOrder(ref, () => order);
  let extras = extrasStore.get()[ref];
  if (extras && !isSettled(before.pay.state) && isSettled(order.pay.state)) {
    // Paid: deliver codes from the pool, take booking places and count the pre-order — once, on this transition.
    const products = liveCatalog();
    const lines = order.lines.map((l) => ({ productId: l.productId, sku: l.sku ?? '', qty: l.qty }));
    const given = assignCodes(productsStore.get(), lines, ref);
    const booked = bookSlots(given.products, order.lines.flatMap((l) => {
      const size = products.find((p) => p.id === l.productId && p.x?.type === 'booking')?.variants.find((v) => v.id === l.vid)?.size;
      const [date, time] = (size ?? '').split(' ');
      return date && time ? [{ productId: l.productId, date, time, qty: l.qty }] : [];
    }));
    if (booked !== productsStore.get()) productsStore.set(booked);
    catalogXStore.set((x) => ({ ...x, campaigns: campaignTake(x.campaigns, lines, extras) }));
    extras = { ...extras, ...(given.codes.length ? { codes: given.codes } : {}) };
    extrasStore.set((m) => ({ ...m, [ref]: extras! }));
  }
  const book = syncOrder(
    { orders: merchantOrders.get(), levels: levelsStore.get(), customers: customersStore.get(), coupons: couponsStore.get() },
    before, order, { products: liveCatalog(), now: Date.now(), prefer: shipFrom(liveConfig(), order.address?.city, locationsStore.get()), extras, gift: order.key.startsWith(checkoutStore.get().sessionId) && checkoutStore.get().gift ? { message: checkoutStore.get().giftMsg.trim() || undefined } : undefined },
  );
  if (book.customers !== customersStore.get()) customersStore.set(book.customers);
  if (book.levels !== levelsStore.get()) levelsStore.set(book.levels);
  if (book.coupons !== couponsStore.get()) couponsStore.set(book.coupons);
  if (book.orders !== merchantOrders.get()) merchantOrders.set(book.orders);
  if (!isSettled(before.pay.state) && isSettled(order.pay.state)) settle(order);
  return order;
}

function settle(order: Order): void {
  // The bag is emptied only if it is still the basket this order was made from.
  if (order.key.startsWith(checkoutStore.get().sessionId)) {
    cartStore.set({ lines: [] });
    checkoutStore.set((c) => ({ ...c, sessionId: sid(), notice: undefined, gift: false, giftMsg: '', answers: {}, ageOk: false }));
  }
}

/** An order of this checkout session whose payment is being verified blocks a new charge. */
export function pendingForSession(): Order | undefined {
  const s = checkoutStore.get().sessionId;
  return ordersStore.get().find((o) => o.key.startsWith(`${s}|`) && (o.pay.state === 'verifying' || o.pay.state === 'challenge'));
}

/** Unpaid cash-on-delivery orders of the signed-in shopper (the merchant's per-customer COD limit counts these). */
export function openCodCount(): number {
  if (!accountStore.get().signedIn || checkoutStore.get().mode !== 'account') return 0;
  const book = merchantOrders.get();
  return book.filter((m) => m.customerId === CUSTOMER.id && m.payment?.method === 'cod' && m.pay === 'paid' && m.ship !== 'delivered').length;
}

export function toggleWish(id: string): void {
  const had = accountStore.get().wishlist.includes(id);
  accountStore.set((a) => ({ ...a, wishlist: had ? a.wishlist.filter((x) => x !== id) : [...a.wishlist, id] }));
  // Wishlist demand for the merchant's reports (product id only, no shopper details).
  wishEventsStore.set((l) => addWish(l, id, had ? 'remove' : 'add', riyadhDate(Date.now())));
}

export function signIn(): void {
  const acc = accountStore.get();
  const def = acc.addresses.find((a) => a.id === acc.defaultId) ?? acc.addresses[0];
  accountStore.set((a) => ({ ...a, signedIn: true }));
  checkoutStore.set((c) => ({
    ...c, mode: 'account', email: c.email || CUSTOMER.email,
    ...(def && !c.addr.street ? { savedId: def.id, addr: stripSaved(def) } : {}),
  }));
}

export function signOut(): void {
  accountStore.set((a) => ({ ...a, signedIn: false }));
  checkoutStore.set((c) => ({ ...c, mode: 'guest', savedId: undefined }));
}

export function stripSaved(a: SavedAddress): Partial<Address> {
  const { id: _id, label: _label, ...rest } = a;
  return rest;
}

/** Ask the (simulated) provider for the result of a payment that timed out. */
export function checkStatus(ref: string, result: TestState['verify'] = testStore.get().verify): Order | undefined {
  const o = ordersStore.get().find((x) => x.ref === ref);
  if (!o || o.pay.state !== 'verifying') return o;
  const next = payEvent(ref, { type: 'verify', result }, o.pay.method);
  if (next?.pay.state === 'declined') checkoutStore.set((c) => ({ ...c, notice: { kind: 'verify_failed', ref } }));
  return next;
}

/** Review tool: the first item in the bag sells out in the merchant's inventory (available = 0 everywhere). */
export function sellOutFirstInBag(): string | undefined {
  const first = cartStore.get().lines[0];
  if (!first) return undefined;
  const sku = first.vid.split('~')[1];
  levelsStore.set((ls) => ls.map((l) => (l.sku === sku ? { ...l, onHand: l.reserved, version: l.version + 1 } : l)));
  return first.vid;
}

/** Newsletter sign-ups in this preview (no email is sent). */
export const newsletterStore = createStore.key('storefront.newsletter')<string[]>(() => []);
