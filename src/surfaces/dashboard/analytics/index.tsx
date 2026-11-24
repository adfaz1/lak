// Reports & analytics (blueprint pp. 27–28, skill ch. 03 analytics, owner requirement 4, BP-P03-ANA-001…011).
// Overview plus eight reports (sales, funnel, products, customers, channels, coupons, carts, payments), each with a
// period (preset or custom), a comparison (previous period or same period last year), a definition per number,
// "no data" kept apart from zero, CSV from every table, and saved views. Money settlement lives in Finance.
// View only: rules live in ./model.ts, ./reports.ts and ./range.ts.
import { useMemo, useState, type ReactNode } from 'react';
import { Lock, Wallet, ShoppingBag, Receipt, MousePointerClick, Eye, BarChart3, PackageOpen, MapPin, Store, Download, Bookmark, X } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { formatMoney } from '../../../core/format';
import { link, replace, type Route } from '../../../core/router';
import { cartsStore, couponsStore, financeStore, levelsStore, notifyStore, ordersStore, productsStore, searchLogStore, searchRedirectsStore, subStatusesStore, testStore, wishEventsStore } from '../../merchant/stores';
import { canSee } from '../../merchant/perms';
import { Badge, Button, Card, CardHeader, Delta, EmptyState, ErrorState, InfoHint, LinkButton, Money, ProductImage, Segmented, Skeleton, cn, useTx } from '../../../ds/ui';
import { Field, Input, Modal, PageHeader, Tabs, useToast } from '../../../ds/kit';
import { AreaChart } from '../../../ds/charts';
import { productPhoto } from '../model/media';
import { useDashState, setDashState } from '../review';
import { sectionHref } from '../pages';
import { downloadCsv } from '../finance/download';
import { byChannel, figuresFor, history, overviewCsv, parseMetric, periodProducts, rangePoints, rangeRows, topCities, type ChartMetric, type Figure } from './model';
import { compareRange, ordersIn, periodQuery, readCompare, readPeriod, type CompareMode, type Preset, type Range } from './range';
import { REPORTS, REPORT_DESC, REPORT_GROUPS, REPORT_LABEL, buildReport, isReport, parseProductSort, type Inputs, type ReportId } from './reports';
import { SearchFixModal, StockAlertModal } from './actions';
import { PeriodBar, useDay } from './period';
import { ReportView } from './report-view';
import { addView, checkViewName, currentView, removeView, viewQuery, viewsStore, type ViewError } from './views';

const href = (q?: Record<string, string | undefined>) => link('/dashboard/analytics', q);

export default function Analytics({ route }: { route: Route }) {
  const role = testStore.use().role;
  const tx = useTx();
  if (!canSee(role, 'analytics')) return (
    <div className="space-y-6"><PageHeader title={tx('التحليلات', 'Analytics')} />
      <Card><EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('ليست لديك صلاحية على التحليلات', 'You do not have access to analytics')}
        action={<LinkButton variant="secondary" href={link('/dashboard')}>{tx('العودة للرئيسية', 'Back to home')}</LinkButton>}>{tx('اطلب من مالك المتجر إضافة الصلاحية لدورك.', 'Ask the store owner to add access to your role.')}</EmptyState></Card>
    </div>
  );
  return <Page route={route} />;
}

type Tab = 'overview' | ReportId;

