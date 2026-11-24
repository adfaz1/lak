// Order detail, redesigned. Shared by the side panel (direction A, wide screens) and the full page.
// Question it answers: "what state is this order in, and what is the one thing I should do next?"
import { useState, type ReactNode } from 'react';
import { useLang } from '../../core/lang';
import { formatMoney } from '../../core/format';
import { financeStore, ordersStore } from '../merchant/stores';
import {
  CARRIERS, LOCATIONS, canFulfilPartial, canRefund, fulfilledQty, isMultiLocation, refundable, refundedQty, refundedTotal, subtotal, total, units, vatIncluded,
  settleRefund, type LogEntry, type Order,
} from '../merchant/domain';
import { refundTx } from '../merchant/finance';
import { Avatar, Banner, Dialog, EmptyState, Icon, Money, Pill, Ref, Sim, Skeleton, Thumb, Toast, useTx, type IconName, type Tone, SrHeading } from './ui';
import { age, isLate, itemImage, reviewStore, vhref, useView } from './data';
import { FUL_ICON, FUL_TONE, Menu, MenuItem, PAY_ICON, PAY_TONE, SHIP_ICON, SHIP_TONE, Layer, TestControl, saveOrder, useLabels, useMedia } from './orders-shared';
import { FulfilDialog } from './order-fulfil';
import { RefundDialog } from './order-refund';

export type DetailMode = 'panel' | 'page';
type NextKind = 'fulfil' | 'contact' | 'slip' | 'none';
interface Next { kind: NextKind; tone: 'bad' | 'warn' | 'info' | 'ok'; icon: IconName; title: string; body: ReactNode; label?: string }


function useNext() {
  const tx = useTx();
  const { lang } = useLang();
  return (o: Order): Next => {
    const pending = o.refunds.find((r) => r.status === 'pending');
    const left = o.items.reduce((s, _, i) => s + o.items[i].qty - fulfilledQty(o, i), 0);
    if (o.pay === 'failed') return { kind: 'contact', tone: 'bad', icon: 'card', label: tx('تواصل مع العميل', 'Contact customer'),
      title: tx('الدفع لم يكتمل — لا تجهّز هذا الطلب', 'Payment did not complete — do not fulfil'),
      body: tx('رفض مزوّد الدفع العملية ولم يُحصَّل أي مبلغ. اطلب من العميل إعادة الدفع، أو ألغِ الطلب إن لم يرد.', 'The provider declined the payment and nothing was collected. Ask the customer to pay again, or cancel if they do not respond.') };
    if (pending) return { kind: 'none', tone: 'warn', icon: 'return',
      title: tx('استرداد بانتظار مزوّد الدفع', 'Refund waiting for the payment provider'),
      body: <>{tx('طُلب استرداد ', 'Refund ')}<Ref>{pending.id}</Ref>{tx(' بمبلغ ', ' for ')}<Money v={pending.amount} />{tx('. لا تخبر العميل بوصول المبلغ قبل تأكيد المزوّد.', ' was requested. Do not tell the customer the money has arrived until the provider confirms.')}</> };
    if (canFulfilPartial(o)) {
      if (o.ful === 'partial') return { kind: 'fulfil', tone: 'warn', icon: 'box', label: tx('جهّز المتبقي', 'Fulfil remaining'),
        title: tx(`مجهّز جزئيًا — بقي ${left} قطع`, `Partly fulfilled — ${left} ${left === 1 ? 'item remains' : 'items remain'}`),
        body: tx('جهّز المتبقي من الموقع الذي فيه المخزون. يصدر ملصق منفصل لكل عملية.', 'Fulfil the rest from the location that holds the stock. Each operation issues its own label.') };
      const late = isLate(o) || o.hoursAgo > 24;
      return { kind: 'fulfil', tone: late ? 'bad' : 'info', icon: late ? 'clock' : 'box', label: tx('جهّز الطلب', 'Fulfil order'),
        title: late ? tx(`متأخر: مدفوع ${age(o.hoursAgo, lang)} ولم يُجهَّز`, `Late: paid ${age(o.hoursAgo, lang)} and not fulfilled`) : tx('مدفوع وجاهز للتجهيز', 'Paid and ready to fulfil'),
        body: isMultiLocation(o) ? tx('المخزون موزع على مستودعين. اختر الموقع والكميات، ثم الناقل.', 'Stock is split across two warehouses. Choose the location and quantities, then the carrier.')
          : tx('اختر الناقل والوزن، راجع التكلفة التقديرية، ثم أصدر الملصق.', 'Choose the carrier and weight, review the estimated cost, then issue the label.') };
    }
    if (o.ship === 'label') return { kind: 'slip', tone: 'info', icon: 'print', label: tx('اطبع قائمة التعبئة', 'Print packing slip'),
      title: tx('صدر الملصق — سلّم الطرد للناقل', 'Label issued — hand the parcel to the carrier'),
      body: tx('صدور الملصق لا يعني أن الناقل استلم الطرد. أرفق قائمة التعبئة داخل الطرد.', 'An issued label does not mean the carrier has collected the parcel. Put the packing slip inside the box.') };
    if (o.ship === 'transit') return { kind: 'none', tone: 'info', icon: 'truck', title: tx('في الطريق مع الناقل', 'On its way with the carrier'), body: tx('لا شيء مطلوب منك الآن. نحدّث الحالة عند التسليم.', 'Nothing needed from you now. The state updates on delivery.') };
    return { kind: 'none', tone: 'ok', icon: 'check', title: tx('اكتمل الطلب', 'Order complete'), body: tx('سُلّم للعميل. لا شيء مطلوب منك.', 'Delivered to the customer. Nothing needed from you.') };
  };
}

