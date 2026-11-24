// LAK operations console shell: navigation by role, top bar (search, language, theme, role), supported-access banner.
// Modelled on the merchant dashboard shell, marked "Operations" so it is never mistaken for a merchant's workspace.
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  LayoutDashboard, FileCheck2, Store, Layers, Wallet, Truck, Blocks, Activity, FileBarChart, Megaphone, ScrollText,
  Search, Menu, X, Moon, Sun, Languages, ChevronsLeft, ChevronsRight, ShieldCheck, ArrowRight, UserCog, Timer,
} from 'lucide-react';
import { useLang, type L } from '../../core/lang';
import { link, navigate } from '../../core/router';
import { useReviewMode } from '../../core/review';
import { cn, IconButton, InfoHint, useTx } from '../../ds/ui';
import { buttonClass } from '../../ds/ui';
import { can, isLive, remainingMs, ROLES, SECTION_PERM, SERVICES, serviceStatus, type RoleId, type Section } from './domain';
import { ROLE_DESC, ROLE_LABEL, ROLE_PERSON, SECTION_LABEL } from './i18n';
import { mmss, searchAll, type SearchHit } from './model';
import {
  accessStore, changesStore, contentStore, deliveriesStore, disputesStore, endAccess, kycStore, ledgerStore, roleStore, storesStore, switchRole,
} from './state';
import { sectionHref, useFmt } from './ui';

type Item = { key: Section; icon: ComponentType<{ className?: string }>; count?: number };
const GROUPS: { label: L; items: Section[] }[] = [
  { label: { ar: 'المنصة', en: 'Platform' }, items: ['overview'] },
  { label: { ar: 'التجار', en: 'Merchants' }, items: ['kyc', 'stores'] },
  { label: { ar: 'المال', en: 'Money' }, items: ['plans', 'payments'] },
  { label: { ar: 'التشغيل', en: 'Operations' }, items: ['shipping', 'content', 'health'] },
  { label: { ar: 'التقارير والتواصل', en: 'Reports & comms' }, items: ['reports', 'announcements', 'audit'] },
];
const ICON: Record<Section, ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard, kyc: FileCheck2, stores: Store, plans: Layers, payments: Wallet, shipping: Truck,
  content: Blocks, health: Activity, reports: FileBarChart, announcements: Megaphone, audit: ScrollText,
};

function readPref(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function writePref(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* preference only */ } }

