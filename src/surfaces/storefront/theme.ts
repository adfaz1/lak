/* Merchant brand for the storefront: the shop wears the merchant's colours and homepage sections, not LAK's.
   Colours come from the store palette the merchant's "Online store" editor previews (dashboard/storefront/model.ts);
   sections, their order, visibility and headings come from the merchant's published theme (merchant/workspace.ts).
   Pure functions only. */
import type { L, Lang } from '../../core/lang';
import { identityFixture, type ButtonStyle, type Section, type SectionKind, type StoreFont, type StoreIdentity, type ThemeState } from '../merchant/workspace';
import { collectionMembers, type Collection, type Product as MProduct } from '../merchant/catalog';
import type { Review, ReviewSettings } from '../merchant/growth';
import type { Level } from '../merchant/inventory';
import { STORE_PALETTE } from '../dashboard/storefront/model';
import type { MediaLib } from '../dashboard/storefront/state';
import { sellable } from './bridge';
import type { Product } from './domain';

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
/** Share of white (positive) or black (negative) mixed into the accent for each step; 600 is the accent itself. */
const STEP_MIX: Record<(typeof SCALE_STEPS)[number], number> = { 50: 0.93, 100: 0.86, 200: 0.72, 300: 0.54, 400: 0.34, 500: 0.15, 600: 0, 700: -0.18, 800: -0.34, 900: -0.5 };

/** A 50–900 brand scale derived from one accent colour. */
export function brandScale(accent: string): Record<(typeof SCALE_STEPS)[number], string> {
  const base = toRgb(accent);
  const out = {} as Record<(typeof SCALE_STEPS)[number], string>;
  for (const s of SCALE_STEPS) {
    const m = STEP_MIX[s];
    out[s] = toHex(m >= 0 ? mix(base, [255, 255, 255], m) : mix(base, [0, 0, 0], -m));
  }
  return out;
}

/** WCAG relative luminance and contrast, to keep the derived scale honest. */
export function luminance(hex: string): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export interface Palette { accent: string; bg: string; surface: string; surface2: string; border: string; fg: string; muted: string; subtle: string }

/** The merchant's light palette, straight from the store theme. */
export function lightPalette(p = STORE_PALETTE, accent: string = p.accent): Palette {
  return { accent, bg: p.bg, surface: p.paper, surface2: p.sand, border: p.line, fg: p.ink, muted: p.muted, subtle: '#8f8478' };
}
/** A warm dark counterpart built from the same ink and accent, for shoppers who prefer dark mode. */
export function darkPalette(p = STORE_PALETTE, accent: string = p.accent): Palette {
  const ink = toRgb(p.ink);
  return {
    accent,
    bg: toHex(mix(ink, [0, 0, 0], 0.35)), surface: toHex(mix(ink, [255, 255, 255], 0.03)), surface2: toHex(mix(ink, [255, 255, 255], 0.08)),
    border: toHex(mix(ink, [255, 255, 255], 0.16)), fg: '#f3ede6', muted: '#bcb0a2', subtle: '#8a7f73',
  };
}

function vars(p: Palette): string {
  const s = brandScale(p.accent);
  const brand = SCALE_STEPS.map((k) => `--color-brand-${k}:${s[k]}`).join(';');
  return `${brand};--bg:${p.bg};--surface:${p.surface};--surface-2:${p.surface2};--border:${p.border};--fg:${p.fg};--muted:${p.muted};--subtle:${p.subtle}`;
}

/**
 * CSS that re-skins every `.lak` element while the storefront is mounted (body[data-sf]).
 * Scoped to the body attribute so dialogs portalled to <body> wear the merchant brand too.
 */
export function storeCss(id: StoreIdentity = identityFixture()): string {
  const accent = isHex(id.accent) ? id.accent : STORE_PALETTE.accent;
  const font = FONT_STACK[id.font] ?? FONT_STACK.plex;
  const radius = BUTTON_RADIUS[id.button];
  return `body[data-sf] .lak{${vars(lightPalette(STORE_PALETTE, accent))};--font-sans:${font};font-family:${font}}body[data-sf] .lak.dark{${vars(darkPalette(STORE_PALETTE, accent))}}`
    + (radius ? `body[data-sf] .lak :is(a,button).select-none.inline-flex{border-radius:${radius}}` : '');
}

/* ───────────── Store identity (BP-P03-STP-004/005) ───────────── */

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());
/** Typefaces the store can wear without a new font host: one bundled with LAK, two from the shopper's device. */
export const FONT_STACK: Record<StoreFont, string> = {
  plex: '"IBM Plex Sans Arabic",ui-sans-serif,system-ui,sans-serif',
  system: 'system-ui,-apple-system,"Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif',
  naskh: '"Noto Naskh Arabic","Geeza Pro","Traditional Arabic","Times New Roman",serif',
};
/** Button corner shape; "soft" keeps the design-system default. */
export const BUTTON_RADIUS: Record<ButtonStyle, string | null> = { soft: null, pill: '9999px', square: '4px' };

