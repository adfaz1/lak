// P01 — LAK public website on the LAK design system. `route.path` is the path below /site.
import { useEffect, useRef, useState } from 'react';
import { Languages, Menu, Moon, Sun, X } from 'lucide-react';
import { useLang } from '../../core/lang';
import { link, type Route } from '../../core/router';
import { useReviewMode } from '../../core/review';
import { cn, ErrorState, IconButton, LinkButton, Skeleton } from '../../ds/ui';
import '../../ds/lak.css';
import { Status, site, useSite, wrap } from './kit';
import { SiteReviewBar, setSiteState, useSiteState } from './review';
import Home from './home';
import Plans from './plans';
import { Ads, Marketing, Payments } from './services';
import { Blog, Help } from './resources';
import { Guide, Stories } from './stories';
import { About, Contact, Legal } from './company';
import Start from './start';

function readPref(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function writePref(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* preference only */ } }

export default function Site({ route }: { route: Route }) {
  const { lang } = useLang();
  const { t } = useSite();
  const [dark, setDark] = useState(() => readPref('lak.theme', 'light') === 'dark');
  useEffect(() => { writePref('lak.theme', dark ? 'dark' : 'light'); }, [dark]);
  const state = useSiteState();
  const key = route.path.join('/');
  const first = useRef(true);

  // On a new page (not a query change such as typing in search), go to the top and move focus to the page heading.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('[data-page-heading]')?.focus({ preventScroll: true });
  }, [key]);

  const [p0, p1] = route.path;
  let page;
  switch (p0) {
    case undefined: page = <Home route={route} dark={dark} />; break;
    case 'plans': page = <Plans route={route} />; break;
    case 'payments': page = <Payments />; break;
    case 'marketing': page = <Marketing />; break;
    case 'ads': page = <Ads />; break;
    case 'help': page = <Help route={route} id={p1} />; break;
    case 'blog': page = <Blog route={route} id={p1} />; break;
    case 'stories': page = <Stories />; break;
    case 'guide': page = <Guide route={route} />; break;
    case 'contact': page = <Contact route={route} />; break;
    case 'legal': page = <Legal id={p1} />; break;
    case 'about': page = <About />; break;
    case 'start': page = <Start route={route} />; break;
    default: page = <NotFound />;
  }

  return (
    <div className={cn('lak', dark && 'dark')} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <a href="#site-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">{t.skip}</a>
      <div className="flex min-h-screen flex-col bg-bg">
        <SiteHeader current={p0 ?? ''} dark={dark} setDark={setDark} />
        <main id="site-main" className="flex-1">
          {state === 'loading' ? <PageSkeleton /> : state === 'error' ? (
            <div className={cn(wrap, 'py-24')}>
              <ErrorState as="h1" title={t.loadError} onRetry={() => setSiteState('live')}>{t.loadErrorBody}</ErrorState>
            </div>
          ) : page}
        </main>
        <SiteFooter />
      </div>
      <SiteReviewBar />
    </div>
  );
}

const PRIMARY = ['plans', 'payments', 'marketing', 'ads', 'help', 'blog'] as const;

