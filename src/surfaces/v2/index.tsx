// LAK design v2 — three screens redesigned to prove the visual and interaction standard before it is rolled out:
// merchant home, orders (list + detail) and product editing. Two genuinely different directions:
//   A "Workbench": side navigation, split list/detail on desktop, drawer on phone.
//   B "Focus": top navigation, one centred column, full-page detail with a sticky action bar, bottom tabs on phone.
import { useEffect, useState, type ReactNode } from 'react';
import { link, type Route } from '../../core/router';
import { useLang } from '../../core/lang';
import { ordersStore, settingsStore } from '../merchant/stores';
import { VIEWS } from '../merchant/domain';
import { Icon, useTx, type IconName } from './ui';
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
  const { lang } = useLang();
  const tx = useTx();
  const review = reviewStore.use();
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
  const primary: { id: Section; label: string; icon: IconName; href: string; count?: number }[] = [
    { id: 'home', label: tx('الرئيسية', 'Home'), icon: 'home', href: vhref('') },
    { id: 'orders', label: tx('الطلبات', 'Orders'), icon: 'orders', href: vhref('orders'), count: needs },
    { id: 'products', label: tx('المنتجات', 'Products'), icon: 'products', href: vhref('products/p1') },
  ];
  const body = section === 'orders' ? <Orders route={route} /> : section === 'products' ? <ProductEdit route={route} /> : section === 'compare' ? <Compare /> : <Home />;
  const store = settings.store.name;
  const allBtn = (cls: string) => (
    <button type="button" className={cls} onClick={() => setAll(true)} aria-haspopup="dialog" aria-keyshortcuts="/">
      <Icon name="menu" size="sm" /><span>{tx('كل الأقسام', 'All sections')}</span><span className="lk-kbd lk-only-desktop">/</span>
    </button>
  );
  const storeCard = (
    <div className="sh-store">
      <span className="sh-store-logo" aria-hidden="true">{store.slice(0, 1)}</span>
      <div className="lk-col lk-grow" style={{ minWidth: 0 }}>
        <span className="lk-strong lk-truncate">{store}</span>
        <span className="sh-live"><span className="dot" />{tx('المتجر يستقبل الطلبات', 'Store is taking orders')}</span>
      </div>
      <a className="lk-btn icon sm soft" href={link('/store')} aria-label={tx('زيارة المتجر', 'Visit store')} title={tx('زيارة المتجر', 'Visit store')}><Icon name="external" size="sm" /></a>
    </div>
  );
  const tools = (
    <>
      <button type="button" className="lk-btn icon ghost" aria-label={tx('الإشعارات (لا جديد)', 'Notifications (none new)')} title={tx('لا إشعارات جديدة', 'No new notifications')}><Icon name="bell" /></button>
      <a className="lk-btn icon ghost" href={link('/merchant/settings')} aria-label={tx('الإعدادات (الإصدار الحالي)', 'Settings (current version)')}><Icon name="settings" /></a>
      <span className="sh-user" title={tx('سارة · المالكة', 'Sara · Owner')}><span className="lk-avatar">س</span><span className="lk-only-desktop lk-col"><span className="lk-small lk-strong">{tx('سارة', 'Sara')}</span><span className="lk-micro lk-3">{tx('المالكة', 'Owner')}</span></span></span>
    </>
  );

  return (
    <div className="lk lk-app" data-dir={review.dir}>
      {review.dir === 'a' ? (
        <div className="lk-a">
          <nav className={`lk-a-nav${menu ? ' open' : ''}`} aria-label={tx('تنقل لوحة التاجر', 'Merchant navigation')}>
            <div className="lk-row lk-between" style={{ padding: '2px 6px 0' }}>
              <a className="lk-mark" href={vhref('')}><img src="/lak-mark.png" alt="LAK | لك" /></a>
              <button type="button" className="lk-btn icon sm ghost lk-a-menu" aria-label={tx('إغلاق القائمة', 'Close menu')} onClick={() => setMenu(false)}><Icon name="close" size="sm" /></button>
            </div>
            {storeCard}
            <a className="sh-home" href={vhref('')} aria-current={section === 'home' ? 'page' : undefined}><Icon name="home" /><span className="lk-grow">{tx('الرئيسية', 'Home')}</span></a>
            <SideGroups current={current} />
          </nav>
          {menu && <div className="lk-scrim" style={{ zIndex: 44, background: 'rgba(20,25,56,.35)' }} onClick={() => setMenu(false)} aria-hidden="true" />}
          <div style={{ minWidth: 0 }}>
            <header className="lk-a-top">
              <button type="button" className="lk-btn icon ghost lk-a-menu" aria-label={tx('فتح القائمة', 'Open menu')} aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
              <a className="lk-search" href={vhref('orders', { focus: 'search' })}><Icon name="search" size="sm" /><span className="lk-grow lk-small">{tx('ابحث عن طلب أو عميل', 'Search orders or customers')}</span></a>
              {allBtn('lk-btn soft sh-all')}
              <span className="lk-grow" />
              {tools}
            </header>
            <main>{body}</main>
          </div>
        </div>
      ) : (
        <>
          <header className="lk-b-top">
            <div className="lk-b-bar">
              <a className="lk-mark" href={vhref('')}><img src="/lak-mark.png" alt="LAK | لك" /></a>
              {allBtn('sh-b-all')}
              <nav className="lk-b-nav" aria-label={tx('تنقل لوحة التاجر', 'Merchant navigation')}>
                {primary.map((n) => (
                  <a key={n.id} href={n.href} aria-current={section === n.id ? 'page' : undefined}><Icon name={n.icon} size="sm" />{n.label}{n.count ? <span className="lk-count">{n.count}</span> : null}</a>
                ))}
                <a href={link('/merchant/marketing')}><Icon name="marketing" size="sm" />{tx('التسويق', 'Marketing')}</a>
                <a href={link('/merchant/finance')}><Icon name="finance" size="sm" />{tx('المالية', 'Money')}</a>
              </nav>
              <span className="spacer lk-grow" />
              <a className="lk-btn icon ghost" href={vhref('orders', { focus: 'search' })} aria-label={tx('بحث', 'Search')}><Icon name="search" /></a>
              {tools}
            </div>
          </header>
          <main className="lk-b-main">{body}</main>
          <nav className="lk-b-tabs" aria-label={tx('تنقل سريع', 'Quick navigation')}>
            {primary.map((n) => (
              <a key={n.id} href={n.href} aria-current={section === n.id ? 'page' : undefined}><Icon name={n.icon} />{n.label}{n.count ? <span className="lk-count">{n.count}</span> : null}</a>
            ))}
            <button type="button" onClick={() => setAll(true)}><Icon name="menu" />{tx('الكل', 'All')}</button>
          </nav>
        </>
      )}
      {all && <AllMenu onClose={() => setAll(false)} />}
      <ReviewBar />
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
  return <div className="lk-page" aria-label={label}>{children}</div>;
}
