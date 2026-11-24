import { useState } from 'react';
import { Badge, type Tone } from '../../../core/ui';
import { navigate, type Route } from '../../../core/router';
import {
  addToCart, advanceFulfilment, canAdvance, cityById, cleanPhone, isSettled, returnEligibility, shipById, variantById,
  type FulState, type Order, type PayState, type ShipState,
} from '../domain';
import { Icon, ProductArt, TestBox, districtLabel, to, useS, variantLabel } from '../kit';
import { CUSTOMER, accountStore, cartStore, catalogStore, checkStatus, ordersStore, testStore, updateOrder } from '../state';
import { Breakdown } from './Cart';

export const payTone = (s: PayState): Tone =>
  s === 'paid' || s === 'cod_collected' ? 'success' : s === 'declined' ? 'danger' : s === 'verifying' || s === 'challenge' || s === 'awaiting' ? 'warning' : 'info';
export const fulTone = (s: FulState): Tone => (s === 'fulfilled' ? 'success' : s === 'unfulfilled' ? 'neutral' : 'info');
export const shipTone = (s: ShipState): Tone => (s === 'delivered' ? 'success' : s === 'none' ? 'neutral' : 'info');

/** Who may see an order: the signed-in owner, the session that placed it, or someone who knows reference + mobile. */
export function canView(o: Order, mobile?: string | null): boolean {
  if (!o.key.startsWith('fixture-')) return true;
  if (accountStore.get().signedIn && o.customerId === CUSTOMER.id) return true;
  return !!mobile && cleanPhone(mobile) === o.contact.phone;
}

function NoOrder() {
  const { t } = useS();
  return (
    <div className="sf-wrap sf-section sf-narrow">
      <h1 className="sf-h1">{t.noOrder}</h1>
      <p className="sf-muted">{t.noOrderHint}</p>
      <div className="sf-row-actions"><a className="btn primary" href={to('/track')}>{t.trackTitle}</a><a className="btn" href={to()}>{t.storeHome}</a></div>
    </div>
  );
}

function Lines({ o }: { o: Order }) {
  const { l, lang, m } = useS();
  const products = catalogStore.use();
  return (
    <ul className="sf-mini-lines">
      {o.lines.map((line) => {
        const f = variantById(products, line.vid);
        if (!f) return null;
        return (
          <li key={line.vid}>
            <span className="sf-mini-art"><ProductArt p={f.product} color={f.variant.color} /><span className="sf-mini-qty">{line.qty}</span></span>
            <span className="grow"><span className="sf-strong">{l(f.product.name)}</span><br /><span className="small sf-muted">{variantLabel(f.product, f.variant.color, f.variant.size, lang)}</span></span>
            <bdi className="small">{m(line.amount)}</bdi>
          </li>
        );
      })}
    </ul>
  );
}

function Details({ o }: { o: Order }) {
  const { t, l, lang, dl } = useS();
  const sm = shipById(o.ship)!;
  return (
    <div className="sf-facts">
      {o.address && (
        <div>
          <h3 className="sf-label">{o.ship === 'pickup' ? l(sm.name) : t.deliverAddr}</h3>
          {o.ship === 'pickup' ? <p className="small">{l(sm.note)}</p> : (
            <p className="small">{o.address.name} · <bdi dir="ltr">+966 {o.address.phone}</bdi><br />
              {o.address.street} {o.address.building}, {districtLabel(o.address.city, o.address.district, lang)}, {l(cityById(o.address.city)?.name ?? { ar: '', en: '' })}
              {o.address.nationalCode && <><br /><bdi dir="ltr">{o.address.nationalCode}</bdi></>}</p>
          )}
        </div>
      )}
      <div>
        <h3 className="sf-label">{t.sShip}</h3>
        <p className="small">{l(sm.name)}</p>
        {o.eta && o.ship !== 'pickup' && <p className="small sf-muted">{t.eta}: {t.etaRange(dl(o.eta.from), dl(o.eta.to))}</p>}
      </div>
      <div>
        <h3 className="sf-label">{t.method}</h3>
        <p className="small">{t.methods[o.pay.method]}</p>
      </div>
    </div>
  );
}

