// Store assistant (`#/dashboard/assistant?q=&period=`): fixed questions about this store, each answered from the
// store's own data with the numbers, what is behind them, the period, the source and when it was computed.
// It proposes at most one action as a draft that opens the right tool prefilled; it never executes anything.
import { useState } from 'react';
import { ArrowLeft, ArrowRightLeft, Bot, FileText, History, Info, PackagePlus, ShieldCheck, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { navigate, replace, type Route } from '../../../core/router';
import { Badge, Button, Card, CardHeader, Delta, EmptyState, ErrorState, InfoHint, LinkButton, Money, ProductImage, Ref, Segmented, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, PageHeader, Tabs } from '../../../ds/kit';
import { LOCATIONS, type L } from '../../merchant/domain';
import { productPhoto, skuPhoto, productIdForSku } from '../model/media';
import { sectionHref } from '../pages';
import { dhref } from '../shell';
import { useDashState, setDashState } from '../review';
import { assistantLogStore, useWho } from '../work/state';
import { productsStore } from '../../merchant/stores';
import { canDraft, logDraft, parseQuestion, RISK_FACTOR, RISK_MIN_DAYS, RISK_MIN_ORDERS, RETURNS_MIN_SAMPLE, type Draft, type Question, type ReasonKey, type SalesAnswer } from './model';
import { useAnswers, type Answers } from './data';
import { DRAFT_TITLE, draftHref } from './text';

export const QUESTION_TEXT: Record<Question, { short: L; full: L }> = {
  sales: { short: { ar: 'المبيعات', en: 'Sales' }, full: { ar: 'لماذا تغيّر صافي المبيعات؟', en: 'Why did net sales change?' } },
  stock: { short: { ar: 'المخزون', en: 'Stock' }, full: { ar: 'ما المنتجات التي قد تنفد قريبًا؟', en: 'Which products may run out soon?' } },
  late: { short: { ar: 'التأخير', en: 'Delays' }, full: { ar: 'ما الطلبات المدفوعة المتأخرة؟', en: 'Which paid orders are late?' } },
  conversion: { short: { ar: 'التحويل', en: 'Conversion' }, full: { ar: 'كيف تغيّر معدل التحويل هذا الأسبوع؟', en: 'How did conversion change this week?' } },
  returns: { short: { ar: 'المرتجعات', en: 'Returns' }, full: { ar: 'ما وراء الاستردادات والمرتجعات؟', en: 'What is driving refunds and returns?' } },
  risk: { short: { ar: 'عملاء قد لا يعودون', en: 'At-risk customers' }, full: { ar: 'أي العملاء قد لا يعودون؟', en: 'Which customers are at risk of not returning?' } },
  restock: { short: { ar: 'إعادة التخزين', en: 'Restock' }, full: { ar: 'ماذا أعيد تخزينه أولًا؟', en: 'Which products to restock first?' } },
};
const SOURCE: Record<Question, L> = {
  sales: { ar: 'الإحصاء اليومي (الطلبات، صافي المبيعات، الزيارات) وسجل الطلبات', en: 'Daily stats (orders, net sales, visits) and the order book' },
  stock: { ar: 'مستويات المخزون لكل مستودع وسجل المبيعات لكل صنف', en: 'Stock levels per warehouse and sales history per SKU' },
  late: { ar: 'سجل الطلبات وحالات الدفع والتجهيز', en: 'The order book, payment and fulfilment states' },
  conversion: { ar: 'الزيارات اليومية والطلبات في الأيام التي فيها بيانات زيارات', en: 'Daily visits and orders on days with visit data' },
  returns: { ar: 'استردادات الطلبات ومرتجعاتها بأسبابها، واستردادات السجل المالي', en: 'Order refunds and returns with their reasons, and ledger refunds' },
  risk: { ar: 'طلبات كل عميل وتواريخها وموافقته على التواصل', en: 'Each customer’s orders, their dates and contact consent' },
  restock: { ar: 'المخزون لكل مستودع وحد التنبيه وسجل المبيعات وآخر سعر بيع', en: 'Stock per warehouse, alert levels, sales history and last selling price' },
};

export default function Assistant({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const period = route.query.get('period') === '30' ? 30 : 7;
  const a = useAnswers(period, state === 'empty');
  const q = parseQuestion(route.query.get('q'), a.role);
  const [at] = useState(() => new Date());
  const href = (p: { q?: Question; period?: number }) => dhref('assistant', { q: p.q ?? q ?? undefined, period: (p.period ?? period) === 30 ? '30' : undefined });

  const header = (
    <>
      <PageHeader title={tx('المساعد', 'Assistant')} description={tx('إجابات من بيانات متجرك، بالدليل', 'Answers from your store data, with evidence')}
        meta={<><Badge tone="gray" icon={<ShieldCheck className="size-3.5" aria-hidden="true" />}>{tx('قواعد ثابتة · بلا ذكاء اصطناعي خارجي', 'Fixed rules · no external AI')}</Badge>
          <InfoHint>{tx('كل إجابة محسوبة بقواعد مكتوبة على بيانات المتجر نفسها، فتعطي النتيجة نفسها كل مرة. لا تُرسل بياناتك لأي خدمة، ولا ينفّذ المساعد شيئًا: يقترح مسودة تراجعها وتؤكدها في أداتها.', 'Every answer is computed by written rules over the store’s own data, so it gives the same result every time. Nothing is sent to any service, and the assistant executes nothing: it proposes a draft you review and confirm in its tool.')}</InfoHint></>}
        actions={<Segmented label={tx('الفترة', 'Period')} value={String(period) as '7' | '30'} onChange={(v) => replace(href({ period: Number(v) }))}
          options={[{ value: '7', label: tx('7 أيام', '7 days') }, { value: '30', label: tx('30 يومًا', '30 days') }]} />} />
      {q && <div><Tabs label={tx('الأسئلة', 'Questions')} items={a.questions.map((x) => ({ href: href({ q: x }), label: QUESTION_TEXT[x].short[lang], current: x === q }))} /></div>}
    </>
  );

  if (!q) return <div className="space-y-6">{header}<Card><EmptyState as="h2" icon={<Bot className="size-6" />} title={tx('لا أسئلة متاحة لدورك', 'No questions for your role')}>{tx('أسئلة المساعد تقرأ المبيعات والمخزون والطلبات، وكلها خارج صلاحيات دورك.', 'The assistant reads sales, stock and orders, all outside your role.')}</EmptyState></Card></div>;
  if (state === 'loading') return (
    <div className="space-y-6" aria-busy="true">{header}
      <div className="grid gap-6 lg:grid-cols-3" role="status" aria-label="Loading">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 lg:col-span-2"><Skeleton className="h-6 w-2/3" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div><Skeleton className="h-32 w-full rounded-xl" /></div>
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-5 w-32" /><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-10 w-full rounded-xl" /></div>
      </div>
    </div>
  );
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر حساب الإجابة', 'The answer could not be computed')} onRetry={() => setDashState('live')}>
        {tx('بياناتك لم تتغير. يمكنك المتابعة يدويًا من التقارير أو الطلبات أو المخزون. المرجع SIM-AST-503.', 'Your data did not change. You can continue manually from reports, orders or inventory. Ref SIM-AST-503.')}
      </ErrorState></Card>
    </div>
  );

  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const s = a.sales;
  const periodText: Record<Question, string> = {
    sales: s.kind === 'answer' ? tx(`${fmtDay(s.range.cur[0])}–${fmtDay(s.range.cur[1])} مقابل ${fmtDay(s.range.prev[0])}–${fmtDay(s.range.prev[1])}`, `${fmtDay(s.range.cur[0])}–${fmtDay(s.range.cur[1])} vs ${fmtDay(s.range.prev[0])}–${fmtDay(s.range.prev[1])}`) : tx(`آخر ${period} أيام مكتملة`, `Last ${period} complete days`),
    stock: tx('المستويات الآن · معدل البيع من سجل كل صنف', 'Levels now · sales rate from each SKU’s history'),
    late: tx('الآن · مدفوعة منذ أكثر من 24 ساعة', 'Now · paid over 24 hours ago'),
    conversion: tx('آخر 7 أيام مكتملة مقابل السبعة قبلها', 'Last 7 complete days vs the 7 before'),
    returns: tx('طلبات آخر 30 يومًا', 'Orders from the last 30 days'),
    risk: tx('الآن · مقارنة بفاصل الشراء المعتاد لكل عميل', 'Now · against each customer’s usual buying gap'),
    restock: tx('المستويات الآن · المبيعات المهددة خلال 7 أيام', 'Levels now · sales at risk over 7 days'),
  };
  const draft = q === 'sales' ? (s.kind === 'answer' ? s.draft : null) : a[q].draft;

  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-answer">
          <CardHeader id="h-answer" title={QUESTION_TEXT[q].full[lang]} />
          <div className="space-y-5 px-5 pb-5">
            {q === 'sales' && <SalesView s={a.sales} period={period} />}
            {q === 'stock' && <StockView a={a} />}
            {q === 'late' && <LateView a={a} />}
            {q === 'conversion' && <ConversionView a={a} />}
            {q === 'returns' && <ReturnsView a={a} />}
            {q === 'risk' && <RiskView a={a} />}
            {q === 'restock' && <RestockView a={a} />}
          </div>
          <dl className="grid gap-3 border-t border-border px-5 py-4 text-xs sm:grid-cols-3">
            <div><dt className="text-subtle">{tx('الفترة', 'Period')}</dt><dd className="mt-0.5 font-medium text-fg">{periodText[q]}</dd></div>
            <div><dt className="text-subtle">{tx('المصدر', 'Source')}</dt><dd className="mt-0.5 font-medium text-fg">{SOURCE[q][lang]}</dd></div>
            <div><dt className="text-subtle">{tx('حُسبت', 'Computed')}</dt><dd className="mt-0.5 font-medium text-fg">{at.toLocaleTimeString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' })} · {tx('بيانات تجريبية للجلسة', 'demo data for this session')}</dd></div>
          </dl>
        </Card>
        <div className="space-y-6">
          <DraftCard q={q} draft={draft} role={a.role} />
          <LogCard />
        </div>
      </div>
    </div>
  );
}

function Fig({ label, cur, prev, delta, money, note, invert }: { label: string; cur: number | null; prev: number | null; delta: number | null; money?: boolean; note?: string; invert?: boolean }) {
  const tx = useTx();
  const v = (n: number | null) => (n === null ? '—' : money ? <Money v={n} /> : n.toLocaleString('en-US'));
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-fg">{v(cur)}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-subtle"><Delta v={delta} invert={invert} /><span>{tx('كان', 'was')} {v(prev)}</span></p>
      {note && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{note}</p>}
    </div>
  );
}

