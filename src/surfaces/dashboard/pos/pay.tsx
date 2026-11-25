// Payment at the counter: split cash / card / payment link (and exchange credit), change due, then the receipt.
// Card terminal and payment-link answers are simulated; in review mode the cashier can make them decline.
import { useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Link2, MessageCircle, Printer, Repeat, Trash2, XCircle } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { allLocations, type Order } from '../../merchant/domain';
import type { Member } from '../../merchant/workspace';
import { applyStockEffects } from '../../merchant/inventory';
import { customersStore, levelsStore, logAction, ordersStore, stockLogStore } from '../../merchant/stores';
import { verificationStore } from '../../merchant/verification-store';
import { settingsStore } from '../../merchant/stores';
import { parseMoney } from '../../merchant/catalog';
import {
  checkTender, counterRefund, emptyCart, saleEffects, saleToOrder, splitEven, tenderState, totals, type PayMethod, type Shift, type Tender,
} from '../../merchant/pos';
import { Badge, Button, IconButton, Money, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, Simulated, useToast } from '../../../ds/kit';
import { posStore, setPos } from './state';

const now = () => Date.now();
const METHOD_ICON = { cash: Banknote, card: CreditCard, link: Link2, credit: Repeat };

export function useMethodName() {
  const tx = useTx();
  return (m: PayMethod) => ({ cash: tx('نقدًا', 'Cash'), card: tx('بطاقة (مدى/ائتمانية)', 'Card (mada/credit)'), link: tx('رابط دفع', 'Payment link'), credit: tx('رصيد استبدال', 'Exchange credit') })[m];
}

