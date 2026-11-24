// P04 merchant storefront (`#/store/...`). The shop wears the merchant's brand (theme.ts) on the LAK design system;
// LAK appears only as a small "powered by" mark in the footer. Review tools live in review.tsx (`?review=1` only).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Heart, Languages, Menu, Moon, Search, ShoppingBag, Sun, User, Store as StoreIcon, Wrench } from 'lucide-react';
import { useLang } from '../../core/lang';
import { useReviewMode } from '../../core/review';
import { link, navigate, replace, type Route } from '../../core/router';
import { Button, ErrorState, IconButton, LinkButton, Skeleton, cn, useTx } from '../../ds/ui';
import { Drawer, ToastProvider } from '../../ds/kit';
import { settingsStore, themeStore } from '../merchant/stores';
import { shopperView, type ShopperView } from '../dashboard/storefront/model';
import { itemCount } from './domain';
import { H1, WRAP, to, useS } from './kit';
import { accountStore } from './state';
import { useCart, useCategories, useConfig, useStoreContent } from './data';
import { servedPage, socialLinks } from './bridge';
import ContentPage, { useDocTitle } from './pages/Content';
import { ReviewPanel, setSfState, useSfState } from './review';
import { headingText, liveAnnouncement, liveIdentity, mediaSrc, storeCss } from './theme';
import { annColours } from '../dashboard/storefront/identity';
import { mediaStore } from '../dashboard/storefront/state';
import Home from './pages/Home';
import Listing from './pages/Listing';
import ProductPage from './pages/Product';
import CartPage from './pages/Cart';
import Checkout from './pages/Checkout';
import { OrderPage, TrackLookup, TrackPage } from './pages/Order';
import AccountPage from './pages/Account';
import ReturnsPage from './pages/Returns';
import PolicyPage, { POLICY_IDS } from './pages/Policy';
import LandingRoute from './pages/Landing';
import { BlogList, BlogPostPage } from './pages/Blog';
import { blogStore, redirectsStore } from '../dashboard/storefront/state';
import { servedPosts } from '../dashboard/storefront/blog-model';
import { useRCtx } from '../dashboard/storefront/redirect-ctx';
import { servedPath, trace } from '../dashboard/storefront/redirects-model';
import '../../ds/lak.css';

function readPref(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function writePref(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* preference only */ } }

