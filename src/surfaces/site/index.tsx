import { useEffect, useRef, useState } from 'react';
import { link, type Route } from '../../core/router';
import { Status, site, useSite } from './kit';
import Home from './home';
import Plans from './plans';
import { Ads, Marketing, Payments } from './services';
import { Blog, Help } from './resources';
import { Guide, Stories } from './stories';
import { About, Contact, Legal } from './company';
import Start from './start';
import './styles.css';

/** P01 — LAK public website. `route.path` is the path below /site. */
export default function Site({ route }: { route: Route }) {
  const { dir } = useSite();
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
    case undefined: page = <Home route={route} />; break;
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
    <div className="site" dir={dir}>
      <SiteHeader current={p0 ?? ''} />
      <div className="site-page">{page}</div>
      <SiteFooter />
    </div>
  );
}

const PRIMARY = ['plans', 'payments', 'marketing', 'ads', 'help', 'blog'] as const;

function SiteHeader({ current }: { current: string }) {
  const { t } = useSite();
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

  return (
    <header className="site-header">
      <div className="site-wrap site-header-row">
        <a className="site-logo" href={site()} aria-label={`${t.siteName} — ${t.nav.home}`}>
          <img src="/lak-mark.png" alt="" width="22" height="32" />
          <span>{t.siteName}</span>
        </a>
        <nav className="site-primary" aria-label={t.siteNav}>
          {PRIMARY.map((id) => (
            <a key={id} href={site(id)} aria-current={current === id ? 'page' : undefined}>{t.nav[id]}</a>
          ))}
        </nav>
        <div className="site-header-actions">
          <a className="btn site-btn-quiet site-hide-sm" href={link('/merchant')} title={t.loginNote}>{t.login}</a>
          <a className="btn primary site-hide-xs" href={site('start')}>{t.register}</a>
          <button type="button" ref={btn} className="btn site-menu-btn" aria-expanded={open} aria-controls="site-menu"
            aria-label={open ? t.closeMenu : t.menu} onClick={() => setOpen((o) => !o)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="site-menu" id="site-menu" ref={panel}>
          <div className="site-wrap">
            <Sitemap current={current} />
            <div className="site-menu-actions">
              <a className="btn primary" href={site('start')}>{t.register}</a>
              <a className="btn" href={link('/merchant')}>{t.login} <span className="muted small">· {t.loginNote}</span></a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/** The full site map; used in the mobile menu and the footer. */
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
      { href: link('/merchant'), label: t.footer.workspace }, { href: link('/store'), label: t.footer.storefront },
      { href: link('/appmaker'), label: t.footer.appmaker }, { href: link('/market'), label: t.footer.market },
      { href: '', label: t.footer.themes, planned: true },
    ] },
  ];
  return (
    <div className="site-sitemap">
      {groups.map((g) => (
        <div key={g.title}>
          <h2 className="site-sitemap-h">{g.title}</h2>
          <ul>
            {g.items.map((i) => (
              <li key={i.label}>
                {i.planned
                  ? <span className="site-sitemap-planned">{i.label} <Status s="planned" /></span>
                  : <a href={i.href} aria-current={current && current === i.id ? 'page' : undefined}>{i.label}</a>}
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
    <footer className="site-footer">
      <div className="site-wrap">
        <div className="site-footer-top">
          <a className="site-footer-logo" href={site()} aria-label={`${t.siteName} — ${t.nav.home}`}>
            <img src="/lak-logo.png" alt="" width="56" height="96" />
          </a>
          <Sitemap />
        </div>
        <div className="site-footer-note">
          <p>{t.footer.note}</p>
          <p>{t.footer.pending}</p>
        </div>
      </div>
    </footer>
  );
}

function NotFound() {
  const { t } = useSite();
  return (
    <div className="site-wrap site-narrow site-pad">
      <h1 className="site-h1" tabIndex={-1} data-page-heading>{t.notFoundTitle}</h1>
      <p className="site-lead">{t.notFoundBody}</p>
      <div className="actions"><a className="btn primary" href={site()}>{t.goHome}</a><a className="btn" href={site('help')}>{t.nav.help}</a></div>
    </div>
  );
}
