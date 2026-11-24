import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../../../core/ui';
import { navigate } from '../../../core/router';
import {
  CITIES, MERCHANT, SHIP_METHODS, canPay, cityById, cleanPhone, computeTotals, deliveryEstimate, isSettled, payEligibility,
  pricedLines, shipAvailable, shipById, validateAddress, validateCart, variantById,
  type Address, type AddrErr, type CityId, type Order, type PayMethod,
} from '../domain';
import { Icon, ProductArt, TestBox, districtLabel, to, useS, variantLabel } from '../kit';
import {
  CUSTOMER, accountStore, buildDraft, cartStore, catalogStore, checkStatus, checkoutStore, couponResult, ordersStore, openCodCount,
  payEvent, pendingForSession, signIn, signOut, stripSaved, submit, testStore,
} from '../state';
import { Breakdown, CouponBox } from './Cart';

const FIELD_ORDER: (keyof AddrErr)[] = ['email', 'name', 'phone', 'city', 'district', 'street', 'building', 'nationalCode'];

export default function Checkout() {
  const s = useS();
  const { t, l, lang, m, dl } = s;
  const cart = cartStore.use();
  const products = catalogStore.use();
  const co = checkoutStore.use();
  const acc = accountStore.use();
  const ts = testStore.use();
  ordersStore.use();
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [double, setDouble] = useState<string | null>(null);
  const lock = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);

  const lines = pricedLines(cart, products);
  const issues = validateCart(cart, products);
  const coupon = couponResult(cart, products);
  const discount = coupon?.status === 'valid' ? coupon.discount : 0;
  const city = co.addr.city as CityId | undefined;
  const ship = shipById(co.ship)!;
  const shipOk = !!city && shipAvailable(ship, city);
  const signed = co.mode === 'account' && acc.signedIn;
  const openCod = openCodCount();
  const totalsNoCod = computeTotals(lines, { discount, ship });
  const elig = (pm: PayMethod) => payEligibility(pm, { total: totalsNoCod.total + (pm === 'cod' ? MERCHANT.codFee : 0), applePayDevice: ts.applePay, openCod, ship: co.ship });
  const methodOk = !elig(co.method);
  const totals = computeTotals(lines, { discount, ship, cod: co.method === 'cod' && methodOk });
  const errs = validateAddress(co.addr, { email: co.email });
  const pending = pendingForSession();
  const showErr = (k: keyof AddrErr) => (tried ? errs[k] : undefined);

  // If Apple Pay disappears (device toggle off) fall back to card rather than leaving an impossible choice selected.
  useEffect(() => {
    if (co.method === 'applepay' && !ts.applePay) checkoutStore.set((c) => ({ ...c, method: 'card' }));
  }, [co.method, ts.applePay]);

  useEffect(() => { if (co.notice) noticeRef.current?.focus(); }, [co.notice]);

  const setAddr = (patch: Partial<Address>) => checkoutStore.set((c) => ({ ...c, addr: { ...c.addr, ...patch }, savedId: undefined }));

  const run = (order: Order) => {
    const method = checkoutStore.get().method;
    setTimeout(() => {
      if (method === 'cod') {
        payEvent(order.ref, { type: 'cod' }, 'cod');
        lock.current = false;
        navigate(to(`/order/${order.ref}`, { new: '1' }));
        return;
      }
      const outcome = testStore.get().outcome;
      const after = payEvent(order.ref, { type: 'attempt', outcome }, method);
      lock.current = false;
      setBusy(false);
      if (!after) return;
      if (after.pay.state === 'paid') navigate(to(`/order/${order.ref}`, { new: '1' }));
      else if (after.pay.state === 'declined') checkoutStore.set((c) => ({ ...c, notice: { kind: 'declined', ref: order.ref } }));
      else if (after.pay.state === 'challenge') setChallenge(order.ref);
      else if (after.pay.state === 'verifying') navigate(to(`/order/${order.ref}`));
    }, 900);
  };

  const valid = () => {
    setTried(true);
    if (issues.length) return false;
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (first) { document.getElementById(`sf-f-${first}`)?.focus(); return false; }
    if (!shipOk) { document.getElementById('sf-ship-h')?.focus(); return false; }
    if (!methodOk) { document.getElementById('sf-pay-h')?.focus(); return false; }
    return true;
  };

  const start = () => {
    if (lock.current || pending) return;
    if (!valid()) return;
    lock.current = true;
    setBusy(true);
    checkoutStore.set((c) => ({ ...c, notice: undefined }));
    const { order } = submit(buildDraft());
    if (!canPay(order.pay.state)) {
      lock.current = false;
      setBusy(false);
      if (isSettled(order.pay.state) || order.pay.state === 'verifying') navigate(to(`/order/${order.ref}`));
      return;
    }
    run(order);
  };

  /** Test: the same submission sent twice in a row. The idempotency key returns the first order for the second call. */
  const doubleSubmit = () => {
    if (lock.current || pending || !valid()) return;
    const d = buildDraft();
    const a = submit(d);
    const b = submit(d);
    const n = ordersStore.get().filter((o) => o.key === a.order.key).length;
    setDouble(t.doubleNote(String(n), b.order.ref));
    lock.current = true;
    setBusy(true);
    checkoutStore.set((c) => ({ ...c, notice: undefined }));
    if (canPay(a.order.pay.state)) run(a.order); else { lock.current = false; setBusy(false); }
  };

  const resolveChallenge = (pass: boolean) => {
    const ref = challenge;
    setChallenge(null);
    if (!ref) return;
    const o = payEvent(ref, { type: 'challenge', pass }, checkoutStore.get().method);
    if (o?.pay.state === 'paid') navigate(to(`/order/${ref}`, { new: '1' }));
    else checkoutStore.set((c) => ({ ...c, notice: { kind: 'challenge', ref } }));
  };

  const resolveRef = useRef(resolveChallenge);
  resolveRef.current = resolveChallenge;
  const closeChallenge = useCallback(() => resolveRef.current(false), []);

  if (!cart.lines.length && !pending) {
    return (
      <div className="sf-wrap sf-section sf-narrow sf-center">
        <Icon name="bag" size={40} />
        <h1 className="sf-h1">{t.emptyCheckout}</h1>
        <a className="btn primary sf-btn-lg" href={to('/c/all')}>{t.keepShopping}</a>
      </div>
    );
  }


  const methods: { id: PayMethod; label: string; note: ReactNode; icon: string }[] = [
    { id: 'card', label: t.card, note: t.cardNote, icon: 'card' },
    ...(ts.applePay ? [{ id: 'applepay' as PayMethod, label: t.apple, note: t.appleNote, icon: 'card' }] : []),
    { id: 'bnpl', label: t.bnpl, note: <>{t.bnplNote} <span className="sim">{t.sim}</span></>, icon: 'clock' },
    { id: 'cod', label: t.cod, note: t.codNote(m(MERCHANT.codFee)), icon: 'box' },
  ];

  const field = (k: keyof AddrErr, label: string, input: ReactNode, hint?: string) => {
    const e = showErr(k);
    const msg = e === 'required' ? t.eRequired : k === 'phone' ? t.ePhone : k === 'nationalCode' ? t.eNational : k === 'email' ? t.eEmail : t.eRequired;
    return (
      <div className={`sf-field${e ? ' has-err' : ''}`}>
        <label htmlFor={`sf-f-${k}`}>{label}</label>
        {input}
        {hint && !e && <span className="hint" id={`sf-f-${k}-hint`}>{hint}</span>}
        {e && <span className="error" id={`sf-f-${k}-err`}>{msg}</span>}
      </div>
    );
  };
  const aria = (k: keyof AddrErr, hint?: boolean) => ({
    id: `sf-f-${k}`,
    'aria-invalid': showErr(k) ? true : undefined,
    'aria-describedby': showErr(k) ? `sf-f-${k}-err` : hint ? `sf-f-${k}-hint` : undefined,
  });
  const cityObj = cityById(city);
  const saved = signed ? acc.addresses : [];
  const payLabel = co.method === 'cod' ? t.placeCod : t.pay(m(totals.total));

  const notice = co.notice && (() => {
    const k = co.notice.kind;
    const [title, body] = k === 'declined' ? [t.declinedT, t.declinedB] : k === 'challenge' ? [t.challengeT, t.challengeB] : [t.verifyFailT, t.verifyFailB(co.notice.ref)];
    return (
      <div ref={noticeRef} tabIndex={-1} className={`sf-notice ${k === 'verify_failed' ? 'info' : 'bad'}`} role="alert">
        <Icon name={k === 'verify_failed' ? 'info' : 'alert'} />
        <div><p className="sf-strong">{title}</p><p>{body}</p></div>
      </div>
    );
  })();

  const summary = (idp: string) => (
    <div className="sf-panel">
      <div className="sf-sec-head"><h2 className="sf-h3">{t.summary}</h2><a className="sf-link small" href={to('/cart')}>{t.editBag}</a></div>
      <ul className="sf-mini-lines">
        {cart.lines.map((line) => {
          const f = variantById(products, line.vid);
          if (!f) return null;
          return (
            <li key={line.vid}>
              <span className="sf-mini-art"><ProductArt p={f.product} color={f.variant.color} /><span className="sf-mini-qty">{line.qty}</span></span>
              <span className="grow"><span className="sf-strong">{l(f.product.name)}</span><br /><span className="small sf-muted">{variantLabel(f.product, f.variant.color, f.variant.size, lang)}</span></span>
              <bdi className="small">{m(f.variant.price * line.qty)}</bdi>
            </li>
          );
        })}
      </ul>
      <CouponBox idp={idp} />
      <Breakdown totals={totals} coupon={coupon?.status === 'valid' ? coupon.code : undefined}
        shippingLabel={shipOk ? l(ship.name) : t.shipEst} shippingNote={shipOk ? undefined : t.cityFirst} />
    </div>
  );

  return (
    <div className="sf-wrap sf-section">
      <header className="sf-list-head"><h1 className="sf-h1">{t.coTitle}</h1></header>
      <details className="sf-mobile-summary">
        <summary><span>{t.showSummary}</span><bdi className="sf-strong">{m(totals.total)}</bdi></summary>
        {summary('sf-coupon-m')}
      </details>

      <div className="sf-two">
        <div className="sf-two-main sf-co">
          {issues.length > 0 && (
            <div className="sf-notice bad" role="alert"><Icon name="alert" /><div><p>{t.blocked}</p><a className="sf-link" href={to('/cart')}>{t.editBag}</a></div></div>
          )}
          {pending && (
            <div className="sf-notice info" role="status">
              <Icon name="clock" />
              <div>
                <p className="sf-strong">{t.pendingT}</p>
                <p>{t.pendingB(pending.ref)}</p>
                <div className="sf-row-actions">
                  <button type="button" className="btn" onClick={() => checkStatus(pending.ref)}><Icon name="refresh" size={18} />{t.checkStatus}</button>
                  <a className="btn" href={to(`/order/${pending.ref}`)}>{t.openOrder}</a>
                </div>
              </div>
            </div>
          )}

          <section className="sf-step" aria-labelledby="sf-c-h">
            <h2 id="sf-c-h" className="sf-step-h"><span className="sf-step-n">1</span>{t.sContact}</h2>
            <div className="sf-seg" role="radiogroup" aria-label={t.sContact}>
              <label className={co.mode === 'guest' ? 'on' : ''}><input type="radio" name="sf-mode" className="sr" checked={co.mode === 'guest'} onChange={() => checkoutStore.set((c) => ({ ...c, mode: 'guest' }))} />{t.guest}</label>
              <label className={co.mode === 'account' ? 'on' : ''}><input type="radio" name="sf-mode" className="sr" checked={co.mode === 'account'} onChange={() => { checkoutStore.set((c) => ({ ...c, mode: 'account' })); if (acc.signedIn) signIn(); }} />{t.signIn}</label>
            </div>
            {co.mode === 'account' && !acc.signedIn && (
              <div className="sf-signin">
                <p className="small sf-muted">{t.signInNote}</p>
                <button type="button" className="btn" onClick={signIn}><Icon name="user" size={18} />{t.signInSim}</button>
              </div>
            )}
            {signed && (
              <p className="sf-signed"><Icon name="check" size={18} /> {t.signedAs(l(CUSTOMER.name))} <button type="button" className="sf-link-btn" onClick={signOut}>{t.signOut}</button></p>
            )}
            {field('email', t.email, <input className="input" type="email" dir="ltr" autoComplete="email" value={co.email} onChange={(e) => checkoutStore.set((c) => ({ ...c, email: e.target.value }))} {...aria('email')} />)}
          </section>

          <section className="sf-step" aria-labelledby="sf-a-h">
            <h2 id="sf-a-h" className="sf-step-h"><span className="sf-step-n">2</span>{t.sAddress}</h2>
            {saved.length > 0 && (
              <fieldset className="sf-saved">
                <legend>{t.saved}</legend>
                {saved.map((a) => (
                  <label key={a.id} className="radio sf-radio">
                    <input type="radio" name="sf-saved" checked={co.savedId === a.id} onChange={() => checkoutStore.set((c) => ({ ...c, savedId: a.id, addr: stripSaved(a) }))} />
                    <span className="grow">
                      <span className="sf-strong">{a.name}</span> · <bdi dir="ltr">+966 {a.phone}</bdi><br />
                      <span className="small sf-muted">{a.street} {a.building}, {districtLabel(a.city, a.district, lang)}, {l(cityById(a.city)!.name)}</span>
                    </span>
                    {a.id === acc.defaultId && <span className="sf-tag">{t.defaultA}</span>}
                  </label>
                ))}
                <label className="radio sf-radio">
                  <input type="radio" name="sf-saved" checked={!co.savedId} onChange={() => checkoutStore.set((c) => ({ ...c, savedId: undefined, addr: { phone: c.addr.phone, name: c.addr.name } }))} />
                  <span className="grow">{t.useNew}</span>
                </label>
              </fieldset>
            )}
            {!co.savedId && (
              <div className="sf-form-grid">
                <div className="sf-field sf-span">
                  <span className="sf-label">{t.country}</span>
                  <p className="sf-static">{t.countryVal}</p>
                  <span className="hint">{t.countryNote}</span>
                </div>
                {field('name', t.name, <input className="input" autoComplete="name" value={co.addr.name ?? ''} onChange={(e) => setAddr({ name: e.target.value })} {...aria('name')} />)}
                {field('phone', t.phone, (
                  <div className="sf-phone" dir="ltr">
                    <span aria-hidden="true">+966</span>
                    <input className="input" type="tel" inputMode="tel" autoComplete="tel-national" value={co.addr.phone ?? ''} placeholder="5X XXX XXXX"
                      onChange={(e) => setAddr({ phone: e.target.value })} onBlur={(e) => e.target.value && setAddr({ phone: cleanPhone(e.target.value) })} {...aria('phone', true)} />
                  </div>
                ), t.phoneHint)}
                {field('city', t.city, (
                  <select className="input" value={city ?? ''} onChange={(e) => setAddr({ city: (e.target.value || undefined) as CityId, district: '' })} {...aria('city')}>
                    <option value="">{t.pickCity}</option>
                    {CITIES.map((c) => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
                  </select>
                ))}
                {field('district', t.district, (
                  <select className="input" value={co.addr.district ?? ''} disabled={!cityObj} onChange={(e) => setAddr({ district: e.target.value })} {...aria('district')}>
                    <option value="">{t.pickDistrict}</option>
                    {cityObj?.districts.map((d) => <option key={d.en} value={d.en}>{l(d)}</option>)}
                  </select>
                ))}
                {field('street', t.street, <input className="input" autoComplete="address-line1" value={co.addr.street ?? ''} onChange={(e) => setAddr({ street: e.target.value })} {...aria('street')} />)}
                {field('building', t.building, <input className="input" inputMode="numeric" dir="ltr" value={co.addr.building ?? ''} onChange={(e) => setAddr({ building: e.target.value })} {...aria('building')} />)}
                {field('nationalCode', t.national, (
                  <input className="input" dir="ltr" autoCapitalize="characters" value={co.addr.nationalCode ?? ''} maxLength={8} placeholder="RRRD2929"
                    onChange={(e) => setAddr({ nationalCode: e.target.value.toUpperCase() })} {...aria('nationalCode', true)} />
                ), t.nationalHint)}
                <div className="sf-field sf-span">
                  <label htmlFor="sf-f-notes">{t.notes}</label>
                  <textarea id="sf-f-notes" className="input" rows={2} value={co.addr.notes ?? ''} onChange={(e) => setAddr({ notes: e.target.value })} />
                </div>
              </div>
            )}
          </section>

          <section className="sf-step" aria-labelledby="sf-ship-h">
            <h2 id="sf-ship-h" className="sf-step-h" tabIndex={-1}><span className="sf-step-n">3</span>{t.sShip}</h2>
            {!city && <p className={tried ? 'error' : 'sf-muted'}>{t.cityFirst}</p>}
            {city && (
              <fieldset className="sf-options">
                <legend className="sr">{t.sShip}</legend>
                {SHIP_METHODS.map((sm) => {
                  const ok = shipAvailable(sm, city);
                  const est = ok ? deliveryEstimate(sm, city, Date.now()) : undefined;
                  const cost = computeTotals(lines, { discount, ship: sm }).shipping;
                  return (
                    <label key={sm.id} className={`radio sf-radio${ok ? '' : ' is-off'}`}>
                      <input type="radio" name="sf-ship" checked={co.ship === sm.id} disabled={!ok} onChange={() => checkoutStore.set((c) => ({ ...c, ship: sm.id, method: sm.id === 'pickup' && c.method === 'cod' ? 'card' : c.method }))} />
                      <span className="grow">
                        <span className="sf-strong">{l(sm.name)}</span><br />
                        <span className="small sf-muted">
                          {!ok ? t.notForCity : est && (sm.id === 'pickup' ? t.readyFrom(dl(est.from)) : t.etaRange(dl(est.from), dl(est.to)))}
                          {ok && <> · {l(sm.note)}</>}
                        </span>
                      </span>
                      {ok && <span className="sf-opt-price">{cost === 0 ? t.free : <bdi>{m(cost)}</bdi>}</span>}
                    </label>
                  );
                })}
              </fieldset>
            )}
            {tried && city && !shipOk && <p className="error">{t.notForCity}</p>}
          </section>

          <section className="sf-step" aria-labelledby="sf-pay-h">
            <h2 id="sf-pay-h" className="sf-step-h" tabIndex={-1}><span className="sf-step-n">4</span>{t.sPay}</h2>
            {notice}
            <fieldset className="sf-options">
              <legend className="sr">{t.sPay}</legend>
              {methods.map((pm) => {
                const why = elig(pm.id);
                return (
                  <label key={pm.id} className={`radio sf-radio${why ? ' is-off' : ''}`}>
                    <input type="radio" name="sf-pay" checked={co.method === pm.id} disabled={!!why} onChange={() => checkoutStore.set((c) => ({ ...c, method: pm.id }))} aria-describedby={`sf-pm-${pm.id}`} />
                    <span className="grow">
                      <span className="sf-strong">{pm.label}</span><br />
                      <span id={`sf-pm-${pm.id}`} className="small sf-muted">{why ? t.inel[why] : pm.note}</span>
                    </span>
                    <Icon name={pm.icon} />
                  </label>
                );
              })}
            </fieldset>
            {!ts.applePay && <p className="small sf-muted">{t.appleHidden}</p>}
            <label className="check"><input type="checkbox" checked={co.gift} onChange={(e) => checkoutStore.set((c) => ({ ...c, gift: e.target.checked }))} />{t.gift}</label>
            {co.gift && (
              <div className="sf-field sf-span">
                <label htmlFor="sf-gift">{t.giftMsg}</label>
                <textarea id="sf-gift" className="input" rows={2} maxLength={200} value={co.giftMsg} onChange={(e) => checkoutStore.set((c) => ({ ...c, giftMsg: e.target.value }))} aria-describedby="sf-gift-h" />
                <span className="hint" id="sf-gift-h">{t.giftNote}</span>
              </div>
            )}
          </section>

          <div className="sf-paybar">
            {tried && (Object.keys(errs).length > 0 || !shipOk || !methodOk) && <p className="error" role="alert">{t.checkFields}</p>}
            <button type="button" className="btn primary sf-btn-block sf-btn-lg" onClick={start} disabled={busy || !!pending || issues.length > 0} aria-busy={busy || undefined}>
              {busy ? t.processing : payLabel}
            </button>
            {co.method !== 'cod' && <p className="small sf-muted sf-center-text"><span className="sim">{t.sim}</span> {t.outcomes[ts.outcome]}</p>}
            <p className="small sf-muted">{t.terms} <a className="sf-link" href={to('/page/terms')}>{t.pTerms}</a> · <a className="sf-link" href={to('/page/returns')}>{t.pReturns}</a></p>
          </div>

          <TestBox title={t.tpTitle}>
            <button type="button" className="btn small" onClick={doubleSubmit} disabled={busy || !!pending || issues.length > 0}>{t.tpDouble}</button>
            {double && <p className="small" role="status">{double}</p>}
          </TestBox>
        </div>

        <aside className="sf-two-side sf-sticky sf-co-side">{summary('sf-coupon-d')}</aside>
      </div>

      {challenge && (
        <Dialog title={t.tdsTitle} onClose={closeChallenge} footer={<>
          <button type="button" className="btn" onClick={() => resolveChallenge(false)}>{t.tdsFail}</button>
          <button type="button" className="btn primary" onClick={() => resolveChallenge(true)}>{t.tdsOk}</button>
        </>}>
          <p>{t.tdsBody(m(totals.total))}</p>
          <p className="small sf-muted"><span className="sim">{t.sim}</span></p>
        </Dialog>
      )}
    </div>
  );
}
