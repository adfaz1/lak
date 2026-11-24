// Shared view parts for the Products and Inventory sections (both import from here).
// New shared components (not in src/ds): Stepper, NoAccess, ReviewTools, useLeaveGuard, LeaveModal.
import { discardUnsaved, useUnsaved } from '../unsaved';
import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Lock, FlaskConical, FolderTree, LayoutGrid, Layers, BadgeCheck, SlidersHorizontal, CalendarClock, ShieldCheck } from 'lucide-react';
import { link, navigate } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { ROLES, type Role } from '../../merchant/perms';
import { testStore } from '../../merchant/stores';
import type { Channel } from '../../merchant/domain';
import type { ProductStatus } from '../../merchant/catalog';
import { Badge, Button, Card, EmptyState, cn, useTx, type Tone } from '../../../ds/ui';
import { Modal, Select } from '../../../ds/kit';

/** Links inside the two sections built here (the shared `sectionHref` still points to the previous workspace until they are listed in BUILT). */
export const phref = (path = '', q?: Record<string, string | undefined>) => link(`/dashboard/products${path ? `/${path}` : ''}`, q);
export const ihref = (path = '', q?: Record<string, string | undefined>) => link(`/dashboard/inventory${path ? `/${path}` : ''}`, q);

export const STATUS_TONE: Record<ProductStatus, Tone> = { active: 'green', draft: 'gray', archived: 'amber' };
export function useNames() {
  const tx = useTx();
  return {
    status: (s: ProductStatus) => ({ active: tx('نشط', 'Active'), draft: tx('مسودة', 'Draft'), archived: tx('مؤرشف', 'Archived') })[s],
    channel: (c: Channel) => ({ online: tx('المتجر الإلكتروني', 'Online store'), market: tx('سوق لك', 'LAK marketplace'), app: tx('تطبيق المتجر', 'Store app') })[c],
    channelShort: (c: Channel) => ({ online: tx('المتجر', 'Store'), market: tx('السوق', 'Market'), app: tx('التطبيق', 'App') })[c],
  };
}

export function useRole(): Role { return testStore.use().role; }

/** Page shown when the current role cannot open a section or a sub-page. No data is rendered. */
export function NoAccess({ title, children, back }: { title: string; children: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="space-y-6">
    <Card>
      <EmptyState as="h1" icon={<Lock className="size-6" aria-hidden="true" />} title={title}
        action={back && <a href={back.href} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{back.label}</a>}>
        {children}
      </EmptyState>
    </Card>
    <ReviewTools />
    </div>
  );
}

