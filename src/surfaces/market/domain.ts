/* LAK marketplace domain: pure logic only. Money is integer halalas.
   Interim model (business decision pending): discovery across merchants, but the cart is grouped per merchant and
   each merchant checks out separately — separate payment, order, shipment and returns. No split payments. */
import { vatIncluded } from '../../core/format';
import type { L } from '../../core/lang';

export type CityId = 'riyadh' | 'jeddah' | 'dammam' | 'makkah';
export const CITIES: CityId[] = ['riyadh', 'jeddah', 'dammam', 'makkah'];
export type CatId = 'coffee' | 'perfume' | 'home' | 'kids' | 'tech';
export const CATS: CatId[] = ['coffee', 'perfume', 'home', 'kids', 'tech'];

export interface Shipping {
  /** Fee inside the store's own city, in halalas. */
  same: number;
  /** Fee to other cities it ships to. */
  other: number;
  /** Free shipping at or above this subtotal; null = never free. */
  freeOver: number | null;
  days: { same: [number, number]; other: [number, number] };
  ships: CityId[];
  /** Cash on delivery offered by this seller, with its fee (null = not offered). */
  codFee: number | null;
}

export interface Seller {
  id: string;
  name: L;
  legal: L;
  cr: string;
  vat: string;
  city: CityId;
  colour: string;
  since: string;
  shipping: Shipping;
  returnsDays: number;
  tagline: L;
}

export type Art = 'bag' | 'bottle' | 'cushion' | 'shirt' | 'headphones' | 'cable' | 'dripper' | 'candle' | 'toy' | 'gift';
export interface Product {
  id: string;
  seller: string;
  name: L;
  brand: string;
  cat: CatId;
  price: number;
  stock: number;
  art: Art;
  tone: string;
  desc: L;
}

/* ---------- Discovery ---------- */

