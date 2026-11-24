// Discovery across stores: search, category, store, brand, nearby, sort. Every filter lives in the URL.
import { useState } from 'react';
import { ArrowLeft, Compass, MapPin, SearchX, SlidersHorizontal, Store } from 'lucide-react';
import { replace } from '../../../core/router';
import { Badge, Button, Card, EmptyState, LinkButton, cn, useTx } from '../../../ds/ui';
import { Drawer, Field, Select } from '../../../ds/kit';
import { CATS, search, type CatId, type Filters, type Sort } from '../domain';
import { PRODUCTS, SELLERS } from '../fixtures';
import { useScreen } from '../state';
import { CAT_ICON, ProductGrid, SellerMark, useMk } from '../ui';
import { GridSkeleton, PageError } from './common';

export default function Discover() {
  const { t, lang, route, city, go } = useMk();
  const tx = useTx();
  const screen = useScreen();
  const [sheet, setSheet] = useState(false);
  const qp = route.query;
  const cat = qp.get('cat') as CatId | null;
  const sort = qp.get('sort') as Sort | null;
  const f: Filters = {
    q: qp.get('q') ?? '', cat: cat && CATS.includes(cat) ? cat : '', seller: qp.get('store') ?? '', brand: qp.get('brand') ?? '',
    city, near: qp.get('near') === '1', sort: sort === 'priceAsc' || sort === 'priceDesc' ? sort : 'relevance',
  };
  const products = screen === 'empty' ? [] : PRODUCTS;
  const sellers = screen === 'empty' ? [] : SELLERS;
  const results = search(products, sellers, f);
  const href = (patch: Partial<Record<'q' | 'cat' | 'store' | 'brand' | 'near' | 'sort', string | undefined>>) =>
    go('', { q: f.q || undefined, cat: f.cat || undefined, store: f.seller || undefined, brand: f.brand || undefined, near: f.near ? '1' : undefined, sort: f.sort === 'relevance' ? undefined : f.sort, ...patch });
  const set = (patch: Parameters<typeof href>[0]) => replace(href(patch));
  const nFilters = [f.seller, f.brand, f.near ? '1' : ''].filter(Boolean).length;
  const browsing = !f.q && !f.cat && !nFilters;
  const brands = [...new Set(products.filter((p) => !f.cat || p.cat === f.cat).map((p) => p.brand))].sort();
  const clearHref = go('', { q: f.q || undefined, cat: f.cat || undefined });

  const filters = (
    <div className="space-y-4">
      <Field label={t.store}>{(p) => (
        <Select {...p} value={f.seller} onChange={(e) => set({ store: e.target.value || undefined })}>
          <option value="">{t.anyStore}</option>
          {sellers.map((s) => <option key={s.id} value={s.id}>{s.name[lang]}</option>)}
        </Select>
      )}</Field>
      <Field label={t.brandF}>{(p) => (
        <Select {...p} value={f.brand} onChange={(e) => set({ brand: e.target.value || undefined })}>
          <option value="">{t.anyBrand}</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
      )}</Field>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm">
        <span className="flex items-center gap-2"><MapPin className="size-4 text-muted" aria-hidden="true" />{t.nearOnly(t.cities[city])}</span>
        <input type="checkbox" className="size-[18px] accent-brand-600" checked={f.near} onChange={(e) => set({ near: e.target.checked ? '1' : undefined })} />
      </label>
      {nFilters > 0 && <LinkButton variant="ghost" size="sm" href={clearHref}>{t.clearAll}</LinkButton>}
    </div>
  );

  return (
    <div className="space-y-7">
      <h1 className="sr-only">{tx('اكتشف المنتجات عبر متاجر لك', 'Discover products across LAK stores')}</h1>

      {browsing && screen !== 'error' && (
        <section className="relative overflow-hidden rounded-3xl border border-border bg-surface px-5 py-7 sm:px-10 sm:py-10">
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 end-[-60px] size-72 rounded-full bg-brand-500/10 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 start-[-40px] size-64 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="relative max-w-xl">
            <p className="text-[13px] font-semibold text-brand-700 dark:text-brand-300">{t.brand}</p>
            <p className="mt-2 text-2xl font-bold leading-tight tracking-tight text-fg sm:text-[34px]">{tx('متاجر سعودية مستقلة، في مكان واحد', 'Independent Saudi stores, in one place')}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-[15px]">{tx('كل متجر يبيع ويشحن بنفسه. ترى البائع وتكاليفه قبل أن تشتري.', 'Each store sells and ships on its own. You see the seller and their costs before you buy.')}</p>
          </div>
        </section>
      )}

      <nav aria-label={t.catsLabel} className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {[{ id: '' as const, label: t.allCats, Icon: Compass }, ...CATS.map((c) => ({ id: c, label: t.cats[c], Icon: CAT_ICON[c] }))].map(({ id, label, Icon }) => {
          const on = (f.cat || '') === id;
          return (
            <a key={id || 'all'} href={href({ cat: id || undefined })} aria-current={on ? 'true' : undefined}
              className={cn('inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-colors', on ? 'border-transparent bg-fg text-bg' : 'border-border bg-surface text-fg hover:border-brand-300')}>
              <Icon className="size-4" aria-hidden="true" />{label}
            </a>
          );
        })}
      </nav>

      {browsing && sellers.length > 0 && screen === 'live' && (
        <section aria-labelledby="mk-stores-h" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="mk-stores-h" className="text-lg font-bold text-fg">{t.storesTitle}</h2>
            <a href={href({ near: '1' })} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline dark:text-brand-300">{t.storesNear(t.cities[city])}<ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" /></a>
          </div>
          <ul className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
            {sellers.map((s) => (
              <li key={s.id} className="w-56 shrink-0 sm:w-auto">
                <a href={go(`/s/${s.id}`)} className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-brand-300">
                  <div className="flex items-center gap-3">
                    <SellerMark s={s} size={40} />
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-fg">{s.name[lang]}</p><p className="flex items-center gap-1 text-xs text-muted"><MapPin className="size-3" aria-hidden="true" />{t.cities[s.city]}</p></div>
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted">{s.tagline[lang]}</p>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {screen === 'error' ? <PageError title={tx('تعذّر تحميل المنتجات', 'Products could not load')} refCode="SIM-MKT-DSC-503" /> : (
        <section aria-labelledby="mk-res-h" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="mk-res-h" className="text-lg font-bold text-fg" aria-live="polite">{f.cat ? `${t.cats[f.cat]} · ` : ''}{screen === 'loading' ? tx('جارٍ التحميل…', 'Loading…') : t.results(results.length)}</h2>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setSheet(true)}><SlidersHorizontal className="size-4" aria-hidden="true" />{t.filtersN(nFilters)}</Button>
              <Select aria-label={t.sort} className="h-9 w-auto rounded-lg text-[13px]" value={f.sort} onChange={(e) => set({ sort: e.target.value === 'relevance' ? undefined : e.target.value })}>
                {(['relevance', 'priceAsc', 'priceDesc'] as Sort[]).map((s) => <option key={s} value={s}>{t.sorts[s]}</option>)}
              </Select>
            </div>
          </div>
          {(f.seller || f.brand || f.near) && (
            <div className="flex flex-wrap gap-2">
              {f.seller && <Badge tone="brand" icon={<Store className="size-3" aria-hidden="true" />}>{SELLERS.find((s) => s.id === f.seller)?.name[lang] ?? f.seller}</Badge>}
              {f.brand && <Badge tone="brand">{f.brand}</Badge>}
              {f.near && <Badge tone="brand" icon={<MapPin className="size-3" aria-hidden="true" />}>{t.cities[city]}</Badge>}
            </div>
          )}
          <div className="flex gap-8">
            <aside aria-label={t.filters} className="hidden w-60 shrink-0 lg:block">
              <Card className="sticky top-24 p-4"><p className="mb-4 text-sm font-semibold text-fg">{t.filters}</p>{filters}</Card>
            </aside>
            <div className="min-w-0 flex-1">
              {screen === 'loading' ? <GridSkeleton /> : results.length === 0 ? (
                <Card>
                  {products.length === 0
                    ? <EmptyState icon={<Store className="size-6" aria-hidden="true" />} title={tx('لا متاجر في السوق بعد', 'No stores in the marketplace yet')}>{tx('تظهر المنتجات هنا عندما تنضم المتاجر.', 'Products appear here as stores join.')}</EmptyState>
                    : <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={t.noResults} action={<LinkButton variant="secondary" href={go('')}>{t.clearAll}</LinkButton>} />}
                </Card>
              ) : <ProductGrid items={results} />}
            </div>
          </div>
        </section>
      )}

      {sheet && (
        <Drawer title={t.filters} onClose={() => setSheet(false)} footer={<>
          <LinkButton variant="secondary" className="flex-1" href={clearHref} onClick={() => setSheet(false)}>{t.clearAll}</LinkButton>
          <Button className="flex-1" onClick={() => setSheet(false)}>{t.showResults(results.length)}</Button>
        </>}>{filters}</Drawer>
      )}
    </div>
  );
}
