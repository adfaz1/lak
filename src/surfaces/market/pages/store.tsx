// A store's page inside the marketplace: the seller's own identity, legal details, shipping and returns, products.
import { MapPin, Search, ShieldCheck, Store, Truck } from 'lucide-react';
import { Card, EmptyState, LinkButton, useTx } from '../../../ds/ui';
import { PRODUCTS } from '../fixtures';
import { useScreen } from '../state';
import { H2, ProductGrid, SellerIdentity, SellerMark, ShippingFacts, sellerOf, useMk } from '../ui';
import { GridSkeleton, PageError } from './common';

export default function StorePage({ id }: { id: string }) {
  const { t, lang, go } = useMk();
  const tx = useTx();
  const screen = useScreen();
  const s = sellerOf(id);
  if (screen === 'error') return <PageError title={tx('تعذّر تحميل المتجر', 'This store could not load')} refCode="SIM-MKT-STR-503" />;
  if (!s) return <Card><EmptyState as="h1" icon={<Store className="size-6" aria-hidden="true" />} title={t.storeNotFound} action={<LinkButton variant="secondary" href={go('')}>{t.backDiscover}</LinkButton>} /></Card>;
  const items = screen === 'empty' ? [] : PRODUCTS.filter((p) => p.seller === id);
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-border bg-surface">
        <div className="h-20 sm:h-28" style={{ background: `linear-gradient(135deg, ${s.colour}, color-mix(in oklab, ${s.colour} 55%, white))` }} aria-hidden="true" />
        <div className="flex flex-col gap-3 px-5 pb-5 sm:flex-row sm:items-end sm:gap-4 sm:px-8">
          <SellerMark s={s} size={72} className="-mt-9 ring-4 ring-surface" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-fg">{s.name[lang]}</h1>
            <p className="mt-1 text-sm text-muted">{s.tagline[lang]}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"><span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{t.cities[s.city]}</span><span>{t.onLakSince(s.since)}</span></p>
          </div>
          <LinkButton variant="secondary" className="self-start sm:self-auto" href={go('', { store: s.id })}><Search className="size-4" aria-hidden="true" />{t.searchStore}</LinkButton>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5" aria-labelledby="st-id"><H2 id="st-id" className="mb-2"><ShieldCheck className="size-4 text-brand-600 dark:text-brand-300" aria-hidden="true" />{t.identity}</H2><SellerIdentity s={s} /></Card>
        <Card className="p-5" aria-labelledby="st-sp"><H2 id="st-sp" className="mb-2"><Truck className="size-4 text-brand-600 dark:text-brand-300" aria-hidden="true" />{t.shippingPolicy}</H2><ShippingFacts s={s} /></Card>
      </div>

      <section aria-labelledby="st-pr" className="space-y-4">
        <h2 id="st-pr" className="text-lg font-bold text-fg">{t.storeProducts} · {t.results(items.length)}</h2>
        {screen === 'loading' ? <GridSkeleton n={4} /> : items.length ? <ProductGrid items={items} />
          : <Card><EmptyState icon={<Store className="size-6" aria-hidden="true" />} title={tx('لا منتجات معروضة من هذا المتجر الآن', 'This store has nothing listed right now')} action={<LinkButton variant="secondary" href={go('')}>{t.backDiscover}</LinkButton>} /></Card>}
      </section>
    </div>
  );
}
