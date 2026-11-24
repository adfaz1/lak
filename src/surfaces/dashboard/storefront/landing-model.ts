// Landing pages (`#/dashboard/storefront/landing`): campaign pages built from blocks, tied to an offer, coupon or
// collection, with their own address, SEO, share card and a publish window. Pure rules only (no React, no stores).
// The shopper store serves a page at #/store/lp/<slug> only while it is published and inside its window.
import type { L } from '../../../core/lang';
import type { Coupon } from '../../merchant/growth';
import type { Order } from '../../merchant/domain';
import { total } from '../../merchant/domain';
import { RESERVED_SLUGS, SLUG_MAX } from './content';

/* ---------- Riyadh times ---------- */

/** "yyyy-mm-ddThh:mm" in Riyadh time (UTC+3, no daylight saving) → epoch ms; NaN when malformed. */
export const riyadhMs = (s: string | null | undefined): number => (s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? Date.parse(`${s}:00+03:00`) : Number.NaN);
/** Epoch ms → "yyyy-mm-ddThh:mm" Riyadh. */
export const toRiyadh = (ms: number): string => new Date(ms + 3 * 3600_000).toISOString().slice(0, 16);
/** The end of a coupon's last day (coupons end on a Riyadh day, inclusive). */
export const couponEndMs = (c: Pick<Coupon, 'ends'>): number => (c.ends ? Date.parse(`${c.ends}T23:59:59+03:00`) : Number.NaN);

/* ---------- Blocks ---------- */

export type LpKind = 'hero' | 'products' | 'countdown' | 'coupon' | 'faq' | 'interest';
export const LP_KINDS: LpKind[] = ['hero', 'products', 'countdown', 'coupon', 'faq', 'interest'];
/** Kinds that can appear once per page. */
export const LP_SINGLE: LpKind[] = ['hero', 'countdown', 'coupon', 'interest'];
export interface FaqItem { q: L; a: L }
export interface LpBlock {
  id: string; kind: LpKind; heading: L;
  /** Hero and interest form: a short line under the heading. */
  body?: L;
  /** Hero picture: "p:<productId>" or "m:<mediaId>". */
  image?: string;
  /** Hero button text. */
  cta?: L;
  /** Product picks: the linked collection ("linked"), or hand-picked product ids. */
  pick?: 'linked' | 'manual'; productIds?: string[];
  /** Countdown: its own end ("yyyy-mm-ddThh:mm" Riyadh), or empty to follow the linked offer's end. */
  until?: string;
  faq?: FaqItem[];
}
export const BLOCK_MAX = 12;
export const FAQ_MAX = 8;
export const LP_HEADING_MAX = 70;
export const LP_BODY_MAX = 200;

/* ---------- Page ---------- */

export type LpLink = { kind: 'none' } | { kind: 'coupon'; code: string } | { kind: 'offer'; code: string } | { kind: 'collection'; id: string };
export interface LpContent { blocks: LpBlock[]; seo: { title: L; desc: L }; share: { image?: string } }
export interface LandingPage {
  id: string; name: string; slug: string;
  link: LpLink;
  draft: LpContent;
  /** What shoppers see; null until first published. */
  live: LpContent | null;
  /** The merchant's intent: on = served inside the window; off = unpublished (live copy kept). */
  on: boolean;
  /** Publish window, Riyadh "yyyy-mm-ddThh:mm"; empty = from now / no end. */
  start: string; end: string;
  /** utm_campaign used in share links and to attribute orders. */
  utm: string;
  updatedAt: string; by: string;
  /** Simulated visits before this session (labelled in the UI). */
  baseVisits?: number;
}

export type LpState = 'draft' | 'scheduled' | 'live' | 'ended' | 'off';
export function lpState(p: LandingPage, now: number): LpState {
  if (!p.live) return 'draft';
  if (!p.on) return 'off';
  const s = riyadhMs(p.start), e = riyadhMs(p.end);
  if (!Number.isNaN(s) && now < s) return 'scheduled';
  if (!Number.isNaN(e) && now >= e) return 'ended';
  return 'live';
}
export const lpServed = (p: LandingPage, now: number) => lpState(p, now) === 'live';
export const lpHasEdits = (p: LandingPage) => !!p.live && JSON.stringify(p.live) !== JSON.stringify(p.draft);
/** The served page for a slug, else undefined. */
export const servedLanding = (pages: LandingPage[], slug: string | undefined, now: number) => pages.find((p) => p.slug === slug && lpServed(p, now));

