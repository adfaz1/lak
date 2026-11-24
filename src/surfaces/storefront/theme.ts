/* Merchant brand for the storefront: the shop wears the merchant's colours and homepage sections, not LAK's.
   Colours come from the store palette the merchant's "Online store" editor previews (dashboard/storefront/model.ts);
   sections, their order, visibility and headings come from the merchant's published theme (merchant/workspace.ts).
   Pure functions only. */
import type { L, Lang } from '../../core/lang';
import type { Section, SectionKind, ThemeState } from '../merchant/workspace';
import { STORE_PALETTE } from '../dashboard/storefront/model';

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
export function lightPalette(p = STORE_PALETTE): Palette {
  return { accent: p.accent, bg: p.bg, surface: p.paper, surface2: p.sand, border: p.line, fg: p.ink, muted: p.muted, subtle: '#8f8478' };
}
/** A warm dark counterpart built from the same ink and accent, for shoppers who prefer dark mode. */
export function darkPalette(p = STORE_PALETTE): Palette {
  const ink = toRgb(p.ink);
  return {
    accent: p.accent,
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
export function storeCss(): string {
  return `body[data-sf] .lak{${vars(lightPalette())}}body[data-sf] .lak.dark{${vars(darkPalette())}}`;
}

/* ───────────── Homepage sections from the published theme ───────────── */

/** English for the merchant's fixture headings. Headings the merchant typed later are shown as written. */
const KNOWN: Record<string, L> = {
  'توصيل مجاني للطلبات من 300 ر.س داخل المملكة': { ar: 'توصيل مجاني للطلبات من 300 ر.س داخل المملكة', en: 'Free delivery on orders from SAR 300 across Saudi Arabia' },
  'تشكيلة العبايات المطرّزة': { ar: 'تشكيلة العبايات المطرّزة', en: 'The embroidered abaya edit' },
  'وصل حديثًا لموسم الخريف': { ar: 'وصل حديثًا لموسم الخريف', en: 'New in for autumn' },
  'الأكثر مبيعًا': { ar: 'الأكثر مبيعًا', en: 'Best sellers' },
  'تسوّقي حسب الفئة': { ar: 'تسوّقي حسب الفئة', en: 'Shop by category' },
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
