// Blog (`#/dashboard/storefront/blog`): articles in Arabic and English with categories, a cover picture, SEO, a
// publish time, products placed inside the text, and comment moderation. Pure rules only (no React, no stores).
// The shopper store lists published articles at #/store/blog and shows one at #/store/blog/<slug>.
import type { L } from '../../../core/lang';
import { RESERVED_SLUGS, SLUG_MAX, plainText, toBlocks, type Block } from './content';
import { riyadhMs } from './landing-model';

export interface BlogCat { id: string; name: L }
export type CommentState = 'pending' | 'approved' | 'hidden' | 'spam';
export interface BlogComment { id: string; postId: string; name: string; text: string; at: string; state: CommentState; lang: 'ar' | 'en' }
export interface PostContent { title: L; body: L; excerpt: L }
export interface BlogPost {
  id: string; slug: string; cat: string;
  draft: PostContent;
  live: PostContent | null;
  /** "m:<mediaId>" upload or "p:<productId>" photo; null = no cover. */
  cover: string | null;
  /** Riyadh "yyyy-mm-ddThh:mm"; empty = as soon as it is published. */
  publishAt: string;
  hidden: boolean;
  seo: { title: L; desc: L };
  /** Off = no new comments on this article (approved ones stay). */
  comments: boolean;
  updatedAt: string; by: string;
}
export interface BlogSettings { on: boolean; moderation: boolean; inMenu: boolean }
export interface BlogState { posts: BlogPost[]; cats: BlogCat[]; comments: BlogComment[]; settings: BlogSettings }

export type PostState = 'draft' | 'scheduled' | 'live' | 'liveWithDraft' | 'hidden';
export function postState(p: BlogPost, now: number): PostState {
  if (!p.live) return 'draft';
  if (p.hidden) return 'hidden';
  const at = riyadhMs(p.publishAt);
  if (!Number.isNaN(at) && now < at) return 'scheduled';
  return JSON.stringify(p.draft) === JSON.stringify(p.live) ? 'live' : 'liveWithDraft';
}
export const postServed = (p: BlogPost, now: number) => { const s = postState(p, now); return s === 'live' || s === 'liveWithDraft'; };
export const servedPosts = (b: BlogState, now: number) => (b.settings.on ? b.posts.filter((p) => postServed(p, now)).sort((x, y) => (publishedAt(y) > publishedAt(x) ? 1 : -1)) : []);
export const publishedAt = (p: BlogPost) => p.publishAt || p.updatedAt.slice(0, 16);

/* ---------- Body: the page editor's text with product lines ---------- */

/** A line "@p:<productId>" places a product card at that point in the article. */
export const PRODUCT_LINE = /^@p:([a-z0-9_-]+)$/i;
export type PostPiece = { kind: 'text'; blocks: Block[] } | { kind: 'product'; id: string };
export function postPieces(src: string): PostPiece[] {
  const out: PostPiece[] = [];
  let buf: string[] = [];
  const flush = () => { const t = buf.join('\n'); if (t.trim()) out.push({ kind: 'text', blocks: toBlocks(t) }); buf = []; };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const m = raw.trim().match(PRODUCT_LINE);
    if (m) { flush(); out.push({ kind: 'product', id: m[1] }); } else buf.push(raw);
  }
  flush();
  return out;
}
export const productIdsIn = (src: string) => [...new Set(postPieces(src).flatMap((x) => (x.kind === 'product' ? [x.id] : [])))];
export const postText = (src: string) => plainText(src.split('\n').filter((l) => !PRODUCT_LINE.test(l.trim())).join('\n'));
export const readMinutes = (src: string) => Math.max(1, Math.round(postText(src).split(/\s+/).filter(Boolean).length / 200));

/* ---------- Validation ---------- */

