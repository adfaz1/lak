import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock, FlaskConical, PackageCheck, RefreshCw, RotateCcw, ShoppingBag, Truck } from 'lucide-react';
import { navigate, type Route } from '../../../core/router';
import { Alert, Field, Input } from '../../../ds/kit';
import { Badge, Button, EmptyState, LinkButton, Money, Ref, cn, useTx, type Tone } from '../../../ds/ui';
import {
  addToCart, advanceFulfilment, canAdvance, cityById, cleanPhone, isSettled, returnEligibility, shipById, variantById,
  type FulState, type Order, type PayState, type ShipState,
} from '../domain';
import { Breakdown, Crumbs, H1, H3, PANEL, ProductPhoto, SimNote, WRAP, districtLabel, to, useS, variantLabel } from '../kit';
import { CUSTOMER, accountStore, cartStore, checkStatus, updateOrder } from '../state';
import { useCatalog, useOrders } from '../data';
import { simNow, useSim } from '../review';

export const payTone = (s: PayState): Tone =>
  s === 'paid' || s === 'cod_collected' ? 'green' : s === 'declined' ? 'red' : s === 'verifying' || s === 'challenge' || s === 'awaiting' ? 'amber' : 'sky';
export const fulTone = (s: FulState): Tone => (s === 'fulfilled' ? 'green' : s === 'unfulfilled' ? 'gray' : 'sky');
export const shipTone = (s: ShipState): Tone => (s === 'delivered' ? 'green' : s === 'none' ? 'gray' : 'sky');

/** Who may see an order: the signed-in owner, the session that placed it, or someone who knows reference + mobile. */
export function canView(o: Order, mobile?: string | null): boolean {
  if (!o.key.startsWith('fixture-')) return true;
  if (accountStore.get().signedIn && o.customerId === CUSTOMER.id) return true;
  return !!mobile && cleanPhone(mobile) === o.contact.phone;
}

function NoOrder() {
  const { t } = useS();
  return (
    <div className={cn(WRAP, 'py-16')}>
      <EmptyState as="h1" title={t.noOrder} action={<><LinkButton href={to('/track')}>{t.trackTitle}</LinkButton><LinkButton href={to()} variant="secondary">{t.storeHome}</LinkButton></>}>{t.noOrderHint}</EmptyState>
    </div>
  );
}

export function Lines({ o }: { o: Order }) {
  const { l, lang } = useS();
  const products = useCatalog();
  return (
    <ul className="space-y-4">
      {o.lines.map((line) => {
        const f = variantById(products, line.vid);
        if (!f) return null;
        return (
          <li key={line.vid} className="flex items-center gap-3">
            <span className="relative w-14 shrink-0">
              <ProductPhoto p={f.product} color={f.variant.color} variant="thumb" />
              <span className="absolute -top-2 -end-2 grid min-w-5 place-items-center rounded-full bg-fg px-1.5 text-[11px] font-bold leading-5 text-bg tabular-nums">{line.qty}</span>
            </span>
            <span className="min-w-0 flex-1"><span className="line-clamp-1 block text-sm font-medium">{l(f.product.name)}</span><span className="block text-xs text-muted">{variantLabel(f.product, f.variant.color, f.variant.size, lang)}</span></span>
            <Money v={line.amount} className="text-sm" />
          </li>
        );
      })}
    </ul>
  );
}

