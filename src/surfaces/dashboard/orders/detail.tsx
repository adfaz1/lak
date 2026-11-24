// Order detail (`#/dashboard/orders/<ref>`): what state is this order in, and what is the one thing to do next?
import { useState, type ReactNode } from 'react';
import {
  AlarmClock, CheckCircle2, Copy, CreditCard, MapPin, MessageSquare, MoreHorizontal, PackageCheck, PackageOpen, Printer, RotateCcw, SearchX, Truck, Lock, Boxes,
} from 'lucide-react';
import { useLang } from '../../../core/lang';
import type { Route } from '../../../core/router';
import { financeStore, ordersStore, testStore } from '../../merchant/stores';
import { CARRIERS, LOCATIONS, canRefund, settleRefund, type LogEntry, type Order } from '../../merchant/domain';
import { refundTx } from '../../merchant/finance';
import { PageHeader, Simulated, useToast } from '../../../ds/kit';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, LinkButton, Money, ProductImage, Ref, Skeleton, cn, toneDot, useTx, type Tone } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { setDashState, useDashState } from '../review';
import { SIMULATED_KINDS, customerOrderCount, lineViews, moneyBreakdown, nextAction, orderPerms, printSlip, readQuery, timeline, toParams, type Next } from './model';
import { FulBadge, Menu, MenuButtonLabel, MenuItem, MenuNote, PayBadge, ReviewOnly, Row, ShipBadge, ohref, saveOrder, useAge, useLabels } from './ui';
import { FulfilModal } from './fulfil';
import { ContactModal, RefundModal } from './refund';

type Dialog = 'fulfil' | 'refund' | 'contact' | null;

