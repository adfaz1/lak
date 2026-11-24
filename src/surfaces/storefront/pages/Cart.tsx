import { useState, type ReactNode } from 'react';
import { CATEGORIES, MERCHANT, SHIP_METHODS, computeTotals, itemCount, pricedLines, removeLine, setQty, validateCart, variantById, type CouponResult, type Totals } from '../domain';
import { Icon, Price, ProductArt, to, useS, variantLabel } from '../kit';
import { cartStore, catalogStore, couponResult } from '../state';

/** Money breakdown used by bag, checkout and order pages. Every component of the total is its own line. */
export function Breakdown({ totals, shippingLabel, shippingNote, coupon }: { totals: Totals; shippingLabel?: string; shippingNote?: ReactNode; coupon?: string }) {
  const { t, m } = useS();
  return (
    <dl className="sf-breakdown">
      <div><dt>{t.subtotal}</dt><dd><bdi>{m(totals.subtotal)}</bdi></dd></div>
      {totals.discount > 0 && <div className="sf-disc"><dt>{t.discount}{coupon && <> (<bdi dir="ltr">{coupon}</bdi>)</>}</dt><dd><bdi>−{m(totals.discount)}</bdi></dd></div>}
      <div><dt>{shippingLabel ?? t.shipping}</dt><dd>{totals.shipping === 0 ? t.free : <bdi>{m(totals.shipping)}</bdi>}</dd></div>
      {shippingNote && <p className="small sf-muted">{shippingNote}</p>}
      {totals.codFee > 0 && <div><dt>{t.codFee}</dt><dd><bdi>{m(totals.codFee)}</bdi></dd></div>}
      <div className="sf-total"><dt>{t.total}</dt><dd><bdi>{m(totals.total)}</bdi></dd></div>
      <div className="sf-vat small"><dt>{t.vatIncl}</dt><dd><bdi>{m(totals.vat)}</bdi></dd></div>
    </dl>
  );
}

export function couponMessage(c: CouponResult, t: ReturnType<typeof useS>['t'], m: (v: number) => string, d: (ms: number) => string, l: ReturnType<typeof useS>['l']): string {
  switch (c.status) {
    case 'valid': return t.cValid(c.code);
    case 'not_found': return t.cNotFound;
    case 'expired': return t.cExpired(d(c.expired));
    case 'limit_reached': return t.cLimit;
    case 'not_eligible': return c.reason === 'category' ? t.cCat(l(CATEGORIES.find((x) => x.id === c.cat)!.name)) : t.cMin(m(c.min), m(c.shortBy));
  }
}

export function CouponBox({ idp = 'sf-coupon' }: { idp?: string }) {
  const s = useS();
  const { t } = s;
  const cart = cartStore.use();
  const products = catalogStore.use();
  const [code, setCode] = useState(cart.coupon ?? '');
  const res = couponResult(cart, products);
  return (
    <div className="sf-coupon">
      <form className="sf-coupon-row" onSubmit={(e) => { e.preventDefault(); if (code.trim()) cartStore.set((c) => ({ ...c, coupon: code.trim().toUpperCase() })); }}>
        <label htmlFor={idp} className="sr">{t.coupon}</label>
        <input id={idp} className="input" dir="ltr" value={code} placeholder={t.coupon} autoComplete="off" autoCapitalize="characters"
          aria-invalid={res && res.status !== 'valid' ? true : undefined} aria-describedby={res ? `${idp}-msg` : undefined}
          onChange={(e) => setCode(e.target.value)} />
        <button type="submit" className="btn">{t.apply}</button>
      </form>
      {res && (
        <div id={`${idp}-msg`} className={`sf-coupon-msg ${res.status === 'valid' ? 'ok' : 'bad'}`} role="status">
          <Icon name={res.status === 'valid' ? 'check' : 'info'} size={18} />
          <span className="grow">{couponMessage(res, t, s.m, s.d, s.l)}</span>
          <button type="button" className="sf-link-btn" onClick={() => { cartStore.set((c) => ({ ...c, coupon: undefined })); setCode(''); }}>{t.couponRemove}</button>
        </div>
      )}
    </div>
  );
}

