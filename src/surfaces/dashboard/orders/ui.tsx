// Orders section: shared vocabulary and small controls built from the LAK design system.
// Menu, Qty and ChoiceCard are local components (not in src/ds yet); they use only ds tokens and classes.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Minus, Plus, FlaskConical } from 'lucide-react';
import { link } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { levelsStore, ordersStore, stockLogStore, teamStore, testStore } from '../../merchant/stores';
import type { Channel, Ful, Order, Pay, Ship } from '../../merchant/domain';
import { payView, type Actor, type PayView, type ReturnStage, type StockEffect } from '../../merchant/ops';
import { applyStockEffects } from '../../merchant/inventory';
import { Badge, buttonClass, cn, useTx, type Tone } from '../../../ds/ui';
import { actorFor, ageOf, type ListView, type OpsIneligible, type PayMethodFilter, type Sort } from './model';

/** Links inside this section. Always the rebuilt page, whatever the navigation registry says. */
export const ohref = (path = '', query?: Record<string, string | undefined>) => link(`/dashboard/orders${path ? `/${path}` : ''}`, query);

/** Persist one changed order. */
export const saveOrder = (next: Order) => ordersStore.set((all) => all.map((o) => (o.ref === next.ref ? next : o)));

/** Apply order stock effects to the inventory, with stock-log lines naming the order. */
export function applyEffects(effects: StockEffect[], who: Actor, ref: string, tag: string) {
  if (!effects.length) return;
  const r = applyStockEffects(levelsStore.get(), effects, who.name, ref, `${tag}-${ref}-${Date.now().toString(36)}`);
  levelsStore.set(r.levels);
  if (r.log.length) stockLogStore.set((lg) => [...r.log, ...lg]);
}

/** Who is acting now (the review role's team member). */
export function useActor(): Actor {
  const role = testStore.use().role;
  const members = teamStore.use().members;
  return actorFor(role, members);
}
export function useRoleLabel() {
  const tx = useTx();
  return (r: string) => ({ owner: tx('المالك', 'Owner'), fulfilment: tx('التجهيز', 'Fulfilment'), finance: tx('المالية', 'Finance'), marketing: tx('التسويق', 'Marketing'), system: tx('النظام', 'System'), customer: tx('العميل', 'Customer') } as Record<string, string>)[r] ?? r;
}

export function useLabels() {
  const tx = useTx();
  return {
    view: (v: ListView) => ({ all: tx('الكل', 'All'), needs: tx('يحتاج تجهيزًا', 'To fulfil'), late: tx('متأخر', 'Late'), payfail: tx('دفع لم يكتمل', 'Payment incomplete'), shipped: tx('شُحن', 'Shipped'), returns: tx('مرتجعات', 'Returns'), cancelled: tx('ملغاة', 'Cancelled') })[v],
    payView: (p: PayView) => ({ paid: tx('مدفوع', 'Paid'), failed: tx('فشل الدفع', 'Payment failed'), verifying: tx('بانتظار التحقق', 'Pending verification'), cod_due: tx('دفع عند الاستلام', 'Cash on delivery'), cod_collected: tx('حُصّل عند الاستلام', 'COD collected'), link: tx('بانتظار الدفع', 'Awaiting payment'), partially_refunded: tx('مسترد جزئيًا', 'Partly refunded'), refunded: tx('مسترد بالكامل', 'Refunded') })[p],
    method: (m: PayMethodFilter) => ({ card: tx('بطاقة', 'Card'), applepay: 'Apple Pay', bnpl: tx('تقسيط', 'Buy now, pay later'), cod: tx('عند الاستلام', 'Cash on delivery'), manual: tx('يدوي', 'Manual') })[m],
    stage: (s: ReturnStage) => ({ requested: tx('طلب جديد', 'Requested'), approved: tx('موافق عليه', 'Approved'), rejected: tx('مرفوض', 'Rejected'), received: tx('استُلم', 'Received'), inspected: tx('فُحص', 'Inspected'), refunded: tx('رُدّ المبلغ', 'Refunded'), exchanged: tx('استُبدل', 'Exchanged') })[s],
    channel: (c: Channel) => ({ online: tx('المتجر الإلكتروني', 'Online store'), market: tx('سوق لك', 'LAK marketplace'), app: tx('تطبيق المتجر', 'Store app') })[c],
    pay: (p: Pay) => ({ paid: tx('مدفوع', 'Paid'), failed: tx('فشل الدفع', 'Payment failed'), partially_refunded: tx('مسترد جزئيًا', 'Partly refunded'), refunded: tx('مسترد بالكامل', 'Refunded') })[p],
    ful: (f: Ful) => ({ none: tx('لم يُجهَّز', 'Unfulfilled'), partial: tx('مجهّز جزئيًا', 'Partly fulfilled'), done: tx('مجهّز', 'Fulfilled') })[f],
    ship: (s: Ship) => ({ none: tx('لا شحنة', 'No shipment'), label: tx('صدر الملصق', 'Label issued'), transit: tx('في الطريق', 'In transit'), delivered: tx('تم التسليم', 'Delivered') })[s],
    sort: (s: Sort) => ({ new: tx('الأحدث أولًا', 'Newest first'), old: tx('الأقدم أولًا', 'Oldest first'), high: tx('الأعلى قيمة', 'Highest total'), low: tx('الأقل قيمة', 'Lowest total') })[s],
    skip: (r: OpsIneligible) => ({ payNotConfirmed: tx('الدفع لم يكتمل', 'Payment not completed'), refunded: tx('مسترد كليًا أو جزئيًا', 'Refunded in full or in part'), alreadyFulfilled: tx('مجهّز أو صدر ملصقه', 'Already fulfilled or labelled'), alreadyConfirmed: tx('مؤكد من قبل', 'Already confirmed'), cancelled: tx('ملغى', 'Cancelled'), needsLocation: tx('من أكثر من مستودع: جهّزه من صفحته', 'Ships from several warehouses: fulfil it from its page'), noLabel: tx('لا ملصق بعد', 'No label yet'), verifying: tx('الدفع بانتظار التحقق', 'Payment pending verification') })[r],
  };
}

