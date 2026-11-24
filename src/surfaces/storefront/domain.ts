/* Storefront domain: catalogue, cart, coupons, totals, shipping, payment state machine and order idempotency.
   Pure functions only. Money is integer halalas. Every figure is fixture data for a simulated store. */
import type { L } from '../../core/lang';
import { colorText } from '../merchant/catalog';

export const DAY = 86_400_000;
export const VAT_RATE = 15;

/** VAT contained in a VAT-inclusive amount (prices in Saudi Arabia are shown VAT-inclusive). */
export function vatIn(halalas: number): number {
  return Math.round((halalas * VAT_RATE) / (100 + VAT_RATE));
}

/* ───────────── Merchant ───────────── */

export const MERCHANT = {
  name: { ar: 'دار نُوى', en: 'Dar Nuwa' } as L,
  tagline: { ar: 'أزياء محتشمة وعطور من الرياض', en: 'Modest fashion and fragrance from Riyadh' } as L,
  freeShippingFrom: 30_000,
  returnDays: 14,
  handlingDays: 1,
  codFee: 1_000,
  codMax: 100_000,
  codOpenLimit: 2,
  bnplMin: 10_000,
  bnplMax: 500_000,
};

/* ───────────── Catalogue ───────────── */

/** A category slug derived from the merchant's category (e.g. "fragrance"). */
export type CatId = string;
/** Used to pick a placeholder icon; equals the category slug for merchant products. */
export type Kind = string;
/** A colour as the merchant typed it ("Black") or a known palette id ("black"). */
export type ColorId = string;

/** Known palette: names and swatches. Colours outside it get the merchant's name and a neutral swatch. */
export const COLORS: Record<string, { name: L; hex: string }> = {
  black: { name: { ar: 'أسود', en: 'Black' }, hex: '#24211f' },
  sand: { name: { ar: 'رملي', en: 'Sand' }, hex: '#cdb796' },
  olive: { name: { ar: 'زيتي', en: 'Olive' }, hex: '#6d6b47' },
  ivory: { name: { ar: 'عاجي', en: 'Ivory' }, hex: '#ebe3d3' },
  navy: { name: { ar: 'كحلي', en: 'Navy' }, hex: '#2d3550' },
  rose: { name: { ar: 'وردي هادئ', en: 'Dusty rose' }, hex: '#c79c93' },
  camel: { name: { ar: 'جملي', en: 'Camel' }, hex: '#a9784b' },
  amber: { name: { ar: 'كهرماني', en: 'Amber' }, hex: '#b9843f' },
  white: { name: { ar: 'أبيض', en: 'White' }, hex: '#f6f3ee' },
  beige: { name: { ar: 'بيج', en: 'Beige' }, hex: '#d9c7a7' },
};
const EXTRA_HEX: Record<string, string> = {
  brown: '#6b4a33', tan: '#b9875a', grey: '#8b8b8b', gray: '#8b8b8b', red: '#a33a36', blue: '#3b5a8c', green: '#4b6b4f',
  gold: '#c2a25a', pink: '#d8a3a8', cream: '#efe6d2', burgundy: '#6d2433',
};

/** Name and swatch for any colour. Arabic names for merchant-typed colours come from the merchant catalogue. */
export function colorInfo(c: string): { name: L; hex: string } {
  const k = c.trim().toLowerCase();
  const known = COLORS[k];
  if (known) return known;
  return { name: { ar: colorText(c, 'ar'), en: c }, hex: EXTRA_HEX[k] ?? '#b8b0a4' };
}

export interface Variant { id: string; color?: ColorId; size?: string; price: number; stock: number; sku?: string }
export interface Product {
  id: string;
  cat: CatId;
  catName: L;
  kind: Kind;
  name: L;
  blurb: L;
  details: L[];
  compareAt?: number;
  rank: number;
  added: number;
  colors: ColorId[];
  sizes: string[];
  variants: Variant[];
  /** Grams per unit, for weight-based shipping. */
  weight?: number;
  /** False when the item cannot be returned (opened fragrance in the rule fixtures, digital goods in the store). */
  returnable?: boolean;
  digital?: boolean;
}