function SiteHeader({ current, dark, setDark }: { current: string; dark: boolean; setDark: (f: (d: boolean) => boolean) => void }) {
  const { t } = useSite();
  const { lang, setLang } = useLang();
  const review = useReviewMode();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); }, [current]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const other = lang === 'ar' ? 'English' : 'العربية';
  return (
    <header className="glass sticky top-0 z-40 border-b border-border">
      <div className={cn(wrap, 'flex h-16 items-center gap-3')}>
        <a href={site()} className="flex shrink-0 items-center gap-2.5" aria-label={`${t.siteName} — ${t.nav.home}`}>
          <img src="/lak-mark.png" alt="" width={22} height={32} className="h-8 w-auto" />
          <span className="text-lg font-bold text-fg">{t.siteName}</span>
        </a>
        <nav aria-label={t.siteNav} className="ms-6 hidden items-center gap-1 lg:flex">
          {PRIMARY.map((id) => (
            <a key={id} href={site(id)} aria-current={current === id ? 'page' : undefined}
              className={cn('relative rounded-lg px-3 py-2 text-sm font-medium transition-colors', current === id ? 'text-fg' : 'text-muted hover:text-fg')}>
              {t.nav[id]}{current === id && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-brand-600" aria-hidden="true" />}
            </a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1">
          {review && <a href={link('/')} className="hidden px-2 text-xs font-semibold text-brand-700 hover:underline sm:inline dark:text-brand-300">{t.hub}</a>}
          <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={other}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg">
            <Languages className="size-[18px]" aria-hidden="true" /><span className="hidden sm:inline">{other}</span>
          </button>
          <IconButton label={dark ? t.light : t.dark} onClick={() => setDark((d) => !d)}>{dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}</IconButton>
          <LinkButton variant="ghost" href={link('/dashboard')} title={t.loginNote} className="max-md:hidden">{t.login}</LinkButton>
          <LinkButton href={site('start')} className="max-sm:hidden">{t.register}</LinkButton>
          <button ref={btn} type="button" aria-expanded={open} aria-controls="site-menu" aria-label={open ? t.closeMenu : t.menu} onClick={() => setOpen((o) => !o)}
            className="grid size-10 place-items-center rounded-xl text-fg transition-colors hover:bg-surface-2 lg:hidden">
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <div id="site-menu" ref={panel} className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-surface lg:hidden">
          <div className={cn(wrap, 'space-y-6 py-6')}>
            <div className="grid gap-2 sm:grid-cols-2">
              <LinkButton size="lg" href={site('start')}>{t.register}</LinkButton>
              <LinkButton size="lg" variant="secondary" href={link('/dashboard')}>{t.login}</LinkButton>
            </div>
            <Sitemap current={current} />
            {review && <a href={link('/')} className="inline-block text-sm font-semibold text-brand-700 dark:text-brand-300">{t.hub}</a>}
          </div>
        </div>
      )}
    </header>
  );
}

/** The full site map; used in the phone menu and the footer. */
function Sitemap({ current }: { current?: string }) {
  const { t } = useSite();
  const groups: { title: string; items: { href: string; label: string; id?: string; planned?: boolean }[] }[] = [
    { title: t.footer.product, items: [
      { href: site('plans'), label: t.nav.plans, id: 'plans' }, { href: site('payments'), label: t.nav.payments, id: 'payments' },
      { href: site('marketing'), label: t.nav.marketing, id: 'marketing' }, { href: site('ads'), label: t.nav.ads, id: 'ads' },
      { href: site('start'), label: t.nav.start, id: 'start' },
    ] },
    { title: t.footer.resources, items: [
      { href: site('help'), label: t.nav.help, id: 'help' }, { href: site('blog'), label: t.nav.blog, id: 'blog' },
      { href: site('guide'), label: t.nav.guide, id: 'guide' }, { href: site('stories'), label: t.nav.stories, id: 'stories' },
    ] },
    { title: t.footer.company, items: [
      { href: site('about'), label: t.nav.about, id: 'about' }, { href: site('contact'), label: t.nav.contact, id: 'contact' },
      { href: site('legal/terms'), label: t.nav.terms }, { href: site('legal/privacy'), label: t.nav.privacy },
      { href: site('legal/affiliate'), label: t.nav.affiliate },
    ] },
    { title: t.footer.products, items: [
      { href: link('/dashboard'), label: t.footer.workspace }, { href: link('/store'), label: t.footer.storefront },
      { href: link('/appmaker'), label: t.footer.appmaker }, { href: link('/market'), label: t.footer.market },
      { href: '', label: t.footer.themes, planned: true },
    ] },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
      {groups.map((g) => (
        <div key={g.title} className="min-w-0">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-subtle">{g.title}</h2>
          <ul className="space-y-2.5">
            {g.items.map((i) => (
              <li key={i.label} className="text-sm">
                {i.planned
                  ? <span className="inline-flex flex-wrap items-center gap-2 text-muted">{i.label}<Status s="planned" /></span>
                  : <a href={i.href} aria-current={current && current === i.id ? 'page' : undefined}
                      className={cn('transition-colors hover:text-fg', current && current === i.id ? 'font-semibold text-fg' : 'text-muted')}>{i.label}</a>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SiteFooter() {
  const { t } = useSite();
  return (
    <footer className="border-t border-border bg-surface">
      <div className={cn(wrap, 'py-14')}>
        <div className="grid gap-10 lg:grid-cols-[180px_1fr]">
          <a href={site()} aria-label={`${t.siteName} — ${t.nav.home}`} className="block w-fit">
            <img src="/brand/lak-logo-sm.png" alt="" width={56} height={97} className="h-24 w-auto" />
          </a>
          <Sitemap />
        </div>
        <div className="mt-12 space-y-1.5 border-t border-border pt-6 text-xs leading-relaxed text-subtle">
          <p>{t.footer.note}</p>
          <p>{t.footer.pending}</p>
        </div>
      </div>
    </footer>
  );
}

function PageSkeleton() {
  const { t } = useSite();
  return (
    <div className={cn(wrap, 'space-y-6 py-16')} aria-busy="true">
      <p role="status" className="sr-only">{t.loading}</p>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-12 w-full max-w-2xl" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <div className="flex gap-3"><Skeleton className="h-11 w-40 rounded-xl" /><Skeleton className="h-11 w-40 rounded-xl" /></div>
      <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
    </div>
  );
}

function NotFound() {
  const { t } = useSite();
  return (
    <div className={wrap}><div className="max-w-2xl space-y-5 py-24">
      <h1 tabIndex={-1} data-page-heading className="text-[32px] font-bold text-fg outline-none">{t.notFoundTitle}</h1>
      <p className="text-muted">{t.notFoundBody}</p>
      <div className="flex flex-wrap gap-2"><LinkButton size="lg" href={site()}>{t.goHome}</LinkButton><LinkButton size="lg" variant="secondary" href={site('help')}>{t.nav.help}</LinkButton></div>
    </div></div>
  );
}
