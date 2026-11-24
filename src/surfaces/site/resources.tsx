// P01-HLP / P01-BLG — help center (searchable knowledge base) and blog (list, categories, article, comments).
import { useState, type FormEvent } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, LifeBuoy, SearchX } from 'lucide-react';
import { useLang } from '../../core/lang';
import { replace, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Badge, Button, Card, cn, EmptyState, LinkButton } from '../../ds/ui';
import { Field, Input, SearchInput, Simulated, Textarea } from '../../ds/kit';
import { ARTICLES, BLOG_CATS, HELP_CATS, POSTS } from './content';
import { hasErrors, related, searchItems, validateComment, type CommentDraft } from './domain';
import { ArrowLink, Fwd, H3, Intro, Pending, site, useSite, wrap } from './kit';
import { useSiteState } from './review';

const C = {
  ar: {
    hEyebrow: 'مركز المساعدة', hTitle: 'كيف نساعدك؟', hLead: 'مقالات قصيرة عن إنشاء المتجر والطلبات والمدفوعات والمخزون. كل مقال يوضح ما هو متاح في المعاينة وما هو مخطط.',
    hSearch: 'ابحث في مقالات المساعدة', hSearchPh: 'مثال: الاسترداد، مدى، المخزون', cats: 'التصنيفات', articles: (n: number) => `${n} مقالات`,
    allArticles: 'كل المقالات', helpful: 'هل أفادك هذا المقال؟', yes: 'نعم', no: 'لا', thanks: 'شكرًا، سجّلنا رأيك في هذه المعاينة فقط.', sorry: 'شكرًا. إن احتجت مساعدة أكثر، راسل فريق الدعم.',
    relatedH: 'مقالات ذات صلة', stillNeed: 'ما زلت تحتاج مساعدة؟', contactSupport: 'راسل فريق الدعم', missing: 'هذا المقال غير موجود', missingBody: 'ربما نُقل أو حُذف. ابحث في مركز المساعدة.',
    videos: 'الدروس المرئية لم تُسجَّل بعد، وستُضاف إلى التصنيفات نفسها.',
    bEyebrow: 'المدونة', bTitle: 'أفكار عملية لإدارة متجر', bLead: 'مقالات عن البيع والتشغيل والتسويق، بالعربية والإنجليزية.',
    bDraft: 'مقالات تجريبية للمعاينة', bDraftWhy: 'المحتوى بانتظار مراجعة التحرير قبل النشر.', byline: 'فريق تحرير لك',
    comments: 'التعليقات', noComments: 'لا توجد تعليقات بعد.', yourName: 'الاسم', yourComment: 'تعليقك', post: 'أرسل التعليق',
    moderation: 'بانتظار المراجعة', moderationNote: 'محاكاة: يظهر لك فقط في هذه المعاينة ولم يُرسل لأي خادم.', relatedPosts: 'مقالات ذات صلة',
    allPosts: 'كل المقالات', missingPost: 'هذه المقالة غير موجودة', blogCats: 'تصنيفات المدونة',
  },
  en: {
    hEyebrow: 'Help center', hTitle: 'How can we help?', hLead: 'Short articles on creating a store, orders, payments and stock. Each article says what is available in the preview and what is planned.',
    hSearch: 'Search help articles', hSearchPh: 'e.g. refund, mada, stock', cats: 'Categories', articles: (n: number) => (n === 1 ? '1 article' : `${n} articles`),
    allArticles: 'All articles', helpful: 'Was this article helpful?', yes: 'Yes', no: 'No', thanks: 'Thanks — your answer is recorded in this preview only.', sorry: 'Thanks. If you need more help, message the support team.',
    relatedH: 'Related articles', stillNeed: 'Still need help?', contactSupport: 'Message the support team', missing: 'This article does not exist', missingBody: 'It may have moved or been removed. Search the help center.',
    videos: 'Video tutorials are not recorded yet and will be added to the same categories.',
    bEyebrow: 'Blog', bTitle: 'Practical ideas for running a store', bLead: 'Articles on selling, operations and marketing, in Arabic and English.',
    bDraft: 'Sample articles for the preview', bDraftWhy: 'Content is awaiting editorial review before publishing.', byline: 'LAK editorial team',
    comments: 'Comments', noComments: 'No comments yet.', yourName: 'Name', yourComment: 'Your comment', post: 'Post comment',
    moderation: 'Awaiting moderation', moderationNote: 'Simulated: visible only to you in this preview and not sent to any server.', relatedPosts: 'Related articles',
    allPosts: 'All articles', missingPost: 'This article does not exist', blogCats: 'Blog categories',
  },
};

