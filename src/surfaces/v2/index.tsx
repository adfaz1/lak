// LAK design v2 — three screens redesigned to prove the visual and interaction standard before it is rolled out:
// merchant home, orders (list + detail) and product editing. Two genuinely different directions:
//   A "Workbench": side navigation, split list/detail on desktop, drawer on phone.
//   B "Focus": top navigation, one centred column, full-page detail with a sticky action bar, bottom tabs on phone.
import { useEffect, useState, type ReactNode } from 'react';
import { link, type Route } from '../../core/router';
import { useLang } from '../../core/lang';
import { useReviewMode } from '../../core/review';
import { ordersStore, settingsStore } from '../merchant/stores';
import { VIEWS } from '../merchant/domain';
import { Icon, useTx } from './ui';
import { reviewStore, vhref, type DemoState } from './data';
import Home from './home';
import Orders from './orders';
import ProductEdit from './product';
import Compare from './compare';
import { AllMenu, SideGroups } from './nav';
import './nav.css';
import './lk.css';
import './shell.css';

type Section = 'home' | 'orders' | 'products' | 'compare';

export default function V2({ route }: { route: Route }) {
  const { lang, setLang } = useLang();
  const tx = useTx();
  const review = reviewStore.use();
  const reviewMode = useReviewMode();
  const orders = ordersStore.use();
  const settings = settingsStore.use();
  const [menu, setMenu] = useState(false);
  const [all, setAll] = useState(false);
  const seg = route.path[0];
  const section: Section = seg === 'orders' ? 'orders' : seg === 'products' ? 'products' : seg === 'compare' ? 'compare' : 'home';
  useEffect(() => { setMenu(false); setAll(false); }, [route]);
  // "/" opens the sections menu from anywhere except while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) { e.preventDefault(); setAll(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const needs = orders.filter(VIEWS.needs).length;
  const view = route.query.get('view');
  const current = section === 'orders' ? (view === 'late' || view === 'returns' || view === 'payfail' ? view : 'orders') : section === 'products' ? 'product-edit' : section;
  const primary: { id: Section; label: string; href: string; count?: number }[] = [
    { id: 'home', label: tx('الرئيسية', 'Home'), href: vhref('') },
    { id: 'orders', label: tx('الطلبات', 'Orders'), href: vhref('orders'), count: needs },
    { id: 'products', label: tx('المنتجات', 'Products'), href: vhref('products/p1') },
  ];
  const body = section === 'orders' ? <Orders route={route} /> : section === 'products' ? <ProductEdit route={route} /> : section === 'compare' ? <Compare /> : <Home />;
  const store = settings.store.name;
  const allBtn = (cls: string) => (
    <button type="button" className={cls} onClick={() => setAll(true)} aria-haspopup="dialog" aria-keyshortcuts="/">
      <span>{tx('كل الأقسام', 'All sections')}</span><span className="lk-kbd lk-only-desktop">/</span>
    </button>
  );
  const searchField = (
    <a className="sh-search" href={vhref('orders', { focus: 'search' })}>
      <Icon name="search" size="sm" /><span className="lk-grow">{tx('ابحث عن طلب أو عميل', 'Search orders or customers')}</span>
    </a>
  );
  const user = (
    <span className="sh-tools">
      <span className="sh-demo" title={tx('كل البيانات أمثلة اختبار، والعمليات الخارجية محاكاة.', 'All data are test examples; external operations are simulated.')}>{tx('نسخة تجريبية', 'Demo')}</span>
      <button type="button" className="lk-btn sm ghost" lang={lang === 'ar' ? 'en' : 'ar'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'English' : 'العربية'}</button>
      <span className="sh-user" title={tx('سارة · المالكة', 'Sara · Owner')}><span className="lk-avatar">س</span></span>
    </span>
  );

  return (
    <div className="lk lk-app" data-dir={reviewMode ? review.dir : 'a'}>
      <div className="sh-glow" aria-hidden="true" />
      {(reviewMode ? review.dir : 'a') === 'a' ? (
        <div className="lk-a">
          <nav className={`lk-a-nav${menu ? ' open' : ''}`} aria-label={tx('تنقل لوحة التاجر', 'Merchant navigation')}>
            <div className="lk-row lk-between">
              <a className="lk-mark" href={vhref('')}><img src="/lak-mark.png" alt="LAK | لك" /></a>
              <button type="button" className="lk-btn icon sm ghost lk-a-menu" aria-label={tx('إغلاق القائمة', 'Close menu')} onClick={() => setMenu(false)}><Icon name="close" size="sm" /></button>
            </div>
            <div className="sh-store">
              <span className="lk-strong lk-truncate">{store}</span>
              <span className="sh-live"><span className="dot" />{tx('يستقبل الطلبات', 'Taking orders')}</span>
              <a className="sh-visit" href={link('/store')}>{tx('زيارة المتجر', 'Visit store')} ↗</a>
            </div>
            <SideGroups current={current} counts={{ orders: needs }} />
            <div className="lk-grow" />
            {allBtn('sh-all')}
          </nav>
          {menu && <div className="lk-scrim" style={{ zIndex: 44, background: 'rgba(20,25,56,.3)' }} onClick={() => setMenu(false)} aria-hidden="true" />}
          <div style={{ minWidth: 0 }}>
            <header className="lk-a-top">
              <button type="button" className="lk-btn icon ghost lk-a-menu" aria-label={tx('فتح القائمة', 'Open menu')} aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
              {searchField}
              <span className="lk-grow" />
              {user}
            </header>
            <main>{body}</main>
          </div>
        </div>
      ) : (
        <>
          <header className="lk-b-top">
            <div className="lk-b-bar">
              <a className="lk-mark" href={vhref('')}><img src="/lak-mark.png" alt="LAK | لك" /></a>
              <nav className="lk-b-nav" aria-label={tx('تنقل لوحة التاجر', 'Merchant navigation')}>
                {primary.map((n) => (
                  <a key={n.id} href={n.href} aria-current={section === n.id ? 'page' : undefined}>{n.label}{n.count ? <span className="nav-flat-n">{n.count}</span> : null}</a>
                ))}
                {allBtn('sh-b-all')}
              </nav>
              <span className="lk-grow lk-b-only-mobile" />
              {searchField}
              {user}
            </div>
          </header>
          <main className="lk-b-main">{body}</main>
          <nav className="lk-b-tabs" aria-label={tx('تنقل سريع', 'Quick navigation')}>
            {primary.map((n) => (
              <a key={n.id} href={n.href} aria-current={section === n.id ? 'page' : undefined}>{n.label}{n.count ? <span className="nav-flat-n">{n.count}</span> : null}</a>
            ))}
            <button type="button" onClick={() => setAll(true)}>{tx('الكل', 'All')}</button>
          </nav>
        </>
      )}
      {all && <AllMenu onClose={() => setAll(false)} />}
      {reviewMode && <ReviewBar />}
      <span hidden>{lang}</span>
    </div>
  );
}

