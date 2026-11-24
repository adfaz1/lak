// Online store → Blog (`#/dashboard/storefront/blog[/<id>]`, tabs `?tab=posts|comments|categories|settings`):
// bilingual articles with a category, cover picture, SEO preview, a publish time, product cards placed inside the text,
// and comment moderation. The shopper store lists live articles at #/store/blog and shows one at #/store/blog/<slug>.
import { useMemo, useState } from 'react';
import { BookOpen, Check, EyeOff, FilePlus2, MessageSquare, Plus, Search, ShieldAlert, ShoppingBag, Trash2, Upload } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate, replace, type Route } from '../../../core/router';
import { can, canSee } from '../../merchant/perms';
import { currentActor, logAction, productsStore, settingsStore } from '../../merchant/stores';
import { mediaSrc } from '../../storefront/theme';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, LinkButton, ProductImage, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, BulkBar, DataTable, Field, FilterChip, Input, Modal, PageHeader, SaveBar, SearchInput, Select, Simulated, Switch, Tabs, Textarea, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import { useSessionDraft } from '../settings/drafts';
import { productPhoto } from '../model/media';
import { storeBase, inlineRuns } from './content';
import { blogStore, mediaStore } from './state';
import { StoreTabs, storeHref } from './nav';
import { RichEditor } from './rich';
import { SeoFields } from './seo-parts';
import { readImage } from './media';
import { useLpCtx } from './landing';
import {
  CAT_MAX, EXCERPT_MAX, POST_TITLE_MAX, catIssue, catSlugOf, moderate, newPost, pendingComments, postErrors, postPieces, postState, postText, postsInCat,
  productIdsIn, publishPost, readMinutes, upsertPost, type BlogComment, type BlogPost, type CommentState, type PostState,
} from './blog-model';

const P_TONE: Record<PostState, Tone> = { draft: 'amber', scheduled: 'sky', live: 'green', liveWithDraft: 'brand', hidden: 'gray' };
const C_TONE: Record<CommentState, Tone> = { pending: 'amber', approved: 'green', hidden: 'gray', spam: 'red' };
type BlogTab = 'posts' | 'comments' | 'categories' | 'settings';
const nowIso = () => new Date().toISOString();

export function useBlogLabels() {
  const tx = useTx();
  return {
    state: (s: PostState) => ({ draft: tx('مسودة', 'Draft'), scheduled: tx('مجدول', 'Scheduled'), live: tx('منشور', 'Live'), liveWithDraft: tx('منشور · تعديلات غير منشورة', 'Live · unpublished edits'), hidden: tx('مخفي', 'Hidden') })[s],
    comment: (s: CommentState) => ({ pending: tx('بانتظار المراجعة', 'Awaiting review'), approved: tx('معتمد', 'Approved'), hidden: tx('مخفي', 'Hidden'), spam: tx('مزعج', 'Spam') })[s],
  };
}
const bhref = (q?: Record<string, string | undefined>) => link('/dashboard/storefront/blog', q);

export default function BlogPage({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  const id = route.path[1];
  if (!canSee(role, 'storefront')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('المتجر الإلكتروني غير متاح لدورك', 'The online store is not available for your role')} /></div>;
  return id ? <PostEditor key={id} id={id} /> : <BlogHome route={route} />;
}

function BlogHome({ route }: { route: Route }) {
  const tx = useTx();
  const state = useDashState();
  const blog = blogStore.use();
  const role = useRole();
  const canEdit = can(role, 'theme.publish') || can(role, 'marketing.manage');
  const qt = route.query.get('tab') as BlogTab | null;
  const tab: BlogTab = qt && ['posts', 'comments', 'categories', 'settings'].includes(qt) ? qt : 'posts';
  const pending = pendingComments(blog).length;
  const create = () => {
    const p = newPost(blogStore.get(), nowIso(), currentActor().name);
    blogStore.set((b) => upsertPost(b, p));
    logAction('store', { ar: 'أنشأ مسودة مقال', en: 'Created an article draft' }, { target: `/blog/${p.slug}` });
    navigate(storeHref(`blog/${p.id}`));
  };
  const header = (
    <>
      <PageHeader title={tx('المدونة', 'Blog')} description={tx('مقالات تجلب زوارًا من البحث وتقودهم لمنتجاتك', 'Articles that bring search visitors and lead them to your products')}
        meta={!blog.settings.on ? <Badge tone="gray">{tx('المدونة مخفية عن العملاء', 'Blog hidden from shoppers')}</Badge> : undefined}
        actions={<>{blog.settings.on && <LinkButton variant="secondary" href={link('/store/blog')} target="_blank" rel="noopener">{tx('افتح في المتجر', 'Open in store')}</LinkButton>}
          {canEdit && <Button onClick={create}><FilePlus2 className="size-4" aria-hidden="true" />{tx('مقال جديد', 'New article')}</Button>}</>} />
      <StoreTabs current="blog" />
      <Tabs label={tx('أقسام المدونة', 'Blog sections')} items={[
        { href: bhref(), label: tx('المقالات', 'Articles'), current: tab === 'posts', count: blog.posts.length },
        { href: bhref({ tab: 'comments' }), label: tx('التعليقات', 'Comments'), current: tab === 'comments', count: pending || undefined },
        { href: bhref({ tab: 'categories' }), label: tx('التصنيفات', 'Categories'), current: tab === 'categories' },
        { href: bhref({ tab: 'settings' }), label: tx('الإعدادات', 'Settings'), current: tab === 'settings' },
      ]} />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<Card className="space-y-3 p-5" role="status" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-12 rounded-xl" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-20 rounded-full" /></div>)}</Card></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل المدونة', 'The blog could not load')} onRetry={() => setDashState('live')}>{tx('المقالات المنشورة تعمل في متجرك. المرجع SIM-BLOG-503.', 'Live articles keep working in your store. Ref SIM-BLOG-503.')}</ErrorState></Card></div>;
  const empty = state === 'empty';
  return (
    <div className="space-y-6">
      {header}
      {tab === 'posts' && <PostList route={route} empty={empty} onCreate={canEdit ? create : undefined} />}
      {tab === 'comments' && <Comments route={route} empty={empty} canEdit={canEdit} />}
      {tab === 'categories' && <Categories canEdit={canEdit} />}
      {tab === 'settings' && <BlogSettings canEdit={can(role, 'theme.publish')} />}
    </div>
  );
}

