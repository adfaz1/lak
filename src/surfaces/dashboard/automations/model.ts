// Automations: pure rules for the list, builder, dry run and run log. No React.
// The engine (templates, dry run, activation rule, run fixtures) lives in merchant/growth.ts; this file adds
// editing, versioning, validation and summaries the new screens need.
import {
  TEMPLATES, TRIGGER_ACTIONS, TRIGGER_FIELDS, canActivate, dryRun,
  type Automation, type CondField, type Run, type RunOutcome, type SkipReason, type Trigger,
} from '../../merchant/growth';

export const OUTCOMES: RunOutcome[] = ['succeeded', 'failed', 'skipped'];

/** Newest run of an automation (runs are stored newest first), or null when it never ran. */
export const lastRun = (runs: Run[], id: string): Run | null => runs.find((r) => r.automation === id) ?? null;

export function runCounts(runs: Run[], id?: string): Record<RunOutcome, number> {
  const out: Record<RunOutcome, number> = { succeeded: 0, failed: 0, skipped: 0 };
  for (const r of runs) if (!id || r.automation === id) out[r.outcome]++;
  return out;
}

export function filterRuns(runs: Run[], f: { outcome?: string | null; automation?: string | null }): Run[] {
  return runs.filter((r) => (!f.outcome || r.outcome === f.outcome) && (!f.automation || r.automation === f.automation));
}

/** A fresh draft from a template, with an id that does not collide with existing automations. */
export function fromTemplate(tplId: string, existing: Automation[]): Automation {
  const t = TEMPLATES.find((x) => x.id === tplId) ?? TEMPLATES[0];
  const n = Math.max(10, ...existing.map((a) => Number(a.id.replace('AU-', '')) || 0)) + 1;
  return { ...t, id: `AU-${n}`, status: 'draft', version: 1, dryRunVersion: null, conditions: t.conditions.map((c) => ({ ...c })), actions: [...t.actions] };
}

/** Changing the event resets conditions and actions to what that event supports. */
export function changeTrigger(a: Automation, t: Trigger): Automation {
  return { ...a, trigger: t, conditions: [], actions: [TRIGGER_ACTIONS[t][0]] };
}
export function addCondition(a: Automation): Automation {
  const used = new Set(a.conditions.map((c) => c.field));
  const field = TRIGGER_FIELDS[a.trigger].find((f) => !used.has(f)) ?? TRIGGER_FIELDS[a.trigger][0];
  return { ...a, conditions: [...a.conditions, { field, value: field === 'channel' ? 'online' : '1' }] };
}
export const canAddCondition = (a: Automation) => a.conditions.length < TRIGGER_FIELDS[a.trigger].length;

export type BuilderError = 'name' | 'condition' | 'wait' | 'actions';
/** Field-level problems that block saving. Values are whole numbers ≥ 1; waits are 0–168 hours (7 days). */
export function validate(a: Automation): Partial<Record<BuilderError, true>> & { badConditions: number[] } {
  const e: Partial<Record<BuilderError, true>> & { badConditions: number[] } = { badConditions: [] };
  if (!a.name.ar.trim() || !a.name.en.trim()) e.name = true;
  a.conditions.forEach((c, i) => {
    if (c.field === 'channel') { if (!['online', 'market', 'app'].includes(c.value)) e.badConditions.push(i); return; }
    if (!/^\d+$/.test(c.value) || Number(c.value) < 1) e.badConditions.push(i);
  });
  if (e.badConditions.length) e.condition = true;
  if (!Number.isInteger(a.waitHours) || a.waitHours < 0 || a.waitHours > 168) e.wait = true;
  if (!a.actions.length) e.actions = true;
  return e;
}
export const isValid = (a: Automation) => Object.keys(validate(a)).length === 1;

/** Compare the editable parts of two automations. */
export function sameFlow(a: Automation, b: Automation): boolean {
  const pick = (x: Automation) => JSON.stringify([x.name, x.trigger, x.conditions, x.waitHours, x.actions]);
  return pick(a) === pick(b);
}

/**
 * Saving creates a new version. A dry run of an older version no longer counts; an active flow
 * cannot be edited (it must be paused first), so saving never leaves an untested version running.
 */
export function saveVersion(list: Automation[], a: Automation): { list: Automation[]; saved: Automation } {
  const prev = list.find((x) => x.id === a.id);
  const saved: Automation = { ...a, version: prev ? prev.version + 1 : 1, status: prev?.status === 'active' ? 'paused' : (prev?.status ?? 'draft'), dryRunVersion: prev ? prev.dryRunVersion : null };
  return { list: prev ? list.map((x) => (x.id === a.id ? saved : x)) : [saved, ...list], saved };
}

/** Record a dry run of the saved version (only a saved version can be cleared for activation). */
export const markDryRun = (list: Automation[], id: string) => list.map((x) => (x.id === id ? { ...x, dryRunVersion: x.version } : x));

export type ActivationBlock = 'unsaved' | 'invalid' | 'noActions' | 'needsDryRun' | null;
export function activationBlock(a: Automation, dirty: boolean): ActivationBlock {
  if (dirty) return 'unsaved';
  if (!isValid(a)) return a.actions.length ? 'invalid' : 'noActions';
  if (!canActivate(a)) return 'needsDryRun';
  return null;
}

export type DryRow = ReturnType<typeof dryRun>[number];
export function dryRunSummary(rows: DryRow[]) {
  const skipped: Record<SkipReason, number> = { condition: 0, noConsent: 0, dedup: 0 };
  let act = 0;
  for (const r of rows) if (r.skip) skipped[r.skip]++; else act++;
  return { act, skipped, total: rows.length };
}

/** Steps shown in the builder rail, with whether each is complete. */
export function steps(a: Automation): { id: 'event' | 'conditions' | 'wait' | 'actions'; done: boolean }[] {
  const e = validate(a);
  return [
    { id: 'event', done: !e.name },
    { id: 'conditions', done: !e.condition },
    { id: 'wait', done: !e.wait },
    { id: 'actions', done: !e.actions },
  ];
}

export const isMessaging = (a: Automation) => a.actions.some((x) => x === 'sendEmail' || x === 'sendSms');
export type { CondField };
export { dryRun, TEMPLATES, TRIGGER_ACTIONS, TRIGGER_FIELDS };
