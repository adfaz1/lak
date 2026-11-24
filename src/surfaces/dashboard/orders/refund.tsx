// Refund and return. Money back and restocking are separate decisions; a refund stays pending until the provider confirms.
import { useState } from 'react';
import { useLang } from '../../../core/lang';
import { formatMoney } from '../../../core/format';
import { LOCATIONS, LOC_IDS, refundQuote, refundable, refundedQty, requestRefund, shippingRefunded, total, type LocId, type Order } from '../../merchant/domain';
import { refundTx } from '../../merchant/finance';
import { financeStore, levelsStore, stockLogStore } from '../../merchant/stores';
import { Alert, Field, Input, Modal, Simulated, Switch, Textarea } from '../../../ds/kit';
import { Button, Money, ProductImage, Segmented, cn, useTx } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { REFUND_REASONS, applyRestock, refundFromNextPayout, type RefundReason } from './model';
import { Qty, Row, saveOrder, useActor } from './ui';
import { act, stamp } from '../../merchant/ops';

export function RefundModal({ order: o, onClose }: { order: Order; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const who = useActor();
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
  const reasonText: Record<RefundReason, string> = { damaged: tx('تالف عند الاستلام', 'Damaged on arrival'), size: tx('مقاس أو لون غير مناسب', 'Wrong size or colour'), mind: tx('غيّر العميل رأيه', 'Changed their mind'), late: tx('تأخر التوصيل', 'Late delivery') };
  const shipDisabled = shippingRefunded(o) || o.fee === 0;
  const errText = q.error === 'qty' ? tx('كمية أكبر من القابل للاسترداد', 'A quantity exceeds what can be refunded')
    : q.error === 'restock' ? tx('الإعادة للمخزون أكبر من المسترد', 'Restock exceeds the refunded quantity')
      : q.error === 'exceeds' ? tx('المبلغ يتجاوز المتاح', 'Amount exceeds what is available') : null;

  const submit = () => {
    const next = stamp(o, requestRefund(o, qty, ship, restock, loc, reason.trim()), who, Date.now());
    if (next === o) return;
    const r = next.refunds[next.refunds.length - 1];
    saveOrder(next);
    financeStore.set((f) => ({ ...f, txs: [...f.txs, refundTx(next, r, `TX-${r.id}`, undefined, false)] }));
    const rs = applyRestock(levelsStore.get(), next, r);
    if (rs.log.length) { levelsStore.set(rs.levels); stockLogStore.set((lg) => [...rs.log, ...lg]); }
    onClose(tx(`طُلب استرداد ${formatMoney(r.amount)} ر.س، بانتظار المزوّد`, `Refund of SAR ${formatMoney(r.amount)} requested, awaiting the provider`));
  };
  const toConfirm = () => { if (!reason.trim()) { setReasonErr(true); return; } setStep('confirm'); };

  if (step === 'confirm') return (
    <Modal title={tx('تأكيد طلب الاسترداد', 'Confirm the refund request')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => setStep('form')}>{tx('رجوع', 'Back')}</Button><Button onClick={submit}>{tx('اطلب استرداد', 'Request refund of')}&nbsp;<Money v={q.amount} /></Button></>}>
      <div className="rounded-xl bg-surface-2 p-5 text-center">
        <p className="text-xs text-muted">{tx('إلى وسيلة الدفع الأصلية', 'To the original payment method')}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-fg"><Money v={q.amount} /></p>
        <p className="mt-1 text-xs text-muted">{tx('منها ضريبة', 'incl. VAT')} <Money v={q.vat} />{q.shipping ? tx(' · يشمل الشحن', ' · incl. shipping') : ''}</p>
      </div>
      <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">
        <Row label={tx('السبب', 'Reason')}>{reason}</Row>
        <Row label={tx('إعادة للمخزون', 'Restock')}>{restockUnits ? tx(`${restockUnits} في ${LOCATIONS[loc].ar}`, `${restockUnits} at ${LOCATIONS[loc].en}`) : tx('لا شيء', 'Nothing')}</Row>
        {refundFromNextPayout(o) && <Row label={tx('من', 'From')}>{tx('التحويل القادم', 'Next payout')}</Row>}
      </dl>
      <Alert tone="info" title={tx('يبقى «بانتظار المزوّد» حتى يؤكده', 'Stays “awaiting provider” until confirmed')}>
        <span className="flex flex-wrap items-center gap-2">{tx('لا تتغير حالة الدفع قبل التأكيد. لا رسالة للعميل من هنا.', 'Payment state changes only on confirmation. No customer message is sent.')}<Simulated /></span>
      </Alert>
    </Modal>
  );

  return (
    <Modal size="lg" title={tx(`استرداد أو مرتجع · #${o.ref}`, `Refund or return · #${o.ref}`)} onClose={() => onClose()}
      footer={<>
        <span className="me-auto flex items-center gap-2 text-sm text-muted">{tx('الاسترداد', 'Refund')} <Money v={q.amount} className="font-semibold text-fg" /></span>
        <Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button>
        <Button disabled={!!q.error} onClick={toConfirm}>{tx('راجع', 'Review')}</Button>
      </>}>
      <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
        <span className="text-sm text-muted">{tx('المتاح للاسترداد', 'Available to refund')}</span><Money v={refundable(o)} className="font-semibold text-fg" />
      </div>
      {refundFromNextPayout(o) && <Alert tone="info">{tx('سُوّي هذا الطلب في تحويل سابق؛ يُخصم الاسترداد من التحويل القادم.', 'This order was already paid out; the refund comes from your next payout.')}</Alert>}

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('ما الذي تردّه؟', 'What are you refunding?')}</legend>
        <ul className="divide-y divide-border !rounded-xl !border !border-border">
          {o.items.map((it, i) => {
            const max = it.qty - refundedQty(o, i);
            return (
              <li key={it.sku + i} className={cn('flex items-center gap-3 px-3 py-2.5', max === 0 && 'opacity-50')}>
                <ProductImage src={skuPhoto(it.sku)} alt={it.name[lang]} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{it.name[lang]}</p>
                  <p className="text-xs text-muted">{max === 0 ? tx('مسترد بالكامل', 'Fully refunded') : <>{tx(`حتى ${max} × `, `up to ${max} × `)}<Money v={it.unit} /></>}</p>
                </div>
                <Qty value={qty[i]} max={max} disabled={max === 0} invalid={q.lineErrors[i] === 'qty'} label={tx(`كمية الاسترداد لـ ${it.name.ar}`, `refund quantity for ${it.name.en}`)}
                  onChange={(n) => { setQty(qty.map((x, j) => (j === i ? n : x))); if (restock[i] > n) setRestock(restock.map((x, j) => (j === i ? n : x))); }} />
              </li>
            );
          })}
          <li className={cn('flex items-center gap-3 px-3 py-3', shipDisabled && 'opacity-60')}>
            <span className="flex-1 text-sm text-fg">{tx('رد رسوم الشحن', 'Refund shipping')}<span className="block text-xs text-muted">{shippingRefunded(o) ? tx('رُدّت سابقًا', 'Already refunded') : o.fee === 0 ? tx('كان مجانيًا', 'It was free') : <Money v={o.fee} />}</span></span>
            <Switch checked={ship} disabled={shipDisabled} onChange={setShip} label={tx('رد رسوم الشحن', 'Refund shipping')} />
          </li>
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('إعادة للمخزون', 'Restock')} <span className="font-normal text-muted">· {tx('قرار منفصل', 'separate decision')}</span></legend>
        {qty.every((n) => !n) ? <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted">{tx('اختر كمية للاسترداد أولًا', 'Choose a refund quantity first')}</p> : (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <ul className="space-y-2">
              {o.items.map((it, i) => (qty[i] ? (
                <li key={it.sku + i} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{it.name[lang]}</span>
                  <Qty value={restock[i]} max={qty[i]} invalid={q.lineErrors[i] === 'restock'} label={tx(`كمية الإعادة لـ ${it.name.ar}`, `restock quantity for ${it.name.en}`)} onChange={(n) => setRestock(restock.map((x, j) => (j === i ? n : x)))} />
                </li>
              ) : null))}
            </ul>
            {restockUnits > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">{tx('إلى', 'Into')}</span><Segmented label={tx('موقع الإعادة', 'Restock location')} value={loc} onChange={setLoc} options={LOC_IDS.map((l) => ({ value: l, label: LOCATIONS[l][lang] }))} /></div>}
            <p className="text-xs text-muted">{restockUnits ? tx('يزيد المخزون فور الطلب.', 'Stock increases when you request.') : tx('لن يعود شيء للمخزون.', 'Nothing returns to stock.')}</p>
          </div>
        )}
      </fieldset>

      <Field label={tx('السبب', 'Reason')} error={reasonErr ? tx('اختر سببًا أو اكتبه', 'Choose or type a reason') : null}>
        {(p) => (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">{REFUND_REASONS.map((k) => (
              <button key={k} type="button" aria-pressed={reason === reasonText[k]} onClick={() => { setReason(reasonText[k]); setReasonErr(false); }}
                className={cn('h-9 rounded-full border px-3 text-[13px] font-medium transition-colors', reason === reasonText[k] ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border text-muted hover:text-fg')}>{reasonText[k]}</button>
            ))}</div>
            <Input {...p} value={reason} placeholder={tx('أو اكتب السبب', 'Or type a reason')} onChange={(e) => { setReason(e.target.value); setReasonErr(false); }} />
          </div>
        )}
      </Field>

      <dl className="!rounded-xl !border !border-border !px-4 !py-1">
        <Row label={tx('المنتجات', 'Items')}><Money v={q.items} /></Row>
        <Row label={tx('الشحن', 'Shipping')}><Money v={q.shipping} /></Row>
        <Row label={tx('مبلغ الاسترداد', 'Refund amount')} strong><Money v={q.amount} /></Row>
        <Row label={tx('منها ضريبة 15%', 'Incl. 15% VAT')} tone="muted"><Money v={q.vat} /></Row>
      </dl>
      {errText && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{errText}</p>}
    </Modal>
  );
}