export function productById(products: Product[], id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function variantById(products: Product[], vid: string): { product: Product; variant: Variant } | undefined {
  const product = products.find((p) => vid.startsWith(`${p.id}~`));
  const variant = product?.variants.find((v) => v.id === vid);
  return product && variant ? { product, variant } : undefined;
}

export const inStock = (p: Product) => p.variants.some((v) => v.stock > 0);
export const fromPrice = (p: Product) => Math.min(...p.variants.map((v) => v.price));
export const hasPriceRange = (p: Product) => new Set(p.variants.map((v) => v.price)).size > 1;
export const stockLevel = (v: Variant): 'out' | 'low' | 'in' => (v.stock <= 0 ? 'out' : v.stock <= 3 ? 'low' : 'in');

/** The variant matching a selection, or undefined while a required option is still missing. */
export function findVariant(p: Product, color?: string, size?: string): Variant | undefined {
  if (p.colors.length && !color) return undefined;
  if (p.sizes.length && !size) return undefined;
  return p.variants.find((v) => (v.color ?? '') === (p.colors.length ? color : '') && (v.size ?? '') === (p.sizes.length ? size : ''));
}

/** Options the shopper still has to choose before the item can be added. */
export function missingOptions(p: Product, color?: string, size?: string): ('color' | 'size')[] {
  const m: ('color' | 'size')[] = [];
  if (p.colors.length && !(color && p.colors.includes(color as ColorId))) m.push('color');
  if (p.sizes.length && !(size && p.sizes.includes(size))) m.push('size');
  return m;
}

/* ───────────── Listing, filters, search ───────────── */

export type Sort = 'featured' | 'price-asc' | 'price-desc' | 'new';
export const SORTS: Sort[] = ['featured', 'price-asc', 'price-desc', 'new'];
export type PriceBand = 'u200' | '200-400' | 'o400';
export const PRICE_BANDS: Record<PriceBand, [number, number]> = { u200: [0, 19_999], '200-400': [20_000, 40_000], o400: [40_001, Infinity] };

export interface ListQuery { cat?: CatId; q?: string; sort: Sort; sizes: string[]; colors: ColorId[]; inStockOnly: boolean; price?: PriceBand }

/** Arabic-aware normalisation for search: case, diacritics, alef/ya/ta-marbuta forms, Arabic-Indic digits. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();
}

export function matches(p: Product, q: string): boolean {
  const n = normalize(q);
  if (!n) return true;
  const hay = normalize([p.name.ar, p.name.en, p.catName.ar, p.catName.en, p.blurb.ar, p.blurb.en, ...p.colors.flatMap((c) => [colorInfo(c).name.ar, colorInfo(c).name.en])].join(' '));
  return n.split(' ').every((w) => hay.includes(w));
}

/** Variants that satisfy the size/colour filters; a product is listed if any does. */
function filteredVariants(p: Product, q: ListQuery): Variant[] {
  return p.variants.filter((v) =>
    (!q.sizes.length || (v.size !== undefined && q.sizes.includes(v.size))) &&
    (!q.colors.length || (v.color !== undefined && q.colors.includes(v.color))));
}

export function listProducts(all: Product[], q: ListQuery): Product[] {
  const out = all.filter((p) => {
    if (q.cat && p.cat !== q.cat) return false;
    if (q.q && !matches(p, q.q)) return false;
    const vs = filteredVariants(p, q);
    if (!vs.length) return false;
    if (q.inStockOnly && !vs.some((v) => v.stock > 0)) return false;
    if (q.price) {
      const [lo, hi] = PRICE_BANDS[q.price];
      if (!vs.some((v) => v.price >= lo && v.price <= hi)) return false;
    }
    return true;
  });
  const by: Record<Sort, (a: Product, b: Product) => number> = {
    featured: (a, b) => Number(inStock(b)) - Number(inStock(a)) || a.rank - b.rank,
    'price-asc': (a, b) => fromPrice(a) - fromPrice(b) || a.rank - b.rank,
    'price-desc': (a, b) => fromPrice(b) - fromPrice(a) || a.rank - b.rank,
    new: (a, b) => a.added - b.added,
  };
  return out.sort(by[q.sort]);
}

/** Facets available within a category/search (before size/colour filters), so filters never offer impossible values. */
export function facets(all: Product[], cat?: CatId, q?: string): { sizes: string[]; colors: ColorId[] } {
  const scope = all.filter((p) => (!cat || p.cat === cat) && (!q || matches(p, q)));
  const sizes = [...new Set(scope.flatMap((p) => p.sizes))];
  const colors = [...new Set(scope.flatMap((p) => p.colors))];
  return { sizes, colors };
}

/* ───────────── Cart ───────────── */

export interface CartLine { vid: string; qty: number }
export interface Cart { lines: CartLine[]; coupon?: string }
export const MAX_QTY = 10;

export function addToCart(cart: Cart, vid: string, qty: number, stock: number): Cart {
  const existing = cart.lines.find((l) => l.vid === vid);
  const want = Math.min((existing?.qty ?? 0) + qty, stock, MAX_QTY);
  if (want <= 0) return cart;
  const lines = existing ? cart.lines.map((l) => (l.vid === vid ? { ...l, qty: want } : l)) : [...cart.lines, { vid, qty: want }];
  return { ...cart, lines };
}

export function setQty(cart: Cart, vid: string, qty: number, stock: number): Cart {
  if (qty <= 0) return removeLine(cart, vid);
  const q = Math.max(1, Math.min(qty, stock, MAX_QTY));
  return { ...cart, lines: cart.lines.map((l) => (l.vid === vid ? { ...l, qty: q } : l)) };
}

export function removeLine(cart: Cart, vid: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.vid !== vid) };
}

