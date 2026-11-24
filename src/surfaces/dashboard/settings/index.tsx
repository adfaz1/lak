// Settings (`#/dashboard/settings`): a searchable index of categories, then one page per category.
// View only: rules live in ./model.ts.
import { lazy, Suspense } from 'react';
import { ArrowLeft, Lock, Receipt, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { settingsStore, teamStore, testStore } from '../../merchant/stores';
import { verificationStore } from '../../merchant/verification-store';
import { STATUS_LABEL } from '../../merchant/verification';
import { Badge, Card, EmptyState, LinkButton, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { PageHeader, SearchInput } from '../../../ds/kit';
import { useDashState } from '../review';
import { sectionHref } from '../pages';
import { CATEGORIES, billingMatches, canOpen, categoryStatus, isCat, searchCategories, type CatId, type CatStatus } from './model';
import { FormSkeleton, ICON, NoPermission, PageError, ReviewTools, settingsHref, Frame } from './common';

const PAGES: Record<CatId, React.LazyExoticComponent<() => JSX.Element>> = {
  store: lazy(() => import('./store')),
  team: lazy(() => import('./team')),
  payments: lazy(() => import('./payments')),
  shipping: lazy(() => import('./shipping')),
  checkout: lazy(() => import('./checkout')),
  domains: lazy(() => import('./domains')),
  policies: lazy(() => import('./policies')),
  notifications: lazy(() => import('./notifications')),
  language: lazy(() => import('./language')),
  account: lazy(() => import('./account')),
  verification: lazy(() => import('./verification')),
  'order-statuses': lazy(() => import('./order-statuses')),
};

export default function Settings({ route }: { route: Route }) {
  const tx = useTx();
  const key = route.path[0];
  const role = testStore.use().role;
  const state = useDashState();
  if (!key) return <SettingsIndex route={route} />;
  if (!isCat(key)) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: settingsHref(), label: tx('الإعدادات', 'Settings') }} title={tx('صفحة غير موجودة', 'Page not found')} />
        <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا يوجد قسم إعدادات بهذا الاسم', 'No settings section has this name')}
          action={<LinkButton variant="secondary" href={settingsHref()}>{tx('كل الإعدادات', 'All settings')}</LinkButton>} /></Card>
      </div>
    );
  }
  const Page = PAGES[key];
  return (
    <Frame cat={key}>
      {!canOpen(role, key) ? <NoPermission cat={key} />
        : state === 'loading' ? <FormSkeleton />
          : state === 'error' ? <PageError what={tx('الإعدادات', 'Settings')} />
            : <Suspense fallback={<FormSkeleton />}><Page /></Suspense>}
    </Frame>
  );
}

