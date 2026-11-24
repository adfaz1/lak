// Analytics (blueprint pp. 27–28, skill ch. 03 analytics). Period of complete days with an equal-period comparison,
// metric definitions, "no data" kept apart from zero, a primary chart with a table, and breakdowns by channel,
// product and city. Money settlement lives in Finance, not here. View only: rules live in ./model.ts.
import { useMemo, type ReactNode } from 'react';
import { Lock, Wallet, ShoppingBag, Receipt, MousePointerClick, Eye, BarChart3, PackageOpen, MapPin, Store } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { formatMoney } from '../../../core/format';
import { link, replace, type Route } from '../../../core/router';
import { ordersStore, productsStore, testStore } from '../../merchant/stores';
import { canSee } from '../../merchant/perms';
import { Badge, Card, CardHeader, Delta, EmptyState, ErrorState, InfoHint, LinkButton, Money, ProductImage, Segmented, Skeleton, cn, useTx } from '../../../ds/ui';
import { PageHeader, Switch } from '../../../ds/kit';
import { AreaChart } from '../../../ds/charts';
import { productPhoto } from '../model/media';
import { useDashState, setDashState } from '../review';
import { sectionHref } from '../pages';
import {
  byChannel, chartPoints, dailyRows, figures, history, parseMetric, parsePeriod, periodOrders, periodProducts, topCities,
  type ChartMetric, type Figure,
} from './model';

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

