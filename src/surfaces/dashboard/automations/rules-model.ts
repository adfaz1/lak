// Operating rules (Automations → Operating rules): pure rules for the editor, the test run on recent orders,
// versioning and activation. The engine (conditions, actions, what a run changes) is merchant/ops.ts runRule.
import type { Order } from '../../merchant/domain';
import { placedAt, runRule, ruleValid, validateRule, type OpRule, type RuleAction, type RuleActionKind, type RuleCond, type RuleCtx, type RuleField, type RuleResult } from '../../merchant/ops';

export const TEST_SAMPLE = 30;

export function newRule(existing: OpRule[], by: string, now: number): OpRule {
  const n = existing.reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, '')) || 0), 0) + 1;
  return { id: `RL-${n}`, name: { ar: '', en: '' }, trigger: 'orderCreated', conds: [], actions: [], status: 'draft', version: 1, testedVersion: null, rr: 0, by, at: now };
}

export const defaultValue = (f: RuleField): string => ({ city: 'Riyadh', channel: 'online', totalMin: '500', totalMax: '100', product: '', payMethod: 'cod' })[f];
export function addCond(r: OpRule, field: RuleField, product = ''): OpRule {
  return { ...r, conds: [...r.conds, { field, value: field === 'product' ? product : defaultValue(field) }] };
}
export function blankAction(kind: RuleActionKind, ctx: { member?: string; sub?: string }): RuleAction {
  switch (kind) {
    case 'assign': return { kind, members: ctx.member ? [ctx.member] : [] };
    case 'tagAdd': case 'tagRemove': return { kind, tag: '' };
    case 'subStatus': return { kind, id: ctx.sub ?? '' };
    case 'notifyMember': return { kind, member: ctx.member ?? '' };
  }
}

/** Compare the editable parts of two rules. */
export const sameRule = (a: OpRule, b: OpRule) => JSON.stringify([a.name, a.trigger, a.conds, a.actions]) === JSON.stringify([b.name, b.trigger, b.conds, b.actions]);

/** Saving makes a new version. An active rule is paused by saving (it must be tested again before it runs). */
export function saveRule(list: OpRule[], r: OpRule, now: number): { list: OpRule[]; saved: OpRule } {
  const prev = list.find((x) => x.id === r.id);
  const saved: OpRule = { ...r, version: prev ? prev.version + 1 : 1, status: prev?.status === 'active' ? 'paused' : (prev?.status ?? 'draft'), testedVersion: prev ? prev.testedVersion : null, rr: prev?.rr ?? 0, at: now };
  return { list: prev ? list.map((x) => (x.id === r.id ? saved : x)) : [saved, ...list], saved };
}

export type RuleBlock = 'unsaved' | 'invalid' | 'needsTest' | null;
export function ruleBlock(r: OpRule | undefined, dirty: boolean): RuleBlock {
  if (!r || dirty) return 'unsaved';
  if (!ruleValid(r)) return 'invalid';
  if (r.testedVersion !== r.version) return 'needsTest';
  return null;
}
export const markTested = (list: OpRule[], id: string) => list.map((x) => (x.id === id ? { ...x, testedVersion: x.version } : x));

/** Most recent orders that are not cancelled: what a test run looks at. */
export const recentOrders = (orders: Order[], now: number, n = TEST_SAMPLE) =>
  orders.filter((o) => !o.cancelled).sort((a, b) => placedAt(b, now) - placedAt(a, now)).slice(0, n);

export interface TestRow { order: Order; result: RuleResult }
/**
 * Preview on recent orders, as if each had just triggered the rule: who matches and what would change. Round-robin
 * advances from order to order as it would live. Nothing is written.
 */
export function testRun(r: OpRule, orders: Order[], ctx: RuleCtx, now: number): TestRow[] {
  let rr = r.rr;
  return orders.map((o) => {
    const result = runRule({ ...r, rr }, o, ctx, now);
    rr = result.rr;
    return { order: o, result };
  });
}
export function testSummary(rows: TestRow[]) {
  const matched = rows.filter((x) => x.result.changes.length > 0 || x.result.reason.en.startsWith('Nothing'));
  return {
    total: rows.length,
    matched: matched.length,
    change: rows.filter((x) => x.result.outcome === 'succeeded').length,
    failed: rows.filter((x) => x.result.outcome === 'failed').length,
    nothing: rows.filter((x) => x.result.outcome === 'skipped' && x.result.changes.length > 0).length,
  };
}
/** Orders a test run would change (offered as «also apply to current orders» when activating). */
export const wouldChange = (rows: TestRow[]) => rows.filter((x) => x.result.outcome !== 'skipped' && x.result.changes.some((c) => c.status === 'done')).map((x) => x.order.ref);

export { validateRule, ruleValid };
export type { RuleCond };