function Statuses({ o }: { o: Order }) {
  const { t } = useS();
  const pickup = o.ship === 'pickup';
  return (
    <dl className="sf-states">
      <div><dt>{t.payment}</dt><dd><Badge tone={payTone(o.pay.state)}>{t.payS[o.pay.state]}</Badge></dd></div>
      <div><dt>{t.fulfilment}</dt><dd><Badge tone={fulTone(o.ful)}>{pickup && o.ful === 'fulfilled' ? t.fulPickup : t.fulS[o.ful]}</Badge></dd></div>
      <div><dt>{t.shipment}</dt><dd><Badge tone={shipTone(o.shipment)}>{pickup ? t.shipPickup : t.shipS[o.shipment]}</Badge></dd></div>
    </dl>
  );
}

export function OrderPage({ reference }: { reference: string }) {
  const { t, m, d, time } = useS();
  const orders = ordersStore.use();
  const ts = testStore.use();
  const [checked, setChecked] = useState<number | null>(null);
  const o = orders.find((x) => x.ref === reference);
  if (!o || !canView(o)) return <NoOrder />;

  const verifying = o.pay.state === 'verifying' || o.pay.state === 'challenge';
  const failed = o.pay.state === 'declined' || o.pay.state === 'awaiting';
  const ok = isSettled(o.pay.state);
  const steps = o.pay.method === 'cod' ? t.nextCod : t.nextPaid;

  return (
    <div className="sf-wrap sf-section sf-confirm">
      {ok && (
        <header className="sf-confirm-head">
          <span className="sf-confirm-icon ok"><Icon name="check" size={28} /></span>
          <h1 className="sf-h1">{t.thanks}</h1>
          <p className="sf-ref">{t.ref}: <bdi dir="ltr" className="sf-strong">{o.ref}</bdi></p>
          <p className="small sf-muted">{t.placedOn(d(o.at))}</p>
        </header>
      )}
      {verifying && (
        <header className="sf-confirm-head">
          <span className="sf-confirm-icon wait"><Icon name="clock" size={28} /></span>
          <h1 className="sf-h1">{t.verifyingT}</h1>
          <p className="sf-ref">{t.ref}: <bdi dir="ltr" className="sf-strong">{o.ref}</bdi></p>
          <p className="sf-measure">{t.verifyingB}</p>
          <button type="button" className="btn primary sf-btn-lg" onClick={() => { const n = checkStatus(o.ref); if (n?.pay.state === 'verifying') setChecked(Date.now()); }}>
            <Icon name="refresh" size={20} />{t.checkStatus}
          </button>
          <p className="small sf-muted"><span className="sim">{t.sim}</span> {t.tpVerify}: {t.verifyRes[ts.verify]}</p>
          {checked && <p className="sf-notice info" role="status"><Icon name="info" /><span>{t.stillUnknown(time(checked))}</span></p>}
        </header>
      )}
      {failed && (
        <header className="sf-confirm-head">
          <span className="sf-confirm-icon bad"><Icon name="alert" size={28} /></span>
          <h1 className="sf-h1">{t.notDoneT}</h1>
          <p className="sf-ref">{t.ref}: <bdi dir="ltr" className="sf-strong">{o.ref}</bdi></p>
          <p className="sf-measure" role="status">{t.notDoneB}</p>
          <a className="btn primary sf-btn-lg" href={to('/checkout')}>{t.backToCheckout}</a>
        </header>
      )}

      <div className="sf-two">
        <div className="sf-two-main">
          <section className="sf-panel" aria-labelledby="sf-st-h">
            <h2 id="sf-st-h" className="sf-h3">{t.status}</h2>
            <Statuses o={o} />
            {ok && <a className="btn" href={to(`/track/${o.ref}`)}><Icon name="truck" size={18} />{t.trackOrder}</a>}
          </section>
          {ok && (
            <section className="sf-panel" aria-labelledby="sf-next-h">
              <h2 id="sf-next-h" className="sf-h3">{t.next}</h2>
              <ol className="sf-next">{(o.ship === 'pickup' ? [steps[0], steps[1], t.nextPickup] : steps).map((s) => <li key={s}>{s}</li>)}</ol>
            </section>
          )}
          <section className="sf-panel"><Details o={o} /></section>
        </div>
        <aside className="sf-two-side">
          <div className="sf-panel">
            <h2 className="sf-h3">{t.summary}</h2>
            <Lines o={o} />
            <Breakdown totals={o.totals} coupon={o.coupon} shippingLabel={t.shipping} />
            <p className="small sf-muted"><bdi>{m(o.totals.total)}</bdi> · {t.payS[o.pay.state]}</p>
          </div>
          <a className="sf-link" href={to('/c/all')}>{t.keepShopping}</a>
        </aside>
      </div>
    </div>
  );
}