export function OrderDetail({ refId, mode, backHref, backLabel, onClose }: { refId: string; mode: DetailMode; backHref: string; backLabel: string; onClose?: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useLabels();
  const { dir, state } = useView();
  const all = ordersStore.use();
  const phone = useMedia('(max-width: 720px)');
  const nextOf = useNext();
  const [dialog, setDialog] = useState<'fulfil' | 'refund' | 'contact' | null>(null);
  const [toast, setToast] = useState<{ id: number; text: ReactNode } | null>(null);
  const order = state === 'empty' ? undefined : all.find((o) => o.ref === refId);
  const panel = mode === 'panel';

  const closeBtn = panel && onClose
    ? <button type="button" className="lk-btn icon ghost" onClick={onClose} aria-label={tx('إغلاق التفاصيل (Esc)', 'Close details (Esc)')} title="Esc"><Icon name="close" /></button>
    : null;
  const crumb = !panel ? <a className="lk-crumb" href={backHref}><Icon name="back" size="sm" />{backLabel}</a> : null;

  if (state === 'loading') return <>{!panel && <SrHeading>{tx(`جارٍ تحميل الطلب #${refId}`, `Loading order #${refId}`)}</SrHeading>}<DetailSkeleton panel={panel} crumb={crumb} closeBtn={closeBtn} /></>;
  if (state === 'error') return (
    <div className={panel ? 'ord-panel-in' : 'lk-page ord-page'}>
      {crumb}{panel && <div className="ord-panel-top">{closeBtn}</div>}
      <div className="ord-sec"><EmptyState as={panel ? 'h2' : 'h1'} tone="bad" icon="alert" title={tx('تعذّر تحميل الطلب', 'This order could not load')}
        action={<button type="button" className="lk-btn primary" onClick={() => reviewStore.set((s) => ({ ...s, state: 'live' }))}>{tx('أعد المحاولة', 'Try again')}</button>}>
        {tx(`لم يتغير شيء في الطلب \u2066#${refId}\u2069؛ الدفع والشحن كما هما. التفاصيل فقط لم تصل.`, `Nothing changed on order #${refId}; payment and shipment are as they were. Only the details failed to arrive.`)}
      </EmptyState></div>
    </div>
  );
  if (!order) return (
    <div className={panel ? 'ord-panel-in' : 'lk-page ord-page'}>
      {crumb}{panel && <div className="ord-panel-top">{closeBtn}</div>}
      <div className="ord-sec"><EmptyState as={panel ? 'h2' : 'h1'} icon="search" title={tx(`لا يوجد طلب برقم \u2066#${refId}\u2069`, `No order #${refId}`)}
        action={<a className="lk-btn primary" href={backHref}>{tx('العودة إلى الطلبات', 'Back to orders')}</a>}>
        {tx('ربما الرقم غير صحيح أو أن الطلب من متجر آخر. ابحث في القائمة برقم الطلب أو اسم العميل.', 'The number may be wrong, or the order belongs to another store. Search the list by order number or customer name.')}
      </EmptyState></div>
    </div>
  );

  const o = order;
  const next = nextOf(o);
  const sharedMenu = !panel && dir === 'b';
  const printSlip = () => {
    saveOrder({ ...o, slips: o.slips + 1, log: [...o.log, { when: 'now', who: 'you', kind: 'slipPrinted' }] });
    setToast({ id: Date.now(), text: tx('أُرسلت قائمة التعبئة للطابعة (محاكاة).', 'Packing slip sent to the printer (simulated).') });
  };
  const runPrimary = () => {
    if (next.kind === 'fulfil') setDialog('fulfil');
    else if (next.kind === 'contact') setDialog('contact');
    else if (next.kind === 'slip') printSlip();
  };
  const primary = next.label ? (
    <button type="button" className="lk-btn brand" onClick={runPrimary}>{next.label}</button>
  ) : null;
  const more = (
    <Menu label={tx('إجراءات أخرى', 'More actions')} className="ord-more" align="end" button={<><Icon name="more" size="sm" />{!panel && !phone && <span>{tx('المزيد', 'More')}</span>}</>}>
      {(close) => <>
        {next.kind !== 'slip' && o.pay !== 'failed' && <MenuItem onClick={() => { close(); printSlip(); }} hint={<Sim />}>{tx('اطبع قائمة التعبئة', 'Print packing slip')}</MenuItem>}
        {canRefund(o)
          ? <MenuItem onClick={() => { close(); setDialog('refund'); }}>{tx('استرداد أو مرتجع', 'Refund or return')}</MenuItem>
          : <span className="ord-menu-note">{o.pay === 'failed' ? tx('لا استرداد: لم يُحصَّل مبلغ', 'No refund: nothing was collected') : tx('لا مبلغ متبقٍ للاسترداد', 'Nothing left to refund')}</span>}
        <MenuItem onClick={() => { close(); void navigator.clipboard?.writeText(`#${o.ref}`).catch(() => undefined); setToast({ id: Date.now(), text: tx(`نُسخ الرقم \u2066#${o.ref}\u2069.`, `Copied #${o.ref}.`) }); }}>{tx('انسخ رقم الطلب', 'Copy order number')}</MenuItem>
        {o.pay !== 'failed' && next.kind !== 'contact' && <MenuItem onClick={() => { close(); setDialog('contact'); }}>{tx('راسل العميل', 'Message customer')}</MenuItem>}
      </>}
    </Menu>
  );

  const states = (
    <dl className="ord-states">
      <div><dt>{tx('الدفع', 'Payment')}</dt><dd><Pill tone={PAY_TONE[o.pay]} icon={PAY_ICON[o.pay]}>{L.pay(o.pay)}</Pill></dd></div>
      <div><dt>{tx('التجهيز', 'Fulfilment')}</dt><dd><Pill tone={o.pay === 'failed' ? 'idle' : FUL_TONE[o.ful]} icon={FUL_ICON[o.ful]}>{L.ful(o.ful)}</Pill></dd></div>
      <div><dt>{tx('الشحن', 'Shipment')}</dt><dd><Pill tone={SHIP_TONE[o.ship]} icon={SHIP_ICON[o.ship]}>{L.ship(o.ship)}</Pill></dd></div>
      <div className="ord-states-total"><dt>{tx('الإجمالي', 'Total')}</dt><dd><Money v={total(o)} figure /></dd></div>
    </dl>
  );

  const header = (
    <header className={`ord-dhead${panel ? ' panel' : ''}`}>
      <div className="ord-dhead-top">
        <div className="lk-col lk-grow" style={{ minWidth: 0, gap: 2 }}>
          <span className="lk-eyebrow">{tx('طلب', 'Order')}</span>
          <h1 className={panel ? 'lk-h1' : 'lk-display'}><Ref>#{o.ref}</Ref></h1>
          <span className="lk-small lk-2 ord-meta">
            {!panel && <span>{o.customer[lang]}</span>}
            <span>{age(o.hoursAgo, lang)}</span>
            <span>{L.channel(o.channel)}</span>
            {o.pay !== 'failed' && <span>{o.confirmed ? tx('مؤكد', 'Confirmed') : tx('غير مؤكد بعد', 'Not confirmed yet')}</span>}
          </span>
        </div>
        {(!sharedMenu || phone) && !phone && <div className="ord-dhead-actions">{more}{primary}</div>}
        {closeBtn}
      </div>
      {states}
    </header>
  );

  const nextCard = (
    <div className={`ord-next ${next.tone}`} role="status">
      <div className="lk-col lk-grow" style={{ gap: 2 }}>
        <span className="lk-eyebrow ord-next-eb"><span className="ord-dot" aria-hidden="true" />{tx('الخطوة التالية', 'Next step')}</span>
        <h2 className="lk-h3">{next.title}</h2>
        <p className="lk-small lk-2">{next.body}</p>
      </div>
    </div>
  );

  const multi = isMultiLocation(o);
  const items = (
    <section className="ord-sec" aria-labelledby={`it-${o.ref}`}>
      <div className="ord-sec-h">
        <h2 id={`it-${o.ref}`} className="lk-h2 lk-grow">{tx('المنتجات', 'Items')} <span className="lk-count">{units(o)}</span></h2>
        {multi && <span className="lk-tag">{tx('من موقعين', 'Two locations')}</span>}
      </div>
      <ul className="ord-lines">
        {o.items.map((it, i) => {
          const f = fulfilledQty(o, i), r = refundedQty(o, i);
          return (
            <li key={it.sku + i}>
              <Thumb src={itemImage(it)} alt={it.name[lang]} size="lg" />
              <div className="lk-col lk-grow" style={{ minWidth: 0, gap: 2 }}>
                <span className="lk-strong lk-truncate">{it.name[lang]}</span>
                <span className="lk-micro lk-3"><Ref>{it.sku}</Ref></span>
                {(multi || f > 0 || r > 0) && (
                  <span className="ord-line-tags">
                    {f > 0 && <span className={`ord-hint ${f === it.qty ? 'ok' : ''}`}>{tx(`مجهّز ${f} من ${it.qty}`, `${f} of ${it.qty} fulfilled`)}</span>}
                    {r > 0 && <span className="ord-hint">{tx(`مسترد ${r}`, `${r} refunded`)}</span>}
                    {multi && it.stock && Object.entries(it.stock).map(([loc, n]) => (
                      <span key={loc} className={`ord-hint${!n ? ' dim' : ''}`}>{loc === 'jed' ? tx('جدة', 'Jeddah') : tx('الرياض', 'Riyadh')} <b className="lk-num">{n}</b></span>
                    ))}
                  </span>
                )}
              </div>
              <div className="ord-line-amt">
                <Money v={it.qty * it.unit} strong />
                <span className="lk-micro lk-3 lk-num"><bdi dir="ltr">{it.qty} ×</bdi> {formatMoney(it.unit)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {multi && <p className="ord-card-note lk-micro lk-3">{tx('الأرقام بجانب المدن هي المخزون المتوفر لكل سطر في كل مستودع.', 'Numbers next to each city are the stock available for that line in each warehouse.')}</p>}
    </section>
  );

  const parcels = o.fulfilments.length > 0 && (
    <section className="ord-sec" aria-labelledby={`pc-${o.ref}`}>
      <div className="ord-sec-h"><h2 id={`pc-${o.ref}`} className="lk-h2 lk-grow">{tx('الطرود', 'Parcels')} <span className="lk-count">{o.fulfilments.length}</span></h2></div>
      <ul className="ord-rows">
        {o.fulfilments.map((f) => {
          const n = f.qty.reduce((a, b) => a + b, 0);
          return (
            <li key={f.ref}>
                            <div className="lk-col lk-grow" style={{ minWidth: 0 }}>
                <span className="lk-strong"><Ref>{f.ref}</Ref></span>
                <span className="lk-micro lk-3">{LOCATIONS[f.loc][lang]} · {tx(`${n} قطع`, `${n} ${n === 1 ? 'item' : 'items'}`)}</span>
              </div>
              <Pill tone={SHIP_TONE[o.ship]} icon={SHIP_ICON[o.ship]}>{L.ship(o.ship === 'none' ? 'label' : o.ship)}</Pill>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const settle = (id: string, ok: boolean) => {
    const nextO = settleRefund(o, id, ok);
    saveOrder(nextO);
    const r = nextO.refunds.find((x) => x.id === id)!;
    financeStore.set((f) => ({ ...f, txs: ok ? f.txs.map((t) => (t.id === `TX-${id}` ? refundTx(nextO, r, t.id, 'PO-2611-04', true) : t)) : f.txs.filter((t) => t.id !== `TX-${id}`) }));
    setToast({ id: Date.now(), text: ok ? tx(`أكد المزوّد الاسترداد ${id}.`, `The provider confirmed refund ${id}.`) : tx(`رفض المزوّد الاسترداد ${id}. لم يُخصم شيء.`, `The provider declined refund ${id}. Nothing was deducted.`) });
  };
  const refunds = o.refunds.length > 0 && (
    <section className="ord-sec" aria-labelledby={`rf-${o.ref}`}>
      <div className="ord-sec-h"><h2 id={`rf-${o.ref}`} className="lk-h2 lk-grow">{tx('الاستردادات', 'Refunds')}</h2></div>
      <ul className="ord-rows">
        {o.refunds.map((r) => {
          const st: [Tone, IconName, string] = r.status === 'pending' ? ['warn', 'clock', tx('بانتظار المزوّد', 'Awaiting provider')] : r.status === 'confirmed' ? ['ok', 'check', tx('أكّده المزوّد', 'Confirmed')] : ['bad', 'alert', tx('رفضه المزوّد', 'Declined')];
          const rs = r.restock.reduce((a, b) => a + b, 0);
          return (
            <li key={r.id} className="ord-refund">
              <div className="lk-row" style={{ gap: 12 }}>
                                <div className="lk-col lk-grow" style={{ minWidth: 0 }}>
                  <span className="lk-row lk-wrap" style={{ gap: 8 }}><span className="lk-strong"><Ref>{r.id}</Ref></span><Pill tone={st[0]} icon={st[1]}>{st[2]}</Pill></span>
                  <span className="lk-micro lk-3">{r.reason}{r.shipping ? tx(' · يشمل الشحن', ' · includes shipping') : ''} · {rs ? tx(`أُعيد ${rs} للمخزون في ${LOCATIONS[r.loc].ar}`, `${rs} restocked at ${LOCATIONS[r.loc].en}`) : tx('بلا إعادة للمخزون', 'no restock')}</span>
                </div>
                <span className={r.status === 'failed' ? 'ord-strike' : undefined}><Money v={r.amount} strong /></span>
              </div>
              {r.status === 'pending' && (
                <TestControl title={tx('أداة اختبار · رد مزوّد الدفع', 'Test control · payment provider answer')}>
                  <div className="lk-row lk-wrap">
                    <button type="button" className="lk-btn sm" onClick={() => settle(r.id, true)}>{tx('المزوّد يؤكد', 'Provider confirms')}</button>
                    <button type="button" className="lk-btn sm" onClick={() => settle(r.id, false)}>{tx('المزوّد يرفض', 'Provider declines')}</button>
                  </div>
                </TestControl>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );

  const confirmedRefunds = o.refunds.filter((r) => r.status === 'confirmed').reduce((s, r) => s + r.amount, 0);
  const pendingRefunds = o.refunds.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
  const money = (
    <section className="ord-sec" aria-labelledby={`mn-${o.ref}`}>
      <div className="ord-sec-h"><h2 id={`mn-${o.ref}`} className="lk-h2 lk-grow">{tx('المبلغ', 'Payment')}</h2><Pill tone={PAY_TONE[o.pay]} icon={PAY_ICON[o.pay]}>{L.pay(o.pay)}</Pill></div>
      <dl className="ord-money">
        <div><dt>{tx(`المنتجات (${units(o)})`, `Items (${units(o)})`)}</dt><dd><Money v={subtotal(o)} /></dd></div>
        <div><dt>{tx('الشحن', 'Shipping')}</dt><dd>{o.fee ? <Money v={o.fee} /> : <span className="lk-2">{tx('مجاني', 'Free')}</span>}</dd></div>
        <div className="sub"><dt>{tx('منها ضريبة القيمة المضافة 15%', 'Includes 15% VAT')}</dt><dd><Money v={vatIncluded(o)} /></dd></div>
        <div className="sum"><dt>{tx('الإجمالي', 'Total')}</dt><dd><Money v={total(o)} strong /></dd></div>
        {o.pay === 'failed' && <div className="bad"><dt>{tx('المحصّل', 'Collected')}</dt><dd><Money v={0} /></dd></div>}
        {confirmedRefunds > 0 && <div><dt>{tx('مسترد (مؤكد)', 'Refunded (confirmed)')}</dt><dd>−<Money v={confirmedRefunds} /></dd></div>}
        {pendingRefunds > 0 && <div className="warn"><dt>{tx('استرداد معلّق', 'Refund pending')}</dt><dd>−<Money v={pendingRefunds} /></dd></div>}
        {o.pay !== 'failed' && <div className="sum"><dt>{tx('الصافي', 'Net')}</dt><dd><Money v={total(o) - refundedTotal(o)} strong /></dd></div>}
      </dl>
      {o.pay !== 'failed' && refundedTotal(o) > 0 && <p className="ord-card-note lk-micro lk-3">{tx('المتاح للاسترداد:', 'Available to refund:')} <Money v={refundable(o)} /></p>}
      {o.settled && <p className="ord-card-note lk-micro lk-3">{tx('دخل في تحويل أُرسل؛ أي استرداد يُخصم من التحويل القادم.', 'Included in a payout already sent; any refund is deducted from the next payout.')}</p>}
    </section>
  );

  const sameCustomer = all.filter((x) => x.customer.en === o.customer.en).length;
  const customer = (
    <section className="ord-sec" aria-labelledby={`cu-${o.ref}`}>
      <div className="ord-sec-h"><h2 id={`cu-${o.ref}`} className="lk-h2 lk-grow">{tx('العميل', 'Customer')}</h2></div>
      <div className="ord-sec-b lk-col lk-gap-12">
        <div className="lk-row" style={{ gap: 12 }}>
          <Avatar name={o.customer[lang]} />
          <div className="lk-col" style={{ minWidth: 0 }}><span className="lk-strong lk-truncate">{o.customer[lang]}</span><span className="lk-micro lk-3">{L.channel(o.channel)}</span></div>
        </div>
        <div className="ord-addr"><span className="lk-small">{o.city[lang]}<br /><span className="lk-3">{tx('المملكة العربية السعودية', 'Saudi Arabia')}</span></span></div>
        {sameCustomer > 1 && <a className="ord-link lk-small" href={vhref('orders', { q: o.customer[lang] })}>{tx(`${sameCustomer} طلبات من هذا العميل`, `${sameCustomer} orders from this customer`)}<Icon name="chevron" size="xs" /></a>}
      </div>
    </section>
  );

  const timeline = <Timeline o={o} />;
  const bottomBar = (dir === 'b' && !panel) || phone;

  const body = panel ? (
    <div className="ord-dbody">{nextCard}{items}{parcels}{refunds}{money}{customer}{timeline}</div>
  ) : (
    <div className="ord-dgrid">
      <div className="lk-col lk-gap-16" style={{ minWidth: 0 }}>{nextCard}{items}{parcels}{refunds}{timeline}</div>
      <aside className="lk-col lk-gap-16" style={{ minWidth: 0 }}>{money}{customer}</aside>
    </div>
  );

  return (
    <div className={panel ? 'ord-panel-in' : `lk-page ord-page ord-detail${bottomBar ? ' has-bar' : ''}`}>
      {crumb}
      {header}
      {body}
      {bottomBar && (
        <div className="ord-actbar" role="region" aria-label={tx('إجراءات الطلب', 'Order actions')}>
          <div className="ord-actbar-in">
            <div className="lk-col lk-grow" style={{ minWidth: 0 }}>
              <span className="lk-small lk-strong"><Ref>#{o.ref}</Ref> · <Money v={total(o)} /></span>
              <span className="lk-micro lk-3 lk-truncate">{next.title}</span>
            </div>
            {more}
            {primary}
          </div>
        </div>
      )}
      <Layer>
      {dialog === 'fulfil' && <FulfilDialog order={o} onClose={() => setDialog(null)} />}
      {dialog === 'refund' && <RefundDialog order={o} onClose={(msg) => { setDialog(null); if (msg) setToast({ id: Date.now(), text: msg }); }} />}
      {dialog === 'contact' && <ContactDialog o={o} onClose={(msg) => { setDialog(null); if (msg) setToast({ id: Date.now(), text: msg }); }} />}
      {toast && <Toast key={toast.id} onClose={() => setToast(null)}>{toast.text}</Toast>}
      </Layer>
    </div>
  );
}

/** Human-readable history, newest first. */
function Timeline({ o }: { o: Order }) {
  const tx = useTx();
  const { lang } = useLang();
  const loc = (e: LogEntry) => (e.loc ? LOCATIONS[e.loc][lang] : '');
  const text = (e: LogEntry): [IconName, Tone, ReactNode] => {
    switch (e.kind) {
      case 'created': return ['orders', 'ok', tx('استُلم الطلب وتأكد الدفع', 'Order placed and payment confirmed')];
      case 'payFailed': return ['card', 'bad', tx('استُلم الطلب لكن الدفع فشل لدى المزوّد', 'Order placed but the payment failed at the provider')];
      case 'labelIssued': return ['print', 'info', <>{tx(`صدر ملصق الشحن عبر ${e.carrier ? CARRIERS[e.carrier].name.ar : 'الناقل'}`, `Shipping label issued with ${e.carrier ? CARRIERS[e.carrier].name.en : 'the carrier'}`)} · <Ref>{e.ref}</Ref></>];
      case 'labelFailed': return ['alert', 'bad', <>{tx('لم يُصدر الملصق: الناقل لم يستجب. لم يُحتسب شيء', 'Label not issued: the carrier did not respond. Nothing was charged')} · <Ref>{e.ref}</Ref></>];
      case 'confirmed': return ['check', 'ok', tx('أُكّد الطلب', 'Order marked confirmed')];
      case 'slipPrinted': return ['print', 'idle', tx('طُبعت قائمة التعبئة', 'Packing slip printed')];
      case 'partialFulfilled': return ['box', 'info', <>{tx(`جُهّزت ${e.units} قطع من ${loc(e)} وصدر ملصق${e.carrier ? ` عبر ${CARRIERS[e.carrier].name.ar}` : ''}`, `${e.units} ${e.units === 1 ? 'item' : 'items'} fulfilled from ${loc(e)}, label issued${e.carrier ? ` with ${CARRIERS[e.carrier].name.en}` : ''}`)} · <Ref>{e.ref}</Ref></>];
      case 'refundRequested': return ['return', 'warn', <>{tx('طُلب استرداد ', 'Refund of ')}<Money v={e.amount ?? 0} />{tx(' من مزوّد الدفع', ' requested from the payment provider')} · <Ref>{e.ref}</Ref></>];
      case 'refundConfirmed': return ['check', 'ok', <>{tx('أكد المزوّد استرداد ', 'Provider confirmed the refund of ')}<Money v={e.amount ?? 0} /> · <Ref>{e.ref}</Ref></>];
      case 'refundFailed': return ['alert', 'bad', <>{tx('رفض المزوّد الاسترداد؛ لم يُخصم شيء', 'Provider declined the refund; nothing was deducted')} · <Ref>{e.ref}</Ref></>];
      case 'restocked': return ['inventory', 'idle', tx(`أُعيدت ${e.units} قطع إلى المخزون في ${loc(e)}`, `${e.units} ${e.units === 1 ? 'item' : 'items'} returned to stock at ${loc(e)}`)];
    }
  };
  const entries = o.log.map((e, i) => ({ e, i })).reverse();
  return (
    <section className="ord-sec" aria-labelledby={`tl-${o.ref}`}>
      <div className="ord-sec-h"><h2 id={`tl-${o.ref}`} className="lk-h2 lk-grow">{tx('السجل', 'Timeline')}</h2><span className="lk-micro lk-3">{tx('الأحدث أولًا', 'Newest first')}</span></div>
      <ol className="ord-tl">
        {entries.map(({ e, i }) => {
          const [, tone, t] = text(e);
          return (
            <li key={i}>
              <span className={`ord-tl-dot ${tone}`} aria-hidden="true" />
              <div className="lk-col" style={{ minWidth: 0 }}>
                <span className="lk-small">{t}</span>
                <span className="lk-micro lk-3">{e.who === 'you' ? tx('أنت', 'You') : tx('النظام', 'System')} · {e.when === 'now' ? tx('في هذه الجلسة', 'this session') : age(o.hoursAgo, lang)}{['labelIssued', 'labelFailed', 'partialFulfilled', 'refundRequested', 'refundConfirmed', 'refundFailed', 'slipPrinted'].includes(e.kind) && <> · <Sim /></>}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Failed payment: the next step is a conversation, not fulfilment. The message is copied for the merchant's own channel. */
function ContactDialog({ o, onClose }: { o: Order; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const first = o.customer[lang].split(' ')[0];
  const [text, setText] = useState(o.pay === 'failed'
    ? tx(`مرحبًا ${first}، لم تكتمل عملية الدفع لطلبك #${o.ref} بمبلغ ${formatMoney(total(o))} ر.س. يمكنك إعادة المحاولة من رابط الطلب، وسنجهّزه فور تأكيد الدفع.`, `Hi ${first}, the payment for your order #${o.ref} (SAR ${formatMoney(total(o))}) did not complete. You can try again from the order link and we will prepare it as soon as payment is confirmed.`)
    : tx(`مرحبًا ${first}، بخصوص طلبك #${o.ref}: `, `Hi ${first}, about your order #${o.ref}: `));
  return (
    <Dialog title={tx(`رسالة إلى ${o.customer[lang]}`, `Message ${o.customer[lang]}`)} onClose={() => onClose()}
      footer={<>
        <button type="button" className="lk-btn" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</button>
        <button type="button" className="lk-btn primary" disabled={!text.trim()} onClick={() => { void navigator.clipboard?.writeText(text).catch(() => undefined); onClose(tx('نُسخت الرسالة. أرسلها من قناتك المعتادة.', 'Message copied. Send it from your usual channel.')); }}>{tx('انسخ الرسالة', 'Copy message')}</button>
      </>}>
      {o.pay === 'failed' && <Banner tone="bad" title={tx('لم يُحصَّل أي مبلغ', 'Nothing was collected')}>{tx('لا تجهّز الطلب قبل تأكيد الدفع.', 'Do not fulfil before payment is confirmed.')}</Banner>}
      <label className="lk-field"><span className="lk-label">{tx('نص الرسالة', 'Message')}</span>
        <textarea className="lk-textarea" value={text} onChange={(e) => setText(e.target.value)} /></label>
      <p className="lk-help">{tx('لا نرسل شيئًا من هنا في النسخة التجريبية؛ ننسخ النص لترسله بنفسك.', 'Nothing is sent from here in this prototype; the text is copied for you to send.')}</p>
    </Dialog>
  );
}

function DetailSkeleton({ panel, crumb, closeBtn }: { panel: boolean; crumb: ReactNode; closeBtn: ReactNode }) {
  const tx = useTx();
  const card = (h: number) => (
    <div className="ord-sec ord-sec-b lk-col lk-gap-16" style={{ paddingTop: 20 }}>
      <Skeleton w="30%" h={16} />
      {Array.from({ length: Math.max(1, Math.round(h / 60)) }, (_, i) => <div key={i} className="lk-row" style={{ gap: 14 }}><Skeleton w={48} h={48} r={10} /><span className="lk-col lk-grow lk-gap-4"><Skeleton w="55%" /><Skeleton w="35%" h={10} /></span><Skeleton w={70} /></div>)}
    </div>
  );
  return (
    <div className={panel ? 'ord-panel-in' : 'lk-page ord-page'} role="status" aria-busy="true" aria-label={tx('جارٍ تحميل الطلب', 'Loading order')}>
      {crumb}
      <header className={`ord-dhead${panel ? ' panel' : ''}`} aria-hidden="true">
        <div className="ord-dhead-top"><div className="lk-col lk-grow lk-gap-4"><Skeleton w={50} h={10} /><Skeleton w={140} h={28} /><Skeleton w={220} h={12} /></div>{!panel && <Skeleton w={130} h={40} r={8} />}{closeBtn}</div>
        <div className="ord-states">{[0, 1, 2].map((i) => <div key={i}><Skeleton w={60} h={10} /><Skeleton w={90} h={24} r={99} /></div>)}</div>
      </header>
      <div className={panel ? 'ord-dbody' : 'ord-dgrid'} aria-hidden="true">
        <div className="lk-col lk-gap-16">{card(72)}{card(180)}{card(140)}</div>
        {!panel && <div className="lk-col lk-gap-16">{card(160)}{card(100)}</div>}
      </div>
    </div>
  );
}
