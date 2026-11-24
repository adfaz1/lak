// Apps: pure rules for the catalogue, connection states, data scopes and limits. No React.
// Fixtures and scope definitions live in merchant/workspace.ts (appFixtures, PERSONAL_SCOPES).
import type { L } from '../../../core/lang';
import { PLANS, type Plan } from '../../merchant/finance';
import { can, type Role } from '../../merchant/perms';
import { PERSONAL_SCOPES, type App, type AppState, type Scope } from '../../merchant/workspace';

export type AppView = 'all' | 'connected' | 'attention' | 'available';
export const APP_VIEWS: AppView[] = ['all', 'connected', 'attention', 'available'];
const IN_VIEW: Record<AppView, (s: AppState) => boolean> = {
  all: () => true, connected: (s) => s === 'connected', attention: (s) => s === 'reauth' || s === 'error', available: (s) => s === 'not_connected',
};
export function filterApps(apps: App[], f: { view: AppView; q: string; category: string }): App[] {
  const q = f.q.trim().toLowerCase();
  return apps.filter((a) => IN_VIEW[f.view](a.state) && (!f.category || a.category.en === f.category)
    && (!q || a.name.ar.includes(q) || a.name.en.toLowerCase().includes(q) || a.desc.en.toLowerCase().includes(q) || a.desc.ar.includes(q)));
}
export const viewCounts = (apps: App[]) => Object.fromEntries(APP_VIEWS.map((v) => [v, apps.filter((a) => IN_VIEW[v](a.state)).length])) as Record<AppView, number>;
export const categories = (apps: App[]) => [...new Map(apps.map((a) => [a.category.en, a.category])).values()];

export const isPersonal = (s: Scope) => PERSONAL_SCOPES.includes(s);
export const personalScopes = (a: App) => a.scopes.filter(isPersonal);
export const isWrite = (s: Scope) => s.endsWith('.write') || s === 'messages.send';

/**
 * Two different limits, never mixed: the plan decides whether the store may use the app at all;
 * the role decides whether this person may connect or change it.
 */
export function limits(a: App, plan: Plan, role: Role) {
  const inPlan = PLANS.indexOf(plan) >= PLANS.indexOf(a.minPlan);
  const permitted = can(role, 'apps.manage');
  return { inPlan, permitted, minPlan: a.minPlan, blockedBy: !inPlan ? 'plan' as const : !permitted ? 'permission' as const : null };
}

export type AppAction = 'connect' | 'reauth' | 'retry' | 'disconnect' | 'sync';
export function actionsFor(a: App): AppAction[] {
  switch (a.state) {
    case 'not_connected': return ['connect'];
    case 'connected': return ['disconnect'];
    case 'reauth': return ['reauth', 'disconnect'];
    case 'error': return ['retry', 'disconnect'];
  }
}

/** Apply a simulated connection change. Disconnecting keeps the last sync time for the record. */
export function applyAction(apps: App[], id: string, act: AppAction): App[] {
  return apps.map((a) => {
    if (a.id !== id || !actionsFor(a).includes(act)) return a;
    if (act === 'disconnect') return { ...a, state: 'not_connected' };
    return { ...a, state: 'connected', lastSync: { ar: 'الآن', en: 'Just now' } };
  });
}

/** Apps whose state needs the merchant (expired authorisation or failing sync). */
export const needsAttention = (apps: App[]) => apps.filter((a) => a.state === 'reauth' || a.state === 'error');

/* ---------- Sync log, causes and fixes (OWN-TEAM-06/07) ---------- */

/** Why a connection fails, in words a merchant can act on, and the one action that fixes it. */
export type Cause = 'auth_expired' | 'invalid_file' | 'rate_limited' | 'timeout' | 'scope_missing';
export const CAUSES: Record<Cause, { text: L; fix: AppAction; fixLabel: L }> = {
  auth_expired: { text: { ar: 'انتهى تفويض التطبيق؛ توقف عن الإرسال والاستقبال.', en: 'The app’s authorisation expired; it stopped sending and receiving.' }, fix: 'reauth', fixLabel: { ar: 'جدّد التفويض', en: 'Re-authorise' } },
  invalid_file: { text: { ar: 'رفض المتجر ملف التطبيق: تنسيق غير صالح. لم تتغير بيانات متجرك.', en: 'The store rejected the app’s file: invalid format. Your store data did not change.' }, fix: 'retry', fixLabel: { ar: 'أعد المزامنة', en: 'Retry sync' } },
  rate_limited: { text: { ar: 'تجاوز التطبيق حد الطلبات المسموح؛ يُعاد تلقائيًا بعد ساعة.', en: 'The app went over its request limit; it retries automatically in an hour.' }, fix: 'retry', fixLabel: { ar: 'أعد المزامنة الآن', en: 'Retry now' } },
  timeout: { text: { ar: 'لم يرد خادم التطبيق في الوقت المحدد.', en: 'The app’s server did not answer in time.' }, fix: 'retry', fixLabel: { ar: 'أعد المزامنة', en: 'Retry sync' } },
  scope_missing: { text: { ar: 'يحتاج التطبيق صلاحية لم تُمنح له.', en: 'The app needs a permission it was not given.' }, fix: 'reauth', fixLabel: { ar: 'امنح الصلاحية', en: 'Grant access' } },
};
export type SyncKind = 'sync' | 'connect' | 'reauth' | 'retry' | 'disconnect';
export interface SyncEntry { id: string; appId: string; at: string; kind: SyncKind; ok: boolean; records?: number; cause?: Cause; ref?: string }

