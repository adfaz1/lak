// Online store → Landing pages (`#/dashboard/storefront/landing[/<id>|/new]`): campaign pages built from blocks
// (hero, product picks, countdown to the offer's end, coupon reveal, FAQ, interest list), linked to a coupon, an
// automatic offer or a collection, with their own address, SEO and share card, a publish window, and results from the
// order book. Shoppers see the live version at #/store/lp/<slug>.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ExternalLink, Megaphone, Plus, Search, Upload } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate, replace, type Route } from '../../../core/router';
import { can, canSee } from '../../merchant/perms';
import { collectionsStore, couponsStore, currentActor, levelsStore, logAction, ordersStore, productsStore, settingsStore } from '../../merchant/stores';
import { collectionMembers } from '../../merchant/catalog';
import { sellable, toStoreProducts } from '../../storefront/bridge';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LinkButton, Money, Segmented, Skeleton, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, FilterChip, Input, Modal, PageHeader, SaveBar, SearchInput, Select, Simulated, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import { useSessionDraft } from '../settings/drafts';
import { sectionHref } from '../pages';
import { storeBase } from './content';
import { landingStore, lpAttributionStore, lpStatsStore } from './state';
import { StoreTabs, storeHref } from './nav';
import { SeoFields } from './seo-parts';
import {
  LP_KINDS, canAdd, discardLandingDraft, lpErrors, lpHasEdits, lpResults, lpState, lpWarnings, linkedCoupon, moveBlock, newBlock, newLanding,
  publishLanding, riyadhMs, unpublishLanding, utmCampaign, type LandingPage, type LpCtx, type LpLink, type LpState,
} from './landing-model';
import { BlockCard, K_ICON, LP_TONE, LandingPreview, ResultsCard, ShareCard, useLpLabels } from './landing-parts';

const STATES: LpState[] = ['live', 'scheduled', 'draft', 'ended', 'off'];
const nowIso = () => new Date().toISOString();

/** Everything the rules need about the merchant's offers, collections and products, read live. */
export function useLpCtx(): LpCtx {
  const coupons = couponsStore.use();
  const collections = collectionsStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const langs = settingsStore.use().storeLangs;
  return useMemo(() => {
    const live = toStoreProducts(products, levels).map((p) => p.id);
    const stockOf = (p: (typeof products)[number]) => (p.type === 'digital' ? null : (p.variants.length ? p.variants.map((v) => v.sku) : [p.sku]).reduce((n, sku) => n + sellable(levels, sku), 0));
    return { coupons, collections: collections.map((c) => ({ id: c.id, productIds: collectionMembers(c, products, stockOf).map((m) => m.id) })), liveProducts: live, langs, now: Date.now() };
  }, [coupons, collections, products, levels, langs]);
}

