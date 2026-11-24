// Finance (blueprint pp. 29–30, skill ch. 03 "المال", QA06, QA11, QA18, owner requirement 4). Separate from analytics.
// Money states with definitions and drill-downs, settlement issues, payouts with a reconciling statement and mismatch /
// returned-payout resolution, the ledger with URL filters, held funds, invoices, CSV export by period, and plan & billing.
// View only: rules live in ./model.ts and merchant/finance.ts.
import { PayoutHoldNotice } from '../settings/verification-notice';
import { useState, type ReactNode } from 'react';
import {
  Lock, Download, Landmark, ArrowLeft, Check, Minus, Receipt, Wallet, Clock, BadgeCheck, Send, Banknote, Percent, RotateCcw, SearchX, FileX, CircleDollarSign, ShieldAlert, FlaskConical, FileText,
} from 'lucide-react';
import { useReviewMode } from '../../../core/review';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { financeStore, settingsStore, teamStore, testStore } from '../../merchant/stores';
import { can, canSee } from '../../merchant/perms';
import { seatsUsed } from '../../merchant/workspace';
import type { Feature, Payout, Plan, Tx, TxStatus, TxType } from '../../merchant/finance';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, LinkButton, Money, Ref, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, DataTable, FilterChip, Modal, PageHeader, Pagination, SearchInput, Simulated, Tabs, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { sectionHref } from '../pages';
import { downloadCsv } from './download';
import {
  FEATURES, PLANS, STAFF_LIMIT, STATUS_FILTERS, TX_TYPES, caseFor, drillDown, entitled, filterLedger, filterPayouts, hasLedgerFilter, holdForTx, ledgerQuery, mismatchAnalysis,
  moneyStates, netOf, nextPayout, openCase, openCaseFor, paginate, payoutView, payoutsCsv, periodName, planImpact, readLedgerFilter, readPayoutFilter, releaseHold, resolveCase,
  retryPayout, sendEvidence, settlementIssues, signedAmount, statement, txCsv, txTimeline, type LedgerFilter, type MoneyState, type PayoutView, type StatusFilter,
} from './model';
import { financeOpsStore } from './stores';
import { FinanceReviewSim, IssuesPanel } from './issues';
import { InvoicePrint, Invoices } from './invoices';
import { PeriodFilter } from './period-filter';
import { maskIban } from '../../merchant/finance';
import { printHref } from '../orders/print-link';

const href = (path = '', q?: Record<string, string | undefined>) => link(`/dashboard/finance${path ? `/${path}` : ''}`, q);
const txHref = (f: Partial<LedgerFilter>) => href('', ledgerQuery(f));
type Tab = 'payouts' | 'transactions' | 'invoices' | 'billing';
const TABS: Tab[] = ['payouts', 'transactions', 'invoices', 'billing'];
const parseTab = (v: string | null): Tab => (v && (TABS as string[]).includes(v) ? (v as Tab) : 'payouts');

export default function Finance({ route }: { route: Route }) {
  const role = testStore.use().role;
  if (!canSee(role, 'finance')) return <NoAccess />;
  const [a, b] = route.path;
  if (a === 'payouts' && b) return <Statement id={b} />;
  if (a === 'transactions' && b) return <TxDetail id={b} />;
  if (a === 'invoices' && b) return <InvoicePrint id={b} />;
  return <Overview route={route} />;
}

/* ---------- Names ---------- */

function useNames() {
  const tx = useTx();
  const { lang } = useLang();
  return {
    payout: (s: PayoutView) => ({ paid: tx('وصل البنك', 'Paid'), in_transit: tx('في الطريق للبنك', 'In transit'), scheduled: tx('مجدول · تقديري', 'Scheduled · estimate'), returned: tx('أعاده البنك', 'Returned by bank') })[s],
    type: (t: TxType) => ({ sale: tx('بيع', 'Sale'), fee: tx('رسوم', 'Fee'), refund: tx('استرداد', 'Refund'), adjustment: tx('تسوية', 'Adjustment') })[t],
    status: (s: TxStatus) => ({ pending: tx('معلّق لدى المزود', 'Pending at provider'), available: tx('متاح للتحويل', 'Available'), paid_out: tx('دخل في تحويل', 'Paid out') })[s],
    filter: (s: StatusFilter) => ({ pending: tx('معلّق لدى المزود', 'Pending at provider'), held: tx('محجوز', 'Held'), available: tx('متاح للتحويل', 'Available'), paid_out: tx('دخل في تحويل', 'Paid out'), settled: tx('مُسوّى (المحصّل)', 'Settled (collected)') })[s],
    plan: (p: Plan) => ({ basic: 'Basic', plus: 'Plus', pro: 'Pro', special: 'Special' })[p],
    feature: (f: Feature) => ({
      catalog: tx('منتجات وطلبات وعملاء', 'Products, orders, customers'), coupons: tx('كوبونات', 'Coupons'), reviews: tx('تقييمات', 'Reviews'), cod: tx('دفع عند الاستلام وتحويل', 'COD and bank transfer'),
      marketplace: tx('سوق لك', 'LAK marketplace'), epay: tx('دفع إلكتروني', 'Online payments'), labels: tx('بوليصات شحن لك', 'LAK shipping labels'), loyalty: tx('ولاء ومحفظة وكاش باك', 'Loyalty, wallet, cashback'),
      ads: tx('إعلانات ورسائل', 'Ads and messaging'), wholesale: tx('الجملة', 'Wholesale'), themeCode: tx('تحرير كود الثيم', 'Theme code editing'), appMaker: tx('صانع التطبيقات (إضافة)', 'App Maker (add-on)'),
      multiStore: tx('متاجر متعددة', 'Multiple stores'), segments: tx('شرائح العملاء', 'Customer segments'), affiliate: tx('شركاء ومؤثرون', 'Affiliates'), tierPricing: tx('أسعار الكمية', 'Quantity pricing'),
      routing: tx('توجيه المستودع', 'Warehouse routing'), fullReports: tx('تقارير كاملة', 'Full reports'), erp: tx('ERP وتكاملات خاصة', 'ERP and custom integrations'), sla: tx('مدير حساب ودعم SLA', 'Account manager and SLA'),
    })[f],
    date: (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  };
}
const P_TONE: Record<PayoutView, Tone> = { paid: 'green', in_transit: 'sky', scheduled: 'gray', returned: 'red' };
const TX_TONE: Record<TxStatus, Tone> = { pending: 'amber', available: 'brand', paid_out: 'green' };

function Signed({ t, className }: { t: Tx; className?: string }) {
  const v = signedAmount(t);
  return <span className={cn('inline-flex items-baseline gap-0.5 whitespace-nowrap', v < 0 ? 'text-fg' : 'text-emerald-700 dark:text-emerald-400', className)}><bdi dir="ltr">{v < 0 ? '−' : '+'}</bdi><Money v={Math.abs(v)} /></span>;
}

function NoAccess() {
  const tx = useTx();
  return (
    <div className="space-y-6">
      <PageHeader title={tx('المالية', 'Finance')} />
      <Card><EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('ليست لديك صلاحية على المالية', 'You do not have access to finance')}
        action={<LinkButton variant="secondary" href={link('/dashboard')}>{tx('العودة للرئيسية', 'Back to home')}</LinkButton>}>
        {tx('اطلب من مالك المتجر إضافة صلاحية المالية لدورك.', 'Ask the store owner to add finance access to your role.')}
      </EmptyState></Card>
    </div>
  );
}

/* ---------- Overview: money cards + tabs ---------- */