export const POST_TITLE_MAX = 90;
export const EXCERPT_MAX = 200;
export const COMMENT_MAX = 500;
export type PostSlugIssue = 'empty' | 'format' | 'reserved' | 'taken' | null;
export function postSlugIssue(slug: string, posts: BlogPost[], selfId?: string): PostSlugIssue {
  if (!slug) return 'empty';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > SLUG_MAX) return 'format';
  if (RESERVED_SLUGS.includes(slug)) return 'reserved';
  if (posts.some((p) => p.slug === slug && p.id !== selfId)) return 'taken';
  return null;
}
export type PostErrors = Partial<Record<'titleAr' | 'titleEn' | 'bodyAr' | 'bodyEn' | 'slug' | 'cat' | 'products' | 'publishAt', string>>;
export function postErrors(p: BlogPost, b: BlogState, langs: { ar: boolean; en: boolean }, liveProducts: string[]): PostErrors {
  const e: PostErrors = {};
  for (const l of ['ar', 'en'] as const) {
    if (!langs[l]) continue;
    const k = l === 'ar' ? 'Ar' : 'En';
    if (!p.draft.title[l].trim()) e[`title${k}`] = 'required';
    else if (p.draft.title[l].length > POST_TITLE_MAX) e[`title${k}`] = 'long';
    if (!postText(p.draft.body[l]).trim()) e[`body${k}`] = 'required';
  }
  const s = postSlugIssue(p.slug, b.posts, p.id);
  if (s) e.slug = s;
  if (!b.cats.some((c) => c.id === p.cat)) e.cat = 'required';
  const missing = [...productIdsIn(p.draft.body.ar), ...productIdsIn(p.draft.body.en)].filter((id) => !liveProducts.includes(id));
  if (missing.length) e.products = missing.join(',');
  if (p.publishAt && Number.isNaN(riyadhMs(p.publishAt))) e.publishAt = 'format';
  return e;
}

/* ---------- Editing ---------- */

export function newPost(b: BlogState, now: string, by: string): BlogPost {
  let n = b.posts.length + 1;
  while (b.posts.some((p) => p.id === `bp${n}` || p.slug === `post-${n}`)) n++;
  return { id: `bp${n}`, slug: `post-${n}`, cat: b.cats[0]?.id ?? '', draft: { title: { ar: '', en: '' }, body: { ar: '', en: '' }, excerpt: { ar: '', en: '' } }, live: null, cover: null, publishAt: '', hidden: false, seo: { title: { ar: '', en: '' }, desc: { ar: '', en: '' } }, comments: true, updatedAt: now, by };
}
export const publishPost = (p: BlogPost, now: string, by: string): BlogPost => ({ ...p, live: JSON.parse(JSON.stringify(p.draft)) as PostContent, hidden: false, updatedAt: now, by });
export const upsertPost = (b: BlogState, p: BlogPost): BlogState => ({ ...b, posts: b.posts.some((x) => x.id === p.id) ? b.posts.map((x) => (x.id === p.id ? p : x)) : [...b.posts, p] });
export const CAT_MAX = 12;
export const catIssue = (name: L, cats: BlogCat[], langs: { ar: boolean; en: boolean }, selfId?: string): 'empty' | 'taken' | null =>
  (langs.ar && !name.ar.trim()) || (langs.en && !name.en.trim()) ? 'empty'
    : cats.some((c) => c.id !== selfId && ((name.ar.trim() && c.name.ar.trim() === name.ar.trim()) || (name.en.trim() && c.name.en.trim().toLowerCase() === name.en.trim().toLowerCase()))) ? 'taken' : null;
export const catSlugOf = (name: L, cats: BlogCat[]) => {
  const base = name.en.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat';
  let id = base, n = 2;
  while (cats.some((c) => c.id === id)) id = `${base}-${n++}`;
  return id;
};
export const postsInCat = (b: BlogState, id: string) => b.posts.filter((p) => p.cat === id).length;

/* ---------- Comments ---------- */

export const pendingComments = (b: BlogState) => b.comments.filter((c) => c.state === 'pending');
export const approvedFor = (b: BlogState, postId: string) => b.comments.filter((c) => c.postId === postId && c.state === 'approved');
export const moderate = (b: BlogState, ids: string[], state: CommentState): BlogState => ({ ...b, comments: b.comments.map((c) => (ids.includes(c.id) ? { ...c, state } : c)) });
export type CommentError = 'name' | 'text' | 'long' | 'link' | 'closed';
/** A shopper's comment: name and text required, at most one link-free text of COMMENT_MAX characters. */
export function commentError(name: string, text: string, post: BlogPost, b: BlogState): CommentError | null {
  if (!b.settings.on || !post.comments) return 'closed';
  if (!name.trim()) return 'name';
  if (!text.trim()) return 'text';
  if (text.length > COMMENT_MAX) return 'long';
  if (/https?:\/\/|www\./i.test(text)) return 'link';
  return null;
}
/** New comments wait for approval when moderation is on; otherwise they show at once. */
export function addComment(b: BlogState, postId: string, name: string, text: string, lang: 'ar' | 'en', at: string): BlogState {
  const id = `cm${b.comments.length + 1}${Math.random().toString(36).slice(2, 5)}`;
  return { ...b, comments: [...b.comments, { id, postId, name: name.trim().slice(0, 40), text: text.trim(), at, lang, state: b.settings.moderation ? 'pending' : 'approved' }] };
}

