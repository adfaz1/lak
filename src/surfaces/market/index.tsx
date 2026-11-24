import { useEffect, useState, type FormEvent } from 'react';
import { formatMoney } from '../../core/format';
import { useLang, type Lang } from '../../core/lang';
import { link, navigate, replace, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Alert, Badge, Dialog, Empty, Field, Id, LinkTabs, Money, PageHeader, Sim, type Tone } from '../../core/ui';
import {
  CATS, CITIES, EXCLUDED, addLine, canSubmit, checkoutBlock, checkoutTotals, deliveryDays, groupCart, listingState,
  placeOrder, removeSeller, requestReturn, returnBlock, search, setQty, shippingFee, summarize,
  type CatId, type CityId, type Filters, type Line, type ListingItem, type ListingState, type Order, type PayMethod, type Product,
  type Seller, type Sort,
} from './domain';
import { MY_STORE, PRODUCTS, SELLERS, initialListing, initialNotes, initialOrders, type Note } from './fixtures';
import { Avatar, CatIcon, Ico, ProductArt } from './art';
import { strings, type Strings } from './i18n';
import './styles.css';

interface Ticket { ref: string; topic: string; order: string; at: string }
interface MState { cart: Line[]; orders: Order[]; notes: Note[]; tickets: Ticket[]; listing: ListingItem[]; verified: boolean; seq: number }

export const marketStore = createStore.key('market.marketStore')<MState>(() => ({
  cart: [], orders: initialOrders(), notes: initialNotes(), tickets: [], listing: initialListing(), verified: true, seq: 1,
}));

const now = () => new Date().toISOString();
const sellerOf = (id: string) => SELLERS.find((s) => s.id === id);
const moneyStr = (v: number, lang: Lang) => `${formatMoney(v)} ${lang === 'ar' ? 'ر.س' : 'SAR'}`;
const fmtDate = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Riyadh' }).format(new Date(iso));

interface Ctx { t: Strings; lang: Lang; s: MState; route: Route; city: CityId; go: (path: string, q?: Record<string, string | undefined>) => string }

/** LAK marketplace: a consumer app across merchants. `route` is the path below /market. */
export default function Market({ route }: { route: Route }) {
  const { lang } = useLang();
  const t = strings[lang];
  const s = marketStore.use();
  const qCity = route.query.get('city') as CityId | null;
  const city: CityId = qCity && CITIES.includes(qCity) ? qCity : 'riyadh';
  /** Build a market href that keeps the delivery city. */
  const go = (path: string, q?: Record<string, string | undefined>) => link(`/market${path}`, { city: city === 'riyadh' ? undefined : city, ...q });
  const ctx: Ctx = { t, lang, s, route, city, go };
  const [p0, p1] = route.path;

  if (p0 === 'seller') return <SellerListing {...ctx} />;

  const page = p0 === 's' && p1 ? <StorePage key={p1} {...ctx} id={p1} />
    : p0 === 'p' && p1 ? <ProductPage key={p1} {...ctx} id={p1} />
    : p0 === 'cart' ? <CartPage {...ctx} />
    : p0 === 'checkout' && p1 ? <Checkout key={p1} {...ctx} sellerId={p1} />
    : p0 === 'orders' ? (p1 ? <OrderPage key={p1} {...ctx} ref_={p1} /> : <OrdersPage {...ctx} />)
    : p0 === 'alerts' ? <AlertsPage {...ctx} />
    : p0 === 'help' ? <HelpPage {...ctx} />
    : <Discover {...ctx} />;
  const tab = p0 === 'cart' || p0 === 'checkout' ? 'cart' : p0 === 'orders' ? 'orders' : p0 === 'alerts' ? 'alerts' : p0 === 'help' ? 'help' : 'discover';

  return (
    <div className="mk">
      <Header {...ctx} tab={tab} />
      <div className="mk-page">{page}</div>
      <footer className="mk-foot">
        <p className="small muted">{t.demo}</p>
        <a href={go('/seller')} className="small">{t.forMerchants}</a>
      </footer>
      <TabBar {...ctx} tab={tab} />
    </div>
  );
}

/* ---------- Chrome ---------- */

function useCounts(s: MState) {
  return { cart: s.cart.reduce((n, l) => n + l.qty, 0), unread: s.notes.filter((n) => !n.read).length };
}

const NAV = [
  { id: 'discover', path: '', I: Ico.compass },
  { id: 'cart', path: '/cart', I: Ico.bag },
  { id: 'orders', path: '/orders', I: Ico.box },
  { id: 'alerts', path: '/alerts', I: Ico.bell },
  { id: 'help', path: '/help', I: Ico.help },
] as const;