export const itemCount = (cart: Cart) => cart.lines.reduce((n, l) => n + l.qty, 0);

export type LineIssue = { vid: string; kind: 'sold_out' } | { vid: string; kind: 'reduced'; available: number } | { vid: string; kind: 'missing' };

/** Stock may change after an item was added. Lines that cannot be fulfilled block checkout until resolved. */
export function validateCart(cart: Cart, products: Product[]): LineIssue[] {
  const out: LineIssue[] = [];
  for (const l of cart.lines) {
    const found = variantById(products, l.vid);
    if (!found) out.push({ vid: l.vid, kind: 'missing' });
    else if (found.variant.stock <= 0) out.push({ vid: l.vid, kind: 'sold_out' });
    else if (found.variant.stock < l.qty) out.push({ vid: l.vid, kind: 'reduced', available: found.variant.stock });
  }
  return out;
}

export interface PricedLine { vid: string; productId: string; cat: CatId; qty: number; unit: number; amount: number; sku?: string; weight?: number }

export function pricedLines(cart: Cart, products: Product[]): PricedLine[] {
  return cart.lines.flatMap((l) => {
    const f = variantById(products, l.vid);
    if (!f) return [];
    return [{ vid: l.vid, productId: f.product.id, cat: f.product.cat, qty: l.qty, unit: f.variant.price, amount: f.variant.price * l.qty, sku: f.variant.sku, weight: f.product.weight }];
  });
}

/* ───────────── Coupons ───────────── */

export interface Coupon {
  code: string; kind: 'percent' | 'fixed' | 'freeShip'; value: number; minSubtotal?: number; cat?: CatId; expires?: number; limit?: number; used: number;
  /** Not yet started (epoch ms). */
  starts?: number;
  /** Paused by the merchant. */
  paused?: boolean;
  /** Drafts are not offered: they behave like an unknown code. */
  hidden?: boolean;
  /** Uses allowed per customer, and how many this customer already made. */
  perCustomer?: number;
  usedByCustomer?: number;
}

export type CouponResult =
  | { status: 'valid'; code: string; discount: number; coupon: Coupon; freeShip: boolean }
  | { status: 'not_found'; code: string }
  | { status: 'inactive'; code: string }
  | { status: 'per_customer'; code: string }
  | { status: 'expired'; code: string; expired: number }
  | { status: 'limit_reached'; code: string }
  | { status: 'not_eligible'; code: string; reason: 'category'; cat: CatId }
  | { status: 'not_eligible'; code: string; reason: 'min_subtotal'; shortBy: number; min: number };

export function evaluateCoupon(input: string, lines: PricedLine[], all: Coupon[], now: number): CouponResult {
  const code = input.trim().toUpperCase();
  const c = all.find((x) => x.code === code);
  if (!c || c.hidden) return { status: 'not_found', code };
  if (c.expires !== undefined && now > c.expires) return { status: 'expired', code, expired: c.expires };
  if (c.paused || (c.starts !== undefined && now < c.starts)) return { status: 'inactive', code };
  if (c.limit !== undefined && c.used >= c.limit) return { status: 'limit_reached', code };
  if (c.perCustomer !== undefined && (c.usedByCustomer ?? 0) >= c.perCustomer) return { status: 'per_customer', code };
  const eligible = c.cat ? lines.filter((l) => l.cat === c.cat) : lines;
  const base = eligible.reduce((s, l) => s + l.amount, 0);
  if (c.cat && base === 0) return { status: 'not_eligible', code, reason: 'category', cat: c.cat };
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  if (c.minSubtotal !== undefined && subtotal < c.minSubtotal) return { status: 'not_eligible', code, reason: 'min_subtotal', shortBy: c.minSubtotal - subtotal, min: c.minSubtotal };
  if (c.kind === 'freeShip') return { status: 'valid', code, discount: 0, coupon: c, freeShip: true };
  const raw = c.kind === 'percent' ? Math.round((base * c.value) / 100) : c.value;
  return { status: 'valid', code, discount: Math.min(raw, base), coupon: c, freeShip: false };
}

