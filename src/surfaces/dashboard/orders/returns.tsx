// Returns: queue at `#/dashboard/orders/returns?stage=open|all|closed`, one return at `#/dashboard/orders/returns/<RMA id>`.
// Stages: requested → approved (return label) → received → inspected (accepted + restock, separate decisions)
// → refunded (pending at the provider) or exchanged (replacement held, then shipped). Rejecting never moves money.
import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, Check, PackageCheck, PackageOpen, RotateCcw, SearchX, Truck, X, Lock } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { formatInt } from '../../../core/format';
import { link, type Route } from '../../../core/router';
import { financeStore, levelsStore, ordersStore, productsStore, testStore } from '../../merchant/stores';
import { LOCATIONS, LOC_IDS, type LocId, type Order } from '../../merchant/domain';
import {
  approveReturn, exchangeDiff, exchangeReturn, findReturn, inspectReturn, linesValue, payView, receiveReturn, refundReturn, rejectReturn, returnRefundAmount,
  shipExchange, validateInspection, type OrderReturn, type ReturnStage,
} from '../../merchant/ops';
import { refundTx } from '../../merchant/finance';
import { Alert, DataTable, Field, Input, Modal, PageHeader, Simulated, Tabs, useToast, type Column } from '../../../ds/kit';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, ProductImage, Ref, Segmented, cn, useTx, type Tone } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { setDashState, useDashState } from '../review';
import { bestStockLoc, orderPerms, siblings, skuOptions } from './model';
import { Qty, Row, applyEffects, ohref, saveOrder, useActor, useAge, useLabels } from './ui';
import { When } from './detail';
import { rhref } from './returns-link';

const STAGE_TONE: Record<ReturnStage, Tone> = { requested: 'amber', approved: 'sky', rejected: 'gray', received: 'sky', inspected: 'brand', refunded: 'green', exchanged: 'green' };
const OPEN = (r: OrderReturn) => r.stage !== 'rejected' && r.stage !== 'refunded' && r.stage !== 'exchanged' || (r.stage === 'exchanged' && !r.exchange?.shipped);
type Tab = 'open' | 'all' | 'closed';

