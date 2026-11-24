import { describe, expect, it } from 'vitest';
import {
  advanceDispute, advanceDelivery, allowedSections, announcementFixtures, applicationFixtures, applyPlanChange, audienceStores, can,
  csvMoney, decideKyc, decidePlanChange, deliveryFixtures, disputeFixtures, filterStores, gmv, isActiveStore, isLive, moderate,
  planDiff, planWarnings, proposePlanChange, reactivateStore, remainingMs, revenueFixture, revenueSummary, startAccess,
  storeFixtures, storeFromApplication, submissionFixtures, suspendStore, toCsv, validateAnnouncement, TODAY,
  type PlanChange,
} from './domain';

const store = (id: string) => storeFixtures().find((s) => s.id === id)!;
const app = (id: string) => applicationFixtures().find((a) => a.id === id)!;
const REASON = 'Documents verified against registry';
const T = 1_000_000;

describe('role permissions', () => {
  it('gives the owner everything and support read-only views', () => {
    expect(allowedSections('owner')).toHaveLength(11);
    expect(can('support', 'kyc.view')).toBe(true);
    expect(can('support', 'kyc.docs')).toBe(false);
    expect(can('support', 'kyc.decide')).toBe(false);
    expect(can('support', 'stores.suspend')).toBe(false);
    expect(allowedSections('support')).not.toContain('payments');
    expect(allowedSections('support')).not.toContain('audit');
  });
  it('separates finance from operations', () => {
    expect(can('finance', 'payments.act')).toBe(true);
    expect(can('ops', 'payments.view')).toBe(false);
    expect(can('finance', 'kyc.view')).toBe(false);
    expect(can('ops', 'plans.approve')).toBe(false);
    expect(can('ops', 'overview.money')).toBe(false);
  });
  it('refuses actions for roles without the permission', () => {
    expect(decideKyc(app('a-2051'), 'approve', REASON, 'support', T)).toEqual({ ok: false, error: 'noPerm' });
    expect(suspendStore(store('s-1001'), { kind: 'indefinite', reason: REASON }, 'finance', T)).toEqual({ ok: false, error: 'noPerm' });
  });
});

describe('KYC decisions', () => {
  it('approves a complete application with a reason and records who and when', () => {
    const r = decideKyc(app('a-2051'), 'approve', REASON, 'ops', T);
    expect(r.ok && r.value.status).toBe('approved');
    expect(r.ok && r.value.events.at(-1)).toMatchObject({ kind: 'approve', by: 'ops', at: T, reason: REASON });
  });
  it('requires a meaningful reason for every decision', () => {
    expect(decideKyc(app('a-2051'), 'reject', '  ok ', 'ops', T)).toEqual({ ok: false, error: 'reasonRequired' });
  });
  it('blocks approval while a document is expired or missing, but allows asking for more info', () => {
    expect(decideKyc(app('a-2052'), 'approve', REASON, 'owner', T)).toEqual({ ok: false, error: 'docsIncomplete' });
    const info = decideKyc(app('a-2052'), 'info', 'Please upload a valid VAT certificate', 'owner', T);
    expect(info.ok && info.value.status).toBe('info');
  });
  it('treats approved and rejected as final', () => {
    const rejected = decideKyc(app('a-2051'), 'reject', REASON, 'ops', T);
    expect(rejected.ok).toBe(true);
    if (rejected.ok) expect(decideKyc(rejected.value, 'approve', REASON, 'ops', T)).toEqual({ ok: false, error: 'terminal' });
  });
  it('turns an approved application into a store that is onboarding, not live', () => {
    const s = storeFromApplication(app('a-2051'), 's-2000', TODAY);
    expect(s.status).toBe('onboarding');
    expect(s.plan).toBe('plus');
    expect(s.domain.host).toBe('rawabi-honey.lak.example');
    expect(isActiveStore(s, TODAY)).toBe(false);
  });
});

