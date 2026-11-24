import { describe, expect, it } from 'vitest';
import { allOrders, total, type Order } from '../../merchant/domain';
import { noticeFixture, type Actor, type NoticeCtx } from '../../merchant/ops';
import { cancelSummary, moreEligibility, runMore, undoMore, voidSummary, type MoreCtx } from './bulk-more-model';
import { addView, currentView, pinView, renameView, restoreView, removeView, viewNameError, viewParams, MAX_PINNED, type SavedView } from './saved-views';
import { readQuery } from './model';

const ME: Actor = { name: 'سارة', role: 'owner' };
const T = 1_790_000_000_000;
const all = allOrders();
const byRef = (ref: string) => all.find((o) => o.ref === ref)!;
const ctx: MoreCtx = { canRefund: true, contact: () => ({ phone: '+966500001001', email: 'c@example.test' }) };
const nctx = (): NoticeCtx => ({ store: 'S', trackBase: 'x/', contact: { phone: '+966500001001', email: 'c@example.test' }, now: T });
const deps = { cfg: noticeFixture(), ctx, noticeCtx: nctx };

describe('bulk assign and tags', () => {
  it('skips orders already in that state, and undo restores each order', () => {
    const refs = ['10482', '10481'];
    const pre = all.map((o) => (o.ref === '10481' ? { ...o, assignee: 'فيصل' } : o));
    const e = moreEligibility(pre.filter((o) => refs.includes(o.ref)), 'assign', { member: 'فيصل' }, ctx);
    expect(e.eligible.map((o) => o.ref)).toEqual(['10482']);
    expect(e.reasons).toEqual({ same: 1 });
    const r = runMore(pre, refs, 'assign', { member: 'فيصل' }, ME, T, deps);
    expect(r.ok).toEqual(['10482']);
    expect(r.orders.find((o) => o.ref === '10482')?.assignee).toBe('فيصل');
    const back = undoMore(r.orders, 'assign', r.before, { member: 'فيصل' }, ME, T + 1);
    expect(back.find((o) => o.ref === '10482')?.assignee).toBeUndefined();
    expect(back.find((o) => o.ref === '10482')?.activity?.at(-1)).toMatchObject({ kind: 'assigned' });
  });
  it('adds and removes a tag; undo of add removes it again', () => {
    const r = runMore(all, ['10482', '10480'], 'tagAdd', { tag: '  VIP  ' }, ME, T, deps);
    expect(r.orders.filter((o) => o.tags?.includes('VIP')).map((o) => o.ref).sort()).toEqual(['10480', '10482']);
    expect(moreEligibility(r.orders.filter((o) => o.ref === '10482'), 'tagAdd', { tag: 'VIP' }, ctx).reasons).toEqual({ hasTag: 1 });
    const undone = undoMore(r.orders, 'tagAdd', r.before, { tag: 'VIP' }, ME, T);
    expect(undone.some((o) => o.tags?.includes('VIP'))).toBe(false);
    const rm = runMore(r.orders, ['10482', '10481'], 'tagRemove', { tag: 'VIP' }, ME, T, deps);
    expect(rm.ok).toEqual(['10482']);
    expect(rm.skipped).toEqual(['10481']);
  });
});

describe('payments family', () => {
  it('payment links go only to orders waiting for money and with a reachable channel', () => {
    const orders = [byRef('10479'), byRef('10482')];
    const e = moreEligibility(orders, 'payLink', { channels: ['sms'] }, ctx);
    expect(e.eligible.map((o) => o.ref)).toEqual(['10479']);
    expect(e.reasons).toEqual({ notAwaiting: 1 });
    const noPhone = moreEligibility([byRef('10479')], 'payLink', { channels: ['sms'] }, { ...ctx, contact: () => ({ email: 'a@b.c' }) });
    expect(noPhone.reasons).toEqual({ noContact: 1 });
    const r = runMore(all, ['10479'], 'payLink', { channels: ['sms', 'whatsapp'] }, ME, T, deps);
    const o = r.orders.find((x) => x.ref === '10479')!;
    expect(o.messages?.map((m) => `${m.event}:${m.channel}:${m.status}`)).toEqual(['payLink:sms:sent', 'payLink:whatsapp:sent']);
  });
  it('a rejected message counts as failed and a retry sends only what failed', () => {
    const r = runMore(all, ['10479'], 'payLink', { channels: ['sms'] }, ME, T, { ...deps, cfg: { ...deps.cfg, simFail: 'sms' } });
    expect(r.failed).toEqual(['10479']);
    expect(r.orders.find((x) => x.ref === '10479')?.messages?.at(-1)?.status).toBe('failed');
    const retry = runMore(r.orders, r.failed, 'payLink', { channels: ['sms'] }, ME, T + 1, deps);
    expect(retry.ok).toEqual(['10479']);
  });
  it('extending the deadline changes nothing when the message fails', () => {
    const r = runMore(all, ['10479'], 'extendDue', { channels: ['sms'], days: 3 }, ME, T, { ...deps, cfg: { ...deps.cfg, simFail: 'sms' } });
    expect(r.failed).toEqual(['10479']);
    expect(r.orders.find((x) => x.ref === '10479')?.payDue).toBeUndefined();
    const ok = runMore(all, ['10479'], 'extendDue', { channels: ['sms'], days: 3 }, ME, T, deps);
    expect(ok.orders.find((x) => x.ref === '10479')?.payDue).toBeGreaterThan(T);
  });
  it('invoices go only to collected orders', () => {
    expect(moreEligibility([byRef('10479'), byRef('10482')], 'sendInvoice', { channels: ['email'] }, ctx).reasons).toEqual({ notPaid: 1 });
  });
});

