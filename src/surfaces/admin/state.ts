import type { L } from '../../core/lang';
import { createStore } from '../../core/store';
import {
  advanceDelivery, advanceDispute, announcementFixtures, applicationFixtures, applyPlanChange, carrierFixtures, decideKyc,
  decidePlanChange, deliveryFixtures, disputeFixtures, holdPayout, isLive, releasePayout, ledgerFixtures, moderate, proposePlanChange, reactivateStore,
  PLAN_NAME, revenueFixture, startAccess, storeFixtures, storeFromApplication, submissionFixtures, suspendStore, TODAY,
  type AccessSession, type Announcement, type AnnouncementDraft, type AuditAction, type AuditEntry, type DeliveryState,
  type DisputeState, type ErrorCode, type KycDecision, type ModAction, type PlanChange, type PlanId, type RoleId,
  type SuspendInput,
} from './domain';
import { DELIVERY_STATE, DISPUTE_STATE, MOD_ACTION, ROLE_LABEL } from './i18n';

/* Session-only fixture state. Nothing here reaches the live platform; resets with the global "Reset data". */

export const roleStore = createStore.key('admin.roleStore')<RoleId>(() => 'owner');
export const storesStore = createStore.key('admin.storesStore')(storeFixtures);
export const kycStore = createStore.key('admin.kycStore')(applicationFixtures);
export const changesStore = createStore.key('admin.changesStore')<PlanChange[]>(() => []);
export const accessStore = createStore.key('admin.accessStore')<AccessSession[]>(() => []);
export const disputesStore = createStore.key('admin.disputesStore')(disputeFixtures);
export const ledgerStore = createStore.key('admin.ledgerStore')(ledgerFixtures);
export const carriersStore = createStore.key('admin.carriersStore')(carrierFixtures);
export const deliveriesStore = createStore.key('admin.deliveriesStore')(deliveryFixtures);
export const contentStore = createStore.key('admin.contentStore')(submissionFixtures);
export const announcementsStore = createStore.key('admin.announcementsStore')(announcementFixtures);
export const revenueStore = createStore.key('admin.revenueStore')(revenueFixture);
export const auditStore = createStore.key('admin.auditStore')<AuditEntry[]>(() => []);
export const draftStore = createStore.key('admin.draftStore')<AnnouncementDraft>(() => emptyDraft());

export function emptyDraft(): AnnouncementDraft {
  return { kind: 'update', title: { ar: '', en: '' }, body: { ar: '', en: '' }, audience: { type: 'all', plans: [], storeIds: [] }, at: '', windowEnd: '' };
}

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export type Outcome = ErrorCode | null;

function audit(action: AuditAction, target: string, targetLabel: L, reason?: string, detail?: L) {
  const role = roleStore.get();
  auditStore.set((all) => [{ id: nextId('au'), at: Date.now(), role, action, target, targetLabel, reason, detail }, ...all]);
}

const storeLabel = (id: string): L => storesStore.get().find((s) => s.id === id)?.name ?? { ar: id, en: id };

export function switchRole(next: RoleId) {
  const prev = roleStore.get();
  if (prev === next) return;
  roleStore.set(next);
  audit('roleSwitched', next, { ar: 'دور العرض', en: 'Viewing role' }, undefined, { ar: `${ROLE_LABEL[prev].ar} ← ${ROLE_LABEL[next].ar}`, en: `${ROLE_LABEL[prev].en} → ${ROLE_LABEL[next].en}` });
}

export function kycDecide(id: string, decision: KycDecision, reason: string): Outcome {
  const a = kycStore.get().find((x) => x.id === id);
  if (!a) return 'badTransition';
  const r = decideKyc(a, decision, reason, roleStore.get(), Date.now());
  if (!r.ok) return r.error;
  let next = r.value;
  if (decision === 'approve') {
    const storeId = nextId('s');
    storesStore.set((all) => [storeFromApplication(next, storeId, TODAY), ...all]);
    next = { ...next, storeId };
  }
  kycStore.set((all) => all.map((x) => (x.id === id ? next : x)));
  audit(decision === 'approve' ? 'kycApprove' : decision === 'reject' ? 'kycReject' : 'kycInfo', id, a.store, reason.trim());
  return null;
}

