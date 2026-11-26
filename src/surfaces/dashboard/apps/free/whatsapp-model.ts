// WhatsApp Business free app: pure rules. The connection to Meta is simulated; order messages reuse the customer
// notifications engine (merchant/ops.ts), where WhatsApp is the channel this app enables. Cart recovery runs one
// WhatsApp step over abandoned carts and marks recovered carts bought, so the email/SMS sequence stops for them.
// Type-only imports from the merchant layer plus pure helpers: merchant/stores.ts imports this file.
import type { L } from '../../../merchant/domain';
import type { NoticeEvent, CustomerMessage, SkipReason } from '../../../merchant/ops';
import type { Cart } from '../../../merchant/growth';
import type { Customer } from '../../../merchant/workspace';
import type { FreeAppId, Installed } from './registry';

export type WaStatus = 'none' | 'pending' | 'approved' | 'rejected';
export interface WaQuiet { on: boolean; from: number; to: number }
export interface WaSettings extends Record<string, unknown> {
  phone: string;
  displayName: string;
  status: WaStatus;
  /** Why Meta rejected the display name (simulated review). */
  rejectReason?: 'brand' | 'short';
  requestedAt?: string;
  quiet: WaQuiet;
  /** Quiet hours also hold order updates (not only marketing). */
  quietOrders: boolean;
  cart: { on: boolean; afterHours: number; text: L };
  button: { on: boolean; side: 'start' | 'end'; greeting: L };
}

