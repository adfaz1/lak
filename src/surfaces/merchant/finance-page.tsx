import { useState, type ReactNode } from 'react';
import type { Route } from '../../core/router';
import { Alert, Badge, Dialog, LinkTabs, Metric, PageHeader, Sim, type Tone } from '../../core/ui';
import { formatMoney } from './domain';
import {
  FEATURES, PLANS, STAFF_LIMIT, entitled, filterTxs, moneyCards, planDiff, reconcile,
  type Feature, type Payout, type PayoutStatus, type Plan, type Tx, type TxStatus, type TxType,
} from './finance';
import { can, canSee } from './perms';
import { financeStore, settingsStore, teamStore, testStore } from './stores';
import { seatsUsed } from './workspace';
import { ActionLocked, DataTable, Icon, KV, Money, Pager, downloadText, mhref, mreplace, useL, useTx, type Col } from './kit';
import { toCsv } from './catalog';

const P_TONE: Record<PayoutStatus, Tone> = { paid: 'success', in_transit: 'info', scheduled: 'neutral' };
const TX_TONE: Record<TxStatus, Tone> = { pending: 'warning', available: 'info', paid_out: 'success' };

function useNames() {
  const tx = useTx();
  return {
    payout: (s: PayoutStatus) => ({ paid: tx('حُوّل', 'Paid'), in_transit: tx('في الطريق إلى البنك', 'In transit to bank'), scheduled: tx('مجدول (تقديري)', 'Scheduled (estimate)') })[s],
    type: (t: TxType) => ({ sale: tx('بيع', 'Sale'), fee: tx('رسوم', 'Fee'), refund: tx('استرداد', 'Refund'), adjustment: tx('تسوية', 'Adjustment') })[t],
    status: (s: TxStatus) => ({ pending: tx('معلّق لدى المزود', 'Pending at provider'), available: tx('متاح للتحويل', 'Available for payout'), paid_out: tx('دخل في تحويل', 'Paid out') })[s],
    plan: (p: Plan) => ({ basic: 'Basic', plus: 'Plus', pro: 'Pro', special: 'Special' })[p],
    feature: (f: Feature) => ({
      catalog: tx('منتجات وطلبات وعملاء', 'Products, orders, customers'), coupons: tx('كوبونات', 'Coupons'), reviews: tx('تقييمات', 'Reviews'), cod: tx('دفع عند الاستلام وتحويل', 'COD and bank transfer'),
      marketplace: tx('سوق لك', 'LAK marketplace'), epay: tx('دفع إلكتروني', 'Online payments'), labels: tx('بوليصات شحن لك', 'LAK shipping labels'), loyalty: tx('ولاء ومحفظة وكاش باك', 'Loyalty, wallet, cashback'),
      ads: tx('إعلانات ورسائل', 'Ads and messaging'), wholesale: tx('الجملة', 'Wholesale'), themeCode: tx('تحرير كود الثيم', 'Theme code editing'), appMaker: tx('صانع التطبيقات (إضافة)', 'App Maker (add-on)'),
      multiStore: tx('متاجر متعددة', 'Multiple stores'), segments: tx('شرائح العملاء', 'Customer segments'), affiliate: tx('شركاء ومؤثرون', 'Affiliates and influencers'), tierPricing: tx('أسعار الكمية', 'Quantity pricing'),
      routing: tx('توجيه المستودع', 'Warehouse routing'), fullReports: tx('تقارير كاملة', 'Full reports'), erp: tx('ERP وتكاملات خاصة', 'ERP and custom integrations'), sla: tx('مدير حساب ودعم SLA', 'Account manager and SLA support'),
    })[f],
  };
}

