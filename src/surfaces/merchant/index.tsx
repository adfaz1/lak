import { useEffect, useMemo, useState } from 'react';
import {
  CARRIERS, VIEWS, canFulfil, fixtures, formatMoney, isToday, issueLabel, parseWeight, search, shipmentRef,
  subtotal, total, units, vatIncluded,
  type CarrierId, type Lang, type Order, type View,
} from './domain';
import { strings, type Strings } from './i18n';

/** Route lives in the hash so filters survive navigation, reload and deep links. */
interface Route { page: 'home' | 'orders' | 'order'; ref?: string; view: View; q: string }

function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const v = params.get('view') as View | null;
  const view: View = v && v in VIEWS ? v : 'all';
  const q = params.get('q') ?? '';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'orders') return parts[1] ? { page: 'order', ref: parts[1], view, q } : { page: 'orders', view, q };
  return { page: 'home', view, q };
}

function href(r: Partial<Route> & { page: Route['page'] }): string {
  const params = new URLSearchParams();
  if (r.view && r.view !== 'all') params.set('view', r.view);
  if (r.q) params.set('q', r.q);
  const query = params.toString() ? `?${params}` : '';
  const path = r.page === 'home' ? '/' : r.page === 'orders' ? '/orders' : `/orders/${r.ref}`;
  return `#${path}${query}`;
}

function useRoute(): Route {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return useMemo(() => parseHash(hash), [hash]);
}

function readLang(): Lang {
  try { return localStorage.getItem('lak.lang') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}

export function App() {
  const [lang, setLang] = useState<Lang>(readLang);
  const [orders, setOrders] = useState<Order[]>(fixtures);
  const route = useRoute();
  const t = strings[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    try { localStorage.setItem('lak.lang', lang); } catch { /* preference only */ }
  }, [lang, t.dir]);

  const needs = orders.filter(VIEWS.needs).length;
  const onOrders = route.page !== 'home';

  return (
    <div className="shell">
      <a className="skip" href="#main">{t.skip}</a>
      <nav className="nav" aria-label={t.navHome}>
        <div className="brand">
          <bdi className="wordmark" dir="ltr">LAK | لك</bdi>
          <span className="store">{t.store}</span>
        </div>
        <div className="nav-links">
          <a className="nav-link" href={href({ page: 'home' })} aria-current={!onOrders ? 'page' : undefined}>{t.navHome}</a>
          <a className="nav-link" href={href({ page: 'orders', view: route.view, q: route.q })} aria-current={onOrders ? 'page' : undefined}>
            <span>{t.navOrders}</span><span className="count">{needs}</span>
          </a>
        </div>
        <p className="nav-note">{t.navLater}</p>
        <button type="button" className="btn" lang={lang === 'ar' ? 'en' : 'ar'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t.switchLang}</button>
      </nav>

      <main id="main" className="main" tabIndex={-1}>
        <div className="demo-bar">
          <span className="tag">{t.demo}</span>
          <span className="grow">{t.demoNote}</span>
          <button type="button" className="btn" onClick={() => setOrders(fixtures())}>{t.reset}</button>
        </div>
        {route.page === 'home' && <Home t={t} lang={lang} orders={orders} />}
        {route.page === 'orders' && <Orders t={t} lang={lang} orders={orders} route={route} />}
        {route.page === 'order' && (
          <OrderDetail key={route.ref} t={t} lang={lang} route={route} order={orders.find((o) => o.ref === route.ref)}
            onChange={(next) => setOrders((all) => all.map((o) => (o.ref === next.ref ? next : o)))} />
        )}
      </main>
    </div>
  );
}

interface PageProps { t: Strings; lang: Lang }
const Money = ({ v, t }: { v: number; t: Strings }) => <span className="money"><bdi>{formatMoney(v)}</bdi> {t.sar}</span>;
const Ref = ({ r }: { r: string }) => <bdi dir="ltr">#{r}</bdi>;

