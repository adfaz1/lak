// Merchant dashboard shell: navigation, top bar, theme and language. Pages render inside <main>.
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  LayoutDashboard, ShoppingBag, Package, Warehouse, Users, BarChart3, Wallet, Megaphone, Workflow, Store, Globe2, Smartphone,
  Blocks, Settings, LifeBuoy, Search, Bell, Menu, X, Moon, Sun, Languages, ChevronsLeft, ChevronsRight, ArrowUpLeft, ExternalLink,
} from 'lucide-react';
import { useLang, type L } from '../../core/lang';
import { link } from '../../core/router';
import { cn, IconButton, useTx } from '../../ds/ui';
import { BUILT, sectionHref } from './pages';
import { testStore } from '../merchant/stores';

export const dhref = (path = '', q?: Record<string, string | undefined>) => link(`/dashboard${path ? `/${path}` : ''}`, q);
/** A section that is not rebuilt yet opens the previous workspace, which shows a bar to come back. */
const legacy = (page: string) => link(`/merchant/${page}`, { from: 'v2' });
/** New page when rebuilt, otherwise the previous workspace. */
const to = (key: string, legacyPage = key) => (BUILT.has(key) ? dhref(key) : legacy(legacyPage));

type Item = { key: string; label: L; icon: ComponentType<{ className?: string }>; href: string; built: boolean; count?: number };
type Group = { label: L; items: Item[] };

export function navGroups(counts: { orders: number }): Group[] {
  return [
    { label: { ar: 'التشغيل', en: 'Operate' }, items: [
      { key: 'home', label: { ar: 'الرئيسية', en: 'Home' }, icon: LayoutDashboard, href: dhref(), built: true },
      { key: 'orders', label: { ar: 'الطلبات', en: 'Orders' }, icon: ShoppingBag, href: to('orders'), built: BUILT.has('orders'), count: counts.orders },
      { key: 'products', label: { ar: 'المنتجات', en: 'Products' }, icon: Package, href: to('products'), built: BUILT.has('products') },
      { key: 'inventory', label: { ar: 'المخزون', en: 'Inventory' }, icon: Warehouse, href: to('inventory'), built: BUILT.has('inventory') },
      { key: 'customers', label: { ar: 'العملاء', en: 'Customers' }, icon: Users, href: to('customers'), built: BUILT.has('customers') },
    ] },
    { label: { ar: 'الأداء', en: 'Performance' }, items: [
      { key: 'analytics', label: { ar: 'التحليلات', en: 'Analytics' }, icon: BarChart3, href: to('analytics'), built: BUILT.has('analytics') },
      { key: 'finance', label: { ar: 'المالية', en: 'Finance' }, icon: Wallet, href: to('finance'), built: BUILT.has('finance') },
    ] },
    { label: { ar: 'النمو', en: 'Growth' }, items: [
      { key: 'marketing', label: { ar: 'التسويق والعروض', en: 'Marketing' }, icon: Megaphone, href: to('marketing'), built: BUILT.has('marketing') },
      { key: 'automations', label: { ar: 'الأتمتة', en: 'Automations' }, icon: Workflow, href: to('automations'), built: BUILT.has('automations') },
    ] },
    { label: { ar: 'القنوات', en: 'Channels' }, items: [
      { key: 'storefront', label: { ar: 'المتجر الإلكتروني', en: 'Online store' }, icon: Store, href: to('storefront'), built: BUILT.has('storefront') },
      { key: 'market', label: { ar: 'سوق لك', en: 'LAK marketplace' }, icon: Globe2, href: link('/market/seller'), built: false },
      { key: 'app', label: { ar: 'تطبيق متجرك', en: 'Your store app' }, icon: Smartphone, href: link('/appmaker'), built: false },
      { key: 'apps', label: { ar: 'التطبيقات', en: 'Apps' }, icon: Blocks, href: to('apps'), built: BUILT.has('apps') },
    ] },
  ];
}
const FOOT: Item[] = [
  { key: 'settings', label: { ar: 'الإعدادات', en: 'Settings' }, icon: Settings, href: to('settings'), built: BUILT.has('settings') },
  { key: 'help', label: { ar: 'المساعدة', en: 'Help' }, icon: LifeBuoy, href: to('help'), built: BUILT.has('help') },
];

const ROLE_LABEL: Record<string, L> = { owner: { ar: 'المالكة', en: 'Owner' }, fulfilment: { ar: 'التجهيز', en: 'Fulfilment' }, finance: { ar: 'المالية', en: 'Finance' }, marketing: { ar: 'التسويق', en: 'Marketing' } };

function readPref(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function writePref(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* preference only */ } }

