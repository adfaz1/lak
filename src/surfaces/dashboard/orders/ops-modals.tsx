// Order operations with a preview before they run: cancel, handed to carrier, delivered, decline a cancel request,
// open a return. Each writes to the order log with who and when; stock effects go to the inventory.
import { useState } from 'react';
import { Ban, PackageX, RotateCcw, Truck } from 'lucide-react';
import { useLang } from '../../../core/lang';

import { LOCATIONS, type Order } from '../../merchant/domain';
import { refundTx } from '../../merchant/finance';
import { financeStore, levelsStore } from '../../merchant/stores';
import { confirmTransferWithStock } from './model';
import {
  cancelBlock, cancelOrder, cancelPlan, declineCancel, markDelivered, markShipped, openReturn, parcelShip, parcelsAt, payView,
  returnableQty, validateReturnLines, type ReturnLine,
} from '../../merchant/ops';
import { Alert, Field, Input, Modal, Simulated, Textarea } from '../../../ds/kit';
import { Button, Money, ProductImage, Ref, cn, useTx } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { Qty, Row, applyEffects, saveOrder, useActor } from './ui';
import { noticeMute } from '../../merchant/stores';
import { NoticeNote } from './notices-ui';

const REASONS = ['customer', 'stock', 'fraud', 'payment', 'other'] as const;
type CancelReason = (typeof REASONS)[number];