function Home({ t, orders }: PageProps & { orders: Order[] }) {
  const today = orders.filter(isToday);
  const needs = orders.filter(VIEWS.needs);
  const failed = orders.filter(VIEWS.payfail);
  const paidToday = today.filter((o) => o.pay === 'paid').reduce((sum, o) => sum + total(o), 0);
  const oldest = needs.reduce((max, o) => Math.max(max, o.hoursAgo), 0);
  return (
    <>
      <header>
        <h1>{t.homeTitle}</h1>
        <p className="muted">{t.homeContext}</p>
      </header>
      <section className="metrics" aria-label={t.homeTitle}>
        <div className="card metric"><span className="muted">{t.mSales}</span><strong><Money v={paidToday} t={t} /></strong><small>{t.mSalesDef}</small></div>
        <div className="card metric"><span className="muted">{t.mOrders}</span><strong>{today.length}</strong><small>{t.mOrdersDef}</small></div>
        <div className="card metric"><span className="muted">{t.mNeeds}</span><strong>{needs.length}</strong><small>{t.mNeedsDef}</small></div>
      </section>
      <section className="card" aria-labelledby="queue-h">
        <h2 id="queue-h" className="card-head">{t.queue}</h2>
        <ul className="queue">
          {needs.length > 0 ? (
            <li><b className="n">{needs.length}</b><div className="grow"><div className="strong">{t.qNeeds}</div><div className="muted small">{t.qNeedsWhy(t.age(oldest))}</div></div>
              <a className="btn primary" href={href({ page: 'orders', view: 'needs' })}>{t.qNeedsCta}</a></li>
          ) : (
            <li><b className="n">0</b><div className="grow"><div className="strong">{t.qClear}</div><div className="muted small">{t.qClearWhy}</div></div></li>
          )}
          {failed.length > 0 && (
            <li><b className="n">{failed.length}</b><div className="grow"><div className="strong">{t.qFail}</div><div className="muted small">{t.qFailWhy}</div></div>
              <a className="btn primary" href={href({ page: 'orders', view: 'payfail' })}>{t.qFailCta}</a></li>
          )}
          <li><b className="n">2</b><div className="grow"><div className="strong">{t.qStock}</div><div className="muted small">{t.qStockWhy}</div></div>
            <span className="muted small">{t.qStockCta}</span></li>
        </ul>
      </section>
    </>
  );
}

function Orders({ t, lang, orders, route }: PageProps & { orders: Order[]; route: Route }) {
  const rows = search(orders, route.view, route.q);
  // Typing must not add a history entry per keystroke, so replace the URL and notify the router.
  const setQ = (q: string) => {
    window.history.replaceState(null, '', href({ page: 'orders', view: route.view, q }));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  return (
    <>
      <h1>{t.ordersTitle}</h1>
      <div className="toolbar">
        <div className="views" role="group" aria-label={t.viewsLabel}>
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <a key={v} className="chip" href={href({ page: 'orders', view: v, q: route.q })} aria-current={route.view === v ? 'true' : undefined}>
              {t.views[v]} · {orders.filter(VIEWS[v]).length}
            </a>
          ))}
        </div>
        <input className="input search" type="search" aria-label={t.searchLabel} placeholder={t.searchPh} value={route.q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th scope="col">{t.cRef}</th><th scope="col">{t.cCustomer}</th><th scope="col">{t.cPay}</th><th scope="col">{t.cFul}</th><th scope="col">{t.cShip}</th><th scope="col" className="end">{t.cTotal}</th><th scope="col"><span className="sr">{t.cAction}</span></th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.ref}>
                <td><span className="strong"><Ref r={o.ref} /></span><div className="muted small">{t.age(o.hoursAgo)}</div></td>
                <td>{o.customer[lang]}<div className="muted small">{o.city[lang]}</div></td>
                <td><span className={`status ${o.pay}`}>{t.pay[o.pay]}</span></td>
                <td>{t.ful[o.ful]}</td>
                <td>{t.ship[o.ship]}</td>
                <td className="end strong"><Money v={total(o)} t={t} /></td>
                <td className="end"><a className="btn" href={href({ page: 'order', ref: o.ref, view: route.view, q: route.q })} aria-label={t.openOrder(`#${o.ref}`)}>{t.open}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty"><span>{t.noRows}</span><a className="btn" href={href({ page: 'orders' })}>{t.clear}</a></div>
        )}
      </div>
      <p className="muted small" role="status">{t.rowsNote(rows.length, orders.length)}</p>
    </>
  );
}

type Step = 'idle' | 'form' | 'review' | 'done';

