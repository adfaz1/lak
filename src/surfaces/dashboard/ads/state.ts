// Ads session state (simulated): tracking IDs and their connection state per platform, the catalogue feed token,
// campaigns the merchant planned, saved UTM links and the planner draft. Nothing reaches an ad platform.
import { createStore } from '../../../core/store';
import { AD_PLATFORMS, emptyTracking, newToken, type AdPlatform, type Campaign, type Feed, type Tracking, type Utm } from '../../merchant/ads';

export interface AdsState {
  tracking: Record<AdPlatform, Tracking>;
  feed: Feed;
  campaigns: Campaign[];
  links: (Utm & { id: string; url: string; at: number })[];
  draft: Campaign | null;
}
export const adsStore = createStore.key('dashboard.ads')<AdsState>(() => ({
  tracking: Object.fromEntries(AD_PLATFORMS.map((p) => [p, emptyTracking()])) as Record<AdPlatform, Tracking>,
  feed: { token: newToken(), on: false, rotatedAt: Date.now(), by: '', fetches: 0 },
  campaigns: [],
  links: [],
  draft: null,
}));
export const setAds = (f: (s: AdsState) => Partial<AdsState>) => adsStore.set((s) => ({ ...s, ...f(s) }));