function Cover({ src, className }: { src: string | null; className?: string }) {
  const lib = mediaStore.use();
  const url = mediaSrc(src ?? undefined, lib) ?? (src?.startsWith('p:') ? productPhoto(src.slice(2)) : undefined);
  return url ? <img src={url} alt="" className={cn('shrink-0 rounded-xl object-cover', className)} loading="lazy" /> : <span className={cn('grid shrink-0 place-items-center rounded-xl bg-surface-2 text-subtle', className)}><BookOpen className="size-4" aria-hidden="true" /></span>;
}

function PostList({ route, empty, onCreate }: { route: Route; empty: boolean; onCreate?: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const blog = blogStore.use();
  const B = useBlogLabels();
  const now = Date.now();
  const q = route.query.get('q') ?? '';
  const cat = route.query.get('cat') ?? '';
  const st = route.query.get('state') ?? '';
  const go = (p: Record<string, string | undefined>) => replace(bhref({ q: q || undefined, cat: cat || undefined, state: st || undefined, ...p }));
  const posts = empty ? [] : blog.posts;
  const shown = posts.filter((p) => (!cat || p.cat === cat) && (!st || postState(p, now) === st) && (!q.trim() || `${p.draft.title.ar} ${p.draft.title.en} ${p.slug}`.toLowerCase().includes(q.trim().toLowerCase())));
  const catName = (id: string) => blog.cats.find((c) => c.id === id)?.name[lang] ?? '—';
  const comments = (p: BlogPost) => blog.comments.filter((c) => c.postId === p.id && c.state === 'approved').length;
  const title = (p: BlogPost) => p.draft.title[lang] || p.draft.title.ar || p.draft.title.en || tx('بلا عنوان', 'Untitled');
  const cols: Column<BlogPost>[] = [
    { key: 't', header: tx('المقال', 'Article'), cell: (p) => <span className="flex items-center gap-3"><Cover src={p.cover} className="size-11" /><span className="min-w-0"><span className="block truncate font-semibold text-fg">{title(p)}</span><bdi dir="ltr" className="block truncate text-xs text-muted">/blog/{p.slug}</bdi></span></span> },
    { key: 's', header: tx('الحالة', 'Status'), cell: (p) => <span className="flex flex-col items-start gap-0.5"><Badge tone={P_TONE[postState(p, now)]}>{B.state(postState(p, now))}</Badge>{postState(p, now) === 'scheduled' && <span className="text-[11px] text-muted tabular-nums" dir="ltr">{p.publishAt.replace('T', ' ')}</span>}</span> },
    { key: 'c', header: tx('التصنيف', 'Category'), hideBelow: 'md', cell: (p) => <span className="text-muted">{catName(p.cat)}</span> },
    { key: 'p', header: tx('منتجات', 'Products'), hideBelow: 'lg', align: 'end', cell: (p) => <span className="tabular-nums text-muted">{productIdsIn(p.draft.body.ar).length || productIdsIn(p.draft.body.en).length}</span> },
    { key: 'm', header: tx('تعليقات', 'Comments'), hideBelow: 'lg', align: 'end', cell: (p) => <span className="tabular-nums text-muted">{comments(p)}</span> },
  ];
  if (!posts.length) return <Card><EmptyState as="h2" icon={<BookOpen className="size-6" aria-hidden="true" />} title={tx('لا مقالات بعد', 'No articles yet')} action={onCreate && <Button onClick={onCreate}><FilePlus2 className="size-4" aria-hidden="true" />{tx('اكتب أول مقال', 'Write your first article')}</Button>}>{tx('دليل اختيار المقاس أو العناية بالمنتج يجيب أسئلة العملاء قبل أن يسألوا.', 'A size guide or a care guide answers shoppers’ questions before they ask.')}</EmptyState></Card>;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <SearchInput value={q} onChange={(v) => go({ q: v || undefined })} placeholder={tx('ابحث بالعنوان', 'Search by title')} />
        <FilterChip label={tx('التصنيف', 'Category')} value={cat} onChange={(v) => go({ cat: v || undefined })} options={blog.cats.map((c) => ({ value: c.id, label: c.name[lang] }))} />
        <FilterChip label={tx('الحالة', 'Status')} value={st} onChange={(v) => go({ state: v || undefined })} options={(['live', 'scheduled', 'draft', 'liveWithDraft', 'hidden'] as PostState[]).map((s) => ({ value: s, label: B.state(s) }))} />
      </div>
      {shown.length === 0 ? <EmptyState icon={<Search className="size-6" aria-hidden="true" />} title={tx('لا مقالات تطابق', 'No articles match')} action={<LinkButton variant="secondary" href={bhref()}>{tx('امسح التصفية', 'Clear filters')}</LinkButton>} />
        : <DataTable label={tx('المقالات', 'Articles')} rows={shown} rowKey={(p) => p.id} columns={cols} href={(p) => storeHref(`blog/${p.id}`)}
          card={(p) => <div className="flex items-start gap-3"><Cover src={p.cover} className="size-12" /><div className="min-w-0 flex-1 space-y-1"><p className="truncate text-sm font-semibold text-fg">{title(p)}</p><p className="text-xs text-muted">{catName(p.cat)}</p><Badge tone={P_TONE[postState(p, now)]}>{B.state(postState(p, now))}</Badge></div></div>} />}
    </Card>
  );
}

