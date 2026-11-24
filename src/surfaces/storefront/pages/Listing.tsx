import { useCallback, useState } from 'react';
import { Dialog } from '../../../core/ui';
import { replace, type Route } from '../../../core/router';
import {
  CATEGORIES, COLORS, PRICE_BANDS, SORTS, facets, fromPrice, hasPriceRange, inStock, listProducts,
  type CatId, type ColorId, type ListQuery, type PriceBand, type Product, type Sort,
} from '../domain';
import { Icon, Price, ProductArt, Swatch, sizeLabel, to, useS } from '../kit';
import { accountStore, catalogStore, toggleWish } from '../state';

const csv = (s: string | null) => (s ? s.split(',').filter(Boolean) : []);

export function readQuery(route: Route, cat?: CatId): ListQuery {
  const sort = route.query.get('sort') as Sort | null;
  const price = route.query.get('price') as PriceBand | null;
  return {
    cat,
    q: route.query.get('q') ?? undefined,
    sort: sort && SORTS.includes(sort) ? sort : 'featured',
    sizes: csv(route.query.get('size')),
    colors: csv(route.query.get('color')).filter((c): c is ColorId => c in COLORS),
    inStockOnly: route.query.get('stock') === '1',
    price: price && price in PRICE_BANDS ? price : undefined,
  };
}

function hrefFor(base: string, q: ListQuery): string {
  return to(base, {
    q: q.q, sort: q.sort === 'featured' ? undefined : q.sort, size: q.sizes.join(','), color: q.colors.join(','),
    stock: q.inStockOnly ? '1' : undefined, price: q.price,
  });
}

