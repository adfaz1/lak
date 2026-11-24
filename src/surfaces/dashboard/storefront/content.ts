// Online store content beyond the homepage: information pages (about, contact, custom) with a draft and a live
// version, header and footer menus (draft → publish), store-wide SEO, and the sitemap / robots.txt the store
// would serve. Pure rules only (no React, no stores). The shopper store reads the live values through
// storefront/bridge.ts; a draft never reaches shoppers.
import type { L, Lang } from '../../../core/lang';
import type { PolicyId } from '../../merchant/workspace';

/* ---------- Rich text (a small, safe subset) ---------- */

/** Blocks the page editor writes: "## " heading, "- " list item, blank line between paragraphs, **bold** inline. */
export type Block = { type: 'h'; text: string } | { type: 'p'; text: string } | { type: 'ul'; items: string[] };
export function toBlocks(src: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ type: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^#{1,3}\s+/.test(line)) { flush(); out.push({ type: 'h', text: line.replace(/^#{1,3}\s+/, '') }); continue; }
    if (/^[-•*]\s+/.test(line)) {
      flush();
      const item = line.replace(/^[-•*]\s+/, '');
      const last = out[out.length - 1];
      if (last?.type === 'ul') last.items.push(item); else out.push({ type: 'ul', items: [item] });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}
/** Split inline text into plain and bold runs (`**bold**`). Never produces HTML. */
export function inlineRuns(text: string): { bold: boolean; text: string }[] {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t) => (t.startsWith('**') && t.endsWith('**') && t.length > 4 ? { bold: true, text: t.slice(2, -2) } : { bold: false, text: t }));
}
/** Plain text of a body (for SEO descriptions and search snippets). */
export const plainText = (src: string) => toBlocks(src).map((b) => (b.type === 'ul' ? b.items.join('، ') : b.text)).join(' ').replace(/\*\*/g, '').trim();

/* ---------- Pages ---------- */

export type PageKind = 'about' | 'contact' | 'custom';
export interface PageContent { title: L; body: L }
export interface StorePage {
  id: string;
  kind: PageKind;
  slug: string;
  /** Working copy the merchant edits. */
  draft: PageContent;
  /** What shoppers see; null until first published. */
  live: PageContent | null;
  /** Unpublished pages and hidden pages are not served; menu links to them are skipped. */
  hidden: boolean;
  seo: { title: L; desc: L };
  updatedAt: string;
}
export type PageState = 'live' | 'liveWithDraft' | 'draft' | 'hidden';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function pageState(p: StorePage): PageState {
  if (!p.live) return 'draft';
  if (p.hidden) return 'hidden';
  return same(p.draft, p.live) ? 'live' : 'liveWithDraft';
}
export const isServed = (p: StorePage) => !!p.live && !p.hidden;

/** Slugs the store already uses for its own routes and policies. */
export const RESERVED_SLUGS = ['shipping', 'returns', 'privacy', 'terms', 'cart', 'checkout', 'account', 'track', 'search', 'order', 'c', 'p', 'page'];
export const SLUG_MAX = 50;
export const TITLE_MAX = 60;
export const DESC_MAX = 160;
export const PAGE_TITLE_MAX = 80;

/** URL-safe slug from any title (Arabic titles give an empty slug; the editor then asks for one). */
export const slugify = (s: string) => s.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SLUG_MAX);
export type SlugIssue = 'empty' | 'format' | 'reserved' | 'taken' | null;
export function slugIssue(slug: string, pages: StorePage[], selfId?: string): SlugIssue {
  if (!slug) return 'empty';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > SLUG_MAX) return 'format';
  if (RESERVED_SLUGS.includes(slug)) return 'reserved';
  if (pages.some((p) => p.slug === slug && p.id !== selfId)) return 'taken';
  return null;
}

export type PageErrors = Partial<Record<'titleAr' | 'titleEn' | 'body' | 'slug', string>>;
/** What blocks publishing a page: a title and body in every store language, and a valid slug. */
export function pageErrors(p: StorePage, pages: StorePage[], langs: { ar: boolean; en: boolean }): PageErrors {
  const e: PageErrors = {};
  if (langs.ar && !p.draft.title.ar.trim()) e.titleAr = 'required';
  if (langs.en && !p.draft.title.en.trim()) e.titleEn = 'required';
  if ((langs.ar && p.draft.title.ar.length > PAGE_TITLE_MAX) || (langs.en && p.draft.title.en.length > PAGE_TITLE_MAX)) e.titleAr = e.titleAr ?? 'long';
  if (p.kind !== 'contact' && ((langs.ar && !p.draft.body.ar.trim()) || (langs.en && !p.draft.body.en.trim()))) e.body = 'required';
  const s = slugIssue(p.slug, pages, p.id);
  if (s) e.slug = s;
  return e;
}