/* ───────────── Shipping & delivery estimates ───────────── */

export type CityId = 'riyadh' | 'jeddah' | 'dammam' | 'makkah' | 'madinah' | 'abha' | 'tabuk';
export const CITIES: { id: CityId; name: L; zone: 0 | 1 | 2; districts: L[] }[] = [
  { id: 'riyadh', name: { ar: 'الرياض', en: 'Riyadh' }, zone: 0, districts: [{ ar: 'العليا', en: 'Al Olaya' }, { ar: 'الملقا', en: 'Al Malqa' }, { ar: 'النخيل', en: 'Al Nakheel' }, { ar: 'الياسمين', en: 'Al Yasmin' }, { ar: 'السليمانية', en: 'As Sulimaniyah' }] },
  { id: 'jeddah', name: { ar: 'جدة', en: 'Jeddah' }, zone: 1, districts: [{ ar: 'الروضة', en: 'Ar Rawdah' }, { ar: 'الشاطئ', en: 'Ash Shati' }, { ar: 'الزهراء', en: 'Az Zahra' }, { ar: 'السلامة', en: 'As Salamah' }] },
  { id: 'dammam', name: { ar: 'الدمام', en: 'Dammam' }, zone: 1, districts: [{ ar: 'الشاطئ', en: 'Ash Shati' }, { ar: 'الفيصلية', en: 'Al Faisaliyah' }, { ar: 'النور', en: 'An Nur' }] },
  { id: 'makkah', name: { ar: 'مكة المكرمة', en: 'Makkah' }, zone: 1, districts: [{ ar: 'العزيزية', en: 'Al Aziziyah' }, { ar: 'الشوقية', en: 'Ash Shawqiyah' }] },
  { id: 'madinah', name: { ar: 'المدينة المنورة', en: 'Madinah' }, zone: 1, districts: [{ ar: 'قباء', en: 'Quba' }, { ar: 'العزيزية', en: 'Al Aziziyah' }] },
  { id: 'abha', name: { ar: 'أبها', en: 'Abha' }, zone: 2, districts: [{ ar: 'المنسك', en: 'Al Mansak' }, { ar: 'الخالدية', en: 'Al Khalidiyah' }] },
  { id: 'tabuk', name: { ar: 'تبوك', en: 'Tabuk' }, zone: 2, districts: [{ ar: 'المروج', en: 'Al Muruj' }, { ar: 'الفيصلية', en: 'Al Faisaliyah' }] },
];

export type ShipId = 'standard' | 'express' | 'pickup';
export interface ShipMethod {
  id: ShipId; name: L; cost: number; zones: number[]; transit: Record<number, [number, number]>; note: L;
  /** Goods value (after discount) from which this method is free; null/absent = never free. */
  freeFrom?: number | null;
}

export const SHIP_METHODS: ShipMethod[] = [
  { id: 'standard', name: { ar: 'توصيل عادي', en: 'Standard delivery' }, cost: 2_500, freeFrom: MERCHANT.freeShippingFrom, zones: [0, 1, 2], transit: { 0: [1, 2], 1: [2, 3], 2: [3, 5] },
    note: { ar: 'مجاني للطلبات من 300 ر.س بعد الخصم', en: 'Free on orders from SAR 300 after discount' } },
  { id: 'express', name: { ar: 'توصيل سريع', en: 'Express delivery' }, cost: 4_500, zones: [0, 1], transit: { 0: [1, 1], 1: [1, 2] },
    note: { ar: 'للمدن الرئيسية فقط', en: 'Major cities only' } },
  { id: 'pickup', name: { ar: 'استلام من معرض الرياض', en: 'Pick up at the Riyadh showroom' }, cost: 0, zones: [0], transit: { 0: [0, 0] },
    note: { ar: 'حي العليا، يجهز خلال يوم عمل', en: 'Al Olaya, ready within one business day' } },
];