export function Shell({ active, children }: { active: Section | null; children: ReactNode }) {
  const { lang, setLang } = useLang();
  const tx = useTx();
  const review = useReviewMode();
  const role = roleStore.use();
  const [collapsed, setCollapsed] = useState(() => readPref('lak.adminNav', '0') === '1');
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(() => readPref('lak.theme', 'light') === 'dark');
  useEffect(() => { writePref('lak.theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { setMobile(false); }, [active]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobile(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Counts are only computed for sections this role can open.
  const kyc = kycStore.use(); const changes = changesStore.use(); const disputes = disputesStore.use(); const deliveries = deliveriesStore.use(); const content = contentStore.use();
  const counts: Partial<Record<Section, number>> = {
    kyc: kyc.filter((a) => a.status === 'pending').length,
    plans: changes.filter((c) => c.status === 'pending').length,
    payments: disputes.filter((d) => d.state === 'open').length,
    shipping: deliveries.filter((d) => d.state === 'failed').length,
    content: content.filter((c) => c.state === 'review').length,
    health: SERVICES.filter((s) => serviceStatus(s) === 'down').length,
  };
  const groups = GROUPS.map((g) => ({ label: g.label, items: g.items.filter((s) => can(role, SECTION_PERM[s])).map((s): Item => ({ key: s, icon: ICON[s], count: counts[s] })) })).filter((g) => g.items.length);
  const Collapse = lang === 'ar' ? (collapsed ? ChevronsLeft : ChevronsRight) : (collapsed ? ChevronsRight : ChevronsLeft);

  const navLink = (i: Item, compact: boolean) => {
    const on = i.key === active;
    const Icon = i.icon;
    return (
      <li key={i.key}>
        <a href={sectionHref(i.key)} aria-current={on ? 'page' : undefined} title={compact ? SECTION_LABEL[i.key][lang] : undefined}
          className={cn('relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
            on ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-surface-2 hover:text-fg', compact && 'justify-center px-0')}>
          {on && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-brand-600" aria-hidden="true" />}
          <Icon className="size-[18px] shrink-0" aria-hidden="true" />
          {!compact && <span className="min-w-0 flex-1 truncate">{SECTION_LABEL[i.key][lang]}</span>}
          {!compact && !!i.count && <span className="grid min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white tabular-nums" aria-label={tx(`${i.count} بانتظار`, `${i.count} waiting`)}>{i.count}</span>}
          {compact && !!i.count && <span className="absolute top-1.5 end-2 size-2 rounded-full bg-brand-600" aria-hidden="true" />}
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
            <p className="flex items-center gap-2 text-sm font-semibold text-fg"><bdi>LAK</bdi><span className="rounded-md bg-fg px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-bg">{tx('العمليات', 'Operations')}</span></p>
            <p className="truncate text-xs text-muted">{tx('داخلي · لا يراه التجار', 'Internal · not visible to merchants')}</p>
          </div>
        )}
      </div>
      <nav aria-label={tx('أقسام إدارة المنصة', 'Platform admin sections')} className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.label.en}>
            {!compact && <p className="mb-2 px-3 text-[11px] font-semibold tracking-wide text-subtle">{g.label[lang]}</p>}
            <ul className="space-y-0.5">{g.items.map((i) => navLink(i, compact))}</ul>
          </div>
        ))}
      </nav>
      {!compact && (
        <p className="flex items-center gap-1.5 border-t border-border px-5 py-3 text-xs text-muted">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />{tx('دخول بعاملين', 'Two-factor sign-in')}
          <InfoHint>{tx('الدخول بعاملين وفرض الصلاحيات يتمّان على الخادم. هذه النسخة لا تحاكي الدخول، وإخفاء الشاشات هنا ليس نظام صلاحيات.', 'Two-factor sign-in and permission enforcement happen on the server. This build does not simulate sign-in, and hiding screens here is not a permission system.')}</InfoHint>
        </p>
      )}
    </>
  );

  return (
    <div className={cn('lak', dark && 'dark')} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <a href="#adm-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">{tx('تخطَّ إلى المحتوى', 'Skip to content')}</a>
      <div className="flex min-h-screen bg-bg">
        <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-e border-border bg-surface transition-[width] duration-200 lg:flex', collapsed ? 'w-[76px]' : 'w-64')}>
          {nav(collapsed)}
          <button type="button" onClick={() => { setCollapsed((c) => !c); writePref('lak.adminNav', collapsed ? '0' : '1'); }}
            className="flex h-11 items-center justify-center gap-2 border-t border-border text-xs font-medium text-muted hover:text-fg" aria-label={collapsed ? tx('توسيع القائمة', 'Expand menu') : tx('طيّ القائمة', 'Collapse menu')}>
            <Collapse className="size-4" aria-hidden="true" />{!collapsed && tx('طيّ', 'Collapse')}
          </button>
        </aside>

        {mobile && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={tx('القائمة', 'Menu')}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobile(false)} aria-hidden="true" />
            <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-pop">
              <IconButton label={tx('إغلاق القائمة', 'Close menu')} onClick={() => setMobile(false)} className="absolute top-3 end-3"><X className="size-5" aria-hidden="true" /></IconButton>
              {nav(false)}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-30 flex h-16 items-center gap-1.5 border-b border-border px-3 sm:gap-2 sm:px-6">
            <IconButton label={tx('فتح القائمة', 'Open menu')} onClick={() => setMobile(true)} className="shrink-0 lg:hidden"><Menu className="size-5" aria-hidden="true" /></IconButton>
            <GlobalSearch role={role} />
            <div className="ms-auto flex shrink-0 items-center gap-1">
              <span className="me-1 hidden rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-800 xl:inline dark:text-amber-300" title={tx('كل البيانات أمثلة اختبار. لا إجراء هنا يصل إلى تاجر حقيقي.', 'All data are test examples. No action here reaches a real merchant.')}>{tx('بيئة محاكاة', 'Simulation')}</span>
              {review && <a href={link('/')} className="hidden items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:underline md:inline-flex dark:text-brand-300"><ArrowRight className="size-3.5 ltr:rotate-180" aria-hidden="true" />{tx('المعاينة', 'Preview hub')}</a>}
              <IconButton label={lang === 'ar' ? 'English' : 'العربية'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages className="size-5" aria-hidden="true" /></IconButton>
              <IconButton label={dark ? tx('الوضع الفاتح', 'Light mode') : tx('الوضع الداكن', 'Dark mode')} onClick={() => setDark((d) => !d)}>{dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}</IconButton>
              <RoleSwitch role={role} />
            </div>
          </header>
          <AccessBanner />
          <main id="adm-main" className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          <footer className="mx-auto w-full max-w-[1320px] px-4 pb-20 text-xs text-subtle sm:px-6 lg:px-8">
            {tx('لوحة تشغيل داخلية ببيانات اختبار. الإجراءات تُسجَّل في سجل هذه الجلسة فقط ولا تصل إلى المنصة الحية.', 'Internal operations console with test data. Actions are logged for this session only and never reach the live platform.')}
          </footer>
        </div>
      </div>
    </div>
  );
}

/** Role switcher: changes the viewing role of the prototype; the switch itself is logged. */
function RoleSwitch({ role }: { role: RoleId }) {
  const tx = useTx();
  const { lang } = useLang();
  return (
    <label className={cn(buttonClass('secondary', 'md'), 'relative ms-1 gap-2 px-2 sm:px-3')} title={ROLE_DESC[role][lang]}>
      <span className="grid size-7 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white" aria-hidden="true">{ROLE_PERSON[role][lang].slice(0, 1)}</span>
      <span className="hidden max-w-36 truncate text-[13px] sm:inline">{ROLE_LABEL[role][lang]}</span>
      <UserCog className="hidden size-4 text-muted sm:block" aria-hidden="true" />
      <select aria-label={tx('العرض بدور', 'Viewing as role')} value={role} onChange={(e) => switchRole(e.target.value as RoleId)} className="absolute inset-0 cursor-pointer opacity-0">
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_PERSON[r][lang]}</option>)}
      </select>
    </label>
  );
}

