// Online store (`#/dashboard/storefront`): published vs draft theme, homepage sections (reorder, show/hide, heading),
// live preview in the store's own colours, publish review with version, rollback, and separate store status switches.
import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, Globe2, History, Megaphone, Image as ImageIcon, LayoutGrid, Mail, Play,
  ShoppingBag, Smartphone, Sparkles, Tag, Upload,
} from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { can, canSee } from '../../merchant/perms';
import { productsStore, settingsStore, themeStore } from '../../merchant/stores';
import type { SectionKind, StoreStatus } from '../../merchant/workspace';
import { Badge, Button, Card, CardHeader, ErrorState, IconButton, LinkButton, Segmented, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, Simulated, Switch, Textarea, useToast } from '../../../ds/kit';
import { productPhoto } from '../model/media';
import { useDashState, setDashState } from '../review';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import {
  HEADING_MAX, MAINT_MAX, STORE_PALETTE as P, canRollback, changeOf, discardDraft, headingError, maintenanceError, move, nextVersion, pendingChanges,
  previewSections, publish, publishBlock, rollbackTheme, shopperView, toggleStatus, updateSection, type StatusKey,
} from './model';

const K_ICON: Record<SectionKind, ReactNode> = {
  announcement: <Megaphone className="size-4" />, hero: <ImageIcon className="size-4" />, featured: <Sparkles className="size-4" />, categories: <LayoutGrid className="size-4" />,
  offers: <Tag className="size-4" />, video: <Play className="size-4" />, newsletter: <Mail className="size-4" />,
};
const C_TONE: Record<string, Tone> = { moved: 'sky', shown: 'green', hidden: 'gray', edited: 'brand' };