export function PayModal({ shift, cashier, onClose }: { shift: Shift; cashier: Member; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const review = useReviewMode();
  const name = useMethodName();
  const s = posStore.use();
  const customers = customersStore.use();
  const t = totals(s.cart);
  const credit = s.exchange?.credit ?? 0;
  const st = tenderState(t.total, s.tenders);
  const [method, setMethod] = useState<PayMethod>(credit && !s.tenders.some((x) => x.method === 'credit') ? 'credit' : 'cash');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState(customers.find((c) => c.id === s.cart.customerId)?.phone ?? '');
  const [declineNext, setDeclineNext] = useState(false);
  const [done, setDone] = useState<Order | null>(null);
  const owedNow = method === 'credit' ? Math.min(st.owed, credit - s.tenders.filter((x) => x.method === 'credit' && x.state !== 'declined').reduce((a, x) => a + x.amount, 0)) : st.owed;
  const parsed = amount.trim() ? parseMoney(amount) : owedNow;
  const err = parsed === null ? 'amount' : checkTender(t.total, s.tenders, { method, amount: parsed }, credit);
  const phoneOk = /^(?:\+?966|0)5\d{8}$/.test(phone.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\s-]/g, ''));

  if (done) return <Receipt order={done} onClose={onClose} />;

  const addTender = () => {
    if (err || parsed === null || (method === 'link' && !phoneOk)) return;
    const id = `T${s.tenders.length + 1}`;
    const tender: Tender = { id, method, amount: parsed, state: method === 'cash' || method === 'credit' ? 'paid' : 'pending', ref: method === 'card' ? `SIM-TRM-${Math.floor(now() / 1000) % 100000}` : method === 'link' ? `SIM-LNK-${Math.floor(now() / 1000) % 100000}` : undefined };
    setPos((x) => ({ tenders: [...x.tenders, tender] }));
    setAmount('');
    if (method === 'card' && !review) setTimeout(() => answer(id, true), 900);
  };
  const answer = (id: string, ok: boolean) => setPos((x) => ({ tenders: x.tenders.map((y) => (y.id === id ? { ...y, state: ok ? 'paid' : 'declined' } : y)) }));
  const remove = (id: string) => setPos((x) => ({ tenders: x.tenders.filter((y) => y.id !== id) }));

  const complete = () => {
    const now0 = now();
    const fresh = tenderState(t.total, posStore.get().tenders);
    if (!fresh.complete) return;
    const loc = allLocations().find((l) => l.id === shift.loc)!;
    const customer = customers.find((c) => c.id === s.cart.customerId);
    const role = cashier.role;
    let orders = ordersStore.get();
    // An exchange first refunds the returned units on the original order (credit, restocked as chosen).
    if (s.exchange) {
      const orig = orders.find((o) => o.ref === s.exchange!.orderRef);
      if (orig) {
        const r = counterRefund(orig, s.exchange.picks, s.exchange.restock, 'credit', s.exchange.reason, cashier.name, now0);
        if (!r.error) {
          orders = orders.map((o) => (o.ref === orig.ref ? r.order : o));
          if (r.effects.length) { const fx = applyStockEffects(levelsStore.get(), r.effects, cashier.name, orig.ref, `POSX-${orig.ref}`); levelsStore.set(fx.levels); stockLogStore.set((l) => [...fx.log, ...l]); }
          // Credit left after the new sale is paid back in cash from the drawer.
          const unused = Math.max(0, credit - t.total);
          if (unused) setPos((x) => ({ shifts: x.shifts.map((sh) => (sh.id === shift.id ? { ...sh, cashRefunds: [...sh.cashRefunds, { ref: orig.ref, amount: unused }] } : sh)) }));
        }
      }
    }
    const usedTenders = posStore.get().tenders.map((x) => (x.method === 'credit' ? { ...x, amount: Math.min(x.amount, t.total) } : x));
    const order = saleToOrder(s.cart, usedTenders, { orders, loc: loc.id, city: loc.city, cashier: { id: cashier.id, name: cashier.name }, role, shift: shift.id, customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null, now: now0, exchangeOf: s.exchange?.orderRef });
    ordersStore.set([order, ...orders.filter((o) => o.ref !== order.ref)]);
    const fx = applyStockEffects(levelsStore.get(), saleEffects(s.cart, loc.id), cashier.name, order.ref, `POS-${order.ref}`);
    levelsStore.set(fx.levels);
    stockLogStore.set((l) => [...fx.log, ...l]);
    logAction('orders', { ar: `بيع في نقطة البيع ${order.ref} (${loc.name.ar})`, en: `POS sale ${order.ref} (${loc.name.en})` }, { target: order.ref, after: `${(t.total / 100).toFixed(2)} SAR` });
    setPos(() => ({ cart: emptyCart(), tenders: [], exchange: null }));
    toast({ tone: 'ok', text: tx(`تم البيع ${order.ref}`, `Sale ${order.ref} complete`) });
    setDone(order);
  };

  const quick = method === 'cash' && st.owed > 0 ? Array.from(new Set([st.owed, Math.ceil(st.owed / 1000) * 1000, Math.ceil(st.owed / 5000) * 5000, Math.ceil(st.owed / 10000) * 10000, Math.ceil(st.owed / 50000) * 50000])).slice(0, 4) : [];
  const methods: PayMethod[] = credit ? ['credit', 'cash', 'card', 'link'] : ['cash', 'card', 'link'];
  const errText = err === 'overpayNonCash' ? tx('البطاقة والرابط لا يتجاوزان المتبقي', 'Card and link cannot exceed what is owed') : err === 'creditExceeds' ? tx('أكبر من رصيد الاستبدال', 'More than the exchange credit') : err === 'amount' && amount.trim() ? tx('مبلغ غير صحيح', 'Invalid amount') : null;

  return (
    <Modal size="lg" title={tx('الدفع', 'Payment')} onClose={onClose}
      description={<span className="flex flex-wrap items-center gap-2">{tx('الإجمالي', 'Total')} <Money v={t.total} className="font-bold text-fg" /><Simulated /></span>}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('رجوع للسلة', 'Back to cart')}</Button><Button size="lg" className="bg-brand-gradient" onClick={complete} disabled={!st.complete}><CheckCircle2 className="size-4" aria-hidden="true" />{tx('أتمّ البيع', 'Complete sale')}</Button></>}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">{tx('المدفوع', 'Paid')}</p><Money v={st.paid} className="text-base font-bold text-fg" /></div>
        <div className={cn('rounded-xl p-3', st.owed ? 'bg-amber-500/10' : 'bg-surface-2')}><p className="text-xs text-muted">{tx('المتبقي', 'Owed')}</p><Money v={st.owed} className="text-base font-bold text-fg" /></div>
        <div className={cn('rounded-xl p-3', st.change ? 'bg-emerald-500/10' : 'bg-surface-2')}><p className="text-xs text-muted">{tx('الباقي للعميل', 'Change due')}</p><Money v={st.change} className="text-base font-bold text-fg" /></div>
      </div>
      {s.tenders.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {s.tenders.map((x) => {
            const I = METHOD_ICON[x.method];
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                <I className="size-4 text-muted" aria-hidden="true" />
                <span className="font-semibold text-fg">{name(x.method)}</span>
                {x.ref && <span className="text-xs text-subtle"><Ref>{x.ref}</Ref></span>}
                <Badge tone={x.state === 'paid' ? 'green' : x.state === 'declined' ? 'red' : 'sky'}>{x.state === 'paid' ? tx('تم', 'Paid') : x.state === 'declined' ? tx('مرفوض', 'Declined') : x.method === 'card' ? tx('على الجهاز…', 'On terminal…') : tx('بانتظار العميل', 'Awaiting customer')}</Badge>
                <Money v={x.amount} className="ms-auto font-semibold text-fg" />
                {x.state === 'pending' && (x.method === 'link' || review) && <>
                  <Button size="sm" variant="soft" onClick={() => answer(x.id, !(review && declineNext))}>{x.method === 'link' ? tx('دفع العميل (محاكاة)', 'Customer paid (sim.)') : tx('رد الجهاز (محاكاة)', 'Terminal answer (sim.)')}</Button>
                </>}
                {x.state !== 'paid' && <IconButton className="size-8" label={tx('إزالة', 'Remove')} onClick={() => remove(x.id)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>}
                {x.state === 'paid' && (x.method === 'cash' || x.method === 'credit') && <IconButton className="size-8" label={tx('إزالة', 'Remove')} onClick={() => remove(x.id)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>}
              </li>
            );
          })}
        </ul>
      )}
      {s.tenders.some((x) => x.state === 'declined') && <Alert tone="bad" title={tx('رُفضت عملية', 'A payment was declined')}>{tx('لم يُخصم شيء منها. اطلب طريقة أخرى أو أعد المحاولة.', 'Nothing was taken for it. Ask for another method or try again.')}</Alert>}
      {(st.owed > 0) && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <Segmented label={tx('طريقة الدفع', 'Payment method')} value={method} onChange={(m) => { setMethod(m); setAmount(''); }} options={methods.map((m) => ({ value: m, label: name(m).split(' (')[0] }))} />
          <div className="flex flex-wrap items-end gap-2">
            <Field className="min-w-40 flex-1" label={tx('المبلغ (ر.س)', 'Amount (SAR)')} error={errText}>
              {(p) => <Input {...p} inputMode="decimal" dir="ltr" value={amount} placeholder={((owedNow) / 100).toFixed(2)} onChange={(e) => setAmount(e.target.value)} />}
            </Field>
            <Button onClick={addTender} disabled={!!err || (method === 'link' && !phoneOk)}>{method === 'card' ? tx('أرسل للجهاز', 'Send to terminal') : method === 'link' ? tx('أرسل الرابط', 'Send link') : tx('أضف', 'Add')}</Button>
          </div>
          {quick.length > 0 && <div className="flex flex-wrap gap-2">{quick.map((q) => <Button key={q} size="sm" variant="secondary" onClick={() => setAmount((q / 100).toFixed(2))}><Money v={q} /></Button>)}</div>}
          {st.owed > 1 && <div className="flex flex-wrap items-center gap-2 text-xs text-muted">{tx('قسّم المتبقي:', 'Split what is owed:')}{[2, 3].map((n) => <Button key={n} size="sm" variant="ghost" onClick={() => setAmount((splitEven(st.owed, n)[0] / 100).toFixed(2))}>{tx(`${n} أجزاء`, `${n} ways`)}</Button>)}</div>}
          {method === 'link' && <Field label={tx('جوال العميل لإرسال الرابط', 'Customer mobile for the link')} error={phone && !phoneOk ? tx('مثال: 05xxxxxxxx', 'e.g. 05xxxxxxxx') : null}>{(p) => <Input {...p} dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>}
          {method === 'card' && <p className="text-xs text-muted">{tx('جهاز الدفع ورسوم العمليات الحضورية بانتظار اعتماد «لك».', 'Card terminal and in-person fees await LAK approval.')}</p>}
          {review && (method === 'card' || method === 'link') && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={declineNext} onChange={(e) => setDeclineNext(e.target.checked)} />{tx('مراجعة: اجعل الرد التالي رفضًا', 'Review: make the next answer a decline')}</label>}
        </div>
      )}
      {st.complete && st.change > 0 && <Alert tone="ok" title={<span>{tx('أعطِ العميل الباقي: ', 'Give the customer change: ')}<Money v={st.change} /></span>} />}
      <p className="text-xs text-subtle">{lang === 'ar' ? 'يُسجَّل البيع طلبًا بقناة «نقطة البيع» ويُخصم المخزون من هذا الموقع.' : 'The sale is recorded as an order on the “Point of sale” channel and stock is taken from this location.'}</p>
    </Modal>
  );
}

