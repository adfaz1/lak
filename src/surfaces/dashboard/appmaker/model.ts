// App Maker screen model: pure rules for the dashboard section. Business rules (eligibility, layout edits,
// config vs binary changes, readiness and the release pipeline) live in `surfaces/appmaker/domain.ts` and are
// reused here, never forked. This file adds what the screens show: routes, the app catalogue read from the
// store, colour checks, what a publish will submit, and release grouping.
import type { L, Lang } from '../../../core/lang';
import type { Tone } from '../../../ds/ui';
import type { Product } from '../../merchant/catalog';
import { skusOf } from '../../merchant/catalog';
import { totalAvailable, type Level } from '../../merchant/inventory';
import { can, canSee, type Role } from '../../merchant/perms';
import type { Order } from '../../merchant/domain';
import { productPhoto } from '../model/media';
import {
  PLATFORMS, classifyChange, configUpdateBlock, createRelease, eligibility, isActive, liveConfig, liveVersion, nextVersion, readiness,
  type Accounts, type Addon, type AppConfig, type ChangeSet, type ConfigBlock, type IssueCode, type Listing, type PState, type Plan,
  type Platform, type Release, type SectionType,
} from '../../appmaker/domain';

/* ---------- Routes ---------- */

export type PageId = 'overview' | 'design' | 'listing' | 'accounts' | 'publish' | 'releases';
export const TABS: PageId[] = ['overview', 'design', 'listing', 'accounts', 'releases'];
const PAGES: PageId[] = [...TABS, 'publish'];

/** `route.path` below `#/dashboard/appmaker`. Unknown pages are reported so the view can say so. */
export function parsePage(path: string[]): { page: PageId; id?: string; unknown?: boolean } {
  const [first, second] = path;
  if (!first) return { page: 'overview' };
  if (!PAGES.includes(first as PageId)) return { page: 'overview', unknown: true };
  return { page: first as PageId, id: first === 'releases' ? second : undefined };
}

export type Screen = 'home' | 'search' | 'product' | 'cart' | 'account';
export const SCREENS: Screen[] = ['home', 'search', 'product', 'cart', 'account'];
export type OS = 'ios' | 'android';
export const parseScreen = (v: string | null): Screen => (SCREENS.includes(v as Screen) ? (v as Screen) : 'home');
export const parseOs = (v: string | null): OS => (v === 'android' ? 'android' : 'ios');

/* ---------- Access ---------- */

/** Same audience as the online store: the owner and marketing see it; publishing and accounts are the owner's. */
export function appAccess(role: Role): { see: boolean; publish: boolean } {
  return { see: canSee(role, 'storefront'), publish: can(role, 'theme.publish') };
}

/** The plan the add-on rule reads: the store's plan, or a review-mode override. */
export const effectivePlan = (storePlan: Plan, override: Plan | null): Plan => override ?? storePlan;
export function eligibilityOf(plan: Plan, addon: Addon) { return eligibility(plan, addon); }

/* ---------- Catalogue the app shows ---------- */

export interface AppProduct { id: string; name: L; category: L; price: number; compareAt: number | null; photo?: string; soldOut: boolean }

/** Products customers see in the app: active, with the app channel on. Stock and price come from the store. */
export function appCatalog(products: Product[], levels: Level[]): AppProduct[] {
  return products
    .filter((p) => p.status === 'active' && p.channels.app)
    .map((p) => ({
      id: p.id, name: p.name, category: p.category, price: p.price, compareAt: p.compareAt,
      photo: productPhoto(p.id, 'thumb'),
      soldOut: p.type === 'physical' && levels.some((l) => skusOf(p).includes(l.sku)) && totalAvailable(levels, skusOf(p)) <= 0,
    }));
}