export default function Listing({ route, cat, search }: { route: Route; cat?: string; search?: boolean }) {
  const { t, l, lang } = useS();
  const products = catalogStore.use();
  const category = CATEGORIES.find((c) => c.id === cat);
  const validCat = search || cat === 'all' || !!category;
  const base = search ? '/search' : `/c/${cat ?? 'all'}`;
  const q = readQuery(route, category?.id);
  const results = validCat ? listProducts(products, q) : [];
  const f = facets(products, category?.id, q.q);
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const set = (patch: Partial<ListQuery>) => replace(hrefFor(base, { ...q, ...patch }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const nActive = q.sizes.length + q.colors.length + (q.inStockOnly ? 1 : 0) + (q.price ? 1 : 0);
  const clear = () => set({ sizes: [], colors: [], inStockOnly: false, price: undefined });
  const isPerfume = category?.id === 'perfume';

  if (!validCat) {
    return <div className="sf-wrap sf-section"><h1 className="sf-h1">{t.notFoundPage}</h1><a className="btn primary" href={to('/c/all')}>{t.all}</a></div>;
  }

  const title = search ? (q.q ? t.searchTitle(q.q) : t.search) : category ? l(category.name) : t.all;

  const filters = (idp: string) => (
    <div className="sf-filters">
      {f.sizes.length > 0 && (
        <fieldset className="sf-fgroup">
          <legend>{isPerfume ? t.volume : t.size}</legend>
          <div className="sf-chips">
            {f.sizes.map((s) => (
              <label key={s} className="sf-chip-check">
                <input type="checkbox" checked={q.sizes.includes(s)} onChange={() => set({ sizes: toggle(q.sizes, s) })} />
                <span><bdi>{sizeLabel(s, lang)}</bdi></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {f.colors.length > 0 && (
        <fieldset className="sf-fgroup">
          <legend>{t.color}</legend>
          <div className="sf-chips">
            {f.colors.map((c) => (
              <label key={c} className="sf-chip-check">
                <input type="checkbox" checked={q.colors.includes(c)} onChange={() => set({ colors: toggle(q.colors, c) })} />
                <span><Swatch c={c} />{l(COLORS[c].name)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="sf-fgroup">
        <legend>{t.price}</legend>
        {(Object.keys(PRICE_BANDS) as PriceBand[]).map((b) => (
          <label key={b} className="check">
            <input type="checkbox" name={`${idp}-price`} checked={q.price === b} onChange={() => set({ price: q.price === b ? undefined : b })} />{t.bands[b]}
          </label>
        ))}
      </fieldset>
      <fieldset className="sf-fgroup">
        <legend>{t.avail}</legend>
        <label className="check"><input type="checkbox" checked={q.inStockOnly} onChange={(e) => set({ inStockOnly: e.target.checked })} />{t.inStockOnly}</label>
      </fieldset>
    </div>
  );

  const chips = [
    ...q.sizes.map((s) => ({ k: `s-${s}`, label: sizeLabel(s, lang), off: () => set({ sizes: q.sizes.filter((x) => x !== s) }) })),
    ...q.colors.map((c) => ({ k: `c-${c}`, label: l(COLORS[c].name), off: () => set({ colors: q.colors.filter((x) => x !== c) }) })),
    ...(q.price ? [{ k: 'p', label: t.bands[q.price], off: () => set({ price: undefined }) }] : []),
    ...(q.inStockOnly ? [{ k: 'st', label: t.inStockOnly, off: () => set({ inStockOnly: false }) }] : []),
  ];

  return (
    <div className="sf-wrap sf-section">
      <nav className="sf-crumbs small" aria-label={t.home}><a href={to()}>{t.home}</a><Icon name="chev" size={14} flip /><span aria-current="page">{title}</span></nav>
      <header className="sf-list-head">
        <h1 className="sf-h1">{title}</h1>
        <p className="sf-muted" role="status">{t.resultN(String(results.length))}</p>
      </header>

      {search && !q.q ? (
        <div className="sf-empty"><p>{t.searchEmpty}</p><CatLinks /></div>
      ) : (
        <div className="sf-list-layout">
          <aside className="sf-list-side" aria-label={t.filters}>
            <h2 className="sf-h3">{t.filters}</h2>
            {filters('side')}
            {nActive > 0 && <button type="button" className="btn small" onClick={clear}>{t.clear}</button>}
          </aside>
          <div className="sf-list-main">
            <div className="sf-list-bar">
              <button type="button" className="btn sf-filter-btn" onClick={() => setDrawer(true)}>
                <Icon name="filter" size={18} />{t.filters}{nActive > 0 && <span className="sf-count">{nActive}</span>}
              </button>
              <label className="sf-sort">
                <span>{t.sort}</span>
                <select className="input" value={q.sort} onChange={(e) => set({ sort: e.target.value as Sort })}>
                  {SORTS.map((s) => <option key={s} value={s}>{t.sorts[s]}</option>)}
                </select>
              </label>
            </div>
            {chips.length > 0 && (
              <div className="sf-active" role="group" aria-label={t.active}>
                {chips.map((c) => (
                  <button key={c.k} type="button" className="sf-active-chip" onClick={c.off} aria-label={t.removeF(c.label)}>
                    <bdi>{c.label}</bdi><Icon name="close" size={14} />
                  </button>
                ))}
                <button type="button" className="sf-link-btn" onClick={clear}>{t.clear}</button>
              </div>
            )}
            {results.length ? <ProductGrid products={results} /> : (
              <div className="sf-empty">
                {search && !nActive ? (<><p className="sf-strong">{t.noSearch(q.q ?? '')}</p><p className="sf-muted">{t.noSearchHint}</p><CatLinks /></>) : (
                  <><p className="sf-strong">{t.noMatch}</p><p className="sf-muted">{t.noMatchHint}</p><button type="button" className="btn" onClick={clear}>{t.clear}</button></>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {drawer && (
        <Dialog title={t.filters} onClose={closeDrawer} footer={<>
          <button type="button" className="btn" onClick={clear} disabled={!nActive}>{t.clear}</button>
          <button type="button" className="btn primary" onClick={() => setDrawer(false)}>{t.showN(String(results.length))}</button>
        </>}>
          {filters('drawer')}
        </Dialog>
      )}
    </div>
  );
}

function CatLinks() {
  const { l } = useS();
  return <ul className="sf-cat-pills">{CATEGORIES.map((c) => <li key={c.id}><a href={to(`/c/${c.id}`)}>{l(c.name)}</a></li>)}</ul>;
}

export function ProductGrid({ products }: { products: Product[] }) {
  return <ul className="sf-grid">{products.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul>;
}

export function ProductCard({ p }: { p: Product }) {
  const { t, l } = useS();
  const wish = accountStore.use().wishlist.includes(p.id);
  const out = !inStock(p);
  const name = l(p.name);
  return (
    <article className={`sf-card${out ? ' is-out' : ''}`}>
      <a className="sf-card-link" href={to(`/p/${p.id}`)}>
        <span className="sf-card-art"><ProductArt p={p} /></span>
        <span className="sf-card-badges">
          {out && <span className="sf-badge out">{t.soldOut}</span>}
          {!out && p.compareAt && <span className="sf-badge sale">{t.sale}</span>}
        </span>
        <span className="sf-card-name">{name}</span>
        <Price v={fromPrice(p)} compareAt={p.compareAt} from={hasPriceRange(p)} />
        {p.colors.length > 1 && <span className="sf-card-swatches">{p.colors.map((c) => <Swatch key={c} c={c} size={12} />)}<span className="sr">{p.colors.map((c) => l(COLORS[c].name)).join('، ')}</span></span>}
      </a>
      <button type="button" className={`sf-wish${wish ? ' on' : ''}`} aria-pressed={wish} aria-label={wish ? t.wishOff(name) : t.wishFor(name)} onClick={() => toggleWish(p.id)}>
        <Icon name="heart" size={20} />
      </button>
    </article>
  );
}
