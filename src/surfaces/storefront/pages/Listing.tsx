import { useEffect, useState, type ReactNode } from 'react';
import { Heart, Search, SlidersHorizontal, X } from 'lucide-react';
import { replace, type Route } from '../../../core/router';
import { Button, EmptyState, LinkButton, cn } from '../../../ds/ui';
import { Drawer, Select } from '../../../ds/kit';
import {
  PRICE_BANDS, SORTS, colorInfo, facets, fromPrice, hasPriceRange, inStock, listProducts,
  type CatId, type ColorId, type ListQuery, type PriceBand, type Product, type Sort,
} from '../domain';
import { Crumbs, H1, Price, ProductPhoto, Swatch, WRAP, sizeLabel, to, useS } from '../kit';
import { accountStore, toggleWish } from '../state';
import { useCatalog, useCategories } from '../data';
import { catalogXStore } from '../../merchant/stores';
import { filterKeys, filterPreview, type FilterKey } from '../../merchant/catalog-extras';
import { BrandMark } from '../../dashboard/products/storefront-parts';
import { searchLogStore, searchRedirectsStore } from '../../merchant/stores';
import { addSearch, redirectFor } from '../../merchant/demand';
import { riyadhDate } from '../bridge';

const csv = (s: string | null) => (s ? s.split(',').filter(Boolean) : []);

export function readQuery(route: Route, cat?: CatId): ListQuery {
  const sort = route.query.get('sort') as Sort | null;
  const price = route.query.get('price') as PriceBand | null;
  return {
    cat,
    q: route.query.get('q') ?? undefined,
    sort: sort && SORTS.includes(sort) ? sort : 'featured',
    sizes: csv(route.query.get('size')),
    colors: csv(route.query.get('color')) as ColorId[],
    inStockOnly: route.query.get('stock') === '1',
    price: price && price in PRICE_BANDS ? price : undefined,
  };
}

/** Brand and custom-field filters (dashboard → Products → Options → Shopper filters): `brand=a,b` and `attr=<field>:<value>,…`. */
interface XQuery { brands: string[]; attrs: string[] }
const readX = (route: Route): XQuery => ({ brands: csv(route.query.get('brand')), attrs: csv(route.query.get('attr')) });
function hrefFor(base: string, q: ListQuery, xq: XQuery = { brands: [], attrs: [] }): string {
  return to(base, {
    q: q.q, sort: q.sort === 'featured' ? undefined : q.sort, size: q.sizes.join(','), color: q.colors.join(','),
    stock: q.inStockOnly ? '1' : undefined, price: q.price, brand: xq.brands.join(',') || undefined, attr: xq.attrs.join(',') || undefined,
  });
}
const xMatch = (p: Product, xq: XQuery) => {
  if (xq.brands.length && !xq.brands.includes(p.x?.brand?.id ?? '')) return false;
  const byField = new Map<string, string[]>();
  for (const a of xq.attrs) { const i = a.indexOf(':'); if (i > 0) byField.set(a.slice(0, i), [...(byField.get(a.slice(0, i)) ?? []), a.slice(i + 1)]); }
  for (const [f, vals] of byField) if (!vals.includes(p.x?.attrValues[f] ?? '')) return false;
  return true;
};

const chip = 'inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-fg/40 has-[:checked]:border-fg has-[:checked]:bg-fg has-[:checked]:text-bg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500';