/* ---------- Fixtures ---------- */

export function blogFixture(): BlogState {
  const by = 'سارة';
  const p1: BlogPost = {
    id: 'bp1', slug: 'choose-abaya-fabric', cat: 'guides', cover: 'p:p1', publishAt: '2026-11-10T09:00', hidden: false, comments: true, updatedAt: '2026-11-10T06:00:00.000Z', by,
    draft: {
      title: { ar: 'كيف تختارين قماش العباية المناسب للشتاء', en: 'How to choose an abaya fabric for winter' },
      excerpt: { ar: 'الكريب والكتان والحرير: ما الفرق، ومتى يناسب كل منها؟', en: 'Crepe, linen and silk: the difference, and when each one fits.' },
      body: {
        ar: '## الكريب\nخفيف ولا يتجعد بسرعة، مناسب للعمل والمشاوير اليومية.\n\n## الكتان\nبارد ومريح، **يتجعد أسرع** لكنه يناسب النهار.\n\n@p:p1\n\n## العناية\n- اغسليها على البارد\n- اكويها من الداخل',
        en: '## Crepe\nLight and slow to crease, good for work and daily errands.\n\n## Linen\nCool and comfortable, **creases faster** but suits the daytime.\n\n@p:p1\n\n## Care\n- Wash cold\n- Iron inside out',
      },
    },
    live: null, seo: { title: { ar: '', en: '' }, desc: { ar: '', en: '' } },
  };
  p1.live = JSON.parse(JSON.stringify(p1.draft)) as PostContent;
  const p2: BlogPost = {
    id: 'bp2', slug: 'oud-layering', cat: 'fragrance', cover: 'p:p13', publishAt: '2026-11-28T18:00', hidden: false, comments: true, updatedAt: '2026-11-23T10:00:00.000Z', by,
    draft: {
      title: { ar: 'طبقات العطر: العود مع المسك', en: 'Layering oud with musk' },
      excerpt: { ar: 'ثلاث خطوات ليدوم العطر يومًا كاملًا.', en: 'Three steps for a scent that lasts all day.' },
      body: { ar: 'ابدئي بالمسك على بشرة مرطبة، ثم العود على النبض.\n\n@p:p13', en: 'Start with musk on moisturised skin, then oud on the pulse points.\n\n@p:p13' },
    },
    live: null, seo: { title: { ar: '', en: '' }, desc: { ar: '', en: '' } },
  };
  p2.live = JSON.parse(JSON.stringify(p2.draft)) as PostContent;
  const p3: BlogPost = {
    id: 'bp3', slug: 'ramadan-gift-ideas', cat: 'gifts', cover: null, publishAt: '', hidden: false, comments: true, updatedAt: '2026-11-24T07:00:00.000Z', by,
    draft: { title: { ar: 'أفكار هدايا رمضان', en: '' }, excerpt: { ar: '', en: '' }, body: { ar: 'مسودة: علبة التمر والقهوة، طقم الفناجين…', en: '' } },
    live: null, seo: { title: { ar: '', en: '' }, desc: { ar: '', en: '' } },
  };
  return {
    posts: [p1, p2, p3],
    cats: [{ id: 'guides', name: { ar: 'أدلة الأزياء', en: 'Style guides' } }, { id: 'fragrance', name: { ar: 'العطور', en: 'Fragrance' } }, { id: 'gifts', name: { ar: 'هدايا', en: 'Gifts' } }],
    comments: [
      { id: 'cm1', postId: 'bp1', name: 'نورة', text: 'مقال مفيد، هل الكريب مناسب للصيف أيضًا؟', at: '2026-11-21T15:20:00.000Z', state: 'pending', lang: 'ar' },
      { id: 'cm2', postId: 'bp1', name: 'Huda', text: 'Thanks, the care tips helped.', at: '2026-11-18T11:00:00.000Z', state: 'approved', lang: 'en' },
      { id: 'cm3', postId: 'bp1', name: 'عرض خاص', text: 'اربح جوال مجانًا! اضغط الرابط', at: '2026-11-23T02:10:00.000Z', state: 'pending', lang: 'ar' },
    ],
    settings: { on: true, moderation: true, inMenu: true },
  };
}
