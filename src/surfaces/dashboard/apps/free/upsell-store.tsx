// Recommendations in the online store (free app «upsell», only when installed and on): «Often bought with» on product
// pages and one suggestion in the bag, from real co-purchases (upsell-model.ts). Adds are recorded for the results.
import { useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button, cn, useTx } from '../../../../ds/ui';
import { ordersStore, productsStore } from '../../../merchant/stores';
import { addToCart, type Product } from '../../../storefront/domain';
import { cartStore } from '../../../storefront/state';
import { useCart, useCatalog } from '../../../storefront/data';
import { H3, PANEL, ProductPhoto, to, useS } from '../../../storefront/kit';
import { freeAppsStore, isOn } from './registry';
import { UPSELL_DEFAULTS, bagSuggestion, coPurchases, suggestionsFor, type Suggestion, type UpsellSettings } from './upsell-model';
import { countShown, recordAdd, settingsOf } from './store-runtime';

export function useUpsell(): { s: UpsellSettings | null; co: ReturnType<typeof coPurchases> } {
  const apps = freeAppsStore.use();
  const orders = ordersStore.use();
  const products = productsStore.use();
  const co = useMemo(() => coPurchases(orders, products), [orders, products]);
  return { s: isOn(apps, 'upsell') ? settingsOf(apps, 'upsell', UPSELL_DEFAULTS) : null, co };
}

/** One suggested product: photo, name, price, and add (single option) or choose options. */
export function SuggestCard({ p, sug, from, preview }: { p: Product; sug: Suggestion; from: 'product' | 'bag'; preview?: boolean }) {
  const tx = useTx();
  const { l, m } = useS();
  const only = p.variants.length === 1 ? p.variants[0] : undefined;
  const price = Math.min(...p.variants.map((v) => v.price));
  const add = () => {
    if (!only || preview) return;
    cartStore.set((c) => addToCart(c, only.id, 1, only.stock));
    recordAdd({ productId: p.id, sku: only.sku ?? '', at: Date.now(), from });
  };
  return (
    <li className="flex items-center gap-3">
      <a href={to(`/p/${p.id}`)} tabIndex={-1} aria-hidden="true" className="w-16 shrink-0"><ProductPhoto p={p} variant="thumb" className="rounded-lg" /></a>
      <div className="min-w-0 flex-1">
        <a href={to(`/p/${p.id}`)} className="line-clamp-2 text-sm font-medium hover:underline">{l(p.name)}</a>
        <p className="text-[13px] text-muted">{m(price)}{sug.together > 0 && !sug.manual ? ` · ${tx(`مع ${sug.together} طلبًا`, `in ${sug.together} orders`)}` : ''}</p>
      </div>
      {only ? <Button size="sm" variant="secondary" onClick={add} aria-label={tx(`أضف ${l(p.name)} للحقيبة`, `Add ${l(p.name)} to bag`)}><Plus className="size-4" aria-hidden="true" />{tx('أضف', 'Add')}</Button>
        : <a href={to(`/p/${p.id}`)} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('اختر', 'Choose')}</a>}
    </li>
  );
}

/** «Often bought with» on a product page. */
export function StoreOftenBought({ productId, className }: { productId: string; className?: string }) {
  const tx = useTx();
  const { s, co } = useUpsell();
  const store = useCatalog();
  const bag = useCart().lines.map((x) => x.vid.split('~')[0]);
  const list = s && s.productBlock ? suggestionsFor(productId, co, s, store, bag) : [];
  useEffect(() => { if (list.length) countShown('upsell', `up:p:${productId}`); }, [list.length, productId]);
  if (!list.length) return null;
  const byId = new Map(store.map((p) => [p.id, p]));
  return (
    <section aria-labelledby="sf-often-h" className={cn(PANEL, 'space-y-3 p-5', className)} data-free-app="upsell">
      <h2 id="sf-often-h" className={H3}>{tx('يُشترى معه عادة', 'Often bought with')}</h2>
      <ul className="space-y-3">{list.map((x) => <SuggestCard key={x.id} p={byId.get(x.id)!} sug={x} from="product" />)}</ul>
    </section>
  );
}

/** One suggestion under the bag's lines. */
export function StoreBagSuggestion() {
  const tx = useTx();
  const { s, co } = useUpsell();
  const store = useCatalog();
  const bag = [...new Set(useCart().lines.map((x) => x.vid.split('~')[0]))];
  const sug = s && s.bagSuggest ? bagSuggestion(bag, co, s, store) : null;
  useEffect(() => { if (sug) countShown('upsell', `up:bag:${sug.id}`); }, [sug?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = sug && store.find((x) => x.id === sug.id);
  if (!sug || !p) return null;
  return (
    <section aria-labelledby="sf-bagsug-h" className={cn(PANEL, 'mt-5 space-y-3 p-4')} data-free-app="upsell">
      <h2 id="sf-bagsug-h" className="text-sm font-semibold">{tx('قد يعجبك مع طلبك', 'You may like with your order')}</h2>
      <ul><SuggestCard p={p} sug={sug} from="bag" /></ul>
    </section>
  );
}
