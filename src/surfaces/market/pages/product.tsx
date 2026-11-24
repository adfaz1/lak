// Product page: price, the seller's identity and responsibility, and every cost before buying.
import { useState } from 'react';
import { BadgeCheck, Check, ChevronLeft, PackageX, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, EmptyState, InfoHint, LinkButton, Money, Skeleton, cn, useTx } from '../../../ds/ui';
import { addLine, deliveryDays, shippingFee } from '../domain';
import { PRODUCTS } from '../fixtures';
import { marketStore, useScreen } from '../state';
import { Facts, H2, ProductGrid, ProductVisual, SellerIdentity, SellerMark, Stepper, sellerOf, useMk } from '../ui';
import { PageError, Title } from './common';

export default function ProductPage({ id }: { id: string }) {
  const { t, lang, city, go } = useMk();
  const tx = useTx();
  const screen = useScreen();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const p = PRODUCTS.find((x) => x.id === id);
  if (screen === 'error') return <PageError title={tx('تعذّر تحميل المنتج', 'This product could not load')} refCode="SIM-MKT-PDP-503" />;
  if (screen === 'loading') return <div className="grid gap-8 md:grid-cols-2" aria-busy="true"><Skeleton className="aspect-square rounded-3xl" /><div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-6 w-32" /><Skeleton className="h-40 rounded-2xl" /></div></div>;
  if (!p || screen === 'empty') return <Card><EmptyState as="h1" icon={<PackageX className="size-6" aria-hidden="true" />} title={t.productNotFound} action={<LinkButton variant="secondary" href={go('')}>{t.backDiscover}</LinkButton>} /></Card>;
  const s = sellerOf(p.seller)!;
  const fee = shippingFee(s, city, p.price * qty);
  const days = deliveryDays(s, city);
  const max = Math.min(10, p.stock);
  const more = PRODUCTS.filter((x) => x.seller === s.id && x.id !== p.id);
  const add = () => { marketStore.set((x) => ({ ...x, cart: addLine(x.cart, p, qty) })); setAdded(true); };

  return (
    <div className="space-y-10">
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="space-y-3">
          <a href={go('', { cat: p.cat })} className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-fg">{t.cats[p.cat]}<ChevronLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" /></a>
          <div className="aspect-square overflow-hidden rounded-3xl border border-border bg-surface-2"><ProductVisual p={p} size="large" /></div>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-[13px] text-muted">{p.brand}</p>
            <Title>{p.name[lang]}</Title>
            <p className="-mt-3 flex items-baseline gap-2"><Money v={p.price} className="text-2xl font-bold text-fg" /><span className="text-xs text-muted">{t.vatIncl}</span></p>
          </div>

          <a href={go(`/s/${s.id}`)} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-brand-300">
            <SellerMark s={s} size={40} />
            <span className="min-w-0 flex-1"><span className="block text-xs text-muted">{t.soldBy}</span><span className="flex items-center gap-1 truncate text-sm font-semibold text-fg">{s.name[lang]}<BadgeCheck className="size-4 shrink-0 text-brand-600 dark:text-brand-300" aria-label={tx('هوية موثقة', 'Verified identity')} /></span></span>
            <ChevronLeft className="size-4 text-muted ltr:rotate-180" aria-hidden="true" />
          </a>

          {p.stock <= 0 ? <Badge tone="gray">{t.outOfStock}</Badge> : (
            <div className="space-y-3">
              <p className={cn('text-[13px]', p.stock <= 5 ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted')}>{t.inStock(p.stock)}</p>
              <div className="flex gap-3">
                <Stepper value={qty} max={max} label={t.qty} onChange={(n) => setQty(Math.max(1, Math.min(max, n)))} />
                <Button size="lg" className="flex-1 bg-brand-gradient hover:opacity-95" onClick={add}>{t.addToCart}</Button>
              </div>
              {added && (
                <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-[13px] text-emerald-800 dark:text-emerald-300">
                  <Check className="size-4" aria-hidden="true" />{t.addedTo(s.name[lang])}<a href={go('/cart')} className="font-semibold underline underline-offset-2">{t.viewCart}</a>
                </p>
              )}
            </div>
          )}

          <Card className="p-5" aria-labelledby="pd-before">
            <H2 id="pd-before" className="mb-1">{t.beforeBuy}<InfoHint>{t.otherFeesBody}</InfoHint></H2>
            <Facts rows={[
              { k: t.price, v: <Money v={p.price * qty} /> },
              { k: t.shippingTo(t.cities[city]), v: fee === null ? <Badge tone="amber">{t.noDelivery(t.cities[city])}</Badge> : fee === 0 ? t.free : <Money v={fee} /> },
              ...(days ? [{ k: t.delivery, v: t.deliveryIn(days[0], days[1]) }] : []),
              { k: t.codFee, v: s.shipping.codFee === null ? <span className="text-muted">{t.codNo}</span> : <Money v={s.shipping.codFee} /> },
              { k: t.returns, v: t.returnsDays(s.returnsDays) },
            ]} />
            {fee !== null && fee > 0 && s.shipping.freeOver !== null && <p className="mt-2 text-xs text-muted">{t.freeOver} <Money v={s.shipping.freeOver} /></p>}
          </Card>

          <section aria-labelledby="pd-desc"><H2 id="pd-desc" className="mb-2">{t.description}</H2><p className="text-sm leading-relaxed text-muted">{p.desc[lang]}</p></section>

          <Card className="p-5" aria-labelledby="pd-resp">
            <H2 id="pd-resp" className="mb-2"><ShieldCheck className="size-4 text-brand-600 dark:text-brand-300" aria-hidden="true" />{t.responsibility}</H2>
            <p className="mb-2 text-[13px] leading-relaxed text-muted">{t.responsibilityBody(s.name[lang])}</p>
            <SellerIdentity s={s} />
          </Card>
        </div>
      </div>

      {more.length > 0 && (
        <section aria-labelledby="pd-more" className="space-y-4">
          <h2 id="pd-more" className="text-lg font-bold text-fg">{t.moreFrom(s.name[lang])}</h2>
          <ProductGrid items={more} />
        </section>
      )}
    </div>
  );
}
