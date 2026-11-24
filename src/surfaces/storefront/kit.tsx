// Storefront building blocks on the LAK design system (src/ds), dressed in the merchant's brand (theme.ts).
import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Droplet, Gift, ImageOff, Lamp, Minus, Package, Plus, Ribbon, Shirt, ShoppingBag, Trash2, Check, Info, X, type LucideIcon } from 'lucide-react';
import { formatMoney } from '../../core/format';
import { useLang, type L, type Lang } from '../../core/lang';
import { link } from '../../core/router';
import { Money, cn } from '../../ds/ui';
import { Input } from '../../ds/kit';
import { CITIES, colorInfo, type CityId, type ColorId, type CouponResult, type Product, type Totals } from './domain';
import { couponsStore } from '../merchant/stores';
import { strings, type Strings } from './i18n';
import { photoFor } from './photos';
import { cartStore, couponResult } from './state';

/* ───────────── Language helpers ───────────── */

export interface Ctx { t: Strings; lang: Lang; l: (x: L) => string; m: (v: number) => string; d: (ms: number) => string; dl: (ms: number) => string; time: (ms: number) => string }

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB');

export function useS(): Ctx {
  const { lang } = useLang();
  return {
    t: strings[lang],
    lang,
    l: (x) => x[lang],
    // Money in running text: isolate the number so it keeps its direction inside Arabic sentences.
    m: (v) => `⁨${formatMoney(v)}⁩ ${lang === 'ar' ? 'ر.س' : 'SAR'}`,
    d: (ms) => new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' }).format(ms),
    dl: (ms) => new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short' }).format(ms),
    time: (ms) => new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit' }).format(ms),
  };
}

/** Storefront link: every route lives below #/store. */
export const to = (path = '', query?: Record<string, string | undefined>) => link(`/store${path}`, query);

export const sizeLabel = (s: string, lang: Lang) => (s.endsWith('ml') ? `${s.replace('ml', '')} ${lang === 'ar' ? 'مل' : 'ml'}` : s);

export function districtLabel(city: CityId | undefined, d: string, lang: Lang): string {
  return CITIES.find((c) => c.id === city)?.districts.find((x) => x.en === d)?.[lang] ?? d;
}

export function variantLabel(_p: Product, color: ColorId | undefined, size: string | undefined, lang: Lang): string {
  return [color && colorInfo(color).name[lang], size && sizeLabel(size, lang)].filter(Boolean).join(' · ');
}

/* ───────────── Layout ───────────── */

export const WRAP = 'mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8';
export const H1 = 'text-[26px] font-semibold leading-tight tracking-tight text-fg sm:text-[32px]';
export const H2 = 'text-xl font-semibold tracking-tight text-fg sm:text-2xl';
export const H3 = 'text-[15px] font-semibold text-fg';
export const PANEL = 'rounded-2xl border border-border bg-surface';
export const LINK = 'font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300';

