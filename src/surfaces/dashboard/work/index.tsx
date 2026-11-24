// Daily work centre (`#/dashboard/work`): one ranked queue of everything that needs action across the store,
// for the viewer's role. Category and status filters live in the URL (`?cat=&show=`). Snooze and "done" are logged
// with who and when; a done item comes back by itself when its situation changes (new order, new failure…).
import { useMemo, useState, type ReactNode } from 'react';
import { BellOff, CheckCircle2, Check, History, RotateCcw, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, type Route } from '../../../core/router';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, Money, Skeleton, useTx } from '../../../ds/ui';
import { FilterChip, PageHeader, Tabs, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { dhref } from '../shell';
import { CAT_OF, SNOOZES, countBy, markDone, parseCat, parseShow, reopen, snooze, snoozeUntil, split, type LogRow, type SnoozeFor, type WorkCat, type WorkItem } from './model';
import { WorkRow, useWorkText } from './parts';
import { queueStore, useWho, useWork } from './state';

export default function Work({ route }: { route: Route }) {
  const tx = useTx();
  const state = useDashState();
  const { all, mine } = useWork(state === 'empty');
  const qs = queueStore.use();
  const cat = parseCat(route.query.get('cat'));
  const show = parseShow(route.query.get('show'));
  const [now] = useState(() => Date.now());
  const parts = useMemo(() => split(qs, mine, now), [qs, mine, now]);
  const counts = countBy(parts.open);
  const shown = parts[show].filter((x) => !cat || CAT_OF[x.kind] === cat);
  const hidden = all.length - mine.length;
  const href = (p: { cat?: WorkCat | null; show?: string }) => dhref('work', { cat: (p.cat === undefined ? cat : p.cat) ?? undefined, show: (p.show ?? show) === 'open' ? undefined : (p.show ?? show) });

  const open = parts.open;
  const lost = open.filter((x) => x.moneyKind === 'lost').reduce((s, x) => s + x.money, 0);
  const uncollected = open.filter((x) => x.kind === 'payfail' || x.kind === 'late').reduce((s, x) => s + x.money, 0);
  const affectedOrders = open.reduce((s, x) => s + x.orders, 0);
  const affectedCustomers = open.reduce((s, x) => s + x.customers, 0);

  const header = (
    <>
      <PageHeader title={tx('مركز العمل اليومي', 'Daily work centre')}
        description={state === 'live' ? tx(`${open.length} أمور مفتوحة لدورك، مرتبة بأثرها`, `${open.length} open for your role, ranked by impact`) : tx('كل ما يحتاج إجراءً في متجرك', 'Everything in your store that needs action')}
        meta={<span className="inline-flex items-center gap-1 text-xs text-muted">{tx('كيف يُرتَّب؟', 'How is it ranked?')}<InfoHint>{tx('المال غير المحصّل والتأخير وأعطال الدفع أولًا، ثم التجهيز والمخزون الذي قد يفوّت مبيعات، ثم الباقي. داخل كل درجة: الأكبر قيمة ثم الأقدم.', 'Uncollected money, delays and payment breakages first; then fulfilment and stock that may cost sales; then the rest. Within a level: larger amount, then older.')}</InfoHint></span>} />
      <div><Tabs label={tx('الفئات', 'Categories')} items={[
        { href: href({ cat: null }), label: tx('الكل', 'All'), current: !cat, count: state === 'live' ? open.length : undefined },
        { href: href({ cat: 'orders' }), label: tx('الطلبات', 'Orders'), current: cat === 'orders', count: state === 'live' ? counts.orders : undefined },
        { href: href({ cat: 'money' }), label: tx('الأموال', 'Money'), current: cat === 'money', count: state === 'live' ? counts.money : undefined },
        { href: href({ cat: 'stock' }), label: tx('المخزون', 'Stock'), current: cat === 'stock', count: state === 'live' ? counts.stock : undefined },
        { href: href({ cat: 'integrations' }), label: tx('الربط', 'Integrations'), current: cat === 'integrations', count: state === 'live' ? counts.integrations : undefined },
        { href: href({ cat: 'automations' }), label: tx('الأتمتة', 'Automations'), current: cat === 'automations', count: state === 'live' ? counts.automations : undefined },
      ]} /></div>
    </>
  );

  if (state === 'loading') return (
    <div className="space-y-6" aria-busy="true">{header}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-28" /></div>)}</div>
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5" role="status" aria-label="Loading">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="size-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-2/3" /></div><Skeleton className="h-9 w-24 rounded-lg" /></div>)}</div>
    </div>
  );
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تجميع مهام اليوم', 'Today’s work could not be gathered')} onRetry={() => setDashState('live')}>
        {tx('طلباتك ومخزونك لم تتغير، ويمكنك العمل من كل قسم مباشرة. المرجع SIM-WORK-503.', 'Your orders and stock are unchanged; you can still work from each section. Ref SIM-WORK-503.')}
      </ErrorState></Card>
    </div>
  );

  const stat = (label: string, hint: string, value: ReactNode) => (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <p className="flex items-center gap-1 text-[13px] font-medium text-muted">{label}<InfoHint>{hint}</InfoHint></p>
      <p className="mt-1 text-xl font-bold tracking-tight text-fg tabular-nums sm:text-2xl">{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {header}

      <section aria-label={tx('أثر المفتوح', 'Impact of open items')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stat(tx('مال معلّق', 'Money held up'), tx('قيمة الطلبات المتأخرة والمدفوعات التي لم تكتمل.', 'Value of late orders and payments not completed.'), <Money v={uncollected} />)}
        {stat(tx('مبيعات قد تفوت', 'Sales at risk'), tx('تقدير: الوحدات الناقصة لتغطية 7 أيام بمعدل البيع × آخر سعر. فقط للأصناف التي لها 14 يوم مبيعات على الأقل.', 'Estimate: units short of 7 days at the sales rate × latest price. Only for SKUs with at least 14 days of sales.'), <Money v={lost} />)}
        {stat(tx('طلبات متأثرة', 'Orders affected'), tx('مجموع الطلبات في البنود المفتوحة.', 'Orders across open items.'), affectedOrders.toLocaleString('en-US'))}
        {stat(tx('عملاء متأثرون', 'Customers affected'), tx('عملاء مختلفون في طلبات البنود المفتوحة ورسائل الأتمتة الفاشلة.', 'Distinct customers in open items’ orders and failed automation messages.'), affectedCustomers.toLocaleString('en-US'))}
      </section>

      <Card aria-labelledby="h-queue">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-3">
          <h2 id="h-queue" className="flex-1 text-[15px] font-semibold text-fg">{show === 'open' ? tx('الطابور', 'Queue') : show === 'snoozed' ? tx('المؤجلة', 'Snoozed') : tx('المنجزة', 'Done')}</h2>
          <FilterChip label={tx('الحالة', 'Status')} value={show === 'open' ? '' : show} onChange={(v) => replace(href({ show: v || 'open' }))}
            options={[{ value: 'snoozed', label: tx(`مؤجلة (${parts.snoozed.length})`, `Snoozed (${parts.snoozed.length})`) }, { value: 'done', label: tx(`منجزة (${parts.done.length})`, `Done (${parts.done.length})`) }]} />
        </div>
        {shown.length === 0 ? (
          show === 'open' && !cat && parts.open.length === 0
            ? <EmptyState icon={<CheckCircle2 className="size-6" />} title={tx('لا شيء ينتظرك', 'Nothing is waiting for you')}>{state === 'empty' ? tx('تظهر هنا الطلبات والمخزون والمدفوعات التي تحتاجك بعد أول طلب.', 'Orders, stock and payments that need you appear here after your first order.') : tx('كل ما يخص دورك منجز أو مؤجل.', 'Everything for your role is done or snoozed.')}</EmptyState>
            : <EmptyState icon={<SearchX className="size-6" />} title={tx('لا بنود هنا', 'Nothing here')} action={<a href={href({ cat: null, show: 'open' })} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('اعرض كل المفتوح', 'Show all open')}</a>}>{tx('جرّب فئة أو حالة أخرى.', 'Try another category or status.')}</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((x, i) => <Item key={x.id} x={x} primary={show === 'open' && i === 0} status={show} until={qs.snoozed[x.id]} />)}
          </ul>
        )}
        {hidden > 0 && <p className="border-t border-border px-5 py-3 text-xs text-muted">{tx(`${hidden} بنود أخرى لأدوار غير دورك (مثل المالية أو الربط) لا تظهر هنا.`, `${hidden} other items belong to other roles (such as finance or integrations) and are not shown.`)}</p>}
      </Card>

      <ActivityLog rows={qs.log} />
    </div>
  );
}

