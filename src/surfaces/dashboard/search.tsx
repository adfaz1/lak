// Global search dialog: one box for orders, products, customers, settings and tools.
// Opens from the top bar, Ctrl/Cmd+K or "/". Results are grouped; arrows move, Enter opens, Esc closes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock, CornerDownLeft, Package, Search, ShoppingBag, SlidersHorizontal, User, X } from 'lucide-react';
import { useLang } from '../../core/lang';
import { navigate } from '../../core/router';
import { ordersStore, productsStore, testStore } from '../merchant/stores';
import { customerFixtures } from '../merchant/workspace';
import { canSee, type Page } from '../merchant/perms';
import { cn, useTx } from '../../ds/ui';
import { globalSearch, seeAllPath, type Hit, type HitKind } from './model/search';
import { dhref } from './shell';
import { pushRecentSearch, recentSearches, pushRecentTool } from './prefs';

const CUSTOMERS = customerFixtures();
const ICON: Record<HitKind, typeof Search> = { order: ShoppingBag, product: Package, customer: User, tool: SlidersHorizontal };
const GROUP: Record<HitKind, { ar: string; en: string }> = {
  tool: { ar: 'الأدوات والإعدادات', en: 'Tools & settings' }, order: { ar: 'الطلبات', en: 'Orders' },
  product: { ar: 'المنتجات', en: 'Products' }, customer: { ar: 'العملاء', en: 'Customers' },
};

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useLang();
  const tx = useTx();
  const orders = ordersStore.use();
  const products = productsStore.use();
  const role = testStore.use().role;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    setQ(''); setActive(0);
    requestAnimationFrame(() => input.current?.focus());
    return () => back.current?.focus?.();
  }, [open]);

  const result = useMemo(() => globalSearch(q, { orders, products, customers: CUSTOMERS, role, canSee: (s) => canSee(role, s as Page) }), [q, orders, products, role]);
  const flat = result.groups.flatMap((g) => g.hits);
  useEffect(() => setActive(0), [q]);

  if (!open) return null;
  const go = (h: Hit) => {
    if (q.trim()) pushRecentSearch(q.trim());
    if (h.kind === 'tool') pushRecentTool(h.id);
    onClose();
    navigate(dhref(h.path, h.query));
  };
  const seeAll = (kind: HitKind) => { const s = seeAllPath(kind, q.trim()); if (!s) return; pushRecentSearch(q.trim()); onClose(); navigate(dhref(s.path, s.query)); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active]); }
  };
  const recents = recentSearches();
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  let idx = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label={tx('البحث الشامل', 'Search everything')} onKeyDown={onKey}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div className="relative flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-5 shrink-0 text-subtle" aria-hidden="true" />
          <input ref={input} type="text" enterKeyHint="search" autoComplete="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} role="combobox" aria-expanded={flat.length > 0} aria-controls="gs-results"
            aria-activedescendant={flat[active] ? `gs-${active}` : undefined} aria-label={tx('ابحث في الطلبات والمنتجات والعملاء والإعدادات', 'Search orders, products, customers and settings')}
            placeholder={tx('رقم طلب، منتج، SKU، عميل، جوال، أو إعداد…', 'Order number, product, SKU, customer, phone or setting…')}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle" />
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label={tx('إغلاق', 'Close')}><X className="size-4" aria-hidden="true" /></button>
        </div>

        <div id="gs-results" role="listbox" className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {!q.trim() && (
            <div className="p-3">
              {recents.length > 0 ? (
                <>
                  <p className="mb-2 px-1 text-xs font-semibold text-subtle">{tx('عمليات بحث سابقة', 'Recent searches')}</p>
                  <div className="flex flex-wrap gap-2">
                    {recents.map((r) => <button key={r} type="button" onClick={() => setQ(r)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted hover:border-brand-300 hover:text-fg"><Clock className="size-3.5" aria-hidden="true" />{r}</button>)}
                  </div>
                </>
              ) : <p className="px-1 text-sm text-muted">{tx('اكتب رقم طلب أو اسم منتج أو عميل أو إعداد. الأرقام العربية تعمل أيضًا.', 'Type an order number, a product, a customer or a setting. Arabic digits work too.')}</p>}
            </div>
          )}

          {q.trim() && result.total === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="font-semibold text-fg">{tx(`لا نتائج لـ «${q.trim()}»`, `No results for “${q.trim()}”`)}</p>
              <p className="mt-1 text-sm text-muted">{tx('جرّب رقم الطلب كاملًا أو جزءًا من اسم المنتج أو آخر أربعة أرقام من الجوال.', 'Try the full order number, part of a product name, or the last four digits of a phone.')}</p>
            </div>
          )}

          {result.groups.map((g) => (
            <section key={g.kind} aria-label={GROUP[g.kind][lang]} className="mb-1">
              <div className="flex items-center justify-between px-3 pb-1 pt-3">
                <h3 className="text-xs font-semibold text-subtle">{GROUP[g.kind][lang]}</h3>
                {g.more > 0 && seeAllPath(g.kind, q) && (
                  <button type="button" onClick={() => seeAll(g.kind)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                    {tx(`عرض الكل (+${g.more})`, `See all (+${g.more})`)}<Arrow className="size-3" aria-hidden="true" />
                  </button>
                )}
              </div>
              <ul>
                {g.hits.map((h) => {
                  idx += 1; const i = idx; const Icon = ICON[h.kind];
                  return (
                    <li key={`${h.kind}-${h.id}`} id={`gs-${i}`} role="option" aria-selected={i === active}>
                      <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                        className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start', i === active ? 'bg-brand-500/10' : 'hover:bg-surface-2')}>
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"><Icon className="size-4" aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">{h.title[lang]}</span>
                          <span className="block truncate text-xs text-muted">{h.sub[lang]}</span>
                        </span>
                        {i === active && <CornerDownLeft className="size-4 shrink-0 text-subtle" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="hidden items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-subtle sm:flex">
          <span><kbd className="rounded border border-border px-1.5 font-sans">↑↓</kbd> {tx('للتنقل', 'to move')}</span>
          <span><kbd className="rounded border border-border px-1.5 font-sans">Enter</kbd> {tx('للفتح', 'to open')}</span>
          <span><kbd className="rounded border border-border px-1.5 font-sans">Esc</kbd> {tx('للإغلاق', 'to close')}</span>
        </div>
      </div>
    </div>
  );
}