describe('suspend and reactivate', () => {
  it('suspends an active store, keeping its data and recording the reason', () => {
    const r = suspendStore(store('s-1001'), { kind: 'temporary', days: 7, reason: REASON }, 'ops', T);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('suspended');
    expect(r.value.suspension).toMatchObject({ kind: 'temporary', days: 7, by: 'ops', at: T });
    expect(r.value.products).toBe(340);
    expect(r.value.openOrders).toBe(38);
  });
  it('validates duration and state', () => {
    expect(suspendStore(store('s-1001'), { kind: 'temporary', days: 0, reason: REASON }, 'ops', T)).toEqual({ ok: false, error: 'daysInvalid' });
    expect(suspendStore(store('s-1005'), { kind: 'indefinite', reason: REASON }, 'ops', T)).toEqual({ ok: false, error: 'notActive' });
    expect(reactivateStore(store('s-1001'), REASON, 'ops')).toEqual({ ok: false, error: 'notSuspended' });
  });
  it('reactivates a suspended store with a reason', () => {
    const r = reactivateStore(store('s-1005'), REASON, 'owner');
    expect(r.ok && r.value.status).toBe('active');
    expect(r.ok && r.value.suspension).toBeUndefined();
    expect(reactivateStore(store('s-1005'), '', 'owner')).toEqual({ ok: false, error: 'reasonRequired' });
  });
});

describe('plan change', () => {
  const propose = (role: 'ops' | 'owner' = 'ops', existing: PlanChange[] = []) =>
    proposePlanChange(store('s-1001'), 'plus', 'Merchant asked to downgrade at renewal', 'now', role, T, 'pc-1', existing);

  it('diffs entitlements as gains and losses', () => {
    const d = planDiff('pro', 'plus');
    expect(d.find((r) => r.feature.id === 'affiliate')?.change).toBe('loss');
    expect(d.find((r) => r.feature.id === 'cod')?.change).toBe('same');
    expect(planDiff('basic', 'plus').find((r) => r.feature.id === 'staff')?.change).toBe('gain');
  });
  it('warns about staff over the new limit and features in use', () => {
    const w = planWarnings(store('s-1001'), 'plus');
    expect(w).toContainEqual({ kind: 'staffOver', count: 6, limit: 3 });
    expect(w.filter((x) => x.kind === 'featureInUse').map((x) => x.feature!.id).sort()).toEqual(['affiliate', 'segments']);
  });
  it('needs approval from a different role before the store moves', () => {
    const p = propose();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(applyPlanChange(store('s-1001'), p.value).plan).toBe('pro');
    expect(decidePlanChange(p.value, true, 'ops', T, '')).toEqual({ ok: false, error: 'noPerm' });
    const ownerProposal = propose('owner');
    if (ownerProposal.ok) expect(decidePlanChange(ownerProposal.value, true, 'owner', T, '')).toEqual({ ok: false, error: 'selfApproval' });
    const a = decidePlanChange(p.value, true, 'finance', T, '');
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(applyPlanChange(store('s-1001'), a.value).plan).toBe('plus');
      expect(decidePlanChange(a.value, false, 'owner', T, REASON)).toEqual({ ok: false, error: 'notPending' });
    }
  });
  it('rejects same plan, duplicates and rejection without reason', () => {
    expect(proposePlanChange(store('s-1001'), 'pro', REASON, 'now', 'ops', T, 'x', [])).toEqual({ ok: false, error: 'samePlan' });
    const p = propose();
    if (p.ok) {
      expect(propose('ops', [p.value])).toEqual({ ok: false, error: 'pendingExists' });
      expect(decidePlanChange(p.value, false, 'finance', T, 'no')).toEqual({ ok: false, error: 'reasonRequired' });
    }
  });
  it('waits for renewal when the change is not effective now', () => {
    const p = proposePlanChange(store('s-1001'), 'special', REASON, 'renewal', 'ops', T, 'pc-2', []);
    const a = p.ok ? decidePlanChange(p.value, true, 'finance', T, '') : p;
    expect(a.ok && applyPlanChange(store('s-1001'), a.value).plan).toBe('pro');
  });
});

describe('supported access', () => {
  const input = { storeId: 's-1001', reason: 'Merchant ticket #4411 checkout issue', minutes: 15, mode: 'read' as const };
  it('starts a time-limited read-only session and expires it', () => {
    const r = startAccess(input, 'support', T, 'ax-1', null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isLive(r.value, T + 14 * 60_000)).toBe(true);
    expect(isLive(r.value, T + 15 * 60_000)).toBe(false);
    expect(remainingMs(r.value, T + 60_000)).toBe(14 * 60_000);
    expect(startAccess(input, 'owner', T + 1, 'ax-2', r.value)).toEqual({ ok: false, error: 'sessionActive' });
  });
  it('allows write mode only for roles that hold it, and requires reason and allowed duration', () => {
    expect(startAccess({ ...input, mode: 'write' }, 'support', T, 'a', null)).toEqual({ ok: false, error: 'writeNotAllowed' });
    expect(startAccess({ ...input, mode: 'write' }, 'owner', T, 'a', null).ok).toBe(true);
    expect(startAccess({ ...input, minutes: 240 }, 'owner', T, 'a', null)).toEqual({ ok: false, error: 'durationInvalid' });
    expect(startAccess({ ...input, reason: '' }, 'owner', T, 'a', null)).toEqual({ ok: false, error: 'reasonRequired' });
    expect(startAccess(input, 'finance', T, 'a', null)).toEqual({ ok: false, error: 'noPerm' });
  });
});

