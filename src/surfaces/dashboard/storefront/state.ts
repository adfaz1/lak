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