export const cityById = (id?: string) => CITIES.find((c) => c.id === id);
export const shipById = (id?: string) => SHIP_METHODS.find((m) => m.id === id);

export function shipAvailable(m: ShipMethod, city?: CityId): boolean {
  const c = cityById(city);
  return !!c && m.zones.includes(c.zone);
}

/** Shipping cost after the free-delivery threshold; `goods` is the subtotal after discount. */
export function shippingCost(m: ShipMethod, goods: number): number {
  return m.freeFrom != null && goods >= m.freeFrom ? 0 : m.cost;
}

/** Saudi weekend is Friday and Saturday. */
export function addBusinessDays(from: number, days: number): number {
  let d = new Date(from);
  let left = days;
  while (left > 0) {
    d = new Date(d.getTime() + DAY);
    const wd = d.getUTCDay();
    if (wd !== 5 && wd !== 6) left--;
  }
  return d.getTime();
}

/** Estimated window: store handling time + carrier's typical transit for the city's zone. An estimate, not a promise. */
export function deliveryEstimate(m: ShipMethod, city: CityId, now: number): { from: number; to: number; handling: number; transit: [number, number] } | undefined {
  const c = cityById(city);
  if (!c || !m.zones.includes(c.zone)) return undefined;
  const transit = m.transit[c.zone];
  const handling = MERCHANT.handlingDays;
  return { from: addBusinessDays(now, handling + transit[0]), to: addBusinessDays(now, handling + transit[1]), handling, transit };
}

/* ───────────── Totals ───────────── */

export interface Totals { subtotal: number; discount: number; shipping: number; codFee: number; total: number; vat: number }

/**
 * `shipping` fixes the delivery charge (an order already placed); `freeShip` is a free-delivery coupon;
 * `codFee` is the store's cash-on-delivery fee (the rule fixtures default to MERCHANT.codFee).
 */
export function computeTotals(lines: { amount: number }[], o: { discount?: number; ship?: ShipMethod; cod?: boolean; codFee?: number; freeShip?: boolean; shipping?: number } = {}): Totals {
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const discount = Math.min(o.discount ?? 0, subtotal);
  const shipping = o.freeShip ? 0 : o.shipping ?? (o.ship ? shippingCost(o.ship, subtotal - discount) : 0);
  const codFee = o.cod ? o.codFee ?? MERCHANT.codFee : 0;
  const total = subtotal - discount + shipping + codFee;
  return { subtotal, discount, shipping, codFee, total, vat: vatIn(total) };
}

/* ───────────── Payment methods & eligibility ───────────── */

export type PayMethod = 'card' | 'applepay' | 'bnpl' | 'cod';
export type Ineligible = 'no_device' | 'cod_over_limit' | 'cod_under_min' | 'cod_open_limit' | 'bnpl_range' | 'pickup_cod';

/** Limits default to the rule fixtures (MERCHANT); the live store passes the merchant's settings. `codOpenLimit: null` = no limit. */
export function payEligibility(m: PayMethod, ctx: { total: number; applePayDevice: boolean; openCod: number; ship?: ShipId; codFee?: number; codMin?: number; codMax?: number; codOpenLimit?: number | null }): Ineligible | null {
  if (m === 'applepay' && !ctx.applePayDevice) return 'no_device';
  if (m === 'cod') {
    const goods = ctx.total - (ctx.codFee ?? MERCHANT.codFee);
    const openLimit = ctx.codOpenLimit === undefined ? MERCHANT.codOpenLimit : ctx.codOpenLimit;
    if (ctx.ship === 'pickup') return 'pickup_cod';
    if (goods > (ctx.codMax ?? MERCHANT.codMax)) return 'cod_over_limit';
    if (goods < (ctx.codMin ?? 0)) return 'cod_under_min';
    if (openLimit !== null && ctx.openCod >= openLimit) return 'cod_open_limit';
  }
  if (m === 'bnpl' && (ctx.total < MERCHANT.bnplMin || ctx.total > MERCHANT.bnplMax)) return 'bnpl_range';
  return null;
}

/* ───────────── Payment state machine ───────────── */

