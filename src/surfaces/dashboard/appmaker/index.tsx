// Your store app (`#/dashboard/appmaker`): the merchant designs, previews and publishes a branded shopping app
// for their customers (iOS and Android). Not an app for running the store. Builds, signing, uploads and store
// reviews are simulated; nothing reaches Apple, Google or a build server.
import { useState } from 'react';
import { ArrowUpRight, SearchX, Smartphone, Upload } from 'lucide-react';
import type { Route } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { Badge, Card, EmptyState, ErrorState, InfoHint, LinkButton, Skeleton, Button, useTx } from '../../../ds/ui';
import { Alert, Field, Modal, PageHeader, Select, Simulated, Tabs, useToast } from '../../../ds/kit';
import { PLANS, PLATFORMS, type Addon, type Plan } from '../../appmaker/domain';
import { useDashState, setDashState } from '../review';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import { sectionHref } from '../pages';
import { appAccess, eligibilityOf, parsePage, platformStatus, type PageId } from './model';
import { ah, useAppData, useS } from './parts';
import { appStore } from './state';
import Overview from './overview';
import Design from './design';
import ListingPage from './listing';
import Accounts from './accounts';
import Publish from './publish';
import { ReleaseDetail, Releases } from './releases';

export default function AppMaker({ route }: { route: Route }) {
  const tx = useTx();
  const S = useS();
  const role = useRole();
  const state = useDashState();
  const { s, plan } = useAppData();
  const { page, id, unknown } = parsePage(route.path);
  const access = appAccess(role);

  if (!access.see) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('تطبيق المتجر غير متاح لدورك', 'The store app is not available for your role')} /></div>;

  const tabLabel: Record<PageId, string> = { overview: tx('نظرة عامة', 'Overview'), design: tx('التصميم', 'Design'), listing: tx('بيانات المتجر', 'Store listing'), accounts: tx('حسابات النشر', 'Publishing accounts'), releases: tx('الإصدارات', 'Releases'), publish: tx('المراجعة والنشر', 'Review & publish') };
  const empty = state === 'empty';
  const status = PLATFORMS.map((p) => ({ p, st: platformStatus(empty ? [] : s.releases, p) }));

  const header = page === 'publish' ? (
    <PageHeader back={{ href: ah('overview'), label: tx('تطبيق متجرك', 'Your store app') }} title={tabLabel.publish}
      description={tx('ما سيُرسل، ولأي متجر، وما سيراه عملاؤك.', 'What will be submitted, to which stores, and what customers will see.')} />
  ) : (
    <>
      <PageHeader
        title={<span className="inline-flex items-center gap-1.5">{tx('تطبيق متجرك', 'Your store app')}<InfoHint>{S.notAdmin}</InfoHint></span>}
        description={tx('تطبيق تسوّق بعلامتك لعملائك على iOS وAndroid.', 'A shopping app with your brand for your customers on iOS and Android.')}
        meta={status.map(({ p, st }) => (
          <Badge key={p} tone={st.live ? 'green' : 'gray'}>{S.storeName[p]} · {st.live ? <bdi dir="ltr">{st.live.version}</bdi> : tx('غير منشور', 'Not live')}</Badge>
        ))}
        actions={access.publish
          ? <LinkButton href={ah('publish')} className="bg-brand-gradient"><Upload className="size-4" aria-hidden="true" />{tx('راجع وانشر', 'Review and publish')}</LinkButton>
          : <Locked>{tx('النشر لمالك المتجر', 'Publishing is for the store owner')}</Locked>} />
      <ReviewRole />
      <ReviewPanel plan={plan} addon={s.addon} override={s.planOverride} />
      <Tabs label={tx('أقسام تطبيق المتجر', 'Store app sections')} items={(['overview', 'design', 'listing', 'accounts', 'releases'] as PageId[]).map((t) => ({ href: ah(t), label: tabLabel[t], current: page === t }))} />
    </>
  );

  if (state === 'loading') return (
    <div className="space-y-6" aria-busy="true">{header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" role="status" aria-label={tx('جارٍ التحميل', 'Loading')}>
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        <Skeleton className="mx-auto h-[640px] w-[300px] rounded-[46px]" />
      </div>
    </div>
  );
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل تطبيق المتجر', 'Your store app could not load')} onRetry={() => setDashState('live')}>
        {tx('التطبيق المنشور يعمل كما هو لدى عملائك؛ لم يتغير شيء. المرجع SIM-APP-503.', 'The published app keeps working for your customers; nothing changed. Ref SIM-APP-503.')}
      </ErrorState></Card>
    </div>
  );

  const notFound = (title: string, back: PageId) => (
    <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={title}
      action={<LinkButton variant="secondary" href={ah(back)}>{tabLabel[back]}</LinkButton>}>{tx('ربما تغيّر الرابط أو أُعيد ضبط البيانات التجريبية.', 'The link may have changed or the demo data was reset.')}</EmptyState></Card>
  );

  return (
    <div className="space-y-6">
      {header}
      {page !== 'publish' && <EligibilityAlert canManage={access.publish} />}
      {unknown ? notFound(tx('لم نجد هذه الصفحة', 'We could not find this page'), 'overview')
        : page === 'overview' ? (empty ? <FirstRun /> : <Overview route={route} />)
        : page === 'design' ? <Design route={route} />
        : page === 'listing' ? <ListingPage route={route} />
        : page === 'accounts' ? <Accounts canManage={access.publish} />
        : page === 'publish' ? (access.publish ? <Publish route={route} empty={empty} /> : <NoAccess title={tx('النشر لمالك المتجر', 'Publishing is for the store owner')} />)
        : id ? (s.releases.some((r) => r.id === id) && !empty ? <ReleaseDetail key={id} id={id} canManage={access.publish} /> : notFound(tx('لم نجد هذا الإصدار', 'We could not find this release'), 'releases'))
        : <Releases route={route} empty={empty} />}
    </div>
  );
}

