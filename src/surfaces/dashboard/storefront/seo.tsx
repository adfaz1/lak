// Online store → SEO (`#/dashboard/storefront/seo`): the store's search listing (title, description, indexing),
// sitemap.xml and robots.txt status, and the SEO health of every product and page sold online, with quick fixes.
// Generating files and reaching search engines is simulated; the shopper store uses the titles for its tab title.
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCode2, Map as MapIcon, RefreshCw } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { can, canSee } from '../../merchant/perms';
import { levelsStore, logAction, productsStore, settingsStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, LinkButton, ProductImage, Skeleton, useTx } from '../../../ds/ui';
import { DataTable, Drawer, Field, FilterChip, Input, Modal, PageHeader, SaveBar, Simulated, Switch, Textarea, useToast, type Column } from '../../../ds/kit';
import { linkContext } from '../../storefront/bridge';
import { productPhoto } from '../model/media';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { NoAccess, ReviewRole, useRole } from '../marketing/access';
import { useSessionDraft } from '../settings/drafts';
import { sectionHref } from '../pages';
import { DESC_MAX, TITLE_MAX, pageState, productSeoRows, robotsTxt, sitemapUrls, storeBase, type ProductSeoRow, type StoreSeo } from './content';
import { contentStore } from './state';
import { StoreTabs, storeHref } from './nav';
import { LenHint, SeoFields, SerpPreview } from './seo-parts';