export function newPage(pages: StorePage[], now: string): StorePage {
  let n = pages.length + 1;
  while (pages.some((p) => p.id === `pg${n}` || p.slug === `page-${n}`)) n++;
  return { id: `pg${n}`, kind: 'custom', slug: `page-${n}`, draft: { title: { ar: '', en: '' }, body: { ar: '', en: '' } }, live: null, hidden: false, seo: { title: { ar: '', en: '' }, desc: { ar: '', en: '' } }, updatedAt: now };
}
export const upsertPage = (pages: StorePage[], p: StorePage) => (pages.some((x) => x.id === p.id) ? pages.map((x) => (x.id === p.id ? p : x)) : [...pages, p]);
export const publishPage = (p: StorePage, now: string): StorePage => ({ ...p, live: { title: { ...p.draft.title }, body: { ...p.draft.body } }, hidden: false, updatedAt: now });
export const discardPageDraft = (p: StorePage): StorePage => (p.live ? { ...p, draft: { title: { ...p.live.title }, body: { ...p.live.body } } } : p);
/** About and contact pages can be hidden but not deleted; custom pages can be deleted (menu links to them break visibly). */
export const canDelete = (p: StorePage) => p.kind === 'custom';

/* ---------- Menus ---------- */

export type LinkTarget =
  | { kind: 'home' } | { kind: 'all' } | { kind: 'category'; id: string } | { kind: 'product'; id: string }
  | { kind: 'page'; id: string } | { kind: 'policy'; id: PolicyId } | { kind: 'track' } | { kind: 'account' } | { kind: 'url'; url: string };
export interface MenuItem { id: string; label: L; target: LinkTarget }
export type MenuId = 'header' | 'footer';
export const MENU_IDS: MenuId[] = ['header', 'footer'];
export type Menus = Record<MenuId, MenuItem[]>;
export interface MenuState { draft: Menus; live: Menus; version: number; publishedAt: string | null }
export const MENU_MAX: Record<MenuId, number> = { header: 7, footer: 12 };
export const LABEL_MAX = 30;

