// Wholesale / B2B (Phase D, channels group): the merchant sells to business buyers from the same catalogue and stock.
// Pure rules: buyer accounts (company, CR, VAT validated) with approval, customer groups, price lists tiered by
// quantity, minimum order quantity, quote request → quote → order (channel 'wholesale') with a tax invoice that
// shows the buyer's VAT number, and payment terms the merchant sets. Money is integer halalas.
// Price-list prices are entered BEFORE VAT (B2B convention); orders store VAT-inclusive unit prices like every
// other order, and the invoice breaks them down. Whether LAK runs a wholesale marketplace (BP-P06-WHS) is pending.
import type { L, LocId, Order } from './domain';
import { nextOrderRef } from './domain';
import { normaliseDigits, type Product } from './catalog';
import { checkCr, checkVat } from './verification';
import { available, levelOf, type Level } from './inventory';
import { validEmail } from './workspace';

/* ---------- Buyers and groups ---------- */

export type BuyerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type TermsId = 'prepaid' | 'net15' | 'net30' | 'net60';
export const TERMS: TermsId[] = ['prepaid', 'net15', 'net30', 'net60'];
/** Days the buyer has to pay after the order. Prepaid = pay before it ships (3 days to transfer). */
export const TERMS_DAYS: Record<TermsId, number> = { prepaid: 3, net15: 15, net30: 30, net60: 60 };

export interface Buyer {
  id: string; company: string; cr: string; vat: string; contact: string; phone: string; email: string; city: string; address: string;
  group: string; status: BuyerStatus; terms: TermsId;
  /** Where the account came from: the buyer's application form, or added by the merchant. */
  source: 'form' | 'merchant';
  at: number; decided?: { by: string; at: number; note: string };
}
export interface Group { id: string; name: L }

export type BuyerField = 'company' | 'cr' | 'vat' | 'contact' | 'phone' | 'email' | 'city' | 'address';
export type BuyerError = 'required' | 'format' | 'pattern' | 'taken';
/** Saudi mobile: 05xxxxxxxx or +9665xxxxxxxx (spaces and Arabic digits accepted). */
export const validMobile = (s: string) => /^(?:\+?966|0)5\d{8}$/.test(normaliseDigits(s).replace(/-/g, ''));

/** Validate a buyer form. CR: 10 digits; VAT: 15 digits starting and ending with 3; one account per CR or VAT. */
export function validateBuyer(b: Pick<Buyer, BuyerField> & { id?: string }, all: Buyer[]): Partial<Record<BuyerField, BuyerError>> {
  const e: Partial<Record<BuyerField, BuyerError>> = {};
  (['company', 'cr', 'vat', 'contact', 'phone', 'email', 'city', 'address'] as BuyerField[]).forEach((k) => { if (!b[k].trim()) e[k] = 'required'; });
  if (!e.cr) { const r = checkCr(b.cr); if (!r.ok) e.cr = 'format'; else if (all.some((x) => x.id !== b.id && x.cr === r.value && x.status !== 'rejected')) e.cr = 'taken'; }
  if (!e.vat) { const r = checkVat(b.vat); if (!r.ok) e.vat = r.error; else if (all.some((x) => x.id !== b.id && x.vat === r.value && x.status !== 'rejected')) e.vat = 'taken'; }
  if (!e.phone && !validMobile(b.phone)) e.phone = 'format';
  if (!e.email && !validEmail(b.email)) e.email = 'format';
  return e;
}
/** Store CR and VAT as plain digits. */
export const cleanBuyer = <T extends Pick<Buyer, 'cr' | 'vat' | 'phone'>>(b: T): T => ({ ...b, cr: normaliseDigits(b.cr), vat: normaliseDigits(b.vat), phone: normaliseDigits(b.phone) });
export const nextBuyerId = (list: Buyer[]) => `B-${list.reduce((m, b) => Math.max(m, Number(b.id.replace(/\D/g, '')) || 0), 200) + 1}`;

export function decideBuyer(b: Buyer, to: 'approved' | 'rejected' | 'suspended', by: string, note: string, now: number): Buyer | null {
  if (to === 'rejected' && !note.trim()) return null;
  if (to === 'approved' && b.status === 'approved') return null;
  return { ...b, status: to, decided: { by, at: now, note: note.trim() } };
}

/* ---------- Price lists ---------- */

export interface Tier { min: number; /** Before VAT, halalas per unit. */ price: number }
export interface PriceRow { productId: string; tiers: Tier[] }
export interface PriceList { group: string; rows: PriceRow[] }