/* ---------- Linked offer ---------- */

/** The coupon or automatic offer a page is tied to. */
export function linkedCoupon(p: Pick<LandingPage, 'link'>, coupons: Coupon[]): Coupon | undefined {
  return p.link.kind === 'coupon' || p.link.kind === 'offer' ? coupons.find((c) => c.code === (p.link as { code: string }).code) : undefined;
}
/** When the countdown ends: its own time, else the linked offer's last day, else the page's end. */
export function countdownEnd(b: LpBlock, p: Pick<LandingPage, 'link' | 'end'>, coupons: Coupon[]): number {
  const own = riyadhMs(b.until);
  if (!Number.isNaN(own)) return own;
  const c = linkedCoupon(p, coupons);
  if (c?.ends) return couponEndMs(c);
  return riyadhMs(p.end);
}
export const remaining = (end: number, now: number) => {
  const ms = Math.max(0, end - now);
  return { d: Math.floor(ms / 86_400_000), h: Math.floor((ms / 3_600_000) % 24), m: Math.floor((ms / 60_000) % 60), s: Math.floor((ms / 1000) % 60), over: ms === 0 };
};
/** Whether a shopper typing the code today would have it accepted (status, dates and total limit). */
export function couponUsable(c: Coupon, now: number): 'ok' | 'draft' | 'paused' | 'expired' | 'notStarted' | 'limit' {
  const day = toRiyadh(now).slice(0, 10);
  if (c.status === 'draft') return 'draft';
  if (c.status === 'paused') return 'paused';
  if (c.status === 'expired' || (c.ends && day > c.ends)) return 'expired';
  if (day < c.starts) return 'notStarted';
  if (c.limitTotal !== null && c.used >= c.limitTotal) return 'limit';
  return 'ok';
}

/* ---------- Validation ---------- */

