/* Data hooks for pages: the live fixture stores, or nothing at all when review mode forces the empty state. */
import type { Cart, Order, Product } from './domain';
import { cartStore, catalogStore, ordersStore } from './state';
import { useSfState } from './review';

const NO_PRODUCTS: Product[] = [];
const NO_ORDERS: Order[] = [];
const NO_CART: Cart = { lines: [] };

export function useCatalog(): Product[] {
  const all = catalogStore.use();
  return useSfState() === 'empty' ? NO_PRODUCTS : all;
}
export function useCart(): Cart {
  const c = cartStore.use();
  return useSfState() === 'empty' ? NO_CART : c;
}
export function useOrders(): Order[] {
  const o = ordersStore.use();
  return useSfState() === 'empty' ? NO_ORDERS : o;
}
