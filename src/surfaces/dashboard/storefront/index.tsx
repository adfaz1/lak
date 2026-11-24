// Online store (`#/dashboard/storefront`): the store identity (logo, favicon, brand colour, type, buttons, header),
// the announcement bar and homepage sections, all in one draft; preview on phone and desktop in the store's own look,
// compare draft with live, publish with a change list, roll back to an earlier version, and the store status switches.
import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, Eye, ExternalLink, Globe2, History, ShoppingBag, Smartphone, Upload, Wrench } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, type Route } from '../../../core/router';
import { StoreTabs, SubNotFound, storeHref } from './nav';
import PagesPage from './pages';
import MenusPage from './menus';
import SeoPage from './seo';
import LandingPages from './landing';
import RedirectsPage from './redirects';
import BlogPage from './blog';
import { can, canSee } from '../../merchant/perms';
import { logAction, settingsStore, themeStore } from '../../merchant/stores';
import type { StoreIdentity, StoreStatus } from '../../merchant/workspace';
import { liveIdentity, mediaSrc } from '../../storefront/theme';
import { Badge, Button, Card, CardHeader, ErrorState, LinkButton, Segmented, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, Simulated, Switch, Tabs, Textarea, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import {
  MAINT_MAX, canRollback, identityPending, maintenanceError, maintenanceExpired, maintenanceOn, nextVersion, untilIssue, pendingChanges, publish, publishBlock, rollbackTheme, sectionIssue, shopperView, toggleStatus, type StatusKey,
} from './model';
import { draftIdentity, type IdentityChange } from './identity';
import IdentityPanel, { useIdentityLabels } from './identity-panel';
import SectionsPanel, { C_TONE, K_ICON, useKindLabels } from './sections';
import AnnouncementPanel from './announcement';
import { StorePreview } from './preview';
import { mediaStore } from './state';
import { riyadhMs, toRiyadh } from './landing-model';
import { STORE_PALETTE } from './model';
import { useUnsaved } from '../unsaved';

export default function StorefrontSection({ route }: { route: Route }) {
  const sub = route.path[0];
  if (sub === 'pages') return <PagesPage route={route} />;
  if (sub === 'menus') return <MenusPage />;
  if (sub === 'seo') return <SeoPage route={route} />;
  if (sub === 'landing') return <LandingPages route={route} />;
  if (sub === 'redirects') return <RedirectsPage route={route} />;
  if (sub === 'blog') return <BlogPage route={route} />;
  if (sub) return <SubNotFound />;
  return <ThemePage route={route} />;
}

type EditTab = 'identity' | 'sections' | 'announcement';
const EDIT_TABS: EditTab[] = ['identity', 'sections', 'announcement'];

function ThemePage({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const theme = themeStore.use();
  const settings = settingsStore.use();
  const L = useIdentityLabels();
  const { kind, change, issue } = useKindLabels();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [view, setView] = useState<'draft' | 'live' | 'compare'>('draft');
  const [review, setReview] = useState(false);
  const [note, setNote] = useState('');
  const [rollback, setRollback] = useState<number | null>(null);
  const [statusDlg, setStatusDlg] = useState<StatusKey | null>(() => (route.query.get('dlg') === 'maintenance' ? 'maintenance' : null));
  const qEdit = route.query.get('edit') as EditTab | null;
  const edit: EditTab = qEdit && EDIT_TABS.includes(qEdit) ? qEdit : 'identity';

  if (!canSee(role, 'storefront')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('المتجر الإلكتروني غير متاح لدورك', 'The online store is not available for your role')} /></div>;
  const canPublish = can(role, 'theme.publish');
  const changes = pendingChanges(theme);
  const idChanges = identityPending(theme);
  const total = changes.length + idChanges.length;
  const block = publishBlock(theme);
  const nv = nextVersion(theme);
  const st = settings.status;
  const store = settings.store.name;
  const draftId = draftIdentity(theme);
  const firstIssue = theme.draft.map((x) => ({ x, i: sectionIssue(x) })).find((r) => r.i);

  const header = (
    <>
      <PageHeader title={tx('المتجر الإلكتروني', 'Online store')} description={tx('ثيم «هادئ» · نسخة تجريبية', 'Theme “Calm” · demo')}
        meta={<><Badge tone="green">{tx(`المنشور: الإصدار ${theme.published.version}`, `Live: version ${theme.published.version}`)}</Badge><Badge tone={total ? 'brand' : 'gray'}>{total ? tx(`المسودة: ${total} تغييرات`, `Draft: ${total} changes`) : tx('المسودة مطابقة', 'Draft matches live')}</Badge></>}
        actions={<>
          <LinkButton variant="secondary" href={link('/store')} target="_blank" rel="noopener"><Eye className="size-4" aria-hidden="true" />{tx('المتجر المنشور', 'Live store')}<ExternalLink className="size-3.5 opacity-60" aria-hidden="true" /></LinkButton>
          {canPublish && <Button disabled={!!block} onClick={() => setReview(true)}><Upload className="size-4" aria-hidden="true" />{tx('راجع وانشر', 'Review and publish')}</Button>}
        </>} />
      <StoreTabs current="theme" />
      <ReviewRole />
    </>
  );

  if (state === 'loading') return (
    <div className="space-y-6" aria-busy="true">{header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5" role="status" aria-label="Loading">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 lg:col-span-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-9 rounded-xl" /><Skeleton className="h-10 flex-1" /><Skeleton className="h-6 w-11 rounded-full" /></div>)}</div>
        <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل محرر المتجر', 'The store editor could not load')} onRetry={() => setDashState('live')}>
        {tx('متجرك المنشور يعمل كما هو؛ لم يتغير شيء. المرجع SIM-THEME-503.', 'Your live store works as before; nothing changed. Ref SIM-THEME-503.')}
      </ErrorState></Card>
    </div>
  );
  const empty = state === 'empty';
  const draft = empty ? [] : theme.draft;

  const statusRows: { key: StatusKey; label: string; on: boolean; onText: string; offText: string; tone: Tone }[] = [
    { key: 'published', label: tx('ظهور المتجر', 'Store visible'), on: st.published, onText: tx('العملاء يجدون المتجر', 'Shoppers can find the store'), offText: tx('المتجر مخفي عن العملاء', 'Hidden from shoppers'), tone: st.published ? 'green' : 'gray' },
    { key: 'accepting', label: tx('استقبال الطلبات', 'Accepting orders'), on: st.accepting, onText: tx('يمكن إتمام الطلبات', 'Orders can be placed'), offText: tx('تصفح فقط، بلا طلبات', 'Browse only, no orders'), tone: st.accepting ? 'green' : 'amber' },
    { key: 'maintenance', label: tx('وضع الصيانة', 'Maintenance mode'), on: maintenanceOn(st), onText: st.until ? tx(`حتى ${fmtUntil(st.until, 'ar')}`, `Until ${fmtUntil(st.until, 'en')}`) : st.message || tx('رسالة الصيانة تظهر', 'Maintenance message shown'), offText: maintenanceExpired(st) ? tx('انتهت تلقائيًا في موعدها', 'Ended by itself on schedule') : tx('غير مفعّل', 'Off'), tone: maintenanceOn(st) ? 'amber' : 'gray' },
  ];
  const sView = shopperView(st);
  const viewText = { hidden: tx('العملاء لا يرون المتجر', 'Shoppers cannot see the store'), maintenance: tx('العملاء يرون رسالة الصيانة', 'Shoppers see the maintenance message'), browseOnly: tx('العملاء يتصفحون ولا يطلبون', 'Shoppers can browse but not order'), open: tx('المتجر مفتوح ويستقبل الطلبات', 'The store is open and taking orders') }[sView];
  const changedIds = new Set(changes.map((c) => c.id));
  const tabCount = (t: EditTab) => t === 'identity' ? idChanges.length : t === 'announcement' ? changes.filter((c) => theme.draft.find((x) => x.id === c.id)?.kind === 'announcement').length : changes.filter((c) => (theme.draft.find((x) => x.id === c.id) ?? theme.published.sections.find((x) => x.id === c.id))?.kind !== 'announcement').length;

  const doPublish = () => {
    const prev = theme.published.version;
    const what = [...idChanges.map((c) => L.key(c.key)), ...changes.map((c) => { const x = theme.draft.find((d) => d.id === c.id) ?? theme.published.sections.find((d) => d.id === c.id)!; return `${kind(x.kind)} (${change(c.kind)})`; })].join('، ');
    themeStore.set((t) => publish(t, note));
    logAction('store', { ar: `نشر الإصدار ${nv} من ثيم المتجر: ${what}`, en: `Published store theme version ${nv}: ${what}` }, { target: `v${nv}`, before: `v${prev}`, after: `v${nv}` });
    setReview(false); setNote('');
    toast({ tone: 'ok', text: tx(`نُشر الإصدار ${nv}`, `Version ${nv} published`), action: { label: tx(`ارجع إلى ${prev}`, `Roll back to ${prev}`), run: () => { themeStore.set((t) => rollbackTheme(t, prev)); logAction('store', { ar: `تراجع عن نشر الإصدار ${nv} إلى ${prev}`, en: `Undid publishing version ${nv}, back to ${prev}` }, { target: `v${nv + 1}` }); } } });
  };

  return (
    <div className="space-y-6">
      {header}

      <Card aria-labelledby="h-status">
        <CardHeader id="h-status" title={tx('حالة المتجر', 'Store status')} hint={tx('ثلاثة قرارات منفصلة: الظهور، واستقبال الطلبات، والصيانة. الصيانة تغلب الاثنين.', 'Three separate decisions: visibility, accepting orders and maintenance. Maintenance overrides the other two.')}
          action={<span className={cn('flex items-center gap-1.5 text-xs font-medium', sView === 'open' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}><span className={cn('size-2 rounded-full', sView === 'open' ? 'bg-emerald-500' : 'bg-amber-500')} aria-hidden="true" /><span className="hidden sm:inline">{viewText}</span></span>} />
        <ul className="grid grid-cols-1 divide-y divide-border border-t border-border md:grid-cols-3 md:divide-y-0">
          {statusRows.map((r, i) => (
            <li key={r.key} className={cn('flex items-center gap-3 px-5 py-4', i > 0 && 'md:border-s md:border-border')}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{r.label}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{r.on ? r.onText : r.offText}</p>
              </div>
              <Switch checked={r.on} label={r.label} disabled={!canPublish} onChange={() => setStatusDlg(r.key)} />
            </li>
          ))}
        </ul>
        {!canPublish && <p className="border-t border-border px-5 py-3"><Locked>{tx('تغيير الحالة والنشر للمالك. يمكنك تعديل المسودة.', 'Status and publishing are for the Owner. You can edit the draft.')}</Locked></p>}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <Tabs label={tx('ما تعدّله', 'What you edit')} items={EDIT_TABS.map((t) => ({
            href: storeHref('theme', { edit: t === 'identity' ? undefined : t }), current: edit === t, count: tabCount(t) || undefined,
            label: { identity: tx('الهوية', 'Identity'), sections: tx('الأقسام', 'Sections'), announcement: tx('شريط الإعلان', 'Announcement') }[t],
          }))} />
          {block === 'invalid' && firstIssue && (
            <Alert tone="warn" action={<LinkButton size="sm" variant="secondary" href={storeHref('theme', { edit: firstIssue.x.kind === 'announcement' ? 'announcement' : 'sections' })}>{tx('اذهب إليه', 'Go to it')}</LinkButton>}>
              {tx('لا يمكن النشر قبل إصلاح:', 'Fix before publishing:')} {kind(firstIssue.x.kind)} · {issue(firstIssue.i!)}
            </Alert>
          )}
          {edit === 'identity' && <IdentityPanel store={store} />}
          {edit === 'sections' && <SectionsPanel empty={empty} />}
          {edit === 'announcement' && <AnnouncementPanel empty={empty} />}

          <Card aria-labelledby="h-hist">
            <CardHeader id="h-hist" title={tx('سجل الإصدارات', 'Version history')} hint={tx('الرجوع ينشر نسخة من إصدار سابق (أقسام وهوية) كإصدار جديد؛ السجل لا يُحذف.', 'Rolling back publishes a copy of an earlier version (sections and identity) as a new one; history is never deleted.')} />
            <ul className="divide-y divide-border border-t border-border">
              {theme.history.map((h) => {
                const hid = h.identity;
                return (
                  <li key={h.version} className="flex items-center gap-3 px-5 py-3">
                    <History className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                    {hid && <span className="size-3.5 shrink-0 rounded-full ring-1 ring-border" style={{ background: hid.accent }} title={hid.accent} aria-hidden="true" />}
                    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg tabular-nums">{tx(`الإصدار ${h.version}`, `Version ${h.version}`)}</p><p className="truncate text-xs text-muted" dir="auto">{h.note}</p></div>
                    {h.version === theme.published.version ? <Badge tone="green">{tx('منشور', 'Live')}</Badge>
                      : canPublish && canRollback(theme, h.version) && <Button variant="secondary" size="sm" onClick={() => setRollback(h.version)}>{tx('ارجع لهذا', 'Roll back')}</Button>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card aria-labelledby="h-prev" className="lg:sticky lg:top-24">
            <CardHeader id="h-prev" title={view === 'live' ? tx('المنشور الآن', 'Live now') : view === 'compare' ? tx('المنشور مقابل المسودة', 'Live vs draft') : tx('معاينة المسودة', 'Draft preview')}
              hint={tx('بهوية متجرك وألوانه، لا ألوان «لك». تتحدث مع كل تعديل.', 'In your store’s own identity and colours, not LAK’s. Updates with every edit.')} />
            <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
              <Segmented label={tx('العرض', 'View')} value={view} onChange={setView} options={[{ value: 'draft', label: tx('المسودة', 'Draft') }, { value: 'live', label: tx('المنشور', 'Live') }, { value: 'compare', label: tx('قارن', 'Compare') }]} />
              {view !== 'compare' && <Segmented label={tx('الجهاز', 'Device')} value={device} onChange={setDevice} options={[{ value: 'desktop', label: tx('كمبيوتر', 'Desktop') }, { value: 'mobile', label: tx('جوال', 'Phone') }]} />}
            </div>
            <div className="px-5 pb-5">
              {view === 'compare' ? (
                <div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="min-w-0"><p className="mb-1.5 text-center text-xs font-semibold text-muted">{tx(`المنشور · ${theme.published.version}`, `Live · ${theme.published.version}`)}</p>
                      <StorePreview sections={theme.published.sections} identity={liveIdentity(theme)} device="mobile" store={store} lang={lang} label={tx('معاينة المنشور', 'Live preview')} /></div>
                    <div className="min-w-0"><p className="mb-1.5 text-center text-xs font-semibold text-brand-700 dark:text-brand-300">{tx(`المسودة · ${total} تغييرات`, `Draft · ${total} changes`)}</p>
                      <StorePreview sections={draft} identity={draftId} device="mobile" store={store} lang={lang} changed={changedIds} label={tx('معاينة المسودة', 'Draft preview')} /></div>
                  </div>
                  {total === 0 ? <p className="mt-3 text-center text-xs text-muted">{tx('لا فرق: المسودة مطابقة للمنشور.', 'No difference: the draft matches live.')}</p>
                    : <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted"><ArrowLeftRight className="size-3.5" aria-hidden="true" />{tx('الأقسام المتغيرة محاطة بخط متقطع', 'Changed sections have a dashed outline')}</p>}
                </div>
              ) : (
                <StorePreview sections={view === 'live' ? theme.published.sections : draft} identity={view === 'live' ? liveIdentity(theme) : draftId} device={device} store={store} lang={lang}
                  label={tx(`معاينة ${view === 'live' ? 'المنشور' : 'المسودة'}`, `${view === 'live' ? 'Live' : 'Draft'} preview`)} />
              )}
            </div>
          </Card>

          <Card aria-labelledby="h-chan">
            <CardHeader id="h-chan" title={tx('قنوات البيع', 'Sales channels')} />
            <ul className="divide-y divide-border border-t border-border">
              <ChannelLink href={link('/store')} icon={<ShoppingBag className="size-5" />} title={tx('متجر العميل', 'Shopper store')} sub={tx('افتح المتجر كما يراه العميل', 'Open the store as shoppers see it')} />
              <ChannelLink href={link('/market/seller')} icon={<Globe2 className="size-5" />} title={tx('سوق لك', 'LAK marketplace')} sub={tx('إدراج منتجاتك في السوق', 'Your products’ marketplace listing')} />
              <ChannelLink href={link('/appmaker')} icon={<Smartphone className="size-5" />} title={tx('صانع التطبيق', 'App Maker')} sub={tx('تطبيق متجرك على الجوال', 'Your store’s mobile app')} />
            </ul>
          </Card>
        </div>
      </div>

      {review && (
        <Modal size="lg" title={tx(`نشر الإصدار ${nv}`, `Publish version ${nv}`)} description={tx('يرى العملاء التغييرات فور النشر.', 'Shoppers see the changes as soon as you publish.')} onClose={() => setReview(false)}
          footer={<><Button variant="secondary" onClick={() => setReview(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={doPublish}><Upload className="size-4" aria-hidden="true" />{tx('انشر للعملاء', 'Publish to shoppers')}</Button></>}>
          <div className="flex flex-wrap items-center gap-2 text-sm"><Badge tone="gray">{tx(`الحالي: ${theme.published.version}`, `Live: ${theme.published.version}`)}</Badge><span className="text-subtle" aria-hidden="true">{tx('←', '→')}</span><Badge tone="brand">{tx(`الجديد: ${nv}`, `New: ${nv}`)}</Badge></div>
          {idChanges.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">{tx('الهوية', 'Identity')}</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {idChanges.map((c) => <IdentityRow key={c.key} c={c} label={L.key(c.key)} labels={L} />)}
              </ul>
            </div>
          )}
          {changes.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">{tx('الأقسام', 'Sections')}</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {changes.map((c) => { const x = theme.draft.find((d) => d.id === c.id) ?? theme.published.sections.find((d) => d.id === c.id)!; return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="text-muted" aria-hidden="true">{K_ICON[x.kind]}</span><span className="min-w-0 flex-1 truncate text-fg">{kind(x.kind)} · <span className="text-muted" dir="auto">{x.heading}</span></span><Badge tone={C_TONE[c.kind]}>{change(c.kind)}</Badge></li>
                ); })}
              </ul>
            </div>
          )}
          <Field label={tx('ملاحظة الإصدار', 'Version note')} optional>{(p) => <Input {...p} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />}</Field>
          <p className="text-[13px] text-muted">{tx(`الإصدار ${theme.published.version} يبقى في السجل ويمكن الرجوع إليه.`, `Version ${theme.published.version} stays in history and can be restored.`)}</p>
          <Simulated />
        </Modal>
      )}
      {rollback !== null && (
        <Modal title={tx(`الرجوع إلى الإصدار ${rollback}`, `Roll back to version ${rollback}`)} onClose={() => setRollback(null)}
          footer={<><Button variant="secondary" onClick={() => setRollback(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { themeStore.set((t) => rollbackTheme(t, rollback)); logAction('store', { ar: `أرجع الثيم إلى الإصدار ${rollback} (نُشر كإصدار ${nv})`, en: `Rolled the theme back to version ${rollback} (published as ${nv})` }, { target: `v${nv}` }); setRollback(null); toast({ tone: 'ok', text: tx(`نُشر الإصدار ${nv} (نسخة من ${rollback})`, `Version ${nv} published (copy of ${rollback})`) }); }}>{tx('ارجع وانشر', 'Roll back and publish')}</Button></>}>
          <ul className="space-y-1.5 text-sm text-fg">
            <li>{tx(`تُنشر نسخة من الإصدار ${rollback} (الأقسام والهوية) كإصدار جديد ${nv}.`, `A copy of version ${rollback} (sections and identity) is published as new version ${nv}.`)}</li>
            {total > 0 && <li className="font-medium text-amber-800 dark:text-amber-300">{tx(`تعديلات المسودة الحالية (${total}) تُستبدل.`, `Current draft edits (${total}) are replaced.`)}</li>}
            <li>{tx('السجل لا يُحذف.', 'History is not deleted.')}</li>
          </ul>
          <Simulated />
        </Modal>
      )}
      {statusDlg && <StatusModal k={statusDlg} st={st} onClose={() => setStatusDlg(null)} />}
    </div>
  );
}

/** One identity change in the publish review: before → after, shown as the thing itself (swatch, picture, name). */
function IdentityRow({ c, label, labels }: { c: IdentityChange; label: string; labels: ReturnType<typeof useIdentityLabels> }) {
  const tx = useTx();
  const lib = mediaStore.use();
  const show = (v: string | null): ReactNode => {
    if (c.key === 'accent') return v ? <span className="inline-flex items-center gap-1.5"><span className="size-4 rounded-full ring-1 ring-border" style={{ background: v }} aria-hidden="true" /><bdi dir="ltr" className="font-mono text-xs">{v}</bdi></span> : '—';
    if (c.key === 'logo' || c.key === 'favicon') { const src = mediaSrc(v, lib); return src ? <img src={src} alt="" className={cn('object-contain', c.key === 'logo' ? 'h-6 max-w-24' : 'size-5')} /> : <span className="text-xs text-muted">{tx('بلا', 'None')}</span>; }
    if (c.key === 'font') return labels.font(v as StoreIdentity['font']);
    if (c.key === 'button') return labels.button(v as StoreIdentity['button']);
    if (c.key === 'header') return labels.header(v as StoreIdentity['header']);
    return v;
  };
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
      <span className="min-w-0 flex-1 font-medium text-fg">{label}</span>
      <span className="flex items-center gap-2 text-muted">{show(c.before)}<span className="text-subtle" aria-hidden="true">{tx('←', '→')}</span><span className="text-fg">{show(c.after)}</span></span>
    </li>
  );
}

function StatusModal({ k, st, onClose }: { k: StatusKey; st: StoreStatus; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const [msg, setMsg] = useState(st.message || tx('نُحدّث المتجر وسنعود قريبًا.', 'We are updating the store and will be back soon.'));
  const [ends, setEnds] = useState<'manual' | 'at'>('manual');
  const [until, setUntil] = useState(() => toRiyadh(Date.now() + 2 * 3600_000));
  const [tried, setTried] = useState(false);
  const turningOn = k === 'maintenance' ? !maintenanceOn(st) : !st[k];
  const mErr = k === 'maintenance' && turningOn ? maintenanceError(msg) : null;
  const untilMs = ends === 'at' ? riyadhMs(until) : null;
  const uErr = k === 'maintenance' && turningOn ? untilIssue(untilMs, Date.now()) : null;
  useUnsaved(k === 'maintenance' && turningOn && msg !== (st.message || msg), { ar: 'رسالة الصيانة', en: 'Maintenance message' });
  const apply = () => {
    setTried(true);
    if (uErr) return;
    const next = toggleStatus(st, k, msg, k === 'maintenance' && turningOn ? untilMs : undefined);
    if (!next) return;
    settingsStore.set((x) => ({ ...x, status: next }));
    logAction('store', { ar: `${T[k].title[0]}${next.until ? ` حتى ${fmtUntil(next.until, 'ar')}` : ''}`, en: `${T[k].title[1]}${next.until ? ` until ${fmtUntil(next.until, 'en')}` : ''}` }, { before: turningOn ? 'off' : 'on', after: turningOn ? 'on' : 'off' });
    toast({ tone: 'ok', text: tx('حُدّثت حالة المتجر', 'Store status updated') });
    onClose();
  };
  const T: Record<StatusKey, { on: [string, string]; off: [string, string]; title: [string, string] }> = {
    published: { title: turningOn ? ['إظهار المتجر', 'Make the store visible'] : ['إخفاء المتجر', 'Hide the store'], on: ['يظهر المتجر للعملاء على عنوانه.', 'The store becomes visible at its address.'], off: ['لن يجد العملاء المتجر وتتوقف روابطه. الطلبات الحالية تبقى ويستمر تجهيزها.', 'Shoppers will not find the store and its links stop working. Existing orders remain and are still fulfilled.'] },
    accepting: { title: turningOn ? ['استقبال الطلبات', 'Accept orders'] : ['إيقاف الطلبات', 'Stop taking orders'], on: ['يمكن للعملاء إتمام الطلبات من جديد.', 'Shoppers can place orders again.'], off: ['يبقى المتجر ظاهرًا لكن لا يمكن إتمام طلبات جديدة. السلال تبقى محفوظة.', 'The store stays visible but new orders cannot be placed. Carts are kept.'] },
    maintenance: { title: turningOn ? ['تفعيل وضع الصيانة', 'Turn on maintenance'] : ['إنهاء الصيانة', 'End maintenance'], on: ['يرى العملاء رسالة الصيانة بدل المتجر.', 'Shoppers see the maintenance message instead of the store.'], off: ['يعود المتجر كما كان وفق الإعدادين الآخرين.', 'The store returns, following the other two settings.'] },
  };
  const t = T[k];
  return (
    <Modal title={tx(...t.title)} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button variant={turningOn ? 'primary' : 'danger'} onClick={apply}>{tx(...t.title)}</Button></>}>
      <p className="text-sm text-fg">{tx(...(turningOn ? t.on : t.off))}</p>
      {k === 'maintenance' && turningOn && (
        <>
          <Field label={tx('رسالة الصيانة', 'Maintenance message')} hint={<bdi dir="ltr">{msg.length} / {MAINT_MAX}</bdi>} error={tried && mErr ? (mErr === 'empty' ? tx('اكتب رسالة للعملاء', 'Write a message for shoppers') : tx(`الحد ${MAINT_MAX} حرفًا`, `Max ${MAINT_MAX} characters`)) : null}>
            {(p) => <Textarea {...p} value={msg} dir="auto" onChange={(e) => setMsg(e.target.value)} />}
          </Field>
          <div className="space-y-2">
            <Segmented label={tx('متى تنتهي', 'When it ends')} value={ends} onChange={setEnds} options={[{ value: 'manual', label: tx('حين أطفئها', 'When I switch it off') }, { value: 'at', label: tx('في وقت محدد', 'At a set time') }]} />
            {ends === 'at' && <Field label={tx('تنتهي في (بتوقيت الرياض)', 'Ends at (Riyadh time)')} error={tried && uErr ? ({ format: tx('وقت غير صالح', 'Not a valid time'), past: tx('الوقت مضى', 'That time has passed'), far: tx('خلال 30 يومًا كحد أقصى', 'Within 30 days at most') })[uErr] : null}
              hint={tx('يعود المتجر تلقائيًا دون أن تتذكر', 'The store comes back by itself')}>{(p) => <Input {...p} type="datetime-local" dir="ltr" value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>}
          </div>
          <figure className="rounded-xl border border-border bg-surface-2/50 p-4 text-center" aria-label={tx('ما يراه العميل', 'What shoppers see')}>
            <figcaption className="mb-3 text-start text-xs font-semibold text-muted">{tx('ما يراه العميل', 'What shoppers see')}</figcaption>
            <div className="mx-auto max-w-xs rounded-xl p-5" style={{ background: STORE_PALETTE.bg, color: STORE_PALETTE.ink }}>
              <Wrench className="mx-auto size-6" style={{ color: STORE_PALETTE.accent }} aria-hidden="true" />
              <p className="mt-2 text-sm font-bold">{tx('المتجر في صيانة', 'The store is under maintenance')}</p>
              <p className="mt-1 text-xs" style={{ color: STORE_PALETTE.muted }} dir="auto">{msg || '—'}</p>
              {ends === 'at' && !uErr && untilMs && <p className="mt-2 text-xs font-semibold">{tx(`نعود ${fmtUntil(untilMs, 'ar')}`, `Back ${fmtUntil(untilMs, 'en')}`)}</p>}
              <p className="mt-3 text-[11px] underline" style={{ color: STORE_PALETTE.muted }}>{tx('تتبع طلبك', 'Track your order')}</p>
            </div>
            <p className="mt-2 text-start text-xs text-muted">{tx('تتبع الطلبات والسياسات يبقيان متاحين. أنت ترى المتجر من «المتجر المنشور» مع وضع المراجعة.', 'Order tracking and policies stay open. You can still see the store via Live store in review mode.')}</p>
          </figure>
        </>
      )}
      <Alert tone="info">{tx('الإعدادان الآخران لا يتغيران.', 'The other two settings do not change.')}</Alert>
      <Simulated />
    </Modal>
  );
}

/** A maintenance end time, Riyadh, short. */
function fmtUntil(ms: number, lang: 'ar' | 'en') {
  return new Date(ms).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ChannelLink({ href, icon, title, sub }: { href: string; icon: ReactNode; title: string; sub: string }) {
  return (
    <li>
      <a href={href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-fg">{title}</span><span className="block truncate text-xs text-muted">{sub}</span></span>
        <ExternalLink className="size-4 text-subtle" aria-hidden="true" />
      </a>
    </li>
  );
}