function Item({ x, primary, status, until }: { x: WorkItem; primary: boolean; status: 'open' | 'snoozed' | 'done'; until?: number }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const who = useWho();
  const title = useWorkText()(x).title;
  const [menu, setMenu] = useState(false);
  const act = (fn: () => void, msg: string) => {
    const before = queueStore.get();
    fn();
    toast({ tone: 'ok', text: msg, action: { label: tx('تراجع', 'Undo'), run: () => queueStore.set(before) } });
  };
  const doSnooze = (c: SnoozeFor) => { setMenu(false); act(() => queueStore.set((s) => snooze(s, x, snoozeUntil(c, new Date()), who, Date.now())), tx(`أُجّل «${title}»`, `Snoozed “${title}”`)); };
  const fmt = (t: number) => new Date(t).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const label: Record<SnoozeFor, string> = { '1h': tx('ساعة', '1 hour'), '4h': tx('4 ساعات', '4 hours'), tomorrow: tx('غدًا 8 صباحًا', 'Tomorrow 8:00') };

  const aside = status === 'open' ? (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" size="sm" aria-expanded={menu} aria-label={tx('أجّل', 'Snooze')} onClick={() => setMenu((m) => !m)}><BellOff className="size-3.5" aria-hidden="true" /><span className="hidden sm:inline">{tx('أجّل', 'Snooze')}</span></Button>
      <Button variant="ghost" size="sm" aria-label={tx('تم', 'Done')} onClick={() => act(() => queueStore.set((s) => markDone(s, x, who, Date.now())), tx(`«${title}» منجز. يعود إن تغيّر شيء.`, `“${title}” done. It comes back if anything changes.`))}><Check className="size-3.5" aria-hidden="true" /><span className="hidden sm:inline">{tx('تم', 'Done')}</span></Button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Badge tone={status === 'done' ? 'green' : 'gray'}>{status === 'done' ? tx('منجز', 'Done') : tx(`حتى ${fmt(until ?? 0)}`, `until ${fmt(until ?? 0)}`)}</Badge>
      <Button variant="ghost" size="sm" aria-label={tx('أعِد فتحه', 'Reopen')} onClick={() => act(() => queueStore.set((s) => reopen(s, x, who, Date.now())), tx('أُعيد إلى الطابور', 'Back in the queue'))}><RotateCcw className="size-3.5" aria-hidden="true" /><span className="hidden sm:inline">{tx('أعِد فتحه', 'Reopen')}</span></Button>
    </div>
  );

  return (
    <>
      <WorkRow x={x} primary={primary} aside={aside} />
      {menu && (
        <li className="flex flex-wrap items-center gap-2 bg-surface-2/50 px-5 py-3" role="group" aria-label={tx('مدة التأجيل', 'Snooze for')}>
          <span className="text-xs font-medium text-muted">{tx('أجّل لمدة', 'Snooze for')}</span>
          {SNOOZES.map((c) => <Button key={c} variant="secondary" size="sm" onClick={() => doSnooze(c)}>{label[c]}</Button>)}
          <Button variant="ghost" size="sm" onClick={() => setMenu(false)}>{tx('إلغاء', 'Cancel')}</Button>
        </li>
      )}
    </>
  );
}