/** Failed payment: the next step is a conversation. The message is copied for the merchant's own channel; nothing is sent. */
export function ContactModal({ o, onClose }: { o: Order; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const who = useActor();
  const { lang } = useLang();
  const first = o.customer[lang].split(' ')[0];
  const amount = formatMoney(total(o));
  const [text, setText] = useState(o.pay === 'failed'
    ? tx(`مرحبًا ${first}، لم يكتمل دفع طلبك #${o.ref} بمبلغ ${amount} ر.س. يمكنك إعادة المحاولة من رابط الطلب، وسنجهّزه فور تأكيد الدفع.`, `Hi ${first}, the payment for your order #${o.ref} (SAR ${amount}) did not complete. You can try again from the order link; we will prepare it once payment is confirmed.`)
    : tx(`مرحبًا ${first}، بخصوص طلبك #${o.ref}: `, `Hi ${first}, about your order #${o.ref}: `));
  return (
    <Modal title={tx(`رسالة إلى ${o.customer[lang]}`, `Message ${o.customer[lang]}`)} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button>
        <Button disabled={!text.trim()} onClick={() => { void navigator.clipboard?.writeText(text).catch(() => undefined); saveOrder(act(o, 'messageCopied', who, Date.now(), { text: text.slice(0, 120) })); onClose(tx('نُسخت الرسالة. أرسلها من قناتك المعتادة.', 'Message copied. Send it from your usual channel.')); }}>{tx('انسخ الرسالة', 'Copy message')}</Button></>}>
      {o.pay === 'failed' && <Alert tone="bad" title={tx('لم يُحصَّل أي مبلغ', 'Nothing was collected')}>{tx('لا تجهّز قبل تأكيد الدفع.', 'Do not fulfil before payment is confirmed.')}</Alert>}
      <Field label={tx('نص الرسالة', 'Message')} hint={tx('لا يُرسل شيء من هنا؛ يُنسخ النص فقط', 'Nothing is sent; the text is copied')}>
        {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} className="min-h-28" />}
      </Field>
    </Modal>
  );
}
