// Fixture stores the merchant stores do not have yet. Simulated state only; "Reset data" clears them too.
import { createStore } from '../../../core/store';
import { checkoutFixture, customRoleFixtures, type CustomRole, type InviteDates } from './model';
import type { AccountRecord } from './account-model';

/** When each pending invite was sent. The fixture invite (u3) went out four days before the session started. */
export const inviteDatesStore = createStore.key('dashboard.settings.inviteDates')<InviteDates>(() => ({ u3: new Date(Date.now() - 4 * 86_400_000).toISOString() }));
/** Checkout settings (blueprint pp.15–16). The online store reads guest checkout and the COD limit from here (storefront/bridge.ts). */
export const checkoutStore = createStore.key('dashboard.settings.checkout')(checkoutFixture);
/** Review-only simulation switches for settings: a failing save and DNS records the lookup does not find. */
export const settingsSimStore = createStore.key('dashboard.settings.sim')(() => ({ failSave: false, dns: 'found' as 'found' | 'txtMissing' | 'none' }));
/** Personal account data per team member (phone, job title, alert preferences, devices, two-step). Simulated. */
export const accountsStore = createStore.key('dashboard.settings.accounts')<Record<string, AccountRecord>>(() => ({}));
/** Custom roles (Pro): a name and a set of pages/actions; members keep a base role for this demo's checks. */
export const customRolesStore = createStore.key('dashboard.settings.customRoles')<{ roles: CustomRole[]; assigned: Record<string, string> }>(() => ({ roles: customRoleFixtures(), assigned: {} }));