function SalesView({ s, period }: { s: Answers['sales']; period: number }) {
  const tx = useTx();
  if (s.kind === 'insufficient') return <EmptyState icon={<SearchX className="size-6" />} title={tx('البيانات غير كافية للمقارنة', 'Not enough data to compare')}>{tx(`نحتاج ${period * 2} يومًا مكتملة على الأقل فيها طلبات.`, `At least ${period * 2} complete days with orders are needed.`)}</EmptyState>;
  const down = s.net.cur < s.net.prev;
  const diff = s.net.cur - s.net.prev;
  return (
    <>
      <p className="text-[15px] leading-relaxed text-fg">
        {down ? tx('صافي المبيعات انخفض', 'Net sales fell') : tx('صافي المبيعات ارتفع', 'Net sales rose')} <Delta v={s.net.delta} /> · <Money v={s.net.cur} className="font-bold" /> {tx('مقابل', 'vs')} <Money v={s.net.prev} />
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fig label={tx('الطلبات', 'Orders')} cur={s.orders.cur} prev={s.orders.prev} delta={s.orders.delta} />
        <Fig label={tx('متوسط الطلب', 'Avg order')} cur={s.aov.cur} prev={s.aov.prev} delta={s.aov.delta} money />
        <Fig label={tx('الزيارات', 'Visits')} cur={s.visits.cur} prev={s.visits.prev} delta={s.visits.delta} note={s.visits.missing[0] || s.visits.missing[1] ? tx(`أيام بلا زيارات: ${s.visits.missing[0]} مقابل ${s.visits.missing[1]}`, `Days without visits: ${s.visits.missing[0]} vs ${s.visits.missing[1]}`) : undefined} />
        <Fig label={tx('التحويل %', 'Conversion %')} cur={s.visits.conversion[0]} prev={s.visits.conversion[1]} delta={s.visits.missing[0] * 7 <= 2 * s.days && s.visits.conversion[0] !== null && s.visits.conversion[1] ? Math.round(((s.visits.conversion[0] - s.visits.conversion[1]) * 1000) / s.visits.conversion[1]) / 10 : null}
          note={s.visits.missing[0] * 7 > 2 * s.days ? tx('أيام قليلة فيها زيارات؛ لا مقارنة', 'Few days with visits; no comparison') : undefined} />
      </div>
      <Effects s={s} diff={diff} />
      <Movers s={s} />
      <Alert tone="info">{tx('هذه أرقام مرتبطة بالتغيّر، لا أسباب مؤكدة. راجعها قبل أي قرار.', 'These figures move with the change; they are not proven causes. Check them before deciding.')}</Alert>
    </>
  );
}