export default function LandingPages({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  const id = route.path[1];
  const made = useRef(false);
  useEffect(() => {
    if (id !== 'new' || !canSee(role, 'storefront') || made.current) return;
    made.current = true;
    const q = route.query;
    const link: LpLink = q.get('coupon') ? { kind: 'coupon', code: q.get('coupon')! } : { kind: 'none' };
    const p = newLanding(landingStore.get(), nowIso(), currentActor().name, { name: q.get('name') ?? '', start: q.get('start') ? `${q.get('start')}T00:00` : '', end: q.get('end') ? `${q.get('end')}T23:59` : '', link });
    landingStore.set((l) => [...l, p]);
    logAction('store', { ar: `أنشأ صفحة هبوط «${p.name || p.slug}» كمسودة`, en: `Created landing page “${p.name || p.slug}” as a draft` }, { target: `/lp/${p.slug}` });
    replace(storeHref(`landing/${p.id}`));
  }, [id, role, route.query]);
  if (!canSee(role, 'storefront')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('المتجر الإلكتروني غير متاح لدورك', 'The online store is not available for your role')} /></div>;
  if (id === 'new') return <div className="space-y-6" aria-busy="true"><Skeleton className="h-10 w-60" /><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  return id ? <LandingEditor key={id} id={id} /> : <LandingList route={route} />;
}

function LandingList({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const pages = landingStore.use();
  const orders = ordersStore.use();
  const attribution = lpAttributionStore.use();
  const stats = lpStatsStore.use();
  const L = useLpLabels();
  const now = Date.now();
  const q = route.query.get('q') ?? '';
  const st = route.query.get('state') ?? '';
  const go = (patch: Record<string, string | undefined>) => replace(link('/dashboard/storefront/landing', { q: q || undefined, state: st || undefined, ...patch }));
  const empty = state === 'empty';
  const all = empty ? [] : pages;
  const shown = all.filter((p) => (!st || lpState(p, now) === st) && (!q.trim() || `${p.name} ${p.slug}`.toLowerCase().includes(q.trim().toLowerCase())));
  const header = (
    <>
      <PageHeader title={tx('صفحات الهبوط', 'Landing pages')} description={tx('صفحة لكل حملة، مرتبطة بعرضها، بنتائجها', 'A page per campaign, tied to its offer, with its results')}
        actions={<LinkButton href={storeHref('landing/new')}><Plus className="size-4" aria-hidden="true" />{tx('صفحة هبوط جديدة', 'New landing page')}</LinkButton>} />
      <StoreTabs current="landing" />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<Card className="space-y-3 p-5" role="status" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-9 rounded-xl" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-20 rounded-full" /></div>)}</Card></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل صفحات الهبوط', 'Landing pages could not load')} onRetry={() => setDashState('live')}>{tx('الصفحات المنشورة تعمل في متجرك كما هي. المرجع SIM-LP-503.', 'Live pages keep working in your store. Ref SIM-LP-503.')}</ErrorState></Card></div>;

  const res = (p: LandingPage) => lpResults(p, orders, attribution, stats[p.slug] ? { visits: stats[p.slug].visits, interest: stats[p.slug].interest.length } : undefined);
  const linkText = (p: LandingPage) => p.link.kind === 'coupon' || p.link.kind === 'offer' ? p.link.code : p.link.kind === 'collection' ? tx('مجموعة', 'Collection') : '—';
  const cols: Column<LandingPage>[] = [
    { key: 'name', header: tx('الصفحة', 'Page'), cell: (p) => (
      <span className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300"><Megaphone className="size-4" aria-hidden="true" /></span>
        <span className="min-w-0"><span className="block truncate font-semibold text-fg">{p.name || tx('بلا اسم', 'Untitled')}</span><bdi dir="ltr" className="block truncate text-xs text-muted">/lp/{p.slug}</bdi></span></span>
    ) },
    { key: 'state', header: tx('الحالة', 'Status'), cell: (p) => <span className="flex flex-wrap gap-1"><Badge tone={LP_TONE[lpState(p, now)]}>{L.state(lpState(p, now))}</Badge>{lpHasEdits(p) && <Badge tone="brand">{tx('تعديلات غير منشورة', 'Unpublished edits')}</Badge>}</span> },
    { key: 'link', header: tx('مرتبطة بـ', 'Linked to'), hideBelow: 'md', cell: (p) => <bdi dir="ltr" className="font-mono text-xs text-muted">{linkText(p)}</bdi> },
    { key: 'win', header: tx('الفترة', 'Window'), hideBelow: 'lg', cell: (p) => <span className="text-xs text-muted tabular-nums" dir="ltr">{p.start ? p.start.slice(0, 10) : '…'} → {p.end ? p.end.slice(0, 10) : '…'}</span> },
    { key: 'orders', header: tx('الطلبات', 'Orders'), align: 'end', hideBelow: 'md', cell: (p) => <span className="tabular-nums">{res(p).orders}</span> },
    { key: 'rev', header: tx('الإيراد', 'Revenue'), align: 'end', cell: (p) => <Money v={res(p).revenue} /> },
  ];
  return (
    <div className="space-y-6">
      {header}
      {all.length === 0 ? (
        <Card><EmptyState as="h2" icon={<Megaphone className="size-6" aria-hidden="true" />} title={tx('لا صفحات هبوط بعد', 'No landing pages yet')}
          action={<LinkButton href={storeHref('landing/new')}><Plus className="size-4" aria-hidden="true" />{tx('أنشئ أول صفحة', 'Create your first page')}</LinkButton>}>
          {tx('صفحة واحدة للحملة تجمع العرض والعدّاد والكود والمنتجات.', 'One page per campaign: the offer, a countdown, the code and the products.')}
        </EmptyState></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <SearchInput value={q} onChange={(v) => go({ q: v || undefined })} placeholder={tx('ابحث بالاسم أو الرابط', 'Search by name or address')} />
            <FilterChip label={tx('الحالة', 'Status')} value={st} onChange={(v) => go({ state: v || undefined })} options={STATES.map((s) => ({ value: s, label: L.state(s) }))} />
            <span className="text-xs text-muted tabular-nums">{tx(`${shown.length} من ${all.length}`, `${shown.length} of ${all.length}`)}</span>
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={<Search className="size-6" aria-hidden="true" />} title={tx('لا صفحات تطابق', 'No pages match')} action={<LinkButton variant="secondary" href={storeHref('landing')}>{tx('امسح التصفية', 'Clear filters')}</LinkButton>} />
          ) : (
            <DataTable label={tx('صفحات الهبوط', 'Landing pages')} rows={shown} rowKey={(p) => p.id} columns={cols} href={(p) => storeHref(`landing/${p.id}`)}
              card={(p) => (
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300"><Megaphone className="size-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1 space-y-1.5"><p className="truncate text-sm font-semibold text-fg">{p.name || tx('بلا اسم', 'Untitled')}</p><bdi dir="ltr" className="block truncate text-xs text-muted">/lp/{p.slug}</bdi>
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={LP_TONE[lpState(p, now)]}>{L.state(lpState(p, now))}</Badge><span className="text-xs text-muted">{tx(`${res(p).orders} طلب`, `${res(p).orders} orders`)} · <Money v={res(p).revenue} /></span></div></div>
                </div>
              )} />
          )}
        </Card>
      )}
      <p className="text-xs text-muted">{lang === 'ar' ? 'خطط لحملاتك بجانب المناسبات في ' : 'Plan campaigns beside the occasions in the '}<a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={sectionHref('calendar')}>{tx('تقويم التسويق', 'marketing calendar')}</a></p>
    </div>
  );
}

