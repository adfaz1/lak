// «سوق لك» — LAK's own consumer marketplace (`#/market/...`), built on the LAK design system.
// Discovery across stores, store and product pages with the seller's identity and costs, a cart grouped by store
// with a separate payment per store (a unified cart is an open business decision), orders, returns, notifications
// and help. Payments and shipping are simulated. The merchant side lives in the dashboard (`#/dashboard/channel`).
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bell, Compass, LayoutGrid, LifeBuoy, MapPin, Moon, Package, Search, ShoppingBag, Sun, Languages, X } from 'lucide-react';
import { useLang } from '../../core/lang';
import { link, navigate, replace, type Route } from '../../core/router';
import { useReviewMode } from '../../core/review';
import { cn, IconButton, Segmented, useTx } from '../../ds/ui';
import { Switch, ToastProvider } from '../../ds/kit';
import { CITIES, type CityId } from './domain';
import { strings } from './i18n';
import { marketStore, reviewFx, type ScreenState } from './state';
import { MarketCtx, useMk, type Ctx } from './ui';
import Discover from './pages/discover';
import StorePage from './pages/store';
import ProductPage from './pages/product';
import CartPage from './pages/cart';
import Checkout from './pages/checkout';
import { OrderPage, OrdersPage } from './pages/orders';
import AlertsPage from './pages/alerts';
import HelpPage from './pages/help';
import '../../ds/lak.css';

function readPref(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function writePref(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* preference only */ } }

export default function Market({ route }: { route: Route }) {
  const { lang } = useLang();
  const [p0, p1] = route.path;
  // The merchant eligibility screen moved into the merchant dashboard.
  useEffect(() => { if (p0 === 'seller') replace(link('/dashboard/channel', route.query.get('review') ? { review: route.query.get('review')! } : undefined)); }, [p0, route.query]);

  const qCity = route.query.get('city') as CityId | null;
  const city: CityId = qCity && CITIES.includes(qCity) ? qCity : 'riyadh';
  const ctx: Ctx = useMemo(() => ({
    t: strings[lang], lang, route, city,
    go: (path: string, q?: Record<string, string | undefined>) => link(`/market${path}`, { city: city === 'riyadh' ? undefined : city, ...q }),
  }), [lang, route, city]);

  const [dark, setDark] = useState(() => readPref('lak.theme', 'light') === 'dark');
  useEffect(() => { writePref('lak.theme', dark ? 'dark' : 'light'); }, [dark]);

  const pathKey = route.path.join('/');
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathKey]);

  if (p0 === 'seller') return null;

  const page = p0 === 's' && p1 ? <StorePage key={p1} id={p1} />
    : p0 === 'p' && p1 ? <ProductPage key={p1} id={p1} />
    : p0 === 'cart' ? <CartPage />
    : p0 === 'checkout' && p1 ? <Checkout key={p1} sellerId={p1} />
    : p0 === 'orders' ? (p1 ? <OrderPage key={p1} ref_={p1} /> : <OrdersPage />)
    : p0 === 'alerts' ? <AlertsPage />
    : p0 === 'help' ? <HelpPage />
    : <Discover />;
  const tab = p0 === 'cart' || p0 === 'checkout' ? 'cart' : p0 === 'orders' ? 'orders' : p0 === 'alerts' ? 'alerts' : p0 === 'help' ? 'help' : 'discover';

  return (
    <MarketCtx.Provider value={ctx}>
      <ToastProvider>
        <div className={cn('lak', dark && 'dark')} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <a href="#mk-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">{ctx.t.nav.discover}</a>
          <div className="flex min-h-screen flex-col bg-bg">
            <Header tab={tab} dark={dark} setDark={setDark} />
            <main id="mk-main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{page}</main>
            <Footer />
          </div>
          <TabBar tab={tab} />
          <ReviewBar />
        </div>
      </ToastProvider>
    </MarketCtx.Provider>
  );
}

/* ---------- Chrome ---------- */

const NAV = [
  { id: 'discover', path: '', Icon: Compass },
  { id: 'cart', path: '/cart', Icon: ShoppingBag },
  { id: 'orders', path: '/orders', Icon: Package },
  { id: 'alerts', path: '/alerts', Icon: Bell },
  { id: 'help', path: '/help', Icon: LifeBuoy },
] as const;