export function syncFixtures(now = Date.now()): SyncEntry[] {
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  return [
    { id: 'S-0912', appId: 'acc', at: ago(0.33), kind: 'sync', ok: true, records: 14 },
    { id: 'S-0911', appId: 'acc', at: ago(1.33), kind: 'sync', ok: true, records: 9 },
    { id: 'S-0908', appId: 'acc', at: ago(3), kind: 'sync', ok: false, cause: 'timeout', ref: 'SYNC-4460' },
    { id: 'S-0907', appId: 'acc', at: ago(4), kind: 'sync', ok: true, records: 22 },
    { id: 'S-0905', appId: 'wa', at: ago(20), kind: 'sync', ok: false, cause: 'auth_expired', ref: 'SYNC-4468' },
    { id: 'S-0901', appId: 'wa', at: ago(26), kind: 'sync', ok: true, records: 31 },
    { id: 'S-0899', appId: 'rev', at: ago(30), kind: 'retry', ok: false, cause: 'invalid_file', ref: 'SYNC-4471' },
    { id: 'S-0890', appId: 'rev', at: ago(49), kind: 'sync', ok: false, cause: 'invalid_file', ref: 'SYNC-4455' },
    { id: 'S-0884', appId: 'rev', at: ago(54), kind: 'sync', ok: true, records: 120 },
  ];
}
export const logFor = (log: SyncEntry[], appId: string) => log.filter((e) => e.appId === appId).sort((a, b) => b.at.localeCompare(a.at));
/** Last successful data sync (connect/reauth/retry/sync that succeeded). */
export const lastOk = (log: SyncEntry[], appId: string) => logFor(log, appId).find((e) => e.ok && e.kind !== 'disconnect');
/** The cause behind an app's current failure: the latest failed entry after the last success. */
export function currentCause(log: SyncEntry[], appId: string): SyncEntry | undefined {
  const mine = logFor(log, appId);
  const ok = mine.findIndex((e) => e.ok);
  const fail = mine.findIndex((e) => !e.ok);
  return fail >= 0 && (ok < 0 || fail < ok) ? mine[fail] : undefined;
}
/** First failure in the current failing streak (when the problem started). */
export function failingSince(log: SyncEntry[], appId: string): string | undefined {
  const mine = logFor(log, appId);
  let since: string | undefined;
  for (const e of mine) { if (e.ok) break; since = e.at; }
  return since;
}
export const nextSyncId = (log: SyncEntry[]) => `S-${String(log.reduce((m, e) => Math.max(m, Number(e.id.replace(/\D/g, '')) || 0), 900) + 1).padStart(4, '0')}`;

/**
 * The outcome of a connection action. `fail` (review-mode simulation) keeps the app failing with the given cause.
 * Disconnect always succeeds. Returns the new app list and the log entry to append.
 */
export function runAction(apps: App[], log: SyncEntry[], id: string, act: AppAction, now: string, fail: Cause | null = null): { apps: App[]; entry: SyncEntry } {
  const a = apps.find((x) => x.id === id);
  const kind: SyncKind = act;
  const entryBase = { id: nextSyncId(log), appId: id, at: now, kind };
  if (!a) return { apps, entry: { ...entryBase, ok: false, cause: 'timeout' } };
  if (act === 'disconnect') return { apps: applyAction(apps, id, act), entry: { ...entryBase, ok: true } };
  if (fail) {
    const state: AppState = CAUSES[fail].fix === 'reauth' ? 'reauth' : 'error';
    return { apps: apps.map((x) => (x.id === id ? { ...x, state } : x)), entry: { ...entryBase, ok: false, cause: fail, ref: `SYNC-${4472 + log.length}` } };
  }
  const records = act === 'connect' ? 0 : 5 + ((log.length * 7) % 40);
  const next = act === 'sync' ? apps.map((x) => (x.id === id ? { ...x, lastSync: { ar: 'الآن', en: 'Just now' } } : x)) : applyAction(apps, id, act);
  return { apps: next, entry: { ...entryBase, ok: true, records } };
}

export interface IntegrationIssue {
  id: string;
  appId: string;
  name: L;
  /** error = data stopped flowing; action = the merchant must re-authorise. */
  level: 'error' | 'action';
  cause: L;
  /** When the failure started (ISO), if known. */
  since?: string;
  ref?: string;
  fix: { action: AppAction; label: L; href: string };
}
/**
 * Connections that need the merchant, with the cause in plain words and the one action that fixes it.
 * For the work centre / "needs you now": each issue links to `#/dashboard/apps/<id>` where the fix runs.
 * Pass the app list and sync log (appsStore.get(), syncLogStore.get()).
 */
export function integrationIssues(apps: App[], log: SyncEntry[] = []): IntegrationIssue[] {
  return needsAttention(apps).map((a) => {
    const c = currentCause(log, a.id);
    const cause: Cause = c?.cause ?? (a.state === 'reauth' ? 'auth_expired' : 'invalid_file');
    return {
      id: `app-${a.id}`, appId: a.id, name: a.name, level: a.state === 'error' ? 'error' as const : 'action' as const, cause: CAUSES[cause].text,
      since: failingSince(log, a.id), ref: c?.ref,
      fix: { action: CAUSES[cause].fix, label: CAUSES[cause].fixLabel, href: `#/dashboard/apps/${a.id}` },
    };
  }).sort((x, y) => (x.level === y.level ? 0 : x.level === 'error' ? -1 : 1));
}
