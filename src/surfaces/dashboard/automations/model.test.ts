import { describe, expect, it } from 'vitest';
import { automationFixtures, runFixtures, dryRun } from '../../merchant/growth';
import {
  activationBlock, addCondition, canAddCondition, changeTrigger, dryRunSummary, filterRuns, fromTemplate, isValid, lastRun, markDryRun,
  runCounts, sameFlow, saveVersion, steps, validate,
} from './model';

describe('list and run log', () => {
  const runs = runFixtures();
  it('finds the newest run and counts outcomes per automation', () => {
    expect(lastRun(runs, 'AU-11')?.id).toBe('RUN-901');
    expect(lastRun(runs, 'AU-99')).toBeNull();
    expect(runCounts(runs, 'AU-11')).toEqual({ succeeded: 1, failed: 2, skipped: 3 });
    expect(runCounts(runs)).toEqual({ succeeded: 2, failed: 2, skipped: 3 });
  });
  it('filters by outcome and automation', () => {
    expect(filterRuns(runs, { outcome: 'failed' }).map((r) => r.id)).toEqual(['RUN-898', 'RUN-895']);
    expect(filterRuns(runs, { automation: 'AU-12' }).map((r) => r.id)).toEqual(['RUN-896']);
    expect(filterRuns(runs, {}).length).toBe(runs.length);
  });
});

describe('builder', () => {
  const list = automationFixtures();
  it('creates a draft from a template with a fresh id and no dry run', () => {
    const a = fromTemplate('tpl-late', list);
    expect(a).toMatchObject({ id: 'AU-13', trigger: 'orderLate', status: 'draft', version: 1, dryRunVersion: null });
  });
  it('resets conditions and actions when the event changes, and adds unused fields first', () => {
    const a = changeTrigger(list[0], 'orderLate');
    expect(a.conditions).toEqual([]);
    expect(a.actions).toEqual(['notifyStaff']);
    const b = addCondition(addCondition(a));
    expect(b.conditions.map((c) => c.field)).toEqual(['hoursLate', 'channel']);
    expect(canAddCondition(b)).toBe(false);
  });
  it('validates name, condition values, wait and actions', () => {
    const bad = { ...list[0], name: { ar: '', en: 'x' }, conditions: [{ field: 'cartValue' as const, value: 'abc' }], waitHours: 200, actions: [] };
    expect(validate(bad)).toEqual({ name: true, condition: true, wait: true, actions: true, badConditions: [0] });
    expect(isValid(list[0])).toBe(true);
    expect(steps(bad).every((s) => !s.done)).toBe(true);
  });
  it('saving creates a new version; an active flow returns to paused and needs a new dry run', () => {
    const edited = { ...list[0], waitHours: 6 };
    expect(sameFlow(edited, list[0])).toBe(false);
    const { saved, list: next } = saveVersion(list, edited);
    expect(saved).toMatchObject({ version: 4, status: 'paused', dryRunVersion: 3 });
    expect(activationBlock(saved, false)).toBe('needsDryRun');
    const tested = markDryRun(next, saved.id).find((x) => x.id === saved.id)!;
    expect(activationBlock(tested, false)).toBeNull();
    expect(activationBlock(tested, true)).toBe('unsaved');
  });
  it('adds a new automation at version 1', () => {
    const a = fromTemplate('tpl-cart', list);
    const { saved, list: next } = saveVersion(list, a);
    expect(saved).toMatchObject({ version: 1, status: 'draft' });
    expect(next[0].id).toBe(a.id);
  });
  it('blocks activation without actions', () => {
    expect(activationBlock({ ...list[1], actions: [] }, false)).toBe('noActions');
  });
  it('summarises a dry run by outcome and skip reason', () => {
    const s = dryRunSummary(dryRun(list[0]));
    expect(s).toEqual({ act: 1, total: 4, skipped: { condition: 1, noConsent: 1, dedup: 1 } });
  });
});