export type TierError = 'min' | 'price' | 'order' | 'empty';
/** Tiers: whole quantities ≥ 1, strictly increasing, a positive price each. The first tier's quantity is the MOQ. */
export function checkTiers(tiers: Tier[]): TierError | null {
  if (!tiers.length) return 'empty';
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (!Number.isInteger(t.min) || t.min < 1) return 'min';
    if (!Number.isInteger(t.price) || t.price <= 0) return 'price';
    if (i && t.min <= tiers[i - 1].min) return 'order';
  }
  return null;
}
/** Soft warnings the merchant sees but may accept: a higher price for more units, below cost, above retail. */
export function tierWarnings(tiers: Tier[], p: Pick<Product, 'price' | 'cost'>): ('rising' | 'belowCost' | 'aboveRetail')[] {
  const w: ('rising' | 'belowCost' | 'aboveRetail')[] = [];
  if (tiers.some((t, i) => i && t.price > tiers[i - 1].price)) w.push('rising');
  if (p.cost !== null && tiers.some((t) => t.price < p.cost!)) w.push('belowCost');
  const retailExcl = Math.round((p.price * 100) / 115);
  if (tiers.some((t) => t.price > retailExcl)) w.push('aboveRetail');
  return w;
}
export const moqOf = (row: PriceRow | undefined) => row?.tiers[0]?.min ?? null;

export type PriceError = 'notListed' | 'belowMoq';
/** Unit price (before VAT) for a quantity: the deepest tier the quantity reaches. Below the MOQ there is no price. */
export function unitFor(list: PriceList | undefined, productId: string, qty: number): { price: number; tier: number } | { error: PriceError; moq?: number } {
  const row = list?.rows.find((r) => r.productId === productId);
  if (!row || !row.tiers.length) return { error: 'notListed' };
  const sorted = [...row.tiers].sort((a, b) => a.min - b.min);
  if (qty < sorted[0].min) return { error: 'belowMoq', moq: sorted[0].min };
  let tier = 0;
  sorted.forEach((t, i) => { if (qty >= t.min) tier = i; });
  return { price: sorted[tier].price, tier };
}
/** The next tier up and how many more units reach it (shown to nudge a bigger order). */
export function nextTier(list: PriceList | undefined, productId: string, qty: number): { more: number; price: number } | null {
  const row = list?.rows.find((r) => r.productId === productId);
  const t = row?.tiers.filter((x) => x.min > qty).sort((a, b) => a.min - b.min)[0];
  return t ? { more: t.min - qty, price: t.price } : null;
}

/* ---------- Settings the merchant sets ---------- */

export interface WholesaleSettings {
  /** Minimum order value before VAT (halalas); 0 = none. */
  minOrder: number;
  /** Terms the merchant offers; each buyer gets one of these. */
  terms: TermsId[];
  /** Days a quote stays valid. */
  quoteDays: number;
  /** Buyers must be approved before they see wholesale prices. */
  approval: boolean;
  /** Stock location wholesale orders are reserved from. */
  loc: LocId;
}
export const defaultSettings = (): WholesaleSettings => ({ minOrder: 0, terms: ['prepaid', 'net30'], quoteDays: 7, approval: true, loc: 'ryd' });

/* ---------- Quotes ---------- */

export type QuoteStatus = 'requested' | 'quoted' | 'accepted' | 'declined' | 'expired' | 'converted';
export interface QuoteLine { productId: string; sku: string; name: L; qty: number; /** Before VAT; set when quoted. */ price?: number }
export interface Quote {
  id: string; buyerId: string; lines: QuoteLine[]; note: string; status: QuoteStatus; at: number;
  source: 'form' | 'merchant';
  quoted?: { at: number; by: string; validUntil: number; shipping: number; terms: TermsId; note: string };
  answered?: { at: number; how: 'accepted' | 'declined'; note: string };
  orderRef?: string;
}
export const nextQuoteId = (list: Quote[]) => `Q-${list.reduce((m, q) => Math.max(m, Number(q.id.replace(/\D/g, '')) || 0), 500) + 1}`;

/** Expired quotes are detected when read; nothing runs in the background. */
export const quoteState = (q: Quote, now: number): QuoteStatus => (q.status === 'quoted' && q.quoted && now > q.quoted.validUntil ? 'expired' : q.status);

/** Price the request from the buyer's group price list. Lines without a price or below MOQ are reported. */
export function priceQuote(q: Quote, list: PriceList | undefined): { lines: QuoteLine[]; problems: { productId: string; error: PriceError; moq?: number }[] } {
  const problems: { productId: string; error: PriceError; moq?: number }[] = [];
  const lines = q.lines.map((l) => {
    const r = unitFor(list, l.productId, l.qty);
    if ('error' in r) { problems.push({ productId: l.productId, error: r.error, moq: r.moq }); return { ...l, price: l.price }; }
    return { ...l, price: l.price ?? r.price };
  });
  return { lines, problems };
}

