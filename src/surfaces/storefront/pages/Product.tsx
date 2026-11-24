import { useRef, useState } from 'react';
import { Check, ChevronDown, Heart, RotateCcw, ShoppingBag, Truck } from 'lucide-react';
import { replace, type Route } from '../../../core/router';
import { Alert, Select } from '../../../ds/kit';
import { Button, EmptyState, InfoHint, LinkButton, cn } from '../../../ds/ui';
import { settingsStore } from '../../merchant/stores';
import { shopperView } from '../../dashboard/storefront/model';
import {
  CATEGORIES, CITIES, COLORS, SHIP_METHODS, addToCart, deliveryEstimate, findVariant, missingOptions, productById,
  stockLevel, type CityId, type ColorId,
} from '../domain';
import { Crumbs, H2, PANEL, Price, ProductPhoto, Stepper, Swatch, WRAP, sizeLabel, to, useS, variantLabel } from '../kit';
import { accountStore, cartStore, toggleWish } from '../state';
import { useCatalog } from '../data';
import { ProductGrid } from './Listing';

export default function ProductPage({ route, id }: { route: Route; id: string }) {
  const { t, l, lang, dl } = useS();
  const products = useCatalog();
  const cart = cartStore.use();
  const acc = accountStore.use();
  const canOrder = shopperView(settingsStore.use().status) === 'open';
  const p = productById(products, id);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState<('color' | 'size')[]>([]);
  const [added, setAdded] = useState<string | null>(null);
  const [city, setCity] = useState<CityId>('riyadh');
  const colorRef = useRef<HTMLFieldSetElement>(null);
  const sizeRef = useRef<HTMLFieldSetElement>(null);

  if (!p) {
    return (
      <div className={cn(WRAP, 'py-16')}>
        <EmptyState as="h1" title={t.gone} action={<LinkButton href={to('/c/all')}>{t.all}</LinkButton>} />
      </div>
    );
  }

  const qColor = route.query.get('color') ?? undefined;
  const qSize = route.query.get('size') ?? undefined;
  // Single-option axes are preselected: there is nothing to choose.
  const color = (p.colors.length === 1 ? p.colors[0] : p.colors.includes(qColor as ColorId) ? qColor : undefined) as ColorId | undefined;
  const size = p.sizes.length === 1 ? p.sizes[0] : p.sizes.includes(qSize ?? '') ? qSize : undefined;
  const variant = findVariant(p, color, size);
  const inBag = variant ? cart.lines.find((x) => x.vid === variant.id)?.qty ?? 0 : 0;
  const room = variant ? Math.max(0, variant.stock - inBag) : 0;
  const wish = acc.wishlist.includes(p.id);
  const cat = CATEGORIES.find((c) => c.id === p.cat)!;
  const isPerfume = p.kind === 'perfume';
  const std = SHIP_METHODS[0];
  const est = deliveryEstimate(std, city, Date.now());
  const price = variant?.price ?? Math.min(...p.variants.map((v) => v.price));
  const related = products.filter((x) => x.cat === p.cat && x.id !== p.id).slice(0, 4);
  const soldOutVariant = !!variant && variant.stock <= 0;

  const pick = (k: 'color' | 'size', v: string) => {
    setErr((e) => e.filter((x) => x !== k));
    setAdded(null);
    setQty(1);
    replace(to(`/p/${p.id}`, { color: k === 'color' ? v : qColor, size: k === 'size' ? v : qSize }));
  };

  const add = () => {
    const missing = missingOptions(p, color, size);
    if (missing.length) {
      setErr(missing);
      (missing[0] === 'color' ? colorRef : sizeRef).current?.querySelector('input')?.focus();
      return;
    }
    if (!variant || room <= 0 || !canOrder) return;
    cartStore.set((c) => addToCart(c, variant.id, Math.min(qty, room), variant.stock));
    setAdded(variantLabel(p, color, size, lang));
    setQty(1);
  };

  const sizeVariants = (s: string) => p.variants.filter((v) => v.size === s && (!color || v.color === color));
  const colorVariants = (c: ColorId) => p.variants.filter((v) => v.color === c && (!size || v.size === size));
  const soldAll = (vs: { stock: number }[]) => vs.length > 0 && vs.every((v) => v.stock <= 0);
  const level = variant && stockLevel(variant);

  return (
    <div className={cn(WRAP, 'py-6 sm:py-10')}>
      <Crumbs items={[{ label: t.home, href: to() }, { label: l(cat.name), href: to(`/c/${cat.id}`) }, { label: l(p.name) }]} />
      <div className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
        <div className="md:sticky md:top-24 md:self-start">
          <ProductPhoto p={p} color={color} variant="hero" eager className="-mx-4 rounded-none sm:mx-0 sm:rounded-3xl" />
        </div>

        <div className="min-w-0 space-y-6">
          <div className="space-y-3">
            <a href={to(`/c/${cat.id}`)} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{l(cat.name)}</a>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[34px]">{l(p.name)}</h1>
            <div className="flex flex-wrap items-baseline gap-3">
              <Price v={price} compareAt={p.compareAt} from={!variant && new Set(p.variants.map((v) => v.price)).size > 1} className="text-xl" />
              <span className="text-xs text-muted">{t.inclVat}</span>
            </div>
            <p className="max-w-prose leading-relaxed text-muted">{l(p.blurb)}</p>
          </div>

          {p.colors.length > 1 && (
            <fieldset ref={colorRef} aria-describedby={err.includes('color') ? 'sf-err-color' : undefined}>
              <legend className="mb-3 text-sm font-semibold">{t.color}{color && <span className="font-normal text-muted"> · {l(COLORS[color].name)}</span>}</legend>
              <div className="flex flex-wrap gap-2.5">
                {p.colors.map((c) => {
                  const out = soldAll(colorVariants(c));
                  return (
                    <label key={c} title={l(COLORS[c].name)} className={cn('relative grid size-11 cursor-pointer place-items-center rounded-full ring-1 ring-border transition-shadow has-[:checked]:ring-2 has-[:checked]:ring-fg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500', err.includes('color') && 'ring-red-500')}>
                      <input type="radio" name="sf-color" className="sr-only" checked={color === c} onChange={() => pick('color', c)} />
                      <Swatch c={c} size={32} />
                      {out && <span aria-hidden="true" className="absolute h-px w-9 -rotate-45 bg-fg/70" />}
                      <span className="sr-only">{l(COLORS[c].name)}{out ? ` – ${t.soldOut}` : ''}</span>
                    </label>
                  );
                })}
              </div>
              {err.includes('color') && <p id="sf-err-color" role="alert" className="mt-2 text-[13px] font-medium text-red-600 dark:text-red-400">{t.chooseColor}</p>}
            </fieldset>
          )}

          {p.sizes.length > 1 && (
            <fieldset ref={sizeRef} aria-describedby={err.includes('size') ? 'sf-err-size' : undefined}>
              <legend className="mb-3 text-sm font-semibold">{isPerfume ? t.volume : t.size}</legend>
              <div className="flex flex-wrap gap-2">
                {p.sizes.map((s) => {
                  const out = soldAll(sizeVariants(s));
                  return (
                    <label key={s} className={cn('inline-flex h-11 min-w-14 cursor-pointer items-center justify-center rounded-xl border bg-surface px-4 text-sm font-medium transition-colors hover:border-fg/50 has-[:checked]:border-fg has-[:checked]:bg-fg has-[:checked]:text-bg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500',
                      err.includes('size') ? 'border-red-500' : 'border-border', out && 'text-subtle line-through')}>
                      <input type="radio" name="sf-size" className="sr-only" checked={size === s} onChange={() => pick('size', s)} />
                      <bdi>{sizeLabel(s, lang)}</bdi>
                      {out && <span className="sr-only"> – {t.soldOut}</span>}
                    </label>
                  );
                })}
              </div>
              {err.includes('size') && <p id="sf-err-size" role="alert" className="mt-2 text-[13px] font-medium text-red-600 dark:text-red-400">{isPerfume ? t.chooseVolume : t.chooseSize}</p>}
            </fieldset>
          )}

          {variant && level && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className={cn('size-2 rounded-full', level === 'in' ? 'bg-emerald-500' : level === 'low' ? 'bg-amber-500' : 'bg-red-500')} />
              <span className="font-medium">{t.stock[level]}</span>
              {p.colors.length + p.sizes.length > 0 && <span className="text-muted">· {variantLabel(p, color, size, lang)}</span>}
            </p>
          )}
          {soldOutVariant && <p className="text-[13px] text-muted">{t.optSoldOut}</p>}
          {variant && variant.stock > 0 && room <= 0 && <p className="text-[13px] text-muted">{t.maxed}</p>}

          <div className="flex items-center gap-2">
            <Stepper value={qty} max={Math.max(1, Math.min(room || 10, 10))} onChange={(n) => setQty(Math.max(1, n))} label={t.qty} decLabel={t.dec} incLabel={t.inc} />
            <Button size="lg" className="h-12 flex-1" onClick={add} disabled={!canOrder || (!!variant && room <= 0)}>
              <ShoppingBag className="size-5" aria-hidden="true" />{soldOutVariant ? t.soldOut : t.add}
            </Button>
            <button type="button" aria-pressed={wish} aria-label={wish ? t.wishOn : t.wishAdd} title={wish ? t.wishOn : t.wishAdd} onClick={() => toggleWish(p.id)}
              className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-surface hover:bg-surface-2">
              <Heart className={cn('size-5', wish && 'fill-current text-brand-700 dark:text-brand-300')} aria-hidden="true" />
            </button>
          </div>
          {!canOrder && <p className="text-[13px] text-amber-800 dark:text-amber-300">{t.browseOnly}</p>}

          {added && (
            <Alert tone="ok" title={t.added}>
              <p>{l(p.name)} · {added}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <LinkButton href={to('/checkout')} size="sm">{t.goCheckout}</LinkButton>
                <LinkButton href={to('/cart')} size="sm" variant="secondary">{t.viewBag}</LinkButton>
              </div>
            </Alert>
          )}

          <section aria-labelledby="sf-eta-h" className={cn(PANEL, 'space-y-3 p-5')}>
            <h2 id="sf-eta-h" className="flex items-center gap-2 text-sm font-semibold"><Truck className="size-4 text-muted" aria-hidden="true" />{t.delivery}
              {est && <InfoHint>{t.basis(String(est.handling), est.transit[0] === est.transit[1] ? String(est.transit[0]) : `${est.transit[0]}–${est.transit[1]}`)}</InfoHint>}
            </h2>
            <label className="flex items-center gap-3 text-sm">
              <span className="shrink-0 text-muted">{t.deliverTo}</span>
              <Select className="h-10 w-auto" value={city} onChange={(e) => setCity(e.target.value as CityId)}>
                {CITIES.map((c) => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
              </Select>
            </label>
            {est && <p className="font-semibold">{est.from === est.to ? t.estimateSame(dl(est.from)) : t.estimate(dl(est.from), dl(est.to))}</p>}
            <p className="text-[13px] text-muted">{l(std.note)}</p>
          </section>

          <div className="divide-y divide-border border-y border-border">
            <details className="group py-1" open>
              <summary className="flex h-12 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">{t.details}<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
              <ul className="space-y-2 pb-4 text-sm text-muted">{p.details.map((d) => <li key={d.en} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{l(d)}</li>)}</ul>
            </details>
            <details className="group py-1">
              <summary className="flex h-12 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">{t.pReturns}<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
              <p className="flex gap-2 pb-4 text-sm text-muted"><RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{isPerfume ? l(p.details[p.details.length - 1]) : t.returnsLine} <a className="font-semibold text-fg underline-offset-4 hover:underline" href={to('/page/returns')}>{t.pReturns}</a></span></p>
            </details>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="sf-rel-h" className="pt-16 sm:pt-20">
          <h2 id="sf-rel-h" className={cn(H2, 'mb-6')}>{t.related}</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