function Comments({ route, empty, canEdit }: { route: Route; empty: boolean; canEdit: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const blog = blogStore.use();
  const B = useBlogLabels();
  const f = route.query.get('state') ?? 'pending';
  const [sel, setSel] = useState<Set<string>>(new Set());
  const all = empty ? [] : blog.comments;
  const rows = all.filter((c) => !f || f === 'all' || c.state === f).sort((a, b) => (a.at < b.at ? 1 : -1));
  const postTitle = (id: string) => { const p = blog.posts.find((x) => x.id === id); return p ? p.draft.title[lang] || p.draft.title.ar : '—'; };
  const act = (ids: string[], s: CommentState) => {
    const before = blog;
    blogStore.set((b) => moderate(b, ids, s));
    logAction('store', { ar: `${({ approved: 'اعتمد', hidden: 'أخفى', spam: 'علّم كمزعج', pending: 'أعاد للمراجعة' } as const)[s]} ${ids.length} تعليق`, en: `${({ approved: 'Approved', hidden: 'Hid', spam: 'Marked as spam', pending: 'Returned to review' } as const)[s]} ${ids.length} comment${ids.length > 1 ? 's' : ''}` });
    setSel(new Set());
    toast({ tone: 'ok', text: s === 'approved' ? tx('ظهر التعليق تحت المقال', 'The comment now shows under the article') : tx('لن يظهر للعملاء', 'Shoppers won’t see it'), action: { label: tx('تراجع', 'Undo'), run: () => blogStore.set(before) } });
  };
  const cols: Column<BlogComment>[] = [
    { key: 'w', header: tx('التعليق', 'Comment'), cell: (c) => <span className="block min-w-0 max-w-xl"><span className="block text-sm font-semibold text-fg" dir="auto">{c.name}</span><span className="block text-sm text-fg/90" dir="auto">{c.text}</span>{/https?:|اضغط الرابط|اربح/i.test(c.text) && <span className="mt-1 inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400"><ShieldAlert className="size-3.5" aria-hidden="true" />{tx('يشبه رسالة مزعجة', 'Looks like spam')}</span>}</span> },
    { key: 'p', header: tx('على مقال', 'On article'), hideBelow: 'md', cell: (c) => <a className="text-xs text-muted hover:underline" href={storeHref(`blog/${c.postId}`)}>{postTitle(c.postId)}</a> },
    { key: 's', header: tx('الحالة', 'Status'), cell: (c) => <Badge tone={C_TONE[c.state]}>{B.comment(c.state)}</Badge> },
    { key: 'a', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', cell: (c) => canEdit ? <span className="flex justify-end gap-1">{c.state !== 'approved' && <Button size="sm" variant="secondary" onClick={() => act([c.id], 'approved')}><Check className="size-3.5" aria-hidden="true" />{tx('اعتمد', 'Approve')}</Button>}{c.state !== 'hidden' && c.state !== 'spam' && <Button size="sm" variant="ghost" onClick={() => act([c.id], 'hidden')}>{tx('أخفِ', 'Hide')}</Button>}</span> : null },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <FilterChip label={tx('الحالة', 'Status')} value={f === 'all' ? '' : f} onChange={(v) => replace(bhref({ tab: 'comments', state: v || 'all' }))} options={(['pending', 'approved', 'hidden', 'spam'] as CommentState[]).map((s) => ({ value: s, label: `${B.comment(s)} (${all.filter((c) => c.state === s).length})` }))} />
        <span className="flex items-center gap-1.5 text-xs text-muted">{blog.settings.moderation ? tx('التعليقات الجديدة تنتظر اعتمادك', 'New comments wait for your approval') : tx('التعليقات تظهر فورًا', 'Comments show at once')}<InfoHint>{tx('غيّرها من «الإعدادات». التعليقات من العملاء في هذه النسخة تُكتب من صفحة المقال في المتجر.', 'Change it in Settings. In this preview, shopper comments are written from the article page in the store.')}</InfoHint></span>
      </div>
      {sel.size > 0 && canEdit && <div className="border-b border-border p-3"><BulkBar count={sel.size} scope={tx('من القائمة الظاهرة', 'in the visible list')} onClear={() => setSel(new Set())}>
        <Button size="sm" variant="secondary" onClick={() => act([...sel], 'approved')}>{tx('اعتمد', 'Approve')}</Button>
        <Button size="sm" variant="secondary" onClick={() => act([...sel], 'spam')}>{tx('مزعج', 'Spam')}</Button>
      </BulkBar></div>}
      {rows.length === 0 ? <EmptyState icon={<MessageSquare className="size-6" aria-hidden="true" />} title={f === 'pending' ? tx('لا تعليقات تنتظرك', 'No comments waiting') : tx('لا تعليقات', 'No comments')}>{f === 'pending' ? tx('راجعت كل شيء.', 'You’re all caught up.') : undefined}</EmptyState>
        : <DataTable label={tx('التعليقات', 'Comments')} rows={rows} rowKey={(c) => c.id} columns={cols} selected={canEdit ? sel : undefined} onSelect={canEdit ? (k, on) => setSel((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; }) : undefined}
          card={(c) => <div className="space-y-2"><div className="flex items-center gap-2"><span className="flex-1 text-sm font-semibold" dir="auto">{c.name}</span><Badge tone={C_TONE[c.state]}>{B.comment(c.state)}</Badge></div><p className="text-sm" dir="auto">{c.text}</p><p className="text-xs text-muted">{postTitle(c.postId)}</p>{canEdit && <div className="flex gap-2">{c.state !== 'approved' && <Button size="sm" variant="secondary" onClick={() => act([c.id], 'approved')}>{tx('اعتمد', 'Approve')}</Button>}{c.state !== 'hidden' && <Button size="sm" variant="ghost" onClick={() => act([c.id], 'hidden')}>{tx('أخفِ', 'Hide')}</Button>}</div>}</div>} />}
    </Card>
  );
}

function Categories({ canEdit }: { canEdit: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const blog = blogStore.use();
  const langs = settingsStore.use().storeLangs;
  const [name, setName] = useState({ ar: '', en: '' });
  const [tried, setTried] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const issue = catIssue(name, blog.cats, langs);
  useUnsaved(!!(name.ar.trim() || name.en.trim()), { ar: 'تصنيف جديد', en: 'New category' });
  const add = () => {
    setTried(true);
    if (issue || blog.cats.length >= CAT_MAX) return;
    const id = catSlugOf(name, blog.cats);
    blogStore.set((b) => ({ ...b, cats: [...b.cats, { id, name: { ar: name.ar.trim(), en: name.en.trim() } }] }));
    logAction('store', { ar: `أضاف تصنيف مدونة «${name.ar || name.en}»`, en: `Added blog category “${name.en || name.ar}”` });
    setName({ ar: '', en: '' }); setTried(false);
    toast({ tone: 'ok', text: tx('أُضيف التصنيف', 'Category added') });
  };
  const target = blog.cats.find((c) => c.id === del);
  const n = del ? postsInCat(blog, del) : 0;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="overflow-hidden lg:col-span-2">
        <CardHeader title={tx('التصنيفات', 'Categories')} hint={tx('يرى العميل التصنيفات كمرشحات في صفحة المدونة.', 'Shoppers see categories as filters on the blog page.')} />
        <ul className="divide-y divide-border border-t border-border">
          {blog.cats.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{c.name[lang] || c.name.ar}</p><p className="text-xs text-muted">{lang === 'ar' ? c.name.en : c.name.ar} · {tx(`${postsInCat(blog, c.id)} مقال`, `${postsInCat(blog, c.id)} articles`)}</p></div>
              {canEdit && <Button size="sm" variant="ghost" disabled={blog.cats.length <= 1} onClick={() => { setDel(c.id); setMoveTo(blog.cats.find((x) => x.id !== c.id)?.id ?? ''); }}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button>}
            </li>
          ))}
        </ul>
      </Card>
      {canEdit && <Card className="space-y-3 p-5">
        <p className="text-sm font-semibold text-fg">{tx('تصنيف جديد', 'New category')}</p>
        {(['ar', 'en'] as const).filter((l) => langs[l]).map((l) => <Field key={l} label={l === 'ar' ? tx('بالعربية', 'Arabic') : tx('بالإنجليزية', 'English')} error={tried && issue ? (issue === 'empty' ? tx('مطلوب', 'Required') : tx('موجود', 'Already exists')) : null}>{(f) => <Input {...f} dir={l === 'ar' ? 'rtl' : 'ltr'} value={name[l]} maxLength={30} onChange={(e) => setName({ ...name, [l]: e.target.value })} />}</Field>)}
        <Button className="w-full" onClick={add} disabled={blog.cats.length >= CAT_MAX}><Plus className="size-4" aria-hidden="true" />{tx('أضف', 'Add')}</Button>
      </Card>}
      {del && target && (
        <Modal title={tx(`حذف «${target.name[lang]}»`, `Delete “${target.name[lang]}”`)} onClose={() => setDel(null)}
          footer={<><Button variant="secondary" onClick={() => setDel(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            blogStore.set((b) => ({ ...b, cats: b.cats.filter((c) => c.id !== del), posts: b.posts.map((p) => (p.cat === del ? { ...p, cat: moveTo } : p)) }));
            logAction('store', { ar: `حذف تصنيف المدونة «${target.name.ar}» ونقل ${n} مقال`, en: `Deleted blog category “${target.name.en}” and moved ${n} articles` });
            setDel(null); toast({ tone: 'ok', text: tx('حُذف التصنيف', 'Category deleted') });
          }}>{tx('احذف', 'Delete')}</Button></>}>
          {n > 0 ? <Field label={tx(`انقل ${n} مقال إلى`, `Move ${n} articles to`)}>{(f) => <Select {...f} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>{blog.cats.filter((c) => c.id !== del).map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}</Select>}</Field>
            : <p className="text-sm text-fg">{tx('لا مقالات فيه.', 'It has no articles.')}</p>}
        </Modal>
      )}
    </div>
  );
}

