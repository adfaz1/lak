import { useCallback, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Route } from '../../../core/router';
import { Alert, Field, Input, Modal, Select } from '../../../ds/kit';
import { Button, EmptyState, LinkButton, Money, Ref, cn } from '../../../ds/ui';
import { refundEstimate, requestReturn, returnEligibility, returnableQty, validIban, variantById, type ReturnReason } from '../domain';
import { Crumbs, H1, H3, PANEL, ProductPhoto, SimNote, WRAP, to, useS, variantLabel } from '../kit';
import { updateOrder } from '../state';
import { useCatalog, useOrders } from '../data';
import { canView } from './Order';

const REASONS: ReturnReason[] = ['size', 'not_as_described', 'damaged', 'changed_mind'];
const radioCard = 'flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm transition-colors hover:border-fg/30 has-[:checked]:border-brand-600 has-[:checked]:ring-1 has-[:checked]:ring-brand-600';

export default function ReturnsPage({ reference, route }: { reference: string; route: Route }) {
  const { t, l, lang, m, d } = useS();
  const orders = useOrders();
  const products = useCatalog();
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
    return <div className={cn(WRAP, 'py-16')}><EmptyState as="h1" title={t.noOrder} action={<LinkButton href={to('/track')}>{t.trackTitle}</LinkButton>} /></div>;
  }

  if (done) {
    const r = o.returns.find((x) => x.id === done);
    return (
      <div className={cn(WRAP, 'flex max-w-xl flex-col items-center py-14 text-center')}>
        <span className="grid size-16 place-items-center rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-8" aria-hidden="true" /></span>
        <h1 className={cn(H1, 'mt-5')}>{t.retDoneT}</h1>
        <p className="mt-2 text-sm text-muted">{t.retRef}: <Ref><span className="font-semibold text-fg">{done}</span></Ref></p>
        <p className="mt-3 leading-relaxed text-muted">{t.retDoneB}</p>
        {r && <p className="mt-2 text-sm">{t.retEstimate}: <Money v={r.amount} className="font-semibold" /> · {t.refund}: {t.refS[r.refund]}</p>}
        <LinkButton href={back} size="lg" className="mt-6">{t.backToOrder}</LinkButton>
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
    <div className={cn(WRAP, 'max-w-3xl py-6 sm:py-10')}>
      <Crumbs items={[{ label: <Ref>{o.ref}</Ref>, href: back }, { label: t.retTitle }]} />
      <header className="mb-6"><h1 className={H1}>{t.retTitle}</h1><p className="mt-1 text-sm text-muted"><Ref>{o.ref}</Ref> · {t.placedOn(d(o.at))}</p></header>

      {!elig.ok ? (
        <div className={cn(PANEL, 'space-y-4 p-6')}>
          <p>{elig.reason === 'window_closed' && elig.until ? t.windowClosed(d(elig.until)) : elig.reason === 'nothing_returnable' ? t.nothingReturnable : t.notDeliveredYet}</p>
          <LinkButton href={back} variant="secondary">{t.backToOrder}</LinkButton>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted">{t.returnUntil(d(elig.until))}</p>
          <section aria-labelledby="sf-r-h1" className={cn(PANEL, 'space-y-4 p-5 sm:p-6')}>
            <h2 id="sf-r-h1" className={H3}>{t.retItems}</h2>
            <ul className="divide-y divide-border focus:outline-none" id="sf-r-items" tabIndex={-1}>
              {o.lines.map((line) => {
                const f = variantById(products, line.vid);
                if (!f) return null;
                const max = returnableQty(o, line.vid, products);
                const pick = picks[line.vid] ?? { qty: 0, reason: 'size' as ReturnReason };
                const name = l(f.product.name);
                const blocked = f.product.cat === 'perfume';
                return (
                  <li key={line.vid} className={cn('flex gap-4 py-4 first:pt-0 last:pb-0', !max && 'opacity-70')}>
                    <span className="w-16 shrink-0"><ProductPhoto p={f.product} color={f.variant.color} variant="thumb" /></span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div><p className="font-medium">{name}</p><p className="text-[13px] text-muted">{variantLabel(f.product, f.variant.color, f.variant.size, lang)} · <bdi>{m(line.unit)}</bdi> × {line.qty}</p></div>
                      {max === 0 ? <p className="text-[13px] text-muted">{blocked ? t.retNotAllowed : t.retDone}</p> : (
                        <div className="flex flex-wrap gap-3">
                          <label className="flex items-center gap-2 text-[13px]"><span className="text-muted">{t.qty}</span>
                            <Select className="h-10 w-20" aria-label={t.retQty(name)} value={pick.qty} onChange={(e) => setPicks((p) => ({ ...p, [line.vid]: { ...pick, qty: Number(e.target.value) } }))}>
                              {Array.from({ length: max + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                            </Select>
                          </label>
                          {pick.qty > 0 && (
                            <label className="flex min-w-0 items-center gap-2 text-[13px]"><span className="text-muted">{t.retReason}</span>
                              <Select className="h-10 w-auto min-w-0" value={pick.reason} onChange={(e) => setPicks((p) => ({ ...p, [line.vid]: { ...pick, reason: e.target.value as ReturnReason } }))}>
                                {REASONS.map((r) => <option key={r} value={r}>{t.reasons[r]}</option>)}
                              </Select>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {tried && !chosen.length && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{t.retPickOne}</p>}
          </section>

          <section aria-labelledby="sf-r-h2" className={cn(PANEL, 'space-y-4 p-5 sm:p-6')}>
            <h2 id="sf-r-h2" className={H3}>{t.retMethod}</h2>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">{t.retMethod}</legend>
              {(['pickup', 'dropoff'] as const).map((x) => (
                <label key={x} className={radioCard}><input type="radio" name="sf-r-m" className="size-[18px] accent-brand-600" checked={method === x} onChange={() => setMethod(x)} />{x === 'pickup' ? t.pickup : t.dropoff}</label>
              ))}
            </fieldset>
            <div className="text-sm"><p className="text-xs font-semibold text-muted">{t.refundTo}</p><p className="mt-1">{cod ? t.bank : `${t.original} · ${t.methods[o.pay.method]}`}</p></div>
            {cod && (
              <Field id="sf-r-iban" label={t.iban} error={tried && ibanErr ? t.eIban : null} hint={t.ibanHint}>
                {(p) => <Input {...p} dir="ltr" className="h-11" value={iban} placeholder="SA00 0000 0000 0000 0000 0000" onChange={(e) => setIban(e.target.value)} />}
              </Field>
            )}
          </section>

          <section aria-labelledby="sf-r-h3" className={cn(PANEL, 'space-y-4 p-5 sm:p-6')}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="sf-r-h3" className={H3}>{t.retEstimate}</h2>
              <Money v={estimate} className="text-2xl font-bold" />
            </div>
            <p className="text-[13px] text-muted">{t.retEstimateNote}</p>
            {tried && (ibanErr || !chosen.length) && <Alert tone="bad">{t.checkFields}</Alert>}
            <Button size="lg" className="w-full" onClick={review}>{t.retSubmit}</Button>
            <SimNote>{t.retSim}</SimNote>
          </section>
        </div>
      )}

      {confirm && (
        <Modal title={t.retConfirmT} description={t.retConfirmB(String(count), m(estimate))} onClose={close} footer={<>
          <Button variant="secondary" onClick={close}>{t.cancel}</Button>
          <Button onClick={submitReturn}>{t.retSubmit}</Button>
        </>}>
          <ul className="space-y-1.5 text-sm">{chosen.map((c) => { const f = variantById(products, c.vid); return <li key={c.vid}>{f && l(f.product.name)} × {c.qty} · <span className="text-muted">{t.reasons[c.reason]}</span></li>; })}</ul>
        </Modal>
      )}
    </div>
  );
}
