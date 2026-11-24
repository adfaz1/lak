// Apps (`#/dashboard/apps`): demo catalogue with connection states, permissions and data scopes (personal data flagged).
// `#/dashboard/apps/<id>`: connect / re-authorise / retry / disconnect, each with an impact Modal. Plan limits are
// shown apart from permission limits. Every connection is simulated and reaches no external service.
import { useState, type ReactNode } from 'react';
import { Blocks, ShieldAlert, KeyRound, RefreshCw, Unplug, Plug, SearchX, Lock, CreditCard, ArrowLeft, CircleCheck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { canSee } from '../../merchant/perms';
import { appsStore, settingsStore } from '../../merchant/stores';
import type { Plan } from '../../merchant/finance';
import type { App, AppState, Scope } from '../../merchant/workspace';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LinkButton, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, FilterChip, Modal, PageHeader, SearchInput, Simulated, Tabs, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { sectionHref } from '../pages';
import { NoAccess, ReviewRole, roleName, useRole } from '../marketing/access';
import { CAUSES, currentCause, failingSince, lastOk, logFor, runAction, type Cause, type SyncEntry } from './model';
import { appsSimStore, syncLogStore } from './state';
import { useReviewMode } from '../../../core/review';
import { logAction } from '../../merchant/stores';
import { Select } from '../../../ds/kit';
import { APP_VIEWS, actionsFor, categories, filterApps, isPersonal, isWrite, limits, needsAttention, personalScopes, viewCounts, type AppAction, type AppView } from './model';

const S_TONE: Record<AppState, Tone> = { not_connected: 'gray', connected: 'green', reauth: 'amber', error: 'red' };
const hrefA = (path = '', q?: Record<string, string | undefined>) => link(`/dashboard/apps${path ? `/${path}` : ''}`, q);

function useNames() {
  const tx = useTx();
  return {
    state: (s: AppState) => ({ not_connected: tx('غير مربوط', 'Not connected'), connected: tx('مربوط', 'Connected'), reauth: tx('يحتاج تجديد التفويض', 'Needs re-authorisation'), error: tx('المزامنة تفشل', 'Sync failing') })[s],
    scope: (s: Scope) => ({ 'orders.read': tx('قراءة الطلبات', 'Read orders'), 'orders.write': tx('تعديل حالة الطلبات', 'Update order status'), 'customers.read': tx('قراءة بيانات العملاء: أسماء ووسائل تواصل', 'Read customer data: names and contact details'), 'products.read': tx('قراءة المنتجات', 'Read products'), 'products.write': tx('تعديل المنتجات', 'Edit products'), 'inventory.read': tx('قراءة المخزون', 'Read inventory'), 'messages.send': tx('إرسال رسائل للعملاء باسم متجرك', 'Send messages to customers as your store') })[s],
    view: (v: AppView) => ({ all: tx('الكل', 'All'), connected: tx('مربوطة', 'Connected'), attention: tx('تحتاج انتباهك', 'Needs attention'), available: tx('غير مربوطة', 'Not connected') })[v],
    plan: (p: Plan) => ({ basic: tx('الأساسية', 'Basic'), plus: tx('بلس', 'Plus'), pro: tx('برو', 'Pro'), special: tx('خاصة', 'Special') })[p],
  };
}

export default function Apps({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  if (!canSee(role, 'apps')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('التطبيقات غير متاحة لدورك', 'Apps are not available for your role')} /></div>;
  return route.path[0] ? <Detail id={route.path[0]} /> : <Catalogue route={route} />;
}

function AppMark({ a, size = 'md' }: { a: App; size?: 'md' | 'lg' }) {
  const { lang } = useLang();
  return <span className={cn('grid shrink-0 place-items-center rounded-xl bg-gradient-to-b from-brand-500/15 to-sky-500/10 font-bold text-brand-700 dark:text-brand-300', size === 'lg' ? 'size-14 text-xl' : 'size-11 text-base')} aria-hidden="true">{a.name[lang].replace(/^[^A-Za-z؀-ۿ]+/, '').slice(0, 1)}</span>;
}

function Catalogue({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const state = useDashState();
  const all = appsStore.use();
  const plan = settingsStore.use().plan;
  const role = useRole();
  const apps = state === 'empty' ? [] : all;
  const qv = route.query.get('view') as AppView | null;
  const view: AppView = qv && APP_VIEWS.includes(qv) ? qv : 'all';
  const q = route.query.get('q') ?? '';
  const cat = route.query.get('category') ?? '';
  const href = (p: Record<string, string | undefined>) => hrefA('', { view: view === 'all' ? undefined : view, q: q || undefined, category: cat || undefined, ...p });
  const shown = filterApps(apps, { view, q, category: cat });
  const counts = viewCounts(apps);
  const attention = needsAttention(apps);
  const log = syncLogStore.use();

  const header = (
    <>
      <PageHeader title={tx('التطبيقات', 'Apps')} description={tx('كتالوج تجريبي · كل ربط محاكاة', 'Demo catalogue · every connection is simulated')}
        actions={state === 'live' && attention.length > 0 ? <LinkButton href={hrefA(attention[0].id)}>{tx(`راجع ${attention.length} تحتاج انتباهك`, `Review ${attention.length} needing attention`)}</LinkButton> : undefined} />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return (
    <div className="space-y-6" aria-busy="true">{header}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-5"><div className="flex gap-3"><Skeleton className="size-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div><Skeleton className="h-3 w-full" /><Skeleton className="h-6 w-24 rounded-full" /></div>)}</div>
    </div>
  );
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل التطبيقات', 'Apps could not load')} onRetry={() => setDashState('live')}>
        {tx('التطبيقات المربوطة تواصل المزامنة؛ تعذّر عرضها فقط. المرجع SIM-APPS-503.', 'Connected apps keep syncing; only this view failed. Ref SIM-APPS-503.')}
      </ErrorState></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {header}
      {apps.length === 0 ? (
        <Card><EmptyState as="h2" icon={<Blocks className="size-6" aria-hidden="true" />} title={tx('لا تطبيقات في الكتالوج', 'No apps in the catalogue')}>{tx('ستظهر هنا التطبيقات المعتمدة من «لك» حين تتوفر.', 'Apps approved by LAK will appear here when available.')}</EmptyState></Card>
      ) : (
        <>
          <div className="space-y-4">
            <Tabs label={tx('حالة الربط', 'Connection state')} items={APP_VIEWS.map((v) => ({ href: href({ view: v === 'all' ? undefined : v }), label: n.view(v), current: v === view, count: counts[v] }))} />
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={q} onChange={(v) => replace(href({ q: v || undefined }))} placeholder={tx('ابحث في التطبيقات', 'Search apps')} />
              <FilterChip label={tx('الفئة', 'Category')} value={cat} onChange={(v) => replace(href({ category: v || undefined }))} options={categories(apps).map((c) => ({ value: c.en, label: c[lang] }))} />
            </div>
          </div>
          {shown.length === 0 ? (
            <Card><EmptyState title={tx('لا تطبيقات مطابقة', 'No matching apps')} action={<LinkButton variant="secondary" href={hrefA()}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton>} /></Card>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((a) => {
                const lim = limits(a, plan, role);
                const personal = personalScopes(a).length;
                return (
                  <li key={a.id}>
                    <a href={hrefA(a.id)} className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-brand-300">
                      <span className="flex items-start gap-3">
                        <AppMark a={a} />
                        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-fg">{a.name[lang]}</span><span className="block text-xs text-muted">{a.category[lang]}</span></span>
                      </span>
                      <span className="mt-3 flex-1 text-[13px] leading-relaxed text-muted">{a.desc[lang]}</span>
                      <SyncLine a={a} log={log} />
                      <span className="mt-4 flex flex-wrap gap-1.5">
                        <Badge tone={S_TONE[a.state]}>{n.state(a.state)}</Badge>
                        {personal > 0 && <Badge tone="amber" icon={<ShieldAlert className="size-3" aria-hidden="true" />}>{tx('بيانات شخصية', 'Personal data')}</Badge>}
                        {!lim.inPlan && <Badge tone="sky" icon={<CreditCard className="size-3" aria-hidden="true" />}>{tx(`باقة ${n.plan(a.minPlan)}`, `${n.plan(a.minPlan)} plan`)}</Badge>}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Detail({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const toast = useToast();
  const role = useRole();
  const apps = appsStore.use();
  const plan = settingsStore.use().plan;
  const [dlg, setDlg] = useState<AppAction | null>(null);
  const [busy, setBusy] = useState<AppAction | null>(null);
  const log = syncLogStore.use();
  const sim = appsSimStore.use();
  const review = useReviewMode();
  const a = apps.find((x) => x.id === id);
  const back = { href: hrefA(), label: tx('التطبيقات', 'Apps') };
  if (!a) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('تطبيق غير موجود', 'App not found')} />
      <Card><EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا يوجد تطبيق بهذا المعرف', 'No app with this id')} action={<LinkButton variant="secondary" href={hrefA()}>{tx('كل التطبيقات', 'All apps')}</LinkButton>}><bdi dir="ltr">{id}</bdi></EmptyState></Card>
    </div>
  );
  const lim = limits(a, plan, role);
  const acts = actionsFor(a);
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const personal = personalScopes(a);
  const cause = currentCause(log, a.id);
  const since = failingSince(log, a.id);
  const ok = lastOk(log, a.id);
  const run = (act: AppAction) => {
    setDlg(null);
    setBusy(act);
    window.setTimeout(() => {
      const fail = act === 'disconnect' ? null : sim.failNext;
      const r = runAction(appsStore.get(), syncLogStore.get(), a.id, act, new Date().toISOString(), fail);
      appsStore.set(r.apps);
      syncLogStore.set((l) => [r.entry, ...l]);
      if (fail) appsSimStore.set({ failNext: null });
      setBusy(null);
      logAction('apps', { ar: `${label[act]}: ${a.name.ar}${r.entry.ok ? '' : ' (فشل)'}`, en: `${label[act]}: ${a.name.en}${r.entry.ok ? '' : ' (failed)'}` }, { target: a.id, ...(r.entry.ref ? { after: r.entry.ref } : {}) });
      if (!r.entry.ok) toast({ tone: 'bad', text: tx(`فشل: ${CAUSES[r.entry.cause!].text.ar}`, `Failed: ${CAUSES[r.entry.cause!].text.en}`) });
      else toast({ tone: 'ok', text: act === 'disconnect' ? tx(`فُصل ${a.name.ar}`, `${a.name.en} disconnected`) : act === 'sync' || act === 'retry' ? tx(`تمت المزامنة: ${r.entry.records} سجل (محاكاة)`, `Synced ${r.entry.records} records (simulated)`) : tx(`${a.name.ar} مربوط (محاكاة)`, `${a.name.en} connected (simulated)`) });
    }, 700);
  };
  const label: Record<AppAction, string> = { connect: tx('اربط', 'Connect'), reauth: tx('جدّد التفويض', 'Re-authorise'), retry: tx('أعد المزامنة', 'Retry sync'), disconnect: tx('افصل', 'Disconnect'), sync: tx('زامن الآن', 'Sync now') };
  const icon: Record<AppAction, ReactNode> = { connect: <Plug className="size-4" aria-hidden="true" />, reauth: <KeyRound className="size-4" aria-hidden="true" />, retry: <RefreshCw className="size-4" aria-hidden="true" />, disconnect: <Unplug className="size-4" aria-hidden="true" />, sync: <RefreshCw className="size-4" aria-hidden="true" /> };
  const fixAct = cause?.cause ? CAUSES[cause.cause].fix : null;

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={<span className="flex items-center gap-3"><AppMark a={a} size="lg" />{a.name[lang]}</span>} description={a.desc[lang]}
        meta={<><Badge tone={S_TONE[a.state]}>{n.state(a.state)}</Badge><Badge tone="gray">{a.category[lang]}</Badge><Simulated /></>}
        actions={!lim.blockedBy ? <>{a.state === 'connected' && <Button variant="secondary" disabled={!!busy} onClick={() => run('sync')}>{icon.sync}{busy === 'sync' ? tx('جارٍ المزامنة…', 'Syncing…') : label.sync}</Button>}{acts.map((x, i) => <Button key={x} disabled={!!busy} variant={i === 0 && x !== 'disconnect' && !fixAct ? 'primary' : 'secondary'} onClick={() => setDlg(x)}>{icon[x]}{busy === x ? tx('جارٍ…', 'Working…') : label[x]}</Button>)}</> : undefined} />

      {(a.state === 'error' || a.state === 'reauth') && (
        <Alert tone={a.state === 'error' ? 'bad' : 'warn'} title={a.state === 'error' ? tx(`المزامنة تفشل${since ? ` منذ ${when(since)}` : ''}`, `Sync failing${since ? ` since ${when(since)}` : ''}`) : tx('انتهى التفويض', 'Authorisation expired')}
          action={!lim.blockedBy && fixAct ? <Button size="sm" disabled={!!busy} onClick={() => setDlg(fixAct)}>{icon[fixAct]}{CAUSES[cause!.cause!].fixLabel[lang]}</Button> : undefined}>
          {(cause?.cause ? CAUSES[cause.cause].text : CAUSES[a.state === 'reauth' ? 'auth_expired' : 'invalid_file'].text)[lang]}{cause?.ref && <> {tx('المرجع', 'Ref')} <bdi dir="ltr">{cause.ref}</bdi>.</>}
        </Alert>
      )}
      {review && a.state !== 'not_connected' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted">
          <span className="font-semibold">{tx('مراجعة: الإجراء التالي', 'Review: next action')}</span>
          <Select aria-label={tx('نتيجة الإجراء التالي', 'Next action outcome')} className="h-8 w-auto" value={sim.failNext ?? ''} onChange={(e) => appsSimStore.set({ failNext: (e.target.value || null) as Cause | null })}>
            <option value="">{tx('ينجح', 'Succeeds')}</option>{(Object.keys(CAUSES) as Cause[]).map((c) => <option key={c} value={c}>{tx('يفشل: ', 'Fails: ')}{c}</option>)}
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-scopes">
          <CardHeader id="h-scopes" title={tx('الصلاحيات والبيانات', 'Permissions and data')} hint={tx('ما يستطيع التطبيق قراءته أو تغييره في متجرك عند ربطه.', 'What the app can read or change in your store once connected.')} />
          <ul className="divide-y divide-border border-t border-border">
            {a.scopes.map((s) => (
              <li key={s} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
                <span className="min-w-0 flex-1 text-sm text-fg">{n.scope(s)}</span>
                <Badge tone={isWrite(s) ? 'brand' : 'gray'}>{isWrite(s) ? tx('كتابة', 'Write') : tx('قراءة', 'Read')}</Badge>
                {isPersonal(s) && <Badge tone="amber" icon={<ShieldAlert className="size-3" aria-hidden="true" />}>{tx('بيانات شخصية', 'Personal data')}</Badge>}
              </li>
            ))}
          </ul>
          {personal.length > 0 && <p className="border-t border-border px-5 py-3 text-[13px] text-muted">{tx('يعالج التطبيق بيانات عملائك وفق شروطه هو. راجعها قبل الربط.', 'The app processes your customers’ data under its own terms. Review them before connecting.')}</p>}
        </Card>

        <div className="space-y-6">
          <Card aria-labelledby="h-conn">
            <CardHeader id="h-conn" title={tx('الربط', 'Connection')} />
            <dl className="space-y-2 px-5 pb-5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">{tx('الحالة', 'State')}</dt><dd><Badge tone={S_TONE[a.state]}>{n.state(a.state)}</Badge></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">{tx('آخر مزامنة ناجحة', 'Last successful sync')}</dt><dd className="text-fg tabular-nums">{ok ? when(ok.at) : a.lastSync ? a.lastSync[lang] : '—'}</dd></div>
              {cause && <div className="flex justify-between gap-3"><dt className="text-muted">{tx('آخر محاولة', 'Last attempt')}</dt><dd className="text-red-700 tabular-nums dark:text-red-400">{when(cause.at)}</dd></div>}
            </dl>
          </Card>

          <Card aria-labelledby="h-lim">
            <CardHeader id="h-lim" title={tx('الحدود', 'Limits')} hint={tx('حد الباقة يحدد إن كان متجرك يستطيع استخدام التطبيق. صلاحية الدور تحدد من يستطيع ربطه. هما أمران مختلفان.', 'The plan limit decides whether your store can use the app. The role permission decides who can connect it. They are different things.')} />
            <ul className="space-y-3 px-5 pb-5">
              <Limit ok={lim.inPlan} icon={<CreditCard className="size-4" aria-hidden="true" />} title={tx('حد الباقة', 'Plan limit')}
                text={lim.inPlan ? tx(`متاح في باقتك (${n.plan(plan)})`, `Included in your plan (${n.plan(plan)})`) : tx(`يتطلب باقة ${n.plan(a.minPlan)} أو أعلى؛ باقتك ${n.plan(plan)}`, `Requires ${n.plan(a.minPlan)} or higher; your plan is ${n.plan(plan)}`)}
                action={!lim.inPlan ? <a href={sectionHref('finance', '', { tab: 'billing' })} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('قارن الباقات', 'Compare plans')}<ArrowLeft className="ms-1 inline size-3.5 ltr:rotate-180" aria-hidden="true" /></a> : undefined} />
              <Limit ok={lim.permitted} icon={<Lock className="size-4" aria-hidden="true" />} title={tx('صلاحية الدور', 'Role permission')}
                text={lim.permitted ? tx(`دورك (${roleName(role, tx)}) يستطيع إدارة التطبيقات`, `Your role (${roleName(role, tx)}) can manage apps`) : tx('إدارة التطبيقات للمالك فقط', 'Only the Owner can manage apps')} />
            </ul>
          </Card>
        </div>
      </div>

      <SyncLog entries={logFor(log, a.id)} label={label} />

      {dlg && <ImpactModal a={a} act={dlg} label={label[dlg]} icon={icon[dlg]} onClose={() => setDlg(null)} onConfirm={() => run(dlg)} />}
    </div>
  );
}

function Limit({ ok, icon, title, text, action }: { ok: boolean; icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-sky-500/10 text-sky-700 dark:text-sky-300')}>{ok ? <CircleCheck className="size-4" aria-hidden="true" /> : icon}</span>
      <div className="min-w-0"><p className="text-[13px] font-semibold text-fg">{title}</p><p className="text-[13px] text-muted">{text}</p>{action}</div>
    </li>
  );
}

function ImpactModal({ a, act, label, icon, onClose, onConfirm }: { a: App; act: AppAction; label: string; icon: ReactNode; onClose: () => void; onConfirm: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const personal = personalScopes(a);
  const title = `${label} · ${a.name[lang]}`;
  return (
    <Modal title={title} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button variant={act === 'disconnect' ? 'danger' : 'primary'} onClick={onConfirm}>{icon}{act === 'disconnect' ? tx('افصل التطبيق', 'Disconnect app') : act === 'retry' ? tx('أعد المزامنة', 'Retry sync') : tx('امنح الوصول', 'Grant access')}</Button></>}>
      {act === 'disconnect' ? (
        <>
          <ul className="space-y-1.5 text-sm text-fg">
            <li>{tx('تتوقف المزامنة وأي رسائل يرسلها التطبيق فورًا.', 'Sync and any messages the app sends stop immediately.')}</li>
            <li>{tx('ما أُرسل للتطبيق يبقى لديه وفق شروطه؛ اطلب حذفه منه إن لزم.', 'Data already sent to the app stays with it under its terms; ask it to delete it if needed.')}</li>
            <li>{tx('بيانات متجرك لا تُحذف، ويمكنك إعادة الربط لاحقًا.', 'Your store data is not deleted, and you can reconnect later.')}</li>
          </ul>
          {personal.length > 0 && <Alert tone="warn">{tx(`كان يصل إلى بيانات شخصية: ${personal.map(n.scope).join('، ')}`, `It had access to personal data: ${personal.map(n.scope).join(', ')}`)}</Alert>}
        </>
      ) : act === 'retry' ? (
        <p className="text-sm text-fg">{tx('يطلب ملف المزامنة من جديد. إن رُفض مرة أخرى تبقى الحالة «تفشل» ويظهر السبب.', 'Requests the sync file again. If it is rejected again, the state stays “failing” with the reason.')}</p>
      ) : (
        <>
          <p className="text-sm text-fg">{act === 'reauth' ? tx('يحصل التطبيق على الصلاحيات نفسها من جديد:', 'The app gets the same access again:') : tx('سيحصل التطبيق على:', 'The app will get:')}</p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {a.scopes.map((s) => <li key={s} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span className="text-fg">{n.scope(s)}</span>{isPersonal(s) && <Badge tone="amber">{tx('بيانات شخصية', 'Personal data')}</Badge>}</li>)}
          </ul>
          {personal.length > 0 && <p className="text-[13px] text-muted">{tx('أنت مسؤول عن إبلاغ عملائك بمشاركة بياناتهم مع هذا التطبيق.', 'You are responsible for telling customers their data is shared with this app.')}</p>}
        </>
      )}
      <Simulated />
    </Modal>
  );
}

function SyncLine({ a, log }: { a: App; log: SyncEntry[] }) {
  const tx = useTx();
  const { lang } = useLang();
  if (a.state === 'not_connected') return null;
  const c = currentCause(log, a.id);
  const ok = lastOk(log, a.id);
  const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? tx(`قبل ${Math.max(1, m)} د`, `${Math.max(1, m)} min ago`) : m < 1440 ? tx(`قبل ${Math.round(m / 60)} س`, `${Math.round(m / 60)} h ago`) : tx(`قبل ${Math.round(m / 1440)} ي`, `${Math.round(m / 1440)} d ago`); };
  return (
    <span className="mt-3 block space-y-0.5 text-xs">
      <span className="block text-muted tabular-nums">{tx('آخر مزامنة ناجحة: ', 'Last good sync: ')}{ok ? ago(ok.at) : '—'}</span>
      {c?.cause && (a.state === 'error' || a.state === 'reauth') && <span className="line-clamp-2 block font-medium text-red-700 dark:text-red-400">{CAUSES[c.cause].text[lang]}</span>}
    </span>
  );
}

/** Every sync attempt for one connection: when, what, result, records or the failure cause and reference. */
function SyncLog({ entries, label }: { entries: SyncEntry[]; label: Record<AppAction, string> }) {
  const tx = useTx();
  const { lang } = useLang();
  const [only, setOnly] = useState(false);
  const shown = only ? entries.filter((e) => !e.ok) : entries;
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Card aria-labelledby="h-synclog">
      <CardHeader id="h-synclog" title={tx('سجل المزامنة', 'Sync log')} hint={tx('كل محاولة: متى، ونتيجتها، وعدد السجلات أو سبب الفشل.', 'Every attempt: when, the result, and the records or the failure cause.')}
        action={<FilterChip label={tx('العرض', 'Show')} value={only ? 'fail' : ''} onChange={(v) => setOnly(v === 'fail')} options={[{ value: 'fail', label: tx('الفشل فقط', 'Failures only') }]} />} />
      {shown.length === 0 ? <p className="border-t border-border px-5 py-6 text-sm text-muted">{only ? tx('لا محاولات فاشلة.', 'No failed attempts.') : tx('لا مزامنة بعد.', 'No syncs yet.')}</p> : (
        <ol className="divide-y divide-border border-t border-border">
          {shown.slice(0, 12).map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', e.ok ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-fg">{e.kind === 'sync' ? tx('مزامنة', 'Sync') : label[e.kind]} · <span className={e.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>{e.ok ? tx('نجحت', 'Succeeded') : tx('فشلت', 'Failed')}</span>{e.ok && e.records !== undefined && e.kind !== 'disconnect' && <span className="text-muted tabular-nums"> · {tx(`${e.records} سجل`, `${e.records} records`)}</span>}</p>
                {!e.ok && e.cause && <p className="text-xs text-muted">{CAUSES[e.cause].text[lang]}{e.ref && <> · <bdi dir="ltr">{e.ref}</bdi></>}</p>}
              </div>
              <time dateTime={e.at} className="text-xs text-subtle tabular-nums">{when(e.at)}</time>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
