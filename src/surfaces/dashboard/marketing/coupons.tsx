// Coupons list: saved views, search, type filter, usage, conflicts and activate / pause with a preview Modal.
import { useState } from 'react';
import { AlertTriangle, Pause, Play, Sparkles, TicketPercent } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { couponsStore, logAction, ordersStore, productsStore } from '../../merchant/stores';
import type { Coupon, CouponStatus } from '../../merchant/growth';
import { Badge, Button, Card, EmptyState, InfoHint, LinkButton, Money, Ref, cn, useTx, type Tone } from '../../../ds/ui';
import { DataTable, FilterChip, Modal, SearchInput, Tabs, useToast, type Column } from '../../../ds/kit';
import {
  COUPON_VIEWS, TODAY, couponActions, couponConflicts, couponResult, couponState, couponViewCounts, filterCoupons, usagePct,
  type CouponState, type CouponView,
} from './model';
import { Locked } from './access';

const S_TONE: Record<CouponState, Tone> = { active: 'green', scheduled: 'sky', paused: 'amber', draft: 'gray', expired: 'gray', exhausted: 'red' };

export function useCouponText() {
  const tx = useTx();
  return {
    state: (s: CouponState) => ({ active: tx('نشط', 'Active'), scheduled: tx('مجدول', 'Scheduled'), paused: tx('موقوف', 'Paused'), draft: tx('مسودة', 'Draft'), expired: tx('منتهي', 'Expired'), exhausted: tx('بلغ الحد', 'Limit reached') })[s],
    type: (t: Coupon['type']) => ({ percent: tx('نسبة مئوية', 'Percentage'), fixed: tx('مبلغ ثابت', 'Fixed amount'), freeShip: tx('شحن مجاني', 'Free shipping'), bogo: tx('اشترِ واحصل', 'Buy X get Y') })[t],
    view: (v: CouponView) => ({ all: tx('الكل', 'All'), live: tx('تعمل الآن', 'Live now'), scheduled: tx('مجدولة', 'Scheduled'), drafts: tx('مسودات وموقوفة', 'Drafts & paused'), ended: tx('منتهية', 'Ended') })[v],
  };
}

export function CouponValue({ c }: { c: Coupon }) {
  const tx = useTx();
  if (c.type === 'percent') return <>{tx(`خصم ${c.value}%`, `${c.value}% off`)}</>;
  if (c.type === 'fixed') return <span className="inline-flex items-center gap-1">{tx('خصم', 'Save')} <Money v={c.value} /></span>;
  if (c.type === 'bogo' && c.bogo) return <>{c.bogo.pct === 100 ? tx(`اشترِ ${c.bogo.buy} وخذ ${c.bogo.get} مجانًا`, `Buy ${c.bogo.buy}, get ${c.bogo.get} free`) : tx(`اشترِ ${c.bogo.buy} وخذ ${c.bogo.get} بخصم ${c.bogo.pct}%`, `Buy ${c.bogo.buy}, get ${c.bogo.get} at ${c.bogo.pct}% off`)}</>;
  return <>{tx('شحن مجاني', 'Free shipping')}</>;
}

/** Scope in a few words: all items, or how many categories / products. */
export function ScopeText({ c }: { c: Coupon }) {
  const tx = useTx();
  const { lang } = useLang();
  const products = productsStore.use();
  if (!c.scope || c.scope.kind === 'all') return <>{tx('كل المنتجات', 'All items')}</>;
  const cat = (id: string) => products.find((p) => p.category.en === id)?.category[lang] ?? id;
  if (c.scope.kind === 'category') return <>{tx(`تصنيف: ${c.scope.ids.map(cat).join('، ')}`, `Category: ${c.scope.ids.map(cat).join(', ')}`)}</>;
  return <>{tx(`${c.scope.ids.length} منتجات محددة`, `${c.scope.ids.length} selected products`)}</>;
}

