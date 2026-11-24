import { useEffect, useRef, useState, type ComponentType } from 'react';
import { link, type Route } from '../../core/router';
import { Badge } from '../../core/ui';
import { VIEWS } from './domain';
import { lowStock } from './inventory';
import { canSee, ROLES, type Page, type Role } from './perms';
import { levelsStore, ordersStore, settingsStore, testStore } from './stores';
import { Icon, NoAccess, ROLE_NAMES, mhref, useL, useTx, type IconName } from './kit';
import { CommandPalette } from './palette';
import Home from './home';
import { OrdersPage } from './orders';
import { ProductsPage } from './products';
import { InventoryPage } from './inventory-page';
import { CustomersPage } from './customers';
import { AnalyticsPage } from './analytics';
import { FinancePage } from './finance-page';
import { MarketingPage } from './marketing';
import { AutomationsPage } from './automations';
import { StorefrontPage } from './storefront';
import { AppsPage } from './apps';
import { SettingsPage } from './settings';
import { HelpPage } from './help';
import './styles.css';

export { ordersStore };

const PAGES: Record<Page, ComponentType<{ route: Route }>> = {
  home: Home, orders: OrdersPage, products: ProductsPage, inventory: InventoryPage, customers: CustomersPage,
  analytics: AnalyticsPage, finance: FinancePage, marketing: MarketingPage, automations: AutomationsPage,
  storefront: StorefrontPage, apps: AppsPage, settings: SettingsPage, help: HelpPage,
};

type Item = { page: Page; icon: IconName; ar: string; en: string };
const GROUPS: { id: string; ar: string; en: string; items: Item[] }[] = [
  { id: 'operate', ar: 'التشغيل', en: 'Operate', items: [
    { page: 'home', icon: 'home', ar: 'الرئيسية', en: 'Home' },
    { page: 'orders', icon: 'orders', ar: 'الطلبات', en: 'Orders' },
    { page: 'products', icon: 'products', ar: 'المنتجات', en: 'Products' },
    { page: 'inventory', icon: 'inventory', ar: 'المخزون', en: 'Inventory' },
    { page: 'customers', icon: 'customers', ar: 'العملاء', en: 'Customers' },
  ] },
  { id: 'performance', ar: 'الأداء', en: 'Performance', items: [
    { page: 'analytics', icon: 'analytics', ar: 'التحليلات', en: 'Analytics' },
    { page: 'finance', icon: 'finance', ar: 'الأموال', en: 'Finance' },
  ] },
  { id: 'growth', ar: 'النمو', en: 'Growth', items: [
    { page: 'marketing', icon: 'marketing', ar: 'التسويق والعروض', en: 'Marketing & offers' },
    { page: 'automations', icon: 'automations', ar: 'الأتمتة', en: 'Automations' },
  ] },
  { id: 'channels', ar: 'القنوات', en: 'Channels', items: [
    { page: 'storefront', icon: 'store', ar: 'المتجر الإلكتروني', en: 'Online store' },
  ] },
  { id: 'ecosystem', ar: 'المنظومة', en: 'Ecosystem', items: [
    { page: 'apps', icon: 'apps', ar: 'التطبيقات', en: 'Apps' },
  ] },
];
const FIXED: Item[] = [
  { page: 'settings', icon: 'settings', ar: 'الإعدادات', en: 'Settings' },
  { page: 'help', icon: 'help', ar: 'المساعدة', en: 'Help' },
];
const PAGE_WHAT: Record<Page, [string, string]> = {
  home: ['الرئيسية', 'home'], orders: ['الطلبات', 'orders'], products: ['المنتجات', 'products'], inventory: ['المخزون', 'inventory'],
  customers: ['بيانات العملاء', 'customer data'], analytics: ['التحليلات', 'analytics'], finance: ['الأموال والتسويات', 'finance and payouts'],
  marketing: ['التسويق والعروض', 'marketing and offers'], automations: ['الأتمتة', 'automations'], storefront: ['المتجر الإلكتروني والثيمات', 'the online store and themes'],
  apps: ['التطبيقات', 'apps'], settings: ['الإعدادات', 'settings'], help: ['المساعدة', 'help'],
};