/** Everything a link can point at, from the merchant's own data. */
export interface LinkContext {
  categories: { id: string; name: L }[];
  products: { id: string; name: L; live: boolean }[];
  pages: StorePage[];
  policies: { id: PolicyId; live: boolean }[];
}
export type LinkIssue = 'missing' | 'unpublished' | 'url' | null;
export function linkIssue(t: LinkTarget, ctx: LinkContext): LinkIssue {
  switch (t.kind) {
    case 'category': return ctx.categories.some((c) => c.id === t.id) ? null : 'missing';
    case 'product': { const p = ctx.products.find((x) => x.id === t.id); return !p ? 'missing' : p.live ? null : 'unpublished'; }
    case 'page': { const p = ctx.pages.find((x) => x.id === t.id); return !p ? 'missing' : isServed(p) ? null : 'unpublished'; }
    case 'policy': return ctx.policies.find((x) => x.id === t.id)?.live ? null : 'unpublished';
    case 'url': return validUrl(t.url) ? null : 'url';
    default: return null;
  }
}
/** https links only, or mailto/tel. */
export const validUrl = (u: string) => /^(https:\/\/[^\s/$.?#].[^\s]*|mailto:[^\s@]+@[^\s@]+\.[^\s@]+|tel:\+?[0-9 ]{6,})$/i.test(u.trim());

const POLICY_NAME: Record<PolicyId, L> = { shipping: { ar: 'سياسة الشحن', en: 'Shipping policy' }, returns: { ar: 'سياسة الاسترجاع', en: 'Returns policy' }, privacy: { ar: 'سياسة الخصوصية', en: 'Privacy policy' }, terms: { ar: 'الشروط والأحكام', en: 'Terms and conditions' } };
/** The name of what a link points at, used as the default label. */
export function targetName(t: LinkTarget, ctx: LinkContext): L {
  switch (t.kind) {
    case 'home': return { ar: 'الرئيسية', en: 'Home' };
    case 'all': return { ar: 'كل المنتجات', en: 'All products' };
    case 'track': return { ar: 'تتبع طلبك', en: 'Track your order' };
    case 'account': return { ar: 'حسابي', en: 'My account' };
    case 'category': return ctx.categories.find((c) => c.id === t.id)?.name ?? { ar: t.id, en: t.id };
    case 'product': return ctx.products.find((c) => c.id === t.id)?.name ?? { ar: t.id, en: t.id };
    case 'page': { const p = ctx.pages.find((x) => x.id === t.id); const c = p?.live ?? p?.draft; return c ? { ar: c.title.ar || c.title.en, en: c.title.en || c.title.ar } : { ar: t.id, en: t.id }; }
    case 'policy': return POLICY_NAME[t.id];
    case 'url': return { ar: t.url, en: t.url };
  }
}
/** Store path (below #/store) for a target; null when the link would not work for a shopper. */
export function targetPath(t: LinkTarget, ctx: LinkContext): string | null {
  if (linkIssue(t, ctx)) return null;
  switch (t.kind) {
    case 'home': return '';
    case 'all': return '/c/all';
    case 'category': return `/c/${t.id}`;
    case 'product': return `/p/${t.id}`;
    case 'page': return `/page/${ctx.pages.find((p) => p.id === t.id)!.slug}`;
    case 'policy': return `/page/${t.id}`;
    case 'track': return '/track';
    case 'account': return '/account';
    case 'url': return null;
  }
}
export interface ResolvedLink { id: string; label: L; path: string | null; url: string | null }
/** The links a shopper sees: broken or unpublished targets are skipped, empty labels fall back to the target name. */
export function resolveMenu(items: MenuItem[], ctx: LinkContext): ResolvedLink[] {
  return items.flatMap((i) => {
    if (linkIssue(i.target, ctx)) return [];
    const name = targetName(i.target, ctx);
    const label = { ar: i.label.ar.trim() || name.ar, en: i.label.en.trim() || name.en };
    return [{ id: i.id, label, path: i.target.kind === 'url' ? null : targetPath(i.target, ctx), url: i.target.kind === 'url' ? i.target.url.trim() : null }];
  });
}

export function moveItem(list: MenuItem[], from: number, to: number): MenuItem[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
export type MenuChange = { kind: 'added' | 'removed' | 'moved' | 'edited'; label: L };
/** What publishing the draft menus would change, per menu. */
export function menuDiff(live: MenuItem[], draft: MenuItem[], ctx: LinkContext): MenuChange[] {
  const name = (i: MenuItem) => ({ ar: i.label.ar || targetName(i.target, ctx).ar, en: i.label.en || targetName(i.target, ctx).en });
  const out: MenuChange[] = [];
  for (const d of draft) {
    const l = live.find((x) => x.id === d.id);
    if (!l) out.push({ kind: 'added', label: name(d) });
    else if (!same(l, d)) out.push({ kind: 'edited', label: name(d) });
  }
  for (const l of live) if (!draft.some((d) => d.id === l.id)) out.push({ kind: 'removed', label: name(l) });
  const order = (xs: MenuItem[]) => xs.filter((x) => live.some((l) => l.id === x.id) && draft.some((d) => d.id === x.id)).map((x) => x.id).join();
  if (order(live) !== order(draft)) out.push({ kind: 'moved', label: { ar: 'ترتيب العناصر', en: 'Item order' } });
  return out;
}
export type MenuErrors = Partial<Record<MenuId, 'tooMany'>> & { items: Record<string, 'label' | 'url'> };
export function menuErrors(m: Menus): MenuErrors {
  const e: MenuErrors = { items: {} };
  for (const id of MENU_IDS) {
    if (m[id].length > MENU_MAX[id]) e[id] = 'tooMany';
    for (const i of m[id]) {
      if (i.label.ar.length > LABEL_MAX || i.label.en.length > LABEL_MAX) e.items[i.id] = 'label';
      if (i.target.kind === 'url' && !validUrl(i.target.url)) e.items[i.id] = 'url';
    }
  }
  return e;
}
export const menuHasErrors = (e: MenuErrors) => !!(e.header || e.footer || Object.keys(e.items).length);
export const publishMenus = (s: MenuState, now: string): MenuState => ({ draft: s.draft, live: JSON.parse(JSON.stringify(s.draft)) as Menus, version: s.version + 1, publishedAt: now });
export const menusDirty = (s: MenuState) => !same(s.draft, s.live);

/* ---------- SEO ---------- */

export interface StoreSeo { title: L; desc: L; indexing: boolean; ogImage: boolean }
export type LenTone = 'empty' | 'short' | 'ok' | 'long';
/** Search engines show about 60 title / 160 description characters; shorter than a third reads thin. */
export function lenTone(s: string, max: number): LenTone {
  const n = s.trim().length;
  if (!n) return 'empty';
  if (n > max) return 'long';
  return n < Math.round(max / 3) ? 'short' : 'ok';
}
/** The snippet a search result would show: cut at the limit with an ellipsis, as search engines do. */
export const snippet = (s: string, max: number) => (s.trim().length > max ? `${s.trim().slice(0, max - 1).trimEnd()}…` : s.trim());

export interface ProductSeoRow { id: string; name: L; title: string; desc: string; slug: string; issues: ('noTitle' | 'longTitle' | 'noDesc' | 'longDesc' | 'slug' | 'dupSlug')[] }
/** SEO health for each product sold online: missing or too-long title/description, bad or repeated slug. */
export function productSeoRows(products: { id: string; name: L; status: string; channels: { online: boolean }; seo: { title: string; desc: string; slug: string } }[]): ProductSeoRow[] {
  const live = products.filter((p) => p.status === 'active' && p.channels.online);
  const count = new Map<string, number>();
  live.forEach((p) => count.set(p.seo.slug, (count.get(p.seo.slug) ?? 0) + 1));
  return live.map((p) => {
    const issues: ProductSeoRow['issues'] = [];
    if (!p.seo.title.trim()) issues.push('noTitle'); else if (p.seo.title.length > TITLE_MAX) issues.push('longTitle');
    if (!p.seo.desc.trim()) issues.push('noDesc'); else if (p.seo.desc.length > DESC_MAX) issues.push('longDesc');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.seo.slug)) issues.push('slug'); else if ((count.get(p.seo.slug) ?? 0) > 1) issues.push('dupSlug');
    return { id: p.id, name: p.name, title: p.seo.title, desc: p.seo.desc, slug: p.seo.slug, issues };
  });
}

/** URLs the sitemap would list: home, categories, live products, served pages and published policies. */
export function sitemapUrls(base: string, ctx: LinkContext & { productSlugs: Record<string, string> }): string[] {
  const b = base.replace(/\/$/, '');
  return [
    `${b}/`,
    ...ctx.categories.map((c) => `${b}/c/${c.id}`),
    ...ctx.products.filter((p) => p.live).map((p) => `${b}/p/${ctx.productSlugs[p.id] || p.id}`),
    ...ctx.pages.filter(isServed).map((p) => `${b}/page/${p.slug}`),
    ...ctx.policies.filter((p) => p.live).map((p) => `${b}/page/${p.id}`),
  ];
}
/** robots.txt the store would serve. Checkout, cart and account are never indexed; indexing off blocks everything. */
export function robotsTxt(base: string, indexing: boolean): string {
  const b = base.replace(/\/$/, '');
  return indexing
    ? ['User-agent: *', 'Disallow: /cart', 'Disallow: /checkout', 'Disallow: /account', 'Disallow: /order/', '', `Sitemap: ${b}/sitemap.xml`].join('\n')
    : ['User-agent: *', 'Disallow: /'].join('\n');
}
export const storeBase = (domain: { slug: string; host: string; state: string }) => (domain.state === 'verified' && domain.host ? `https://${domain.host}` : `https://${domain.slug}.lak.store`);

/* ---------- Fixtures ---------- */

export interface ContentState { pages: StorePage[]; menus: MenuState; seo: StoreSeo; sitemapAt: string }
export function contentFixture(now = Date.now()): ContentState {
  const iso = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const about: PageContent = {
    title: { ar: 'من نحن', en: 'About us' },
    body: {
      ar: '## قصة دار نُوى\nبدأنا من مشغل صغير في الرياض نخيط فيه العبايات يدويًا.\n\nنختار أقمشتنا بعناية ونطرّز كل قطعة **بأيدٍ سعودية**.\n\n- خياطة محلية\n- مقاسات تناسب الجميع\n- تغليف هدايا مجاني',
      en: '## The Dar Nuwa story\nWe started in a small Riyadh workshop, sewing abayas by hand.\n\nWe choose our fabrics carefully and every piece is embroidered **by Saudi hands**.\n\n- Made locally\n- Sizes for everyone\n- Free gift wrapping',
    },
  };
  const contact: PageContent = {
    title: { ar: 'تواصل معنا', en: 'Contact us' },
    body: { ar: 'نرد على الرسائل من الأحد إلى الخميس، 9 صباحًا حتى 9 مساءً.', en: 'We reply Sunday to Thursday, 9 am to 9 pm.' },
  };
  const sizes: PageContent = {
    title: { ar: 'دليل المقاسات', en: 'Size guide' },
    body: { ar: '## كيف تختارين مقاسك\nقيسي الطول من الكتف حتى الكعب.\n\n- S: حتى 52\n- M: 54 إلى 56\n- L: 58 فأكثر', en: '## Choosing your size\nMeasure from the shoulder to the heel.\n\n- S: up to 52\n- M: 54 to 56\n- L: 58 and above' },
  };
  const seo = (t: L, d: L) => ({ title: t, desc: d });
  const pages: StorePage[] = [
    { id: 'about', kind: 'about', slug: 'about', draft: about, live: about, hidden: false, seo: seo({ ar: 'من نحن | دار نُوى', en: 'About us | Dar Nuwa' }, { ar: 'قصة دار نُوى للعبايات المطرّزة يدويًا في الرياض.', en: 'The story of Dar Nuwa, hand-embroidered abayas from Riyadh.' }), updatedAt: iso(240) },
    { id: 'contact', kind: 'contact', slug: 'contact', draft: contact, live: contact, hidden: false, seo: seo({ ar: '', en: '' }, { ar: '', en: '' }), updatedAt: iso(240) },
    { id: 'pg3', kind: 'custom', slug: 'size-guide', draft: sizes, live: null, hidden: false, seo: seo({ ar: '', en: '' }, { ar: '', en: '' }), updatedAt: iso(20) },
  ];
  const header: MenuItem[] = [
    { id: 'h1', label: { ar: '', en: '' }, target: { kind: 'all' } },
    { id: 'h2', label: { ar: '', en: '' }, target: { kind: 'category', id: 'fashion' } },
    { id: 'h3', label: { ar: '', en: '' }, target: { kind: 'category', id: 'bags' } },
    { id: 'h4', label: { ar: '', en: '' }, target: { kind: 'category', id: 'fragrance' } },
    { id: 'h5', label: { ar: '', en: '' }, target: { kind: 'category', id: 'home' } },
    { id: 'h6', label: { ar: 'قصتنا', en: 'Our story' }, target: { kind: 'page', id: 'about' } },
  ];
  const footer: MenuItem[] = [
    { id: 'f1', label: { ar: '', en: '' }, target: { kind: 'page', id: 'about' } },
    { id: 'f2', label: { ar: '', en: '' }, target: { kind: 'page', id: 'contact' } },
    { id: 'f3', label: { ar: '', en: '' }, target: { kind: 'track' } },
    { id: 'f4', label: { ar: '', en: '' }, target: { kind: 'account' } },
  ];
  const menus: Menus = { header, footer };
  return {
    pages,
    menus: { draft: JSON.parse(JSON.stringify(menus)), live: menus, version: 3, publishedAt: iso(240) },
    seo: {
      title: { ar: 'دار نُوى | عبايات مطرّزة يدويًا', en: 'Dar Nuwa | Hand-embroidered abayas' },
      desc: { ar: 'عبايات وشالات وإكسسوارات مصنوعة في الرياض، توصيل لكل مدن المملكة.', en: 'Abayas, stoles and accessories made in Riyadh, delivered across Saudi Arabia.' },
      indexing: true, ogImage: true,
    },
    sitemapAt: iso(3),
  };
}

/** Readable language name for messages. */
export const langName = (l: Lang): L => (l === 'ar' ? { ar: 'العربية', en: 'Arabic' } : { ar: 'الإنجليزية', en: 'English' });