export function FinancePage({ route }: { route: Route }) {
  const tx = useTx();
  if (route.path[1] === 'payouts' && route.path[2]) return <Statement id={route.path[2]} />;
  const tab = route.query.get('tab') ?? 'overview';
  const tabs = [['overview', tx('نظرة عامة', 'Overview')], ['payouts', tx('التحويلات البنكية', 'Payouts')], ['transactions', tx('الحركات', 'Transactions')], ['billing', tx('الخطة والفوترة', 'Plan & billing')]];
  return (
    <>
      <PageHeader title={tx('الأموال', 'Finance')} sub={tx('مستقلة عن التحليلات. عملة واحدة: ريال سعودي. كل الأرقام بيانات تجريبية والرسوم نسب اختبار وليست تسعير «لك».', 'Separate from analytics. One currency: SAR. All figures are demo data and fees are test rates, not LAK pricing.')} />
      <LinkTabs label={tx('أقسام الأموال', 'Finance sections')} items={tabs.map(([id, label]) => ({ href: mhref('finance', { tab: id === 'overview' ? undefined : id }), label, current: tab === id }))} />
      {tab === 'overview' && <Overview />}
      {tab === 'payouts' && <Payouts />}
      {tab === 'transactions' && <Transactions route={route} />}
      {tab === 'billing' && <Billing />}
    </>
  );
}

function Overview() {
  const tx = useTx();
  const fin = financeStore.use();
  const c = moneyCards(fin.txs, fin.payouts);
  const m = (label: string, v: number, def: string, href?: string) => <Metric label={label} value={<Money v={v} />} note={<>{def}{href && <> · <a href={href}>{tx('الحركات', 'Transactions')}</a></>}</>} />;
  return (
    <>
      <p className="small muted">{tx('الفترة: 1–24 نوفمبر 2026 · توقيت الرياض · المصدر: سجل الحركات التجريبي', 'Period: 1–24 Nov 2026 · Riyadh time · Source: demo transaction ledger')}</p>
      <section className="metrics" aria-label={tx('بطاقات المال', 'Money cards')}>
        {m(tx('إجمالي المبيعات', 'Gross sales'), c.gross, tx('كل الطلبات المدفوعة شامل الشحن والضريبة، قبل الرسوم والاستردادات.', 'All paid orders incl. shipping and VAT, before fees and refunds.'), mhref('finance', { tab: 'transactions', type: 'sale' }))}
        {m(tx('المحصّل', 'Collected'), c.collected, tx('ما سوّاه مزود الدفع لصالحك.', 'What the payment provider has settled to you.'))}
        {m(tx('المعلّق', 'Pending'), c.pending, tx('مدفوع لدى المزود ولم يُسوَّ بعد.', 'Captured by the provider, not settled yet.'), mhref('finance', { tab: 'transactions', status: 'pending' }))}
        {m(tx('المتاح للتحويل', 'Available'), c.available, tx('مُسوّى بعد الرسوم والاستردادات ولم يُحوَّل بعد. ليس ربحًا.', 'Settled, after fees and refunds, not yet paid out. Not profit.'), mhref('finance', { tab: 'transactions', status: 'available' }))}
        {m(tx('المحوّل', 'Paid out'), c.paidOut, tx('تحويلات وصلت حسابك البنكي.', 'Transfers that reached your bank account.'), mhref('finance', { tab: 'payouts' }))}
        {m(tx('في الطريق', 'In transit'), c.inTransit, tx('تحويلات أُرسلت ولم تصل بعد.', 'Transfers sent, not yet arrived.'))}
        {m(tx('الرسوم', 'Fees'), c.fees, tx('رسوم المعالجة (نسبة اختبار).', 'Processing fees (test rate).'), mhref('finance', { tab: 'transactions', type: 'fee' }))}
        {m(tx('الاستردادات', 'Refunds'), c.refunds, c.refundsPending ? tx(`منها ${formatMoney(c.refundsPending)} ر.س بانتظار المزود.`, `SAR ${formatMoney(c.refundsPending)} of it awaiting the provider.`) : tx('مبالغ أُعيدت للعملاء.', 'Money returned to customers.'), mhref('finance', { tab: 'transactions', type: 'refund' }))}
      </section>
      <Alert tone="info">{tx('المبيعات لا تعني صافي الربح: لا تشمل تكلفة البضاعة والشحن والمصاريف الأخرى.', 'Sales are not net profit: they exclude cost of goods, shipping and other expenses.')}</Alert>
    </>
  );
}

