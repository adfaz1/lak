// Ads and tracking (Phase D, channels group): tracking IDs per ad platform, a product catalogue feed, a campaign
// planner and results attributed from the store's own orders by UTM. Pure rules, no React.
// Simulated: every connection, test event, feed fetch, platform review and delivery number (impressions, clicks,
// spend). Real: orders and revenue come from the order list (orders that carry the campaign's UTM tags).
// Not decided by LAK: managed-ads fees and any ad credit (shown as «بانتظار الاعتماد»). The budget is the merchant's.
import type { L, Order } from './domain';
import { normaliseDigits, type Product } from './catalog';

export type AdPlatform = 'snap' | 'tiktok' | 'meta' | 'google' | 'x';
export const AD_PLATFORMS: AdPlatform[] = ['snap', 'tiktok', 'meta', 'google', 'x'];
export const PLATFORM_NAME: Record<AdPlatform, L> = {
  snap: { ar: 'سناب شات', en: 'Snapchat' }, tiktok: { ar: 'تيك توك', en: 'TikTok' }, meta: { ar: 'ميتا (فيسبوك وإنستغرام)', en: 'Meta (Facebook & Instagram)' },
  google: { ar: 'جوجل ويوتيوب', en: 'Google & YouTube' }, x: { ar: 'إكس', en: 'X' },
};

/* ---------- Tracking IDs ---------- */

/** Expected shape of each platform's ID, with an example of the shape (not a real ID). */
export const ID_FORMAT: Record<AdPlatform, { re: RegExp; example: string; label: L }> = {
  snap: { re: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', label: { ar: 'معرّف بكسل سناب (UUID)', en: 'Snap Pixel ID (UUID)' } },
  tiktok: { re: /^[A-Z0-9]{20}$/, example: 'C0XXXXXXXXXXXXXXXXXX', label: { ar: 'معرّف بكسل تيك توك (20 خانة)', en: 'TikTok Pixel ID (20 characters)' } },
  meta: { re: /^\d{15,16}$/, example: '1234567890xxxxx', label: { ar: 'معرّف بكسل ميتا (15–16 رقمًا)', en: 'Meta Pixel ID (15–16 digits)' } },
  google: { re: /^(G-[A-Z0-9]{6,12}|AW-\d{9,11})$/, example: 'G-XXXXXXXXXX / AW-123456789', label: { ar: 'معرّف Google ‏(G- أو AW-)', en: 'Google tag ID (G- or AW-)' } },
  x: { re: /^[a-z0-9]{5,6}$/, example: 'o1xxx', label: { ar: 'معرّف بكسل إكس (5–6 خانات)', en: 'X Pixel ID (5–6 characters)' } },
};

/** Trim, convert Arabic digits, and fix the case each platform uses. */
export function cleanId(p: AdPlatform, raw: string): string {
  const s = normaliseDigits(raw).replace(/\s+/g, '');
  return p === 'tiktok' || p === 'google' ? s.toUpperCase() : p === 'snap' || p === 'x' ? s.toLowerCase() : s;
}
export const checkPixel = (p: AdPlatform, raw: string): 'required' | 'format' | null => {
  const s = cleanId(p, raw);
  return !s ? 'required' : ID_FORMAT[p].re.test(s) ? null : 'format';
};
/** Server-side (Conversions API) token: optional; when given, at least 20 characters with no spaces. */
export const checkToken = (raw: string): 'format' | null => { const s = raw.trim(); return !s ? null : s.length >= 20 && !/\s/.test(s) ? null : 'format'; };
/** Show a secret as its last 4 characters only. */
export const maskToken = (s: string) => (s ? `•••• ${s.slice(-4)}` : '');

export type ConnState = 'off' | 'checking' | 'connected' | 'failed';
export interface Tracking {
  pixel: string; token: string; state: ConnState;
  /** Last test or live event the platform answered for (simulated). */
  lastEvent?: { name: string; at: number };
  error?: string; by?: string; at?: number;
}
export const emptyTracking = (): Tracking => ({ pixel: '', token: '', state: 'off' });

/** Store events sent to every connected platform; Purchase carries an event id so browser + server copies dedupe. */
export const EVENTS = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'] as const;

/* ---------- Catalogue feed ---------- */

export interface Feed { token: string; on: boolean; rotatedAt: number; by: string; fetches: number }
export type FeedExclusion = 'inactive' | 'noPhoto' | 'noStock' | 'noDesc' | 'digital';
/** Why a product is left out of the feed (platforms reject items without a photo, price, stock or description). */
export function feedExclusion(p: Product, stock: number | null, hasPhoto: boolean): FeedExclusion | null {
  if (p.status !== 'active') return 'inactive';
  if (p.type === 'digital' || p.type === 'code') return 'digital';
  if (!hasPhoto) return 'noPhoto';
  if (stock !== null && stock <= 0) return 'noStock';
  if ((p.desc.en || p.desc.ar).trim().length < 20) return 'noDesc';
  return null;
}
/** Simulated host (.test is a reserved, never-real domain). The token is the only thing that protects the feed. */
export const feedUrl = (store: string, f: Feed, platform: AdPlatform | 'all' = 'all') => `https://feeds.lak.test/${store}/${platform}.xml?key=${f.token}`;
/** A new random token: the previous URL stops working at once. */
export function newToken(rand: () => number = Math.random): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 24 }, () => abc[Math.floor(rand() * abc.length)]).join('');
}