function Overview({ route }: { route: Route }) {
  const tx = useTx();
  const n = useNames();
  const state = useDashState();
  const fin = financeStore.use();
  const ops = financeOpsStore.use();
  const tab = parseTab(route.query.get('tab'));
  const empty = state === 'empty';
  const txs = empty ? [] : fin.txs;
  const payouts = empty ? [] : fin.payouts;
  const data = empty ? { txs, payouts, holds: [] } : fin;
  const next = nextPayout(payouts);
  const issues = empty ? [] : settlementIssues(fin, ops);

  const header = (
    <PageHeader title={tx('المالية', 'Finance')}
      description={tx('1–24 نوفمبر 2026 · ريال سعودي · توقيت الرياض', '1–24 Nov 2026 · Saudi riyal · Riyadh time')}
      actions={next && state === 'live' ? <LinkButton variant="secondary" href={href(`payouts/${next.id}`)}><Landmark className="size-4" aria-hidden="true" />{tx(`التحويل القادم · ${n.date(next.date)}`, `Next payout · ${n.date(next.date)}`)}</LinkButton> : undefined} />
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<FinanceSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل السجل المالي', 'The ledger could not load')} onRetry={() => setDashState('live')}>
        {tx('أرصدتك وتحويلاتك لم تتأثر. المرجع SIM-FIN-503.', 'Your balances and payouts are unaffected. Ref SIM-FIN-503.')}
      </ErrorState></Card>
    </div>
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'payouts', label: tx('التحويلات البنكية', 'Payouts'), count: payouts.length },
    { id: 'transactions', label: tx('الحركات', 'Transactions'), count: txs.length },
    { id: 'invoices', label: tx('الفواتير', 'Invoices') },
    { id: 'billing', label: tx('الخطة والفوترة', 'Plan & billing') },
  ];
  return (
    <div className="space-y-6">
      {header}
      <FinanceReviewSim />
      <PayoutHoldNotice />
      <IssuesPanel issues={issues} />
      <MoneyCards data={data} empty={empty} />
      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs label={tx('أقسام المالية', 'Finance sections')} items={tabs.map((t) => ({ href: href('', { tab: t.id === 'payouts' ? undefined : t.id }), label: t.label, current: tab === t.id, count: t.count }))} />
        </div>
        {tab === 'payouts' && <Payouts route={route} payouts={payouts} txs={txs} />}
        {tab === 'transactions' && <Transactions route={route} data={data} />}
        {tab === 'invoices' && <Invoices route={route} empty={empty} />}
        {tab === 'billing' && <Billing />}
      </Card>
      {!empty && <FinanceLog />}
    </div>
  );
}

