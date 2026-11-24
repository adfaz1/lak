// Store blog (`#/store/blog`, `#/store/blog/<slug>`): the merchant's published articles in the shopper's language, with
// category filters, product cards placed inside the text (live price and stock), and approved comments. A shopper's
// comment waits for the merchant's approval when moderation is on.
import { useEffect, useState } from 'react';
import { BookOpen, MessageSquare } from 'lucide-react';
import type { Route } from '../../../core/router';
import { Button, cn } from '../../../ds/ui';
import { Field, Input, Textarea } from '../../../ds/kit';
import { blogStore, mediaStore } from '../../dashboard/storefront/state';
import { COMMENT_MAX, addComment, approvedFor, commentError, postPieces, publishedAt, readMinutes, servedPosts, type BlogPost } from '../../dashboard/storefront/blog-model';
import { inlineRuns } from '../../dashboard/storefront/content';
import { mediaSrc } from '../theme';
import { Crumbs, H1, H2, PANEL, ProductPhoto, WRAP, to, useS } from '../kit';
import { useCatalog } from '../data';
import { ProductCard } from './Listing';

const pick = (x: { ar: string; en: string }, lang: 'ar' | 'en') => (x[lang] || x[lang === 'ar' ? 'en' : 'ar'] || '').trim();

function Cover({ post, className }: { post: BlogPost; className?: string }) {
  const lib = mediaStore.use();
  const catalog = useCatalog();
  const own = mediaSrc(post.cover ?? undefined, lib);
  const prod = post.cover?.startsWith('p:') ? catalog.find((p) => p.id === post.cover!.slice(2)) : undefined;
  if (own) return <img src={own} alt="" className={cn('w-full object-cover', className)} loading="lazy" />;
  if (prod) return <ProductPhoto p={prod} className={cn('w-full', className)} />;
  return <div className={cn('grid w-full place-items-center bg-surface-2 text-subtle', className)}><BookOpen className="size-6" aria-hidden="true" /></div>;
}

