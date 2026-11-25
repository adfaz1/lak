// POS session state (simulated, kept for this tab session): cashier PINs and discount limits the merchant sets,
// who is signed in at which location, the cart in progress (so leaving the page keeps it), held sales and shifts.
// PINs are stored as typed: a real platform would hash them on the server.
import { createStore } from '../../../core/store';
import { defaultLimits, emptyCart, type Cart, type DiscountLimits, type HeldSale, type Shift, type Tender } from '../../merchant/pos';

export interface Exchange { orderRef: string; picks: number[]; restock: boolean; credit: number; reason: string }
export interface PosState {
  /** Member id → PIN. Demo PINs for the two active members (shown only in review mode). */
  pins: Record<string, string>;
  limits: DiscountLimits;
  session: { memberId: string; loc: string } | null;
  cart: Cart;
  tenders: Tender[];
  exchange: Exchange | null;
  held: HeldSale[];
  shifts: Shift[];
  receiptNote: string;
}
export const posStore = createStore.key('dashboard.pos')<PosState>(() => ({
  pins: { u1: '1234', u2: '2468' },
  limits: defaultLimits(),
  session: null,
  cart: emptyCart(),
  tenders: [],
  exchange: null,
  held: [],
  shifts: [],
  receiptNote: '',
}));
export const setPos = (f: (s: PosState) => Partial<PosState>) => posStore.set((s) => ({ ...s, ...f(s) }));
