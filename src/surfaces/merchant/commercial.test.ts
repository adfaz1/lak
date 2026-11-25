import { describe, expect, it } from 'vitest';
import {
  ADDONS, DECISIONS, PACK_ITEMS, PLAN_LIMITS, THEME_PRESETS, addOnAvailable, advancePack, applyAuto, cancelPack, canCancelPack, checkAuto, checkQty, checkSpend,
  checkTopUp, creditBalance, creditFixture, decisionHref, emptyFeeInput, emptyServiceDraft, estimateFees, exampleFeeInput, feeOk, filterDecisions, isDecision, isLow,
  limitChanges, linesFrom, makePackOrder, makeService, matchingPreset, orderSections, parseNum, payoutDate, presetIdentity, spend, topUp, usageRows, usageState, validateFees, validateService,
} from './commercial';
import { identityFixture, themeFixture } from './workspace';
import type { CreditState } from './commercial';

describe('decisions register', () => {
  it('has unique ids, every decision says what it blocks and where it appears', () => {
    const ids = DECISIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DECISIONS) { expect(d.blocks.length).toBeGreaterThan(0); expect(d.where.length).toBeGreaterThan(0); expect(d.options.length).toBeGreaterThan(1); }
    for (const id of ['plans', 'txFees', 'affiliateNetwork', 'influencers', 'adsFees', 'pos', 'wholesale', 'themeRevenue', 'services', 'packaging', 'demoFreeShipping', 'unifiedCart']) expect(isDecision(id)).toBe(true);
  });
  it('links and filters in both languages', () => {
    expect(decisionHref('plans')).toBe('#/dashboard/settings/decisions?d=plans');
    expect(filterDecisions(DECISIONS, { q: 'تغليف' }).map((d) => d.id)).toEqual(['packaging']);
    expect(filterDecisions(DECISIONS, { q: 'theme' }).map((d) => d.id)).toContain('themeRevenue');
    expect(filterDecisions(DECISIONS, { area: 'channels' }).every((d) => d.area === 'channels')).toBe(true);
  });
  it('invents no number: no decision text carries a riyal price', () => {
    expect(JSON.stringify(DECISIONS)).not.toMatch(/\d+\s*(ر\.س|SAR)\s*\/|price is \d/);
  });
});

describe('plan limits', () => {
  it('follows the blueprint matrix and states usage', () => {
    expect(PLAN_LIMITS.basic.staff).toBe(1);
    expect(PLAN_LIMITS.plus.staff).toBe(3);
    expect(PLAN_LIMITS.pro.stores).toBeNull();
    expect(PLAN_LIMITS.pro.branches).toBe('pending');
    expect(usageState(3, 3)).toBe('full');
    expect(usageState(4, 5)).toBe('near');
    expect(usageState(5, 3)).toBe('over');
    expect(usageState(9, null)).toBe('unlimited');
    expect(usageRows('plus', { staff: 4, stores: 1, branches: 2, products: 40 }).find((r) => r.key === 'branches')!.state).toBe('over');
  });
  it('downgrade preview counts what must be removed first', () => {
    const c = limitChanges('pro', 'plus', { staff: 5, stores: 2, branches: 3, products: 40 });
    expect(c.find((x) => x.key === 'staff')!.over).toBe(2);
    expect(c.find((x) => x.key === 'stores')!.over).toBe(1);
    expect(c.find((x) => x.key === 'products')!.changed).toBe(false);
  });
  it('add-ons by plan', () => {
    const app = ADDONS.find((a) => a.id === 'appMaker')!;
    expect(addOnAvailable(app, 'basic')).toBe(false);
    expect(addOnAvailable(app, 'plus')).toBe(true);
  });
});

describe('fee calculator', () => {
  it('accepts Arabic digits', () => { expect(parseNum('١٢٫٥')).toBe(12.5); expect(parseNum('abc')).toBeNull(); });
  it('starts empty and needs order value and count', () => {
    const e = validateFees(emptyFeeInput());
    expect(e.aov).toBe('required');
    expect(e.mix).toBe('mix');
  });
  it('method mix must total 100%', () => {
    const i = exampleFeeInput();
    expect(feeOk(validateFees(i))).toBe(true);
    expect(validateFees({ ...i, mix: { ...i.mix, cod: '15' } }).mix).toBe('mix');
  });
  it('keeps provider fee and LAK fee apart; LAK fee is null until tried', () => {
    const i = exampleFeeInput();
    const r = estimateFees(i);
    expect(r.gross).toBe(400 * 25000);
    // mada 180 orders × 1% of 250 = 2.5 SAR → 45000 halalas
    expect(r.rows.find((x) => x.method === 'mada')!.provider).toBe(180 * 250);
    expect(r.lak).toBe(400 * 250);
    expect(r.net).toBe(r.gross - r.refunds - r.provider - r.lak!);
    expect(estimateFees({ ...i, lak: { pct: '', fixed: '' } }).lak).toBeNull();
  });
  it('payout date skips Friday and Saturday', () => {
    expect(payoutDate('2026-11-26', 1)).toBe('2026-11-29'); // Thursday → Sunday
    expect(payoutDate('2026-11-23', 3)).toBe('2026-11-26');
  });
});

