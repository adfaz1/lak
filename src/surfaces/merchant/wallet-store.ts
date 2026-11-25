// Session stores for the customer wallet and cashback (rules in wallet.ts). The dashboard, the customer profile,
// the refund dialog, finance and the online-store checkout all read these, so a movement made anywhere shows everywhere.
// Simulated: no money moves, nothing is sent.
import { createStore } from '../../core/store';
import { cashbackFixtures, syncCashback, syncExpiry, unspendWallet, walletFixtures, walletSettingsFixture, type CashbackOffer, type WalletSettings, type WalletTxn } from './wallet';
import { customerEventsStore, customersStore, ordersStore, productsStore, settingsStore } from './stores';
import { returnDaysFrom } from '../storefront/bridge';

export const WALLET_TODAY = '2026-11-24';
export const walletStore = createStore.key('merchant.walletStore')<WalletTxn[]>(walletFixtures);
export const walletSettingsStore = createStore.key('merchant.walletSettingsStore')<WalletSettings>(walletSettingsFixture);
export const cashbackStore = createStore.key('merchant.cashbackStore')<CashbackOffer[]>(cashbackFixtures);
/** Expiry reminders the merchant sent (simulated), newest first. */
export const walletRemindersStore = createStore.key('merchant.walletReminders')<{ id: string; at: string; by: string; count: number; amount: number; channel: 'email' | 'sms' }[]>(() => []);

/** The shopper's wallet choice at checkout (online store): on/off and the amount chosen (null = as much as allowed). */
export const walletCheckoutStore = createStore.key('storefront.walletCheckout')<{ on: boolean; amount: number | null }>(() => ({ on: false, amount: null }));

export const returnWindowDays = () => returnDaysFrom(settingsStore.get().policies);

/** Bring the ledger up to date: expired remainders and cashback that became due. Safe to call often. */
export function syncWallet(today = WALLET_TODAY): void {
  const before = walletStore.get();
  let next = syncExpiry(before, today);
  next = syncCashback(next, cashbackStore.get(), ordersStore.get(), productsStore.get(), customersStore.get(), returnWindowDays(), today);
  // Credit paid on an order that was then cancelled goes back to the wallet.
  for (const o of ordersStore.get()) if (o.cancelled && next.some((t) => t.kind === 'spend' && t.orderRef === o.ref)) next = unspendWallet(next, o.ref, today);
  if (next !== before) walletStore.set(next);
}

/** A line on the customer's activity timeline. */
export function walletEvent(customerId: string, text: string, by: string): void {
  customerEventsStore.set((all) => ({ ...all, [customerId]: [{ id: `E${Date.now()}${Math.round(Math.random() * 1000)}`, kind: 'wallet', text, by, at: Date.now() }, ...(all[customerId] ?? [])] }));
}