function Page({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = testStore.use().role;
  const allOrders = ordersStore.use();
  const products = productsStore.use();
  const carts = cartsStore.use();
  const coupons = couponsStore.use();
  const fin = financeStore.use();
  const searches = searchLogStore.use();
  const redirects = searchRedirectsStore.use();
  const notify = notifyStore.use();
  const wishes = wishEventsStore.use();
  const levels = levelsStore.use();
  const subs = subStatusesStore.use();
  const full = useMemo(() => history(), []);
  const q = route.query;
  const rp = q.get('report');
  const tab: Tab = isReport(rp) ? rp : 'overview';
  const per = readPeriod(q);
  const cmp = readCompare(q);
  const metric = parseMetric(q.get('metric'));
  const sort = parseProductSort(q.get('sort'));
  const empty = state === 'empty';
  const c = compareRange(per.range, cmp);
  const qs = (o: Record<string, string | undefined> = {}, keep = true) => ({
    report: tab === 'overview' ? undefined : tab, ...periodQuery(per.preset, per.range, cmp),
    metric: keep && metric !== 'net' ? metric : undefined, sort: keep && sort !== 'best' ? sort : undefined, ...o,
  });
  const go = (o: Record<string, string | undefined>) => replace(href(qs(o)));
  const day = useDay();

  const presets: { value: Preset; label: string }[] = [
    { value: '7', label: tx('7 أيام', '7 days') }, { value: '30', label: tx('30 يومًا', '30 days') }, { value: '90', label: tx('90 يومًا', '90 days') },
    { value: 'mtd', label: tx('هذا الشهر', 'This month') }, { value: 'custom', label: tx('مخصص', 'Custom') },
  ];
  const header = (
    <div className="space-y-4">
      <PageHeader title={tx('التقارير والتحليلات', 'Reports & analytics')}
        description={tx('أيام مكتملة بتوقيت الرياض · ريال سعودي', 'Complete days, Riyadh time · Saudi riyal')}
        actions={<>
          {state === 'live' && <SaveView route={route} />}
          <LinkButton variant="secondary" href={sectionHref('finance')}><Wallet className="size-4" aria-hidden="true" />{tx('التحصيل والتحويلات', 'Payouts & fees')}</LinkButton>
        </>} />
      <PeriodBar presets={presets} preset={per.preset} range={per.range} cmp={cmp} urlError={per.error}
        onPreset={(p) => go(p === 'custom' ? { period: 'custom', from: per.range.from, to: per.range.to } : { period: p === '30' ? undefined : p, from: undefined, to: undefined })}
        onCustom={(r) => go({ period: 'custom', from: r.from, to: r.to })}
        onCompare={(m) => go({ cmp: m === 'prev' ? undefined : m })} />
      <SavedViews route={route} />
    </div>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<AnalyticsSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل التقارير', 'Reports could not load')} onRetry={() => setDashState('live')}>{tx('طلباتك ومبيعاتك لم تتأثر. المرجع SIM-ANA-503.', 'Your orders and sales are unaffected. Ref SIM-ANA-503.')}</ErrorState></Card>
    </div>
  );

  const tabs = (['overview', ...REPORTS] as Tab[]).map((t) => ({
    href: href({ ...qs({}, false), report: t === 'overview' ? undefined : t }),
    label: t === 'overview' ? tx('نظرة عامة', 'Overview') : REPORT_LABEL[t][lang], current: tab === t,
  }));
  const inputs: Inputs = { orders: empty ? [] : allOrders, series: empty ? [] : full, products, carts: empty ? [] : carts, coupons: empty ? [] : coupons, txs: empty ? [] : fin.txs, names: canSee(role, 'customers'),
    searches: empty ? [] : searches, redirects, notify: empty ? [] : notify, wishes: empty ? [] : wishes, levels, subs };
  const fix = tab === 'search' ? q.get('fix') : null;
  const alertKey = tab === 'demand' ? q.get('alert') : null;
  const closeAction = () => go({ fix: undefined, alert: undefined });

  return (
    <div className="space-y-6">
      {header}
      <Tabs label={tx('التقارير', 'Reports')} items={tabs} />
      {tab === 'overview'
        ? <><Overview series={inputs.series} orders={inputs.orders} range={per.range} cmp={cmp} compare={c} metric={metric} empty={empty} go={go} qs={qs} /><ReportLibrary hrefFor={(id) => href({ ...qs({}, false), report: id })} /></>
        : <ReportView rep={buildReport(tab, inputs, per.range, c, { sort, q: { ...qs({}, false), report: tab } })} range={per.range} cmp={cmp} compareOn={cmp !== 'off'}
            extra={tab === 'products' ? (
              <Segmented label={tx('الترتيب', 'Sort')} value={sort} onChange={(v) => go({ sort: v === 'best' ? undefined : v })}
                options={[{ value: 'best', label: tx('الأكثر مبيعًا', 'Best selling') }, { value: 'worst', label: tx('الأقل مبيعًا', 'Lowest selling') }, { value: 'margin', label: tx('الأعلى هامشًا', 'Highest margin') }]} />
            ) : undefined} />}
      {fix && <SearchFixModal term={fix} onClose={closeAction} />}
      {alertKey && <StockAlertModal k={alertKey} onClose={closeAction} />}
      {tab !== 'overview' && !empty && <p className="text-xs text-subtle">{tx(`الفترة ${day(per.range.from)} – ${day(per.range.to, true)}. الأرقام بيانات تجريبية للمعاينة.`, `Period ${day(per.range.from)} – ${day(per.range.to, true)}. Figures are demo data for this preview.`)}</p>}
    </div>
  );
}

/* ---------- Saved views ---------- */

function SaveView({ route }: { route: Route }) {
  const tx = useTx();
  const toast = useToast();
  const views = viewsStore.use();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState<ViewError | null>(null);
  const cur = currentView(views, route.query);
  const msg: Record<ViewError, string> = { empty: tx('اكتب اسمًا', 'Enter a name'), long: tx('40 حرفًا كحد أقصى', '40 characters at most'), taken: tx('يوجد عرض بهذا الاسم', 'A view with this name exists'), full: tx('وصلت للحد (12 عرضًا). احذف عرضًا أولًا.', 'Limit reached (12 views). Delete one first.') };
  const save = () => {
    const e = checkViewName(name, views);
    if (e) { setErr(e); return; }
    viewsStore.set((l) => addView(l, name, viewQuery(route.query), 'owner', new Date().toISOString()));
    toast({ tone: 'ok', text: tx(`حُفظ العرض «${name.trim()}»`, `View “${name.trim()}” saved`) });
    setOpen(false); setName('');
  };
  if (cur) return <Badge tone="brand" icon={<Bookmark className="size-3.5" aria-hidden="true" />}>{cur.name}</Badge>;
  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); setErr(null); }}><Bookmark className="size-4" aria-hidden="true" />{tx('احفظ العرض', 'Save view')}</Button>
      {open && (
        <Modal title={tx('حفظ العرض', 'Save view')} description={tx('يحفظ التقرير والفترة والمقارنة والترتيب.', 'Keeps the report, period, comparison and sort.')} onClose={() => setOpen(false)}
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{tx('احفظ', 'Save')}</Button></>}>
          <Field label={tx('اسم العرض', 'View name')} error={err ? msg[err] : null}>
            {(p) => <Input {...p} autoFocus value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder={tx('مثال: مبيعات الشهر مقابل العام الماضي', 'e.g. Monthly sales vs last year')} />}
          </Field>
        </Modal>
      )}
    </>
  );
}

