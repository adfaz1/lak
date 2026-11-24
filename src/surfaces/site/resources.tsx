import { useState, type FormEvent } from 'react';
import { replace, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Badge, Empty, Field, Sim } from '../../core/ui';
import { ARTICLES, BLOG_CATS, HELP_CATS, POSTS } from './content';
import { hasErrors, related, searchItems, validateComment, type CommentDraft } from './domain';
import { Icon, Intro, Pending, site, useSite } from './kit';

/* Help center (searchable knowledge base) and blog (list, categories, article, comments). */

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

/* ---------------- help ---------------- */

export function Help({ route, id }: { route: Route; id?: string }) {
  return id ? <HelpArticle key={id} id={id} /> : <HelpIndex route={route} />;
}

function HelpIndex({ route }: { route: Route }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const q = route.query.get('q') ?? '';
  const cat = HELP_CATS.some((h) => h.id === route.query.get('cat')) ? route.query.get('cat')! : '';
  const results = searchItems(ARTICLES, q, cat || undefined);
  const set = (next: { q?: string; cat?: string }) => replace(site('help', { q: next.q ?? q, cat: next.cat ?? cat }));

  return (
    <div className="site-wrap site-pad">
      <Intro eyebrow={c.hEyebrow} title={c.hTitle} lead={c.hLead}>
        <form className="site-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="site-help-q" className="sr">{c.hSearch}</label>
          <Icon name="search" />
          <input id="site-help-q" className="input" type="search" value={q} placeholder={c.hSearchPh}
            onChange={(e) => set({ q: e.target.value })} autoComplete="off" />
          {q && <button type="button" className="btn small" onClick={() => set({ q: '' })}>{t.clear}</button>}
        </form>
      </Intro>

      <section className="site-block" aria-labelledby="site-help-cats">
        <h2 className="site-h3" id="site-help-cats">{c.cats}</h2>
        <ul className="site-cats">
          <li><a href={site('help', { q: q || undefined })} aria-current={!cat ? 'true' : undefined}><span className="strong">{c.allArticles}</span><span className="muted small">{c.articles(ARTICLES.length)}</span></a></li>
          {HELP_CATS.map((h) => (
            <li key={h.id}>
              <a href={site('help', { q: q || undefined, cat: h.id })} aria-current={cat === h.id ? 'true' : undefined}>
                <span className="strong">{tr(h.name)}</span><span className="muted small">{tr(h.blurb)} · {c.articles(ARTICLES.filter((a) => a.cat === h.id).length)}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="site-block" aria-labelledby="site-help-res">
        <h2 className="site-h3" id="site-help-res">{cat ? tr(HELP_CATS.find((h) => h.id === cat)!.name) : c.allArticles}</h2>
        <p className="muted small" aria-live="polite">{t.results(results.length)}</p>
        {results.length === 0 ? (
          <Empty action={<a className="btn" href={site('contact', { topic: 'support' })}>{c.contactSupport}</a>}>
            <span><strong>{t.noResults(q)}</strong> <span className="muted">{t.noResultsHint}</span></span>
          </Empty>
        ) : (
          <ul className="site-list">
            {results.map((a) => (
              <li key={a.id}>
                <a href={site(`help/${a.id}`)}>
                  <span className="site-list-meta">{tr(HELP_CATS.find((h) => h.id === a.cat)!.name)} · {t.minutes(a.minutes)}</span>
                  <span className="site-list-title">{tr(a.title)}</span>
                  <span className="muted">{tr(a.summary)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">{c.videos}</p>
      </section>
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
    <div className="site-wrap site-pad site-article-layout">
      <article className="site-article">
        <nav className="site-crumbs" aria-label={t.back}>
          <a href={site('help')}>{c.hEyebrow}</a><Icon name="chevron" size={14} /><a href={site('help', { cat: a.cat })}>{tr(cat.name)}</a>
        </nav>
        <Intro title={tr(a.title)} lead={tr(a.summary)}><p className="muted small">{t.minutes(a.minutes)}</p></Intro>
        <div className="site-prose">{a.body.map((p) => <p key={p.en}>{tr(p)}</p>)}</div>
        <div className="site-feedback" aria-live="polite">
          {vote ? <p>{vote === 'yes' ? c.thanks : c.sorry}</p> : (
            <>
              <span className="strong">{c.helpful}</span>
              <button type="button" className="btn small" onClick={() => setVote('yes')}>{c.yes}</button>
              <button type="button" className="btn small" onClick={() => setVote('no')}>{c.no}</button>
            </>
          )}
        </div>
      </article>
      <aside className="site-aside">
        <h2 className="site-h4">{c.relatedH}</h2>
        <ul className="site-aside-list">
          {related(ARTICLES, a).map((r) => <li key={r.id}><a href={site(`help/${r.id}`)}>{tr(r.title)}</a></li>)}
        </ul>
        <h2 className="site-h4">{c.stillNeed}</h2>
        <a className="btn" href={site('contact', { topic: 'support' })}>{c.contactSupport}</a>
      </aside>
    </div>
  );
}

function Missing({ title, body, back, backLabel }: { title: string; body: string; back: string; backLabel: string }) {
  return (
    <div className="site-wrap site-narrow site-pad">
      <Intro title={title} lead={body} />
      <a className="btn primary" href={back}>{backLabel}</a>
    </div>
  );
}

/* ---------------- blog ---------------- */

interface Comment { n: number; name: string; body: string }
/** Simulated, local-only comments. Reset with the global "Reset data" button. */
const commentsStore = createStore<Record<string, Comment[]>>(() => ({}));

export function Blog({ route, id }: { route: Route; id?: string }) {
  return id ? <BlogPost key={id} id={id} /> : <BlogIndex route={route} />;
}

function BlogIndex({ route }: { route: Route }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const cat = BLOG_CATS.some((b) => b.id === route.query.get('cat')) ? route.query.get('cat')! : '';
  const posts = POSTS.filter((p) => !cat || p.cat === cat);
  const [lead, ...rest] = posts;
  const catName = (id: string) => tr(BLOG_CATS.find((b) => b.id === id)!.name);

  return (
    <div className="site-wrap site-pad">
      <Intro eyebrow={c.bEyebrow} title={c.bTitle} lead={c.bLead} />
      <Pending title={c.bDraft}>{c.bDraftWhy}</Pending>
      <div className="views site-block" role="group" aria-label={c.blogCats}>
        <a className="chip" href={site('blog')} aria-current={!cat ? 'true' : undefined}>{t.all}</a>
        {BLOG_CATS.map((b) => <a key={b.id} className="chip" href={site('blog', { cat: b.id })} aria-current={cat === b.id ? 'true' : undefined}>{tr(b.name)}</a>)}
      </div>
      {lead && (
        <a className="site-feature" href={site(`blog/${lead.id}`)}>
          <span className="site-list-meta">{catName(lead.cat)} · {t.minutes(lead.minutes)}</span>
          <span className="site-feature-title">{tr(lead.title)}</span>
          <span className="site-lead">{tr(lead.summary)}</span>
          <span className="site-link">{t.readMore}<Icon name="arrow" size={16} /></span>
        </a>
      )}
      <ul className="site-list site-list-grid">
        {rest.map((p) => (
          <li key={p.id}>
            <a href={site(`blog/${p.id}`)}>
              <span className="site-list-meta">{catName(p.cat)} · {t.minutes(p.minutes)}</span>
              <span className="site-list-title">{tr(p.title)}</span>
              <span className="muted">{tr(p.summary)}</span>
            </a>
          </li>
        ))}
      </ul>
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
    <div className="site-wrap site-pad site-article-layout">
      <article className="site-article">
        <nav className="site-crumbs" aria-label={t.back}>
          <a href={site('blog')}>{c.bEyebrow}</a><Icon name="chevron" size={14} /><a href={site('blog', { cat: p.cat })}>{tr(cat.name)}</a>
        </nav>
        <Intro title={tr(p.title)} lead={tr(p.summary)}>
          <p className="muted small">{c.byline} · {t.minutes(p.minutes)} · <Badge>{c.bDraft}</Badge></p>
        </Intro>
        <div className="site-prose">{p.body.map((b) => <p key={b.en}>{tr(b)}</p>)}</div>

        <section className="site-comments" aria-labelledby="site-comments-h">
          <h2 className="site-h3" id="site-comments-h">{c.comments} <span className="muted">({comments.length})</span></h2>
          {comments.length === 0 ? <p className="muted">{c.noComments}</p> : (
            <ul className="site-comment-list">
              {comments.map((cm) => (
                <li key={cm.n}>
                  <div className="site-comment-head"><span className="strong">{cm.name}</span><Badge tone="warning">{c.moderation}</Badge><Sim /></div>
                  <p>{cm.body}</p>
                </li>
              ))}
            </ul>
          )}
          <form className="site-form" onSubmit={submit} noValidate>
            <Field id="site-cm-name" label={c.yourName} error={errors.name && t.errors[errors.name]}>
              <input id="site-cm-name" className="input" value={draft.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'site-cm-name-err' : undefined}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoComplete="name" />
            </Field>
            <Field id="site-cm-body" label={c.yourComment} error={errors.body && t.errors[errors.body]}>
              <textarea id="site-cm-body" className="input" value={draft.body} aria-invalid={!!errors.body} aria-describedby={errors.body ? 'site-cm-body-err' : undefined}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
            <p className="muted small">{c.moderationNote}</p>
            <div className="actions"><button type="submit" className="btn primary">{c.post}</button><Sim /></div>
          </form>
        </section>
      </article>
      <aside className="site-aside">
        <h2 className="site-h4">{c.relatedPosts}</h2>
        <ul className="site-aside-list">
          {related(POSTS, p).map((r) => <li key={r.id}><a href={site(`blog/${r.id}`)}>{tr(r.title)}</a></li>)}
        </ul>
      </aside>
    </div>
  );
}
