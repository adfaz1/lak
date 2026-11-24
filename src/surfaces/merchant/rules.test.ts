import { describe, expect, it } from 'vitest';
import { fixtures, type Order } from './domain';
import {
  applyRulesOnWrite, clearStaleSubs, liveSub, mainState, noticeEvents, noticeFixture, recordNotices, ruleEvents, runRule, setSubStatus, subBlock,
  subCounts, subStatusFixtures, validateRule, validateSub, SYSTEM, type OpRule, type RuleCtx,
} from './ops';
import { appendRuleRuns, needsFollowUp } from './growth';

const now = Date.parse('2026-11-24T10:00:00Z');
const subs = subStatusFixtures();
const ctx: RuleCtx = { members: [{ name: 'فيصل', status: 'active' }, { name: 'سارة', status: 'active' }, { name: 'هدى', status: 'invited' }], subs, skusOf: (id) => (id === 'oud' ? ['OUD-100'] : []) };
const fx = fixtures();
const paidNew = fx.find((o) => o.ref === '10482')!; // Riyadh, paid, not fulfilled
const jeddah = fx.find((o) => o.ref === '10481')!;
const failed = fx.find((o) => o.ref === '10479')!;
const rule = (p: Partial<OpRule>): OpRule => ({ id: 'RL-9', name: { ar: 'ق', en: 'R' }, trigger: 'orderCreated', conds: [], actions: [], status: 'active', version: 1, testedVersion: 1, rr: 0, by: 'x', at: 0, ...p });
const ctxNotice = () => ({ store: 'S', trackBase: '#/t/', contact: { phone: '0550000000', email: 'a@b.c' }, now });

describe('sub-statuses', () => {
  it('derives the main state and only offers sub-statuses of that state', () => {
    expect(mainState(paidNew)).toBe('processing');
    expect(mainState(failed)).toBe('awaitingPay');
    expect(mainState(fx.find((o) => o.ref === '10477')!)).toBe('shipped');
    expect(subBlock(paidNew, subs.find((s) => s.parent === 'awaitingPay')!)).toBe('otherState');
    expect(subBlock(paidNew, subs[0])).toBeNull();
  });
  it('sets, logs and clears a sub-status when the order leaves its main state', () => {
    const o = setSubStatus(paidNew, subs[0], { name: 'فيصل', role: 'fulfilment' }, now);
    expect(liveSub(o)?.id).toBe('SS-1');
    expect(o.activity!.at(-1)).toMatchObject({ kind: 'subStatusSet', actor: 'فيصل', text: 'بانتظار تأكيد المقاس|Awaiting size confirmation' });
    const shipped: Order = { ...o, ful: 'done', ship: 'transit' };
    expect(liveSub(shipped)).toBeNull();
    const [cleared] = clearStaleSubs([shipped], now);
    expect(cleared.sub).toBeUndefined();
    expect(cleared.activity!.at(-1)).toMatchObject({ kind: 'subStatusCleared', actor: SYSTEM.name });
  });
  it('validates names (both languages, unique per state, no "|") and the per-state limit', () => {
    expect(validateSub({ parent: 'processing', name: { ar: '', en: 'X' } }, subs).ar).toBe('nameAr');
    expect(validateSub({ parent: 'processing', name: { ar: 'تغليف هدية', en: 'New' } }, subs).ar).toBe('taken');
    expect(validateSub({ parent: 'ready', name: { ar: 'تغليف هدية', en: 'Gift' } }, subs)).toEqual({});
    expect(validateSub({ parent: 'ready', name: { ar: 'أ|ب', en: 'x' } }, subs).ar).toBe('chars');
  });
  it('a notifying sub-status sends the shared customer message through the message layer', () => {
    const o = setSubStatus(paidNew, subs[0], SYSTEM, now);
    expect(noticeEvents(paidNew, o).map((e) => e.event)).toEqual(['subStatus']);
    const silent = setSubStatus(paidNew, subs[1], SYSTEM, now);
    expect(noticeEvents(paidNew, silent)).toEqual([]);
    const [after] = recordNotices([paidNew], [o], noticeFixture(), ctxNotice);
    const msg = after.messages!.find((m) => m.event === 'subStatus')!;
    expect(msg.body).toContain('بانتظار تأكيد المقاس');
    expect(msg.channel).toBe('sms');
  });
  it('counts orders per live sub-status', () => {
    const o = setSubStatus(paidNew, subs[0], SYSTEM, now);
    expect(subCounts([o, jeddah])).toEqual({ 'SS-1': 1 });
  });
});

