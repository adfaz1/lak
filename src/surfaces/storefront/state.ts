/* Module-level fixture stores for the storefront. Simulated state: it resets with "Reset data" and on reload. */
import { createStore } from '../../core/store';
import {
  DAY, applyPayment, catalogue, computeTotals, coupons, evaluateCoupon, isSettled, pricedLines, shipById, submitOrder,
  type Address, type Cart, type CityId, type Draft, type Order, type Outcome, type PayEvent, type PayMethod, type Product, type ShipId,
} from './domain';

const sid = () => Math.random().toString(36).slice(2, 10);

export const catalogStore = createStore<Product[]>(catalogue);
export const cartStore = createStore<Cart>(() => ({ lines: [] }));

export interface SavedAddress extends Address { id: string; label: string }
export const CUSTOMER = { id: 'c-1001', name: { ar: 'سارة الحربي', en: 'Sara Alharbi' }, phone: '501234567', email: 'sara@example.com' };

export interface Account { signedIn: boolean; addresses: SavedAddress[]; defaultId?: string; wishlist: string[] }
export const accountStore = createStore<Account>(() => ({
  signedIn: false,
  wishlist: ['satin-dress'],
  defaultId: 'a1',
  addresses: [
    { id: 'a1', label: 'home', name: 'Sara Alharbi', phone: '501234567', city: 'riyadh', district: 'Al Malqa', street: 'Anas Ibn Malik Rd', building: '8132', nationalCode: 'RMLA8132' },
    { id: 'a2', label: 'work', name: 'Sara Alharbi', phone: '501234567', city: 'riyadh', district: 'Al Olaya', street: 'Olaya St', building: '7421' },
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
}
const freshCheckout = (): CheckoutState => ({ sessionId: sid(), mode: 'guest', email: '', addr: {}, ship: 'standard', method: 'card', gift: false, giftMsg: '' });
export const checkoutStore = createStore<CheckoutState>(freshCheckout);

export interface TestState { open: boolean; applePay: boolean; outcome: Outcome; verify: 'paid' | 'failed' | 'unknown' }
export const testStore = createStore<TestState>(() => ({ open: false, applePay: false, outcome: 'success', verify: 'paid' }));

/** Past orders for the test customer, so tracking, returns and the COD limit have something real to work on. */
function pastOrders(): Order[] {
  const now = Date.now();
  const products = catalogue();
  const mk = (ref: string, vids: [string, number][], daysAgo: number, method: PayMethod, extra: Partial<Order>): Order => {
    const lines = pricedLines({ lines: vids.map(([vid, qty]) => ({ vid, qty })) }, products);
    const at = now - daysAgo * DAY;
    const totals = computeTotals(lines, { ship: shipById('standard'), cod: method === 'cod' });
    return {
      ref, key: `fixture-${ref}`, at, customerId: CUSTOMER.id, contact: { phone: CUSTOMER.phone, email: CUSTOMER.email },
      lines: lines.map(({ vid, productId, qty, unit, amount }) => ({ vid, productId, qty, unit, amount })), totals,
      address: accountStore.get().addresses[0], ship: 'standard', eta: { from: at + 2 * DAY, to: at + 3 * DAY },
      pay: { method, state: method === 'cod' ? 'cod_due' : 'paid', attempts: [{ n: 1, method, outcome: method === 'cod' ? 'cod' : 'success', at }] },
      ful: 'fulfilled', shipment: 'delivered', returns: [], ...extra,
    };
  };
  return [
    mk('DN-24796', [['white-musk~50ml', 1], ['crepe-shayla~camel', 2]], 1, 'cod', { shipment: 'in_transit', trackingNo: 'TRK24796SA' }),
    mk('DN-24788', [['linen-abaya~sand-54', 1], ['silk-scarf~navy', 1]], 5, 'card', { deliveredAt: now - 3 * DAY, trackingNo: 'TRK24788SA' }),
    mk('DN-24741', [['shirt-dress~ivory-M', 1]], 44, 'card', { deliveredAt: now - 41 * DAY, received: true, trackingNo: 'TRK24741SA' }),
  ];
}
export const ordersStore = createStore<Order[]>(pastOrders);

/* ───────────── Actions ───────────── */

export function couponResult(cart: Cart, products: Product[]) {
  if (!cart.coupon) return undefined;
  return evaluateCoupon(cart.coupon, pricedLines(cart, products), coupons(Date.now()), Date.now());
}

export function buildDraft(): Draft {
  const cart = cartStore.get();
  const products = catalogStore.get();
  const co = checkoutStore.get();
  const acc = accountStore.get();
  const lines = pricedLines(cart, products);
  const c = couponResult(cart, products);
  const signed = co.mode === 'account' && acc.signedIn;
  return {
    sessionId: co.sessionId, lines, coupon: c?.status === 'valid' ? c.code : undefined, discount: c?.status === 'valid' ? c.discount : 0,
    ship: co.ship, city: co.addr.city as CityId | undefined, method: co.method,
    address: co.addr as Address, contact: { phone: co.addr.phone ?? '', email: co.email || undefined },
    customerId: signed ? CUSTOMER.id : undefined,
  };
}

/** Idempotent: the same draft returns the same order. */
export function submit(draft: Draft): { order: Order; created: boolean } {
  let res!: ReturnType<typeof submitOrder>;
  ordersStore.set((all) => { res = submitOrder(all, draft, Date.now()); return res.orders; });
  return { order: res.order, created: res.created };
}

export function getOrder(ref: string): Order | undefined {
  return ordersStore.get().find((o) => o.ref === ref);
}

export function updateOrder(ref: string, fn: (o: Order) => Order): void {
  ordersStore.set((all) => all.map((o) => (o.ref === ref ? fn(o) : o)));
}

/** Apply a payment event. When the order becomes settled, take stock and close the checkout session. */
export function payEvent(ref: string, e: PayEvent, method: PayMethod): Order | undefined {
  const before = getOrder(ref);
  if (!before) return undefined;
  const { order, applied } = applyPayment(before, e, method, Date.now());
  if (!applied) return before;
  updateOrder(ref, () => order);
  if (!isSettled(before.pay.state) && isSettled(order.pay.state)) settle(order);
  return order;
}

function settle(order: Order): void {
  catalogStore.set((ps) => ps.map((p) => ({
    ...p,
    variants: p.variants.map((v) => {
      const l = order.lines.find((x) => x.vid === v.id);
      return l ? { ...v, stock: Math.max(0, v.stock - l.qty) } : v;
    }),
  })));
  // The bag is emptied only if it is still the basket this order was made from.
  if (order.key.startsWith(checkoutStore.get().sessionId)) {
    cartStore.set({ lines: [] });
    checkoutStore.set((c) => ({ ...c, sessionId: sid(), notice: undefined, gift: false, giftMsg: '' }));
  }
}

/** An order of this checkout session whose payment is being verified blocks a new charge. */
export function pendingForSession(): Order | undefined {
  const s = checkoutStore.get().sessionId;
  return ordersStore.get().find((o) => o.key.startsWith(`${s}|`) && (o.pay.state === 'verifying' || o.pay.state === 'challenge'));
}

export function openCodCount(): number {
  if (!accountStore.get().signedIn || checkoutStore.get().mode !== 'account') return 0;
  return ordersStore.get().filter((o) => o.customerId === CUSTOMER.id && o.pay.state === 'cod_due').length;
}

export function toggleWish(id: string): void {
  accountStore.set((a) => ({ ...a, wishlist: a.wishlist.includes(id) ? a.wishlist.filter((x) => x !== id) : [...a.wishlist, id] }));
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
export function checkStatus(ref: string): Order | undefined {
  const o = getOrder(ref);
  if (!o || o.pay.state !== 'verifying') return o;
  const next = payEvent(ref, { type: 'verify', result: testStore.get().verify }, o.pay.method);
  if (next?.pay.state === 'declined') checkoutStore.set((c) => ({ ...c, notice: { kind: 'verify_failed', ref } }));
  return next;
}