export default function Listing({ route, cat, search }: { route: Route; cat?: string; search?: boolean }) {
  const { t, l, lang } = useS();
  const products = useCatalog();
  const cats = useCategories();
  const category = cats.find((c) => c.id === cat);
  const validCat = search || cat === 'all' || !!category;
  const base = search ? '/search' : `/c/${cat ?? 'all'}`;
  const q = readQuery(route, category?.id);
  const redirects = searchRedirectsStore.use();
  const xq = readX(route);
  const found = validCat ? listProducts(products, q).filter((p) => xMatch(p, xq)) : [];
  // A term that finds nothing may have a redirect the merchant set from the search report (category or product).
  const redirect = search && q.q && !found.length ? redirectFor(redirects, q.q) : undefined;
  const results = redirect ? products.filter((p) => (redirect.target.kind === 'product' ? p.id === redirect.target.id : p.cat === redirect.target.id)) : found;
  // Record the search for the merchant's report once the shopper settles on a term (not every keystroke).
  useEffect(() => {
    if (!search || !q.q) return;
    const t = window.setTimeout(() => searchLogStore.set((l) => addSearch(l, q.q ?? '', found.length, riyadhDate(Date.now()), lang)), 1200);
    return () => window.clearTimeout(t);
  }, [search, q.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = facets(products.filter((p) => p.x?.type !== 'booking'), category?.id, q.q);
  const cx = catalogXStore.use();
  const keys = filterKeys(cx.filters, cx.fields);
  const scope = products.filter((p) => (!category || p.cat === category.id) && (!q.q || listProducts([p], { ...q, sizes: [], colors: [], inStockOnly: false, price: undefined }).length));
  const preview = filterPreview(scope.map((p) => ({ brand: p.x?.brand?.id, colors: p.colors, sizes: p.sizes, attrs: p.x?.attrValues, inStock: p.variants.some((v) => v.stock > 0), price: Math.min(...p.variants.map((v) => v.price)) })), keys, cx.filters, { brands: cx.brands, fields: cx.fields });
  const shown = (k: FilterKey) => preview.find((x) => x.key === k)?.hiddenWhy !== 'off';
  const [drawer, setDrawer] = useState(false);
  const [typed, setTyped] = useState(q.q ?? '');
  useEffect(() => { setTyped(q.q ?? ''); }, [q.q]);
  const set = (patch: Partial<ListQuery>, xPatch?: Partial<XQuery>) => replace(hrefFor(base, { ...q, ...patch }, { ...xq, ...xPatch }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const nActive = q.sizes.length + q.colors.length + (q.inStockOnly ? 1 : 0) + (q.price ? 1 : 0) + xq.brands.length + xq.attrs.length;
  const clear = () => set({ sizes: [], colors: [], inStockOnly: false, price: undefined }, { brands: [], attrs: [] });
  const isPerfume = category?.id === 'fragrance';

  if (!validCat) {
    return (
      <div className={cn(WRAP, 'py-16')}>
        <EmptyState as="h1" title={t.notFoundPage} action={<LinkButton href={to('/c/all')}>{t.all}</LinkButton>} />
      </div>
    );
  }

  const title = search ? (q.q ? t.searchTitle(q.q) : t.search) : category ? l(category.name) : t.all;

  const group = (legend: string, children: ReactNode) => (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-[13px] font-semibold text-fg">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
  // The merchant chooses which filters show and their order; a brand or field filter shows only with enough values.
  const block = (k: FilterKey): ReactNode => {
    if (!shown(k)) return null;
    if (k === 'size') return f.sizes.length > 0 && group(isPerfume ? t.volume : t.size, f.sizes.map((s) => (
      <label key={s} className={chip}><input type="checkbox" className="sr-only" checked={q.sizes.includes(s)} onChange={() => set({ sizes: toggle(q.sizes, s) })} /><bdi>{sizeLabel(s, lang)}</bdi></label>
    )));
    if (k === 'color') return f.colors.length > 0 && group(t.color, f.colors.map((c) => (
      <label key={c} className={chip}><input type="checkbox" className="sr-only" checked={q.colors.includes(c)} onChange={() => set({ colors: toggle(q.colors, c) })} /><Swatch c={c} />{l(colorInfo(c).name)}</label>
    )));
    if (k === 'price') return group(t.price, (Object.keys(PRICE_BANDS) as PriceBand[]).map((b) => (
      <label key={b} className={chip}><input type="checkbox" className="sr-only" checked={q.price === b} onChange={() => set({ price: q.price === b ? undefined : b })} />{t.bands[b]}</label>
    )));
    if (k === 'availability') return group(t.avail, <label className={chip}><input type="checkbox" className="sr-only" checked={q.inStockOnly} onChange={(e) => set({ inStockOnly: e.target.checked })} />{t.inStockOnly}</label>);
    const pv = preview.find((x) => x.key === k);
    if (!pv || pv.hiddenWhy) return null;
    if (k === 'brand') return group(lang === 'ar' ? 'العلامة التجارية' : 'Brand', pv.values.map((v) => {
      const b = cx.brands.find((x) => x.id === v.value);
      return <label key={v.value} className={chip}><input type="checkbox" className="sr-only" checked={xq.brands.includes(v.value)} onChange={() => set({}, { brands: toggle(xq.brands, v.value) })} />{b && <BrandMark b={b} size={18} />}{l(v.label)}<span className="text-[11px] opacity-70 tabular-nums">{v.count}</span></label>;
    }));
    const field = cx.fields.find((x) => `field:${x.id}` === k);
    if (!field) return null;
    return group(l(field.label), pv.values.map((v) => {
      const token = `${field.id}:${v.value}`;
      return <label key={v.value} className={chip}><input type="checkbox" className="sr-only" checked={xq.attrs.includes(token)} onChange={() => set({}, { attrs: toggle(xq.attrs, token) })} />{l(v.label)}<span className="text-[11px] opacity-70 tabular-nums">{v.count}</span></label>;
    }));
  };
  const filters = (
    <div className="space-y-7">
      {keys.map((k) => <div key={k} className="empty:hidden">{block(k)}</div>)}
    </div>
  );

  const chips = [
    ...q.sizes.map((s) => ({ k: `s-${s}`, label: sizeLabel(s, lang), off: () => set({ sizes: q.sizes.filter((x) => x !== s) }) })),
    ...q.colors.map((c) => ({ k: `c-${c}`, label: l(colorInfo(c).name), off: () => set({ colors: q.colors.filter((x) => x !== c) }) })),
    ...(q.price ? [{ k: 'p', label: t.bands[q.price], off: () => set({ price: undefined }) }] : []),
    ...(q.inStockOnly ? [{ k: 'st', label: t.inStockOnly, off: () => set({ inStockOnly: false }) }] : []),
    ...xq.brands.map((b) => ({ k: `b-${b}`, label: l(cx.brands.find((x) => x.id === b)?.name ?? { ar: b, en: b }), off: () => set({}, { brands: xq.brands.filter((x) => x !== b) }) })),
    ...xq.attrs.map((a) => { const fid = a.slice(0, a.indexOf(':')), val = a.slice(a.indexOf(':') + 1); const o = cx.fields.find((x) => x.id === fid)?.options.find((x) => x.en === val); return { k: `a-${a}`, label: o ? l(o) : val, off: () => set({}, { attrs: xq.attrs.filter((x) => x !== a) }) }; }),
  ];

  const noCatalogue = products.length === 0;

  return (
    <div className={cn(WRAP, 'py-6 sm:py-10')}>
      <Crumbs items={[{ label: t.home, href: to() }, { label: title }]} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={H1}>{title}</h1>
        {!(search && !q.q) && !noCatalogue && <p className="text-sm text-muted" role="status">{t.resultN(String(results.length))}</p>}
      </header>

      {search && (
        <form role="search" className="relative mt-5 max-w-xl" onSubmit={(e) => { e.preventDefault(); set({ q: typed.trim() || undefined }); }}>
          <label htmlFor="sf-q2" className="sr-only">{t.search}</label>
          <Search className="pointer-events-none absolute top-1/2 start-4 size-5 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input id="sf-q2" type="search" value={typed} autoFocus={!q.q} placeholder={t.searchPh} autoComplete="off"
            onChange={(e) => { setTyped(e.target.value); set({ q: e.target.value || undefined }); }}
            className="h-14 w-full rounded-2xl border border-border bg-surface ps-12 pe-4 text-base placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
        </form>
      )}

      {!search && (
        <nav aria-label={t.cats} className="scrollbar-thin -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {[{ id: 'all', name: t.all }, ...cats.map((c) => ({ id: c.id, name: l(c.name) }))].map((c) => (
            <a key={c.id} href={to(`/c/${c.id}`)} aria-current={cat === c.id ? 'page' : undefined}
              className={cn('inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium', cat === c.id ? 'border-fg bg-fg text-bg' : 'border-border bg-surface text-muted')}>{c.name}</a>
          ))}
        </nav>
      )}

      {noCatalogue ? (
        <EmptyState as="h2" title={t.noProductsT} action={<LinkButton href={to()} variant="secondary">{t.storeHome}</LinkButton>}>{t.noProductsB}</EmptyState>
      ) : search && !q.q ? (
        <div className="mt-8"><p className="text-muted">{t.searchEmpty}</p><CatLinks /></div>
      ) : (
        <div className="mt-6 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10">
          <aside aria-label={t.filters} className="hidden lg:block">
            <div className="sticky top-24 space-y-6">
              <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">{t.filters}</h2>
                {nActive > 0 && <button type="button" onClick={clear} className="text-[13px] font-medium text-muted underline-offset-4 hover:text-fg hover:underline">{t.clear}</button>}</div>
              {filters}
            </div>
          </aside>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" className="lg:hidden" onClick={() => setDrawer(true)}>
                <SlidersHorizontal className="size-4" aria-hidden="true" />{t.filters}
                {nActive > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-fg px-1.5 text-[11px] font-bold text-bg tabular-nums">{nActive}</span>}
              </Button>
              <label className="ms-auto flex items-center gap-2 text-[13px] text-muted">
                <span className="whitespace-nowrap">{t.sort}</span>
                <Select className="w-auto min-w-40" value={q.sort} onChange={(e) => set({ sort: e.target.value as Sort })}>
                  {SORTS.map((s) => <option key={s} value={s}>{t.sorts[s]}</option>)}
                </Select>
              </label>
            </div>
            {chips.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t.active}>
                {chips.map((c) => (
                  <button key={c.k} type="button" onClick={c.off} aria-label={t.removeF(c.label)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] font-medium hover:bg-border">
                    <bdi>{c.label}</bdi><X className="size-3.5" aria-hidden="true" />
                  </button>
                ))}
                <button type="button" onClick={clear} className="px-1 text-[13px] font-medium text-muted underline-offset-4 hover:text-fg hover:underline">{t.clear}</button>
              </div>
            )}
            <div className="mt-6">
              {redirect && results.length > 0 && <p role="status" className="mb-4 text-sm text-muted">{lang === 'ar' ? `لا نتائج لـ«${q.q}». نعرض لك: ${redirect.target.name.ar}` : `No results for “${q.q}”. Showing: ${redirect.target.name.en}`}</p>}
              {results.length ? <ProductGrid products={results} /> : search && !nActive ? (
                <EmptyState as="h2" icon={<Search className="size-6" aria-hidden="true" />} title={t.noSearch(q.q ?? '')}>{t.noSearchHint}</EmptyState>
              ) : (
                <EmptyState as="h2" icon={<SlidersHorizontal className="size-6" aria-hidden="true" />} title={t.noMatch} action={<Button variant="secondary" onClick={clear}>{t.clear}</Button>}>{t.noMatchHint}</EmptyState>
              )}
              {search && !results.length && !nActive && <CatLinks center />}
            </div>
          </div>
        </div>
      )}

      {drawer && (
        <Drawer title={t.filters} onClose={() => setDrawer(false)} footer={<>
          <Button variant="secondary" className="flex-1" onClick={clear} disabled={!nActive}>{t.clear}</Button>
          <Button className="flex-1" onClick={() => setDrawer(false)}>{t.showN(String(results.length))}</Button>
        </>}>
          {filters}
        </Drawer>
      )}
    </div>
  );
}

function CatLinks({ center }: { center?: boolean }) {
  const { l } = useS();
  const cats = useCategories();
  return (
    <ul className={cn('mt-4 flex flex-wrap gap-2', center && 'justify-center')}>
      {cats.map((c) => <li key={c.id}><a href={to(`/c/${c.id}`)} className="inline-flex h-10 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium hover:border-fg/40">{l(c.name)}</a></li>)}
    </ul>
  );
}

export function ProductGrid({ products, className }: { products: Product[]; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4', className)}>
      {products.map((p) => <li key={p.id} className="min-w-0"><ProductCard p={p} /></li>)}
    </ul>
  );
}

export function ProductCard({ p, eager }: { p: Product; eager?: boolean }) {
  const { t, l } = useS();
  const wish = accountStore.use().wishlist.includes(p.id);
  const out = !inStock(p);
  const name = l(p.name);
  return (
    <article className="group relative">
      <a href={to(`/p/${p.id}`)} className="block focus-visible:outline-none">
        <span className="relative block">
          <ProductPhoto p={p} eager={eager} className={cn(out && 'opacity-70')} />
          {(out || p.compareAt) && (
            <span className={cn('absolute top-3 start-3 rounded-full px-2.5 py-1 text-[11px] font-semibold', out ? 'bg-surface/95 text-fg' : 'bg-red-700 text-white')}>
              {out ? t.soldOut : t.sale}
            </span>
          )}
        </span>
        <span className="mt-3 block space-y-1 px-0.5">
          <span className="line-clamp-2 block text-[14px] font-medium leading-snug text-fg group-hover:underline group-hover:underline-offset-4 sm:text-[15px]">{name}</span>
          <Price v={fromPrice(p)} compareAt={p.compareAt} from={hasPriceRange(p)} className="text-[14px]" />
          {p.colors.length > 1 && (
            <span className="flex items-center gap-1.5 pt-1">
              {p.colors.map((c) => <Swatch key={c} c={c} size={12} />)}
              <span className="sr-only">{p.colors.map((c) => l(colorInfo(c).name)).join('، ')}</span>
            </span>
          )}
        </span>
      </a>
      <button type="button" aria-pressed={wish} aria-label={wish ? t.wishOff(name) : t.wishFor(name)} onClick={() => toggleWish(p.id)}
        className="absolute top-2 end-2 grid size-10 place-items-center rounded-full bg-surface/85 text-fg backdrop-blur transition-colors hover:bg-surface">
        <Heart className={cn('size-[18px]', wish && 'fill-current text-brand-700 dark:text-brand-300')} aria-hidden="true" />
      </button>
    </article>
  );
}