function ActivityLog({ rows }: { rows: LogRow[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const act = { done: tx('أنجز', 'marked done'), snooze: tx('أجّل', 'snoozed'), reopen: tx('أعاد فتح', 'reopened') };
  const kind = { late: tx('طلبات متأخرة', 'Late orders'), payfail: tx('مدفوعات لم تكتمل', 'Payments not completed'), fulfil: tx('طلبات للتجهيز', 'Orders to fulfil'), refunds: tx('استردادات معلّقة', 'Pending refunds'), stock: tx('مخزون', 'Stock'), settlement: tx('تسوية', 'Settlement'), integration: tx('ربط', 'Integration'), automation: tx('أتمتة', 'Automation') };
  const time = (t: number) => new Date(t).toLocaleTimeString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <Card aria-labelledby="h-log">
      <CardHeader id="h-log" title={tx('سجل الطابور', 'Queue log')} hint={tx('من أجّل أو أنجز أو أعاد فتح بندًا ومتى، لهذه الجلسة.', 'Who snoozed, completed or reopened an item and when, for this session.')} />
      {rows.length === 0 ? <EmptyState icon={<History className="size-6" />} title={tx('لا إجراءات بعد', 'No actions yet')}>{tx('ما تؤجله أو تنجزه يظهر هنا باسمك ووقته.', 'What you snooze or complete shows here with your name and time.')}</EmptyState> : (
        <ul className="divide-y divide-border">
          {rows.slice(0, 10).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <span className="font-semibold text-fg">{r.who}</span>
              <span className="text-muted">{act[r.act]}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{r.subject?.[lang] ?? kind[r.kind]}{r.subject ? ` · ${kind[r.kind]}` : ''}</span>
              <span className="text-xs text-subtle tabular-nums">{time(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