describe('LAK credit', () => {
  it('validates top-ups', () => {
    expect(checkTopUp('')).toEqual({ ok: false, e: 'required' });
    expect(checkTopUp('٥')).toEqual({ ok: false, e: 'min' });
    expect(checkTopUp('100.555')).toEqual({ ok: false, e: 'number' });
    expect(checkTopUp('٢٠٠')).toEqual({ ok: true, v: 20000 });
  });
  it('spends only with a unit price and enough balance; logs a running balance', () => {
    let s = topUp(creditFixture(), 10000, 'me', '2026-11-25T08:00:00Z');
    expect(checkSpend(s, 'messages', 10)).toBe('unit');
    s = { ...s, unit: { messages: 20 } };
    expect(checkSpend(s, 'messages', 1000)).toBe('funds');
    expect(checkSpend(s, 'messages', 0)).toBe('qty');
    s = spend(s, 'messages', 100, 'me', '2026-11-25T09:00:00Z');
    expect(creditBalance(s)).toBe(8000);
    expect(s.entries[0]).toMatchObject({ kind: 'spend', amount: 2000, balance: 8000, service: 'messages', qty: 100 });
    expect(isLow({ ...s, threshold: 9000 })).toBe(true);
  });
  it('auto top-up fires below the trigger and covers a spend', () => {
    let s: CreditState = { ...topUp(creditFixture(), 3000, 'me'), unit: { labels: 1000 }, auto: { on: true, below: 2000, amount: 10000 } };
    expect(checkSpend(s, 'labels', 5)).toBeNull();
    s = spend(s, 'labels', 5, 'me');
    expect(s.entries.some((e) => e.kind === 'auto')).toBe(true);
    expect(creditBalance(s)).toBe(3000 + 10000 - 5000);
    expect(applyAuto({ ...s, auto: { ...s.auto, on: false } })).toEqual({ ...s, auto: { ...s.auto, on: false } });
    expect(checkAuto({ below: '', amount: '50' })).toEqual({ below: 'required' });
  });
});

describe('theme presets', () => {
  it('three LAK presets with different layouts, type and colour', () => {
    expect(THEME_PRESETS).toHaveLength(3);
    expect(new Set(THEME_PRESETS.map((p) => p.identity.header)).size).toBe(3);
    expect(new Set(THEME_PRESETS.map((p) => p.identity.font)).size).toBe(3);
    expect(new Set(THEME_PRESETS.map((p) => p.identity.accent)).size).toBe(3);
  });
  it('reorders sections stably and keeps the logo', () => {
    const sec = themeFixture().draft;
    const souq = orderSections(sec, THEME_PRESETS[0].order);
    expect(souq[0].kind).toBe('announcement');
    expect(souq[1].kind).toBe('categories');
    expect(souq).toHaveLength(sec.length);
    const id = presetIdentity(THEME_PRESETS[1], { ...identityFixture(), logo: 'm:1' });
    expect(id.logo).toBe('m:1');
    expect(matchingPreset(id)).toBe('majalla');
    expect(matchingPreset(identityFixture())).toBeNull();
  });
});

describe('service requests', () => {
  it('validates need, budget order and deadline', () => {
    const e = validateService(emptyServiceDraft(), '2026-11-25');
    expect(e).toMatchObject({ cat: 'required', need: 'required', min: 'required', max: 'required', deadline: 'required' });
    const d = { cat: 'photo' as const, need: 'تصوير ٣٠ منتجًا بخلفية بيضاء', min: '٥٠٠', max: '٣٠٠', deadline: '2026-11-25' };
    expect(validateService(d, '2026-11-25')).toEqual({ max: 'order', deadline: 'past' });
    const ok = { ...d, max: '1500', deadline: '2026-12-10' };
    expect(validateService(ok, '2026-11-25')).toEqual({});
    expect(makeService(ok, [], 'me')).toMatchObject({ id: 'SRV-001', budgetMin: 50000, budgetMax: 150000, status: 'open' });
  });
});

describe('packaging', () => {
  it('quantities follow the pack step; blank means none', () => {
    const box = PACK_ITEMS.find((x) => x.id === 'box')!;
    expect(checkQty('', box)).toEqual({ ok: true, v: 0 });
    expect(checkQty('٥٠', box)).toEqual({ ok: true, v: 50 });
    expect(checkQty('30', box)).toEqual({ ok: false, e: 'step' });
    const { lines, errors } = linesFrom({ 'box:0': '50', 'tape:1': '7', 'label:0': '' });
    expect(lines).toEqual([{ item: 'box', size: 0, qty: 50 }]);
    expect(errors).toEqual({ 'tape:1': 'step' });
  });
  it('status flow, and cancel only before preparation', () => {
    let o = makePackOrder([{ item: 'box', size: 0, qty: 50 }], 'الرياض', [], 'me');
    expect(o.status).toBe('submitted');
    o = advancePack(o, 'LAK');
    expect(o.status).toBe('confirmed');
    expect(canCancelPack(o.status)).toBe(true);
    o = advancePack(o, 'LAK');
    expect(cancelPack(o, 'me', 'x').status).toBe('preparing');
    o = advancePack(advancePack(o, 'LAK'), 'LAK');
    expect(o.status).toBe('delivered');
    expect(advancePack(o, 'LAK')).toBe(o);
    expect(o.events.map((e) => e.status)).toEqual(['submitted', 'confirmed', 'preparing', 'shipped', 'delivered']);
  });
});

import { feeFromOrders } from './commercial';
describe('fee calculator from real orders', () => {
  it('derives value, count and a mix totalling 100', () => {
    const r = feeFromOrders([{ method: 'card', total: 10000, refunded: false }, { method: 'cod', total: 20000, refunded: true }, { total: 30000, refunded: false }, { method: 'bank', total: 5000, refunded: false }]);
    expect(r.orders).toBe('3');
    expect(r.aov).toBe('200.00');
    expect(r.unknown).toBe(1);
    expect(Number(r.mix.card) + Number(r.mix.cod)).toBeCloseTo(100);
    expect(r.refundPct).toBe('33.3');
  });
});
