// Order detail (`#/dashboard/orders/<ref>`): what state is this order in, and what is the one thing to do next?
import { useState, type ReactNode } from 'react';
import {
  AlarmClock, Ban, CheckCircle2, Copy, CreditCard, ExternalLink, FileText, Gift, Hourglass, Mail, MapPin, MessageSquare, MoreHorizontal, PackageCheck, PackageOpen,
  Phone, Printer, RotateCcw, SearchX, StickyNote, Tag, Truck, Lock, Boxes, UserRound, X,
} from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate, type Route } from '../../../core/router';
import { customersStore, financeStore, ordersStore, teamStore, testStore } from '../../merchant/stores';
import { CARRIERS, LOCATIONS, settleRefund, type LogEntry, type Order } from '../../merchant/domain';
import {
  addNote, addTag, assign, entries, heldFor, parcelShip, payView, placedAt, removeTag, stamp,
  type Activity, type Entry,
} from '../../merchant/ops';
import { refundTx } from '../../merchant/finance';
import { Input, PageHeader, Simulated, useToast } from '../../../ds/kit';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, IconButton, InfoHint, LinkButton, Money, ProductImage, Ref, Skeleton, cn, toneDot, useTx, type Tone } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { setDashState, useDashState } from '../review';
import { canRefundOrder, contactOf, customerOrderCount, lineViews, moneyBreakdown, nextAction, orderPerms, readQuery, toParams, type Next } from './model';
import { FulBadge, Menu, MenuButtonLabel, MenuItem, MenuNote, PayBadge, ReviewOnly, Row, ShipBadge, SHIP_TONE, ohref, saveOrder, useActor, useAge, useLabels, useRoleLabel } from './ui';
import { FulfilModal } from './fulfil';
import { ContactModal, RefundModal } from './refund';
import { CancelModal, DeclineCancelModal, OpenReturnModal, ShipModal } from './ops-modals';
import { printHref } from './print-link';
import { rhref } from './returns-link';

type Dialog = 'fulfil' | 'refund' | 'contact' | 'cancel' | 'decline' | 'ship' | 'deliver' | 'return' | null;