/** Payment state of one order. Separate from fulfilment and shipment. */
export type PayState = 'awaiting' | 'challenge' | 'verifying' | 'paid' | 'declined' | 'cod_due' | 'cod_collected' | 'refunded_part' | 'refunded';
export type Outcome = 'success' | 'declined' | '3ds' | 'timeout';
export type PayEvent =
  | { type: 'attempt'; outcome: Outcome }
  | { type: 'cod' }
  | { type: 'challenge'; pass: boolean }
  | { type: 'verify'; result: 'paid' | 'failed' | 'unknown' }
  | { type: 'collect' };

/** States from which a new charge may start. Never from verifying/challenge: that is how double charges happen. */
export const canPay = (s: PayState) => s === 'awaiting' || s === 'declined';
export const isSettled = (s: PayState) => s === 'paid' || s === 'cod_due' || s === 'cod_collected';

export function payTransition(s: PayState, e: PayEvent): PayState {
  switch (e.type) {
    case 'attempt':
      if (!canPay(s)) return s;
      return e.outcome === 'success' ? 'paid' : e.outcome === 'declined' ? 'declined' : e.outcome === '3ds' ? 'challenge' : 'verifying';
    case 'cod':
      return canPay(s) ? 'cod_due' : s;
    case 'challenge':
      return s === 'challenge' ? (e.pass ? 'paid' : 'declined') : s;
    case 'verify':
      if (s !== 'verifying') return s;
      return e.result === 'paid' ? 'paid' : e.result === 'failed' ? 'declined' : 'verifying';
    case 'collect':
      return s === 'cod_due' ? 'cod_collected' : s;
  }
}

/* ───────────── Orders ───────────── */

export type FulState = 'unfulfilled' | 'preparing' | 'packed' | 'fulfilled';
export type ShipState = 'none' | 'label' | 'in_transit' | 'out_for_delivery' | 'delivered';
export type ReturnState = 'requested' | 'approved' | 'received' | 'closed';
export type RefundState = 'not_started' | 'pending' | 'refunded';
export type ReturnReason = 'size' | 'not_as_described' | 'damaged' | 'changed_mind';

export interface Address { name: string; phone: string; city: CityId; district: string; street: string; building: string; nationalCode?: string; notes?: string }
export interface OrderLine { vid: string; productId: string; qty: number; unit: number; amount: number; sku?: string; name?: L }
export interface Attempt { n: number; method: PayMethod; outcome: Outcome | 'cod' | 'challenge_pass' | 'challenge_fail' | 'verify_paid' | 'verify_failed' | 'verify_unknown'; at: number }
export interface ReturnRequest { id: string; lines: { vid: string; qty: number; reason: ReturnReason }[]; method: 'pickup' | 'dropoff'; refundTo: 'original' | 'bank'; iban?: string; state: ReturnState; refund: RefundState; at: number; amount: number }
export interface Order {
  ref: string;
  key: string;
  at: number;
  customerId?: string;
  contact: { email?: string; phone: string };
  lines: OrderLine[];
  coupon?: string;
  totals: Totals;
  address?: Address;
  ship: ShipId;
  /** Name of the delivery method as offered at checkout. */
  shipName?: L;
  eta?: { from: number; to: number };
  pay: { method: PayMethod; state: PayState; attempts: Attempt[] };
  ful: FulState;
  shipment: ShipState;
  trackingNo?: string;
  deliveredAt?: number;
  received?: boolean;
  returns: ReturnRequest[];
  /** Set from the merchant's order: cancelled by the shopper (self-cancel) or by the store; a pending cancel request. */
  cancelled?: { at: number; by: 'customer' | 'store' };
  cancelRequest?: 'open' | 'declined';
}

export interface Draft {
  sessionId: string;
  lines: PricedLine[];
  coupon?: string;
  discount: number;
  ship: ShipId;
  city?: CityId;
  method: PayMethod;
  address?: Address;
  contact: { email?: string; phone: string };
  customerId?: string;
  /** The delivery method offered for this city (live store); falls back to the rule fixtures by id. */
  shipMethod?: ShipMethod;
  /** Reference to use if a new order is created (the live store takes the merchant's next free number). */
  ref?: string;
  codFee?: number;
  freeShip?: boolean;
}

/** Idempotency key: the same checkout session with the same basket, delivery and coupon is the same order. */
export function checkoutKey(d: Pick<Draft, 'sessionId' | 'lines' | 'coupon' | 'ship' | 'city'>): string {
  const basket = [...d.lines].sort((a, b) => a.vid.localeCompare(b.vid)).map((l) => `${l.vid}x${l.qty}@${l.unit}`).join(',');
  return `${d.sessionId}|${basket}|${d.coupon ?? ''}|${d.ship}|${d.city ?? ''}`;
}