export default function CartPage() {
  const { t, l, lang, m } = useS();
  const cart = cartStore.use();
  const products = catalogStore.use();
  const lines = pricedLines(cart, products);
  const issues = validateCart(cart, products);
  const c = couponResult(cart, products);
  const discount = c?.status === 'valid' ? c.discount : 0;
  const totals = computeTotals(lines, { discount, ship: SHIP_METHODS[0] });
  const goods = totals.subtotal - totals.discount;
  const n = itemCount(cart);

  if (!cart.lines.length) {
    return (
      <div className="sf-wrap sf-section sf-narrow sf-center">
        <Icon name="bag" size={40} />
        <h1 className="sf-h1">{t.bagEmpty}</h1>
        <a className="btn primary sf-btn-lg" href={to('/c/all')}>{t.keepShopping}</a>
      </div>
    );
  }

  return (
    <div className="sf-wrap sf-section">
      <header className="sf-list-head"><h1 className="sf-h1">{t.bagTitle}</h1><p className="sf-muted">{t.items(String(n))}</p></header>
      <div className="sf-two">
        <section className="sf-two-main" aria-label={t.bagTitle}>
          <ul className="sf-lines">
            {cart.lines.map((line) => {
              const f = variantById(products, line.vid);
              const issue = issues.find((i) => i.vid === line.vid);
              if (!f) {
                return (
                  <li key={line.vid} className="sf-line has-issue">
                    <p className="grow">{t.issueMissing}</p>
                    <button type="button" className="btn small" onClick={() => cartStore.set((x) => removeLine(x, line.vid))}>{t.remove}</button>
                  </li>
                );
              }
              const { product: p, variant: v } = f;
              const name = l(p.name);
              const max = Math.max(1, Math.min(v.stock, 10));
              return (
                <li key={line.vid} className={`sf-line${issue ? ' has-issue' : ''}`}>
                  <a className="sf-line-art" href={to(`/p/${p.id}`, { color: v.color, size: v.size })} tabIndex={-1} aria-hidden="true"><ProductArt p={p} color={v.color} /></a>
                  <div className="sf-line-body">
                    <div className="sf-line-top">
                      <div className="grow">
                        <a className="sf-line-name" href={to(`/p/${p.id}`, { color: v.color, size: v.size })}>{name}</a>
                        <p className="small sf-muted">{variantLabel(p, v.color, v.size, lang)}</p>
                        <p className="small sf-muted"><Price v={v.price} /> {t.each}</p>
                      </div>
                      <p className="sf-line-amt"><bdi>{m(v.price * line.qty)}</bdi></p>
                    </div>
                    {issue && issue.kind !== 'missing' && (
                      <div className="sf-issue" role="alert">
                        <Icon name="alert" size={18} />
                        <span className="grow">{issue.kind === 'sold_out' ? t.issueSold : t.issueReduced(String(issue.available))}</span>
                        {issue.kind === 'reduced' && <button type="button" className="sf-link-btn" onClick={() => cartStore.set((x) => setQty(x, line.vid, issue.available, v.stock))}>{t.setTo(String(issue.available))}</button>}
                      </div>
                    )}
                    <div className="sf-line-actions">
                      {v.stock > 0 && (
                        <div className="sf-stepper small-stepper" role="group" aria-label={t.qtyFor(name)}>
                          <button type="button" aria-label={line.qty <= 1 ? t.removeN(name) : t.dec} onClick={() => cartStore.set((x) => setQty(x, line.vid, line.qty - 1, v.stock))}>
                            <Icon name={line.qty <= 1 ? 'trash' : 'minus'} size={18} />
                          </button>
                          <output aria-live="polite">{line.qty}</output>
                          <button type="button" aria-label={t.inc} disabled={line.qty >= max} onClick={() => cartStore.set((x) => setQty(x, line.vid, line.qty + 1, v.stock))}><Icon name="plus" size={18} /></button>
                        </div>
                      )}
                      <button type="button" className="sf-link-btn" aria-label={t.removeN(name)} onClick={() => cartStore.set((x) => removeLine(x, line.vid))}>{t.remove}</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <a className="sf-link" href={to('/c/all')}>{t.keepShopping}</a>
        </section>

        <aside className="sf-two-side">
          <div className="sf-panel">
            <h2 className="sf-h3">{t.summary}</h2>
            <CouponBox />
            <Breakdown totals={totals} shippingLabel={t.shipEst} shippingNote={t.shipNote} coupon={c?.status === 'valid' ? c.code : undefined} />
            <p className={`sf-freeship small${goods >= MERCHANT.freeShippingFrom ? ' ok' : ''}`}>
              <Icon name="truck" size={18} />
              {goods >= MERCHANT.freeShippingFrom ? t.freeOk : t.freeLeft(m(MERCHANT.freeShippingFrom - goods))}
            </p>
            {issues.length > 0 && <p className="error" role="alert">{t.blocked}</p>}
            {issues.length > 0 ? (
              <button type="button" className="btn primary sf-btn-block" disabled aria-describedby="sf-blocked">{t.toCheckout}</button>
            ) : (
              <a className="btn primary sf-btn-block" href={to('/checkout')}>{t.toCheckout}</a>
            )}
            {issues.length > 0 && <span id="sf-blocked" className="sr">{t.blocked}</span>}
            <p className="small sf-muted">{t.payList}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