export default function OrderDetail({ refId, route }: { refId: string; route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useLabels();
  const age = useAge();
  const toast = useToast();
  const state = useDashState();
  const all = ordersStore.use();
  const role = testStore.use().role;
  const perms = orderPerms(role);
  const who = useActor();
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
  const canCancel = perms.fulfil && (m.refundable === 0 || perms.refund);
  const allowed = next.kind === 'contact' ? perms.contact : next.kind === 'none' ? false : next.kind === 'cancelRequest' ? canCancel : next.kind === 'returns' ? perms.fulfil || perms.refund : perms.fulfil;
  const primaryLabel: Record<Next['kind'], string> = {
    contact: tx('تواصل مع العميل', 'Contact customer'), fulfilRest: tx('جهّز المتبقي', 'Fulfil remaining'), fulfil: tx('جهّز الطلب', 'Fulfil order'),
    ship: tx('سُلّم للناقل', 'Mark as shipped'), deliver: tx('سُلّم للعميل', 'Mark as delivered'), cancelRequest: tx('راجع طلب الإلغاء', 'Review cancel request'),
    returns: tx('تابع المرتجع', 'Handle the return'), none: '',
  };
  const PrimaryIcon = next.kind === 'contact' ? MessageSquare : next.kind === 'ship' || next.kind === 'deliver' ? Truck : next.kind === 'cancelRequest' ? Ban : next.kind === 'returns' ? RotateCcw : PackageCheck;
  const openRet = (o.returns ?? []).find((r) => r.stage !== 'rejected' && r.stage !== 'refunded' && r.stage !== 'exchanged');
  const runPrimary = () => {
    if (next.kind === 'returns' && openRet) { navigate(rhref(openRet.id)); return; }
    setDialog(next.kind === 'contact' ? 'contact' : next.kind === 'ship' ? 'ship' : next.kind === 'deliver' ? 'deliver' : next.kind === 'cancelRequest' ? 'cancel' : 'fulfil');
  };
  const primary = (cls?: string) => (next.kind !== 'none' && allowed ? <Button onClick={runPrimary} className={cls}><PrimaryIcon className="size-4" aria-hidden="true" />{primaryLabel[next.kind]}</Button> : null);
  const contact = contactOf(o, customersStore.get());
  const seeContact = perms.contact || perms.fulfil;

  const more = (up?: boolean, compact?: boolean) => (
    <Menu label={tx('إجراءات أخرى', 'More actions')} up={up} button={<MenuButtonLabel icon={<MoreHorizontal className="size-4" aria-hidden="true" />}>{!compact && tx('المزيد', 'More')}</MenuButtonLabel>}>
      {(close) => <>
        {o.pay !== 'failed' && <MenuItem icon={<FileText className="size-4" />} onClick={() => { close(); navigate(printHref('invoice', [o.ref])); }}>{tx('اطبع الفاتورة الضريبية', 'Print tax invoice')}</MenuItem>}
        {o.pay !== 'failed' && !o.cancelled && <MenuItem icon={<Printer className="size-4" />} onClick={() => { close(); navigate(printHref('slip', [o.ref])); }}>{tx('اطبع قائمة التعبئة', 'Print packing slip')}</MenuItem>}
        {o.ship !== 'none' && !o.cancelled && <MenuItem icon={<Printer className="size-4" />} onClick={() => { close(); navigate(printHref('label', [o.ref])); }}>{tx('اطبع ملصق الشحن', 'Print shipping label')}</MenuItem>}
        {perms.fulfil && next.kind !== 'ship' && o.fulfilments.some((_, i) => parcelShip(o, i) === 'label') && <MenuItem icon={<Truck className="size-4" />} onClick={() => { close(); setDialog('ship'); }}>{tx('سُلّم للناقل', 'Mark as shipped')}</MenuItem>}
        {perms.fulfil && next.kind !== 'deliver' && o.fulfilments.some((_, i) => parcelShip(o, i) === 'transit') && <MenuItem icon={<CheckCircle2 className="size-4" />} onClick={() => { close(); setDialog('deliver'); }}>{tx('سُلّم للعميل', 'Mark as delivered')}</MenuItem>}
        {canRefundOrder(o)
          ? perms.refund ? <MenuItem icon={<RotateCcw className="size-4" />} onClick={() => { close(); setDialog('refund'); }}>{tx('استرداد مبلغ', 'Refund money')}</MenuItem>
            : <MenuNote>{tx('الاسترداد يحتاج دور المالك أو المالية', 'Refunds need the owner or finance role')}</MenuNote>
          : !o.cancelled && <MenuNote>{m.pay === 'cod_due' ? tx('لا استرداد قبل تحصيل الدفع عند الاستلام', 'No refund before cash on delivery is collected') : o.pay === 'failed' ? tx('لا استرداد: لم يُحصَّل مبلغ', 'No refund: nothing was collected') : tx('لا مبلغ متبقٍ للاسترداد', 'Nothing left to refund')}</MenuNote>}
        {(o.ship === 'transit' || o.ship === 'delivered' || o.fulfilments.some((_, i) => parcelShip(o, i) === 'delivered')) && !o.cancelled && (perms.fulfil || perms.refund) && <MenuItem icon={<RotateCcw className="size-4" />} onClick={() => { close(); setDialog('return'); }}>{tx('افتح مرتجعًا أو استبدالًا', 'Open a return or exchange')}</MenuItem>}
        {o.pay !== 'failed' && perms.contact && <MenuItem icon={<MessageSquare className="size-4" />} onClick={() => { close(); setDialog('contact'); }}>{tx('راسل العميل', 'Message customer')}</MenuItem>}
        <MenuItem icon={<Copy className="size-4" />} onClick={() => { close(); void navigator.clipboard?.writeText(`#${o.ref}`).catch(() => undefined); toast({ tone: 'info', text: tx(`نُسخ #${o.ref}`, `Copied #${o.ref}`) }); }}>{tx('انسخ رقم الطلب', 'Copy order number')}</MenuItem>
        {!o.cancelled && (canCancel
          ? <MenuItem icon={<Ban className="size-4" />} onClick={() => { close(); setDialog('cancel'); }}>{tx('ألغِ الطلب', 'Cancel order')}</MenuItem>
          : <MenuNote>{tx('إلغاء طلب مدفوع يحتاج دور المالك', 'Cancelling a paid order needs the owner role')}</MenuNote>)}
      </>}
    </Menu>
  );

  const settle = (id: string, ok: boolean) => {
    const after = stamp(o, settleRefund(o, id, ok), { name: 'system', role: 'system' }, Date.now());
    saveOrder(after);
    const r = after.refunds.find((x) => x.id === id)!;
    const payout = financeStore.get().payouts.find((p) => p.status === 'scheduled')?.id;
    financeStore.set((f) => ({ ...f, txs: ok ? f.txs.map((t) => (t.id === `TX-${id}` ? refundTx(after, r, t.id, payout, true) : t)) : f.txs.filter((t) => t.id !== `TX-${id}`) }));
    toast({ tone: ok ? 'ok' : 'bad', text: ok ? tx(`أكد المزوّد الاسترداد ${id}`, `Provider confirmed refund ${id}`) : tx(`رفض المزوّد الاسترداد ${id}؛ لم يُخصم شيء`, `Provider declined refund ${id}; nothing was deducted`) });
  };

  const closeDialog = (msg?: string) => { setDialog(null); if (msg) toast({ tone: 'ok', text: msg }); };

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHeader back={back} title={<span className="flex flex-wrap items-center gap-2"><Ref>#{o.ref}</Ref>{o.cancelled && <Badge tone="gray" icon={<Ban className="size-3.5" aria-hidden="true" />}>{tx('ملغى', 'Cancelled')}</Badge>}{o.manual && <Badge tone="gray">{tx('يدوي', 'Manual')}</Badge>}</span>}
        meta={<span className="flex flex-wrap items-center gap-x-2 text-sm text-muted"><span>{age(o.hoursAgo)}</span><span aria-hidden="true">·</span><span>{L.channel(o.channel)}</span><span aria-hidden="true">·</span><span>{o.customer[lang]}</span>
          {o.pay !== 'failed' && o.ful === 'none' && !o.cancelled && <><span aria-hidden="true">·</span><span>{o.confirmed ? tx('مؤكد', 'Confirmed') : tx('غير مؤكد', 'Not confirmed')}</span></>}</span>}
        actions={<div className="hidden items-center gap-2 md:flex">{more()}{primary('bg-brand-gradient hover:opacity-95')}</div>} />

      {o.cancelled && (
        <Card className="flex items-start gap-3 border-red-500/30 px-5 py-4">
          <Ban className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <div className="min-w-0 text-sm"><p className="font-semibold text-fg">{tx('أُلغي الطلب', 'Order cancelled')}</p><p className="text-muted">{o.cancelled.reason} · {o.cancelled.by === 'customer' ? tx('العميل', 'Customer') : o.cancelled.by} · <When at={o.cancelled.at} /></p></div>
        </Card>
      )}

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
          <NextCard o={o} next={next} allowed={allowed} onDecline={canCancel && o.cancelRequest?.state === 'open' ? () => setDialog('decline') : undefined} />

          <Card aria-labelledby="h-items">
            <CardHeader id="h-items" title={<>{tx('المنتجات', 'Items')} <span className="text-sm font-normal text-muted tabular-nums">{m.units}</span></>}
              hint={multi ? tx('الأرقام بجانب كل مستودع هي المخزون المتاح لهذا السطر هناك.', 'Numbers by each warehouse are the stock available there for that line.') : undefined}
              action={multi ? <Badge tone="sky" icon={<Boxes className="size-3.5" aria-hidden="true" />}>{tx('من أكثر من موقع', 'Several locations')}</Badge> : undefined} />
            <ul className="divide-y divide-border !border-t !border-border">
              {o.items.map((it, i) => {
                const lv = lines[i];
                const held = heldFor(o, i);
                return (
                  <li key={it.sku + i} className="flex items-start gap-3 px-5 py-4">
                    <ProductImage src={skuPhoto(it.sku)} alt={it.name[lang]} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">{it.name[lang]}</p>
                      <p className="text-xs text-muted">{it.variant && <>{it.variant[lang]} · </>}<Ref>{it.sku}</Ref></p>
                      {(lv.stock.length > 0 || lv.fulfilled > 0 || lv.refunded > 0 || held.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {lv.fulfilled > 0 && <Badge tone={lv.remaining === 0 ? 'green' : 'amber'}>{tx(`مجهّز ${lv.fulfilled} من ${it.qty}`, `${lv.fulfilled} of ${it.qty} fulfilled`)}</Badge>}
                          {lv.refunded > 0 && <Badge tone="gray">{tx(`مسترد ${lv.refunded}`, `${lv.refunded} refunded`)}</Badge>}
                          {held.map(([loc, n]) => <Badge key={`h${loc}`} tone="brand" icon={<Lock className="size-3" aria-hidden="true" />}>{tx(`محجوز ${n} · ${LOCATIONS[loc].ar}`, `${n} held · ${LOCATIONS[loc].en}`)}</Badge>)}
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
              <CardHeader id="h-parcels" title={tx('الطرود', 'Parcels')} hint={o.fulfilments.length > 1 ? tx('لكل طرد ملصق وحالة مستقلة.', 'Each parcel has its own label and state.') : undefined} />
              <ul className="divide-y divide-border !border-t !border-border">
                {o.fulfilments.map((f, i) => {
                  const n = f.qty.reduce((a, b) => a + b, 0);
                  const st = parcelShip(o, i);
                  const voided = !!o.cancelled && st === 'none';
                  return (
                    <li key={f.ref} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300" aria-hidden="true"><Truck className="size-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg"><Ref>{f.ref}</Ref>{f.tracking && <span className="ms-2 text-xs font-normal text-muted">{tx('تتبّع', 'Tracking')} <Ref>{f.tracking}</Ref></span>}</p>
                        <p className="text-xs text-muted">{LOCATIONS[f.loc][lang]} · {tx(`${n} قطع`, `${n} ${n === 1 ? 'item' : 'items'}`)}{f.carrier && ` · ${CARRIERS[f.carrier].name[lang]}`}</p>
                      </div>
                      {voided ? <Badge tone="gray">{tx('أُلغي الملصق', 'Label voided')}</Badge> : <Badge tone={SHIP_TONE[st]}>{L.ship(st)}</Badge>}
                      {!voided && st !== 'none' && <a className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link(`/store/track/${o.ref}`)} target="_blank" rel="noreferrer">{tx('رابط التتبع', 'Tracking link')}<ExternalLink className="size-3" aria-hidden="true" /></a>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {(o.returns?.length ?? 0) > 0 && (
            <Card aria-labelledby="h-returns">
              <CardHeader id="h-returns" title={tx('المرتجعات والاستبدال', 'Returns & exchanges')} />
              <ul className="divide-y divide-border !border-t !border-border">
                {o.returns!.map((r) => (
                  <li key={r.id}>
                    <a href={rhref(r.id)} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                      <RotateCcw className="size-4 text-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-sm"><span className="font-semibold text-fg"><Ref>{r.id}</Ref></span><span className="block text-xs text-muted">{r.source === 'store' ? tx('من المتجر', 'From the store') : tx('أنشأه الفريق', 'Opened by staff')} · {tx(`${r.lines.reduce((s, l) => s + l.qty, 0)} قطع`, `${r.lines.reduce((s, l) => s + l.qty, 0)} items`)}{r.exchange && ` · ${tx('استبدال', 'exchange')}`}</span></span>
                      <Badge tone={r.stage === 'rejected' ? 'gray' : r.stage === 'refunded' || r.stage === 'exchanged' ? 'green' : 'amber'}>{L.stage(r.stage)}</Badge>
                    </a>
                  </li>
                ))}
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

          <Timeline o={o} />
        </div>

        <aside className="min-w-0 space-y-6">
          <Card aria-labelledby="h-money">
            <CardHeader id="h-money" title={tx('المبلغ', 'Money')} action={<PayBadge o={o} />} />
            <div className="px-5 pb-5"><dl>
              <Row label={tx(`المنتجات (${m.units})`, `Items (${m.units})`)}><Money v={m.subtotal} /></Row>
              {m.discount > 0 && <Row label={<span className="flex items-center gap-1.5">{tx('الخصم', 'Discount')}{m.coupon && <Badge tone="brand" icon={<Tag className="size-3" aria-hidden="true" />}><Ref>{m.coupon}</Ref></Badge>}</span>}><span className="inline-flex items-baseline text-emerald-700 dark:text-emerald-400">−<Money v={m.discount} /></span></Row>}
              <Row label={tx('الشحن', 'Shipping')}>{m.shipping ? <Money v={m.shipping} /> : tx('مجاني', 'Free')}</Row>
              <Row label={tx('منها ضريبة القيمة المضافة 15%', 'Incl. 15% VAT')} tone="muted"><Money v={m.vat} /></Row>
              <div className="my-1 border-t border-border" />
              <Row label={tx('الإجمالي', 'Total')} strong><Money v={m.total} /></Row>
              {m.pay === 'cod_due' && !o.cancelled && <Row label={<span className="flex items-center gap-1">{tx('يُحصّل عند التسليم', 'To collect on delivery')}<InfoHint>{tx('الدفع عند الاستلام: لا يُحتسب محصّلًا حتى التسليم.', 'Cash on delivery: not counted as collected until delivered.')}</InfoHint></span>} tone="amber"><Money v={m.codDue} /></Row>}
              {m.pay === 'verifying' && <Row label={tx('بانتظار تحقق المزوّد', 'Awaiting provider check')} tone="amber"><Money v={m.total} /></Row>}
              {(o.pay === 'failed' || m.pay === 'cod_due') && <Row label={tx('المحصّل', 'Collected')} tone={o.pay === 'failed' && m.pay !== 'verifying' ? 'red' : 'muted'}><Money v={0} /></Row>}
              {m.refunded > 0 && <Row label={tx('مسترد', 'Refunded')}><span className="inline-flex items-baseline">−<Money v={m.refunded} /></span></Row>}
              {m.refundPending > 0 && <Row label={tx('استرداد معلّق', 'Refund pending')} tone="amber"><span className="inline-flex items-baseline">−<Money v={m.refundPending} /></span></Row>}
              <div className="my-1 border-t border-border" />
              <Row label={<span className="flex items-center gap-1">{tx('الصافي', 'Net')}<InfoHint>{tx('المحصّل ناقص الاستردادات التي أكدها المزوّد. المعلّق لا يُخصم حتى التأكيد.', 'Collected minus provider-confirmed refunds. A pending refund is deducted only once confirmed.')}</InfoHint></span>} strong><Money v={m.net} /></Row>
              {m.refundable > 0 && m.refundable < m.total && <Row label={tx('المتاح للاسترداد', 'Available to refund')} tone="muted"><Money v={m.refundable} /></Row>}
            </dl></div>
            {o.settled && <p className="border-t border-border px-5 py-3 text-xs text-muted">{tx('دخل في تحويل أُرسل؛ أي استرداد يُخصم من التحويل القادم.', 'Included in a payout already sent; any refund comes from the next payout.')}</p>}
          </Card>

          <Card aria-labelledby="h-customer">
            <CardHeader id="h-customer" title={tx('العميل', 'Customer')} action={contact.id ? <a className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link(`/dashboard/customers/${contact.id}`)}>{tx('الملف', 'Profile')}</a> : undefined} />
            <div className="space-y-3 px-5 pb-5">
              <div className="flex items-center gap-3">
                <Avatar name={o.customer[lang]} />
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-fg">{o.customer[lang]}</p><p className="text-xs text-muted">{L.channel(o.channel)}</p></div>
              </div>
              <p className="flex items-start gap-2 text-sm text-fg"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                <span>{seeContact && contact.address && <span className="block">{contact.address}</span>}{contact.city[lang] || o.city[lang]}<span className="block text-xs text-muted">{tx('المملكة العربية السعودية', 'Saudi Arabia')}</span></span></p>
              {seeContact ? <>
                {contact.phone && <p className="flex items-center gap-2 text-sm text-fg"><Phone className="size-4 shrink-0 text-muted" aria-hidden="true" /><bdi dir="ltr" className="tabular-nums">{contact.phone}</bdi></p>}
                {contact.email && <p className="flex items-center gap-2 text-sm text-fg"><Mail className="size-4 shrink-0 text-muted" aria-hidden="true" /><span className="truncate">{contact.email}</span></p>}
              </> : <p className="text-xs text-muted">{tx('الجوال والبريد مخفيان لدورك', 'Phone and email are hidden for your role')}</p>}
              {o.address?.notes && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-fg"><b>{tx('ملاحظة العنوان: ', 'Address note: ')}</b>{o.address.notes}</p>}
              {o.customerNote && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-fg"><b>{tx('ملاحظة العميل: ', 'Customer note: ')}</b>{o.customerNote}</p>}
              {o.gift && <p className="flex items-start gap-2 rounded-xl bg-brand-500/10 px-3 py-2 text-xs text-fg"><Gift className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span><b>{tx('هدية', 'Gift')}</b>{o.gift.to && ` · ${o.gift.to}`}{o.gift.message && <span className="block">«{o.gift.message}»</span>}<span className="block text-muted">{tx('قائمة التعبئة تُطبع بلا أسعار', 'The packing slip prints without prices')}</span></span></p>}
              <div className="flex flex-wrap gap-2">
                {customerOrderCount(all, o) > 1 && <LinkButton variant="secondary" size="sm" href={ohref('', { q: o.customer[lang] })}>{tx(`${customerOrderCount(all, o)} طلبات`, `${customerOrderCount(all, o)} orders`)}</LinkButton>}
                {perms.contact && next.kind !== 'contact' && <Button variant="ghost" size="sm" onClick={() => setDialog('contact')}><MessageSquare className="size-4" aria-hidden="true" />{tx('راسل', 'Message')}</Button>}
              </div>
            </div>
          </Card>

          <Organise o={o} canEdit={perms.fulfil || perms.contact} who={who} />
          <Notes o={o} canAdd={perms.fulfil || perms.contact || perms.refund} who={who} />
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
      {dialog === 'cancel' && <CancelModal o={o} onClose={closeDialog} />}
      {dialog === 'decline' && <DeclineCancelModal o={o} onClose={closeDialog} />}
      {dialog === 'ship' && <ShipModal o={o} to="transit" onClose={closeDialog} />}
      {dialog === 'deliver' && <ShipModal o={o} to="delivered" onClose={closeDialog} />}
      {dialog === 'return' && <OpenReturnModal o={o} onClose={(msg, id) => { closeDialog(msg); if (id) navigate(rhref(id)); }} />}
    </div>
  );
}

/** Date and time in Riyadh, in the page language. */
export function When({ at }: { at: number }) {
  const { lang } = useLang();
  const f = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
  return <time dateTime={new Date(at).toISOString()}>{f.format(at)}</time>;
}

function Organise({ o, canEdit, who }: { o: Order; canEdit: boolean; who: { name: string; role: string } }) {
  const tx = useTx();
  const members = teamStore.use().members.filter((m) => m.status === 'active');
  const [tag, setTag] = useState('');
  const now = () => Date.now();
  return (
    <Card aria-labelledby="h-org">
      <CardHeader id="h-org" title={tx('التنظيم', 'Organise')} />
      <div className="space-y-4 px-5 pb-5">
        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg"><UserRound className="size-4 text-muted" aria-hidden="true" />{tx('المسؤول', 'Assignee')}</span>
          <select disabled={!canEdit} value={o.assignee ?? ''} onChange={(e) => saveOrder(assign(o, e.target.value || undefined, who, now()))}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg disabled:opacity-60">
            <option value="">{tx('غير مسند', 'Unassigned')}</option>
            {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </label>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fg"><Tag className="size-4 text-muted" aria-hidden="true" />{tx('الوسوم', 'Tags')}</p>
          <div className="flex flex-wrap gap-1.5">
            {(o.tags ?? []).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pe-1 ps-2.5 text-xs font-medium text-fg">
                <a href={ohref('', { tag: t })} className="hover:underline">{t}</a>
                {canEdit && <IconButton label={tx(`احذف الوسم ${t}`, `Remove tag ${t}`)} className="size-6" onClick={() => saveOrder(removeTag(o, t, who, now()))}><X className="size-3" /></IconButton>}
              </span>
            ))}
            {!(o.tags ?? []).length && <span className="text-xs text-muted">{tx('لا وسوم', 'No tags')}</span>}
          </div>
          {canEdit && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!tag.trim()) return; saveOrder(addTag(o, tag, who, now())); setTag(''); }}>
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={tx('مثال: VIP', 'e.g. VIP')} aria-label={tx('وسم جديد', 'New tag')} className="h-9" />
              <Button type="submit" size="sm" variant="secondary" disabled={!tag.trim()}>{tx('أضف', 'Add')}</Button>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}

function Notes({ o, canAdd, who }: { o: Order; canAdd: boolean; who: { name: string; role: string } }) {
  const tx = useTx();
  const [text, setText] = useState('');
  return (
    <Card aria-labelledby="h-notes">
      <CardHeader id="h-notes" title={<span className="flex items-center gap-1.5">{tx('ملاحظات داخلية', 'Internal notes')}<InfoHint>{tx('لا يراها العميل. تظهر في السجل.', 'Never shown to the customer. Added to the activity log.')}</InfoHint></span>} />
      <div className="space-y-3 px-5 pb-5">
        {(o.notes ?? []).length === 0 && <p className="text-xs text-muted">{tx('لا ملاحظات بعد', 'No notes yet')}</p>}
        <ul className="space-y-2">
          {[...(o.notes ?? [])].reverse().map((n) => (
            <li key={n.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg"><StickyNote className="me-1.5 inline size-3.5 text-muted" aria-hidden="true" />{n.text}<span className="mt-0.5 block text-xs text-muted">{n.by} · <When at={n.at} /></span></li>
          ))}
        </ul>
        {canAdd && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; saveOrder(addNote(o, text, who, Date.now())); setText(''); }}>
            <Input value={text} onChange={(e) => setText(e.target.value.slice(0, 280))} placeholder={tx('اكتب ملاحظة للفريق', 'Write a note for the team')} aria-label={tx('ملاحظة جديدة', 'New note')} className="h-9" />
            <Button type="submit" size="sm" variant="secondary" disabled={!text.trim()}>{tx('أضف', 'Add')}</Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function NextCard({ o, next, allowed, onDecline }: { o: Order; next: Next; allowed: boolean; onDecline?: () => void }) {
  const tx = useTx();
  const age = useAge();
  const T: Record<Next['reason'], [Tone, ReactNode, string, string]> = {
    payFailed: ['red', <CreditCard className="size-5" />, tx('الدفع لم يكتمل، لا تجهّز الطلب', 'Payment did not complete; do not fulfil'), tx('لم يُحصَّل أي مبلغ. اطلب من العميل إعادة الدفع.', 'Nothing was collected. Ask the customer to pay again.')],
    verifying: ['amber', <Hourglass className="size-5" />, tx('الدفع بانتظار تحقق المزوّد', 'Payment pending provider verification'), tx('لا تجهّز حتى يؤكد المزوّد. لا تطلب من العميل الدفع مرة ثانية.', 'Do not fulfil until the provider confirms. Do not ask the customer to pay again.')],
    link: ['amber', <CreditCard className="size-5" />, tx('بانتظار دفع العميل عبر الرابط', 'Waiting for the customer to pay by link'), tx('روابط الدفع تحتاج مزوّدًا من الخادم؛ هنا محاكاة.', 'Payment links need a server-side provider; simulated here.')],
    late: ['red', <AlarmClock className="size-5" />, tx(`متأخر: مدفوع ${age(o.hoursAgo)} ولم يُجهَّز`, `Late: paid ${age(o.hoursAgo)}, not fulfilled`), tx('الطلبات المدفوعة تُجهَّز خلال 24 ساعة.', 'Paid orders should be fulfilled within 24 hours.')],
    ready: ['brand', <PackageCheck className="size-5" />, payView(o) === 'cod_due' ? tx('دفع عند الاستلام، جاهز للتجهيز', 'Cash on delivery, ready to fulfil') : tx('مدفوع وجاهز للتجهيز', 'Paid and ready to fulfil'), tx('اختر الموقع والناقل والوزن، راجع التكلفة، ثم أصدر الملصق.', 'Choose location, carrier and weight, review the cost, then issue the label.')],
    partial: ['amber', <PackageOpen className="size-5" />, tx(`مجهّز جزئيًا، بقي ${next.remaining}`, `Partly fulfilled, ${next.remaining} left`), tx('جهّز المتبقي من الموقع الذي فيه المخزون؛ لكل عملية ملصق.', 'Fulfil the rest from the location holding stock; each operation has its own label.')],
    refundPending: ['amber', <RotateCcw className="size-5" />, tx('استرداد بانتظار مزوّد الدفع', 'Refund awaiting the payment provider'), tx('لا تخبر العميل بوصول المبلغ قبل التأكيد.', 'Do not tell the customer the money arrived until confirmed.')],
    refunded: ['gray', <RotateCcw className="size-5" />, tx('مسترد بالكامل', 'Refunded in full'), tx('لا شيء مطلوب منك.', 'Nothing needed from you.')],
    cancelled: ['gray', <Ban className="size-5" />, tx('ملغى', 'Cancelled'), tx('لا شيء مطلوب منك.', 'Nothing needed from you.')],
    cancelRequest: ['amber', <Ban className="size-5" />, tx('العميل طلب إلغاء الطلب', 'The customer asked to cancel'), tx('وافق فيُلغى ويُرد المبلغ، أو ارفض مع السبب.', 'Approve to cancel and refund, or decline with a reason.')],
    returnOpen: ['amber', <RotateCcw className="size-5" />, tx('مرتجع مفتوح يحتاج متابعة', 'An open return needs handling'), tx('وافق، ثم استلم وافحص، ثم قرر الرد أو الاستبدال.', 'Approve, receive and inspect, then decide refund or exchange.')],
    labelIssued: ['sky', <Printer className="size-5" />, tx('صدر الملصق: سلّم الطرد للناقل', 'Label issued: hand the parcel to the carrier'), tx('صدور الملصق لا يعني استلام الناقل للطرد.', 'An issued label does not mean the carrier has collected it.')],
    inTransit: ['sky', <Truck className="size-5" />, tx('في الطريق مع الناقل', 'On its way with the carrier'), tx('سجّل التسليم إن كان الناقل غير مربوط.', 'Mark delivered if the carrier is not connected.')],
    delivered: ['green', <CheckCircle2 className="size-5" />, tx('سُلّم للعميل', 'Delivered'), tx('لا شيء مطلوب منك.', 'Nothing needed from you.')],
  };
  const [tone, icon, title, hint] = T[next.reason];
  const TINT: Record<Tone, string> = { red: 'bg-red-500/10 text-red-600 dark:text-red-400', brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300', amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-300', sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', gray: 'bg-surface-2 text-muted' };
  return (
    <Card className="flex flex-wrap items-center gap-4 px-5 py-4" role="status" aria-label={tx('الخطوة التالية', 'Next step')}>
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', TINT[tone])} aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{tx('الخطوة التالية', 'Next step')}</p>
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-fg"><span className={cn('size-1.5 shrink-0 rounded-full', toneDot[tone])} aria-hidden="true" />{title}<InfoHint>{hint}</InfoHint></p>
        {next.kind === 'cancelRequest' && o.cancelRequest?.reason && <p className="mt-0.5 text-xs text-muted">«{o.cancelRequest.reason}»</p>}
        {next.kind !== 'none' && !allowed && <p className="mt-0.5 text-xs text-muted">{next.kind === 'contact' ? tx('التواصل مع العميل يحتاج دورًا آخر', 'Contacting customers needs another role') : tx('هذه الخطوة تحتاج دور المالك أو التجهيز', 'This step needs the owner or fulfilment role')}</p>}
      </div>
      {onDecline && <Button variant="ghost" size="sm" onClick={onDecline}>{tx('ارفض الطلب', 'Decline request')}</Button>}
    </Card>
  );
}

function Timeline({ o }: { o: Order }) {
  const tx = useTx();
  const { lang } = useLang();
  const roleLabel = useRoleLabel();
  const [allRows, setAllRows] = useState(false);
  const loc = (l?: string) => (l ? LOCATIONS[l][lang] : '');
  const carrier = (c?: LogEntry['carrier']) => (c ? CARRIERS[c].name[lang] : '');
  const logText = (e: LogEntry): [Tone, ReactNode] => {
    switch (e.kind) {
      case 'created': return ['green', o.manual ? tx('أُنشئ الطلب يدويًا', 'Order created by hand') : tx('استُلم الطلب وتأكد الدفع', 'Order placed, payment confirmed')];
      case 'payFailed': return ['red', o.payment?.state === 'verifying' ? tx('استُلم الطلب والدفع بانتظار التحقق', 'Order placed; payment pending verification') : tx('استُلم الطلب وفشل الدفع لدى المزوّد', 'Order placed; payment failed at the provider')];
      case 'labelIssued': return ['sky', <>{tx('صدر ملصق الشحن', 'Shipping label issued')}{e.carrier && ` · ${carrier(e.carrier)}`} · <Ref>{e.ref}</Ref></>];
      case 'labelFailed': return ['red', <>{tx('لم يصدر الملصق: الناقل لم يستجب', 'Label not issued: carrier did not respond')} · <Ref>{e.ref}</Ref></>];
      case 'confirmed': return ['green', tx('أُكّد الطلب', 'Order confirmed')];
      case 'slipPrinted': return ['gray', tx('طُبعت قائمة التعبئة', 'Packing slip printed')];
      case 'partialFulfilled': return ['sky', <>{tx(`جُهّز ${e.units} من ${loc(e.loc)} وصدر ملصق`, `${e.units} fulfilled from ${loc(e.loc)}, label issued`)}{e.carrier && ` · ${carrier(e.carrier)}`} · <Ref>{e.ref}</Ref></>];
      case 'refundRequested': return ['amber', <>{tx('طُلب استرداد ', 'Refund of ')}<Money v={e.amount ?? 0} />{tx(' من المزوّد', ' requested')} · <Ref>{e.ref}</Ref></>];
      case 'refundConfirmed': return ['green', <>{tx('أكد المزوّد استرداد ', 'Provider confirmed refund of ')}<Money v={e.amount ?? 0} /> · <Ref>{e.ref}</Ref></>];
      case 'refundFailed': return ['red', <>{tx('رفض المزوّد الاسترداد؛ لم يُخصم شيء', 'Provider declined the refund; nothing deducted')} · <Ref>{e.ref}</Ref></>];
      case 'restocked': return ['gray', tx(`أُعيد ${e.units} إلى المخزون في ${loc(e.loc)}`, `${e.units} returned to stock at ${loc(e.loc)}`)];
    }
  };
  const actText = (a: Activity): [Tone, ReactNode] => {
    const ref = a.ref ? <> · <Ref>{a.ref}</Ref></> : null;
    switch (a.kind) {
      case 'manualCreated': return ['green', tx('أُنشئ الطلب يدويًا', 'Order created by hand')];
      case 'confirmUndone': return ['gray', tx('تراجع عن التأكيد', 'Confirmation undone')];
      case 'cancelled': return ['red', <>{tx('أُلغي الطلب', 'Order cancelled')} · {a.text}</>];
      case 'cancelRequested': return ['amber', <>{tx('طلب العميل الإلغاء', 'Customer asked to cancel')}{a.text && ` · «${a.text}»`}</>];
      case 'cancelDeclined': return ['gray', <>{tx('رُفض طلب الإلغاء', 'Cancel request declined')}{a.text && ` · ${a.text}`}</>];
      case 'labelVoided': return ['gray', <>{tx('أُلغي الملصق لدى الناقل', 'Label voided at the carrier')}{ref}</>];
      case 'shipped': return ['sky', <>{tx('سُلّم للناقل', 'Handed to the carrier')}{ref}{a.text && <> · {tx('تتبّع', 'tracking')} <Ref>{a.text}</Ref></>}</>];
      case 'delivered': return ['green', <>{tx('سُلّم للعميل', 'Delivered to the customer')}{ref}</>];
      case 'codCollected': return ['green', <>{tx('حُصّل الدفع عند الاستلام ', 'Cash on delivery collected: ')}<Money v={a.amount ?? 0} /></>];
      case 'noteAdded': return ['gray', <>{tx('ملاحظة داخلية: ', 'Internal note: ')}{a.text}</>];
      case 'messageCopied': return ['gray', tx('نُسخت رسالة للعميل', 'Customer message copied')];
      case 'invoicePrinted': return ['gray', <>{tx('طُبعت الفاتورة الضريبية', 'Tax invoice printed')}{ref}</>];
      case 'labelPrinted': return ['gray', <>{tx('طُبع ملصق الشحن', 'Shipping label printed')}{ref}</>];
      case 'exported': return ['gray', tx('صُدّر في ملف CSV', 'Exported to CSV')];
      case 'tagAdded': return ['gray', <>{tx('أُضيف وسم ', 'Tag added: ')}{a.text}</>];
      case 'tagRemoved': return ['gray', <>{tx('حُذف وسم ', 'Tag removed: ')}{a.text}</>];
      case 'assigned': return ['gray', a.text ? <>{tx('أُسند إلى ', 'Assigned to ')}{a.text}</> : tx('أُلغي الإسناد', 'Unassigned')];
      case 'stockReserved': return ['brand', tx(`حُجز ${a.units} في المخزون`, `${a.units} reserved in stock`)];
      case 'stockReleased': return ['gray', tx(`أُطلق ${a.units} من الحجز`, `${a.units} released from reservation`)];
      case 'stockShipped': return ['gray', tx(`خرج ${a.units} من ${loc(a.loc)}`, `${a.units} left ${loc(a.loc)}`)];
      case 'returnRequested': return ['amber', <>{tx(`طُلب إرجاع ${a.units} قطع`, `Return of ${a.units} requested`)}{ref}</>];
      case 'returnApproved': return ['sky', <>{tx('وُوفق على المرتجع وصدر ملصق إرجاع', 'Return approved, return label issued')}{ref}</>];
      case 'returnRejected': return ['gray', <>{tx('رُفض المرتجع', 'Return rejected')}{ref}{a.text && ` · ${a.text}`}</>];
      case 'returnReceived': return ['sky', <>{tx('استُلم المرتجع', 'Return received')}{ref}</>];
      case 'returnInspected': return ['sky', <>{a.units ? tx(`فُحص المرتجع وأُعيد ${a.units} إلى ${loc(a.loc)}`, `Return inspected, ${a.units} back in stock at ${loc(a.loc)}`) : tx('فُحص المرتجع بلا إعادة للمخزون', 'Return inspected, nothing restocked')}{ref}</>];
      case 'returnRefunded': return ['amber', <>{tx('قُرر رد مبلغ المرتجع ', 'Return refund decided: ')}<Money v={a.amount ?? 0} />{ref}</>];
      case 'exchangeReserved': return ['brand', <>{tx(`حُجز البديل ${a.units} في ${loc(a.loc)}`, `Replacement ×${a.units} held at ${loc(a.loc)}`)}{ref}</>];
      case 'exchangeShipped': return ['sky', <>{tx('شُحن البديل', 'Replacement shipped')}{ref}</>];
      case 'exchangeCollect': return ['amber', <>{tx('فرق سعر يُحصّل من العميل ', 'Price difference to collect: ')}<Money v={a.amount ?? 0} />{ref}</>];
    }
  };
  const SIM = new Set(['labelIssued', 'labelFailed', 'partialFulfilled', 'refundRequested', 'refundConfirmed', 'refundFailed', 'slipPrinted', 'labelVoided', 'returnApproved', 'exchangeShipped']);
  const list = entries(o, Date.now()).reverse();
  const shown = allRows ? list : list.slice(0, 12);
  const actor = (x: Entry) => (x.actor === 'system' ? tx('النظام', 'System') : x.actor === 'customer' ? tx('العميل', 'Customer') : x.actor === 'you' ? tx('أنت', 'You') : x.actor);
  return (
    <Card aria-labelledby="h-tl">
      <CardHeader id="h-tl" title={tx('السجل', 'Activity log')} action={<span className="flex items-center gap-1 text-xs text-muted">{tx('الأحدث أولًا', 'Newest first')}<InfoHint>{tx('لا يُحذف أي سطر؛ التراجع يُسجّل سطرًا جديدًا.', 'No line is ever deleted; an undo is recorded as a new line.')}</InfoHint></span>} />
      <div className="px-5 pb-5"><ol>
        {shown.map((x, k, arr) => {
          const [tone, t] = x.source === 'log' ? logText(x.e) : actText(x.a);
          const kind = x.source === 'log' ? x.e.kind : x.a.kind;
          return (
            <li key={`${x.source}${x.i}`} className="relative flex gap-3 pb-4 last:pb-0">
              {k < arr.length - 1 && <span className="absolute top-4 bottom-0 start-[5px] w-px bg-border" aria-hidden="true" />}
              <span className={cn('relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface', toneDot[tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{t}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                  <span className="font-medium text-fg/80">{actor(x)}</span>{x.role && x.role !== 'system' && x.role !== 'customer' && <span>({roleLabel(x.role)})</span>}
                  <span aria-hidden="true">·</span><When at={x.at} />{SIM.has(kind) && <Simulated />}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
        {list.length > 12 && <Button variant="ghost" size="sm" className="mt-3" onClick={() => setAllRows((v) => !v)}>{allRows ? tx('اعرض أقل', 'Show less') : tx(`اعرض كل السجل (${list.length})`, `Show the full log (${list.length})`)}</Button>}
        <p className="mt-3 text-[11px] text-muted">{tx('بدأ الطلب', 'Order placed')} <When at={placedAt(o, Date.now())} /></p>
      </div>
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
