// Orders: one store per order, with payment, fulfilment, shipment and return kept as separate states.
import { useState } from 'react';
import { ChevronLeft, MessageCircle, Package, RotateCcw } from 'lucide-react';
import { useReviewMode } from '../../../core/review';
import { Button, Card, EmptyState, LinkButton, Money, Ref, useTx } from '../../../ds/ui';
import { Alert, Field, Select, Simulated } from '../../../ds/kit';
import { requestReturn, returnBlock, type Order } from '../domain';
import type { Note } from '../fixtures';
import { marketStore, now, useScreen } from '../state';
import { H2, OrderStates, SellerMark, fmtDate, sellerOf, useMk } from '../ui';
import { ListSkeleton, PageError, Title } from './common';

export function OrdersPage() {
  const { t, lang, go } = useMk();
  const tx = useTx();
  const screen = useScreen();
  const s = marketStore.use();
  const orders = screen === 'empty' ? [] : s.orders;
  return (
    <>
      <Title sub={t.ordersSub}>{t.ordersTitle}</Title>
      {screen === 'error' ? <PageError title={tx('تعذّر تحميل طلباتك', 'Your orders could not load')} refCode="SIM-MKT-ORD-503" />
        : screen === 'loading' ? <ListSkeleton />
        : orders.length === 0 ? <Card><EmptyState as="h2" icon={<Package className="size-6" aria-hidden="true" />} title={t.noOrders} action={<LinkButton href={go('')}>{t.startShopping}</LinkButton>} /></Card>
        : (
          <ul className="space-y-3">
            {orders.map((o) => {
              const seller = sellerOf(o.seller)!;
              return (
                <li key={o.ref}>
                  <a href={go(`/orders/${o.ref}`)} className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-brand-300 sm:p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <SellerMark s={seller} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg">{t.orderRef} <Ref>{o.ref}</Ref></p>
                        <p className="truncate text-xs text-muted">{seller.name[lang]} · {fmtDate(o.createdAt, lang)}</p>
                      </div>
                      <Money v={o.total} className="text-sm font-bold text-fg" />
                      <ChevronLeft className="size-4 shrink-0 text-muted ltr:rotate-180" aria-hidden="true" />
                    </div>
                    <OrderStates o={o} compact />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
    </>
  );
}

export function OrderPage({ ref_ }: { ref_: string }) {
  const { t, lang, go, route } = useMk();
  const tx = useTx();
  const review = useReviewMode();
  const screen = useScreen();
  const s = marketStore.use();
  const [reason, setReason] = useState('size');
  const [sent, setSent] = useState(false);
  const back = { href: go('/orders'), label: t.allOrders };
  if (screen === 'error') return <><Title back={back}>{t.orderRef} <Ref>{ref_}</Ref></Title><PageError title={tx('تعذّر تحميل الطلب', 'This order could not load')} refCode="SIM-MKT-ORD-503" /></>;
  if (screen === 'loading') return <><Title back={back}>{t.orderRef} <Ref>{ref_}</Ref></Title><ListSkeleton /></>;
  const o = screen === 'empty' ? undefined : s.orders.find((x) => x.ref === ref_);
  if (!o) return <><Title back={back}>{t.orderRef} <Ref>{ref_}</Ref></Title><Card><EmptyState as="h2" icon={<Package className="size-6" aria-hidden="true" />} title={t.orderNotFound} action={<LinkButton variant="secondary" href={go('/orders')}>{t.allOrders}</LinkButton>} /></Card></>;
  const seller = sellerOf(o.seller)!;
  const block = returnBlock(o, seller, now());
  const update = (fn: (x: Order) => Order, note?: Note['kind']) => marketStore.set((x) => ({
    ...x, seq: x.seq + 1,
    orders: x.orders.map((y) => (y.ref === o.ref ? fn(y) : y)),
    notes: note ? [{ id: `n${x.seq}-${note}`, at: now(), kind: note, ref: o.ref, read: false }, ...x.notes] : x.notes,
  }));

  return (
    <>
      <Title back={back} sub={`${seller.name[lang]} · ${fmtDate(o.createdAt, lang)} · ${t.cities[o.city]}`}>{t.orderRef} <Ref>{o.ref}</Ref></Title>
      <div className="space-y-5">
        {route.query.get('placed') && <Alert tone="ok" title={t.orderPlaced}>{o.method === 'cod' ? t.confirmCod : t.confirmCard}</Alert>}
        <Card className="p-5"><OrderStates o={o} /></Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4 p-5" aria-labelledby="od-i">
            <H2 id="od-i">{t.items}</H2>
            <ul className="space-y-2 text-sm">{o.lines.map((l) => <li key={l.productId} className="flex justify-between gap-3"><a href={go(`/p/${l.productId}`)} className="min-w-0 truncate hover:text-brand-700 dark:hover:text-brand-300">{l.name[lang]} <span className="text-muted">× {l.qty}</span></a><Money v={l.price * l.qty} /></li>)}</ul>
            <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{t.subtotal}</dt><dd><Money v={o.subtotal} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t.shipping}</dt><dd>{o.shipping === 0 ? t.free : <Money v={o.shipping} />}</dd></div>
              {o.codFee > 0 && <div className="flex justify-between"><dt className="text-muted">{t.codFee}</dt><dd><Money v={o.codFee} /></dd></div>}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><dt>{t.total}</dt><dd><Money v={o.total} /></dd></div>
            </dl>
          </Card>

          <Card className="space-y-4 p-5" aria-labelledby="od-s">
            <H2 id="od-s">{t.sellerSupport}</H2>
            <a href={go(`/s/${seller.id}`)} className="flex items-center gap-3"><SellerMark s={seller} size={32} /><span className="text-sm font-semibold text-fg hover:text-brand-700 dark:hover:text-brand-300">{seller.name[lang]}</span></a>
            <p className="text-[13px] text-muted">{t.sellerHandles(seller.name[lang])}</p>
            <LinkButton variant="secondary" size="sm" href={go('/help', { order: o.ref })}><MessageCircle className="size-4" aria-hidden="true" />{t.contactSeller}</LinkButton>
            <div className="space-y-3 border-t border-border pt-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg"><RotateCcw className="size-4 text-muted" aria-hidden="true" />{t.requestReturn}<span className="text-xs font-normal text-muted">· {t.returnsDays(seller.returnsDays)}</span></p>
              {block ? <p className="text-[13px] text-muted">{t.returnBlocks[block]}</p> : (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); update((x) => requestReturn(x, seller, now(), reason), 'returnRequested'); setSent(true); }}>
                  <Field label={t.returnReason}>{(p) => <Select {...p} value={reason} onChange={(e) => setReason(e.target.value)}>{Object.entries(t.reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
                  <div className="flex flex-wrap items-center gap-2"><Button type="submit" variant="secondary">{t.sendReturn}</Button><Simulated /></div>
                </form>
              )}
              {sent && o.ret === 'requested' && <Alert tone="ok">{t.returnSent}</Alert>}
              <p className="text-xs text-subtle">{t.refundNote}</p>
            </div>
          </Card>
        </div>

        {review && o.ship !== 'delivered' && (
          <section className="space-y-2 rounded-2xl border border-dashed border-border p-4" aria-label={t.testPanel}>
            <p className="flex items-center gap-2 text-xs font-semibold text-muted">{tx('مراجعة: تقدّم الشحنة', 'Review: shipment progress')}<Simulated /></p>
            <p className="text-xs text-muted">{t.testShip}</p>
            {o.ship === 'none' && <Button size="sm" variant="secondary" onClick={() => update((x) => ({ ...x, ful: 'fulfilled', ship: 'in_transit' }), 'shipped')}>{t.markShipped}</Button>}
            {o.ship === 'in_transit' && <Button size="sm" variant="secondary" onClick={() => update((x) => ({ ...x, ship: 'delivered', deliveredAt: now(), pay: x.pay === 'cod_due' ? 'collected' : x.pay }), 'delivered')}>{t.markDelivered}</Button>}
          </section>
        )}
      </div>
    </>
  );
}