const KIND: Record<SearchHit['kind'], L> = { store: { ar: 'متجر', en: 'Store' }, application: { ar: 'طلب تاجر', en: 'Application' }, dispute: { ar: 'نزاع', en: 'Dispute' }, transaction: { ar: 'عملية', en: 'Transaction' } };

function GlobalSearch({ role }: { role: RoleId }) {
  const tx = useTx();
  const { lang } = useLang();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const stores = storesStore.use(); const apps = kycStore.use(); const disputes = disputesStore.use(); const ledger = ledgerStore.use();
  const hits = useMemo(() => searchAll(role, q, { stores, apps, disputes, ledger }), [role, q, stores, apps, disputes, ledger]);
  useEffect(() => { setCur(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);
  const go = (h: SearchHit) => { setOpen(false); setQ(''); navigate(sectionHref(h.section, h.path, h.query)); };
  const show = open && q.trim().length >= 2;
  return (
    <div ref={box} className="relative min-w-0 flex-1 sm:max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input type="search" value={q} role="combobox" aria-expanded={show} aria-controls="adm-search-list" aria-autocomplete="list"
        aria-label={tx('ابحث في المتاجر والطلبات والعمليات', 'Search stores, applications, transactions')}
        placeholder={tx('ابحث عن متجر أو طلب أو عملية', 'Search stores, applications, transactions')}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(c + 1, hits.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(c - 1, 0)); }
          if (e.key === 'Enter' && hits[cur]) go(hits[cur]);
        }}
        className="h-10 w-full rounded-xl border border-border bg-surface-2/60 ps-9 pe-3 text-sm text-fg placeholder:text-subtle transition-colors hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
      {show && (
        <div id="adm-search-list" role="listbox" aria-label={tx('نتائج البحث', 'Search results')} className="absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-pop sm:min-w-[22rem]">
          {hits.length === 0 ? <p className="px-3 py-3 text-sm text-muted">{tx('لا نتائج ضمن الأقسام المتاحة لدورك', 'No results in the sections your role can open')}</p>
            : hits.map((h, i) => (
              <button key={`${h.kind}-${h.id}`} type="button" role="option" aria-selected={i === cur} onMouseEnter={() => setCur(i)} onClick={() => go(h)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start', i === cur ? 'bg-surface-2' : '')}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-fg">{h.label[lang]}</span><span className="block truncate text-xs text-muted">{h.sub[lang]} · <bdi dir="ltr">{h.id}</bdi></span></span>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">{KIND[h.kind][lang]}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** Persistent while a supported-access session is open, on every screen, with a countdown and an end button. */
function AccessBanner() {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const sessions = accessStore.use();
  const stores = storesStore.use();
  const [, tick] = useState(0);
  const now = Date.now();
  const live = sessions.find((s) => isLive(s, now)) ?? null;
  const expired = sessions.find((s) => !s.endedAt && !isLive(s, now));
  useEffect(() => {
    if (!sessions.some((s) => !s.endedAt)) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [sessions]);
  useEffect(() => { if (expired) endAccess(expired.id, 'expired'); }, [expired]);
  if (!live) return null;
  const store = stores.find((s) => s.id === live.storeId);
  return (
    <div role="region" aria-label={tx('جلسة وصول مفوّض نشطة', 'Supported access active')}
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 text-sm sm:px-6', live.mode === 'write' ? 'border-red-500/30 bg-red-500/8 text-red-900 dark:text-red-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200')}>
      <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{tx('وصول مفوّض', 'Supported access')} · {live.mode === 'read' ? tx('قراءة فقط', 'Read-only') : tx('قراءة وكتابة', 'Read & write')}</span>
        <span className="opacity-90"> — {store?.name[lang] ?? live.storeId} · {tx('بدأت', 'started')} {f.dt(live.startedAt)}</span>
      </p>
      <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums" aria-label={tx(`المتبقي ${mmss(remainingMs(live, now))}`, `Time left ${mmss(remainingMs(live, now))}`)}><Timer className="size-4" aria-hidden="true" /><bdi dir="ltr">{mmss(remainingMs(live, now))}</bdi></span>
      <a href={sectionHref('stores', live.storeId)} className={buttonClass('secondary', 'sm')}>{tx('افتح المتجر', 'Open store')}</a>
      <button type="button" className={buttonClass('primary', 'sm')} onClick={() => endAccess(live.id, 'ended')}>{tx('أنهِ الجلسة', 'End session')}</button>
    </div>
  );
}