describe('bulk cancel and void labels', () => {
  it('previews refunds per order and skips shipped ones or refunds the role cannot make', () => {
    const orders = [byRef('10482'), byRef('10477'), byRef('10479')];
    const e = moreEligibility(orders, 'cancel', { reason: 'x' }, ctx);
    expect(e.eligible.map((o) => o.ref)).toEqual(['10482', '10479']);
    expect(e.reasons).toEqual({ shipped: 1 });
    const s = cancelSummary(e.eligible);
    expect(s.refund).toBe(total(byRef('10482')));
    expect(s.refunds).toBe(1);
    expect(moreEligibility(orders, 'cancel', { reason: 'x' }, { ...ctx, canRefund: false }).reasons).toEqual({ shipped: 1, needsRefundRole: 1 });
    const r = runMore(all, ['10482', '10479'], 'cancel', { reason: 'Out of stock' }, ME, T, deps);
    expect(r.ok).toEqual(['10482', '10479']);
    expect(r.orders.find((o) => o.ref === '10482')?.refunds.at(-1)).toMatchObject({ status: 'pending', amount: total(byRef('10482')) });
  });
  it('voids issued labels only, with the fee estimate', () => {
    const lab: Order = byRef('10478');
    const e = moreEligibility([lab, byRef('10477'), byRef('10482')], 'voidLabels', {}, ctx);
    expect(e.eligible.map((o) => o.ref)).toEqual(['10478']);
    expect(e.reasons).toEqual({ withCarrier: 1, noLabel: 1 });
    expect(voidSummary(e.eligible).labels).toBe(1);
    const r = runMore(all, ['10478'], 'voidLabels', {}, ME, T, deps);
    expect(r.orders.find((o) => o.ref === '10478')).toMatchObject({ ship: 'none', ful: 'none' });
    expect(r.effects[0].effects.every((x) => x.onHand > 0)).toBe(true);
  });
});

describe('saved views', () => {
  const q = readQuery(new URLSearchParams('view=payfail&method=bank&q=نوف&page=3'));
  it('stores the list state without the page, and finds the current view', () => {
    expect(viewParams(q)).toEqual({ view: 'payfail', q: 'نوف', method: 'bank' });
    const r = addView([], ' تحويلات  نوف ', viewParams(q), true, T);
    expect(r.views[0]).toMatchObject({ name: 'تحويلات نوف', pinned: true });
    expect(currentView(r.views, readQuery(new URLSearchParams('method=bank&q=نوف&view=payfail')))?.id).toBe(r.id);
    expect(currentView(r.views, readQuery(new URLSearchParams('view=payfail')))).toBeUndefined();
  });
  it('validates names, renames, pins within the limit, deletes and restores', () => {
    let v: SavedView[] = addView([], 'A', { view: 'late' }, true, T).views;
    expect(viewNameError('a', v)).toBe('taken');
    expect(viewNameError('', v)).toBe('empty');
    expect(viewNameError('x'.repeat(31), v)).toBe('long');
    expect(renameView(v, v[0].id, 'B').views[0].name).toBe('B');
    for (let i = 0; i < MAX_PINNED; i++) v = addView(v, `V${i}`, { q: String(i) }, true, T + i).views;
    expect(v.filter((x) => x.pinned).length).toBe(MAX_PINNED);
    const last = v[v.length - 1];
    expect(last.pinned).toBe(false);
    expect(pinView(v, last.id, true)).toBe(v);
    const gone = removeView(v, v[0].id);
    expect(restoreView(gone, v[0], 0)[0].id).toBe(v[0].id);
  });
});