/* ---------- UTM ---------- */

export interface Utm { source: string; medium: string; campaign: string }
/** UTM values: lower-case letters, digits, dash and underscore (Arabic is allowed but discouraged in URLs). */
export const slugUtm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9؀-ۿ_-]/g, '').slice(0, 60);
export const checkUtm = (u: Utm): (keyof Utm)[] => (['source', 'medium', 'campaign'] as (keyof Utm)[]).filter((k) => !slugUtm(u[k]));
export function utmUrl(base: string, u: Utm): string {
  const q = new URLSearchParams({ utm_source: slugUtm(u.source), utm_medium: slugUtm(u.medium), utm_campaign: slugUtm(u.campaign) });
  return `${base}${base.includes('?') ? '&' : '?'}${q.toString()}`;
}
export const PLATFORM_SOURCE: Record<AdPlatform, string> = { snap: 'snapchat', tiktok: 'tiktok', meta: 'meta', google: 'google', x: 'x' };

/** Orders that arrived with these UTM tags (campaign must match; source when given). */
export const ordersFor = (orders: Order[], campaign: string, source?: string) =>
  orders.filter((o) => o.utm && o.utm.campaign === campaign && (!source || o.utm.source === source));

/* ---------- Campaigns ---------- */

export type Objective = 'sales' | 'traffic' | 'awareness' | 'retarget';
export const OBJECTIVES: Objective[] = ['sales', 'traffic', 'awareness', 'retarget'];
export type CampaignStatus = 'draft' | 'review' | 'live' | 'paused' | 'rejected' | 'ended';
export interface Campaign {
  id: string; name: string; objective: Objective; platforms: AdPlatform[];
  /** 'all' = platform targeting in Saudi Arabia; otherwise a saved customer segment id (consented customers only). */
  audience: string;
  budget: { kind: 'daily' | 'total'; amount: number };
  start: string; end: string;
  productIds: string[]; headline: string; text: string;
  utm: string;
  status: CampaignStatus; by: string; at: number;
  launchedAt?: number; reason?: string;
}
export const HEADLINE_MAX = 30;
export const TEXT_MAX = 90;
export const nextCampaignId = (list: Campaign[]) => `AD-${list.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 100) + 1}`;

