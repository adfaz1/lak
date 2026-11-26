import { describe, expect, it } from 'vitest';
import { WA_DEFAULTS, cartPlan, messageStats, normalisePhone, prefill, reviewName, runCartStep, waErrors, whatsappGate, buttonTarget, type WaSettings } from './whatsapp-model';
import type { Installed } from './registry';
import type { Cart } from '../../../merchant/growth';

const app = (s: Partial<WaSettings>, on = true): { whatsapp: Installed } => ({ whatsapp: { on, installedAt: '', settings: { ...WA_DEFAULTS, ...s } } });
const cart = (id: string, x: Partial<Cart> = {}): Cart => ({ id, customer: { ar: 'س', en: 'S' }, value: 10000, hoursAgo: 5, emailConsent: true, smsConsent: true, purchased: false, optedOut: false, contactedByAutomation: false, ...x });
// 12:00 Riyadh = 09:00 UTC
const NOON = Date.UTC(2026, 10, 26, 9);
const NIGHT = Date.UTC(2026, 10, 26, 20); // 23:00 Riyadh

describe('whatsapp phone and name', () => {
  it('normalises Saudi numbers, Arabic digits and international form', () => {
    expect(normalisePhone('٠٥٠١٢٣٤٥٦٧')).toBe('966501234567');
    expect(normalisePhone('+966 50 123 4567')).toBe('966501234567');
    expect(normalisePhone('00971501234567')).toBe('971501234567');
    expect(normalisePhone('+966 40 123 4567')).toBeNull();
    expect(normalisePhone('abc')).toBeNull();
  });
  it('rejects display names using the WhatsApp brand or too short (simulated review)', () => {
    expect(reviewName('دار نوى')).toEqual({ status: 'approved' });
    expect(reviewName('Dar WhatsApp')).toEqual({ status: 'rejected', reason: 'brand' });
    expect(reviewName('ab')).toEqual({ status: 'rejected', reason: 'short' });
  });
  it('validates settings', () => {
    expect(waErrors({ ...WA_DEFAULTS, phone: '123' })).toContain('phone');
    expect(waErrors({ ...WA_DEFAULTS, cart: { ...WA_DEFAULTS.cart, on: true, text: { ar: 'مرحبًا {nme}', en: 'Hi' } } })).toContain('placeholder');
    expect(waErrors({ ...WA_DEFAULTS, phone: '0501234567', displayName: 'دار نوى' })).toEqual([]);
  });
});

describe('whatsapp gate for order messages', () => {
  const consent = { consent: { email: true, sms: true } };
  it('is off until installed, on and approved', () => {
    expect(whatsappGate({}, consent, NOON)).toBe('off');
    expect(whatsappGate(app({ status: 'pending' }), consent, NOON)).toBe('off');
    expect(whatsappGate(app({ status: 'approved' }, false), consent, NOON)).toBe('off');
    expect(whatsappGate(app({ status: 'approved' }), consent, NOON)).toBeNull();
  });
  it('needs consent and holds order updates in quiet hours only when chosen', () => {
    expect(whatsappGate(app({ status: 'approved' }), { consent: { email: true, sms: false } }, NOON)).toBe('noConsent');
    expect(whatsappGate(app({ status: 'approved' }), undefined, NOON)).toBe('noConsent');
    expect(whatsappGate(app({ status: 'approved' }), consent, NIGHT)).toBeNull();
    expect(whatsappGate(app({ status: 'approved', quietOrders: true }), consent, NIGHT)).toBe('quiet');
  });
});

describe('whatsapp results and cart step', () => {
  it('counts WhatsApp messages per event only', () => {
    const m = (event: 'shipped' | 'paid', channel: 'whatsapp' | 'sms', status: 'sent' | 'failed' | 'skipped') => ({ id: 'x', event, channel, status, lang: 'ar' as const, body: '', at: 0, actor: 's', role: 's' });
    const stats = messageStats([{ messages: [m('shipped', 'whatsapp', 'sent'), m('shipped', 'whatsapp', 'failed'), m('shipped', 'sms', 'sent'), m('paid', 'whatsapp', 'skipped')] }]);
    expect(stats).toEqual([{ event: 'shipped', sent: 1, failed: 1, skipped: 0 }, { event: 'paid', sent: 0, failed: 0, skipped: 1 }]);
  });
  it('plans only due carts with consent, outside quiet hours, once', () => {
    const s = { ...WA_DEFAULTS, cart: { ...WA_DEFAULTS.cart, on: true, afterHours: 2 } };
    const carts = [cart('a'), cart('b', { smsConsent: false }), cart('c', { hoursAgo: 1 }), cart('d', { purchased: true }), cart('e', { hoursAgo: 200 })];
    const p = cartPlan(carts, s, [], 12);
    expect(p.due.map((c) => c.id)).toEqual(['a']);
    expect(p.blocked).toEqual({ noConsent: 1, early: 1, bought: 1, tooOld: 1 });
    expect(cartPlan(carts, s, [], 23).blocked.quiet).toBe(1);
    const run = runCartStep(carts, s, [], NOON, 12);
    expect(run.sent + run.failed).toBe(1);
    expect(cartPlan(run.carts, s, run.deliveries, 12).due).toEqual([]);
  });
  it('marks recovered carts bought with campaign WA so the sequence stops', () => {
    const s = { ...WA_DEFAULTS, cart: { ...WA_DEFAULTS.cart, on: true, afterHours: 1 } };
    const carts = Array.from({ length: 40 }, (_, i) => cart(`K${i}`));
    const run = runCartStep(carts, s, [], NOON, 12);
    expect(run.recovered).toBeGreaterThan(0);
    const rec = run.carts.filter((c) => c.recovered);
    expect(rec.every((c) => c.purchased && c.recovered!.campaign === 'WA')).toBe(true);
    expect(rec.length).toBe(run.recovered);
  });
  it('prefills the message per page and shows the button only with a valid number', () => {
    expect(prefill(WA_DEFAULTS, 'ar', 'product', 'عباية')).toBe('مرحبًا، عندي استفسار، عن المنتج: عباية');
    expect(prefill(WA_DEFAULTS, 'en', 'cart')).toBe('Hello, I have a question, about my cart');
    expect(buttonTarget(app({ phone: '' }))).toBeNull();
    expect(buttonTarget(app({ phone: '0501234567' }))?.phone).toBe('966501234567');
    expect(buttonTarget(app({ phone: '0501234567' }, false))).toBeNull();
  });
});

describe('notices engine gate', () => {
  it('drops WhatsApp when off and records consent/quiet skips', async () => {
    const { composeNotice, noticeFixture, SYSTEM } = await import('../../../merchant/ops');
    const { fixtures } = await import('../../../merchant/domain');
    const o = fixtures()[0];
    const cfg = noticeFixture();
    const ctx = { store: 'S', trackBase: '#/t/', contact: { phone: '+966500000000', email: 'a@b.c' }, now: NOON };
    expect(composeNotice(o, 'shipped', cfg, { ...ctx, gate: { whatsapp: 'off' } }, SYSTEM).map((m) => m.channel)).toEqual(['email', 'sms']);
    const wa = composeNotice(o, 'shipped', cfg, { ...ctx, gate: { whatsapp: 'noConsent' } }, SYSTEM).find((m) => m.channel === 'whatsapp')!;
    expect([wa.status, wa.reason]).toEqual(['skipped', 'noConsent']);
    expect(composeNotice(o, 'shipped', cfg, ctx, SYSTEM).find((m) => m.channel === 'whatsapp')!.status).toBe('sent');
  });
});