export default function Coupons({ route, empty, canManage }: { route: Route; empty: boolean; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const ct = useCouponText();
  const toast = useToast();
  // Single-use codes made by reminders are listed on the reminders page, not here.
  const all = couponsStore.use().filter((c) => !c.origin);
  const orders = ordersStore.use();
  const list = empty ? [] : all;
  const [confirm, setConfirm] = useState<{ c: Coupon; to: 'activate' | 'pause' } | null>(null);

  const qv = route.query.get('view') as CouponView | null;
  const view: CouponView = qv && COUPON_VIEWS.includes(qv) ? qv : 'all';
  const q = route.query.get('q') ?? '';
  const type = route.query.get('type') ?? '';
  const how = route.query.get('how') ?? '';
  const href = (p: Record<string, string | undefined>) => link('/dashboard/marketing', { view: view === 'all' ? undefined : view, q: q || undefined, type: type || undefined, how: how || undefined, ...p });
  const rows = filterCoupons(list, { view, q, type, how });
  const counts = couponViewCounts(list);
  const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dates = (c: Coupon) => <span className="whitespace-nowrap">{fmtDate(c.starts)} – {c.ends ? fmtDate(c.ends) : tx('مفتوح', 'open-ended')}</span>;
  const conds = (c: Coupon) => [
    <ScopeText key="s" c={c} />,
    c.minSpend ? <span key="m" className="inline-flex items-center gap-1">{tx('حد أدنى', 'Min.')} <Money v={c.minSpend} /></span> : tx('بلا حد أدنى', 'No minimum'),
    c.limitPerCustomer ? tx(`${c.limitPerCustomer} لكل عميل`, `${c.limitPerCustomer} per customer`) : null,
  ].filter(Boolean);

  if (list.length === 0) return (
    <Card>
      <EmptyState as="h2" icon={<TicketPercent className="size-6" aria-hidden="true" />} title={tx('لا كوبونات بعد', 'No coupons yet')}
        action={canManage ? <LinkButton href={link('/dashboard/marketing/coupons/new')}>{tx('أنشئ أول كوبون', 'Create your first coupon')}</LinkButton> : undefined}>
        {tx('أنشئ كودًا وعاين أثره على طلب مثال قبل تفعيله.', 'Create a code and preview its effect on a sample order before activating it.')}
      </EmptyState>
    </Card>
  );

  const usage = (c: Coupon) => {
    const pct = usagePct(c);
    return (
      <div className="min-w-24">
        <p className="text-sm tabular-nums text-fg">{c.used}{c.limitTotal !== null && <span className="text-muted"> / {c.limitTotal}</span>}</p>
        {pct !== null && <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-surface-2"><div className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} /></div>}
      </div>
    );
  };
  const conflictsOf = (c: Coupon) => (['expired', 'exhausted'].includes(couponState(c)) ? [] : couponConflicts(c, all));
  const action = (c: Coupon) => {
    const acts = couponActions(c);
    if (!canManage || acts.length === 0) return null;
    return acts[0] === 'pause'
      ? <Button variant="secondary" size="sm" onClick={() => setConfirm({ c, to: 'pause' })}><Pause className="size-3.5" aria-hidden="true" />{tx('أوقف', 'Pause')}</Button>
      : <Button variant="secondary" size="sm" onClick={() => setConfirm({ c, to: 'activate' })}><Play className="size-3.5" aria-hidden="true" />{tx('فعّل', 'Activate')}</Button>;
  };
  const conflictBadge = (c: Coupon) => {
    const cs = conflictsOf(c);
    return cs.length ? <Badge tone="amber" icon={<AlertTriangle className="size-3" aria-hidden="true" />}><span title={cs.map((x) => x.code).join(', ')}>{tx(`يتعارض مع ${cs.length}`, `Conflicts with ${cs.length}`)}</span></Badge> : null;
  };

  const cols: Column<Coupon>[] = [
    { key: 'code', header: tx('العرض', 'Offer'), cell: (c) => <span className="block"><span className="flex flex-wrap items-center gap-1.5 font-bold tracking-wide"><Ref>{c.code}</Ref>{c.auto && <Badge tone="brand" icon={<Sparkles className="size-3" aria-hidden="true" />}>{tx('تلقائي', 'Automatic')}</Badge>}</span><span className="mt-0.5 block text-xs font-normal text-muted"><CouponValue c={c} /></span></span> },
    { key: 'cond', header: tx('الشروط', 'Conditions'), hideBelow: 'lg', cell: (c) => <span className="flex flex-col text-[13px] text-muted">{conds(c).map((x, i) => <span key={i}>{x}</span>)}</span> },
    { key: 'use', header: tx('الاستخدام', 'Usage'), cell: usage },
    { key: 'res', header: <span className="inline-flex items-center gap-1">{tx('النتيجة', 'Result')}<InfoHint>{tx('من دفتر الطلبات: الطلبات المدفوعة التي استخدمته وإيرادها والخصم الممنوح. الاستخدامات قبل بدء الدفتر تظهر في «الاستخدام» فقط.', 'From the order book: paid orders that used it, their revenue and the discount given. Uses before the book started show in Usage only.')}</InfoHint></span>, hideBelow: 'lg', cell: (c) => { const r = couponResult(orders, c.code); return r.orders ? <span className="block text-[13px]"><span className="tabular-nums text-fg">{tx(`${r.orders} طلب`, `${r.orders} orders`)} · <Money v={r.revenue} /></span><span className="block text-xs text-muted">{tx('خصم', 'Discount')} <Money v={r.discount} /></span></span> : <span className="text-xs text-muted">{tx('لا طلبات مسجّلة', 'No recorded orders')}</span>; } },
    { key: 'dates', header: tx('الفترة', 'Schedule'), hideBelow: 'lg', cell: (c) => <span className="text-[13px] text-muted">{dates(c)}</span> },
    { key: 'st', header: tx('الحالة', 'Status'), cell: (c) => <span className="flex flex-wrap items-center gap-1.5"><Badge tone={S_TONE[couponState(c)]}>{ct.state(couponState(c))}</Badge>{conflictBadge(c)}</span> },
    { key: 'act', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', cell: action },
  ];

  const apply = () => {
    if (!confirm) return;
    const status: CouponStatus = confirm.to === 'activate' ? 'active' : 'paused';
    couponsStore.set((cs) => cs.map((x) => (x.code === confirm.c.code ? { ...x, status } : x)));
    logAction('marketing', confirm.to === 'activate' ? { ar: `فعّل العرض ${confirm.c.code}`, en: `Activated offer ${confirm.c.code}` } : { ar: `أوقف العرض ${confirm.c.code}`, en: `Paused offer ${confirm.c.code}` }, { target: confirm.c.code });
    toast({ tone: 'ok', text: confirm.to === 'activate' ? tx(`فُعّل ${confirm.c.code}`, `${confirm.c.code} activated`) : tx(`أُوقف ${confirm.c.code}`, `${confirm.c.code} paused`) });
    setConfirm(null);
  };

  return (
    <>
      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs label={tx('عروض محفوظة', 'Saved views')} items={COUPON_VIEWS.map((v) => ({ href: href({ view: v === 'all' ? undefined : v }), label: ct.view(v), current: v === view, count: counts[v] }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
          <SearchInput value={q} onChange={(v) => replace(href({ q: v || undefined }))} placeholder={tx('ابحث بالكود', 'Search by code')} />
          <FilterChip label={tx('النوع', 'Type')} value={type} onChange={(v) => replace(href({ type: v || undefined }))}
            options={(['percent', 'fixed', 'freeShip', 'bogo'] as const).map((t) => ({ value: t, label: ct.type(t) }))} />
          <FilterChip label={tx('الطريقة', 'How')} value={how} onChange={(v) => replace(href({ how: v || undefined }))}
            options={[{ value: 'code', label: tx('كود', 'Code') }, { value: 'auto', label: tx('تلقائي', 'Automatic') }]} />
          <span className="ms-auto hidden items-center gap-1 text-xs text-muted sm:flex">{tx('عرض واحد لكل طلب', 'One offer per order')}<InfoHint>{tx('العروض لا تتراكم: الكود الذي يكتبه العميل يحل محل العرض التلقائي، وإن انطبق أكثر من عرض تلقائي يُطبَّق الأفضل للعميل.', 'Offers do not stack: a typed code replaces the automatic offer, and if several automatic offers apply the best one for the customer wins.')}</InfoHint></span>
        </div>
        {rows.length === 0 ? (
          <EmptyState title={tx('لا كوبونات مطابقة', 'No matching coupons')} action={<LinkButton variant="secondary" href={link('/dashboard/marketing')}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton>} />
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('الكوبونات', 'Coupons')} rows={rows} columns={cols} rowKey={(c) => c.code} href={(c) => link(`/dashboard/marketing/coupons/${c.code}`)}
              card={(c) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold text-fg"><Ref>{c.code}</Ref></span><Badge tone={S_TONE[couponState(c)]}>{ct.state(couponState(c))}</Badge></div>
                  <p className="text-[13px] text-muted"><CouponValue c={c} /> · {tx('استُخدم', 'Used')} <bdi className="tabular-nums">{c.used}{c.limitTotal !== null ? ` / ${c.limitTotal}` : ''}</bdi></p>
                  <p className="text-xs text-muted">{dates(c)}</p>
                  {conflictBadge(c)}
                </div>
              )} />
            <p className="border-t border-border px-4 py-3 text-xs text-muted tabular-nums sm:px-5">{tx(`${rows.length} من ${list.length} كوبون · اليوم ${TODAY}`, `${rows.length} of ${list.length} coupons · today ${TODAY}`)}</p>
          </div>
        )}
        {!canManage && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك يعرض الكوبونات فقط.', 'Your role can only view coupons.')}</Locked></p>}
      </Card>

      {confirm && (
        <Modal title={confirm.to === 'activate' ? tx(`تفعيل ${confirm.c.code}`, `Activate ${confirm.c.code}`) : tx(`إيقاف ${confirm.c.code}`, `Pause ${confirm.c.code}`)} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={apply}>{confirm.to === 'activate' ? tx('فعّل الكوبون', 'Activate coupon') : tx('أوقف الكوبون', 'Pause coupon')}</Button></>}>
          {confirm.to === 'activate' ? (
            <>
              <ul className="space-y-1.5 text-sm text-fg">
                <li>{confirm.c.auto
                  ? (confirm.c.starts > TODAY ? tx(`يُطبَّق تلقائيًا في سلة المتجر من ${confirm.c.starts} على كل سلة تحقق شروطه.`, `Applies automatically in the store bag from ${confirm.c.starts} to every basket that meets it.`) : tx('يُطبَّق تلقائيًا في سلة المتجر فورًا على كل سلة تحقق شروطه.', 'Applies automatically in the store bag now, to every basket that meets it.'))
                  : (confirm.c.starts > TODAY ? tx(`يُقبل عند الدفع من ${confirm.c.starts} في كل القنوات.`, `Accepted at checkout from ${confirm.c.starts} in every channel.`) : tx('يُقبل عند الدفع فورًا في كل القنوات.', 'Accepted at checkout immediately in every channel.'))}</li>
                <li><CouponValue c={confirm.c} /> · <ScopeText c={confirm.c} /></li>
                <li>{tx('لا يُرسل للعملاء تلقائيًا.', 'It is not sent to customers automatically.')}</li>
              </ul>
              {couponConflicts(confirm.c, all).length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                  {tx('يتنافس مع: ', 'Competes with: ')}<Ref>{couponConflicts(confirm.c, all).map((x) => x.code).join(', ')}</Ref>
                </div>
              )}
            </>
          ) : (
            <ul className="space-y-1.5 text-sm text-fg">
              <li>{tx('يتوقف قبول الكود في الطلبات الجديدة.', 'The code stops working for new orders.')}</li>
              <li>{tx('الطلبات التي استخدمته تبقى كما هي.', 'Orders that already used it stay unchanged.')}</li>
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
