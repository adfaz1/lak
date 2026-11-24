import { describe, expect, it } from 'vitest';
import { automationFixtures, dryRun, runFixtures, TEMPLATES } from '../../merchant/growth';
import { costPerRun, filterRunView, needsFollowUp, retryBlock, retryRun, runSteps } from './model';

describe('retries and follow-up', () => {
  const runs = runFixtures();
  it('a timeout retry succeeds and links to the original; a permanent failure needs follow-up', () => {
    const r = retryRun(runs, 'RUN-895', { now: 1, by: 'me' });
    expect(r.run).toMatchObject({ outcome: 'succeeded', retryOf: 'RUN-895', attempt: 2 });
    expect(retryBlock(r.runs, r.runs.find((x) => x.id === 'RUN-895')!)).toBe('superseded');
    expect(needsFollowUp(runs).map((x) => x.id)).toEqual(['RUN-898']);
  });
  it('stops after three attempts', () => {
    let list = runs;
    let id = 'RUN-898';
    for (let i = 0; i < 2; i++) { const r = retryRun(list, id, { now: i, by: 'me' }); list = r.runs; id = r.run!.id; }
    expect(retryBlock(list, list.find((x) => x.id === id)!)).toBe('maxAttempts');
    expect(retryRun(list, id, { now: 9, by: 'me' }).run).toBeNull();
    expect(filterRunView(list, 'followup').map((x) => x.id)).toEqual([id]);
  });
  it('explains every step of a run in order', () => {
    const [a] = automationFixtures();
    expect(runSteps(runs.find((r) => r.id === 'RUN-898')!, a).map((s) => `${s.kind}:${s.outcome}`)).toEqual(['event:ok', 'conditions:ok', 'wait:ok', 'action:failed']);
    expect(runSteps(runs.find((r) => r.id === 'RUN-900')!, a).map((s) => s.outcome)).toEqual(['ok', 'ok', 'skipped', 'notReached']);
    expect(costPerRun(a)).toBe(2);
  });
  it('new events have templates that dry-run safely', () => {
    for (const id of ['tpl-welcome', 'tpl-review', 'tpl-back']) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const rows = dryRun(t);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.some((r) => r.skip === null)).toBe(true);
      expect(rows.some((r) => r.skip !== null)).toBe(true);
    }
  });
});
