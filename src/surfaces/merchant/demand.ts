// Shopper demand signals the storefront records for the merchant's reports: searches (with how many results the
// shopper saw), «notify me» requests on sold-out SKUs, wishlist adds/removes, and search redirects the merchant sets
// for terms that found nothing. Pure functions and seeded history; the stores live in merchant/stores.ts.
// Simulated: no shopper contact details are kept here (a notify request stores only that someone asked).
import type { L } from './domain';

/** A storefront search the shopper settled on (typed and left for a moment, or submitted). */
export interface SearchEvent { id: string; day: string; term: string; raw: string; results: number; lang: 'ar' | 'en'; seed?: boolean }
/** A shopper asked to hear when a sold-out SKU is back. `notifiedDay` once the merchant sent the back-in-stock alert. */
export interface NotifyRequest { id: string; day: string; productId: string; sku: string; state: 'waiting' | 'notified'; notifiedDay?: string; seed?: boolean }
export interface WishEvent { id: string; day: string; productId: string; kind: 'add' | 'remove'; seed?: boolean }
/** Where a search term sends shoppers when it would otherwise find nothing. */
export interface SearchRedirect { term: string; raw: string; target: { kind: 'product' | 'category'; id: string; name: L }; by: string; at: string }

export const SEARCH_CAP = 4000;
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Search terms are grouped regardless of case, diacritics, hamza/ta marbuta/alef maqsura, digits and extra spaces. */
export function normTerm(raw: string): string {
  return raw.toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

const nextId = (prefix: string, n: number) => `${prefix}-${String(n + 1).padStart(5, '0')}`;

/**
 * Record a settled search. Empty terms and an immediate repeat of the same term on the same day (the shopper
 * re-sorting or paging) are not counted twice. Returns the same list when nothing is recorded.
 */
export function addSearch(list: SearchEvent[], raw: string, results: number, day: string, lang: 'ar' | 'en'): SearchEvent[] {
  const term = normTerm(raw);
  if (!term || term.length > 80) return list;
  const last = list[list.length - 1];
  if (last && last.term === term && last.day === day && !last.seed) return list;
  return [...list, { id: nextId('SR', list.length), day, term, raw: raw.trim(), results, lang }].slice(-SEARCH_CAP);
}

/** A notify-me request on a SKU (empty SKU = any option of the product). */
export function addNotify(list: NotifyRequest[], productId: string, sku: string, day: string): NotifyRequest[] {
  return [...list, { id: nextId('NM', list.length), day, productId, sku, state: 'waiting' }];
}
/** Mark every waiting request for these SKUs as notified (the back-in-stock alert went out). */
export function markNotified(list: NotifyRequest[], skus: string[], day: string): { list: NotifyRequest[]; n: number } {
  let n = 0;
  const next = list.map((r) => (r.state === 'waiting' && skus.includes(r.sku) ? (n++, { ...r, state: 'notified' as const, notifiedDay: day }) : r));
  return { list: n ? next : list, n };
}

export function addWish(list: WishEvent[], productId: string, kind: 'add' | 'remove', day: string): WishEvent[] {
  return [...list, { id: nextId('WL', list.length), day, productId, kind }];
}

export function redirectFor(list: SearchRedirect[], raw: string): SearchRedirect | undefined {
  const t = normTerm(raw);
  return t ? list.find((r) => r.term === t) : undefined;
}
export function setRedirect(list: SearchRedirect[], r: SearchRedirect): SearchRedirect[] {
  return [...list.filter((x) => x.term !== r.term), r];
}
export const removeRedirect = (list: SearchRedirect[], term: string) => list.filter((x) => x.term !== term);

/* ---------- Seeded history (demo data; the reports label it) ---------- */

/** Deterministic pseudo-random numbers so the seeded history is the same in every session. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const DAY_MS = 86400000;
const dayBack = (from: string, n: number) => new Date(Date.parse(`${from}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);
/** Seeded history ends the day before the fixture "today" (2026-11-24). */
export const SEED_END = '2026-11-23';

/** [raw term, weight per day, results shoppers saw then, language]. Zero-result terms are real gaps in the catalogue. */
const TERMS: [string, number, number, 'ar' | 'en'][] = [
  ['عباية', 3.2, 2, 'ar'], ['عطر عود', 2.1, 2, 'ar'], ['بخور', 1.6, 1, 'ar'], ['شماغ', 1.4, 0, 'ar'], ['abaya', 1.1, 2, 'en'],
  ['حقيبة', 1.0, 2, 'ar'], ['دلة', 0.8, 1, 'ar'], ['مسك', 0.9, 0, 'ar'], ['ثوب', 0.8, 1, 'ar'], ['عسل', 0.7, 0, 'ar'],
  ['oud', 0.6, 2, 'en'], ['عباية اطفال', 0.55, 0, 'ar'], ['قميص كتان', 0.5, 1, 'ar'], ['ساعة', 0.45, 0, 'ar'], ['سجادة صلاة', 0.4, 1, 'ar'],
  ['مبخرة', 0.35, 1, 'ar'], ['طرحة', 0.35, 0, 'ar'], ['perfume', 0.3, 2, 'en'], ['بطاقة هدية', 0.25, 1, 'ar'], ['jalabiya', 0.2, 0, 'en'],
];

export function searchFixtures(days = 150): SearchEvent[] {
  const r = rng(41);
  const out: SearchEvent[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = dayBack(SEED_END, d);
    const season = 1 + 0.35 * Math.sin(d / 9);
    for (const [raw, w, results, lang] of TERMS) {
      const n = Math.floor(w * season + r());
      for (let i = 0; i < n; i++) out.push({ id: nextId('SR', out.length), day, term: normTerm(raw), raw, results, lang, seed: true });
    }
  }
  return out;
}

/** Notify-me requests on SKUs that sold out recently (some still waiting, older ones already alerted). */
export function notifyFixtures(): NotifyRequest[] {
  const spec: [string, string, number, number][] = [
    // productId, SKU, requests, of which already notified
    ['p1', 'ABY-LIN-BLA-M', 14, 5], ['p3', 'OUD-100', 9, 0], ['p6', 'COF-SET-01', 6, 0], ['p2', 'SHL-SLK-01', 4, 4], ['p13', 'OUD-ROY-50', 3, 0],
  ];
  const r = rng(77);
  const out: NotifyRequest[] = [];
  for (const [productId, sku, n, done] of spec) {
    for (let i = 0; i < n; i++) {
      const day = dayBack(SEED_END, Math.floor(r() * 75));
      const notified = i < done;
      out.push({ id: nextId('NM', out.length), day, productId, sku, state: notified ? 'notified' : 'waiting', notifiedDay: notified ? dayBack(SEED_END, Math.floor(r() * 10)) : undefined, seed: true });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Wishlist adds and removes over the last months. */
export function wishFixtures(): WishEvent[] {
  const spec: [string, number, number][] = [['p4', 22, 4], ['p1', 18, 3], ['p13', 15, 2], ['p17', 11, 2], ['p6', 9, 1], ['p3', 8, 3], ['p15', 6, 1], ['p18', 5, 0], ['p2', 4, 1]];
  const r = rng(9);
  const out: WishEvent[] = [];
  for (const [productId, adds, removes] of spec) {
    for (let i = 0; i < adds; i++) out.push({ id: '', day: dayBack(SEED_END, Math.floor(r() * 120)), productId, kind: 'add', seed: true });
    for (let i = 0; i < removes; i++) out.push({ id: '', day: dayBack(SEED_END, Math.floor(r() * 60)), productId, kind: 'remove', seed: true });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day)).map((e, i) => ({ ...e, id: nextId('WL', i) }));
}