const isPage = (s: string | undefined): s is Page => !!s && s in PAGES;
const editable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

/** Merchant workspace. `route` is the path below /merchant. */
export default function Merchant({ route }: { route: Route }) {
  const tx = useTx();
  const l = useL();
  const test = testStore.use();
  const orders = ordersStore.use();
  const levels = levelsStore.use();
  const settings = settingsStore.use();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const seg = route.path[0];
  const page: Page | null = !seg ? 'home' : isPage(seg) ? seg : null;
  const role = test.role;

  useEffect(() => { setMenu(false); }, [route]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !editable(e.target)) { e.preventDefault(); setPalette(true); }
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (menu) navRef.current?.querySelector<HTMLElement>('a, button')?.focus(); }, [menu]);

  const counts: Partial<Record<Page, number>> = { orders: orders.filter(VIEWS.needs).length, inventory: lowStock(levels).length };
  const navItem = (it: Item) => (
    <li key={it.page}>
      <a className="m-nav-link" href={mhref(it.page === 'home' ? '' : it.page)} aria-current={page === it.page ? 'page' : undefined}>
        <Icon name={it.icon} /><span className="grow">{tx(it.ar, it.en)}</span>
        {counts[it.page] ? <span className="m-count"><span className="sr">{tx('بحاجة إلى انتباه:', 'needing attention:')}</span>{counts[it.page]}</span> : null}
      </a>
    </li>
  );
  const visible = (items: Item[]) => items.filter((i) => canSee(role, i.page));
  const Body = page ? PAGES[page] : null;

  return (
    <div className="m-shell">
      {menu && <div className="m-scrim" onClick={() => setMenu(false)} aria-hidden="true" />}
      <div className="m-navcol">
      <nav ref={navRef} id="m-nav" className={`m-nav${menu ? ' open' : ''}`} aria-label={tx('تنقل لوحة التاجر', 'Merchant workspace')}>
        <div className="m-store">
          <span className="m-store-mark" aria-hidden="true">{settings.store.name.slice(0, 1)}</span>
          <span className="grow"><span className="strong">{settings.store.name}</span><span className="muted small">{tx('متجر تجريبي · بيانات اختبار', 'Demo store · test data')}</span></span>
          <button type="button" className="btn small m-only-mobile" onClick={() => setMenu(false)} aria-label={tx('إغلاق القائمة', 'Close menu')}><Icon name="close" /></button>
        </div>
        <div className="m-nav-groups">
          {GROUPS.map((g) => {
            const items = visible(g.items);
            const channels = g.id === 'channels' && canSee(role, 'storefront');
            if (!items.length) return null;
            return (
              <div key={g.id} className="m-nav-group">
                <h2 className="m-nav-h" id={`nav-${g.id}`}>{tx(g.ar, g.en)}</h2>
                <ul aria-labelledby={`nav-${g.id}`}>
                  {items.map(navItem)}
                  {channels && (
                    <>
                      <li><a className="m-nav-link" href={link('/market')}><Icon name="market" /><span className="grow">{tx('سوق لك', 'LAK marketplace')}</span><Icon name="external" size={16} /><span className="sr">{tx('(واجهة أخرى)', '(another surface)')}</span></a></li>
                      <li><a className="m-nav-link" href={link('/appmaker')}><Icon name="app" /><span className="grow">{tx('صانع التطبيقات', 'App Maker')}</span><Icon name="external" size={16} /><span className="sr">{tx('(واجهة أخرى)', '(another surface)')}</span></a></li>
                    </>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
        <ul className="m-nav-fixed">{visible(FIXED).map(navItem)}</ul>
        {role !== 'owner' && <p className="nav-note">{tx(`بعض الأقسام مخفية لأن دورك «${ROLE_NAMES[role].ar}».`, `Some sections are hidden for the “${ROLE_NAMES[role].en}” role.`)}</p>}
      </nav>
      </div>

      <div className="m-main">
        <div className="m-top">
          <button type="button" className="btn m-only-mobile" aria-expanded={menu} aria-controls="m-nav" onClick={() => setMenu(true)}>
            <Icon name="menu" /><span className="m-hide-xs">{tx('القائمة', 'Menu')}</span>
          </button>
          <button type="button" className="m-search-btn" onClick={() => setPalette(true)} aria-keyshortcuts="Control+K Meta+K">
            <Icon name="search" /><span className="grow">{tx('ابحث أو اختر أمرًا', 'Search or run a command')}</span><kbd dir="ltr">Ctrl K</kbd>
          </button>
          <a className="btn small" href={link('/store')}><Icon name="external" size={16} /><span className="m-hide-xs">{tx('معاينة المتجر', 'Preview store')}</span></a>
          <button type="button" className="btn small" aria-expanded={test.open} aria-controls="m-test" onClick={() => testStore.set((s) => ({ ...s, open: !s.open }))}>
            <Icon name="flask" size={16} /><span className="m-hide-xs">{tx('لوحة الاختبار', 'Test panel')}</span>
          </button>
          <Badge tone="info">{l(ROLE_NAMES[role])}</Badge>
        </div>
        {test.open && <TestPanel />}
        <div className="m-content">
          {!page || !Body ? (
            <section className="card"><div className="card-body"><h1>{tx('لا توجد صفحة بهذا الرابط', 'No page at this address')}</h1><a className="btn" href={mhref('')}>{tx('العودة إلى الرئيسية', 'Back to home')}</a></div></section>
          ) : canSee(role, page) ? <Body route={route} /> : <NoAccess what={tx(PAGE_WHAT[page][0], PAGE_WHAT[page][1])} />}
        </div>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}

function TestPanel() {
  const tx = useTx();
  const l = useL();
  const t = testStore.use();
  const set = (p: Partial<typeof t>) => testStore.set((s) => ({ ...s, ...p }));
  return (
    <section id="m-test" className="m-test" aria-labelledby="m-test-h">
      <h2 id="m-test-h" className="small">{tx('لوحة الاختبار — أدوات محاكاة وليست جزءًا من منتج التاجر', 'Test panel — simulation controls, not part of the merchant product')}</h2>
      <div className="m-test-row">
        <div className="field">
          <label htmlFor="t-role">{tx('الدور الحالي', 'Current role')}</label>
          <select id="t-role" className="input" value={t.role} onChange={(e) => set({ role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{l(ROLE_NAMES[r])}</option>)}
          </select>
        </div>
        <fieldset className="m-inline-radios">
          <legend>{tx('الرئيسية', 'Home')}</legend>
          <label className="check"><input type="radio" name="t-mode" checked={t.mode === 'active'} onChange={() => set({ mode: 'active' })} /> {tx('متجر نشط', 'Active store')}</label>
          <label className="check"><input type="radio" name="t-mode" checked={t.mode === 'new'} onChange={() => set({ mode: 'new' })} /> {tx('متجر جديد (قائمة الإعداد)', 'New store (setup checklist)')}</label>
        </fieldset>
        <label className="check"><input type="checkbox" checked={t.failBulk} onChange={(e) => set({ failBulk: e.target.checked })} /> {tx('حاكِ فشل بعض الطلبات في الإجراء الجماعي', 'Simulate some orders failing in bulk actions')}</label>
      </div>
      <p className="small muted">{tx('الدور يقيّد الصفحات والأفعال في هذه المعاينة فقط. في المنصة الحقيقية يجب أن يُفرض المنع على الخادم.', 'The role restricts pages and actions in this preview only. The real platform must enforce it on the server.')}</p>
    </section>
  );
}
