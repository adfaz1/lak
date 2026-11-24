// Cart grouped by store. Each store is paid, shipped and returned separately; a unified cart is an open decision.
import { Split, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { Badge, Button, Card, EmptyState, IconButton, LinkButton, Money, useTx } from '../../../ds/ui';
import { Alert } from '../../../ds/kit';
import { checkoutBlock, groupCart, removeSeller, setQty } from '../domain';
import { PRODUCTS, SELLERS } from '../fixtures';
import { marketStore, useScreen } from '../state';
import { ProductVisual, SellerMark, Stepper, useMk, useMoneyText } from '../ui';
import { ListSkeleton, PageError, Title } from './common';

export function SeparateNote() {
  const { t } = useMk();
  const tx = useTx();
  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><Split className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{t.interim}<Badge tone="amber">{tx('قرار مفتوح', 'Open decision')}</Badge></p>
        <p className="text-[13px] leading-relaxed text-muted">{t.interimBody}</p>
        <p className="text-xs text-subtle">{t.interimNote}</p>
      </div>
    </div>
  );
}

export default function CartPage() {
  const { t, lang, city, go } = useMk();
  const tx = useTx();
  const money = useMoneyText();
  const screen = useScreen();
  const s = marketStore.use();
  const cart = screen === 'empty' ? [] : s.cart;
  const groups = groupCart(cart, PRODUCTS, SELLERS, city);
  const units = cart.reduce((n, l) => n + l.qty, 0);
  if (screen === 'error') return <><Title>{t.cartTitle}</Title><PageError title={tx('تعذّر تحميل السلة', 'Your cart could not load')} refCode="SIM-MKT-CRT-503" /></>;
  if (screen === 'loading') return <><Title>{t.cartTitle}</Title><ListSkeleton /></>;
  if (!groups.length) return (
    <>
      <Title>{t.cartTitle}</Title>
      <Card><EmptyState as="h2" icon={<ShoppingBag className="size-6" aria-hidden="true" />} title={t.cartEmpty} action={<LinkButton href={go('')}>{t.startShopping}</LinkButton>}>{t.interimBody}</EmptyState></Card>
    </>
  );

  return (
    <>
      <Title sub={`${t.units(units)} · ${t.checkoutsNeeded(groups.length)}`}>{t.cartTitle}</Title>
      <div className="space-y-5">
        <SeparateNote />
        <ol className="space-y-5">
          {groups.map((g, i) => {
            const block = checkoutBlock(g, 'card');
            return (
              <li key={g.seller.id}>
                <Card aria-labelledby={`cg-${g.seller.id}`}>
                  <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                    <SellerMark s={g.seller} size={36} />
                    <div className="min-w-0 flex-1">
                      <h2 id={`cg-${g.seller.id}`} className="truncate text-[15px] font-semibold text-fg"><a href={go(`/s/${g.seller.id}`)} className="hover:text-brand-700 dark:hover:text-brand-300">{g.seller.name[lang]}</a></h2>
                      <p className="text-xs text-muted">{t.shipsFrom(t.cities[g.seller.city])} · {t.units(g.units)}</p>
                    </div>
                    <Badge>{tx(`دفعة ${i + 1} من ${groups.length}`, `Payment ${i + 1} of ${groups.length}`)}</Badge>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.lines.map((l) => (
                      <li key={l.product.id} className="flex gap-3 px-5 py-4">
                        <a href={go(`/p/${l.product.id}`)} tabIndex={-1} aria-hidden="true" className="size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2"><ProductVisual p={l.product} /></a>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <a href={go(`/p/${l.product.id}`)} className="line-clamp-2 text-sm font-semibold text-fg hover:text-brand-700 dark:hover:text-brand-300">{l.product.name[lang]}</a>
                            <Money v={l.total} className="text-sm font-semibold text-fg" />
                          </div>
                          <p className="text-xs text-muted"><Money v={l.product.price} /></p>
                          <div className="flex items-center gap-2">
                            <Stepper value={l.qty} max={Math.min(10, l.product.stock)} label={`${t.qty}: ${l.product.name[lang]}`} onChange={(n) => marketStore.set((x) => ({ ...x, cart: setQty(x.cart, l.product, n) }))} />
                            <IconButton label={t.removeItem(l.product.name[lang])} onClick={() => marketStore.set((x) => ({ ...x, cart: setQty(x.cart, l.product, 0) }))}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-3 border-t border-border bg-surface-2/40 px-5 py-4">
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-3"><dt className="text-muted">{t.subtotal}</dt><dd><Money v={g.subtotal} /></dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-muted">{t.shippingTo(t.cities[city])}</dt><dd>{g.shipping === null ? '—' : g.shipping === 0 ? t.free : <Money v={g.shipping} />}</dd></div>
                      <div className="flex justify-between gap-3 border-t border-border pt-2 text-base font-bold"><dt>{t.total}</dt><dd><Money v={g.total} /></dd></div>
                      <div className="flex justify-between gap-3 text-xs text-muted"><dt>{t.vatIn}</dt><dd><Money v={g.vat} /></dd></div>
                    </dl>
                    {g.toFree > 0 && <p className="flex items-center gap-2 text-xs text-muted"><Truck className="size-4" aria-hidden="true" />{t.toFree(money(g.toFree))}</p>}
                    {block && <Alert tone="warn">{t.blocks[block]}</Alert>}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button variant="ghost" size="sm" onClick={() => marketStore.set((x) => ({ ...x, cart: removeSeller(x.cart, PRODUCTS, g.seller.id) }))}>{t.removeStore}</Button>
                      {block ? <Button disabled>{t.checkoutWith(g.seller.name[lang])}</Button>
                        : <LinkButton href={go(`/checkout/${g.seller.id}`)}>{t.checkoutWith(g.seller.name[lang])} · <Money v={g.total} /></LinkButton>}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