function OrderDetail({ t, lang, route, order, onChange }: PageProps & { route: Route; order?: Order; onChange: (o: Order) => void }) {
  const [step, setStep] = useState<Step>('idle');
  const [carrier, setCarrier] = useState<CarrierId>('a');
  const [weight, setWeight] = useState('1.0');
  const [weightErr, setWeightErr] = useState(false);
  const [simFail, setSimFail] = useState(false);
  const [failed, setFailed] = useState(false);
  const backHref = href({ page: 'orders', view: route.view, q: route.q });
  const back = <a className="back" href={backHref}>{t.dir === 'rtl' ? '→' : '←'} {t.back(t.views[route.view])}</a>;

  if (!order) return <>{back}<p role="alert">{t.notFound}</p></>;

  const eligible = canFulfil(order);
  const ref = shipmentRef(order);
  const c = CARRIERS[carrier];

  const issue = () => {
    const next = issueLabel(order, carrier, simFail);
    onChange(next);
    if (next.ship === 'label') { setFailed(false); setStep('done'); } else { setFailed(true); setSimFail(false); }
  };
  const toReview = () => {
    if (parseWeight(weight) === null) setWeightErr(true); else { setWeightErr(false); setStep('review'); }
  };

  return (
    <>
      {back}
      <div className="title-row">
        <h1>{t.order} <Ref r={order.ref} /></h1>
        <span className="pill">{t.cPay}: <b>{t.pay[order.pay]}</b></span>
        <span className="pill">{t.cFul}: <b>{t.ful[order.ful]}</b></span>
        <span className="pill">{t.cShip}: <b>{t.ship[order.ship]}</b></span>
      </div>
      <div className="cols">
        <div className="col-main">
          <section className="card pad" aria-labelledby="next-h">
            <h2 id="next-h">{t.next}</h2>
            <p>{order.pay === 'failed' ? t.nextPayFailed : eligible ? t.nextReady : t.nextNone}</p>

            {eligible && step === 'idle' && <button type="button" className="btn primary" onClick={() => setStep('form')}>{t.start}</button>}

            {eligible && step === 'form' && (
              <div className="flow">
                <fieldset>
                  <legend>{t.carrier}</legend>
                  {(Object.keys(CARRIERS) as CarrierId[]).map((id) => (
                    <label key={id} className="radio">
                      <input type="radio" name="carrier" checked={carrier === id} onChange={() => setCarrier(id)} />
                      <span className="grow strong">{CARRIERS[id].name[lang]}</span>
                      <span><Money v={CARRIERS[id].price} t={t} /> · {t.estimated}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="field">
                  <label htmlFor="weight">{t.weight}</label>
                  <input id="weight" className="input" inputMode="decimal" dir="ltr" value={weight} aria-invalid={weightErr} aria-describedby={weightErr ? 'weight-err' : undefined}
                    onChange={(e) => { setWeight(e.target.value); setWeightErr(false); }} />
                  {weightErr && <span id="weight-err" className="error" role="alert">{t.weightErr}</span>}
                </div>
                <div className="actions">
                  <button type="button" className="btn primary" onClick={toReview}>{t.review}</button>
                  <button type="button" className="btn" onClick={() => { setStep('idle'); setFailed(false); }}>{t.cancel}</button>
                </div>
              </div>
            )}

            {eligible && step === 'review' && (
              <div className="flow">
                <p>{t.reviewText(units(order), c.name[lang], weight, formatMoney(c.price))}</p>
                {failed && <div className="alert" role="alert"><b>{t.failTitle}</b> {t.failBody} <bdi dir="ltr">{ref}</bdi></div>}
                <label className="check"><input type="checkbox" checked={simFail} onChange={(e) => setSimFail(e.target.checked)} /> {t.simFail}</label>
                <div className="actions">
                  <button type="button" className="btn primary" onClick={issue}>{failed ? t.retry : t.issue}</button>
                  <button type="button" className="btn" onClick={() => setStep('form')}>{t.edit}</button>
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="flow" role="status">
                <p><b>{t.doneTitle}</b> {t.doneBody} <bdi dir="ltr">{ref}</bdi></p>
                <a className="btn" href={href({ page: 'home' })}>{t.toHome}</a>
              </div>
            )}
          </section>

          <section className="card pad" aria-labelledby="items-h">
            <h2 id="items-h">{t.items}</h2>
            <ul className="lines">
              {order.items.map((i) => (
                <li key={i.name.en}><span className="grow">{i.name[lang]}</span><span className="muted">× {i.qty}</span><span className="strong amount"><Money v={i.qty * i.unit} t={t} /></span></li>
              ))}
            </ul>
          </section>

          <section className="card pad" aria-labelledby="log-h">
            <h2 id="log-h">{t.activity}</h2>
            <ol className="log">
              {order.log.map((e, n) => (
                <li key={n}><span className="muted when">{e.when === 'now' ? t.whenNow : t.whenEarlier} · {e.who === 'you' ? t.whoYou : t.whoSystem}</span><span className="grow">{t.log(e, e.carrier ? CARRIERS[e.carrier].name[lang] : '')}</span></li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="col-side">
          <section className="card pad" aria-labelledby="cust-h">
            <h2 id="cust-h">{t.customer}</h2>
            <div className="strong">{order.customer[lang]}</div>
            <div className="muted">{order.city[lang]}</div>
          </section>
          <section className="card pad" aria-labelledby="amt-h">
            <h2 id="amt-h">{t.amount}</h2>
            <dl className="breakdown">
              <div><dt>{t.sub}</dt><dd><Money v={subtotal(order)} t={t} /></dd></div>
              <div><dt>{t.fee}</dt><dd><Money v={order.fee} t={t} /></dd></div>
              <div className="sum"><dt>{t.total}</dt><dd><Money v={total(order)} t={t} /></dd></div>
              <div className="muted small"><dt>{t.vat}</dt><dd><Money v={vatIncluded(order)} t={t} /></dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
