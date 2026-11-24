// Merchants & stores (`#/admin/stores`, `#/admin/stores/<id>`): saved views, search, plan filter, bulk export/announce;
// detail with activity, domain, plan change (second-role approval), payout hold, supported access and suspension.
import { useEffect, useRef, useState } from 'react';
import {
  Ban, CheckCircle2, CreditCard, Database, Download, Globe, Layers, Megaphone, PackageOpen, PauseCircle, PlayCircle,
  ShieldCheck, ShoppingBag, Store as StoreIcon, Wallet,
} from 'lucide-react';
import { useLang } from '../../../core/lang';
import { navigate } from '../../../core/router';
import { Alert, BulkBar, DataTable, Field, FilterChip, Input, Modal, PageHeader, Pagination, SearchInput, Select, Simulated, Tabs, useToast, type Column } from '../../../ds/kit';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, Ref, Segmented, cn, useTx, type Tone } from '../../../ds/ui';
import { ACCESS_MINUTES, can, DATA_AS_OF, isLive, planDiff, planWarnings, PLAN_NAME, PLANS, suspensionImpact, type PlanChange, type PlanId, type Store, type StoreStatus } from '../domain';
import { entLabel, ROLE_LABEL, STORE_STATUS } from '../i18n';
import { csvName, listStores, readStoreQuery, STORE_VIEWS, storeFlags, storesCsv, type StoreFlag, type StoreView } from '../model';
import { accessStore, beginAccess, changesStore, draftForStores, holdStorePayout, logExport, proposePlan, reactivate, releaseStorePayout, storesStore, suspend } from '../state';
import { ahref, Facts, ImpactList, Locked, NoResults, NotFound, qhref, ReasonModal, SimNote, StateGate, Timeline, useFmt, useQueryNav, useViewState } from '../ui';
import type { ScreenProps } from '../index';

export const STORE_TONE: Record<StoreStatus, Tone> = { active: 'green', onboarding: 'sky', suspended: 'red' };
const DOMAIN_TONE = { verified: 'green', pending: 'amber', failed: 'red' } as const;

