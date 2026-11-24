// Online-store content for the session (simulated): information pages, header/footer menus and store SEO.
// The shopper store (#/store) reads the live parts through storefront/bridge.ts. "Reset data" restores the fixture.
import { createStore } from '../../../core/store';
import { contentFixture, type ContentState } from './content';

export const contentStore = createStore.key('dashboard.storefront.content')<ContentState>(() => contentFixture());

/**
 * Pictures the merchant uploaded for the store identity and homepage (logo, favicon, banners), kept in this tab's
 * session as downscaled data URLs so a reload keeps them. Theme versions refer to them as "m:<id>", so publishing
 * many versions does not copy the bytes. Nothing leaves the browser (no image host in this preview).
 */
export interface MediaItem { url: string; name: string; w: number; h: number; kind: 'logo' | 'favicon' | 'image'; at: number }
export type MediaLib = Record<string, MediaItem>;
export const mediaStore = createStore.key('dashboard.storefront.media')<MediaLib>(() => ({}));

/* ---------- Campaign content (landing pages, custom URLs, blog) — additive ---------- */
import { landingFixtures, TOUCH_DAYS, type LandingPage, type LpTouch } from './landing-model';
import { redirectFixtures, type Redirect } from './redirects-model';
import { blogFixture, type BlogState } from './blog-model';

export const landingStore = createStore.key('dashboard.storefront.landing')<LandingPage[]>(landingFixtures);
export const redirectsStore = createStore.key('dashboard.storefront.redirects')<Redirect[]>(redirectFixtures);
export const blogStore = createStore.key('dashboard.storefront.blog')<BlogState>(blogFixture);
/** Shopper activity on landing pages in this session: visits and interest-list sign-ups (simulated, nothing is sent). */
export interface LpStats { visits: number; interest: { contact: string; at: number }[] }
export const lpStatsStore = createStore.key('dashboard.storefront.lpStats')<Record<string, LpStats>>(() => ({}));
/** The last landing page this shopper arrived on (UTM touch), and which order references it led to. */
export const lpTouchStore = createStore.key('storefront.lpTouch')<LpTouch | null>(() => null);
export const lpAttributionStore = createStore.key('dashboard.storefront.lpAttribution')<Record<string, string>>(() => ({}));

/** A shopper opened a landing page: count the visit and remember it for attribution. */
export function recordLandingVisit(slug: string, utm: string, source: string): void {
  lpStatsStore.set((s) => ({ ...s, [slug]: { visits: (s[slug]?.visits ?? 0) + 1, interest: s[slug]?.interest ?? [] } }));
  lpTouchStore.set({ slug, utm, source, at: Date.now() });
}
/** An order was placed in the store: credit it to the landing page visited in the last TOUCH_DAYS, if any. */
export function attributeOrder(ref: string, now = Date.now()): void {
  const t = lpTouchStore.get();
  if (!t || now - t.at > TOUCH_DAYS * 86_400_000) return;
  lpAttributionStore.set((a) => (a[ref] ? a : { ...a, [ref]: t.slug }));
}
