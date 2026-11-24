import { describe, expect, it } from 'vitest';
import { fixtures } from '../../merchant/domain';
import { subStatusFixtures, type RuleCtx } from '../../merchant/ops';
import { addCond, markTested, newRule, recentOrders, ruleBlock, saveRule, testRun, testSummary, wouldChange } from './rules-model';
import { runSubBulk, subBulkPlan, undoSubBulk } from '../orders/substatus-model';
import { noticeFixture } from '../../merchant/ops';

const now = Date.parse('2026-11-24T10:00:00Z');
const ctx: RuleCtx = { members: [{ name: 'فيصل', status: 'active' }], subs: subStatusFixtures(), skusOf: () => [] };

describe('operating rule editor', () => {
  it('versions on save, pauses an active rule, and needs a test of the saved version to activate', () => {
    let r = newRule([], 'سارة', now);
    r = { ...addCond(r, 'channel'), name: { ar: 'متجر', en: 'Store' }, actions: [{ kind: 'tagAdd', tag: 'online' }] };
    expect(ruleBlock(undefined, true)).toBe('unsaved');
    let { list, saved } = saveRule([], r, now);
    expect(saved.version).toBe(1);
    expect(ruleBlock(saved, false)).toBe('needsTest');
    list = markTested(list, saved.id);
    expect(ruleBlock(list[0], false)).toBeNull();
    const active = { ...list[0], status: 'active' as const };
    ({ saved } = saveRule([active], { ...active, name: { ar: 'م', en: 'S' } }, now));
    expect(saved).toMatchObject({ version: 2, status: 'paused' });
    expect(ruleBlock(saved, false)).toBe('needsTest');
  });
  it('test run previews recent orders without changing them', () => {
    const orders = fixtures();
    const r = { ...newRule([], 'x', now), name: { ar: 'م', en: 'S' }, conds: [{ field: 'channel' as const, value: 'online' }], actions: [{ kind: 'tagAdd' as const, tag: 'online' }] };
    const rows = testRun(r, recentOrders(orders, now), ctx, now);
    const s = testSummary(rows);
    expect(s.total).toBe(orders.length);
    expect(s.change).toBe(orders.filter((o) => o.channel === 'online').length);
    expect(wouldChange(rows)).toHaveLength(s.change);
    expect(orders.every((o) => !o.tags)).toBe(true);
  });
});

describe('bulk sub-status', () => {
  it('changes only orders in the sub-status main state, and undo restores', () => {
    const orders = fixtures();
    const sub = subStatusFixtures()[0];
    const plan = subBulkPlan(orders, sub, noticeFixture());
    expect(plan.eligible.map((o) => o.ref)).toEqual(['10482', '10481', '10480']);
    expect(plan.notifies).toBe(true);
    const r = runSubBulk(orders, plan.eligible.map((o) => o.ref), sub, { name: 'فيصل', role: 'fulfilment' }, now);
    expect(r.changed).toHaveLength(3);
    const back = undoSubBulk(r.orders, r.prev, { name: 'فيصل', role: 'fulfilment' }, now);
    expect(back.every((o) => !o.sub)).toBe(true);
  });
});