export function nextRef(orders: Order[]): string {
  const max = orders.reduce((m, o) => Math.max(m, Number(o.ref.replace(/\D/g, '')) || 0), 24_800);
  return `DN-${max + 1}`;
}

/** Create the order for a key, or return the existing one. A double submit never creates a second order. */
export function submitOrder(orders: Order[], d: Draft, now: number): { orders: Order[]; order: Order; created: boolean } {
  const key = checkoutKey(d);
  const existing = orders.find((o) => o.key === key);
  if (existing) {
    if (!canPay(existing.pay.state)) return { orders, order: existing, created: false };
    // Still unpaid: keep the same order and reference, but take the latest address and contact details.
    const refreshed: Order = { ...existing, address: d.address, contact: d.contact, customerId: d.customerId };
    return { orders: orders.map((o) => (o === existing ? refreshed : o)), order: refreshed, created: false };
  }
  const ship = d.shipMethod ?? shipById(d.ship)!;
  const totals = computeTotals(d.lines, { discount: d.discount, ship, cod: d.method === 'cod', codFee: d.codFee, freeShip: d.freeShip });
  const eta = d.city ? deliveryEstimate(ship, d.city, now) : undefined;
  const order: Order = {
    ref: d.ref ?? nextRef(orders), key, at: now, customerId: d.customerId, contact: d.contact,
    lines: d.lines.map(({ vid, productId, qty, unit, amount, sku }) => ({ vid, productId, qty, unit, amount, ...(sku ? { sku } : {}) })),
    coupon: d.coupon, totals, address: d.address, ship: d.ship, shipName: ship.name, eta: eta && { from: eta.from, to: eta.to },
    pay: { method: d.method, state: 'awaiting', attempts: [] }, ful: 'unfulfilled', shipment: 'none', returns: [],
  };
  return { orders: [order, ...orders], order, created: true };
}

/** Apply a payment event to an order. `applied` is false when the event is not allowed in the current state. */
export function applyPayment(order: Order, e: PayEvent, method: PayMethod, now: number, codFee = MERCHANT.codFee): { order: Order; applied: boolean } {
  const next = payTransition(order.pay.state, e);
  if (next === order.pay.state && !(e.type === 'verify' && order.pay.state === 'verifying')) return { order, applied: false };
  const outcome: Attempt['outcome'] =
    e.type === 'attempt' ? e.outcome : e.type === 'cod' ? 'cod' : e.type === 'challenge' ? (e.pass ? 'challenge_pass' : 'challenge_fail')
      : e.type === 'verify' ? (e.result === 'paid' ? 'verify_paid' : e.result === 'failed' ? 'verify_failed' : 'verify_unknown') : 'cod';
  const switching = e.type === 'attempt' || e.type === 'cod';
  const m = switching ? method : order.pay.method;
  // Changing the method changes the COD fee, so totals are recomputed only when a new attempt starts.
  const totals = switching && m !== order.pay.method
    ? computeTotals(order.lines, { discount: order.totals.discount, shipping: order.totals.shipping, cod: m === 'cod', codFee })
    : order.totals;
  const prevN = order.pay.attempts.at(-1)?.n ?? 0;
  const n = switching ? prevN + 1 : prevN;
  return { order: { ...order, totals, pay: { method: m, state: next, attempts: [...order.pay.attempts, { n, method: m, outcome, at: now }] } }, applied: true };
}

/** Simulated merchant/carrier progress, one step at a time. Fulfilment and shipment advance separately. */
export function advanceFulfilment(o: Order, now: number): Order {
  if (!isSettled(o.pay.state)) return o;
  if (o.ful === 'unfulfilled') return { ...o, ful: 'preparing' };
  if (o.ful === 'preparing') return { ...o, ful: 'packed' };
  if (o.ful === 'packed') return { ...o, ful: 'fulfilled', shipment: o.ship === 'pickup' ? 'none' : 'label', trackingNo: o.ship === 'pickup' ? undefined : `TRK${o.ref.replace(/\D/g, '')}SA` };
  const order: ShipState[] = ['label', 'in_transit', 'out_for_delivery', 'delivered'];
  const i = order.indexOf(o.shipment);
  if (o.ship === 'pickup' || i < 0 || i === order.length - 1) return o;
  const next = order[i + 1];
  const pay = next === 'delivered' && o.pay.state === 'cod_due' ? { ...o.pay, state: 'cod_collected' as PayState } : o.pay;
  return { ...o, shipment: next, pay, deliveredAt: next === 'delivered' ? now : o.deliveredAt };
}

