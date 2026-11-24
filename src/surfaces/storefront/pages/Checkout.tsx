// Checkout: one clear column on phones, sticky order summary on desktop. Everything typed is kept in the session store,
// so a failed payment, a reload or a trip back to the bag never loses it. Payment and delivery are simulated.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Banknote, Check, ChevronDown, Clock, CreditCard, FlaskConical, Lock, RefreshCw, ShoppingBag, Smartphone, User } from 'lucide-react';
import { navigate } from '../../../core/router';
import { Alert, Field, Input, Modal, Select, Textarea } from '../../../ds/kit';
import { Button, EmptyState, LinkButton, Money, Segmented, cn, useTx } from '../../../ds/ui';
import { settingsStore } from '../../merchant/stores';
import { shopperView } from '../../dashboard/storefront/model';
import {
  CITIES, MERCHANT, SHIP_METHODS, canPay, cityById, cleanPhone, computeTotals, deliveryEstimate, isSettled, payEligibility,
  pricedLines, shipAvailable, shipById, validateAddress, validateCart, variantById,
  type Address, type AddrErr, type CityId, type Order, type PayMethod,
} from '../domain';
import { Breakdown, CouponBox, H1, PANEL, ProductPhoto, SimNote, WRAP, districtLabel, to, useS, variantLabel } from '../kit';
import {
  CUSTOMER, accountStore, buildDraft, cartStore, checkStatus, checkoutStore, couponResult, ordersStore, openCodCount,
  payEvent, pendingForSession, signIn, signOut, stripSaved, submit,
} from '../state';
import { useCatalog } from '../data';
import { simNow, useSim } from '../review';

const FIELD_ORDER: (keyof AddrErr)[] = ['email', 'name', 'phone', 'city', 'district', 'street', 'building', 'nationalCode'];
const radioCard = 'flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-fg/30 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-500/[.04] has-[:checked]:ring-1 has-[:checked]:ring-brand-600 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:disabled]:hover:border-border';
const radio = 'mt-0.5 size-[18px] shrink-0 accent-brand-600';