export function TrackLookup({ route }: { route: Route }) {
  const { t } = useS();
  const orders = ordersStore.use();
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
    <div className="sf-wrap sf-section sf-narrow">
      <h1 className="sf-h1">{t.trackTitle}</h1>
      <p className="sf-muted">{t.trackSub}</p>
      <form className="sf-panel sf-form-stack" onSubmit={(e) => { e.preventDefault(); find(); }}>
        <div className="sf-field">
          <label htmlFor="sf-t-ref">{t.ref}</label>
          <input id="sf-t-ref" className="input" dir="ltr" value={ref} placeholder="DN-24788" onChange={(e) => { setRef(e.target.value); setMiss(false); }} />
        </div>
        <div className="sf-field">
          <label htmlFor="sf-t-m">{t.phone}</label>
          <div className="sf-phone" dir="ltr"><span aria-hidden="true">+966</span>
            <input id="sf-t-m" className="input" type="tel" inputMode="tel" value={mobile} placeholder="5X XXX XXXX" onChange={(e) => { setMobile(e.target.value); setMiss(false); }} aria-describedby={miss ? 'sf-t-miss' : undefined} />
          </div>
        </div>
        {miss && <p id="sf-t-miss" className="error" role="alert">{t.noTrackMatch}</p>}
        <button type="submit" className="btn primary">{t.find}</button>
      </form>
      <p className="small sf-muted"><span className="sim">{t.sample}</span> DN-24788 · <bdi dir="ltr">501234567</bdi></p>
    </div>
  );
}

const SHIP_STEPS: ShipState[] = ['label', 'in_transit', 'out_for_delivery', 'delivered'];

