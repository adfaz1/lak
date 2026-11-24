// Merchant home — the quality reference for the whole platform.
// View only: every number comes from model/home.ts.
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Boxes, ShoppingBag, Wallet, Receipt, MousePointerClick, PackageOpen, CheckCircle2, PackageCheck, Landmark, SlidersHorizontal, Filter, ArrowUpRight } from 'lucide-react';
import { useLang } from '../../core/lang';
import { link } from '../../core/router';
import { formatMoney } from '../../core/format';
import { ordersStore, levelsStore, productsStore, testStore, financeStore } from '../merchant/stores';
import { can } from '../merchant/perms';
import { moneyCards } from '../merchant/finance';
import { total, type Order } from '../merchant/domain';
import { history } from './analytics/model';
import { Card, CardHeader, Money, Delta, Badge, Button, ProductImage, Avatar, Ref, Skeleton, EmptyState, ErrorState, Segmented, LinkButton, InfoHint, cn, useTx, toneDot, type Tone } from '../../ds/ui';
import { AreaChart } from '../../ds/charts';
import { CARD_SPAN, channelsToday, headline, salesToday, stockAlerts, topProducts, type CardId, type FigureId, type PeriodDays } from './model/home';
import { toolById, type Tool } from './model/tools';
import { split } from './work/model';
import { WorkRow } from './work/parts';
import { queueStore, useWho, useWork, useWorkspace } from './work/state';
import { Customise } from './work/customise';
import { AssistantCard } from './assistant/card';
import { dhref } from './shell';
import { productPhoto, skuPhoto } from './model/media';
import { useDashState, setDashState } from './review';
import { sectionHref } from './pages';

/** Desktop columns for the headline row, so any number of chosen figures fills one line. */
const FIG_COLS: Record<number, string> = { 1: 'xl:grid-cols-2', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'lg:grid-cols-3 xl:grid-cols-5', 6: 'lg:grid-cols-3 xl:grid-cols-6' };
/** Latin spelling of the demo team's names for the English greeting. */
const EN_NAME: Record<string, string> = { 'سارة': 'Sara', 'فيصل': 'Faisal', 'هدى': 'Huda' };
const ordersLink = (view?: string) => sectionHref('orders', '', { view });

