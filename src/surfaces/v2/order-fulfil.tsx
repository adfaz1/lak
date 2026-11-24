// Fulfil an order: location → quantities → carrier and weight → review → label. A carrier failure keeps every choice.
import { useState } from 'react';
import { useLang } from '../../core/lang';
import {
  CARRIERS, LOCATIONS, LOC_IDS, canFulfilPartial, fulfilPartial, isMultiLocation, issueLabel, nextFulfilmentRef, parseWeight, remainingQty, shipmentRef, validatePicks,
  type CarrierId, type LocId, type Order,
} from '../merchant/domain';
import { ordersStore } from '../merchant/stores';
import { Banner, Dialog, Icon, Money, Ref, Sim, Thumb, useTx } from './ui';
import { itemImage } from './data';
import { Qty, TestControl, saveOrder } from './orders-shared';

type Step = 'form' | 'review' | 'done';

export function FulfilDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const multi = isMultiLocation(order);
  // Re-read the live order so a second operation sees the first one's result.
  const o = ordersStore.use().find((x) => x.ref === order.ref) ?? order;
  const canShipFrom = (loc: LocId, from: Order = o) => from.items.reduce((s, it, i) => s + Math.min(remainingQty(from, i), it.stock?.[loc] ?? 0), 0);
  const bestLoc = (from: Order) => [...LOC_IDS].sort((a, b) => canShipFrom(b, from) - canShipFrom(a, from))[0];
  const maxPicks = (loc: LocId, from: Order = o) => from.items.map((it, i) => Math.min(remainingQty(from, i), it.stock?.[loc] ?? 0));

  const [step, setStep] = useState<Step>('form');
  const [loc, setLoc] = useState<LocId>(multi ? bestLoc(o) : 'ryd');
  const [picks, setPicks] = useState<number[]>(multi ? maxPicks(bestLoc(o)) : o.items.map((it) => it.qty));
  const [carrier, setCarrier] = useState<CarrierId>('a');
  const [weight, setWeight] = useState('1.2');
  const [weightErr, setWeightErr] = useState(false);
  const [outage, setOutage] = useState(false);
  const [failed, setFailed] = useState(0);
  const [doneRef, setDoneRef] = useState<string | null>(null);

  const v = multi ? validatePicks(o, loc, picks) : { lines: o.items.map(() => null), empty: false };
  const invalid = v.lines.some(Boolean) || v.empty;
  const nUnits = picks.reduce((a, b) => a + (b || 0), 0);
  const ref = multi ? nextFulfilmentRef(o) : shipmentRef(o);
  const lineErr = (e: (typeof v.lines)[number]) => e === 'exceedsStock' ? tx('أكثر من المتوفر هنا', 'More than this location has') : e === 'exceedsRemaining' ? tx('أكثر من المتبقي', 'More than remains') : e === 'negative' ? tx('رقم صحيح فقط', 'Whole numbers only') : '';
  const remainingAfter = o.items.reduce((s, _, i) => s + remainingQty(o, i), 0) - nUnits;

  const toReview = () => {
    if (parseWeight(weight) === null) { setWeightErr(true); return; }
    setWeightErr(false); setStep('review');
  };
  const issue = () => {
    const before = o;
    let next = multi ? fulfilPartial(before, loc, picks, outage) : issueLabel(before, carrier, outage);
    const ok = multi ? next.fulfilments.length > before.fulfilments.length : next.ship === 'label' && before.ship !== 'label';
    if (ok && multi) next = { ...next, log: next.log.map((e, i) => (i === next.log.length - 1 ? { ...e, carrier } : e)) };
    saveOrder(next);
    if (ok) { setDoneRef(ref); setStep('done'); setFailed(0); } else { setFailed((n) => n + 1); setOutage(false); }
  };
  const again = () => {
    const l = bestLoc(o);
    setLoc(l); setPicks(maxPicks(l)); setStep('form'); setDoneRef(null);
  };

  const title = step === 'done' ? tx('صدر الملصق', 'Label issued') : step === 'review' ? tx('راجع قبل الإصدار', 'Review before issuing') : multi && o.ful === 'partial' ? tx('جهّز المتبقي', 'Fulfil remaining items') : tx(`جهّز الطلب \u2066#${o.ref}\u2069`, `Fulfil order #${o.ref}`);
  const steps = [tx('الموقع والكميات', 'Location & items'), tx('الناقل', 'Carrier'), tx('المراجعة', 'Review')];
  const at = step === 'form' ? 0 : step === 'review' ? 2 : 3;

  const footer = step === 'form' ? (
    <>
      <button type="button" className="lk-btn" onClick={onClose}>{tx('إلغاء', 'Cancel')}</button>
      <button type="button" className="lk-btn primary" disabled={invalid} onClick={toReview}>{tx('راجع', 'Review')}</button>
    </>
  ) : step === 'review' ? (
    <>
      <button type="button" className="lk-btn" onClick={() => setStep('form')}>{tx('عدّل', 'Edit')}</button>
      <button type="button" className="lk-btn primary" onClick={issue}>{failed ? <>{tx('أعد المحاولة', 'Try again')}</> : <>{tx('أصدر الملصق', 'Issue label')}</>}</button>
    </>
  ) : (
    <>
      {o.ful === 'partial' && canFulfilPartial(o) && <button type="button" className="lk-btn" onClick={again}>{tx('جهّز المتبقي', 'Fulfil remaining')}</button>}
      <button type="button" className="lk-btn primary" onClick={onClose}>{tx('تم', 'Done')}</button>
    </>
  );

  return (
    <Dialog wide title={title} onClose={onClose} footer={footer}>
      {step !== 'done' && (
        <ol className="ord-steps" aria-label={tx('الخطوات', 'Steps')}>
          {steps.map((s, i) => <li key={s} aria-current={(step === 'form' && i < 2) || (step === 'review' && i === 2) ? 'step' : undefined} className={i < at && !(step === 'form') ? 'done' : ''}><span className="lk-num">{i + 1}</span>{s}</li>)}
        </ol>
      )}

      {step === 'form' && (
        <>
          <fieldset className="ord-fs">
            <legend className="lk-label">{tx('من أين يُشحن؟', 'Ship from')}</legend>
            <div className="ord-opts">
              {(multi ? LOC_IDS : (['ryd'] as LocId[])).map((l) => {
                const can = multi ? canShipFrom(l) : o.items.reduce((s, it) => s + it.qty, 0);
                const need = o.items.reduce((s, _, i) => s + remainingQty(o, i), 0) || o.items.reduce((s, it) => s + it.qty, 0);
                return (
                  <label key={l} className={`ord-opt${loc === l ? ' on' : ''}${multi && can === 0 ? ' dim' : ''}`}>
                    <input type="radio" name="loc" checked={loc === l} disabled={multi && can === 0} onChange={() => { setLoc(l); setPicks(maxPicks(l)); }} />
                    <span className="lk-col lk-grow"><span className="lk-strong">{LOCATIONS[l][lang]}</span>
                      <span className="lk-micro lk-3">{multi ? (can === 0 ? tx('لا مخزون لهذه الأسطر', 'No stock for these lines') : tx(`يمكنه شحن ${can} من ${need} قطع`, `Can ship ${can} of ${need} items`)) : tx('كل القطع', 'All items')}</span></span>
                    {multi && can === need && <span className="lk-pill ok">{tx('الكل', 'All')}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="ord-fs">
            <legend className="lk-label">{tx('الكميات', 'Quantities')}</legend>
            <ul className="ord-picks">
              {o.items.map((it, i) => {
                const rem = remainingQty(o, i);
                const here = it.stock?.[loc] ?? 0;
                return (
                  <li key={it.sku + i} className={rem === 0 ? 'dim' : undefined}>
                    <Thumb src={itemImage(it)} alt={it.name[lang]} />
                    <div className="lk-col lk-grow" style={{ minWidth: 0 }}>
                      <span className="lk-small lk-strong lk-truncate">{it.name[lang]}</span>
                      <span className="lk-micro lk-3">{rem === 0 ? tx('مجهّز بالكامل', 'Fully fulfilled') : multi ? tx(`متبقٍ ${rem} · متوفر هنا ${here}`, `${rem} remaining · ${here} here`) : tx(`${it.qty} في الطلب`, `${it.qty} ordered`)}</span>
                      {v.lines[i] && <span className="lk-error" role="alert"><Icon name="alert" size="xs" />{lineErr(v.lines[i])}</span>}
                    </div>
                    {multi
                      ? <Qty value={picks[i]} max={Math.min(rem, here)} disabled={rem === 0} invalid={!!v.lines[i]} label={tx(`كمية ${it.name.ar}`, `quantity of ${it.name.en}`)} onChange={(n) => { const p = [...picks]; p[i] = n; setPicks(p); }} />
                      : <span className="lk-num lk-strong">× {it.qty}</span>}
                  </li>
                );
              })}
            </ul>
            {multi && v.empty && <p className="lk-help">{tx('اختر كمية لسطر واحد على الأقل.', 'Choose a quantity for at least one line.')}</p>}
            {multi && !invalid && remainingAfter > 0 && <p className="lk-help">{tx(`سيبقى ${remainingAfter} قطع لعملية لاحقة من موقع آخر.`, `${remainingAfter} ${remainingAfter === 1 ? 'item stays' : 'items stay'} for a later operation from another location.`)}</p>}
          </fieldset>

          <fieldset className="ord-fs">
            <legend className="lk-label">{tx('الناقل', 'Carrier')} <Sim /></legend>
            <div className="ord-opts">
              {(Object.keys(CARRIERS) as CarrierId[]).map((c) => (
                <label key={c} className={`ord-opt${carrier === c ? ' on' : ''}`}>
                  <input type="radio" name="carrier" checked={carrier === c} onChange={() => setCarrier(c)} />
                  <span className="lk-col lk-grow"><span className="lk-strong">{CARRIERS[c].name[lang]}</span><span className="lk-micro lk-3">{c === 'a' ? tx('تسليم خلال 2–4 أيام عمل', 'Delivery in 2–4 working days') : tx('تسليم خلال 1–2 يوم عمل', 'Delivery in 1–2 working days')}</span></span>
                  <span className="lk-col" style={{ alignItems: 'flex-end' }}><Money v={CARRIERS[c].price} strong /><span className="lk-micro lk-3">{tx('تقديري', 'estimate')}</span></span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="lk-field" style={{ maxWidth: 220 }}>
            <span className="lk-label">{tx('وزن الطرد', 'Parcel weight')}</span>
            <span className="lk-affix"><input className="lk-input ltr has-suffix" inputMode="decimal" value={weight} aria-invalid={weightErr || undefined} onChange={(e) => { setWeight(e.target.value); setWeightErr(false); }} /><span className="lk-suffix">{tx('كجم', 'kg')}</span></span>
            {weightErr ? <span className="lk-error" role="alert"><Icon name="alert" size="xs" />{tx('أدخل وزنًا بين 0.1 و30 كجم.', 'Enter a weight between 0.1 and 30 kg.')}</span> : <span className="lk-help">{tx('بين 0.1 و30 كجم', 'Between 0.1 and 30 kg')}</span>}
          </label>
        </>
      )}

      {step === 'review' && (
        <>
          {failed > 0 && (
            <Banner tone="bad" title={tx('الناقل لم يستجب — لم يصدر ملصق', 'The carrier did not respond — no label was issued')}>
              {tx('لم يُحتسب أي مبلغ، واختياراتك محفوظة. نعيد المحاولة بالمرجع نفسه ', 'Nothing was charged and your choices are kept. Retrying uses the same reference ')}<Ref>{ref}</Ref>{tx('، فلا يمكن أن يصدر ملصقان.', ', so two labels can never be issued.')}
            </Banner>
          )}
          <dl className="ord-review">
            <div><dt>{tx('من', 'From')}</dt><dd>{LOCATIONS[loc][lang]}</dd></div>
            <div><dt>{tx('القطع', 'Items')}</dt><dd>
              {o.items.map((it, i) => picks[i] ? <span key={it.sku} className="ord-review-line"><Thumb src={itemImage(it)} alt="" /><span className="lk-small">{it.name[lang]}</span><b className="lk-num">× {picks[i]}</b></span> : null)}
            </dd></div>
            <div><dt>{tx('الناقل', 'Carrier')}</dt><dd>{CARRIERS[carrier].name[lang]}</dd></div>
            <div><dt>{tx('الوزن', 'Weight')}</dt><dd className="lk-num">{weight} {tx('كجم', 'kg')}</dd></div>
            <div><dt>{tx('مرجع الملصق', 'Label reference')}</dt><dd><Ref>{ref}</Ref></dd></div>
            <div className="sum"><dt>{tx('التكلفة التقديرية', 'Estimated cost')}</dt><dd><Money v={CARRIERS[carrier].price} strong /> <Sim /></dd></div>
          </dl>
          <p className="lk-help">{tx('تقدير من ناقل تجريبي شامل الضريبة؛ ليس سعرًا حقيقيًا. يصدر ملصق واحد لهذه العملية.', 'An estimate from a test carrier, VAT included; not a real price. One label is issued for this operation.')}</p>
          <TestControl>
            <label className="ord-switch-row"><input type="checkbox" className="lk-switch" checked={outage} onChange={(e) => setOutage(e.target.checked)} />{tx('حاكِ انقطاع الناقل في المحاولة القادمة', 'Simulate a carrier outage on the next attempt')}</label>
          </TestControl>
        </>
      )}

      {step === 'done' && doneRef && (
        <>
          <div className="ord-success">
            <span className="ord-success-ic"><Icon name="check" /></span>
            <div className="lk-col" style={{ gap: 2 }}>
              <span className="lk-h2">{tx(`ملصق ${CARRIERS[carrier].name.ar}`, `${CARRIERS[carrier].name.en} label`)}</span>
              <span className="lk-small lk-2">{tx('المرجع', 'Reference')} <b><Ref>{doneRef}</Ref></b> · {tx(`${nUnits} قطع من ${LOCATIONS[loc].ar}`, `${nUnits} ${nUnits === 1 ? 'item' : 'items'} from ${LOCATIONS[loc].en}`)}</span>
            </div>
            <button type="button" className="lk-btn sm" onClick={() => void navigator.clipboard?.writeText(doneRef).catch(() => undefined)}>{tx('انسخ', 'Copy')}</button>
          </div>
          <p className="lk-small lk-2">{o.ful === 'partial'
            ? tx(`بقيت ${o.items.reduce((s, _, i) => s + remainingQty(o, i), 0)} قطع تحتاج عملية من موقع آخر. أُضيف الملصق إلى السجل.`, `${o.items.reduce((s, _, i) => s + remainingQty(o, i), 0)} items still need an operation from another location. The label was added to the timeline.`)
            : tx('أُضيف الملصق إلى السجل. صدور الملصق لا يعني استلام الناقل للطرد.', 'The label was added to the timeline. An issued label does not mean the carrier has collected the parcel.')} <Sim /></p>
          <p className="lk-micro lk-3">{tx('التكلفة التقديرية', 'Estimated cost')} <Money v={CARRIERS[carrier].price} /></p>
        </>
      )}
    </Dialog>
  );
}
