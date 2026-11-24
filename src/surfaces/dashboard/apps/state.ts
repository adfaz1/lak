// Apps session state (simulated): the sync log of every connection and a review-only "fail the next action" switch.
import { createStore } from '../../../core/store';
import { syncFixtures, type Cause, type SyncEntry } from './model';

export const syncLogStore = createStore.key('dashboard.apps.syncLog')<SyncEntry[]>(() => syncFixtures());
export const appsSimStore = createStore.key('dashboard.apps.sim')<{ failNext: Cause | null }>(() => ({ failNext: null }));