export function logDocView(appId: string, docLabel: L) {
  const a = kycStore.get().find((x) => x.id === appId);
  audit('docViewed', appId, a?.store ?? { ar: appId, en: appId }, undefined, docLabel);
}

export function suspend(id: string, input: SuspendInput): Outcome {
  const s = storesStore.get().find((x) => x.id === id);
  if (!s) return 'badTransition';
  const r = suspendStore(s, input, roleStore.get(), Date.now());
  if (!r.ok) return r.error;
  storesStore.set((all) => all.map((x) => (x.id === id ? r.value : x)));
  audit('storeSuspended', id, s.name, input.reason.trim(),
    input.kind === 'temporary' ? { ar: `مؤقت ${input.days} يوم`, en: `Temporary, ${input.days} days` } : { ar: 'حتى إشعار آخر', en: 'Until further notice' });
  return null;
}

export function reactivate(id: string, reason: string): Outcome {
  const s = storesStore.get().find((x) => x.id === id);
  if (!s) return 'badTransition';
  const r = reactivateStore(s, reason, roleStore.get());
  if (!r.ok) return r.error;
  storesStore.set((all) => all.map((x) => (x.id === id ? r.value : x)));
  audit('storeReactivated', id, s.name, reason.trim());
  return null;
}

export function currentAccess(now = Date.now()): AccessSession | null {
  return accessStore.get().find((s) => isLive(s, now)) ?? null;
}

export function beginAccess(input: { storeId: string; reason: string; minutes: number; mode: 'read' | 'write' }): Outcome {
  const r = startAccess(input, roleStore.get(), Date.now(), nextId('ax'), currentAccess());
  if (!r.ok) return r.error;
  accessStore.set((all) => [r.value, ...all]);
  audit('accessStarted', input.storeId, storeLabel(input.storeId), input.reason.trim(),
    { ar: `${input.mode === 'read' ? 'قراءة فقط' : 'قراءة وكتابة'} · ${input.minutes} دقيقة`, en: `${input.mode === 'read' ? 'Read-only' : 'Read & write'} · ${input.minutes} min` });
  return null;
}

export function endAccess(id: string, why: 'ended' | 'expired') {
  const s = accessStore.get().find((x) => x.id === id);
  if (!s || s.endedAt) return;
  accessStore.set((all) => all.map((x) => (x.id === id ? { ...x, endedAt: Date.now(), end: why } : x)));
  audit(why === 'ended' ? 'accessEnded' : 'accessExpired', s.storeId, storeLabel(s.storeId));
}

export function proposePlan(storeId: string, to: PlanId, reason: string, effective: PlanChange['effective']): Outcome {
  const s = storesStore.get().find((x) => x.id === storeId);
  if (!s) return 'badTransition';
  const r = proposePlanChange(s, to, reason, effective, roleStore.get(), Date.now(), nextId('pc'), changesStore.get());
  if (!r.ok) return r.error;
  changesStore.set((all) => [r.value, ...all]);
  audit('planProposed', storeId, s.name, reason.trim(), { ar: `${PLAN_NAME[s.plan]} ← ${PLAN_NAME[to]}`, en: `${PLAN_NAME[s.plan]} → ${PLAN_NAME[to]}` });
  return null;
}

export function decidePlan(id: string, approve: boolean, note: string): Outcome {
  const c = changesStore.get().find((x) => x.id === id);
  if (!c) return 'notPending';
  const r = decidePlanChange(c, approve, roleStore.get(), Date.now(), note);
  if (!r.ok) return r.error;
  changesStore.set((all) => all.map((x) => (x.id === id ? r.value : x)));
  if (approve) storesStore.set((all) => all.map((s) => applyPlanChange(s, r.value)));
  audit(approve ? 'planApproved' : 'planRejected', c.storeId, storeLabel(c.storeId), note.trim() || undefined, { ar: `${PLAN_NAME[c.from]} ← ${PLAN_NAME[c.to]}`, en: `${PLAN_NAME[c.from]} → ${PLAN_NAME[c.to]}` });
  return null;
}

