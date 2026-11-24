// Shared pieces of the shopper marketplace, composed from the LAK design system (src/ds).
import { createContext, useContext, type ReactNode } from 'react';
import { Baby, Coffee, Headphones, Minus, Plus, Sofa, SprayCan, type LucideIcon } from 'lucide-react';
import { useLang, type Lang } from '../../core/lang';
import { link, type Route } from '../../core/router';
import { Badge, Money, cn, useTx, type Tone } from '../../ds/ui';
import { productPhoto } from '../dashboard/model/media';
import { deliveryDays, shippingFee, type CatId, type CityId, type Order, type Product, type Seller } from './domain';
import { PHOTO, SELLERS } from './fixtures';
import { strings, type Strings } from './i18n';

/* ---------- Context ---------- */

export interface Ctx { t: Strings; lang: Lang; route: Route; city: CityId; go: (path: string, q?: Record<string, string | undefined>) => string }
export const MarketCtx = createContext<Ctx>({ t: strings.ar, lang: 'ar', route: { path: [], query: new URLSearchParams() }, city: 'riyadh', go: (p) => link(`/market${p}`) });
export const useMk = () => useContext(MarketCtx);

export const sellerOf = (id: string) => SELLERS.find((s) => s.id === id);
export const fmtDate = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Riyadh' }).format(new Date(iso));

/* ---------- Media ---------- */

export const CAT_ICON: Record<CatId, LucideIcon> = { coffee: Coffee, perfume: SprayCan, home: Sofa, kids: Baby, tech: Headphones };

/** Licensed photo when one shows this product; otherwise a neutral placeholder with the category icon. */
export function ProductVisual({ p, size = 'thumb', className }: { p: Product; size?: 'thumb' | 'large'; className?: string }) {
  const { lang } = useLang();
  const src = productPhoto(PHOTO[p.id], size);
  const Icon = CAT_ICON[p.cat];
  if (src) return <img src={src} alt={p.name[lang]} loading="lazy" decoding="async" className={cn('size-full object-cover', className)} />;
  return (
    <span role="img" aria-label={p.name[lang]} className={cn('grid size-full place-items-center bg-gradient-to-b from-surface-2 to-bg text-subtle', className)}>
      <Icon className="size-[34%] max-h-16 max-w-16" strokeWidth={1.25} aria-hidden="true" />
    </span>
  );
}

/** The seller's own mark: initials on the seller's colour. Their identity, not LAK's. */
export function SellerMark({ s, size = 36, className }: { s: Seller; size?: number; className?: string }) {
  const { lang } = useLang();
  const name = s.name[lang];
  // One letter: Arabic initials joined together read as a word.
  const initials = name.trim().charAt(0);
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full font-bold text-white', className)}
      style={{ width: size, height: size, background: s.colour, fontSize: Math.max(10, Math.round(size * 0.36)) }}>{initials}</span>
  );
}

/* ---------- Product card ---------- */

export function ProductCard({ p }: { p: Product }) {
  const { t, lang, go, city } = useMk();
  const s = sellerOf(p.seller)!;
  const fee = shippingFee(s, city, p.price);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-shadow hover:shadow-pop">
      <a href={go(`/p/${p.id}`)} className="flex flex-1 flex-col">
        <span className="relative block aspect-square overflow-hidden bg-surface-2">
          <ProductVisual p={p} className="transition-transform duration-200 group-hover:scale-[1.02]" />
          {p.stock <= 0 && <span className="absolute top-2 start-2"><Badge tone="gray" className="bg-surface/90">{t.outOfStock}</Badge></span>}
        </span>
        <span className="flex flex-1 flex-col gap-1 p-3">
          <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg sm:text-sm">{p.name[lang]}</span>
          <span className="mt-auto pt-1 text-[15px] font-bold text-fg"><Money v={p.price} /></span>
          <span className="text-[11px] text-muted">{fee === null ? t.noDelivery(t.cities[city]) : fee === 0 ? `${t.shipping}: ${t.free}` : <>{t.shipping} <Money v={fee} /></>}</span>
        </span>
      </a>
      <a href={go(`/s/${s.id}`)} className="flex items-center gap-2 border-t border-border px-3 py-2 text-[12px] text-muted hover:text-fg">
        <SellerMark s={s} size={20} />
        <span className="min-w-0 flex-1 truncate"><span className="sr-only">{t.soldBy} </span>{s.name[lang]}</span>
      </a>
    </article>
  );
}