export const PAY_TONE: Record<Pay, Tone> = { paid: 'green', failed: 'red', partially_refunded: 'amber', refunded: 'gray' };
export const PAYVIEW_TONE: Record<PayView, Tone> = { paid: 'green', failed: 'red', verifying: 'amber', cod_due: 'sky', cod_collected: 'green', link: 'amber', partially_refunded: 'amber', refunded: 'gray' };
export const FUL_TONE: Record<Ful, Tone> = { none: 'brand', partial: 'amber', done: 'green' };
export const SHIP_TONE: Record<Ship, Tone> = { none: 'gray', label: 'sky', transit: 'sky', delivered: 'green' };

/** Payment as the merchant should read it: verification and cash on delivery are never shown as failed or paid. */
export function PayBadge({ o }: { o: Order }) { const L = useLabels(); const v = payView(o); return <Badge tone={PAYVIEW_TONE[v]}>{L.payView(v)}</Badge>; }
/** Fulfilment does not apply while payment failed: shown neutral, never as "to fulfil". */
export function FulBadge({ o }: { o: Order }) {
  const L = useLabels(); const tx = useTx();
  if (o.cancelled) return <Badge tone="gray">{tx('ملغى', 'Cancelled')}</Badge>;
  return <Badge tone={o.pay === 'failed' ? 'gray' : FUL_TONE[o.ful]}>{L.ful(o.ful)}</Badge>;
}
export function ShipBadge({ o }: { o: Order }) { const L = useLabels(); return <Badge tone={SHIP_TONE[o.ship]}>{L.ship(o.ship)}</Badge>; }

export function useAge() {
  const tx = useTx();
  return (h: number) => {
    const a = ageOf(h);
    return a.unit === 'now' ? tx('الآن', 'just now') : a.unit === 'h' ? tx(`قبل ${a.n} س`, `${a.n}h ago`) : tx(`قبل ${a.n} ي`, `${a.n}d ago`);
  };
}

