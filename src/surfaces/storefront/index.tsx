import { useEffect, useRef, useState } from 'react';
import { link, navigate, replace, type Route } from '../../core/router';
import { CATEGORIES, MERCHANT, itemCount, variantById, type Outcome } from './domain';
import { Icon, TestBox, to, useS } from './kit';
import { accountStore, cartStore, catalogStore, testStore } from './state';
import Home from './pages/Home';
import Listing from './pages/Listing';
import ProductPage from './pages/Product';
import CartPage from './pages/Cart';
import Checkout from './pages/Checkout';
import { OrderPage, TrackLookup, TrackPage } from './pages/Order';
import AccountPage from './pages/Account';
import ReturnsPage from './pages/Returns';
import PolicyPage, { POLICY_IDS } from './pages/Policy';
import './styles.css';

/** P04 merchant storefront. Wears the fixture merchant's identity; LAK appears only as "powered by" in the footer. */
export default function Storefront({ route }: { route: Route }) {
  const { t, l } = useS();
  const [a, b] = route.path;
  const page = (() => {
    switch (a) {
      case undefined: return <Home />;
      case 'c': return <Listing route={route} cat={b} />;
      case 'search': return <Listing route={route} search />;
      case 'p': return <ProductPage key={b} route={route} id={b ?? ''} />;
      case 'cart': return <CartPage />;
      case 'checkout': return <Checkout />;
      case 'order': return <OrderPage key={b} reference={b ?? ''} />;
      case 'track': return b ? <TrackPage key={b} reference={b} route={route} /> : <TrackLookup route={route} />;
      case 'account': return <AccountPage route={route} />;
      case 'returns': return <ReturnsPage key={b} reference={b ?? ''} route={route} />;
      case 'page': return POLICY_IDS.includes(b as never) ? <PolicyPage id={b as never} /> : <NotFound />;
      default: return <NotFound />;
    }
  })();

  // Move focus to the new page's heading on navigation, so keyboard and screen-reader users land on the content.
  const mainRef = useRef<HTMLDivElement>(null);
  const pathKey = route.path.join('/');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const h = mainRef.current?.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0 });
  }, [pathKey]);

  return (
    <div className="sf">
      <TestStrip />
      <p className="sf-offer">{t.offer}</p>
      <Header route={route} />
      <div className="sf-page" ref={mainRef}>{page}</div>
      <footer className="sf-footer">
        <div className="sf-wrap sf-footer-grid">
          <div className="sf-footer-brand">
            <span className="sf-wordmark">{l(MERCHANT.name)}</span>
            <p className="sf-muted">{l(MERCHANT.tagline)}</p>
            <p className="sf-muted small">{t.vatNote}</p>
          </div>
          <nav aria-label={t.policies}>
            <h2 className="sf-foot-h">{t.policies}</h2>
            <ul className="sf-foot-links">
              <li><a href={to('/page/shipping')}>{t.pShipping}</a></li>
              <li><a href={to('/page/returns')}>{t.pReturns}</a></li>
              <li><a href={to('/page/privacy')}>{t.pPrivacy}</a></li>
              <li><a href={to('/page/terms')}>{t.pTerms}</a></li>
              <li><a href={to('/track')}>{t.track}</a></li>
            </ul>
          </nav>
          <div>
            <h2 className="sf-foot-h">{t.care}</h2>
            <p className="sf-muted small">{t.careHours}</p>
            <p className="sf-muted small">{t.careHow}</p>
          </div>
          <div>
            <h2 className="sf-foot-h">{t.payOptions}</h2>
            <p className="sf-muted small">{t.payList}</p>
          </div>
        </div>
        <div className="sf-wrap sf-footer-base">
          <p className="small sf-muted">{t.legal}</p>
          <a className="sf-powered" href={link('/site')}>{t.powered} <bdi dir="ltr">LAK | لك</bdi></a>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  const { t } = useS();
  return (
    <div className="sf-wrap sf-section sf-narrow">
      <h1 className="sf-h1">{t.notFoundPage}</h1>
      <a className="btn primary" href={to()}>{t.storeHome}</a>
    </div>
  );
}

