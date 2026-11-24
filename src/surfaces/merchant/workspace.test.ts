import { describe, expect, it } from 'vitest';
import { allOrders } from './domain';
import { historyFixtures, initialLevels } from './inventory';
import { analyticsSeries } from './growth';
import { can, canSee, canSeeSettings } from './perms';
import {
  conversionAnswer, diffSections, enterStep, lateAnswer, moveSection, placeTestOrder, publishTheme, rollbackTheme, setupFixture, setupSummary,
  stockAnswer, submitStep, themeFixture, verifyStep,
} from './workspace';

describe('permissions (QA10)', () => {
  it('restricts pages and actions by role', () => {
    expect(canSee('fulfilment', 'finance')).toBe(false);
    expect(canSee('fulfilment', 'customers')).toBe(false);
    expect(canSee('finance', 'finance')).toBe(true);
    expect(can('finance', 'order.refund')).toBe(true);
    expect(can('fulfilment', 'order.refund')).toBe(false);
    expect(can('marketing', 'order.fulfil')).toBe(false);
    expect(canSeeSettings('marketing', 'team')).toBe(false);
    expect(canSeeSettings('marketing', 'language')).toBe(true);
    expect(canSeeSettings('owner', 'team')).toBe(true);
  });
});

describe('setup checklist (QA01)', () => {
  it('separates entered, awaiting verification and ready', () => {
    let s = setupFixture();
    expect(setupSummary(s).ready).toBe(0);
    s = enterStep(s, 'payment', 'mada');
    expect(s.find((x) => x.id === 'payment')!.state).toBe('entered');
    s = submitStep(s, 'payment');
    expect(s.find((x) => x.id === 'payment')!.state).toBe('verifying');
    expect(setupSummary(s).ready).toBe(0);
    s = verifyStep(s, 'payment', true);
    expect(setupSummary(s).ready).toBe(1);
    expect(enterStep(s, 'domain', 'custom:shop.example').find((x) => x.id === 'domain')!.state).toBe('verifying');
  });
  it('allows a test order only when product, payment and shipping are ready', () => {
    let s = setupFixture();
    expect(placeTestOrder(s)).toBe(s);
    s = verifyStep(submitStep(enterStep(s, 'payment', 'mada'), 'payment'), 'payment', true);
    s = enterStep(enterStep(s, 'product', 'Abaya'), 'shipping', 'flat');
    expect(setupSummary(s).canTest).toBe(true);
    expect(placeTestOrder(s).find((x) => x.id === 'test')!.state).toBe('ready');
  });
});

describe('assistant answers', () => {
  it('lists late orders from the order book', () => {
    const a = lateAnswer(allOrders());
    expect(a.count).toBe(a.refs.length);
    expect(a.count).toBeGreaterThan(0);
  });
  it('separates SKUs with enough history from those without', () => {
    const r = stockAnswer(initialLevels(['OUD-100', 'COF-SET-01', 'ABY-LIN-BLA-M', 'SHL-SLK-01', 'BAG-LTH-01']), historyFixtures());
    expect(r.atRisk.map((x) => x.sku)).toContain('OUD-100');
    expect(r.unknown.map((x) => x.sku)).toEqual(expect.arrayContaining(['COF-SET-01', 'BAG-LTH-01']));
  });
  it('says insufficient data when sessions are missing', () => {
    expect(conversionAnswer(analyticsSeries()).kind).toBe('insufficient');
  });
});

describe('themes', () => {
  it('diffs, publishes as a new version and rolls back without rewriting history', () => {
    const t = themeFixture();
    const draft = moveSection(t.draft, 's3', -1).map((s) => (s.id === 's5' ? { ...s, visible: true } : s));
    expect(diffSections(t.published.sections, draft).filter((c) => c.kind !== 'unchanged').map((c) => c.kind)).toEqual(['moved', 'moved', 'shown']);
    const p = publishTheme({ ...t, draft }, 'x');
    expect(p.published.version).toBe(8);
    const r = rollbackTheme(p, 7);
    expect(r.published.version).toBe(9);
    expect(r.history.length).toBe(4);
  });
});
