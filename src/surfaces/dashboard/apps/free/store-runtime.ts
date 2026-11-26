// What the store-facing free apps (live chat, pop-up, bar, recommendations, social proof) record while shoppers browse
// this session, and the shopper-side state they need. Session data (simulated traffic): views and impressions are
// counted from what was actually rendered in this tab, never invented.
import { createStore } from '../../../../core/store';
import { appSettings, type FreeAppId, type Installed } from './registry';
import type { Signup } from './popup-model';
import type { AddEvent } from './upsell-model';

export interface StoreAppsLog {
  /** Shown counts per app (pop-up views, proof and suggestion impressions, bar views). */
  shown: Partial<Record<FreeAppId, number>>;
  signups: Signup[];
  adds: AddEvent[];
}
export const storeAppsLog = createStore.key('dashboard.freeApps.storeLog')<StoreAppsLog>(() => ({ shown: {}, signups: [], adds: [] }));

const seen = new Set<string>();
/** Count one display of an app's element; `key` de-duplicates re-renders of the same element in the same page view. */
export function countShown(app: FreeAppId, key: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  storeAppsLog.set((l) => ({ ...l, shown: { ...l.shown, [app]: (l.shown[app] ?? 0) + 1 } }));
}
/** Forget de-duplication keys (a new page view). */
export const newPageView = () => seen.clear();

export const recordSignup = (s: Signup) => storeAppsLog.set((l) => ({ ...l, signups: [...l.signups, s] }));
export const recordAdd = (a: AddEvent) => storeAppsLog.set((l) => ({ ...l, adds: [...l.adds, a].slice(-500) }));

/** The shopper's side: their chat (case id), the pop-up's last showing and sign-up in this session. */
export interface ShopperApps { visitor: string; chatCase?: string; chatOpen: boolean; name?: string; contact?: string; popupShownAt?: number; popupSignedUp?: string }
export const shopperAppsStore = createStore.key('storefront.freeApps')<ShopperApps>(() => ({ visitor: Math.random().toString(36).slice(2, 10), chatOpen: false }));

/** An app's saved settings over its defaults (typed for settings interfaces). */
export const settingsOf = <T extends object>(apps: Partial<Record<FreeAppId, Installed>>, id: FreeAppId, defaults: T): T =>
  appSettings(apps, id, defaults as unknown as Record<string, unknown>) as unknown as T;
