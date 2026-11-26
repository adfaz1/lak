// Google Analytics & Merchant Center free app: pure rules. ID formats, which events the measurement tag sends and
// when (only after the visitor accepts analytics cookies), and product-feed health per product. Connections and
// test events are simulated; nothing reaches Google.
import type { L } from '../../../merchant/domain';
import type { Product } from '../../../merchant/catalog';

export type GaEvent = 'page_view' | 'view_item' | 'add_to_cart' | 'begin_checkout' | 'purchase';
export const GA_EVENTS: GaEvent[] = ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'];
/** When each event fires and what it carries. No name, mobile, email or address is ever sent. */
export const GA_EVENT_INFO: Record<GaEvent, { when: L; params: string[] }> = {
  page_view: { when: { ar: 'فتح أي صفحة', en: 'Any page opens' }, params: ['page_location', 'page_title', 'language'] },
  view_item: { when: { ar: 'فتح صفحة منتج', en: 'A product page opens' }, params: ['item_id', 'item_name', 'price', 'currency'] },
  add_to_cart: { when: { ar: 'إضافة للحقيبة', en: 'Added to the bag' }, params: ['item_id', 'quantity', 'value', 'currency'] },
  begin_checkout: { when: { ar: 'بدء الدفع', en: 'Checkout starts' }, params: ['value', 'currency', 'items'] },
  purchase: { when: { ar: 'تأكيد الطلب', en: 'Order confirmed' }, params: ['transaction_id', 'value', 'tax', 'shipping', 'currency', 'items'] },
};

export interface GoogleSettings extends Record<string, unknown> {
  ga4: string;
  mc: string;
  events: Record<GaEvent, boolean>;
  connected: { ga4?: string; mc?: string };
  tests: { at: string; event: GaEvent; ok: boolean; id: string }[];
}
export const GOOGLE_DEFAULTS: GoogleSettings = {
  ga4: '', mc: '', connected: {}, tests: [],
  events: { page_view: true, view_item: true, add_to_cart: true, begin_checkout: true, purchase: true },
};

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
/** GA4 measurement ID: `G-` and 10 letters or digits (upper-cased, spaces dropped). */
export const normGa4 = (s: string) => toLatin(s).replace(/\s/g, '').toUpperCase();
export const validGa4 = (s: string) => /^G-[A-Z0-9]{10}$/.test(normGa4(s));
/** Merchant Center account ID: 6 to 12 digits. */
export const normMc = (s: string) => toLatin(s).replace(/[\s-]/g, '');
export const validMc = (s: string) => /^\d{6,12}$/.test(normMc(s));

export type GoogleError = 'ga4' | 'mc';
export function googleErrors(s: Pick<GoogleSettings, 'ga4' | 'mc'>): GoogleError[] {
  const out: GoogleError[] = [];
  if (s.ga4.trim() && !validGa4(s.ga4)) out.push('ga4');
  if (s.mc.trim() && !validMc(s.mc)) out.push('mc');
  return out;
}

/** What the tag sends for a visitor: nothing without analytics consent, else the events switched on. */
export const sentEvents = (s: Pick<GoogleSettings, 'ga4' | 'events'>, consent: boolean): GaEvent[] => (consent && validGa4(s.ga4) ? GA_EVENTS.filter((e) => s.events[e]) : []);

/** GTIN-8/12/13/14 with a valid check digit. */
export function validGtin(code: string): boolean {
  const d = toLatin(code).replace(/\s/g, '');
  if (!/^(\d{8}|\d{12,14})$/.test(d)) return false;
  const digits = d.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((t, n, i) => t + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export type FeedIssue = 'gtin' | 'gtinInvalid' | 'brand' | 'description' | 'image';
/** Fields to open in the product editor (`?focus=`) to fix each issue. */
export const ISSUE_FOCUS: Record<FeedIssue, string> = { gtin: 'barcode', gtinInvalid: 'barcode', brand: 'brand', description: 'descAr', image: 'media' };
export const DESC_MIN = 30;

/** Feed problems for one product: missing or invalid GTIN, no brand, description under DESC_MIN characters, no image. */
export function feedIssues(p: Product, brandIds: string[]): FeedIssue[] {
  const out: FeedIssue[] = [];
  if (!p.barcode.trim()) out.push('gtin');
  else if (!validGtin(p.barcode)) out.push('gtinInvalid');
  if (!p.brand || !brandIds.includes(p.brand)) out.push('brand');
  if (Math.max(p.desc.ar.trim().length, p.desc.en.trim().length) < DESC_MIN) out.push('description');
  if (!p.media.length) out.push('image');
  return out;
}
/** Products that go in the feed: active, sold online, physical (services and downloads are excluded by Google Shopping rules here). */
export const feedProducts = (ps: Product[]) => ps.filter((p) => p.status === 'active' && p.channels.online && p.type === 'physical');
export function feedHealth(ps: Product[], brandIds: string[]) {
  const rows = feedProducts(ps).map((p) => ({ p, issues: feedIssues(p, brandIds) }));
  const count = (i: FeedIssue) => rows.filter((r) => r.issues.includes(i)).length;
  return {
    rows, total: rows.length, ready: rows.filter((r) => !r.issues.length).length,
    by: { gtin: count('gtin') + count('gtinInvalid'), brand: count('brand'), description: count('description'), image: count('image') },
  };
}