export interface CatalogSummary { inApp: number; channelOff: number; notActive: number; withoutPhoto: number; soldOut: number }
export function catalogSummary(products: Product[], levels: Level[]): CatalogSummary {
  const app = appCatalog(products, levels);
  return {
    inApp: app.length,
    channelOff: products.filter((p) => p.status === 'active' && !p.channels.app).length,
    notActive: products.filter((p) => p.status !== 'active').length,
    withoutPhoto: app.filter((p) => !p.photo).length,
    soldOut: app.filter((p) => p.soldOut).length,
  };
}

/** Which products each home section shows. Photographed products lead so the preview is honest about imagery. */
export function sectionProducts(type: SectionType, catalog: AppProduct[]): AppProduct[] {
  const withPhoto = [...catalog].sort((a, b) => Number(!!b.photo) - Number(!!a.photo));
  if (type === 'featured') return withPhoto.slice(0, 4);
  if (type === 'newArrivals') return [...catalog].reverse().slice(0, 5);
  if (type === 'bestSellers') return [...catalog].sort((a, b) => b.price - a.price).slice(0, 3);
  return [];
}

export function appCategories(catalog: AppProduct[]): L[] {
  const seen = new Map<string, L>();
  for (const p of catalog) if (!seen.has(p.category.en)) seen.set(p.category.en, p.category);
  return [...seen.values()];
}

/** In-app search: name in either language, optional category. */
export function searchCatalog(catalog: AppProduct[], q: string, category: string): AppProduct[] {
  const n = q.trim().toLowerCase();
  return catalog.filter((p) => (!category || p.category.en === category) && (!n || p.name.ar.includes(n) || p.name.en.toLowerCase().includes(n)));
}

export interface CartLine { id: string; qty: number }
export function addToCart(cart: CartLine[], id: string, qty: number): CartLine[] {
  if (qty < 1) return cart;
  return cart.some((l) => l.id === id) ? cart.map((l) => (l.id === id ? { ...l, qty: Math.min(9, l.qty + qty) } : l)) : [...cart, { id, qty: Math.min(9, qty) }];
}
export const cartCount = (cart: CartLine[]) => cart.reduce((n, l) => n + l.qty, 0);
export function cartTotal(cart: CartLine[], catalog: AppProduct[]): number {
  return cart.reduce((s, l) => s + (catalog.find((p) => p.id === l.id)?.price ?? 0) * l.qty, 0);
}

/** Orders that came through the store app (the dashboard's order list filters them with `ch=app`). */
export const appOrders = (orders: Order[]) => orders.filter((o) => o.channel === 'app').length;

/* ---------- Brand colours ---------- */

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());

function lum(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG contrast ratio between two #rrggbb colours, rounded to one decimal. */
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 10) / 10;
}
/** Readable text colour on a merchant colour. */
export const onColour = (bg: string) => (contrast(bg, '#ffffff') >= contrast(bg, '#1e1b18') ? '#ffffff' : '#1e1b18');
/** The accent is used for buttons (with white or dark text) and for links on white: both must stay readable. */
export function accentIssue(accent: string): 'invalid' | 'lowContrast' | null {
  if (!isHex(accent)) return 'invalid';
  return contrast(accent, '#ffffff') < 4.5 ? 'lowContrast' : null;
}

export function monogram(name: L, lang: Lang): string {
  return (name[lang].trim() || name.ar.trim() || name.en.trim() || '?').slice(0, 1).toUpperCase();
}

/* ---------- Publishing ---------- */

export type PublishPath = 'none' | 'config' | 'binary';
export interface PublishPlan {
  change: ChangeSet;
  /** What the draft needs: nothing, a settings update (no store review) or a new version (LAK + store review). */
  path: PublishPath;
  version: string;
  platforms: Platform[];
  configBlock: ConfigBlock | 'notEligible' | null;
  binaryBlock: 'notEligible' | 'notReady' | 'active' | 'noPlatform' | 'noChange' | null;
  active: Release | undefined;
}

