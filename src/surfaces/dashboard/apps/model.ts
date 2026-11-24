// Apps: pure rules for the catalogue, connection states, data scopes and limits. No React.
// Fixtures and scope definitions live in merchant/workspace.ts (appFixtures, PERSONAL_SCOPES).
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

export type AppAction = 'connect' | 'reauth' | 'retry' | 'disconnect';
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