function BlogSettings({ canEdit }: { canEdit: boolean }) {
  const tx = useTx();
  const toast = useToast();
  const blog = blogStore.use();
  const [confirm, setConfirm] = useState(false);
  const set = (k: keyof typeof blog.settings, v: boolean) => {
    blogStore.set((b) => ({ ...b, settings: { ...b.settings, [k]: v } }));
    logAction('store', { ar: `غيّر إعداد المدونة ${k} إلى ${v ? 'تشغيل' : 'إيقاف'}`, en: `Changed blog setting ${k} to ${v ? 'on' : 'off'}` }, { before: String(!v), after: String(v) });
    toast({ tone: 'ok', text: tx('حُفظ الإعداد', 'Setting saved') });
  };
  const row = (k: keyof typeof blog.settings, title: string, sub: string, onChange?: () => void) => (
    <li className="flex items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{title}</p><p className="text-xs text-muted">{sub}</p></div>
      <Switch checked={blog.settings[k]} disabled={!canEdit} label={title} onChange={(v) => (onChange ? onChange() : set(k, v))} /></li>
  );
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {row('on', tx('المدونة ظاهرة للعملاء', 'Blog visible to shoppers'), blog.settings.on ? tx('على الرابط /blog', 'At /blog') : tx('مخفية؛ روابط المقالات تعرض «غير موجودة»', 'Hidden; article links show “not found”'), () => (blog.settings.on ? setConfirm(true) : set('on', true)))}
        {row('moderation', tx('مراجعة التعليقات قبل ظهورها', 'Review comments before they show'), tx('يُنصح بها لمنع الرسائل المزعجة', 'Recommended to keep spam out'))}
        {row('inMenu', tx('رابط المدونة في تذييل المتجر', 'Blog link in the store footer'), tx('يظهر عند وجود مقال منشور', 'Shows when an article is live'))}
      </ul>
      {!canEdit && <p className="border-t border-border px-5 py-3"><Locked>{tx('الإعدادات للمالك', 'Settings are for the Owner')}</Locked></p>}
      {confirm && <Modal title={tx('إخفاء المدونة', 'Hide the blog')} onClose={() => setConfirm(false)} description={tx('تختفي المدونة وكل مقالاتها من المتجر، والمقالات تبقى محفوظة.', 'The blog and every article disappear from the store; the articles are kept.')}
        footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { set('on', false); setConfirm(false); }}>{tx('أخفِ المدونة', 'Hide the blog')}</Button></>} />}
    </Card>
  );
}