export function CancelModal({ o, onClose }: { o: Order; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const who = useActor();
  const [reason, setReason] = useState<CancelReason | ''>(o.cancelRequest?.state === 'open' ? 'customer' : '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(false);
  const [notify, setNotify] = useState(true);
  const plan = cancelPlan(o);
  const block = cancelBlock(o);
  const label: Record<CancelReason, string> = { customer: tx('طلب العميل', 'Customer asked'), stock: tx('نفاد المخزون', 'Out of stock'), fraud: tx('اشتباه احتيال', 'Suspected fraud'), payment: tx('مشكلة في الدفع', 'Payment problem'), other: tx('سبب آخر', 'Other') };
  const text = reason ? `${label[reason]}${note.trim() ? ` · ${note.trim()}` : ''}` : '';
  const run = () => {
    if (!reason || (reason === 'other' && !note.trim())) { setErr(true); return; }
    const r = cancelOrder(o, text, who, Date.now());
    if (r.order === o) return;
    if (!notify) noticeMute.add(o.ref);
    saveOrder(r.order);
    applyEffects(r.effects, who, o.ref, 'CX');
    const rf = r.order.refunds.length > o.refunds.length ? r.order.refunds[r.order.refunds.length - 1] : undefined;
    if (rf) financeStore.set((f) => ({ ...f, txs: [...f.txs, refundTx(r.order, rf, `TX-${rf.id}`, undefined, false)] }));
    onClose(tx(`أُلغي الطلب #${o.ref}`, `Order #${o.ref} cancelled`));
  };
  if (block) return (
    <Modal title={tx('لا يمكن إلغاء هذا الطلب', 'This order can’t be cancelled')} onClose={() => onClose()} footer={<Button onClick={() => onClose()}>{tx('حسنًا', 'OK')}</Button>}>
      <Alert tone="warn">{block === 'shipped' ? tx('الطرد مع الناقل أو سُلّم. افتح مرتجعًا بدل الإلغاء.', 'A parcel is with the carrier or delivered. Open a return instead.') : block === 'refunded' ? tx('الطلب مسترد بالكامل.', 'The order is fully refunded.') : tx('الطلب ملغى من قبل.', 'The order is already cancelled.')}</Alert>
    </Modal>
  );
  return (
    <Modal title={tx(`إلغاء الطلب #${o.ref}`, `Cancel order #${o.ref}`)} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('تراجع', 'Keep order')}</Button><Button variant="danger" onClick={run}><Ban className="size-4" aria-hidden="true" />{tx('ألغِ الطلب', 'Cancel order')}</Button></>}>
      {o.cancelRequest?.state === 'open' && <Alert tone="info" title={tx('العميل طلب الإلغاء', 'The customer asked to cancel')}>{o.cancelRequest.reason || tx('بلا سبب مكتوب', 'No reason given')}</Alert>}
      <Field label={tx('السبب', 'Reason')} error={err ? tx('اختر سببًا، واكتبه إن كان «آخر»', 'Choose a reason; type it for “Other”') : null}>
        {() => (
          <div className="flex flex-wrap gap-2">{REASONS.map((k) => (
            <button key={k} type="button" aria-pressed={reason === k} onClick={() => { setReason(k); setErr(false); }}
              className={cn('h-9 rounded-full border px-3 text-[13px] font-medium transition-colors', reason === k ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border text-muted hover:text-fg')}>{label[k]}</button>
          ))}</div>
        )}
      </Field>
      <Field label={tx('ملاحظة', 'Note')} optional>{(p) => <Input {...p} value={note} onChange={(e) => { setNote(e.target.value); setErr(false); }} />}</Field>
      <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">
        <Row label={tx('المبلغ', 'Money')}>{plan.refund ? <span className="inline-flex items-center gap-1.5">{tx('استرداد كامل', 'Full refund')} <Money v={plan.refund} className="font-semibold text-fg" /></span>
          : payView(o) === 'cod_due' ? tx('لا شيء: لم يُحصَّل (دفع عند الاستلام)', 'Nothing: not collected (cash on delivery)') : tx('لا شيء: لم يُحصَّل', 'Nothing: not collected')}</Row>
        <Row label={tx('المخزون المحجوز', 'Reserved stock')}>{plan.units ? tx(`يُطلق ${plan.units}`, `${plan.units} released`) : tx('لا حجز', 'Nothing held')}</Row>
        {plan.voidLabels.length > 0 && <Row label={tx('الملصقات', 'Labels')}><span className="flex flex-wrap items-center justify-end gap-1.5">{tx('تُلغى لدى الناقل', 'Voided at the carrier')} {plan.voidLabels.map((r) => <Ref key={r}>{r}</Ref>)}<Simulated /></span></Row>}
        {plan.restock.length > 0 && <Row label={tx('تعود للرف', 'Back on the shelf')}>{plan.restock.map((e) => `${e.onHand} · ${LOCATIONS[e.loc].ar}`).join('، ')}</Row>}
      </dl>
      <NoticeNote o={o} event="cancelled" notify={notify} onNotify={setNotify} />
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {plan.refund ? tx('يبقى الاسترداد «بانتظار المزوّد» حتى يؤكده.', 'The refund stays “awaiting provider” until confirmed.') : tx('لا يمكن التراجع عن الإلغاء.', 'Cancelling cannot be undone.')}
        {plan.refund > 0 && <Simulated />}
      </p>
    </Modal>
  );
}

export function DeclineCancelModal({ o, onClose }: { o: Order; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const who = useActor();
  const [why, setWhy] = useState('');
  return (
    <Modal title={tx('رفض طلب الإلغاء', 'Decline the cancel request')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('رجوع', 'Back')}</Button><Button disabled={!why.trim()} onClick={() => { saveOrder(declineCancel(o, why, who, Date.now())); onClose(tx('رُفض طلب الإلغاء وسُجّل', 'Cancel request declined and logged')); }}>{tx('ارفض', 'Decline')}</Button></>}>
      <p className="text-sm text-muted">{tx('يستمر الطلب كما هو. اذكر السبب ليظهر في السجل.', 'The order continues as is. The reason is kept in the log.')}</p>
      <Field label={tx('السبب', 'Reason')}>{(p) => <Input {...p} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={tx('مثال: الطرد جاهز للشحن', 'e.g. the parcel is packed')} />}</Field>
    </Modal>
  );
}

/** Handed to the carrier, or delivered: per parcel, with an optional tracking number on hand-over. */
export function ShipModal({ o, to, onClose }: { o: Order; to: 'transit' | 'delivered'; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const from = to === 'transit' ? 'label' : 'transit';
  const parcels = parcelsAt(o, from);
  const [pick, setPick] = useState<number[]>(parcels);
  const [tracking, setTracking] = useState('');
  const [notify, setNotify] = useState(true);
  const cod = payView(o) === 'cod_due';
  const all = pick.length === parcels.length;
  const lastOpen = o.fulfilments.length ? o.fulfilments.every((_, i) => pick.includes(i) || parcelShip(o, i) === 'delivered') : true;
  const run = () => {
    const now = Date.now();
    const next = to === 'transit' ? markShipped(o, parcels.includes(-1) ? 'all' : pick, who, now, tracking) : markDelivered(o, parcels.includes(-1) ? 'all' : pick, who, now);
    if (next === o) return;
    if (!notify) noticeMute.add(o.ref);
    saveOrder(next);
    onClose(to === 'transit' ? tx('سُجّل التسليم للناقل', 'Marked as handed to the carrier') : tx('سُجّل التسليم للعميل', 'Marked as delivered'));
  };
  return (
    <Modal title={to === 'transit' ? tx('سُلّم للناقل', 'Handed to the carrier') : tx('سُلّم للعميل', 'Delivered to the customer')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!pick.length} onClick={run}><Truck className="size-4" aria-hidden="true" />{to === 'transit' ? tx('سجّل الشحن', 'Mark shipped') : tx('سجّل التسليم', 'Mark delivered')}</Button></>}>
      {o.fulfilments.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('الطرود', 'Parcels')}</legend>
          {parcels.map((i) => {
            const f = o.fulfilments[i];
            const n = f.qty.reduce((a, b) => a + b, 0);
            return (
              <label key={f.ref} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                <input type="checkbox" className="size-4 accent-brand-600" checked={pick.includes(i)} onChange={(e) => setPick(e.target.checked ? [...pick, i] : pick.filter((x) => x !== i))} />
                <span className="flex-1 text-sm text-fg"><Ref>{f.ref}</Ref><span className="block text-xs text-muted">{LOCATIONS[f.loc][lang]} · {tx(`${n} قطع`, `${n} items`)}</span></span>
              </label>
            );
          })}
        </fieldset>
      )}
      {to === 'transit' && <Field label={tx('رقم التتبع', 'Tracking number')} optional hint={tx('إن كان مختلفًا عن مرجع الملصق', 'If it differs from the label reference')}>{(p) => <Input {...p} dir="ltr" value={tracking} onChange={(e) => setTracking(e.target.value.replace(/[^\w-]/g, '').slice(0, 40))} />}</Field>}
      <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">
        <Row label={tx('يتغير', 'Changes')}>{to === 'transit' ? tx('الشحن ← في الطريق', 'Shipment → in transit') : tx('الشحن ← تم التسليم', 'Shipment → delivered')}{!all && tx(' (للطرود المحددة)', ' (selected parcels)')}</Row>
        {to === 'delivered' && cod && lastOpen && <Row label={tx('الدفع عند الاستلام', 'Cash on delivery')}><span className="inline-flex items-center gap-1">{tx('يُسجّل التحصيل', 'Recorded as collected')} <Money v={o.items.reduce((s, i) => s + i.qty * i.unit, 0) - (o.discount ?? 0) + o.fee} className="font-semibold text-fg" /></span></Row>}
        <Row label={tx('العميل', 'Customer')}>{tx('يرى الحالة الجديدة في صفحة طلبه', 'Sees the new state on their order page')}</Row>
      </dl>
      {(to === 'transit' || lastOpen) && <NoticeNote o={o} event={to === 'transit' ? 'shipped' : 'delivered'} notify={notify} onNotify={setNotify} />}
      <p className="text-xs text-muted">{tx('للناقل غير المربوط. التحديث الآلي من الناقل يحتاج ربطًا من الخادم.', 'For carriers that are not connected. Automatic carrier updates need a server integration.')}</p>
    </Modal>
  );
}

