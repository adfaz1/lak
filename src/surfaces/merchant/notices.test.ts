import { describe, expect, it } from 'vitest';
import { allOrders, total, type Order } from './domain';
import {
  approveReturn, awaitingPayment, cancelOrder, composeNotice, confirmTransfer, extendPayDue, markDelivered, markShipped, noticeEvents, noticeFixture, openReturn,
  payDeadline, recordNotices, renderNotice, resendMessage, sendNotice, smsParts, templateIssues, voidLabels, voidableLabels, type Actor, type NoticeCtx,
} from './ops';

const ME: Actor = { name: 'سارة', role: 'owner' };
const T = 1_790_000_000_000;
const byRef = (ref: string) => allOrders().find((o) => o.ref === ref)!;
const ctx: NoticeCtx = { store: 'دار نُوى', trackBase: 'https://lak.test/#/store/track/', contact: { phone: '+966500001001', email: 'c@example.test' }, now: T };
const cfg = noticeFixture();

describe('templates', () => {
  it('fills variables and leaves unknown ones visible', () => {
    expect(renderNotice('{order} · {total} · {oops}', { order: '#1', total: 'SAR 5.00' })).toBe('#1 · SAR 5.00 · {oops}');
    expect(templateIssues('shipped', 'طلبك {order} في الطريق')).toEqual({ unknown: [], missing: ['tracking'], empty: false });
    expect(templateIssues('placed', 'مرحبا {custmer}').unknown).toEqual(['custmer']);
    expect(templateIssues('placed', '  ').empty).toBe(true);
  });
  it('counts SMS parts by script', () => {
    expect(smsParts('a'.repeat(160))).toBe(1);
    expect(smsParts('a'.repeat(161))).toBe(2);
    expect(smsParts('ب'.repeat(70))).toBe(1);
    expect(smsParts('ب'.repeat(71))).toBe(2);
  });
  it('renders in the customer language, with a tracking link per order', () => {
    const o = { ...byRef('10477'), lang: 'en' as const };
    const [sms] = composeNotice(o, 'shipped', cfg, ctx, ME, { only: ['sms'] });
    expect(sms.lang).toBe('en');
    expect(sms.body).toContain('#10477');
    expect(sms.body).toContain('https://lak.test/#/store/track/10477');
    const [ar] = composeNotice(byRef('10477'), 'shipped', cfg, ctx, ME, { only: ['email'] });
    expect(ar.lang).toBe('ar');
    expect(ar.subject).toContain('#10477');
    expect(ar.body).toContain('في الطريق');
  });
  it('skips a channel without an address instead of pretending', () => {
    const msgs = composeNotice(byRef('10482'), 'placed', cfg, { ...ctx, contact: { email: 'x@example.test' } }, ME);
    expect(msgs.map((m) => [m.channel, m.status, m.reason])).toEqual([['email', 'sent', undefined], ['sms', 'skipped', 'noPhone']]);
  });
});