/** Quote totals: lines before VAT, shipping before VAT, VAT 15 %, total. */
export function quoteTotals(lines: QuoteLine[], shipping: number) {
  const net = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0) + shipping;
  const vat = Math.round(net * 0.15);
  return { lines: net - shipping, shipping, net, vat, total: net + vat };
}

export type QuoteError = 'noLines' | 'price' | 'qty' | 'minOrder' | 'buyer' | 'stock' | 'terms';
export function checkQuote(lines: QuoteLine[], buyer: Buyer | undefined, s: WholesaleSettings, levels: Level[], terms: TermsId): { error: QuoteError | null; short: string[] } {
  if (!buyer || buyer.status !== 'approved') return { error: 'buyer', short: [] };
  if (!lines.length) return { error: 'noLines', short: [] };
  if (lines.some((l) => !Number.isInteger(l.qty) || l.qty < 1)) return { error: 'qty', short: [] };
  if (lines.some((l) => !l.price || l.price <= 0)) return { error: 'price', short: [] };
  if (!s.terms.includes(terms)) return { error: 'terms', short: [] };
  const net = lines.reduce((t, l) => t + (l.price ?? 0) * l.qty, 0);
  if (s.minOrder && net < s.minOrder) return { error: 'minOrder', short: [] };
  const short = lines.filter((l) => { const lv = levelOf(levels, l.sku, s.loc); return !lv || available(lv) < l.qty; }).map((l) => l.sku);
  return { error: short.length ? 'stock' : null, short };
}

export interface WholesaleMeta {
  buyerId: string; company: string; cr: string; vat: string; address: string; quote: string; terms: TermsId;
  /** Invoice number issued with the order (tax invoice, not simplified: the buyer is VAT-registered). */
  invoice: string;
}

/** VAT-inclusive unit from a before-VAT price (how every order stores unit prices). */
export const inclVat = (excl: number) => Math.round(excl * 1.15);

/**
 * The accepted quote as an order: stock is held at the wholesale location; payment is awaited by bank transfer
 * until the term ends (net terms ship before payment). Shipping is a before-VAT charge, stored VAT-inclusive.
 */
export function quoteToOrder(q: Quote, buyer: Buyer, s: WholesaleSettings, ctx: { orders: { ref: string }[]; now: number; who: string; role: string }): Order {
  const ref = nextOrderRef(ctx.orders);
  const terms = q.quoted?.terms ?? buyer.terms;
  const meta: WholesaleMeta = { buyerId: buyer.id, company: buyer.company, cr: buyer.cr, vat: buyer.vat, address: `${buyer.address}، ${buyer.city}`, quote: q.id, terms, invoice: `INV-W-${ref}` };
  return {
    ref, customer: { ar: buyer.company, en: buyer.company }, city: { ar: buyer.city, en: buyer.city }, hoursAgo: 0, pay: 'failed', ful: 'none', ship: 'none',
    fee: inclVat(q.quoted?.shipping ?? 0),
    items: q.lines.map((l) => ({ name: l.name, qty: l.qty, unit: inclVat(l.price ?? 0), sku: l.sku, reserved: { [s.loc]: l.qty } })),
    log: [{ when: 'now', who: 'you', kind: 'created', actor: ctx.who, role: ctx.role, at: ctx.now }],
    confirmed: true, channel: 'wholesale', fulfilments: [], refunds: [], slips: 0, settled: false, placedAt: ctx.now,
    contact: { phone: buyer.phone, email: buyer.email }, address: { name: buyer.contact, line: buyer.address, city: { ar: buyer.city, en: buyer.city } },
    payment: { method: 'bank', state: 'verifying' }, payDue: ctx.now + TERMS_DAYS[terms] * 86_400_000,
    wholesale: meta,
  };
}
/** Stock held for the order at the wholesale location. */
export const quoteEffects = (q: Quote, loc: LocId) => q.lines.map((l) => ({ sku: l.sku, loc, reserved: l.qty, onHand: 0 }));

/** Tax-invoice lines from a wholesale order: unit before VAT, VAT per line, totals. Consistent with order totals. */
export function invoiceLines(o: Order) {
  const lines = o.items.map((i) => {
    const gross = i.qty * i.unit;
    const vat = Math.round((gross * 15) / 115);
    return { name: i.name, sku: i.sku, qty: i.qty, unitExcl: Math.round(((i.unit * 100) / 115)), net: gross - vat, vat, gross };
  });
  const shipVat = Math.round((o.fee * 15) / 115);
  const net = lines.reduce((s, l) => s + l.net, 0) + (o.fee - shipVat);
  const vat = lines.reduce((s, l) => s + l.vat, 0) + shipVat;
  return { lines, shipping: { net: o.fee - shipVat, vat: shipVat }, net, vat, total: net + vat };
}