describe('operating rules', () => {
  it('matches city, total and product conditions and names the rule as the actor', () => {
    const r = rule({ conds: [{ field: 'city', value: 'Jeddah' }], actions: [{ kind: 'assign', members: ['فيصل'] }, { kind: 'tagAdd', tag: 'جدة' }] });
    expect(runRule(r, paidNew, ctx, now).outcome).toBe('skipped');
    const res = runRule(r, jeddah, ctx, now);
    expect(res.outcome).toBe('succeeded');
    expect(res.order.assignee).toBe('فيصل');
    expect(res.order.tags).toEqual(['جدة']);
    expect(res.order.activity!.every((a) => a.actor === 'RL-9' && a.role === 'rule')).toBe(true);
    expect(runRule(rule({ conds: [{ field: 'product', value: 'oud' }], actions: [{ kind: 'tagAdd', tag: 'oud' }] }), jeddah, ctx, now).outcome).toBe('succeeded');
    expect(runRule(rule({ conds: [{ field: 'totalMin', value: '٥٠٠٠' }], actions: [{ kind: 'tagAdd', tag: 'big' }] }), jeddah, ctx, now).outcome).toBe('skipped');
  });
  it('assigns in turn and skips members who are not active', () => {
    let r = rule({ actions: [{ kind: 'assign', members: ['فيصل', 'هدى', 'سارة'] }] });
    const a = runRule(r, paidNew, ctx, now); r = { ...r, rr: a.rr };
    const b = runRule(r, jeddah, ctx, now); r = { ...r, rr: b.rr };
    const c = runRule(r, failed, ctx, now);
    expect([a.order.assignee, b.order.assignee, c.order.assignee]).toEqual(['فيصل', 'سارة', 'فيصل']);
  });
  it('fails honestly (not retryable) when the member is not active, and skips when nothing changes', () => {
    const f = runRule(rule({ actions: [{ kind: 'notifyMember', member: 'هدى' }] }), paidNew, ctx, now);
    expect(f.outcome).toBe('failed');
    expect(f.retryable).toBe(false);
    const tagged = { ...paidNew, tags: ['VIP'] };
    expect(runRule(rule({ actions: [{ kind: 'tagAdd', tag: 'VIP' }] }), tagged, ctx, now).outcome).toBe('skipped');
    const wrong = runRule(rule({ actions: [{ kind: 'subStatus', id: 'SS-3' }] }), paidNew, ctx, now);
    expect(wrong.changes[0].status).toBe('skipped');
  });
  it('fires on created and on becoming paid; paused rules never run', () => {
    expect(ruleEvents(undefined, paidNew)).toEqual(['orderCreated', 'orderPaid']);
    expect(ruleEvents(undefined, failed)).toEqual(['orderCreated']);
    expect(ruleEvents(failed, { ...failed, pay: 'paid' })).toEqual(['orderPaid']);
    const rules = [rule({ actions: [{ kind: 'tagAdd', tag: 'new' }] }), rule({ id: 'RL-8', status: 'paused', actions: [{ kind: 'tagAdd', tag: 'x' }] })];
    const out = applyRulesOnWrite([], [jeddah], rules, ctx, now);
    expect(out.orders[0].tags).toEqual(['new']);
    expect(out.results.map((x) => x.rule)).toEqual(['RL-9']);
    const again = applyRulesOnWrite([jeddah], [{ ...jeddah, slips: 1 }], rules, ctx, now);
    expect(again.results).toEqual([]);
  });
  it('validates rules and logs runs per order with retries linked', () => {
    expect(Object.keys(validateRule(rule({ name: { ar: '', en: '' }, actions: [{ kind: 'tagAdd', tag: ' ' }] })).errors).sort()).toEqual(['actions', 'name']);
    const res = runRule(rule({ actions: [{ kind: 'notifyMember', member: 'هدى' }] }), paidNew, ctx, now);
    const first = appendRuleRuns([], [{ ...res, rule: 'RL-9' }], { now, by: 'rule' });
    expect(first.added[0]).toMatchObject({ automation: 'RL-9', order: '10482', outcome: 'failed', retryable: false });
    expect(needsFollowUp(first.runs)).toHaveLength(1);
    const retry = appendRuleRuns(first.runs, [{ ...res, rule: 'RL-9' }], { now, by: 'you', retryOf: first.added[0] });
    expect(retry.added[0]).toMatchObject({ attempt: 2, retryOf: first.added[0].id });
  });
});