function Effects({ s, diff }: { s: SalesAnswer; diff: number }) {
  const tx = useTx();
  const rows = [
    { label: tx('عدد الطلبات', 'Number of orders'), v: s.effects.orders },
    { label: tx('متوسط قيمة الطلب', 'Average order value'), v: s.effects.aov },
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-fg">{tx('من أين جاء الفرق؟', 'Where did the difference come from?')}
        <InfoHint>{tx('أثر الطلبات = فرق العدد × متوسط الفترة السابقة. أثر المتوسط = الباقي. مجموعهما يساوي الفرق بالضبط.', 'Orders effect = change in count × previous average. Average effect = the rest. Together they equal the difference exactly.')}</InfoHint></h3>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-[13px]">
            <span className="truncate text-muted">{r.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className={cn('block h-full rounded-full', r.v < 0 ? 'bg-red-500/70' : 'bg-emerald-500/70')} style={{ width: `${(Math.abs(r.v) * 100) / max}%` }} /></span>
            <bdi dir="ltr" className={cn('tabular-nums font-semibold', r.v < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>{r.v < 0 ? '−' : '+'}<Money v={Math.abs(r.v)} /></bdi>
          </li>
        ))}
        <li className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 border-t border-border pt-2.5 text-[13px]"><span className="font-semibold text-fg">{tx('الفرق كله', 'Total difference')}</span><span /><bdi dir="ltr" className="tabular-nums font-bold text-fg">{diff < 0 ? '−' : '+'}<Money v={Math.abs(diff)} /></bdi></li>
      </ul>
    </div>
  );
}

