// QR codes & short links free app: pure rules. A link points to a product, category, page, landing page or coupon,
// carries UTM tags and a link code (`lk`). The storefront records the visit; an order placed within the touch
// window is credited to the link, and its revenue is read from the order book.

export type LinkKind = 'product' | 'category' | 'page' | 'landing' | 'coupon';
export const LINK_KINDS: LinkKind[] = ['product', 'category', 'page', 'landing', 'coupon'];
export const LINK_TOUCH_DAYS = 7;

export interface Utm { source: string; medium: string; campaign: string }
export interface ShortLink {
  id: string;
  code: string;
  label: string;
  kind: LinkKind;
  /** Product id, category id, page slug, landing slug or coupon code. */
  target: string;
  utm: Utm;
  on: boolean;
  createdAt: string;
  by: string;
}
export interface QrSettings extends Record<string, unknown> { links: ShortLink[] }
export const QR_DEFAULTS: QrSettings = { links: [] };

export const UTM_SOURCES = ['instagram', 'snapchat', 'tiktok', 'x', 'whatsapp', 'flyer', 'shop_sign', 'influencer', 'email'];
export const UTM_MEDIUMS = ['qr', 'social', 'print', 'referral', 'email', 'sms'];

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
export const slugUtm = (s: string) => toLatin(s).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export const normCode = (s: string) => toLatin(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Path inside the store for a link's target. A coupon link opens the home page and applies the code to the bag. */
export function storePath(kind: LinkKind, target: string): string {
  switch (kind) {
    case 'product': return `/p/${target}`;
    case 'category': return `/c/${target}`;
    case 'page': return `/page/${target}`;
    case 'landing': return `/lp/${target}`;
    case 'coupon': return '';
  }
}
/** Full working URL (what the QR encodes): `<base>#/store<path>?lk=CODE&utm_…`. */
export function linkUrl(base: string, l: Pick<ShortLink, 'kind' | 'target' | 'code' | 'utm'>): string {
  const q = new URLSearchParams({ lk: l.code, utm_source: l.utm.source, utm_medium: l.utm.medium, utm_campaign: l.utm.campaign });
  return `${base}#/store${storePath(l.kind, l.target)}?${q.toString()}`;
}
/** Short form shown to the merchant (the short domain is simulated in this preview). */
export const shortForm = (code: string) => `lak.link/${code}`;

/** Link code from a store address `?lk=CODE`; else undefined. */
export function linkCodeOf(query: URLSearchParams): string | undefined {
  const raw = normCode(query.get('lk') ?? '');
  return /^[A-Z0-9]{3,12}$/.test(raw) ? raw : undefined;
}

/** A free code, derived from a seed so tests are stable: 6 characters, never one already used. */
export function nextCode(taken: string[], seed: number): string {
  const set = new Set(taken);
  let n = seed;
  for (;;) {
    const c = ((n * 2654435761) >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6);
    if (!set.has(c)) return c;
    n++;
  }
}

export type LinkError = 'label' | 'labelLong' | 'code' | 'codeTaken' | 'target' | 'source' | 'medium' | 'campaign';
export function linkErrors(l: ShortLink, all: ShortLink[], targetExists: boolean): LinkError[] {
  const out: LinkError[] = [];
  if (!l.label.trim()) out.push('label');
  if (l.label.trim().length > 40) out.push('labelLong');
  if (!/^[A-Z0-9]{3,12}$/.test(l.code)) out.push('code');
  else if (all.some((x) => x.id !== l.id && x.code === l.code)) out.push('codeTaken');
  if (!l.target || !targetExists) out.push('target');
  if (!/^[a-z0-9_-]{1,40}$/.test(l.utm.source)) out.push('source');
  if (!/^[a-z0-9_-]{1,40}$/.test(l.utm.medium)) out.push('medium');
  if (!/^[a-z0-9_-]{1,40}$/.test(l.utm.campaign)) out.push('campaign');
  return out;
}

export interface LinkStats { visits: number; orders: number; revenue: number; conversion: number | null }
/**
 * Visits from the session counter; orders credited to the link; revenue = totals of those orders in the order book
 * that are not cancelled (`value` returns 0 for a cancelled or unknown order).
 */
export function linkStats(code: string, visits: Record<string, number>, credited: Record<string, string>, value: (ref: string) => number): LinkStats {
  const refs = Object.entries(credited).filter(([, c]) => c === code).map(([r]) => r);
  const counted = refs.filter((r) => value(r) > 0);
  const v = visits[code] ?? 0;
  return { visits: v, orders: counted.length, revenue: counted.reduce((t, r) => t + value(r), 0), conversion: v ? counted.length / v : null };
}