/** The identity shoppers see: the published version's, or the starting look for versions saved before identity existed. */
export const liveIdentity = (t: ThemeState): StoreIdentity => t.published.identity ?? identityFixture();

/** An uploaded picture's address, from a "m:<id>" reference. Product references ("p:") are resolved by the caller. */
export const mediaSrc = (ref: string | null | undefined, lib: MediaLib): string | undefined =>
  ref?.startsWith('m:') ? lib[ref.slice(2)]?.url : undefined;
export const productRef = (ref: string | null | undefined): string | undefined => (ref?.startsWith('p:') ? ref.slice(2) : undefined);

/** Riyadh calendar day (yyyy-mm-dd) for a timestamp. */
export const riyadhDay = (now: number) => new Date(now + 3 * 3600_000).toISOString().slice(0, 10);
/** Whether a scheduled section is on for the Riyadh day of `now` (start and end inclusive; blank = open-ended). */
export const inSchedule = (s: Pick<Section, 'start' | 'end'>, now: number) => {
  const d = riyadhDay(now);
  return (!s.start || s.start <= d) && (!s.end || d <= s.end);
};
/** The announcement bar shoppers see now: published, visible and inside its schedule. */
export function liveAnnouncement(t: ThemeState, now: number): Section | undefined {
  const a = sectionOf(t, 'announcement');
  return a && inSchedule(a, now) ? a : undefined;
}

/** Products for a product-grid section: a storefront category ("cat:<slug>") or a merchant collection ("col:<id>"). */
export function gridProducts(source: string | undefined, store: Product[], merchant: MProduct[], levels: Level[], collections: Collection[]): Product[] {
  if (source?.startsWith('cat:')) return store.filter((p) => p.cat === source.slice(4));
  if (source?.startsWith('col:')) {
    const c = collections.find((x) => x.id === source.slice(4));
    if (!c || !c.visible) return [];
    const stockOf = (p: MProduct) => (p.type === 'digital' ? null : (p.variants.length ? p.variants.map((v) => v.sku) : [p.sku]).reduce((n, sku) => n + sellable(levels, sku), 0));
    return collectionMembers(c, merchant, stockOf).map((m) => store.find((p) => p.id === m.id)).filter((p): p is Product => !!p);
  }
  return [];
}

export interface Testimonial { id: string; text: string; rating: number; author: L; productId: string; verified: boolean }
/** Real, published product reviews only (4★ and up, newest first); names masked when the merchant masks them. Never invented. */
export function testimonials(reviews: Review[], settings: Pick<ReviewSettings, 'maskNames'>, limit = 3): Testimonial[] {
  const mask = (n: string) => { const [a, ...r] = n.trim().split(/\s+/); return r.length ? `${a} ${r[r.length - 1].slice(0, 1)}.` : a; };
  return reviews.filter((r) => r.kind === 'review' && r.status === 'published' && (r.rating ?? 0) >= 4 && r.text.trim())
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
    .map((r) => ({ id: r.id, text: r.text, rating: r.rating ?? 0, productId: r.productId, verified: r.verified, author: settings.maskNames ? { ar: mask(r.author.ar), en: mask(r.author.en) } : r.author }));
}

/* ───────────── Homepage sections from the published theme ───────────── */

/** English for the merchant's fixture headings. Headings the merchant typed later are shown as written. */
const KNOWN: Record<string, L> = {
  'توصيل مجاني للطلبات من 300 ر.س في منطقة الرياض': { ar: 'توصيل مجاني للطلبات من 300 ر.س في منطقة الرياض', en: 'Free delivery on orders from SAR 300 in the Riyadh region' },
  'تشكيلة العبايات المطرّزة': { ar: 'تشكيلة العبايات المطرّزة', en: 'The embroidered abaya edit' },
  'وصل حديثًا لموسم الخريف': { ar: 'وصل حديثًا لموسم الخريف', en: 'New in for autumn' },
  'الأكثر مبيعًا': { ar: 'الأكثر مبيعًا', en: 'Best sellers' },
  'تسوّق حسب الفئة': { ar: 'تسوّق حسب الفئة', en: 'Shop by category' },
  'عروض هذا الأسبوع': { ar: 'عروض هذا الأسبوع', en: 'This week’s offers' },
  'كيف نصنع عباياتنا': { ar: 'كيف نصنع عباياتنا', en: 'How we make our abayas' },
  'كوني أول من يعرف بالجديد': { ar: 'كوني أول من يعرف بالجديد', en: 'Be the first to hear what’s new' },
};

export function headingText(heading: string, lang: Lang): string {
  return KNOWN[heading.trim()]?.[lang] ?? heading;
}

/** What the shopper sees: the published version only (never the draft), visible sections in published order. */
export function liveSections(t: ThemeState): Section[] {
  return t.published.sections.filter((s) => s.visible);
}

export const sectionOf = (t: ThemeState, kind: SectionKind): Section | undefined => liveSections(t).find((s) => s.kind === kind);
