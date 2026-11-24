// Session fixture state for the App Maker section (simulated; nothing reaches Apple, Google or a build server).
import { createStore } from '../../../core/store';
import type { Accounts, Addon, AppConfig, Listing, Plan, Release } from '../../appmaker/domain';
import { initialAccounts, initialDraft, initialListing, initialReleases } from '../../appmaker/fixtures';

export interface AMState {
  addon: Addon;
  /** Review mode only: overrides the store plan to inspect eligibility states. */
  planOverride: Plan | null;
  draft: AppConfig;
  listing: Listing;
  accounts: Accounts;
  releases: Release[];
  seq: number;
}

export const appStore = createStore.key('dashboard.appmaker')<AMState>(() => ({
  addon: 'active', planOverride: null, draft: initialDraft(), listing: initialListing(), accounts: initialAccounts(), releases: initialReleases(), seq: 10,
}));

export const updDraft = (fn: (d: AppConfig) => AppConfig) => appStore.set((s) => ({ ...s, draft: fn(s.draft) }));
export const now = () => new Date().toISOString();