/** The merchant opens a return for shipped units (phone or in-store request). */
export function OpenReturnModal({ o, onClose }: { o: Order; onClose: (msg?: string, id?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const [qty, setQty] = useState<number[]>(o.items.map(() => 0));
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const lines: ReturnLine[] = o.items.map((_, i) => ({ idx: i, qty: qty[i], reason }));
  const err = validateReturnLines(o, lines);
  const run = () => {
    setTried(true);
    if (err) return;
    const r = openReturn(o, lines, who, Date.now());
    if (!r.id) return;
    saveOrder(r.order);
    onClose(tx(`فُتح المرتجع ${r.id}`, `Return ${r.id} opened`), r.id);
  };
  return (
    <Modal size="lg" title={tx(`مرتجع جديد · #${o.ref}`, `New return · #${o.ref}`)} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}><RotateCcw className="size-4" aria-hidden="true" />{tx('افتح المرتجع', 'Open return')}</Button></>}>
      <ul className="divide-y divide-border !rounded-xl !border !border-border">
        {o.items.map((it, i) => {
          const max = returnableQty(o, i);
          return (
            <li key={it.sku + i} className={cn('flex items-center gap-3 px-3 py-2.5', !max && 'opacity-50')}>
              <ProductImage src={skuPhoto(it.sku)} alt={it.name[lang]} size={40} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-fg">{it.name[lang]}</p><p className="text-xs text-muted">{max ? tx(`حتى ${max}`, `up to ${max}`) : tx('لا قطع قابلة للإرجاع', 'Nothing returnable')}</p></div>
              <Qty value={qty[i]} max={max} disabled={!max} label={tx(`كمية الإرجاع لـ ${it.name.ar}`, `return quantity for ${it.name.en}`)} onChange={(n) => setQty(qty.map((x, j) => (j === i ? n : x)))} />
            </li>
          );
        })}
      </ul>
      <Field label={tx('السبب', 'Reason')} error={tried && err === 'reason' ? tx('اكتب السبب', 'Enter a reason') : null}>{(p) => <Textarea {...p} className="min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      {tried && (err === 'nothing' || err === 'qty') && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{err === 'nothing' ? tx('اختر قطعة واحدة على الأقل', 'Choose at least one item') : tx('كمية أكبر من القابل للإرجاع', 'A quantity exceeds what can be returned')}</p>}
      <p className="flex items-center gap-2 text-xs text-muted"><PackageX className="size-4" aria-hidden="true" />{tx('لا يتغير المال أو المخزون قبل الاستلام والفحص.', 'Money and stock do not change before receipt and inspection.')}</p>
    </Modal>
  );
}


/** Bank transfer: the merchant confirms the money arrived; the order becomes paid and stock is held. */
export function TransferModal({ o, onClose }: { o: Order; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const who = useActor();
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const total = o.items.reduce((s, i) => s + i.qty * i.unit, 0) - (o.discount ?? 0) + o.fee;
  const run = () => {
    const r = confirmTransferWithStock(o, levelsStore.get(), who, Date.now(), note);
    if (r.order === o) return;
    levelsStore.set(r.levels);
    if (!notify) noticeMute.add(o.ref);
    saveOrder(r.order);
    onClose(tx('أُكّد التحويل وأصبح الطلب مدفوعًا', 'Transfer confirmed; the order is paid'));
  };
  return (
    <Modal title={tx('تأكيد استلام التحويل', 'Confirm the transfer arrived')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}>{tx('أكّد الاستلام', 'Confirm received')}</Button></>}>
      <Alert tone="warn">{tx('أكّد فقط بعد رؤية المبلغ في كشف حسابك البنكي.', 'Confirm only after you see the money in your bank statement.')}</Alert>
      <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">
        <Row label={tx('المبلغ المتوقع', 'Expected amount')} strong><Money v={total} /></Row>
        <Row label={tx('الدفع', 'Payment')}>{tx('بانتظار التحويل ← مدفوع', 'Awaiting transfer → paid')}</Row>
        <Row label={tx('المخزون', 'Stock')}>{tx('يُحجز للطلب', 'Held for the order')}</Row>
        <Row label={tx('التالي', 'Next')}>{tx('التجهيز', 'Fulfilment')}</Row>
      </dl>
      <Field label={tx('مرجع التحويل', 'Transfer reference')} optional>{(p) => <Input {...p} dir="ltr" value={note} onChange={(e) => setNote(e.target.value.slice(0, 60))} />}</Field>
      <NoticeNote o={o} event="paid" notify={notify} onNotify={setNotify} />
    </Modal>
  );
}