/** Receipt preview (simplified tax invoice). Print and WhatsApp are simulated. */
export function Receipt({ order, onClose }: { order: Order; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const name = useMethodName();
  const v = verificationStore.use();
  const settings = settingsStore.use();
  const note = posStore.use().receiptNote;
  const loc = allLocations().find((l) => l.id === order.pos?.loc);
  const sub = order.items.reduce((s, i) => s + i.qty * i.unit, 0);
  const total = sub - (order.discount ?? 0);
  const vat = Math.round((total * 15) / 115);
  const phone = order.contact?.phone;
  const send = (how: 'print' | 'wa') => {
    logAction('orders', { ar: how === 'print' ? `طباعة إيصال ${order.ref}` : `إرسال إيصال ${order.ref} بواتساب`, en: how === 'print' ? `Printed receipt ${order.ref}` : `Sent receipt ${order.ref} by WhatsApp` }, { target: order.ref });
    toast({ tone: 'ok', text: how === 'print' ? tx('أُرسل للطابعة (محاكاة)', 'Sent to the printer (simulated)') : tx(`أُرسل إلى ${phone} (محاكاة)`, `Sent to ${phone} (simulated)`) });
  };
  return (
    <Modal title={tx('الإيصال', 'Receipt')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={() => send('print')}><Printer className="size-4" aria-hidden="true" />{tx('اطبع', 'Print')}</Button><Button variant="secondary" onClick={() => send('wa')} disabled={!phone} title={phone ? undefined : tx('اختر عميلًا بجوال', 'Pick a customer with a mobile')}><MessageCircle className="size-4" aria-hidden="true" />{tx('واتساب', 'WhatsApp')}</Button><Button onClick={onClose}>{tx('بيع جديد', 'New sale')}</Button></>}>
      <div className="mx-auto w-full max-w-xs rounded-xl border border-dashed border-border bg-white p-4 font-mono text-[12px] leading-relaxed text-neutral-900" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <p className="text-center text-sm font-bold">{settings.store.name}</p>
        <p className="text-center">{loc?.name[lang]}</p>
        <p className="text-center">{tx('فاتورة ضريبية مبسطة', 'Simplified tax invoice')}</p>
        <p className="text-center">{tx('الرقم الضريبي', 'VAT no.')} <bdi dir="ltr">{v.form.vatNumber || '—'}</bdi></p>
        <div className="my-2 border-t border-dashed border-neutral-400" />
        <p className="flex justify-between"><span>{order.pos?.receipt}</span><bdi dir="ltr">{new Date(order.placedAt ?? Date.now()).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}</bdi></p>
        <p>{tx('الكاشير', 'Cashier')}: {order.pos?.cashier.name}</p>
        <p>{order.customer[lang]}</p>
        <div className="my-2 border-t border-dashed border-neutral-400" />
        {order.items.map((i, k) => <div key={k}><p>{i.name[lang]}{i.variant ? ` · ${i.variant[lang]}` : ''}</p><p className="flex justify-between"><span>{i.qty} × {(i.unit / 100).toFixed(2)}</span><span>{((i.qty * i.unit) / 100).toFixed(2)}</span></p></div>)}
        <div className="my-2 border-t border-dashed border-neutral-400" />
        {order.discount ? <p className="flex justify-between"><span>{tx('خصم', 'Discount')}{order.pos?.discountReason ? ` (${order.pos.discountReason})` : ''}</span><span>−{(order.discount / 100).toFixed(2)}</span></p> : null}
        <p className="flex justify-between"><span>{tx('شامل الضريبة 15٪', 'Incl. VAT 15%')}</span><span>{(vat / 100).toFixed(2)}</span></p>
        <p className="flex justify-between text-sm font-bold"><span>{tx('الإجمالي ر.س', 'Total SAR')}</span><span>{(total / 100).toFixed(2)}</span></p>
        {order.pos?.tenders.map((x) => <p key={x.id} className="flex justify-between"><span>{name(x.method)}</span><span>{(x.amount / 100).toFixed(2)}</span></p>)}
        {order.pos?.change ? <p className="flex justify-between"><span>{tx('الباقي', 'Change')}</span><span>{(order.pos.change / 100).toFixed(2)}</span></p> : null}
        <div className="mx-auto mt-3 grid size-20 place-items-center border border-neutral-400 text-[10px] text-neutral-500">QR · {tx('محاكاة', 'sim.')}</div>
        {note && <p className="mt-2 text-center">{note}</p>}
        <p className="mt-2 text-center">{tx('طلب', 'Order')} <bdi dir="ltr">{order.ref}</bdi></p>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted"><XCircle className="hidden" aria-hidden="true" /><Simulated />{tx('رمز QR وفق «فاتورة» يحتاج ربط الفوترة الإلكترونية.', 'The ZATCA QR needs e-invoicing integration.')}</p>
    </Modal>
  );
}