function SettingsIndex({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = testStore.use().role;
  const s = settingsStore.use();
  const team = teamStore.use();
  const q = route.query.get('q') ?? '';
  const shown = searchCategories(q);
  const setQ = (v: string) => replace(link('/dashboard/settings', { q: v || undefined }));
  const billing = role === 'owner' || role === 'finance';
  const billingMatch = billingMatches(q);

  const header = (
    <PageHeader title={tx('الإعدادات', 'Settings')} description={tx('ابحث عن إعداد أو اختر قسمًا', 'Search for a setting or pick a section')} />
  );
  if (state === 'loading') return (
    <div className="space-y-6" aria-busy="true">{header}<Skeleton className="h-10 w-full max-w-xs rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading">{CATEGORIES.map((c) => <div key={c.id} className="flex gap-4 rounded-2xl border border-border bg-surface p-5"><Skeleton className="size-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-40" /></div></div>)}</div>
    </div>
  );
  if (state === 'error') return <div className="space-y-6">{header}<PageError what={tx('الإعدادات', 'Settings')} /></div>;

  const kyc = verificationStore.use();
  const data = { providers: s.providers, zones: s.zones, domain: s.domain, policies: s.policies, members: team.members, plan: s.plan, verification: kyc.status };
  return (
    <div className="space-y-6">
      <ReviewTools />
      {header}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={tx('مثال: مدى، نطاق، دعوة', 'e.g. Mada, domain, invite')} />
        {q && <span className="text-xs text-muted tabular-nums" aria-live="polite">{tx(`${shown.length} نتيجة`, `${shown.length} results`)}</span>}
      </div>
      {shown.length === 0 && !billingMatch ? (
        <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا إعدادات تطابق بحثك', 'No settings match your search')}
          action={<LinkButton variant="secondary" href={settingsHref()}>{tx('امسح البحث', 'Clear search')}</LinkButton>}>{tx('جرّب كلمة أقصر، أو ابحث في المساعدة.', 'Try a shorter word, or search Help.')}</EmptyState></Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const I = ICON[c.id];
            const ok = canOpen(role, c.id);
            const st = ok ? categoryStatus(c.id, data) : null;
            return (
              <li key={c.id}>
                <a href={settingsHref(c.id)} className="group flex h-full items-start gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-brand-300">
                  <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', ok ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'bg-surface-2 text-subtle')} aria-hidden="true"><I className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-fg">{c.title[lang]}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">{c.desc[lang]}</span>
                    {(st || !ok) && <span className="mt-2.5 block">{!ok ? <Badge icon={<Lock className="size-3" aria-hidden="true" />}>{tx('غير متاح لدورك', 'Not in your role')}</Badge> : <StatusBadge s={st!} />}</span>}
                  </span>
                  <ArrowLeft className="mt-1 size-4 shrink-0 text-subtle transition-colors group-hover:text-brand-600 ltr:rotate-180" aria-hidden="true" />
                </a>
              </li>
            );
          })}
          {billingMatch && (
            <li>
              <a href={sectionHref('finance', '', { tab: 'billing' })} className="group flex h-full items-start gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-brand-300">
                <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', billing ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'bg-surface-2 text-subtle')} aria-hidden="true"><Receipt className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">{tx('الخطة والفوترة', 'Plan & billing')}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{tx('في قسم المالية', 'In Finance')}</span>
                  {!billing && <span className="mt-2.5 block"><Badge icon={<Lock className="size-3" aria-hidden="true" />}>{tx('غير متاح لدورك', 'Not in your role')}</Badge></span>}
                </span>
                <ArrowLeft className="mt-1 size-4 shrink-0 text-subtle transition-colors group-hover:text-brand-600 ltr:rotate-180" aria-hidden="true" />
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

const TONE: Record<CatStatus['tone'], Tone> = { green: 'green', amber: 'amber', red: 'red', gray: 'gray' };
function StatusBadge({ s }: { s: CatStatus }) {
  const tx = useTx();
  const n = s.n ?? 0;
  const text: Record<CatStatus['code'], string> = {
    ok: n ? tx(`${n} مفعّلة`, `${n} active`) : tx('جاهز', 'Ready'),
    zones: tx(`${n} مناطق`, `${n} zones`),
    action: tx(`${n} تحتاج إجراءً`, `${n} need action`),
    pending: n ? tx(`${n} بانتظار التحقق`, `${n} awaiting verification`) : tx('بانتظار التحقق', 'Awaiting verification'),
    missing: n ? tx(`${n} غير منشورة`, `${n} not published`) : tx('لا مناطق شحن', 'No shipping zones'),
    seats: tx(`المقاعد ممتلئة (${n})`, `Seats full (${n})`),
    notConnected: tx('لا طريقة دفع مفعّلة', 'No payment method on'),
    failed: tx('فشل التحقق', 'Verification failed'),
    kyc: s.kyc ? tx(STATUS_LABEL[s.kyc].ar, STATUS_LABEL[s.kyc].en) + (s.kyc === 'verified' ? '' : tx(' · التحويلات محجوزة', ' · payouts held')) : '',
  };
  return <Badge tone={TONE[s.tone]}>{text[s.code]}</Badge>;
}
