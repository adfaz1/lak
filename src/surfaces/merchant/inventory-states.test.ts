import { describe, expect, it } from 'vitest';
import {
  ON_HAND_PARTS, STATE_MOVES, available, breakdown, checkMove, initialLevels, levelOf, moveLimit, movePreview, moveStock, outgoingOf, sendTransfer, sumBreakdown,
  transferFixtures, withStateFixtures, type Level,
} from './inventory';
import { reserve, sellable } from '../storefront/bridge';

const lv = (p: Partial<Level> = {}): Level => ({ sku: 'X-1', loc: 'ryd', onHand: 10, reserved: 2, incoming: 0, version: 1, threshold: 3, ...p });
const parts = (l: Level) => ON_HAND_PARTS.reduce((s, k) => s + breakdown(l)[k], 0);

describe('full stock states', () => {
  it('keeps the old meaning when the new fields are absent', () => {
    expect(available(lv())).toBe(8);
    for (const l of initialLevels(['OUD-100', 'SHL-SLK-01'])) expect(available(l)).toBe(l.onHand - l.reserved);
  });
  it('subtracts every hold from available, and on hand always equals its parts', () => {
    const l = lv({ awaitingPay: 1, unavailable: 2, safety: 3 });
    expect(available(l)).toBe(2);
    expect(parts(l)).toBe(l.onHand);
    // Oversold: parts still add up, available goes negative.
    const o = lv({ onHand: 1, reserved: 2, safety: 1 });
    expect(available(o)).toBe(-2);
    expect(parts(o)).toBe(1);
  });
  it('outgoing counts sent, unreceived transfer units at the source only', () => {
    const levels = initialLevels(['SHL-SLK-01']);
    const t = transferFixtures().find((x) => x.status === 'sent')!; // ryd → jed, 4 units
    expect(outgoingOf([t], 'SHL-SLK-01', 'ryd')).toBe(4);
    expect(outgoingOf([t], 'SHL-SLK-01', 'jed')).toBe(0);
    expect(outgoingOf([{ ...t, status: 'partial', lines: [{ ...t.lines[0], received: 3 }] }], 'SHL-SLK-01', 'ryd')).toBe(1);
    expect(outgoingOf([{ ...t, status: 'closed' }], 'SHL-SLK-01', 'ryd')).toBe(0);
    const draft = transferFixtures().find((x) => x.status === 'draft')!;
    const sent = sendTransfer(initialLevels(['ABY-LIN-BLA-M', 'COF-SET-01']), draft);
    expect(sent.error).toBeUndefined();
    expect(breakdown(levelOf(sent.levels, 'ABY-LIN-BLA-M', 'jed')!, [sent.transfer]).outgoing).toBe(2);
    expect(breakdown(levelOf(sent.levels, 'ABY-LIN-BLA-M', 'ryd')!, [sent.transfer]).incoming).toBe(2);
    expect(sumBreakdown(levels.filter((l) => l.sku === 'SHL-SLK-01'), [t]).outgoing).toBe(4);
  });
  it('the storefront never sells held, damaged or safety units', () => {
    const levels = [lv({ onHand: 5, reserved: 0, safety: 2, unavailable: 1, awaitingPay: 1, loc: 'ryd' })];
    expect(sellable(levels, 'X-1')).toBe(1);
    const r = reserve(levels, 'X-1', 3);
    expect(r.short).toBe(2);
    expect(r.levels[0].reserved).toBe(1);
  });
});

describe('moving units between states', () => {
  it('limits each move to what is there', () => {
    const l = lv({ awaitingPay: 1, unavailable: 2, safety: 1 }); // available 4
    expect(moveLimit(l, 'damage')).toBe(4);
    expect(moveLimit(l, 'restore')).toBe(2);
    expect(moveLimit(l, 'writeOff')).toBe(2);
    expect(moveLimit(l, 'setSafety')).toBe(5);
    expect(moveLimit(l, 'releasePay')).toBe(1);
    expect(checkMove(l, 'damage', 5)).toBe('exceeds');
    expect(checkMove(l, 'damage', 0)).toBe('qty');
    expect(checkMove(l, 'damage', null)).toBe('qty');
    expect(checkMove(l, 'setSafety', 1)).toBe('same');
    expect(checkMove(l, 'setSafety', 0)).toBeNull();
  });
  it('previews before and after without writing', () => {
    const l = lv();
    const p = movePreview(l, 'damage', 3);
    expect(p.error).toBeNull();
    expect([p.before.available, p.after.available, p.after.unavailable, p.after.onHand]).toEqual([8, 5, 3, 10]);
    expect(movePreview(l, 'damage', 99).after).toEqual(p.before);
  });
  it('every move keeps on hand equal to its parts and logs who, why and the state path', () => {
    const base = lv({ awaitingPay: 2, unavailable: 2, safety: 1 });
    for (const m of STATE_MOVES) {
      const qty = m === 'setSafety' ? 3 : 1;
      const r = moveStock([base], 'X-1', 'ryd', m, qty, m === 'damage' ? 'damaged' : 'other', 1, 'You', 'ST-1');
      expect(r.error).toBeUndefined();
      const after = r.levels[0];
      expect(parts(after)).toBe(after.onHand);
      expect(after.version).toBe(2);
      expect(r.log?.state?.move).toBe(m);
      expect(r.log?.who).toBe('You');
    }
    const w = moveStock([base], 'X-1', 'ryd', 'writeOff', 2, 'disposed', 1, 'You', 'ST-2');
    expect([w.levels[0].onHand, w.levels[0].unavailable, w.log?.delta, w.log?.state?.to]).toEqual([8, 0, -2, 'gone']);
    const c = moveStock([base], 'X-1', 'ryd', 'confirmPay', 2, 'paid', 1, 'You', 'ST-3');
    expect([c.levels[0].reserved, c.levels[0].awaitingPay, available(c.levels[0])]).toEqual([4, 0, available(base)]);
    const s = moveStock([base], 'X-1', 'ryd', 'setSafety', 0, 'other', 1, 'You', 'ST-4');
    expect([s.log?.state?.from, s.log?.state?.to, s.log?.state?.qty]).toEqual(['safety', 'available', 1]);
  });
  it('refuses a stale version, a missing reason or a reason from another move', () => {
    const l = lv();
    expect(moveStock([l], 'X-1', 'ryd', 'damage', 1, 'damaged', 0, 'You', 'a').error).toBe('conflict');
    expect(moveStock([l], 'X-1', 'ryd', 'damage', 1, '', 1, 'You', 'a').error).toBe('reason');
    expect(moveStock([l], 'X-1', 'ryd', 'damage', 1, 'paid', 1, 'You', 'a').error).toBe('reason');
    expect(moveStock([l], 'X-1', 'jed', 'damage', 1, 'damaged', 1, 'You', 'a').error).toBe('notFound');
  });
  it('demo holds never make a fixture level oversold', () => {
    const skus = ['WLT-LTH-01', 'BAG-LTH-01', 'ABY-LIN-NAV-L', 'THB-COT-WHI-56'];
    const seeded = withStateFixtures(initialLevels(skus));
    expect(seeded.some((l) => (l.safety ?? 0) + (l.unavailable ?? 0) + (l.awaitingPay ?? 0) > 0)).toBe(true);
    for (const l of seeded) expect(available(l)).toBeGreaterThanOrEqual(0);
  });
});