export function ProductGrid({ items }: { items: Product[] }) {
  return <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">{items.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul>;
}

/* ---------- Facts ---------- */

export function Facts({ rows }: { rows: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border">
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
          <dt className="flex items-center gap-2 text-muted">{r.k}</dt><dd className="text-end font-medium text-fg">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SellerIdentity({ s }: { s: Seller }) {
  const { t, lang } = useMk();
  return <Facts rows={[
    { k: t.legalName, v: s.legal[lang] },
    { k: t.cr, v: <bdi dir="ltr" className="tabular-nums">{s.cr}</bdi> },
    { k: t.vatNo, v: <bdi dir="ltr" className="tabular-nums">{s.vat}</bdi> },
    { k: t.basedIn, v: t.cities[s.city] },
  ]} />;
}

export function ShippingFacts({ s }: { s: Seller }) {
  const { t, city } = useMk();
  const fee = shippingFee(s, city, 0);
  const days = deliveryDays(s, city);
  return <Facts rows={[
    { k: t.shipTo(t.cities[city]), v: fee === null ? <Badge tone="amber">{t.noDelivery(t.cities[city])}</Badge> : fee === 0 ? t.free : <Money v={fee} /> },
    ...(days ? [{ k: t.delivery, v: t.deliveryIn(days[0], days[1]) }] : []),
    { k: t.freeOver, v: s.shipping.freeOver === null ? <span className="text-muted">{t.noFree}</span> : <Money v={s.shipping.freeOver} /> },
    { k: t.codFee, v: s.shipping.codFee === null ? <span className="text-muted">{t.codNo}</span> : <Money v={s.shipping.codFee} /> },
    { k: t.returns, v: t.returnsDays(s.returnsDays) },
  ]} />;
}

/* ---------- Quantity ---------- */

export function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  const { t } = useMk();
  const btn = 'grid size-10 place-items-center rounded-lg text-fg transition-colors hover:bg-surface-2 disabled:opacity-40';
  return (
    <div role="group" aria-label={label} className="inline-flex h-11 items-center rounded-xl border border-border bg-surface px-0.5">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={t.less}><Minus className="size-4" aria-hidden="true" /></button>
      <output aria-live="polite" className="w-8 text-center text-sm font-semibold tabular-nums">{value}</output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={t.more}><Plus className="size-4" aria-hidden="true" /></button>
    </div>
  );
}

/* ---------- Order states (kept separate: payment, fulfilment, shipment, return) ---------- */

const payTone = (o: Order): Tone => (o.pay === 'cod_due' ? 'amber' : 'green');
const shipTone = (o: Order): Tone => (o.ship === 'delivered' ? 'green' : o.ship === 'in_transit' ? 'sky' : 'gray');

export function OrderStates({ o, compact }: { o: Order; compact?: boolean }) {
  const { t } = useMk();
  const items: [string, Tone, string][] = [
    [t.payState, payTone(o), t.pay[o.pay]],
    [t.fulState, o.ful === 'fulfilled' ? 'green' : 'gray', t.ful[o.ful]],
    [t.shipState, shipTone(o), t.ship[o.ship]],
    [t.retState, o.ret === 'requested' ? 'amber' : 'gray', t.ret[o.ret]],
  ];
  return (
    <dl className={cn('grid gap-3', compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4')}>
      {items.map(([k, tone, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1"><Badge tone={tone} className="max-w-full truncate">{v}</Badge></dd></div>)}
    </dl>
  );
}

/** Small section heading used inside cards. */
export const H2 = ({ id, children, className }: { id?: string; children: ReactNode; className?: string }) =>
  <h2 id={id} className={cn('flex items-center gap-2 text-[15px] font-semibold text-fg', className)}>{children}</h2>;

export function useMoneyText() {
  const tx = useTx();
  return (v: number) => `${(v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tx('ر.س', 'SAR')}`;
}
