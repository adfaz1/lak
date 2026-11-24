// Refund and return. Money back and restocking are two separate decisions; a refund stays pending until the provider confirms.
import { useState, type ReactNode } from 'react';
import { useLang } from '../../core/lang';
import { formatMoney } from '../../core/format';
import { LOCATIONS, LOC_IDS, refundQuote, refundable, refundedQty, requestRefund, shippingRefunded, type LocId, type Order } from '../merchant/domain';
import { refundTx } from '../merchant/finance';
import { financeStore, levelsStore, stockLogStore } from '../merchant/stores';
import { Banner, Dialog, Icon, Money, Sim, Thumb, useTx } from './ui';
import { itemImage } from './data';
import { Qty, saveOrder } from './orders-shared';

export function RefundDialog({ order: o, onClose }: { order: Order; onClose: (msg?: ReactNode) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const [qty, setQty] = useState<number[]>(o.items.map(() => 0));
  const [restock, setRestock] = useState<number[]>(o.items.map(() => 0));
  const [ship, setShip] = useState(false);
  const [loc, setLoc] = useState<LocId>('ryd');
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const q = refundQuote(o, qty, ship, restock);
  const restockUnits = restock.reduce((a, b) => a + b, 0);
  const reasons = [tx('تالف عند الاستلام', 'Damaged on arrival'), tx('مقاس أو لون غير مناسب', 'Wrong size or colour'), tx('غيّر العميل رأيه', 'Customer changed their mind'), tx('تأخر التوصيل', 'Late delivery')];
  const shipDisabled = shippingRefunded(o) || o.fee === 0;

  const submit = () => {
    const next = requestRefund(o, qty, ship, restock, loc, reason.trim());
    if (next === o) return;
    const r = next.refunds[next.refunds.length - 1];
    saveOrder(next);
    financeStore.set((f) => ({ ...f, txs: [...f.txs, refundTx(next, r, `TX-${r.id}`, undefined, false)] }));
    o.items.forEach((it, i) => {
      const u = r.restock[i];
      if (!u) return;
      levelsStore.set((ls) => ls.map((x) => (x.sku === it.sku && x.loc === loc ? { ...x, onHand: x.onHand + u, version: x.version + 1 } : x)));
      const lv = levelsStore.get().find((x) => x.sku === it.sku && x.loc === loc);
      stockLogStore.set((lg) => [{ id: `RS-${r.id}-${i}`, sku: it.sku, loc, delta: u, before: (lv?.onHand ?? u) - u, after: lv?.onHand ?? u, reason: 'returned', who: 'You', ref: r.id }, ...lg]);
    });
    onClose(<>{tx('طُلب استرداد ', 'Refund of ')}<Money v={r.amount} />{tx(' — بانتظار تأكيد المزوّد.', ' requested — awaiting the provider.')}</>);
  };
  const toConfirm = () => { if (!reason.trim()) { setReasonErr(true); return; } setStep('confirm'); };
  const errText = q.error === 'qty' ? tx('كمية أكبر من القابل للاسترداد في أحد الأسطر.', 'A line quantity exceeds what can be refunded.')
    : q.error === 'restock' ? tx('لا يمكن إعادة للمخزون أكثر من الكمية المستردة.', 'You cannot restock more than you refund.')
      : q.error === 'exceeds' ? tx('المبلغ يتجاوز المتاح للاسترداد.', 'The amount exceeds what is available to refund.') : null;

  if (step === 'confirm') return (
    <Dialog title={tx('تأكيد طلب الاسترداد', 'Confirm the refund request')} onClose={() => onClose()}
      footer={<>
        <button type="button" className="lk-btn" onClick={() => setStep('form')}>{tx('رجوع', 'Back')}</button>
        <button type="button" className="lk-btn primary" onClick={submit}>{tx('اطلب استرداد', 'Request refund of')} <Money v={q.amount} /></button>
      </>}>
      <div className="ord-bigamt">
        <span className="lk-small lk-2">{tx('يُرد إلى وسيلة الدفع الأصلية', 'Back to the original payment method')}</span>
        <span className="lk-display"><Money v={q.amount} figure /></span>
        <span className="lk-micro lk-3">{tx('منها ضريبة', 'includes VAT')} <Money v={q.vat} />{q.shipping ? tx(' · يشمل الشحن', ' · includes shipping') : ''}</span>
      </div>
      <dl className="ord-review">
        <div><dt>{tx('السبب', 'Reason')}</dt><dd>{reason}</dd></div>
        <div><dt>{tx('إعادة للمخزون', 'Restock')}</dt><dd>{restockUnits ? tx(`${restockUnits} قطع في ${LOCATIONS[loc].ar}`, `${restockUnits} ${restockUnits === 1 ? 'item' : 'items'} at ${LOCATIONS[loc].en}`) : tx('لا شيء', 'Nothing')}</dd></div>
      </dl>
      <Banner tone="info" title={tx('سيبقى «بانتظار المزوّد» حتى يؤكده', 'It stays “awaiting provider” until confirmed')}>
        {tx('لا يتغير وضع الدفع قبل التأكيد، ولا يمكن التراجع بعده. لن نرسل رسالة للعميل من هنا.', 'The payment state does not change before confirmation, and it cannot be undone after. No message is sent to the customer from here.')} <Sim />
      </Banner>
    </Dialog>
  );

  return (
    <Dialog wide title={tx(`استرداد أو مرتجع · \u2066#${o.ref}\u2069`, `Refund or return · #${o.ref}`)} onClose={() => onClose()}
      footer={<>
        <span className="lk-grow lk-small lk-2 ord-refund-sum">{tx('مبلغ الاسترداد', 'Refund')} <Money v={q.amount} strong /></span>
        <button type="button" className="lk-btn" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</button>
        <button type="button" className="lk-btn primary" disabled={!!q.error} onClick={toConfirm}>{tx('راجع وأكّد', 'Review')}</button>
      </>}>
      <div className="ord-avail"><span className="lk-small lk-2">{tx('المتاح للاسترداد', 'Available to refund')}</span><Money v={refundable(o)} strong /></div>

      <fieldset className="ord-fs">
        <legend className="lk-label">{tx('ما الذي تردّه؟', 'What are you refunding?')}</legend>
        <ul className="ord-picks">
          {o.items.map((it, i) => {
            const max = it.qty - refundedQty(o, i);
            return (
              <li key={it.sku + i} className={max === 0 ? 'dim' : undefined}>
                <Thumb src={itemImage(it)} alt={it.name[lang]} />
                <div className="lk-col lk-grow" style={{ minWidth: 0 }}>
                  <span className="lk-small lk-strong lk-truncate">{it.name[lang]}</span>
                  <span className="lk-micro lk-3">{max === 0 ? tx('مسترد بالكامل', 'Fully refunded') : <>{tx(`حتى ${max} × `, `up to ${max} × `)}{formatMoney(it.unit)}</>}</span>
                </div>
                <Qty value={qty[i]} max={max} disabled={max === 0} invalid={q.lineErrors[i] === 'qty'} label={tx(`كمية الاسترداد لـ ${it.name.ar}`, `refund quantity for ${it.name.en}`)}
                  onChange={(n) => { const x = [...qty]; x[i] = n; setQty(x); if (restock[i] > n) { const r = [...restock]; r[i] = n; setRestock(r); } }} />
              </li>
            );
          })}
        </ul>
        <label className={`lk-check lk-small ord-shiprow${shipDisabled ? ' dim' : ''}`}>
          <input type="checkbox" checked={ship} disabled={shipDisabled} onChange={(e) => setShip(e.target.checked)} />
          <span className="lk-grow">{tx('رد رسوم الشحن', 'Refund shipping')}{shippingRefunded(o) ? tx(' — رُدّت سابقًا', ' — already refunded') : o.fee === 0 ? tx(' — كان مجانيًا', ' — it was free') : ''}</span>
          <Money v={o.fee} />
        </label>
      </fieldset>

      <fieldset className="ord-fs ord-restock">
        <legend className="lk-label">{tx('إعادة للمخزون · قرار منفصل', 'Restock · a separate decision')}</legend>
        <p className="lk-help">{tx('رد المال لا يعيد القطع للمخزون تلقائيًا. أعِد فقط ما استلمته سليمًا؛ يزيد «الموجود» فورًا.', 'Refunding does not restock automatically. Restock only what came back sellable; on-hand increases immediately.')}</p>
        {qty.every((n) => !n) ? <p className="lk-small lk-3">{tx('اختر كمية للاسترداد أولًا.', 'Choose a refund quantity first.')}</p> : (
          <>
            <ul className="ord-picks">
              {o.items.map((it, i) => qty[i] ? (
                <li key={it.sku + i}>
                  <span className="lk-small lk-grow lk-truncate">{it.name[lang]}</span>
                  <Qty value={restock[i]} max={qty[i]} invalid={q.lineErrors[i] === 'restock'} label={tx(`كمية الإعادة لـ ${it.name.ar}`, `restock quantity for ${it.name.en}`)} onChange={(n) => { const r = [...restock]; r[i] = n; setRestock(r); }} />
                </li>
              ) : null)}
            </ul>
            {restockUnits > 0 && (
              <div className="lk-row lk-wrap"><span className="lk-small lk-2">{tx('إلى', 'Into')}</span>
                <div className="lk-seg" role="group" aria-label={tx('موقع الإعادة', 'Restock location')}>{LOC_IDS.map((l) => <button key={l} type="button" aria-pressed={loc === l} onClick={() => setLoc(l)}>{LOCATIONS[l][lang]}</button>)}</div>
              </div>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="ord-fs">
        <legend className="lk-label">{tx('السبب', 'Reason')}</legend>
        <div className="ord-sheet-opts">{reasons.map((r) => <button key={r} type="button" aria-pressed={reason === r} onClick={() => { setReason(r); setReasonErr(false); }}>{r}</button>)}</div>
        <input className="lk-input" value={reason} aria-label={tx('السبب', 'Reason')} placeholder={tx('أو اكتب السبب — يظهر في السجل', 'Or type a reason — shown in the timeline')} aria-invalid={reasonErr || undefined} onChange={(e) => { setReason(e.target.value); setReasonErr(false); }} />
        {reasonErr && <span className="lk-error" role="alert"><Icon name="alert" size="xs" />{tx('اختر سببًا أو اكتبه.', 'Choose or type a reason.')}</span>}
      </fieldset>

      <dl className="ord-review compact">
        <div><dt>{tx('المنتجات', 'Items')}</dt><dd><Money v={q.items} /></dd></div>
        <div><dt>{tx('الشحن', 'Shipping')}</dt><dd><Money v={q.shipping} /></dd></div>
        <div className="sum"><dt>{tx('مبلغ الاسترداد', 'Refund amount')}</dt><dd><Money v={q.amount} strong /></dd></div>
        <div><dt>{tx('منها ضريبة 15%', 'Includes 15% VAT')}</dt><dd><Money v={q.vat} /></dd></div>
      </dl>
      {errText && <span className="lk-error" role="alert"><Icon name="alert" size="xs" />{errText}</span>}
    </Dialog>
  );
}