function LandingEditor({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const pages = landingStore.use();
  const coupons = couponsStore.use();
  const collections = collectionsStore.use();
  const products = productsStore.use();
  const orders = ordersStore.use();
  const attribution = lpAttributionStore.use();
  const stats = lpStatsStore.use();
  const settings = settingsStore.use();
  const ctx = useLpCtx();
  const L = useLpLabels();
  const saved = pages.find((p) => p.id === id);
  const [draft, setDraft, clearDraft] = useSessionDraft<LandingPage | null>(`landing:${id}`, saved ?? null);
  const [tried, setTried] = useState(false);
  const [dlg, setDlg] = useState<'publish' | 'unpublish' | 'delete' | null>(null);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const canPub = can(role, 'theme.publish');
  const p = draft ?? saved;
  const dirty = !!saved && !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useUnsaved(dirty, { ar: 'تعديلات صفحة الهبوط', en: 'Landing page edits' });
  const back = { href: storeHref('landing'), label: tx('صفحات الهبوط', 'Landing pages') };

  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={tx('صفحة هبوط', 'Landing page')} /><div className="grid gap-6 lg:grid-cols-3" role="status" aria-label="Loading"><Skeleton className="h-96 rounded-2xl lg:col-span-2" /><Skeleton className="h-96 rounded-2xl" /></div></div>;
  if (state === 'error') return <div className="space-y-6"><PageHeader back={back} title={tx('صفحة هبوط', 'Landing page')} /><Card><ErrorState as="h2" title={tx('تعذّر تحميل الصفحة', 'The page could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-LP-503.', 'Nothing changed. Ref SIM-LP-503.')}</ErrorState></Card></div>;
  if (!p || !saved) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('الصفحة غير موجودة', 'Page not found')} />
      <Card><EmptyState as="h2" icon={<Megaphone className="size-6" aria-hidden="true" />} title={tx('لم نجد صفحة الهبوط هذه', 'We couldn’t find this landing page')} action={<LinkButton variant="secondary" href={storeHref('landing')}>{tx('كل صفحات الهبوط', 'All landing pages')}</LinkButton>}>{tx('ربما حُذفت.', 'It may have been deleted.')}</EmptyState></Card></div>
  );

  const now = Date.now();
  const set = (patch: Partial<LandingPage>) => setDraft({ ...p, ...patch });
  const setBlocks = (blocks: LandingPage['draft']['blocks']) => set({ draft: { ...p.draft, blocks } });
  const { errors, slug: slugErr, blocks: blockErrs } = lpErrors(p, pages, ctx);
  const warnings = lpWarnings(p, ctx);
  const coupon = linkedCoupon(p, coupons);
  const st = lpState(saved, now);
  const base = storeBase(settings.domain);
  const langs = (['ar', 'en'] as const).filter((l) => settings.storeLangs[l]);
  const name = p.name || tx('بلا اسم', 'Untitled');
  const res = lpResults(saved, orders, attribution, stats[saved.slug] ? { visits: stats[saved.slug].visits, interest: stats[saved.slug].interest.length } : undefined);
  const who = currentActor().name;
  const productOpts = products.filter((x) => x.status !== 'archived').map((x) => ({ id: x.id, name: x.name, live: ctx.liveProducts.includes(x.id) }));
  const hero = p.draft.blocks.find((b) => b.kind === 'hero');
  const seoTitle = (l: 'ar' | 'en') => p.draft.seo.title[l].trim() || hero?.heading[l] || p.name;
  const seoDesc = (l: 'ar' | 'en') => p.draft.seo.desc[l].trim() || hero?.body?.[l] || '';
  const commit = (next: LandingPage, msg: string, audit: { ar: string; en: string }) => {
    landingStore.set((all) => all.map((x) => (x.id === next.id ? next : x)));
    clearDraft();
    logAction('store', audit, { target: `/lp/${next.slug}` });
    toast({ tone: 'ok', text: msg });
  };
  const saveDraft = () => { setTried(true); if (slugErr) return; commit({ ...p, updatedAt: nowIso(), by: who }, tx('حُفظت المسودة؛ المنشور لم يتغير', 'Draft saved; the live page is unchanged'), { ar: `حفظ مسودة صفحة الهبوط «${p.name || p.slug}»`, en: `Saved a draft of landing page “${p.name || p.slug}”` }); };
  const hasErr = errors.length > 0;
  const slugText = slugErr ? ({ empty: tx('أدخل رابطًا', 'Enter an address'), format: tx('حروف إنجليزية صغيرة وأرقام وشرطات', 'Lowercase English letters, digits and hyphens'), reserved: tx('محجوز للمتجر', 'Reserved by the store'), taken: tx('صفحة هبوط أخرى تستخدمه', 'Another landing page uses it') })[slugErr] : null;
  const willBe = (() => { const s = riyadhMs(p.start); return !Number.isNaN(s) && s > now ? 'scheduled' : 'live'; })();
  const linkVal = p.link.kind === 'none' ? '' : p.link.kind === 'collection' ? `col:${p.link.id}` : `${p.link.kind}:${p.link.code}`;
  const errMsg = (e: string) => ({ name: tx('اسم داخلي للصفحة', 'An internal name for the page'), slug: slugText ?? '', blocks: tx('أضف قسمًا واحدًا على الأقل', 'Add at least one block'), block: tx('أصلح الأقسام المعلّمة', 'Fix the marked blocks'), window: tx('النهاية يجب أن تكون بعد البداية وفي المستقبل', 'The end must be after the start and in the future'), link: tx('العرض أو المجموعة المرتبطة لم تعد موجودة', 'The linked offer or collection no longer exists') } as Record<string, string>)[e];

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={name}
        meta={<><Badge tone={LP_TONE[st]}>{L.state(st)}</Badge>{lpHasEdits(saved) && <Badge tone="brand">{tx('تعديلات غير منشورة', 'Unpublished edits')}</Badge>}{dirty && <Badge tone="amber">{tx('تعديلات لم تُحفظ', 'Unsaved edits')}</Badge>}</>}
        actions={<>
          {st === 'live' && <LinkButton variant="secondary" href={link(`/store/lp/${saved.slug}`)} target="_blank" rel="noopener"><ExternalLink className="size-4" aria-hidden="true" />{tx('افتح في المتجر', 'Open in store')}</LinkButton>}
          {canPub && saved.live && saved.on && st !== 'ended' && <Button variant="secondary" onClick={() => setDlg('unpublish')}>{tx('أوقف النشر', 'Unpublish')}</Button>}
          {canPub ? <Button onClick={() => { setTried(true); if (!hasErr) setDlg('publish'); }}><Upload className="size-4" aria-hidden="true" />{saved.live ? tx('راجع وانشر التعديلات', 'Review and publish edits') : tx('راجع وانشر', 'Review and publish')}</Button>
            : <Locked>{tx('النشر للمالك', 'Publishing is for the Owner')}</Locked>}
        </>} />
      <StoreTabs current="landing" />
      <ReviewRole />
      {tried && hasErr && <Alert tone="bad" title={tx('لا يمكن النشر بعد', 'Not ready to publish')}><ul className="list-disc ps-5">{errors.map((e) => <li key={e}>{errMsg(e)}</li>)}</ul></Alert>}
      {warnings.length > 0 && <Alert tone="warn" title={tx('قبل النشر', 'Before you publish')}><ul className="list-disc ps-5">{warnings.map((w) => <li key={w}>{L.warning(w, coupon)}</li>)}</ul></Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tx('اسم الصفحة (داخلي)', 'Page name (internal)')} error={tried && errors.includes('name') ? tx('مطلوب', 'Required') : null}>
                {(f) => <Input {...f} value={p.name} maxLength={60} dir="auto" onChange={(e) => set({ name: e.target.value })} />}
              </Field>
              <Field label={tx('مرتبطة بـ', 'Linked to')} error={tried && errors.includes('link') ? errMsg('link') : null} hint={tx('العدّاد والكوبون والنتائج تتبع ما تختاره', 'The countdown, coupon and results follow this')}>
                {(f) => <Select {...f} value={linkVal} onChange={(e) => {
                  const v = e.target.value;
                  const next: LpLink = !v ? { kind: 'none' } : v.startsWith('col:') ? { kind: 'collection', id: v.slice(4) } : v.startsWith('coupon:') ? { kind: 'coupon', code: v.slice(7) } : { kind: 'offer', code: v.slice(6) };
                  set({ link: next });
                }}>
                  <option value="">{tx('لا شيء', 'Nothing')}</option>
                  <optgroup label={tx('كوبونات بكود', 'Coupons with a code')}>{coupons.filter((c) => !c.auto && !c.origin).map((c) => <option key={c.code} value={`coupon:${c.code}`}>{c.code}</option>)}</optgroup>
                  <optgroup label={tx('عروض تلقائية', 'Automatic offers')}>{coupons.filter((c) => c.auto).map((c) => <option key={c.code} value={`offer:${c.code}`}>{c.code}</option>)}</optgroup>
                  <optgroup label={tx('مجموعات', 'Collections')}>{collections.map((c) => <option key={c.id} value={`col:${c.id}`}>{c.name[lang]}</option>)}</optgroup>
                </Select>}
              </Field>
            </div>
          </Card>

          <Card aria-labelledby="lp-blocks">
            <CardHeader id="lp-blocks" title={tx('أقسام الصفحة', 'Page blocks')} hint={tx('بالترتيب الذي يراه العميل. الأقسام المعلّمة بالأحمر تمنع النشر.', 'In the order shoppers see them. Blocks marked red block publishing.')} />
            <div className="space-y-3 px-5 pb-5">
              {p.draft.blocks.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{tx('لا أقسام بعد. أضف «واجهة الحملة» لتبدأ.', 'No blocks yet. Add a hero to start.')}</p> : (
                <ol className="space-y-2">
                  {p.draft.blocks.map((b, i) => (
                    <BlockCard key={b.id} b={b} i={i} n={p.draft.blocks.length} p={p} ctx={ctx} issue={tried || blockErrs[b.id] === 'noProducts' ? blockErrs[b.id] ?? null : null} coupons={coupons} langs={[...langs]} products={productOpts}
                      onChange={(x) => setBlocks(p.draft.blocks.map((y) => (y.id === b.id ? x : y)))} onMove={(d) => setBlocks(moveBlock(p.draft.blocks, b.id, d))}
                      onRemove={() => { const prev = p.draft.blocks; setBlocks(prev.filter((y) => y.id !== b.id)); toast({ tone: 'ok', text: tx('أُزيل القسم', 'Block removed'), action: { label: tx('تراجع', 'Undo'), run: () => setDraft({ ...p, draft: { ...p.draft, blocks: prev } }) } }); }} />
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <span className="me-1 self-center text-xs font-semibold text-muted">{tx('أضف:', 'Add:')}</span>
                {LP_KINDS.map((k) => <Button key={k} size="sm" variant="secondary" disabled={!canAdd(p.draft.blocks, k)} onClick={() => setBlocks([...p.draft.blocks, newBlock(k, p.link.kind)])}>{K_ICON[k]}{L.kind(k)}</Button>)}
              </div>
            </div>
          </Card>

          <SeoFields title={p.draft.seo.title} desc={p.draft.seo.desc} url={`${base}/lp/${p.slug}`} langs={settings.storeLangs}
            fallbackTitle={{ ar: seoTitle('ar'), en: seoTitle('en') }} fallbackDesc={{ ar: seoDesc('ar'), en: seoDesc('en') }}
            onChange={(seo) => set({ draft: { ...p.draft, seo } })} />
          <ShareCard p={p} base={base} title={seoTitle(lang)} desc={seoDesc(lang)} image={p.draft.share.image ?? hero?.image} />
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="space-y-4 p-5">
            <Field label={tx('رابط الصفحة', 'Page address')} error={tried ? slugText : null} hint={<bdi dir="ltr" className="break-all">{base}/lp/{p.slug || '…'}</bdi>}>
              {(f) => <Input {...f} dir="ltr" value={p.slug} onChange={(e) => { const v = e.target.value.toLowerCase().replace(/\s+/g, '-'); set({ slug: v, utm: p.utm === p.slug ? utmCampaign(v) : p.utm }); }} />}
            </Field>
            {saved.live && p.slug !== saved.slug && <Alert tone="warn">{tx('تغيير رابط صفحة منشورة يكسر الروابط المشارَكة. أضف تحويلًا من الرابط القديم في «روابط مخصصة».', 'Changing a live page’s address breaks shared links. Add a redirect from the old one in Custom URLs.')}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Field label={tx('يبدأ', 'Starts')} optional hint={tx('بتوقيت الرياض', 'Riyadh time')}>{(f) => <Input {...f} type="datetime-local" dir="ltr" value={p.start} onChange={(e) => set({ start: e.target.value })} />}</Field>
              <Field label={tx('ينتهي', 'Ends')} optional error={tried && errors.includes('window') ? errMsg('window') : null}>{(f) => <Input {...f} type="datetime-local" dir="ltr" value={p.end} onChange={(e) => set({ end: e.target.value })} />}</Field>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted"><CalendarClock className="size-3.5" aria-hidden="true" />{tx('قبل البداية: صفحة «قريبًا» بقائمة المهتمين إن وُجدت. بعد النهاية: «انتهى العرض».', 'Before the start: a “coming soon” page with the interest list if present. After the end: “offer ended”.')}</p>
            <Field label={tx('اسم الحملة في التتبع (utm_campaign)', 'Tracking campaign name (utm_campaign)')}>{(f) => <Input {...f} dir="ltr" value={p.utm} onChange={(e) => set({ utm: utmCampaign(e.target.value) })} />}</Field>
          </Card>

          <Card aria-labelledby="lp-prev">
            <CardHeader id="lp-prev" title={tx('معاينة المسودة', 'Draft preview')} action={<Segmented label={tx('الجهاز', 'Device')} value={device} onChange={setDevice} options={[{ value: 'mobile', label: tx('جوال', 'Phone') }, { value: 'desktop', label: tx('كمبيوتر', 'Desktop') }]} />} />
            <div className="px-5 pb-5"><LandingPreview p={p} ctx={ctx} lang={lang} mobile={device === 'mobile'} label={tx('معاينة صفحة الهبوط', 'Landing page preview')} /></div>
          </Card>
          <ResultsCard r={res} code={p.link.kind === 'coupon' ? p.link.code : undefined} state={st} />
          <Card className="space-y-2 p-5">
            {lpHasEdits(saved) && <Button variant="secondary" className="w-full" onClick={() => { clearDraft(); landingStore.set((all) => all.map((x) => (x.id === saved.id ? discardLandingDraft(saved) : x))); toast({ tone: 'ok', text: tx('أُعيدت المسودة إلى المنشور', 'Draft reset to the live page') }); }}>{tx('أعد المسودة إلى المنشور', 'Reset draft to live')}</Button>}
            {canPub && <Button variant="ghost" className="w-full text-red-700 dark:text-red-400" onClick={() => setDlg('delete')}>{tx('احذف الصفحة', 'Delete page')}</Button>}
          </Card>
        </div>
      </div>

      <SaveBar dirty={dirty} saving={false} saveLabel={tx('احفظ كمسودة', 'Save draft')} onSave={saveDraft} onDiscard={() => { clearDraft(); setTried(false); }} error={tried && slugErr ? tx('صحّح رابط الصفحة ثم احفظ', 'Fix the page address, then save') : undefined} />

      {dlg === 'publish' && (
        <Modal size="lg" title={tx(`نشر «${name}»`, `Publish “${name}”`)} onClose={() => setDlg(null)}
          description={willBe === 'scheduled' ? tx(`تُجدول الآن وتظهر للعملاء ${L.when(p.start)} بتوقيت الرياض.`, `Scheduled now; shoppers see it ${L.when(p.start)} Riyadh time.`) : tx('يراها العملاء فورًا على رابطها.', 'Shoppers see it immediately at its address.')}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => {
            setDlg(null);
            commit(publishLanding(p, nowIso(), who), willBe === 'scheduled' ? tx('جُدولت الصفحة', 'Page scheduled') : tx('نُشرت الصفحة', 'Page published'), { ar: `${willBe === 'scheduled' ? 'جدول' : 'نشر'} صفحة الهبوط «${p.name || p.slug}» (${L.when(p.start) } → ${L.when(p.end)})`, en: `${willBe === 'scheduled' ? 'Scheduled' : 'Published'} landing page “${p.name || p.slug}” (${L.when(p.start)} → ${L.when(p.end)})` });
          }}>{willBe === 'scheduled' ? tx('جدوِل النشر', 'Schedule') : tx('انشر الآن', 'Publish now')}</Button></>}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">{tx('الرابط', 'Address')}</dt><dd><bdi dir="ltr" className="break-all font-medium text-fg">{base}/lp/{p.slug}</bdi></dd></div>
            <div><dt className="text-xs text-muted">{tx('الفترة', 'Window')}</dt><dd className="font-medium text-fg tabular-nums" dir="ltr">{L.when(p.start)} → {L.when(p.end)}</dd></div>
            <div><dt className="text-xs text-muted">{tx('العرض المرتبط', 'Linked offer')}</dt><dd className="font-medium text-fg">{coupon ? <bdi dir="ltr">{coupon.code}</bdi> : p.link.kind === 'collection' ? collections.find((c) => c.id === (p.link as { id: string }).id)?.name[lang] : tx('لا شيء', 'None')}</dd></div>
            <div><dt className="text-xs text-muted">{tx('الأقسام', 'Blocks')}</dt><dd className="font-medium text-fg">{p.draft.blocks.map((b) => L.kind(b.kind)).join('، ')}</dd></div>
          </dl>
          {warnings.length > 0 && <Alert tone="warn"><ul className="list-disc ps-5">{warnings.map((w) => <li key={w}>{L.warning(w, coupon)}</li>)}</ul></Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            {langs.map((l) => <figure key={l} className="min-w-0"><figcaption className="mb-1.5 text-xs font-semibold text-muted">{l === 'ar' ? tx('ما يراه العميل بالعربية', 'Arabic shopper') : tx('ما يراه العميل بالإنجليزية', 'English shopper')}</figcaption><LandingPreview p={p} ctx={ctx} lang={l} mobile label={tx('معاينة', 'Preview')} /></figure>)}
          </div>
          <Simulated />
        </Modal>
      )}
      {dlg === 'unpublish' && (
        <Modal title={tx(`إيقاف نشر «${name}»`, `Unpublish “${name}”`)} onClose={() => setDlg(null)}
          description={tx('من يفتح الرابط يرى «انتهى العرض» مع رابط للمتجر. المحتوى والنتائج تبقى، ويمكن إعادة النشر.', 'Anyone opening the link sees “offer ended” with a link to the store. Content and results stay; you can publish again.')}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { setDlg(null); commit(unpublishLanding(saved, nowIso(), who), tx('أُوقف نشر الصفحة', 'Page unpublished'), { ar: `أوقف نشر صفحة الهبوط «${saved.name || saved.slug}»`, en: `Unpublished landing page “${saved.name || saved.slug}”` }); }}>{tx('أوقف النشر', 'Unpublish')}</Button></>}>
          {coupon && <p className="text-sm text-fg">{tx(`الكوبون ${coupon.code} يبقى كما هو؛ أوقفه من التسويق إن أردت.`, `Coupon ${coupon.code} stays as it is; pause it in Marketing if you want.`)}</p>}
        </Modal>
      )}
      {dlg === 'delete' && (
        <Modal title={tx(`حذف «${name}»`, `Delete “${name}”`)} onClose={() => setDlg(null)} description={tx('لا يمكن التراجع. الرابط يعرض «الصفحة غير موجودة» وتختفي نتائجها.', 'This can’t be undone. The address shows “page not found” and its results are gone.')}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            landingStore.set((all) => all.filter((x) => x.id !== saved.id)); clearDraft(); setDlg(null);
            logAction('store', { ar: `حذف صفحة الهبوط «${saved.name || saved.slug}»`, en: `Deleted landing page “${saved.name || saved.slug}”` }, { target: `/lp/${saved.slug}` });
            toast({ tone: 'ok', text: tx('حُذفت الصفحة', 'Page deleted') }); navigate(storeHref('landing'));
          }}>{tx('احذف', 'Delete')}</Button></>}>
          {res.orders > 0 && <Alert tone="warn">{tx(`${res.orders} طلب منسوب لها؛ الطلبات نفسها لا تتأثر.`, `${res.orders} orders are credited to it; the orders themselves are not affected.`)}</Alert>}
        </Modal>
      )}
    </div>
  );
}