function Details({ o, stack }: { o: Order; stack?: boolean }) {
  const { t, l, lang, dl } = useS();
  const sm = shipById(o.ship)!;
  const h = 'mb-1 text-xs font-semibold text-muted';
  return (
    <div className={cn('grid gap-5 text-sm', !stack && 'sm:grid-cols-3')}>
      {o.address && (
        <div>
          <h3 className={h}>{o.ship === 'pickup' ? l(sm.name) : t.deliverAddr}</h3>
          {o.ship === 'pickup' ? <p>{l(sm.note)}</p> : (
            <p className="leading-relaxed">{o.address.name} · <bdi dir="ltr">+966 {o.address.phone}</bdi><br />
              {o.address.street} {o.address.building}، {districtLabel(o.address.city, o.address.district, lang)}، {l(cityById(o.address.city)?.name ?? { ar: '', en: '' })}
              {o.address.nationalCode && <><br /><bdi dir="ltr">{o.address.nationalCode}</bdi></>}</p>
          )}
        </div>
      )}
      <div>
        <h3 className={h}>{t.sShip}</h3>
        <p>{l(sm.name)}</p>
        {o.eta && o.ship !== 'pickup' && <p className="text-muted">{t.etaRange(dl(o.eta.from), dl(o.eta.to))}</p>}
      </div>
      <div>
        <h3 className={h}>{t.method}</h3>
        <p>{t.methods[o.pay.method]}</p>
      </div>
    </div>
  );
}

/** Payment, fulfilment and shipment are separate facts; they are never merged into one status. */
function Statuses({ o }: { o: Order }) {
  const { t } = useS();
  const pickup = o.ship === 'pickup';
  const row = (label: string, badge: ReactNode) => <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-sm text-muted">{label}</dt><dd>{badge}</dd></div>;
  return (
    <dl className="divide-y divide-border">
      {row(t.payment, <Badge tone={payTone(o.pay.state)}>{t.payS[o.pay.state]}</Badge>)}
      {row(t.fulfilment, <Badge tone={fulTone(o.ful)}>{pickup && o.ful === 'fulfilled' ? t.fulPickup : t.fulS[o.ful]}</Badge>)}
      {row(t.shipment, <Badge tone={shipTone(o.shipment)}>{pickup ? t.shipPickup : t.shipS[o.shipment]}</Badge>)}
    </dl>
  );
}

function Summary({ o }: { o: Order }) {
  const { t } = useS();
  return (
    <div className={cn(PANEL, 'space-y-5 p-5 sm:p-6')}>
      <h2 className={H3}>{t.summary}</h2>
      <Lines o={o} />
      <Breakdown totals={o.totals} coupon={o.coupon} />
    </div>
  );
}