export function canAdvance(o: Order): boolean {
  return advanceFulfilment(o, 0) !== o;
}

/* ───────────── Returns ───────────── */

export type ReturnBlock = 'not_delivered' | 'window_closed' | 'nothing_returnable';

/** Quantity of a line still returnable after earlier requests. Opened fragrance is excluded by policy. */
export function returnableQty(o: Order, vid: string, products: Product[]): number {
  const line = o.lines.find((l) => l.vid === vid);
  if (!line) return 0;
  if (productById(products, line.productId)?.returnable === false) return 0;
  const already = o.returns.flatMap((r) => r.lines).filter((l) => l.vid === vid).reduce((s, l) => s + l.qty, 0);
  return Math.max(0, line.qty - already);
}

export function returnEligibility(o: Order, products: Product[], now: number, returnDays = MERCHANT.returnDays): { ok: true; until: number } | { ok: false; reason: ReturnBlock; until?: number } {
  if (o.shipment !== 'delivered' || !o.deliveredAt) return { ok: false, reason: 'not_delivered' };
  const until = o.deliveredAt + returnDays * DAY;
  if (now > until) return { ok: false, reason: 'window_closed', until };
  if (!o.lines.some((l) => returnableQty(o, l.vid, products) > 0)) return { ok: false, reason: 'nothing_returnable', until };
  return { ok: true, until };
}

/** Estimated refund: the paid unit price of returned items, less their share of any order discount. Final amount after inspection. */
export function refundEstimate(o: Order, picks: { vid: string; qty: number }[]): number {
  const goods = picks.reduce((s, p) => s + (o.lines.find((l) => l.vid === p.vid)?.unit ?? 0) * p.qty, 0);
  if (!o.totals.discount || !o.totals.subtotal) return goods;
  return goods - Math.round((goods * o.totals.discount) / o.totals.subtotal);
}

export const IBAN_RE = /^SA\d{2}[0-9A-Z]{20}$/;
export const validIban = (s: string) => IBAN_RE.test(s.replace(/\s+/g, '').toUpperCase());

export function requestReturn(o: Order, r: Omit<ReturnRequest, 'id' | 'state' | 'refund' | 'at' | 'amount'>, products: Product[], now: number, returnDays = MERCHANT.returnDays): Order {
  if (!returnEligibility(o, products, now, returnDays).ok) return o;
  const lines = r.lines.filter((l) => l.qty > 0 && l.qty <= returnableQty(o, l.vid, products));
  if (!lines.length) return o;
  const req: ReturnRequest = { ...r, lines, id: `RMA-${o.ref.replace(/\D/g, '')}-${o.returns.length + 1}`, state: 'requested', refund: 'not_started', at: now, amount: refundEstimate(o, lines) };
  return { ...o, returns: [...o.returns, req] };
}

/* ───────────── Validation ───────────── */

export const PHONE_RE = /^5\d{8}$/;
export const NATIONAL_RE = /^[A-Z]{4}\d{4}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const cleanPhone = (s: string) => s.replace(/[\s-]/g, '').replace(/^(\+?966|0)/, '').replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));

export type AddrErr = Partial<Record<'name' | 'phone' | 'city' | 'district' | 'street' | 'building' | 'nationalCode' | 'email', 'required' | 'format'>>;

export function validateAddress(a: Partial<Address>, contact?: { email?: string }): AddrErr {
  const e: AddrErr = {};
  if (!a.name?.trim()) e.name = 'required';
  if (!a.phone?.trim()) e.phone = 'required';
  else if (!PHONE_RE.test(cleanPhone(a.phone))) e.phone = 'format';
  if (!a.city) e.city = 'required';
  if (!a.district?.trim()) e.district = 'required';
  if (!a.street?.trim()) e.street = 'required';
  if (!a.building?.trim()) e.building = 'required';
  if (a.nationalCode?.trim() && !NATIONAL_RE.test(a.nationalCode.trim().toUpperCase())) e.nationalCode = 'format';
  if (contact?.email?.trim() && !EMAIL_RE.test(contact.email.trim())) e.email = 'format';
  return e;
}