export function TrackPage({ reference, route }: { reference: string; route: Route }) {
  const { t, d, dl, time, m } = useS();
  const orders = ordersStore.use();
  accountStore.use();
  const products = catalogStore.use();
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
    <div className="sf-wrap sf-section">
      <nav className="sf-crumbs small" aria-label={t.home}><a href={to()}>{t.home}</a><Icon name="chev" size={14} flip /><a href={to('/account')}>{t.accTitle}</a><Icon name="chev" size={14} flip /><span aria-current="page"><bdi dir="ltr">{o.ref}</bdi></span></nav>
      <header className="sf-list-head">
        <h1 className="sf-h1">{t.trackOrder} <bdi dir="ltr">{o.ref}</bdi></h1>
        <p className="sf-muted">{t.placedOn(d(o.at))} · <bdi>{m(o.totals.total)}</bdi></p>
      </header>

      <div className="sf-two">
        <div className="sf-two-main">
          {!pickup && (
            <section className="sf-panel" aria-labelledby="sf-pr-h">
              <h2 id="sf-pr-h" className="sf-h3">{t.shipment}</h2>
              <ol className="sf-progress">
                {progress.map((p) => <li key={p.k} className={p.done ? 'done' : ''}><span className="sf-progress-dot" aria-hidden="true">{p.done && <Icon name="check" size={14} />}</span><span>{p.label}</span><span className="sr">{p.done ? '✓' : ''}</span></li>)}
              </ol>
              {o.trackingNo && <p className="small">{t.trackingNo}: <bdi dir="ltr" className="sf-strong">{o.trackingNo}</bdi></p>}
              {o.eta && o.shipment !== 'delivered' && <p className="small sf-muted">{t.eta}: {t.etaRange(dl(o.eta.from), dl(o.eta.to))}</p>}
              {o.deliveredAt && <p className="small sf-muted">{t.shipS.delivered}: {d(o.deliveredAt)}</p>}
            </section>
          )}

          <section className="sf-panel" aria-labelledby="sf-sep-h">
            <h2 id="sf-sep-h" className="sf-h3">{t.status}</h2>
            <Statuses o={o} />
            {o.pay.state === 'verifying' && <a className="btn" href={to(`/order/${o.ref}`)}>{t.checkStatus}</a>}
            {o.returns.map((r) => (
              <div key={r.id} className="sf-return-row">
                <p className="sf-strong">{t.returns} <bdi dir="ltr">{r.id}</bdi></p>
                <dl className="sf-states">
                  <div><dt>{t.returns}</dt><dd><Badge tone="info">{t.retS[r.state]}</Badge></dd></div>
                  <div><dt>{t.refund}</dt><dd><Badge tone={r.refund === 'refunded' ? 'success' : 'neutral'}>{t.refS[r.refund]}</Badge> <span className="small sf-muted">{t.retEstimate}: <bdi>{m(r.amount)}</bdi></span></dd></div>
                </dl>
              </div>
            ))}
            <div className="sf-row-actions">
              {o.shipment === 'delivered' && !o.received && <button type="button" className="btn" onClick={() => updateOrder(o.ref, (x) => ({ ...x, received: true }))}><Icon name="check" size={18} />{t.confirmReceived}</button>}
              {ret.ok && <a className="btn" href={to(`/returns/${o.ref}`, mobile ? { m: mobile } : undefined)}><Icon name="return" size={18} />{t.requestReturn}</a>}
              <button type="button" className="btn" onClick={reorder}><Icon name="bag" size={18} />{t.reorder}</button>
            </div>
            {o.received && <p className="small" role="status"><Icon name="check" size={16} /> {t.received}</p>}
            {reordered && <p className="small" role="status">{reordered} <a className="sf-link" href={to('/cart')}>{t.viewBag}</a></p>}
            {ret.ok && <p className="small sf-muted">{t.returnUntil(d(ret.until))}</p>}
            {!ret.ok && ret.reason === 'window_closed' && ret.until && <p className="small sf-muted">{t.windowClosed(d(ret.until))}</p>}
            {!ret.ok && ret.reason === 'nothing_returnable' && <p className="small sf-muted">{t.nothingReturnable}</p>}
          </section>

          <section className="sf-panel" aria-labelledby="sf-att-h">
            <h2 id="sf-att-h" className="sf-h3">{t.attempts}</h2>
            <ul className="sf-log">
              {o.pay.attempts.map((a, i) => (
                <li key={i}><span className="sf-muted small">{d(a.at)} {time(a.at)}</span><span>#{a.n} · {t.methods[a.method]}</span><span className="sf-strong">{t.attemptOut[a.outcome]}</span></li>
              ))}
            </ul>
          </section>

          <TestBox title={t.advance}>
            <p className="small sf-muted">{t.advanceNote}</p>
            <button type="button" className="btn small" disabled={!canAdvance(o)} onClick={() => updateOrder(o.ref, (x) => advanceFulfilment(x, Date.now()))}>{t.advance}</button>
            {!isSettled(o.pay.state) && <p className="small">{t.cantAdvancePay}</p>}
          </TestBox>
        </div>
        <aside className="sf-two-side">
          <div className="sf-panel">
            <h2 className="sf-h3">{t.summary}</h2>
            <Lines o={o} />
            <Breakdown totals={o.totals} coupon={o.coupon} />
          </div>
          <div className="sf-panel"><Details o={o} /></div>
        </aside>
      </div>
    </div>
  );
}