export default function Storefront() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const theme = themeStore.use();
  const settings = settingsStore.use();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [review, setReview] = useState(false);
  const [note, setNote] = useState('');
  const [rollback, setRollback] = useState<number | null>(null);
  const [statusDlg, setStatusDlg] = useState<StatusKey | null>(null);

  if (!canSee(role, 'storefront')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('المتجر الإلكتروني غير متاح لدورك', 'The online store is not available for your role')} /></div>;
  const canPublish = can(role, 'theme.publish');
  const kind = (k: SectionKind) => ({ announcement: tx('شريط إعلان', 'Announcement bar'), hero: tx('بانر رئيسي', 'Hero banner'), featured: tx('منتجات مميزة', 'Featured products'), categories: tx('التصنيفات', 'Categories'), offers: tx('العروض', 'Offers'), video: tx('فيديو', 'Video'), newsletter: tx('النشرة البريدية', 'Newsletter') })[k];
  const changeName = (k: string) => ({ moved: tx('نُقل', 'Moved'), shown: tx('أُظهر', 'Shown'), hidden: tx('أُخفي', 'Hidden'), edited: tx('عُدّل', 'Edited') } as Record<string, string>)[k];
  const changes = pendingChanges(theme);
  const block = publishBlock(theme);
  const nv = nextVersion(theme);
  const st = settings.status;

  const header = (
    <>
      <PageHeader title={tx('المتجر الإلكتروني', 'Online store')} description={tx('ثيم «هادئ» · نسخة تجريبية', 'Theme “Calm” · demo')}
        meta={<><Badge tone="green">{tx(`المنشور: الإصدار ${theme.published.version}`, `Live: version ${theme.published.version}`)}</Badge><Badge tone={changes.length ? 'brand' : 'gray'}>{changes.length ? tx(`المسودة: ${changes.length} تغييرات`, `Draft: ${changes.length} changes`) : tx('المسودة مطابقة', 'Draft matches live')}</Badge></>}
        actions={<>
          <LinkButton variant="secondary" href={link('/store')}><Eye className="size-4" aria-hidden="true" />{tx('معاينة المتجر', 'Preview store')}</LinkButton>
          {canPublish && <Button disabled={!!block} onClick={() => setReview(true)}><Upload className="size-4" aria-hidden="true" />{tx('راجع وانشر', 'Review and publish')}</Button>}
        </>} />
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
    { key: 'maintenance', label: tx('وضع الصيانة', 'Maintenance mode'), on: st.maintenance, onText: st.message || tx('رسالة الصيانة تظهر', 'Maintenance message shown'), offText: tx('غير مفعّل', 'Off'), tone: st.maintenance ? 'amber' : 'gray' },
  ];
  const view = shopperView(st);
  const viewText = { hidden: tx('العملاء لا يرون المتجر', 'Shoppers cannot see the store'), maintenance: tx('العملاء يرون رسالة الصيانة', 'Shoppers see the maintenance message'), browseOnly: tx('العملاء يتصفحون ولا يطلبون', 'Shoppers can browse but not order'), open: tx('المتجر مفتوح ويستقبل الطلبات', 'The store is open and taking orders') }[view];

  return (
    <div className="space-y-6">
      {header}

      <Card aria-labelledby="h-status">
        <CardHeader id="h-status" title={tx('حالة المتجر', 'Store status')} hint={tx('ثلاثة قرارات منفصلة: الظهور، واستقبال الطلبات، والصيانة. الصيانة تغلب الاثنين.', 'Three separate decisions: visibility, accepting orders and maintenance. Maintenance overrides the other two.')}
          action={<span className={cn('flex items-center gap-1.5 text-xs font-medium', view === 'open' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}><span className={cn('size-2 rounded-full', view === 'open' ? 'bg-emerald-500' : 'bg-amber-500')} aria-hidden="true" />{viewText}</span>} />
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
          <Card aria-labelledby="h-sections">
            <CardHeader id="h-sections" title={tx('أقسام الصفحة الرئيسية', 'Homepage sections')} hint={tx('التعديلات تُحفظ في المسودة تلقائيًا ولا يراها العملاء حتى تنشر.', 'Edits save to the draft automatically and stay invisible to shoppers until you publish.')}
              action={changes.length ? <Button variant="ghost" size="sm" onClick={() => themeStore.set(discardDraft)}>{tx('تجاهل المسودة', 'Discard draft')}</Button> : <span className="text-xs text-muted">{tx('محفوظ في المسودة', 'Saved to draft')}</span>} />
            {draft.length === 0 ? (
              <p className="px-5 pb-6 text-sm text-muted">{tx('لا أقسام في الصفحة الرئيسية.', 'No homepage sections.')}</p>
            ) : (
              <ol className="divide-y divide-border border-t border-border">
                {draft.map((s, i) => {
                  const ch = changeOf(theme, s.id);
                  const hErr = headingError(s.heading);
                  return (
                    <li key={s.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5', !s.visible && 'bg-surface-2/40')}>
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', s.visible ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'bg-surface-2 text-subtle')} aria-hidden="true">{K_ICON[s.kind]}</span>
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="flex items-center gap-2 text-xs font-semibold text-muted"><span className="tabular-nums">{i + 1}.</span>{kind(s.kind)}{ch && <Badge tone={C_TONE[ch]} className="h-5 px-2 text-[11px]">{changeName(ch)}</Badge>}</p>
                        <Field label={<span className="sr-only">{tx(`عنوان ${kind(s.kind)}`, `${kind(s.kind)} heading`)}</span>} className="mt-1 space-y-1" error={hErr === 'empty' ? tx('اكتب عنوانًا', 'Enter a heading') : hErr === 'long' ? tx(`الحد ${HEADING_MAX} حرفًا`, `Max ${HEADING_MAX} characters`) : null}>
                          {(p) => <Input {...p} className="h-9" dir="auto" value={s.heading} onChange={(e) => themeStore.set((t) => updateSection(t, s.id, { heading: e.target.value }))} />}
                        </Field>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="me-2 inline-flex items-center gap-2 text-xs text-muted">{s.visible ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}<Switch checked={s.visible} label={tx(`إظهار ${kind(s.kind)}`, `Show ${kind(s.kind)}`)} onChange={(v) => themeStore.set((t) => updateSection(t, s.id, { visible: v }))} /></span>
                        <IconButton label={tx(`انقل ${kind(s.kind)} للأعلى`, `Move ${kind(s.kind)} up`)} disabled={i === 0} className="disabled:opacity-30" onClick={() => themeStore.set((t) => move(t, s.id, -1))}><ArrowUp className="size-4" aria-hidden="true" /></IconButton>
                        <IconButton label={tx(`انقل ${kind(s.kind)} للأسفل`, `Move ${kind(s.kind)} down`)} disabled={i === draft.length - 1} className="disabled:opacity-30" onClick={() => themeStore.set((t) => move(t, s.id, 1))}><ArrowDown className="size-4" aria-hidden="true" /></IconButton>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card aria-labelledby="h-hist">
            <CardHeader id="h-hist" title={tx('سجل الإصدارات', 'Version history')} hint={tx('الرجوع ينشر نسخة من إصدار سابق كإصدار جديد؛ السجل لا يُحذف.', 'Rolling back publishes a copy of an earlier version as a new one; history is never deleted.')} />
            <ul className="divide-y divide-border border-t border-border">
              {theme.history.map((h) => (
                <li key={h.version} className="flex items-center gap-3 px-5 py-3">
                  <History className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg tabular-nums">{tx(`الإصدار ${h.version}`, `Version ${h.version}`)}</p><p className="truncate text-xs text-muted" dir="auto">{h.note}</p></div>
                  {h.version === theme.published.version ? <Badge tone="green">{tx('منشور', 'Live')}</Badge>
                    : canPublish && canRollback(theme, h.version) && <Button variant="secondary" size="sm" onClick={() => setRollback(h.version)}>{tx('ارجع لهذا', 'Roll back')}</Button>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card aria-labelledby="h-prev" className="lg:sticky lg:top-24">
            <CardHeader id="h-prev" title={tx('معاينة المسودة', 'Draft preview')} hint={tx('بألوان متجرك التجريبي، لا ألوان «لك». تتحدث مع كل تعديل.', 'In your demo store’s colours, not LAK’s. Updates with every edit.')}
              action={<Segmented label={tx('الجهاز', 'Device')} value={device} onChange={setDevice} options={[{ value: 'desktop', label: tx('كمبيوتر', 'Desktop') }, { value: 'mobile', label: tx('جوال', 'Mobile') }]} />} />
            <div className="px-5 pb-5">
              <Preview draft={draft} device={device} store={settings.store.name} kind={kind} lang={lang} />
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
          footer={<><Button variant="secondary" onClick={() => setReview(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { const prev = theme.published.version; themeStore.set((t) => publish(t, note)); setReview(false); setNote(''); toast({ tone: 'ok', text: tx(`نُشر الإصدار ${nv}`, `Version ${nv} published`), action: { label: tx(`ارجع إلى ${prev}`, `Roll back to ${prev}`), run: () => themeStore.set((t) => rollbackTheme(t, prev)) } }); }}><Upload className="size-4" aria-hidden="true" />{tx('انشر للعملاء', 'Publish to shoppers')}</Button></>}>
          <div className="flex flex-wrap items-center gap-2 text-sm"><Badge tone="gray">{tx(`الحالي: ${theme.published.version}`, `Live: ${theme.published.version}`)}</Badge><span className="text-subtle" aria-hidden="true">{tx('←', '→')}</span><Badge tone="brand">{tx(`الجديد: ${nv}`, `New: ${nv}`)}</Badge></div>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {changes.map((c) => { const s = theme.draft.find((x) => x.id === c.id)!; return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="text-muted" aria-hidden="true">{K_ICON[s.kind]}</span><span className="min-w-0 flex-1 truncate text-fg">{kind(s.kind)} · <span className="text-muted" dir="auto">{s.heading}</span></span><Badge tone={C_TONE[c.kind]}>{changeName(c.kind)}</Badge></li>
            ); })}
          </ul>
          <Field label={tx('ملاحظة الإصدار', 'Version note')} optional>{(p) => <Input {...p} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />}</Field>
          <p className="text-[13px] text-muted">{tx(`الإصدار ${theme.published.version} يبقى في السجل ويمكن الرجوع إليه.`, `Version ${theme.published.version} stays in history and can be restored.`)}</p>
          <Simulated />
        </Modal>
      )}
      {rollback !== null && (
        <Modal title={tx(`الرجوع إلى الإصدار ${rollback}`, `Roll back to version ${rollback}`)} onClose={() => setRollback(null)}
          footer={<><Button variant="secondary" onClick={() => setRollback(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { themeStore.set((t) => rollbackTheme(t, rollback)); setRollback(null); toast({ tone: 'ok', text: tx(`نُشر الإصدار ${nv} (نسخة من ${rollback})`, `Version ${nv} published (copy of ${rollback})`) }); }}>{tx('ارجع وانشر', 'Roll back and publish')}</Button></>}>
          <ul className="space-y-1.5 text-sm text-fg">
            <li>{tx(`تُنشر نسخة من الإصدار ${rollback} كإصدار جديد ${nv}.`, `A copy of version ${rollback} is published as new version ${nv}.`)}</li>
            {changes.length > 0 && <li className="font-medium text-amber-800 dark:text-amber-300">{tx(`تعديلات المسودة الحالية (${changes.length}) تُستبدل.`, `Current draft edits (${changes.length}) are replaced.`)}</li>}
            <li>{tx('السجل لا يُحذف.', 'History is not deleted.')}</li>
          </ul>
          <Simulated />
        </Modal>
      )}
      {statusDlg && <StatusModal k={statusDlg} st={st} onClose={() => setStatusDlg(null)} />}
    </div>
  );
}

function StatusModal({ k, st, onClose }: { k: StatusKey; st: StoreStatus; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const [msg, setMsg] = useState(st.message || tx('نُحدّث المتجر وسنعود قريبًا.', 'We are updating the store and will be back soon.'));
  const [tried, setTried] = useState(false);
  const turningOn = !st[k];
  const mErr = k === 'maintenance' && turningOn ? maintenanceError(msg) : null;
  const apply = () => {
    setTried(true);
    const next = toggleStatus(st, k, msg);
    if (!next) return;
    settingsStore.set((x) => ({ ...x, status: next }));
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
        <Field label={tx('رسالة الصيانة', 'Maintenance message')} hint={<bdi dir="ltr">{msg.length} / {MAINT_MAX}</bdi>} error={tried && mErr ? (mErr === 'empty' ? tx('اكتب رسالة للعملاء', 'Write a message for shoppers') : tx(`الحد ${MAINT_MAX} حرفًا`, `Max ${MAINT_MAX} characters`)) : null}>
          {(p) => <Textarea {...p} value={msg} dir="auto" onChange={(e) => setMsg(e.target.value)} />}
        </Field>
      )}
      <Alert tone="info">{tx('الإعدادان الآخران لا يتغيران.', 'The other two settings do not change.')}</Alert>
      <Simulated />
    </Modal>
  );
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

/** A faithful-enough sketch of the homepage in the store's palette: same order, visibility and headings as the draft. */
function Preview({ draft, device, store, kind, lang }: { draft: { id: string; kind: SectionKind; heading: string; visible: boolean }[]; device: 'desktop' | 'mobile'; store: string; kind: (k: SectionKind) => string; lang: 'ar' | 'en' }) {
  const tx = useTx();
  const products = productsStore.use();
  const featured = products.filter((p) => p.status === 'active' && productPhoto(p.id)).slice(0, device === 'mobile' ? 2 : 3);
  const shown = previewSections(draft);
  const box: CSSProperties = { background: P.bg, color: P.ink, borderColor: P.line };
  return (
    <div className={cn('mx-auto overflow-hidden rounded-xl border shadow-card transition-[max-width]', device === 'mobile' ? 'max-w-[260px]' : 'max-w-full')} style={box} role="img" aria-label={tx(`معاينة: ${shown.map((s) => kind(s.kind)).join('، ')}`, `Preview: ${shown.map((s) => kind(s.kind)).join(', ')}`)}>
      <div className="flex items-center justify-between border-b px-3 py-2 text-[11px] font-bold tracking-wide" style={{ background: P.paper, borderColor: P.line }}>
        <span>{store}</span><span className="flex gap-1.5" aria-hidden="true"><span className="size-1.5 rounded-full" style={{ background: P.muted }} /><span className="size-1.5 rounded-full" style={{ background: P.muted }} /></span>
      </div>
      <div className="max-h-[520px] space-y-2 overflow-y-auto p-2 scrollbar-thin">
        {shown.length === 0 && <p className="px-3 py-10 text-center text-xs" style={{ color: P.muted }}>{tx('كل الأقسام مخفية', 'Every section is hidden')}</p>}
        {shown.map((s) => {
          if (s.kind === 'announcement') return <div key={s.id} className="rounded px-3 py-1.5 text-center text-[11px]" style={{ background: P.ink, color: '#f6efe4' }} dir="auto">{s.heading}</div>;
          if (s.kind === 'hero') return (
            <div key={s.id} className="relative overflow-hidden rounded-lg" style={{ background: P.tile }}>
              <img src={productPhoto('p1', 'large')} alt="" className="h-28 w-full object-cover" loading="lazy" />
              <div className="absolute inset-x-0 bottom-0 p-3" style={{ background: 'linear-gradient(transparent, rgb(30 27 24 / .75))' }}><p className="text-sm font-bold text-white" dir="auto">{s.heading}</p><span className="mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-semibold" style={{ background: P.paper, color: P.ink }}>{tx('تسوّق الآن', 'Shop now')}</span></div>
            </div>
          );
          if (s.kind === 'featured') return (
            <div key={s.id} className="rounded-lg p-2" style={{ background: P.paper }}>
              <p className="mb-2 text-xs font-bold" dir="auto">{s.heading}</p>
              <div className={cn('grid gap-2', device === 'mobile' ? 'grid-cols-2' : 'grid-cols-3')}>
                {featured.map((p) => <div key={p.id}><img src={productPhoto(p.id)} alt={p.name[lang]} className="aspect-square w-full rounded-md object-cover" loading="lazy" /><p className="mt-1 truncate text-[10px]">{p.name[lang]}</p></div>)}
              </div>
            </div>
          );
          if (s.kind === 'categories') return (
            <div key={s.id} className="rounded-lg p-2" style={{ background: P.paper }}>
              <p className="mb-2 text-xs font-bold" dir="auto">{s.heading}</p>
              <div className="flex flex-wrap gap-1.5">{[tx('عبايات', 'Abayas'), tx('عطور', 'Fragrance'), tx('حقائب', 'Bags'), tx('منزل', 'Home')].map((c) => <span key={c} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: P.line, background: P.sand }}>{c}</span>)}</div>
            </div>
          );
          if (s.kind === 'offers') return <div key={s.id} className="rounded-lg border-2 border-dashed px-3 py-3 text-center text-xs font-bold" style={{ borderColor: P.accent, color: P.sale }} dir="auto">{s.heading}</div>;
          if (s.kind === 'video') return <div key={s.id} className="grid h-20 place-items-center rounded-lg" style={{ background: P.ink, color: '#f6efe4' }}><span className="flex items-center gap-2 text-[11px]" dir="auto"><Play className="size-4" aria-hidden="true" />{s.heading}</span></div>;
          return (
            <div key={s.id} className="rounded-lg p-3 text-center" style={{ background: P.sand }}>
              <p className="text-xs font-bold" dir="auto">{s.heading}</p>
              <div className="mx-auto mt-2 flex max-w-48 gap-1"><span className="h-6 flex-1 rounded border" style={{ background: P.paper, borderColor: P.line }} /><span className="h-6 w-12 rounded" style={{ background: P.ink }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

