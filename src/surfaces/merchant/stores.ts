// Module-level fixture stores for the merchant workspace. The global "Reset data" button resets them all.
// Simulated state only: not a ledger, not a permission system.
import { createStore } from '../../core/store';
import { allOrders } from './domain';
import { productFixtures, skusOf, type ProductDraft } from './catalog';
import { initialLevels, transferFixtures, type StockLog } from './inventory';
import { financeFixtures, type Plan } from './finance';
import { automationFixtures, cartFixtures, couponFixtures, runFixtures } from './growth';
import {
  appFixtures, domainFixture, notifyFixture, policyFixtures, providerFixtures, setupFixture, statusFixture, storeFixture, teamFixture,
  themeFixture, zoneFixtures, type Member,
} from './workspace';
import type { Role } from './perms';

export const ordersStore = createStore.key('merchant.ordersStore')(allOrders);
export const productsStore = createStore.key('merchant.productsStore')(productFixtures);
export const levelsStore = createStore.key('merchant.levelsStore')(() => initialLevels(productFixtures().flatMap(skusOf)));
export const stockLogStore = createStore.key('merchant.stockLogStore')<StockLog[]>(() => [
  { id: 'ADJ-201', sku: 'OUD-100', loc: 'ryd', delta: -2, before: 6, after: 4, reason: 'damaged', who: 'Faisal', note: 'Broken in packing' },
  { id: 'ADJ-200', sku: 'BAG-LTH-01', loc: 'ryd', delta: 5, before: 2, after: 7, reason: 'received', who: 'Faisal', note: 'Supplier delivery' },
]);
export const transfersStore = createStore.key('merchant.transfersStore')(transferFixtures);
export const financeStore = createStore.key('merchant.financeStore')(() => financeFixtures());
export const couponsStore = createStore.key('merchant.couponsStore')(couponFixtures);
export const cartsStore = createStore.key('merchant.cartsStore')(cartFixtures);
export const automationsStore = createStore.key('merchant.automationsStore')(automationFixtures);
export const runsStore = createStore.key('merchant.runsStore')(runFixtures);
export const settingsStore = createStore.key('merchant.settingsStore')(() => ({
  providers: providerFixtures(),
  zones: zoneFixtures(),
  domain: domainFixture(),
  policies: policyFixtures(),
  notify: notifyFixture(),
  store: storeFixture(),
  status: statusFixture(),
  cod: { min: 0, max: 200000 },
  plan: 'plus' as Plan,
  planRequest: null as Plan | null,
  storeLangs: { ar: true, en: true },
}));
export const teamStore = createStore.key('merchant.teamStore')(() => ({ members: teamFixture() as Member[], log: [] as { who: string; what: string }[] }));
export const themeStore = createStore.key('merchant.themeStore')(themeFixture);
export const appsStore = createStore.key('merchant.appsStore')(appFixtures);
export const setupStore = createStore.key('merchant.setupStore')(setupFixture);
export const ticketsStore = createStore.key('merchant.ticketsStore')<{ id: string; subject: string; state: 'open' }[]>(() => []);
export const notesStore = createStore.key('merchant.notesStore')<Record<string, { id: string; kind: 'internal' | 'message'; text: string; channel?: 'email' | 'sms'; by: string }[]>>(() => ({
  'C-1001': [{ id: 'N1', kind: 'internal', text: 'Prefers delivery after 4 pm.', by: 'Faisal' }],
}));
/** Unsaved product edits kept for this session, so navigating away does not lose typed input. */
export const draftsStore = createStore.key('merchant.draftsStore')<Record<string, ProductDraft>>(() => ({}));

export interface TestState { role: Role; mode: 'active' | 'new'; failBulk: boolean; open: boolean }
export const testStore = createStore.key('merchant.testStore')<TestState>(() => ({ role: 'owner', mode: 'active', failBulk: false, open: false }));