export function OrderPage({ reference }: { reference: string }) {
  const { t, d, time } = useS();
  const orders = useOrders();
  const sim = useSim();
  const [checked, setChecked] = useState<number | null>(null);
  const o = orders.find((x) => x.ref === reference);
  if (!o || !canView(o)) return <NoOrder />;

  const verifying = o.pay.state === 'verifying' || o.pay.state === 'challenge';
  const failed = o.pay.state === 'declined' || o.pay.state === 'awaiting';
  const ok = isSettled(o.pay.state);
  const steps = o.pay.method === 'cod' ? t.nextCod : t.nextPaid;
  const icon = ok ? <CheckCircle2 className="size-8" aria-hidden="true" /> : verifying ? <Clock className="size-8" aria-hidden="true" /> : <AlertTriangle className="size-8" aria-hidden="true" />;

  return (
    <div className={cn(WRAP, 'py-8 sm:py-12')}>
      <header className="mx-auto mb-10 flex max-w-xl flex-col items-center text-center">
        <span className={cn('grid size-16 place-items-center rounded-full', ok ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : verifying ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'bg-red-500/10 text-red-700 dark:text-red-400')}>{icon}</span>
        <h1 className={cn(H1, 'mt-5')}>{ok ? t.thanks : verifying ? t.verifyingT : t.notDoneT}</h1>
        <p className="mt-2 text-sm text-muted">{t.ref}: <Ref><span className="font-semibold text-fg">{o.ref}</span></Ref> · {t.placedOn(d(o.at))}</p>
        {verifying && <p className="mt-3 leading-relaxed text-muted">{t.verifyingB}</p>}
        {failed && <p className="mt-3 leading-relaxed text-muted" role="status">{t.notDoneB}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {ok && <LinkButton href={to(`/track/${o.ref}`)} size="lg"><Truck className="size-4" aria-hidden="true" />{t.trackOrder}</LinkButton>}
          {ok && <LinkButton href={to('/c/all')} size="lg" variant="secondary">{t.keepShopping}</LinkButton>}
          {verifying && (
            <Button size="lg" onClick={() => { const n = checkStatus(o.ref, simNow(sim.review).verify); if (n?.pay.state === 'verifying') setChecked(Date.now()); }}>
              <RefreshCw className="size-4" aria-hidden="true" />{t.checkStatus}
            </Button>
          )}
          {failed && <LinkButton href={to('/checkout')} size="lg">{t.backToCheckout}</LinkButton>}
        </div>
        {verifying && checked && <div className="mt-4 w-full text-start"><Alert tone="info">{t.stillUnknown(time(checked))}</Alert></div>}
        {verifying && sim.review && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><FlaskConical className="size-3.5" aria-hidden="true" />{t.tpVerify}: {t.verifyRes[sim.verify]}</p>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <div className="min-w-0 space-y-5">
          <section aria-labelledby="sf-st-h" className={cn(PANEL, 'p-5 sm:p-6')}>
            <h2 id="sf-st-h" className={cn(H3, 'mb-2')}>{t.status}</h2>
            <Statuses o={o} />
          </section>
          {ok && (
            <section aria-labelledby="sf-next-h" className={cn(PANEL, 'p-5 sm:p-6')}>
              <h2 id="sf-next-h" className={cn(H3, 'mb-4')}>{t.next}</h2>
              <ol className="space-y-3">
                {(o.ship === 'pickup' ? [steps[0], steps[1], t.nextPickup] : steps).map((s, i) => (
                  <li key={s} className="flex gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold tabular-nums">{i + 1}</span><span className="pt-0.5 leading-relaxed">{s}</span></li>
                ))}
              </ol>
            </section>
          )}
          <section className={cn(PANEL, 'p-5 sm:p-6')} aria-label={t.deliverAddr}><Details o={o} /></section>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start"><Summary o={o} /></aside>
      </div>
    </div>
  );
}

export function TrackLookup({ route }: { route: Route }) {
  const { t } = useS();
  const orders = useOrders();
  const [ref, setRef] = useState(route.query.get('ref') ?? '');
  const [mobile, setMobile] = useState('');
  const [miss, setMiss] = useState(false);
  const find = () => {
    const r = ref.trim().toUpperCase().replace(/^#/, '');
    const o = orders.find((x) => x.ref === r || x.ref === `DN-${r}`);
    if (o && cleanPhone(mobile) === o.contact.phone) navigate(to(`/track/${o.ref}`, { m: cleanPhone(mobile) }));
    else setMiss(true);
  };
  return (
    <div className={cn(WRAP, 'max-w-lg py-10 sm:py-16')}>
      <h1 className={H1}>{t.trackTitle}</h1>
      <p className="mt-2 text-muted">{t.trackSub}</p>
      <form className={cn(PANEL, 'mt-6 space-y-4 p-5 sm:p-6')} noValidate onSubmit={(e) => { e.preventDefault(); find(); }}>
        <Field id="sf-t-ref" label={t.ref}>
          {(p) => <Input {...p} dir="ltr" value={ref} placeholder="DN-24788" className="h-11" onChange={(e) => { setRef(e.target.value); setMiss(false); }} />}
        </Field>
        <Field id="sf-t-m" label={t.phone} error={miss ? t.noTrackMatch : null}>
          {(p) => (
            <div className="flex" dir="ltr">
              <span className="grid h-11 place-items-center rounded-s-xl border border-e-0 border-border bg-surface-2 px-3 text-sm text-muted" aria-hidden="true">+966</span>
              <Input {...p} type="tel" inputMode="tel" value={mobile} placeholder="5X XXX XXXX" className="h-11 rounded-s-none" onChange={(e) => { setMobile(e.target.value); setMiss(false); }} />
            </div>
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full">{t.find}</Button>
      </form>
      <p className="mt-4 text-xs text-muted">{t.sampleOrder} <Ref>DN-24788</Ref> · <Ref>501234567</Ref></p>
    </div>
  );
}

const SHIP_STEPS: ShipState[] = ['label', 'in_transit', 'out_for_delivery', 'delivered'];

export function TrackPage({ reference, route }: { reference: string; route: Route }) {
  const { t, d, dl, time, m } = useS();
  const tx = useTx();
  const orders = useOrders();
  accountStore.use();
  const products = useCatalog();
  const sim = useSim();
  const [reordered, setReordered] = useState<string | null>(null);
  const mobile = route.query.get('m');
  const o = orders.find((x) => x.ref === reference);
  if (!o || !canView(o, mobile)) return <NoOrder />;

  const pickup = o.ship === 'pickup';
  const progress = [
    { k: 'ordered', label: t.steps.ordered, done: isSettled(o.pay.state) },
    { k: 'shipped', label: t.steps.shipped, done: SHIP_STEPS.indexOf(o.shipment) >= 1 },
    { k: 'out', label: t.steps.out, done: SHIP_STEPS.indexOf(o.shipment) >= 2 },
    { k: 'delivered', label: t.steps.delivered, done: o.shipment === 'delivered' },
  ];
  const ret = returnEligibility(o, products, Date.now());
  const reorder = () => {
    let added = 0;
    cartStore.set((c) => o.lines.reduce((acc, line) => {
      const f = variantById(products, line.vid);
      if (!f || f.variant.stock <= 0) return acc;
      added += Math.min(line.qty, f.variant.stock);
      return addToCart(acc, line.vid, line.qty, f.variant.stock);
    }, c));
    setReordered(added ? t.reorderDone(String(added)) : t.reorderNone);
  };

  return (
    <div className={cn(WRAP, 'py-6 sm:py-10')}>
      <Crumbs items={[{ label: t.home, href: to() }, { label: t.accTitle, href: to('/account') }, { label: <Ref>{o.ref}</Ref> }]} />
      <header className="mb-6">
        <h1 className={H1}>{t.trackOrder} <Ref>{o.ref}</Ref></h1>
        <p className="mt-1 text-sm text-muted">{t.placedOn(d(o.at))}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <div className="min-w-0 space-y-5">
          {!pickup && (
            <section aria-labelledby="sf-pr-h" className={cn(PANEL, 'p-5 sm:p-6')}>
              <h2 id="sf-pr-h" className={cn(H3, 'mb-5')}>{t.shipment}</h2>
              <ol className="grid grid-cols-4 gap-1">
                {progress.map((p, i) => (
                  <li key={p.k} className="relative flex flex-col items-center gap-2 text-center">
                    {i > 0 && <span aria-hidden="true" className={cn('absolute top-3.5 end-1/2 h-0.5 w-full', p.done ? 'bg-brand-600' : 'bg-border')} />}
                    <span className={cn('relative grid size-7 place-items-center rounded-full border-2', p.done ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-surface')}>{p.done && <Check className="size-4" aria-hidden="true" />}</span>
                    <span className={cn('text-xs leading-tight', p.done ? 'font-semibold text-fg' : 'text-muted')}>{p.label}<span className="sr-only">{p.done ? ' ✓' : ''}</span></span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 space-y-1 text-sm">
                {o.trackingNo && <p>{t.trackingNo}: <Ref><span className="font-semibold">{o.trackingNo}</span></Ref></p>}
                {o.eta && o.shipment !== 'delivered' && <p className="text-muted">{t.eta}: {t.etaRange(dl(o.eta.from), dl(o.eta.to))}</p>}
                {o.deliveredAt && <p className="text-muted">{t.shipS.delivered}: {d(o.deliveredAt)}</p>}
              </div>
            </section>
          )}

          <section aria-labelledby="sf-sep-h" className={cn(PANEL, 'space-y-4 p-5 sm:p-6')}>
            <h2 id="sf-sep-h" className={H3}>{t.status}</h2>
            <Statuses o={o} />
            {o.pay.state === 'verifying' && <LinkButton variant="secondary" href={to(`/order/${o.ref}`)}>{t.checkStatus}</LinkButton>}
            {o.returns.map((r) => (
              <div key={r.id} className="rounded-xl bg-surface-2 p-4 text-sm">
                <p className="mb-2 font-semibold">{t.returns} <Ref>{r.id}</Ref></p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">{t.returns}</span><Badge tone="sky">{t.retS[r.state]}</Badge>
                  <span className="ms-2 text-muted">{t.refund}</span><Badge tone={r.refund === 'refunded' ? 'green' : 'gray'}>{t.refS[r.refund]}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted">{t.retEstimate}: <bdi>{m(r.amount)}</bdi></p>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              {o.shipment === 'delivered' && !o.received && <Button variant="secondary" onClick={() => updateOrder(o.ref, (x) => ({ ...x, received: true }))}><PackageCheck className="size-4" aria-hidden="true" />{t.confirmReceived}</Button>}
              {ret.ok && <LinkButton variant="secondary" href={to(`/returns/${o.ref}`, mobile ? { m: mobile } : undefined)}><RotateCcw className="size-4" aria-hidden="true" />{t.requestReturn}</LinkButton>}
              <Button variant="secondary" onClick={reorder}><ShoppingBag className="size-4" aria-hidden="true" />{t.reorder}</Button>
            </div>
            {o.received && <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400" role="status"><Check className="size-4" aria-hidden="true" />{t.received}</p>}
            {reordered && <p className="text-sm" role="status">{reordered} <a className="font-semibold underline underline-offset-2" href={to('/cart')}>{t.viewBag}</a></p>}
            {ret.ok && <p className="text-xs text-muted">{t.returnUntil(d(ret.until))}</p>}
            {!ret.ok && ret.reason === 'window_closed' && ret.until && <p className="text-xs text-muted">{t.windowClosed(d(ret.until))}</p>}
            {!ret.ok && ret.reason === 'nothing_returnable' && <p className="text-xs text-muted">{t.nothingReturnable}</p>}
          </section>

          <section aria-labelledby="sf-att-h" className={cn(PANEL, 'p-5 sm:p-6')}>
            <h2 id="sf-att-h" className={cn(H3, 'mb-3')}>{t.attempts}</h2>
            <ol className="space-y-3">
              {o.pay.attempts.map((a, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-s-2 border-border ps-3 text-sm">
                  <span className="font-medium">{t.attemptOut[a.outcome]}</span>
                  <span className="text-muted">#{a.n} · {t.methods[a.method]}</span>
                  <span className="ms-auto text-xs text-muted tabular-nums">{d(a.at)} {time(a.at)}</span>
                </li>
              ))}
            </ol>
            <SimNote className="mt-4">{t.notifySim}</SimNote>
          </section>

          {sim.review && (
            <div className="space-y-2 rounded-2xl border border-dashed border-border p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold"><FlaskConical className="size-4 text-muted" aria-hidden="true" />{tx('وضع المراجعة', 'Review mode')}</p>
              <p className="text-[13px] text-muted">{t.advanceNote}</p>
              <Button size="sm" variant="secondary" disabled={!canAdvance(o)} onClick={() => updateOrder(o.ref, (x) => advanceFulfilment(x, Date.now()))}>{t.advance}</Button>
              {!isSettled(o.pay.state) && <p className="text-[13px]">{t.cantAdvancePay}</p>}
            </div>
          )}
        </div>
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Summary o={o} />
          <div className={cn(PANEL, 'p-5 sm:p-6')}><Details o={o} stack /></div>
        </aside>
      </div>
    </div>
  );
}
