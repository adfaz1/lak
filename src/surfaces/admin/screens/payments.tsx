// Payments & disputes (`#/admin/payments?tab=ledger|disputes|payouts|gateways`): masked ledger split by book,
// disputes moved only along allowed states, merchant payout holds, and gateway configuration status.
import { useState } from 'react';
import { CreditCard, FileWarning, PauseCircle, PlayCircle, Wallet } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { Alert, DataTable, FilterChip, PageHeader, Pagination, SearchInput, Simulated, Tabs, useToast, type Column } from '../../../ds/kit';
import { Badge, Button, Card, EmptyState, InfoHint, Money, Ref, useTx, type Tone } from '../../../ds/ui';
import { can, DISPUTE_NEXT, fundOf, type Dispute, type DisputeState, type LedgerEntry, type LedgerKind, type Store } from '../domain';
import { DISPUTE_ACTION, DISPUTE_KIND, DISPUTE_STATE, LEDGER_KIND, LEDGER_STATUS, ROLE_LABEL } from '../i18n';
import { listDisputes, listLedger, payoutRows, readLedgerQuery } from '../model';
import { disputesStore, holdStorePayout, ledgerStore, moveDispute, releaseStorePayout, storesStore } from '../state';
import { ahref, AsOf, ImpactList, Locked, NoResults, qhref, ReasonModal, StateGate, useFmt, useQueryNav, useViewState } from '../ui';
import type { ScreenProps } from '../index';

const LEDGER_TONE: Record<LedgerEntry['status'], Tone> = { captured: 'green', settled: 'green', pending: 'sky', failed: 'red', reversed: 'amber' };
const DISPUTE_TONE: Record<DisputeState, Tone> = { open: 'amber', awaitingMerchant: 'sky', submitted: 'sky', won: 'green', lost: 'red' };
type Tab = 'ledger' | 'disputes' | 'payouts' | 'gateways';

export default function Payments(p: ScreenProps) {
  const tx = useTx();
  const state = useViewState();
  const raw = p.route.query.get('tab');
  const tab: Tab = raw === 'disputes' || raw === 'gateways' || raw === 'payouts' ? raw : 'ledger';
  const open = disputesStore.use().filter((d) => d.state === 'open' || d.state === 'awaitingMerchant').length;
  const held = storesStore.use().filter((s) => s.payoutHold).length;
  const header = (
    <>
      <PageHeader title={tx('الأموال والنزاعات', 'Payments & disputes')} description={tx('بيانات دفع مقنّعة. الواجهة ليست نظام امتثال.', 'Masked payment data. This UI is not a compliance system.')} meta={<AsOf />} />
      <Tabs label={tx('أقسام المدفوعات', 'Payment sections')} items={[
        { href: ahref('payments'), label: tx('السجل', 'Ledger'), current: tab === 'ledger' },
        { href: ahref('payments', { tab: 'disputes' }), label: tx('النزاعات', 'Disputes'), current: tab === 'disputes', count: open },
        { href: ahref('payments', { tab: 'payouts' }), label: tx('تحويلات التجار', 'Merchant payouts'), current: tab === 'payouts', count: held || undefined },
        { href: ahref('payments', { tab: 'gateways' }), label: tx('البوابات', 'Gateways'), current: tab === 'gateways' },
      ]} />
    </>
  );
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'المدفوعات', en: 'Payments' }} refCode="SIM-ADM-PAY-503" />;
  return (
    <div className="space-y-6">
      {header}
      {tab === 'ledger' && <Ledger {...p} />}
      {tab === 'disputes' && <Disputes {...p} />}
      {tab === 'payouts' && <Payouts {...p} />}
      {tab === 'gateways' && <Gateways />}
    </div>
  );
}

function useStoreName() {
  const { lang } = useLang();
  const stores = storesStore.use();
  return (id: string) => stores.find((s) => s.id === id)?.name[lang] ?? id;
}