function Header({ t, s, route, city, go, tab }: Ctx & { tab: string }) {
  const onDiscover = !route.path.length;
  const [q, setQ] = useState(route.query.get('q') ?? '');
  useEffect(() => { setQ(route.query.get('q') ?? ''); }, [route.query]);
  const counts = useCounts(s);
  const submit = (e: FormEvent) => { e.preventDefault(); navigate(go('', { q: q.trim() || undefined })); };
  const changeCity = (c: CityId) => {
    const cur: Record<string, string> = {};
    route.query.forEach((v, k) => { cur[k] = v; });
    replace(link(`/market/${route.path.join('/')}`, { ...cur, city: c === 'riyadh' ? undefined : c }));
  };
  return (
    <header className="mk-head">
      <div className="mk-head-row">
        <a className="mk-logo" href={go('')}>
          <img src="/lak-mark.png" alt="" width="22" height="32" />
          <span><strong>{t.brand}</strong><span className="mk-logo-sub">{t.tagline}</span></span>
        </a>
        <form className="mk-search" role="search" onSubmit={submit}>
          <label htmlFor="mk-q" className="sr">{t.search}</label>
          <span className="mk-search-ico" aria-hidden="true"><Ico.search /></span>
          <input id="mk-q" type="search" className="input" placeholder={t.search} value={q} enterKeyHint="search"
            onChange={(e) => {
              setQ(e.target.value);
              if (onDiscover) {
                const cur: Record<string, string> = {};
                route.query.forEach((v, k) => { cur[k] = v; });
                replace(link('/market', { ...cur, q: e.target.value || undefined }));
              }
            }} />
          <button type="submit" className="btn primary mk-search-btn">{t.searchBtn}</button>
        </form>
        <label className="mk-city">
          <span className="mk-city-ico" aria-hidden="true"><Ico.pin /></span>
          <span className="sr">{t.deliverTo}</span>
          <span className="mk-city-label" aria-hidden="true">{t.deliverTo}</span>
          <select value={city} onChange={(e) => changeCity(e.target.value as CityId)}>
            {CITIES.map((c) => <option key={c} value={c}>{t.cities[c]}</option>)}
          </select>
        </label>
        <nav className="mk-topnav" aria-label={t.navLabel}>
          {NAV.slice(1).map(({ id, path, I }) => {
            const n = id === 'cart' ? counts.cart : id === 'alerts' ? counts.unread : 0;
            return (
              <a key={id} href={go(path)} aria-current={tab === id ? 'page' : undefined}>
                <span className="mk-nav-ico"><I />{n > 0 && <b className="mk-dot">{n}</b>}</span>
                <span>{t.nav[id]}</span>
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function TabBar({ t, s, go, tab }: Ctx & { tab: string }) {
  const counts = useCounts(s);
  return (
    <nav className="mk-tabbar" aria-label={t.navLabel}>
      {NAV.map(({ id, path, I }) => {
        const n = id === 'cart' ? counts.cart : id === 'alerts' ? counts.unread : 0;
        return (
          <a key={id} href={go(path)} aria-current={tab === id ? 'page' : undefined}>
            <span className="mk-nav-ico"><I />{n > 0 && <b className="mk-dot">{n}</b>}</span>
            <span>{t.nav[id]}</span>
          </a>
        );
      })}
    </nav>
  );
}

/* ---------- Discover ---------- */

function readFilters(route: Route, city: CityId): Filters {
  const cat = route.query.get('cat') as CatId | null;
  const sort = route.query.get('sort') as Sort | null;
  return {
    q: route.query.get('q') ?? '',
    cat: cat && CATS.includes(cat) ? cat : '',
    seller: route.query.get('store') ?? '',
    brand: route.query.get('brand') ?? '',
    city,
    near: route.query.get('near') === '1',
    sort: sort === 'priceAsc' || sort === 'priceDesc' ? sort : 'relevance',
  };
}

function Discover(ctx: Ctx) {
  const { t, lang, route, city, go } = ctx;
  const f = readFilters(route, city);
  const results = search(PRODUCTS, SELLERS, f);
  const [sheet, setSheet] = useState(false);
  const q = (patch: Partial<Record<'q' | 'cat' | 'store' | 'brand' | 'near' | 'sort', string | undefined>>) =>
    go('', { q: f.q || undefined, cat: f.cat || undefined, store: f.seller || undefined, brand: f.brand || undefined, near: f.near ? '1' : undefined, sort: f.sort === 'relevance' ? undefined : f.sort, ...patch });
  const active = [f.seller, f.brand, f.near ? '1' : ''].filter(Boolean).length;
  const filtered = !!(f.q || f.cat || active);
  const nearSellers = SELLERS.filter((x) => x.city === city);
  const brands = [...new Set(PRODUCTS.filter((p) => !f.cat || p.cat === f.cat).map((p) => p.brand))].sort();
  const clear = go('', { q: f.q || undefined, cat: f.cat || undefined });

  const controls = (idp: string) => (
    <div className="mk-filters">
      <Field id={`${idp}-store`} label={t.store}>
        <select id={`${idp}-store`} className="input" value={f.seller} onChange={(e) => replace(q({ store: e.target.value || undefined }))}>
          <option value="">{t.anyStore}</option>
          {SELLERS.map((x) => <option key={x.id} value={x.id}>{x.name[lang]}</option>)}
        </select>
      </Field>
      <Field id={`${idp}-brand`} label={t.brandF}>
        <select id={`${idp}-brand`} className="input" value={f.brand} onChange={(e) => replace(q({ brand: e.target.value || undefined }))}>
          <option value="">{t.anyBrand}</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <fieldset>
        <legend>{t.location}</legend>
        <label className="check"><input type="checkbox" checked={f.near} onChange={(e) => replace(q({ near: e.target.checked ? '1' : undefined }))} />{t.nearOnly(t.cities[city])}</label>
      </fieldset>
      {active > 0 && <a className="btn small" href={clear}>{t.clearAll}</a>}
    </div>
  );

  return (
    <>
      <h1 className="sr">{lang === 'ar' ? 'اكتشف المنتجات عبر متاجر لك' : 'Discover products across LAK stores'}</h1>
      <nav className="mk-cats" aria-label={t.catsLabel}>
        <a href={q({ cat: undefined })} aria-current={!f.cat ? 'true' : undefined} className="mk-cat"><span className="mk-cat-ico"><Ico.compass /></span>{t.allCats}</a>
        {CATS.map((c) => (
          <a key={c} href={q({ cat: c })} aria-current={f.cat === c ? 'true' : undefined} className="mk-cat"><span className="mk-cat-ico"><CatIcon cat={c} /></span>{t.cats[c]}</a>
        ))}
      </nav>

      {!filtered && (
        <section className="mk-section" aria-labelledby="mk-stores-h">
          <h2 id="mk-stores-h">{t.storesTitle}</h2>
          <ul className="mk-stores">
            {SELLERS.map((x) => (
              <li key={x.id}>
                <a href={go(`/s/${x.id}`)} className="mk-store-card">
                  <span className="mk-store-band" style={{ background: x.colour }} aria-hidden="true" />
                  <Avatar name={x.name[lang]} colour={x.colour} size={44} />
                  <strong>{x.name[lang]}</strong>
                  <span className="small muted">{x.tagline[lang]}</span>
                  <span className="small mk-meta"><Ico.pin />{t.cities[x.city]}</span>
                </a>
              </li>
            ))}
          </ul>
          {nearSellers.length > 0 && <p className="small muted">{t.storesNear(t.cities[city])}: {nearSellers.map((x) => x.name[lang]).join('، ')}</p>}
        </section>
      )}

      <section className="mk-section" aria-labelledby="mk-res-h">
        <div className="mk-results-bar">
          <h2 id="mk-res-h" aria-live="polite">{f.cat ? `${t.cats[f.cat]} · ` : ''}{t.results(results.length)}</h2>
          <div className="mk-results-tools">
            <button type="button" className="btn small mk-filter-btn" onClick={() => setSheet(true)}><Ico.filter />{t.filtersN(active)}</button>
            <label className="mk-sort">
              <span className="sr">{t.sort}</span>
              <select className="input" value={f.sort} onChange={(e) => replace(q({ sort: e.target.value === 'relevance' ? undefined : e.target.value }))} aria-label={t.sort}>
                {(['relevance', 'priceAsc', 'priceDesc'] as Sort[]).map((x) => <option key={x} value={x}>{t.sorts[x]}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="mk-discover">
          <aside className="mk-aside" aria-label={t.filters}>{controls('mk-f')}</aside>
          <div className="mk-grow">
            {results.length === 0
              ? <Empty action={<a className="btn" href={go('')}>{t.clearAll}</a>}>{t.noResults}</Empty>
              : <ul className="mk-grid">{results.map((p) => <li key={p.id}><ProductCard {...ctx} p={p} /></li>)}</ul>}
          </div>
        </div>
      </section>

      {sheet && (
        <Dialog title={t.filters} onClose={() => setSheet(false)} footer={<>
          <a className="btn" href={clear} onClick={() => setSheet(false)}>{t.clearAll}</a>
          <button type="button" className="btn primary" onClick={() => setSheet(false)}>{t.showResults(results.length)}</button>
        </>}>
          {controls('mk-fs')}
        </Dialog>
      )}
    </>
  );
}

function ProductCard({ t, lang, go, p }: Ctx & { p: Product }) {
  const seller = sellerOf(p.seller)!;
  return (
    <article className="mk-card">
      <a href={go(`/p/${p.id}`)} className="mk-card-link">
        <span className="mk-card-art"><ProductArt art={p.art} tone={p.tone} />{p.stock <= 0 && <span className="mk-oos">{t.outOfStock}</span>}</span>
        <span className="mk-card-body">
          <span className="mk-card-name">{p.name[lang]}</span>
          <span className="mk-card-price"><Money v={p.price} /></span>
        </span>
      </a>
      <a href={go(`/s/${seller.id}`)} className="mk-card-seller">
        <Avatar name={seller.name[lang]} colour={seller.colour} size={22} />
        <span className="mk-ellipsis"><span className="sr">{t.soldBy} </span>{seller.name[lang]}</span>
        <span className="muted">· {t.cities[seller.city]}</span>
      </a>
    </article>
  );
}

/* ---------- Store page ---------- */

function ShippingFacts({ t, city, seller }: Ctx & { seller: Seller }) {
  const fee = shippingFee(seller, city, 0);
  const days = deliveryDays(seller, city);
  return (
    <dl className="mk-facts">
      <div><dt><Ico.truck />{t.shipTo(t.cities[city])}</dt><dd>{fee === null ? <Badge tone="warning">{t.noDelivery(t.cities[city])}</Badge> : <>{fee === 0 ? t.free : <Money v={fee} />}{days && <span className="muted small"> · {t.deliveryIn(days[0], days[1])}</span>}</>}</dd></div>
      <div><dt><Ico.bag />{t.freeOver}</dt><dd>{seller.shipping.freeOver === null ? <span className="muted">{t.noFree}</span> : <Money v={seller.shipping.freeOver} />}</dd></div>
      <div><dt><Ico.cash />{t.codFee}</dt><dd>{seller.shipping.codFee === null ? <span className="muted">{t.codNo}</span> : <Money v={seller.shipping.codFee} />}</dd></div>
      <div><dt><Ico.ret />{t.returns}</dt><dd>{t.returnsDays(seller.returnsDays)}</dd></div>
    </dl>
  );
}

function SellerIdentity({ t, lang, seller }: Ctx & { seller: Seller }) {
  return (
    <dl className="mk-facts">
      <div><dt>{t.legalName}</dt><dd>{seller.legal[lang]}</dd></div>
      <div><dt>{t.cr}</dt><dd><Id>{seller.cr}</Id></dd></div>
      <div><dt>{t.vatNo}</dt><dd><Id>{seller.vat}</Id></dd></div>
      <div><dt>{t.basedIn}</dt><dd>{t.cities[seller.city]}</dd></div>
    </dl>
  );
}

function StorePage(ctx: Ctx & { id: string }) {
  const { t, lang, go, id } = ctx;
  const seller = sellerOf(id);
  if (!seller) return <Empty action={<a className="btn" href={go('')}>{t.backDiscover}</a>}>{t.storeNotFound}</Empty>;
  const items = PRODUCTS.filter((p) => p.seller === id);
  return (
    <>
      <section className="mk-store-hero" style={{ ['--seller' as string]: seller.colour }}>
        <Avatar name={seller.name[lang]} colour={seller.colour} size={64} />
        <div className="mk-grow">
          <h1>{seller.name[lang]}</h1>
          <p>{seller.tagline[lang]}</p>
          <p className="small mk-meta"><Ico.pin />{t.cities[seller.city]} · {t.onLakSince(seller.since)}</p>
        </div>
        <a className="btn" href={go('', { store: seller.id })}><Ico.search />{t.searchStore}</a>
      </section>
      <div className="mk-two">
        <section className="card mk-panel" aria-labelledby="mk-id-h"><h2 id="mk-id-h"><Ico.shield />{t.identity}</h2><SellerIdentity {...ctx} seller={seller} /></section>
        <section className="card mk-panel" aria-labelledby="mk-sp-h"><h2 id="mk-sp-h"><Ico.truck />{t.shippingPolicy}</h2><ShippingFacts {...ctx} seller={seller} /></section>
      </div>
      <section className="mk-section" aria-labelledby="mk-sprod-h">
        <h2 id="mk-sprod-h">{t.storeProducts} · {t.results(items.length)}</h2>
        <ul className="mk-grid">{items.map((p) => <li key={p.id}><ProductCard {...ctx} p={p} /></li>)}</ul>
      </section>
    </>
  );
}

/* ---------- Product page ---------- */

function Stepper({ t, value, max, onChange, label }: { t: Strings; value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="mk-stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={t.less}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={t.more}>+</button>
    </div>
  );
}

function ProductPage(ctx: Ctx & { id: string }) {
  const { t, lang, city, go, id } = ctx;
  const p = PRODUCTS.find((x) => x.id === id);
  const [qty, setQ] = useState(1);
  const [added, setAdded] = useState(false);
  if (!p) return <Empty action={<a className="btn" href={go('')}>{t.backDiscover}</a>}>{t.productNotFound}</Empty>;
  const seller = sellerOf(p.seller)!;
  const fee = shippingFee(seller, city, p.price * qty);
  const days = deliveryDays(seller, city);
  const max = Math.min(10, p.stock);
  const more = PRODUCTS.filter((x) => x.seller === seller.id && x.id !== p.id);
  return (
    <>
      <a className="back" href={go('', { cat: p.cat })}>{t.cats[p.cat]}</a>
      <div className="mk-pdp">
        <div className="mk-pdp-media"><ProductArt art={p.art} tone={p.tone} /></div>
        <div className="mk-pdp-info">
          <span className="muted small">{p.brand}</span>
          <h1>{p.name[lang]}</h1>
          <div className="mk-price"><Money v={p.price} /> <span className="muted small">{t.vatIncl}</span></div>
          <a href={go(`/s/${seller.id}`)} className="mk-soldby">
            <Avatar name={seller.name[lang]} colour={seller.colour} size={36} />
            <span className="mk-grow"><span className="small muted">{t.soldBy}</span><strong className="mk-block">{seller.name[lang]}</strong></span>
            <span className="mk-flip" aria-hidden="true"><Ico.chevron /></span>
          </a>
          {p.stock <= 0 ? <Badge tone="danger">{t.outOfStock}</Badge> : (
            <>
              <span className={p.stock <= 5 ? 'mk-low' : 'muted small'}>{t.inStock(p.stock)}</span>
              <div className="mk-buy">
                <Stepper t={t} value={qty} max={max} label={t.qty} onChange={(n) => setQ(Math.max(1, Math.min(max, n)))} />
                <button type="button" className="btn primary mk-grow" onClick={() => { marketStore.set((x) => ({ ...x, cart: addLine(x.cart, p, qty) })); setAdded(true); }}>{t.addToCart}</button>
              </div>
              {added && <p className="mk-added" role="status"><Ico.check />{t.addedTo(seller.name[lang])} <a href={go('/cart')}>{t.viewCart}</a></p>}
            </>
          )}

          <section className="mk-before" aria-labelledby="mk-bb-h">
            <h2 id="mk-bb-h">{t.beforeBuy}</h2>
            <dl className="mk-facts">
              <div><dt>{t.price}</dt><dd><Money v={p.price * qty} /></dd></div>
              <div><dt>{t.shippingTo(t.cities[city])}</dt><dd>{fee === null ? <Badge tone="warning">{t.noDelivery(t.cities[city])}</Badge> : fee === 0 ? t.free : <Money v={fee} />}</dd></div>
              {fee !== null && fee > 0 && seller.shipping.freeOver !== null && <p className="small muted">{t.shipFreeAt(moneyStr(seller.shipping.freeOver, lang))}</p>}
              {days && <div><dt>{t.delivery}</dt><dd>{t.deliveryIn(days[0], days[1])}</dd></div>}
              <div><dt>{t.codFee}</dt><dd>{seller.shipping.codFee === null ? <span className="muted">{t.codNo}</span> : <Money v={seller.shipping.codFee} />}</dd></div>
              <div><dt>{t.returns}</dt><dd>{t.returnsDays(seller.returnsDays)}</dd></div>
              <div><dt>{t.otherFees}</dt><dd className="small">{t.otherFeesBody}</dd></div>
            </dl>
          </section>

          <section className="mk-resp" aria-labelledby="mk-resp-h">
            <h2 id="mk-resp-h"><Ico.shield />{t.responsibility}</h2>
            <p>{t.responsibilityBody(seller.name[lang])}</p>
            <SellerIdentity {...ctx} seller={seller} />
          </section>

          <section aria-labelledby="mk-desc-h"><h2 id="mk-desc-h">{t.description}</h2><p>{p.desc[lang]}</p></section>
        </div>
      </div>
      {more.length > 0 && (
        <section className="mk-section" aria-labelledby="mk-more-h">
          <h2 id="mk-more-h">{t.moreFrom(seller.name[lang])}</h2>
          <ul className="mk-grid">{more.map((x) => <li key={x.id}><ProductCard {...ctx} p={x} /></li>)}</ul>
        </section>
      )}
    </>
  );
}

/* ---------- Cart (grouped per seller) ---------- */

function InterimNote({ t }: { t: Strings }) {
  return (
    <div className="mk-interim" role="note">
      <span className="mk-interim-ico" aria-hidden="true"><Ico.split /></span>
      <div><strong>{t.interim}</strong><p>{t.interimBody}</p><p className="small mk-interim-note"><Ico.info />{t.interimNote}</p></div>
    </div>
  );
}

function CartPage(ctx: Ctx) {
  const { t, lang, s, city, go } = ctx;
  const groups = groupCart(s.cart, PRODUCTS, SELLERS, city);
  const units = s.cart.reduce((n, l) => n + l.qty, 0);
  if (!groups.length) {
    return (
      <>
        <PageHeader title={t.cartTitle} />
        <InterimNote t={t} />
        <Empty action={<a className="btn primary" href={go('')}>{t.startShopping}</a>}>{t.cartEmpty}</Empty>
      </>
    );
  }
  return (
    <>
      <PageHeader title={t.cartTitle} sub={`${t.units(units)} · ${t.checkoutsNeeded(groups.length)}`} />
      <InterimNote t={t} />
      <ol className="mk-groups">
        {groups.map((g, i) => {
          const block = checkoutBlock(g, 'card');
          return (
            <li key={g.seller.id} className="card mk-group" aria-labelledby={`mk-g-${g.seller.id}`}>
              <div className="mk-group-head">
                <Avatar name={g.seller.name[lang]} colour={g.seller.colour} size={36} />
                <div className="mk-grow">
                  <h2 id={`mk-g-${g.seller.id}`}><a href={go(`/s/${g.seller.id}`)}>{g.seller.name[lang]}</a></h2>
                  <span className="small muted">{t.shipsFrom(t.cities[g.seller.city])} · {t.units(g.units)}</span>
                </div>
                <span className="mk-pill">{i + 1} / {groups.length}</span>
              </div>
              <ul className="mk-lines">
                {g.lines.map((l) => (
                  <li key={l.product.id}>
                    <a href={go(`/p/${l.product.id}`)} className="mk-thumb" aria-hidden="true" tabIndex={-1}><ProductArt art={l.product.art} tone={l.product.tone} /></a>
                    <div className="mk-grow mk-line-main">
                      <a href={go(`/p/${l.product.id}`)} className="mk-line-name">{l.product.name[lang]}</a>
                      <span className="small muted"><Money v={l.product.price} /></span>
                      <div className="mk-line-tools">
                        <Stepper t={t} value={l.qty} max={Math.min(10, l.product.stock)} label={`${t.qty}: ${l.product.name[lang]}`}
                          onChange={(n) => marketStore.set((x) => ({ ...x, cart: setQty(x.cart, l.product, n) }))} />
                        <button type="button" className="mk-icon-btn" aria-label={t.removeItem(l.product.name[lang])} onClick={() => marketStore.set((x) => ({ ...x, cart: setQty(x.cart, l.product, 0) }))}><Ico.trash /></button>
                      </div>
                    </div>
                    <strong className="mk-line-total"><Money v={l.total} /></strong>
                  </li>
                ))}
              </ul>
              <div className="mk-group-foot">
                <dl className="breakdown">
                  <div><dt>{t.subtotal}</dt><dd><Money v={g.subtotal} /></dd></div>
                  <div><dt>{t.shippingTo(t.cities[city])}</dt><dd>{g.shipping === null ? '—' : g.shipping === 0 ? t.free : <Money v={g.shipping} />}</dd></div>
                  <div className="sum"><dt>{t.total}</dt><dd><Money v={g.total} /></dd></div>
                  <div className="small muted"><dt>{t.vatIn}</dt><dd><Money v={g.vat} /></dd></div>
                </dl>
                {g.toFree > 0 && <p className="small mk-hint"><Ico.truck />{t.toFree(moneyStr(g.toFree, lang))}</p>}
                {block && <Alert tone="warning">{t.blocks[block]}</Alert>}
                <div className="mk-group-actions">
                  <button type="button" className="btn small" onClick={() => marketStore.set((x) => ({ ...x, cart: removeSeller(x.cart, PRODUCTS, g.seller.id) }))}>{t.removeStore}</button>
                  {block
                    ? <button type="button" className="btn primary" disabled>{t.checkoutWith(g.seller.name[lang])}</button>
                    : <a className="btn primary" href={go(`/checkout/${g.seller.id}`)}>{t.checkoutWith(g.seller.name[lang])} · {moneyStr(g.total, lang)}</a>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ---------- Checkout (one seller) ---------- */

function Checkout(ctx: Ctx & { sellerId: string }) {
  const { t, lang, s, city, go, route, sellerId } = ctx;
  const group = groupCart(s.cart, PRODUCTS, SELLERS, city).find((g) => g.seller.id === sellerId);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [method, setMethod] = useState<PayMethod>('card');
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const seller = sellerOf(sellerId);
  if (!seller) return <Empty action={<a className="btn" href={go('/cart')}>{t.backCart}</a>}>{t.storeNotFound}</Empty>;
  if (!group) return <><a className="back" href={go('/cart')}>{t.backCart}</a><Empty action={<a className="btn" href={go('/cart')}>{t.backCart}</a>}>{t.blocks.empty}</Empty></>;

  const errors = {
    name: !form.name.trim() ? t.required : undefined,
    phone: !form.phone.trim() ? t.required : !/^05\d{8}$/.test(form.phone.replace(/\s/g, '')) ? t.badPhone : undefined,
    address: !form.address.trim() ? t.required : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const block = checkoutBlock(group, method);
  const totals = checkoutTotals(group, method);
  const setCity = (c: CityId) => {
    const cur: Record<string, string> = {};
    route.query.forEach((v, k) => { cur[k] = v; });
    replace(link(`/market/checkout/${sellerId}`, { ...cur, city: c === 'riyadh' ? undefined : c }));
  };
  const submit = (e: FormEvent) => { e.preventDefault(); setTried(true); if (!invalid && !block) setConfirm(true); };
  const place = () => {
    const ref = `MK-${20500 + s.seq}`;
    const o = placeOrder(group, method, city, now(), ref);
    if (!o) return;
    marketStore.set((x) => ({
      ...x, seq: x.seq + 1, orders: [o, ...x.orders], cart: removeSeller(x.cart, PRODUCTS, sellerId),
      notes: [{ id: `n${x.seq}-o`, at: o.createdAt, kind: 'orderPlaced', ref, read: false }, ...x.notes],
    }));
    setConfirm(false);
    navigate(go(`/orders/${ref}`, { placed: '1' }));
  };
  const err = (k: keyof typeof errors) => (tried ? errors[k] : undefined);
  const aria = (k: keyof typeof errors, hint = false) => ({ 'aria-invalid': err(k) ? ('true' as const) : undefined, 'aria-describedby': err(k) ? `mk-co-${k}-err` : hint ? `mk-co-${k}-hint` : undefined });

  return (
    <>
      <a className="back" href={go('/cart')}>{t.backCart}</a>
      <PageHeader title={t.checkoutTitle(seller.name[lang])} sub={t.checkoutSub} />
      <form className="mk-checkout" onSubmit={submit} noValidate>
        <div className="mk-co-main">
          {tried && invalid && <Alert tone="danger">{t.fixErrors}</Alert>}
          <section className="card mk-panel" aria-labelledby="mk-co-c">
            <h2 id="mk-co-c">{t.contact}</h2>
            <div className="mk-form">
              <Field id="mk-co-name" label={t.fullName} error={err('name')}>
                <input id="mk-co-name" className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} {...aria('name')} />
              </Field>
              <Field id="mk-co-phone" label={t.phone} hint={t.phoneHint} error={err('phone')}>
                <input id="mk-co-phone" className="input" dir="ltr" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} {...aria('phone', true)} />
              </Field>
              <Field id="mk-co-city" label={t.city}>
                <select id="mk-co-city" className="input" value={city} onChange={(e) => setCity(e.target.value as CityId)}>
                  {CITIES.map((c) => <option key={c} value={c}>{t.cities[c]}</option>)}
                </select>
              </Field>
              <Field id="mk-co-address" label={t.address} error={err('address')}>
                <input id="mk-co-address" className="input" autoComplete="street-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} {...aria('address')} />
              </Field>
            </div>
            {group.shipping === null && <Alert tone="warning">{t.blocks.noDelivery}</Alert>}
          </section>
          <section className="card mk-panel" aria-labelledby="mk-co-p">
            <h2 id="mk-co-p">{t.payment}</h2>
            <fieldset>
              <legend className="sr">{t.payment}</legend>
              <label className="radio"><input type="radio" name="mk-pay" checked={method === 'card'} onChange={() => setMethod('card')} /><Ico.card /><span className="mk-grow">{t.card}<span className="mk-block small muted">{t.cardHint}</span></span></label>
              <label className="radio" aria-disabled={seller.shipping.codFee === null || undefined}>
                <input type="radio" name="mk-pay" checked={method === 'cod'} disabled={seller.shipping.codFee === null} onChange={() => setMethod('cod')} />
                <Ico.cash /><span className="mk-grow">{t.codLabel}<span className="mk-block small muted">{seller.shipping.codFee === null ? t.blocks.codUnavailable : <>{t.codFee}: <Money v={seller.shipping.codFee} /></>}</span></span>
              </label>
            </fieldset>
          </section>
          <p className="mk-shared small"><Ico.shield /><span><strong>{t.shared}: </strong>{t.sharedBody(seller.name[lang])}</span></p>
        </div>
        <aside className="card mk-panel mk-co-side" aria-labelledby="mk-co-s">
          <h2 id="mk-co-s">{t.summary}</h2>
          <div className="mk-row"><Avatar name={seller.name[lang]} colour={seller.colour} size={28} /><strong>{seller.name[lang]}</strong></div>
          <ul className="mk-sum-lines">
            {group.lines.map((l) => <li key={l.product.id}><span className="mk-grow">{l.product.name[lang]} <span className="muted">× {l.qty}</span></span><Money v={l.total} /></li>)}
          </ul>
          <dl className="breakdown">
            <div><dt>{t.subtotal}</dt><dd><Money v={totals.subtotal} /></dd></div>
            <div><dt>{t.shippingTo(t.cities[city])}</dt><dd>{group.shipping === null ? '—' : totals.shipping === 0 ? t.free : <Money v={totals.shipping} />}</dd></div>
            {totals.codFee > 0 && <div><dt>{t.codFee}</dt><dd><Money v={totals.codFee} /></dd></div>}
            <div className="sum"><dt>{t.total}</dt><dd><Money v={totals.total} /></dd></div>
            <div className="small muted"><dt>{t.vatIn}</dt><dd><Money v={totals.vat} /></dd></div>
          </dl>
          {block && block !== 'noDelivery' && <p className="small error">{t.blocks[block]}</p>}
          <button type="submit" className="btn primary mk-wide" disabled={!!block}>{t.placeOrder(moneyStr(totals.total, lang))}</button>
          <Sim />
        </aside>
      </form>
      {confirm && (
        <Dialog title={t.confirmTitle} onClose={() => setConfirm(false)} footer={<>
          <button type="button" className="btn" onClick={() => setConfirm(false)}>{t.cancel}</button>
          <button type="button" className="btn primary" onClick={place}>{t.confirm}</button>
        </>}>
          <p>{t.confirmBody(seller.name[lang], moneyStr(totals.total, lang))}</p>
          <p>{method === 'cod' ? t.confirmCod : t.confirmCard}</p>
          <Sim />
        </Dialog>
      )}
    </>
  );
}

/* ---------- Orders ---------- */

const payTone = (o: Order): Tone => (o.pay === 'cod_due' ? 'warning' : 'success');
const shipTone = (o: Order): Tone => (o.ship === 'delivered' ? 'success' : o.ship === 'in_transit' ? 'info' : 'neutral');

function OrderStates({ t, o }: { t: Strings; o: Order }) {
  return (
    <dl className="mk-states">
      <div><dt>{t.payState}</dt><dd><Badge tone={payTone(o)}>{t.pay[o.pay]}</Badge></dd></div>
      <div><dt>{t.fulState}</dt><dd><Badge tone={o.ful === 'fulfilled' ? 'success' : 'neutral'}>{t.ful[o.ful]}</Badge></dd></div>
      <div><dt>{t.shipState}</dt><dd><Badge tone={shipTone(o)}>{t.ship[o.ship]}</Badge></dd></div>
      <div><dt>{t.retState}</dt><dd><Badge tone={o.ret === 'requested' ? 'warning' : 'neutral'}>{t.ret[o.ret]}</Badge></dd></div>
    </dl>
  );
}

function OrdersPage({ t, lang, s, go }: Ctx) {
  return (
    <>
      <PageHeader title={t.ordersTitle} sub={t.ordersSub} />
      {s.orders.length === 0 ? <Empty action={<a className="btn" href={go('')}>{t.startShopping}</a>}>{t.noOrders}</Empty> : (
        <ul className="mk-orders">
          {s.orders.map((o) => {
            const seller = sellerOf(o.seller)!;
            return (
              <li key={o.ref} className="card mk-order">
                <div className="mk-order-head">
                  <Avatar name={seller.name[lang]} colour={seller.colour} size={36} />
                  <div className="mk-grow">
                    <a href={go(`/orders/${o.ref}`)} className="strong">{t.orderRef} <Id>{o.ref}</Id></a>
                    <span className="mk-block small muted">{seller.name[lang]} · {fmtDate(o.createdAt, lang)}</span>
                  </div>
                  <strong><Money v={o.total} /></strong>
                </div>
                <OrderStates t={t} o={o} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function OrderPage(ctx: Ctx & { ref_: string }) {
  const { t, lang, s, go, route, ref_ } = ctx;
  const o = s.orders.find((x) => x.ref === ref_);
  const [reason, setReason] = useState('size');
  const [sent, setSent] = useState(false);
  if (!o) return <><a className="back" href={go('/orders')}>{t.allOrders}</a><Empty>{t.orderNotFound}</Empty></>;
  const seller = sellerOf(o.seller)!;
  const block = returnBlock(o, seller, now());
  const update = (fn: (x: Order) => Order, note?: Note['kind']) => marketStore.set((x) => ({
    ...x, seq: x.seq + 1,
    orders: x.orders.map((y) => (y.ref === o.ref ? fn(y) : y)),
    notes: note ? [{ id: `n${x.seq}-${note}`, at: now(), kind: note, ref: o.ref, read: false }, ...x.notes] : x.notes,
  }));
  return (
    <>
      <a className="back" href={go('/orders')}>{t.allOrders}</a>
      {route.query.get('placed') && <Alert tone="success">{t.orderPlaced}</Alert>}
      <PageHeader title={<>{t.orderRef} <Id>{o.ref}</Id></>} sub={`${seller.name[lang]} · ${fmtDate(o.createdAt, lang)} · ${t.cities[o.city]}`} />
      <section className="card mk-panel" aria-label={t.orderRef}><OrderStates t={t} o={o} /></section>
      <div className="mk-two">
        <section className="card mk-panel" aria-labelledby="mk-o-i">
          <h2 id="mk-o-i">{t.items}</h2>
          <ul className="mk-sum-lines">
            {o.lines.map((l) => <li key={l.productId}><span className="mk-grow">{l.name[lang]} <span className="muted">× {l.qty}</span></span><Money v={l.price * l.qty} /></li>)}
          </ul>
          <h3 className="mk-h3">{t.breakdown}</h3>
          <dl className="breakdown">
            <div><dt>{t.subtotal}</dt><dd><Money v={o.subtotal} /></dd></div>
            <div><dt>{t.shipping}</dt><dd>{o.shipping === 0 ? t.free : <Money v={o.shipping} />}</dd></div>
            {o.codFee > 0 && <div><dt>{t.codFee}</dt><dd><Money v={o.codFee} /></dd></div>}
            <div className="sum"><dt>{t.total}</dt><dd><Money v={o.total} /></dd></div>
          </dl>
        </section>
        <section className="card mk-panel" aria-labelledby="mk-o-s">
          <h2 id="mk-o-s">{t.sellerSupport}</h2>
          <div className="mk-row"><Avatar name={seller.name[lang]} colour={seller.colour} size={32} /><a href={go(`/s/${seller.id}`)} className="strong">{seller.name[lang]}</a></div>
          <p className="small">{t.sellerHandles(seller.name[lang])}</p>
          <a className="btn small" href={go('/help', { order: o.ref })}>{t.contactSeller}</a>
          <h3 className="mk-h3">{t.requestReturn}</h3>
          <p className="small muted">{t.returnsDays(seller.returnsDays)}</p>
          {block ? <p className="small">{t.returnBlocks[block]}</p> : (
            <form className="mk-return" onSubmit={(e) => { e.preventDefault(); update((x) => requestReturn(x, seller, now(), reason), 'returnRequested'); setSent(true); }}>
              <Field id="mk-ret" label={t.returnReason}>
                <select id="mk-ret" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {Object.entries(t.reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <div className="actions"><button type="submit" className="btn">{t.sendReturn}</button><Sim /></div>
            </form>
          )}
          {sent && o.ret === 'requested' && <Alert tone="success">{t.returnSent}</Alert>}
          <p className="small muted">{t.refundNote}</p>
        </section>
      </div>
      {o.ship !== 'delivered' && (
        <details className="mk-test">
          <summary>{t.testPanel} <Sim /></summary>
          <div className="mk-test-body">
            <p className="small muted">{t.testShip}</p>
            <div className="actions">
              {o.ship === 'none' && <button type="button" className="btn" onClick={() => update((x) => ({ ...x, ful: 'fulfilled', ship: 'in_transit' }), 'shipped')}>{t.markShipped}</button>}
              {o.ship === 'in_transit' && <button type="button" className="btn" onClick={() => update((x) => ({ ...x, ship: 'delivered', deliveredAt: now(), pay: x.pay === 'cod_due' ? 'collected' : x.pay }), 'delivered')}>{t.markDelivered}</button>}
            </div>
          </div>
        </details>
      )}
    </>
  );
}

/* ---------- Alerts ---------- */

function AlertsPage({ t, lang, s, go }: Ctx) {
  const unread = s.notes.some((n) => !n.read);
  return (
    <>
      <PageHeader title={t.notesTitle} actions={unread ? <button type="button" className="btn small" onClick={() => marketStore.set((x) => ({ ...x, notes: x.notes.map((n) => ({ ...n, read: true })) }))}>{t.markAll}</button> : undefined} />
      {s.notes.length === 0 ? <Empty>{t.notesEmpty}</Empty> : (
        <ul className="card mk-notes">
          {s.notes.map((n) => {
            const o = s.orders.find((x) => x.ref === n.ref);
            const seller = o && sellerOf(o.seller);
            return (
              <li key={n.id} className={n.read ? '' : 'unread'}>
                <a href={n.ref ? go(`/orders/${n.ref}`) : go('')} onClick={() => marketStore.set((x) => ({ ...x, notes: x.notes.map((y) => (y.id === n.id ? { ...y, read: true } : y)) }))}>
                  <span className="mk-note-ico" aria-hidden="true">{n.kind === 'shipped' ? <Ico.truck /> : n.kind === 'returnRequested' ? <Ico.ret /> : <Ico.box />}</span>
                  <span className="mk-grow">
                    <strong className="mk-block">{t.noteText[n.kind]}</strong>
                    <span className="small muted">{n.ref && <><Id>{n.ref}</Id> · </>}{seller ? `${seller.name[lang]} · ` : ''}{fmtDate(n.at, lang)}</span>
                  </span>
                  {!n.read && <span className="mk-unread"><span className="sr">{t.unread}</span></span>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ---------- Help ---------- */

function HelpPage({ t, lang, s, go, route }: Ctx) {
  const [topic, setTopic] = useState(route.query.get('order') ? 'order' : 'account');
  const [order, setOrder] = useState(route.query.get('order') ?? '');
  const [msg, setMsg] = useState('');
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const error = tried && !msg.trim() ? t.required : undefined;
  return (
    <>
      <PageHeader title={t.helpTitle} sub={t.helpSub} />
      <div className="mk-two">
        <section className="card mk-panel" aria-labelledby="mk-h-s">
          <h2 id="mk-h-s"><Ico.store />{t.sellerSide}</h2>
          <p className="small">{t.sellerSideBody}</p>
          {s.orders.length === 0 ? <p className="muted small">{t.noOrders}</p> : (
            <ul className="mk-help-orders">
              {s.orders.map((o) => (
                <li key={o.ref}><a href={go(`/orders/${o.ref}`)}><Id>{o.ref}</Id> · {sellerOf(o.seller)!.name[lang]}</a></li>
              ))}
            </ul>
          )}
        </section>
        <section className="card mk-panel" aria-labelledby="mk-h-l">
          <h2 id="mk-h-l"><img src="/lak-mark.png" alt="" width="14" height="20" />{t.lakSide}</h2>
          <p className="small">{t.lakSideBody}</p>
          <form className="mk-form-col" noValidate onSubmit={(e) => {
            e.preventDefault(); setTried(true);
            if (!msg.trim()) return;
            const ref = `SUP-${3100 + s.seq}`;
            marketStore.set((x) => ({ ...x, seq: x.seq + 1, tickets: [{ ref, topic, order, at: now() }, ...x.tickets] }));
            setDone(ref); setMsg(''); setTried(false);
          }}>
            <Field id="mk-h-topic" label={t.topic}>
              <select id="mk-h-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)}>
                {Object.entries(t.topics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field id="mk-h-order" label={t.aboutOrder}>
              <select id="mk-h-order" className="input" value={order} onChange={(e) => setOrder(e.target.value)}>
                <option value="">{t.noOrder}</option>
                {s.orders.map((o) => <option key={o.ref} value={o.ref}>{o.ref}</option>)}
              </select>
            </Field>
            <Field id="mk-h-msg" label={t.message} hint={t.messageHint} error={error}>
              <textarea id="mk-h-msg" className="input" value={msg} onChange={(e) => setMsg(e.target.value)} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'mk-h-msg-err' : 'mk-h-msg-hint'} />
            </Field>
            <div className="actions"><button type="submit" className="btn primary">{t.send}</button><Sim /></div>
          </form>
          {done && <Alert tone="success">{t.ticketSent(done)}</Alert>}
          {s.tickets.length > 0 && (
            <>
              <h3 className="mk-h3">{t.tickets}</h3>
              <ul className="mk-help-orders">{s.tickets.map((k) => <li key={k.ref}><Id>{k.ref}</Id> · {t.topics[k.topic]}{k.order && <> · <Id>{k.order}</Id></>}</li>)}</ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}

/* ---------- Merchant side: marketplace listing ---------- */

const STATE_TONE: Record<ListingState, Tone> = {
  listed: 'success', in_review: 'info', excluded: 'neutral', needs_fix: 'warning', out_of_stock: 'neutral', rejected: 'danger', store_blocked: 'danger', not_submitted: 'neutral',
};
const STATE_ORDER: ListingState[] = ['listed', 'in_review', 'not_submitted', 'needs_fix', 'rejected', 'out_of_stock', 'excluded', 'store_blocked'];

function SellerListing({ t, lang, s, route, go }: Ctx) {
  const me = sellerOf(MY_STORE)!;
  const filter = route.query.get('state') as ListingState | null;
  const sum = summarize(s.listing, s.verified);
  const rows = s.listing.filter((i) => !filter || listingState(i, s.verified).state === filter);
  const [msg, setMsg] = useState('');
  const submit = (i: ListingItem) => {
    marketStore.set((x) => ({ ...x, listing: x.listing.map((y) => (y.id === i.id ? { ...y, review: 'pending', rejectReason: undefined } : y)) }));
    setMsg(t.submitted(i.name[lang]));
  };
  return (
    <div className="mk-seller">
      <div className="mk-seller-strip">
        <Badge tone="info">{t.merchantView}</Badge>
        <Avatar name={me.name[lang]} colour={me.colour} size={24} />
        <strong>{me.name[lang]}</strong>
        <a href={go('')} className="mk-grow-end">{t.brand}</a>
      </div>
      <div className="mk-seller-main">
        <PageHeader title={t.sellerTitle} sub={t.sellerSub} />
        <Alert tone="warning" title={t.pending}>{t.pendingBody}</Alert>
        <div className="mk-three">
          <section className="card mk-panel" aria-labelledby="mk-sl-r">
            <h2 id="mk-sl-r">{t.rules} <Badge tone="warning">{t.pending}</Badge></h2>
            <ul className="mk-rules">{t.rulesList.map((r) => <li key={r}><Ico.check />{r}</li>)}</ul>
          </section>
          <section className="card mk-panel" aria-labelledby="mk-sl-x">
            <h2 id="mk-sl-x">{t.excluded} <Badge tone="warning">{t.pending}</Badge></h2>
            <ul className="mk-rules excl">{EXCLUDED.map((c) => <li key={c}><Ico.x />{t.excludedCats[c]}</li>)}</ul>
          </section>
          <section className="card mk-panel" aria-labelledby="mk-sl-v">
            <h2 id="mk-sl-v">{t.storeVerification}</h2>
            <Badge tone={s.verified ? 'success' : 'danger'}>{s.verified ? t.verified : t.notVerified}</Badge>
            {!s.verified && <p className="small">{t.storeBlocked}</p>}
            <details className="mk-test">
              <summary>{t.testPanel} <Sim /></summary>
              <div className="mk-test-body">
                <p className="small muted">{t.testStore}</p>
                <label className="check"><input type="checkbox" checked={s.verified} onChange={(e) => marketStore.set((x) => ({ ...x, verified: e.target.checked }))} />{t.verified}</label>
              </div>
            </details>
          </section>
        </div>

        <section className="card" aria-labelledby="mk-sl-p">
          <div className="card-head"><h2 id="mk-sl-p">{t.products}</h2></div>
          <div className="card-body">
            <LinkTabs label={t.stateFilter} items={[
              { href: go('/seller'), label: <>{t.all} · {s.listing.length}</>, current: !filter },
              ...STATE_ORDER.filter((k) => sum[k] > 0).map((k) => ({ href: go('/seller', { state: k }), label: <>{t.states[k]} · {sum[k]}</>, current: filter === k })),
            ]} />
            <p className="sr" role="status" aria-live="polite">{msg}</p>
            {rows.length === 0 ? <Empty>{t.noResults}</Empty> : (
              <ul className="mk-rows">
                <li className="mk-rows-head" aria-hidden="true"><span>{t.product}</span><span>{t.state}</span><span>{t.why}</span><span>{t.action}</span></li>
                {rows.map((i) => {
                  const st = listingState(i, s.verified);
                  const why = st.state === 'needs_fix'
                    ? <><ul className="mk-fixes">{st.fixes.map((f) => <li key={f}>{t.fixes[f]}</li>)}</ul><span className="muted">{t.fixWhere}</span></>
                    : st.state === 'rejected' ? t.rejectReasons[i.rejectReason ?? 'claim']
                    : st.state === 'excluded' ? <>{t.why_.excluded} <span className="muted">({t.excludedCats[i.cat as keyof Strings['excludedCats']]})</span></>
                    : t.why_[st.state];
                  return (
                    <li key={i.id} className="mk-row-item">
                      <span className="strong">{i.name[lang]}<span className="mk-block small muted"><Money v={i.price} /> · {i.stock}</span></span>
                      <span><Badge tone={STATE_TONE[st.state]}>{t.states[st.state]}</Badge></span>
                      <span className="small">{why}</span>
                      <span>{canSubmit(i, s.verified) ? <button type="button" className="btn small" onClick={() => submit(i)}>{st.state === 'rejected' ? t.resubmit : t.submitReview}</button> : <span className="muted small">—</span>}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="card" aria-labelledby="mk-sl-c">
          <div className="card-head"><h2 id="mk-sl-c">{t.costs}</h2><Badge tone="warning">{t.pending}</Badge></div>
          <div className="card-body">
            <p className="small muted">{t.costsSub}</p>
            <ul className="mk-rows costs">
              <li className="mk-rows-head" aria-hidden="true"><span>{t.costItem}</span><span>{t.costValue}</span><span>{t.costStatus}</span></li>
              {t.costRows.map((r, n) => (
                <li key={r.item} className="mk-row-item">
                  <span className="strong">{r.item}</span>
                  <span>{r.value}</span>
                  <span><Badge tone={n === 0 ? 'info' : 'neutral'}>{r.note}</Badge> <Badge tone="warning">{t.pending}</Badge></span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