export default function SeoPage({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const review = useReviewMode();
  const content = contentStore.use();
  const settings = settingsStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const [seo, setSeo, clearSeo] = useSessionDraft<StoreSeo>('seo:store', content.seo);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'sitemap' | 'robots' | 'noindex' | null>(null);
  const [edit, setEdit] = useState<ProductSeoRow | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [genError, setGenError] = useState(false);
  const dirty = JSON.stringify(seo) !== JSON.stringify(content.seo);
  useUnsaved(dirty, { ar: 'إعدادات محركات البحث', en: 'SEO settings' });
  const base = storeBase(settings.domain);
  const ctx = useMemo(() => linkContext(products, levels, content.pages, settings.policies), [products, levels, content.pages, settings.policies]);
  const urls = useMemo(() => sitemapUrls(base, { ...ctx, productSlugs: Object.fromEntries(products.map((p) => [p.id, p.seo.slug])) }), [base, ctx, products]);
  const rows = productSeoRows(products);
  const only = route.query.get('f') === 'issues';
  const shownRows = only ? rows.filter((r) => r.issues.length) : rows;
  const withIssues = rows.filter((r) => r.issues.length).length;
  const canEditProducts = can(role, 'product.edit');
  const canSettings = can(role, 'theme.publish');

  if (!canSee(role, 'storefront')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('المتجر الإلكتروني غير متاح لدورك', 'The online store is not available for your role')} /></div>;
  const header = (
    <>
      <PageHeader title={tx('محركات البحث', 'Search engines (SEO)')} description={tx('كيف يظهر متجرك في نتائج البحث', 'How your store shows up in search results')}
        meta={<Badge tone={seo.indexing ? 'green' : 'amber'}>{content.seo.indexing ? tx('مسموح بالفهرسة', 'Indexing allowed') : tx('الفهرسة متوقفة', 'Indexing off')}</Badge>} />
      <StoreTabs current="seo" />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<div className="grid gap-6 lg:grid-cols-3" role="status" aria-label="Loading"><Skeleton className="h-80 rounded-2xl lg:col-span-2" /><Skeleton className="h-60 rounded-2xl" /></div></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل إعدادات البحث', 'SEO settings could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير ظهور متجرك. المرجع SIM-SEO-503.', 'Your store’s listing hasn’t changed. Ref SIM-SEO-503.')}</ErrorState></Card></div>;
  const empty = state === 'empty';

  const save = () => {
    setSaving(true);
    window.setTimeout(() => {
      const before = content.seo;
      contentStore.set((c) => ({ ...c, seo }));
      clearSeo(); setSaving(false);
      logAction('store', before.indexing !== seo.indexing
        ? (seo.indexing ? { ar: 'سمح لمحركات البحث بفهرسة المتجر', en: 'Allowed search engines to index the store' } : { ar: 'أوقف فهرسة المتجر في محركات البحث', en: 'Stopped search engines indexing the store' })
        : { ar: 'عدّل عنوان ووصف المتجر في محركات البحث', en: 'Edited the store’s search title and description' }, { before: before.title.ar, after: seo.title.ar });
      toast({ tone: 'ok', text: tx('حُفظت إعدادات البحث', 'SEO settings saved') });
    }, 400);
  };
  const regenerate = () => {
    setRegenerating(true); setGenError(false);
    window.setTimeout(() => {
      setRegenerating(false);
      if (failNext) { setGenError(true); setFailNext(false); return; }
      contentStore.set((c) => ({ ...c, sitemapAt: new Date().toISOString() }));
      toast({ tone: 'ok', text: tx(`أُعيد توليد خريطة الموقع (${urls.length} رابط)`, `Sitemap regenerated (${urls.length} URLs)`) });
    }, 700);
  };
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const ISSUE: Record<ProductSeoRow['issues'][number], string> = { noTitle: tx('بلا عنوان', 'No title'), longTitle: tx('عنوان طويل', 'Long title'), noDesc: tx('بلا وصف', 'No description'), longDesc: tx('وصف طويل', 'Long description'), slug: tx('رابط غير صالح', 'Invalid address'), dupSlug: tx('رابط مكرر', 'Repeated address') };
  const cols: Column<ProductSeoRow>[] = [
    { key: 'p', header: tx('المنتج', 'Product'), cell: (r) => <span className="flex items-center gap-3"><ProductImage src={productPhoto(r.id)} alt="" size={36} /><span className="min-w-0"><span className="block truncate font-semibold text-fg">{r.name[lang]}</span><bdi dir="ltr" className="block truncate text-xs text-muted">/p/{r.slug || '—'}</bdi></span></span> },
    { key: 't', header: tx('عنوان البحث', 'Search title'), hideBelow: 'lg', cell: (r) => <span className="line-clamp-1 text-[13px] text-muted" dir="auto">{r.title || '—'}</span> },
    { key: 'i', header: tx('الحالة', 'Status'), cell: (r) => r.issues.length ? <span className="flex flex-wrap gap-1">{r.issues.map((i) => <Badge key={i} tone="amber">{ISSUE[i]}</Badge>)}</span> : <Badge tone="green">{tx('جيد', 'Good')}</Badge> },
    { key: 'a', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', cell: (r) => canEditProducts ? <Button variant="ghost" size="sm" onClick={() => setEdit(r)}>{r.issues.length ? tx('أصلِح', 'Fix') : tx('عدّل', 'Edit')}</Button> : null },
  ];

  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SeoFields heading={tx('ظهور المتجر في البحث', 'Store search listing')} title={seo.title} desc={seo.desc} url={`${base}/`} langs={settings.storeLangs}
            fallbackTitle={{ ar: settings.store.name, en: settings.store.name }} fallbackDesc={{ ar: '', en: '' }} onChange={(v) => setSeo({ ...seo, ...v })} />
          <Card aria-labelledby="seo-idx">
            <div className="flex items-center gap-3 p-5">
              <div className="min-w-0 flex-1">
                <h2 id="seo-idx" className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">{tx('السماح لمحركات البحث', 'Let search engines index the store')}<InfoHint>{tx('عند الإيقاف يطلب robots.txt من محركات البحث عدم فهرسة أي صفحة. الصفحات الحالية قد تبقى في النتائج أيامًا.', 'When off, robots.txt asks search engines not to index any page. Pages already listed may stay in results for days.')}</InfoHint></h2>
                <p className="mt-0.5 text-xs text-muted">{seo.indexing ? tx('صفحات السلة والدفع والحساب لا تُفهرس أبدًا', 'Cart, checkout and account are never indexed') : tx('لن يظهر متجر جديد في البحث', 'The store will not appear in search')}</p>
              </div>
              <Switch checked={seo.indexing} disabled={!canSettings} label={tx('السماح بالفهرسة', 'Allow indexing')} onChange={(v) => (v ? setSeo({ ...seo, indexing: true }) : setView('noindex'))} />
            </div>
          </Card>
        </div>
        <Card aria-labelledby="seo-files" className="self-start">
          <CardHeader id="seo-files" title={tx('ملفات محركات البحث', 'Search engine files')} action={<Simulated />} />
          <ul className="divide-y divide-border border-t border-border text-sm">
            <li className="flex items-start gap-3 px-5 py-4">
              <MapIcon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg">sitemap.xml</p>
                <p className="text-xs text-muted tabular-nums">{content.seo.indexing ? tx(`${urls.length} رابط · حُدّث ${when(content.sitemapAt)}`, `${urls.length} URLs · updated ${when(content.sitemapAt)}`) : tx('لا يُرسل أثناء إيقاف الفهرسة', 'Not submitted while indexing is off')}</p>
                {genError && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400"><AlertTriangle className="size-3.5" aria-hidden="true" />{tx('فشل التوليد (SIM-SEO-502). الملف السابق ما زال يعمل.', 'Generation failed (SIM-SEO-502). The previous file still works.')}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setView('sitemap')}>{tx('اعرض', 'View')}</Button>
                  <Button size="sm" variant="ghost" disabled={regenerating || !content.seo.indexing} onClick={regenerate}><RefreshCw className="size-4" aria-hidden="true" />{regenerating ? tx('جارٍ التوليد…', 'Generating…') : genError ? tx('أعد المحاولة', 'Retry') : tx('أعد التوليد', 'Regenerate')}</Button>
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3 px-5 py-4">
              <FileCode2 className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg">robots.txt</p>
                <p className="text-xs text-muted">{content.seo.indexing ? tx('يسمح بالفهرسة ويستثني السلة والدفع', 'Allows indexing, excludes cart and checkout') : tx('يمنع كل الصفحات', 'Blocks every page')}</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => setView('robots')}>{tx('اعرض', 'View')}</Button>
              </div>
            </li>
            <li className="flex items-start gap-3 px-5 py-4">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-subtle" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="font-semibold text-fg">{tx('Google Search Console', 'Google Search Console')}</p><p className="text-xs text-muted">{tx('غير مربوط · الربط يحتاج خادم «لك»', 'Not connected · needs the LAK server')}</p></div>
            </li>
          </ul>
          {review && <label className="flex items-center gap-2 border-t border-dashed border-border px-5 py-3 text-xs text-muted"><Switch checked={failNext} onChange={setFailNext} label={tx('حاكِ فشل التوليد التالي', 'Fail the next generation')} />{tx('حاكِ فشل التوليد التالي', 'Fail the next generation')}</label>}
        </Card>
      </div>

      <Card aria-labelledby="seo-prod" className="overflow-hidden">
        <CardHeader id="seo-prod" title={tx('المنتجات في البحث', 'Products in search')} hint={tx('عنوان ووصف ورابط كل منتج يُباع في المتجر الإلكتروني.', 'Title, description and address of every product sold online.')}
          action={<span className="text-xs text-muted tabular-nums">{withIssues ? tx(`${withIssues} تحتاج إصلاحًا`, `${withIssues} need a fix`) : tx('كلها جيدة', 'All good')}</span>} />
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <FilterChip label={tx('العرض', 'Show')} value={only ? 'issues' : ''} onChange={(v) => replace(link('/dashboard/storefront/seo', { f: v || undefined }))}
            options={[{ value: '', label: tx('كل المنتجات', 'All products') }, { value: 'issues', label: tx('تحتاج إصلاحًا', 'Need a fix') }]} />
        </div>
        {empty || rows.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="size-6" aria-hidden="true" />} title={tx('لا منتجات تُباع في المتجر الإلكتروني', 'No products sold online')} action={<LinkButton variant="secondary" href={sectionHref('products')}>{tx('المنتجات', 'Products')}</LinkButton>} />
        ) : shownRows.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="size-6" aria-hidden="true" />} title={tx('لا منتجات تحتاج إصلاحًا', 'No products need a fix')} action={<LinkButton variant="secondary" href={storeHref('seo')}>{tx('اعرض الكل', 'Show all')}</LinkButton>} />
        ) : (
          <DataTable label={tx('ظهور المنتجات في البحث', 'Product search listings')} rows={shownRows} rowKey={(r) => r.id} columns={cols}
            card={(r) => (
              <div className="flex items-start gap-3">
                <ProductImage src={productPhoto(r.id)} alt="" size={40} />
                <div className="min-w-0 flex-1 space-y-1.5"><p className="truncate text-sm font-semibold text-fg">{r.name[lang]}</p><bdi dir="ltr" className="block truncate text-xs text-muted">/p/{r.slug}</bdi>
                  <span className="flex flex-wrap gap-1">{r.issues.length ? r.issues.map((i) => <Badge key={i} tone="amber">{ISSUE[i]}</Badge>) : <Badge tone="green">{tx('جيد', 'Good')}</Badge>}</span></div>
                {canEditProducts && <Button variant="secondary" size="sm" onClick={() => setEdit(r)}>{r.issues.length ? tx('أصلِح', 'Fix') : tx('عدّل', 'Edit')}</Button>}
              </div>
            )} />
        )}
      </Card>

      <Card aria-labelledby="seo-pages">
        <CardHeader id="seo-pages" title={tx('الصفحات في البحث', 'Pages in search')} />
        <ul className="divide-y divide-border border-t border-border">
          {content.pages.map((p) => {
            const has = !!(p.seo.title.ar || p.seo.title.en);
            return (
              <li key={p.id}><a href={storeHref(`pages/${p.id}`)} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2/60">
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{p.draft.title[lang] || p.slug}</span>
                {pageState(p) === 'draft' ? <Badge>{tx('غير منشورة', 'Not published')}</Badge> : has ? <Badge tone="green">{tx('عنوان بحث مخصص', 'Custom search title')}</Badge> : <Badge tone="gray">{tx('يستخدم عنوان الصفحة', 'Uses the page title')}</Badge>}
              </a></li>
            );
          })}
        </ul>
      </Card>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={clearSeo} />

      {view === 'sitemap' && (
        <Modal size="lg" title="sitemap.xml" description={tx(`${urls.length} رابط: الرئيسية والتصنيفات والمنتجات والصفحات والسياسات المنشورة.`, `${urls.length} URLs: home, categories, products, and published pages and policies.`)} onClose={() => setView(null)}
          footer={<Button variant="secondary" onClick={() => setView(null)}>{tx('إغلاق', 'Close')}</Button>}>
          <ol dir="ltr" className="max-h-80 space-y-1 overflow-y-auto rounded-xl bg-surface-2 p-3 text-start text-xs">{urls.map((u) => <li key={u} className="break-all font-mono text-fg">{u}</li>)}</ol>
        </Modal>
      )}
      {view === 'robots' && (
        <Modal title="robots.txt" onClose={() => setView(null)} footer={<Button variant="secondary" onClick={() => setView(null)}>{tx('إغلاق', 'Close')}</Button>}>
          <pre dir="ltr" className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs text-fg">{robotsTxt(base, content.seo.indexing)}</pre>
        </Modal>
      )}
      {view === 'noindex' && (
        <Modal title={tx('إيقاف الفهرسة؟', 'Stop indexing?')} onClose={() => setView(null)}
          description={tx('بعد الحفظ تتوقف محركات البحث عن إضافة صفحاتك، وقد تختفي الصفحات الحالية من النتائج تدريجيًا. الزوار من الروابط المباشرة لا يتأثرون.', 'After you save, search engines stop adding your pages and existing ones may drop out of results over time. Visitors from direct links are not affected.')}
          footer={<><Button variant="secondary" onClick={() => setView(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { setSeo({ ...seo, indexing: false }); setView(null); }}>{tx('أوقف الفهرسة', 'Stop indexing')}</Button></>} />
      )}
      {edit && <ProductSeoDrawer row={edit} base={base} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ProductSeoDrawer({ row, base, onClose }: { row: ProductSeoRow; base: string; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const products = productsStore.use();
  const [title, setTitle] = useState(row.title || row.name.en);
  const [desc, setDesc] = useState(row.desc);
  const [slug, setSlug] = useState(row.slug);
  const [tried, setTried] = useState(false);
  const slugBad = !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? 'format' : products.some((p) => p.id !== row.id && p.seo.slug === slug && p.status === 'active') ? 'taken' : null;
  const save = () => {
    setTried(true);
    if (slugBad || !title.trim()) return;
    productsStore.set((list) => list.map((p) => (p.id === row.id ? { ...p, seo: { title: title.trim(), desc: desc.trim(), slug }, version: p.version + 1 } : p)));
    logAction('products', { ar: `عدّل ظهور «${row.name.ar}» في البحث`, en: `Edited the search listing of “${row.name.en}”` }, { target: row.id, before: row.slug, after: slug });
    toast({ tone: 'ok', text: tx('حُفظ ظهور المنتج في البحث', 'Product search listing saved') });
    onClose();
  };
  return (
    <Drawer title={tx(`البحث: ${row.name.ar}`, `Search: ${row.name.en}`)} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{tx('احفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        <Field label={tx('عنوان البحث', 'Search title')} error={tried && !title.trim() ? tx('مطلوب', 'Required') : null} hint={<LenHint value={title} max={TITLE_MAX} />}>
          {(f) => <Input {...f} dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label={tx('الوصف', 'Description')} hint={<LenHint value={desc} max={DESC_MAX} />}>
          {(f) => <Textarea {...f} rows={3} dir="auto" value={desc} onChange={(e) => setDesc(e.target.value)} />}
        </Field>
        <Field label={tx('رابط المنتج', 'Product address')} error={tried && slugBad ? (slugBad === 'taken' ? tx('منتج آخر يستخدم هذا الرابط', 'Another product uses this address') : tx('حروف إنجليزية صغيرة وأرقام وشرطات', 'Lowercase letters, digits and hyphens')) : null}
          hint={<bdi dir="ltr" className="break-all">{base}/p/{slug}</bdi>}>
          {(f) => <Input {...f} dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} />}
        </Field>
        <SerpPreview url={`${base}/p/${slug}`} title={title} desc={desc || row.name[lang]} lang={/[؀-ۿ]/.test(title) ? 'ar' : 'en'} />
        <p className="text-xs text-muted">{tx('باقي بيانات المنتج في محرر المنتج.', 'Other product details are in the product editor.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={sectionHref('products', row.id)}>{tx('افتح المنتج', 'Open product')}</a></p>
      </div>
    </Drawer>
  );
}
