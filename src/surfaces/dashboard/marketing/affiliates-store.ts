// Session stores for affiliates and influencer collaborations (P03-AFF, P03-INF), and the two storefront hooks:
// a link visit (`?ref=CODE`) is remembered for the cookie window, and a new order is credited by code or link.
// Pure rules live in merchant/growth.ts; this file only holds state and its writes.
import { createStore } from '../../../core/store';
import { allOrders } from '../../merchant/domain';
import {
  attributeOrder as creditOrder, attributionFixtures, collabFixtures, commissionRulesFixture, partnerFixtures,
  type AffTouch, type Attribution, type Collab, type CommissionRules, type Partner, type Payout, type CollabDraft, type PartnerDraft, type RulesDraft,
} from '../../merchant/growth';

export const partnersStore = createStore.key('dashboard.marketing.partners')<Partner[]>(partnerFixtures);
export const commissionRulesStore = createStore.key('dashboard.marketing.commissionRules')<CommissionRules>(commissionRulesFixture);
export const attributionsStore = createStore.key('dashboard.marketing.attributions')<Attribution[]>(() => attributionFixtures(allOrders()));
export const payoutsStore = createStore.key('dashboard.marketing.payouts')<Payout[]>(() => []);
export const collabsStore = createStore.key('dashboard.marketing.collabs')<Collab[]>(collabFixtures);
/** Link visits per partner code in this session (simulated shopper traffic). */
export const partnerVisitsStore = createStore.key('dashboard.marketing.partnerVisits')<Record<string, number>>(() => ({}));
/** The shopper's last partner link visit (the storefront's "cookie"). */
export const affTouchStore = createStore.key('storefront.affTouch')<AffTouch | null>(() => null);

/* Unsaved drafts kept for the tab session (leaving and coming back restores them). */
export const partnerDraftStore = createStore.key('dashboard.marketing.partnerDraft')<PartnerDraft | null>(() => null);
export const rulesDraftStore = createStore.key('dashboard.marketing.rulesDraft')<RulesDraft | null>(() => null);
export const collabDraftStore = createStore.key('dashboard.marketing.collabDraft')<(CollabDraft & { partnerId: string }) | null>(() => null);

/** Storefront: a shopper opened a partner link. Unknown or paused codes are ignored. */
export function recordPartnerVisit(code: string, now = Date.now()): void {
  const p = partnersStore.get().find((x) => x.code === code && x.status !== 'paused');
  if (!p) return;
  partnerVisitsStore.set((v) => ({ ...v, [p.code]: (v[p.code] ?? 0) + 1 }));
  affTouchStore.set({ code: p.code, at: now });
}
/** Storefront: credit a new order to a partner (code at checkout first, else a link inside the cookie window). Once per order. */
export function creditPartnerOrder(order: { ref: string; coupon?: string }, now = Date.now()): void {
  if (attributionsStore.get().some((a) => a.ref === order.ref)) return;
  const a = creditOrder(order, affTouchStore.get(), partnersStore.get(), commissionRulesStore.get(), now);
  if (a) attributionsStore.set((l) => [a, ...l]);
}