function useCounts() {
  const s = marketStore.use();
  return { cart: s.cart.reduce((n, l) => n + l.qty, 0), alerts: s.notes.filter((n) => !n.read).length };
}

function Header({ tab, dark, setDark }: { tab: string; dark: boolean; setDark: (f: (d: boolean) => boolean) => void }) {
  const { t, lang, route, city, go } = useMk();
  const { setLang } = useLang();
  const tx = useTx();
  const counts = useCounts();
  const onDiscover = route.path.length === 0;
  const [q, setQ] = useState(route.query.get('q') ?? '');
  useEffect(() => { setQ(route.query.get('q') ?? ''); }, [route.query]);
  const cur = () => { const o: Record<string, string> = {}; route.query.forEach((v, k) => { o[k] = v; }); return o; };
  const submit = (e: FormEvent) => { e.preventDefault(); navigate(go('', { q: q.trim() || undefined })); };
  const changeCity = (c: CityId) => replace(link(`/market/${route.path.join('/')}`, { ...cur(), city: c === 'riyadh' ? undefined : c }));
  const typed = (v: string) => { setQ(v); if (onDiscover) replace(link('/market', { ...cur(), q: v || undefined })); };

  const search = (
    <form role="search" onSubmit={submit} className="relative min-w-0 flex-1">
      <label htmlFor="mk-q" className="sr-only">{t.search}</label>
      <Search className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input id="mk-q" type="search" enterKeyHint="search" value={q} onChange={(e) => typed(e.target.value)} placeholder={t.search}
        className="h-11 w-full rounded-full border border-border bg-surface-2/70 ps-10 pe-10 text-sm text-fg placeholder:text-subtle transition-colors focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
      {q && <button type="button" onClick={() => typed('')} aria-label={tx('امسح البحث', 'Clear search')} className="absolute top-1/2 end-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-subtle hover:bg-surface-2 hover:text-fg"><X className="size-4" aria-hidden="true" /></button>}
    </form>
  );

  return (
    <header className="glass sticky top-0 z-30 border-b border-border">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <a href={go('')} className="flex shrink-0 items-center gap-2" aria-label={t.brand}>
          <img src="/lak-mark.png" alt="" className="h-8 w-auto" />
          <span className="text-[17px] font-bold tracking-tight text-fg">{t.brand}</span>
        </a>
        <div className="hidden flex-1 md:flex md:max-w-xl md:ps-4">{search}</div>
        <label className="relative ms-auto hidden h-10 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium text-fg hover:border-brand-300 sm:inline-flex md:ms-0">
          <MapPin className="size-4 text-brand-600 dark:text-brand-300" aria-hidden="true" />
          <span className="text-muted">{t.deliverTo}</span><span>{t.cities[city]}</span>
          <select aria-label={t.deliverTo} value={city} onChange={(e) => changeCity(e.target.value as CityId)} className="absolute inset-0 cursor-pointer opacity-0">
            {CITIES.map((c) => <option key={c} value={c}>{t.cities[c]}</option>)}
          </select>
        </label>
        <nav aria-label={t.navLabel} className="ms-auto hidden items-center gap-1 lg:flex md:ms-0">
          {NAV.slice(2).map(({ id, path, Icon }) => (
            <a key={id} href={go(path)} aria-current={tab === id ? 'page' : undefined}
              className={cn('relative inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors', tab === id ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
              <Icon className="size-[18px]" aria-hidden="true" />{t.nav[id]}
              {id === 'alerts' && counts.alerts > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white tabular-nums">{counts.alerts}</span>}
            </a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-0.5 sm:ms-0">
          <IconButton label={lang === 'ar' ? 'English' : 'العربية'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages className="size-5" aria-hidden="true" /></IconButton>
          <IconButton label={dark ? tx('الوضع الفاتح', 'Light mode') : tx('الوضع الداكن', 'Dark mode')} onClick={() => setDark((d) => !d)}>{dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}</IconButton>
          <a href={go('/cart')} aria-label={`${t.nav.cart}${counts.cart ? ` · ${counts.cart}` : ''}`} aria-current={tab === 'cart' ? 'page' : undefined}
            className={cn('relative hidden size-10 place-items-center rounded-xl transition-colors sm:grid', tab === 'cart' ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
            <ShoppingBag className="size-5" aria-hidden="true" />
            {counts.cart > 0 && <span className="absolute -top-0.5 -end-0.5 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white tabular-nums">{counts.cart}</span>}
          </a>
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 pb-3 md:hidden">
        {search}
        <label className="relative inline-flex h-11 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-[13px] font-medium text-fg sm:hidden">
          <MapPin className="size-4 text-brand-600 dark:text-brand-300" aria-hidden="true" /><span>{t.cities[city]}</span>
          <select aria-label={t.deliverTo} value={city} onChange={(e) => changeCity(e.target.value as CityId)} className="absolute inset-0 cursor-pointer opacity-0">
            {CITIES.map((c) => <option key={c} value={c}>{t.cities[c]}</option>)}
          </select>
        </label>
      </div>
    </header>
  );
}

function TabBar({ tab }: { tab: string }) {
  const { t, go } = useMk();
  const counts = useCounts();
  return (
    <nav aria-label={t.navLabel} className="glass fixed inset-x-0 bottom-0 z-30 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.map(({ id, path, Icon }) => {
          const n = id === 'cart' ? counts.cart : id === 'alerts' ? counts.alerts : 0;
          const on = tab === id;
          return (
            <li key={id}>
              <a href={go(path)} aria-current={on ? 'page' : undefined} className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', on ? 'text-brand-700 dark:text-brand-300' : 'text-muted')}>
                <span className="relative"><Icon className="size-[22px]" strokeWidth={on ? 2.25 : 1.75} aria-hidden="true" />
                  {n > 0 && <span className="absolute -top-1.5 -end-2.5 grid min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white tabular-nums">{n}</span>}</span>
                {t.nav[id]}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Footer() {
  const { t } = useMk();
  const tx = useTx();
  const review = useReviewMode();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 pb-24 text-xs text-muted sm:px-6 lg:px-8 lg:pb-6">
        <span className="font-semibold text-fg">{t.brand}</span>
        <span className="min-w-0 flex-1 basis-64">{t.demo}</span>
        <a href={link('/dashboard/channel')} className="font-medium hover:text-fg">{tx('للتجار: اعرض منتجاتك في السوق', 'For merchants: list your products')}</a>
        <a href="/products/credits.html" target="_blank" rel="noopener" className="font-medium hover:text-fg">{tx('حقوق الصور', 'Image credits')}</a>
        {review && <a href={link('/')} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline dark:text-brand-300"><LayoutGrid className="size-3.5" aria-hidden="true" />{tx('كل الواجهات', 'All surfaces')}</a>}
      </div>
    </footer>
  );
}

/** Review mode only: force screen states and simulate a declined card. Never shown in the product view. */
function ReviewBar() {
  const tx = useTx();
  const on = useReviewMode();
  const fx = reviewFx.use();
  if (!on) return null;
  return (
    <div className="fixed bottom-20 start-3 z-40 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-2 shadow-pop lg:bottom-4" role="region" aria-label={tx('وضع المراجعة', 'Review mode')}>
      <span className="px-1 text-xs font-semibold text-muted">{tx('مراجعة', 'Review')}</span>
      <Segmented label={tx('حالة الشاشة', 'Screen state')} value={fx.state} onChange={(s: ScreenState) => reviewFx.set((x) => ({ ...x, state: s }))}
        options={[{ value: 'live', label: tx('بيانات', 'Data') }, { value: 'loading', label: tx('تحميل', 'Loading') }, { value: 'empty', label: tx('فارغ', 'Empty') }, { value: 'error', label: tx('خطأ', 'Error') }]} />
      <span className="inline-flex items-center gap-2 px-1 text-xs text-muted"><Switch label={tx('رفض البطاقة', 'Decline card')} checked={fx.declineCard} onChange={(v) => reviewFx.set((x) => ({ ...x, declineCard: v }))} />{tx('رفض البطاقة', 'Decline card')}</span>
      <a href={link('/')} className="px-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('كل الواجهات', 'Hub')}</a>
      <a href={link('/market', { review: '0' })} className="px-1 text-xs font-semibold text-muted hover:underline">{tx('إنهاء', 'Exit')}</a>
    </div>
  );
}