export function Crumbs({ items }: { items: { label: ReactNode; href?: string }[] }) {
  const { t, lang } = useS();
  const Sep = lang === 'ar' ? ChevronLeft : ChevronRight;
  return (
    <nav aria-label={t.home} className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] text-muted">
      {items.map((it, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <Sep className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />}
          {it.href ? <a href={it.href} className="hover:text-fg">{it.label}</a> : <span aria-current="page" className="truncate text-fg">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/* ───────────── Product photo or placeholder ───────────── */

/** Placeholder icon by category slug (merchant categories) or kind (rule fixtures). */
const KIND_ICON: Record<string, LucideIcon> = { fashion: Shirt, abaya: Shirt, dress: Shirt, fragrance: Droplet, perfume: Droplet, scarf: Ribbon, bags: ShoppingBag, bag: ShoppingBag, home: Lamp, gifts: Gift };

/**
 * Product image box with a fixed aspect so nothing jumps while photos load. Licensed photos where one shows the
 * product; otherwise a calm placeholder tinted with the chosen colour.
 */
export function ProductPhoto({ p, color, variant = 'card', className, eager }: { p: Product; color?: ColorId; variant?: 'card' | 'hero' | 'thumb'; className?: string; eager?: boolean }) {
  const { t, l } = useS();
  const [broken, setBroken] = useState(false);
  const ph = photoFor(p.id, color, variant === 'thumb' ? 'thumb' : 'large');
  const c0 = color ?? p.colors[0];
  const tint = c0 ? colorInfo(c0).hex : '#cdb796';
  const Icon = KIND_ICON[p.kind] ?? Package;
  const alt = color ? `${l(p.name)} – ${l(colorInfo(color).name)}` : l(p.name);
  return (
    <span className={cn('relative block overflow-hidden bg-surface-2', variant === 'thumb' ? 'aspect-square rounded-xl' : 'aspect-[4/5] rounded-2xl', className)}>
      {ph && !broken ? (
        <img src={ph.src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
      ) : (
        <span role="img" aria-label={alt} className="absolute inset-0 grid place-items-center" style={{ background: `color-mix(in oklab, ${tint} 16%, var(--surface-2))` }}>
          <span className="flex flex-col items-center gap-2 text-muted">
            {broken ? <ImageOff className={variant === 'thumb' ? 'size-5' : 'size-8'} strokeWidth={1.25} aria-hidden="true" />
              : <Icon className={variant === 'thumb' ? 'size-5 opacity-60' : 'size-10 opacity-50'} strokeWidth={1} aria-hidden="true" />}
            {variant === 'hero' && <span className="text-xs">{t.photoSoon}</span>}
          </span>
        </span>
      )}
      {ph && !broken && ph.shownColor && variant === 'hero' && (
        <span className="absolute bottom-3 start-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur">{t.shownIn(l(colorInfo(ph.shownColor).name))}</span>
      )}
    </span>
  );
}

/* ───────────── Money, swatches, steppers ───────────── */

export function Price({ v, compareAt, from, className }: { v: number; compareAt?: number; from?: boolean; className?: string }) {
  const { t } = useS();
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      {from && <span className="text-[0.85em] font-normal text-muted">{t.from}</span>}
      <Money v={v} className={cn('font-semibold', compareAt && 'text-red-700 dark:text-red-400')} />
      {compareAt && <s className="text-[0.85em] font-normal text-muted"><span className="sr-only">{t.was} </span><Money v={compareAt} /></s>}
    </span>
  );
}

export function Swatch({ c, size = 14, className }: { c: ColorId; size?: number; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20', className)} style={{ background: colorInfo(c).hex, width: size, height: size }} />;
}

/** Quantity control with 44px targets. At 1 the minus becomes "remove" when `onRemove` is given. */
export function Stepper({ value, max, onChange, label, onRemove, removeLabel, decLabel, incLabel }: {
  value: number; max: number; onChange: (n: number) => void; label: string; onRemove?: () => void; removeLabel?: string; decLabel: string; incLabel: string;
}) {
  const atMin = value <= 1;
  return (
    <div role="group" aria-label={label} className="inline-flex h-11 items-center rounded-xl border border-border bg-surface">
      <button type="button" aria-label={atMin && onRemove ? removeLabel : decLabel} disabled={atMin && !onRemove}
        onClick={() => (atMin && onRemove ? onRemove() : onChange(value - 1))}
        className="grid size-11 place-items-center rounded-s-xl text-muted hover:text-fg disabled:opacity-40">
        {atMin && onRemove ? <Trash2 className="size-4" aria-hidden="true" /> : <Minus className="size-4" aria-hidden="true" />}
      </button>
      <output aria-live="polite" className="w-8 text-center text-sm font-semibold tabular-nums">{value}</output>
      <button type="button" aria-label={incLabel} disabled={value >= max} onClick={() => onChange(value + 1)}
        className="grid size-11 place-items-center rounded-e-xl text-muted hover:text-fg disabled:opacity-40">
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/* ───────────── Money breakdown and coupon ───────────── */

/** Every component of the total on its own line, VAT shown as contained in the total. */
export function Breakdown({ totals, shippingLabel, shippingNote, coupon, shippingPending }: { totals: Totals; shippingLabel?: string; shippingNote?: ReactNode; coupon?: string; shippingPending?: boolean }) {
  const { t } = useS();
  const row = 'flex items-baseline justify-between gap-4';
  return (
    <dl className="space-y-2.5 text-sm">
      <div className={row}><dt className="text-muted">{t.subtotal}</dt><dd><Money v={totals.subtotal} /></dd></div>
      {totals.discount > 0 && (
        <div className={row}><dt className="text-muted">{t.discount}{coupon && <> · <bdi dir="ltr" className="font-medium">{coupon}</bdi></>}</dt>
          <dd className="text-emerald-700 dark:text-emerald-400"><span dir="ltr" className="inline-flex items-baseline">−<Money v={totals.discount} /></span></dd></div>
      )}
      <div className={row}><dt className="text-muted">{shippingLabel ?? t.shipping}</dt>
        <dd>{shippingPending ? <span className="text-muted">{t.shipLater}</span> : totals.shipping === 0 ? <span className="font-medium text-emerald-700 dark:text-emerald-400">{t.free}</span> : <Money v={totals.shipping} />}</dd></div>
      {shippingNote && <p className="text-xs text-muted">{shippingNote}</p>}
      {totals.codFee > 0 && <div className={row}><dt className="text-muted">{t.codFee}</dt><dd><Money v={totals.codFee} /></dd></div>}
      <div className={cn(row, 'border-t border-border pt-3 text-base')}><dt className="font-semibold">{t.total}</dt><dd className="text-lg font-bold"><Money v={totals.total} /></dd></div>
      <div className={cn(row, 'text-xs text-muted')}><dt>{t.vatIncl}</dt><dd><Money v={totals.vat} /></dd></div>
    </dl>
  );
}

export function couponMessage(c: CouponResult, s: Ctx, products: Product[] = []): string {
  const { t, m, d, l } = s;
  switch (c.status) {
    case 'valid': return c.freeShip ? `${t.cValid(c.code)} · ${t.cFreeShip}` : t.cValid(c.code);
    case 'not_found': return t.cNotFound;
    case 'inactive': return t.cInactive;
    case 'per_customer': return t.cPerCustomer;
    case 'expired': return t.cExpired(d(c.expired));
    case 'limit_reached': return t.cLimit;
    case 'not_eligible': {
      if (c.reason !== 'category') return t.cMin(m(c.min), m(c.shortBy));
      const cat = products.find((p) => p.cat === c.cat)?.catName;
      return t.cCat(cat ? l(cat) : c.cat);
    }
  }
}

export function CouponBox({ idp = 'sf-coupon', products }: { idp?: string; products: Product[] }) {
  const s = useS();
  const { t } = s;
  const cart = cartStore.use();
  couponsStore.use();
  const [code, setCode] = useState(cart.coupon ?? '');
  const [open, setOpen] = useState(!!cart.coupon);
  // Only a typed code is shown here; an automatic offer appears as a discount line in the totals.
  const res = cart.coupon ? couponResult(cart, products) : undefined;
  const ok = res?.status === 'valid';
  if (!open && !res) {
    return <button type="button" onClick={() => setOpen(true)} className={cn('text-sm', LINK)}>{t.haveCoupon}</button>;
  }
  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) cartStore.set((c) => ({ ...c, coupon: code.trim().toUpperCase() })); }}>
        <label htmlFor={idp} className="sr-only">{t.coupon}</label>
        <Input id={idp} dir="ltr" value={code} placeholder={t.coupon} autoComplete="off" autoCapitalize="characters" className="h-11 uppercase placeholder:normal-case"
          aria-invalid={res && !ok ? true : undefined} aria-describedby={res ? `${idp}-msg` : undefined} onChange={(e) => setCode(e.target.value)} />
        <button type="submit" className="h-11 shrink-0 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-2">{t.apply}</button>
      </form>
      {res && (
        <div id={`${idp}-msg`} role="status" className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-[13px]', ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-900 dark:text-amber-200')}>
          {ok ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <span className="flex-1">{couponMessage(res, s, products)}</span>
          <button type="button" aria-label={t.couponRemove} title={t.couponRemove} className="grid size-6 shrink-0 place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => { cartStore.set((c) => ({ ...c, coupon: undefined })); setCode(''); }}><X className="size-3.5" aria-hidden="true" /></button>
        </div>
      )}
    </div>
  );
}

/** Calm label for simulated external effects, in the shop's voice. */
export function SimNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('flex items-start gap-1.5 text-xs text-muted', className)}><Info className="mt-px size-3.5 shrink-0" aria-hidden="true" /><span>{children}</span></p>;
}