function SavedViews({ route }: { route: Route }) {
  const tx = useTx();
  const toast = useToast();
  const views = viewsStore.use();
  if (!views.length) return null;
  const cur = currentView(views, route.query);
  return (
    <nav aria-label={tx('العروض المحفوظة', 'Saved views')} className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted">{tx('عروضك:', 'Your views:')}</span>
      {views.map((v) => (
        <span key={v.id} className={cn('inline-flex h-8 items-center rounded-full border text-[13px] font-medium', cur?.id === v.id ? 'border-brand-300 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border bg-surface text-fg')}>
          <a href={`#/dashboard/analytics${v.query ? `?${v.query}` : ''}`} aria-current={cur?.id === v.id ? 'page' : undefined} className="ps-3 pe-1 hover:underline">{v.name}</a>
          <button type="button" aria-label={tx(`احذف العرض ${v.name}`, `Delete view ${v.name}`)} className="grid size-7 place-items-center rounded-full text-subtle hover:text-fg"
            onClick={() => { const before = viewsStore.get(); viewsStore.set((l) => removeView(l, v.id)); toast({ tone: 'info', text: tx(`حُذف «${v.name}»`, `“${v.name}” deleted`), action: { label: tx('تراجع', 'Undo'), run: () => viewsStore.set(before) } }); }}>
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
    </nav>
  );
}

/* ---------- Overview ---------- */

function Overview({ series, orders, range, cmp, compare: c, metric, empty, go, qs }: {
  series: ReturnType<typeof history>; orders: ReturnType<typeof ordersStore.get>; range: Range; cmp: CompareMode; compare: Range | null; metric: ChartMetric; empty: boolean;
  go: (o: Record<string, string | undefined>) => void; qs: (o?: Record<string, string | undefined>, keep?: boolean) => Record<string, string | undefined>;
}) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const products = productsStore.use();
  const day = useDay();
  const f = figuresFor(series, range, c);
  const compareOn = cmp !== 'off' && f.comparable;
  const rows = rangeRows(series, range, c);
  const po = ordersIn(orders, range);
  const channels = byChannel(po);
  const cities = topCities(po);
  const top = periodProducts(po);
  const loc = lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
  const wday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' });
  const money = (v: number) => `${formatMoney(v)} ${tx('ر.س', 'SAR')}`;
  const reportHref = (id: ReportId) => href({ ...qs({}, false), report: id });
  const exportDays = () => { downloadCsv(`lak-analytics-daily-${range.from}-${range.to}.csv`, overviewCsv(rows)); toast({ tone: 'ok', text: tx(`نُزّل ${rows.length} يوم`, `${rows.length} days downloaded`) }); };

  const DEF: Record<Figure['id'], { label: string; hint: string; icon: ReactNode }> = {
    net: { label: tx('صافي المبيعات', 'Net sales'), hint: tx('المبيعات بعد الخصومات والاستردادات، شامل الضريبة، قبل الرسوم والتكلفة. ليست ربحًا.', 'Sales after discounts and refunds, VAT included, before fees and costs. Not profit.'), icon: <Wallet className="size-5" /> },
    orders: { label: tx('الطلبات', 'Orders'), hint: tx('كل الطلبات المنشأة في الأيام المكتملة للفترة.', 'All orders created on the complete days of the period.'), icon: <ShoppingBag className="size-5" /> },
    aov: { label: tx('متوسط الطلب', 'Average order'), hint: tx('صافي المبيعات ÷ الطلبات.', 'Net sales ÷ orders.'), icon: <Receipt className="size-5" /> },
    conversion: { label: tx('معدل التحويل', 'Conversion'), hint: tx('الطلبات ÷ الزيارات، على الأيام التي فيها بيانات زيارات فقط.', 'Orders ÷ visits, on days with visit data only.'), icon: <MousePointerClick className="size-5" /> },
    sessions: { label: tx('الزيارات', 'Visits'), hint: tx('جلسات المتجر المسجلة. يوم بلا بيانات لا يُحسب صفرًا.', 'Recorded store sessions. A day without data is not counted as zero.'), icon: <Eye className="size-5" /> },
  };
  const partial = f.coverage.known < f.coverage.days;
  const REPORT_OF: Record<Figure['id'], ReportId> = { net: 'sales', orders: 'sales', aov: 'sales', conversion: 'funnel', sessions: 'funnel' };

  return (
    <div className="space-y-6">
      {cmp !== 'off' && !f.comparable && !empty && <p className="text-xs text-muted">{tx('لا مقارنة: السجل لا يغطي فترة المقارنة كاملة.', 'No comparison: history does not cover the whole comparison period.')}</p>}
      {!f.covered && !empty && <p className="text-xs text-amber-700 dark:text-amber-400">{tx('السجل اليومي لا يغطي الفترة كاملة.', 'Daily history does not cover the whole period.')}</p>}

      <section aria-label={tx('مؤشرات الفترة', 'Period figures')} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {f.list.map((x, i) => {
          const d = DEF[x.id];
          const show = (v: number | null) => (v === null ? null : x.unit === 'money' ? <Money v={v} /> : x.unit === 'percent' ? <bdi dir="ltr">{v}%</bdi> : v.toLocaleString('en-US'));
          const val = empty ? null : show(x.value);
          const coverageNote = (x.id === 'conversion' || x.id === 'sessions') && partial && !empty;
          return (
            <div key={x.id} className={cn('flex flex-col rounded-2xl border border-border bg-surface p-4 sm:p-5', i === 4 && 'col-span-2 lg:col-span-1')}>
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1 text-[13px] font-medium text-muted">{d.label}<InfoHint>{d.hint}</InfoHint></p>
                <span className="hidden size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted sm:grid" aria-hidden="true">{d.icon}</span>
              </div>
              <p className="mt-1 text-xl font-bold tracking-tight text-fg tabular-nums sm:text-2xl">{val ?? <span className="text-base font-semibold text-muted">{tx('لا بيانات', 'No data')}</span>}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                {compareOn && !empty && (x.delta !== null ? <><Delta v={x.delta} /><span className="text-muted">{tx('مقابل', 'vs')} {show(x.prev)}</span></> : x.value !== null && <span className="text-muted">{tx('لا مقارنة عادلة', 'No fair comparison')}</span>)}
                {coverageNote && <Badge tone="amber">{tx(`${f.coverage.known} من ${f.coverage.days} أيام`, `${f.coverage.known} of ${f.coverage.days} days`)}</Badge>}
              </div>
              {!empty && <a href={reportHref(REPORT_OF[x.id])} className="mt-auto pt-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('التقرير', 'Report')}</a>}
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-chart">
          <CardHeader id="h-chart" title={metric === 'net' ? tx('صافي المبيعات يوميًا', 'Net sales per day') : tx('الطلبات يوميًا', 'Orders per day')}
            hint={tx('أيام مكتملة فقط؛ اليوم الحالي لا يُحتسب. الرسم متاح كجدول.', 'Complete days only; today is excluded. The chart is also available as a table.')}
            action={<Segmented label={tx('المؤشر', 'Metric')} value={metric} onChange={(v: ChartMetric) => go({ metric: v === 'net' ? undefined : v })}
              options={[{ value: 'net', label: tx('المبيعات', 'Sales') }, { value: 'orders', label: tx('الطلبات', 'Orders') }]} />} />
          <div className="px-5 pb-5">
            {empty || rows.length === 0 ? <EmptyState icon={<BarChart3 className="size-6" aria-hidden="true" />} title={tx('لا بيانات بعد', 'No data yet')}>{tx('يظهر الرسم بعد أول يوم مكتمل فيه مبيعات.', 'The chart appears after your first complete day with sales.')}</EmptyState>
              : <AreaChart rtl={lang === 'ar'} points={rangePoints(series, range, metric).map((p) => ({ key: p.key, label: day(p.key), value: p.value }))} format={(v) => (metric === 'net' ? money(v) : tx(`${v} طلب`, `${v} orders`))} />}
          </div>
        </Card>

        <Card aria-labelledby="h-cov">
          <CardHeader id="h-cov" title={tx('بيانات الزيارات', 'Visit data')} hint={tx('بعض الأيام لم تصل فيها بيانات الزيارات من المصدر. تظهر «لا بيانات» ولا تُعامل كصفر.', 'Some days have no visit data from the source. They show “No data” and are never treated as zero.')} />
          <div className="px-5 pb-5">
            {empty ? <p className="text-sm text-muted">{tx('لا بيانات بعد.', 'No data yet.')}</p> : (
              <>
                <p className="text-3xl font-bold tabular-nums text-fg">{f.coverage.known}<span className="text-base font-medium text-muted"> / {f.coverage.days} {tx('يوم', 'days')}</span></p>
                <div className="mt-3 flex h-2 gap-px overflow-hidden rounded-full" aria-hidden="true">
                  {[...rows].reverse().map((r) => <span key={r.date} className={cn('flex-1', r.sessions === null ? 'bg-amber-400/70' : 'bg-brand-500/60')} />)}
                </div>
                <p className="mt-2 flex items-center gap-3 text-xs text-muted"><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-brand-500/60" aria-hidden="true" />{tx('متوفرة', 'Available')}</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-400/70" aria-hidden="true" />{tx('لا بيانات', 'No data')}</span></p>
                {f.coverage.missing.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5">{f.coverage.missing.slice(0, 12).map((d) => <li key={d}><Badge tone="amber">{day(d)}</Badge></li>)}{f.coverage.missing.length > 12 && <li><Badge>+{f.coverage.missing.length - 12}</Badge></li>}</ul>
                )}
                {rows.some((r) => r.orders === 0) && <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">{tx('أيام بصفر طلبات هي صفر فعلي (المتجر كان في الصيانة)، وليست نقصًا في البيانات.', 'Days with zero orders are a true zero (store in maintenance), not missing data.')}</p>}
              </>
            )}
          </div>
        </Card>
      </div>

      <Card aria-labelledby="h-days">
        <CardHeader id="h-days" title={tx('يومًا بيوم', 'Day by day')} hint={tx('«لا بيانات» تعني أن المصدر لم يرسل رقمًا لذلك اليوم؛ «0» تعني أنه لم يحدث شيء.', '“No data” means the source sent nothing for that day; “0” means nothing happened.')}
          action={<Button size="sm" variant="secondary" onClick={exportDays} disabled={!rows.length}><Download className="size-4" aria-hidden="true" />CSV</Button>} />
        {rows.length === 0 ? <EmptyState icon={<BarChart3 className="size-6" aria-hidden="true" />} title={tx('لا بيانات بعد', 'No data yet')} /> : (
          <div className="scrollbar-thin max-h-[420px] overflow-auto border-t border-border">
            <table className="w-full min-w-0 text-sm">
              <caption className="sr-only">{tx('الأرقام اليومية للفترة', 'Daily figures for the period')}</caption>
              <thead className="sticky top-0 z-10 bg-surface text-xs text-muted shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th scope="col" className="px-5 py-3 text-start font-semibold">{tx('اليوم', 'Day')}</th>
                  <th scope="col" className="px-3 py-3 text-end font-semibold">{tx('الطلبات', 'Orders')}</th>
                  <th scope="col" className="px-3 py-3 text-end font-semibold">{tx('صافي المبيعات', 'Net sales')}</th>
                  {compareOn && <th scope="col" className="hidden px-3 py-3 text-end font-semibold md:table-cell">{cmp === 'yoy' ? tx('اليوم نفسه العام الماضي', 'Same day last year') : tx('اليوم المقابل', 'Matching day')}</th>}
                  <th scope="col" className="hidden px-3 py-3 text-end font-semibold sm:table-cell">{tx('الزيارات', 'Visits')}</th>
                  <th scope="col" className="px-5 py-3 text-end font-semibold">{tx('التحويل', 'Conversion')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.date} className="hover:bg-surface-2/50">
                    <th scope="row" className="whitespace-nowrap px-5 py-2.5 text-start font-medium text-fg"><span className="text-subtle">{wday(r.date)}</span> {day(r.date)}</th>
                    <td className="px-3 py-2.5 text-end tabular-nums">{r.orders}</td>
                    <td className="px-3 py-2.5 text-end"><Money v={r.net} /></td>
                    {compareOn && <td className="hidden px-3 py-2.5 text-end text-muted md:table-cell">{r.prev ? <Money v={r.prev.net} /> : '—'}</td>}
                    <td className="hidden px-3 py-2.5 text-end tabular-nums sm:table-cell">{r.sessions === null ? <Badge tone="amber">{tx('لا بيانات', 'No data')}</Badge> : r.sessions.toLocaleString('en-US')}</td>
                    <td className="px-5 py-2.5 text-end tabular-nums">{r.conversion === null ? <span className="text-muted">—</span> : <bdi dir="ltr">{r.conversion}%</bdi>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card aria-labelledby="h-ch">
          <CardHeader id="h-ch" title={tx('المبيعات حسب القناة', 'Sales by channel')} hint={tx('من الطلبات المدفوعة في أيام الفترة. النسبة من قيمة الطلبات.', 'From paid orders on the days of the period. Share of order value.')}
            action={<a href={reportHref('channels')} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('التقرير', 'Report')}</a>} />
          {po.length === 0 ? <EmptyState icon={<Store className="size-6" aria-hidden="true" />} title={tx('لا طلبات في الفترة', 'No orders in this period')} /> : (
            <ul className="space-y-4 px-5 pb-5">
              {channels.map((ch) => (
                <li key={ch.channel}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-medium text-fg">{ch.channel === 'online' ? tx('المتجر الإلكتروني', 'Online store') : ch.channel === 'market' ? tx('سوق لك', 'LAK marketplace') : tx('تطبيق المتجر', 'Store app')}</span>
                    <span className="tabular-nums text-muted">{ch.share}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${ch.share}%` }} /></div>
                  <p className="mt-1 flex justify-between text-xs text-muted"><span>{tx(`${ch.orders} طلب`, `${ch.orders} orders`)}</span><Money v={ch.revenue} /></p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="h-prod">
          <CardHeader id="h-prod" title={tx('الأكثر مبيعًا', 'Top products')} hint={tx('حسب قيمة المبيعات في الطلبات المدفوعة للفترة.', 'By sales value in paid orders of the period.')}
            action={<a href={reportHref('products')} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('التقرير', 'Report')}</a>} />
          {top.length === 0 ? <EmptyState icon={<PackageOpen className="size-6" aria-hidden="true" />} title={tx('لا مبيعات في الفترة', 'No sales in this period')} /> : (
            <ol className="space-y-1 px-3 pb-4">
              {top.map((p, i) => (
                <li key={p.sku} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span className="w-4 text-center text-xs font-bold text-subtle tabular-nums">{i + 1}</span>
                  <ProductImage src={productPhoto(p.productId)} alt={p.name[lang]} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{products.find((x) => x.id === p.productId)?.name[lang] ?? p.name[lang]}</p>
                    <p className="text-xs text-muted tabular-nums">{tx(`${p.units} قطعة`, `${p.units} sold`)}</p>
                  </div>
                  <Money v={p.revenue} className="text-sm font-semibold text-fg" />
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card aria-labelledby="h-city">
          <CardHeader id="h-city" title={tx('أعلى المدن', 'Top cities')} hint={tx('مدينة الشحن في الطلبات المدفوعة للفترة، بلا تفاصيل العنوان.', 'Shipping city of paid orders in the period, without address detail.')}
            action={cities.length ? <button type="button" className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => { downloadCsv(`lak-cities-${range.from}-${range.to}.csv`, citiesCsv(cities, lang)); toast({ tone: 'ok', text: tx('نُزّلت المدن', 'Cities downloaded') }); }}>CSV</button> : undefined} />
          {cities.length === 0 ? <EmptyState icon={<MapPin className="size-6" aria-hidden="true" />} title={tx('لا طلبات في الفترة', 'No orders in this period')} /> : (
            <ol className="space-y-3 px-5 pb-5">
              {cities.map((ci) => (
                <li key={ci.key}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-1.5 font-medium text-fg"><MapPin className="size-3.5 text-subtle" aria-hidden="true" />{ci.name[lang]}</span>
                    <Money v={ci.revenue} className="text-muted" />
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-sky-500/70" style={{ width: `${ci.share}%` }} /></div>
                  <p className="mt-1 text-xs text-muted tabular-nums">{tx(`${ci.orders} طلب · ${ci.share}%`, `${ci.orders} orders · ${ci.share}%`)}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
      {!empty && <p className="text-xs text-subtle">{tx(`المؤشرات اليومية من إحصاءات المتجر، والتوزيعات من ${po.length} طلبًا مدفوعًا في دفتر الطلبات للفترة نفسها. بيانات تجريبية.`, `Daily figures come from store statistics; breakdowns from ${po.length} paid orders in the order book for the same period. Demo data.`)}</p>}
    </div>
  );
}

/** Every report in one place, grouped, each with one line saying what it answers. No report opens by itself. */
function ReportLibrary({ hrefFor }: { hrefFor: (id: ReportId) => string }) {
  const tx = useTx();
  const { lang } = useLang();
  return (
    <Card aria-labelledby="h-lib">
      <CardHeader id="h-lib" title={tx('كل التقارير', 'All reports')} hint={tx('كل تقرير بفترة ومقارنة وتعريف لكل رقم وملف CSV.', 'Every report has a period, a comparison, a definition per number and a CSV.')} />
      <div className="grid gap-x-6 gap-y-5 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
        {REPORT_GROUPS.map((g) => (
          <section key={g.id} aria-label={g.label[lang]}>
            <h3 className="text-xs font-semibold text-muted">{g.label[lang]}</h3>
            <ul className="mt-2 space-y-1">
              {g.reports.map((id) => (
                <li key={id}>
                  <a href={hrefFor(id)} className="block rounded-xl px-2 py-1.5 hover:bg-surface-2">
                    <span className="block text-sm font-semibold text-fg">{REPORT_LABEL[id][lang]}</span>
                    <span className="block text-xs text-muted">{REPORT_DESC[id][lang]}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

const citiesCsv = (cities: ReturnType<typeof topCities>, lang: 'ar' | 'en') =>
  ['city,orders,value_sar,share_pct', ...cities.map((c) => `"${c.name[lang]}",${c.orders},${(c.revenue / 100).toFixed(2)},${c.share}`)].join('\r\n') + '\r\n';

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={cn('space-y-3 rounded-2xl border border-border bg-surface p-5', i === 4 && 'col-span-2 lg:col-span-1')}><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-20" /></div>)}</div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3"><Skeleton className="h-80 rounded-2xl lg:col-span-2" /><Skeleton className="h-80 rounded-2xl" /></div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