export function publishPlan(s: { plan: Plan; addon: Addon; draft: AppConfig; listing: Listing; accounts: Accounts; releases: Release[] }, chosen: Platform[]): PublishPlan {
  const live = liveConfig(s.releases);
  const change: ChangeSet = live ? classifyChange(live, s.draft) : { kind: 'binary', binary: [], config: [] };
  const platforms = chosen.filter((p) => s.accounts[p] === 'connected');
  const active = s.releases.find(isActive);
  const eligible = eligibility(s.plan, s.addon).ok;
  const ready = readiness(s).every((c) => c.ok);
  const configBlock = configUpdateBlock(s.releases, s.draft);
  const binaryBlock = !eligible ? 'notEligible' : active ? 'active' : !ready ? 'notReady' : !platforms.length ? 'noPlatform' : live && change.kind === 'none' ? 'noChange' : null;
  return {
    change, path: live ? change.kind : 'binary', version: nextVersion(s.releases), platforms, active,
    configBlock: !eligible ? 'notEligible' : configBlock, binaryBlock,
  };
}

/** The release a binary submission would create, for the confirmation preview. Nothing is stored. */
export const pendingRelease = (releases: Release[], draft: AppConfig, platforms: Platform[], at: string) => createRelease(releases, draft, platforms, at, 'preview');

/* ---------- Store status and history ---------- */

export interface PlatformStatus { live: Release | null; latest: Release | null; state: PState | null; issue?: IssueCode; build: number }
export function platformStatus(releases: Release[], p: Platform): PlatformStatus {
  const live = liveVersion(releases, p);
  const latest = [...releases].reverse().find((r) => r.kind === 'binary' && r.platforms[p].state !== 'not_included') ?? null;
  const run = latest?.platforms[p];
  return { live, latest, state: run?.state ?? null, issue: run?.issue, build: run?.build ?? 0 };
}

export type ReleaseGroup = 'attention' | 'progress' | 'done';
const ATTENTION: PState[] = ['build_failed', 'upload_failed', 'rejected', 'action_required'];
export function releaseGroup(r: Release): ReleaseGroup {
  if (r.kind === 'config') return 'done';
  if (r.lak === 'changes' || PLATFORMS.some((p) => ATTENTION.includes(r.platforms[p].state))) return 'attention';
  if (isActive(r)) return 'progress';
  return 'done';
}

/** Problems the merchant can act on, newest release first, one row per platform (or LAK review). */
export function attentionItems(releases: Release[]): { release: Release; platform?: Platform; issue: IssueCode }[] {
  const out: { release: Release; platform?: Platform; issue: IssueCode }[] = [];
  for (const r of [...releases].reverse()) {
    if (r.kind !== 'binary') continue;
    if (r.lak === 'changes' && r.lakIssue) out.push({ release: r, issue: r.lakIssue });
    for (const p of PLATFORMS) {
      const run = r.platforms[p];
      // A newer version already live on this platform makes an older problem moot.
      const newer = liveVersion(releases, p);
      if (run.issue && ATTENTION.includes(run.state) && !(newer && releases.indexOf(newer) > releases.indexOf(r))) out.push({ release: r, platform: p, issue: run.issue });
    }
  }
  return out;
}

export interface ReleaseFilter { kind: '' | 'binary' | 'config'; group: '' | ReleaseGroup; q: string }
export function filterReleases(releases: Release[], f: ReleaseFilter): Release[] {
  const q = f.q.trim().toLowerCase();
  return [...releases].reverse().filter((r) => (!f.kind || r.kind === f.kind) && (!f.group || releaseGroup(r) === f.group) && (!q || r.version.includes(q) || r.id.toLowerCase() === q));
}

export function stateTone(s: PState): Tone {
  if (s === 'published') return 'green';
  if (s === 'rejected' || s === 'build_failed' || s === 'upload_failed') return 'red';
  if (s === 'action_required') return 'amber';
  if (s === 'not_included') return 'gray';
  return 'sky';
}

export function fmtDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(iso));
}
