// Free LAK apps (`#/dashboard/apps?tab=free`, `#/dashboard/apps/free/<id>`): catalogue, install with a preview of
// permissions and store effects, settings, pause, and uninstall with what is removed. All free; simulated where an
// outside account is needed.
import { Suspense, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Gift, Pause, Play, Search, Store, Trash2, Unplug } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import { link, navigate, type Route } from '../../../../core/router';
import { logAction } from '../../../merchant/stores';
import { Badge, Button, Card, CardHeader, EmptyState, LinkButton, Skeleton, cn, useTx } from '../../../../ds/ui';
import { Alert, Modal, PageHeader, SearchInput, useToast } from '../../../../ds/kit';
import { HubTabs } from '../hub';
import { FREE_APPS, FREE_CATS, freeAppById, freeAppsStore, type FreeApp, type FreeAppId } from './registry';
import { SCREENS } from './screens';
import { useRole, NoAccess } from '../../marketing/access';
import { canSee } from '../../../merchant/perms';

const fhref = (id?: string) => (id ? link(`/dashboard/apps/free/${id}`) : link('/dashboard/apps', { tab: 'free' }));

export default function FreeApps({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  if (!canSee(role, 'apps')) return <NoAccess title={tx('التطبيقات المجانية', 'Free apps')} />;
  const id = route.path[1];
  return id ? <Detail id={id} /> : <Catalogue />;
}

function Catalogue() {
  const tx = useTx();
  const { lang } = useLang();
  const st = freeAppsStore.use();
  const [q, setQ] = useState('');
  const list = FREE_APPS.filter((a) => !q.trim() || `${a.name.ar} ${a.name.en} ${a.pitch.ar} ${a.pitch.en}`.toLowerCase().includes(q.trim().toLowerCase()));
  const installed = FREE_APPS.filter((a) => st[a.id]);
  return (
    <div className="space-y-6">
      <PageHeader title={tx('التطبيقات', 'Apps')} description={tx('تطبيقات «لك» المجانية: تثبّت بضغطة، وتُدار من مكان واحد', 'LAK’s free apps: install in one click, manage in one place')} />
      <HubTabs current="free" />
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Gift className="size-5" aria-hidden="true" /></span>
        <p className="min-w-0 flex-1 text-sm text-muted">{tx(`١٠ تطبيقات مجانية من «لك» دون اشتراك. ثبّت منها ${installed.length}.`, `10 free LAK apps, no subscription. ${installed.length} installed.`)}</p>
        <div className="flex w-full sm:w-auto sm:max-w-xs sm:flex-1"><SearchInput value={q} onChange={setQ} placeholder={tx('ابحث في التطبيقات', 'Search apps')} /></div>
      </Card>
      {list.length === 0 ? <Card><EmptyState icon={<Search className="size-6" aria-hidden="true" />} title={tx('لا تطبيق بهذا الاسم', 'No app by that name')} /></Card> : FREE_CATS.map((c) => {
        const items = list.filter((a) => a.cat === c.id);
        if (!items.length) return null;
        return (
          <section key={c.id} aria-labelledby={`fc-${c.id}`}>
            <h2 id={`fc-${c.id}`} className="mb-3 text-sm font-semibold text-muted">{c.label[lang]}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((a) => <li key={a.id}><AppCard app={a} /></li>)}</ul>
          </section>
        );
      })}
    </div>
  );
}

function AppCard({ app }: { app: FreeApp }) {
  const tx = useTx();
  const { lang } = useLang();
  const st = freeAppsStore.use()[app.id];
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <a href={fhref(app.id)} className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-brand-300">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-fg">{app.name[lang]}</span>
        {st ? <Badge tone={st.on ? 'green' : 'gray'}>{st.on ? tx('مفعّل', 'On') : tx('موقوف', 'Paused')}</Badge> : <Badge tone="brand">{tx('مجاني', 'Free')}</Badge>}
      </div>
      <p className="flex-1 text-sm text-muted">{app.pitch[lang]}</p>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300">{st ? tx('الإعدادات', 'Settings') : tx('التفاصيل والتثبيت', 'Details & install')}<Arrow className="size-3.5" aria-hidden="true" /></span>
    </a>
  );
}