function Ledger({ route }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const name = useStoreName();
  const state = useViewState();
  const stored = ledgerStore.use();
  const ledger = state === 'empty' ? [] : stored;
  const q = readLedgerQuery(route.query);
  const r = listLedger(ledger, q);
  const go = useQueryNav('payments', route);
  if (ledger.length === 0) return <Card><EmptyState as="h2" icon={<CreditCard className="size-6" />} title={tx('لا عمليات بعد', 'No transactions yet')}>{tx('تظهر هنا عمليات المتاجر وفواتير لك بعد أول دفعة.', 'Store transactions and LAK invoices appear after the first payment.')}</EmptyState></Card>;

  const fund = (e: LedgerEntry) => fundOf(e.kind) === 'lak' ? <Badge tone="brand">{tx('إيراد لك', 'LAK revenue')}</Badge> : <Badge tone="gray">{tx('أموال التاجر', 'Merchant funds')}</Badge>;
  const amount = (e: LedgerEntry) => e.kind === 'subscription' ? <span className="text-xs text-amber-700 dark:text-amber-300">{tx('السعر بانتظار الاعتماد', 'Price to be approved')}</span> : <Money v={e.amount} className="font-semibold text-fg" />;
  const cols: Column<LedgerEntry>[] = [
    { key: 'ref', header: tx('المرجع', 'Reference'), cell: (e) => <span><Ref>{e.ref}</Ref><span className="block text-xs text-muted">{f.dt(e.at)}</span></span> },
    { key: 'store', header: tx('المتجر', 'Store'), cell: (e) => <a className="block max-w-48 truncate hover:underline" href={ahref(`stores/${e.storeId}`)}>{name(e.storeId)}</a> },
    { key: 'kind', header: tx('النوع', 'Type'), cell: (e) => LEDGER_KIND[e.kind][lang] },
    { key: 'fund', header: <span className="inline-flex items-center gap-1">{tx('الحساب', 'Book')}<InfoHint>{tx('فواتير الاشتراك إيراد للك. كل ما سواها أموال تجار تعالجها لك.', 'Subscription invoices are LAK revenue. Everything else is merchant money LAK processes.')}</InfoHint></span>, cell: fund, hideBelow: 'md' },
    { key: 'method', header: tx('الوسيلة (مقنّعة)', 'Method (masked)'), cell: (e) => <Ref>{e.method}</Ref>, hideBelow: 'lg' },
    { key: 'status', header: tx('الحالة', 'Status'), cell: (e) => <span className="flex flex-col items-start gap-1"><Badge tone={LEDGER_TONE[e.status]}>{LEDGER_STATUS[e.status][lang]}</Badge>{e.flag && <span className="max-w-56 text-xs text-amber-700 dark:text-amber-300">{e.flag[lang]}</span>}</span> },
    { key: 'amount', header: tx('المبلغ', 'Amount'), align: 'end', cell: amount },
  ];
  const card = (e: LedgerEntry) => (
    <div>
      <div className="flex items-baseline justify-between gap-2"><Ref>{e.ref}</Ref>{amount(e)}</div>
      <p className="truncate text-xs text-muted">{name(e.storeId)} · {LEDGER_KIND[e.kind][lang]} · {f.dt(e.at)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={LEDGER_TONE[e.status]}>{LEDGER_STATUS[e.status][lang]}</Badge>{fund(e)}</div>
      {e.flag && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{e.flag[lang]}</p>}
    </div>
  );
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
        <div className="flex w-full sm:w-auto sm:flex-1 sm:max-w-xs"><SearchInput value={q.q} onChange={(v) => go({ q: v || undefined }, 'replace')} placeholder={tx('رقم العملية', 'Transaction reference')} /></div>
        <FilterChip label={tx('النوع', 'Type')} value={q.kind} options={(['sale', 'refund', 'chargeback', 'payout', 'subscription'] as LedgerKind[]).map((k) => ({ value: k, label: LEDGER_KIND[k][lang] }))} onChange={(v) => go({ kind: v || undefined })} />
        <FilterChip label={tx('الحساب', 'Book')} value={q.fund} options={[{ value: 'merchant', label: tx('أموال التاجر', 'Merchant funds') }, { value: 'lak', label: tx('إيراد لك', 'LAK revenue') }]} onChange={(v) => go({ fund: v || undefined })} />
      </div>
      {r.rows.length === 0 ? <NoResults onClear={() => go({ q: undefined, kind: undefined, fund: undefined })} /> : (
        <>
          <div className="border-t border-border"><DataTable label={tx('سجل المدفوعات', 'Payments ledger')} rows={r.pageRows} columns={cols} rowKey={(e) => e.ref} card={card} rowClass={(e) => (e.status === 'failed' ? 'bg-red-500/[.03]' : undefined)} /></div>
          <Pagination page={r.page} pages={r.pages} total={r.rows.length} hrefFor={(p) => qhref('payments', route, { page: String(p) })} />
        </>
      )}
    </Card>
  );
}