describe('state changes record the message the customer gets', () => {
  const record = (before: Order, after: Order) => recordNotices([before], [after], cfg, () => ctx)[0];
  it('shipped and delivered each send their enabled channels', () => {
    const o = byRef('10478');
    const shipped = record(o, markShipped(o, 'all', ME, T, 'TRK1'));
    expect(shipped.messages?.map((m) => `${m.event}:${m.channel}`)).toEqual(['shipped:email', 'shipped:sms', 'shipped:whatsapp']);
    const delivered = record(shipped, markDelivered(shipped, 'all', ME, T + 1));
    expect(delivered.messages?.slice(3).map((m) => `${m.event}:${m.channel}`)).toEqual(['delivered:sms']);
  });
  it('a cancelled paid order says so; a muted action is logged as not sent', () => {
    const o = byRef('10482');
    const c = cancelOrder(o, 'Out of stock', ME, T).order;
    expect(noticeEvents(o, c).map((e) => e.event)).toEqual(['cancelled']);
    const muted = recordNotices([o], [c], cfg, () => ctx, new Set(['10482']))[0];
    expect(muted.messages?.every((m) => m.status === 'skipped' && m.reason === 'muted')).toBe(true);
  });
  it('a confirmed transfer sends "paid"; a new order sends "placed" or "payment failed"', () => {
    const bank = { ...byRef('10479'), payment: { method: 'bank' as const, state: 'verifying' as const } };
    expect(noticeEvents(bank, confirmTransfer(bank, ME, T)).map((e) => e.event)).toEqual(['paid']);
    expect(noticeEvents(undefined, byRef('10482')).map((e) => e.event)).toEqual(['placed']);
    expect(noticeEvents(undefined, byRef('10479')).map((e) => e.event)).toEqual(['payFailed']);
  });
  it('return stages each notify once, with the return number', () => {
    const o = { ...byRef('10476') };
    const r = openReturn(o, [{ idx: 0, qty: 1, reason: 'size' }], ME, T);
    expect(noticeEvents(o, r.order)).toEqual([{ event: 'returnRequested', returnRef: r.id }]);
    const a = approveReturn(r.order, r.id!, ME, T);
    expect(noticeEvents(r.order, a)).toEqual([{ event: 'returnApproved', returnRef: r.id }]);
  });
  it('nothing changes, nothing is sent; unrelated edits never notify', () => {
    const all = allOrders();
    expect(recordNotices(all, all, cfg, () => ctx)).toBe(all);
    const o = byRef('10482');
    expect(noticeEvents(o, { ...o, tags: ['VIP'] })).toEqual([]);
  });
});

describe('sending on purpose', () => {
  it('a simulated outage fails the channel; resend records a new message linked to the first', () => {
    const o = byRef('10479');
    const failed = sendNotice(o, 'payLink', { ...cfg, simFail: 'sms' }, ctx, ME, { only: ['sms'] });
    const m = failed.messages!.at(-1)!;
    expect(m.status).toBe('failed');
    expect(failed.activity?.at(-1)).toMatchObject({ kind: 'customerMessaged', actor: 'سارة' });
    const again = resendMessage(failed, m.id, cfg, ctx, ME);
    expect(again.messages!.at(-1)).toMatchObject({ status: 'sent', retryOf: m.id, channel: 'sms' });
    expect(resendMessage(again, again.messages!.at(-1)!.id, cfg, ctx, ME)).toBe(again);
  });
  it('extends the payment deadline only for unpaid orders, from the later of now and the old deadline', () => {
    const o = byRef('10479');
    expect(awaitingPayment(o)).toBe(true);
    const due = payDeadline(o, T);
    const x = extendPayDue(o, 2, ME, T);
    expect(x.payDue).toBe(Math.max(T, due) + 2 * 86_400_000);
    const paid = byRef('10482');
    expect(extendPayDue(paid, 2, ME, T)).toBe(paid);
    expect(extendPayDue(o, 0, ME, T)).toBe(o);
  });
});

describe('voiding labels without cancelling', () => {
  it('puts the order back to fulfil with units on the shelf and the hold restored', () => {
    const o: Order = { ...byRef('10478'), fulfilments: [{ ref: 'SIM-10478-1', loc: 'ryd', qty: [2] }], items: byRef('10478').items.map((it) => ({ ...it, reserved: { ryd: 0 } })) };
    expect(voidableLabels(o)).toEqual(['SIM-10478-1']);
    const r = voidLabels(o, ME, T);
    expect(r.order.ship).toBe('none');
    expect(r.order.ful).toBe('none');
    expect(r.order.fulfilments[0]).toMatchObject({ voided: true, qty: [0] });
    expect(r.effects).toEqual([{ sku: o.items[0].sku, loc: 'ryd', reserved: 2, onHand: 2 }]);
    expect(r.order.items[0].reserved).toEqual({ ryd: 2 });
    expect(voidableLabels(r.order)).toEqual([]);
  });
  it('refuses once a parcel is with the carrier', () => {
    expect(voidableLabels(byRef('10477'))).toEqual([]);
    expect(total(byRef('10477'))).toBeGreaterThan(0);
  });
});