function Page({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const allOrders = ordersStore.use();
  const products = productsStore.use();
  const full = useMemo(history, []);
  const period = parsePeriod(route.query.get('period'));
  const cmp = route.query.get('cmp') !== 'off';
  const metric = parseMetric(route.query.get('metric'));
  const qs = (o: Record<string, string | undefined>) => ({ period: period === 30 ? undefined : String(period), cmp: cmp ? undefined : 'off', metric: metric === 'net' ? undefined : metric, ...o });
  const empty = state === 'empty';
  const series = empty ? [] : full;
  const orders = empty ? [] : allOrders;

  const f = figures(series, period);
  const compare = cmp && f.comparable;
  const rows = dailyRows(series, period);
  const po = periodOrders(orders, period);
  const channels = byChannel(po);
  const cities = topCities(po);
  const top = periodProducts(po);

  const loc = lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
  const day = (iso: string, withYear = false) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(loc, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  const wday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' });
  const range = f.range.from && f.range.to ? `${day(f.range.from)} – ${day(f.range.to, true)}` : '';
  const prevRange = f.range.prevFrom && f.range.prevTo ? `${day(f.range.prevFrom)} – ${day(f.range.prevTo)}` : '';
  const money = (v: number) => `${formatMoney(v)} ${tx('ر.س', 'SAR')}`;

  const header = (
    <div className="space-y-4">
      <PageHeader title={tx('التحليلات', 'Analytics')}
        description={range ? tx(`${range} · أيام مكتملة بتوقيت الرياض · كل القنوات`, `${range} · complete days, Riyadh time · all channels`) : tx('أيام مكتملة بتوقيت الرياض', 'Complete days, Riyadh time')}
        actions={<LinkButton variant="secondary" href={sectionHref('finance')}><Wallet className="size-4" aria-hidden="true" />{tx('التحصيل والتحويلات', 'Payouts & fees')}</LinkButton>} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmented label={tx('الفترة', 'Period')} value={String(period) as '7' | '30' | '90'} onChange={(v) => replace(href(qs({ period: v === '30' ? undefined : v })))}
          options={[{ value: '7', label: tx('7 أيام', '7 days') }, { value: '30', label: tx('30 يومًا', '30 days') }, { value: '90', label: tx('90 يومًا', '90 days') }]} />
        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <Switch checked={cmp} onChange={(v) => replace(href(qs({ cmp: v ? undefined : 'off' })))} label={tx('قارن بالفترة السابقة', 'Compare with previous period')} />
          <span>{tx('قارن', 'Compare')}{compare && prevRange && <span className="font-normal text-muted"> · {prevRange}</span>}</span>
        </label>
      </div>
    </div>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<AnalyticsSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل التحليلات', 'Analytics could not load')} onRetry={() => setDashState('live')}>{tx('طلباتك ومبيعاتك لم تتأثر. المرجع SIM-ANA-503.', 'Your orders and sales are unaffected. Ref SIM-ANA-503.')}</ErrorState></Card>
    </div>
  );

  const DEF: Record<Figure['id'], { label: string; hint: string; icon: ReactNode }> = {
    net: { label: tx('صافي المبيعات', 'Net sales'), hint: tx('المبيعات بعد الخصومات والاستردادات، شامل الضريبة، قبل الرسوم والتكلفة. ليست ربحًا.', 'Sales after discounts and refunds, VAT included, before fees and costs. Not profit.'), icon: <Wallet className="size-5" /> },
    orders: { label: tx('الطلبات', 'Orders'), hint: tx('كل الطلبات المنشأة في الأيام المكتملة للفترة.', 'All orders created on the complete days of the period.'), icon: <ShoppingBag className="size-5" /> },
    aov: { label: tx('متوسط الطلب', 'Average order'), hint: tx('صافي المبيعات ÷ الطلبات.', 'Net sales ÷ orders.'), icon: <Receipt className="size-5" /> },
    conversion: { label: tx('معدل التحويل', 'Conversion'), hint: tx('الطلبات ÷ الزيارات، على الأيام التي فيها بيانات زيارات فقط.', 'Orders ÷ visits, on days with visit data only.'), icon: <MousePointerClick className="size-5" /> },
    sessions: { label: tx('الزيارات', 'Visits'), hint: tx('جلسات المتجر المسجلة. يوم بلا بيانات لا يُحسب صفرًا.', 'Recorded store sessions. A day without data is not counted as zero.'), icon: <Eye className="size-5" /> },
  };
  const partial = f.coverage.known < f.coverage.days;

  return (
    <div className="space-y-6">
      {header}
      {cmp && !f.comparable && !empty && <p className="text-xs text-muted">{tx('لا مقارنة: السجل أقصر من فترتين متساويتين.', 'No comparison: history is shorter than two equal periods.')}</p>}

      <section aria-label={tx('مؤشرات الفترة', 'Period figures')} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {f.list.map((x, i) => {
          const d = DEF[x.id];
          const show = (v: number | null) => (v === null ? null : x.unit === 'money' ? <Money v={v} /> : x.unit === 'percent' ? <bdi dir="ltr">{v}%</bdi> : v.toLocaleString('en-US'));
          const val = empty ? null : show(x.value);
          const coverageNote = (x.id === 'conversion' || x.id === 'sessions') && partial && !empty;
          return (
            <div key={x.id} className={cn('rounded-2xl border border-border bg-surface p-4 sm:p-5', i === 4 && 'col-span-2 lg:col-span-1')}>
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1 text-[13px] font-medium text-muted">{d.label}<InfoHint>{d.hint}</InfoHint></p>
                <span className="hidden size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted sm:grid" aria-hidden="true">{d.icon}</span>
              </div>
              <p className="mt-1 text-xl font-bold tracking-tight text-fg tabular-nums sm:text-2xl">{val ?? <span className="text-base font-semibold text-muted">{tx('لا بيانات', 'No data')}</span>}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                {compare && !empty && (x.delta !== null ? <><Delta v={x.delta} /><span className="text-muted">{tx('مقابل', 'vs')} {show(x.prev)}</span></> : x.value !== null && <span className="text-muted">{tx('لا مقارنة عادلة', 'No fair comparison')}</span>)}
                {coverageNote && <Badge tone="amber">{tx(`${f.coverage.known} من ${f.coverage.days} أيام`, `${f.coverage.known} of ${f.coverage.days} days`)}</Badge>}
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-chart">
          <CardHeader id="h-chart" title={metric === 'net' ? tx('صافي المبيعات يوميًا', 'Net sales per day') : tx('الطلبات يوميًا', 'Orders per day')}
            hint={tx('أيام مكتملة فقط؛ اليوم الحالي لا يُحتسب. الرسم متاح كجدول.', 'Complete days only; today is excluded. The chart is also available as a table.')}
            action={<Segmented label={tx('المؤشر', 'Metric')} value={metric} onChange={(v: ChartMetric) => replace(href(qs({ metric: v === 'net' ? undefined : v })))}
              options={[{ value: 'net', label: tx('المبيعات', 'Sales') }, { value: 'orders', label: tx('الطلبات', 'Orders') }]} />} />
          <div className="px-5 pb-5">
            {empty || series.length === 0 ? <EmptyState icon={<BarChart3 className="size-6" aria-hidden="true" />} title={tx('لا بيانات بعد', 'No data yet')}>{tx('يظهر الرسم بعد أول يوم مكتمل فيه مبيعات.', 'The chart appears after your first complete day with sales.')}</EmptyState>
              : <AreaChart rtl={lang === 'ar'} points={chartPoints(series, period, metric).map((p) => ({ key: p.key, label: day(p.key), value: p.value }))} format={(v) => (metric === 'net' ? money(v) : tx(`${v} طلب`, `${v} orders`))} />}
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
                  <ul className="mt-4 flex flex-wrap gap-1.5">{f.coverage.missing.map((d) => <li key={d}><Badge tone="amber">{day(d)}</Badge></li>)}</ul>
                )}
                {rows.some((r) => r.orders === 0) && <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">{tx('أيام بصفر طلبات هي صفر فعلي (المتجر كان في الصيانة)، وليست نقصًا في البيانات.', 'Days with zero orders are a true zero (store in maintenance), not missing data.')}</p>}
              </>
            )}
          </div>
        </Card>
      </div>

      <Card aria-labelledby="h-days">
        <CardHeader id="h-days" title={tx('يومًا بيوم', 'Day by day')} hint={tx('«لا بيانات» تعني أن المصدر لم يرسل رقمًا لذلك اليوم؛ «0» تعني أنه لم يحدث شيء.', '“No data” means the source sent nothing for that day; “0” means nothing happened.')}
          action={<span className="text-xs text-muted tabular-nums">{tx(`${rows.length} يوم`, `${rows.length} days`)}</span>} />
        {rows.length === 0 ? <EmptyState icon={<BarChart3 className="size-6" aria-hidden="true" />} title={tx('لا بيانات بعد', 'No data yet')} /> : (
          <div className="scrollbar-thin max-h-[420px] overflow-auto border-t border-border">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">{tx('الأرقام اليومية للفترة', 'Daily figures for the period')}</caption>
              <thead className="sticky top-0 z-10 bg-surface text-xs text-muted shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th scope="col" className="px-5 py-3 text-start font-semibold">{tx('اليوم', 'Day')}</th>
                  <th scope="col" className="px-4 py-3 text-end font-semibold">{tx('الطلبات', 'Orders')}</th>
                  <th scope="col" className="px-4 py-3 text-end font-semibold">{tx('صافي المبيعات', 'Net sales')}</th>
                  {compare && <th scope="col" className="hidden px-4 py-3 text-end font-semibold md:table-cell">{tx('اليوم المقابل', 'Matching day')}</th>}
                  <th scope="col" className="px-4 py-3 text-end font-semibold">{tx('الزيارات', 'Visits')}</th>
                  <th scope="col" className="px-5 py-3 text-end font-semibold">{tx('التحويل', 'Conversion')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.date} className="hover:bg-surface-2/50">
                    <th scope="row" className="px-5 py-2.5 text-start font-medium text-fg"><span className="text-subtle">{wday(r.date)}</span> {day(r.date)}</th>
                    <td className="px-4 py-2.5 text-end tabular-nums">{r.orders}</td>
                    <td className="px-4 py-2.5 text-end"><Money v={r.net} /></td>
                    {compare && <td className="hidden px-4 py-2.5 text-end text-muted md:table-cell">{r.prev ? <Money v={r.prev.net} /> : '—'}</td>}
                    <td className="px-4 py-2.5 text-end tabular-nums">{r.sessions === null ? <Badge tone="amber">{tx('لا بيانات', 'No data')}</Badge> : r.sessions.toLocaleString('en-US')}</td>
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
          <CardHeader id="h-ch" title={tx('المبيعات حسب القناة', 'Sales by channel')} hint={tx('من الطلبات المدفوعة في الأيام المكتملة للفترة. النسبة من قيمة الطلبات.', 'From paid orders on the complete days of the period. Share of order value.')} />
          {po.length === 0 ? <EmptyState icon={<Store className="size-6" aria-hidden="true" />} title={tx('لا طلبات في الفترة', 'No orders in this period')} /> : (
            <ul className="space-y-4 px-5 pb-5">
              {channels.map((c) => (
                <li key={c.channel}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-medium text-fg">{c.channel === 'online' ? tx('المتجر الإلكتروني', 'Online store') : c.channel === 'market' ? tx('سوق لك', 'LAK marketplace') : tx('تطبيق المتجر', 'Store app')}</span>
                    <span className="tabular-nums text-muted">{c.share}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${c.share}%` }} /></div>
                  <p className="mt-1 flex justify-between text-xs text-muted"><span>{tx(`${c.orders} طلب`, `${c.orders} orders`)}</span><Money v={c.revenue} /></p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="h-prod">
          <CardHeader id="h-prod" title={tx('الأكثر مبيعًا', 'Top products')} hint={tx('حسب قيمة المبيعات في الطلبات المدفوعة للفترة.', 'By sales value in paid orders of the period.')}
            action={<a href={sectionHref('products')} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('المنتجات', 'Products')}</a>} />
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
          <CardHeader id="h-city" title={tx('أعلى المدن', 'Top cities')} hint={tx('مدينة الشحن في الطلبات المدفوعة للفترة، بلا تفاصيل العنوان.', 'Shipping city of paid orders in the period, without address detail.')} />
          {cities.length === 0 ? <EmptyState icon={<MapPin className="size-6" aria-hidden="true" />} title={tx('لا طلبات في الفترة', 'No orders in this period')} /> : (
            <ol className="space-y-3 px-5 pb-5">
              {cities.map((c) => (
                <li key={c.key}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-1.5 font-medium text-fg"><MapPin className="size-3.5 text-subtle" aria-hidden="true" />{c.name[lang]}</span>
                    <Money v={c.revenue} className="text-muted" />
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-sky-500/70" style={{ width: `${c.share}%` }} /></div>
                  <p className="mt-1 text-xs text-muted tabular-nums">{tx(`${c.orders} طلب · ${c.share}%`, `${c.orders} orders · ${c.share}%`)}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
      {!empty && <p className="text-xs text-subtle">{tx(`المؤشرات اليومية من إحصاءات المتجر، والتوزيعات من ${po.length} طلبًا مدفوعًا في دفتر الطلبات للفترة نفسها.`, `Daily figures come from store statistics; breakdowns from ${po.length} paid orders in the order book for the same period.`)}</p>}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={cn('space-y-3 rounded-2xl border border-border bg-surface p-5', i === 4 && 'col-span-2 lg:col-span-1')}><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-20" /></div>)}</div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3"><Skeleton className="h-80 rounded-2xl lg:col-span-2" /><Skeleton className="h-80 rounded-2xl" /></div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
