import { useState } from 'react';
import { useLang } from '../../core/lang';
import type { Route } from '../../core/router';
import { Alert, Badge, Dialog, Field, Sim } from '../../core/ui';
import {
  CARRIERS, LOCATIONS, LOC_IDS, VIEW_IDS, canFulfil, canFulfilPartial, canRefund, formatMoney, fulfilPartial, fulfilledQty, isMultiLocation,
  issueLabel, nextFulfilmentRef, parseWeight, refundQuote, refundable, refundedQty, refundedTotal, remainingQty, requestRefund, settleRefund,
  shipmentRef, shippingRefunded, subtotal, total, units, validatePicks, vatIncluded,
  type CarrierId, type LocId, type Order, type View,
} from './domain';
import { refundTx } from './finance';
import { can } from './perms';
import { financeStore, levelsStore, ordersStore, stockLogStore, testStore } from './stores';
import { strings, type Strings } from './i18n';
import { ActionLocked, KV, Money, mhref, useL, useTx } from './kit';
import { FUL_TONE, PAY_TONE, SHIP_TONE, useChannelName } from './orders';

type Step = 'idle' | 'form' | 'review' | 'done';

export function OrderDetail({ route }: { route: Route }) {
  const { lang } = useLang();
  const t = strings[lang];
  const tx = useTx();
  const l = useL();
  const chName = useChannelName();
  const orders = ordersStore.use();
  const role = testStore.use().role;
  const ref = route.path[1];
  const order = orders.find((o) => o.ref === ref);
  const v = route.query.get('view') as View | null;
  const view: View = v && VIEW_IDS.includes(v) ? v : 'all';
  const backQ = { view: view !== 'all' ? view : undefined, q: route.query.get('q') ?? undefined, ch: route.query.get('ch') ?? undefined, page: route.query.get('page') ?? undefined };
  const back = <a className="back" href={mhref('orders', backQ)}>{lang === 'ar' ? '→' : '←'} {t.back(t.views[view])}</a>;
  const [refunding, setRefunding] = useState(false);

  if (!order) return <>{back}<Alert tone="danger">{t.notFound}</Alert></>;
  const save = (next: Order) => ordersStore.set((all) => all.map((o) => (o.ref === next.ref ? next : o)));
  const pending = order.refunds.filter((r) => r.status === 'pending');
  const multi = isMultiLocation(order);

  return (
    <>
      {back}
      <div className="title-row">
        <h1>{t.order} <bdi dir="ltr">#{order.ref}</bdi></h1>
        <span className="pill">{t.cPay}: <Badge tone={PAY_TONE[order.pay]}>{t.pay[order.pay]}</Badge></span>
        <span className="pill">{t.cFul}: <Badge tone={FUL_TONE[order.ful]}>{t.ful[order.ful]}</Badge></span>
        <span className="pill">{t.cShip}: <Badge tone={SHIP_TONE[order.ship]}>{t.ship[order.ship]}</Badge></span>
        {order.refunds.length > 0 && <span className="pill">{tx('الاسترداد', 'Refund')}: <Badge tone={pending.length ? 'warning' : 'neutral'}>{pending.length ? tx('بانتظار المزود', 'Awaiting provider') : tx('مُعالج', 'Processed')}</Badge></span>}
      </div>
      <p className="muted small">{tx('القناة', 'Channel')}: {chName(order.channel)} · {t.age(order.hoursAgo)} · {order.confirmed ? tx('مؤكد', 'Confirmed') : tx('غير مؤكد بعد', 'Not confirmed yet')}</p>
      <div className="cols">
        <div className="col-main">
          <section className="card pad" aria-labelledby="next-h">
            <h2 id="next-h">{t.next}</h2>
            {!can(role, 'order.fulfil') && canFulfilPartial(order)
              ? <ActionLocked>{tx('دورك لا يشمل تجهيز الطلبات. يمكنك قراءة التفاصيل فقط.', 'Your role does not include fulfilling orders. You can read the details only.')}</ActionLocked>
              : multi ? <PartialFulfil key={order.ref + order.fulfilments.length} order={order} onChange={save} t={t} /> : <LabelFlow key={order.ref} order={order} onChange={save} t={t} />}
          </section>

          <section className="card pad" aria-labelledby="items-h">
            <h2 id="items-h">{t.items}</h2>
            <ul className="lines">
              {order.items.map((i, idx) => (
                <li key={i.sku + idx}>
                  <span className="grow">{l(i.name)}<span className="muted small"> · <bdi dir="ltr">{i.sku}</bdi></span>
                    {(fulfilledQty(order, idx) > 0 || refundedQty(order, idx) > 0) && <span className="small muted"><br />{tx(`مجهّز ${fulfilledQty(order, idx)} من ${i.qty}`, `${fulfilledQty(order, idx)} of ${i.qty} fulfilled`)}{refundedQty(order, idx) ? tx(` · مسترد ${refundedQty(order, idx)}`, ` · ${refundedQty(order, idx)} refunded`) : ''}</span>}
                  </span>
                  <span className="muted">× {i.qty}</span><span className="strong amount"><Money v={i.qty * i.unit} /></span>
                </li>
              ))}
            </ul>
          </section>

          {order.fulfilments.length > 0 && (
            <section className="card pad" aria-labelledby="ship-h">
              <h2 id="ship-h">{tx('الطرود والشحنات', 'Parcels and shipments')}</h2>
              <ul className="lines">
                {order.fulfilments.map((f) => (
                  <li key={f.ref}><span className="grow"><bdi dir="ltr">{f.ref}</bdi> · {l(LOCATIONS[f.loc])}</span><span>{tx(`${f.qty.reduce((a, b) => a + b, 0)} قطعة`, `${f.qty.reduce((a, b) => a + b, 0)} item(s)`)}</span><Badge tone="info">{t.ship.label}</Badge></li>
                ))}
              </ul>
              <p className="small muted">{tx('صدور الملصق لا يعني استلام الناقل للطرد.', 'An issued label does not mean the carrier has collected the parcel.')}</p>
            </section>
          )}

          {order.refunds.length > 0 && (
            <section className="card pad" aria-labelledby="ref-h">
              <h2 id="ref-h">{tx('الاستردادات', 'Refunds')}</h2>
              <ul className="lines">
                {order.refunds.map((r) => (
                  <li key={r.id}>
                    <span className="grow"><bdi dir="ltr">{r.id}</bdi> · {r.reason}{r.restock.some(Boolean) && <span className="small muted"> · {tx(`أُعيد ${r.restock.reduce((a, b) => a + b, 0)} للمخزون`, `${r.restock.reduce((a, b) => a + b, 0)} restocked`)}</span>}</span>
                    <Badge tone={r.status === 'pending' ? 'warning' : r.status === 'confirmed' ? 'success' : 'danger'}>
                      {r.status === 'pending' ? tx('بانتظار تأكيد المزود', 'Awaiting provider') : r.status === 'confirmed' ? tx('أكده المزود', 'Confirmed by provider') : tx('رفضه المزود', 'Declined by provider')}
                    </Badge>
                    <span className="strong amount"><Money v={r.amount} /></span>
                  </li>
                ))}
              </ul>
              {pending.map((r) => (
                <div key={r.id} className="m-simtools">
                  <span className="small muted">{tx(`أداة اختبار لـ ${r.id}:`, `Test tool for ${r.id}:`)}</span>
                  <button type="button" className="btn small" onClick={() => settle(order, r.id, true, save)}>{tx('حاكِ تأكيد المزود', 'Simulate provider confirmation')}</button>
                  <button type="button" className="btn small" onClick={() => settle(order, r.id, false, save)}>{tx('حاكِ رفض المزود', 'Simulate provider decline')}</button>
                </div>
              ))}
              {pending.length > 0 && <p className="small muted">{tx('لا نقول «وصل المبلغ» قبل تأكيد المزود. حالة الدفع تتغير بعد التأكيد فقط.', 'We never say “refunded” before the provider confirms. The payment state changes only after confirmation.')}</p>}
            </section>
          )}

          <section className="card pad" aria-labelledby="log-h">
            <h2 id="log-h">{t.activity}</h2>
            <ol className="log">
              {order.log.map((e, n) => (
                <li key={n}><span className="muted when">{e.when === 'now' ? t.whenNow : t.whenEarlier} · {e.who === 'you' ? t.whoYou : t.whoSystem}</span><span className="grow">{t.log(e, e.carrier ? CARRIERS[e.carrier].name[lang] : '')}</span></li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="col-side">
          <section className="card pad" aria-labelledby="cust-h">
            <h2 id="cust-h">{t.customer}</h2>
            <div className="strong">{l(order.customer)}</div>
            <div className="muted">{l(order.city)}</div>
          </section>
          <section className="card pad" aria-labelledby="amt-h">
            <h2 id="amt-h">{t.amount}</h2>
            <dl className="breakdown">
              <div><dt>{t.sub}</dt><dd><Money v={subtotal(order)} /></dd></div>
              <div><dt>{t.fee}</dt><dd><Money v={order.fee} /></dd></div>
              <div className="sum"><dt>{t.total}</dt><dd><Money v={total(order)} /></dd></div>
              <div className="muted small"><dt>{t.vat}</dt><dd><Money v={vatIncluded(order)} /></dd></div>
              {refundedTotal(order) > 0 && <div><dt>{tx('استردادات مطلوبة أو مؤكدة', 'Refunds requested or confirmed')}</dt><dd>−<Money v={refundedTotal(order)} /></dd></div>}
              {order.pay !== 'failed' && <div className="strong"><dt>{tx('المتاح للاسترداد', 'Available to refund')}</dt><dd><Money v={refundable(order)} /></dd></div>}
            </dl>
            {order.settled && <p className="small muted">{tx('دخل هذا الطلب في تحويل بنكي أُرسل. أي استرداد يُخصم من التحويل القادم ويظهر في كشفه.', 'This order was included in a payout already sent. Any refund is deducted from the next payout and shows on its statement.')}</p>}
            {canRefund(order) && (can(role, 'order.refund')
              ? !refunding && <button type="button" className="btn" onClick={() => setRefunding(true)}>{tx('استرداد أو مرتجع', 'Refund or return')}</button>
              : <ActionLocked>{tx('الاسترداد يتطلب دور المالك أو المسؤول المالي.', 'Refunds need the Owner or Finance role.')}</ActionLocked>)}
          </section>
          {refunding && <RefundFlow order={order} onDone={(next) => { save(next); setRefunding(false); }} onCancel={() => setRefunding(false)} />}
        </aside>
      </div>
    </>
  );
}

function settle(order: Order, id: string, ok: boolean, save: (o: Order) => void) {
  const next = settleRefund(order, id, ok);
  save(next);
  const r = next.refunds.find((x) => x.id === id)!;
  financeStore.set((f) => ({
    ...f,
    txs: ok ? f.txs.map((tx) => (tx.id === `TX-${id}` ? { ...refundTx(next, r, tx.id, 'PO-2611-04', true) } : tx)) : f.txs.filter((tx) => tx.id !== `TX-${id}`),
  }));
}

function LabelFlow({ order, onChange, t }: { order: Order; onChange: (o: Order) => void; t: Strings }) {
  const { lang } = useLang();
  const [step, setStep] = useState<Step>('idle');
  const [carrier, setCarrier] = useState<CarrierId>('a');
  const [weight, setWeight] = useState('1.0');
  const [weightErr, setWeightErr] = useState(false);
  const [simFail, setSimFail] = useState(false);
  const [failed, setFailed] = useState(false);
  const eligible = canFulfil(order);
  const ref = shipmentRef(order);
  const c = CARRIERS[carrier];
  const issue = () => {
    const next = issueLabel(order, carrier, simFail);
    onChange(next);
    if (next.ship === 'label') { setFailed(false); setStep('done'); } else { setFailed(true); setSimFail(false); }
  };
  const toReview = () => { if (parseWeight(weight) === null) setWeightErr(true); else { setWeightErr(false); setStep('review'); } };
  return (
    <>
      <p>{order.pay === 'failed' ? t.nextPayFailed : eligible ? t.nextReady : t.nextNone}</p>
      {eligible && step === 'idle' && <button type="button" className="btn primary" onClick={() => setStep('form')}>{t.start}</button>}
      {eligible && step === 'form' && (
        <div className="flow">
          <fieldset>
            <legend>{t.carrier}</legend>
            {(Object.keys(CARRIERS) as CarrierId[]).map((id) => (
              <label key={id} className="radio">
                <input type="radio" name="carrier" checked={carrier === id} onChange={() => setCarrier(id)} />
                <span className="grow strong">{CARRIERS[id].name[lang]}</span>
                <span><Money v={CARRIERS[id].price} /> · {t.estimated}</span>
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="weight">{t.weight}</label>
            <input id="weight" className="input" inputMode="decimal" dir="ltr" value={weight} aria-invalid={weightErr} aria-describedby={weightErr ? 'weight-err' : undefined}
              onChange={(e) => { setWeight(e.target.value); setWeightErr(false); }} />
            {weightErr && <span id="weight-err" className="error" role="alert">{t.weightErr}</span>}
          </div>
          <div className="actions">
            <button type="button" className="btn primary" onClick={toReview}>{t.review}</button>
            <button type="button" className="btn" onClick={() => { setStep('idle'); setFailed(false); }}>{t.cancel}</button>
          </div>
        </div>
      )}
      {eligible && step === 'review' && (
        <div className="flow">
          <p>{t.reviewText(units(order), c.name[lang], weight, formatMoney(c.price))}</p>
          {failed && <div className="alert" role="alert"><b>{t.failTitle}</b> {t.failBody} <bdi dir="ltr">{ref}</bdi></div>}
          <label className="check"><input type="checkbox" checked={simFail} onChange={(e) => setSimFail(e.target.checked)} /> {t.simFail}</label>
          <div className="actions">
            <button type="button" className="btn primary" onClick={issue}>{failed ? t.retry : t.issue}</button>
            <button type="button" className="btn" onClick={() => setStep('form')}>{t.edit}</button>
          </div>
        </div>
      )}
      {step === 'done' && (
        <div className="flow" role="status">
          <p><b>{t.doneTitle}</b> {t.doneBody} <bdi dir="ltr">{ref}</bdi></p>
          <a className="btn" href={mhref('')}>{t.toHome}</a>
        </div>
      )}
    </>
  );
}

/** Partial fulfilment from one location at a time (QA03). */
function PartialFulfil({ order, onChange, t }: { order: Order; onChange: (o: Order) => void; t: Strings }) {
  const tx = useTx();
  const l = useL();
  const [loc, setLoc] = useState<LocId>('ryd');
  const [picks, setPicks] = useState<string[]>(order.items.map(() => '0'));
  const [simFail, setSimFail] = useState(false);
  const [failed, setFailed] = useState(false);
  const [review, setReview] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (!canFulfilPartial(order)) {
    return <p>{order.pay === 'failed' ? t.nextPayFailed : t.nextNone}</p>;
  }
  const nums = picks.map((p) => (p.trim() === '' ? 0 : Number(p)));
  const v = validatePicks(order, loc, nums);
  const invalid = v.lines.some(Boolean);
  const err = (e: (typeof v.lines)[number]) => e === 'exceedsStock' ? tx('أكثر من المتوفر في هذا الموقع', 'More than this location has') : e === 'exceedsRemaining' ? tx('أكثر من المتبقي في الطلب', 'More than remains on the order') : e === 'negative' ? tx('أدخل رقمًا صحيحًا', 'Enter a whole number') : '';
  const ref = nextFulfilmentRef(order);
  const issue = () => {
    const next = fulfilPartial(order, loc, nums, simFail);
    onChange(next);
    if (next.fulfilments.length > order.fulfilments.length) { setDone(ref); setFailed(false); setReview(false); }
    else { setFailed(true); setSimFail(false); }
  };
  const fillMax = () => setPicks(order.items.map((it, i) => String(Math.min(remainingQty(order, i), it.stock?.[loc] ?? 0))));
  return (
    <div className="flow">
      <p>{tx('هذا الطلب موزع على مستودعين. جهّز من موقع واحد في كل عملية؛ يصدر ملصق واحد لكل عملية.', 'This order is split across two warehouses. Fulfil from one location per operation; one label is issued per operation.')}</p>
      {done && <Alert tone="success" title={tx('صدر ملصق (محاكاة).', 'Label issued (simulated).')}>{tx('المرجع', 'Reference')} <bdi dir="ltr">{done}</bdi>. {order.ful === 'partial' ? tx('بقيت أسطر لم تُجهّز.', 'Some lines remain unfulfilled.') : ''}</Alert>}
      <fieldset>
        <legend>{tx('موقع التجهيز', 'Fulfilment location')}</legend>
        <div className="m-inline-radios">
          {LOC_IDS.map((x) => <label key={x} className="radio"><input type="radio" name="loc" checked={loc === x} onChange={() => { setLoc(x); setReview(false); }} /> <span className="strong">{l(LOCATIONS[x])}</span></label>)}
        </div>
      </fieldset>
      <div className="table-wrap">
        <table className="m-compact">
          <caption className="sr">{tx('الكميات لكل سطر', 'Quantities per line')}</caption>
          <thead><tr><th scope="col">{tx('المنتج', 'Item')}</th><th scope="col" className="end">{tx('المتبقي', 'Remaining')}</th><th scope="col" className="end">{tx('متوفر هنا', 'Here')}</th><th scope="col">{tx('جهّز الآن', 'Fulfil now')}</th></tr></thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={it.sku}>
                <td>{l(it.name)}</td>
                <td className="end"><bdi>{remainingQty(order, i)}</bdi></td>
                <td className="end"><bdi>{it.stock?.[loc] ?? 0}</bdi></td>
                <td>
                  <input className="input m-qty" inputMode="numeric" dir="ltr" value={picks[i]} aria-label={tx(`كمية ${it.name.ar}`, `Quantity for ${it.name.en}`)} aria-invalid={!!v.lines[i]}
                    disabled={remainingQty(order, i) === 0} onChange={(e) => { const n = [...picks]; n[i] = e.target.value; setPicks(n); setReview(false); }} />
                  {v.lines[i] && <span className="error" role="alert">{err(v.lines[i])}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={fillMax}>{tx('املأ أقصى المتاح من هذا الموقع', 'Fill the most this location can ship')}</button>
        <button type="button" className="btn primary" disabled={invalid || v.empty} onClick={() => setReview(true)}>{t.review}</button>
      </div>
      {v.empty && !invalid && <p className="small muted">{tx('اختر كمية لسطر واحد على الأقل.', 'Pick a quantity for at least one line.')}</p>}
      {review && !invalid && !v.empty && (
        <div className="flow">
          <p>{tx(`سيصدر ملصق واحد (${ref}) لـ ${nums.reduce((a, b) => a + b, 0)} قطعة من ${LOCATIONS[loc].ar}. الناقل التجريبي أ، تكلفة تقديرية 25.00 ر.س.`, `One label (${ref}) will be issued for ${nums.reduce((a, b) => a + b, 0)} item(s) from the ${LOCATIONS[loc].en}. Test carrier A, estimated SAR 25.00.`)}</p>
          {failed && <div className="alert" role="alert"><b>{t.failTitle}</b> {t.failBody} <bdi dir="ltr">{ref}</bdi></div>}
          <label className="check"><input type="checkbox" checked={simFail} onChange={(e) => setSimFail(e.target.checked)} /> {t.simFail}</label>
          <div className="actions"><button type="button" className="btn primary" onClick={issue}>{failed ? t.retry : t.issue}</button></div>
        </div>
      )}
    </div>
  );
}

/** Refund and return (QA06). Money back and restocking are two separate decisions. */
function RefundFlow({ order, onDone, onCancel }: { order: Order; onDone: (o: Order) => void; onCancel: () => void }) {
  const tx = useTx();
  const l = useL();
  const [qty, setQty] = useState<string[]>(order.items.map(() => '0'));
  const [restock, setRestock] = useState<string[]>(order.items.map(() => '0'));
  const [ship, setShip] = useState(false);
  const [loc, setLoc] = useState<LocId>('ryd');
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const n = (s: string) => (s.trim() === '' ? 0 : Number(s));
  const q = refundQuote(order, qty.map(n), ship, restock.map(n));
  const restockUnits = restock.map(n).reduce((a, b) => a + (b || 0), 0);
  const submit = () => {
    const next = requestRefund(order, qty.map(n), ship, restock.map(n), loc, reason.trim());
    if (next === order) return;
    const r = next.refunds[next.refunds.length - 1];
    financeStore.set((f) => ({ ...f, txs: [...f.txs, refundTx(next, r, `TX-${r.id}`, undefined, false)] }));
    if (restockUnits) {
      order.items.forEach((it, i) => {
        const u = r.restock[i];
        if (!u) return;
        levelsStore.set((ls) => ls.map((x) => (x.sku === it.sku && x.loc === loc ? { ...x, onHand: x.onHand + u, version: x.version + 1 } : x)));
        const lv = levelsStore.get().find((x) => x.sku === it.sku && x.loc === loc);
        stockLogStore.set((lg) => [{ id: `RS-${r.id}-${i}`, sku: it.sku, loc, delta: u, before: (lv?.onHand ?? u) - u, after: lv?.onHand ?? u, reason: 'returned', who: 'You', ref: r.id }, ...lg]);
      });
    }
    onDone(next);
  };
  const errText = q.error === 'qty' ? tx('كمية أكبر من القابل للاسترداد في سطر.', 'A line quantity exceeds what can be refunded.')
    : q.error === 'restock' ? tx('لا يمكن إعادة للمخزون أكثر من الكمية المستردة.', 'You cannot restock more than the refunded quantity.')
      : q.error === 'exceeds' ? tx('المبلغ يتجاوز المتاح للاسترداد.', 'The amount exceeds what is available to refund.') : null;
  return (
    <section className="card pad" aria-labelledby="rf-h">
      <h2 id="rf-h">{tx('استرداد أو مرتجع', 'Refund or return')}</h2>
      <p className="small">{tx('المتاح للاسترداد', 'Available to refund')}: <span className="strong"><Money v={refundable(order)} /></span></p>
      <div className="m-refund-lines">
        {order.items.map((it, i) => {
          const max = it.qty - refundedQty(order, i);
          return (
            <div key={it.sku} className="m-refund-line">
              <span className="strong">{l(it.name)}</span>
              <span className="small muted">{tx(`حتى ${max} × `, `up to ${max} × `)}<Money v={it.unit} /></span>
              <div className="m-row-fields">
                <Field id={`rq-${i}`} label={tx('كمية للاسترداد', 'Refund qty')}><input id={`rq-${i}`} className="input m-qty" inputMode="numeric" dir="ltr" value={qty[i]} disabled={max === 0} onChange={(e) => { const x = [...qty]; x[i] = e.target.value; setQty(x); }} /></Field>
                <Field id={`rs-${i}`} label={tx('أعِد للمخزون', 'Restock qty')}><input id={`rs-${i}`} className="input m-qty" inputMode="numeric" dir="ltr" value={restock[i]} disabled={max === 0} onChange={(e) => { const x = [...restock]; x[i] = e.target.value; setRestock(x); }} /></Field>
              </div>
            </div>
          );
        })}
      </div>
      <label className="check"><input type="checkbox" checked={ship} disabled={shippingRefunded(order) || order.fee === 0} onChange={(e) => setShip(e.target.checked)} /> {tx('رد رسوم الشحن', 'Refund shipping')} (<Money v={order.fee} />){shippingRefunded(order) && tx(' — رُدّت سابقًا', ' — already refunded')}</label>
      {restockUnits > 0 && (
        <Field id="rf-loc" label={tx('موقع إعادة المخزون', 'Restock location')} hint={tx('إعادة المخزون قرار منفصل عن رد المال: تزيد «الموجود» فورًا.', 'Restocking is separate from the refund: it increases on-hand immediately.')}>
          <select id="rf-loc" className="input" value={loc} onChange={(e) => setLoc(e.target.value as LocId)}>{LOC_IDS.map((x) => <option key={x} value={x}>{l(LOCATIONS[x])}</option>)}</select>
        </Field>
      )}
      <Field id="rf-reason" label={tx('السبب (يظهر في السجل)', 'Reason (shown in the log)')} error={reasonErr ? tx('اكتب السبب.', 'Enter a reason.') : undefined}>
        <input id="rf-reason" className="input" value={reason} aria-invalid={reasonErr} onChange={(e) => { setReason(e.target.value); setReasonErr(false); }} />
      </Field>
      <KV rows={[
        [tx('المنتجات', 'Items'), <Money v={q.items} />],
        [tx('الشحن', 'Shipping'), <Money v={q.shipping} />],
        [<span className="strong">{tx('مبلغ الاسترداد', 'Refund amount')}</span>, <span className="strong"><Money v={q.amount} /></span>],
        [tx('منها ضريبة 15%', 'Includes 15% VAT'), <Money v={q.vat} />],
      ]} />
      {errText && <p className="error" role="alert">{errText}</p>}
      <div className="actions">
        <button type="button" className="btn primary" disabled={!!q.error} onClick={() => { if (!reason.trim()) { setReasonErr(true); return; } setConfirm(true); }}>{tx('مراجعة وتأكيد', 'Review and confirm')}</button>
        <button type="button" className="btn" onClick={onCancel}>{tx('إلغاء', 'Cancel')}</button>
      </div>
      {q.error === 'nothing' && <p className="small muted">{tx('اختر كمية أو رسوم الشحن.', 'Choose a quantity or shipping.')}</p>}
      {confirm && (
        <Dialog title={tx('تأكيد طلب الاسترداد', 'Confirm the refund request')} onClose={() => setConfirm(false)}
          footer={<><button type="button" className="btn primary" onClick={submit}>{tx(`اطلب استرداد ${formatMoney(q.amount)} ر.س (محاكاة)`, `Request SAR ${formatMoney(q.amount)} refund (simulated)`)}</button><button type="button" className="btn" onClick={() => setConfirm(false)}>{tx('رجوع', 'Back')}</button></>}>
          <KV rows={[
            [tx('المبلغ والعملة', 'Amount and currency'), <span className="strong"><Money v={q.amount} /></span>],
            [tx('إلى', 'To'), tx('وسيلة الدفع الأصلية عبر مزود الدفع التجريبي', 'The original payment method via the test provider')],
            [tx('إعادة للمخزون', 'Restock'), restockUnits ? tx(`${restockUnits} قطعة في ${LOCATIONS[loc].ar}`, `${restockUnits} item(s) at the ${LOCATIONS[loc].en}`) : tx('لا شيء', 'None')],
          ]} />
          <p className="muted">{tx('سيبقى الاسترداد «بانتظار المزود» حتى يؤكده. لا يمكن التراجع بعد التأكيد. لن نرسل رسالة للعميل من هنا.', 'The refund stays “awaiting provider” until confirmed. It cannot be undone once confirmed. No message is sent to the customer from here.')} <Sim /></p>
        </Dialog>
      )}
    </section>
  );
}