export default function Home() {
  const { lang } = useLang();
  const tx = useTx();
  const state = useDashState();
  const orders = ordersStore.use();
  const levels = levelsStore.use();
  const products = productsStore.use();
  // Same daily history as Analytics, so a period's comparison is identical on both screens.
  const series = useMemo(history, []);
  const [period, setPeriod] = useState<PeriodDays>(7);

  const empty = state === 'empty';
  const list = empty ? [] : orders;
  const lv = empty ? [] : levels;
  const role = testStore.use().role;
  const fin = financeStore.use();
  const who = useWho();
  const ws = useWorkspace(role);
  const [customising, setCustomising] = useState(false);
  const { mine } = useWork(empty);
  const qs = queueStore.use();
  const [now] = useState(() => Date.now());
  // The work centre's queue for this role, minus what was snoozed or marked done; the home shows the top five.
  const open = split(qs, mine, now).open;
  const work = open.slice(0, 5);
  const figures = headline(empty ? [] : series, period);
  const toFulfil = open.filter((x) => x.kind === 'fulfil' || x.kind === 'late').reduce((n, x) => n + x.orders, 0);
  const top = topProducts(list);
  const alerts = stockAlerts(lv);
  const recent = list.slice(0, 6);
  const todaySales = salesToday(list);
  const todayOrders = list.filter((o) => o.hoursAgo < 12).length;

  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const ago = (h: number) => (h < 24 ? tx(`قبل ${h} س`, `${h}h ago`) : tx(`قبل ${Math.round(h / 24)} ي`, `${Math.round(h / 24)}d ago`));

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-[28px]">{EN_NAME[who] ? tx(`صباح الخير، ${who}`, `Good morning, ${EN_NAME[who]}`) : tx('صباح الخير', 'Good morning')}</h1>
        <p className="mt-1 text-sm text-muted">
          {state === 'live' && open.length ? tx(`${open.length} أمور تحتاجك اليوم`, `${open.length} things need you today`) : tx('ملخص متجرك', 'Your store at a glance')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label={tx('الفترة', 'Period')} value={String(period) as '7' | '30'} onChange={(v) => setPeriod(Number(v) as PeriodDays)}
          options={[{ value: '7', label: tx('7 أيام', '7 days') }, { value: '30', label: tx('30 يومًا', '30 days') }]} />
        <Button variant="secondary" onClick={() => setCustomising(true)}><SlidersHorizontal className="size-4" aria-hidden="true" />{tx('خصّص', 'Customise')}</Button>
        {can(role, 'order.fulfil')
          ? <LinkButton href={ordersLink('needs')} className="bg-brand-gradient hover:opacity-95">{tx('جهّز الطلبات', 'Fulfil orders')}</LinkButton>
          : <LinkButton href={dhref('work')} className="bg-brand-gradient hover:opacity-95">{tx('مركز العمل', 'Work centre')}</LinkButton>}
      </div>
    </div>
  );

  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<HomeSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل ملخص المتجر', 'Your store summary could not load')} onRetry={() => setDashState('live')}>
        {tx('بياناتك لم تتغير، وطلباتك ومنتجاتك تعمل. المرجع SIM-HOME-503.', 'Nothing changed in your data; orders and products keep working. Ref SIM-HOME-503.')}
      </ErrorState></Card>
    </div>
  );

  const FIG: Record<FigureId, { label: string; hint: string; icon: ReactNode; tint: string }> = {
    net: { label: tx('صافي المبيعات', 'Net sales'), hint: tx('بعد الخصومات والاستردادات، شامل الضريبة. الأيام المكتملة فقط.', 'After discounts and refunds, VAT included. Complete days only.'), icon: <Wallet className="size-5" />, tint: 'from-brand-500/15 text-brand-600 dark:text-brand-300' },
    orders: { label: tx('الطلبات', 'Orders'), hint: tx('كل الطلبات المنشأة في الفترة بأي حالة دفع.', 'Every order created in the period, any payment state.'), icon: <ShoppingBag className="size-5" />, tint: 'from-sky-500/15 text-sky-600 dark:text-sky-300' },
    aov: { label: tx('متوسط قيمة الطلب', 'Average order value'), hint: tx('صافي المبيعات ÷ عدد الطلبات.', 'Net sales ÷ number of orders.'), icon: <Receipt className="size-5" />, tint: 'from-violet-500/15 text-violet-600 dark:text-violet-300' },
    conversion: { label: tx('معدل التحويل', 'Conversion rate'), hint: tx('الطلبات ÷ الزيارات، محسوب فقط على الأيام التي تتوفر فيها بيانات زيارات.', 'Orders ÷ visits, on days with visit data only.'), icon: <MousePointerClick className="size-5" />, tint: 'from-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
    toFulfil: { label: tx('بانتظار التجهيز', 'To fulfil'), hint: tx('طلبات مدفوعة لم تُجهّز بعد، منها المتأخرة. الآن، لا مقارنة.', 'Paid orders not yet fulfilled, late ones included. Right now, no comparison.'), icon: <PackageCheck className="size-5" />, tint: 'from-brand-500/15 text-brand-600 dark:text-brand-300' },
    available: { label: tx('الرصيد المتاح', 'Available balance'), hint: tx('ما سوّاه مزوّد الدفع ولم يُحوَّل بعد: المبيعات − الرسوم − الاستردادات ± التسويات. يُحوَّل في التحويل القادم.', 'Settled by the provider, not yet paid out: sales − fees − refunds ± adjustments. Goes out in the next payout.'), icon: <Landmark className="size-5" />, tint: 'from-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  };

  const SPAN = { 1: '', 2: 'lg:col-span-2', 3: 'lg:col-span-3' } as const;
  const CARDS: Record<CardId, ReactNode> = {
    work: (
        <Card className={SPAN[CARD_SPAN.work]} aria-labelledby="h-work">
          <CardHeader id="h-work" title={tx('يحتاجك الآن', 'Needs you now')} hint={tx('مرتبة حسب أثرها: المال غير المحصّل والتأخير وأعطال الدفع أولًا، ثم التجهيز والمخزون، ثم الباقي. حسب دورك.', 'Ranked by impact: uncollected money, delays and payment breakages first, then fulfilment and stock, then the rest. For your role.')}
            action={<a href={dhref('work')} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{open.length > work.length ? tx(`الكل (${open.length})`, `All (${open.length})`) : tx('مركز العمل', 'Work centre')}</a>} />
          {work.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="size-6" />} title={tx('لا شيء ينتظرك', 'Nothing is waiting for you')} action={<LinkButton variant="secondary" href={dhref('work')}>{tx('مركز العمل', 'Work centre')}</LinkButton>}>
              {tx('لا شيء مفتوح لدورك: الطلبات والمخزون والمدفوعات والربط بخير، أو أجّلته.', 'Nothing open for your role: orders, stock, payments and integrations are fine, or you snoozed them.')}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {work.map((x, i) => <WorkRow key={x.id} x={x} primary={i === 0} />)}
            </ul>
          )}
        </Card>
    ),
    today: (
        <Card className={SPAN[CARD_SPAN.today]} aria-labelledby="h-today">
          <CardHeader id="h-today" title={tx('اليوم', 'Today')} />
          <div className="px-5 pb-5">
            <p className="text-xs text-muted">{tx('مبيعات مدفوعة', 'Paid sales')}</p>
            <p className="mt-0.5 text-3xl font-bold tracking-tight text-fg tabular-nums">{empty ? '—' : <Money v={todaySales} />}</p>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{tx('طلبات اليوم', 'Orders today')}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{empty ? 0 : todayOrders}</dd></div>
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{tx('بانتظار التجهيز', 'To fulfil')}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{toFulfil}</dd></div>
            </dl>
            <div className="mt-5">
              <p className="mb-3 text-xs font-medium text-muted">{tx('طلبات اليوم حسب القناة', "Today's orders by channel")}</p>
              <ul className="space-y-3">
                {channelsToday(list).map((c) => (
                  <li key={c.channel}>
                    <div className="flex items-center justify-between text-[13px]"><span className="font-medium text-fg">{c.channel === 'online' ? tx('المتجر الإلكتروني', 'Online store') : c.channel === 'market' ? tx('سوق لك', 'LAK marketplace') : tx('تطبيق المتجر', 'Store app')}</span><span className="tabular-nums text-muted">{c.orders}</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${c.share}%` }} /></div>
                  </li>
                ))}
              </ul>
            </div>
            <a href={link('/store')} className="mt-5 flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-medium text-fg transition-colors hover:border-brand-300">
              <span>{tx('متجرك يستقبل الطلبات', 'Your store is taking orders')}</span><span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"><span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />{tx('يعمل', 'Live')}</span>
            </a>
          </div>
        </Card>
    ),
    assistant: <div className="lg:col-span-3"><AssistantCard period={period} empty={empty} /></div>,
    sales: (
        <Card className={SPAN[CARD_SPAN.sales]} aria-labelledby="h-sales">
          <CardHeader id="h-sales" title={tx(`صافي المبيعات · آخر ${period} أيام`, `Net sales · last ${period} days`)} hint={tx('بعد الخصومات والاستردادات، شامل الضريبة. اليوم الحالي غير مكتمل فلا يُحتسب.', 'After discounts and refunds, VAT included. Today is incomplete and excluded.')} />
          <div className="px-5 pb-5">
            {empty ? <EmptyState icon={<Wallet className="size-6" />} title={tx('لا مبيعات بعد', 'No sales yet')}>{tx('يظهر الرسم بعد أول طلب مدفوع.', 'The chart appears after your first paid order.')}</EmptyState>
              : <AreaChart rtl={lang === 'ar'} points={series.slice(-period).map((d) => ({ key: d.date, label: fmtDay(d.date), value: d.net }))} format={(v) => `${formatMoney(v)} ${tx('ر.س', 'SAR')}`} />}
          </div>
        </Card>
    ),
    top: (
        <Card className={SPAN[CARD_SPAN.top]} aria-labelledby="h-top">
          <CardHeader id="h-top" title={tx('الأكثر مبيعًا', 'Best sellers')} action={<a href={sectionHref('products')} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('المنتجات', 'Products')}</a>} />
          {top.length === 0 ? <EmptyState icon={<PackageOpen className="size-6" />} title={tx('لا مبيعات بعد', 'No sales yet')} /> : (
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
    ),
    recent: (
        <Card className={SPAN[CARD_SPAN.recent]} aria-labelledby="h-recent">
          <CardHeader id="h-recent" title={tx('أحدث الطلبات', 'Latest orders')} action={<a href={ordersLink()} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('كل الطلبات', 'All orders')}</a>} />
          {recent.length === 0 ? <EmptyState icon={<ShoppingBag className="size-6" />} title={tx('لا طلبات بعد', 'No orders yet')}>{tx('شارك رابط متجرك لتصلك أول الطلبات.', 'Share your store link to get your first orders.')}</EmptyState> : (
            <ul className="divide-y divide-border">
              {recent.map((o) => <OrderRow key={o.ref} o={o} ago={ago} />)}
            </ul>
          )}
        </Card>
    ),
    stock: (
        <Card className={SPAN[CARD_SPAN.stock]} aria-labelledby="h-stock">
          <CardHeader id="h-stock" title={tx('مخزون يقترب من النفاد', 'Running low')} hint={tx('المتاح = الموجود − المحجوز. يظهر الصنف حين يصل المتاح إلى حدّ إعادة الطلب في أي مستودع.', 'Available = on hand − reserved. A SKU appears when available reaches its reorder point in any warehouse.')}
            action={<a href={sectionHref('inventory')} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('المخزون', 'Inventory')}</a>} />
          {alerts.length === 0 ? <EmptyState icon={<Boxes className="size-6" />} title={tx('المخزون بخير', 'Stock is healthy')} /> : (
            <ul className="space-y-1 px-3 pb-4">
              {alerts.map((a) => {
                const p = products.find((x) => x.id === a.productId);
                return (
                  <li key={`${a.sku}-${a.loc}`} className="flex items-center gap-3 rounded-xl px-2 py-2">
                    <ProductImage src={skuPhoto(a.sku)} alt={p?.name[lang] ?? a.sku} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">{p?.name[lang] ?? a.sku}</p>
                      <p className="text-xs text-muted">{a.loc === 'ryd' ? tx('مستودع الرياض', 'Riyadh warehouse') : tx('مستودع جدة', 'Jeddah warehouse')}</p>
                    </div>
                    <Badge tone={a.available === 0 ? 'red' : 'amber'}>{a.available === 0 ? tx('نفد', 'Out') : tx(`${a.available} متاح`, `${a.available} left`)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
    ),
  };

  return (
    <div className="space-y-6">
      {header}

      {(ws.shortcuts.length > 0 || ws.views.length > 0) && <Shortcuts ids={ws.shortcuts} views={ws.views} />}

      <section aria-label={tx('أرقام الفترة', 'Period figures')} className={cn('grid grid-cols-2 gap-3 sm:gap-4', FIG_COLS[Math.min(ws.figures.length, 6)])}>
        {ws.figures.map((id) => {
          const d = FIG[id];
          const f = figures.find((x) => x.id === id);
          const val = f ? (f.value === null ? '—' : f.unit === 'money' ? <Money v={f.value} /> : f.unit === 'percent' ? `${f.value}%` : f.value.toLocaleString('en-US'))
            : id === 'toFulfil' ? toFulfil.toLocaleString('en-US') : <Money v={moneyCards(fin.txs, fin.payouts).available} />;
          return (
            <div key={id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1 text-[13px] font-medium text-muted">{d.label}<InfoHint>{d.hint}</InfoHint></p>
                <span className={cn('hidden size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b to-transparent sm:grid', d.tint)} aria-hidden="true">{d.icon}</span>
              </div>
              <p className="mt-1 text-xl font-bold tracking-tight text-fg tabular-nums sm:text-2xl">{empty ? '—' : val}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle">
                {empty ? tx('لا بيانات بعد', 'No data yet') : f ? <><Delta v={f.delta} /><span>{tx(`مقابل ${period} أيام سابقة`, `vs previous ${period} days`)}</span></> : <span>{tx('الآن', 'Right now')}</span>}
              </div>
            </div>
          );
        })}
      </section>

      {ws.cards.length === 0
        ? <Card><EmptyState icon={<SlidersHorizontal className="size-6" />} title={tx('كل البطاقات مخفية', 'Every card is hidden')} action={<Button variant="secondary" onClick={() => setCustomising(true)}>{tx('خصّص', 'Customise')}</Button>}>{tx('أظهر ما تحتاجه من «خصّص».', 'Show what you need from “Customise”.')}</EmptyState></Card>
        : <div className="grid grid-cols-1 gap-6 lg:grid-flow-row-dense lg:grid-cols-3">{ws.cards.map((id) => <Fragment key={id}>{CARDS[id]}</Fragment>)}</div>}

      {customising && <Customise role={role} ws={ws} onClose={() => setCustomising(false)} />}
    </div>
  );
}

/** The viewer's pinned shortcuts and saved views (from «خصّص»), each opening its tool in context. */
function Shortcuts({ ids, views }: { ids: string[]; views: string[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const pick = (xs: string[]) => xs.map(toolById).filter((t): t is Tool => !!t);
  const chip = (t: Tool, icon: ReactNode) => (
    <li key={t.id}><a href={dhref(t.path, t.query)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] font-medium text-fg transition-colors hover:border-brand-300">{icon}{t.label[lang]}</a></li>
  );
  return (
    <nav aria-label={tx('اختصاراتك', 'Your shortcuts')}>
      <ul className="flex flex-wrap gap-2">
        {pick(ids).map((t) => chip(t, <ArrowUpRight className="size-3.5 text-subtle rtl:-scale-x-100" aria-hidden="true" />))}
        {pick(views).map((t) => chip(t, <Filter className="size-3.5 text-brand-600 dark:text-brand-300" aria-hidden="true" />))}
      </ul>
    </nav>
  );
}

function OrderRow({ o, ago }: { o: Order; ago: (h: number) => string }) {
  const tx = useTx();
  const { lang } = useLang();
  const status: [Tone, string] = o.pay === 'failed' ? ['red', tx('فشل الدفع', 'Payment failed')]
    : o.refunds.some((r) => r.status === 'pending') ? ['amber', tx('استرداد معلّق', 'Refund pending')]
      : o.ship === 'delivered' ? ['green', tx('تم التسليم', 'Delivered')]
        : o.ship !== 'none' ? ['sky', tx('شُحن', 'Shipped')]
          : ['brand', tx('للتجهيز', 'To fulfil')];
  return (
    <li>
      <a href={sectionHref('orders', o.ref)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
        <ProductImage src={skuPhoto(o.items[0].sku)} alt={o.items[0].name[lang]} size={40} />
        <span className="hidden sm:block"><Avatar name={o.customer[lang]} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{o.customer[lang]}</p>
          <p className="text-xs text-muted"><Ref>#{o.ref}</Ref> · {ago(o.hoursAgo)}{o.items.length > 1 ? ` · ${tx(`${o.items.length} منتجات`, `${o.items.length} items`)}` : ''}</p>
        </div>
        <span className="hidden sm:block"><Badge tone={status[0]}>{status[1]}</Badge></span>
        <div className="flex flex-col items-end gap-1">
          <Money v={total(o)} className="text-sm font-semibold text-fg" />
          <span className={cn('size-2 rounded-full sm:hidden', toneDot[status[0]])} title={status[1]} aria-label={status[1]} role="img" />
        </div>
      </a>
    </li>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-32" /><Skeleton className="h-3 w-20" /></div>)}</div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 lg:col-span-2">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="size-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div><Skeleton className="h-9 w-24 rounded-lg" /></div>)}</div>
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-4 w-16" /><Skeleton className="h-9 w-40" /><Skeleton className="h-20 w-full rounded-xl" /></div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3"><Skeleton className="h-72 rounded-2xl lg:col-span-2" /><Skeleton className="h-72 rounded-2xl" /></div>
    </div>
  );
}
