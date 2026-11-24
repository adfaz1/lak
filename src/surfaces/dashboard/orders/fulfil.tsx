// Fulfil an order: location → quantities → carrier and weight → review → one label. A carrier failure keeps every choice.
import { useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { levelsStore, ordersStore } from '../../merchant/stores';
import { fulfilEffects, stamp, takeHeld } from '../../merchant/ops';
import { CARRIERS, LOCATIONS, LOC_IDS, canFulfilPartial, isMultiLocation, parseWeight, remainingQty, validatePicks, type CarrierId, type LocId, type Order, type PickError } from '../../merchant/domain';
import { Alert, Field, Input, Modal, Simulated, Switch } from '../../../ds/kit';
import { Button, Money, ProductImage, Ref, cn, useTx } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { canShipFrom, estimatedCost, fulfil, initialPlan, labelRef, maxPicks, withLiveStock, withoutLiveStock, type FulfilPlan } from './model';
import { ChoiceCard, Qty, ReviewOnly, Row, applyEffects, saveOrder, useActor } from './ui';

type Step = 'form' | 'review' | 'done';

export function FulfilModal({ order, onClose }: { order: Order; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  // Read the live order so a second operation sees the first one's result.
  const base = ordersStore.use().find((x) => x.ref === order.ref) ?? order;
  // Every order can pick a location and split into parcels: lines get per-location stock from the inventory.
  const levels = levelsStore.use();
  const o = withLiveStock(base, levels, LOC_IDS);
  const who = useActor();
  const multi = isMultiLocation(o);
  const [step, setStep] = useState<Step>('form');
  const [plan, setPlan] = useState<FulfilPlan>(() => initialPlan(o));
  const [weightErr, setWeightErr] = useState(false);
  const [outage, setOutage] = useState(false);
  const [failures, setFailures] = useState(0);
  const [done, setDone] = useState<{ ref: string; units: number; carrier: CarrierId; loc: LocId } | null>(null);
  const set = (p: Partial<FulfilPlan>) => setPlan((x) => ({ ...x, ...p }));

  const v = multi ? validatePicks(o, plan.loc, plan.picks) : { lines: o.items.map(() => null as PickError | null), empty: false };
  const invalid = v.empty || v.lines.some(Boolean);
  const units = plan.picks.reduce((a, b) => a + (b || 0), 0);
  const left = o.items.reduce((s, _, i) => s + remainingQty(o, i), 0);
  const ref = labelRef(o);
  const lineErr = (e: PickError | null) => (e === 'exceedsStock' ? tx('أكثر من المتوفر هنا', 'More than this location has') : e === 'exceedsRemaining' ? tx('أكثر من المتبقي', 'More than remains') : e === 'negative' ? tx('رقم صحيح فقط', 'Whole numbers only') : null);

  const toReview = () => { if (parseWeight(plan.weight) === null) { setWeightErr(true); return; } setStep('review'); };
  const issue = () => {
    const r = fulfil(o, plan, outage);
    const now = Date.now();
    if (r.ok) {
      const fs = r.order.fulfilments.map((f, i) => (i === r.order.fulfilments.length - 1 ? { ...f, carrier: plan.carrier } : f));
      saveOrder(stamp(base, withoutLiveStock(base, takeHeld({ ...r.order, fulfilments: fs }, plan.loc, plan.picks)), who, now));
      applyEffects(fulfilEffects(base, plan.loc, plan.picks), who, base.ref, 'FL');
    } else saveOrder(stamp(base, withoutLiveStock(base, r.order), who, now));
    if (r.ok) { setDone({ ref: r.ref, units, carrier: plan.carrier, loc: plan.loc }); setStep('done'); setFailures(0); setOutage(false); }
    else { setFailures((n) => n + 1); setOutage(false); }
  };
  const again = () => { setPlan(initialPlan(o)); setDone(null); setStep('form'); };

  const title = step === 'done' ? tx('صدر الملصق', 'Label issued') : step === 'review' ? tx('راجع قبل الإصدار', 'Review before issuing') : o.ful === 'partial' ? tx('جهّز المتبقي', 'Fulfil remaining items') : tx(`جهّز الطلب #${o.ref}`, `Fulfil order #${o.ref}`);
  const footer = step === 'form' ? (
    <><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={invalid} onClick={toReview}>{tx('راجع', 'Review')}</Button></>
  ) : step === 'review' ? (
    <><Button variant="secondary" onClick={() => setStep('form')}>{tx('عدّل', 'Edit')}</Button><Button onClick={issue}>{failures ? tx('أعد المحاولة', 'Try again') : tx('أصدر الملصق', 'Issue label')}</Button></>
  ) : (
    <>
      {o.ful === 'partial' && canFulfilPartial(o) && <Button variant="secondary" onClick={again}>{tx('جهّز المتبقي', 'Fulfil remaining')}</Button>}
      <Button onClick={() => onClose(done ? tx(`صدر الملصق ${done.ref}`, `Label ${done.ref} issued`) : undefined)}>{tx('تم', 'Done')}</Button>
    </>
  );

  const stepNames = [tx('الموقع والكميات', 'Location & items'), tx('الناقل والوزن', 'Carrier & weight'), tx('المراجعة', 'Review')];
  const at = step === 'form' ? 0 : 2;

  return (
    <Modal size="lg" title={title} onClose={() => onClose(done ? tx(`صدر الملصق ${done.ref}`, `Label ${done.ref} issued`) : undefined)} footer={footer}>
      {step !== 'done' && (
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium" aria-label={tx('الخطوات', 'Steps')}>
          {stepNames.map((s, i) => {
            const cur = step === 'form' ? i < 2 : i === 2;
            return <li key={s} aria-current={cur ? 'step' : undefined} className={cn('flex items-center gap-1.5', cur ? 'text-fg' : 'text-subtle')}><span className={cn('grid size-5 place-items-center rounded-full text-[11px] tabular-nums', cur || i < at ? 'bg-brand-600 text-white' : 'bg-surface-2')}>{i + 1}</span>{s}</li>;
          })}
        </ol>
      )}

      {step === 'form' && (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('يُشحن من', 'Ship from')}</legend>
            {(multi ? LOC_IDS : (['ryd'] as LocId[])).map((l) => {
              const can = multi ? canShipFrom(o, l) : left;
              return (
                <ChoiceCard key={l} name="loc" checked={plan.loc === l} disabled={multi && can === 0} onChange={() => set({ loc: l, picks: multi ? maxPicks(o, l) : plan.picks })}
                  title={LOCATIONS[l][lang]} meta={!multi ? tx('كل القطع', 'All items') : can === 0 ? tx('لا مخزون لهذه الأسطر', 'No stock for these lines') : tx(`يمكنه شحن ${can} من ${left}`, `Can ship ${can} of ${left}`)} />
              );
            })}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('الكميات', 'Quantities')}</legend>
            <ul className="divide-y divide-border !rounded-xl !border !border-border">
              {o.items.map((it, i) => {
                const rem = remainingQty(o, i);
                const here = it.stock?.[plan.loc] ?? 0;
                const err = lineErr(v.lines[i]);
                return (
                  <li key={it.sku + i} className={cn('flex items-center gap-3 px-3 py-2.5', rem === 0 && 'opacity-50')}>
                    <ProductImage src={skuPhoto(it.sku)} alt={it.name[lang]} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">{it.name[lang]}</p>
                      <p className="text-xs text-muted">{rem === 0 ? tx('مجهّز بالكامل', 'Fully fulfilled') : multi ? tx(`متبقٍ ${rem} · متوفر هنا ${here}`, `${rem} remaining · ${here} here`) : tx(`${it.qty} في الطلب`, `${it.qty} ordered`)}</p>
                      {err && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{err}</p>}
                    </div>
                    {multi ? <Qty value={plan.picks[i] ?? 0} max={Math.min(rem, here)} disabled={rem === 0} invalid={!!err} label={tx(`كمية ${it.name.ar}`, `quantity of ${it.name.en}`)}
                      onChange={(n) => set({ picks: plan.picks.map((x, j) => (j === i ? n : x)) })} />
                      : <span className="text-sm font-semibold tabular-nums">× {it.qty}</span>}
                  </li>
                );
              })}
            </ul>
            {multi && v.empty && <p className="mt-1.5 text-xs text-muted">{tx('اختر كمية لسطر واحد على الأقل.', 'Choose a quantity for at least one line.')}</p>}
            {multi && !invalid && left - units > 0 && <p className="mt-1.5 text-xs text-muted">{tx(`يبقى ${left - units} لعملية لاحقة.`, `${left - units} left for a later operation.`)}</p>}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">{tx('الناقل', 'Carrier')}<Simulated /></legend>
            {(Object.keys(CARRIERS) as CarrierId[]).map((c) => (
              <ChoiceCard key={c} name="carrier" checked={plan.carrier === c} onChange={() => set({ carrier: c })} title={CARRIERS[c].name[lang]}
                meta={c === 'a' ? tx('2–4 أيام عمل', '2–4 working days') : tx('1–2 يوم عمل', '1–2 working days')}
                aside={<span className="text-end"><Money v={estimatedCost(c)} className="text-sm font-semibold text-fg" /><span className="block text-[11px] text-muted">{tx('تقديري', 'estimate')}</span></span>} />
            ))}
          </fieldset>

          <Field label={tx('وزن الطرد (كجم)', 'Parcel weight (kg)')} hint={tx('بين 0.1 و30', 'Between 0.1 and 30')} error={weightErr ? tx('أدخل وزنًا بين 0.1 و30 كجم', 'Enter 0.1 to 30 kg') : null} className="max-w-56">
            {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={plan.weight} onChange={(e) => { set({ weight: e.target.value }); setWeightErr(false); }} />}
          </Field>
        </>
      )}

      {step === 'review' && (
        <>
          {failures > 0 && (
            <Alert tone="bad" title={tx('الناقل لم يستجب، ولم يصدر ملصق', 'The carrier did not respond; no label was issued')}>
              {tx('لم يُحتسب شيء واختياراتك محفوظة. نعيد بالمرجع نفسه ', 'Nothing was charged and your choices are kept. Retrying uses the same reference ')}<Ref>{ref}</Ref>.
            </Alert>
          )}
          <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">
            <Row label={tx('من', 'From')}>{LOCATIONS[plan.loc][lang]}</Row>
            <Row label={tx('القطع', 'Items')}>
              <span className="flex flex-col items-end gap-1">{o.items.map((it, i) => (plan.picks[i] ? <span key={it.sku + i} className="flex items-center gap-2"><ProductImage src={skuPhoto(it.sku)} alt="" size={24} /><span className="text-fg">{it.name[lang]}</span><b className="tabular-nums">× {plan.picks[i]}</b></span> : null))}</span>
            </Row>
            <Row label={tx('الناقل', 'Carrier')}>{CARRIERS[plan.carrier].name[lang]}</Row>
            <Row label={tx('الوزن', 'Weight')}><bdi dir="ltr" className="tabular-nums">{plan.weight} kg</bdi></Row>
            <Row label={tx('مرجع الملصق', 'Label reference')}><Ref>{ref}</Ref></Row>
            <Row label={<span className="flex items-center gap-2">{tx('التكلفة التقديرية', 'Estimated cost')}<Simulated /></span>} strong><Money v={estimatedCost(plan.carrier)} /></Row>
          </dl>
          <p className="text-xs text-muted">{tx('تقدير من ناقل تجريبي شامل الضريبة. ملصق واحد لهذه العملية.', 'Test-carrier estimate, VAT included. One label for this operation.')}</p>
          <ReviewOnly>
            <label className="flex items-center justify-between gap-3 text-sm text-fg">
              <span>{tx('حاكِ انقطاع الناقل في المحاولة التالية', 'Simulate a carrier outage on the next attempt')}</span>
              <Switch checked={outage} onChange={setOutage} label={tx('انقطاع الناقل', 'Carrier outage')} />
            </label>
          </ReviewOnly>
        </>
      )}

      {step === 'done' && done && (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <CheckCircle2 className="size-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">{CARRIERS[done.carrier].name[lang]}</p>
              <p className="text-xs text-muted">{tx('المرجع', 'Reference')} <b className="text-fg"><Ref>{done.ref}</Ref></b> · {tx(`${done.units} قطع من ${LOCATIONS[done.loc].ar}`, `${done.units} ${done.units === 1 ? 'item' : 'items'} from ${LOCATIONS[done.loc].en}`)}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard?.writeText(done.ref).catch(() => undefined)}><Copy className="size-4" aria-hidden="true" />{tx('انسخ', 'Copy')}</Button>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {o.ful === 'partial' ? tx(`بقي ${left} يحتاج عملية أخرى. أُضيف إلى السجل.`, `${left} still need another operation. Added to the timeline.`) : tx('أُضيف إلى السجل. الملصق لا يعني استلام الناقل للطرد.', 'Added to the timeline. A label does not mean the carrier has collected it.')}
            <Simulated />
          </p>
        </>
      )}
    </Modal>
  );
}