/** Popover menu for secondary actions. Escape and outside click close it; arrow keys move; focus returns to the button. */
export function Menu({ label, button, children, align = 'end', variant = 'secondary', size = 'md', up }: {
  label: string; button: ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; variant?: 'secondary' | 'ghost'; size?: 'sm' | 'md'; up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    items()[0]?.focus();
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const close = () => { setOpen(false); btn.current?.focus(); };
  return (
    <div ref={wrap} className="relative">
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)} className={buttonClass(variant, size)}>
        {button}
      </button>
      {open && (
        <div role="menu" aria-label={label} className={cn('absolute z-40 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-pop', align === 'end' ? 'end-0' : 'start-0', up ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
export function MenuItem({ icon, children, onClick, hint, disabled }: { icon?: ReactNode; children: ReactNode; onClick: () => void; hint?: ReactNode; disabled?: boolean }) {
  return (
    <button role="menuitem" type="button" disabled={disabled} onClick={onClick}
      className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-start text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
      {icon && <span className="text-muted" aria-hidden="true">{icon}</span>}<span className="flex-1">{children}</span>{hint}
    </button>
  );
}
export const MenuNote = ({ children }: { children: ReactNode }) => <p className="px-3 py-2 text-xs text-muted">{children}</p>;

export const MenuButtonLabel = ({ children, icon }: { children?: ReactNode; icon: ReactNode }) => <>{icon}{children}<ChevronDown className="size-3.5 opacity-60" aria-hidden="true" /></>;

/** Whole-number stepper for per-line quantities. */
export function Qty({ value, max, onChange, label, invalid, disabled }: { value: number; max: number; onChange: (n: number) => void; label: string; invalid?: boolean; disabled?: boolean }) {
  const tx = useTx();
  const b = 'grid size-9 place-items-center text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <span className={cn('inline-flex h-10 shrink-0 items-center overflow-hidden rounded-xl border bg-surface', invalid ? 'border-red-500' : 'border-border')}>
      <button type="button" className={b} aria-label={tx(`إنقاص ${label}`, `Decrease ${label}`)} disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))}><Minus className="size-4" aria-hidden="true" /></button>
      <input inputMode="numeric" dir="ltr" aria-label={label} aria-invalid={invalid || undefined} disabled={disabled} value={value}
        onChange={(e) => { const n = Number(e.target.value.replace(/[^\d]/g, '')); onChange(Number.isFinite(n) ? n : 0); }}
        className="h-full w-10 border-x border-border bg-transparent text-center text-sm font-semibold tabular-nums text-fg focus:outline-none disabled:opacity-50" />
      <button type="button" className={b} aria-label={tx(`زيادة ${label}`, `Increase ${label}`)} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus className="size-4" aria-hidden="true" /></button>
    </span>
  );
}

/** A radio option shown as a card (location, carrier). */
export function ChoiceCard({ name, checked, onChange, disabled, title, meta, aside }: { name: string; checked: boolean; onChange: () => void; disabled?: boolean; title: ReactNode; meta?: ReactNode; aside?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors', checked ? 'border-brand-500 bg-brand-500/5 ring-4 ring-brand-500/10' : 'border-border hover:border-brand-300', disabled && 'cursor-not-allowed opacity-50')}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="size-4 accent-brand-600" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-fg">{title}</span>{meta && <span className="mt-0.5 block text-xs text-muted">{meta}</span>}</span>
      {aside}
    </label>
  );
}

/** Review-mode only: a clearly marked simulation control that never appears in the product view. */
export function ReviewOnly({ children }: { children: ReactNode }) {
  const tx = useTx();
  if (!useReviewMode()) return null;
  return (
    <div role="group" aria-label={tx('أداة مراجعة', 'Review control')} className="space-y-2 rounded-xl border border-dashed border-border bg-surface-2/50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"><FlaskConical className="size-3.5" aria-hidden="true" />{tx('وضع المراجعة · ليست جزءًا من المنتج', 'Review mode · not part of the product')}</p>
      {children}
    </div>
  );
}

/** Small description list row used in reviews and money breakdowns. */
export function Row({ label, children, strong, tone }: { label: ReactNode; children: ReactNode; strong?: boolean; tone?: 'muted' | 'amber' | 'red' }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', strong && 'font-semibold text-fg', tone === 'muted' && 'text-xs text-muted', tone === 'amber' && 'text-amber-800 dark:text-amber-300', tone === 'red' && 'text-red-700 dark:text-red-400')}>
      <dt className={cn(!strong && !tone && 'text-muted')}>{label}</dt><dd className="text-end">{children}</dd>
    </div>
  );
}