function MoneyCards({ data, empty }: { data: { txs: Tx[]; payouts: Payout[]; holds?: import('../../merchant/finance').Hold[] }; empty: boolean }) {
  const tx = useTx();
  const c = moneyStates(data);
  const to = (st: MoneyState) => { const d = drillDown(st); return href('', d.tab === 'payouts' ? d.query : d.query); };
  const cards: { id: MoneyState; label: string; hint: string; v: number; icon: ReactNode; sub?: ReactNode; strong?: boolean; warn?: boolean }[] = [
    { id: 'gross', label: tx('إجمالي المبيعات', 'Gross sales'), hint: tx('كل المبيعات المدفوعة شاملة الشحن والضريبة، قبل الرسوم والاستردادات. = المحصّل + المعلّق.', 'All paid sales incl. shipping and VAT, before fees and refunds. = collected + pending.'), v: c.gross, icon: <Receipt className="size-5" /> },
    { id: 'collected', label: tx('المحصّل', 'Collected'), hint: tx('مبيعات سوّاها مزود الدفع لصالحك (متاحة أو حُوّلت).', 'Sales the payment provider has settled to you (available or paid out).'), v: c.collected, icon: <BadgeCheck className="size-5" /> },
    { id: 'pending', label: tx('المعلّق', 'Pending'), hint: tx('دُفع لدى المزود ولم يُسوَّ بعد. لا يمكن تحويله الآن. يشمل المحجوز.', 'Captured by the provider, not settled yet. Cannot be paid out yet. Includes held funds.'), v: c.pending, icon: <Clock className="size-5" /> },
    { id: 'held', label: tx('المحجوز', 'Held'), hint: tx('جزء من المعلّق يحتجزه المزود بسبب اعتراض أو مراجعة، حتى يقرر. يُفرج عنه أو يُسترد للعميل.', 'Part of pending the provider keeps back for a dispute or review until it decides. Released to you or returned to the customer.'), v: c.held, icon: <ShieldAlert className="size-5" />, warn: c.held > 0 },
    { id: 'available', label: tx('المتاح للتحويل', 'Available for payout'), hint: tx('مبالغ مُسوّاة بعد الرسوم والاستردادات ولم تُحوَّل بعد، ومعها أي تحويل أعاده البنك. ليست ربحًا: لا تشمل تكلفة البضاعة والشحن والمصاريف.', 'Settled, after fees and refunds, not yet paid out, plus any payout the bank returned. Not profit: excludes cost of goods, shipping and expenses.'), v: c.available, icon: <Wallet className="size-5" />, strong: true,
      sub: c.returned ? <>{tx('منها مرتجع', 'incl. returned')} <Money v={c.returned} /></> : undefined },
    { id: 'paidOut', label: tx('المحوّل', 'Paid out'), hint: tx('تحويلات وصلت حسابك البنكي.', 'Transfers that reached your bank account.'), v: c.paidOut, icon: <Landmark className="size-5" /> },
    { id: 'inTransit', label: tx('في الطريق للبنك', 'In transit'), hint: tx('تحويلات أُرسلت ولم تصل بعد.', 'Transfers sent, not arrived yet.'), v: c.inTransit, icon: <Send className="size-5 rtl:-scale-x-100" /> },
    { id: 'fees', label: tx('الرسوم', 'Fees'), hint: tx('رسوم معالجة الدفع. نسبة اختبار وليست تسعير «لك».', 'Payment processing fees. A test rate, not LAK pricing.'), v: c.fees, icon: <Percent className="size-5" /> },
    { id: 'refunds', label: tx('الاستردادات', 'Refunds'), hint: tx('مبالغ أُعيدت للعملاء وخُصمت من التحويلات.', 'Money returned to customers and deducted from payouts.'), v: c.refunds, icon: <RotateCcw className="size-5" />,
      sub: c.refundsPending ? <>{tx('بانتظار المزود', 'Awaiting provider')} <Money v={c.refundsPending} /></> : undefined },
  ];
  return (
    <section aria-label={tx('حالات المال', 'Money states')} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      {cards.map((k, i) => (
        <div key={k.id} className={cn('flex flex-col rounded-2xl border bg-surface p-4 sm:p-5', k.strong ? 'border-brand-300 dark:border-brand-500/40' : k.warn ? 'border-amber-500/40' : 'border-border', i === cards.length - 1 && 'col-span-2 lg:col-span-1')}>
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1 text-[13px] font-medium text-muted">{k.label}<InfoHint>{k.hint}</InfoHint></p>
            <span className={cn('hidden size-9 shrink-0 place-items-center rounded-xl sm:grid', k.strong ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : k.warn ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-surface-2 text-muted')} aria-hidden="true">{k.icon}</span>
          </div>
          <p className="mt-1 text-xl font-bold tracking-tight text-fg tabular-nums sm:text-2xl">{empty ? '—' : <Money v={k.v} />}</p>
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-muted">
            {empty ? tx('لا حركات بعد', 'No transactions yet') : <>
              {k.sub}
              <a href={to(k.id)} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('ما وراء الرقم', 'What’s behind it')}</a>
            </>}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ---------- Payouts ---------- */

function Payouts({ route, payouts, txs }: { route: Route; payouts: Payout[]; txs: Tx[] }) {
  const tx = useTx();
  const n = useNames();
  const toast = useToast();
  const pf = readPayoutFilter(route.query);
  const from = route.query.get('from') ?? '', to = route.query.get('to') ?? '';
  const go = (o: Record<string, string | undefined>) => replace(href('', { pstatus: pf || undefined, from: from || undefined, to: to || undefined, ...o }));
  if (payouts.length === 0) return <EmptyState icon={<Landmark className="size-6" aria-hidden="true" />} title={tx('لا تحويلات بعد', 'No payouts yet')}>{tx('يُجدول أول تحويل بعد تسوية أول بيع مدفوع.', 'The first payout is scheduled after your first paid sale settles.')}</EmptyState>;
  const rows = filterPayouts(payouts, pf, from, to);
  const amount = (p: Payout) => p.amount ?? statement(p, txs).net;
  const exportCsv = () => { downloadCsv(periodName('lak-payouts', from, to), payoutsCsv(rows, txs)); toast({ tone: 'ok', text: tx(`صُدّرت ${rows.length} تحويلات`, `Exported ${rows.length} payouts`) }); };
  const flag = (p: Payout) => { const st = statement(p, txs); return st.matches === false ? <Badge tone="red">{tx('غير مطابق', 'Mismatch')}</Badge> : null; };
  const columns: Column<Payout>[] = [
    { key: 'id', header: tx('المرجع', 'Reference'), cell: (p) => <Ref>{p.id}</Ref> },
    { key: 'period', header: tx('فترة المبيعات', 'Sales period'), cell: (p) => <span className="text-muted">{n.date(p.from)} – {n.date(p.to)}</span> },
    { key: 'date', header: tx('تاريخ التحويل', 'Payout date'), cell: (p) => n.date(p.date) },
    { key: 'status', header: tx('الحالة', 'Status'), cell: (p) => <span className="flex flex-wrap gap-1"><Badge tone={P_TONE[payoutView(p)]}>{n.payout(payoutView(p))}</Badge>{flag(p)}</span> },
    { key: 'acc', header: tx('الحساب', 'Account'), hideBelow: 'lg', cell: (p) => <span className="text-muted"><Ref>{p.account}</Ref></span> },
    { key: 'net', header: tx('الصافي', 'Net'), align: 'end', cell: (p) => <Money v={amount(p)} className="font-semibold text-fg" /> },
  ];
  return (
    <div className="border-t border-border">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <FilterChip label={tx('الحالة', 'Status')} value={pf} onChange={(v) => go({ pstatus: v || undefined })}
          options={(['paid', 'in_transit', 'scheduled', 'returned'] as PayoutView[]).map((v) => ({ value: v, label: n.payout(v) }))} />
        <PeriodFilter from={from} to={to} onChange={(f, t) => go({ from: f || undefined, to: t || undefined })} />
        <Button variant="secondary" className="ms-auto" onClick={exportCsv} disabled={!rows.length}><Download className="size-4" aria-hidden="true" />{tx(`تصدير CSV · ${rows.length}`, `Export CSV · ${rows.length}`)}</Button>
      </div>
      {rows.length === 0 ? <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا تحويلات تطابق التصفية', 'No payouts match these filters')} action={<LinkButton variant="secondary" href={href()}>{tx('امسح التصفية', 'Clear filters')}</LinkButton>} /> : (
        <div className="border-t border-border">
          <DataTable label={tx('التحويلات البنكية', 'Payouts')} rows={rows} columns={columns} rowKey={(p) => p.id} href={(p) => href(`payouts/${p.id}`)}
            card={(p) => (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg"><Ref>{p.id}</Ref></p>
                  <p className="mt-0.5 text-xs text-muted">{n.date(p.date)} · {n.date(p.from)} – {n.date(p.to)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1"><Badge tone={P_TONE[payoutView(p)]}>{n.payout(payoutView(p))}</Badge>{flag(p)}</div>
                </div>
                <Money v={amount(p)} className="text-sm font-semibold text-fg" />
              </div>
            )} />
        </div>
      )}
      <p className="border-t border-border px-5 py-3 text-xs text-muted">{tx('افتح أي تحويل لرؤية كشف المطابقة. التصدير يشمل المطابقة لكل تحويل.', 'Open a payout to see its reconciliation. The export includes each payout’s reconciliation.')}</p>
    </div>
  );
}

/* ---------- Statement (QA11) ---------- */

function Statement({ id }: { id: string }) {
  const tx = useTx();
  const n = useNames();
  const state = useDashState();
  const fin = financeStore.use();
  const toast = useToast();
  const back = { href: href(), label: tx('التحويلات البنكية', 'Payouts') };
  const p = state === 'empty' ? undefined : fin.payouts.find((x) => x.id === id);
  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={<Skeleton className="h-8 w-64" />} /><Skeleton className="h-96 w-full rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6"><PageHeader back={back} title={tx('كشف التحويل', 'Payout statement')} /><Card><ErrorState as="h2" title={tx('تعذّر تحميل الكشف', 'The statement could not load')} onRetry={() => setDashState('live')}>{tx('المرجع SIM-FIN-504.', 'Ref SIM-FIN-504.')}</ErrorState></Card></div>;
  if (!p) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('كشف التحويل', 'Payout statement')} />
      <Card><EmptyState as="h2" icon={<FileX className="size-6" aria-hidden="true" />} title={tx('لا يوجد تحويل بهذا المرجع', 'No payout with this reference')} action={<LinkButton variant="secondary" href={back.href}>{tx('كل التحويلات', 'All payouts')}</LinkButton>}><Ref>{id}</Ref></EmptyState></Card>
    </div>
  );
  const s = statement(p, fin.txs);
  const label: Record<TxType, string> = { sale: tx('المحصّل من المبيعات', 'Collected from sales'), fee: tx('رسوم الدفع', 'Payment fees'), refund: tx('الاستردادات', 'Refunds'), adjustment: tx('تسويات أخرى', 'Other adjustments') };
  const mine = fin.txs.filter((t) => t.payoutId === p.id);
  const exportCsv = () => { downloadCsv(`lak-statement-${p.id}.csv`, txCsv(mine)); toast({ tone: 'ok', text: tx(`نُزّل الكشف · ${mine.length} حركة`, `Statement downloaded · ${mine.length} transactions`) }); };

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={<>{tx('كشف التحويل', 'Payout statement')} <Ref>{p.id}</Ref></>}
        meta={<><Badge tone={P_TONE[payoutView(p)]}>{n.payout(payoutView(p))}</Badge><span className="text-sm text-muted">{n.date(p.from)} – {n.date(p.to)} · {tx('ريال سعودي', 'SAR')}</span></>}
        actions={<Button variant="secondary" onClick={exportCsv}><Download className="size-4" aria-hidden="true" />{tx('نزّل الكشف CSV', 'Download CSV')}</Button>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-rec">
          <CardHeader id="h-rec" title={tx('المطابقة', 'Reconciliation')} hint={tx('المحصّل − الرسوم − الاستردادات ± التسويات = الصافي. كل حركة تُحسب مرة واحدة في تحويل واحد، ولا نجمع عملات مختلفة.', 'Collected − fees − refunds ± adjustments = net. Each transaction counts once, in one payout; currencies are never mixed.')} />
          <ul className="divide-y divide-border border-t border-border">
            {s.lines.map((l) => (
              <li key={l.type}>
                <a href={txHref({ payout: p.id, type: l.type })} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/60">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-sm font-bold', l.sign === '+' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400')} aria-hidden="true">{l.sign}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">{label[l.type]}</p>
                    <p className="text-xs text-muted">{tx(`${l.count} حركة`, `${l.count} transaction${l.count === 1 ? '' : 's'}`)}</p>
                  </div>
                  <span className="flex items-baseline gap-1 text-sm font-semibold text-fg"><span className="sr-only">{l.sign === '+' ? tx('يضاف', 'plus') : tx('يخصم', 'minus')}</span><bdi dir="ltr" aria-hidden="true">{l.sign}</bdi><Money v={l.amount} /></span>
                  <ArrowLeft className="size-4 text-subtle transition-colors group-hover:text-brand-600 ltr:rotate-180" aria-hidden="true" />
                </a>
              </li>
            ))}
            <li className="flex items-center gap-3 bg-surface-2/50 px-5 py-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-sm font-bold text-brand-700 dark:text-brand-300" aria-hidden="true">=</span>
              <p className="flex-1 text-sm font-bold text-fg">{tx('الصافي المحسوب', 'Computed net')}</p>
              <Money v={s.net} className="text-lg font-bold text-fg" />
              <span className="size-4" aria-hidden="true" />
            </li>
            <li className="flex items-center gap-3 px-5 py-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted" aria-hidden="true"><Landmark className="size-4" /></span>
              <p className="flex-1 text-sm text-fg">{p.status === 'scheduled' ? tx('مبلغ التحويل', 'Payout amount') : tx('المبلغ المحوّل للبنك', 'Amount sent to bank')}</p>
              {s.transferred === null ? <span className="text-sm text-muted">{tx('لم يُرسل بعد', 'Not sent yet')}</span> : <Money v={s.transferred} className="text-sm font-semibold text-fg" />}
              <span className="size-4" aria-hidden="true" />
            </li>
          </ul>
          <div className="space-y-3 px-5 py-4">
            {p.problem && <Returned p={p} />}
            {s.matches === true && !p.problem && <Alert tone="ok" title={tx('مطابق', 'Reconciled')}>{tx('الصافي المحسوب يساوي المبلغ المحوّل.', 'The computed net equals the amount transferred.')}</Alert>}
            {s.matches === false && <Mismatch p={p} />}
            {s.matches === null && <Alert tone="info" title={tx('تقديري', 'Estimate')}>{tx('قد يتغير قبل موعده إذا أُضيفت حركات مثل استرداد.', 'May change before its date if transactions such as a refund are added.')}{p.attempts?.length ? <> {tx(`محاولة سابقة أعادها البنك (${p.attempts.length}).`, `Earlier attempt returned by the bank (${p.attempts.length}).`)}</> : null}</Alert>}
          </div>
        </Card>

        <Card aria-labelledby="h-det">
          <CardHeader id="h-det" title={tx('التفاصيل', 'Details')} />
          <div className="px-5 pb-5"><dl className="space-y-3 text-sm">
            {[
              [tx('فترة المبيعات', 'Sales period'), <>{n.date(p.from)} – {n.date(p.to)}</>],
              [tx('تاريخ التحويل', 'Payout date'), <>{n.date(p.date)}{p.status === 'scheduled' && <span className="text-muted"> · {tx('متوقع', 'expected')}</span>}</>],
              [tx('الحساب البنكي', 'Bank account'), <Ref>{p.account}</Ref>],
              [tx('العملة', 'Currency'), tx('ريال سعودي (SAR)', 'Saudi riyal (SAR)')],
              [tx('عدد الحركات', 'Transactions'), <span className="tabular-nums">{s.count}</span>],
            ].map(([k, v], i) => <div key={i} className="flex items-baseline justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-end font-medium text-fg">{v}</dd></div>)}
          </dl></div>
          <div className="border-t border-border px-5 py-4">
            <a href={txHref({ payout: p.id })} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('كل حركات هذا التحويل', 'All transactions in this payout')}</a>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Resolving a mismatch or a returned payout ---------- */

function useWho() {
  const role = testStore.use().role;
  const tx = useTx();
  return ({ owner: tx('المالك', 'Owner'), finance: tx('المحاسب', 'Finance'), fulfilment: tx('التجهيز', 'Fulfilment'), marketing: tx('التسويق', 'Marketing') } as Record<string, string>)[role] ?? role;
}

function Mismatch({ p }: { p: Payout }) {
  const tx = useTx();
  const n = useNames();
  const toast = useToast();
  const review = useReviewMode();
  const who = useWho();
  const fin = financeStore.use();
  const ops = financeOpsStore.use();
  const role = testStore.use().role;
  const [confirm, setConfirm] = useState(false);
  const m = mismatchAnalysis(p, fin.txs);
  const c = caseFor(ops, p.id);
  const open = openCaseFor(ops, p.id);
  const next = nextPayout(fin.payouts);
  const manage = can(role, 'billing.manage');
  const doOpen = () => {
    financeOpsStore.set((o) => openCase(o, p, m.diff, who, new Date().toISOString()));
    toast({ tone: 'ok', text: tx('فُتحت حالة مطابقة وأُرسلت للمزود (محاكاة)', 'Reconciliation case opened and sent to the provider (simulated)') });
    setConfirm(false);
  };
  const providerSettles = () => {
    if (!open) return;
    const r = resolveCase(fin, ops, open.id, `TX-ADJ-${open.id.slice(4)}`, new Date().toISOString());
    if (!r) { toast({ tone: 'bad', text: tx('لا تحويل مجدول لإضافة التسوية إليه.', 'No scheduled payout to carry the adjustment.') }); return; }
    financeStore.set((f) => ({ ...f, txs: r.fin.txs }));
    financeOpsStore.set(r.ops);
    toast({ tone: 'ok', text: tx('سوّى المزود الفرق في التحويل القادم (محاكاة)', 'Provider settled the difference in the next payout (simulated)') });
  };
  return (
    <div className="space-y-3">
      <Alert tone={c?.state === 'resolved' ? 'ok' : 'bad'} title={c?.state === 'resolved' ? tx('الفرق سُوّي', 'Difference settled') : tx('غير مطابق', 'Does not reconcile')}>
        {m.short ? tx('وصل البنك أقل من الصافي المحسوب بـ', 'The bank received less than the computed net by') : tx('وصل البنك أكثر من الصافي المحسوب بـ', 'The bank received more than the computed net by')} <Money v={Math.abs(m.diff)} />.
        {c?.state === 'resolved' && c.adjustmentTx && <> {tx('التسوية', 'Adjustment')} <a className="font-semibold underline" href={href(`transactions/${c.adjustmentTx}`)}><Ref>{c.adjustmentTx}</Ref></a>.</>}
      </Alert>
      {c?.state !== 'resolved' && (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-semibold text-fg">{tx('كيف تحلّه', 'How to resolve it')}</p>
          <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-sm text-fg">
            <li>{m.candidates.length
              ? <>{tx('الفرق يساوي حركة في الكشف؛ ربما حُسبت مرتين أو سقطت: ', 'The difference equals a line in this statement; it may be counted twice or left out: ')}{m.candidates.slice(0, 3).map((t, i) => <span key={t.id}>{i > 0 && ', '}<a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={href(`transactions/${t.id}`)}><Ref>{t.id}</Ref></a> ({n.type(t.type)})</span>)}</>
              : m.smallFee ? tx('فرق صغير قد يكون رسوم تحويل من البنك؛ قارنه بكشف حسابك البنكي.', 'A small difference may be a bank transfer charge; compare with your bank statement.')
                : tx('قارن المبلغ بكشف حسابك البنكي لنفس التاريخ.', 'Compare the amount with your bank statement for the same date.')}</li>
            <li>{tx('افتح حالة مطابقة؛ يرسلها لك المزود مع مرجع التحويل وجدول الحركات.', 'Open a reconciliation case; it goes to the provider with the payout reference and the transaction list.')}</li>
            <li>{tx(`يُسوّى الفرق كتسوية في التحويل القادم${next ? ` (${next.id})` : ''}.`, `The difference is settled as an adjustment in the next payout${next ? ` (${next.id})` : ''}.`)}</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {open ? <Badge tone="amber">{tx(`الحالة ${open.id} مفتوحة لدى المزود`, `Case ${open.id} open with the provider`)}</Badge>
              : manage ? <Button size="sm" onClick={() => setConfirm(true)}>{tx('افتح حالة مطابقة', 'Open reconciliation case')}</Button>
                : <span className="flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden="true" />{tx('يتطلب صلاحية الفوترة', 'Needs billing permission')}</span>}
            {review && open && <Button size="sm" variant="ghost" onClick={providerSettles}><FlaskConical className="size-3.5" aria-hidden="true" />{tx('رد المزود: سوِّ الفرق', 'Provider reply: settle')}</Button>}
          </div>
        </div>
      )}
      {confirm && (
        <Modal title={tx(`فتح حالة مطابقة لـ ${p.id}`, `Open a reconciliation case for ${p.id}`)} onClose={() => setConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={doOpen}>{tx('افتح الحالة وأرسلها', 'Open and send')}</Button></>}>
          <dl className="space-y-2 rounded-xl bg-surface-2/60 p-4 text-sm">
            {[[tx('التحويل', 'Payout'), <Ref key="r">{p.id}</Ref>], [tx('الفرق', 'Difference'), <Money key="m" v={Math.abs(m.diff)} />], [tx('يُرسل إلى', 'Sent to'), tx('مزود الدفع', 'The payment provider')], [tx('الأثر', 'Effect'), tx('لا يتغير رصيدك حتى يرد المزود', 'Your balance does not change until the provider replies')]]
              .map(([k, v], i) => <div key={i} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-end font-medium text-fg">{v}</dd></div>)}
          </dl>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('يُسجَّل في سجل المالية باسمك ووقته.', 'Logged in the finance log with your name and time.')}</p>
        </Modal>
      )}
    </div>
  );
}

function Returned({ p }: { p: Payout }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const toast = useToast();
  const who = useWho();
  const fin = financeStore.use();
  const ops = financeOpsStore.use();
  const settings = settingsStore.use();
  const role = testStore.use().role;
  const [confirm, setConfirm] = useState(false);
  const bank = settings.bank ?? null;
  const next = nextPayout(fin.payouts);
  const date = next?.date ?? '2026-11-30';
  const retry = () => {
    const r = retryPayout(fin, ops, p.id, who, new Date().toISOString(), date);
    if (!r) return;
    financeStore.set((f) => ({ ...f, payouts: r.fin.payouts }));
    financeOpsStore.set(r.ops);
    toast({ tone: 'ok', text: tx(`أُعيدت جدولة ${p.id} إلى ${n.date(date)} (محاكاة)`, `${p.id} rescheduled to ${n.date(date)} (simulated)`) });
    setConfirm(false);
  };
  return (
    <div className="space-y-3">
      <Alert tone="bad" title={tx('أعاد البنك هذا التحويل', 'The bank returned this payout')}>{p.problem!.reason[lang]}. {tx('المبلغ عاد إلى «المتاح للتحويل».', 'The amount is back in “available for payout”.')}</Alert>
      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-semibold text-fg">{tx('كيف تحلّه', 'How to resolve it')}</p>
        <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-sm text-fg">
          <li>{tx('تحقق من الحساب البنكي ورقم الآيبان واسم المستفيد.', 'Check the bank account, IBAN and beneficiary name.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={sectionHref('settings', 'payments', { section: 'bank' })}>{tx('إعدادات الحساب البنكي', 'Bank account settings')}</a></li>
          <li>{tx('أعد محاولة التحويل؛ يُضم إلى موعد التحويل القادم.', 'Retry the payout; it joins the next payout date.')}</li>
        </ol>
        <div className="mt-3">
          {can(role, 'billing.manage') ? <Button size="sm" onClick={() => setConfirm(true)}><RotateCcw className="size-4" aria-hidden="true" />{tx('أعد محاولة التحويل', 'Retry payout')}</Button>
            : <span className="flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden="true" />{tx('يتطلب صلاحية الفوترة', 'Needs billing permission')}</span>}
        </div>
      </div>
      {confirm && (
        <Modal title={tx(`إعادة محاولة ${p.id}`, `Retry ${p.id}`)} onClose={() => setConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={retry}>{tx('أعد الجدولة', 'Reschedule')}</Button></>}>
          <dl className="space-y-2 rounded-xl bg-surface-2/60 p-4 text-sm">
            {[[tx('المبلغ', 'Amount'), <Money key="m" v={p.amount ?? 0} />], [tx('إلى الحساب', 'To account'), <Ref key="a">{bank ? maskIban(bank.iban) : p.account}</Ref>], [tx('الموعد الجديد', 'New date'), n.date(date)]]
              .map(([k, v], i) => <div key={i} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-end font-medium text-fg">{v}</dd></div>)}
          </dl>
          {!bank && <Alert tone="warn">{tx('لم تحفظ حسابًا بنكيًا جديدًا؛ سيُعاد التحويل إلى الحساب نفسه وقد يُرفض مرة أخرى.', 'You have not saved a new bank account; the payout goes to the same account and may be returned again.')}</Alert>}
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('يُسجَّل في سجل المالية باسمك ووقته.', 'Logged in the finance log with your name and time.')}</p>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Transactions ---------- */

function Transactions({ route, data }: { route: Route; data: { txs: Tx[]; payouts: Payout[]; holds?: import('../../merchant/finance').Hold[] } }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const toast = useToast();
  const role = testStore.use().role;
  const { txs, payouts } = data;
  const f = readLedgerFilter(route.query, payouts);
  const rows = filterLedger(data, f);
  const pg = paginate(rows, Number(route.query.get('page')) || 1);
  const go = (o: Partial<LedgerFilter>) => replace(txHref({ ...f, ...o }));
  const seeOrders = canSee(role, 'orders');
  const heldIds = new Set((data.holds ?? []).filter((h) => h.state !== 'released').map((h) => h.txId));

  if (txs.length === 0) return <EmptyState icon={<CircleDollarSign className="size-6" aria-hidden="true" />} title={tx('لا حركات بعد', 'No transactions yet')}>{tx('تظهر هنا المبيعات والرسوم والاستردادات بعد أول طلب مدفوع.', 'Sales, fees and refunds appear here after your first paid order.')}</EmptyState>;

  const exportCsv = () => {
    downloadCsv(periodName(['lak-transactions', f.payout, f.type, f.status].filter(Boolean).join('-'), f.from, f.to), txCsv(rows));
    toast({ tone: 'ok', text: tx(`صُدّرت ${rows.length} حركة`, `Exported ${rows.length} transactions`) });
  };
  const badge = (t: Tx) => (heldIds.has(t.id) ? <Badge tone="red">{tx('محجوز', 'Held')}</Badge> : <Badge tone={TX_TONE[t.status]}>{n.status(t.status)}</Badge>);
  const columns: Column<Tx>[] = [
    { key: 'id', header: tx('المرجع', 'Ref'), cell: (t) => <Ref>{t.id}</Ref> },
    { key: 'type', header: tx('النوع', 'Type'), cell: (t) => <span><span className="text-fg">{n.type(t.type)}</span>{t.note && <span className="block text-xs text-muted">{t.note[lang]}</span>}</span> },
    { key: 'order', header: tx('الطلب', 'Order'), hideBelow: 'md', cell: (t) => (t.orderRef ? (seeOrders ? <a href={sectionHref('orders', t.orderRef)} className="text-brand-700 hover:underline dark:text-brand-300"><Ref>#{t.orderRef}</Ref></a> : <Ref>#{t.orderRef}</Ref>) : <span className="text-subtle">—</span>) },
    { key: 'status', header: tx('الحالة', 'Status'), cell: badge },
    { key: 'dates', header: <span className="inline-flex items-center gap-1">{tx('البيع / التسوية', 'Sale / settled')}<InfoHint>{tx('تاريخ البيع غير تاريخ تسوية المزود وغير تاريخ التحويل البنكي.', 'Sale date, provider settlement and bank payout are different dates.')}</InfoHint></span>, hideBelow: 'lg', cell: (t) => <span className="whitespace-nowrap text-muted">{n.date(t.saleDay)} / {t.settledDay ? n.date(t.settledDay) : '—'}</span> },
    { key: 'payout', header: tx('التحويل', 'Payout'), hideBelow: 'lg', cell: (t) => (t.payoutId ? <a href={href(`payouts/${t.payoutId}`)} className="text-brand-700 hover:underline dark:text-brand-300"><Ref>{t.payoutId}</Ref></a> : <span className="text-subtle">—</span>) },
    { key: 'amount', header: tx('المبلغ', 'Amount'), align: 'end', cell: (t) => <Signed t={t} className="font-semibold" /> },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <SearchInput value={f.q} onChange={(v) => go({ q: v })} placeholder={tx('ابحث بمرجع الحركة أو الطلب', 'Search transaction or order ref')} />
        <FilterChip label={tx('النوع', 'Type')} value={f.type} onChange={(v) => go({ type: v as TxType | '' })} options={TX_TYPES.map((t) => ({ value: t, label: n.type(t) }))} />
        <FilterChip label={tx('الحالة', 'Status')} value={f.status} onChange={(v) => go({ status: v as StatusFilter | '' })} options={STATUS_FILTERS.map((s) => ({ value: s, label: n.filter(s) }))} />
        <FilterChip label={tx('التحويل', 'Payout')} value={f.payout} onChange={(v) => go({ payout: v })} options={payouts.map((p) => ({ value: p.id, label: p.id }))} />
        {hasLedgerFilter(f) && <a href={txHref({})} className="px-2 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('مسح', 'Clear')}</a>}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
        <PeriodFilter from={f.from} to={f.to} onChange={(from, to) => go({ from, to })} />
        <Button variant="secondary" className="ms-auto" onClick={exportCsv} disabled={rows.length === 0}><Download className="size-4" aria-hidden="true" />{tx(`تصدير CSV · ${rows.length}`, `Export CSV · ${rows.length}`)}</Button>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface-2/40 px-5 py-2.5 text-xs text-muted" role="status">
        {tx(`${rows.length} حركة · الصافي`, `${rows.length} transactions · net`)} <span className="font-semibold text-fg">{netOf(rows) < 0 ? '−' : ''}<Money v={Math.abs(netOf(rows))} /></span>
        <InfoHint>{tx('المبيعات تضاف، والرسوم والاستردادات تخصم، والتسويات بإشارتها. الفترة حسب تاريخ البيع. التصدير يشمل كل النتائج المصفاة لا الصفحة فقط، بلا بيانات العملاء.', 'Sales add, fees and refunds subtract, adjustments keep their sign. The period uses the sale date. Export covers all filtered results, not just this page, without customer data.')}</InfoHint>
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا حركات تطابق التصفية', 'No transactions match these filters')} action={<LinkButton variant="secondary" href={txHref({})}>{tx('امسح التصفية', 'Clear filters')}</LinkButton>} />
      ) : (
        <div className="border-t border-border">
          <DataTable label={tx('الحركات المالية', 'Transactions')} rows={pg.rows} columns={columns} rowKey={(t) => t.id} href={(t) => href(`transactions/${t.id}`)}
            card={(t) => (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{n.type(t.type)}{t.orderRef && <span className="font-normal text-muted"> · <Ref>#{t.orderRef}</Ref></span>}</p>
                  <p className="mt-0.5 text-xs text-muted"><Ref>{t.id}</Ref> · {n.date(t.saleDay)}</p>
                  <div className="mt-1.5">{badge(t)}</div>
                </div>
                <Signed t={t} className="text-sm font-semibold" />
              </div>
            )} />
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(p) => href('', ledgerQuery(f, { page: p > 1 ? String(p) : undefined }))} />
        </div>
      )}
    </div>
  );
}

function TxDetail({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const state = useDashState();
  const fin = financeStore.use();
  const role = testStore.use().role;
  const back = { href: href('', { tab: 'transactions' }), label: tx('الحركات', 'Transactions') };
  const t = state === 'empty' ? undefined : fin.txs.find((x) => x.id === id);
  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={<Skeleton className="h-8 w-48" />} /><Skeleton className="h-72 w-full rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6"><PageHeader back={back} title={tx('حركة مالية', 'Transaction')} /><Card><ErrorState as="h2" title={tx('تعذّر تحميل الحركة', 'The transaction could not load')} onRetry={() => setDashState('live')} /></Card></div>;
  if (!t) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('حركة مالية', 'Transaction')} />
      <Card><EmptyState as="h2" icon={<FileX className="size-6" aria-hidden="true" />} title={tx('لا توجد حركة بهذا المرجع', 'No transaction with this reference')} action={<LinkButton variant="secondary" href={back.href}>{tx('كل الحركات', 'All transactions')}</LinkButton>}><Ref>{id}</Ref></EmptyState></Card>
    </div>
  );
  const tl = txTimeline(t, fin.payouts);
  const hold = holdForTx(fin, t.id);
  const steps: { done: boolean; label: string; date: string | null; extra?: ReactNode }[] = [
    { done: true, label: t.type === 'sale' ? tx('البيع', 'Sale') : tx('تسجيل الحركة', 'Recorded'), date: tl.sale },
    { done: !!tl.settled, label: tx('تسوية المزود', 'Provider settlement'), date: tl.settled },
    { done: tl.paid, label: tl.payout ? `${tx('التحويل البنكي', 'Bank payout')} · ${n.payout(tl.payout.status)}` : tx('التحويل البنكي', 'Bank payout'), date: tl.payoutDate, extra: tl.payout ? <a href={href(`payouts/${tl.payout.id}`)} className="text-brand-700 hover:underline dark:text-brand-300"><Ref>{tl.payout.id}</Ref></a> : undefined },
  ];
  return (
    <div className="space-y-6">
      <PageHeader back={back} title={<>{n.type(t.type)} <Ref>{t.id}</Ref></>} meta={<>{hold && hold.state !== 'released' ? <Badge tone="red">{tx('محجوز', 'Held')}</Badge> : <Badge tone={TX_TONE[t.status]}>{n.status(t.status)}</Badge>}</>} />
      {hold && <HoldPanel holdId={hold.id} />}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-tx">
          <CardHeader id="h-tx" title={tx('الحركة', 'Transaction')} />
          <div className="px-5 pb-2"><p className="text-3xl font-bold tracking-tight text-fg"><Signed t={t} /></p>{t.note && <p className="mt-1 text-sm text-muted">{t.note[lang]}</p>}</div>
          <div className="px-5 py-4"><dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              [tx('النوع', 'Type'), n.type(t.type)],
              [tx('الطلب', 'Order'), t.orderRef ? (canSee(role, 'orders') ? <a href={sectionHref('orders', t.orderRef)} className="text-brand-700 hover:underline dark:text-brand-300"><Ref>#{t.orderRef}</Ref></a> : <Ref>#{t.orderRef}</Ref>) : '—'],
              [tx('المزود', 'Provider'), t.provider[lang]],
              [tx('العملة', 'Currency'), 'SAR'],
              ...(t.type === 'sale' && t.orderRef && canSee(role, 'orders') ? [[tx('فاتورة البيع', 'Sales invoice'), <a key="inv" href={printHref('invoice', [t.orderRef])} className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300"><FileText className="size-3.5" aria-hidden="true" /><Ref>INV-{t.orderRef}</Ref></a>]] : []),
            ].map(([k, v], i) => <div key={i} className="flex items-baseline justify-between gap-3 border-b border-border pb-3"><dt className="text-muted">{k}</dt><dd className="font-medium text-fg">{v}</dd></div>)}
          </dl></div>
        </Card>
        <Card aria-labelledby="h-tl">
          <CardHeader id="h-tl" title={tx('المراحل', 'Stages')} hint={tx('تاريخ البيع وتسوية المزود والتحويل البنكي ثلاثة تواريخ منفصلة.', 'Sale, provider settlement and bank payout are three separate dates.')} />
          <ol className="space-y-4 px-5 pb-5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', s.done ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-surface-2 text-subtle')} aria-hidden="true">{s.done ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}</span>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-fg">{s.label}</p>
                  <p className="text-xs text-muted">{s.date ? n.date(s.date) : tx('لم يحدث بعد', 'Not yet')}{s.extra && <> · {s.extra}</>}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Held funds ---------- */

function HoldPanel({ holdId }: { holdId: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const toast = useToast();
  const review = useReviewMode();
  const who = useWho();
  const fin = financeStore.use();
  const role = testStore.use().role;
  const [confirm, setConfirm] = useState(false);
  const h = (fin.holds ?? []).find((x) => x.id === holdId);
  if (!h) return null;
  const log = (what: { ar: string; en: string }) => financeOpsStore.set((o) => ({ ...o, log: [...o.log, { at: new Date().toISOString(), by: who, ref: h.id, what }] }));
  const send = () => {
    financeStore.set((f) => ({ ...f, holds: sendEvidence(f, h.id).holds ?? f.holds }));
    log({ ar: `أُرسلت مستندات الطلب #${h.orderRef} للمزود`, en: `Evidence for order #${h.orderRef} sent to the provider` });
    toast({ tone: 'ok', text: tx('أُرسلت المستندات للمزود (محاكاة)', 'Evidence sent to the provider (simulated)') });
    setConfirm(false);
  };
  const release = () => {
    financeStore.set((f) => { const r = releaseHold(f, h.id, '2026-11-24'); return { ...f, txs: r.txs, holds: r.holds ?? f.holds }; });
    log({ ar: `أفرج المزود عن ${h.id}`, en: `Provider released ${h.id}` });
    toast({ tone: 'ok', text: tx('أفرج المزود عن المبلغ؛ صار متاحًا للتحويل (محاكاة)', 'Provider released the funds; now available for payout (simulated)') });
  };
  if (h.state === 'released') return <Alert tone="ok" title={tx('أُفرج عن المبلغ', 'Funds released')}>{tx('انتقل إلى المتاح للتحويل ويدخل التحويل القادم.', 'Moved to available and joins the next payout.')}</Alert>;
  return (
    <Card aria-labelledby="h-hold" className="border-amber-500/40">
      <CardHeader id="h-hold" title={<><ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />{tx('مبلغ محجوز لدى المزود', 'Funds held by the provider')}</>}
        hint={tx('لا يمكن تحويله حتى يقرر المزود. إن قرر لصالح العميل يُسترد له.', 'Cannot be paid out until the provider decides. If it decides for the customer, it is refunded to them.')} />
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {[[tx('السبب', 'Reason'), h.reason[lang]], [tx('المبلغ', 'Amount'), <Money key="m" v={h.amount} />], [tx('منذ', 'Since'), n.date(h.since)], [tx('آخر موعد للمستندات', 'Evidence due'), n.date(h.releaseBy)]]
            .map(([k, v], i) => <div key={i} className="flex justify-between gap-3 border-b border-border pb-2"><dt className="text-muted">{k}</dt><dd className="text-end font-medium text-fg">{v}</dd></div>)}
        </dl>
        <div className="flex flex-wrap items-start gap-2">
          {h.state === 'evidence_sent' ? <Badge tone="amber">{tx('أُرسلت المستندات · بانتظار المزود', 'Evidence sent · awaiting provider')}</Badge>
            : can(role, 'order.refund') || can(role, 'billing.manage') ? <Button size="sm" onClick={() => setConfirm(true)}><Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />{tx('أرسل المستندات', 'Send evidence')}</Button>
              : <span className="flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden="true" />{tx('يتطلب صلاحية المالية', 'Needs finance permission')}</span>}
          {review && <Button size="sm" variant="ghost" onClick={release}><FlaskConical className="size-3.5" aria-hidden="true" />{tx('رد المزود: أفرج', 'Provider reply: release')}</Button>}
        </div>
      </div>
      {confirm && (
        <Modal title={tx(`مستندات الطلب #${h.orderRef}`, `Evidence for order #${h.orderRef}`)} onClose={() => setConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={send}>{tx('أرسل للمزود', 'Send to provider')}</Button></>}>
          <p className="text-sm text-fg">{tx('يُرسل للمزود من بيانات الطلب:', 'Sent to the provider from the order:')}</p>
          <ul className="list-disc space-y-1 ps-5 text-sm text-fg">
            <li>{tx('الفاتورة الضريبية', 'The tax invoice')} <Ref>INV-{h.orderRef}</Ref></li>
            <li>{tx('إثبات الشحن والتسليم ورقم التتبع', 'Proof of shipping and delivery with tracking number')}</li>
            <li>{tx('سياسة الإرجاع المنشورة', 'The published returns policy')}</li>
          </ul>
          <Alert tone="info">{tx('لا يُرسل شيء من بيانات العميل غير ما في الطلب.', 'Nothing about the customer beyond the order is sent.')}</Alert>
          <Simulated />
        </Modal>
      )}
    </Card>
  );
}

/* ---------- Finance log ---------- */

function FinanceLog() {
  const tx = useTx();
  const { lang } = useLang();
  const ops = financeOpsStore.use();
  if (!ops.log.length) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Card aria-labelledby="h-flog">
      <CardHeader id="h-flog" title={tx('سجل المالية', 'Finance log')} hint={tx('كل إجراء مالي في هذه الجلسة: من ومتى.', 'Every finance action in this session: who and when.')} />
      <ol className="divide-y divide-border border-t border-border">
        {[...ops.log].reverse().slice(0, 8).map((l, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm">
            <span className="min-w-0 flex-1 text-fg">{l.what[lang]}</span>
            <span className="text-xs text-muted">{l.by === 'provider' ? tx('المزود', 'Provider') : l.by} · {fmt(l.at)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ---------- Plan & billing (QA18) ---------- */

function Billing() {
  const tx = useTx();
  const n = useNames();
  const toast = useToast();
  const settings = settingsStore.use();
  const team = teamStore.use();
  const role = testStore.use().role;
  const [target, setTarget] = useState<Plan | null>(null);
  const cur = settings.plan;
  const seats = seatsUsed(team.members);
  const limit = STAFF_LIMIT[cur];
  const manage = can(role, 'billing.manage');
  const impact = target ? planImpact(cur, target, seats) : null;
  const request = () => {
    settingsStore.set((s) => ({ ...s, planRequest: target }));
    toast({ tone: 'ok', text: tx(`أُرسل طلب التغيير إلى ${n.plan(target!)} (محاكاة)`, `Change request to ${n.plan(target!)} sent (simulated)`) });
    setTarget(null);
  };
  return (
    <div className="space-y-6 border-t border-border p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-brand-300 bg-brand-500/[.04] p-5 dark:border-brand-500/40">
          <p className="text-xs font-medium text-muted">{tx('خطتك الحالية', 'Current plan')}</p>
          <p className="mt-1 text-2xl font-bold text-fg">{n.plan(cur)}</p>
          <p className="mt-2 flex items-center gap-1"><Badge tone="amber">{tx('السعر بانتظار الاعتماد', 'Price awaiting approval')}</Badge><InfoHint>{tx('أسماء الخطط أسماء عمل من المخطط، ولا أسعار معتمدة بعد. لا يُحصَّل أي مبلغ في هذه المعاينة.', 'Plan names are working names from the blueprint; no prices are approved yet. Nothing is charged in this preview.')}</InfoHint></p>
        </div>
        <div className="rounded-2xl border border-border p-5">
          <p className="text-xs font-medium text-muted">{tx('مقاعد الفريق', 'Team seats')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{seats}<span className="text-base font-medium text-muted"> / {limit ?? tx('غير محدود', 'unlimited')}</span></p>
          {limit !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={cn('h-full rounded-full', seats >= limit ? 'bg-amber-500' : 'bg-brand-gradient')} style={{ width: `${Math.min(100, (seats * 100) / limit)}%` }} /></div>}
        </div>
        <div className="rounded-2xl border border-border p-5">
          <p className="text-xs font-medium text-muted">{tx('طريقة دفع الاشتراك', 'Subscription payment')}</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-fg"><Banknote className="size-5 text-muted" aria-hidden="true" /><Ref>•••• 1142</Ref></p>
          <p className="mt-2 text-xs text-muted">{tx('التجديد والضريبة والتناسب: بانتظار الاعتماد', 'Renewal, VAT and proration: awaiting approval')}</p>
        </div>
      </div>
      {settings.planRequest && <Alert tone="info" title={tx('طلب تغيير قيد المراجعة', 'Change request pending')}>{tx(`طلبت التغيير إلى ${n.plan(settings.planRequest)}. لا يتغير شيء في حسابك قبل اعتماد الأسعار وموافقتك.`, `You asked to change to ${n.plan(settings.planRequest)}. Nothing changes on your account until prices are approved and you agree.`)}</Alert>}

      <section aria-labelledby="h-ent">
        <h3 id="h-ent" className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold text-fg">{tx('المزايا حسب الخطة', 'Entitlements by plan')}<InfoHint>{tx('مصدر الجدول مصفوفة المخطط، وهي مقترح غير نهائي.', 'Source: the blueprint matrix, a non-final proposal.')}</InfoHint></h3>
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">{tx('مصفوفة المزايا', 'Entitlement matrix')}</caption>
            <thead className="bg-surface-2/60 text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-semibold">{tx('الميزة', 'Feature')}</th>
                {PLANS.map((p) => <th key={p} scope="col" className={cn('px-3 py-3 text-center font-semibold', p === cur && 'bg-brand-500/10 text-brand-700 dark:text-brand-300')}>{n.plan(p)}{p === cur && <span className="block text-[11px] font-medium">{tx('الحالية', 'Current')}</span>}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {FEATURES.map((f) => (
                <tr key={f}>
                  <th scope="row" className="px-4 py-2.5 text-start font-medium text-fg">{n.feature(f)}</th>
                  {PLANS.map((p) => <td key={p} className={cn('px-3 py-2.5 text-center', p === cur && 'bg-brand-500/[.04]')}>{entitled(p, f) ? <Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" aria-label={tx('مشمول', 'Included')} /> : <Minus className="mx-auto size-4 text-subtle" aria-label={tx('غير مشمول', 'Not included')} />}</td>)}
                </tr>
              ))}
              <tr><th scope="row" className="px-4 py-2.5 text-start font-medium text-fg">{tx('مقاعد الفريق', 'Team seats')}</th>{PLANS.map((p) => <td key={p} className={cn('px-3 py-2.5 text-center tabular-nums', p === cur && 'bg-brand-500/[.04]')}>{STAFF_LIMIT[p] ?? '∞'}</td>)}</tr>
              <tr><th scope="row" className="px-4 py-2.5 text-start font-medium text-fg">{tx('السعر', 'Price')}</th>{PLANS.map((p) => <td key={p} className={cn('px-3 py-2.5 text-center text-xs text-muted', p === cur && 'bg-brand-500/[.04]')}>{tx('بانتظار الاعتماد', 'Awaiting approval')}</td>)}</tr>
              <tr>
                <th scope="row" className="px-4 py-3 text-start font-medium text-fg">{tx('التغيير', 'Change')}</th>
                {PLANS.map((p) => (
                  <td key={p} className={cn('px-3 py-3 text-center', p === cur && 'bg-brand-500/[.04]')}>
                    {p === cur ? <span className="text-xs text-muted">{tx('الحالية', 'Current')}</span>
                      : manage ? <Button size="sm" variant="secondary" onClick={() => setTarget(p)}>{tx('اعرض الأثر', 'See impact')}</Button>
                        : <Lock className="mx-auto size-4 text-subtle" aria-label={tx('يتطلب صلاحية الفوترة', 'Needs billing permission')} />}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {!manage && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden="true" />{tx('تغيير الخطة يتطلب صلاحية الفوترة.', 'Changing plan needs billing permission.')}</p>}
      </section>

      {target && impact && (
        <Modal size="lg" title={tx(`أثر التغيير من ${n.plan(cur)} إلى ${n.plan(target)}`, `Impact of changing from ${n.plan(cur)} to ${n.plan(target)}`)}
          description={impact.direction === 'upgrade' ? tx('ترقية', 'Upgrade') : tx('تخفيض', 'Downgrade')} onClose={() => setTarget(null)}
          footer={<><Button variant="secondary" onClick={() => setTarget(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={request}>{tx(`اطلب التغيير إلى ${n.plan(target)}`, `Request change to ${n.plan(target)}`)}</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <p className="mb-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">{tx(`تُضاف (${impact.gained.length})`, `Gained (${impact.gained.length})`)}</p>
              {impact.gained.length ? <ul className="space-y-1.5 text-sm">{impact.gained.map((f) => <li key={f} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />{n.feature(f)}</li>)}</ul> : <p className="text-sm text-muted">{tx('لا شيء', 'Nothing')}</p>}
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-400">{tx(`تتوقف (${impact.lost.length})`, `Lost (${impact.lost.length})`)}</p>
              {impact.lost.length ? <ul className="space-y-1.5 text-sm">{impact.lost.map((f) => <li key={f} className="flex items-center gap-2"><Minus className="size-4 shrink-0 text-red-600" aria-hidden="true" />{n.feature(f)}</li>)}</ul> : <p className="text-sm text-muted">{tx('لا شيء', 'Nothing')}</p>}
            </div>
          </div>
          {impact.lost.length > 0 && <Alert tone="info">{tx('لا تُحذف بياناتك السابقة؛ تصبح الميزة للقراءة أو متوقفة وفق السياسة المعتمدة.', 'Your existing data is not deleted; the feature becomes read-only or paused under the approved policy.')}</Alert>}
          {impact.seatsOver > 0 && <Alert tone="warn" title={tx('المقاعد تتجاوز الحد', 'Seats over the limit')}>{tx(`تستخدم ${seats} مقاعد والحد ${impact.seatLimit}. أزل ${impact.seatsOver} قبل أن يسري التغيير.`, `You use ${seats} seats; the limit is ${impact.seatLimit}. Remove ${impact.seatsOver} before the change applies.`)}</Alert>}
          <div className="rounded-xl bg-surface-2/60 p-4"><dl className="space-y-2 text-sm">
            {[[tx('السعر الجديد', 'New price'), tx('بانتظار الاعتماد', 'Awaiting approval')], [tx('التناسب والضريبة', 'Proration and VAT'), tx('بانتظار الاعتماد', 'Awaiting approval')], [tx('موعد السريان', 'Effective'), tx('بعد اعتماد الأسعار وموافقتك', 'After prices are approved and you agree')]]
              .map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-end font-medium text-fg">{v}</dd></div>)}
          </dl></div>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('يُرسل طلبًا فقط؛ لا يُحصَّل أي مبلغ ولا تتغير خطتك الآن.', 'Sends a request only; nothing is charged and your plan does not change now.')}</p>
        </Modal>
      )}
    </div>
  );
}

function FinanceSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-32" /><Skeleton className="h-3 w-16" /></div>)}</div>
      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex gap-4 border-b border-border px-5 py-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-28" />)}</div>
        <div className="divide-y divide-border">{Array.from({ length: 5 }, (_, i) => <div key={i} className="flex items-center gap-4 px-5 py-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-4 w-24" /></div>)}</div>
      </div>
    </div>
  );
}