export type Sort = 'relevance' | 'priceAsc' | 'priceDesc';
export interface Filters { q: string; cat: CatId | ''; seller: string; brand: string; city: CityId; near: boolean; sort: Sort }

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[ً-ٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').trim();

export function search(products: Product[], sellers: Seller[], f: Filters): Product[] {
  const q = norm(f.q);
  const byId = new Map(sellers.map((s) => [s.id, s]));
  const out = products.filter((p) => {
    const s = byId.get(p.seller);
    if (!s) return false;
    if (f.cat && p.cat !== f.cat) return false;
    if (f.seller && p.seller !== f.seller) return false;
    if (f.brand && p.brand !== f.brand) return false;
    if (f.near && s.city !== f.city) return false;
    if (q) {
      const hay = norm([p.name.ar, p.name.en, p.brand, s.name.ar, s.name.en].join(' '));
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  if (f.sort === 'priceAsc') return out.slice().sort((a, b) => a.price - b.price);
  if (f.sort === 'priceDesc') return out.slice().sort((a, b) => b.price - a.price);
  return out;
}

/** Shipping for one seller to a city. null = this seller doesn't deliver there. */
export function shippingFee(s: Seller, city: CityId, subtotal: number): number | null {
  if (!s.shipping.ships.includes(city)) return null;
  if (s.shipping.freeOver !== null && subtotal >= s.shipping.freeOver) return 0;
  return city === s.city ? s.shipping.same : s.shipping.other;
}

export function deliveryDays(s: Seller, city: CityId): [number, number] | null {
  if (!s.shipping.ships.includes(city)) return null;
  return city === s.city ? s.shipping.days.same : s.shipping.days.other;
}

/* ---------- Cart: grouped per seller ---------- */

export interface Line { productId: string; qty: number }
export const MAX_QTY = 10;

export function addLine(lines: Line[], p: Product, qty = 1): Line[] {
  if (p.stock <= 0 || qty <= 0) return lines;
  const cur = lines.find((l) => l.productId === p.id);
  const cap = Math.min(MAX_QTY, p.stock);
  if (cur) return lines.map((l) => (l.productId === p.id ? { ...l, qty: Math.min(cap, l.qty + qty) } : l));
  return [...lines, { productId: p.id, qty: Math.min(cap, qty) }];
}

export function setQty(lines: Line[], p: Product, qty: number): Line[] {
  if (qty <= 0) return lines.filter((l) => l.productId !== p.id);
  const cap = Math.min(MAX_QTY, p.stock);
  return lines.map((l) => (l.productId === p.id ? { ...l, qty: Math.min(cap, qty) } : l));
}

export function removeSeller(lines: Line[], products: Product[], sellerId: string): Line[] {
  return lines.filter((l) => products.find((p) => p.id === l.productId)?.seller !== sellerId);
}

export interface Group {
  seller: Seller;
  lines: { product: Product; qty: number; total: number }[];
  subtotal: number;
  /** null when the seller doesn't deliver to the chosen city. */
  shipping: number | null;
  total: number;
  vat: number;
  /** How much more to reach this seller's free-shipping threshold (0 when reached or none). */
  toFree: number;
  units: number;
}

/** Group cart lines by seller, preserving the order sellers were first added. Each group is checked out on its own. */
export function groupCart(lines: Line[], products: Product[], sellers: Seller[], city: CityId): Group[] {
  const groups = new Map<string, Group>();
  for (const l of lines) {
    const p = products.find((x) => x.id === l.productId);
    const s = p && sellers.find((x) => x.id === p.seller);
    if (!p || !s) continue;
    let g = groups.get(s.id);
    if (!g) { g = { seller: s, lines: [], subtotal: 0, shipping: null, total: 0, vat: 0, toFree: 0, units: 0 }; groups.set(s.id, g); }
    g.lines.push({ product: p, qty: l.qty, total: p.price * l.qty });
    g.subtotal += p.price * l.qty;
    g.units += l.qty;
  }
  return [...groups.values()].map((g) => {
    const shipping = shippingFee(g.seller, city, g.subtotal);
    const total = g.subtotal + (shipping ?? 0);
    const free = g.seller.shipping.freeOver;
    return { ...g, shipping, total, vat: vatIncluded(total), toFree: free !== null && shipping !== null && shipping > 0 ? free - g.subtotal : 0 };
  });
}

/* ---------- Checkout and orders (one seller per order) ---------- */

export type PayMethod = 'card' | 'cod';
export type PayState = 'paid' | 'cod_due' | 'collected';
export type FulState = 'unfulfilled' | 'fulfilled';
export type ShipState = 'none' | 'in_transit' | 'delivered';
export type ReturnState = 'none' | 'requested';

export interface Order {
  ref: string;
  seller: string;
  city: CityId;
  createdAt: string;
  deliveredAt?: string;
  lines: { productId: string; name: L; price: number; qty: number }[];
  subtotal: number;
  shipping: number;
  codFee: number;
  total: number;
  method: PayMethod;
  pay: PayState;
  ful: FulState;
  ship: ShipState;
  ret: ReturnState;
  returnReason?: string;
}

export type CheckoutBlock = 'empty' | 'noDelivery' | 'codUnavailable';

export function checkoutBlock(g: Group | undefined, method: PayMethod): CheckoutBlock | null {
  if (!g || !g.lines.length) return 'empty';
  if (g.shipping === null) return 'noDelivery';
  if (method === 'cod' && g.seller.shipping.codFee === null) return 'codUnavailable';
  return null;
}

/** Totals the shopper sees before confirming: COD adds the seller's COD fee. */
export function checkoutTotals(g: Group, method: PayMethod): { subtotal: number; shipping: number; codFee: number; total: number; vat: number } {
  const shipping = g.shipping ?? 0;
  const codFee = method === 'cod' ? g.seller.shipping.codFee ?? 0 : 0;
  const total = g.subtotal + shipping + codFee;
  return { subtotal: g.subtotal, shipping, codFee, total, vat: vatIncluded(total) };
}

export function placeOrder(g: Group, method: PayMethod, city: CityId, at: string, ref: string): Order | null {
  if (checkoutBlock(g, method)) return null;
  const t = checkoutTotals(g, method);
  return {
    ref, seller: g.seller.id, city, createdAt: at,
    lines: g.lines.map((l) => ({ productId: l.product.id, name: l.product.name, price: l.product.price, qty: l.qty })),
    subtotal: t.subtotal, shipping: t.shipping, codFee: t.codFee, total: t.total,
    method, pay: method === 'card' ? 'paid' : 'cod_due', ful: 'unfulfilled', ship: 'none', ret: 'none',
  };
}

export type ReturnBlock = 'notDelivered' | 'window' | 'already';

export function returnBlock(o: Order, s: Seller, at: string): ReturnBlock | null {
  if (o.ret !== 'none') return 'already';
  if (o.ship !== 'delivered' || !o.deliveredAt) return 'notDelivered';
  const days = (Date.parse(at) - Date.parse(o.deliveredAt)) / 86_400_000;
  return days > s.returnsDays ? 'window' : null;
}

export function requestReturn(o: Order, s: Seller, at: string, reason: string): Order {
  return returnBlock(o, s, at) ? o : { ...o, ret: 'requested', returnReason: reason };
}

/* ---------- Merchant side: marketplace listing eligibility (rules proposed, awaiting approval) ---------- */

export type ExcludedCat = 'tobacco' | 'medicine' | 'weapons' | 'giftcards';
export const EXCLUDED: ExcludedCat[] = ['tobacco', 'medicine', 'weapons', 'giftcards'];
export type Review = 'approved' | 'pending' | 'rejected' | 'none';

export interface ListingItem {
  id: string;
  name: L;
  /** A marketplace category or one of EXCLUDED; merchant catalogues may use their own category keys. */
  cat: CatId | ExcludedCat | (string & {});
  stock: number;
  images: number;
  descLength: number;
  price: number;
  review: Review;
  rejectReason?: 'claim' | 'image';
}

export type ListingState = 'listed' | 'in_review' | 'excluded' | 'needs_fix' | 'out_of_stock' | 'rejected' | 'store_blocked' | 'not_submitted';
export type FixReason = 'images' | 'description' | 'price';

export const MIN_DESC = 30;

export function listingState(p: ListingItem, storeVerified: boolean): { state: ListingState; fixes: FixReason[] } {
  if (!storeVerified) return { state: 'store_blocked', fixes: [] };
  if ((EXCLUDED as string[]).includes(p.cat)) return { state: 'excluded', fixes: [] };
  const fixes: FixReason[] = [];
  if (p.images < 1) fixes.push('images');
  if (p.descLength < MIN_DESC) fixes.push('description');
  if (p.price <= 0) fixes.push('price');
  if (fixes.length) return { state: 'needs_fix', fixes };
  if (p.review === 'rejected') return { state: 'rejected', fixes: [] };
  if (p.review === 'pending') return { state: 'in_review', fixes: [] };
  if (p.review === 'none') return { state: 'not_submitted', fixes: [] };
  if (p.stock <= 0) return { state: 'out_of_stock', fixes: [] };
  return { state: 'listed', fixes: [] };
}

/** Eligible items can be sent to review; excluded or blocked items cannot. */
export function canSubmit(p: ListingItem, storeVerified: boolean): boolean {
  const s = listingState(p, storeVerified).state;
  return s === 'not_submitted' || s === 'rejected';
}

export function summarize(items: ListingItem[], storeVerified: boolean): Record<ListingState, number> {
  const out = { listed: 0, in_review: 0, excluded: 0, needs_fix: 0, out_of_stock: 0, rejected: 0, store_blocked: 0, not_submitted: 0 } as Record<ListingState, number>;
  for (const i of items) out[listingState(i, storeVerified).state] += 1;
  return out;
}
