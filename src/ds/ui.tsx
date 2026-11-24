// LAK component library. Screens compose these; they never restyle primitives locally.
import { clsx, type ClassValue } from 'clsx';
import { useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { CircleHelp, ImageOff, Inbox, AlertTriangle, RotateCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useLang } from '../core/lang';
import { formatMoney } from '../core/format';

export const cn = (...v: ClassValue[]) => clsx(v);

/* ---------- Bilingual helper ---------- */
export function useTx() {
  const { lang } = useLang();
  return (ar: string, en: string) => (lang === 'ar' ? ar : en);
}

/* ---------- Buttons ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary: 'border border-border bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300',
};
const SIZE: Record<Size, string> = { sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg', md: 'h-10 px-4 text-sm gap-2 rounded-xl', lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl' };
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn('inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50', VARIANT[variant], SIZE[size], extra);
}
export function Button({ variant, size, className, ...p }: ComponentPropsWithoutRef<'button'> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...p} />;
}
export function LinkButton({ variant, size, className, ...p }: ComponentPropsWithoutRef<'a'> & { variant?: Variant; size?: Size }) {
  return <a className={buttonClass(variant, size, className)} {...p} />;
}
export function IconButton({ label, className, ...p }: ComponentPropsWithoutRef<'button'> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={cn('grid size-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg', className)} {...p} />;
}

/* ---------- Surfaces ---------- */
export function Card({ className, ...p }: ComponentPropsWithoutRef<'section'>) {
  return <section className={cn('min-w-0 rounded-2xl border border-border bg-surface shadow-card', className)} {...p} />;
}
export function CardHeader({ title, hint, action, id }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-3">
      <h2 id={id} className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-semibold text-fg">{title}{hint && <InfoHint>{hint}</InfoHint>}</h2>
      {action}
    </div>
  );
}

/* ---------- Text helpers ---------- */
export const Ref = ({ children }: { children: ReactNode }) => <bdi dir="ltr" className="tabular-nums">{children}</bdi>;

/** Money in halalas with the official Saudi Riyal glyph; the accessible name names the currency. */
export function Money({ v, className }: { v: number; className?: string }) {
  const { lang } = useLang();
  return (
    <span className={cn('inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums', className)}>
      <bdi>{formatMoney(v)}</bdi>
      <span className="riyal text-[0.85em] opacity-70" role="img" aria-label={lang === 'ar' ? 'ريال سعودي' : 'Saudi riyal'}>{''}</span>
    </span>
  );
}

export function Delta({ v, invert }: { v: number | null; invert?: boolean }) {
  if (v === null) return null;
  const good = invert ? v < 0 : v >= 0;
  const Icon = v >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', good ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400')}>
      <Icon className="size-3.5" aria-hidden="true" /><bdi dir="ltr">{v > 0 ? '+' : ''}{v}%</bdi>
    </span>
  );
}

/* ---------- Status ---------- */
export type Tone = 'brand' | 'green' | 'amber' | 'red' | 'sky' | 'gray';
const TONE: Record<Tone, string> = {
  brand: 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
  green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/12 text-amber-800 dark:text-amber-300',
  red: 'bg-red-500/10 text-red-700 dark:text-red-400',
  sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  gray: 'bg-surface-2 text-muted',
};
export function Badge({ tone = 'gray', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', TONE[tone], className)}>{icon}{children}</span>;
}
export const toneDot: Record<Tone, string> = { brand: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', sky: 'bg-sky-500', gray: 'bg-subtle' };

/* ---------- Help on demand ---------- */
/** A small "?" that opens a short explanation. Keeps headings and fields free of repeated helper text. */
export function InfoHint({ children, label }: { children: ReactNode; label?: string }) {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" aria-expanded={open} aria-controls={id} aria-label={label ?? tx('ما هذا؟', 'What is this?')} onClick={() => setOpen((o) => !o)}
        className="grid size-6 place-items-center rounded-full text-subtle transition-colors hover:bg-surface-2 hover:text-muted">
        <CircleHelp className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute top-full z-30 mt-1.5 w-64 rounded-xl border border-border bg-surface p-3 text-[13px] font-normal leading-relaxed text-muted shadow-pop start-0">
          {children}
        </span>
      )}
    </span>
  );
}

/* ---------- Media ---------- */
export function ProductImage({ src, alt, size = 40, className }: { src?: string; alt: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const box = cn('shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-black/5 dark:ring-white/5', className);
  if (!src || broken) {
    return <span className={cn(box, 'grid place-items-center text-subtle')} style={{ width: size, height: size }} role="img" aria-label={alt}><ImageOff className="size-[40%]" aria-hidden="true" /></span>;
  }
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} className={cn(box, 'object-cover')} style={{ width: size, height: size }} />;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-brand-500/15 to-sky-500/10 text-[13px] font-bold text-brand-700 dark:text-brand-300', className)}>{initials}</span>;
}

/* ---------- States ---------- */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block animate-pulse rounded-lg bg-surface-2', className)} />;
}
export function EmptyState({ icon, title, children, action, as: H = 'h3' }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; as?: 'h1' | 'h2' | 'h3' }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">{icon ?? <Inbox className="size-6" aria-hidden="true" />}</span>
      <H className="mt-4 text-[15px] font-semibold text-fg">{title}</H>
      {children && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
export function ErrorState({ title, children, onRetry, as }: { title: ReactNode; children?: ReactNode; onRetry?: () => void; as?: 'h1' | 'h2' | 'h3' }) {
  const tx = useTx();
  return (
    <div role="alert">
      <EmptyState as={as} icon={<AlertTriangle className="size-6 text-red-600" aria-hidden="true" />} title={title}
        action={onRetry && <Button variant="secondary" onClick={onRetry}><RotateCw className="size-4" aria-hidden="true" />{tx('أعد المحاولة', 'Try again')}</Button>}>
        {children}
      </EmptyState>
    </div>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cn('h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