function Payouts() {
  const tx = useTx();
  const n = useNames();
  const fin = financeStore.use();
  const cols: Col<Payout>[] = [
    { key: 'id', head: tx('المرجع', 'Reference'), cell: (p) => <bdi dir="ltr" className="strong">{p.id}</bdi> },
    { key: 'per', head: tx('فترة المبيعات', 'Sales period'), cell: (p) => <bdi dir="ltr">{p.from} → {p.to}</bdi> },
    { key: 'd', head: tx('تاريخ التحويل', 'Payout date'), cell: (p) => <bdi dir="ltr">{p.date}</bdi> },
    { key: 's', head: tx('الحالة', 'Status'), cell: (p) => <Badge tone={P_TONE[p.status]}>{n.payout(p.status)}</Badge> },
    { key: 'acc', head: tx('الحساب', 'Account'), cell: (p) => <bdi dir="ltr">{p.account}</bdi> },
    { key: 'a', head: tx('الصافي', 'Net'), end: true, cell: (p) => <span className="strong"><Money v={p.amount ?? reconcile(p, fin.txs).net} /></span> },
    { key: 'o', head: tx('فتح', 'Open'), srHead: true, end: true, cell: (p) => <a className="btn small" href={mhref(`finance/payouts/${p.id}`)}>{tx('الكشف', 'Statement')}</a> },
  ];
  return (
    <div className="card">
      <DataTable label={tx('التحويلات البنكية', 'Payouts')} cols={cols} rows={fin.payouts} rowKey={(p) => p.id}
        mobile={(p) => <a className="m-rowcard-main" href={mhref(`finance/payouts/${p.id}`)}><span className="m-rowcard-top"><bdi dir="ltr" className="strong">{p.id}</bdi><Money v={p.amount ?? reconcile(p, fin.txs).net} /></span><span className="small muted"><bdi dir="ltr">{p.date}</bdi></span><span className="m-badges"><Badge tone={P_TONE[p.status]}>{n.payout(p.status)}</Badge></span></a>}
        empty={<div className="empty">{tx('لا تحويلات بعد.', 'No payouts yet.')}</div>} />
    </div>
  );
}

