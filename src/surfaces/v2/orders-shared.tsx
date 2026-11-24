// Shared vocabulary for the redesigned orders list and order detail: labels, stage pills, URL query, small controls.
import { useReviewMode } from '../../core/review';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../../core/lang';
import type { Route } from '../../core/router';
import { ordersStore } from '../merchant/stores';
import { VIEW_IDS, type Channel, type Ful, type Order, type Pay, type Ship, type View } from '../merchant/domain';
import { Icon, Pill, useTx, type IconName, type Tone } from './ui';
import { isLate, stageOf, type Stage } from './data';

export const PAGE_SIZE = 25;
export const CHANNELS: Channel[] = ['online', 'market', 'app'];
export const PAYS: Pay[] = ['paid', 'failed', 'partially_refunded', 'refunded'];
export const FULS: Ful[] = ['none', 'partial', 'done'];
export type Sort = 'new' | 'old' | 'high' | 'low';
export const SORTS: Sort[] = ['new', 'old', 'high', 'low'];

/** Everything the list needs to rebuild itself lives in the URL, so the detail can return to it exactly. */
export interface ListQuery { view: View; q: string; ch?: Channel; pay?: Pay; ful?: Ful; sort: Sort; page: number }

const pick = <T extends string>(v: string | null, list: readonly T[]): T | undefined => (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

export function readQuery(route: Route): ListQuery {
  const g = (k: string) => route.query.get(k);
  return {
    view: pick(g('view'), VIEW_IDS) ?? 'all',
    q: g('q') ?? '',
    ch: pick(g('ch'), CHANNELS),
    pay: pick(g('pay'), PAYS),
    ful: pick(g('ful'), FULS),
    sort: pick(g('sort'), SORTS) ?? 'new',
    page: Math.max(1, Number(g('page')) || 1),
  };
}

/** Serialise a list query; defaults are omitted so URLs stay short. */
export function queryParams(q: ListQuery, over: Partial<ListQuery> = {}): Record<string, string | undefined> {
  const m = { ...q, ...over };
  return {
    view: m.view !== 'all' ? m.view : undefined, q: m.q || undefined, ch: m.ch, pay: m.pay, ful: m.ful,
    sort: m.sort !== 'new' ? m.sort : undefined, page: m.page > 1 ? String(m.page) : undefined,
  };
}

export function useLabels() {
  const tx = useTx();
  return {
    view: (v: View) => ({ all: tx('الكل', 'All'), needs: tx('يحتاج تجهيزًا', 'To fulfil'), late: tx('متأخر', 'Late'), payfail: tx('تعثّر الدفع', 'Payment failed'), shipped: tx('شُحن', 'Shipped'), returns: tx('مرتجعات', 'Returns') })[v],
    channel: (c: Channel) => ({ online: tx('المتجر الإلكتروني', 'Online store'), market: tx('سوق لك', 'LAK marketplace'), app: tx('تطبيق المتجر', 'Store app') })[c],
    pay: (p: Pay) => ({ paid: tx('مدفوع', 'Paid'), failed: tx('فشل الدفع', 'Payment failed'), partially_refunded: tx('مسترد جزئيًا', 'Partly refunded'), refunded: tx('مسترد بالكامل', 'Refunded') })[p],
    ful: (f: Ful) => ({ none: tx('لم يُجهَّز', 'Unfulfilled'), partial: tx('مجهّز جزئيًا', 'Partly fulfilled'), done: tx('مجهّز', 'Fulfilled') })[f],
    ship: (s: Ship) => ({ none: tx('لا شحنة', 'No shipment'), label: tx('صدر الملصق', 'Label issued'), transit: tx('في الطريق', 'In transit'), delivered: tx('تم التسليم', 'Delivered') })[s],
    sort: (s: Sort) => ({ new: tx('الأحدث أولًا', 'Newest first'), old: tx('الأقدم أولًا', 'Oldest first'), high: tx('الأعلى قيمة', 'Highest total'), low: tx('الأقل قيمة', 'Lowest total') })[s],
  };
}

export const PAY_TONE: Record<Pay, Tone> = { paid: 'ok', failed: 'bad', partially_refunded: 'warn', refunded: 'idle' };
export const PAY_ICON: Record<Pay, IconName> = { paid: 'check', failed: 'alert', partially_refunded: 'return', refunded: 'return' };
export const FUL_TONE: Record<Ful, Tone> = { none: 'idle', partial: 'warn', done: 'ok' };
export const FUL_ICON: Record<Ful, IconName> = { none: 'box', partial: 'box', done: 'check' };
export const SHIP_TONE: Record<Ship, Tone> = { none: 'idle', label: 'info', transit: 'info', delivered: 'ok' };
export const SHIP_ICON: Record<Ship, IconName> = { none: 'truck', label: 'print', transit: 'truck', delivered: 'check' };

/** The single operational stage shown in lists. Late is its own stage so it reads before anything else. */
export function StagePill({ o }: { o: Order }) {
  const tx = useTx();
  const s: Stage = stageOf(o);
  if (s === 'todo' && isLate(o)) return <Pill tone="bad" icon="clock">{tx('متأخر · للتجهيز', 'Late · to fulfil')}</Pill>;
  const m: Record<Stage, [Tone, IconName, string]> = {
    payfail: ['bad', 'alert', tx('فشل الدفع', 'Payment failed')],
    todo: ['brand', 'box', tx('للتجهيز', 'To fulfil')],
    partial: ['warn', 'box', tx('مجهّز جزئيًا', 'Partly fulfilled')],
    label: ['info', 'print', tx('صدر الملصق', 'Label issued')],
    transit: ['info', 'truck', tx('في الطريق', 'In transit')],
    delivered: ['ok', 'check', tx('تم التسليم', 'Delivered')],
    refund: ['warn', 'return', tx('استرداد معلّق', 'Refund pending')],
  };
  const [tone, icon, label] = m[s];
  return <Pill tone={tone} icon={icon}>{label}</Pill>;
}

/** Secondary facts that the stage pill hides: shown only where payment or shipment differs from what the stage implies. */
export function StageHints({ o }: { o: Order }) {
  const L = useLabels();
  const s = stageOf(o);
  const out: { icon: IconName; text: string }[] = [];
  if (o.pay === 'partially_refunded' || o.pay === 'refunded') out.push({ icon: 'return', text: L.pay(o.pay) });
  if ((s === 'partial' || s === 'refund') && o.ship !== 'none') out.push({ icon: SHIP_ICON[o.ship], text: L.ship(o.ship) });
  if (!out.length) return null;
  return <span className="ord-hints">{out.map((h) => <span key={h.text} className="ord-hint">{h.text}</span>)}</span>;
}

/** Media query hook (desktop split view, phone layout). */
export function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

/** Popover menu: a button that opens a list of actions. Escape and outside clicks close it; focus returns to the button. */
export function Menu({ label, button, children, align = 'end', className }: { label: string; button: ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; className?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const first = wrap.current?.querySelector<HTMLElement>('[role="menu"] button, [role="menu"] a');
    first?.focus();
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); btn.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menu"] button, [role="menu"] a') ?? []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
        n?.focus(); e.preventDefault();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const close = () => { setOpen(false); btn.current?.focus(); };
  return (
    <div className={`ord-menu${className ? ` ${className}` : ''}`} ref={wrap}>
      <button ref={btn} type="button" className="lk-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)}>{button}</button>
      {open && <div role="menu" aria-label={label} className={`ord-menu-pop ${align}`}>{children(close)}</div>}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, href, hint, tone }: { icon?: IconName; children: ReactNode; onClick?: () => void; href?: string; hint?: ReactNode; tone?: 'bad' }) {
  const inner = <>{icon && <Icon name={icon} size="sm" />}<span className="lk-grow">{children}</span>{hint}</>;
  return href
    ? <a role="menuitem" className={`ord-menu-item${tone ? ` ${tone}` : ''}`} href={href} onClick={onClick}>{inner}</a>
    : <button role="menuitem" type="button" className={`ord-menu-item${tone ? ` ${tone}` : ''}`} onClick={onClick}>{inner}</button>;
}

/** Clearly marked control that drives a simulated provider; never looks like a product control. */
export function TestControl({ title, children }: { title?: string; children: ReactNode }) {
  const tx = useTx();
  // Simulation switches belong to review mode only; the product view never shows them.
  if (!useReviewMode()) return null;
  return (
    <div className="ord-test" role="group" aria-label={title ?? tx('أداة اختبار', 'Test control')}>
      <span className="ord-test-h">{title ?? tx('أداة اختبار · ليست جزءًا من المنتج', 'Test control · not part of the product')}</span>
      {children}
    </div>
  );
}

/** Small integer stepper used for per-line quantities. */
export function Qty({ value, max, onChange, label, invalid, disabled }: { value: number; max: number; onChange: (n: number) => void; label: string; invalid?: boolean; disabled?: boolean }) {
  const tx = useTx();
  return (
    <span className={`ord-qty${invalid ? ' bad' : ''}`}>
      <button type="button" aria-label={tx(`إنقاص ${label}`, `Decrease ${label}`)} disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <input inputMode="numeric" dir="ltr" aria-label={label} aria-invalid={invalid || undefined} disabled={disabled} value={value}
        onChange={(e) => { const n = Number(e.target.value.replace(/[^\d]/g, '')); onChange(Number.isFinite(n) ? n : 0); }} />
      <button type="button" aria-label={tx(`زيادة ${label}`, `Increase ${label}`)} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </span>
  );
}

export function useLangName() {
  const { lang } = useLang();
  return (l: { ar: string; en: string }) => l[lang];
}

export const saveOrder = (next: Order) => ordersStore.set((all) => all.map((o) => (o.ref === next.ref ? next : o)));

/** Renders overlays (dialogs, sheets, toasts) at the app root, so sticky or animated panels never trap or clip them. */
export function Layer({ children }: { children: ReactNode }) {
  const host = typeof document !== 'undefined' ? document.querySelector('.lk-app') ?? document.body : null;
  return host ? createPortal(children, host) : <>{children}</>;
}

/**
 * The shells' sticky top bar and fixed bottom tabs change height across directions and breakpoints.
 * Measure them so sticky table headers, the side panel and bottom bars sit exactly against them.
 */
export function useShellInsets() {
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.lk-app');
    if (!app) return;
    const measure = () => {
      const top = document.querySelector<HTMLElement>('.lk-a-top, .lk-b-top');
      const tabs = document.querySelector<HTMLElement>('.lk-b-tabs');
      let t = 0;
      if (top) { const cs = getComputedStyle(top); if (cs.position === 'sticky' || cs.position === 'fixed') t = (parseFloat(cs.top) || 0) + top.offsetHeight; }
      const b = tabs && getComputedStyle(tabs).position === 'fixed' && tabs.offsetHeight ? Math.max(0, Math.round(window.innerHeight - tabs.getBoundingClientRect().top)) : 0;
      app.style.setProperty('--ord-top', `${t}px`);
      app.style.setProperty('--ord-bottom', `${b}px`);
      const nav = document.querySelector<HTMLElement>('.lk-a-nav');
      const navW = nav && getComputedStyle(nav).position !== 'fixed' ? nav.offsetWidth : 0;
      app.style.setProperty('--ord-nav', `${navW}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    document.querySelectorAll('.lk-a-top, .lk-b-top, .lk-b-tabs').forEach((e) => ro.observe(e));
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  });
}