export function downloadCsv(name: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Stores(p: ScreenProps) {
  return p.route.path[0] ? <Detail key={p.route.path[0]} {...p} id={p.route.path[0]} /> : <List {...p} />;
}

function useStoreLabels() {
  const tx = useTx();
  return {
    view: (v: StoreView) => ({ all: tx('الكل', 'All'), active: tx('تعمل', 'Live'), onboarding: tx('قيد الإعداد', 'Onboarding'), suspended: tx('معلّقة', 'Suspended'), attention: tx('تحتاج نظرة', 'Needs a look') })[v],
    flag: (f: StoreFlag) => ({ errors: tx('أخطاء مرتفعة', 'High errors'), domain: tx('النطاق غير موثّق', 'Domain unverified'), payoutHold: tx('تحويل موقوف', 'Payout held'), tickets: tx('تذاكر دعم', 'Support tickets') })[f],
  };
}

function List({ route, role }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const L = useStoreLabels();
  const state = useViewState();
  const stored = storesStore.use();
  const stores = state === 'empty' ? [] : stored;
  const q = readStoreQuery(route.query);
  const r = listStores(stores, q);
  const go = useQueryNav('stores', route);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmExport, setConfirmExport] = useState(false);
  const scope = route.query.toString();
  const last = useRef(scope);
  useEffect(() => { if (last.current !== scope) { last.current = scope; setSel(new Set()); } }, [scope]);

  const header = <PageHeader title={tx('التجار والمتاجر', 'Merchants & stores')} description={state === 'live' && stores.length ? tx(`${f.n(stores.length)} متجرًا · ${r.counts.attention} تحتاج نظرة`, `${f.n(stores.length)} stores · ${r.counts.attention} need a look`) : undefined} />;
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'المتاجر', en: 'Stores' }} refCode="SIM-ADM-STO-503" />;
  if (stores.length === 0) return (
    <div className="space-y-6">{header}<Card><EmptyState as="h2" icon={<StoreIcon className="size-6" aria-hidden="true" />} title={tx('لا متاجر على المنصة بعد', 'No stores on the platform yet')}
      action={can(role, 'kyc.view') ? <LinkButton href={ahref('kyc')}>{tx('راجع طلبات التجار', 'Review merchant applications')}</LinkButton> : undefined}>
      {tx('يُنشأ المتجر بعد قبول طلب التاجر.', 'A store is created once a merchant application is approved.')}
    </EmptyState></Card></div>
  );

  const mayExport = can(role, 'reports.export');
  const mayAnnounce = can(role, 'announce.schedule');
  const bulk = mayExport || mayAnnounce;
  const picked = r.rows.filter((s) => sel.has(s.id));
  const onSelect = (k: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; });

  const cols: Column<Store>[] = [
    { key: 'name', header: tx('المتجر', 'Store'), cell: (s) => <span className="block max-w-72"><span className="block truncate">{s.name[lang]}</span><span className="block truncate text-xs font-normal text-muted">{s.merchant[lang]} · <Ref>{s.id}</Ref></span></span> },
    { key: 'status', header: tx('الحالة', 'Status'), cell: (s) => <Badge tone={STORE_TONE[s.status]}>{STORE_STATUS[s.status][lang]}</Badge> },
    { key: 'plan', header: tx('الخطة', 'Plan'), cell: (s) => <bdi>{PLAN_NAME[s.plan]}</bdi> },
    { key: 'city', header: tx('المدينة', 'City'), cell: (s) => <span className="text-muted">{s.city[lang]}</span>, hideBelow: 'lg' },
    { key: 'flags', header: <span className="sr-only">{tx('تنبيهات', 'Flags')}</span>, cell: (s) => <span className="flex flex-wrap gap-1">{storeFlags(s).slice(0, 2).map((fl) => <Badge key={fl} tone="amber">{L.flag(fl)}</Badge>)}</span>, hideBelow: 'md' },
    { key: 'orders', header: tx('طلبات · 30 ي', 'Orders · 30d'), align: 'end', cell: (s) => <span className="tabular-nums">{f.n(s.orders30)}</span>, hideBelow: 'lg' },
    { key: 'gmv', header: <span className="inline-flex items-center gap-1">{tx('مبيعات · 30 ي', 'GMV · 30d')}<InfoHint>{tx('أموال التجار، ليست إيراد لك.', 'Merchant funds, not LAK revenue.')}</InfoHint></span>, align: 'end', cell: (s) => <Money v={s.gmv30} className="font-semibold text-fg" /> },
  ];
  const card = (s: Store) => (
    <div>
      <div className="flex items-baseline justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold text-fg">{s.name[lang]}</p><Money v={s.gmv30} className="text-sm font-semibold text-fg" /></div>
      <p className="truncate text-xs text-muted">{s.merchant[lang]} · <bdi>{PLAN_NAME[s.plan]}</bdi> · {s.city[lang]}</p>
      <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={STORE_TONE[s.status]}>{STORE_STATUS[s.status][lang]}</Badge>{storeFlags(s).map((fl) => <Badge key={fl} tone="amber">{L.flag(fl)}</Badge>)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {header}
      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs label={tx('العروض المحفوظة', 'Saved views')} items={STORE_VIEWS.map((v) => ({ href: qhref('stores', route, { view: v === 'all' ? undefined : v, status: undefined, page: undefined }), label: L.view(v), current: q.view === v, count: r.counts[v] }))} />
        </div>
        <div className="p-4 sm:px-5">
          {sel.size > 0 && bulk ? (
            <BulkBar count={sel.size} onClear={() => setSel(new Set())} scope={tx(`في هذه الصفحة من ${r.rows.length} نتيجة`, `on this page, of ${r.rows.length} results`)}>
              {mayExport && <Button size="sm" variant="secondary" onClick={() => setConfirmExport(true)}><Download className="size-4" aria-hidden="true" />{tx('صدّر CSV', 'Export CSV')}</Button>}
              {mayAnnounce && <Button size="sm" variant="secondary" onClick={() => { draftForStores(picked.filter((s) => s.status !== 'suspended').map((s) => s.id)); navigate(ahref('announcements/new', { step: 'audience' })); }}><Megaphone className="size-4" aria-hidden="true" />{tx('أعلن لهم', 'Announce to them')}</Button>}
            </BulkBar>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex w-full sm:w-auto sm:flex-1 sm:max-w-xs"><SearchInput value={q.q} onChange={(v) => go({ q: v || undefined }, 'replace')} placeholder={tx('الاسم أو التاجر أو النطاق أو المدينة', 'Name, merchant, domain or city')} /></div>
              <FilterChip label={tx('الخطة', 'Plan')} value={q.plan} options={PLANS.map((p) => ({ value: p, label: PLAN_NAME[p] }))} onChange={(v) => go({ plan: v || undefined })} />
              {!bulk && <span className="ms-auto flex items-center gap-1 text-xs text-muted">{tx('لا إجراءات جماعية لدورك', 'No bulk actions for your role')}</span>}
            </div>
          )}
        </div>
        {r.rows.length === 0 ? (
          r.filtered ? <NoResults onClear={() => go({ q: undefined, plan: undefined })} />
            : <EmptyState icon={<CheckCircle2 className="size-6" />} title={tx(`لا متاجر في «${L.view(q.view)}»`, `No stores in “${L.view(q.view)}”`)} action={<LinkButton variant="secondary" href={ahref('stores')}>{tx('كل المتاجر', 'All stores')}</LinkButton>} />
        ) : (
          <>
            <div className="border-t border-border"><DataTable label={tx('المتاجر', 'Stores')} rows={r.pageRows} columns={cols} rowKey={(s) => s.id} href={(s) => ahref(`stores/${s.id}`)} card={card}
              selected={bulk ? sel : undefined} onSelect={bulk ? onSelect : undefined} rowClass={(s) => (s.status === 'suspended' ? 'bg-red-500/[.03]' : undefined)} /></div>
            <Pagination page={r.page} pages={r.pages} total={r.rows.length} hrefFor={(p) => qhref('stores', route, { page: String(p) })} />
          </>
        )}
      </Card>
      {confirmExport && (
        <Modal title={tx('تصدير المتاجر المحددة', 'Export selected stores')} onClose={() => setConfirmExport(false)} footer={<>
          <Button variant="secondary" onClick={() => setConfirmExport(false)}>{tx('إلغاء', 'Cancel')}</Button>
          <Button onClick={() => { downloadCsv(csvName('stores-selected', DATA_AS_OF.slice(0, 10)), storesCsv(picked, lang)); logExport('stores-selected', { ar: 'المتاجر المحددة', en: 'Selected stores' }, picked.length); toast({ tone: 'ok', text: tx('نُزّل الملف وسُجّل التصدير', 'File downloaded and export logged') }); setConfirmExport(false); setSel(new Set()); }}><Download className="size-4" aria-hidden="true" />{tx(`نزّل ${picked.length} صفًا`, `Download ${picked.length} rows`)}</Button>
        </>}>
          <p className="text-sm text-fg">{tx(`${picked.length} متجر: المعرف، الاسم، التاجر، الخطة، الحالة، المدينة، الطلبات والمبيعات لـ 30 يومًا. بلا بيانات تواصل.`, `${picked.length} stores: ID, name, merchant, plan, status, city, 30-day orders and GMV. No contact data.`)}</p>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('يُنشأ الملف في متصفحك من البيانات التجريبية ويُسجَّل التصدير.', 'The file is built in your browser from demo data and the export is logged.')}</p>
        </Modal>
      )}
    </div>
  );
}