function Statement({ id }: { id: string }) {
  const tx = useTx();
  const n = useNames();
  const fin = financeStore.use();
  const p = fin.payouts.find((x) => x.id === id);
  const back = <a className="back" href={mhref('finance', { tab: 'payouts' })}>{tx('العودة إلى التحويلات', 'Back to payouts')}</a>;
  if (!p) return <>{back}<Alert tone="danger">{tx('لا يوجد تحويل بهذا المرجع.', 'No payout with this reference.')}</Alert></>;
  const r = reconcile(p, fin.txs);
  const count = (type: TxType) => fin.txs.filter((t) => t.payoutId === id && t.type === type).length;
  const line = (label: string, v: ReactNode, type: TxType, sign: string) => (
    <div><dt><a href={mhref('finance', { tab: 'transactions', payout: id, type })}>{label}</a> <span className="small muted">({tx(`${count(type)} حركة`, `${count(type)} transactions`)})</span></dt><dd><bdi dir="ltr">{sign}</bdi>{v}</dd></div>
  );
  return (
    <>
      {back}
      <div className="title-row"><h1>{tx('كشف التحويل', 'Payout statement')} <bdi dir="ltr">{p.id}</bdi></h1><Badge tone={P_TONE[p.status]}>{n.payout(p.status)}</Badge></div>
      <div className="cols">
        <div className="col-main">
          <section className="card pad" aria-labelledby="st-h">
            <h2 id="st-h">{tx('المطابقة', 'Reconciliation')}</h2>
            <dl className="breakdown">
              {line(tx('المحصّل من المبيعات', 'Collected from sales'), <Money v={r.collected} />, 'sale', '')}
              {line(tx('الرسوم', 'Fees'), <Money v={r.fees} />, 'fee', '−')}
              {line(tx('الاستردادات', 'Refunds'), <Money v={r.refunds} />, 'refund', '−')}
              {line(tx('تسويات أخرى', 'Other adjustments'), <Money v={Math.abs(r.adjustments)} />, 'adjustment', r.adjustments < 0 ? '−' : '+')}
              <div className="sum"><dt>{tx('الصافي المحسوب', 'Computed net')}</dt><dd><Money v={r.net} /></dd></div>
              <div><dt>{p.status === 'scheduled' ? tx('مبلغ التحويل (تقديري، لم يُرسل)', 'Payout amount (estimate, not sent)') : tx('مبلغ التحويل المرسل', 'Amount transferred')}</dt><dd><Money v={p.amount ?? r.net} /></dd></div>
            </dl>
            {r.matches === true && <Alert tone="success">{tx('مطابق: المحصّل − الرسوم − الاستردادات ± التسويات = المبلغ المحوّل.', 'Matches: collected − fees − refunds ± adjustments = amount transferred.')}</Alert>}
            {r.matches === false && <Alert tone="danger">{tx(`غير مطابق بفارق ${formatMoney(r.diff)} ر.س. تواصل مع الدعم مع مرجع التحويل.`, `Does not match: difference SAR ${formatMoney(r.diff)}. Contact support with the payout reference.`)}</Alert>}
            {r.matches === null && <Alert tone="info">{tx('تحويل مجدول: الرقم تقديري وقد يتغير بحركات جديدة (مثل استرداد) قبل موعده.', 'Scheduled payout: the figure is an estimate and may change with new transactions (such as a refund) before its date.')}</Alert>}
            <p className="small muted">{tx('كل حركة تُحسب مرة واحدة في تحويل واحد. عملة واحدة (ر.س)؛ لا نجمع عملات مختلفة.', 'Each transaction is counted once, in one payout. One currency (SAR); different currencies are never summed.')}</p>
          </section>
        </div>
        <aside className="col-side">
          <section className="card pad" aria-labelledby="st-m">
            <h2 id="st-m">{tx('التفاصيل', 'Details')}</h2>
            <KV rows={[[tx('فترة المبيعات', 'Sales period'), <bdi dir="ltr">{p.from} → {p.to}</bdi>], [tx('تاريخ التحويل', 'Payout date'), <bdi dir="ltr">{p.date}</bdi>], [tx('الحساب', 'Account'), <bdi dir="ltr">{p.account}</bdi>], [tx('العملة', 'Currency'), 'SAR']]} />
            <button type="button" className="btn" onClick={() => downloadText(`${p.id}.csv`, toCsv([['id', 'type', 'order', 'amount_sar', 'status'], ...fin.txs.filter((t) => t.payoutId === id).map((t) => [t.id, t.type, t.orderRef ?? '', formatMoney(t.amount), t.status])]))}><Icon name="download" size={16} /> {tx('نزّل الكشف CSV', 'Download statement CSV')}</button>
          </section>
        </aside>
      </div>
    </>
  );
}

