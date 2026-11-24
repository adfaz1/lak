// Reports (`#/admin/reports?report=merchants|revenue|subs|sales`): one table per report, a chart where it helps,
// and a real CSV export (built in the browser from the same rows, confirmed, logged).
import { useState } from 'react';
import { Download, FileBarChart } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { AreaChart } from '../../../ds/charts';
import { DataTable, Modal, PageHeader, Simulated, Tabs, useToast, type Column } from '../../../ds/kit';
import { Badge, Button, Card, CardHeader, EmptyState, Money, Ref, useTx } from '../../../ds/ui';
import { can, DATA_AS_OF, PLAN_NAME, REGION_REVENUE, SUBS_MONTHS, type Store } from '../domain';
import { STORE_STATUS } from '../i18n';
import { bpText, categorySales, csvName, regionTotal, reportCsv, REPORTS, type ReportId } from '../model';
import { logExport, storesStore } from '../state';
import { AsOf, Bars, Locked, qhref, StateGate, useFmt, useViewState } from '../ui';
import { downloadCsv, STORE_TONE } from './stores';
import type { ScreenProps } from '../index';

export default function Reports({ role, route }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const state = useViewState();
  const storesAll = storesStore.use();
  const stores = state === 'empty' ? [] : storesAll;
  const raw = route.query.get('report') as ReportId | null;
  const id: ReportId = raw && REPORTS.includes(raw) ? raw : 'merchants';
  const [confirm, setConfirm] = useState(false);
  const title: Record<ReportId, string> = { merchants: tx('تقرير التجار', 'Merchant report'), revenue: tx('إيراد لك حسب المنطقة', 'LAK revenue by region'), subs: tx('حركة الاشتراكات', 'Subscription movements'), sales: tx('المبيعات حسب الفئة', 'Sales by category') };
  const period = id === 'subs' ? tx('آخر 4 أشهر', 'Last 4 months') : tx(`آخر 30 يومًا حتى ${f.d(DATA_AS_OF)}`, `Last 30 days to ${f.d(DATA_AS_OF)}`);
  const mayExport = can(role, 'reports.export');
  const empty = state === 'empty';
  const header = (
    <>
      <PageHeader title={tx('التقارير', 'Reports')} description={tx('الصادرات بيانات مقنّعة فقط وتُسجَّل', 'Exports hold masked data only and are logged')} meta={<AsOf />}
        actions={mayExport && !empty ? <Button onClick={() => setConfirm(true)}><Download className="size-4" aria-hidden="true" />{tx('صدّر CSV', 'Export CSV')}</Button> : undefined} />
      <Tabs label={tx('التقارير', 'Reports')} items={REPORTS.map((k) => ({ href: qhref('reports', route, { report: k === 'merchants' ? undefined : k }), label: title[k], current: k === id }))} />
    </>
  );
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'التقرير', en: 'The report' }} refCode="SIM-ADM-RPT-503" />;

  const exportNow = () => {
    const { csv, count } = reportCsv(id, stores, lang);
    downloadCsv(csvName(id, DATA_AS_OF.slice(0, 10)), csv);
    logExport(id, { ar: title[id], en: title[id] }, count);
    toast({ tone: 'ok', text: tx('نُزّل الملف وسُجّل التصدير', 'File downloaded and export logged') });
    setConfirm(false);
  };

  const body = () => {
    if (empty && (id === 'merchants' || id === 'sales')) return <EmptyState icon={<FileBarChart className="size-6" />} title={tx('لا بيانات لهذه الفترة', 'No data for this period')} />;
    if (id === 'merchants') {
      const rows = [...stores].sort((a, b) => b.gmv30 - a.gmv30);
      const cols: Column<Store>[] = [
        { key: 'name', header: tx('المتجر', 'Store'), cell: (s) => <span className="block max-w-64 truncate">{s.name[lang]}<span className="block text-xs font-normal text-muted"><Ref>{s.id}</Ref></span></span> },
        { key: 'plan', header: tx('الخطة', 'Plan'), cell: (s) => <bdi>{PLAN_NAME[s.plan]}</bdi>, hideBelow: 'md' },
        { key: 'status', header: tx('الحالة', 'Status'), cell: (s) => <Badge tone={STORE_TONE[s.status]}>{STORE_STATUS[s.status][lang]}</Badge> },
        { key: 'orders', header: tx('الطلبات', 'Orders'), align: 'end', cell: (s) => <span className="tabular-nums">{f.n(s.orders30)}</span> },
        { key: 'tickets', header: tx('التذاكر', 'Tickets'), align: 'end', cell: (s) => <span className="tabular-nums">{s.tickets}</span>, hideBelow: 'md' },
        { key: 'gmv', header: tx('المبيعات', 'GMV'), align: 'end', cell: (s) => <Money v={s.gmv30} className="font-semibold text-fg" /> },
      ];
      return <DataTable label={title[id]} rows={rows} columns={cols} rowKey={(s) => s.id}
        card={(s) => <div><div className="flex items-baseline justify-between gap-2"><p className="truncate text-sm font-semibold">{s.name[lang]}</p><Money v={s.gmv30} className="text-sm font-semibold" /></div><p className="text-xs text-muted"><bdi>{PLAN_NAME[s.plan]}</bdi> · {tx(`${s.orders30} طلب · ${s.tickets} تذكرة`, `${s.orders30} orders · ${s.tickets} tickets`)}</p></div>} />;
    }
    if (id === 'revenue') {
      const max = Math.max(...REGION_REVENUE.map(regionTotal));
      return (
        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-5">
          <div className="lg:col-span-2"><Bars rows={REGION_REVENUE.map((r) => ({ key: r.region.en, label: r.region[lang], value: <Money v={regionTotal(r)} />, pct: (regionTotal(r) * 100) / max }))} /></div>
          <div className="scrollbar-thin overflow-x-auto lg:col-span-3">
            <table className="w-full min-w-[420px] text-sm" aria-label={title[id]}>
              <thead><tr className="border-b border-border text-xs text-muted"><th className="py-2 text-start font-semibold">{tx('المنطقة', 'Region')}</th><th className="py-2 text-end font-semibold">{tx('اشتراكات', 'Subscriptions')}</th><th className="py-2 text-end font-semibold">{tx('إضافات', 'Add-ons')}</th><th className="py-2 text-end font-semibold">{tx('لمرة واحدة', 'One-time')}</th></tr></thead>
              <tbody className="divide-y divide-border">{REGION_REVENUE.map((r) => <tr key={r.region.en}><td className="py-2.5">{r.region[lang]}</td><td className="py-2.5 text-end"><Money v={r.subscriptions} /></td><td className="py-2.5 text-end"><Money v={r.addons} /></td><td className="py-2.5 text-end"><Money v={r.oneTime} /></td></tr>)}</tbody>
            </table>
            <p className="mt-3 text-xs text-muted">{tx('لا يشمل مبيعات التجار. التوزيع حسب الخطة غير متاح بعد.', 'Excludes merchant sales. A by-plan split is not available yet.')}</p>
          </div>
        </div>
      );
    }
    if (id === 'subs') return (
      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-5">
        <div className="lg:col-span-3"><AreaChart rtl={lang === 'ar'} height={200} points={SUBS_MONTHS.map((m) => ({ key: m.month, label: m.month, value: m.signups }))} format={(v) => tx(`${v} اشتراك جديد`, `${v} sign-ups`)} /></div>
        <div className="scrollbar-thin overflow-x-auto lg:col-span-2">
          <table className="w-full text-sm" aria-label={title[id]}>
            <thead><tr className="border-b border-border text-xs text-muted"><th className="py-2 text-start font-semibold">{tx('الشهر', 'Month')}</th><th className="py-2 text-end font-semibold">{tx('جديد', 'New')}</th><th className="py-2 text-end font-semibold">{tx('إلغاء', 'Cancel')}</th><th className="py-2 text-end font-semibold">{tx('ترقية', 'Up')}</th><th className="py-2 text-end font-semibold">{tx('تخفيض', 'Down')}</th></tr></thead>
            <tbody className="divide-y divide-border tabular-nums">{SUBS_MONTHS.map((m) => <tr key={m.month}><td className="py-2.5"><bdi dir="ltr">{m.month}</bdi></td><td className="py-2.5 text-end">{m.signups}</td><td className="py-2.5 text-end">{m.cancellations}</td><td className="py-2.5 text-end">{m.upgrades}</td><td className="py-2.5 text-end">{m.downgrades}</td></tr>)}</tbody>
          </table>
          <p className="mt-3 text-xs text-muted">{tx('نوفمبر غير مكتمل. معدل الإلغاء يحتاج تعريفًا معتمدًا.', 'November is incomplete. Churn rate needs an approved definition.')}</p>
        </div>
      </div>
    );
    const cats = categorySales(stores);
    return (
      <div className="p-5">
        <Bars rows={cats.map((c) => ({ key: c.key, label: `${c.label[lang]} · ${tx(`${c.stores} متجر`, `${c.stores} stores`)}`, value: <span><Money v={c.gmv} /> · {bpText(c.shareBp)}</span>, pct: c.shareBp / 100 }))} />
        <p className="mt-4 text-xs text-muted">{tx('مبيعات التجار (GMV) وليست إيراد لك.', 'Merchant sales (GMV), not LAK revenue.')}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {header}
      {!mayExport && <Locked>{tx('دورك يعرض التقارير ولا يصدّرها.', 'Your role can view reports but not export them.')}</Locked>}
      <Card>
        <CardHeader title={title[id]} action={<span className="text-xs text-muted">{period}</span>} />
        <div className="border-t border-border">{body()}</div>
      </Card>
      {confirm && (
        <Modal title={tx('تصدير التقرير CSV', 'Export report as CSV')} onClose={() => setConfirm(false)} footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button>
          <Button onClick={exportNow}><Download className="size-4" aria-hidden="true" />{tx(`نزّل ${reportCsv(id, stores, lang).count} صفًا`, `Download ${reportCsv(id, stores, lang).count} rows`)}</Button>
        </>}>
          <p className="text-sm text-fg">{tx(`«${title[id]}» · ${period}. المبالغ بالريال بخانتين عشريتين، بلا بيانات تواصل.`, `“${title[id]}” · ${period}. Amounts in SAR with two decimals, no contact data.`)}</p>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('يُنشأ الملف في متصفحك من البيانات التجريبية ويُسجَّل في سجل الإجراءات.', 'The file is built in your browser from demo data and recorded in the audit log.')}</p>
        </Modal>
      )}
    </div>
  );
}
