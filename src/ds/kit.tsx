// LAK component library, part 2: page structure, forms, tables, overlays and feedback.
// Same rules as ui.tsx: screens compose these and never restyle them locally.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Search, X, AlertCircle, CheckCircle2, Info, Filter } from 'lucide-react';
import { useLang } from '../core/lang';
import { Button, cn, useTx } from './ui';

/* ---------- Page structure ---------- */

/** Page title row: optional back link, title, one-line description, actions. One primary action per page. */
export function PageHeader({ title, description, back, actions, meta }: { title: ReactNode; description?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="space-y-2">
      {back && <a href={back.href} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"><ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />{back.label}</a>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Underline tabs bound to links (so the selection lives in the URL). */
export function Tabs({ items, label }: { items: { href: string; label: ReactNode; current: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="scrollbar-thin -mb-px flex gap-1 overflow-x-auto border-b border-border">
      {items.map((t) => (
        <a key={t.href} href={t.href} aria-current={t.current ? 'page' : undefined}
          className={cn('relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold transition-colors', t.current ? 'text-fg' : 'text-muted hover:text-fg')}>
          {t.label}
          {t.count !== undefined && <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', t.current ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'bg-surface-2 text-muted')}>{t.count}</span>}
          {t.current && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" aria-hidden="true" />}
        </a>
      ))}
    </nav>
  );
}

/* ---------- Forms ---------- */

const control = 'h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-colors hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/15';
export const inputClass = control;

/** Label above the control; help only on demand; error linked to the control for screen readers. */
export function Field({ label, error, hint, children, id, optional, className }: { label: ReactNode; error?: string | null; hint?: ReactNode; children: (p: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode; id?: string; optional?: boolean; className?: string }) {
  const tx = useTx();
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={fid} className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">{label}{optional && <span className="font-normal text-subtle">{tx('(اختياري)', '(optional)')}</span>}</label>
      {children({ id: fid, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${fid}-e` : hint ? `${fid}-h` : undefined })}
      {error ? <p id={`${fid}-e`} className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400"><AlertCircle className="size-3.5" aria-hidden="true" />{error}</p>
        : hint ? <p id={`${fid}-h`} className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
export function Input({ className, ...p }: ComponentPropsWithoutRef<'input'>) { return <input className={cn(control, className)} {...p} />; }
export function Textarea({ className, ...p }: ComponentPropsWithoutRef<'textarea'>) { return <textarea className={cn(control, 'h-auto min-h-24 py-2.5 leading-relaxed', className)} {...p} />; }
export function Select({ className, children, ...p }: ComponentPropsWithoutRef<'select'>) { return <select className={cn(control, 'pe-8', className)} {...p}>{children}</select>; }
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-border')}>
      <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'start-[22px]' : 'start-0.5')} />
    </button>
  );
}
export function Checkbox({ checked, onChange, label, indeterminate }: { checked: boolean; onChange: (v: boolean) => void; label: string; indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-[18px] cursor-pointer rounded accent-brand-600" />;
}

/* ---------- Toolbar, table, pagination ---------- */

export function SearchInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus} className={cn(control, 'ps-9')} />
    </div>
  );
}
/** A filter chip opening a small menu of options; value lives in the URL via the caller. */
export function FilterChip({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const tx = useTx();
  const active = value !== '' && value !== 'all';
  return (
    <label className={cn('relative inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium transition-colors', active ? 'border-brand-300 bg-brand-500/5 text-brand-700 dark:text-brand-300' : 'border-border bg-surface text-muted hover:text-fg')}>
      <Filter className="size-3.5" aria-hidden="true" />
      <span>{label}{active && `: ${options.find((o) => o.value === value)?.label ?? value}`}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        <option value="">{tx('الكل', 'All')}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export interface Column<T> { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string; align?: 'start' | 'end'; hideBelow?: 'sm' | 'md' | 'lg' }
const HIDE: Record<string, string> = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
/**
 * Operational table. Rows can link to a detail page, be selected, and collapse into cards below `md`
 * through `card`. Wide tables scroll inside their own box, never the page.
 */
export function DataTable<T>({ rows, columns, rowKey, href, selected, onSelect, card, label, rowClass }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; href?: (r: T) => string; label: string;
  selected?: Set<string>; onSelect?: (key: string, on: boolean) => void; card?: (r: T) => ReactNode; rowClass?: (r: T) => string | undefined;
}) {
  const tx = useTx();
  const allOn = !!selected && rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));
  const someOn = !!selected && rows.some((r) => selected.has(rowKey(r)));
  return (
    <>
      <div className={cn('scrollbar-thin overflow-x-auto', card && 'hidden md:block')}>
        <table className="w-full text-sm" aria-label={label}>
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              {onSelect && <th className="w-12 px-4 py-3"><Checkbox label={tx('تحديد كل الصفوف الظاهرة', 'Select all visible rows')} checked={allOn} indeterminate={someOn && !allOn} onChange={(on) => rows.forEach((r) => onSelect(rowKey(r), on))} /></th>}
              {columns.map((c) => <th key={c.key} scope="col" className={cn('px-4 py-3 font-semibold whitespace-nowrap', c.align === 'end' ? 'text-end' : 'text-start', c.hideBelow && HIDE[c.hideBelow])}>{c.header}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const k = rowKey(r);
              const on = !!selected?.has(k);
              return (
                <tr key={k} className={cn('group transition-colors hover:bg-surface-2/50', on && 'bg-brand-500/[.04]', rowClass?.(r))}>
                  {onSelect && <td className="px-4 py-3"><Checkbox label={tx(`تحديد ${k}`, `Select ${k}`)} checked={on} onChange={(v) => onSelect(k, v)} /></td>}
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn('px-4 py-3 align-middle', c.align === 'end' && 'text-end', c.hideBelow && HIDE[c.hideBelow], c.className)}>
                      {href && i === 0 ? <a href={href(r)} className="font-semibold text-fg hover:text-brand-700">{c.cell(r)}</a> : c.cell(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {card && (
        <ul className="divide-y divide-border md:hidden">
          {rows.map((r) => {
            const k = rowKey(r);
            return (
              <li key={k} className="flex items-start gap-3 px-4 py-3">
                {onSelect && <span className="pt-1"><Checkbox label={tx(`تحديد ${k}`, `Select ${k}`)} checked={!!selected?.has(k)} onChange={(v) => onSelect(k, v)} /></span>}
                {href ? <a href={href(r)} className="min-w-0 flex-1">{card(r)}</a> : <div className="min-w-0 flex-1">{card(r)}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function Pagination({ page, pages, total, hrefFor }: { page: number; pages: number; total: number; hrefFor: (p: number) => string }) {
  const tx = useTx();
  const { lang } = useLang();
  const Prev = lang === 'ar' ? ChevronRight : ChevronLeft, Next = lang === 'ar' ? ChevronLeft : ChevronRight;
  if (pages <= 1) return <p className="px-4 py-3 text-xs text-muted tabular-nums">{tx(`${total} نتيجة`, `${total} results`)}</p>;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted">
      <span className="tabular-nums">{tx(`صفحة ${page} من ${pages} · ${total} نتيجة`, `Page ${page} of ${pages} · ${total} results`)}</span>
      <div className="flex gap-1">
        <a aria-disabled={page <= 1} href={page > 1 ? hrefFor(page - 1) : undefined} className={cn('grid size-9 place-items-center rounded-lg border border-border', page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-surface-2')} aria-label={tx('السابقة', 'Previous')}><Prev className="size-4" aria-hidden="true" /></a>
        <a aria-disabled={page >= pages} href={page < pages ? hrefFor(page + 1) : undefined} className={cn('grid size-9 place-items-center rounded-lg border border-border', page >= pages ? 'pointer-events-none opacity-40' : 'hover:bg-surface-2')} aria-label={tx('التالية', 'Next')}><Next className="size-4" aria-hidden="true" /></a>
      </div>
    </div>
  );
}

/** Bar that replaces the toolbar while rows are selected; says exactly what the selection covers. */
export function BulkBar({ count, scope, children, onClear }: { count: number; scope: ReactNode; children: ReactNode; onClear: () => void }) {
  const tx = useTx();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-300 bg-brand-500/5 px-4 py-2.5" role="region" aria-label={tx('إجراءات جماعية', 'Bulk actions')}>
      <span className="text-sm font-semibold text-fg tabular-nums">{tx(`${count} محدد`, `${count} selected`)}</span>
      <span className="text-xs text-muted">{scope}</span>
      <div className="ms-auto flex flex-wrap items-center gap-2">{children}<Button variant="ghost" size="sm" onClick={onClear}>{tx('إلغاء التحديد', 'Clear')}</Button></div>
    </div>
  );
}

/* ---------- Overlays ---------- */

function useFocusReturn(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, []);
  return ref;
}
function Portal({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  const dark = typeof document !== 'undefined' && !!document.querySelector('.lak.dark');
  return createPortal(<div className={cn('lak', dark && 'dark')} dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ minHeight: 0 }}>{children}</div>, document.body);
}

/** Modal. States the action, scope and consequence; footer holds a specific verb, not "OK". */
export function Modal({ title, description, children, footer, onClose, size = 'md' }: { title: string; description?: ReactNode; children?: ReactNode; footer: ReactNode; onClose: () => void; size?: 'md' | 'lg' }) {
  const ref = useFocusReturn(onClose);
  const tx = useTx();
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
          className={cn('flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-pop sm:rounded-2xl', size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
          <div className="flex items-start gap-3 px-6 pt-6">
            <div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-fg">{title}</h2>{description && <p className="mt-1 text-sm text-muted">{description}</p>}</div>
            <button type="button" data-close onClick={onClose} aria-label={tx('إغلاق', 'Close')} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2"><X className="size-5" aria-hidden="true" /></button>
          </div>
          <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-2/40 px-6 py-4">{footer}</div>
        </div>
      </div>
    </Portal>
  );
}

/** Side sheet for filters and secondary detail; full height on phones. */
export function Drawer({ title, children, footer, onClose }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  const ref = useFocusReturn(onClose);
  const tx = useTx();
  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="absolute inset-y-0 end-0 flex w-full max-w-md flex-col bg-surface shadow-pop">
          <div className="flex h-16 items-center gap-3 border-b border-border px-5"><h2 className="flex-1 text-base font-bold">{title}</h2><button type="button" data-close onClick={onClose} aria-label={tx('إغلاق', 'Close')} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2"><X className="size-5" aria-hidden="true" /></button></div>
          <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-5">{children}</div>
          {footer && <div className="flex gap-2 border-t border-border p-4">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

/* ---------- Feedback ---------- */

type ToastMsg = { id: number; text: ReactNode; tone: 'ok' | 'info' | 'bad'; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<ToastMsg, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastMsg[]>([]);
  const push = useCallback((t: Omit<ToastMsg, 'id'>) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { ...t, id }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 6000);
  }, []);
  const Icon = { ok: CheckCircle2, info: Info, bad: AlertCircle };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 start-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 rtl:translate-x-1/2" aria-live="polite">
        {list.map((t) => {
          const I = Icon[t.tone];
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-fg px-4 py-3 text-sm text-bg shadow-pop">
              <I className={cn('size-5 shrink-0', t.tone === 'ok' ? 'text-emerald-400' : t.tone === 'bad' ? 'text-red-400' : 'text-sky-400')} aria-hidden="true" />
              <span className="flex-1">{t.text}</span>
              {t.action && <button type="button" onClick={() => { t.action!.run(); setList((l) => l.filter((x) => x.id !== t.id)); }} className="font-semibold text-sky-300 hover:underline">{t.action.label}</button>}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/** Persistent inline message (a failure stays visible; never only a toast). */
export function Alert({ tone = 'info', title, children, action }: { tone?: 'info' | 'ok' | 'warn' | 'bad'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const S = { info: 'border-sky-500/30 bg-sky-500/5 text-sky-900 dark:text-sky-200', ok: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200', warn: 'border-amber-500/30 bg-amber-500/8 text-amber-900 dark:text-amber-200', bad: 'border-red-500/30 bg-red-500/5 text-red-900 dark:text-red-200' }[tone];
  const I = { info: Info, ok: CheckCircle2, warn: AlertCircle, bad: AlertCircle }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', S)}>
      <I className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{title && <p className="font-semibold">{title}</p>}{children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}</div>
      {action}
    </div>
  );
}

/** Marks a simulated external effect (payment, carrier, message). */
export function Simulated() {
  const tx = useTx();
  return <span className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-border px-2 text-[11px] font-medium text-muted" title={tx('لا يتصل بمزوّد حقيقي', 'Does not reach a real provider')}><Check className="size-3" aria-hidden="true" />{tx('محاكاة', 'Simulated')}</span>;
}

/** Sticky bar for unsaved changes with save / discard and a short error summary. */
export function SaveBar({ dirty, saving, error, onSave, onDiscard, saveLabel }: { dirty: boolean; saving?: boolean; error?: ReactNode; onSave: () => void; onDiscard: () => void; saveLabel?: string }) {
  const tx = useTx();
  if (!dirty && !error) return null;
  return (
    <div className="sticky bottom-4 z-20 mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-border bg-fg px-4 py-3 text-bg shadow-pop" role="region" aria-label={tx('تغييرات غير محفوظة', 'Unsaved changes')}>
      <span className="flex-1 text-sm">{error ?? tx('لديك تغييرات غير محفوظة', 'You have unsaved changes')}</span>
      <Button variant="ghost" size="sm" className="text-bg/80 hover:bg-white/10 hover:text-bg" onClick={onDiscard}>{tx('تجاهل', 'Discard')}</Button>
      <Button size="sm" className="bg-brand-gradient" onClick={onSave} disabled={saving}>{saving ? tx('جارٍ الحفظ…', 'Saving…') : saveLabel ?? tx('احفظ', 'Save')}</Button>
    </div>
  );
}
