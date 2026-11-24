// Review controls and read-only selectors over the existing merchant fixtures.
// The redesign reuses the merchant workspace's domain and stores: same data, same rules, new experience.
import { createStore } from '../../core/store';
import { link } from '../../core/router';
import { useReviewMode } from '../../core/review';
import type { Item, Order } from '../merchant/domain';
import { refundable, total, units } from '../merchant/domain';

export type Direction = 'a' | 'b';
/** "live" shows the data; the others force a state so loading, empty and error can be reviewed on demand. */
export type DemoState = 'live' | 'loading' | 'empty' | 'error';

/** The review toolbar starts collapsed on phones so it never covers the screen being reviewed. */
const wide = () => { try { return window.innerWidth >= 700; } catch { return true; } };
export const reviewStore = createStore.key('v2.review')<{ dir: Direction; state: DemoState; open: boolean }>(() => ({ dir: 'a', state: 'live', open: wide() }));

/** What a screen should render. Outside review mode the product always shows live data in the default direction. */
export function useView(): { dir: Direction; state: DemoState; review: boolean } {
  const r = reviewStore.use();
  const review = useReviewMode();
  return review ? { dir: r.dir, state: r.state, review } : { dir: 'a', state: 'live', review };
}

export const vhref = (path: string, q?: Record<string, string | undefined>) => link(`/v2${path ? `/${path.replace(/^\//, '')}` : ''}`, q);

/* ---------- Product imagery ---------- */

const SKU_TO_PRODUCT: [prefix: string, id: string][] = [
  ['ABY', 'p1'], ['SHL', 'p2'], ['OUD', 'p3'], ['BAG', 'p4'], ['WLT', 'p5'], ['COF', 'p6'],
  ['THB', 'p7'], ['MAT', 'p8'], ['INC', 'p9'], ['GFT', 'p10'], ['DAT', 'p11'], ['SCF', 'p12'],
];
export function productIdForSku(sku: string): string | undefined {
  return SKU_TO_PRODUCT.find(([p]) => sku.startsWith(p))?.[1];
}
/** Products with a licensed photo that shows exactly that product (see public/products/credits.json).
 *  p7 (thobe) has no suitable licensed photo; p10 is a digital gift card. Both show a neutral monogram tile. */
const HAS_PHOTO = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8', 'p9', 'p11', 'p12']);
export const productImage = (id: string | undefined, thumb = true): string | undefined =>
  id && HAS_PHOTO.has(id) ? `/products/${thumb ? 'thumb/' : ''}${id}.jpg` : undefined;
export const itemImage = (i: Item) => productImage(productIdForSku(i.sku));

/* ---------- Order presentation ---------- */

export type Stage = 'payfail' | 'todo' | 'partial' | 'label' | 'transit' | 'delivered' | 'refund';
/** One operational stage per order for scanning; the three underlying states stay separate in detail. */
export function stageOf(o: Order): Stage {
  if (o.pay === 'failed') return 'payfail';
  if (o.refunds.some((r) => r.status === 'pending')) return 'refund';
  if (o.ful === 'partial') return 'partial';
  if (o.ship === 'delivered') return 'delivered';
  if (o.ship === 'transit') return 'transit';
  if (o.ship === 'label') return 'label';
  return 'todo';
}

export const LATE_HOURS = 24;
export const isLate = (o: Order) => o.pay === 'paid' && o.ful === 'none' && o.hoursAgo >= LATE_HOURS;

export function orderSummary(o: Order) {
  return { total: total(o), units: units(o), refundable: refundable(o), images: o.items.map((i) => ({ src: itemImage(i), alt: i.name.en })) };
}

/** Relative age, compact. */
export function age(h: number, lang: 'ar' | 'en'): string {
  if (h < 1) return lang === 'ar' ? 'الآن' : 'just now';
  if (h < 24) return lang === 'ar' ? `قبل ${h} س` : `${h}h ago`;
  const d = Math.round(h / 24);
  return lang === 'ar' ? `قبل ${d} ي` : `${d}d ago`;
}