export function moveDispute(id: string, to: DisputeState, note: string): Outcome {
  const d = disputesStore.get().find((x) => x.id === id);
  if (!d) return 'badTransition';
  const r = advanceDispute(d, to, roleStore.get());
  if (!r.ok) return r.error;
  disputesStore.set((all) => all.map((x) => (x.id === id ? r.value : x)));
  audit('disputeMoved', id, storeLabel(d.storeId), note.trim() || undefined, { ar: `${DISPUTE_STATE[d.state].ar} ← ${DISPUTE_STATE[to].ar}`, en: `${DISPUTE_STATE[d.state].en} → ${DISPUTE_STATE[to].en}` });
  return null;
}

export function moveDelivery(id: string, to: DeliveryState, note = ''): Outcome {
  const d = deliveriesStore.get().find((x) => x.id === id);
  if (!d) return 'badTransition';
  const r = advanceDelivery(d, to, roleStore.get());
  if (!r.ok) return r.error;
  deliveriesStore.set((all) => all.map((x) => (x.id === id ? r.value : x)));
  audit('deliveryMoved', id, storeLabel(d.storeId), note.trim() || undefined, { ar: `${DELIVERY_STATE[d.state].ar} ← ${DELIVERY_STATE[to].ar}`, en: `${DELIVERY_STATE[d.state].en} → ${DELIVERY_STATE[to].en}` });
  return null;
}

export function moderateItem(id: string, action: ModAction, reason: string): Outcome {
  const s = contentStore.get().find((x) => x.id === id);
  if (!s) return 'badTransition';
  const r = moderate(s, action, reason, roleStore.get());
  if (!r.ok) return r.error;
  contentStore.set((all) => all.map((x) => (x.id === id ? r.value : x)));
  audit('contentModerated', id, s.name, reason.trim() || undefined, MOD_ACTION[action]);
  return null;
}

export function logExport(report: string, label: L, rows: number) {
  audit('reportExported', report, label, undefined, { ar: `${rows} صف`, en: `${rows} rows` });
}

export function scheduleAnnouncement(d: AnnouncementDraft): string {
  const id = nextId('an');
  announcementsStore.set((all) => [{ ...d, id, status: 'scheduled', by: roleStore.get(), created: Date.now() } as Announcement, ...all]);
  audit('announcementScheduled', id, d.title, undefined, { ar: d.at.replace('T', ' '), en: d.at.replace('T', ' ') });
  draftStore.reset();
  return id;
}

export function cancelAnnouncement(id: string, reason: string) {
  const a = announcementsStore.get().find((x) => x.id === id);
  if (!a) return;
  announcementsStore.set((all) => all.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)));
  audit('announcementCancelled', id, a.title, reason.trim());
}

export function holdStorePayout(id: string, reason: string): Outcome {
  const s = storesStore.get().find((x) => x.id === id);
  if (!s) return 'badTransition';
  const r = holdPayout(s, reason, roleStore.get(), Date.now());
  if (!r.ok) return r.error;
  storesStore.set((all) => all.map((x) => (x.id === id ? r.value : x)));
  audit('payoutHeld', id, s.name, reason.trim());
  return null;
}

export function releaseStorePayout(id: string, reason: string): Outcome {
  const s = storesStore.get().find((x) => x.id === id);
  if (!s) return 'badTransition';
  const r = releasePayout(s, reason, roleStore.get());
  if (!r.ok) return r.error;
  storesStore.set((all) => all.map((x) => (x.id === id ? r.value : x)));
  audit('payoutReleased', id, s.name, reason.trim());
  return null;
}

/** Prefill the announcement composer with a store audience (from a bulk selection). */
export function draftForStores(storeIds: string[]) {
  draftStore.set((d) => ({ ...d, audience: { type: 'stores', plans: [], storeIds } }));
}