/** Reviewer controls: switch direction and force loading / empty / error to inspect every state. */
function ReviewBar() {
  const tx = useTx();
  const r = reviewStore.use();
  const set = (p: Partial<typeof r>) => reviewStore.set((s) => ({ ...s, ...p }));
  if (!r.open) return (
    <button type="button" className="lk-btn sm lk-review-min" aria-expanded="false" onClick={() => set({ open: true })}>
      <Icon name="eye" size="sm" />{tx('مراجعة', 'Review')} · {r.dir.toUpperCase()}{r.state !== 'live' ? ` · ${r.state}` : ''}
    </button>
  );
  const states: [DemoState, string][] = [['live', tx('البيانات', 'Data')], ['loading', tx('تحميل', 'Loading')], ['empty', tx('فارغ', 'Empty')], ['error', tx('خطأ', 'Error')]];
  return (
    <div className="lk-review" role="region" aria-label={tx('أدوات المراجعة (ليست جزءًا من المنتج)', 'Review tools (not part of the product)')}>
      <span className="lk-eyebrow">{tx('مراجعة', 'Review')}</span>
      <div className="lk-seg" role="group" aria-label={tx('الاتجاه', 'Direction')}>
        <button type="button" aria-pressed={r.dir === 'a'} onClick={() => set({ dir: 'a' })}>A · {tx('منضدة العمل', 'Workbench')}</button>
        <button type="button" aria-pressed={r.dir === 'b'} onClick={() => set({ dir: 'b' })}>B · {tx('التركيز', 'Focus')}</button>
      </div>
      <div className="lk-seg" role="group" aria-label={tx('حالة الشاشة', 'Screen state')}>
        {states.map(([id, label]) => <button key={id} type="button" aria-pressed={r.state === id} onClick={() => set({ state: id })}>{label}</button>)}
      </div>
      <a className="lk-btn sm" href={vhref('compare')}>{tx('قبل وبعد', 'Before / after')}</a>
      <button type="button" className="lk-btn icon sm ghost" aria-label={tx('إخفاء أدوات المراجعة', 'Hide review tools')} onClick={() => set({ open: false })}><Icon name="close" size="sm" /></button>
    </div>
  );
}

/** Shared page frame for the three screens. */
export function Page({ children, label }: { children: ReactNode; label?: string }) {
  const tx = useTx();
  return (
    <div className="lk-page" aria-label={label}>
      {children}
      <footer className="sh-foot lk-micro lk-3">
        {tx('بيانات تجريبية. صور المنتجات من ويكيميديا كومنز بتراخيص حرة.', 'Demo data. Product photos from Wikimedia Commons under free licences.')}{' '}
        <a href="/products/credits.html" target="_blank" rel="noopener">{tx('حقوق الصور', 'Image credits')}</a>
      </footer>
    </div>
  );
}