export default function OrderDetail({ refId, route }: { refId: string; route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useLabels();
  const age = useAge();
  const toast = useToast();
  const state = useDashState();
  const all = ordersStore.use();
  const perms = orderPerms(testStore.use().role);
  const [dialog, setDialog] = useState<Dialog>(null);
  const backHref = ohref('', toParams(readQuery(route.query)));
  const back = { href: backHref, label: tx('الطلبات', 'Orders') };
  const o = state === 'empty' ? undefined : all.find((x) => x.ref === refId);

  if (!perms.see) return (
    <div className="space-y-6"><PageHeader back={back} title={<Ref>#{refId}</Ref>} />
      <Card><EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('لا تملك صلاحية عرض الطلبات', 'You do not have access to orders')}>{tx('اطلب من مالك المتجر إضافة صلاحية الطلبات إلى دورك.', 'Ask the store owner to add orders to your role.')}</EmptyState></Card>
    </div>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={<Ref>#{refId}</Ref>} /><DetailSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6"><PageHeader back={back} title={<Ref>#{refId}</Ref>} />
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل الطلب', 'This order could not load')} onRetry={() => setDashState('live')}>
        {tx('لم يتغير شيء في الطلب؛ الدفع والشحن كما هما. المرجع SIM-ORD-503.', 'Nothing changed on the order; payment and shipment are as they were. Ref SIM-ORD-503.')}
      </ErrorState></Card>
    </div>
  );
  if (!o) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('طلب غير موجود', 'Order not found')} />
      <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={<>{tx('لا يوجد طلب برقم ', 'No order ')}<Ref>#{refId}</Ref></>}
        action={<LinkButton href={ohref('', { q: refId.replace(/\D/g, '') || undefined })}>{tx('ابحث في الطلبات', 'Search orders')}</LinkButton>}>
        {tx('ربما الرقم غير صحيح أو أن الطلب من متجر آخر.', 'The number may be wrong, or the order belongs to another store.')}
      </EmptyState></Card>
    </div>
  );

  const next = nextAction(o);
  const m = moneyBreakdown(o);
  const lines = lineViews(o);
  const multi = lines.some((l) => l.stock.length > 0);
  const allowed = next.kind === 'contact' ? perms.contact : next.kind === 'none' ? false : perms.fulfil;
  const primaryLabel = next.kind === 'contact' ? tx('تواصل مع العميل', 'Contact customer') : next.kind === 'fulfilRest' ? tx('جهّز المتبقي', 'Fulfil remaining') : tx('جهّز الطلب', 'Fulfil order');
  const PrimaryIcon = next.kind === 'contact' ? MessageSquare : PackageCheck;
  const runPrimary = () => setDialog(next.kind === 'contact' ? 'contact' : 'fulfil');
  const primary = (cls?: string) => (next.kind !== 'none' && allowed ? <Button onClick={runPrimary} className={cls}><PrimaryIcon className="size-4" aria-hidden="true" />{primaryLabel}</Button> : null);

  const slip = () => { saveOrder(printSlip(o)); toast({ tone: 'ok', text: tx('أُرسلت قائمة التعبئة للطابعة (محاكاة)', 'Packing slip sent to the printer (simulated)') }); };
  const more = (up?: boolean, compact?: boolean) => (
    <Menu label={tx('إجراءات أخرى', 'More actions')} up={up} button={<MenuButtonLabel icon={<MoreHorizontal className="size-4" aria-hidden="true" />}>{!compact && tx('المزيد', 'More')}</MenuButtonLabel>}>
      {(close) => <>
        {o.pay !== 'failed' && <MenuItem icon={<Printer className="size-4" />} hint={<Simulated />} onClick={() => { close(); slip(); }}>{tx('اطبع قائمة التعبئة', 'Print packing slip')}</MenuItem>}
        {canRefund(o)
          ? perms.refund ? <MenuItem icon={<RotateCcw className="size-4" />} onClick={() => { close(); setDialog('refund'); }}>{tx('استرداد أو مرتجع', 'Refund or return')}</MenuItem>
            : <MenuNote>{tx('الاسترداد يحتاج دور المالك أو المالية', 'Refunds need the owner or finance role')}</MenuNote>
          : <MenuNote>{o.pay === 'failed' ? tx('لا استرداد: لم يُحصَّل مبلغ', 'No refund: nothing was collected') : tx('لا مبلغ متبقٍ للاسترداد', 'Nothing left to refund')}</MenuNote>}
        {o.pay !== 'failed' && perms.contact && <MenuItem icon={<MessageSquare className="size-4" />} onClick={() => { close(); setDialog('contact'); }}>{tx('راسل العميل', 'Message customer')}</MenuItem>}
        <MenuItem icon={<Copy className="size-4" />} onClick={() => { close(); void navigator.clipboard?.writeText(`#${o.ref}`).catch(() => undefined); toast({ tone: 'info', text: tx(`نُسخ #${o.ref}`, `Copied #${o.ref}`) }); }}>{tx('انسخ رقم الطلب', 'Copy order number')}</MenuItem>
      </>}
    </Menu>
  );

  const settle = (id: string, ok: boolean) => {
    const after = settleRefund(o, id, ok);
    saveOrder(after);
    const r = after.refunds.find((x) => x.id === id)!;
    const payout = financeStore.get().payouts.find((p) => p.status === 'scheduled')?.id;
    financeStore.set((f) => ({ ...f, txs: ok ? f.txs.map((t) => (t.id === `TX-${id}` ? refundTx(after, r, t.id, payout, true) : t)) : f.txs.filter((t) => t.id !== `TX-${id}`) }));
    toast({ tone: ok ? 'ok' : 'bad', text: ok ? tx(`أكد المزوّد الاسترداد ${id}`, `Provider confirmed refund ${id}`) : tx(`رفض المزوّد الاسترداد ${id}؛ لم يُخصم شيء`, `Provider declined refund ${id}; nothing was deducted`) });
  };

  const closeDialog = (msg?: string) => { setDialog(null); if (msg) toast({ tone: 'ok', text: msg }); };

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHeader back={back} title={<Ref>#{o.ref}</Ref>}
        meta={<span className="flex flex-wrap items-center gap-x-2 text-sm text-muted"><span>{age(o.hoursAgo)}</span><span aria-hidden="true">·</span><span>{L.channel(o.channel)}</span><span aria-hidden="true">·</span><span>{o.customer[lang]}</span>
          {o.pay !== 'failed' && o.ful === 'none' && <><span aria-hidden="true">·</span><span>{o.confirmed ? tx('مؤكد', 'Confirmed') : tx('غير مؤكد', 'Not confirmed')}</span></>}</span>}
        actions={<div className="hidden items-center gap-2 md:flex">{more()}{primary('bg-brand-gradient hover:opacity-95')}</div>} />

      <Card>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl sm:grid-cols-4">
          {[
            [tx('الدفع', 'Payment'), <PayBadge o={o} />],
            [tx('التجهيز', 'Fulfilment'), <FulBadge o={o} />],
            [tx('الشحن', 'Shipment'), <ShipBadge o={o} />],
            [tx('الإجمالي', 'Total'), <Money v={m.total} className="text-lg font-bold text-fg" />],
          ].map(([k, v], i) => <div key={i} className="space-y-1.5 bg-surface px-5 py-4"><dt className="text-xs text-muted">{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <NextCard o={o} next={next} allowed={allowed} />

          <Card aria-labelledby="h-items">
            <CardHeader id="h-items" title={<>{tx('المنتجات', 'Items')} <span className="text-sm font-normal text-muted tabular-nums">{m.units}</span></>}
              hint={multi ? tx('الأرقام بجانب كل مستودع هي المخزون المتاح لهذا السطر هناك.', 'Numbers by each warehouse are the stock available there for that line.') : undefined}
              action={multi ? <Badge tone="sky" icon={<Boxes className="size-3.5" aria-hidden="true" />}>{tx('من مستودعين', 'Two locations')}</Badge> : undefined} />
            <ul className="divide-y divide-border !border-t !border-border">
              {o.items.map((it, i) => {
                const lv = lines[i];
                return (
                  <li key={it.sku + i} className="flex items-start gap-3 px-5 py-4">
                    <ProductImage src={skuPhoto(it.sku)} alt={it.name[lang]} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">{it.name[lang]}</p>
                      <p className="text-xs text-muted"><Ref>{it.sku}</Ref></p>
                      {(lv.stock.length > 0 || lv.fulfilled > 0 || lv.refunded > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {lv.fulfilled > 0 && <Badge tone={lv.remaining === 0 ? 'green' : 'amber'}>{tx(`مجهّز ${lv.fulfilled} من ${it.qty}`, `${lv.fulfilled} of ${it.qty} fulfilled`)}</Badge>}
                          {lv.refunded > 0 && <Badge tone="gray">{tx(`مسترد ${lv.refunded}`, `${lv.refunded} refunded`)}</Badge>}
                          {lv.stock.map((s) => <Badge key={s.loc} tone={s.n ? 'sky' : 'gray'} icon={<MapPin className="size-3" aria-hidden="true" />}>{LOCATIONS[s.loc][lang]} <b className="tabular-nums">{s.n}</b></Badge>)}
                        </div>
                      )}
                    </div>
                    <div className="text-end">
                      <Money v={it.qty * it.unit} className="text-sm font-semibold text-fg" />
                      <p className="text-xs text-muted tabular-nums"><span dir="ltr" className="inline-flex items-baseline gap-1">{it.qty} × <Money v={it.unit} /></span></p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {o.fulfilments.length > 0 && (
            <Card aria-labelledby="h-parcels">
              <CardHeader id="h-parcels" title={tx('الطرود', 'Parcels')} />
              <ul className="divide-y divide-border !border-t !border-border">
                {o.fulfilments.map((f) => {
                  const n = f.qty.reduce((a, b) => a + b, 0);
                  return (
                    <li key={f.ref} className="flex items-center gap-3 px-5 py-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300" aria-hidden="true"><Truck className="size-4" /></span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg"><Ref>{f.ref}</Ref></p><p className="text-xs text-muted">{LOCATIONS[f.loc][lang]} · {tx(`${n} قطع`, `${n} ${n === 1 ? 'item' : 'items'}`)}</p></div>
                      <ShipBadge o={o} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {o.refunds.length > 0 && (
            <Card aria-labelledby="h-refunds">
              <CardHeader id="h-refunds" title={tx('الاستردادات', 'Refunds')} hint={tx('يبقى الاسترداد معلّقًا حتى يؤكده مزوّد الدفع. الإعادة للمخزون قرار منفصل.', 'A refund stays pending until the payment provider confirms. Restocking is a separate decision.')} />
              <ul className="divide-y divide-border !border-t !border-border">
                {o.refunds.map((r) => {
                  const st: [Tone, string] = r.status === 'pending' ? ['amber', tx('بانتظار المزوّد', 'Awaiting provider')] : r.status === 'confirmed' ? ['green', tx('أكّده المزوّد', 'Confirmed')] : ['red', tx('رفضه المزوّد', 'Declined')];
                  const rs = r.restock.reduce((a, b) => a + b, 0);
                  return (
                    <li key={r.id} className="space-y-3 px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg"><Ref>{r.id}</Ref><Badge tone={st[0]}>{st[1]}</Badge></p>
                          <p className="mt-0.5 text-xs text-muted">{r.reason}{r.shipping ? tx(' · يشمل الشحن', ' · incl. shipping') : ''} · {rs ? tx(`أُعيد ${rs} إلى ${LOCATIONS[r.loc].ar}`, `${rs} restocked at ${LOCATIONS[r.loc].en}`) : tx('بلا إعادة للمخزون', 'no restock')}</p>
                        </div>
                        <Money v={r.amount} className={cn('text-sm font-semibold text-fg', r.status === 'failed' && 'line-through opacity-60')} />
                      </div>
                      {r.status === 'pending' && (
                        <ReviewOnly>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="me-auto flex items-center gap-2 text-sm text-fg">{tx('رد مزوّد الدفع', 'Payment provider answer')}<Simulated /></span>
                            <Button size="sm" variant="secondary" onClick={() => settle(r.id, true)}>{tx('المزوّد يؤكد', 'Provider confirms')}</Button>
                            <Button size="sm" variant="secondary" onClick={() => settle(r.id, false)}>{tx('المزوّد يرفض', 'Provider declines')}</Button>
                          </div>
                        </ReviewOnly>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Timeline o={o} age={age} />
        </div>

        <aside className="min-w-0 space-y-6">
          <Card aria-labelledby="h-money">
            <CardHeader id="h-money" title={tx('المبلغ', 'Money')} action={<PayBadge o={o} />} />
            <div className="px-5 pb-5"><dl>
              <Row label={tx(`المنتجات (${m.units})`, `Items (${m.units})`)}><Money v={m.subtotal} /></Row>
              <Row label={tx('الشحن', 'Shipping')}>{m.shipping ? <Money v={m.shipping} /> : tx('مجاني', 'Free')}</Row>
              <Row label={tx('منها ضريبة القيمة المضافة 15%', 'Incl. 15% VAT')} tone="muted"><Money v={m.vat} /></Row>
              <div className="my-1 border-t border-border" />
              <Row label={tx('الإجمالي', 'Total')} strong><Money v={m.total} /></Row>
              {o.pay === 'failed' && <Row label={tx('المحصّل', 'Collected')} tone="red"><Money v={0} /></Row>}
              {m.refunded > 0 && <Row label={tx('مسترد', 'Refunded')}><span className="inline-flex items-baseline">−<Money v={m.refunded} /></span></Row>}
              {m.refundPending > 0 && <Row label={tx('استرداد معلّق', 'Refund pending')} tone="amber"><span className="inline-flex items-baseline">−<Money v={m.refundPending} /></span></Row>}
              <div className="my-1 border-t border-border" />
              <Row label={<span className="flex items-center gap-1">{tx('الصافي', 'Net')}<InfoHint>{tx('المحصّل ناقص الاستردادات التي أكدها المزوّد. المعلّق لا يُخصم حتى التأكيد.', 'Collected minus provider-confirmed refunds. A pending refund is deducted only once confirmed.')}</InfoHint></span>} strong><Money v={m.net} /></Row>
              {o.pay !== 'failed' && m.refundable < m.total && <Row label={tx('المتاح للاسترداد', 'Available to refund')} tone="muted"><Money v={m.refundable} /></Row>}
            </dl></div>
            {o.settled && <p className="border-t border-border px-5 py-3 text-xs text-muted">{tx('دخل في تحويل أُرسل؛ أي استرداد يُخصم من التحويل القادم.', 'Included in a payout already sent; any refund comes from the next payout.')}</p>}
          </Card>

          <Card aria-labelledby="h-customer">
            <CardHeader id="h-customer" title={tx('العميل', 'Customer')} />
            <div className="space-y-4 px-5 pb-5">
              <div className="flex items-center gap-3">
                <Avatar name={o.customer[lang]} />
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-fg">{o.customer[lang]}</p><p className="text-xs text-muted">{L.channel(o.channel)}</p></div>
              </div>
              <p className="flex items-start gap-2 text-sm text-fg"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" /><span>{o.city[lang]}<span className="block text-xs text-muted">{tx('المملكة العربية السعودية', 'Saudi Arabia')}</span></span></p>
              <div className="flex flex-wrap gap-2">
                {customerOrderCount(all, o) > 1 && <LinkButton variant="secondary" size="sm" href={ohref('', { q: o.customer[lang] })}>{tx(`${customerOrderCount(all, o)} طلبات`, `${customerOrderCount(all, o)} orders`)}</LinkButton>}
                {perms.contact && next.kind !== 'contact' && <Button variant="ghost" size="sm" onClick={() => setDialog('contact')}><MessageSquare className="size-4" aria-hidden="true" />{tx('راسل', 'Message')}</Button>}
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden" role="region" aria-label={tx('إجراءات الطلب', 'Order actions')}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg"><Ref>#{o.ref}</Ref></p><Money v={m.total} className="text-xs text-muted" /></div>
          {more(true, true)}
          {primary()}
        </div>
      </div>

      {dialog === 'fulfil' && <FulfilModal order={o} onClose={closeDialog} />}
      {dialog === 'refund' && <RefundModal order={o} onClose={closeDialog} />}
      {dialog === 'contact' && <ContactModal o={o} onClose={closeDialog} />}
    </div>
  );
}

function NextCard({ o, next, allowed }: { o: Order; next: Next; allowed: boolean }) {
  const tx = useTx();
  const age = useAge();
  const T: Record<Next['reason'], [Tone, ReactNode, string, string]> = {
    payFailed: ['red', <CreditCard className="size-5" />, tx('الدفع لم يكتمل، لا تجهّز الطلب', 'Payment did not complete; do not fulfil'), tx('لم يُحصَّل أي مبلغ. اطلب من العميل إعادة الدفع.', 'Nothing was collected. Ask the customer to pay again.')],
    late: ['red', <AlarmClock className="size-5" />, tx(`متأخر: مدفوع ${age(o.hoursAgo)} ولم يُجهَّز`, `Late: paid ${age(o.hoursAgo)}, not fulfilled`), tx('الطلبات المدفوعة تُجهَّز خلال 24 ساعة.', 'Paid orders should be fulfilled within 24 hours.')],
    ready: ['brand', <PackageCheck className="size-5" />, tx('مدفوع وجاهز للتجهيز', 'Paid and ready to fulfil'), tx('اختر الموقع والناقل والوزن، راجع التكلفة، ثم أصدر الملصق.', 'Choose location, carrier and weight, review the cost, then issue the label.')],
    partial: ['amber', <PackageOpen className="size-5" />, tx(`مجهّز جزئيًا، بقي ${next.remaining}`, `Partly fulfilled, ${next.remaining} left`), tx('جهّز المتبقي من الموقع الذي فيه المخزون؛ لكل عملية ملصق.', 'Fulfil the rest from the location holding stock; each operation has its own label.')],
    refundPending: ['amber', <RotateCcw className="size-5" />, tx('استرداد بانتظار مزوّد الدفع', 'Refund awaiting the payment provider'), tx('لا تخبر العميل بوصول المبلغ قبل التأكيد.', 'Do not tell the customer the money arrived until confirmed.')],
    refunded: ['gray', <RotateCcw className="size-5" />, tx('مسترد بالكامل', 'Refunded in full'), tx('لا شيء مطلوب منك.', 'Nothing needed from you.')],
    labelIssued: ['sky', <Printer className="size-5" />, tx('صدر الملصق: سلّم الطرد للناقل', 'Label issued: hand the parcel to the carrier'), tx('صدور الملصق لا يعني استلام الناقل للطرد.', 'An issued label does not mean the carrier has collected it.')],
    inTransit: ['sky', <Truck className="size-5" />, tx('في الطريق مع الناقل', 'On its way with the carrier'), tx('لا شيء مطلوب منك الآن.', 'Nothing needed from you now.')],
    delivered: ['green', <CheckCircle2 className="size-5" />, tx('سُلّم للعميل', 'Delivered'), tx('لا شيء مطلوب منك.', 'Nothing needed from you.')],
  };
  const [tone, icon, title, hint] = T[next.reason];
  const TINT: Record<Tone, string> = { red: 'bg-red-500/10 text-red-600 dark:text-red-400', brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300', amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-300', sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', gray: 'bg-surface-2 text-muted' };
  return (
    <Card className="flex items-center gap-4 px-5 py-4" role="status" aria-label={tx('الخطوة التالية', 'Next step')}>
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', TINT[tone])} aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{tx('الخطوة التالية', 'Next step')}</p>
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-fg"><span className={cn('size-1.5 shrink-0 rounded-full', toneDot[tone])} aria-hidden="true" />{title}<InfoHint>{hint}</InfoHint></p>
        {next.kind !== 'none' && !allowed && <p className="mt-0.5 text-xs text-muted">{next.kind === 'contact' ? tx('التواصل مع العميل يحتاج دورًا آخر', 'Contacting customers needs another role') : tx('التجهيز يحتاج دور المالك أو التجهيز', 'Fulfilment needs the owner or fulfilment role')}</p>}
      </div>
    </Card>
  );
}

function Timeline({ o, age }: { o: Order; age: (h: number) => string }) {
  const tx = useTx();
  const { lang } = useLang();
  const loc = (e: LogEntry) => (e.loc ? LOCATIONS[e.loc][lang] : '');
  const carrier = (e: LogEntry) => (e.carrier ? CARRIERS[e.carrier].name[lang] : '');
  const text = (e: LogEntry): [Tone, ReactNode] => {
    switch (e.kind) {
      case 'created': return ['green', tx('استُلم الطلب وتأكد الدفع', 'Order placed, payment confirmed')];
      case 'payFailed': return ['red', tx('استُلم الطلب وفشل الدفع لدى المزوّد', 'Order placed; payment failed at the provider')];
      case 'labelIssued': return ['sky', <>{tx('صدر ملصق الشحن', 'Shipping label issued')}{e.carrier && ` · ${carrier(e)}`} · <Ref>{e.ref}</Ref></>];
      case 'labelFailed': return ['red', <>{tx('لم يصدر الملصق: الناقل لم يستجب', 'Label not issued: carrier did not respond')} · <Ref>{e.ref}</Ref></>];
      case 'confirmed': return ['green', tx('أُكّد الطلب', 'Order confirmed')];
      case 'slipPrinted': return ['gray', tx('طُبعت قائمة التعبئة', 'Packing slip printed')];
      case 'partialFulfilled': return ['sky', <>{tx(`جُهّز ${e.units} من ${loc(e)} وصدر ملصق`, `${e.units} fulfilled from ${loc(e)}, label issued`)}{e.carrier && ` · ${carrier(e)}`} · <Ref>{e.ref}</Ref></>];
      case 'refundRequested': return ['amber', <>{tx('طُلب استرداد ', 'Refund of ')}<Money v={e.amount ?? 0} />{tx(' من المزوّد', ' requested')} · <Ref>{e.ref}</Ref></>];
      case 'refundConfirmed': return ['green', <>{tx('أكد المزوّد استرداد ', 'Provider confirmed refund of ')}<Money v={e.amount ?? 0} /> · <Ref>{e.ref}</Ref></>];
      case 'refundFailed': return ['red', <>{tx('رفض المزوّد الاسترداد؛ لم يُخصم شيء', 'Provider declined the refund; nothing deducted')} · <Ref>{e.ref}</Ref></>];
      case 'restocked': return ['gray', tx(`أُعيد ${e.units} إلى المخزون في ${loc(e)}`, `${e.units} returned to stock at ${loc(e)}`)];
    }
  };
  return (
    <Card aria-labelledby="h-tl">
      <CardHeader id="h-tl" title={tx('النشاط', 'Activity')} action={<span className="text-xs text-muted">{tx('الأحدث أولًا', 'Newest first')}</span>} />
      <div className="px-5 pb-5"><ol>
        {timeline(o).map(({ e, i }, k, arr) => {
          const [tone, t] = text(e);
          return (
            <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
              {k < arr.length - 1 && <span className="absolute top-4 bottom-0 start-[5px] w-px bg-border" aria-hidden="true" />}
              <span className={cn('relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface', toneDot[tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{t}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">{e.who === 'you' ? tx('أنت', 'You') : tx('النظام', 'System')} · {e.when === 'now' ? tx('في هذه الجلسة', 'this session') : age(o.hoursAgo)}{SIMULATED_KINDS.includes(e.kind) && <Simulated />}</p>
              </div>
            </li>
          );
        })}
      </ol></div>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2 bg-surface px-5 py-4"><Skeleton className="h-3 w-16" /><Skeleton className="h-6 w-24 rounded-full" /></div>)}</div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Skeleton className="h-20 rounded-2xl" />
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-14 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/4" /></div><Skeleton className="h-4 w-16" /></div>)}</div>
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <div className="space-y-6"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>
      </div>
    </div>
  );
}