/** The article as the store shows it: text blocks with product cards where the merchant placed them. */
export function PostBody({ src, lang }: { src: string; lang: 'ar' | 'en' }) {
  const products = productsStore.use();
  const runs = (t: string) => inlineRuns(t).map((r, i) => (r.bold ? <strong key={i} className="font-semibold text-fg">{r.text}</strong> : <span key={i}>{r.text}</span>));
  return (
    <div className="space-y-3 text-sm leading-relaxed text-fg/90" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      {postPieces(src).map((x, i) => x.kind === 'product' ? (() => { const p = products.find((y) => y.id === x.id); return (
        <div key={i} className={cn('flex items-center gap-3 rounded-xl border p-2', p ? 'border-border' : 'border-red-300')}><ProductImage src={productPhoto(x.id)} alt="" size={44} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{p ? p.name[lang] : x.id}</span><ShoppingBag className="size-4 text-muted" aria-hidden="true" /></div>); })()
        : x.blocks.map((b, j) => b.type === 'h' ? <h3 key={`${i}-${j}`} className="text-[15px] font-bold text-fg">{runs(b.text)}</h3> : b.type === 'ul' ? <ul key={`${i}-${j}`} className="list-disc space-y-1 ps-5">{b.items.map((t, k) => <li key={k}>{runs(t)}</li>)}</ul> : <p key={`${i}-${j}`}>{runs(b.text)}</p>))}
    </div>
  );
}

