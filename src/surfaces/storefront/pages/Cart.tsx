import { AlertTriangle, Lock, ShoppingBag, Truck } from 'lucide-react';
import { Button, EmptyState, LinkButton, Money, cn } from '../../../ds/ui';
import { Alert } from '../../../ds/kit';
import { settingsStore } from '../../merchant/stores';
import { shopperView } from '../../dashboard/storefront/model';
import { MERCHANT, SHIP_METHODS, computeTotals, itemCount, pricedLines, removeLine, setQty, validateCart, variantById } from '../domain';
import { Breakdown, CouponBox, H1, H3, PANEL, ProductPhoto, Stepper, WRAP, to, useS, variantLabel } from '../kit';
import { cartStore, couponResult } from '../state';
import { useCart, useCatalog } from '../data';

export default function CartPage() {
  const { t, l, lang, m } = useS();
  const cart = useCart();
  const products = useCatalog();
  const canOrder = shopperView(settingsStore.use().status) === 'open';
  const lines = pricedLines(cart, products);
  const issues = validateCart(cart, products);
  const c = couponResult(cart, products);
  const discount = c?.status === 'valid' ? c.discount : 0;
  const totals = computeTotals(lines, { discount, ship: SHIP_METHODS[0] });
  const goods = totals.subtotal - totals.discount;
  const n = itemCount(cart);
  const progress = Math.min(100, Math.round((goods / MERCHANT.freeShippingFrom) * 100));

  if (!cart.lines.length) {
    return (
      <div className={cn(WRAP, 'py-16')}>
        <EmptyState as="h1" icon={<ShoppingBag className="size-6" aria-hidden="true" />} title={t.bagEmpty}
          action={<LinkButton href={to('/c/all')} size="lg">{t.keepShopping}</LinkButton>}>{t.bagEmptyB}</EmptyState>
      </div>
    );
  }

  const checkoutBtn = issues.length > 0 || !canOrder ? (
    <Button size="lg" className="h-12 w-full" disabled aria-describedby="sf-blocked">{t.toCheckout}</Button>
  ) : (
    <LinkButton href={to('/checkout')} size="lg" className="h-12 w-full"><Lock className="size-4" aria-hidden="true" />{t.toCheckout}</LinkButton>
  );

  return (
    <div className={cn(WRAP, 'py-6 sm:py-10')}>
      <header className="mb-6 flex items-baseline gap-3"><h1 className={H1}>{t.bagTitle}</h1><p className="text-muted tabular-nums">{t.items(String(n))}</p></header>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        <section aria-label={t.bagTitle} className="min-w-0">
          {issues.length > 0 && <div className="mb-4"><Alert tone="warn" title={t.blocked} /></div>}
          <ul className="divide-y divide-border border-y border-border">
            {cart.lines.map((line) => {
              const f = variantById(products, line.vid);
              const issue = issues.find((i) => i.vid === line.vid);
              if (!f) {
                return (
                  <li key={line.vid} className="flex items-center gap-3 py-5">
                    <p className="flex-1 text-sm">{t.issueMissing}</p>
                    <Button size="sm" variant="secondary" onClick={() => cartStore.set((x) => removeLine(x, line.vid))}>{t.remove}</Button>
                  </li>
                );
              }
              const { product: p, variant: v } = f;
              const name = l(p.name);
              const href = to(`/p/${p.id}`, { color: v.color, size: v.size });
              return (
                <li key={line.vid} className="flex gap-4 py-5">
                  <a href={href} tabIndex={-1} aria-hidden="true" className="w-24 shrink-0 sm:w-28"><ProductPhoto p={p} color={v.color} className="rounded-xl" /></a>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <a href={href} className="line-clamp-2 text-[15px] font-medium hover:underline hover:underline-offset-4">{name}</a>
                        <p className="mt-0.5 text-[13px] text-muted">{variantLabel(p, v.color, v.size, lang)}</p>
                        {line.qty > 1 && <p className="text-[13px] text-muted"><Money v={v.price} /> {t.each}</p>}
                      </div>
                      <Money v={v.price * line.qty} className="shrink-0 font-semibold" />
                    </div>
                    {issue && issue.kind !== 'missing' && (
                      <p role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1">{issue.kind === 'sold_out' ? t.issueSold : t.issueReduced(String(issue.available))}</span>
                        {issue.kind === 'reduced' && <button type="button" className="font-semibold underline underline-offset-2" onClick={() => cartStore.set((x) => setQty(x, line.vid, issue.available, v.stock))}>{t.setTo(String(issue.available))}</button>}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      {v.stock > 0 ? (
                        <Stepper value={line.qty} max={Math.max(1, Math.min(v.stock, 10))} label={t.qtyFor(name)} decLabel={t.dec} incLabel={t.inc}
                          onChange={(q) => cartStore.set((x) => setQty(x, line.vid, q, v.stock))} onRemove={() => cartStore.set((x) => removeLine(x, line.vid))} removeLabel={t.removeN(name)} />
                      ) : <span />}
                      <button type="button" className="text-[13px] font-medium text-muted underline-offset-4 hover:text-fg hover:underline" aria-label={t.removeN(name)} onClick={() => cartStore.set((x) => removeLine(x, line.vid))}>{t.remove}</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <a href={to('/c/all')} className="mt-5 inline-block text-sm font-semibold underline-offset-4 hover:underline">{t.keepShopping}</a>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className={cn(PANEL, 'space-y-5 p-5 sm:p-6')}>
            <h2 className={H3}>{t.summary}</h2>
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-[13px]"><Truck className="size-4 shrink-0 text-muted" aria-hidden="true" />{goods >= MERCHANT.freeShippingFrom ? t.freeOk : t.freeLeft(m(MERCHANT.freeShippingFrom - goods))}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t.freeProgress}>
                <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <CouponBox products={products} />
            <Breakdown totals={totals} shippingLabel={t.shipEst} shippingNote={t.shipNote} coupon={c?.status === 'valid' ? c.code : undefined} />
            {checkoutBtn}
            {(issues.length > 0 || !canOrder) && <p id="sf-blocked" className="text-[13px] text-amber-800 dark:text-amber-300">{!canOrder ? t.browseOnly : t.blocked}</p>}
            <p className="text-center text-xs text-muted">{t.payList}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
