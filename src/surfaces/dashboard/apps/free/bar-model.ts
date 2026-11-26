// Free-shipping bar & countdown (free app): rules only. The threshold is the merchant's own free-delivery amount for
// the shopper's zone (Settings → Shipping zones, read through storefront/bridge.ts). A countdown exists only for a
// real offer or coupon that is live now and has an end date: no end date, not started, used up or paused = no timer.
import type { L, Order } from '../../../merchant/domain';
import type { Coupon } from '../../../merchant/growth';
import type { Customer, Zone } from '../../../merchant/workspace';
import { freeDeliveryOffer, zoneFor } from '../../../storefront/bridge';

export interface BarSettings {
  progress: boolean;
  countdown: boolean;
  /** Which offer to count down: a coupon code, or '' = the live offer that ends soonest. */
  offer: string;
  top: boolean;
  product: boolean;
  bag: boolean;
}
export const BAR_DEFAULTS: BarSettings = { progress: true, countdown: true, offer: '', top: true, product: true, bag: true };

export type BarError = 'nothing' | 'where' | 'offer';
export function barProblems(s: BarSettings, coupons: Coupon[], now: number): BarError[] {
  const out: BarError[] = [];
  if (!s.progress && !s.countdown) out.push('nothing');
  if (!s.top && !s.product && !s.bag) out.push('where');
  if (s.countdown && s.offer && offerEnd(coupons.find((c) => c.code === s.offer), now) === null) out.push('offer');
  return out;
}

/** The free-delivery threshold for a city (its zone's), else the lowest one the merchant set; undefined = none set. */
export function threshold(zones: Zone[], city?: L): { from: number; zone: L } | undefined {
  const z = city ? zoneFor(zones, city) : undefined;
  if (z) return z.freeOver !== null ? { from: z.freeOver, zone: z.name } : undefined;
  return freeDeliveryOffer(zones);
}

export function progressOf(goods: number, from: number): { left: number; pct: number; reached: boolean } {
  const left = Math.max(0, from - goods);
  return { left, pct: from > 0 ? Math.min(100, Math.round((Math.max(0, goods) / from) * 100)) : 100, reached: left === 0 };
}

const RIYADH = 3 * 3_600_000;
const today = (now: number) => new Date(now + RIYADH).toISOString().slice(0, 10);
/** End of the offer's last day (23:59:59 Riyadh) when it is live at `now`, else null (no end date = no countdown). */
export function offerEnd(c: Coupon | undefined, now: number): number | null {
  if (!c || c.status !== 'active' || !c.ends || c.origin) return null;
  const d = today(now);
  if (c.starts > d || c.ends < d) return null;
  if (c.limitTotal !== null && c.used >= c.limitTotal) return null;
  return Date.parse(`${c.ends}T23:59:59+03:00`);
}
/** Offers that can be counted down now, soonest end first. */
export function countable(coupons: Coupon[], now: number): { code: string; ends: number; auto: boolean }[] {
  return coupons.flatMap((c) => { const e = offerEnd(c, now); return e === null ? [] : [{ code: c.code, ends: e, auto: !!c.auto }]; }).sort((a, b) => a.ends - b.ends);
}
/** The countdown to show: the chosen offer if still live, else the soonest-ending live offer when none was chosen. */
export function countdownFor(s: Pick<BarSettings, 'countdown' | 'offer'>, coupons: Coupon[], now: number): { code: string; ends: number; auto: boolean } | null {
  if (!s.countdown) return null;
  const list = countable(coupons, now);
  return (s.offer ? list.find((x) => x.code === s.offer) : list[0]) ?? null;
}
/** Days, hours, minutes and seconds left (never negative). */
export function timeLeft(ends: number, now: number): { d: number; h: number; m: number; s: number; over: boolean } {
  const ms = Math.max(0, ends - now);
  const sec = Math.floor(ms / 1000);
  return { d: Math.floor(sec / 86400), h: Math.floor((sec % 86400) / 3600), m: Math.floor((sec % 3600) / 60), s: sec % 60, over: ms === 0 };
}

/**
 * Share of real bags that reached their zone's free-delivery amount: online orders (goods after discount, by the
 * delivery city) and saved carts (by the customer's city, else the lowest threshold). Cancelled orders are left out.
 */
export function crossedShare(zones: Zone[], orders: Order[], carts: { value: number; customerId?: string }[], customers: Customer[]): { bags: number; crossed: number; share: number | null; noThreshold: boolean } {
  if (!zones.some((z) => z.freeOver !== null)) return { bags: 0, crossed: 0, share: null, noThreshold: true };
  const cityOf = (c: L): L => ({ ar: c.ar.split('،')[0].trim(), en: c.en.split(',')[0].trim() });
  let bags = 0, crossed = 0;
  for (const o of orders) {
    if (o.channel !== 'online' || o.cancelled) continue;
    const t = threshold(zones, o.city.en || o.city.ar ? cityOf(o.city) : undefined);
    if (!t) continue;
    bags++;
    const goods = o.items.reduce((s, i) => s + i.qty * i.unit, 0) - (o.discount ?? 0);
    if (goods >= t.from) crossed++;
  }
  const byId = new Map(customers.map((c) => [c.id, c]));
  for (const c of carts) {
    const city = c.customerId ? byId.get(c.customerId)?.city : undefined;
    const t = threshold(zones, city && (city.en || city.ar) ? city : undefined);
    if (!t) continue;
    bags++;
    if (c.value >= t.from) crossed++;
  }
  return { bags, crossed, share: bags ? crossed / bags : null, noThreshold: false };
}
