import { useRef, useState } from 'react';
import { replace, type Route } from '../../../core/router';
import {
  CATEGORIES, CITIES, COLORS, MERCHANT, SHIP_METHODS, addToCart, deliveryEstimate, findVariant, missingOptions, productById,
  stockLevel, type CityId, type ColorId,
} from '../domain';
import { Icon, Price, ProductArt, Swatch, sizeLabel, to, useS, variantLabel } from '../kit';
import { accountStore, cartStore, catalogStore, toggleWish } from '../state';
import { ProductGrid } from './Listing';

export default function ProductPage({ route, id }: { route: Route; id: string }) {
  const { t, l, lang, dl } = useS();
  const products = catalogStore.use();
  const cart = cartStore.use();
  const acc = accountStore.use();
  const p = productById(products, id);
  const [view, setView] = useState(0);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState<('color' | 'size')[]>([]);
  const [added, setAdded] = useState<string | null>(null);
  const [city, setCity] = useState<CityId>('riyadh');
  const colorRef = useRef<HTMLFieldSetElement>(null);
  const sizeRef = useRef<HTMLFieldSetElement>(null);

  if (!p) {
    return (
      <div className="sf-wrap sf-section sf-narrow">
        <h1 className="sf-h1">{t.gone}</h1>
        <a className="btn primary" href={to('/c/all')}>{t.all}</a>
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
    if (!variant || room <= 0) return;
    cartStore.set((c) => addToCart(c, variant.id, Math.min(qty, room), variant.stock));
    setAdded(variantLabel(p, color, size, lang));
    setQty(1);
  };

  const sizeVariants = (s: string) => p.variants.filter((v) => v.size === s && (!color || v.color === color));
  const colorVariants = (c: ColorId) => p.variants.filter((v) => v.color === c && (!size || v.size === size));
  const soldAll = (vs: { stock: number }[]) => vs.length > 0 && vs.every((v) => v.stock <= 0);

  return (
    <div className="sf-wrap sf-section">
      <nav className="sf-crumbs small" aria-label={t.home}>
        <a href={to()}>{t.home}</a><Icon name="chev" size={14} flip /><a href={to(`/c/${cat.id}`)}>{l(cat.name)}</a><Icon name="chev" size={14} flip /><span aria-current="page">{l(p.name)}</span>
      </nav>
      <div className="sf-pdp">
        <div className="sf-gallery">
          <div className="sf-gallery-main"><ProductArt p={p} color={color} view={view} label={`${l(p.name)} – ${t.views[view]}`} /></div>
          <div className="sf-thumbs" role="group" aria-label={t.details}>
            {[0, 1, 2].map((v) => (
              <button key={v} type="button" className="sf-thumb" aria-pressed={view === v} aria-label={`${t.viewN(String(v + 1))}: ${t.views[v]}`} onClick={() => setView(v)}>
                <ProductArt p={p} color={color} view={v} />
              </button>
            ))}
          </div>
        </div>

        <div className="sf-buy">
          <h1 className="sf-h1 sf-pdp-title">{l(p.name)}</h1>
          <p className="sf-pdp-price"><Price v={price} compareAt={p.compareAt} from={!variant && new Set(p.variants.map((v) => v.price)).size > 1} /></p>
          <p className="small sf-muted">{t.inclVat}</p>
          <p className="sf-lead">{l(p.blurb)}</p>

          {p.colors.length > 1 && (
            <fieldset ref={colorRef} className={`sf-opt${err.includes('color') ? ' has-err' : ''}`} aria-describedby={err.includes('color') ? 'sf-err-color' : undefined}>
              <legend>{t.color}{color && <span className="sf-muted">: {l(COLORS[color].name)}</span>}</legend>
              <div className="sf-swatches">
                {p.colors.map((c) => {
                  const out = soldAll(colorVariants(c));
                  return (
                    <label key={c} className={`sf-swatch-opt${out ? ' is-out' : ''}`} title={l(COLORS[c].name)}>
                      <input type="radio" name="sf-color" className="sr" checked={color === c} onChange={() => pick('color', c)} />
                      <Swatch c={c} size={30} />
                      <span className="sr">{l(COLORS[c].name)}{out ? ` – ${t.soldOut}` : ''}</span>
                    </label>
                  );
                })}
              </div>
              {err.includes('color') && <p id="sf-err-color" className="error" role="alert">{t.chooseColor}</p>}
            </fieldset>
          )}

          {p.sizes.length > 1 && (
            <fieldset ref={sizeRef} className={`sf-opt${err.includes('size') ? ' has-err' : ''}`} aria-describedby={err.includes('size') ? 'sf-err-size' : undefined}>
              <legend>{isPerfume ? t.volume : t.size}</legend>
              <div className="sf-sizes">
                {p.sizes.map((s) => {
                  const out = soldAll(sizeVariants(s));
                  return (
                    <label key={s} className={`sf-size-opt${out ? ' is-out' : ''}`}>
                      <input type="radio" name="sf-size" className="sr" checked={size === s} onChange={() => pick('size', s)} />
                      <span><bdi>{sizeLabel(s, lang)}</bdi></span>
                      {out && <span className="sr"> – {t.soldOut}</span>}
                    </label>
                  );
                })}
              </div>
              {err.includes('size') && <p id="sf-err-size" className="error" role="alert">{isPerfume ? t.chooseVolume : t.chooseSize}</p>}
            </fieldset>
          )}

          {variant && (
            <p className={`sf-stock ${stockLevel(variant)}`} role="status">
              <span className="sf-stock-dot" aria-hidden="true" />{t.stock[stockLevel(variant)]}
              {p.colors.length + p.sizes.length > 0 && <span className="sf-muted"> · {variantLabel(p, color, size, lang)}</span>}
            </p>
          )}
          {variant && variant.stock <= 0 && <p className="small sf-muted">{t.optSoldOut}</p>}
          {variant && variant.stock > 0 && room <= 0 && <p className="small sf-muted">{t.maxed}</p>}

          <div className="sf-buy-row">
            <div className="sf-stepper" role="group" aria-label={t.qty}>
              <button type="button" aria-label={t.dec} onClick={() => setQty((n) => Math.max(1, n - 1))} disabled={qty <= 1}><Icon name="minus" size={18} /></button>
              <output aria-live="polite" aria-label={t.qty}>{qty}</output>
              <button type="button" aria-label={t.inc} onClick={() => setQty((n) => Math.min(n + 1, Math.max(1, room), 10))} disabled={!!variant && qty >= room}><Icon name="plus" size={18} /></button>
            </div>
            <button type="button" className="btn primary sf-add" onClick={add} disabled={!!variant && room <= 0}>
              <Icon name="bag" size={20} />{variant && variant.stock <= 0 ? t.soldOut : t.add}
            </button>
            <button type="button" className={`sf-wish-lg${wish ? ' on' : ''}`} aria-pressed={wish} aria-label={wish ? t.wishOn : t.wishAdd} onClick={() => toggleWish(p.id)}>
              <Icon name="heart" />
            </button>
          </div>

          {added && (
            <div className="sf-added" role="status">
              <p><Icon name="check" size={18} /> <span className="sf-strong">{t.added}</span> <span className="sf-muted">{l(p.name)}{added ? ` · ${added}` : ''}</span></p>
              <div className="sf-added-actions">
                <a className="btn" href={to('/cart')}>{t.viewBag}</a>
                <a className="btn primary" href={to('/checkout')}>{t.goCheckout}</a>
              </div>
            </div>
          )}

          <section className="sf-eta" aria-labelledby="sf-eta-h">
            <h2 id="sf-eta-h" className="sf-h3"><Icon name="truck" size={20} /> {t.delivery}</h2>
            <label className="sf-inline-field">
              <span>{t.deliverTo}</span>
              <select className="input" value={city} onChange={(e) => setCity(e.target.value as CityId)}>
                {CITIES.map((c) => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
              </select>
            </label>
            {est && <p className="sf-strong">{est.from === est.to ? t.estimateSame(dl(est.from)) : t.estimate(dl(est.from), dl(est.to))}</p>}
            {est && <p className="small sf-muted">{t.basis(String(est.handling), est.transit[0] === est.transit[1] ? String(est.transit[0]) : `${est.transit[0]}–${est.transit[1]}`)}</p>}
            <p className="small sf-muted">{l(std.note)}</p>
          </section>

          <section className="sf-details" aria-labelledby="sf-det-h">
            <h2 id="sf-det-h" className="sf-h3">{t.details}</h2>
            <ul>{p.details.map((d) => <li key={d.en}>{l(d)}</li>)}</ul>
            <p className="small sf-muted"><Icon name="return" size={16} /> {isPerfume ? l(p.details[p.details.length - 1]) : t.returnsLine} <a className="sf-link" href={to('/page/returns')}>{t.pReturns}</a></p>
            <p className="small sf-muted">{l(MERCHANT.name)} · {l(MERCHANT.tagline)}</p>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className="sf-section" aria-labelledby="sf-rel-h">
          <h2 id="sf-rel-h" className="sf-h2">{t.related}</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