export default function Storefront({ route }: { route: Route }) {
  const { lang } = useLang();
  const { t } = useS();
  const tx = useTx();
  const review = useReviewMode();
  const state = useSfState();
  const theme = themeStore.use();
  const status = settingsStore.use().status;
  const view = shopperView(status);
  const [dark, setDark] = useState(() => readPref('lak.theme', 'light') === 'dark');
  useEffect(() => { writePref('lak.theme', dark ? 'dark' : 'light'); }, [dark]);

  // The merchant brand applies to everything the storefront renders, including dialogs portalled to <body>.
  useEffect(() => {
    document.body.dataset.sf = '1';
    return () => { delete document.body.dataset.sf; };
  }, []);
  // The merchant's published identity: favicon while the store is open (removed on leaving).
  const identity = liveIdentity(theme);
  const media = mediaStore.use();
  const favicon = mediaSrc(identity.favicon, media);
  useEffect(() => {
    if (!favicon) return;
    const el = document.createElement('link');
    el.rel = 'icon'; el.href = favicon; el.dataset.sf = '1';
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [favicon]);

  const [a, b] = route.path;
  const content = useStoreContent();
  useDocTitle(route);
  const page = (() => {
    switch (a) {
      case undefined: return <Home />;
      case 'c': return <Listing route={route} cat={b} />;
      case 'search': return <Listing route={route} search />;
      case 'p': return <ProductPage key={b} route={route} id={b ?? ''} />;
      case 'cart': return <CartPage />;
      case 'checkout': return <Checkout />;
      case 'order': return <OrderPage key={b} reference={b ?? ''} />;
      case 'track': return b ? <TrackPage key={b} reference={b} route={route} /> : <TrackLookup route={route} />;
      case 'account': return <AccountPage route={route} />;
      case 'returns': return <ReturnsPage key={b} reference={b ?? ''} route={route} />;
      case 'page': return POLICY_IDS.includes(b as never) ? <PolicyPage id={b as never} /> : servedPage(content.pages, b) ? <ContentPage page={servedPage(content.pages, b)!} /> : <NotFound route={route} />;
      case 'lp': return b ? <LandingRoute key={b} slug={b} route={route} /> : <NotFound route={route} />;
      case 'blog': return b ? <BlogPostPage key={b} slug={b} /> : <BlogList route={route} />;
      default: return <NotFound route={route} />;
    }
  })();

  // Move focus to the new page's heading on navigation, so keyboard and screen-reader users land on the content.
  const mainRef = useRef<HTMLElement>(null);
  const pathKey = route.path.join('/');
  const prevPath = useRef(pathKey);
  useEffect(() => {
    if (prevPath.current === pathKey) return;
    prevPath.current = pathKey;
    const h = mainRef.current?.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.style.outline = 'none'; h.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0 });
  }, [pathKey]);

  const announcement = liveAnnouncement(theme, Date.now());
  const annC = announcement ? annColours(announcement) : null;
  // A closed store keeps its policies and order tracking reachable; review mode can still look around.
  const closed = (view === 'hidden' || view === 'maintenance') && !review && !['page', 'track', 'order'].includes(a ?? '');

  let body: ReactNode = page;
  if (closed) body = <Closed view={view} message={status.message} until={status.until} />;
  else if (state === 'loading') body = <PageSkeleton kind={a} />;
  else if (state === 'error') body = (
    <div className={cn(WRAP, 'py-16')}>
      <ErrorState as="h1" title={t.loadErrT} onRetry={() => setSfState('live')}>{t.loadErrB}</ErrorState>
    </div>
  );

  return (
    <div className={cn('lak', dark && 'dark')} dir={lang === 'ar' ? 'rtl' : 'ltr'} data-store="dar-nuwa">
      <style>{storeCss(identity)}</style>
      <ToastProvider>
        <a href="#sf-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">{tx('تخطَّ إلى المحتوى', 'Skip to content')}</a>
        <div className="flex min-h-screen flex-col bg-bg text-fg">
          {view === 'browseOnly' && <p className="bg-amber-500/15 px-4 py-2 text-center text-[13px] font-medium text-amber-900 dark:text-amber-200" role="status">{t.browseOnly}</p>}
          {(view === 'hidden' || view === 'maintenance') && review && <p className="bg-amber-500/15 px-4 py-2 text-center text-[13px] font-medium text-amber-900 dark:text-amber-200" role="status">{view === 'hidden' ? t.closedHiddenReview : t.closedMaintReview}</p>}
          {announcement && annC && <p className="px-4 py-2 text-center text-[13px]" style={{ background: annC.bg, color: annC.fg }} data-announcement="">
            {announcement.link ? <a href={announcement.link.startsWith('/') ? to(announcement.link) : announcement.link} {...(announcement.link.startsWith('/') ? {} : { target: '_blank', rel: 'noopener' })} className="underline underline-offset-2">{headingText(announcement.heading, lang)}</a> : headingText(announcement.heading, lang)}
          </p>}
          <Header route={route} dark={dark} setDark={setDark} />
          <main id="sf-main" ref={mainRef} className="flex-1" aria-busy={state === 'loading' || undefined}>{body}</main>
          <Footer />
        </div>
        <ReviewPanel />
      </ToastProvider>
    </div>
  );
}