export type LpSlugIssue = 'empty' | 'format' | 'reserved' | 'taken' | null;
export function lpSlugIssue(slug: string, pages: LandingPage[], selfId?: string): LpSlugIssue {
  if (!slug) return 'empty';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > SLUG_MAX) return 'format';
  if (RESERVED_SLUGS.includes(slug)) return 'reserved';
  if (pages.some((p) => p.slug === slug && p.id !== selfId)) return 'taken';
  return null;
}
export type BlockIssue = 'heading' | 'long' | 'noProducts' | 'noEnd' | 'endPast' | 'noCoupon' | 'faq' | 'image';
export interface LpCtx {
  coupons: Coupon[];
  collections: { id: string; productIds: string[] }[];
  /** Products sold online (status active + online channel). */
  liveProducts: string[];
  langs: { ar: boolean; en: boolean };
  now: number;
}
const need = (x: L | undefined, langs: LpCtx['langs']) => (langs.ar && !(x?.ar ?? '').trim()) || (langs.en && !(x?.en ?? '').trim());
/** Products a "products" block shows, in order, skipping any not sold online. */
export function blockProducts(b: LpBlock, p: Pick<LandingPage, 'link'>, ctx: Pick<LpCtx, 'collections' | 'liveProducts'>): string[] {
  const ids = b.pick === 'linked' && p.link.kind === 'collection' ? ctx.collections.find((c) => c.id === (p.link as { id: string }).id)?.productIds ?? [] : b.productIds ?? [];
  return ids.filter((id) => ctx.liveProducts.includes(id));
}
export function blockIssue(b: LpBlock, p: LandingPage, ctx: LpCtx): BlockIssue | null {
  if (need(b.heading, ctx.langs)) return 'heading';
  if (b.heading.ar.length > LP_HEADING_MAX || b.heading.en.length > LP_HEADING_MAX || (b.body && (b.body.ar.length > LP_BODY_MAX || b.body.en.length > LP_BODY_MAX))) return 'long';
  if (b.kind === 'products' && !blockProducts(b, p, ctx).length) return 'noProducts';
  if (b.kind === 'countdown') {
    const end = countdownEnd(b, p, ctx.coupons);
    if (Number.isNaN(end)) return 'noEnd';
    const from = Math.max(ctx.now, riyadhMs(p.start) || 0);
    if (end <= from) return 'endPast';
  }
  if (b.kind === 'coupon' && !linkedCoupon(p, ctx.coupons)) return 'noCoupon';
  if (b.kind === 'coupon' && linkedCoupon(p, ctx.coupons)?.auto) return 'noCoupon';
  if (b.kind === 'faq' && (!b.faq?.length || b.faq.some((f) => need(f.q, ctx.langs) || need(f.a, ctx.langs)))) return 'faq';
  return null;
}
export type LpError = 'name' | 'slug' | 'blocks' | 'block' | 'window' | 'link';
/** What blocks publishing. */
export function lpErrors(p: LandingPage, pages: LandingPage[], ctx: LpCtx): { errors: LpError[]; slug: LpSlugIssue; blocks: Record<string, BlockIssue> } {
  const errors: LpError[] = [];
  const blocks: Record<string, BlockIssue> = {};
  if (!p.name.trim()) errors.push('name');
  const slug = lpSlugIssue(p.slug, pages, p.id);
  if (slug) errors.push('slug');
  if (!p.draft.blocks.length) errors.push('blocks');
  for (const b of p.draft.blocks) { const i = blockIssue(b, p, ctx); if (i) blocks[b.id] = i; }
  if (Object.keys(blocks).length) errors.push('block');
  const s = riyadhMs(p.start), e = riyadhMs(p.end);
  if ((p.start && Number.isNaN(s)) || (p.end && Number.isNaN(e)) || (!Number.isNaN(s) && !Number.isNaN(e) && e <= s) || (!Number.isNaN(e) && e <= ctx.now)) errors.push('window');
  if ((p.link.kind === 'coupon' || p.link.kind === 'offer') && !linkedCoupon(p, ctx.coupons)) errors.push('link');
  if (p.link.kind === 'collection' && !ctx.collections.some((c) => c.id === (p.link as { id: string }).id)) errors.push('link');
  return { errors, slug, blocks };
}
export type LpWarning = 'couponDraft' | 'couponPaused' | 'couponExpired' | 'couponLimit' | 'couponEndsFirst' | 'couponNotStarted' | 'noEnd' | 'hiddenProducts';
/** Things that do not block publishing but change what shoppers get. */
export function lpWarnings(p: LandingPage, ctx: LpCtx): LpWarning[] {
  const out: LpWarning[] = [];
  const c = linkedCoupon(p, ctx.coupons);
  if (c) {
    const u = couponUsable(c, Math.max(ctx.now, riyadhMs(p.start) || 0));
    if (u === 'draft') out.push('couponDraft');
    if (u === 'paused') out.push('couponPaused');
    if (u === 'expired') out.push('couponExpired');
    if (u === 'limit') out.push('couponLimit');
    if (u === 'notStarted') out.push('couponNotStarted');
    const e = riyadhMs(p.end);
    if (c.ends && (Number.isNaN(e) || couponEndMs(c) < e - 60_000)) out.push('couponEndsFirst');
  }
  if (!p.end) out.push('noEnd');
  const hidden = p.draft.blocks.some((b) => b.kind === 'products' && (b.pick === 'manual' ? (b.productIds ?? []) : ctx.collections.find((x) => p.link.kind === 'collection' && x.id === p.link.id)?.productIds ?? []).some((id) => !ctx.liveProducts.includes(id)));
  if (hidden) out.push('hiddenProducts');
  return out;
}

/* ---------- Editing ---------- */