function FirstRun() {
  const tx = useTx();
  return (
    <Card>
      <EmptyState as="h2" icon={<Smartphone className="size-6" aria-hidden="true" />} title={tx('لم يُنشر تطبيقك بعد', 'Your app is not published yet')}
        action={<><LinkButton href={ah('design')}>{tx('ابدأ التصميم', 'Start designing')}</LinkButton><LinkButton variant="secondary" href={ah('listing')}>{tx('بيانات المتجر', 'Store listing')}</LinkButton></>}>
        {tx('صمّم الرئيسية والهوية وشاهدها على الهاتف، ثم أرسلها للمراجعة.', 'Design the home screen and identity, see it on the phone, then submit it for review.')}
      </EmptyState>
    </Card>
  );
}

/** Plan and add-on: designing is open to everyone, submitting needs Plus or above and the add-on. */
function EligibilityAlert({ canManage }: { canManage: boolean }) {
  const tx = useTx();
  const S = useS();
  const toast = useToast();
  const { s, plan } = useAppData();
  const [open, setOpen] = useState(false);
  const e = eligibilityOf(plan, s.addon);
  if (e.ok) return null;
  return (
    <>
      <Alert tone="warn" title={e.reason === 'plan' ? tx('باقتك لا تشمل تطبيق المتجر', 'Your plan does not include the store app') : tx('إضافة تطبيق المتجر غير مفعلة', 'The store app add-on is not active')}
        action={!canManage ? undefined : e.reason === 'plan'
          ? <LinkButton variant="secondary" size="sm" href={sectionHref('finance', '', { tab: 'billing' })}>{tx('قارن الباقات', 'Compare plans')}<ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" /></LinkButton>
          : <Button size="sm" onClick={() => setOpen(true)}>{tx('فعّل الإضافة', 'Activate add-on')}</Button>}>
        {e.reason === 'plan' ? tx(`باقتك ${S.plans[plan]}. التطبيق إضافة من Plus فأعلى. يمكنك التصميم الآن.`, `You are on ${S.plans[plan]}. The app is an add-on from Plus up. You can design now.`) : tx('يمكنك التصميم، والإرسال يحتاج الإضافة.', 'You can design; submitting needs the add-on.')}
      </Alert>
      {open && (
        <Modal title={tx('تفعيل إضافة تطبيق المتجر', 'Activate the store app add-on')} onClose={() => setOpen(false)}
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { appStore.set((x) => ({ ...x, addon: 'active' })); setOpen(false); toast({ tone: 'ok', text: tx('فُعّلت الإضافة (محاكاة)', 'Add-on activated (simulated)') }); }}>{tx('فعّل الإضافة', 'Activate add-on')}</Button></>}>
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            {[[tx('النطاق', 'Scope'), tx('هذا المتجر فقط', 'This store only')], [tx('السعر', 'Price'), tx('السعر بانتظار الاعتماد', 'Price to be approved')], [tx('الأثر', 'Effect'), tx('تستطيع إرسال تطبيقك للمراجعة', 'You can submit your app for review')]].map(([k, v]) => (
              <div key={k} className="flex gap-3 px-4 py-2.5"><dt className="w-20 shrink-0 text-muted">{k}</dt><dd className="font-medium text-fg">{v}</dd></div>
            ))}
          </dl>
          <p className="text-[13px] text-muted">{tx('لن تُحصّل أي مبالغ في هذه النسخة التجريبية.', 'Nothing is charged in this demo.')}</p>
          <Simulated />
        </Modal>
      )}
    </>
  );
}

/** Review mode only: inspect eligibility states without touching the store's real plan. */
function ReviewPanel({ plan, addon, override }: { plan: Plan; addon: Addon; override: Plan | null }) {
  const tx = useTx();
  const S = useS();
  if (!useReviewMode()) return null;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border px-3 py-2">
      <span className="w-full pb-0 text-xs font-semibold text-muted sm:w-auto sm:pb-2">{tx('مراجعة: الأهلية', 'Review: eligibility')}</span>
      <Field label={tx('الباقة', 'Plan')} className="min-w-0 flex-1 sm:w-52 sm:flex-none">{(p) => <Select {...p} className="h-9" value={override ?? ''} onChange={(e) => appStore.set((x) => ({ ...x, planOverride: (e.target.value || null) as Plan | null }))}>
        <option value="">{tx(`باقة المتجر (${S.plans[plan]})`, `Store plan (${S.plans[plan]})`)}</option>
        {PLANS.map((p) => <option key={p} value={p}>{S.plans[p]}</option>)}
      </Select>}</Field>
      <Field label={tx('الإضافة', 'Add-on')} className="min-w-0 flex-1 sm:w-40 sm:flex-none">{(p) => <Select {...p} className="h-9" value={addon} onChange={(e) => appStore.set((x) => ({ ...x, addon: e.target.value as Addon }))}>
        <option value="active">{tx('مفعلة', 'Active')}</option><option value="none">{tx('غير مفعلة', 'Not active')}</option>
      </Select>}</Field>
    </div>
  );
}