/** Unknown address: follow the merchant's custom URLs (Online store → Custom URLs) before showing "not found". */
function NotFound({ route }: { route: Route }) {
  const { t, lang } = useS();
  const ctx = useRCtx();
  const list = redirectsStore.use();
  const path = `/${route.path.join('/')}`;
  const tr = servedPath(path, ctx) ? null : trace(path, list, ctx);
  const target = tr && tr.matched && !tr.loop && !tr.tooLong && tr.final && (tr.served || tr.external) ? tr.final : null;
  useEffect(() => {
    if (!tr?.matched || !target) return;
    const froms = new Set(tr.hops.map((h) => h.from));
    redirectsStore.set((l) => l.map((r) => (r.on && froms.has(r.from) ? { ...r, hits: r.hits + 1 } : r)));
    if (!tr.external) replace(to(target, Object.fromEntries(route.query)));
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  if (target && tr?.external) return (
    <div className={cn(WRAP, 'flex flex-col items-center py-24 text-center')}>
      <h1 className={H1}>{lang === 'ar' ? 'هذه الصفحة انتقلت' : 'This page has moved'}</h1>
      <p className="mt-2 text-muted">{lang === 'ar' ? 'تتابع خارج المتجر إلى:' : 'It continues outside the store at:'} <bdi dir="ltr">{new URL(target).host}</bdi></p>
      <LinkButton href={target} rel="noopener" size="lg" className="mt-6">{lang === 'ar' ? 'تابع' : 'Continue'}</LinkButton>
    </div>
  );
  if (target) return <PageSkeleton kind={undefined} />;
  return (
    <div className={cn(WRAP, 'flex flex-col items-center py-24 text-center')}>
      <h1 className={H1}>{t.notFoundPage}</h1>
      <LinkButton href={to()} size="lg" className="mt-6">{t.storeHome}</LinkButton>
    </div>
  );
}

function Closed({ view, message, until }: { view: ShopperView; message: string; until?: number | null }) {
  const { t, l, lang } = useS();
  const cfg = useConfig();
  return (
    <div className={cn(WRAP, 'flex flex-col items-center py-24 text-center')}>
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300">{view === 'maintenance' ? <Wrench className="size-6" aria-hidden="true" /> : <StoreIcon className="size-6" aria-hidden="true" />}</span>
      <h1 className={cn(H1, 'mt-5')}>{view === 'maintenance' ? t.maintT : t.hiddenT}</h1>
      <p className="mt-2 max-w-md text-muted">{view === 'maintenance' && message ? message : t.closedB(l(cfg.name))}</p>
      {view === 'maintenance' && until && <p className="mt-2 text-sm font-semibold">{lang === 'ar' ? 'نعود ' : 'Back '}{new Date(until).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>}
      <LinkButton href={to('/track')} variant="secondary" className="mt-6">{t.trackTitle}</LinkButton>
    </div>
  );
}

/** Skeletons that match each page's layout, so nothing jumps when content arrives. */
function PageSkeleton({ kind }: { kind?: string }) {
  const grid = (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => <div key={i} className="space-y-3"><Skeleton className="aspect-[4/5] w-full rounded-2xl" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/3" /></div>)}
    </div>
  );
  const two = (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}</div>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
  return (
    <div className={cn(WRAP, 'py-8')} role="status" aria-label="Loading">
      {kind === undefined ? (
        <div className="space-y-10"><Skeleton className="aspect-[4/5] w-full rounded-3xl sm:aspect-[21/9]" />{grid}</div>
      ) : kind === 'p' ? (
        <div className="grid gap-8 md:grid-cols-2"><Skeleton className="aspect-[4/5] w-full rounded-2xl" /><div className="space-y-4"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-6 w-1/4" /><Skeleton className="h-20 w-full" /><Skeleton className="h-12 w-full rounded-xl" /></div></div>
      ) : kind === 'c' || kind === 'search' ? (
        <div className="space-y-6"><Skeleton className="h-9 w-48" />{grid}</div>
      ) : (
        <div className="space-y-6"><Skeleton className="h-9 w-56" />{two}</div>
      )}
    </div>
  );
}

function Header({ route, dark, setDark }: { route: Route; dark: boolean; setDark: (f: (d: boolean) => boolean) => void }) {
  const { t, l, lang } = useS();
  const { setLang } = useLang();
  const tx = useTx();
  const cart = useCart();
  const acc = accountStore.use();
  const cats = useCategories();
  const cfg = useConfig();
  const content = useStoreContent();
  const identity = liveIdentity(themeStore.use());
  const logo = mediaSrc(identity.logo, mediaStore.use());
  const layout = identity.header;
  // The merchant's published header menu (Online store → Menus); categories when the menu is empty.
  const menuLinks = content.header.length ? content.header
    : [{ id: 'all', label: { ar: t.all, en: t.all }, path: '/c/all', url: null }, ...cats.map((c) => ({ id: c.id, label: c.name, path: `/c/${c.id}`, url: null }))];
  const n = itemCount(cart);
  const [menu, setMenu] = useState(false);
  const onSearch = route.path[0] === 'search';
  const routeQ = onSearch ? route.query.get('q') ?? '' : '';
  const [q, setQ] = useState(routeQ);
  useEffect(() => { setQ(routeQ); }, [routeQ]);
  const curCat = route.path[0] === 'c' ? route.path[1] : undefined;
  useEffect(() => { setMenu(false); }, [route]);

  const navLink = (href: string, label: string, on: boolean) => (
    <a key={href} href={href} aria-current={on ? 'page' : undefined}
      className={cn('relative inline-flex h-12 items-center whitespace-nowrap px-1 text-[14px] font-medium transition-colors', on ? 'text-fg' : 'text-muted hover:text-fg')}>
      {label}{on && <span className="absolute inset-x-0 bottom-2 h-px bg-fg" aria-hidden="true" />}
    </a>
  );
  const bagLink = (
    <a href={to('/cart')} aria-label={t.bagN(String(n))} aria-current={route.path[0] === 'cart' ? 'page' : undefined}
      className="relative grid size-10 place-items-center rounded-xl text-fg transition-colors hover:bg-surface-2">
      <ShoppingBag className="size-5" aria-hidden="true" />
      {n > 0 && <span aria-hidden="true" className="absolute top-0.5 end-0.5 grid min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold leading-[18px] text-white tabular-nums">{n}</span>}
    </a>
  );
  const prefs = (
    <>
      <IconButton label={lang === 'ar' ? 'English' : 'العربية'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages className="size-5" aria-hidden="true" /></IconButton>
      <IconButton label={dark ? tx('الوضع الفاتح', 'Light mode') : tx('الوضع الداكن', 'Dark mode')} onClick={() => setDark((d) => !d)}>{dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}</IconButton>
    </>
  );

  return (
    <header className="glass sticky top-0 z-30 border-b border-border">
      <div className={cn(WRAP, 'flex h-16 items-center gap-2', layout === 'centered' && 'lg:relative')} data-header={layout}>
        <IconButton label={t.menu} onClick={() => setMenu(true)} className={cn('-ms-2 text-fg', layout !== 'minimal' && 'lg:hidden')}><Menu className="size-5" aria-hidden="true" /></IconButton>
        <a href={to()} className={cn('text-[22px] font-bold tracking-tight text-fg max-lg:absolute max-lg:start-1/2 max-lg:-translate-x-1/2 max-lg:rtl:translate-x-1/2 sm:text-2xl', layout === 'centered' && 'lg:absolute lg:start-1/2 lg:-translate-x-1/2 lg:rtl:translate-x-1/2')}>
          {logo ? <img src={logo} alt={l(cfg.name)} className="h-9 w-auto max-w-[150px] object-contain sm:h-10 sm:max-w-[200px]" /> : l(cfg.name)}
        </a>
        <nav aria-label={t.cats} className={cn('ms-10 hidden items-center gap-6', layout === 'classic' && 'lg:flex')}>
          {menuLinks.map((x) => (x.url ? <a key={x.id} href={x.url} target="_blank" rel="noopener" className="inline-flex h-12 items-center whitespace-nowrap px-1 text-[14px] font-medium text-muted hover:text-fg">{l(x.label)}</a>
            : navLink(to(x.path!), l(x.label), x.path === `/c/${curCat}` || (!!route.path[0] && x.path === `/${route.path.join('/')}`))))}
        </nav>
        <div className="ms-auto flex items-center gap-0.5">
          <form role="search" className="relative me-1 hidden xl:block" onSubmit={(e) => { e.preventDefault(); navigate(to('/search', { q: q.trim() || undefined })); }}>
            <label htmlFor="sf-q" className="sr-only">{t.search}</label>
            <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input id="sf-q" type="search" value={q} placeholder={t.searchPh} autoComplete="off"
              onChange={(e) => { setQ(e.target.value); if (onSearch) replace(to('/search', { q: e.target.value || undefined, sort: route.query.get('sort') ?? undefined })); }}
              className="h-10 w-60 rounded-full border border-border bg-surface ps-9 pe-3 text-sm placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
          </form>
          <a href={to('/search')} aria-label={t.search} className="grid size-10 place-items-center rounded-xl text-fg hover:bg-surface-2 xl:hidden"><Search className="size-5" aria-hidden="true" /></a>
          <span className="hidden items-center lg:flex">{prefs}</span>
          <a href={to('/account', { tab: 'wishlist' })} aria-label={`${t.wishlist}${acc.wishlist.length ? ` (${acc.wishlist.length})` : ''}`} className="relative hidden size-10 place-items-center rounded-xl text-fg hover:bg-surface-2 sm:grid">
            <Heart className="size-5" aria-hidden="true" />{acc.wishlist.length > 0 && <span aria-hidden="true" className="absolute top-2 end-2 size-2 rounded-full bg-brand-600" />}
          </a>
          <a href={to('/account')} aria-label={t.account} className="hidden size-10 place-items-center rounded-xl text-fg hover:bg-surface-2 sm:grid"><User className="size-5" aria-hidden="true" /></a>
          {bagLink}
        </div>
      </div>
      {layout === 'centered' && (
        <nav aria-label={t.cats} className={cn(WRAP, 'hidden h-11 items-center justify-center gap-7 border-t border-border lg:flex')}>
          {menuLinks.map((x) => (x.url ? <a key={x.id} href={x.url} target="_blank" rel="noopener" className="inline-flex h-11 items-center whitespace-nowrap px-1 text-[14px] font-medium text-muted hover:text-fg">{l(x.label)}</a>
            : navLink(to(x.path!), l(x.label), x.path === `/c/${curCat}` || (!!route.path[0] && x.path === `/${route.path.join('/')}`))))}
        </nav>
      )}
      {menu && (
        <Drawer title={l(cfg.name)} onClose={() => setMenu(false)}>
          <nav aria-label={t.cats}>
            <p className="mb-2 text-xs font-semibold text-subtle">{t.cats}</p>
            <ul className="divide-y divide-border">
              {menuLinks.map((x) => ({ href: x.url ?? to(x.path!), label: l(x.label) })).map((x) => (
                <li key={x.href}><a href={x.href} className="flex h-12 items-center text-[15px] font-medium">{x.label}</a></li>
              ))}
            </ul>
          </nav>
          <ul className="space-y-1 border-t border-border pt-4 text-[15px]">
            <li><a href={to('/account')} className="flex h-11 items-center gap-3"><User className="size-5 text-muted" aria-hidden="true" />{t.account}</a></li>
            <li><a href={to('/account', { tab: 'wishlist' })} className="flex h-11 items-center gap-3"><Heart className="size-5 text-muted" aria-hidden="true" />{t.wishlist}{acc.wishlist.length > 0 && <span className="text-sm text-muted tabular-nums">({acc.wishlist.length})</span>}</a></li>
            <li><a href={to('/track')} className="flex h-11 items-center gap-3"><Search className="size-5 text-muted" aria-hidden="true" />{t.track}</a></li>
          </ul>
          <div className="flex gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages className="size-4" aria-hidden="true" />{lang === 'ar' ? 'English' : 'العربية'}</Button>
            <Button variant="secondary" onClick={() => setDark((d) => !d)}>{dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}{dark ? tx('فاتح', 'Light') : tx('داكن', 'Dark')}</Button>
          </div>
        </Drawer>
      )}
    </header>
  );
}

/** "Blog" in the footer once the merchant has a live article and keeps the link on (Online store → Blog → Settings). */
function BlogLink({ cls }: { cls: string }) {
  const { lang } = useS();
  const blog = blogStore.use();
  if (!blog.settings.inMenu || !servedPosts(blog, Date.now()).length) return null;
  return <li><a href={to('/blog')} className={cls}>{lang === 'ar' ? 'المدونة' : 'Blog'}</a></li>;
}

const SOCIAL_NAME: Record<string, string> = { instagram: 'Instagram', x: 'X', tiktok: 'TikTok', snapchat: 'Snapchat', facebook: 'Facebook', linkedin: 'LinkedIn', youtube: 'YouTube' };

function Footer() {
  const { t, l } = useS();
  const tx = useTx();
  const cats = useCategories();
  const cfg = useConfig();
  const content = useStoreContent();
  const social = socialLinks(settingsStore.use().store.social);
  const col = 'space-y-2.5 text-sm';
  const a = 'text-muted hover:text-fg';
  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className={cn(WRAP, 'grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]')}>
        <div className="space-y-3">
          <p className="text-xl font-bold tracking-tight">{l(cfg.name)}</p>
          <p className="max-w-xs text-sm text-muted">{t.aboutBody(l(cfg.name))}</p>
          {social.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label={tx('حساباتنا', 'Follow us')}>
              {social.map((x) => <li key={x.id}><a href={x.url} target="_blank" rel="noopener" className="font-medium text-muted underline-offset-2 hover:text-fg hover:underline">{SOCIAL_NAME[x.id]}</a></li>)}
            </ul>
          )}
          <p className="text-xs text-muted">{t.vatNote}</p>
        </div>
        <nav aria-label={t.cats}>
          <h2 className="mb-3 text-[13px] font-semibold">{t.shopH}</h2>
          <ul className={col}>{cats.map((c) => <li key={c.id}><a href={to(`/c/${c.id}`)} className={a}>{l(c.name)}</a></li>)}</ul>
        </nav>
        <nav aria-label={t.care}>
          <h2 className="mb-3 text-[13px] font-semibold">{t.care}</h2>
          <ul className={col}>
            {(content.footer.length ? content.footer : [{ id: 'track', label: { ar: t.track, en: t.track }, path: '/track', url: null }, { id: 'acc', label: { ar: t.account, en: t.account }, path: '/account', url: null }]).map((x) => (
              <li key={x.id}><a href={x.url ?? to(x.path!)} {...(x.url ? { target: '_blank', rel: 'noopener' } : {})} className={a}>{l(x.label)}</a></li>
            ))}
            <BlogLink cls={a} />
            <li className="text-xs leading-relaxed text-muted">{t.careHours}</li>
          </ul>
        </nav>
        <nav aria-label={t.policies}>
          <h2 className="mb-3 text-[13px] font-semibold">{t.policies}</h2>
          <ul className={col}>
            <li><a href={to('/page/shipping')} className={a}>{t.pShipping}</a></li>
            <li><a href={to('/page/returns')} className={a}>{t.pReturns}</a></li>
            <li><a href={to('/page/privacy')} className={a}>{t.pPrivacy}</a></li>
            <li><a href={to('/page/terms')} className={a}>{t.pTerms}</a></li>
          </ul>
        </nav>
      </div>
      <div className={cn(WRAP, 'flex flex-col gap-3 border-t border-border py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between')}>
        <p>{t.demoFoot} <a href="/products/credits.html" target="_blank" rel="noopener" className="underline-offset-2 hover:underline">{t.credits}</a></p>
        <a href={link('/site')} className="inline-flex items-center gap-1.5 text-subtle hover:text-muted">{t.powered} <bdi dir="ltr" className="font-semibold">LAK</bdi></a>
      </div>
    </footer>
  );
}