let seq = 0;
export const blockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;
export function newBlock(kind: LpKind, linkKind: LpLink['kind']): LpBlock {
  const base = { id: blockId(), kind };
  switch (kind) {
    case 'hero': return { ...base, heading: { ar: '', en: '' }, body: { ar: '', en: '' }, cta: { ar: 'تسوّق العرض', en: 'Shop the offer' } };
    case 'products': return { ...base, heading: { ar: 'اختياراتنا لك', en: 'Our picks for you' }, pick: linkKind === 'collection' ? 'linked' : 'manual', productIds: [] };
    case 'countdown': return { ...base, heading: { ar: 'ينتهي العرض خلال', en: 'Offer ends in' }, until: '' };
    case 'coupon': return { ...base, heading: { ar: 'اكشف كود الخصم', en: 'Reveal your code' } };
    case 'faq': return { ...base, heading: { ar: 'أسئلة شائعة', en: 'Questions' }, faq: [{ q: { ar: '', en: '' }, a: { ar: '', en: '' } }] };
    case 'interest': return { ...base, heading: { ar: 'نبّهني عند بدء العرض', en: 'Tell me when it starts' }, body: { ar: 'اترك بريدك أو جوالك ونرسل لك تذكيرًا.', en: 'Leave your email or mobile and we will remind you.' } };
  }
}
export const canAdd = (blocks: LpBlock[], kind: LpKind) => blocks.length < BLOCK_MAX && !(LP_SINGLE.includes(kind) && blocks.some((b) => b.kind === kind));
export function moveBlock(blocks: LpBlock[], id: string, dir: -1 | 1): LpBlock[] {
  const i = blocks.findIndex((b) => b.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const out = [...blocks];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
export function newLanding(pages: LandingPage[], now: string, by: string, from?: { start?: string; end?: string; name?: string; link?: LpLink }): LandingPage {
  let n = pages.length + 1;
  while (pages.some((p) => p.id === `lp${n}` || p.slug === `campaign-${n}`)) n++;
  const link = from?.link ?? { kind: 'none' };
  const blocks = [newBlock('hero', link.kind), newBlock('products', link.kind)];
  if (link.kind === 'coupon') blocks.push(newBlock('coupon', link.kind));
  return {
    id: `lp${n}`, name: from?.name ?? '', slug: `campaign-${n}`, link, on: false, start: from?.start ?? '', end: from?.end ?? '', utm: `campaign-${n}`,
    draft: { blocks, seo: { title: { ar: '', en: '' }, desc: { ar: '', en: '' } }, share: {} }, live: null, updatedAt: now, by,
  };
}
export const publishLanding = (p: LandingPage, now: string, by: string): LandingPage => ({ ...p, live: JSON.parse(JSON.stringify(p.draft)) as LpContent, on: true, updatedAt: now, by });
export const unpublishLanding = (p: LandingPage, now: string, by: string): LandingPage => ({ ...p, on: false, updatedAt: now, by });
export const discardLandingDraft = (p: LandingPage): LandingPage => (p.live ? { ...p, draft: JSON.parse(JSON.stringify(p.live)) as LpContent } : p);

/* ---------- Share links and results ---------- */

export const UTM_SOURCES = ['whatsapp', 'instagram', 'snapchat', 'x', 'tiktok', 'sms', 'email'] as const;
export type UtmSource = (typeof UTM_SOURCES)[number];
export const utmCampaign = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export function shareUrl(base: string, p: Pick<LandingPage, 'slug' | 'utm'>, source: UtmSource): string {
  const medium = source === 'sms' || source === 'email' ? source : 'social';
  return `${base}/lp/${p.slug}?utm_source=${source}&utm_medium=${medium}&utm_campaign=${encodeURIComponent(p.utm || p.slug)}`;
}

/** Where a shopper's order came from: the landing page they arrived on in the same session (UTM touch). */
export interface LpTouch { slug: string; utm: string; source: string; at: number }
export const TOUCH_DAYS = 7;
export interface LpResult { visits: number; sessionVisits: number; interest: number; orders: number; revenue: number; byCoupon: number; byVisit: number; conversion: number | null; refs: string[] }
/**
 * Results of one page: visits (simulated base + this session's), interest sign-ups, and orders from the merchant's order
 * book attributed to it — orders that used its coupon while it was live, or that came after a visit to it
 * (`attribution`: order ref → slug). Each order counts once; failed and cancelled orders are not counted.
 */
export function lpResults(p: LandingPage, orders: Order[], attribution: Record<string, string>, stats: { visits: number; interest: number } | undefined): LpResult {
  const code = p.link.kind === 'coupon' ? p.link.code : null;
  const ok = (o: Order) => o.pay !== 'failed' && !o.cancelled;
  let byCoupon = 0, byVisit = 0, revenue = 0;
  const refs: string[] = [];
  for (const o of orders) {
    if (!ok(o)) continue;
    const visit = attribution[o.ref] === p.slug;
    const coupon = !!code && o.coupon === code;
    if (!visit && !coupon) continue;
    if (visit) byVisit++; else byCoupon++;
    revenue += total(o);
    refs.push(o.ref);
  }
  const sessionVisits = stats?.visits ?? 0;
  const visits = (p.baseVisits ?? 0) + sessionVisits;
  const n = refs.length;
  return { visits, sessionVisits, interest: stats?.interest ?? 0, orders: n, revenue, byCoupon, byVisit, conversion: visits ? Math.round((n / visits) * 1000) / 10 : null, refs };
}

/* ---------- Fixtures ---------- */

export function landingFixtures(): LandingPage[] {
  const by = 'سارة';
  return [
    {
      id: 'lp1', name: 'الجمعة البيضاء · شحن مجاني', slug: 'white-friday', utm: 'white-friday', on: true, start: '2026-11-20T00:00', end: '2026-12-01T00:00',
      link: { kind: 'coupon', code: 'SHIPFREE' }, baseVisits: 1240, updatedAt: '2026-11-19T09:30:00.000Z', by,
      draft: {
        blocks: [
          { id: 'h1', kind: 'hero', heading: { ar: 'الجمعة البيضاء: الشحن علينا', en: 'White Friday: shipping is on us' }, body: { ar: 'شحن مجاني للطلبات من 300 ر.س حتى نهاية نوفمبر.', en: 'Free shipping on orders from SAR 300 until the end of November.' }, image: 'p:p1', cta: { ar: 'تسوّق الآن', en: 'Shop now' } },
          { id: 'h2', kind: 'countdown', heading: { ar: 'ينتهي العرض خلال', en: 'Offer ends in' }, until: '' },
          { id: 'h3', kind: 'coupon', heading: { ar: 'اكشف كود الشحن المجاني', en: 'Reveal the free-shipping code' } },
          { id: 'h4', kind: 'products', heading: { ar: 'الأكثر طلبًا هذا الموسم', en: 'Most wanted this season' }, pick: 'manual', productIds: ['p1', 'p2', 'p3', 'p4'] },
          { id: 'h5', kind: 'faq', heading: { ar: 'أسئلة شائعة', en: 'Questions' }, faq: [
            { q: { ar: 'هل الشحن المجاني لكل المدن؟', en: 'Is free shipping for every city?' }, a: { ar: 'نعم، لكل مناطق الشحن المفعّلة في المتجر.', en: 'Yes, for every shipping zone the store serves.' } },
            { q: { ar: 'هل أجمع الكود مع عرض آخر؟', en: 'Can I combine the code with another offer?' }, a: { ar: 'كود واحد لكل طلب.', en: 'One code per order.' } },
          ] },
        ],
        seo: { title: { ar: 'الجمعة البيضاء | شحن مجاني', en: 'White Friday | Free shipping' }, desc: { ar: 'شحن مجاني للطلبات من 300 ر.س حتى نهاية نوفمبر.', en: 'Free shipping on orders from SAR 300 until the end of November.' } },
        share: { image: 'p:p1' },
      },
      live: null,
    },
    {
      id: 'lp2', name: 'رمضان 2027', slug: 'ramadan', utm: 'ramadan-2027', on: false, start: '2027-02-01T00:00', end: '2027-03-12T00:00',
      link: { kind: 'coupon', code: 'RAMADAN15' }, updatedAt: '2026-11-22T12:10:00.000Z', by,
      draft: {
        blocks: [
          { id: 'r1', kind: 'hero', heading: { ar: 'رمضان كريم', en: 'Ramadan Kareem' }, body: { ar: 'هدايا رمضان والعيد بخصم 15٪.', en: 'Ramadan and Eid gifts at 15% off.' }, image: 'p:p2', cta: { ar: 'اختر هديتك', en: 'Choose your gift' } },
          { id: 'r2', kind: 'interest', heading: { ar: 'نبّهني عند بدء العرض', en: 'Tell me when it starts' }, body: { ar: 'اترك بريدك أو جوالك ونرسل لك تذكيرًا.', en: 'Leave your email or mobile and we will remind you.' } },
        ],
        seo: { title: { ar: '', en: '' }, desc: { ar: '', en: '' } }, share: {},
      },
    },
  ].map((p) => (p.id === 'lp1' ? { ...p, live: JSON.parse(JSON.stringify(p.draft)) as LpContent } : { ...p, live: null })) as LandingPage[];
}
