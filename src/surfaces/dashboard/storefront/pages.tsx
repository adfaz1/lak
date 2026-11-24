// Online store → Pages (`#/dashboard/storefront/pages[/<id>]`): about, contact and custom information pages,
// each in the store's languages, with a draft, a live version, its own address and SEO. The shopper store serves
// the live version at #/store/page/<slug>; menus link to pages from the Menus tab.
import { useMemo, useState } from 'react';
import { ExternalLink, EyeOff, FilePlus2, FileText, Link2, Search, Trash2, Upload } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate, replace, type Route } from '../../../core/router';
import { can, canSee } from '../../merchant/perms';
import { logAction, settingsStore } from '../../merchant/stores';
import { Badge, Button, Card, EmptyState, ErrorState, InfoHint, LinkButton, Skeleton, useTx, type Tone } from '../../../ds/ui';
import { Alert, DataTable, Field, Input, Modal, PageHeader, SaveBar, SearchInput, Switch, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import { useSessionDraft } from '../settings/drafts';
import {
  PAGE_TITLE_MAX, canDelete, discardPageDraft, newPage, pageErrors, pageState, plainText, publishPage, slugify, storeBase,
  upsertPage, type PageState, type StorePage,
} from './content';
import { contentStore } from './state';
import { StoreTabs, storeHref } from './nav';
import { RichEditor, RichView } from './rich';
import { SeoFields } from './seo-parts';

const STATE_TONE: Record<PageState, Tone> = { live: 'green', liveWithDraft: 'brand', draft: 'amber', hidden: 'gray' };
export function usePageStateLabel() {
  const tx = useTx();
  return (s: PageState) => ({ live: tx('منشورة', 'Live'), liveWithDraft: tx('منشورة · تعديلات غير منشورة', 'Live · unpublished edits'), draft: tx('مسودة لم تُنشر', 'Draft, not published'), hidden: tx('مخفية', 'Hidden') })[s];
}

export default function PagesPage({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  const id = route.path[1];
  if (!canSee(role, 'storefront')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('المتجر الإلكتروني غير متاح لدورك', 'The online store is not available for your role')} /></div>;
  return id ? <PageEditor key={id} id={id} /> : <PageList route={route} />;
}

function PageList({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const content = contentStore.use();
  const label = usePageStateLabel();
  const q = route.query.get('q') ?? '';
  const empty = state === 'empty';
  const pages = empty ? [] : content.pages;
  const shown = pages.filter((p) => !q.trim() || `${p.draft.title.ar} ${p.draft.title.en} ${p.slug}`.toLowerCase().includes(q.trim().toLowerCase()));
  const menuCount = (p: StorePage) => [...content.menus.live.header, ...content.menus.live.footer].filter((i) => i.target.kind === 'page' && i.target.id === p.id).length;
  const create = () => {
    const p = newPage(contentStore.get().pages, new Date().toISOString());
    contentStore.set((c) => ({ ...c, pages: [...c.pages, p] }));
    navigate(storeHref(`pages/${p.id}`));
  };
  const header = (
    <>
      <PageHeader title={tx('صفحات المتجر', 'Store pages')} description={tx('من نحن، تواصل معنا، وصفحات خاصة بك', 'About, contact and your own pages')}
        actions={<Button onClick={create}><FilePlus2 className="size-4" aria-hidden="true" />{tx('صفحة جديدة', 'New page')}</Button>} />
      <StoreTabs current="pages" />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<Card className="space-y-3 p-5" role="status" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-9 rounded-xl" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-20 rounded-full" /></div>)}</Card></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل الصفحات', 'Pages could not load')} onRetry={() => setDashState('live')}>{tx('الصفحات المنشورة تعمل في متجرك كما هي. المرجع SIM-PAGE-503.', 'Your live pages keep working in the store. Ref SIM-PAGE-503.')}</ErrorState></Card></div>;

  const cols: Column<StorePage>[] = [
    { key: 'title', header: tx('الصفحة', 'Page'), cell: (p) => (
      <span className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300"><FileText className="size-4" aria-hidden="true" /></span>
        <span className="min-w-0"><span className="block truncate font-semibold text-fg">{p.draft.title[lang] || p.draft.title.ar || p.draft.title.en || tx('بلا عنوان', 'Untitled')}</span><bdi dir="ltr" className="block truncate text-xs text-muted">/page/{p.slug}</bdi></span></span>
    ) },
    { key: 'state', header: tx('الحالة', 'Status'), cell: (p) => <Badge tone={STATE_TONE[pageState(p)]}>{label(pageState(p))}</Badge> },
    { key: 'menus', header: tx('في القوائم', 'In menus'), hideBelow: 'md', cell: (p) => { const n = menuCount(p); return n ? <span className="inline-flex items-center gap-1 text-[13px] text-muted"><Link2 className="size-3.5" aria-hidden="true" />{tx(`${n} رابط`, `${n} link${n > 1 ? 's' : ''}`)}</span> : <span className="text-[13px] text-subtle">—</span>; } },
    { key: 'upd', header: tx('آخر تعديل', 'Last edited'), hideBelow: 'lg', cell: (p) => <time dateTime={p.updatedAt} className="text-[13px] text-muted tabular-nums">{new Date(p.updatedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' })}</time> },
  ];
  return (
    <div className="space-y-6">
      {header}
      {pages.length === 0 ? (
        <Card><EmptyState as="h2" icon={<FileText className="size-6" aria-hidden="true" />} title={tx('لا صفحات بعد', 'No pages yet')}
          action={<Button onClick={create}><FilePlus2 className="size-4" aria-hidden="true" />{tx('أنشئ صفحة «من نحن»', 'Create an “About us” page')}</Button>}>
          {tx('صفحة تعريف بمتجرك وصفحة تواصل تزيدان ثقة العملاء.', 'An about page and a contact page build shoppers’ trust.')}
        </EmptyState></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <SearchInput value={q} onChange={(v) => replace(link('/dashboard/storefront/pages', { q: v || undefined }))} placeholder={tx('ابحث بالعنوان أو الرابط', 'Search by title or address')} />
            <span className="text-xs text-muted tabular-nums">{tx(`${shown.length} من ${pages.length}`, `${shown.length} of ${pages.length}`)}</span>
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={<Search className="size-6" aria-hidden="true" />} title={tx('لا صفحات تطابق بحثك', 'No pages match your search')} action={<LinkButton variant="secondary" href={storeHref('pages')}>{tx('امسح البحث', 'Clear search')}</LinkButton>} />
          ) : (
            <DataTable label={tx('صفحات المتجر', 'Store pages')} rows={shown} rowKey={(p) => p.id} columns={cols} href={(p) => storeHref(`pages/${p.id}`)}
              card={(p) => (
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300"><FileText className="size-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1 space-y-1.5"><p className="truncate text-sm font-semibold text-fg">{p.draft.title[lang] || p.draft.title.ar || tx('بلا عنوان', 'Untitled')}</p><bdi dir="ltr" className="block truncate text-xs text-muted">/page/{p.slug}</bdi><Badge tone={STATE_TONE[pageState(p)]}>{label(pageState(p))}</Badge></div>
                </div>
              )} />
          )}
        </Card>
      )}
    </div>
  );
}

function PageEditor({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const content = contentStore.use();
  const settings = settingsStore.use();
  const label = usePageStateLabel();
  const saved = content.pages.find((p) => p.id === id);
  const [draft, setDraft, clearDraft] = useSessionDraft<StorePage | null>(`page:${id}`, saved ?? null);
  const [tried, setTried] = useState(false);
  const [dlg, setDlg] = useState<'publish' | 'delete' | 'hide' | null>(null);
  const [saving, setSaving] = useState(false);
  const canPub = can(role, 'theme.publish');
  const p = draft ?? saved;
  const dirty = !!saved && !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useUnsaved(dirty, { ar: 'تعديلات الصفحة', en: 'Page edits' });
  const langs = settings.storeLangs;
  const errors = useMemo(() => (p ? pageErrors(p, content.pages, langs) : {}), [p, content.pages, langs]);
  const base = storeBase(settings.domain);
  const back = { href: storeHref('pages'), label: tx('الصفحات', 'Pages') };

  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={tx('صفحة', 'Page')} /><Card className="space-y-4 p-5" role="status" aria-label="Loading"><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></Card></div>;
  if (state === 'error') return <div className="space-y-6"><PageHeader back={back} title={tx('صفحة', 'Page')} /><Card><ErrorState as="h2" title={tx('تعذّر تحميل الصفحة', 'The page could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-PAGE-503.', 'Nothing changed. Ref SIM-PAGE-503.')}</ErrorState></Card></div>;
  if (!p || !saved) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('الصفحة غير موجودة', 'Page not found')} />
      <Card><EmptyState as="h2" icon={<FileText className="size-6" aria-hidden="true" />} title={tx('لم نجد هذه الصفحة', 'We couldn’t find this page')} action={<LinkButton variant="secondary" href={storeHref('pages')}>{tx('كل الصفحات', 'All pages')}</LinkButton>}>{tx('ربما حُذفت.', 'It may have been deleted.')}</EmptyState></Card></div>
  );

  const set = (patch: Partial<StorePage>) => setDraft({ ...p, ...patch });
  const setC = (k: 'title' | 'body', l: 'ar' | 'en', v: string) => set({ draft: { ...p.draft, [k]: { ...p.draft[k], [l]: v } } });
  const st = pageState(saved);
  const now = () => new Date().toISOString();
  const name = p.draft.title[lang] || p.draft.title.ar || p.draft.title.en || tx('بلا عنوان', 'Untitled');
  const hasErr = Object.keys(errors).length > 0;
  const commit = (next: StorePage, msg: string, audit: { ar: string; en: string }) => {
    setSaving(true);
    window.setTimeout(() => {
      contentStore.set((c) => ({ ...c, pages: upsertPage(c.pages, next) }));
      clearDraft();
      setSaving(false);
      logAction('store', audit, { target: `/page/${next.slug}` });
      toast({ tone: 'ok', text: msg });
    }, 400);
  };
  const saveDraft = () => { setTried(true); if (errors.slug) return; commit({ ...p, updatedAt: now() }, tx('حُفظت المسودة؛ المنشور لم يتغير', 'Draft saved; the live page is unchanged'), { ar: `حفظ مسودة صفحة «${p.draft.title.ar || p.slug}»`, en: `Saved a draft of the page “${p.draft.title.en || p.slug}”` }); };
  const menus = [...content.menus.live.header, ...content.menus.live.footer].filter((i) => i.target.kind === 'page' && i.target.id === p.id).length;
  const shown = (['ar', 'en'] as const).filter((l) => langs[l]);
  const errText = (k: keyof typeof errors) => !tried || !errors[k] ? null
    : k === 'slug' ? ({ empty: tx('أدخل رابطًا', 'Enter an address'), format: tx('حروف إنجليزية صغيرة وأرقام وشرطات فقط', 'Lowercase English letters, digits and hyphens only'), reserved: tx('هذا الرابط محجوز للمتجر', 'This address is reserved by the store'), taken: tx('صفحة أخرى تستخدم هذا الرابط', 'Another page uses this address') } as Record<string, string>)[errors.slug!]
      : errors[k] === 'long' ? tx(`${PAGE_TITLE_MAX} حرفًا كحد أقصى`, `${PAGE_TITLE_MAX} characters maximum`) : tx('مطلوب للنشر', 'Required to publish');

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={name}
        meta={<><Badge tone={STATE_TONE[st]}>{label(st)}</Badge>{draft && dirty && <Badge tone="amber">{tx('تعديلات لم تُحفظ', 'Unsaved edits')}</Badge>}</>}
        actions={<>
          {saved.live && !saved.hidden && <LinkButton variant="secondary" href={link(`/store/page/${saved.slug}`)} target="_blank" rel="noopener"><ExternalLink className="size-4" aria-hidden="true" />{tx('افتح في المتجر', 'Open in store')}</LinkButton>}
          {canPub ? <Button disabled={dirty === false && st === 'live'} onClick={() => { setTried(true); if (!hasErr) setDlg('publish'); }}><Upload className="size-4" aria-hidden="true" />{tx('راجع وانشر', 'Review and publish')}</Button>
            : <Locked>{tx('النشر للمالك', 'Publishing is for the Owner')}</Locked>}
        </>} />
      <ReviewRole />
      {tried && hasErr && <Alert tone="bad" title={tx('أكمل الحقول المعلّمة قبل النشر', 'Complete the marked fields before publishing')} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {shown.map((l) => (
                <Field key={l} label={tx(`العنوان · ${l === 'ar' ? 'العربية' : 'الإنجليزية'}`, `Title · ${l === 'ar' ? 'Arabic' : 'English'}`)} error={errText(l === 'ar' ? 'titleAr' : 'titleEn')}>
                  {(f) => <Input {...f} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} maxLength={PAGE_TITLE_MAX + 10} value={p.draft.title[l]}
                    onChange={(e) => { const v = e.target.value; const patch: Partial<StorePage> = { draft: { ...p.draft, title: { ...p.draft.title, [l]: v } } }; if (l === 'en' && p.kind === 'custom' && !saved.live && (p.slug.startsWith('page-') || p.slug === slugify(p.draft.title.en))) patch.slug = slugify(v) || p.slug; set(patch); }} />}
                </Field>
              ))}
            </div>
            {shown.map((l) => (
              <div key={l} className="space-y-1.5">
                <p className="text-[13px] font-semibold text-fg">{tx(`المحتوى · ${l === 'ar' ? 'العربية' : 'الإنجليزية'}`, `Content · ${l === 'ar' ? 'Arabic' : 'English'}`)}{p.kind === 'contact' && <span className="ms-1.5 font-normal text-subtle">{tx('(اختياري)', '(optional)')}</span>}</p>
                <RichEditor id={`pg-body-${l}`} lang={l} label={tx('المحتوى', 'Content')} value={p.draft.body[l]} onChange={(v) => setC('body', l, v)} invalid={tried && !!errors.body && !p.draft.body[l].trim()} />
                {tried && errors.body && !p.draft.body[l].trim() && <p className="text-xs font-medium text-red-600 dark:text-red-400">{tx('مطلوب للنشر', 'Required to publish')}</p>}
              </div>
            ))}
            {p.kind === 'contact' && <p className="text-xs text-muted">{tx('بريد وجوال التواصل يظهران تلقائيًا من بيانات المتجر.', 'The contact email and mobile are added from store details.')}</p>}
          </Card>
          <SeoFields title={p.seo.title} desc={p.seo.desc} url={`${base}/page/${p.slug}`} fallbackTitle={p.draft.title} fallbackDesc={{ ar: plainText(p.draft.body.ar), en: plainText(p.draft.body.en) }} langs={langs}
            onChange={(seo) => set({ seo })} />
        </div>
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <Field label={<>{tx('رابط الصفحة', 'Page address')}<InfoHint>{tx('تغيير رابط صفحة منشورة يكسر الروابط القديمة المشارَكة.', 'Changing a live page’s address breaks old shared links.')}</InfoHint></>} error={errText('slug')}
              hint={<bdi dir="ltr" className="break-all">{base}/page/{p.slug || '…'}</bdi>}>
              {(f) => <Input {...f} dir="ltr" value={p.slug} disabled={p.kind !== 'custom'} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />}
            </Field>
            {saved.live && (
              <div className="flex items-center gap-3 border-t border-border pt-4">
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{tx('ظاهرة للعملاء', 'Visible to shoppers')}</p><p className="text-xs text-muted">{saved.hidden ? tx('مخفية؛ روابط القوائم إليها لا تظهر', 'Hidden; menu links to it don’t show') : tx('تُعرض على رابطها', 'Served at its address')}</p></div>
                <Switch checked={!saved.hidden} disabled={!canPub} label={tx('ظاهرة للعملاء', 'Visible to shoppers')} onChange={() => setDlg('hide')} />
              </div>
            )}
            <p className="flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted"><Link2 className="size-3.5" aria-hidden="true" />{menus ? tx(`مرتبطة من ${menus} عنصر قائمة`, `Linked from ${menus} menu item${menus > 1 ? 's' : ''}`) : tx('غير مرتبطة بأي قائمة', 'Not linked from any menu')}
              <a href={storeHref('menus')} className="ms-auto font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('القوائم', 'Menus')}</a></p>
          </Card>
          {(saved.live && st === 'liveWithDraft') || canDelete(saved) ? (
            <Card className="space-y-2 p-5">
              {saved.live && st === 'liveWithDraft' && <Button variant="secondary" className="w-full" onClick={() => { clearDraft(); contentStore.set((c) => ({ ...c, pages: upsertPage(c.pages, discardPageDraft(saved)) })); toast({ tone: 'ok', text: tx('أُعيدت المسودة إلى المنشور', 'Draft reset to the live page') }); }}>{tx('أعد المسودة إلى المنشور', 'Reset draft to live')}</Button>}
              {canDelete(saved) && canPub && <Button variant="ghost" className="w-full text-red-700 dark:text-red-400" onClick={() => setDlg('delete')}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف الصفحة', 'Delete page')}</Button>}
            </Card>
          ) : null}
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} saveLabel={tx('احفظ كمسودة', 'Save draft')} onSave={saveDraft} onDiscard={() => { clearDraft(); setTried(false); }}
        error={tried && errors.slug ? tx('صحّح رابط الصفحة ثم احفظ', 'Fix the page address, then save') : undefined} />

      {dlg === 'publish' && (
        <Modal size="lg" title={tx(`نشر «${name}»`, `Publish “${name}”`)} onClose={() => setDlg(null)}
          description={tx('يراها العملاء فورًا على رابطها وفي القوائم التي تربط إليها.', 'Shoppers see it immediately at its address and in menus that link to it.')}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setDlg(null); commit(publishPage(p, now()), tx('نُشرت الصفحة في المتجر', 'Page published to the store'), { ar: `نشر صفحة «${p.draft.title.ar || p.slug}»`, en: `Published the page “${p.draft.title.en || p.slug}”` }); }}>{tx('انشر في المتجر', 'Publish to store')}</Button></>}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">{tx('الرابط', 'Address')}</dt><dd><bdi dir="ltr" className="break-all font-medium text-fg">{base}/page/{p.slug}</bdi></dd></div>
            <div><dt className="text-xs text-muted">{tx('في القوائم', 'In menus')}</dt><dd className="font-medium text-fg">{menus ? tx(`${menus} رابط يظهر`, `${menus} link${menus > 1 ? 's' : ''} will show`) : tx('لا روابط؛ أضفها من «القوائم»', 'No links; add one in Menus')}</dd></div>
          </dl>
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((l) => (
              <figure key={l} className="min-w-0 rounded-xl bg-surface-2 p-3" dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l}>
                <figcaption className="mb-2 text-xs font-semibold text-muted">{l === 'ar' ? 'ما يراه العميل بالعربية' : 'What an English shopper sees'}</figcaption>
                <p className="mb-2 text-base font-bold text-fg">{p.draft.title[l]}</p>
                <div className="max-h-44 overflow-y-auto"><RichView src={p.draft.body[l]} /></div>
              </figure>
            ))}
          </div>
        </Modal>
      )}
      {dlg === 'hide' && (
        <Modal title={saved.hidden ? tx('إظهار الصفحة', 'Show the page') : tx('إخفاء الصفحة', 'Hide the page')} onClose={() => setDlg(null)}
          description={saved.hidden ? tx('تعود الصفحة على رابطها وتظهر روابط القوائم إليها.', 'The page returns at its address and menu links to it show again.') : tx('يرى من يفتح الرابط «الصفحة غير موجودة»، وتختفي روابط القوائم إليها. المحتوى يبقى محفوظًا.', 'Anyone opening the address sees “page not found” and menu links to it disappear. The content is kept.')}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { const next = { ...saved, hidden: !saved.hidden, updatedAt: now() }; setDlg(null); commit(next, saved.hidden ? tx('ظهرت الصفحة', 'Page shown') : tx('أُخفيت الصفحة', 'Page hidden'), saved.hidden ? { ar: `أظهر صفحة «${saved.draft.title.ar}»`, en: `Showed the page “${saved.draft.title.en}”` } : { ar: `أخفى صفحة «${saved.draft.title.ar}»`, en: `Hid the page “${saved.draft.title.en}”` }); }}>{saved.hidden ? <>{tx('أظهر', 'Show')}</> : <><EyeOff className="size-4" aria-hidden="true" />{tx('أخفِ', 'Hide')}</>}</Button></>} />
      )}
      {dlg === 'delete' && (
        <Modal title={tx(`حذف «${name}»`, `Delete “${name}”`)} onClose={() => setDlg(null)}
          description={tx('لا يمكن التراجع. من يفتح الرابط يرى «الصفحة غير موجودة».', 'This can’t be undone. Anyone opening the address sees “page not found”.')}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            contentStore.set((c) => ({ ...c, pages: c.pages.filter((x) => x.id !== saved.id) }));
            clearDraft(); setDlg(null);
            logAction('store', { ar: `حذف صفحة «${saved.draft.title.ar || saved.slug}»`, en: `Deleted the page “${saved.draft.title.en || saved.slug}”` }, { target: `/page/${saved.slug}` });
            toast({ tone: 'ok', text: tx('حُذفت الصفحة', 'Page deleted') });
            navigate(storeHref('pages'));
          }}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button></>}>
          {menus > 0 && <Alert tone="warn">{tx(`${menus} عنصر قائمة يشير إليها سيتوقف عن الظهور حتى تعدّله.`, `${menus} menu item${menus > 1 ? 's' : ''} pointing to it will stop showing until you edit ${menus > 1 ? 'them' : 'it'}.`)}</Alert>}
        </Modal>
      )}
    </div>
  );
}