function Transactions({ route }: { route: Route }) {
  const tx = useTx();
  const l = useL();
  const n = useNames();
  const fin = financeStore.use();
  const role = testStore.use().role;
  const f = { payout: route.query.get('payout') ?? '', type: (route.query.get('type') ?? '') as TxType | '', status: (route.query.get('status') ?? '') as TxStatus | '', q: route.query.get('q') ?? '' };
  const rows = filterTxs(fin.txs, f);
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = Math.min(pages, Math.max(1, Number(route.query.get('page')) || 1));
  const qs = (o: Record<string, string | undefined>) => ({ tab: 'transactions', payout: f.payout || undefined, type: f.type || undefined, status: f.status || undefined, q: f.q || undefined, ...o });
  const signed = (t: Tx) => (t.type === 'sale' ? '' : t.type === 'adjustment' ? (t.amount < 0 ? '−' : '+') : '−');
  const cols: Col<Tx>[] = [
    { key: 'id', head: tx('المرجع', 'Ref'), cell: (t) => <bdi dir="ltr">{t.id}</bdi> },
    { key: 'type', head: tx('النوع', 'Type'), cell: (t) => <>{n.type(t.type)}{t.note && <div className="small muted">{l(t.note)}</div>}</> },
    { key: 'o', head: tx('الطلب', 'Order'), cell: (t) => (t.orderRef ? (canSee(role, 'orders') ? <a href={mhref(`orders/${t.orderRef}`)}><bdi dir="ltr">#{t.orderRef}</bdi></a> : <bdi dir="ltr">#{t.orderRef}</bdi>) : '—') },
    { key: 'a', head: tx('المبلغ', 'Amount'), end: true, cell: (t) => <span className="strong"><bdi dir="ltr">{signed(t)}</bdi><Money v={Math.abs(t.amount)} /></span> },
    { key: 's', head: tx('الحالة', 'Status'), cell: (t) => <Badge tone={TX_TONE[t.status]}>{n.status(t.status)}</Badge> },
    { key: 'd', head: tx('البيع / التسوية', 'Sale / settled'), cell: (t) => <span className="small"><bdi dir="ltr">{t.saleDay}</bdi> / <bdi dir="ltr">{t.settledDay ?? '—'}</bdi></span> },
    { key: 'p', head: tx('التحويل', 'Payout'), cell: (t) => (t.payoutId ? <a href={mhref(`finance/payouts/${t.payoutId}`)}><bdi dir="ltr">{t.payoutId}</bdi></a> : '—') },
  ];
  const select = (key: 'payout' | 'type' | 'status', label: string, opts: [string, string][]) => (
    <div className="field"><label htmlFor={`tf-${key}`}>{label}</label>
      <select id={`tf-${key}`} className="input" value={f[key]} onChange={(e) => mreplace('finance', qs({ [key]: e.target.value || undefined, page: undefined }))}>
        <option value="">{tx('الكل', 'All')}</option>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select></div>
  );
  return (
    <>
      <div className="m-filters">
        {select('payout', tx('التحويل', 'Payout'), fin.payouts.map((p) => [p.id, p.id]))}
        {select('type', tx('النوع', 'Type'), (['sale', 'fee', 'refund', 'adjustment'] as TxType[]).map((t) => [t, n.type(t)]))}
        {select('status', tx('الحالة', 'Status'), (['pending', 'available', 'paid_out'] as TxStatus[]).map((s) => [s, n.status(s)]))}
        <div className="field"><label htmlFor="tf-q">{tx('بحث بالمرجع أو الطلب', 'Search ref or order')}</label><input id="tf-q" className="input" type="search" dir="ltr" value={f.q} onChange={(e) => mreplace('finance', qs({ q: e.target.value || undefined, page: undefined }))} /></div>
      </div>
      <div className="toolbar">
        <p className="small" role="status">{tx(`${rows.length} حركة · الصافي `, `${rows.length} transactions · net `)}<Money v={rows.reduce((s, t) => s + (t.type === 'sale' ? t.amount : t.type === 'adjustment' ? t.amount : -t.amount), 0)} /></p>
        <div className="actions">
          {(f.payout || f.type || f.status || f.q) && <a className="btn small" href={mhref('finance', { tab: 'transactions' })}>{tx('مسح التصفية', 'Clear filters')}</a>}
          <button type="button" className="btn small" onClick={() => downloadText('transactions.csv', toCsv([['id', 'type', 'order', 'amount_sar', 'status', 'sale_day', 'settled_day', 'payout'], ...rows.map((t) => [t.id, t.type, t.orderRef ?? '', formatMoney(t.amount), t.status, t.saleDay, t.settledDay ?? '', t.payoutId ?? ''])]))}><Icon name="download" size={16} /> {tx('تصدير CSV', 'Export CSV')}</button>
        </div>
      </div>
      <div className="card">
        <DataTable label={tx('الحركات المالية', 'Transactions')} cols={cols} rows={rows.slice((page - 1) * 25, page * 25)} rowKey={(t) => t.id}
          mobile={(t) => <div className="m-rowcard-main"><span className="m-rowcard-top"><span className="strong">{n.type(t.type)} {t.orderRef && <bdi dir="ltr">#{t.orderRef}</bdi>}</span><span className="strong"><bdi dir="ltr">{signed(t)}</bdi><Money v={Math.abs(t.amount)} /></span></span><span className="small muted"><bdi dir="ltr">{t.id}</bdi> · <bdi dir="ltr">{t.saleDay}</bdi></span><span className="m-badges"><Badge tone={TX_TONE[t.status]}>{n.status(t.status)}</Badge></span></div>}
          empty={<div className="empty"><span>{tx('لا حركات تطابق التصفية.', 'No transactions match these filters.')}</span><a className="btn" href={mhref('finance', { tab: 'transactions' })}>{tx('مسح التصفية', 'Clear filters')}</a></div>} />
      </div>
      <Pager page={page} pages={pages} hrefFor={(p) => mhref('finance', qs({ page: p > 1 ? String(p) : undefined }))} />
    </>
  );
}

function Billing() {
  const tx = useTx();
  const n = useNames();
  const settings = settingsStore.use();
  const team = teamStore.use();
  const role = testStore.use().role;
  const [target, setTarget] = useState<Plan | null>(null);
  const cur = settings.plan;
  const limit = STAFF_LIMIT[cur];
  return (
    <>
      <section className="card pad" aria-labelledby="bl-h">
        <h2 id="bl-h">{tx('خطتك الحالية', 'Your current plan')}: {n.plan(cur)}</h2>
        <KV rows={[
          [tx('السعر', 'Price'), <span className="strong">{tx('بانتظار الاعتماد', 'To be approved')}</span>],
          [tx('مقاعد الفريق', 'Team seats'), tx(`${seatsUsed(team.members)} من ${limit ?? 'غير محدود'}`, `${seatsUsed(team.members)} of ${limit ?? 'unlimited'}`)],
          [tx('طريقة دفع الاشتراك', 'Subscription payment method'), <bdi dir="ltr">•••• 1142</bdi>],
        ]} />
        <p className="small muted">{tx('أسماء الخطط أسماء عمل من المخطط (Basic / Plus / Pro / Special). لا أسعار معتمدة بعد؛ لا يُحصَّل أي مبلغ في هذه المعاينة.', 'Plan names are working names from the blueprint (Basic / Plus / Pro / Special). No prices are approved yet; nothing is charged in this preview.')}</p>
        {settings.planRequest && <Alert tone="info">{tx(`طلب تغيير إلى ${n.plan(settings.planRequest)} بانتظار اعتماد الأسعار. لم يتغير شيء في حسابك.`, `Request to change to ${n.plan(settings.planRequest)} awaits price approval. Nothing changed on your account.`)}</Alert>}
      </section>
      <section className="card" aria-labelledby="ent-h">
        <div className="card-head"><h2 id="ent-h">{tx('المزايا حسب الخطة', 'Entitlements by plan')}</h2></div>
        <div className="table-wrap">
          <table>
            <caption className="sr">{tx('مصفوفة المزايا', 'Entitlement matrix')}</caption>
            <thead><tr><th scope="col">{tx('الميزة', 'Feature')}</th>{PLANS.map((p) => <th key={p} scope="col" className="end">{n.plan(p)}{p === cur && <span className="small"> · {tx('الحالية', 'current')}</span>}</th>)}</tr></thead>
            <tbody>
              {FEATURES.map((f) => <tr key={f}><th scope="row">{n.feature(f)}</th>{PLANS.map((p) => <td key={p} className="end">{entitled(p, f) ? <><Icon name="check" size={16} /><span className="sr">{tx('مشمول', 'Included')}</span></> : <span className="muted" aria-label={tx('غير مشمول', 'Not included')}>—</span>}</td>)}</tr>)}
              <tr><th scope="row">{tx('مقاعد الفريق', 'Team seats')}</th>{PLANS.map((p) => <td key={p} className="end">{STAFF_LIMIT[p] ?? tx('غير محدود', 'Unlimited')}</td>)}</tr>
              <tr><th scope="row">{tx('السعر', 'Price')}</th>{PLANS.map((p) => <td key={p} className="end small">{tx('بانتظار الاعتماد', 'To be approved')}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="card-body">
          <p className="small muted">{tx('مصدر الجدول: مصفوفة المخطط، وهي مقترح غير نهائي. بعض البنود متعارضة في المصدر وتحتاج قرارًا.', 'Source: the blueprint matrix, a non-final proposal. Some items conflict in the source and need a decision.')}</p>
          {can(role, 'billing.manage') ? (
            <div className="actions">{PLANS.filter((p) => p !== cur).map((p) => <button key={p} type="button" className="btn" onClick={() => setTarget(p)}>{tx(`معاينة التغيير إلى ${n.plan(p)}`, `Preview change to ${n.plan(p)}`)}</button>)}</div>
          ) : <ActionLocked>{tx('تغيير الخطة يتطلب صلاحية الفوترة.', 'Changing plan needs billing permission.')}</ActionLocked>}
        </div>
      </section>
      {target && (() => {
        const d = planDiff(cur, target);
        return (
          <Dialog title={tx(`أثر التغيير من ${n.plan(cur)} إلى ${n.plan(target)}`, `Effect of changing from ${n.plan(cur)} to ${n.plan(target)}`)} onClose={() => setTarget(null)}
            footer={<><button type="button" className="btn primary" onClick={() => { settingsStore.set((s) => ({ ...s, planRequest: target })); setTarget(null); }}>{tx('أرسل طلب التغيير (محاكاة)', 'Send change request (simulated)')}</button><button type="button" className="btn" onClick={() => setTarget(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
            {d.gained.length > 0 && <><p className="strong">{tx('تُضاف:', 'Gained:')}</p><ul className="m-list">{d.gained.map((f) => <li key={f}>{n.feature(f)}</li>)}</ul></>}
            {d.lost.length > 0 && <><p className="strong">{tx('تُفقد:', 'Lost:')}</p><ul className="m-list">{d.lost.map((f) => <li key={f}>{n.feature(f)}</li>)}</ul><p className="small">{tx('بياناتك السابقة لا تُحذف؛ تصبح الميزة للقراءة أو متوقفة وفق السياسة المعتمدة.', 'Your existing data is not deleted; the feature becomes read-only or paused per the approved policy.')}</p></>}
            {STAFF_LIMIT[target] !== null && seatsUsed(team.members) > (STAFF_LIMIT[target] ?? 0) && <Alert tone="warning">{tx(`لديك ${seatsUsed(team.members)} مقاعد مستخدمة والحد ${STAFF_LIMIT[target]}.`, `You use ${seatsUsed(team.members)} seats; the limit is ${STAFF_LIMIT[target]}.`)}</Alert>}
            <KV rows={[[tx('السعر والتناسب والضريبة', 'Price, proration and VAT'), tx('بانتظار الاعتماد', 'To be approved')], [tx('موعد السريان', 'Effective'), tx('بعد اعتماد الأسعار وموافقتك', 'After prices are approved and you agree')]]} />
            <p className="muted small"><Sim /> {tx('لن يُحصَّل أي مبلغ.', 'Nothing will be charged.')}</p>
          </Dialog>
        );
      })()}
    </>
  );
}
