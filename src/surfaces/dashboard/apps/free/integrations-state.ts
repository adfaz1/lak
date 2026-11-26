// Session state for the WhatsApp, Google, accounting, currency and QR free apps that is not a setting: simulated
// deliveries, link visits and the orders they led to, and the shopper's chosen display currency. Settings live in
// `freeAppsStore` (registry.ts). "Reset data" clears all of it.
import { createStore } from '../../../../core/store';
import type { WaDelivery } from './whatsapp-model';
import { LINK_TOUCH_DAYS } from './qr-model';

/** WhatsApp cart-recovery messages (simulated). */
export const waDeliveriesStore = createStore.key('dashboard.freeApps.waDeliveries')<WaDelivery[]>(() => []);
/** Short-link visits per link code in this session. */
export const linkVisitsStore = createStore.key('dashboard.freeApps.linkVisits')<Record<string, number>>(() => ({}));
/** The shopper's last short-link visit (the storefront's "cookie"). */
export const linkTouchStore = createStore.key('storefront.linkTouch')<{ code: string; at: number } | null>(() => null);
/** Order reference → link code it is credited to (once per order). */
export const linkOrdersStore = createStore.key('dashboard.freeApps.linkOrders')<Record<string, string>>(() => ({}));
/** Display currency the shopper picked in the store header ('SAR' = none). */
export const shopperCurrencyStore = createStore.key('storefront.currency')<string>(() => 'SAR');

/** Storefront: a shopper opened a short link. */
export function recordLinkVisit(code: string, now = Date.now()): void {
  linkVisitsStore.set((v) => ({ ...v, [code]: (v[code] ?? 0) + 1 }));
  linkTouchStore.set({ code, at: now });
}
/** Storefront: an order was placed; credit it to the link visited within LINK_TOUCH_DAYS. */
export function attributeLinkOrder(ref: string, now = Date.now()): void {
  const t = linkTouchStore.get();
  if (!t || now - t.at > LINK_TOUCH_DAYS * 86_400_000) return;
  linkOrdersStore.set((m) => (m[ref] ? m : { ...m, [ref]: t.code }));
}