/** Horizontal steps; collapses to "Step n of m · name" on phones. */
export function Stepper({ steps, current, label, tone }: { steps: string[]; current: number; label: string; tone?: 'warn' }) {
  const tx = useTx();
  return (
    <nav aria-label={label}>
      <p className="text-sm font-semibold text-fg sm:hidden">{tx(`الخطوة ${current + 1} من ${steps.length}`, `Step ${current + 1} of ${steps.length}`)} · {steps[current]}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2 sm:hidden"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${((current + 1) * 100) / steps.length}%` }} /></div>
      <ol className="hidden items-center gap-2 sm:flex">
        {steps.map((s, i) => {
          const done = i < current, on = i === current;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-2" aria-current={on ? 'step' : undefined}>
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums',
                done ? 'bg-brand-600 text-white' : on ? (tone === 'warn' ? 'bg-amber-500/15 text-amber-700 ring-2 ring-amber-500/40 dark:text-amber-300' : 'bg-brand-500/10 text-brand-700 ring-2 ring-brand-500/40 dark:text-brand-300') : 'bg-surface-2 text-subtle')}>
                {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn('truncate text-[13px] font-medium', on ? 'text-fg' : done ? 'text-muted' : 'text-subtle')}>{s}</span>
              {i < steps.length - 1 && <span className={cn('h-px min-w-3 flex-1', done ? 'bg-brand-500/50' : 'bg-border')} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Review-mode only: role switch plus page-specific simulation switches. Never rendered in the product view. */
export function ReviewTools({ children }: { children?: ReactNode }) {
  const tx = useTx();
  const review = useReviewMode();
  const role = useRole();
  if (!review) return null;
  const roleName: Record<Role, string> = { owner: tx('المالك', 'Owner'), fulfilment: tx('التجهيز', 'Fulfilment'), finance: tx('المالية', 'Finance'), marketing: tx('التسويق', 'Marketing') };
  return (
    <section aria-label={tx('أدوات المراجعة', 'Review tools')} className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-4 py-3 text-[13px]">
      <span className="flex items-center gap-1.5 font-semibold text-muted"><FlaskConical className="size-4" aria-hidden="true" />{tx('أدوات المراجعة', 'Review tools')}</span>
      <label className="flex items-center gap-2 text-muted">{tx('الدور', 'Role')}
        <Select className="h-9 w-auto" value={role} onChange={(e) => testStore.set((s) => ({ ...s, role: e.target.value as Role }))}>
          {ROLES.map((r) => <option key={r} value={r}>{roleName[r]}</option>)}
        </Select>
      </label>
      {children}
    </section>
  );
}

/** Block in-app link navigation and reload/close while there are unsaved edits. */
export function useLeaveGuard(dirty: boolean, onBlocked: (href: string) => void) {
  // Search, Back and other non-link navigation are caught by the dashboard-wide guard.
  useUnsaved(dirty, { ar: 'تعديلات المنتج', en: 'Product edits' });
  const cb = useRef(onBlocked);
  cb.current = onBlocked;
  useEffect(() => {
    if (!dirty) return;
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      const href = a?.getAttribute('href');
      if (!a || !href || !href.startsWith('#/') || a.hasAttribute('data-leave-ok') || e.defaultPrevented || a.target === '_blank') return;
      e.preventDefault();
      cb.current(href);
    };
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('click', click, true);
    window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('click', click, true); window.removeEventListener('beforeunload', unload); };
  }, [dirty]);
}

export function LeaveModal({ to, onStay, onKeep, onDiscard }: { to: string; onStay: () => void; onKeep: () => void; onDiscard: () => void }) {
  const tx = useTx();
  const go = (f: () => void) => { f(); discardUnsaved(); setTimeout(() => navigate(to), 0); };
  return (
    <Modal title={tx('مغادرة دون حفظ؟', 'Leave without saving?')} onClose={onStay}
      description={tx('تعديلاتك لم تصل إلى الخادم بعد.', 'Your edits have not reached the server.')}
      footer={<>
        <Button variant="ghost" onClick={() => go(onDiscard)}>{tx('تجاهل وغادر', 'Discard and leave')}</Button>
        <Button variant="secondary" onClick={() => go(onKeep)}>{tx('احتفظ بالمسودة وغادر', 'Keep draft and leave')}</Button>
        <Button onClick={onStay}>{tx('ابقَ وأكمل', 'Stay')}</Button>
      </>}>
      <p className="text-sm text-muted">{tx('المسودة تبقى في هذه الجلسة فقط وتُستعاد عند عودتك.', 'A kept draft stays in this session only and is restored when you return.')}</p>
    </Modal>
  );
}

export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const roleBadge = (tx: (a: string, e: string) => string) => <Badge tone="gray" icon={<Lock className="size-3" aria-hidden="true" />}>{tx('للقراءة فقط', 'Read-only')}</Badge>;

/** Sub-navigation of the catalogue: products, categories, collections. */
export function CatalogNav() {
  const tx = useTx();
  const here = location.hash.split('?')[0];
  const items = [
    { href: phref(), label: tx('المنتجات', 'Products'), icon: LayoutGrid, on: here === '#/dashboard/products' },
    { href: phref('categories'), label: tx('الفئات', 'Categories'), icon: FolderTree, on: here.startsWith('#/dashboard/products/categories') },
    { href: phref('collections'), label: tx('المجموعات', 'Collections'), icon: Layers, on: here.startsWith('#/dashboard/products/collections') },
    { href: phref('brands'), label: tx('العلامات التجارية', 'Brands'), icon: BadgeCheck, on: here.startsWith('#/dashboard/products/brands') },
    { href: phref('options'), label: tx('الحقول والمقاسات والمرشحات', 'Fields, sizes & filters'), icon: SlidersHorizontal, on: here.startsWith('#/dashboard/products/options') },
    { href: phref('preorders'), label: tx('الطلب المسبق', 'Pre-orders'), icon: CalendarClock, on: here.startsWith('#/dashboard/products/preorders') },
    { href: phref('restrictions'), label: tx('قيود الشراء', 'Purchase limits'), icon: ShieldCheck, on: here.startsWith('#/dashboard/products/restrictions') },
  ];
  return (
    <nav aria-label={tx('أقسام الكتالوج', 'Catalogue sections')} className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
      {items.map((i) => (
        <a key={i.href} href={i.href} aria-current={i.on ? 'page' : undefined}
          className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors', i.on ? 'bg-fg text-bg' : 'bg-surface text-muted ring-1 ring-border hover:text-fg')}>
          <i.icon className="size-4" aria-hidden="true" />{i.label}
        </a>
      ))}
    </nav>
  );
}


/** "No products" / "1 product" / "2 products" with Arabic number agreement (منتج واحد، منتجان، 3 منتجات، 11 منتجًا). */
export function productCount(tx: (a: string, e: string) => string, n: number): string {
  const ar = n === 0 ? 'لا منتجات' : n === 1 ? 'منتج واحد' : n === 2 ? 'منتجان' : n <= 10 ? `${n} منتجات` : `${n} منتجًا`;
  return tx(ar, n === 1 ? '1 product' : `${n} products`);
}