export function ReturnsList({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useLabels();
  const age = useAge();
  const state = useDashState();
  const perms = orderPerms(testStore.use().role);
  const all = ordersStore.use();
  const tab = (['open', 'all', 'closed'] as Tab[]).find((t) => t === route.query.get('stage')) ?? 'open';
  const rows = state === 'empty' ? [] : all.flatMap((o) => (o.returns ?? []).map((r) => ({ o, r }))).sort((a, b) => b.r.at - a.r.at);
  const counts = { open: rows.filter((x) => OPEN(x.r)).length, all: rows.length, closed: rows.filter((x) => !OPEN(x.r)).length };
  const shown = rows.filter((x) => (tab === 'all' ? true : tab === 'open' ? OPEN(x.r) : !OPEN(x.r)));
  const back = { href: ohref('', { view: 'returns' }), label: tx('الطلبات', 'Orders') };
  if (!perms.see) return <div className="space-y-6"><PageHeader back={back} title={tx('المرتجعات', 'Returns')} /><Card><EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('لا تملك صلاحية عرض الطلبات', 'You do not have access to orders')} /></Card></div>;
  if (state === 'error') return <div className="space-y-6"><PageHeader back={back} title={tx('المرتجعات', 'Returns')} /><Card><EmptyState as="h2" title={tx('تعذّر تحميل المرتجعات', 'Returns could not load')} action={<Button onClick={() => setDashState('live')}>{tx('أعد المحاولة', 'Try again')}</Button>} /></Card></div>;
  const cols: Column<{ o: Order; r: OrderReturn }>[] = [
    { key: 'id', header: tx('المرتجع', 'Return'), cell: ({ o, r }) => <span className="flex items-center gap-3"><ProductImage src={skuPhoto(o.items[r.lines[0].idx]?.sku ?? '')} alt="" size={36} /><span><Ref>{r.id}</Ref><span className="block text-xs text-muted">#{o.ref} · <When at={r.at} /></span></span></span> },
    { key: 'c', header: tx('العميل', 'Customer'), cell: ({ o, r }) => <span className="text-fg">{o.customer[lang]}<span className="block text-xs text-muted">{r.source === 'store' ? tx('من المتجر', 'From the store') : tx('أنشأه الفريق', 'By staff')}</span></span> },
    { key: 'u', header: tx('القطع', 'Items'), cell: ({ r }) => <span className="tabular-nums">{r.lines.reduce((s, l) => s + l.qty, 0)}{r.exchange && <Badge tone="brand" className="ms-2">{tx('استبدال', 'Exchange')}</Badge>}</span>, hideBelow: 'md' },
    { key: 's', header: tx('المرحلة', 'Stage'), cell: ({ r }) => <Badge tone={STAGE_TONE[r.stage]}>{L.stage(r.stage)}</Badge> },
    { key: 'v', header: tx('التقدير', 'Estimate'), align: 'end', cell: ({ r }) => <Money v={r.estimate} className="font-semibold text-fg" /> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader back={back} title={tx('المرتجعات والاستبدال', 'Returns & exchanges')} description={tx(`${formatInt(counts.open)} مفتوح`, `${formatInt(counts.open)} open`)} />
      <Card>
        <div className="px-4 pt-2 sm:px-5"><Tabs label={tx('المرحلة', 'Stage')} items={(['open', 'all', 'closed'] as Tab[]).map((t) => ({ href: ohref('returns', { stage: t === 'open' ? undefined : t }), label: { open: tx('مفتوحة', 'Open'), all: tx('الكل', 'All'), closed: tx('مغلقة', 'Closed') }[t], current: tab === t, count: counts[t] }))} /></div>
        {state === 'loading' ? <div className="h-40 animate-pulse bg-surface-2/50" role="status" aria-label="Loading" /> : shown.length === 0 ? (
          <EmptyState icon={<RotateCcw className="size-6" aria-hidden="true" />} title={tab === 'open' ? tx('لا مرتجعات مفتوحة', 'No open returns') : tx('لا مرتجعات', 'No returns')}
            action={<LinkButton variant="secondary" href={ohref('', { view: 'shipped' })}>{tx('الطلبات المشحونة', 'Shipped orders')}</LinkButton>}>
            {tx('تصل طلبات الإرجاع من صفحة طلب العميل في المتجر، أو تفتحها من صفحة الطلب.', 'Return requests arrive from the shopper’s order page in the store, or you open one from an order.')}
          </EmptyState>
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('المرتجعات', 'Returns')} rows={shown} columns={cols} rowKey={(x) => x.r.id} href={(x) => rhref(x.r.id)}
              card={({ o, r }) => <div className="flex items-start gap-3"><ProductImage src={skuPhoto(o.items[r.lines[0].idx]?.sku ?? '')} alt="" size={44} /><div className="min-w-0 flex-1"><p className="flex justify-between gap-2 text-sm font-semibold text-fg"><Ref>{r.id}</Ref><Money v={r.estimate} /></p><p className="text-xs text-muted">{o.customer[lang]} · #{o.ref} · {age(o.hoursAgo)}</p><div className="mt-2"><Badge tone={STAGE_TONE[r.stage]}>{L.stage(r.stage)}</Badge></div></div></div>} />
          </div>
        )}
      </Card>
    </div>
  );
}

type Dlg = 'approve' | 'reject' | 'receive' | 'inspect' | 'refund' | 'exchange' | 'shipEx' | null;

export function ReturnDetail({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useLabels();
  const toast = useToast();
  const perms = orderPerms(testStore.use().role);
  const all = ordersStore.use();
  const [dlg, setDlg] = useState<Dlg>(null);
  const o = all.find((x) => (x.returns ?? []).some((r) => r.id === id));
  const r = o && findReturn(o, id);
  const back = { href: o ? ohref(o.ref) : ohref('returns'), label: o ? `#${o.ref}` : tx('المرتجعات', 'Returns') };
  if (!perms.see) return <div className="space-y-6"><PageHeader back={back} title={<Ref>{id}</Ref>} /><Card><EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('لا تملك صلاحية عرض الطلبات', 'You do not have access to orders')} /></Card></div>;
  if (!o || !r) return (
    <div className="space-y-6"><PageHeader back={{ href: ohref('returns'), label: tx('المرتجعات', 'Returns') }} title={tx('مرتجع غير موجود', 'Return not found')} />
      <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={<>{tx('لا يوجد مرتجع ', 'No return ')}<Ref>{id}</Ref></>} action={<LinkButton href={ohref('returns', { stage: 'all' })}>{tx('كل المرتجعات', 'All returns')}</LinkButton>} /></Card>
    </div>
  );
  const canAct = perms.fulfil || perms.refund;
  const close = (msg?: string) => { setDlg(null); if (msg) toast({ tone: 'ok', text: msg }); };
  const primary: [string, Dlg, typeof Check] | null =
    r.stage === 'requested' ? [tx('وافق على المرتجع', 'Approve return'), 'approve', Check]
      : r.stage === 'approved' ? [tx('سجّل الاستلام', 'Mark received'), 'receive', PackageCheck]
        : r.stage === 'received' ? [tx('افحص القطع', 'Inspect items'), 'inspect', PackageOpen]
          : r.stage === 'inspected' ? [tx('رد المبلغ', 'Refund'), 'refund', RotateCcw]
            : r.stage === 'exchanged' && !r.exchange?.shipped ? [tx('اشحن البديل', 'Ship replacement'), 'shipEx', Truck] : null;
  const needsRefundRole = primary?.[1] === 'refund';
  const allowed = needsRefundRole ? perms.refund : canAct && (primary?.[1] === 'shipEx' || primary?.[1] === 'receive' || primary?.[1] === 'inspect' ? perms.fulfil : true);
  const flow: ReturnStage[] = r.stage === 'rejected' ? ['requested', 'rejected'] : r.stage === 'exchanged' ? ['requested', 'approved', 'received', 'inspected', 'exchanged'] : ['requested', 'approved', 'received', 'inspected', 'refunded'];
  const at = flow.indexOf(r.stage);
  const refundRow = o.refunds.find((x) => x.id === (r.refundId ?? r.exchange?.refundId));

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHeader back={back} title={<span className="flex flex-wrap items-center gap-2"><Ref>{r.id}</Ref><Badge tone={STAGE_TONE[r.stage]}>{L.stage(r.stage)}</Badge></span>}
        meta={<span className="text-sm text-muted">{o.customer[lang]} · {r.source === 'store' ? tx('طلبه العميل من المتجر', 'Requested by the shopper in the store') : tx('فتحه الفريق', 'Opened by staff')} · <When at={r.at} /></span>}
        actions={<div className="hidden items-center gap-2 md:flex">
          {r.stage === 'requested' && canAct && <Button variant="secondary" onClick={() => setDlg('reject')}><X className="size-4" aria-hidden="true" />{tx('ارفض', 'Reject')}</Button>}
          {r.stage === 'inspected' && perms.fulfil && <Button variant="secondary" onClick={() => setDlg('exchange')}><ArrowLeftRight className="size-4" aria-hidden="true" />{tx('استبدال', 'Exchange')}</Button>}
          {primary && allowed && <Button className="bg-brand-gradient hover:opacity-95" onClick={() => setDlg(primary[1])}>{(() => { const I = primary[2]; return <I className="size-4" aria-hidden="true" />; })()}{primary[0]}</Button>}
        </div>} />

      <Card className="px-5 py-4">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label={tx('المراحل', 'Stages')}>
          {flow.map((s, i) => (
            <li key={s} aria-current={i === at ? 'step' : undefined} className="flex items-center gap-2 text-xs font-medium">
              <span className={cn('grid size-6 place-items-center rounded-full text-[11px] tabular-nums', i < at ? 'bg-emerald-500 text-white' : i === at ? (s === 'rejected' ? 'bg-surface-2 text-fg ring-2 ring-border' : 'bg-brand-600 text-white') : 'bg-surface-2 text-muted')}>{i < at ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}</span>
              <span className={i <= at ? 'text-fg' : 'text-muted'}>{L.stage(s)}</span>
              {i < flow.length - 1 && <span className="h-px w-6 bg-border" aria-hidden="true" />}
            </li>
          ))}
        </ol>
        {primary && !allowed && <p className="mt-2 text-xs text-muted">{needsRefundRole ? tx('رد المبلغ يحتاج دور المالك أو المالية', 'Refunds need the owner or finance role') : tx('هذه الخطوة تحتاج دور المالك أو التجهيز', 'This step needs the owner or fulfilment role')}</p>}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card aria-labelledby="h-rl">
            <CardHeader id="h-rl" title={tx('القطع المرتجعة', 'Returned items')} />
            <ul className="divide-y divide-border !border-t !border-border">
              {r.lines.map((l, i) => {
                const it = o.items[l.idx];
                return (
                  <li key={i} className="flex items-start gap-3 px-5 py-4">
                    <ProductImage src={skuPhoto(it.sku)} alt={it.name[lang]} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">{it.name[lang]}</p>
                      <p className="text-xs text-muted"><Ref>{it.sku}</Ref> · {l.reason}</p>
                      {r.inspection && <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={r.inspection.accepted[i] === l.qty ? 'green' : 'amber'}>{tx(`مقبول ${r.inspection.accepted[i]} من ${l.qty}`, `${r.inspection.accepted[i]} of ${l.qty} accepted`)}</Badge>{r.inspection.restock[i] > 0 && <Badge tone="sky">{tx(`أُعيد ${r.inspection.restock[i]} إلى ${LOCATIONS[r.inspection.loc].ar}`, `${r.inspection.restock[i]} restocked at ${LOCATIONS[r.inspection.loc].en}`)}</Badge>}</div>}
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-fg">× {l.qty}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {r.exchange && (
            <Card aria-labelledby="h-ex">
              <CardHeader id="h-ex" title={tx('البديل', 'Replacement')} action={r.exchange.shipped ? <Badge tone="sky">{tx('شُحن', 'Shipped')}</Badge> : <Badge tone="brand">{tx('محجوز', 'Held')}</Badge>} />
              <div className="flex items-center gap-3 px-5 pb-5">
                <ProductImage src={skuPhoto(r.exchange.sku)} alt={r.exchange.name[lang]} size={48} />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{r.exchange.name[lang]}{r.exchange.variant && ` · ${r.exchange.variant[lang]}`}</p><p className="text-xs text-muted"><Ref>{r.exchange.sku}</Ref> · {LOCATIONS[r.exchange.loc][lang]} · × {r.exchange.qty}{r.exchange.shipped && <> · <Ref>{r.exchange.shipped}</Ref></>}</p></div>
                <span className="text-end text-xs text-muted">{r.exchange.diff === 0 ? tx('بلا فرق سعر', 'No price difference') : r.exchange.diff > 0 ? <>{tx('يُحصّل', 'To collect')} <Money v={r.exchange.diff} className="font-semibold text-fg" /></> : <>{tx('يُرد', 'To refund')} <Money v={-r.exchange.diff} className="font-semibold text-fg" /></>}</span>
              </div>
            </Card>
          )}

          <Card aria-labelledby="h-rh">
            <CardHeader id="h-rh" title={tx('سجل المرتجع', 'Return history')} />
            <ol className="space-y-3 px-5 pb-5">
              {[...r.history].reverse().map((h, i) => (
                <li key={i} className="flex items-start gap-3 text-sm"><Badge tone={STAGE_TONE[h.stage]}>{L.stage(h.stage)}</Badge><span className="text-xs text-muted">{h.actor === 'customer' ? tx('العميل', 'Customer') : h.actor === 'system' ? tx('النظام', 'System') : h.actor} · <When at={h.at} /></span></li>
              ))}
            </ol>
          </Card>
        </div>
        <aside className="min-w-0 space-y-6">
          <Card aria-labelledby="h-rm">
            <CardHeader id="h-rm" title={tx('المبلغ', 'Money')} />
            <dl className="px-5 pb-5">
              <Row label={<span className="flex items-center gap-1">{tx('التقدير عند الطلب', 'Estimate at request')}<InfoHint>{tx('سعر القطع المدفوع ناقص حصتها من الخصم. المبلغ النهائي بعد الفحص.', 'Paid price of the items less their share of any discount. Final after inspection.')}</InfoHint></span>}><Money v={r.estimate} /></Row>
              {r.inspection && <Row label={tx('بعد الفحص', 'After inspection')} strong><Money v={returnRefundAmount(o, r)} /></Row>}
              <Row label={tx('إلى', 'To')}>{r.refundTo === 'bank' ? <span>{tx('حساب بنكي', 'Bank account')}{r.iban && <> <Ref>{r.iban.slice(0, 4)}…{r.iban.slice(-4)}</Ref></>}</span> : payView(o) === 'cod_collected' ? tx('حساب بنكي (دفع عند الاستلام)', 'Bank account (COD)') : tx('وسيلة الدفع الأصلية', 'Original payment method')}</Row>
              {refundRow && <Row label={tx('الاسترداد', 'Refund')}><span className="inline-flex items-center gap-1.5"><Ref>{refundRow.id}</Ref><Badge tone={refundRow.status === 'confirmed' ? 'green' : refundRow.status === 'pending' ? 'amber' : 'red'}>{refundRow.status === 'pending' ? tx('بانتظار المزوّد', 'Awaiting provider') : refundRow.status === 'confirmed' ? tx('مؤكد', 'Confirmed') : tx('مرفوض', 'Declined')}</Badge></span></Row>}
              {r.rejectReason && <Row label={tx('سبب الرفض', 'Rejected because')}>{r.rejectReason}</Row>}
            </dl>
          </Card>
          <Card className="space-y-2 px-5 py-4 text-sm">
            <p className="font-semibold text-fg">{tx('الطلب', 'Order')} <a className="text-brand-700 hover:underline dark:text-brand-300" href={ohref(o.ref)}><Ref>#{o.ref}</Ref></a></p>
            {r.method && <p className="text-muted">{r.method === 'pickup' ? tx('يُستلم من العميل', 'Picked up from the customer') : tx('يسلّمه العميل في نقطة', 'Customer drops it off')}</p>}
            {r.labelRef && <p className="flex items-center gap-2 text-muted">{tx('ملصق الإرجاع', 'Return label')} <Ref>{r.labelRef}</Ref><Simulated /></p>}
            <a className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link(`/store/track/${o.ref}`)} target="_blank" rel="noreferrer">{tx('ما يراه العميل', 'What the customer sees')}</a>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden" role="region" aria-label={tx('إجراءات المرتجع', 'Return actions')}>
        <p className="min-w-0 flex-1 text-sm font-semibold text-fg"><Ref>{r.id}</Ref></p>
        {r.stage === 'requested' && canAct && <Button variant="secondary" onClick={() => setDlg('reject')}>{tx('ارفض', 'Reject')}</Button>}
        {r.stage === 'inspected' && perms.fulfil && <Button variant="secondary" onClick={() => setDlg('exchange')}>{tx('استبدال', 'Exchange')}</Button>}
        {primary && allowed && <Button onClick={() => setDlg(primary[1])}>{primary[0]}</Button>}
      </div>

      {dlg === 'approve' && <StepModal o={o} r={r} kind="approve" onClose={close} />}
      {dlg === 'receive' && <StepModal o={o} r={r} kind="receive" onClose={close} />}
      {dlg === 'refund' && <StepModal o={o} r={r} kind="refund" onClose={close} />}
      {dlg === 'shipEx' && <StepModal o={o} r={r} kind="shipEx" onClose={close} />}
      {dlg === 'reject' && <RejectModal o={o} r={r} onClose={close} />}
      {dlg === 'inspect' && <InspectModal o={o} r={r} onClose={close} />}
      {dlg === 'exchange' && <ExchangeModal o={o} r={r} onClose={close} />}
    </div>
  );
}

function StepModal({ o, r, kind, onClose }: { o: Order; r: OrderReturn; kind: 'approve' | 'receive' | 'refund' | 'shipEx'; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const amount = returnRefundAmount(o, r);
  const run = () => {
    const now = Date.now();
    if (kind === 'approve') { saveOrder(approveReturn(o, r.id, who, now)); onClose(tx('وُوفق على المرتجع', 'Return approved')); return; }
    if (kind === 'receive') { saveOrder(receiveReturn(o, r.id, who, now)); onClose(tx('سُجّل استلام المرتجع', 'Return marked received')); return; }
    if (kind === 'shipEx') { const x = shipExchange(o, r.id, who, now); saveOrder(x.order); applyEffects(x.effects, who, o.ref, 'EX'); onClose(tx(`شُحن البديل ${x.ref}`, `Replacement shipped ${x.ref}`)); return; }
    const next = refundReturn(o, r.id, who, now);
    saveOrder(next);
    const rf = next.refunds.length > o.refunds.length ? next.refunds[next.refunds.length - 1] : undefined;
    if (rf) financeStore.set((f) => ({ ...f, txs: [...f.txs, refundTx(next, rf, `TX-${rf.id}`, undefined, false)] }));
    onClose(rf ? tx('طُلب الاسترداد، بانتظار المزوّد', 'Refund requested, awaiting the provider') : tx('أُغلق المرتجع بلا مبلغ', 'Return closed with no amount'));
  };
  const T = {
    approve: [tx('الموافقة على المرتجع', 'Approve the return'), tx('وافق', 'Approve'), [
      [tx('يصدر', 'Issues'), <span className="inline-flex items-center gap-1.5">{tx('ملصق إرجاع', 'A return label')} <Ref>{`RTN-${r.id.replace(/^RMA-/, '')}`}</Ref><Simulated /></span>],
      [tx('العميل', 'Customer'), tx('يرى «موافق عليه» في صفحة طلبه', 'Sees “approved” on their order page')],
      [tx('المال والمخزون', 'Money & stock'), tx('لا يتغيران قبل الاستلام والفحص', 'Unchanged until receipt and inspection')],
    ]],
    receive: [tx('استلام المرتجع', 'Receive the return'), tx('سجّل الاستلام', 'Mark received'), [
      [tx('القطع', 'Items'), tx(`${r.lines.reduce((s, l) => s + l.qty, 0)} قطع`, `${r.lines.reduce((s, l) => s + l.qty, 0)} items`)],
      [tx('التالي', 'Next'), tx('الفحص: ما يُقبل وما يعود للبيع', 'Inspection: what is accepted and what can be sold again')],
    ]],
    refund: [tx('رد مبلغ المرتجع', 'Refund the return'), amount ? tx('اطلب الاسترداد', 'Request refund') : tx('أغلق بلا مبلغ', 'Close with no amount'), [
      [tx('المبلغ', 'Amount'), <Money v={amount} className="font-semibold text-fg" />],
      [tx('منها ضريبة', 'Incl. VAT'), <Money v={Math.round((amount * 15) / 115)} />],
      [tx('إلى', 'To'), r.refundTo === 'bank' ? tx('الحساب البنكي للعميل', 'The customer’s bank account') : tx('وسيلة الدفع الأصلية', 'The original payment method')],
      [tx('الحالة بعده', 'After'), tx('بانتظار المزوّد حتى يؤكد', 'Awaiting the provider until confirmed')],
    ]],
    shipEx: [tx('شحن البديل', 'Ship the replacement'), tx('أصدر الملصق واشحن', 'Issue label and ship'), [
      [tx('البديل', 'Replacement'), `${r.exchange?.name[lang] ?? ''}${r.exchange?.variant ? ` · ${r.exchange.variant[lang]}` : ''} × ${r.exchange?.qty ?? 0}`],
      [tx('من', 'From'), r.exchange ? LOCATIONS[r.exchange.loc][lang] : ''],
      [tx('المخزون', 'Stock'), tx('يُطلق الحجز وتخرج القطع من الرف', 'The hold is released and the units leave the shelf')],
    ]],
  }[kind] as [string, string, [string, ReactNode][]];
  return (
    <Modal title={T[0]} onClose={() => onClose()} footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}>{T[1]}</Button></>}>
      <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">{T[2].map(([k, v], i) => <Row key={i} label={k}>{v}</Row>)}</dl>
      {kind === 'refund' && <p className="flex items-center gap-2 text-xs text-muted">{tx('لا رسالة للعميل من هنا.', 'No message is sent from here.')}<Simulated /></p>}
    </Modal>
  );
}

function RejectModal({ o, r, onClose }: { o: Order; r: OrderReturn; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const who = useActor();
  const [why, setWhy] = useState('');
  return (
    <Modal title={tx('رفض المرتجع', 'Reject the return')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('رجوع', 'Back')}</Button><Button variant="danger" disabled={!why.trim()} onClick={() => { saveOrder(rejectReturn(o, r.id, why, who, Date.now())); onClose(tx('رُفض المرتجع وسُجّل السبب', 'Return rejected; reason logged')); }}>{tx('ارفض', 'Reject')}</Button></>}>
      <Alert tone="info">{tx('لا يتغير المال ولا المخزون. يرى العميل أن الطلب أُغلق.', 'Money and stock do not change. The customer sees the request closed.')}</Alert>
      <Field label={tx('السبب', 'Reason')}>{(p) => <Input {...p} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={tx('مثال: خارج مدة الإرجاع', 'e.g. outside the return window')} />}</Field>
    </Modal>
  );
}

function InspectModal({ o, r, onClose }: { o: Order; r: OrderReturn; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const [acc, setAcc] = useState<number[]>(r.lines.map((l) => l.qty));
  const [rs, setRs] = useState<number[]>(r.lines.map((l) => l.qty));
  const [loc, setLoc] = useState<LocId>(o.fulfilments[0]?.loc ?? LOC_IDS[0] ?? 'ryd');
  const [note, setNote] = useState('');
  const err = validateInspection(r, acc, rs);
  const value = linesValue(o, r.lines.map((l, i) => ({ idx: l.idx, qty: acc[i] })));
  const units = rs.reduce((a, b) => a + b, 0);
  const run = () => {
    const x = inspectReturn(o, r.id, acc, rs, loc, note, who, Date.now());
    if (x.order === o) return;
    saveOrder(x.order);
    applyEffects(x.effects, who, o.ref, 'RI');
    onClose(tx('سُجّل الفحص', 'Inspection recorded'));
  };
  return (
    <Modal size="lg" title={tx('فحص المرتجع', 'Inspect the return')} onClose={() => onClose()}
      footer={<><span className="me-auto text-sm text-muted">{tx('القيمة المقبولة', 'Accepted value')} <Money v={value} className="font-semibold text-fg" /></span><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!!err} onClick={run}>{tx('احفظ الفحص', 'Save inspection')}</Button></>}>
      <ul className="divide-y divide-border !rounded-xl !border !border-border">
        {r.lines.map((l, i) => {
          const it = o.items[l.idx];
          return (
            <li key={i} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <ProductImage src={skuPhoto(it.sku)} alt={it.name[lang]} size={40} />
              <span className="min-w-0 flex-1 text-sm font-semibold text-fg">{it.name[lang]}<span className="block text-xs font-normal text-muted">× {l.qty} · {l.reason}</span></span>
              <span className="flex flex-col items-end gap-1 text-[11px] text-muted">{tx('مقبول', 'Accepted')}<Qty value={acc[i]} max={l.qty} label={tx(`المقبول من ${it.name.ar}`, `accepted ${it.name.en}`)} onChange={(n) => { setAcc(acc.map((x, j) => (j === i ? n : x))); }} /></span>
              <span className="flex flex-col items-end gap-1 text-[11px] text-muted">{tx('يعود للبيع', 'Back to stock')}<Qty value={rs[i]} max={l.qty} label={tx(`الإعادة للمخزون من ${it.name.ar}`, `restock ${it.name.en}`)} onChange={(n) => setRs(rs.map((x, j) => (j === i ? n : x)))} /></span>
            </li>
          );
        })}
      </ul>
      {units > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">{tx('إلى', 'Into')}</span><Segmented label={tx('موقع الإعادة', 'Restock location')} value={loc} onChange={setLoc} options={LOC_IDS.map((l) => ({ value: l, label: LOCATIONS[l][lang] }))} /></div>}
      <Field label={tx('ملاحظة الفحص', 'Inspection note')} optional>{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <p className="text-xs text-muted">{tx('القبول يحدد المبلغ أو الاستبدال؛ الإعادة للمخزون قرار منفصل (التالف لا يعود).', 'Accepted units decide the refund or exchange; restocking is a separate decision (damaged units stay out).')}</p>
    </Modal>
  );
}

function ExchangeModal({ o, r, onClose }: { o: Order; r: OrderReturn; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const opts = siblings(skuOptions(productsStore.use(), levelsStore.use()), o.items[r.lines[0].idx].sku);
  const qty = r.inspection?.accepted.reduce((a, b) => a + b, 0) || r.lines.reduce((s, l) => s + l.qty, 0);
  const [sku, setSku] = useState(opts.find((x) => x.total >= qty)?.sku ?? '');
  const pick = opts.find((x) => x.sku === sku);
  const loc = pick ? bestStockLoc(pick, LOC_IDS, qty) : undefined;
  const diff = pick ? exchangeDiff(o, r, pick.unit, qty) : 0;
  const run = () => {
    if (!pick || !loc) return;
    const x = exchangeReturn(o, r.id, { sku: pick.sku, name: pick.name, variant: pick.variant, unit: pick.unit, qty, loc }, who, Date.now());
    if (x.order === o) return;
    saveOrder(x.order);
    applyEffects(x.effects, who, o.ref, 'XR');
    const rf = x.order.refunds.length > o.refunds.length ? x.order.refunds[x.order.refunds.length - 1] : undefined;
    if (rf) financeStore.set((f) => ({ ...f, txs: [...f.txs, refundTx(x.order, rf, `TX-${rf.id}`, undefined, false)] }));
    onClose(tx('حُجز البديل. اشحنه من صفحة المرتجع.', 'Replacement held. Ship it from the return page.'));
  };
  return (
    <Modal size="lg" title={tx('استبدال', 'Exchange')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!pick || !loc} onClick={run}><ArrowLeftRight className="size-4" aria-hidden="true" />{tx('احجز البديل', 'Hold replacement')}</Button></>}>
      {opts.length === 0 ? <Alert tone="warn">{tx('لا متغيرات أخرى لهذا المنتج. استخدم رد المبلغ.', 'This product has no other variants. Use a refund instead.')}</Alert> : (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-[13px] font-semibold text-fg">{tx(`البديل (${qty} قطع)`, `Replacement (${qty} items)`)}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {opts.map((x) => (
              <label key={x.sku} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5', sku === x.sku ? 'border-brand-500 bg-brand-500/5' : 'border-border', x.total < qty && 'cursor-not-allowed opacity-50')}>
                <input type="radio" name="sku" className="size-4 accent-brand-600" disabled={x.total < qty} checked={sku === x.sku} onChange={() => setSku(x.sku)} />
                <span className="min-w-0 flex-1 text-sm text-fg">{x.variant?.[lang] ?? x.name[lang]}<span className="block text-xs text-muted"><Ref>{x.sku}</Ref> · {x.total < qty ? tx('غير متوفر', 'Not available') : tx(`متوفر ${x.total}`, `${x.total} available`)}</span></span>
                <Money v={x.unit} className="text-sm font-semibold text-fg" />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {pick && (
        <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">
          <Row label={tx('يُحجز من', 'Held at')}>{loc ? LOCATIONS[loc][lang] : tx('لا موقع يكفي', 'No location has enough')}</Row>
          <Row label={tx('فرق السعر', 'Price difference')} strong>{diff === 0 ? tx('لا فرق', 'None') : diff > 0 ? <span className="inline-flex items-center gap-1">{tx('يُحصّل من العميل', 'Collect from customer')} <Money v={diff} /></span> : <span className="inline-flex items-center gap-1">{tx('يُرد للعميل', 'Refund to customer')} <Money v={-diff} /></span>}</Row>
          <Row label={tx('التالي', 'Next')}>{tx('اشحن البديل كطرد مستقل', 'Ship the replacement as its own parcel')}</Row>
        </dl>
      )}
      {diff > 0 && <p className="flex items-center gap-2 text-xs text-muted">{tx('تحصيل الفرق برابط دفع يحتاج مزوّدًا من الخادم.', 'Collecting the difference by payment link needs a server-side provider.')}<Simulated /></p>}
      {diff < 0 && <p className="flex items-center gap-2 text-xs text-muted">{tx('يُطلب رد الفرق من المزوّد.', 'The difference is requested back from the provider.')}<Simulated /></p>}
    </Modal>
  );
}