function Detail({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const app = freeAppById(id);
  const st = freeAppsStore.use();
  const [dialog, setDialog] = useState<'install' | 'remove' | null>(null);
  if (!app) return <Card><EmptyState as="h1" title={tx('لا تطبيق بهذا الرابط', 'No app at this link')} action={<LinkButton href={fhref()}>{tx('كل التطبيقات', 'All apps')}</LinkButton>} /></Card>;
  const inst = st[app.id];
  const Screen = SCREENS[app.id as FreeAppId];
  const install = () => {
    freeAppsStore.set((s) => ({ ...s, [app.id]: { on: true, installedAt: new Date().toISOString(), settings: s[app.id]?.settings ?? {} } }));
    logAction('apps', { ar: `ثبّت تطبيق «${app.name.ar}»`, en: `Installed “${app.name.en}”` }, { target: app.id });
    setDialog(null); toast({ tone: 'ok', text: tx('ثُبّت التطبيق. أكمل إعداده أدناه.', 'Installed. Finish its setup below.') });
  };
  const toggle = () => {
    freeAppsStore.set((s) => ({ ...s, [app.id]: { ...s[app.id]!, on: !s[app.id]!.on } }));
    logAction('apps', { ar: `${inst?.on ? 'أوقف' : 'شغّل'} «${app.name.ar}»`, en: `${inst?.on ? 'Paused' : 'Resumed'} “${app.name.en}”` }, { target: app.id });
  };
  const remove = () => {
    freeAppsStore.set((s) => { const n = { ...s }; delete n[app.id]; return n; });
    logAction('apps', { ar: `أزال تطبيق «${app.name.ar}»`, en: `Removed “${app.name.en}”` }, { target: app.id });
    setDialog(null); toast({ tone: 'info', text: tx('أُزيل التطبيق وتوقف أثره في المتجر.', 'Removed; its effect in the store has stopped.') });
    navigate(fhref());
  };
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: fhref(), label: tx('التطبيقات المجانية', 'Free apps') }} title={app.name[lang]} description={app.pitch[lang]}
        actions={inst
          ? <div className="flex gap-2"><Button variant="secondary" onClick={toggle}>{inst.on ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}{inst.on ? tx('إيقاف مؤقت', 'Pause') : tx('تشغيل', 'Resume')}</Button><Button variant="ghost" onClick={() => setDialog('remove')}><Trash2 className="size-4" aria-hidden="true" />{tx('إزالة', 'Remove')}</Button></div>
          : <Button onClick={() => setDialog('install')}><CheckCircle2 className="size-4" aria-hidden="true" />{tx('ثبّت مجانًا', 'Install free')}</Button>} />
      {app.external && <Alert tone="info" title={tx('يحتاج حسابًا خارجيًا للعمل فعليًا', 'Needs an outside account to work for real')}>{app.external[lang]}. {tx('الربط في هذه المعاينة محاكاة.', 'The connection in this preview is simulated.')}</Alert>}
      {!inst ? <Overview app={app} /> : (
        <>
          {!inst.on && <Alert tone="warn" title={tx('التطبيق موقوف مؤقتًا', 'The app is paused')}>{tx('لا يظهر شيء منه في المتجر حتى تشغّله، وتبقى إعداداته محفوظة.', 'Nothing shows in the store until you resume it; settings are kept.')}</Alert>}
          {Screen ? <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}><Screen id={app.id as FreeAppId} /></Suspense> : <Card className="p-5 text-sm text-muted">{tx('إعدادات هذا التطبيق قيد البناء.', 'This app’s settings are being built.')}</Card>}
        </>
      )}
      {dialog === 'install' && (
        <Modal title={tx(`تثبيت «${app.name.ar}»`, `Install “${app.name.en}”`)} description={tx('مجاني ودون اشتراك. يمكنك إيقافه أو إزالته في أي وقت.', 'Free, no subscription. Pause or remove any time.')} onClose={() => setDialog(null)}
          footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={install}>{tx('ثبّت', 'Install')}</Button></>}>
          <Overview app={app} compact />
        </Modal>
      )}
      {dialog === 'remove' && (
        <Modal title={tx(`إزالة «${app.name.ar}»؟`, `Remove “${app.name.en}”?`)} onClose={() => setDialog(null)}
          footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={remove}><Unplug className="size-4" aria-hidden="true" />{tx('أزل التطبيق', 'Remove app')}</Button></>}>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
            {app.storeEffects.map((e, i) => <li key={i}>{tx('يختفي من المتجر: ', 'Removed from the store: ')}{e[lang]}</li>)}
            <li>{tx('تُحذف إعداداته من هذه الجلسة.', 'Its settings are deleted from this session.')}</li>
            <li>{tx('ما أنشأه من قبل (كوبونات، طلبات، رسائل مسجلة) يبقى كما هو.', 'What it already created (coupons, orders, logged messages) stays.')}</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}

function Overview({ app, compact }: { app: FreeApp; compact?: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  return (
    <div className={cn('grid gap-4', !compact && 'lg:grid-cols-2')}>
      <Card className={cn(compact && 'border-0 shadow-none')}>
        <CardHeader id={`perm-${app.id}`} title={tx('ما يصل إليه التطبيق', 'What the app can access')} />
        <ul className="space-y-2 px-5 pb-5 text-sm text-fg">{app.permissions.map((p, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />{p[lang]}</li>)}</ul>
      </Card>
      <Card className={cn(compact && 'border-0 shadow-none')}>
        <CardHeader id={`fx-${app.id}`} title={tx('ما يتغير في متجرك', 'What changes in your store')} />
        <ul className="space-y-2 px-5 pb-5 text-sm text-fg">
          {app.storeEffects.length ? app.storeEffects.map((e, i) => <li key={i} className="flex gap-2"><Store className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />{e[lang]}</li>) : <li className="text-muted">{tx('لا شيء يظهر للعملاء؛ يعمل داخل لوحتك فقط.', 'Nothing shows to shoppers; it works inside your dashboard only.')}</li>}
        </ul>
      </Card>
    </div>
  );
}