const pageCls = cn(wrap, 'py-14 sm:py-20');

function Crumbs({ items }: { items: { href: string; label: string }[] }) {
  const { lang } = useLang();
  const Sep = lang === 'ar' ? ChevronLeft : ChevronRight;
  return (
    <nav aria-label={lang === 'ar' ? 'مسار الصفحة' : 'Breadcrumb'} className="mb-6 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-muted">
      {items.map((i, n) => <span key={i.href} className="inline-flex items-center gap-1.5">{n > 0 && <Sep className="size-3.5" aria-hidden="true" />}<a href={i.href} className="hover:text-fg">{i.label}</a></span>)}
    </nav>
  );
}

const Prose = ({ paras }: { paras: string[] }) => <div className="max-w-[68ch] space-y-5 text-[17px] leading-[1.85] text-fg">{paras.map((p) => <p key={p}>{p}</p>)}</div>;

/* ---------------- help ---------------- */

export function Help({ route, id }: { route: Route; id?: string }) {
  return id ? <HelpArticle key={id} id={id} /> : <HelpIndex route={route} />;
}

function HelpIndex({ route }: { route: Route }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const empty = useSiteState() === 'empty';
  const all = empty ? [] : ARTICLES;
  const q = route.query.get('q') ?? '';
  const cat = HELP_CATS.some((h) => h.id === route.query.get('cat')) ? route.query.get('cat')! : '';
  const results = searchItems(all, q, cat || undefined);
  const set = (next: { q?: string; cat?: string }) => replace(site('help', { q: next.q ?? q, cat: next.cat ?? cat }));
  const catLink = (id: string, label: string, count: number, blurb?: string) => (
    <a href={site('help', { q: q || undefined, cat: id || undefined })} aria-current={cat === id ? 'true' : undefined}
      className={cn('block rounded-xl px-3 py-2.5 transition-colors', cat === id ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-fg hover:bg-surface-2')}>
      <span className="flex items-center justify-between gap-2 text-sm font-semibold">{label}<span className="text-xs font-medium text-subtle tabular-nums">{count}</span></span>
      {blurb && <span className="mt-0.5 block text-xs text-muted">{blurb}</span>}
    </a>
  );

  return (
    <div className={pageCls}>
      <Intro eyebrow={c.hEyebrow} title={c.hTitle} lead={c.hLead}>
        <form role="search" onSubmit={(e) => e.preventDefault()} className="flex max-w-xl gap-2 pt-2 [&>div]:sm:max-w-none">
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={c.hSearchPh} />
          {q && <Button variant="ghost" onClick={() => set({ q: '' })}>{t.clear}</Button>}
        </form>
      </Intro>

      {all.length === 0 ? (
        <Card className="mt-12"><EmptyState as="h2" icon={<BookOpen className="size-6" aria-hidden="true" />} title={t.emptyHelp}
          action={<LinkButton href={site('contact', { topic: 'support' })}>{c.contactSupport}</LinkButton>}>{t.emptyHelpBody}</EmptyState></Card>
      ) : (
        <div className="mt-12 grid gap-10 lg:grid-cols-12">
          <nav aria-labelledby="site-help-cats" className="lg:col-span-3">
            <h2 id="site-help-cats" className="mb-3 px-3 text-xs font-semibold tracking-wide text-subtle">{c.cats}</h2>
            <ul className="space-y-1">
              <li>{catLink('', c.allArticles, all.length)}</li>
              {HELP_CATS.map((h) => <li key={h.id}>{catLink(h.id, tr(h.name), all.filter((a) => a.cat === h.id).length, tr(h.blurb))}</li>)}
            </ul>
          </nav>
          <section aria-labelledby="site-help-res" className="lg:col-span-9">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="site-help-res" className="text-lg font-semibold text-fg">{cat ? tr(HELP_CATS.find((h) => h.id === cat)!.name) : c.allArticles}</h2>
              <p className="text-sm text-muted" aria-live="polite">{t.results(results.length)}</p>
            </div>
            {results.length === 0 ? (
              <Card><EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={t.noResults(q)}
                action={<><Button variant="secondary" onClick={() => set({ q: '', cat: '' })}>{t.clear}</Button><LinkButton variant="ghost" href={site('contact', { topic: 'support' })}>{c.contactSupport}</LinkButton></>}>{t.noResultsHint}</EmptyState></Card>
            ) : (
              <Card><ul className="divide-y divide-border">
                {results.map((a) => (
                  <li key={a.id}>
                    <a href={site(`help/${a.id}`)} className="group flex gap-4 px-5 py-4 transition-colors hover:bg-surface-2/60">
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-subtle">{tr(HELP_CATS.find((h) => h.id === a.cat)!.name)} · {t.minutes(a.minutes)}</span>
                        <span className="mt-1 block font-semibold text-fg group-hover:text-brand-700 dark:group-hover:text-brand-300">{tr(a.title)}</span>
                        <span className="mt-1 block text-sm text-muted">{tr(a.summary)}</span>
                      </span>
                      <Fwd className="mt-6 text-subtle" />
                    </a>
                  </li>
                ))}
              </ul></Card>
            )}
            <p className="mt-4 text-xs text-subtle">{c.videos}</p>
          </section>
        </div>
      )}
    </div>
  );
}

function HelpArticle({ id }: { id: string }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const a = ARTICLES.find((x) => x.id === id);
  const [vote, setVote] = useState<'yes' | 'no' | null>(null);
  if (!a) return <Missing title={c.missing} body={c.missingBody} back={site('help')} backLabel={c.hEyebrow} />;
  const cat = HELP_CATS.find((h) => h.id === a.cat)!;

  return (
    <div className={cn(pageCls, 'grid gap-12 lg:grid-cols-12')}>
      <article className="lg:col-span-8">
        <Crumbs items={[{ href: site('help'), label: c.hEyebrow }, { href: site('help', { cat: a.cat }), label: tr(cat.name) }]} />
        <Intro title={tr(a.title)} lead={tr(a.summary)}><p className="text-xs text-subtle">{t.minutes(a.minutes)}</p></Intro>
        <div className="mt-10"><Prose paras={a.body.map(tr)} /></div>
        <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-border pt-6" aria-live="polite">
          {vote ? <p className="text-sm text-muted">{vote === 'yes' ? c.thanks : c.sorry}</p> : (
            <>
              <span className="text-sm font-semibold text-fg">{c.helpful}</span>
              <Button size="sm" variant="secondary" onClick={() => setVote('yes')}>{c.yes}</Button>
              <Button size="sm" variant="secondary" onClick={() => setVote('no')}>{c.no}</Button>
            </>
          )}
        </div>
      </article>
      <aside className="space-y-8 lg:col-span-4 lg:pt-12">
        <div>
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-subtle">{c.relatedH}</h2>
          <ul className="space-y-2.5">{related(ARTICLES, a).map((r) => <li key={r.id}><a href={site(`help/${r.id}`)} className="text-sm font-medium text-fg hover:text-brand-700 hover:underline dark:hover:text-brand-300">{tr(r.title)}</a></li>)}</ul>
        </div>
        <Card className="space-y-3 p-5">
          <LifeBuoy className="size-5 text-brand-600" aria-hidden="true" />
          <h2 className="font-semibold text-fg">{c.stillNeed}</h2>
          <LinkButton variant="secondary" href={site('contact', { topic: 'support' })}>{c.contactSupport}</LinkButton>
        </Card>
      </aside>
    </div>
  );
}

function Missing({ title, body, back, backLabel }: { title: string; body: string; back: string; backLabel: string }) {
  return (
    <div className={pageCls}>
      <Intro title={title} lead={body} />
      <div className="mt-8"><LinkButton size="lg" href={back}>{backLabel}</LinkButton></div>
    </div>
  );
}

/* ---------------- blog ---------------- */

interface Comment { n: number; name: string; body: string }
/** Simulated, local-only comments (per tab session). */
const commentsStore = createStore.key('site.commentsStore')<Record<string, Comment[]>>(() => ({}));

export function Blog({ route, id }: { route: Route; id?: string }) {
  return id ? <BlogPost key={id} id={id} /> : <BlogIndex route={route} />;
}

function BlogIndex({ route }: { route: Route }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const empty = useSiteState() === 'empty';
  const cat = BLOG_CATS.some((b) => b.id === route.query.get('cat')) ? route.query.get('cat')! : '';
  const posts = (empty ? [] : POSTS).filter((p) => !cat || p.cat === cat);
  const [lead, ...rest] = posts;
  const catName = (id: string) => tr(BLOG_CATS.find((b) => b.id === id)!.name);
  const chip = (id: string, label: string) => (
    <a key={id || 'all'} href={site('blog', { cat: id || undefined })} aria-current={cat === id ? 'true' : undefined}
      className={cn('inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors', cat === id ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-surface text-muted hover:text-fg')}>{label}</a>
  );

  return (
    <div className={cn(pageCls, 'space-y-10')}>
      <Intro eyebrow={c.bEyebrow} title={c.bTitle} lead={c.bLead} />
      <Pending title={c.bDraft}>{c.bDraftWhy}</Pending>
      <div role="group" aria-label={c.blogCats} className="flex flex-wrap gap-2">
        {chip('', t.all)}{BLOG_CATS.map((b) => chip(b.id, tr(b.name)))}
      </div>
      {!lead ? (
        <Card><EmptyState as="h2" title={t.emptyBlog}>{t.emptyBlogBody}</EmptyState></Card>
      ) : (
        <>
          <a href={site(`blog/${lead.id}`)} className="group block rounded-3xl border border-border bg-surface p-8 transition-colors hover:border-brand-300 sm:p-12">
            <span className="text-xs text-subtle">{catName(lead.cat)} · {t.minutes(lead.minutes)}</span>
            <span className="mt-3 block max-w-3xl text-2xl font-bold leading-snug text-fg group-hover:text-brand-700 sm:text-[34px] dark:group-hover:text-brand-300">{tr(lead.title)}</span>
            <span className="mt-4 block max-w-2xl leading-relaxed text-muted">{tr(lead.summary)}</span>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300">{t.readMore}<Fwd /></span>
          </a>
          {rest.length > 0 && (
            <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <li key={p.id} className="border-t border-border pt-5">
                  <a href={site(`blog/${p.id}`)} className="group block">
                    <span className="text-xs text-subtle">{catName(p.cat)} · {t.minutes(p.minutes)}</span>
                    <span className="mt-2 block text-lg font-semibold leading-snug text-fg group-hover:text-brand-700 dark:group-hover:text-brand-300">{tr(p.title)}</span>
                    <span className="mt-2 block text-sm leading-relaxed text-muted">{tr(p.summary)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function BlogPost({ id }: { id: string }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const all = commentsStore.use();
  const [draft, setDraft] = useState<CommentDraft>({ name: '', body: '' });
  const [errors, setErrors] = useState<ReturnType<typeof validateComment>>({});
  const p = POSTS.find((x) => x.id === id);
  if (!p) return <Missing title={c.missingPost} body={c.missingBody} back={site('blog')} backLabel={c.allPosts} />;
  const comments = all[p.id] ?? [];
  const cat = BLOG_CATS.find((b) => b.id === p.cat)!;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateComment(draft);
    setErrors(errs);
    if (hasErrors(errs)) return;
    commentsStore.set((s) => ({ ...s, [p.id]: [...(s[p.id] ?? []), { n: Date.now(), name: draft.name.trim(), body: draft.body.trim() }] }));
    setDraft({ name: '', body: '' });
  };

  return (
    <div className={cn(pageCls, 'grid gap-12 lg:grid-cols-12')}>
      <article className="lg:col-span-8">
        <Crumbs items={[{ href: site('blog'), label: c.bEyebrow }, { href: site('blog', { cat: p.cat }), label: tr(cat.name) }]} />
        <Intro title={tr(p.title)} lead={tr(p.summary)}>
          <p className="flex flex-wrap items-center gap-2 text-xs text-subtle">{c.byline} · {t.minutes(p.minutes)} <Badge tone="amber">{c.bDraft}</Badge></p>
        </Intro>
        <div className="mt-10"><Prose paras={p.body.map(tr)} /></div>

        <section aria-labelledby="site-comments-h" className="mt-14 space-y-6 border-t border-border pt-8">
          <H3 id="site-comments-h">{c.comments} <span className="text-muted tabular-nums">({comments.length})</span></H3>
          {comments.length === 0 ? <p className="text-sm text-muted">{c.noComments}</p> : (
            <ul className="space-y-3">
              {comments.map((cm) => (
                <li key={cm.n} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-fg">{cm.name}</span><Badge tone="amber">{c.moderation}</Badge><Simulated /></div>
                  <p className="mt-2 text-sm leading-relaxed text-fg">{cm.body}</p>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submit} noValidate className="max-w-xl space-y-4">
            <Field label={c.yourName} error={errors.name && t.errors[errors.name]}>
              {(f) => <Input {...f} value={draft.name} autoComplete="name" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
            </Field>
            <Field label={c.yourComment} error={errors.body && t.errors[errors.body]}>
              {(f) => <Textarea {...f} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />}
            </Field>
            <div className="flex flex-wrap items-center gap-3"><Button type="submit">{c.post}</Button><Simulated /></div>
            <p className="text-xs text-subtle">{c.moderationNote}</p>
          </form>
        </section>
      </article>
      <aside className="lg:col-span-4 lg:pt-12">
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-subtle">{c.relatedPosts}</h2>
        <ul className="space-y-4">{related(POSTS, p).map((r) => <li key={r.id}><ArrowLink href={site(`blog/${r.id}`)}>{tr(r.title)}</ArrowLink></li>)}</ul>
      </aside>
    </div>
  );
}