function Movers({ s }: { s: SalesAnswer }) {
  const tx = useTx();
  const { lang } = useLang();
  const products = productsStore.use();
  const ch: Record<string, string> = { online: tx('المتجر الإلكتروني', 'Online store'), market: tx('سوق لك', 'LAK marketplace'), app: tx('تطبيق المتجر', 'Store app') };
  const sign = (v: number) => <bdi dir="ltr" className={cn('shrink-0 tabular-nums font-semibold', v < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>{v < 0 ? '−' : '+'}<Money v={Math.abs(v)} /></bdi>;
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold text-fg">{tx('ما وراءه في سجل الطلبات', 'Behind it in the order book')}
        <InfoHint>{tx(`طلبات مدفوعة في الأيام المكتملة نفسها: ${s.book.orders[0]} مقابل ${s.book.orders[1]} طلبًا. السجل التجريبي أصغر من الإحصاء اليومي، فيُقرأ للاتجاه لا للمجموع.`, `Paid orders on the same complete days: ${s.book.orders[0]} vs ${s.book.orders[1]}. The demo order book is smaller than the daily stats, so read it for direction, not totals.`)}</InfoHint></h3>
      {s.channels.length === 0 && s.products.length === 0 ? <p className="text-sm text-muted">{tx('لا قناة أو منتج تحرّك في الاتجاه نفسه.', 'No channel or product moved the same way.')}</p> : (
        <div className="grid gap-4 sm:grid-cols-2">
          <ul className="space-y-1">
            {s.channels.map((m) => (
              <li key={m.key}><a href={sectionHref('orders', '', { ch: m.key })} className="flex items-center gap-3 rounded-xl px-2 py-2 text-[13px] hover:bg-surface-2/60">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-fg">{ch[m.key]}</span><span className="text-xs text-muted">{tx(`${m.orders} طلب في الفترة`, `${m.orders} orders in the period`)}</span></span>{sign(m.diff)}</a></li>
            ))}
          </ul>
          <ul className="space-y-1">
            {s.products.map((m) => {
              const p = products.find((x) => x.id === m.key);
              return (
                <li key={m.key}><a href={sectionHref('products', m.key)} className="flex items-center gap-3 rounded-xl px-2 py-2 text-[13px] hover:bg-surface-2/60">
                  <ProductImage src={productPhoto(m.key)} alt="" size={36} />
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{p?.name[lang] ?? m.label?.[lang] ?? m.key}</span>{sign(m.diff)}</a></li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function StockView({ a }: { a: Answers }) {
  const tx = useTx();
  const { lang } = useLang();
  const products = productsStore.use();
  const name = (sku: string) => products.find((p) => p.id === productIdForSku(sku))?.name[lang] ?? sku;
  const st = a.stock;
  if (!st.rows.length) return <EmptyState icon={<FileText className="size-6" />} title={tx('لا صنف يقترب من النفاد', 'No SKU is close to running out')}>{tx('كل الأصناف التي لها سجل مبيعات تكفي 14 يومًا أو أكثر.', 'Every SKU with sales history covers 14 days or more.')}</EmptyState>;
  return (
    <>
      <p className="text-[15px] leading-relaxed text-fg">{tx(`${st.rows.length} أصناف تكفي أقل من 14 يومًا بمعدل بيعها.`, `${st.rows.length} SKUs cover less than 14 days at their sales rate.`)}</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {st.rows.map((r) => (
          <li key={r.sku}><a href={sectionHref('inventory', '', { q: r.sku })} className="flex flex-wrap items-center gap-3 px-3 py-3 hover:bg-surface-2/60">
            <ProductImage src={skuPhoto(r.sku)} alt="" size={40} />
            <span className="min-w-0 flex-1 basis-40"><span className="block truncate text-sm font-semibold text-fg">{name(r.sku)}</span><span className="text-xs text-muted"><Ref>{r.sku}</Ref> · {tx(`الرياض ${r.byLoc.ryd} · جدة ${r.byLoc.jed} · ${r.perDay}/يوم`, `Riyadh ${r.byLoc.ryd} · Jeddah ${r.byLoc.jed} · ${r.perDay}/day`)}</span></span>
            <Badge tone={r.days <= 3 ? 'red' : 'amber'}>{tx(`يكفي ${r.days} يوم`, `${r.days} days left`)}</Badge>
            {r.lostWeek ? <span className="text-end text-xs text-muted"><Money v={r.lostWeek} className="block text-sm font-semibold text-fg" />{tx('قد تفوت خلال 7 أيام', 'at risk in 7 days')}</span> : null}
          </a></li>
        ))}
      </ul>
      {st.unknown.length > 0 && <p className="text-xs text-muted">{tx(`بلا تقدير (${st.unknown.length}): `, `No estimate (${st.unknown.length}): `)}{st.unknown.map((u) => `${u.sku} (${u.kind === 'noSales' ? tx('لا مبيعات', 'no sales') : tx('سجل أقل من 14 يومًا', 'under 14 days')})`).join('، ')}</p>}
    </>
  );
}

function LateView({ a }: { a: Answers }) {
  const tx = useTx();
  const l = a.late;
  const ch: Record<string, string> = { online: tx('المتجر', 'Store'), market: tx('السوق', 'Marketplace'), app: tx('التطبيق', 'App') };
  if (!l.count) return <EmptyState icon={<FileText className="size-6" />} title={tx('لا طلبات متأخرة', 'No late orders')}>{tx('كل الطلبات المدفوعة جُهّزت خلال 24 ساعة.', 'Every paid order was fulfilled within 24 hours.')}</EmptyState>;
  return (
    <>
      <p className="text-[15px] leading-relaxed text-fg">{tx(`${l.count} طلبًا مدفوعًا لم يُجهّز منذ أكثر من 24 ساعة، أقدمها منذ ${l.oldest} ساعة.`, `${l.count} paid orders not fulfilled for over 24 hours; the oldest for ${l.oldest} hours.`)}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">{tx('قيمتها', 'Their value')}</p><p className="mt-1 text-lg font-bold"><Money v={l.value} /></p></div>
        {l.byChannel.map((c) => <div key={c.channel} className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">{ch[c.channel]}</p><p className="mt-1 text-lg font-bold tabular-nums">{c.count}</p></div>)}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg">{tx('الأقدم أولًا', 'Oldest first')}</h3>
        <div className="flex flex-wrap gap-2">{l.refs.map((r) => <a key={r} href={sectionHref('orders', r)} className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[13px] font-medium text-fg hover:border-brand-300"><Ref>#{r}</Ref></a>)}</div>
      </div>
      <p className="text-xs text-muted">{l.alerting ? tx('مسار «طلب متأخر ينبّه الموظف» نشط.', 'The “late order alerts staff” automation is active.') : tx('لا يوجد مسار أتمتة نشط ينبّه عند التأخير.', 'No active automation alerts on delays.')}</p>
    </>
  );
}

function ConversionView({ a }: { a: Answers }) {
  const tx = useTx();
  const { lang } = useLang();
  const c = a.conversion;
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (c.kind === 'insufficient' || c.cur === null) return (
    <>
      <Alert tone="warn" title={tx('البيانات غير كافية لإجابة صادقة', 'Not enough data for an honest answer')}>
        {c.kind === 'insufficient' ? tx(`${c.missing} من آخر ${c.days} أيام بلا بيانات زيارات (${c.missingDates.map(fmt).join('، ')}). التحويل يحتاج الزيارات، فلن نقدّر رقمًا.`, `${c.missing} of the last ${c.days} days have no visit data (${c.missingDates.map(fmt).join(', ')}). Conversion needs visits, so no number is estimated.`) : tx('لا زيارات مسجلة بعد.', 'No visits recorded yet.')}
      </Alert>
      <p className="text-sm text-muted">{tx('ما نعرفه بثقة:', 'What we know for sure:')} {tx(`${c.carts} سلة متروكة مفتوحة بقيمة`, `${c.carts} open abandoned carts worth`)} <Money v={c.cartValue} />.</p>
      <LinkButton variant="secondary" size="sm" href={sectionHref('analytics', '', { period: '7' })}>{tx('افتح التقارير يدويًا', 'Open reports manually')}<ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" /></LinkButton>
    </>
  );
  return (
    <>
      <p className="text-[15px] leading-relaxed text-fg">{tx('معدل التحويل', 'Conversion')} {c.cur}% {tx('مقابل', 'vs')} {c.prev ?? '—'}% <Delta v={c.delta} /></p>
      <p className="text-sm text-muted">{tx(`${c.carts} سلة متروكة مفتوحة بقيمة`, `${c.carts} open abandoned carts worth`)} <Money v={c.cartValue} />.</p>
    </>
  );
}

const REASON: Record<ReasonKey, L> = {
  size: { ar: 'المقاس', en: 'Size' }, damaged: { ar: 'تالف', en: 'Damaged' }, described: { ar: 'لا يطابق الوصف', en: 'Not as described' },
  mind: { ar: 'غيّر رأيه', en: 'Changed mind' }, late: { ar: 'تأخر التوصيل', en: 'Late delivery' }, other: { ar: 'سبب آخر', en: 'Other reason' }, unrecorded: { ar: 'سبب غير مسجّل', en: 'No reason recorded' },
};

function ReturnsView({ a }: { a: Answers }) {
  const tx = useTx();
  const { lang } = useLang();
  const r = a.returns;
  const max = Math.max(1, ...r.reasons.map((x) => x.count));
  if (!r.affected) return <EmptyState icon={<FileText className="size-6" />} title={tx('لا استردادات أو مرتجعات في آخر 30 يومًا', 'No refunds or returns in the last 30 days')}>{tx(`من ${r.paidOrders} طلبًا مدفوعًا.`, `Out of ${r.paidOrders} paid orders.`)}</EmptyState>;
  return (
    <>
      <p className="text-[15px] leading-relaxed text-fg">{tx(`${r.affected} من ${r.paidOrders} طلبًا (${r.rate}%) فيها استرداد أو إرجاع، بقيمة`, `${r.affected} of ${r.paidOrders} orders (${r.rate}%) had a refund or a return, worth`)} <Money v={r.amount} className="font-bold" />.</p>
      {r.small && <Alert tone="warn" title={tx('العينة صغيرة', 'Small sample')}>{tx(`أقل من ${RETURNS_MIN_SAMPLE} طلبات؛ نعرض الأرقام ولا نسمّي سببًا رئيسيًا.`, `Fewer than ${RETURNS_MIN_SAMPLE} orders; we show the counts but name no main driver.`)}</Alert>}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg">{tx('حسب السبب', 'By reason')}</h3>
        <ul className="space-y-2.5">
          {r.reasons.map((x) => (
            <li key={x.key} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-[13px]">
              <span className="truncate text-muted">{REASON[x.key][lang]}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-amber-500/70" style={{ width: `${(x.count * 100) / max}%` }} /></span>
              <span className="tabular-nums font-semibold text-fg">{x.count} · <Money v={x.amount} /></span>
            </li>
          ))}
        </ul>
      </div>
      {r.products.length > 0 && (
        <div>
          <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold text-fg">{tx('حسب المنتج', 'By product')}<InfoHint>{tx('الوحدات المرتجعة أو المستردة من المباع في الطلبات نفسها.', 'Units returned or refunded out of those sold in the same orders.')}</InfoHint></h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {r.products.map((p) => (
              <li key={p.key}><a href={sectionHref('products', p.key)} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-surface-2/60">
                <ProductImage src={skuPhoto(p.sku)} alt="" size={36} />
                <span className="min-w-0 flex-1 basis-40"><span className="block truncate text-sm font-semibold text-fg">{p.label?.[lang] ?? p.sku}</span><span className="text-xs text-muted">{tx(`${p.units} من ${p.sold} وحدة`, `${p.units} of ${p.sold} units`)}{p.top ? ` · ${REASON[p.top][lang]}` : ''}</span></span>
                {p.rate !== null && <Badge tone={p.rate >= 10 ? 'red' : 'amber'}>{p.rate}%</Badge>}
              </a></li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">{r.refs.map((x) => <a key={x} href={sectionHref('orders', x)} className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[13px] font-medium text-fg hover:border-brand-300"><Ref>#{x}</Ref></a>)}</div>
    </>
  );
}

function RiskView({ a }: { a: Answers }) {
  const tx = useTx();
  const { lang } = useLang();
  const r = a.risk;
  const rule = tx(`اشترى ${RISK_MIN_ORDERS} مرات على الأقل، ومرّ على آخر طلب ضعف فاصله المعتاد (${RISK_FACTOR}×) و${RISK_MIN_DAYS} أيام على الأقل.`, `Bought ${RISK_MIN_ORDERS}+ times, and the last order is at least ${RISK_FACTOR}× their usual gap and ${RISK_MIN_DAYS}+ days ago.`);
  if (!r.count) return <EmptyState icon={<FileText className="size-6" />} title={tx('لا عملاء متأخرون عن عادتهم', 'No customer is later than usual')}>{rule}</EmptyState>;
  return (
    <>
      <p className="text-[15px] leading-relaxed text-fg">{tx(`${r.count} من ${r.eligible} عميلًا متكررًا تأخروا عن عادتهم في الشراء. طلبهم القادم المعتاد يساوي`, `${r.count} of ${r.eligible} repeat customers are later than their usual gap. Their usual next order is worth`)} <Money v={r.value} className="font-bold" />.</p>
      <p className="flex items-start gap-1 text-xs text-muted">{rule}</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {r.rows.map((c) => (
          <li key={c.id}><a href={sectionHref('customers', c.id)} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-surface-2/60">
            <span className="min-w-0 flex-1 basis-40"><span className="block truncate text-sm font-semibold text-fg">{c.name[lang]}</span><span className="text-xs text-muted">{tx(`${c.orders} طلبات · عادةً كل ${c.gapDays} يوم`, `${c.orders} orders · usually every ${c.gapDays} days`)}</span></span>
            <Badge tone={c.lastDays >= 3 * c.gapDays ? 'red' : 'amber'}>{tx(`آخر طلب قبل ${c.lastDays} يومًا`, `Last order ${c.lastDays} days ago`)}</Badge>
            {!c.reachable && <Badge tone="gray">{tx('لا موافقة تواصل', 'No contact consent')}</Badge>}
            <span className="text-end text-xs text-muted"><Money v={c.aov} className="block text-sm font-semibold text-fg" />{tx('متوسط طلبه', 'avg order')}</span>
          </a></li>
        ))}
      </ul>
      {r.count > r.rows.length && <p className="text-xs text-muted">{tx(`نعرض ${r.rows.length} من ${r.count}، الأعلى إنفاقًا أولًا.`, `Showing ${r.rows.length} of ${r.count}, highest spend first.`)}</p>}
      <p className="text-xs text-muted">{tx(`${r.reachable} منهم وافقوا على التواصل. الباقون لا تُرسل لهم رسائل.`, `${r.reachable} of them agreed to be contacted. The others are not messaged.`)}</p>
    </>
  );
}

function RestockView({ a }: { a: Answers }) {
  const tx = useTx();
  const { lang } = useLang();
  const products = productsStore.use();
  const name = (sku: string) => products.find((p) => p.id === productIdForSku(sku))?.name[lang] ?? sku;
  const r = a.restock;
  if (!r.rows.length) return <EmptyState icon={<FileText className="size-6" />} title={tx('لا صنف يحتاج إعادة تخزين الآن', 'Nothing needs restocking now')}>{tx('كل الأصناف التي لها سجل مبيعات تكفي 14 يومًا أو أكثر.', 'Every SKU with sales history covers 14 days or more.')}</EmptyState>;
  return (
    <>
      <p className="text-[15px] leading-relaxed text-fg">{tx(`${r.rows.length} أصناف مرتبة بالمبيعات المهددة خلال 7 أيام، مجموعها`, `${r.rows.length} SKUs ranked by sales at risk over 7 days, together`)} <Money v={r.atRiskValue} className="font-bold" />.</p>
      <ol className="divide-y divide-border rounded-xl border border-border">
        {r.rows.map((x, i) => (
          <li key={x.sku} className="flex flex-wrap items-center gap-3 px-3 py-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold tabular-nums text-fg">{i + 1}</span>
            <ProductImage src={skuPhoto(x.sku)} alt="" size={40} />
            <span className="min-w-0 flex-1 basis-40"><a href={sectionHref('inventory', '', { q: x.sku })} className="block truncate text-sm font-semibold text-fg hover:underline">{name(x.sku)}</a>
              <span className="text-xs text-muted"><Ref>{x.sku}</Ref> · {tx(`يكفي ${x.days} يوم · ${x.perDay}/يوم`, `${x.days} days left · ${x.perDay}/day`)}</span></span>
            <span className="flex flex-wrap items-center gap-1.5">
              {x.reorder > 0 && <Badge tone="amber" icon={<PackagePlus className="size-3.5" aria-hidden="true" />}>{tx(`اطلب ${x.reorder} من المورّد`, `Order ${x.reorder} from supplier`)}</Badge>}
              {x.transfer && <Badge tone="brand" icon={<ArrowRightLeft className="size-3.5" aria-hidden="true" />}>{tx(`انقل ${x.transfer.qty} إلى ${LOCATIONS[x.transfer.to].ar}`, `Move ${x.transfer.qty} to ${LOCATIONS[x.transfer.to].en}`)}</Badge>}
            </span>
            {x.lostWeek ? <span className="text-end text-xs text-muted"><Money v={x.lostWeek} className="block text-sm font-semibold text-fg" />{tx('مهددة خلال 7 أيام', 'at risk in 7 days')}</span> : null}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">{tx('كمية الطلب تصل بالصنف إلى 14 يومًا بمعدل بيعه. النقل بين المستودعات يسد النقص مؤقتًا ولا يغني عن الطلب.', 'The order quantity brings each SKU to 14 days at its sales rate. Moving stock covers a gap for now; it does not replace reordering.')}</p>
    </>
  );
}

function DraftCard({ q, draft, role }: { q: Question; draft: Draft | null; role: Answers['role'] }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useWho();
  const manual: Record<Question, { href: string; label: string }> = {
    sales: { href: sectionHref('analytics'), label: tx('التقارير', 'Reports') },
    stock: { href: sectionHref('inventory', '', { tab: 'low' }), label: tx('المخزون المنخفض', 'Low stock') },
    late: { href: sectionHref('orders', '', { view: 'late' }), label: tx('الطلبات المتأخرة', 'Late orders') },
    conversion: { href: sectionHref('analytics'), label: tx('التقارير', 'Reports') },
    returns: { href: sectionHref('orders', 'returns', { stage: 'all' }), label: tx('المرتجعات', 'Returns') },
    risk: { href: sectionHref('customers'), label: tx('العملاء', 'Customers') },
    restock: { href: sectionHref('inventory', '', { tab: 'low' }), label: tx('المخزون المنخفض', 'Low stock') },
  };
  const open = () => {
    if (!draft) return;
    assistantLogStore.set((l) => logDraft(l, q, draft.kind, who, Date.now()));
    navigate(draftHref(draft));
  };
  return (
    <Card aria-labelledby="h-draft">
      <CardHeader id="h-draft" title={tx('الإجراء المقترح', 'Suggested action')} hint={tx('مسودة واحدة تُفتح في أداتها معبّأة. لا يتغير شيء حتى تراجعها وتؤكدها هناك.', 'One draft that opens prefilled in its tool. Nothing changes until you review and confirm it there.')} />
      <div className="space-y-4 px-5 pb-5">
        {!draft ? (
          <p className="text-sm text-muted">{tx('لا إجراء مقترح لهذه الإجابة.', 'No action suggested for this answer.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={manual[q].href}>{manual[q].label}</a></p>
        ) : (
          <>
            <p className="text-sm font-semibold text-fg">{DRAFT_TITLE[draft.kind][lang]}</p>
            <dl className="space-y-2 rounded-xl bg-surface-2 p-3 text-[13px]">
              {draft.fields.map((f) => <div key={f.label.en} className="flex flex-wrap justify-between gap-x-3"><dt className="text-muted">{f.label[lang]}</dt><dd className="font-medium text-fg">{f.value[lang]}</dd></div>)}
            </dl>
            {canDraft(role, draft) ? (
              <>
                <Button className="w-full" onClick={open}>{tx('افتح المسودة', 'Open the draft')}<ArrowLeft className="size-4 ltr:rotate-180" aria-hidden="true" /></Button>
                <p className="flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{tx('لن يُرسل أو يُنقل أو يُفعّل شيء من هنا.', 'Nothing is sent, moved or activated from here.')}</p>
              </>
            ) : (
              <Alert tone="warn" title={tx('يحتاج صلاحية أخرى', 'Needs another permission')}>{tx('دورك لا يملك هذا الإجراء. شارك الإجابة مع المالك، أو تابع يدويًا من', 'Your role cannot do this. Share the answer with the owner, or continue manually from')} <a className="font-semibold underline" href={manual[q].href}>{manual[q].label}</a>.</Alert>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function LogCard() {
  const tx = useTx();
  const { lang } = useLang();
  const log = assistantLogStore.use();
  const time = (t: number) => new Date(t).toLocaleTimeString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <Card aria-labelledby="h-alog">
      <CardHeader id="h-alog" title={tx('مسودات فُتحت', 'Drafts opened')} />
      {log.length === 0 ? <EmptyState icon={<History className="size-6" />} title={tx('لا مسودات بعد', 'No drafts yet')} /> : (
        <ul className="divide-y divide-border">
          {log.slice(0, 6).map((r) => <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-[13px]"><span className="font-semibold text-fg">{r.who}</span><span className="min-w-0 flex-1 truncate text-muted">{DRAFT_TITLE[r.kind][lang]}</span><span className="text-xs tabular-nums text-subtle">{time(r.at)}</span></li>)}
        </ul>
      )}
    </Card>
  );
}

