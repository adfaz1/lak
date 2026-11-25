// Wholesale session state (simulated): buyer accounts, customer groups, price lists, quotes and the merchant's
// wholesale settings. No buyer or company is pre-filled: buyers come from the application form or the merchant.
// The one price list row set is a labelled example of the merchant's own prices («مثال للتجربة»), editable.
import { createStore } from '../../../core/store';
import { defaultSettings, type Buyer, type Group, type PriceList, type Quote, type WholesaleSettings } from '../../merchant/wholesale';

export interface WholesaleState {
  buyers: Buyer[];
  groups: Group[];
  lists: PriceList[];
  quotes: Quote[];
  settings: WholesaleSettings;
  /** The price list still marked as the example the merchant has not edited yet. */
  example: boolean;
  /** Unsaved price-list edits per group (kept for the session). */
  drafts: Record<string, PriceList>;
}
export const wsStore = createStore.key('dashboard.wholesale')<WholesaleState>(() => ({
  buyers: [],
  groups: [{ id: 'g1', name: { ar: 'تجار التجزئة', en: 'Retailers' } }],
  lists: [{ group: 'g1', rows: [
    { productId: 'p3', tiers: [{ min: 6, price: 9000 }, { min: 24, price: 8200 }] },
    { productId: 'p14', tiers: [{ min: 12, price: 4200 }, { min: 48, price: 3800 }] },
    { productId: 'p5', tiers: [{ min: 5, price: 11500 }] },
  ] }],
  quotes: [],
  settings: defaultSettings(),
  example: true,
  drafts: {},
}));
export const setWs = (f: (s: WholesaleState) => Partial<WholesaleState>) => wsStore.set((s) => ({ ...s, ...f(s) }));
