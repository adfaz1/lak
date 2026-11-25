// Packaging materials (`#/dashboard/apps?tab=packaging`): a catalogue of item types (boxes, mailers, bags, labels,
// tape, filler) without prices, a request with quantities (Arabic digits, pack steps), a preview, and a simulated status
// flow (submitted → confirmed → preparing → shipped → delivered; cancel before preparation). `?order=<id>` opens one.
// Prices, delivery and real confirmation wait on a LAK decision; the "next step" switch is review-mode only.
import { useState } from 'react';
import { Box, Check, Mail, Package, PackageOpen, ScrollText, ShoppingBasket, Sticker, X } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, type Route } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { currentActor, logAction } from '../../merchant/stores';
import { can } from '../../merchant/perms';
import {
  PACK_FLOW, PACK_ITEMS, QTY_MAX, advancePack, canCancelPack, cancelPack, linesFrom, makePackOrder, nextPackStatus, packKey, packUnits,
  type PackItem, type PackKind, type PackLine, type PackOrder, type PackStatus, type QtyErr,
} from '../../merchant/commercial';
import { packOrdersStore } from '../../merchant/commercial-store';
import { Badge, Button, Card, EmptyState, ErrorState, Ref, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, DataTable, Drawer, Field, Input, Modal, PageHeader, Simulated, Textarea, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { useSessionDraft } from '../settings/drafts';
import { DecisionMarker, Pending } from '../settings/decision-marker';
import { ReviewRole, useRole } from '../marketing/access';
import { HubTabs, hubHref } from './hub';

const K_ICON: Record<PackKind, typeof Box> = { box: Box, mailer: Mail, bag: ShoppingBasket, label: Sticker, tape: ScrollText, filler: PackageOpen };
const S_TONE: Record<PackStatus, Tone> = { submitted: 'amber', confirmed: 'sky', preparing: 'brand', shipped: 'brand', delivered: 'green', cancelled: 'gray' };

function usePackNames() {
  const tx = useTx();
  return {
    status: (s: PackStatus) => ({ submitted: tx('أُرسل · بانتظار التأكيد', 'Sent · awaiting confirmation'), confirmed: tx('مؤكد', 'Confirmed'), preparing: tx('قيد التجهيز', 'Preparing'), shipped: tx('في الطريق', 'On the way'), delivered: tx('وصل', 'Delivered'), cancelled: tx('ملغى', 'Cancelled') })[s],
    qtyErr: (e: QtyErr, it: PackItem) => ({ number: tx('عدد صحيح', 'Whole number'), step: tx(`مضاعفات ${it.step}`, `Multiples of ${it.step}`), max: tx(`الحد ${QTY_MAX}`, `Max ${QTY_MAX}`) })[e],
  };
}

export default function PackagingPage({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = usePackNames();
  const state = useDashState();
  const role = useRole();
  const all = packOrdersStore.use();
  const orders = state === 'empty' ? [] : all;
  const manage = can(role, 'apps.manage');
  const open = orders.find((o) => o.id === route.query.get('order')) ?? null;

  const header = (
    <>
      <PageHeader title={tx('مواد التغليف', 'Packaging materials')} description={tx('اطلب الكراتين والأكياس والملصقات بالكمية', 'Order boxes, bags and labels by quantity')} meta={<DecisionMarker id="packaging" />} />
      <HubTabs current="packaging" />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل الكتالوج', 'The catalogue could not load')} onRetry={() => setDashState('live')}>{tx('طلباتك السابقة محفوظة. المرجع SIM-PACK-503.', 'Your earlier requests are kept. Ref SIM-PACK-503.')}</ErrorState></Card></div>;

  const date = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const cols: Column<PackOrder>[] = [
    { key: 'id', header: tx('الطلب', 'Request'), cell: (o) => <Ref>{o.id}</Ref> },
    { key: 'lines', header: tx('المواد', 'Items'), cell: (o) => <span className="text-muted">{tx(`${o.lines.length} أصناف · ${packUnits(o.lines)} وحدة`, `${o.lines.length} items · ${packUnits(o.lines)} units`)}</span> },
    { key: 'at', header: tx('أُرسل', 'Sent'), cell: (o) => <span className="text-muted">{date(o.events[0].at)}</span>, hideBelow: 'md' },
    { key: 'st', header: tx('الحالة', 'Status'), cell: (o) => <Badge tone={S_TONE[o.status]}>{n.status(o.status)}</Badge> },
  ];
  return (
    <div className="space-y-6">
      {header}
      {manage ? <Catalogue /> : <Card className="p-5 text-sm text-muted">{tx('طلب مواد التغليف يتطلب صلاحية إدارة التطبيقات.', 'Ordering packaging needs app-management permission.')}</Card>}
      <Card aria-labelledby="h-pack-orders">
        <h2 id="h-pack-orders" className="px-5 pt-5 pb-3 text-[15px] font-semibold text-fg">{tx('طلباتك', 'Your requests')} <span className="text-sm font-normal text-muted tabular-nums">({orders.length})</span></h2>
        {orders.length === 0 ? <EmptyState icon={<Package className="size-6" aria-hidden="true" />} title={tx('لا طلبات تغليف بعد', 'No packaging requests yet')}>{tx('حدد الكميات أعلاه ثم راجع الطلب.', 'Set quantities above, then review the request.')}</EmptyState>
          : <DataTable label={tx('طلبات مواد التغليف', 'Packaging requests')} rows={orders} columns={cols} rowKey={(o) => o.id} href={(o) => hubHref('packaging', { order: o.id })}
            card={(o) => <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-fg"><Ref>{o.id}</Ref></p><p className="text-xs text-muted">{tx(`${o.lines.length} أصناف · ${packUnits(o.lines)} وحدة`, `${o.lines.length} items · ${packUnits(o.lines)} units`)}</p></div><Badge tone={S_TONE[o.status]}>{n.status(o.status)}</Badge></div>} />}
      </Card>
      {open && <OrderDrawer o={open} manage={manage} onClose={() => replace(hubHref('packaging'))} />}
    </div>
  );
}

function Catalogue() {
  const tx = useTx();
  const { lang } = useLang();
  const n = usePackNames();
  const toast = useToast();
  const [qty, setQty, clear] = useSessionDraft<Record<string, string>>('apps.packagingQty', {});
  const [deliverTo, setDeliverTo, clearTo] = useSessionDraft<string>('apps.packagingTo', '');
  const [review, setReview] = useState(false);
  const { lines, errors } = linesFrom(qty);
  const dirty = Object.values(qty).some((v) => v.trim());
  useUnsaved(dirty, { ar: 'كميات مواد التغليف', en: 'Packaging quantities' });
  const blocked = Object.keys(errors).length > 0 || lines.length === 0 || !deliverTo.trim();
  const name = (l: PackLine) => { const it = PACK_ITEMS.find((x) => x.id === l.item)!; return `${it.name[lang]} · ${it.sizes[l.size][lang]}`; };
  const submit = () => {
    const list = packOrdersStore.get();
    const o = makePackOrder(lines, deliverTo.trim(), list, currentActor().name);
    packOrdersStore.set([o, ...list]);
    logAction('apps', { ar: `أرسل طلب مواد تغليف ${o.id} (${packUnits(lines)} وحدة)`, en: `Sent packaging request ${o.id} (${packUnits(lines)} units)` }, { target: o.id });
    clear(); clearTo(); setReview(false);
    toast({ tone: 'ok', text: tx(`أُرسل الطلب ${o.id} (محاكاة)`, `Request ${o.id} sent (simulated)`) });
  };
  return (
    <section aria-labelledby="h-pack-cat" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="h-pack-cat" className="min-w-0 flex-1 text-[15px] font-semibold text-fg">{tx('الكتالوج', 'Catalogue')}</h2>
        <span className="text-xs text-muted">{tx('الأسعار:', 'Prices:')} <Pending /></span>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PACK_ITEMS.map((it) => {
          const I = K_ICON[it.kind];
          return (
            <li key={it.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <p className="flex items-center gap-2.5 text-sm font-semibold text-fg"><span className="grid size-9 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300" aria-hidden="true"><I className="size-4" /></span>{it.name[lang]}</p>
              <div className="mt-3 space-y-2.5">
                {it.sizes.map((sz, si) => {
                  const k = packKey(it.id, si);
                  const e = errors[k];
                  return (
                    <Field key={k} label={<span className="font-medium text-muted">{sz[lang]}</span>} error={e ? n.qtyErr(e, it) : null} hint={tx(`بالـ${it.unit.ar} · مضاعفات ${it.step}`, `${it.unit.en} · multiples of ${it.step}`)}>
                      {(p) => <Input {...p} inputMode="numeric" dir="ltr" className="h-9" value={qty[k] ?? ''} placeholder="0" onChange={(ev) => setQty({ ...qty, [k]: ev.target.value })} />}
                    </Field>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
        <Field className="min-w-48 flex-1" label={tx('التوصيل إلى', 'Deliver to')} error={!deliverTo.trim() && lines.length > 0 ? tx('مطلوب', 'Required') : null}>
          {(p) => <Input {...p} value={deliverTo} onChange={(ev) => setDeliverTo(ev.target.value)} placeholder={tx('المدينة والحي', 'City and district')} />}
        </Field>
        <p className="text-sm text-muted tabular-nums">{tx(`${lines.length} أصناف · ${packUnits(lines)} وحدة`, `${lines.length} items · ${packUnits(lines)} units`)}</p>
        {dirty && <Button variant="ghost" onClick={clear}>{tx('امسح', 'Clear')}</Button>}
        <Button disabled={blocked} onClick={() => setReview(true)}>{tx('راجع الطلب', 'Review request')}</Button>
      </div>
      {review && (
        <Modal title={tx('مراجعة طلب مواد التغليف', 'Review packaging request')} onClose={() => setReview(false)}
          footer={<><Button variant="secondary" onClick={() => setReview(false)}>{tx('عدّل', 'Edit')}</Button><Button onClick={submit}>{tx('أرسل الطلب', 'Send request')}</Button></>}>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">{lines.map((l) => <li key={packKey(l.item, l.size)} className="flex justify-between gap-3 px-3 py-2"><span>{name(l)}</span><bdi className="tabular-nums font-medium">{l.qty}</bdi></li>)}</ul>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">{tx('التوصيل إلى', 'Deliver to')}</dt><dd>{deliverTo}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{tx('السعر', 'Price')}</dt><dd><Pending /></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{tx('التوصيل والمدة', 'Delivery and time')}</dt><dd><Pending /></dd></div>
          </dl>
          <Alert tone="info">{tx('لا يُحصَّل أي مبلغ. يُؤكَّد الطلب بسعره قبل التجهيز، ويمكنك إلغاؤه حتى ذلك الحين.', 'Nothing is charged. The request is confirmed with its price before preparation, and you can cancel until then.')}</Alert>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('لا يصل لمورد حقيقي.', 'Reaches no real supplier.')}</p>
        </Modal>
      )}
    </section>
  );
}

function OrderDrawer({ o, manage, onClose }: { o: PackOrder; manage: boolean; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = usePackNames();
  const toast = useToast();
  const review = useReviewMode();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const next = nextPackStatus(o.status);
  const update = (fn: (x: PackOrder) => PackOrder) => packOrdersStore.set((l) => l.map((x) => (x.id === o.id ? fn(x) : x)));
  const date = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const reached = (s: PackStatus) => o.events.some((e) => e.status === s);
  return (
    <Drawer title={tx(`طلب التغليف ${o.id}`, `Packaging request ${o.id}`)} onClose={onClose}
      footer={manage && (canCancelPack(o.status) || (review && next)) ? <div className="flex flex-wrap gap-2">
        {canCancelPack(o.status) && <Button variant="danger" onClick={() => setCancelling(true)}><X className="size-4" aria-hidden="true" />{tx('ألغِ الطلب', 'Cancel request')}</Button>}
        {review && next && <Button variant="secondary" onClick={() => { update((x) => advancePack(x, 'لك (محاكاة)')); logAction('apps', { ar: `محاكاة: طلب التغليف ${o.id} ← ${n.status(next)}`, en: `Simulated: packaging request ${o.id} → ${n.status(next)}` }, { target: o.id }); }}>{tx(`حاكِ: ${n.status(next)}`, `Simulate: ${n.status(next)}`)}</Button>}
      </div> : undefined}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={S_TONE[o.status]}>{n.status(o.status)}</Badge><Simulated /></div>
        <ol className="space-y-3" aria-label={tx('مراحل الطلب', 'Request stages')}>
          {(o.status === 'cancelled' ? [...PACK_FLOW.filter(reached), 'cancelled' as PackStatus] : PACK_FLOW).map((s) => {
            const ev = o.events.find((e) => e.status === s);
            return (
              <li key={s} className="flex items-start gap-3">
                <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border', ev ? (s === 'cancelled' ? 'border-red-500 bg-red-500/10 text-red-600' : 'border-emerald-500 bg-emerald-500/10 text-emerald-600') : 'border-border text-subtle')} aria-hidden="true">{ev ? (s === 'cancelled' ? <X className="size-3.5" /> : <Check className="size-3.5" />) : null}</span>
                <span className="min-w-0 flex-1 text-sm"><span className={cn('block font-medium', ev ? 'text-fg' : 'text-muted')}>{n.status(s)}</span>{ev && <span className="block text-xs text-muted">{date(ev.at)} · {ev.by}{ev.note ? ` · ${ev.note}` : ''}</span>}</span>
              </li>
            );
          })}
        </ol>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-fg">{tx('المواد', 'Items')}</p>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">{o.lines.map((l) => { const it = PACK_ITEMS.find((x) => x.id === l.item)!; return <li key={packKey(l.item, l.size)} className="flex justify-between gap-3 px-3 py-2"><span>{it.name[lang]} · {it.sizes[l.size][lang]}</span><bdi className="tabular-nums">{l.qty}</bdi></li>; })}</ul>
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">{tx('التوصيل إلى', 'Deliver to')}</dt><dd>{o.city}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">{tx('السعر', 'Price')}</dt><dd><Pending /></dd></div>
        </dl>
        {!canCancelPack(o.status) && o.status !== 'cancelled' && o.status !== 'delivered' && <p className="text-xs text-muted">{tx('بدأ التجهيز؛ لم يعد الإلغاء متاحًا.', 'Preparation started; cancelling is no longer available.')}</p>}
        {o.status === 'submitted' && !review && <p className="text-xs text-muted">{tx('يبقى «بانتظار التأكيد» حتى يعتمد كتالوج «لك».', 'Stays “awaiting confirmation” until LAK’s catalogue is approved.')}</p>}
      </div>
      {cancelling && (
        <Modal title={tx(`إلغاء ${o.id}؟`, `Cancel ${o.id}?`)} onClose={() => setCancelling(false)}
          footer={<><Button variant="secondary" onClick={() => setCancelling(false)}>{tx('أبقِه', 'Keep it')}</Button><Button variant="danger" onClick={() => { update((x) => cancelPack(x, currentActor().name, reason.trim())); logAction('apps', { ar: `ألغى طلب التغليف ${o.id}${reason.trim() ? `: ${reason.trim()}` : ''}`, en: `Cancelled packaging request ${o.id}${reason.trim() ? `: ${reason.trim()}` : ''}` }, { target: o.id }); setCancelling(false); toast({ tone: 'ok', text: tx('أُلغي الطلب', 'Request cancelled') }); }}>{tx('ألغِ الطلب', 'Cancel request')}</Button></>}>
          <Field label={tx('السبب', 'Reason')} optional>{(p) => <Textarea {...p} value={reason} onChange={(ev) => setReason(ev.target.value)} />}</Field>
        </Modal>
      )}
    </Drawer>
  );
}