function Header({ route }: { route: Route }) {
  const { t, l } = useS();
  const cart = cartStore.use();
  const acc = accountStore.use();
  const n = itemCount(cart);
  const onSearch = route.path[0] === 'search';
  const routeQ = onSearch ? route.query.get('q') ?? '' : '';
  const [q, setQ] = useState(routeQ);
  useEffect(() => { setQ(routeQ); }, [routeQ]);
  const curCat = route.path[0] === 'c' ? route.path[1] : undefined;

  return (
    <header className="sf-header">
      <div className="sf-wrap sf-header-row">
        <a className="sf-wordmark sf-logo" href={to()}>{l(MERCHANT.name)}</a>
        <form className="sf-search" role="search" onSubmit={(e) => { e.preventDefault(); navigate(to('/search', { q: q.trim() || undefined })); }}>
          <label htmlFor="sf-q" className="sr">{t.search}</label>
          <input id="sf-q" className="sf-search-input" type="search" value={q} placeholder={t.searchPh} autoComplete="off"
            onChange={(e) => { setQ(e.target.value); if (onSearch) replace(to('/search', { q: e.target.value || undefined, sort: route.query.get('sort') ?? undefined })); }} />
          <button className="sf-search-btn" type="submit" aria-label={t.searchGo}><Icon name="search" size={20} /></button>
        </form>
        <nav className="sf-tools" aria-label={t.account}>
          <a className="sf-tool" href={to('/account', { tab: 'wishlist' })} aria-label={`${t.wishlist}${acc.wishlist.length ? ` (${acc.wishlist.length})` : ''}`}>
            <Icon name="heart" />{acc.wishlist.length > 0 && <span className="sf-dot" aria-hidden="true">{acc.wishlist.length}</span>}
          </a>
          <a className="sf-tool" href={to('/account')} aria-label={t.account}><Icon name="user" /></a>
          <a className="sf-tool" href={to('/cart')} aria-label={t.bagN(String(n))} aria-current={route.path[0] === 'cart' ? 'page' : undefined}>
            <Icon name="bag" />{n > 0 && <span className="sf-dot" aria-hidden="true">{n}</span>}
          </a>
        </nav>
      </div>
      <nav className="sf-wrap sf-cats" aria-label={t.cats}>
        <a href={to('/c/all')} aria-current={curCat === 'all' ? 'page' : undefined}>{t.all}</a>
        {CATEGORIES.map((c) => <a key={c.id} href={to(`/c/${c.id}`)} aria-current={curCat === c.id ? 'page' : undefined}>{l(c.name)}</a>)}
      </nav>
    </header>
  );
}

function TestStrip() {
  const { t, l } = useS();
  const ts = testStore.use();
  const [msg, setMsg] = useState('');
  const outcomes: Outcome[] = ['success', 'declined', '3ds', 'timeout'];
  const sellOut = () => {
    const first = cartStore.get().lines[0];
    if (!first) { setMsg(t.tpSellOutNone); return; }
    const f = variantById(catalogStore.get(), first.vid);
    catalogStore.set((ps) => ps.map((p) => ({ ...p, variants: p.variants.map((v) => (v.id === first.vid ? { ...v, stock: 0 } : v)) })));
    setMsg(t.tpSellOutDone(f ? l(f.product.name) : first.vid));
  };
  return (
    <div className="sf-test">
      <div className="sf-wrap sf-test-row">
        <p className="small"><span className="sim">{t.sim}</span> {t.testStrip}</p>
        <button type="button" className="sf-test-toggle" aria-expanded={ts.open} aria-controls="sf-testpanel"
          onClick={() => testStore.set((s) => ({ ...s, open: !s.open }))}>{t.testPanel}</button>
      </div>
      {ts.open && (
        <div id="sf-testpanel" className="sf-wrap sf-test-panel">
          <TestBox title={t.tpTitle}>
            <p className="small sf-muted">{t.tpSub}</p>
            <div className="sf-test-grid">
              <label className="check"><input type="checkbox" checked={ts.applePay} onChange={(e) => testStore.set((s) => ({ ...s, applePay: e.target.checked }))} />{t.tpApple}</label>
              <fieldset>
                <legend className="small">{t.tpOutcome}</legend>
                {outcomes.map((o) => (
                  <label key={o} className="check"><input type="radio" name="sf-outcome" checked={ts.outcome === o} onChange={() => testStore.set((s) => ({ ...s, outcome: o }))} />{t.outcomes[o]}</label>
                ))}
              </fieldset>
              <fieldset>
                <legend className="small">{t.tpVerify}</legend>
                {(['paid', 'failed', 'unknown'] as const).map((o) => (
                  <label key={o} className="check"><input type="radio" name="sf-verify" checked={ts.verify === o} onChange={() => testStore.set((s) => ({ ...s, verify: o }))} />{t.verifyRes[o]}</label>
                ))}
              </fieldset>
              <div className="sf-stack">
                <button type="button" className="btn small" onClick={sellOut}>{t.tpSellOut}</button>
                {msg && <p className="small" role="status">{msg}</p>}
                <button type="button" className="btn small" onClick={() => testStore.set((s) => ({ ...s, open: false }))}>{t.tpClose}</button>
              </div>
            </div>
          </TestBox>
        </div>
      )}
    </div>
  );
}
