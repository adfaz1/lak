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

function hrefFor(base: string, q: ListQuery): string {
  return to(base, {
    q: q.q, sort: q.sort === 'featured' ? undefined : q.sort, size: q.sizes.join(','), color: q.colors.join(','),
    stock: q.inStockOnly ? '1' : undefined, price: q.price,
  });
}

const chip = 'inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-fg/40 has-[:checked]:border-fg has-[:checked]:bg-fg has-[:checked]:text-bg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500';

export default function Listing({ route, cat, search }: { route: Route; cat?: string; search?: boolean }) {
  const { t, l, lang } = useS();
  const products = useCatalog();
  const cats = useCategories();
  const category = cats.find((c) => c.id === cat);
  const validCat = search || cat === 'all' || !!category;
  const base = search ? '/search' : `/c/${cat ?? 'all'}`;
  const q = readQuery(route, category?.id);
  const results = validCat ? listProducts(products, q) : [];
  const f = facets(products, category?.id, q.q);
  const [drawer, setDrawer] = useState(false);
  const [typed, setTyped] = useState(q.q ?? '');
  useEffect(() => { setTyped(q.q ?? ''); }, [q.q]);
  const set = (patch: Partial<ListQuery>) => replace(hrefFor(base, { ...q, ...patch }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const nActive = q.sizes.length + q.colors.length + (q.inStockOnly ? 1 : 0) + (q.price ? 1 : 0);
  const clear = () => set({ sizes: [], colors: [], inStockOnly: false, price: undefined });
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
  const filters = (
    <div className="space-y-7">
      {f.sizes.length > 0 && group(isPerfume ? t.volume : t.size, f.sizes.map((s) => (
        <label key={s} className={chip}><input type="checkbox" className="sr-only" checked={q.sizes.includes(s)} onChange={() => set({ sizes: toggle(q.sizes, s) })} /><bdi>{sizeLabel(s, lang)}</bdi></label>
      )))}
      {f.colors.length > 0 && group(t.color, f.colors.map((c) => (
        <label key={c} className={chip}><input type="checkbox" className="sr-only" checked={q.colors.includes(c)} onChange={() => set({ colors: toggle(q.colors, c) })} /><Swatch c={c} />{l(colorInfo(c).name)}</label>
      )))}
      {group(t.price, (Object.keys(PRICE_BANDS) as PriceBand[]).map((b) => (
        <label key={b} className={chip}><input type="checkbox" className="sr-only" checked={q.price === b} onChange={() => set({ price: q.price === b ? undefined : b })} />{t.bands[b]}</label>
      )))}
      {group(t.avail, <label className={chip}><input type="checkbox" className="sr-only" checked={q.inStockOnly} onChange={(e) => set({ inStockOnly: e.target.checked })} />{t.inStockOnly}</label>)}
    </div>
  );

  const chips = [
    ...q.sizes.map((s) => ({ k: `s-${s}`, label: sizeLabel(s, lang), off: () => set({ sizes: q.sizes.filter((x) => x !== s) }) })),
    ...q.colors.map((c) => ({ k: `c-${c}`, label: l(colorInfo(c).name), off: () => set({ colors: q.colors.filter((x) => x !== c) }) })),
    ...(q.price ? [{ k: 'p', label: t.bands[q.price], off: () => set({ price: undefined }) }] : []),
    ...(q.inStockOnly ? [{ k: 'st', label: t.inStockOnly, off: () => set({ inStockOnly: false }) }] : []),
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
