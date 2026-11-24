import { useCallback, useState } from 'react';
import { Dialog } from '../../../core/ui';
import type { Route } from '../../../core/router';
import { refundEstimate, requestReturn, returnEligibility, returnableQty, validIban, variantById, type ReturnReason } from '../domain';
import { Icon, ProductArt, to, useS, variantLabel } from '../kit';
import { catalogStore, ordersStore, updateOrder } from '../state';
import { canView } from './Order';

const REASONS: ReturnReason[] = ['size', 'not_as_described', 'damaged', 'changed_mind'];

export default function ReturnsPage({ reference, route }: { reference: string; route: Route }) {
  const { t, l, lang, m, d } = useS();
  const orders = ordersStore.use();
  const products = catalogStore.use();
  const mobile = route.query.get('m');
  const o = orders.find((x) => x.ref === reference);
  const [picks, setPicks] = useState<Record<string, { qty: number; reason: ReturnReason }>>({});
  const [method, setMethod] = useState<'pickup' | 'dropoff'>('pickup');
  const [iban, setIban] = useState('');
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const close = useCallback(() => setConfirm(false), []);
  const back = to(`/track/${reference}`, mobile ? { m: mobile } : undefined);

  if (!o || !canView(o, mobile)) {
    return <div className="sf-wrap sf-section sf-narrow"><h1 className="sf-h1">{t.noOrder}</h1><a className="btn primary" href={to('/track')}>{t.trackTitle}</a></div>;
  }

  if (done) {
    const r = o.returns.find((x) => x.id === done);
    return (
      <div className="sf-wrap sf-section sf-narrow sf-confirm-head">
        <span className="sf-confirm-icon ok"><Icon name="check" size={28} /></span>
        <h1 className="sf-h1">{t.retDoneT}</h1>
        <p className="sf-ref">{t.retRef}: <bdi dir="ltr" className="sf-strong">{done}</bdi></p>
        <p className="sf-measure">{t.retDoneB}</p>
        {r && <p className="small sf-muted">{t.retEstimate}: <bdi>{m(r.amount)}</bdi> · {t.refund}: {t.refS[r.refund]}</p>}
        <a className="btn primary" href={back}>{t.backToOrder}</a>
      </div>
    );
  }

  const elig = returnEligibility(o, products, Date.now());
  const cod = o.pay.method === 'cod';
  const chosen = Object.entries(picks).filter(([, p]) => p.qty > 0).map(([vid, p]) => ({ vid, qty: p.qty, reason: p.reason }));
  const estimate = refundEstimate(o, chosen);
  const ibanErr = cod && !validIban(iban);
  const count = chosen.reduce((s, c) => s + c.qty, 0);

  const review = () => {
    setTried(true);
    if (!chosen.length) { document.getElementById('sf-r-items')?.focus(); return; }
    if (ibanErr) { document.getElementById('sf-r-iban')?.focus(); return; }
    setConfirm(true);
  };
  const submitReturn = () => {
    const before = o.returns.length;
    let id: string | null = null;
    updateOrder(o.ref, (x) => {
      const next = requestReturn(x, { lines: chosen, method, refundTo: cod ? 'bank' : 'original', iban: cod ? iban.replace(/\s+/g, '').toUpperCase() : undefined }, products, Date.now());
      if (next.returns.length > before) id = next.returns[next.returns.length - 1].id;
      return next;
    });
    setConfirm(false);
    if (id) setDone(id);
  };

  return (
    <div className="sf-wrap sf-section sf-narrow-wide">
      <nav className="sf-crumbs small" aria-label={t.home}><a href={back}><bdi dir="ltr">{o.ref}</bdi></a><Icon name="chev" size={14} flip /><span aria-current="page">{t.retTitle}</span></nav>
      <header className="sf-list-head"><h1 className="sf-h1">{t.retTitle}</h1><p className="sf-muted"><bdi dir="ltr">{o.ref}</bdi> · {t.placedOn(d(o.at))}</p></header>

      {!elig.ok ? (
        <div className="sf-panel">
          <p>{elig.reason === 'window_closed' && elig.until ? t.windowClosed(d(elig.until)) : elig.reason === 'nothing_returnable' ? t.nothingReturnable : t.shipS.none}</p>
          <a className="btn" href={back}>{t.backToOrder}</a>
        </div>
      ) : (
        <>
          <p className="sf-muted">{t.returnUntil(d(elig.until))}</p>
          <section className="sf-panel" aria-labelledby="sf-r-h1">
            <h2 id="sf-r-h1" className="sf-h3">{t.retItems}</h2>
            <ul className="sf-ret-lines" id="sf-r-items" tabIndex={-1}>
              {o.lines.map((line) => {
                const f = variantById(products, line.vid);
                if (!f) return null;
                const max = returnableQty(o, line.vid, products);
                const pick = picks[line.vid] ?? { qty: 0, reason: 'size' as ReturnReason };
                const name = l(f.product.name);
                const blocked = f.product.cat === 'perfume';
                return (
                  <li key={line.vid} className={max ? '' : 'is-off'}>
                    <span className="sf-mini-art"><ProductArt p={f.product} color={f.variant.color} /></span>
                    <div className="grow">
                      <p className="sf-strong">{name}</p>
                      <p className="small sf-muted">{variantLabel(f.product, f.variant.color, f.variant.size, lang)} · <bdi>{m(line.unit)}</bdi> × {line.qty}</p>
                      {max === 0 ? <p className="small sf-muted">{blocked ? t.retNotAllowed : t.retDone}</p> : (
                        <div className="sf-ret-ctrl">
                          <label className="sf-inline-field">
                            <span>{t.qty}</span>
                            <select className="input" aria-label={t.retQty(name)} value={pick.qty} onChange={(e) => setPicks((p) => ({ ...p, [line.vid]: { ...pick, qty: Number(e.target.value) } }))}>
                              {Array.from({ length: max + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                            </select>
                          </label>
                          {pick.qty > 0 && (
                            <label className="sf-inline-field">
                              <span>{t.retReason}</span>
                              <select className="input" value={pick.reason} onChange={(e) => setPicks((p) => ({ ...p, [line.vid]: { ...pick, reason: e.target.value as ReturnReason } }))}>
                                {REASONS.map((r) => <option key={r} value={r}>{t.reasons[r]}</option>)}
                              </select>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {tried && !chosen.length && <p className="error" role="alert">{t.retPickOne}</p>}
          </section>

          <section className="sf-panel" aria-labelledby="sf-r-h2">
            <h2 id="sf-r-h2" className="sf-h3">{t.retMethod}</h2>
            <fieldset className="sf-options">
              <legend className="sr">{t.retMethod}</legend>
              {(['pickup', 'dropoff'] as const).map((x) => (
                <label key={x} className="radio sf-radio"><input type="radio" name="sf-r-m" checked={method === x} onChange={() => setMethod(x)} /><span className="grow">{x === 'pickup' ? t.pickup : t.dropoff}</span></label>
              ))}
            </fieldset>
            <h3 className="sf-label">{t.refundTo}</h3>
            <p>{cod ? t.bank : `${t.original} · ${t.methods[o.pay.method]}`}</p>
            {cod && (
              <div className={`sf-field${tried && ibanErr ? ' has-err' : ''}`}>
                <label htmlFor="sf-r-iban">{t.iban}</label>
                <input id="sf-r-iban" className="input" dir="ltr" value={iban} placeholder="SA00 0000 0000 0000 0000 0000" onChange={(e) => setIban(e.target.value)}
                  aria-invalid={tried && ibanErr ? true : undefined} aria-describedby={tried && ibanErr ? 'sf-r-iban-e' : 'sf-r-iban-h'} />
                {tried && ibanErr ? <span className="error" id="sf-r-iban-e">{t.eIban}</span> : <span className="hint" id="sf-r-iban-h">{t.ibanHint}</span>}
              </div>
            )}
          </section>

          <section className="sf-panel" aria-labelledby="sf-r-h3">
            <h2 id="sf-r-h3" className="sf-h3">{t.retEstimate}</h2>
            <p className="sf-big"><bdi>{m(estimate)}</bdi></p>
            <p className="small sf-muted">{t.retEstimateNote}</p>
            <button type="button" className="btn primary sf-btn-lg" onClick={review}>{t.retSubmit}</button>
          </section>
        </>
      )}

      {confirm && (
        <Dialog title={t.retConfirmT} onClose={close} footer={<>
          <button type="button" className="btn" onClick={close}>{t.cancel}</button>
          <button type="button" className="btn primary" onClick={submitReturn}>{t.retSubmit}</button>
        </>}>
          <p>{t.retConfirmB(String(count), m(estimate))}</p>
          <ul className="small">{chosen.map((c) => { const f = variantById(products, c.vid); return <li key={c.vid}>{f && l(f.product.name)} × {c.qty} · {t.reasons[c.reason]}</li>; })}</ul>
        </Dialog>
      )}
    </div>
  );
}