describe('money and metrics', () => {
  it('keeps GMV (merchant funds) out of LAK revenue and one-time fees out of MRR', () => {
    const r = revenueSummary(revenueFixture());
    expect(r.mrr).toBe(42_760_000);
    expect(r.arr).toBe(42_760_000 * 12);
    expect(r.lakRevenue30).toBe(44_145_000);
    expect(r.lakRevenue30 - r.recurring30).toBe(1_385_000);
    expect(gmv(storeFixtures())).toBe(88_306_500);
  });
  it('defines an active store as published, not suspended and with an order in 30 days', () => {
    const active = storeFixtures().filter((s) => isActiveStore(s, TODAY)).map((s) => s.id);
    expect(active).not.toContain('s-1006');
    expect(active).not.toContain('s-1005');
    expect(active).not.toContain('s-1009');
    expect(active).toHaveLength(8);
  });
  it('moves disputes only along allowed transitions', () => {
    const d = disputeFixtures().find((x) => x.id === 'DP-312')!;
    expect(advanceDispute(d, 'won', 'finance')).toEqual({ ok: false, error: 'badTransition' });
    expect(advanceDispute(d, 'awaitingMerchant', 'ops')).toEqual({ ok: false, error: 'noPerm' });
    const r = advanceDispute(d, 'awaitingMerchant', 'finance');
    expect(r.ok && r.value.state).toBe('awaitingMerchant');
  });
  it('writes CSV money without floats and neutralises formulas', () => {
    expect(csvMoney(1_249_900)).toBe('12499.00');
    expect(csvMoney(-50)).toBe('-0.50');
    expect(toCsv(['a', 'b'], [['=SUM(A1)', 'x, "y"'], [1, 'ok']])).toBe(`a,b\r\n'=SUM(A1),"x, ""y"""\r\n1,ok`);
  });
});

describe('operations', () => {
  it('searches stores in both languages and filters by plan and status', () => {
    const all = storeFixtures();
    expect(filterStores(all, { q: 'العود', status: '', plan: '' }).map((s) => s.id)).toEqual(['s-1001']);
    expect(filterStores(all, { q: 'oud', status: '', plan: '' }).map((s) => s.id)).toEqual(['s-1001']);
    expect(filterStores(all, { q: '', status: 'suspended', plan: '' })).toHaveLength(2);
    expect(filterStores(all, { q: '', status: '', plan: 'basic' })).toHaveLength(4);
  });
  it('re-attempts failed deliveries and counts the attempt', () => {
    const d = deliveryFixtures()[0];
    const r = advanceDelivery(d, 'reattempt', 'ops');
    expect(r.ok && r.value.attempts).toBe(3);
    expect(advanceDelivery(d, 'reattempt', 'support')).toEqual({ ok: false, error: 'noPerm' });
  });
  it('blocks approving a submission that fails a check and requires reasons for rejection', () => {
    const [theme, failing] = submissionFixtures();
    expect(moderate(failing, 'approve', '', 'ops')).toEqual({ ok: false, error: 'checksFailed' });
    expect(moderate(failing, 'reject', '', 'ops')).toEqual({ ok: false, error: 'reasonRequired' });
    expect(moderate(theme, 'approve', '', 'ops').ok).toBe(true);
    expect(moderate(theme, 'suspend', REASON, 'ops')).toEqual({ ok: false, error: 'badTransition' });
  });
  it('validates announcements and never counts suspended stores', () => {
    const stores = storeFixtures();
    const a = announcementFixtures()[0];
    expect(audienceStores(stores, a.audience)).toHaveLength(10);
    expect(audienceStores(stores, { type: 'plans', plans: ['basic'], storeIds: [] })).toHaveLength(3);
    expect(validateAnnouncement(a, stores, '2026-11-24T09:30')).toEqual([]);
    expect(validateAnnouncement({ ...a, windowEnd: '2026-12-02T01:00' }, stores, '2026-11-24T09:30')).toEqual(['windowInvalid']);
    expect(validateAnnouncement({ ...a, at: '2026-11-01T00:00', title: { ar: '', en: 'x' } }, stores, '2026-11-24T09:30')).toEqual(['titleRequired', 'scheduleInPast']);
  });
});
