// Honest social proof (free app): rules only. «Someone in Riyadh bought this 2 hours ago» comes from a real paid order
// for that product within the merchant's window; the name is the first-name initial or nothing (merchant's choice),
// never the full name. «Only 3 left» shows only when the stock the store can sell is at or below the threshold.
// Nothing is invented: no order in the window = no message; no low stock = no message.
import type { L, Order } from '../../../merchant/domain';

export interface ProofSettings {
  recent: boolean;
  /** How the buyer is named: first-name initial ("س.") or not at all. */
  name: 'initial' | 'none';
  city: boolean;
  /** Only purchases within this many hours. */
  windowHours: number;
  lowStock: boolean;
  /** «Only N left» when sellable stock is 1…lowAt. */
  lowAt: number;
}
export const PROOF_DEFAULTS: ProofSettings = { recent: true, name: 'initial', city: true, windowHours: 48, lowStock: true, lowAt: 3 };

export type ProofError = 'nothing' | 'window' | 'lowAt';
export function proofProblems(s: ProofSettings): ProofError[] {
  const out: ProofError[] = [];
  if (!s.recent && !s.lowStock) out.push('nothing');
  if (!Number.isInteger(s.windowHours) || s.windowHours < 1 || s.windowHours > 168) out.push('window');
  if (!Number.isInteger(s.lowAt) || s.lowAt < 1 || s.lowAt > 20) out.push('lowAt');
  return out;
}

const H = 3_600_000;
/** When an order was placed: the session time for store orders, else derived from its age. */
export const placedAt = (o: Pick<Order, 'placedAt' | 'hoursAgo'>, now: number) => o.placedAt ?? now - o.hoursAgo * H;
/** First-name initial with a dot ("سارة العتيبي" → "س."), or null. */
export function initialOf(name: L): L | null {
  const a = name.ar.trim().charAt(0), e = name.en.trim().charAt(0).toUpperCase();
  return a || e ? { ar: a ? `${a}.` : `${e}.`, en: e ? `${e}.` : `${a}.` } : null;
}
/** The city without the district ("الرياض، حي الملقا" → "الرياض"). */
export const cityOnly = (c: L): L | null => {
  const ar = c.ar.split('،')[0].trim(), en = c.en.split(',')[0].trim();
  return ar || en ? { ar: ar || en, en: en || ar } : null;
};

export interface RecentBuy { ref: string; at: number; name: L | null; city: L | null }
/** Real paid purchases of any of the SKUs within the window, newest first. Cancelled and refunded orders are left out. */
export function recentBuys(orders: Order[], skus: string[], s: Pick<ProofSettings, 'windowHours' | 'name' | 'city'>, now: number, limit = 3): RecentBuy[] {
  const set = new Set(skus);
  return orders
    .filter((o) => (o.pay === 'paid' || o.pay === 'partially_refunded') && !o.cancelled && o.items.some((i) => set.has(i.sku)))
    .map((o) => ({ o, at: placedAt(o, now) }))
    .filter(({ at }) => at <= now && now - at <= s.windowHours * H)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ o, at }) => ({ ref: o.ref, at, name: s.name === 'initial' ? initialOf(o.customer) : null, city: s.city ? cityOnly(o.city) : null }));
}

/** «Only N left» count, or null when stock is unlimited, out, or above the threshold. */
export function lowStockLeft(stock: number, s: Pick<ProofSettings, 'lowStock' | 'lowAt'>): number | null {
  return s.lowStock && Number.isFinite(stock) && stock > 0 && stock <= s.lowAt ? stock : null;
}

/** "2 hours ago" / "35 minutes ago" / "yesterday". */
export function agoL(at: number, now: number): L {
  const m = Math.max(1, Math.round((now - at) / 60_000));
  if (m < 60) return { ar: m <= 2 ? 'قبل دقائق' : `قبل ${m} ${m <= 10 ? 'دقائق' : 'دقيقة'}`, en: m <= 2 ? 'minutes ago' : `${m} minutes ago` };
  const h = Math.round(m / 60);
  if (h < 24) return { ar: h === 1 ? 'قبل ساعة' : h === 2 ? 'قبل ساعتين' : `قبل ${h} ${h <= 10 ? 'ساعات' : 'ساعة'}`, en: h === 1 ? 'an hour ago' : `${h} hours ago` };
  const d = Math.round(h / 24);
  return { ar: d === 1 ? 'أمس' : d === 2 ? 'قبل يومين' : `قبل ${d} ${d <= 10 ? 'أيام' : 'يومًا'}`, en: d === 1 ? 'yesterday' : `${d} days ago` };
}

/** The sentence a shopper reads. */
export function proofLine(b: RecentBuy, now: number): L {
  const who = b.name ? { ar: `${b.name.ar} `, en: `${b.name.en} ` } : { ar: 'أحد العملاء ', en: 'Someone ' };
  const where = b.city ? { ar: `من ${b.city.ar} `, en: `in ${b.city.en} ` } : { ar: '', en: '' };
  const ago = agoL(b.at, now);
  return { ar: `${who.ar}${where.ar}اشترى هذا ${ago.ar}`, en: `${who.en}${where.en}bought this ${ago.en}` };
}
