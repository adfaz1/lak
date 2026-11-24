/* Data hooks for pages. The catalogue, settings and order book are the merchant's live stores, mapped through
   bridge.ts; review mode can force the empty state. */
import { useMemo } from 'react';
import { catalogXStore, categoriesStore, couponsStore, customersStore, levelsStore, ordersStore as merchantOrders, productsStore, settingsStore } from '../merchant/stores';
import { arrangeStoreCategories } from '../merchant/catalog';
import { checkoutStore as checkoutSettingsStore } from '../dashboard/settings/stores';
import type { Cart, Order, Product } from './domain';
import { categoriesOf, fromMerchant, linkContext, storeConfig, toStoreProducts, withMerchant, type Category, type StoreConfig } from './bridge';
import { contentStore } from '../dashboard/storefront/state';
import { resolveMenu } from '../dashboard/storefront/content';
import { cartStore, ordersStore } from './state';
import { useSfState } from './review';

const NO_PRODUCTS: Product[] = [];
const NO_ORDERS: Order[] = [];
const NO_CART: Cart = { lines: [] };

/** Products the merchant sells online, with live prices and stock. */
export function useCatalog(): Product[] {
  const ps = productsStore.use();
  const lv = levelsStore.use();
  // Brands, fields, size charts, pre-orders and restrictions (dashboard → Products) shape what the store shows.
  const x = catalogXStore.use();
  const all = useMemo(() => toStoreProducts(ps, lv, x), [ps, lv, x]);
  return useSfState() === 'empty' ? NO_PRODUCTS : all;
}
export function useCategories(): Category[] {
  const products = useCatalog();
  const cats = categoriesStore.use();
  // Menu order and visibility come from the merchant's categories (dashboard → Products → Categories).
  return useMemo(() => arrangeStoreCategories(categoriesOf(products), cats), [products, cats]);
}
/** Store name, payment methods, COD limits, return window and shipping zones from the merchant's settings. */
export function useConfig(): StoreConfig {
  const s = settingsStore.use();
  const ck = checkoutSettingsStore.use();
  return useMemo(() => storeConfig(s, ck), [s, ck]);
}
export function useCoupons() {
  return couponsStore.use();
}
export function useCart(): Cart {
  const c = cartStore.use();
  return useSfState() === 'empty' ? NO_CART : c;
}
/**
 * Every online-store order as the shopper sees it: checkouts from this session, with the merchant's fulfilment and
 * shipment overlaid, plus the merchant's other online orders (history, lookups by reference and mobile).
 */
export function useOrders(): Order[] {
  const records = ordersStore.use();
  const book = merchantOrders.use();
  const ps = productsStore.use();
  const customers = customersStore.use();
  const all = useMemo(() => {
    const now = Date.now();
    const mine = new Set(records.map((r) => r.ref));
    const byRef = new Map(book.map((m) => [m.ref, m]));
    const seen = records.map((r) => withMerchant(r, byRef.get(r.ref), now));
    const byId = new Map(customers.map((c) => [c.id, c]));
    const byName = new Map(customers.map((c) => [c.name.en, c]));
    const rest = book.filter((m) => m.channel === 'online' && !mine.has(m.ref))
      .map((m) => fromMerchant(m, ps, (m.customerId && byId.get(m.customerId)) || byName.get(m.customer.en), now));
    return [...seen, ...rest];
  }, [records, book, ps, customers]);
  return useSfState() === 'empty' ? NO_ORDERS : all;
}

/** The merchant's live header/footer menus (broken or unpublished links skipped), served pages and store SEO. */
export function useStoreContent() {
  const content = contentStore.use();
  const ps = productsStore.use();
  const lv = levelsStore.use();
  const policies = settingsStore.use().policies;
  return useMemo(() => {
    const ctx = linkContext(ps, lv, content.pages, policies);
    return { header: resolveMenu(content.menus.live.header, ctx), footer: resolveMenu(content.menus.live.footer, ctx), pages: content.pages, seo: content.seo };
  }, [content, ps, lv, policies]);
}
