// Overview (`#/admin`): GMV kept apart from LAK revenue, work waiting for this role, platform counters.
import type { ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, FileCheck2, Layers, Truck, Blocks, Activity, Landmark, Wallet, Repeat, CalendarRange, Store } from 'lucide-react';
import { useLang, type L } from '../../../core/lang';
import { AreaChart } from '../../../ds/charts';
import { PageHeader } from '../../../ds/kit';
import { Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, cn, useTx } from '../../../ds/ui';
import { can, gmv, PLAN_NAME, revenueSummary, SERVICES, SUBS_MONTHS, TODAY } from '../domain';
import { attention, planDistribution, platformCounters, type AttentionId } from '../model';
import { changesStore, contentStore, deliveriesStore, disputesStore, kycStore, revenueStore, storesStore } from '../state';
import { AsOf, Bars, Locked, sectionHref, Stat, StateGate, useFmt, useViewState } from '../ui';
import type { ScreenProps } from '../index';

const ITEM: Record<AttentionId, { icon: ReactNode; tint: string; title: L; why: L; cta: L; short: L }> = {
  disputes: { short: { ar: 'ابدأ بالنزاعات', en: 'Start with disputes' }, icon: <CreditCard className="size-5" />, tint: 'bg-red-500/10 text-red-600 dark:text-red-400', title: { ar: 'نزاعات واسترجاعات مفتوحة', en: 'Open disputes and chargebacks' }, why: { ar: 'الرد قبل موعد المزوّد', en: 'Respond before the provider deadline' }, cta: { ar: 'راجع', en: 'Review' } },
  plans: { short: { ar: 'اعتمد تغييرات الخطط', en: 'Decide plan changes' }, icon: <Layers className="size-5" />, tint: 'bg-brand-500/10 text-brand-600 dark:text-brand-300', title: { ar: 'تغييرات خطط بانتظار الاعتماد', en: 'Plan changes awaiting approval' }, why: { ar: 'يعتمدها دور غير المقترح', en: 'A role other than the proposer approves' }, cta: { ar: 'اعتمد أو ارفض', en: 'Decide' } },
  kyc: { short: { ar: 'راجع طلبات التجار', en: 'Review applications' }, icon: <FileCheck2 className="size-5" />, tint: 'bg-brand-500/10 text-brand-600 dark:text-brand-300', title: { ar: 'طلبات تجار بانتظار المراجعة', en: 'Merchant applications to review' }, why: { ar: 'الأقدم أولًا', en: 'Oldest first' }, cta: { ar: 'ابدأ المراجعة', en: 'Start review' } },
  payouts: { short: { ar: 'راجع التحويلات الموقوفة', en: 'Review held payouts' }, icon: <Wallet className="size-5" />, tint: 'bg-amber-500/12 text-amber-700 dark:text-amber-300', title: { ar: 'تحويلات تجار موقوفة', en: 'Merchant payouts on hold' }, why: { ar: 'راجع سبب الإيقاف', en: 'Check why each is held' }, cta: { ar: 'افتح', en: 'Open' } },
  deliveries: { short: { ar: 'عالج الشحنات', en: 'Handle deliveries' }, icon: <Truck className="size-5" />, tint: 'bg-amber-500/12 text-amber-700 dark:text-amber-300', title: { ar: 'شحنات فشل تسليمها', en: 'Failed deliveries' }, why: { ar: 'إعادة محاولة أو إرجاع', en: 'Re-attempt or return' }, cta: { ar: 'عالج', en: 'Handle' } },
  content: { short: { ar: 'راجع الثيمات والتطبيقات', en: 'Review themes & apps' }, icon: <Blocks className="size-5" />, tint: 'bg-sky-500/10 text-sky-600 dark:text-sky-300', title: { ar: 'ثيمات وتطبيقات بانتظار المراجعة', en: 'Themes and apps to review' }, why: { ar: 'الفحوص والصلاحيات قبل النشر', en: 'Checks and scopes before publishing' }, cta: { ar: 'راجع', en: 'Review' } },
  health: { short: { ar: 'افتح حالة المنصة', en: 'Open platform health' }, icon: <Activity className="size-5" />, tint: 'bg-red-500/10 text-red-600 dark:text-red-400', title: { ar: 'خدمات متراجعة أو متوقفة', en: 'Services degraded or down' }, why: { ar: 'حسب حدود مؤقتة', en: 'Against placeholder thresholds' }, cta: { ar: 'افتح الحالة', en: 'Open health' } },
};