export type CampaignField = 'name' | 'platforms' | 'budget' | 'start' | 'end' | 'products' | 'headline' | 'text' | 'audience';
export type CampaignError = 'required' | 'notConnected' | 'amount' | 'past' | 'order' | 'long' | 'empty';
const DAY = 86_400_000;
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
/** Days the campaign runs, both ends included. */
export const runDays = (c: Pick<Campaign, 'start' | 'end'>) => (dayOf(c.end) >= dayOf(c.start) ? Math.round((dayOf(c.end) - dayOf(c.start)) / DAY) + 1 : 0);
/** Most the merchant can spend: daily × days, or the total. */
export const maxSpend = (c: Pick<Campaign, 'budget' | 'start' | 'end'>) => (c.budget.kind === 'daily' ? c.budget.amount * runDays(c) : c.budget.amount);

export function checkCampaign(c: Campaign, connected: AdPlatform[], today: string, audienceSize: number | null): Partial<Record<CampaignField, CampaignError>> {
  const e: Partial<Record<CampaignField, CampaignError>> = {};
  if (!c.name.trim()) e.name = 'required';
  if (!c.platforms.length) e.platforms = 'required';
  else if (c.platforms.some((p) => !connected.includes(p))) e.platforms = 'notConnected';
  if (!Number.isInteger(c.budget.amount) || c.budget.amount <= 0) e.budget = 'amount';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.start)) e.start = 'required'; else if (c.start < today) e.start = 'past';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.end)) e.end = 'required'; else if (!e.start && c.end < c.start) e.end = 'order';
  if (!c.productIds.length) e.products = 'required';
  if (!c.headline.trim()) e.headline = 'required'; else if (c.headline.trim().length > HEADLINE_MAX) e.headline = 'long';
  if (c.text.trim().length > TEXT_MAX) e.text = 'long';
  if (c.audience !== 'all' && audienceSize === 0) e.audience = 'empty';
  return e;
}

/** Status the campaign shows today: a live campaign past its end date has ended. */
export const campaignState = (c: Campaign, today: string): CampaignStatus => ((c.status === 'live' || c.status === 'paused') && c.end < today ? 'ended' : c.status);

/**
 * Simulated delivery so the results view can be read: deterministic from budget and days elapsed. Never shown
 * without the «محاكاة» label; real numbers come from the platforms once connected for real.
 */
export function simulatedDelivery(c: Campaign, today: string) {
  if (!c.launchedAt || c.status === 'draft' || c.status === 'review' || c.status === 'rejected') return { impressions: 0, clicks: 0, spend: 0, days: 0 };
  const total = runDays(c);
  const days = Math.max(0, Math.min(total, Math.round((dayOf(today) - dayOf(c.start)) / DAY) + 1));
  const spend = c.budget.kind === 'daily' ? c.budget.amount * days : total ? Math.round((c.budget.amount * days) / total) : 0;
  const impressions = Math.round(spend / 100 * 120);
  return { impressions, clicks: Math.round(impressions * 0.011), spend, days };
}

/** Results from real orders tagged with the campaign's UTM: orders, revenue (net of confirmed refunds), ROAS on spend. */
export function attribution(c: Campaign, orders: Order[], spend: number) {
  const mine = ordersFor(orders, c.utm).filter((o) => o.pay !== 'failed');
  const revenue = mine.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty * i.unit, 0) - (o.discount ?? 0) + o.fee - o.refunds.filter((r) => r.status === 'confirmed').reduce((a, r) => a + r.amount, 0), 0);
  const bySource = AD_PLATFORMS.map((p) => ({ p, orders: mine.filter((o) => o.utm?.source === PLATFORM_SOURCE[p]).length }));
  return { orders: mine.length, revenue, roas: spend ? Math.round((revenue / spend) * 100) / 100 : null, bySource, refs: mine.map((o) => o.ref) };
}

/** The campaign tag used in UTM links: stable, readable, unique per campaign. */
export const campaignUtm = (name: string, id: string) => `${slugUtm(name).replace(/[^a-z0-9_-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'campaign'}-${id.toLowerCase()}`;