export function BlogList({ route }: { route: Route }) {
  const { lang, d } = useS();
  const blog = blogStore.use();
  const cat = route.query.get('cat') ?? '';
  const posts = servedPosts(blog, Date.now());
  const shown = posts.filter((p) => !cat || p.cat === cat);
  const cats = blog.cats.filter((c) => posts.some((p) => p.cat === c.id));
  const ar = lang === 'ar';
  useEffect(() => { const prev = document.title; document.title = ar ? 'المدونة' : 'Blog'; return () => { document.title = prev; }; }, [ar]);
  return (
    <div className={cn(WRAP, 'py-6 sm:py-10')}>
      <Crumbs items={[{ label: ar ? 'الرئيسية' : 'Home', href: to() }, { label: ar ? 'المدونة' : 'Blog' }]} />
      <h1 className={H1}>{ar ? 'المدونة' : 'Blog'}</h1>
      {cats.length > 1 && (
        <nav className="mt-5 flex flex-wrap gap-2" aria-label={ar ? 'التصنيفات' : 'Categories'}>
          <a href={to('/blog')} aria-current={!cat ? 'page' : undefined} className={cn('rounded-full border px-3 py-1.5 text-sm', !cat ? 'border-fg bg-fg text-bg' : 'border-border text-muted hover:text-fg')}>{ar ? 'الكل' : 'All'}</a>
          {cats.map((c) => <a key={c.id} href={to('/blog', { cat: c.id })} aria-current={cat === c.id ? 'page' : undefined} className={cn('rounded-full border px-3 py-1.5 text-sm', cat === c.id ? 'border-fg bg-fg text-bg' : 'border-border text-muted hover:text-fg')}>{pick(c.name, lang)}</a>)}
        </nav>
      )}
      {shown.length === 0 ? <p className="py-16 text-center text-muted">{ar ? 'لا مقالات بعد.' : 'No articles yet.'}</p> : (
        <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id} className="min-w-0">
              <a href={to(`/blog/${p.slug}`)} className="group block">
                <div className="overflow-hidden rounded-2xl"><Cover post={p} className="aspect-[3/2] transition-transform group-hover:scale-[1.02]" /></div>
                <p className="mt-3 text-xs text-muted">{pick(blog.cats.find((c) => c.id === p.cat)?.name ?? { ar: '', en: '' }, lang)} · {d(Date.parse(`${publishedAt(p)}:00+03:00`))}</p>
                <h2 className="mt-1 text-lg font-semibold leading-snug group-hover:underline">{pick(p.live!.title, lang)}</h2>
                {pick(p.live!.excerpt, lang) && <p className="mt-1 line-clamp-2 text-sm text-muted">{pick(p.live!.excerpt, lang)}</p>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BlogPostPage({ slug }: { slug: string }) {
  const { lang, d } = useS();
  const ar = lang === 'ar';
  const blog = blogStore.use();
  const catalog = useCatalog();
  const post = servedPosts(blog, Date.now()).find((p) => p.slug === slug);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<'pending' | 'approved' | null>(null);
  useEffect(() => {
    if (!post) return;
    const prev = document.title;
    document.title = pick(post.seo.title, lang) || pick(post.live!.title, lang);
    return () => { document.title = prev; };
  }, [post, lang]);
  if (!post) return (
    <div className={cn(WRAP, 'flex flex-col items-center py-24 text-center')}><h1 className={H1}>{ar ? 'المقال غير موجود' : 'Article not found'}</h1><a href={to('/blog')} className="mt-6 font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">{ar ? 'كل المقالات' : 'All articles'}</a></div>
  );
  const live = post.live!;
  const body = pick(live.body, lang);
  const comments = approvedFor(blog, post.id);
  const runs = (t: string) => inlineRuns(t).map((r, i) => (r.bold ? <strong key={i} className="font-semibold text-fg">{r.text}</strong> : <span key={i}>{r.text}</span>));
  const send = () => {
    const e = commentError(name, text, post, blog);
    if (e) { setErr(({ name: ar ? 'اكتب اسمك' : 'Enter your name', text: ar ? 'اكتب تعليقك' : 'Write your comment', long: ar ? `الحد ${COMMENT_MAX} حرف` : `Max ${COMMENT_MAX} characters`, link: ar ? 'الروابط غير مسموحة' : 'Links are not allowed', closed: ar ? 'التعليقات مغلقة' : 'Comments are closed' })[e]); return; }
    blogStore.set((b) => addComment(b, post.id, name, text, lang, new Date().toISOString()));
    setSent(blog.settings.moderation ? 'pending' : 'approved'); setText(''); setErr('');
  };
  return (
    <article className={cn(WRAP, 'max-w-3xl py-6 sm:py-10')}>
      <Crumbs items={[{ label: ar ? 'الرئيسية' : 'Home', href: to() }, { label: ar ? 'المدونة' : 'Blog', href: to('/blog') }, { label: pick(live.title, lang) }]} />
      <p className="text-sm text-muted">{pick(blog.cats.find((c) => c.id === post.cat)?.name ?? { ar: '', en: '' }, lang)} · {d(Date.parse(`${publishedAt(post)}:00+03:00`))} · {ar ? `${readMinutes(body)} د قراءة` : `${readMinutes(body)} min read`}</p>
      <h1 className={cn(H1, 'mt-2')}>{pick(live.title, lang)}</h1>
      {post.cover && <div className="mt-6 overflow-hidden rounded-2xl"><Cover post={post} className="aspect-[2/1]" /></div>}
      <div className="mt-8 space-y-5 text-[15px] leading-loose text-fg/90">
        {postPieces(body).map((x, i) => {
          if (x.kind === 'product') { const p = catalog.find((y) => y.id === x.id); return p ? <div key={i} className="mx-auto max-w-[260px]"><ProductCard p={p} /></div> : null; }
          return x.blocks.map((b, j) => b.type === 'h' ? <h2 key={`${i}-${j}`} className="pt-2 text-lg font-bold text-fg">{runs(b.text)}</h2> : b.type === 'ul' ? <ul key={`${i}-${j}`} className="list-disc space-y-1.5 ps-5">{b.items.map((t, k) => <li key={k}>{runs(t)}</li>)}</ul> : <p key={`${i}-${j}`}>{runs(b.text)}</p>);
        })}
      </div>
      <section className="mt-12 border-t border-border pt-8" aria-labelledby="cm-h">
        <h2 id="cm-h" className={cn(H2, 'flex items-center gap-2')}><MessageSquare className="size-5" aria-hidden="true" />{ar ? `التعليقات (${comments.length})` : `Comments (${comments.length})`}</h2>
        <ul className="mt-4 space-y-3">{comments.map((c) => <li key={c.id} className={cn(PANEL, 'p-4')}><p className="text-sm font-semibold" dir="auto">{c.name}</p><p className="mt-1 text-sm text-muted" dir="auto">{c.text}</p></li>)}</ul>
        {blog.settings.on && post.comments ? (
          sent ? <p className="mt-5 text-sm font-semibold text-emerald-700 dark:text-emerald-400" role="status">{sent === 'pending' ? (ar ? 'وصل تعليقك ويظهر بعد مراجعة المتجر.' : 'Thanks! Your comment shows after the store reviews it.') : (ar ? 'نُشر تعليقك.' : 'Your comment is posted.')}</p> : (
            <form className={cn(PANEL, 'mt-6 space-y-3 p-5')} onSubmit={(e) => { e.preventDefault(); send(); }} noValidate>
              <Field label={ar ? 'الاسم' : 'Name'}>{(f) => <Input {...f} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label={ar ? 'تعليقك' : 'Your comment'} error={err || null} hint={<bdi dir="ltr">{text.length}/{COMMENT_MAX}</bdi>}>{(f) => <Textarea {...f} rows={3} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
              <Button type="submit">{ar ? 'أرسل التعليق' : 'Post comment'}</Button>
            </form>
          )
        ) : <p className="mt-4 text-sm text-muted">{ar ? 'التعليقات مغلقة.' : 'Comments are closed.'}</p>}
      </section>
    </article>
  );
}
