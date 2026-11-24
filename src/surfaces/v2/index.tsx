// LAK design v2 — three screens redesigned to prove the visual and interaction standard before it is rolled out:
// merchant home, orders (list + detail) and product editing. Two genuinely different directions:
//   A "Workbench": side navigation, split list/detail on desktop, drawer on phone.
//   B "Focus": top navigation, one centred column, full-page detail with a sticky action bar, bottom tabs on phone.
import { useEffect, useState, type ReactNode } from 'react';
import { link, type Route } from '../../core/router';
import { useLang } from '../../core/lang';
import { ordersStore, productsStore, settingsStore } from '../merchant/stores';
import { VIEWS } from '../merchant/domain';
import { Icon, useTx, type IconName } from './ui';
import { reviewStore, vhref, type DemoState } from './data';
import Home from './home';
import Orders from './orders';
import ProductEdit from './product';
import Compare from './compare';
import './lk.css';
import './shell.css';

type Section = 'home' | 'orders' | 'products' | 'compare';

export default function V2({ route }: { route: Route }) {
  const { lang } = useLang();
  const tx = useTx();
  const review = reviewStore.use();
  const orders = ordersStore.use();
  const products = productsStore.use();
  const settings = settingsStore.use();
  const [menu, setMenu] = useState(false);
  const seg = route.path[0];
  const section: Section = seg === 'orders' ? 'orders' : seg === 'products' ? 'products' : seg === 'compare' ? 'compare' : 'home';
  useEffect(() => setMenu(false), [route]);

  const needs = orders.filter(VIEWS.needs).length;
  const firstProduct = products.find((p) => p.status === 'active') ?? products[0];
  const nav: { id: Section; label: string; icon: IconName; href: string; count?: number }[] = [
    { id: 'home', label: tx('الرئيسية', 'Home'), icon: 'home', href: vhref('') },
    { id: 'orders', label: tx('الطلبات', 'Orders'), icon: 'orders', href: vhref('orders'), count: needs },
    { id: 'products', label: tx('المنتجات', 'Products'), icon: 'products', href: vhref(`products/${firstProduct.id}`) },
  ];
  /** Not redesigned yet: they open the current workspace, and say so. */
  const later: { label: string; icon: IconName; page: string }[] = [
    { label: tx('المخزون', 'Inventory'), icon: 'inventory', page: 'inventory' },
    { label: tx('العملاء', 'Customers'), icon: 'customers', page: 'customers' },
    { label: tx('التحليلات', 'Analytics'), icon: 'analytics', page: 'analytics' },
    { label: tx('الأموال', 'Finance'), icon: 'finance', page: 'finance' },
    { label: tx('التسويق', 'Marketing'), icon: 'marketing', page: 'marketing' },
    { label: tx('الإعدادات', 'Settings'), icon: 'settings', page: 'settings' },
  ];

  const body = section === 'orders' ? <Orders route={route} /> : section === 'products' ? <ProductEdit route={route} /> : section === 'compare' ? <Compare /> : <Home />;
  const storeName = settings.store.name;
  const search = (
    <a className="lk-search" href={vhref('orders', { focus: 'search' })}
      aria-label={tx('بحث في الطلبات والمنتجات والعملاء', 'Search orders, products and customers')}>
      <Icon name="search" size="sm" /><span className="lk-grow lk-small">{tx('ابحث عن طلب أو منتج أو عميل', 'Search orders, products, customers')}</span><span className="lk-kbd">/</span>
    </a>
  );

  return (
    <div className="lk lk-app" data-dir={review.dir}>
      <div className="lk-brandline" />
      {review.dir === 'a' ? (
        <div className="lk-a">
          <nav className={`lk-a-nav${menu ? ' open' : ''}`} aria-label={tx('تنقل لوحة التاجر', 'Merchant navigation')}>
            <a className="lk-mark" href={vhref('')} style={{ padding: '4px 10px' }}><img src="/lak-mark.png" alt="" /><b>{tx('لك', 'LAK')}</b></a>
            <div className="lk-storechip"><span className="logo" aria-hidden="true">{storeName.slice(0, 1)}</span><span className="lk-col lk-grow"><span className="lk-strong lk-truncate">{storeName}</span><span className="lk-micro lk-3">{tx('متجر تجريبي · بيانات اختبار', 'Demo store · test data')}</span></span></div>
            <div className="lk-col lk-gap-4">
              {nav.map((n) => (
                <a key={n.id} className="lk-a-link" href={n.href} aria-current={section === n.id ? 'page' : undefined}>
                  <Icon name={n.icon} /><span className="lk-grow">{n.label}</span>{n.count ? <span className="lk-count hot">{n.count}</span> : null}
                </a>
              ))}
            </div>
            <div className="lk-col lk-gap-4">
              <h2 className="lk-eyebrow">{tx('لم يُعَد تصميمها بعد', 'Not redesigned yet')}</h2>
              {later.map((l) => (
                <a key={l.page} className="lk-a-link" href={link(`/merchant/${l.page}`)}>
                  <Icon name={l.icon} /><span className="lk-grow">{l.label}</span><span className="old">{tx('الإصدار الحالي', 'current')}</span>
                </a>
              ))}
            </div>
          </nav>
          {menu && <div className="lk-scrim" style={{ zIndex: 44, background: 'rgba(20,25,56,.35)' }} onClick={() => setMenu(false)} aria-hidden="true" />}
          <div style={{ minWidth: 0 }}>
            <header className="lk-a-top">
              <button type="button" className="lk-btn icon ghost lk-a-menu" aria-label={tx('فتح القائمة', 'Open menu')} aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
              {search}
              <span className="lk-grow" />
              <a className="lk-btn sm ghost lk-only-desktop" href={link('/store')}><Icon name="external" size="sm" />{tx('معاينة المتجر', 'View store')}</a>
              <button type="button" className="lk-btn icon ghost" aria-label={tx('الإشعارات (لا جديد)', 'Notifications (none new)')} title={tx('لا إشعارات جديدة', 'No new notifications')}><Icon name="bell" /></button>
            </header>
            <main>{body}</main>
          </div>
        </div>
      ) : (
        <>
          <header className="lk-b-top">
            <div className="lk-b-bar">
              <a className="lk-mark" href={vhref('')}><img src="/lak-mark.png" alt="" /><b>{tx('لك', 'LAK')}</b></a>
              <nav className="lk-b-nav" aria-label={tx('تنقل لوحة التاجر', 'Merchant navigation')}>
                {nav.map((n) => (
                  <a key={n.id} href={n.href} aria-current={section === n.id ? 'page' : undefined}>{n.label}{n.count ? <span className="lk-count">{n.count}</span> : null}</a>
                ))}
                <a href={link('/merchant/customers')}>{tx('المزيد', 'More')}<Icon name="external" size="xs" /></a>
              </nav>
              <span className="spacer lk-b-only-mobile" />
              {search}
              <button type="button" className="lk-btn icon ghost" aria-label={tx('الإشعارات (لا جديد)', 'Notifications (none new)')}><Icon name="bell" /></button>
            </div>
            <div className="lk-b-sub"><div className="inner"><span className="lk-strong" style={{ color: '#fff' }}>{storeName}</span><span>·</span><span>{tx('متجر تجريبي، بيانات اختبار', 'Demo store, test data')}</span><span className="lk-grow" /><a href={link('/store')} style={{ color: '#c5c9e6' }}>{tx('معاينة المتجر', 'View store')}</a></div></div>
          </header>
          <main className="lk-b-main">{body}</main>
          <nav className="lk-b-tabs" aria-label={tx('تنقل سريع', 'Quick navigation')}>
            {nav.map((n) => (
              <a key={n.id} href={n.href} aria-current={section === n.id ? 'page' : undefined}><Icon name={n.icon} />{n.label}{n.count ? <span className="lk-count">{n.count}</span> : null}</a>
            ))}
            <a href={link('/merchant/customers')}><Icon name="more" />{tx('المزيد', 'More')}</a>
          </nav>
        </>
      )}
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