function Disputes({ role, route }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const name = useStoreName();
  const state = useViewState();
  const stored = disputesStore.use();
  const all = state === 'empty' ? [] : stored;
  const q = route.query.get('q') ?? '';
  const rows = listDisputes(all, q);
  const go = useQueryNav('payments', route);
  const [dlg, setDlg] = useState<{ d: Dispute; to: DisputeState } | null>(null);
  const mayAct = can(role, 'payments.act');
  if (all.length === 0) return <Card><EmptyState as="h2" icon={<FileWarning className="size-6" />} title={tx('لا نزاعات', 'No disputes')}>{tx('تظهر هنا النزاعات والاسترجاعات البنكية وتصعيدات الاسترداد.', 'Disputes, chargebacks and refund escalations appear here.')}</EmptyState></Card>;

  const actions = (d: Dispute) => mayAct && DISPUTE_NEXT[d.state].length > 0
    ? <span className="flex flex-wrap gap-1.5">{DISPUTE_NEXT[d.state].map((to) => <Button key={to} size="sm" variant="secondary" onClick={() => setDlg({ d, to })}>{DISPUTE_ACTION[to][lang]}</Button>)}</span>
    : null;
  const cols: Column<Dispute>[] = [
    { key: 'id', header: tx('الحالة', 'Case'), cell: (d) => <span><span className="font-semibold text-fg">{DISPUTE_KIND[d.kind][lang]}</span> <Ref>{d.id}</Ref><span className="block text-xs text-muted"><Ref>{d.txn}</Ref> · {name(d.storeId)}</span></span> },
    { key: 'reason', header: tx('السبب', 'Reason'), cell: (d) => <span className="block max-w-56 text-muted">{d.reason[lang]}</span>, hideBelow: 'lg' },
    { key: 'due', header: tx('الرد قبل', 'Respond by'), cell: (d) => <span className="whitespace-nowrap">{f.d(d.due)}</span> },
    { key: 'state', header: tx('الحالة', 'State'), cell: (d) => <Badge tone={DISPUTE_TONE[d.state]}>{DISPUTE_STATE[d.state][lang]}</Badge> },
    { key: 'amount', header: tx('المبلغ', 'Amount'), align: 'end', cell: (d) => <Money v={d.amount} className="font-semibold text-fg" /> },
    { key: 'act', header: <span className="sr-only">{tx('إجراءات', 'Actions')}</span>, cell: (d) => actions(d) },
  ];
  const card = (d: Dispute) => (
    <div>
      <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold text-fg">{DISPUTE_KIND[d.kind][lang]} <Ref>{d.id}</Ref></span><Money v={d.amount} className="text-sm font-semibold" /></div>
      <p className="text-xs text-muted">{name(d.storeId)} · {d.reason[lang]} · {tx('قبل', 'by')} {f.d(d.due)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5"><Badge tone={DISPUTE_TONE[d.state]}>{DISPUTE_STATE[d.state][lang]}</Badge></div>
      <div className="mt-2">{actions(d)}</div>
    </div>
  );
  return (
    <>
      {!mayAct && <Locked>{tx('دورك يعرض النزاعات ولا يغيّر حالتها.', 'Your role can view disputes but not change them.')}</Locked>}
      <Card>
        <div className="p-4 sm:px-5"><div className="flex w-full sm:max-w-xs"><SearchInput value={q} onChange={(v) => go({ q: v || undefined, tab: 'disputes' }, 'replace')} placeholder={tx('رقم النزاع أو العملية', 'Case or transaction reference')} /></div></div>
        {rows.length === 0 ? <NoResults onClear={() => go({ q: undefined, tab: 'disputes' })} /> : <div className="border-t border-border"><DataTable label={tx('النزاعات', 'Disputes')} rows={rows} columns={cols} rowKey={(d) => d.id} card={card} /></div>}
      </Card>
      {dlg && (
        <ReasonModal title={DISPUTE_ACTION[dlg.to][lang]} confirmLabel={DISPUTE_ACTION[dlg.to][lang]} optional onClose={() => setDlg(null)}
          target={<><p className="font-semibold text-fg">{DISPUTE_KIND[dlg.d.kind][lang]} <Ref>{dlg.d.id}</Ref> · <Money v={dlg.d.amount} /></p><p className="text-xs text-muted">{name(dlg.d.storeId)} · {DISPUTE_STATE[dlg.d.state][lang]} → {DISPUTE_STATE[dlg.to][lang]}</p></>}
          onConfirm={(note) => { const e = moveDispute(dlg.d.id, dlg.to, note); if (!e) toast({ tone: 'ok', text: `${DISPUTE_ACTION[dlg.to][lang]}: ${dlg.d.id}` }); return e; }}>
          <ImpactList items={[{ icon: <FileWarning />, text: tx('تتغير حالة القضية فقط. لا تتحرك أموال، وأي إرسال للمزوّد محاكاة.', 'Only the case state changes. No money moves; any provider submission is simulated.') }]} />
        </ReasonModal>
      )}
    </>
  );
}

function Payouts({ role }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const state = useViewState();
  const stores = storesStore.use();
  const rows = state === 'empty' ? [] : payoutRows(stores);
  const [dlg, setDlg] = useState<{ s: Store; hold: boolean } | null>(null);
  const mayAct = can(role, 'payments.act');
  if (rows.length === 0) return <Card><EmptyState as="h2" icon={<Wallet className="size-6" />} title={tx('لا مستحقات بانتظار التحويل', 'No payouts pending')} /></Card>;
  const act = (s: Store) => !mayAct ? null : s.payoutHold
    ? <Button size="sm" variant="secondary" onClick={() => setDlg({ s, hold: false })}><PlayCircle className="size-4" aria-hidden="true" />{tx('استأنف', 'Release')}</Button>
    : <Button size="sm" variant="secondary" onClick={() => setDlg({ s, hold: true })}><PauseCircle className="size-4" aria-hidden="true" />{tx('أوقف', 'Hold')}</Button>;
  const cols: Column<Store>[] = [
    { key: 'store', header: tx('المتجر', 'Store'), cell: (s) => <span className="block max-w-64"><span className="block truncate">{s.name[lang]}</span><span className="block text-xs font-normal text-muted"><Ref>{s.id}</Ref></span></span> },
    { key: 'state', header: tx('الحالة', 'State'), cell: (s) => s.payoutHold ? <span className="flex flex-col items-start gap-1"><Badge tone="amber">{tx('موقوف', 'On hold')}</Badge><span className="max-w-64 text-xs text-muted">{ROLE_LABEL[s.payoutHold.by][lang]} · {f.dt(s.payoutHold.at)}</span></span> : <Badge tone="gray">{tx('في الجدول المعتاد', 'On schedule')}</Badge> },
    { key: 'amount', header: tx('بانتظار التحويل', 'Pending'), align: 'end', cell: (s) => <Money v={s.pendingPayout} className="font-semibold text-fg" /> },
    { key: 'act', header: <span className="sr-only">{tx('إجراءات', 'Actions')}</span>, cell: act },
  ];
  return (
    <>
      <Alert tone="info">{tx('مستحقات التجار أموال التاجر لدى مزوّد الدفع. الإيقاف يؤجل التحويل القادم ولا يحرك أي مبلغ.', 'Merchant payouts are merchant money held by the payment provider. A hold delays the next transfer; no money moves.')}</Alert>
      {!mayAct && <Locked>{tx('الإيقاف والاستئناف للمالية والمالك.', 'Hold and release are for Finance and Owner.')}</Locked>}
      <Card>
        <DataTable label={tx('تحويلات التجار', 'Merchant payouts')} rows={rows} columns={cols} rowKey={(s) => s.id} href={(s) => ahref(`stores/${s.id}`)}
          card={(s) => <div><div className="flex items-baseline justify-between gap-2"><p className="truncate text-sm font-semibold text-fg">{s.name[lang]}</p><Money v={s.pendingPayout} className="text-sm font-semibold" /></div><div className="mt-1.5">{s.payoutHold ? <Badge tone="amber">{tx('موقوف', 'On hold')}</Badge> : <Badge tone="gray">{tx('في الجدول المعتاد', 'On schedule')}</Badge>}</div></div>} />
      </Card>
      {dlg && (
        <ReasonModal title={dlg.hold ? tx('إيقاف تحويل المستحقات', 'Hold merchant payout') : tx('استئناف تحويل المستحقات', 'Release merchant payout')} confirmLabel={dlg.hold ? tx('أوقف التحويل', 'Hold payout') : tx('استأنف التحويل', 'Release payout')}
          danger={dlg.hold} onClose={() => setDlg(null)} target={<><p className="font-semibold text-fg">{dlg.s.name[lang]}</p><p className="text-xs text-muted"><Ref>{dlg.s.id}</Ref> · <Money v={dlg.s.pendingPayout} /></p></>}
          onConfirm={(r) => { const e = dlg.hold ? holdStorePayout(dlg.s.id, r) : releaseStorePayout(dlg.s.id, r); if (!e) toast({ tone: 'ok', text: dlg.hold ? tx('أُوقف التحويل (محاكاة)', 'Payout held (simulated)') : tx('استُؤنف التحويل (محاكاة)', 'Payout released (simulated)') }); return e; }}>
          <ImpactList items={dlg.hold
            ? [{ icon: <Wallet />, text: tx('يتأجل التحويل حتى الاستئناف؛ المتجر يستمر في البيع.', 'The transfer waits until released; the store keeps selling.'), tone: 'warn' }, { icon: <CreditCard />, text: tx('لا يُخصم ولا يُنقل أي مبلغ.', 'No money is deducted or moved.'), tone: 'safe' }]
            : [{ icon: <Wallet />, text: tx('يعود المبلغ إلى جدول التحويل المعتاد.', 'The amount returns to the normal payout schedule.') }]} />
        </ReasonModal>
      )}
    </>
  );
}

function Gateways() {
  const tx = useTx();
  const rows: { k: string; v: string; tone: Tone }[] = [
    { k: tx('بوابة البطاقات والمحافظ الإلكترونية', 'Online card and wallet gateway'), v: tx('بانتظار العقد والإعداد', 'Pending contract & configuration'), tone: 'amber' },
    { k: tx('الدفع عند الاستلام', 'Cash on delivery'), v: tx('يديره التاجر', 'Merchant-managed'), tone: 'gray' },
    { k: tx('التحويل البنكي', 'Bank transfer'), v: tx('يديره التاجر', 'Merchant-managed'), tone: 'gray' },
    { k: tx('نقطة الفوترة الإلكترونية (زاتكا) لكل منطقة', 'E-invoicing endpoint (ZATCA) per region'), v: tx('بانتظار العقد والإعداد', 'Pending contract & configuration'), tone: 'amber' },
  ];
  return (
    <>
      <Alert tone="info">{tx('توفر البوابات لكل منطقة وخطة ونقاط الفوترة تعتمد على عقود المزوّدين. معروضة كحالة إعداد، لا كتكاملات حية.', 'Gateway availability per region and plan, and e-invoicing endpoints, depend on provider contracts. Shown as configuration status, not live integrations.')}</Alert>
      <Card>
        <ul className="divide-y divide-border">
          {rows.map((r) => <li key={r.k} className="flex flex-wrap items-center gap-3 px-5 py-4"><span className="min-w-0 flex-1 basis-48 text-sm font-semibold text-fg">{r.k}</span><Badge tone={r.tone}>{r.v}</Badge><Simulated /></li>)}
        </ul>
      </Card>
    </>
  );
}