export function Shell({ active, counts, store, children }: { active: string; counts: { orders: number }; store: string; children: ReactNode }) {
  const { lang, setLang } = useLang();
  const tx = useTx();
  const role = testStore.use().role;
  const [collapsed, setCollapsed] = useState(() => readPref('lak.nav', '0') === '1');
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(() => readPref('lak.theme', 'light') === 'dark');
  useEffect(() => { writePref('lak.theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobile(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const groups = navGroups(counts);
  const Collapse = lang === 'ar' ? (collapsed ? ChevronsLeft : ChevronsRight) : (collapsed ? ChevronsRight : ChevronsLeft);

  const link_ = (i: Item, compact: boolean) => {
    const on = i.key === active;
    const Icon = i.icon;
    return (
      <li key={i.key}>
        <a href={i.href} aria-current={on ? 'page' : undefined} title={compact ? i.label[lang] : !i.built ? tx('لم يُعَد بناؤه بعد: يفتح الإصدار السابق', 'Not rebuilt yet: opens the previous version') : undefined}
          className={cn('group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
            on ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-surface-2 hover:text-fg', compact && 'justify-center px-0')}>
          {on && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-brand-600" aria-hidden="true" />}
          <Icon className="size-[18px] shrink-0" aria-hidden="true" />
          {!compact && <span className="min-w-0 flex-1 truncate">{i.label[lang]}</span>}
          {!compact && !!i.count && <span className="grid min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white tabular-nums">{i.count}</span>}
          {!compact && !i.built && <ArrowUpLeft className="size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100 ltr:-scale-x-100" aria-hidden="true" />}
        </a>
      </li>
    );
  };
  const nav = (compact: boolean) => (
    <>
      <div className={cn('flex h-16 items-center gap-3 px-4', compact && 'justify-center px-0')}>
        <img src="/lak-mark.png" alt="" className="h-8 w-auto" />
        {!compact && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-fg">{store}</p>
            <a href={link('/store')} className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand-600">{tx('زيارة المتجر', 'Visit store')}<ExternalLink className="size-3" aria-hidden="true" /></a>
          </div>
        )}
      </div>
      <nav aria-label={tx('أقسام لوحة التاجر', 'Merchant sections')} className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.label.en}>
            {!compact && <p className="mb-2 px-3 text-[11px] font-semibold tracking-wide text-subtle">{g.label[lang]}</p>}
            <ul className="space-y-0.5">{g.items.map((i) => link_(i, compact))}</ul>
          </div>
        ))}
      </nav>
      <ul className="space-y-0.5 border-t border-border px-3 py-3">{FOOT.map((i) => link_(i, compact))}</ul>
    </>
  );

  return (
    <div className={cn('lak', dark && 'dark')} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <a href="#lak-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">{tx('تخطَّ إلى المحتوى', 'Skip to content')}</a>
      <div className="flex min-h-screen bg-bg">
        <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-e border-border bg-surface transition-[width] duration-200 lg:flex', collapsed ? 'w-[76px]' : 'w-64')}>
          {nav(collapsed)}
          <button type="button" onClick={() => { setCollapsed((c) => !c); writePref('lak.nav', collapsed ? '0' : '1'); }}
            className="flex h-11 items-center justify-center gap-2 border-t border-border text-xs font-medium text-muted hover:text-fg" aria-label={collapsed ? tx('توسيع القائمة', 'Expand menu') : tx('طيّ القائمة', 'Collapse menu')}>
            <Collapse className="size-4" aria-hidden="true" />{!collapsed && tx('طيّ', 'Collapse')}
          </button>
        </aside>

        {mobile && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={tx('القائمة', 'Menu')}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobile(false)} aria-hidden="true" />
            <aside className="absolute inset-y-0 start-0 flex w-72 flex-col bg-surface shadow-pop">
              <IconButton label={tx('إغلاق القائمة', 'Close menu')} onClick={() => setMobile(false)} className="absolute top-3 end-3"><X className="size-5" aria-hidden="true" /></IconButton>
              {nav(false)}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border px-4 sm:px-6">
            <IconButton label={tx('فتح القائمة', 'Open menu')} onClick={() => setMobile(true)} className="lg:hidden"><Menu className="size-5" aria-hidden="true" /></IconButton>
            <a href={sectionHref('orders', '', { focus: 'search' })} className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3 text-sm text-subtle transition-colors hover:border-brand-300 hover:text-muted sm:max-w-sm">
              <Search className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{tx('ابحث عن طلب أو منتج أو عميل', 'Search orders, products, customers')}</span>
            </a>
            <div className="ms-auto flex items-center gap-1">
              <span className="me-1 hidden rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-800 sm:inline dark:text-amber-300" title={tx('كل البيانات أمثلة اختبار، والعمليات الخارجية محاكاة.', 'All data are test examples; external operations are simulated.')}>{tx('نسخة تجريبية', 'Demo')}</span>
              <IconButton label={lang === 'ar' ? 'English' : 'العربية'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages className="size-5" aria-hidden="true" /></IconButton>
              <IconButton label={dark ? tx('الوضع الفاتح', 'Light mode') : tx('الوضع الداكن', 'Dark mode')} onClick={() => setDark((d) => !d)}>{dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}</IconButton>
              <IconButton label={tx('الإشعارات: لا جديد', 'Notifications: none new')}><Bell className="size-5" aria-hidden="true" /></IconButton>
              <span className="ms-1 grid size-9 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white" title={`${tx('سارة', 'Sara')} · ${ROLE_LABEL[role][lang]}`} aria-label={`${tx('سارة', 'Sara')} · ${ROLE_LABEL[role][lang]}`}>{tx('س', 'S')}</span>
            </div>
          </header>
          <main id="lak-main" className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          <footer className="mx-auto w-full max-w-[1320px] px-4 pb-8 text-xs text-subtle sm:px-6 lg:px-8">
            {tx('نسخة تجريبية ببيانات اختبار. صور المنتجات من ويكيميديا كومنز بتراخيص حرة.', 'Demo with test data. Product photos from Wikimedia Commons under free licences.')}{' '}
            <a href="/products/credits.html" target="_blank" rel="noopener" className="font-medium text-muted underline-offset-2 hover:underline">{tx('حقوق الصور', 'Image credits')}</a>
          </footer>
        </div>
      </div>
    </div>
  );
}