export const WA_DEFAULTS: WaSettings = {
  phone: '', displayName: '', status: 'none',
  quiet: { on: true, from: 22, to: 9 }, quietOrders: false,
  cart: { on: false, afterHours: 2, text: { ar: 'مرحبًا {name}، سلتك في {store} محفوظة: {items}. أكمل طلبك متى ناسبك.', en: 'Hi {name}, your cart at {store} is saved: {items}. Complete your order whenever suits you.' } },
  button: { on: true, side: 'end', greeting: { ar: 'مرحبًا، عندي استفسار', en: 'Hello, I have a question' } },
};
export const WA_CART_HOURS = [1, 2, 4, 6, 12];

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** WhatsApp number in international digits (no +). Saudi 05xxxxxxxx / 5xxxxxxxx become 9665xxxxxxxx. Arabic digits accepted. */
export function normalisePhone(input: string): string | null {
  let d = toLatin(input).replace(/[\s\-()]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  if (!/^\d+$/.test(d)) return null;
  if (/^05\d{8}$/.test(d)) d = `966${d.slice(1)}`;
  else if (/^5\d{8}$/.test(d)) d = `966${d}`;
  if (d.startsWith('966')) return /^9665\d{8}$/.test(d) ? d : null;
  return d.length >= 8 && d.length <= 15 ? d : null;
}
export const formatPhone = (d: string) => (d.startsWith('966') ? `+966 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : `+${d}`);

export type WaError = 'phone' | 'name' | 'nameLong' | 'cartText' | 'cartTextEn' | 'placeholder' | 'greeting' | 'quiet';
/** Problems in the settings before they can be saved. */
export function waErrors(s: WaSettings): WaError[] {
  const out: WaError[] = [];
  if (s.phone.trim() && !normalisePhone(s.phone)) out.push('phone');
  const n = s.displayName.trim();
  if (s.phone.trim() && n.length < 3) out.push('name');
  if (n.length > 40) out.push('nameLong');
  if (s.cart.on) {
    if (!s.cart.text.ar.trim()) out.push('cartText');
    if (!s.cart.text.en.trim()) out.push('cartTextEn');
    if (unknownVars(s.cart.text.ar).length || unknownVars(s.cart.text.en).length) out.push('placeholder');
  }
  if (s.button.on && (!s.button.greeting.ar.trim() || !s.button.greeting.en.trim())) out.push('greeting');
  if (s.quiet.on && s.quiet.from === s.quiet.to) out.push('quiet');
  return out;
}
const CART_VARS = ['name', 'store', 'items'];
export const unknownVars = (t: string) => [...t.matchAll(/\{([^{}\s]+)\}/g)].map((m) => m[1]).filter((v) => !CART_VARS.includes(v));

/**
 * Simulated Meta review of the display name: a name that uses "WhatsApp" or is shorter than three letters is
 * rejected (Meta's display-name rules); anything else is approved.
 */
export function reviewName(name: string): { status: 'approved' } | { status: 'rejected'; reason: 'brand' | 'short' } {
  const n = name.trim();
  if (/whats\s*app|واتس\s*اب|واتساب/i.test(n)) return { status: 'rejected', reason: 'brand' };
  if (n.replace(/\s/g, '').length < 3) return { status: 'rejected', reason: 'short' };
  return { status: 'approved' };
}

export const inQuietHours = (q: WaQuiet, hour: number) => q.on && q.from !== q.to && (q.from < q.to ? hour >= q.from && hour < q.to : hour >= q.from || hour < q.to);
/** Hour of the day in Riyadh (UTC+3). */
export const riyadhHourOf = (now: number) => (new Date(now).getUTCHours() + 3) % 24;

export const waSettingsOf = (apps: Partial<Record<FreeAppId, Installed>>): WaSettings => {
  const s = (apps.whatsapp?.settings ?? {}) as Partial<WaSettings>;
  return { ...WA_DEFAULTS, ...s, quiet: { ...WA_DEFAULTS.quiet, ...s.quiet }, cart: { ...WA_DEFAULTS.cart, ...s.cart }, button: { ...WA_DEFAULTS.button, ...s.button } };
};
/** Sending works only when the app is installed, on, and the number is approved. */
export const waLive = (apps: Partial<Record<FreeAppId, Installed>>) => !!apps.whatsapp?.on && waSettingsOf(apps).status === 'approved';

/**
 * Gate for the WhatsApp channel of customer order messages: 'off' while the app is not live (nothing is composed),
 * 'noConsent' without the customer's mobile-messaging consent, 'quiet' during quiet hours when they hold order
 * updates; null = send.
 */
export function whatsappGate(apps: Partial<Record<FreeAppId, Installed>>, customer: Pick<Customer, 'consent'> | undefined, now: number): 'off' | SkipReason | null {
  if (!waLive(apps)) return 'off';
  if (!customer?.consent.sms) return 'noConsent';
  const s = waSettingsOf(apps);
  if (s.quietOrders && inQuietHours(s.quiet, riyadhHourOf(now))) return 'quiet';
  return null;
}

/* ---------- Results from the order book ---------- */

export interface EventStats { event: NoticeEvent; sent: number; failed: number; skipped: number }
/** WhatsApp messages per order event, from the messages recorded on orders. */
export function messageStats(orders: { messages?: CustomerMessage[] }[]): EventStats[] {
  const map = new Map<NoticeEvent, EventStats>();
  for (const o of orders) for (const m of o.messages ?? []) {
    if (m.channel !== 'whatsapp') continue;
    const r = map.get(m.event) ?? { event: m.event, sent: 0, failed: 0, skipped: 0 };
    r[m.status] += 1;
    map.set(m.event, r);
  }
  return [...map.values()].sort((a, b) => b.sent + b.failed + b.skipped - (a.sent + a.failed + a.skipped));
}

/* ---------- Cart recovery step ---------- */

export type WaCartReason = 'noConsent' | 'optedOut' | 'tooOld' | 'bought' | 'quiet' | 'early' | 'done';
export interface WaDelivery { id: string; cartId: string; status: 'sent' | 'failed' | 'deferred'; at: number; result?: { revenue: number } }
export const WA_CART_MAX_H = 168;

/** Why a cart gets no WhatsApp message now; null = due. */
export function cartBlock(c: Cart, s: WaSettings, done: WaDelivery[], hour: number): WaCartReason | null {
  if (done.some((d) => d.cartId === c.id && d.status !== 'deferred')) return 'done';
  if (c.purchased) return 'bought';
  if (c.optedOut) return 'optedOut';
  if (c.hoursAgo > WA_CART_MAX_H) return 'tooOld';
  if (c.hoursAgo < s.cart.afterHours) return 'early';
  if (!c.smsConsent) return 'noConsent';
  if (inQuietHours(s.quiet, hour)) return 'quiet';
  return null;
}
export function cartPlan(carts: Cart[], s: WaSettings, done: WaDelivery[], hour: number) {
  const due: Cart[] = [];
  const blocked: Partial<Record<WaCartReason, number>> = {};
  for (const c of carts) {
    const b = cartBlock(c, s, done, hour);
    if (b) blocked[b] = (blocked[b] ?? 0) + 1; else due.push(c);
  }
  return { due, blocked, value: due.reduce((t, c) => t + c.value, 0) };
}
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
/** Simulated provider result and purchase: deterministic per cart (about 1 in 12 numbers rejected, 1 in 4 messaged carts bought). */
export const simFails = (cartId: string) => hash(`wa-fail:${cartId}`) % 12 === 0;
export const simBuys = (cartId: string) => hash(`wa-buy:${cartId}`) % 4 === 0;

/** Send the due carts (simulated). Returns new deliveries and the carts marked recovered (campaign 'WA'). */
export function runCartStep(carts: Cart[], s: WaSettings, done: WaDelivery[], now: number, hour: number): { deliveries: WaDelivery[]; carts: Cart[]; sent: number; failed: number; recovered: number } {
  const plan = cartPlan(carts, s, done, hour);
  const ids = new Set(plan.due.map((c) => c.id));
  const add: WaDelivery[] = [];
  let next = carts;
  for (const c of plan.due) {
    if (simFails(c.id)) { add.push({ id: `WA-${c.id}`, cartId: c.id, status: 'failed', at: now }); continue; }
    const d: WaDelivery = { id: `WA-${c.id}`, cartId: c.id, status: 'sent', at: now };
    if (simBuys(c.id)) {
      d.result = { revenue: c.value };
      next = next.map((x) => (x.id === c.id ? { ...x, purchased: true, recovered: { campaign: 'WA', revenue: c.value, discount: 0 } } : x));
    }
    add.push(d);
  }
  const kept = done.filter((d) => !ids.has(d.cartId));
  return { deliveries: [...add, ...kept], carts: next, sent: add.filter((d) => d.status === 'sent').length, failed: add.filter((d) => d.status === 'failed').length, recovered: add.filter((d) => d.result).length };
}
export function renderCartText(t: string, v: { name: string; store: string; items: string }) {
  return t.replace(/\{(name|store|items)\}/g, (_, k: 'name' | 'store' | 'items') => v[k]);
}
export const cartResults = (done: WaDelivery[]) => ({
  sent: done.filter((d) => d.status === 'sent').length,
  failed: done.filter((d) => d.status === 'failed').length,
  recovered: done.filter((d) => d.result).length,
  revenue: done.reduce((t, d) => t + (d.result?.revenue ?? 0), 0),
});

/* ---------- Floating button ---------- */

export type WaPage = 'product' | 'category' | 'cart' | 'other';
/** Prefilled message for the page the shopper is on. */
export function prefill(s: WaSettings, lang: 'ar' | 'en', page: WaPage, name?: string): string {
  const g = s.button.greeting[lang].trim();
  if (page === 'product' && name) return lang === 'ar' ? `${g}، عن المنتج: ${name}` : `${g}, about: ${name}`;
  if (page === 'category' && name) return lang === 'ar' ? `${g}، عن قسم: ${name}` : `${g}, about the ${name} section`;
  if (page === 'cart') return lang === 'ar' ? `${g}، بخصوص سلتي` : `${g}, about my cart`;
  return g;
}
export const waMeLink = (phoneDigits: string, text: string) => `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
/** The button shows only when the app is on, the button is on and the number is valid (approval is not needed for a chat link). */
export function buttonTarget(apps: Partial<Record<FreeAppId, Installed>>): { phone: string; s: WaSettings } | null {
  if (!apps.whatsapp?.on) return null;
  const s = waSettingsOf(apps);
  const phone = normalisePhone(s.phone);
  return s.button.on && phone ? { phone, s } : null;
}