type Dlg = 'suspend' | 'reactivate' | 'access' | 'plan' | 'hold' | 'release' | null;

function Detail({ role, id }: ScreenProps & { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const L = useStoreLabels();
  const state = useViewState();
  const store = storesStore.use().find((s) => s.id === id);
  const changes = changesStore.use();
  const sessions = accessStore.use();
  const [dlg, setDlg] = useState<Dlg>(null);
  const back = { href: ahref('stores'), label: tx('التجار والمتاجر', 'Merchants & stores') };
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={<PageHeader title={tx('متجر', 'Store')} back={back} />} what={{ ar: 'المتجر', en: 'The store' }} refCode="SIM-ADM-STO-504" kind="detail" />;
  if (!store || state === 'empty') return <NotFound back={back.href} backLabel={back.label} />;

  const now = Date.now();
  const live = sessions.find((s) => isLive(s, now)) ?? null;
  const liveHere = live && live.storeId === store.id ? live : null;
  const pending = changes.find((c) => c.storeId === store.id && c.status === 'pending');
  const mine = sessions.filter((s) => s.storeId === store.id);
  const suspended = store.status === 'suspended';
  const flags = storeFlags(store);
  const ok = (text: string) => toast({ tone: 'ok', text });
  const close = () => setDlg(null);

  const primary = can(role, 'stores.access') && !live
    ? <Button onClick={() => setDlg('access')}><ShieldCheck className="size-4" aria-hidden="true" />{tx('ابدأ وصولًا مفوّضًا', 'Start supported access')}</Button> : undefined;

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={<span className="block max-w-3xl break-words">{store.name[lang]}</span>}
        description={<>{store.merchant[lang]} · <Ref>{store.id}</Ref> · {store.category[lang]} · {store.city[lang]}</>}
        meta={<><Badge tone={STORE_TONE[store.status]}>{STORE_STATUS[store.status][lang]}</Badge><Badge tone="brand"><bdi>{PLAN_NAME[store.plan]}</bdi></Badge>{flags.map((fl) => <Badge key={fl} tone="amber">{L.flag(fl)}</Badge>)}</>}
        actions={primary} />

      {suspended && store.suspension && (
        <Alert tone="bad" title={tx('المتجر معلّق', 'Store suspended')}>
          {store.suspension.kind === 'temporary' ? tx(`مؤقت · ${store.suspension.days} يومًا`, `Temporary · ${store.suspension.days} days`) : tx('حتى إشعار آخر', 'Until further notice')} · {ROLE_LABEL[store.suspension.by][lang]} · {f.dt(store.suspension.at)}
          <span className="mt-1 block">«{store.suspension.reason}»</span>
        </Alert>
      )}
      {store.payoutHold && (
        <Alert tone="warn" title={tx('تحويل مستحقات التاجر موقوف', 'Merchant payout on hold')}>
          <Money v={store.pendingPayout} /> · {ROLE_LABEL[store.payoutHold.by][lang]} · {f.dt(store.payoutHold.at)}<span className="mt-1 block">«{store.payoutHold.reason}»</span>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {liveHere && <SupportView store={store} mode={liveHere.mode} />}

          <Card aria-labelledby="sd-act">
            <CardHeader id="sd-act" title={tx('النشاط · آخر 30 يومًا', 'Activity · last 30 days')} hint={tx('لقطة من البيانات التجريبية وليست مباشرة.', 'A demo-data snapshot, not live.')} />
            <div className="px-5 pb-5">
              <Facts cols={3} items={[
                { label: tx('المبيعات (أموال التاجر)', 'GMV (merchant funds)'), value: <Money v={store.gmv30} /> },
                { label: tx('الطلبات', 'Orders'), value: f.n(store.orders30) },
                { label: tx('الزيارات', 'Visits'), value: f.n(store.visits30) },
                { label: tx('طلبات مفتوحة', 'Open orders'), value: f.n(store.openOrders) },
                { label: tx('أخطاء · 24 س', 'Errors · 24h'), value: <span className={cn(store.errors24h >= 5 && 'text-red-700 dark:text-red-400')}>{f.n(store.errors24h)}</span> },
                { label: tx('تذاكر دعم مفتوحة', 'Open tickets'), value: f.n(store.tickets) },
              ]} />
              <p className="mt-3 text-xs text-muted">{tx('آخر طلب', 'Last order')}: {store.lastOrder ? f.d(store.lastOrder) : tx('لا طلبات بعد', 'No orders yet')} · {tx('أُنشئ', 'Created')} {f.d(store.created)}</p>
            </div>
          </Card>

          <Card aria-labelledby="sd-dom">
            <CardHeader id="sd-dom" title={tx('النطاق والإعداد', 'Domain & setup')} hint={tx('عرض فقط. إدارة DNS والتحقق والنقل تعتمد على الخادم.', 'View only. DNS, verification and transfer depend on the backend.')}
              action={<Badge tone={DOMAIN_TONE[store.domain.state]}>{({ verified: tx('موثّق', 'Verified'), pending: tx('بانتظار DNS', 'DNS pending'), failed: tx('فشل التحقق', 'Verification failed') })[store.domain.state]}</Badge>} />
            <div className="px-5 pb-5">
              <Facts items={[
                { label: store.domain.kind === 'custom' ? tx('نطاق خاص', 'Custom domain') : tx('نطاق فرعي من المنصة', 'Platform subdomain'), value: <span className="inline-flex items-center gap-1.5"><Globe className="size-3.5 text-muted" aria-hidden="true" /><Ref>{store.domain.host}</Ref></span> },
                { label: tx('عنوان المنصة', 'Platform address'), value: <Ref>{store.platformPath}</Ref> },
                { label: tx('المنتجات', 'Products'), value: f.n(store.products) },
                { label: tx('حسابات الموظفين', 'Staff accounts'), value: f.n(store.staff) },
              ]} />
            </div>
          </Card>

          <Card aria-labelledby="sd-ax">
            <CardHeader id="sd-ax" title={tx('الوصول المفوّض', 'Supported access')} hint={tx('بدل الدخول بحساب التاجر: جلسة محدودة بزمن وسبب، قراءة فقط افتراضيًا، ظاهرة في كل شاشة ومسجّلة.', 'Instead of signing in as the merchant: a session limited by time and reason, read-only by default, visible on every screen and logged.')} />
            <div className="space-y-3 px-5 pb-5">
              {!can(role, 'stores.access') ? <Locked>{tx('دورك لا يبدأ وصولًا مفوّضًا.', 'Your role cannot start supported access.')}</Locked>
                : liveHere ? <p className="text-sm text-muted">{tx('جلسة نشطة الآن على هذا المتجر.', 'A session is active on this store now.')}</p>
                  : live ? <Locked>{tx('توجد جلسة نشطة على متجر آخر. أنهِها أولًا.', 'Another session is active on a different store. End it first.')}</Locked>
                    : <Button variant="secondary" onClick={() => setDlg('access')}><ShieldCheck className="size-4" aria-hidden="true" />{tx('ابدأ وصولًا مفوّضًا', 'Start supported access')}</Button>}
            </div>
            {mine.length > 0 && <Timeline items={mine.map((s) => ({ key: s.id, when: f.dt(s.startedAt), title: `${ROLE_LABEL[s.by][lang]} · ${s.mode === 'read' ? tx('قراءة فقط', 'Read-only') : tx('قراءة وكتابة', 'Read & write')} · ${tx(`${s.minutes} دقيقة`, `${s.minutes} min`)}`, meta: isLive(s, now) ? tx('نشطة', 'Active') : s.end === 'expired' ? tx('انتهت المدة', 'Expired') : tx('أُنهيت', 'Ended'), note: s.reason }))} />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card aria-labelledby="sd-plan">
            <CardHeader id="sd-plan" title={tx('الخطة', 'Plan')} hint={tx('تغيير الخطة طلب يعتمده دور آخر غير المقترح. الأسعار بانتظار الاعتماد.', 'A plan change is a request approved by a role other than the proposer. Prices await approval.')} action={<Badge tone="brand"><bdi>{PLAN_NAME[store.plan]}</bdi></Badge>} />
            <div className="space-y-3 px-5 pb-5">
              {pending ? (
                <Alert tone="info" title={tx('تغيير بانتظار الاعتماد', 'Change awaiting approval')}>
                  <bdi>{PLAN_NAME[pending.from]} → {PLAN_NAME[pending.to]}</bdi> · {ROLE_LABEL[pending.proposedBy][lang]}{' '}
                  <a className="font-semibold underline-offset-2 hover:underline" href={ahref('plans', { tab: 'changes' })}>{tx('افتح', 'Open')}</a>
                </Alert>
              ) : can(role, 'plans.propose') ? <Button variant="secondary" className="w-full" onClick={() => setDlg('plan')}><Layers className="size-4" aria-hidden="true" />{tx('اقترح تغيير الخطة', 'Propose plan change')}</Button>
                : <Locked>{tx('دورك لا يقترح تغيير الخطط.', 'Your role cannot propose plan changes.')}</Locked>}
            </div>
          </Card>

          <Card aria-labelledby="sd-pay">
            <CardHeader id="sd-pay" title={tx('مستحقات التاجر', 'Merchant payout')} hint={tx('أموال التاجر لدى مزوّد الدفع. الإيقاف يؤجل التحويل القادم فقط ولا يحرك أي مبلغ.', 'Merchant money held by the payment provider. A hold only delays the next transfer; no money moves.')} />
            <div className="space-y-3 px-5 pb-5">
              <p className="text-xs text-muted">{tx('بانتظار التحويل', 'Pending transfer')}</p>
              <p className="-mt-2 text-2xl font-bold tabular-nums text-fg"><Money v={store.pendingPayout} /></p>
              {!can(role, 'payments.act') ? <Locked>{tx('الإيقاف والاستئناف للمالية والمالك.', 'Hold and release are for Finance and Owner.')}</Locked>
                : store.payoutHold ? <Button variant="secondary" className="w-full" onClick={() => setDlg('release')}><PlayCircle className="size-4" aria-hidden="true" />{tx('استأنف التحويل', 'Release payout')}</Button>
                  : store.pendingPayout > 0 ? <Button variant="secondary" className="w-full" onClick={() => setDlg('hold')}><PauseCircle className="size-4" aria-hidden="true" />{tx('أوقف التحويل', 'Hold payout')}</Button>
                    : <p className="text-sm text-muted">{tx('لا مستحقات معلّقة.', 'Nothing pending.')}</p>}
            </div>
          </Card>

          <Card aria-labelledby="sd-sus">
            <CardHeader id="sd-sus" title={tx('حالة المتجر', 'Store status')} />
            <div className="px-5 pb-5">
              {!can(role, 'stores.suspend') ? <Locked>{tx('دورك لا يعلّق المتاجر ولا يعيد تفعيلها.', 'Your role cannot suspend or reactivate stores.')}</Locked>
                : suspended ? <Button variant="secondary" className="w-full" onClick={() => setDlg('reactivate')}><PlayCircle className="size-4" aria-hidden="true" />{tx('أعد تفعيل المتجر', 'Reactivate store')}</Button>
                  : <Button variant="ghost" className="w-full text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400" onClick={() => setDlg('suspend')}><Ban className="size-4" aria-hidden="true" />{tx('علّق المتجر', 'Suspend store')}</Button>}
            </div>
          </Card>
        </div>
      </div>

      {dlg === 'suspend' && <SuspendDialog store={store} onClose={close} onDone={() => ok(tx(`عُلّق ${store.name.ar} (محاكاة)`, `${store.name.en} suspended (simulated)`))} />}
      {dlg === 'reactivate' && (
        <ReasonModal title={tx('إعادة تفعيل المتجر', 'Reactivate store')} confirmLabel={tx('أعد التفعيل', 'Reactivate')} onClose={close} target={<Target store={store} />}
          onConfirm={(r) => { const e = reactivate(store.id, r); if (!e) ok(tx('أُعيد تفعيل المتجر (محاكاة)', 'Store reactivated (simulated)')); return e; }}>
          <ImpactList items={[{ icon: <StoreIcon />, text: tx('تعود الواجهة وإتمام الشراء كما كانت قبل التعليق.', 'Storefront and checkout return to their state before the suspension.') }, { icon: <Database />, text: tx('البيانات محفوظة طوال التعليق.', 'Data was preserved throughout.'), tone: 'safe' }]} />
        </ReasonModal>
      )}
      {dlg === 'hold' && (
        <ReasonModal title={tx('إيقاف تحويل المستحقات', 'Hold merchant payout')} confirmLabel={tx('أوقف التحويل', 'Hold payout')} danger onClose={close} target={<Target store={store} />}
          onConfirm={(r) => { const e = holdStorePayout(store.id, r); if (!e) ok(tx('أُوقف التحويل (محاكاة)', 'Payout held (simulated)')); return e; }}>
          <ImpactList items={[
            { icon: <Wallet />, text: <>{tx('يتأجل تحويل', 'The transfer of')} <Money v={store.pendingPayout} /> {tx('حتى الاستئناف.', 'waits until released.')}</>, tone: 'warn' },
            { icon: <ShoppingBag />, text: tx('المتجر يستمر في البيع، والطلبات والاستردادات تعمل.', 'The store keeps selling; orders and refunds keep working.') },
            { icon: <Database />, text: tx('لا يُخصم ولا يُنقل أي مبلغ.', 'No money is deducted or moved.'), tone: 'safe' },
          ]} />
        </ReasonModal>
      )}
      {dlg === 'release' && (
        <ReasonModal title={tx('استئناف تحويل المستحقات', 'Release merchant payout')} confirmLabel={tx('استأنف التحويل', 'Release payout')} onClose={close} target={<Target store={store} />}
          onConfirm={(r) => { const e = releaseStorePayout(store.id, r); if (!e) ok(tx('استُؤنف التحويل (محاكاة)', 'Payout released (simulated)')); return e; }}>
          <ImpactList items={[{ icon: <Wallet />, text: <><Money v={store.pendingPayout} /> {tx('يعود إلى جدول التحويل المعتاد.', 'returns to the normal payout schedule.')}</> }]} />
        </ReasonModal>
      )}
      {dlg === 'access' && <AccessDialog role={role} store={store} onClose={close} onDone={() => ok(tx('بدأت جلسة الوصول المفوّض', 'Supported access started'))} />}
      {dlg === 'plan' && <PlanDialog store={store} onClose={close} onDone={() => ok(tx('أُرسل الطلب للاعتماد', 'Sent for approval'))} />}
    </div>
  );
}

function Target({ store }: { store: Store }) {
  const { lang } = useLang();
  return <><p className="font-semibold text-fg">{store.name[lang]}</p><p className="text-xs text-muted">{store.merchant[lang]} · <Ref>{store.id}</Ref> · <bdi>{PLAN_NAME[store.plan]}</bdi></p></>;
}

function SuspendDialog({ store, onClose, onDone }: { store: Store; onClose: () => void; onDone: () => void }) {
  const tx = useTx();
  const [kind, setKind] = useState<'temporary' | 'indefinite'>('temporary');
  const [days, setDays] = useState('7');
  const imp = suspensionImpact(store);
  return (
    <ReasonModal title={tx('تعليق المتجر', 'Suspend store')} confirmLabel={tx('علّق المتجر', 'Suspend store')} danger onClose={onClose} target={<Target store={store} />} size="lg"
      onConfirm={(r) => { const e = suspend(store.id, { kind, days: kind === 'temporary' ? Number(days) : undefined, reason: r }); if (!e) onDone(); return e; }}>
      <ImpactList items={[
        { icon: <StoreIcon />, text: tx('تتوقف واجهة المتجر ويرى العملاء صفحة «غير متاح مؤقتًا».', 'The storefront goes offline; shoppers see “temporarily unavailable”.'), tone: 'warn' },
        { icon: <CreditCard />, text: tx('يتوقف إتمام الشراء والمدفوعات الجديدة.', 'Checkout and new payments stop.'), tone: 'warn' },
        { icon: <PackageOpen />, text: tx(`${imp.openOrders} طلبًا مفتوحًا يبقى ظاهرًا للتاجر ويجب تجهيزه أو استرداده.`, `${imp.openOrders} open orders stay visible to the merchant and must still be fulfilled or refunded.`) },
        { icon: <Wallet />, text: <>{tx('مستحقات معلّقة', 'Pending payout')} <Money v={imp.pendingPayout} /> — {tx('إيقافها قرار منفصل للمالية.', 'holding it is a separate Finance decision.')}</> },
        { icon: <Database />, text: tx(`لا يُحذف شيء: ${imp.products} منتجًا والطلبات والعملاء والإعدادات محفوظة.`, `Nothing is deleted: ${imp.products} products, orders, customers and settings are kept.`), tone: 'safe' },
      ]} />
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-fg">{tx('المدة', 'Duration')}</p>
        <Segmented label={tx('المدة', 'Duration')} value={kind} onChange={setKind} options={[{ value: 'temporary', label: tx('مؤقت', 'Temporary') }, { value: 'indefinite', label: tx('حتى إشعار آخر', 'Until further notice') }]} />
      </div>
      {kind === 'temporary' && <Field label={tx('عدد الأيام (1–90)', 'Days (1–90)')}>{(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} className="max-w-32" />}</Field>}
    </ReasonModal>
  );
}

function AccessDialog({ role, store, onClose, onDone }: { role: ScreenProps['role']; store: Store; onClose: () => void; onDone: () => void }) {
  const tx = useTx();
  const [mode, setMode] = useState<'read' | 'write'>('read');
  const [minutes, setMinutes] = useState(15);
  const write = can(role, 'stores.accessWrite');
  return (
    <ReasonModal title={tx('بدء جلسة وصول مفوّض', 'Start supported access')} confirmLabel={tx('ابدأ الجلسة', 'Start session')} onClose={onClose} target={<Target store={store} />}
      reasonLabel={tx('السبب ورقم التذكرة (يُحفظ في السجل)', 'Reason and ticket number (saved to the audit log)')}
      onConfirm={(r) => { const e = beginAccess({ storeId: store.id, reason: r, minutes, mode }); if (!e) onDone(); return e; }}>
      <ImpactList items={[
        { icon: <ShieldCheck />, text: tx('ترى بيانات إدارة المتجر بصفتك دعمًا، لا بصفة التاجر. يظهر شريط الجلسة في كل شاشة.', 'You see the store admin as support, not as the merchant. A session bar shows on every screen.') },
        { icon: <Megaphone />, text: tx('يُبلَّغ التاجر بأن الدعم دخل متجره (محاكاة).', 'The merchant is told support accessed the store (simulated).') },
      ]} />
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-fg">{tx('الصلاحية', 'Access')}</p>
        <Segmented label={tx('الصلاحية', 'Access')} value={mode} onChange={(v) => { if (v === 'read' || write) setMode(v); }}
          options={[{ value: 'read', label: tx('قراءة فقط', 'Read-only') }, ...(write ? [{ value: 'write' as const, label: tx('قراءة وكتابة', 'Read & write') }] : [])]} />
        {!write && <Locked>{tx('الكتابة للمالك فقط.', 'Write mode is Owner only.')}</Locked>}
      </div>
      <Field label={tx('المدة', 'Duration')}>{(p) => <Select {...p} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="max-w-48">{ACCESS_MINUTES.map((m) => <option key={m} value={m}>{tx(`${m} دقيقة`, `${m} minutes`)}</option>)}</Select>}</Field>
    </ReasonModal>
  );
}

function PlanDialog({ store, onClose, onDone }: { store: Store; onClose: () => void; onDone: () => void }) {
  const tx = useTx();
  const [to, setTo] = useState<PlanId>(PLANS.find((p) => p !== store.plan)!);
  const [effective, setEffective] = useState<PlanChange['effective']>('renewal');
  const diff = planDiff(store.plan, to).filter((d) => d.change !== 'same');
  const warns = planWarnings(store, to);
  return (
    <ReasonModal title={tx('اقتراح تغيير الخطة', 'Propose plan change')} confirmLabel={tx('أرسل للاعتماد', 'Send for approval')} onClose={onClose} target={<Target store={store} />} size="lg"
      onConfirm={(r) => { const e = proposePlan(store.id, to, r, effective); if (!e) onDone(); return e; }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tx('الخطة الجديدة', 'New plan')}>{(p) => <Select {...p} value={to} onChange={(e) => setTo(e.target.value as PlanId)}>{PLANS.filter((p2) => p2 !== store.plan).map((p2) => <option key={p2} value={p2}>{PLAN_NAME[p2]}</option>)}</Select>}</Field>
        <Field label={tx('السريان', 'Takes effect')}>{(p) => <Select {...p} value={effective} onChange={(e) => setEffective(e.target.value as PlanChange['effective'])}>
          <option value="renewal">{tx('عند التجديد القادم', 'At next renewal')}</option><option value="now">{tx('فور الاعتماد', 'Right after approval')}</option></Select>}</Field>
      </div>
      <PlanDiff from={store.plan} to={to} rows={diff} />
      {warns.length > 0 && <PlanWarnings warns={warns} />}
      <Alert tone="info">{tx('فرق التكلفة: السعر بانتظار الاعتماد. لا تحصيل ولا استرداد. المتجر لا يتغير قبل موافقة المالية أو المالك.', 'Cost difference: price to be approved. No charge or refund. The store does not change until Finance or Owner approves.')}</Alert>
    </ReasonModal>
  );
}

export function PlanDiff({ from, to, rows }: { from: PlanId; to: PlanId; rows: ReturnType<typeof planDiff> }) {
  const tx = useTx();
  const { lang } = useLang();
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-fg">{tx('قبل / بعد', 'Before / after')} · <bdi>{PLAN_NAME[from]} → {PLAN_NAME[to]}</bdi></p>
      {rows.length === 0 ? <p className="text-sm text-muted">{tx('لا تغيير في المزايا.', 'No entitlement changes.')}</p> : (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {rows.map((d) => (
            <li key={d.feature.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 basis-40 text-fg">{d.feature.label[lang]}</span>
              <span className="text-xs text-muted"><s>{entLabel(d.before, lang)}</s> <span aria-hidden="true">{lang === 'ar' ? '←' : '→'}</span> <b className="text-fg">{entLabel(d.after, lang)}</b></span>
              <Badge tone={d.change === 'gain' ? 'green' : 'red'}>{d.change === 'gain' ? tx('يكسب', 'Gains') : tx('يفقد', 'Loses')}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export function PlanWarnings({ warns }: { warns: ReturnType<typeof planWarnings> }) {
  const tx = useTx();
  return (
    <Alert tone="warn" title={tx('يحتاج قرارًا قبل الاعتماد', 'Needs a decision before approval')}>
      <ul className="list-disc space-y-1 ps-4">
        {warns.map((w, i) => <li key={i}>{w.kind === 'staffOver'
          ? tx(`${w.count} حسابات موظفين تتجاوز الحد الجديد ${w.limit}. تبقى الحالية وتُمنع الدعوات الجديدة (سياسة للاعتماد).`, `${w.count} staff accounts exceed the new limit of ${w.limit}. Existing ones stay; new invites blocked (policy to approve).`)
          : tx(`«${w.feature!.label.ar}» مستخدمة وستُفقد. تبقى بياناتها؛ سياسة الوصول للاعتماد.`, `“${w.feature!.label.en}” is in use and would be lost. Its data stays; access policy to approve.`)}</li>)}
      </ul>
    </Alert>
  );
}

/** What support sees during an active session: masked, and read-only unless the session is write mode. */
function SupportView({ store, mode }: { store: Store; mode: 'read' | 'write' }) {
  const tx = useTx();
  const n = Number(store.id.replace(/\D/g, '')) || 1;
  const orders = [0, 1, 2].map((i) => ({ ref: `#${10_400 + ((n * 7 + i * 13) % 97)}`, cust: tx('ع••• م•••', 'A••• M•••'), amount: 15_000 + ((n + i * 31) % 40) * 1_250 }));
  return (
    <Card className="border-amber-500/40" aria-labelledby="sv-h">
      <CardHeader id="sv-h" title={<span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-amber-600" aria-hidden="true" />{tx('عرض الدعم لهذا المتجر', 'Support view of this store')}</span>}
        action={<Badge tone="amber">{mode === 'read' ? tx('قراءة فقط', 'Read-only') : tx('قراءة وكتابة', 'Read & write')}</Badge>} />
      <div className="space-y-4 px-5 pb-5">
        <div>
          <p className="mb-2 text-xs font-medium text-muted">{tx('أحدث الطلبات (مقنّعة)', 'Latest orders (masked)')}</p>
          {store.orders30 === 0 ? <p className="text-sm text-muted">{tx('لا طلبات بعد', 'No orders yet')}</p> : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {orders.map((o) => <li key={o.ref} className="flex items-center gap-3 px-3 py-2 text-sm"><Ref>{o.ref}</Ref><span className="flex-1 text-muted">{o.cust}</span><Money v={o.amount} className="font-semibold" /></li>)}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" disabled aria-describedby="sv-why">{tx('عدّل اسم المتجر', 'Edit store name')}</Button>
          <p id="sv-why" className="flex-1 text-xs text-muted">{mode === 'read' ? tx('جلسة قراءة فقط: التعديل معطّل.', 'Read-only session: editing is disabled.') : tx('الكتابة تُنسب إلى «الدعم نيابة عن التاجر» في سجل التاجر (خادم). غير محاكاة هنا.', 'Writes would be attributed to “support on behalf of merchant” in the merchant log (backend). Not simulated here.')}</p>
        </div>
        <SimNote />
      </div>
    </Card>
  );
}