function PostEditor({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const blog = blogStore.use();
  const settings = settingsStore.use();
  const products = productsStore.use();
  const ctx = useLpCtx();
  const B = useBlogLabels();
  const saved = blog.posts.find((p) => p.id === id);
  const [draft, setDraft, clearDraft] = useSessionDraft<BlogPost | null>(`post:${id}`, saved ?? null);
  const [tried, setTried] = useState(false);
  const [dlg, setDlg] = useState<'publish' | 'hide' | 'delete' | null>(null);
  const [upErr, setUpErr] = useState('');
  const [pv, setPv] = useState<'ar' | 'en'>(lang);
  const canPub = can(role, 'theme.publish') || can(role, 'marketing.manage');
  const p = draft ?? saved;
  const dirty = !!saved && !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useUnsaved(dirty, { ar: 'تعديلات المقال', en: 'Article edits' });
  const errors = useMemo(() => (p ? postErrors(p, blog, settings.storeLangs, ctx.liveProducts) : {}), [p, blog, settings.storeLangs, ctx.liveProducts]);
  const back = { href: storeHref('blog'), label: tx('المدونة', 'Blog') };
  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={tx('مقال', 'Article')} /><Card className="space-y-4 p-5" role="status" aria-label="Loading"><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-60 w-full rounded-xl" /></Card></div>;
  if (state === 'error') return <div className="space-y-6"><PageHeader back={back} title={tx('مقال', 'Article')} /><Card><ErrorState as="h2" title={tx('تعذّر تحميل المقال', 'The article could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-BLOG-503.', 'Nothing changed. Ref SIM-BLOG-503.')}</ErrorState></Card></div>;
  if (!p || !saved) return <div className="space-y-6"><PageHeader back={back} title={tx('المقال غير موجود', 'Article not found')} /><Card><EmptyState as="h2" icon={<BookOpen className="size-6" aria-hidden="true" />} title={tx('لم نجد هذا المقال', 'We couldn’t find this article')} action={<LinkButton variant="secondary" href={storeHref('blog')}>{tx('كل المقالات', 'All articles')}</LinkButton>}>{tx('ربما حُذف.', 'It may have been deleted.')}</EmptyState></Card></div>;

  const now = Date.now();
  const st = postState(saved, now);
  const set = (patch: Partial<BlogPost>) => setDraft({ ...p, ...patch });
  const setC = (k: 'title' | 'body' | 'excerpt', l: 'ar' | 'en', v: string) => set({ draft: { ...p.draft, [k]: { ...p.draft[k], [l]: v } } });
  const langs = (['ar', 'en'] as const).filter((l) => settings.storeLangs[l]);
  const base = storeBase(settings.domain);
  const hasErr = Object.keys(errors).length > 0;
  const name = p.draft.title[lang] || p.draft.title.ar || p.draft.title.en || tx('بلا عنوان', 'Untitled');
  const who = currentActor().name;
  const commit = (next: BlogPost, msg: string, audit: { ar: string; en: string }) => { blogStore.set((b) => upsertPost(b, next)); clearDraft(); logAction('store', audit, { target: `/blog/${next.slug}` }); toast({ tone: 'ok', text: msg }); };
  const errText = (k: keyof typeof errors) => !tried || !errors[k] ? null
    : k === 'slug' ? ({ empty: tx('أدخل رابطًا', 'Enter an address'), format: tx('حروف إنجليزية صغيرة وأرقام وشرطات', 'Lowercase English letters, digits and hyphens'), reserved: tx('محجوز للمتجر', 'Reserved by the store'), taken: tx('مقال آخر يستخدمه', 'Another article uses it') } as Record<string, string>)[errors.slug!]
      : errors[k] === 'long' ? tx(`${POST_TITLE_MAX} حرفًا كحد`, `${POST_TITLE_MAX} characters max`) : tx('مطلوب للنشر', 'Required to publish');
  const later = p.publishAt && Date.parse(`${p.publishAt}:00+03:00`) > now;
  const insertProduct = (l: 'ar' | 'en', pid: string) => setC('body', l, `${p.draft.body[l].replace(/\s+$/, '')}\n\n@p:${pid}\n`);

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={name}
        meta={<><Badge tone={P_TONE[st]}>{B.state(st)}</Badge>{dirty && <Badge tone="amber">{tx('تعديلات لم تُحفظ', 'Unsaved edits')}</Badge>}<span className="text-xs text-muted">{tx(`${readMinutes(p.draft.body[lang] || p.draft.body.ar)} د قراءة`, `${readMinutes(p.draft.body[lang] || p.draft.body.ar)} min read`)}</span></>}
        actions={<>
          {(st === 'live' || st === 'liveWithDraft') && blog.settings.on && <LinkButton variant="secondary" href={link(`/store/blog/${saved.slug}`)} target="_blank" rel="noopener">{tx('افتح في المتجر', 'Open in store')}</LinkButton>}
          {canPub ? <Button onClick={() => { setTried(true); if (!hasErr) setDlg('publish'); }}><Upload className="size-4" aria-hidden="true" />{later ? tx('راجع وجدوِل', 'Review and schedule') : tx('راجع وانشر', 'Review and publish')}</Button> : <Locked>{tx('النشر للمالك والتسويق', 'Publishing is for Owner and Marketing')}</Locked>}
        </>} />
      <ReviewRole />
      {tried && hasErr && <Alert tone="bad" title={tx('أكمل الحقول المعلّمة قبل النشر', 'Complete the marked fields before publishing')}>{errors.products && tx(`منتجات داخل النص غير معروضة أونلاين: ${errors.products}`, `Products in the text are not sold online: ${errors.products}`)}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {langs.map((l) => <Field key={l} label={tx(`العنوان · ${l === 'ar' ? 'العربية' : 'الإنجليزية'}`, `Title · ${l === 'ar' ? 'Arabic' : 'English'}`)} error={errText(l === 'ar' ? 'titleAr' : 'titleEn')} hint={<bdi dir="ltr">{p.draft.title[l].length}/{POST_TITLE_MAX}</bdi>}>{(f) => <Input {...f} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} value={p.draft.title[l]} onChange={(e) => setC('title', l, e.target.value)} />}</Field>)}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {langs.map((l) => <Field key={l} label={tx(`ملخص · ${l === 'ar' ? 'العربية' : 'الإنجليزية'}`, `Summary · ${l === 'ar' ? 'Arabic' : 'English'}`)} optional hint={<bdi dir="ltr">{p.draft.excerpt[l].length}/{EXCERPT_MAX}</bdi>}>{(f) => <Textarea {...f} rows={2} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} value={p.draft.excerpt[l]} maxLength={EXCERPT_MAX} onChange={(e) => setC('excerpt', l, e.target.value)} />}</Field>)}
            </div>
            {langs.map((l) => (
              <div key={l} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2"><p className="text-[13px] font-semibold text-fg">{tx(`النص · ${l === 'ar' ? 'العربية' : 'الإنجليزية'}`, `Text · ${l === 'ar' ? 'Arabic' : 'English'}`)}</p>
                  <label className="ms-auto inline-flex items-center gap-1.5 text-xs text-muted"><ShoppingBag className="size-3.5" aria-hidden="true" /><span className="sr-only">{tx('أدرج منتجًا', 'Insert a product')}</span>
                    <Select aria-label={tx(`أدرج منتجًا في النص ${l === 'ar' ? 'العربي' : 'الإنجليزي'}`, `Insert a product in the ${l === 'ar' ? 'Arabic' : 'English'} text`)} value="" className="h-8 w-44 text-xs" onChange={(e) => e.target.value && insertProduct(l, e.target.value)}>
                      <option value="">{tx('أدرج منتجًا…', 'Insert a product…')}</option>
                      {products.filter((x) => ctx.liveProducts.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name[l]}</option>)}
                    </Select></label>
                </div>
                <RichEditor id={`bp-body-${l}`} lang={l} label={tx('النص', 'Text')} value={p.draft.body[l]} onChange={(v) => setC('body', l, v)} invalid={!!errText(l === 'ar' ? 'bodyAr' : 'bodyEn')} />
                {errText(l === 'ar' ? 'bodyAr' : 'bodyEn') && <p className="text-xs font-medium text-red-600 dark:text-red-400">{tx('مطلوب للنشر', 'Required to publish')}</p>}
              </div>
            ))}
            <p className="text-xs text-muted">{tx('سطر «@p:رقم المنتج» يضع بطاقة المنتج في مكانه بالمقال، بسعره ومخزونه الحي.', 'A line “@p:product id” places that product’s card at that point, with its live price and stock.')}</p>
          </Card>
          <SeoFields title={p.seo.title} desc={p.seo.desc} url={`${base}/blog/${p.slug}`} langs={settings.storeLangs}
            fallbackTitle={p.draft.title} fallbackDesc={{ ar: p.draft.excerpt.ar || postText(p.draft.body.ar), en: p.draft.excerpt.en || postText(p.draft.body.en) }} onChange={(seo) => set({ seo })} />
          <Card aria-labelledby="bp-prev">
            <CardHeader id="bp-prev" title={tx('ما يراه العميل', 'What shoppers see')} action={langs.length > 1 ? <span className="flex gap-1">{langs.map((l) => <Button key={l} size="sm" variant={pv === l ? 'primary' : 'ghost'} onClick={() => setPv(l)}>{l === 'ar' ? 'العربية' : 'English'}</Button>)}</span> : undefined} />
            <div className="space-y-3 px-5 pb-5"><Cover src={p.cover} className="aspect-[2/1] w-full" /><p className="text-lg font-bold text-fg" dir={pv === 'ar' ? 'rtl' : 'ltr'}>{p.draft.title[pv] || '—'}</p><PostBody src={p.draft.body[pv]} lang={pv} /></div>
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <Card className="space-y-4 p-5">
            <Field label={tx('التصنيف', 'Category')} error={errText('cat')}>{(f) => <Select {...f} value={p.cat} onChange={(e) => set({ cat: e.target.value })}><option value="">{tx('اختر…', 'Choose…')}</option>{blog.cats.map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}</Select>}</Field>
            <Field label={tx('رابط المقال', 'Article address')} error={errText('slug')} hint={<bdi dir="ltr" className="break-all">{base}/blog/{p.slug || '…'}</bdi>}>{(f) => <Input {...f} dir="ltr" value={p.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />}</Field>
            <Field label={<>{tx('وقت النشر', 'Publish time')}<InfoHint>{tx('فارغ = فور النشر. وقت لاحق = يظهر للعملاء تلقائيًا في وقته.', 'Empty = as soon as you publish. A later time = shoppers see it then, automatically.')}</InfoHint></>} optional hint={tx('بتوقيت الرياض', 'Riyadh time')} error={errText('publishAt')}>
              {(f) => <Input {...f} type="datetime-local" dir="ltr" value={p.publishAt} onChange={(e) => set({ publishAt: e.target.value })} />}
            </Field>
            <Field label={tx('صورة الغلاف', 'Cover picture')} error={upErr || null}>
              {(f) => <div className="space-y-2"><Cover src={p.cover} className="aspect-[2/1] w-full" />
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"><Upload className="size-4" aria-hidden="true" />{tx('ارفع صورة', 'Upload')}
                    <input {...f} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; const r = await readImage(file, 'image'); if (r.ok) { setUpErr(''); set({ cover: r.ref }); } else setUpErr(r.error === 'size' ? tx('الحد 5 ميغابايت', 'Max 5 MB') : r.error === 'type' ? tx('PNG أو JPG أو WebP', 'PNG, JPG or WebP') : r.error === 'small' ? tx('الصورة صغيرة جدًا', 'Picture too small') : tx('تعذّرت قراءة الصورة', 'Could not read the picture')); }} /></label>
                  {p.cover && <Button size="sm" variant="ghost" onClick={() => set({ cover: null })}>{tx('أزل', 'Remove')}</Button>}
                </div></div>}
            </Field>
            <div className="flex items-center gap-3 border-t border-border pt-4"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{tx('التعليقات على هذا المقال', 'Comments on this article')}</p><p className="text-xs text-muted">{p.comments ? tx('مفتوحة', 'Open') : tx('مغلقة؛ المعتمدة تبقى', 'Closed; approved ones stay')}</p></div><Switch checked={p.comments} label={tx('التعليقات', 'Comments')} onChange={(v) => set({ comments: v })} /></div>
          </Card>
          <Card className="space-y-2 p-5">
            {saved.live && canPub && <Button variant="secondary" className="w-full" onClick={() => setDlg('hide')}><EyeOff className="size-4" aria-hidden="true" />{saved.hidden ? tx('أظهر المقال', 'Show article') : tx('أخفِ المقال', 'Hide article')}</Button>}
            {canPub && <Button variant="ghost" className="w-full text-red-700 dark:text-red-400" onClick={() => setDlg('delete')}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف المقال', 'Delete article')}</Button>}
          </Card>
        </div>
      </div>
      <SaveBar dirty={dirty} saving={false} saveLabel={tx('احفظ كمسودة', 'Save draft')} onSave={() => { setTried(true); if (errors.slug) return; commit({ ...p, updatedAt: nowIso(), by: who }, tx('حُفظت المسودة؛ المنشور لم يتغير', 'Draft saved; the live article is unchanged'), { ar: `حفظ مسودة المقال «${p.draft.title.ar || p.slug}»`, en: `Saved a draft of the article “${p.draft.title.en || p.slug}”` }); }} onDiscard={() => { clearDraft(); setTried(false); }} />

      {dlg === 'publish' && (
        <Modal size="lg" title={later ? tx(`جدولة «${name}»`, `Schedule “${name}”`) : tx(`نشر «${name}»`, `Publish “${name}”`)} onClose={() => setDlg(null)}
          description={later ? tx(`يظهر للعملاء ${p.publishAt.replace('T', ' ')} بتوقيت الرياض.`, `Shoppers see it ${p.publishAt.replace('T', ' ')} Riyadh time.`) : !blog.settings.on ? tx('المدونة مخفية: يُنشر المقال لكنه لا يظهر حتى تُظهر المدونة.', 'The blog is hidden: the article is published but won’t show until you show the blog.') : tx('يظهر فورًا في المدونة وعلى رابطه.', 'It shows at once on the blog and at its address.')}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setDlg(null); commit(publishPost(p, nowIso(), who), later ? tx('جُدول المقال', 'Article scheduled') : tx('نُشر المقال', 'Article published'), { ar: `${later ? 'جدول' : 'نشر'} المقال «${p.draft.title.ar || p.slug}»`, en: `${later ? 'Scheduled' : 'Published'} the article “${p.draft.title.en || p.slug}”` }); }}>{later ? tx('جدوِل', 'Schedule') : tx('انشر', 'Publish')}</Button></>}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">{tx('الرابط', 'Address')}</dt><dd><bdi dir="ltr" className="break-all font-medium text-fg">{base}/blog/{p.slug}</bdi></dd></div>
            <div><dt className="text-xs text-muted">{tx('المنتجات داخل المقال', 'Products inside')}</dt><dd className="font-medium text-fg">{[...new Set([...productIdsIn(p.draft.body.ar), ...productIdsIn(p.draft.body.en)])].map((x) => products.find((y) => y.id === x)?.name[lang] ?? x).join('، ') || '—'}</dd></div>
          </dl>
          <div className="grid gap-3 sm:grid-cols-2">{langs.map((l) => <figure key={l} className="min-w-0 rounded-xl bg-surface-2 p-3"><figcaption className="mb-2 text-xs font-semibold text-muted">{l === 'ar' ? 'بالعربية' : 'In English'}</figcaption><p className="mb-2 font-bold" dir={l === 'ar' ? 'rtl' : 'ltr'}>{p.draft.title[l]}</p><div className="max-h-40 overflow-y-auto"><PostBody src={p.draft.body[l]} lang={l} /></div></figure>)}</div>
          <Simulated />
        </Modal>
      )}
      {dlg === 'hide' && <Modal title={saved.hidden ? tx('إظهار المقال', 'Show the article') : tx('إخفاء المقال', 'Hide the article')} onClose={() => setDlg(null)} description={saved.hidden ? tx('يعود في المدونة وعلى رابطه.', 'It returns to the blog and its address.') : tx('يختفي من المدونة ورابطه يعرض «غير موجودة». المحتوى والتعليقات تبقى.', 'It disappears from the blog and its address shows “not found”. Content and comments are kept.')}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setDlg(null); commit({ ...saved, hidden: !saved.hidden, updatedAt: nowIso() }, saved.hidden ? tx('ظهر المقال', 'Article shown') : tx('أُخفي المقال', 'Article hidden'), { ar: `${saved.hidden ? 'أظهر' : 'أخفى'} المقال «${saved.draft.title.ar}»`, en: `${saved.hidden ? 'Showed' : 'Hid'} the article “${saved.draft.title.en}”` }); }}>{saved.hidden ? tx('أظهر', 'Show') : tx('أخفِ', 'Hide')}</Button></>} />}
      {dlg === 'delete' && <Modal title={tx(`حذف «${name}»`, `Delete “${name}”`)} onClose={() => setDlg(null)} description={tx('لا يمكن التراجع. تُحذف تعليقاته أيضًا.', 'This can’t be undone. Its comments are deleted too.')}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { blogStore.set((b) => ({ ...b, posts: b.posts.filter((x) => x.id !== saved.id), comments: b.comments.filter((c) => c.postId !== saved.id) })); clearDraft(); setDlg(null); logAction('store', { ar: `حذف المقال «${saved.draft.title.ar || saved.slug}»`, en: `Deleted the article “${saved.draft.title.en || saved.slug}”` }, { target: `/blog/${saved.slug}` }); toast({ tone: 'ok', text: tx('حُذف المقال', 'Article deleted') }); navigate(storeHref('blog')); }}>{tx('احذف', 'Delete')}</Button></>} />}
    </div>
  );
}