export default function Checkout() {
  const s = useS();
  const { t, l, lang, m, dl } = s;
  const tx = useTx();
  const cart = cartStore.use();
  const products = useCatalog();
  const co = checkoutStore.use();
  const acc = accountStore.use();
  const sim = useSim();
  const canOrder = shopperView(settingsStore.use().status) === 'open';
  ordersStore.use();
  const [tried, setTried] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof AddrErr, boolean>>>({});
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
  const elig = (pm: PayMethod) => payEligibility(pm, { total: totalsNoCod.total + (pm === 'cod' ? MERCHANT.codFee : 0), applePayDevice: sim.applePay, openCod, ship: co.ship });
  const methodOk = !elig(co.method);
  const totals = computeTotals(lines, { discount, ship, cod: co.method === 'cod' && methodOk });
  const errs = validateAddress(co.addr, { email: co.email });
  const pending = pendingForSession();
  const showErr = (k: keyof AddrErr) => (tried || touched[k] ? errs[k] : undefined);
  const touch = (k: keyof AddrErr) => () => setTouched((x) => ({ ...x, [k]: true }));

  // If Apple Pay is not available on this device, fall back to card rather than leaving an impossible choice selected.
  useEffect(() => {
    if (co.method === 'applepay' && !sim.applePay) checkoutStore.set((c) => ({ ...c, method: 'card' }));
  }, [co.method, sim.applePay]);

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
      const after = payEvent(order.ref, { type: 'attempt', outcome: simNow(sim.review).outcome }, method);
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
    if (issues.length || !canOrder) return false;
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

  /** Review: the same submission sent twice in a row. The idempotency key returns the first order for the second call. */
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
      <div className={cn(WRAP, 'py-16')}>
        <EmptyState as="h1" icon={<ShoppingBag className="size-6" aria-hidden="true" />} title={t.emptyCheckout} action={<LinkButton href={to('/c/all')} size="lg">{t.keepShopping}</LinkButton>} />
      </div>
    );
  }

  const methods: { id: PayMethod; label: string; note: ReactNode; icon: ReactNode }[] = [
    { id: 'card', label: t.card, note: t.cardNote, icon: <CreditCard className="size-5" aria-hidden="true" /> },
    ...(sim.applePay ? [{ id: 'applepay' as PayMethod, label: t.apple, note: t.appleNote2, icon: <Smartphone className="size-5" aria-hidden="true" /> }] : []),
    { id: 'bnpl', label: t.bnpl, note: t.bnplNote, icon: <Clock className="size-5" aria-hidden="true" /> },
    { id: 'cod', label: t.cod, note: t.codNote(m(MERCHANT.codFee)), icon: <Banknote className="size-5" aria-hidden="true" /> },
  ];

  const errMsg = (k: keyof AddrErr) => {
    const e = showErr(k);
    if (!e) return null;
    return e === 'required' ? t.eRequired : k === 'phone' ? t.ePhone : k === 'nationalCode' ? t.eNational : k === 'email' ? t.eEmail : t.eRequired;
  };
  const cityObj = cityById(city);
  const saved = signed ? acc.addresses : [];
  const payLabel = co.method === 'cod' ? t.placeCod : t.pay(m(totals.total));
  const anyErr = Object.keys(errs).length > 0 || !shipOk || !methodOk;

  const notice = co.notice && (() => {
    const k = co.notice.kind;
    const [title, body] = k === 'declined' ? [t.declinedT, t.declinedB] : k === 'challenge' ? [t.challengeT, t.challengeB] : [t.verifyFailT, t.verifyFailB(co.notice.ref)];
    return <div ref={noticeRef} tabIndex={-1} className="focus:outline-none"><Alert tone={k === 'verify_failed' ? 'info' : 'bad'} title={title}>{body}</Alert></div>;
  })();

  const summary = (idp: string) => (
    <div className="space-y-5">
      <ul className="space-y-4">
        {cart.lines.map((line) => {
          const f = variantById(products, line.vid);
          if (!f) return null;
          return (
            <li key={line.vid} className="flex items-center gap-3">
              <span className="relative w-16 shrink-0">
                <ProductPhoto p={f.product} color={f.variant.color} variant="thumb" />
                <span className="absolute -top-2 -end-2 grid min-w-5 place-items-center rounded-full bg-fg px-1.5 text-[11px] font-bold leading-5 text-bg tabular-nums">{line.qty}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 block text-sm font-medium">{l(f.product.name)}</span>
                <span className="block text-xs text-muted">{variantLabel(f.product, f.variant.color, f.variant.size, lang)}</span>
              </span>
              <Money v={f.variant.price * line.qty} className="text-sm" />
            </li>
          );
        })}
      </ul>
      <CouponBox idp={idp} products={products} />
      <Breakdown totals={totals} coupon={coupon?.status === 'valid' ? coupon.code : undefined}
        shippingLabel={shipOk ? l(ship.name) : t.shipping} shippingPending={!shipOk} />
    </div>
  );

  const step = (n: number, id: string, title: string, children: ReactNode, focusable?: boolean) => (
    <section aria-labelledby={id} className={cn(PANEL, 'space-y-5 p-5 sm:p-6')}>
      <h2 id={id} tabIndex={focusable ? -1 : undefined} className="flex items-center gap-3 text-[17px] font-semibold focus:outline-none">
        <span className="grid size-7 place-items-center rounded-full bg-fg text-[13px] font-bold text-bg">{n}</span>{title}
      </h2>
      {children}
    </section>
  );

  return (
    <div className={cn(WRAP, 'py-6 sm:py-10')}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className={H1}>{t.coTitle}</h1>
        <a href={to('/cart')} className="text-sm font-semibold underline-offset-4 hover:underline">{t.editBag}</a>
      </header>

      <details className={cn(PANEL, 'group mb-6 lg:hidden')}>
        <summary className="flex h-14 cursor-pointer list-none items-center gap-3 px-5 text-sm [&::-webkit-details-marker]:hidden">
          <ShoppingBag className="size-4 text-muted" aria-hidden="true" />
          <span className="flex-1 font-medium">{t.showSummary}</span>
          <Money v={totals.total} className="font-bold" />
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-border p-5">{summary('sf-coupon-m')}</div>
      </details>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12">
        <div className="min-w-0 space-y-5">
          {issues.length > 0 && <Alert tone="warn" title={t.blocked} action={<LinkButton href={to('/cart')} size="sm" variant="secondary">{t.editBag}</LinkButton>} />}
          {!canOrder && <Alert tone="warn" title={t.browseOnly} />}
          {pending && (
            <Alert tone="info" title={t.pendingT}>
              <p>{t.pendingB(pending.ref)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => checkStatus(pending.ref, simNow(sim.review).verify)}><RefreshCw className="size-4" aria-hidden="true" />{t.checkStatus}</Button>
                <LinkButton size="sm" variant="ghost" href={to(`/order/${pending.ref}`)}>{t.openOrder}</LinkButton>
              </div>
            </Alert>
          )}

          {step(1, 'sf-c-h', t.sContact, <>
            <Segmented label={t.sContact} value={co.mode} onChange={(v) => { checkoutStore.set((c) => ({ ...c, mode: v })); if (v === 'account' && acc.signedIn) signIn(); }}
              options={[{ value: 'guest', label: t.guest }, { value: 'account', label: t.signIn }]} />
            {co.mode === 'account' && !acc.signedIn && (
              <div className="space-y-2 rounded-xl bg-surface-2 p-4">
                <Button variant="secondary" onClick={signIn}><User className="size-4" aria-hidden="true" />{t.signInSim}</Button>
                <SimNote>{t.signInNote}</SimNote>
              </div>
            )}
            {signed && (
              <p className="flex flex-wrap items-center gap-2 text-sm"><Check className="size-4 text-emerald-600" aria-hidden="true" />{t.signedAs(l(CUSTOMER.name))}
                <button type="button" onClick={signOut} className="font-semibold underline-offset-4 hover:underline">{t.signOut}</button></p>
            )}
            <Field id="sf-f-email" label={t.emailL} optional error={errMsg('email')} hint={t.emailHint}>
              {(p) => <Input {...p} type="email" dir="ltr" autoComplete="email" inputMode="email" value={co.email} onBlur={touch('email')} onChange={(e) => checkoutStore.set((c) => ({ ...c, email: e.target.value }))} className="h-11" />}
            </Field>
          </>)}

          {step(2, 'sf-a-h', t.sAddress, <>
            {saved.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-[13px] font-semibold">{t.saved}</legend>
                {saved.map((a) => (
                  <label key={a.id} className={radioCard}>
                    <input type="radio" name="sf-saved" className={radio} checked={co.savedId === a.id} onChange={() => checkoutStore.set((c) => ({ ...c, savedId: a.id, addr: stripSaved(a) }))} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">{a.name}</span> · <bdi dir="ltr">+966 {a.phone}</bdi>
                      <span className="mt-0.5 block text-[13px] text-muted">{a.street} {a.building}، {districtLabel(a.city, a.district, lang)}، {l(cityById(a.city)!.name)}</span>
                    </span>
                    {a.id === acc.defaultId && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">{t.defaultA}</span>}
                  </label>
                ))}
                <label className={radioCard}>
                  <input type="radio" name="sf-saved" className={radio} checked={!co.savedId} onChange={() => checkoutStore.set((c) => ({ ...c, savedId: undefined, addr: { phone: c.addr.phone, name: c.addr.name } }))} />
                  <span className="text-sm font-medium">{t.useNew}</span>
                </label>
              </fieldset>
            )}
            {!co.savedId && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm">
                  <span><span className="text-muted">{t.country}: </span><span className="font-medium">{t.countryVal}</span></span>
                  <span className="text-xs text-muted">{t.countryNote}</span>
                </div>
                <Field id="sf-f-name" label={t.name} error={errMsg('name')} className="sm:col-span-2">
                  {(p) => <Input {...p} autoComplete="name" value={co.addr.name ?? ''} onBlur={touch('name')} onChange={(e) => setAddr({ name: e.target.value })} className="h-11" />}
                </Field>
                <Field id="sf-f-phone" label={t.phone} error={errMsg('phone')} hint={t.phoneHint} className="sm:col-span-2">
                  {(p) => (
                    <div className="flex" dir="ltr">
                      <span className="grid h-11 place-items-center rounded-s-xl border border-e-0 border-border bg-surface-2 px-3 text-sm text-muted" aria-hidden="true">+966</span>
                      <Input {...p} type="tel" inputMode="tel" autoComplete="tel-national" value={co.addr.phone ?? ''} placeholder="5X XXX XXXX" className="h-11 rounded-s-none"
                        onChange={(e) => setAddr({ phone: e.target.value })} onBlur={(e) => { touch('phone')(); if (e.target.value) setAddr({ phone: cleanPhone(e.target.value) }); }} />
                    </div>
                  )}
                </Field>
                <Field id="sf-f-city" label={t.city} error={errMsg('city')}>
                  {(p) => (
                    <Select {...p} value={city ?? ''} onBlur={touch('city')} onChange={(e) => setAddr({ city: (e.target.value || undefined) as CityId, district: '' })} className="h-11">
                      <option value="">{t.pickCity}</option>
                      {CITIES.map((c) => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
                    </Select>
                  )}
                </Field>
                <Field id="sf-f-district" label={t.district} error={errMsg('district')}>
                  {(p) => (
                    <Select {...p} value={co.addr.district ?? ''} disabled={!cityObj} onBlur={touch('district')} onChange={(e) => setAddr({ district: e.target.value })} className="h-11 disabled:opacity-60">
                      <option value="">{cityObj ? t.pickDistrict : t.cityFirstShort}</option>
                      {cityObj?.districts.map((d) => <option key={d.en} value={d.en}>{l(d)}</option>)}
                    </Select>
                  )}
                </Field>
                <Field id="sf-f-street" label={t.street} error={errMsg('street')}>
                  {(p) => <Input {...p} autoComplete="address-line1" value={co.addr.street ?? ''} onBlur={touch('street')} onChange={(e) => setAddr({ street: e.target.value })} className="h-11" />}
                </Field>
                <Field id="sf-f-building" label={t.building} error={errMsg('building')}>
                  {(p) => <Input {...p} inputMode="numeric" dir="ltr" value={co.addr.building ?? ''} onBlur={touch('building')} onChange={(e) => setAddr({ building: e.target.value })} className="h-11" />}
                </Field>
                <Field id="sf-f-nationalCode" label={t.nationalL} optional error={errMsg('nationalCode')} hint={t.nationalHint} className="sm:col-span-2">
                  {(p) => <Input {...p} dir="ltr" autoCapitalize="characters" maxLength={8} placeholder="RRRD2929" value={co.addr.nationalCode ?? ''} onBlur={touch('nationalCode')} onChange={(e) => setAddr({ nationalCode: e.target.value.toUpperCase() })} className="h-11" />}
                </Field>
                <Field id="sf-f-notes" label={t.notesL} optional className="sm:col-span-2">
                  {(p) => <Textarea {...p} rows={2} className="min-h-20" value={co.addr.notes ?? ''} onChange={(e) => setAddr({ notes: e.target.value })} />}
                </Field>
              </div>
            )}
          </>)}

          {step(3, 'sf-ship-h', t.sShip, <>
            {!city ? <p className={cn('text-sm', tried ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted')}>{t.cityFirst}</p> : (
              <fieldset className="space-y-2">
                <legend className="sr-only">{t.sShip}</legend>
                {SHIP_METHODS.map((sm) => {
                  const ok = shipAvailable(sm, city);
                  const est = ok ? deliveryEstimate(sm, city, Date.now()) : undefined;
                  const cost = computeTotals(lines, { discount, ship: sm }).shipping;
                  return (
                    <label key={sm.id} className={radioCard}>
                      <input type="radio" name="sf-ship" className={radio} checked={co.ship === sm.id} disabled={!ok} onChange={() => checkoutStore.set((c) => ({ ...c, ship: sm.id, method: sm.id === 'pickup' && c.method === 'cod' ? 'card' : c.method }))} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{l(sm.name)}</span>
                        <span className="mt-0.5 block text-[13px] text-muted">
                          {!ok ? t.notForCity : est && (sm.id === 'pickup' ? t.readyFrom(dl(est.from)) : t.etaRange(dl(est.from), dl(est.to)))}
                          {ok && <> · {l(sm.note)}</>}
                        </span>
                      </span>
                      {ok && <span className="shrink-0 text-sm font-semibold">{cost === 0 ? <span className="text-emerald-700 dark:text-emerald-400">{t.free}</span> : <Money v={cost} />}</span>}
                    </label>
                  );
                })}
              </fieldset>
            )}
            {tried && city && !shipOk && <p className="text-sm font-medium text-red-600 dark:text-red-400">{t.notForCity}</p>}
            {city && <SimNote>{t.shipSim}</SimNote>}
          </>, true)}

          {step(4, 'sf-pay-h', t.sPay, <>
            {notice}
            <fieldset className="space-y-2">
              <legend className="sr-only">{t.sPay}</legend>
              {methods.map((pm) => {
                const why = elig(pm.id);
                return (
                  <label key={pm.id} className={radioCard}>
                    <input type="radio" name="sf-pay" className={radio} checked={co.method === pm.id} disabled={!!why} onChange={() => checkoutStore.set((c) => ({ ...c, method: pm.id }))} aria-describedby={`sf-pm-${pm.id}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{pm.label}</span>
                      <span id={`sf-pm-${pm.id}`} className="mt-0.5 block text-[13px] text-muted">{why ? t.inel[why] : pm.note}</span>
                    </span>
                    <span className="shrink-0 text-muted">{pm.icon}</span>
                  </label>
                );
              })}
            </fieldset>
            {!sim.applePay && <p className="text-xs text-muted">{t.appleHidden}</p>}
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-[18px] accent-brand-600" checked={co.gift} onChange={(e) => checkoutStore.set((c) => ({ ...c, gift: e.target.checked }))} />{t.gift}
            </label>
            {co.gift && (
              <Field id="sf-gift" label={t.giftMsg} hint={t.giftNote}>
                {(p) => <Textarea {...p} rows={2} className="min-h-20" maxLength={200} value={co.giftMsg} onChange={(e) => checkoutStore.set((c) => ({ ...c, giftMsg: e.target.value }))} />}
              </Field>
            )}
          </>, true)}

          <div className="space-y-3">
            {tried && anyErr && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{t.checkFields}</p>}
            <Button size="lg" className="h-13 w-full py-3.5 text-base" onClick={start} disabled={busy || !!pending || issues.length > 0 || !canOrder} aria-busy={busy || undefined}>
              {busy ? <><RefreshCw className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t.processing}</> : <><Lock className="size-4" aria-hidden="true" />{payLabel}</>}
            </Button>
            <SimNote className="justify-center text-center">{co.method === 'cod' ? t.codSim : t.paySim}</SimNote>
            <p className="text-center text-xs text-muted">{t.terms} <a className="underline underline-offset-2" href={to('/page/terms')}>{t.pTerms}</a> · <a className="underline underline-offset-2" href={to('/page/returns')}>{t.pReturns}</a></p>
          </div>

          {sim.review && (
            <div className="space-y-2 rounded-2xl border border-dashed border-border p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold"><FlaskConical className="size-4 text-muted" aria-hidden="true" />{tx('وضع المراجعة', 'Review mode')}</p>
              {co.method !== 'cod' && <p className="text-[13px] text-muted">{t.tpOutcome}: {t.outcomes[simNow(true).outcome]}</p>}
              <Button size="sm" variant="secondary" onClick={doubleSubmit} disabled={busy || !!pending || issues.length > 0}>{t.tpDouble}</Button>
              {double && <p className="text-[13px]" role="status">{double}</p>}
            </div>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className={cn(PANEL, 'sticky top-24 p-6')}>
            <h2 className="mb-5 text-[15px] font-semibold">{t.summary}</h2>
            {summary('sf-coupon-d')}
          </div>
        </aside>
      </div>

      {challenge && (
        <Modal title={t.tdsTitle} onClose={closeChallenge} footer={<>
          <Button variant="secondary" onClick={() => resolveChallenge(false)}>{t.tdsFail}</Button>
          <Button onClick={() => resolveChallenge(true)}>{t.tdsOk}</Button>
        </>}>
          <p>{t.tdsBody(m(totals.total))}</p>
          <SimNote>{t.paySim}</SimNote>
        </Modal>
      )}
    </div>
  );
}
