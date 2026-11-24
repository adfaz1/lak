// View-side state for the work centre, the home workspace and the assistant log.
// Queue decisions (snooze/done) and the assistant log are session stores (kept while the tab is open, cleared by
// "Reset data"). The home workspace is a per-viewer preference in localStorage, one entry per role; every access is guarded.
import { useMemo, useSyncExternalStore } from 'react';
import { createStore } from '../../../core/store';
import {
  appsStore, automationsStore, financeStore, levelsStore, ordersStore, runsStore, settingsStore, teamStore, testStore,
} from '../../merchant/stores';
import { historyFixtures } from '../../merchant/inventory';
import type { Role } from '../../merchant/perms';
import { DEFAULT_WS, sanitizeWs, type Workspace } from '../model/home';
import { TOOLS, canUseTool } from '../model/tools';
import { emptyQueueState, forRole, workQueue, type QueueState, type WorkItem } from './model';
import type { DraftLog } from '../assistant/model';
import { deliveriesStore, reminderWorkItems, reorderStore, sequenceStore } from '../marketing/reminders-model';
import { couponsStore } from '../../merchant/stores';
import { rank } from './model';
import { verificationStore } from '../../merchant/verification-store';
import { verificationWorkItem } from '../settings/verification-work';
import type { L } from '../../merchant/domain';

/** Wraps a work item produced by another section so the queue can rank and render it. */
export function external(x: Omit<WorkItem, 'kind' | 'facts'> & { title: L; why: L; cta: L; moneyLabel?: L }, kind: WorkItem['kind'] = 'settlement'): WorkItem {
  const { title, why, cta, moneyLabel, ...rest } = x;
  return { ...rest, kind, facts: { problem: 'external', titleAr: title.ar, titleEn: title.en, whyAr: why.ar, whyEn: why.en, ctaAr: cta.ar, ctaEn: cta.en, moneyAr: moneyLabel?.ar ?? null, moneyEn: moneyLabel?.en ?? null } } as WorkItem;
}

export const queueStore = createStore.key('dashboard.workQueue')<QueueState>(emptyQueueState);
export const assistantLogStore = createStore.key('dashboard.assistantLog')<DraftLog[]>(() => []);

const HISTORY = historyFixtures();

/** The whole store's queue and the part this role can act on. */
export function useWork(empty = false): { all: WorkItem[]; mine: WorkItem[]; role: Role } {
  const orders = ordersStore.use();
  const levels = levelsStore.use();
  const fin = financeStore.use();
  const apps = appsStore.use();
  const settings = settingsStore.use();
  const runs = runsStore.use();
  const autos = automationsStore.use();
  const role = testStore.use().role;
  // Cart and reorder reminders report only steps that need the merchant (provider down, coupon broken).
  const v = verificationStore.use(); const ver = useMemo(() => verificationWorkItem(v), [v]);
  const seq = sequenceStore.use(); const rules = reorderStore.use(); const deliveries = deliveriesStore.use(); const coupons = couponsStore.use();
  const all = useMemo(() => (empty ? [] : rank([
    ...workQueue({ orders, levels, history: HISTORY, payouts: fin.payouts, txs: fin.txs, apps, providers: settings.providers, domain: settings.domain, runs, automations: autos }),
    ...reminderWorkItems({ seq, rules, deliveries, coupons }),
    ...(ver ? [external(ver)] : []),
  ])), [empty, orders, levels, fin, apps, settings.providers, settings.domain, runs, autos, seq, rules, deliveries, coupons, ver]);
  return { all, mine: useMemo(() => forRole(role, all), [role, all]), role };
}

/** Name used in logs: the team member holding the role in the demo team, else the role itself. */
export function useWho(): string {
  const role = testStore.use().role;
  const team = teamStore.use();
  const m = team.members.find((x) => x.role === role && x.status === 'active');
  const fallback: Record<Role, string> = { owner: 'المالك', fulfilment: 'التجهيز', finance: 'المالية', marketing: 'التسويق' };
  return m?.name ?? fallback[role];
}

/* ---------- Home workspace (localStorage, per role) ---------- */

const listeners = new Set<() => void>();
const cache = new Map<Role, Workspace>();
const key = (role: Role) => `lak.home.workspace.${role}`;
const toolOk = (role: Role) => (id: string, view: boolean) => {
  const t = TOOLS.find((x) => x.id === id);
  return !!t && canUseTool(t, role) && (!view || !!t.query);
};

function read(role: Role): Workspace {
  if (cache.has(role)) return cache.get(role)!;
  let raw: unknown = null;
  try { const v = localStorage.getItem(key(role)); raw = v ? JSON.parse(v) : null; } catch { raw = null; }
  const ws = sanitizeWs(raw, role, toolOk(role));
  cache.set(role, ws);
  return ws;
}
const emit = () => listeners.forEach((l) => l());
export function saveWorkspace(role: Role, ws: Workspace): boolean {
  cache.set(role, ws);
  let ok = true;
  try { localStorage.setItem(key(role), JSON.stringify(ws)); } catch { ok = false; }
  emit();
  return ok;
}
export function resetWorkspace(role: Role) {
  try { localStorage.removeItem(key(role)); } catch { /* preference only */ }
  cache.set(role, sanitizeWs(null, role, toolOk(role)));
  emit();
}
export const defaultWorkspace = (role: Role) => DEFAULT_WS[role];
export function useWorkspace(role: Role): Workspace {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => read(role));
}