export default function Overview({ role }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const state = useViewState();
  const empty = state === 'empty';
  const storesAll = storesStore.use();
  const stores = empty ? [] : storesAll;
  const rev = revenueStore.use();
  const sum = revenueSummary(rev);
  const kyc = kycStore.use(); const changes = changesStore.use(); const disputes = disputesStore.use(); const deliveries = deliveriesStore.use(); const content = contentStore.use();
  const work = empty ? [] : attention(role, { stores, apps: kyc, changes, disputes, deliveries, content, services: SERVICES });
  const c = platformCounters(stores, TODAY);
  const money = can(role, 'overview.money');

  const header = <PageHeader title={tx('نظرة على المنصة', 'Platform overview')} description={state === 'live' && work.length ? tx(`${work.length} أمور تنتظر دورك`, `${work.length} queues waiting for your role`) : tx('ملخص تشغيل لك', 'LAK operations at a glance')} meta={<AsOf />}
    actions={work[0] && <LinkButton href={sectionHref(work[0].section, '', work[0].query)} className="bg-brand-gradient hover:opacity-95">{ITEM[work[0].id].short[lang]}<span className="rounded-full bg-white/20 px-1.5 text-xs tabular-nums">{work[0].n}</span></LinkButton>} />;
  const gate = <StateGate state={state} header={header} what={{ ar: 'ملخص المنصة', en: 'The platform summary' }} refCode="SIM-ADM-OV-503" kind="cards" />;
  if (state === 'loading' || state === 'error') return gate;

  const dash = '—';
  return (
    <div className="space-y-6">
      {header}

      {money ? (
        <section aria-label={tx('أرقام آخر 30 يومًا', 'Last 30 days')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Stat label={tx('إجمالي مبيعات التجار (GMV)', 'Merchant sales (GMV)')} icon={<Store />} tint="from-sky-500/15 text-sky-600 dark:text-sky-300"
            hint={<InfoHint>{tx('مبيعات المتاجر عبر لك خلال 30 يومًا. هذه أموال التجار وليست إيرادًا للك.', 'Store sales through LAK over 30 days. This is merchant money, never LAK revenue.')}</InfoHint>}
            value={empty ? dash : <Money v={gmv(stores)} />} sub={tx('أموال التجار · 30 يومًا', 'Merchant funds · 30 days')} />
          <Stat label={tx('إيراد لك', 'LAK revenue')} icon={<Landmark />} tint="from-brand-500/15 text-brand-600 dark:text-brand-300"
            hint={<InfoHint>{tx('اشتراكات + إضافات + رسوم لمرة واحدة، خلال 30 يومًا. لا يشمل أي جزء من مبيعات التجار.', 'Subscriptions + add-ons + one-time fees over 30 days. Excludes every part of merchant sales.')}</InfoHint>}
            value={empty ? dash : <Money v={sum.lakRevenue30} />} sub={tx('30 يومًا', '30 days')} />
          <Stat label="MRR" icon={<Repeat />} tint="from-violet-500/15 text-violet-600 dark:text-violet-300"
            hint={<InfoHint>{tx('الاشتراكات والإضافات المتكررة شهريًا. الرسوم لمرة واحدة مستبعدة.', 'Monthly recurring subscriptions and add-ons. One-time fees excluded.')}</InfoHint>}
            value={empty ? dash : <Money v={sum.mrr} />} sub={tx('متكرر شهريًا', 'Monthly recurring')} />
          <Stat label="ARR" icon={<CalendarRange />} tint="from-emerald-500/15 text-emerald-600 dark:text-emerald-300"
            hint={<InfoHint>{tx('MRR × 12. معدل تشغيل وليس توقعًا.', 'MRR × 12. A run-rate, not a forecast.')}</InfoHint>}
            value={empty ? dash : <Money v={sum.arr} />} sub={tx('معدل سنوي', 'Annual run-rate')} />
        </section>
      ) : (
        <Card className="px-5 py-4"><Locked>{tx('الأرقام المالية مخفية لدورك. يراها المالك والمالية فقط.', 'Money figures are hidden for your role. Only Owner and Finance see them.')}</Locked></Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="ov-work">
          <CardHeader id="ov-work" title={tx('بانتظارك', 'Waiting for you')} hint={tx('مرتبة حسب الأثر: المال وقرارات التجار أولًا. لا تظهر إلا أقسام دورك.', 'Ranked by impact: money and merchant decisions first. Only your role’s sections appear.')} />
          {work.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="size-6" />} title={tx('لا شيء ينتظر دورك', 'Nothing is waiting for your role')}>{empty ? tx('لا بيانات بعد.', 'No data yet.') : tx('كل الطوابير المتاحة لك فارغة.', 'Every queue you can open is clear.')}</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {work.map((w, i) => (
                <li key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                  <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', ITEM[w.id].tint)} aria-hidden="true">{ITEM[w.id].icon}</span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="text-sm font-semibold text-fg">{ITEM[w.id].title[lang]}</p>
                    <p className="mt-0.5 text-xs text-muted">{ITEM[w.id].why[lang]}</p>
                  </div>
                  <span className="text-xl font-bold tabular-nums text-fg">{w.n}</span>
                  <LinkButton href={sectionHref(w.section, '', w.query)} variant={i === 0 ? 'primary' : 'secondary'} size="sm">{ITEM[w.id].cta[lang]}<ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" /></LinkButton>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="ov-cnt">
          <CardHeader id="ov-cnt" title={tx('المتاجر', 'Stores')} hint={tx('«نشط» = منشور وغير معلّق وفيه طلب واحد على الأقل خلال 30 يومًا.', '“Active” = published, not suspended, with at least one order in the last 30 days.')}
            action={can(role, 'stores.view') ? <a href={sectionHref('stores')} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('كل المتاجر', 'All stores')}</a> : undefined} />
          <div className="px-5 pb-5">
            <p className="text-xs text-muted">{tx('متاجر نشطة', 'Active stores')}</p>
            <p className="mt-0.5 text-3xl font-bold tracking-tight text-fg tabular-nums">{f.n(c.active)} <span className="text-base font-medium text-muted">/ {f.n(c.total)}</span></p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              {[
                [tx('قيد الإعداد', 'Onboarding'), c.onboarding], [tx('معلّقة', 'Suspended'), c.suspended],
                [tx('طلبات · 30 يومًا', 'Orders · 30 days'), c.orders30], [tx('أخطاء المتاجر · 24 س', 'Store errors · 24h'), c.errors24h],
              ].map(([k, v]) => <div key={String(k)} className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{f.n(Number(v))}</dd></div>)}
            </dl>
            <p className="mb-3 mt-5 text-xs font-medium text-muted">{tx('المتاجر حسب الخطة', 'Stores by plan')}</p>
            <Bars rows={planDistribution(stores).map((p) => ({ key: p.plan, label: <bdi>{PLAN_NAME[p.plan]}</bdi>, value: f.n(p.n), pct: p.sharePct }))} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="ov-subs">
          <CardHeader id="ov-subs" title={tx('اشتراكات جديدة شهريًا', 'New subscriptions per month')} hint={tx('آخر 4 أشهر. نوفمبر غير مكتمل.', 'Last 4 months. November is incomplete.')}
            action={can(role, 'reports.view') ? <a href={sectionHref('reports', '', { report: 'subs' })} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('التقرير', 'Report')}</a> : undefined} />
          <div className="px-5 pb-5">
            {empty ? <EmptyState title={tx('لا بيانات بعد', 'No data yet')} />
              : <AreaChart rtl={lang === 'ar'} height={180} points={SUBS_MONTHS.map((m) => ({ key: m.month, label: m.month, value: m.signups }))} format={(v) => tx(`${v} اشتراك`, `${v} sign-ups`)} />}
          </div>
        </Card>

        <Card aria-labelledby="ov-rev">
          <CardHeader id="ov-rev" title={tx('تفصيل إيراد لك', 'LAK revenue breakdown')} hint={tx('30 يومًا. مبيعات التجار خارج هذا الحساب.', '30 days. Merchant sales sit outside this book.')} />
          <div className="px-5 pb-5">
            {!money ? <Locked>{tx('مخفي لدورك.', 'Hidden for your role.')}</Locked> : empty ? <p className="text-sm text-muted">{tx('لا بيانات بعد', 'No data yet')}</p> : (
              <>
                <dl className="space-y-2.5 text-sm">
                  {[[tx('الاشتراكات', 'Subscriptions'), rev.subscriptions30], [tx('الإضافات', 'Add-ons'), rev.addons30], [tx('رسوم لمرة واحدة (خارج MRR)', 'One-time fees (not in MRR)'), rev.oneTime30]].map(([k, v]) => (
                    <div key={String(k)} className="flex items-center justify-between gap-3"><dt className="text-muted">{k}</dt><dd><Money v={Number(v)} className="font-semibold text-fg" /></dd></div>
                  ))}
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5"><dt className="font-semibold text-fg">{tx('الإجمالي', 'Total')}</dt><dd><Money v={sum.lakRevenue30} className="font-bold text-fg" /></dd></div>
                </dl>
                <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">{tx('غير محتسب: مبيعات التجار', 'Not counted: merchant sales')} <Money v={gmv(stores)} className="font-semibold text-fg" /></p>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
