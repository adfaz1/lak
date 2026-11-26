// Free-shipping bar & countdown in the online store (free app «bar», only when installed and on). Progress uses the
// merchant's free-delivery amount for the shopper's zone (the checkout city when chosen, else the lowest amount); the
// countdown appears only for a real live offer with an end date.
import { useEffect, useState } from 'react';
import { Clock, Truck } from 'lucide-react';
import { cn, useTx } from '../../../../ds/ui';
import { couponsStore } from '../../../merchant/stores';
import { cityById, computeTotals, pricedLines } from '../../../storefront/domain';
import { checkoutStore, couponResult } from '../../../storefront/state';
import { useCart, useCatalog, useConfig } from '../../../storefront/data';
import { useS } from '../../../storefront/kit';
import { freeAppsStore, isOn } from './registry';
import { BAR_DEFAULTS, countdownFor, progressOf, threshold, timeLeft, type BarSettings } from './bar-model';
import { countShown, settingsOf } from './store-runtime';

function useTick(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [on]);
  return now;
}

/** Goods in the bag after the coupon, and the threshold for the shopper's zone. */
function useBag() {
  const cart = useCart();
  const products = useCatalog();
  const cfg = useConfig();
  const city = cityById(checkoutStore.use().addr.city);
  const lines = pricedLines(cart, products);
  const c = couponResult(cart, products);
  const totals = computeTotals(lines, { discount: c?.status === 'valid' ? c.discount : 0 });
  return { goods: totals.subtotal - totals.discount, th: threshold(cfg.zones, city?.name), freeShipCode: c?.status === 'valid' && c.freeShip };
}

export function useBarSettings(): BarSettings | null {
  const apps = freeAppsStore.use();
  return isOn(apps, 'bar') ? settingsOf(apps, 'bar', BAR_DEFAULTS) : null;
}

/** Countdown text "2d 04:12:09". */
export function Countdown({ ends, now }: { ends: number; now: number }) {
  const tx = useTx();
  const t = timeLeft(ends, now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className="font-semibold tabular-nums">{t.d > 0 && <>{tx(`${t.d} ${t.d <= 10 && t.d > 2 ? 'أيام' : t.d === 2 ? 'يومان' : 'يوم'} و `, `${t.d}d `)}</>}<bdi dir="ltr">{pad(t.h)}:{pad(t.m)}:{pad(t.s)}</bdi></span>;
}

/** The message and bar; shared by the store strip, the bag and the dashboard preview. */
export function BarView({ goods, th, cd, now, compact, freeShipCode }: { goods: number; th?: { from: number; zone: { ar: string; en: string } }; cd: { code: string; ends: number; auto: boolean } | null; now: number; compact?: boolean; freeShipCode?: boolean }) {
  const tx = useTx();
  const { m, l } = useS();
  const p = th ? progressOf(goods, th.from) : null;
  if (!p && !cd) return null;
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[13px]', compact && 'justify-start')} data-free-app="bar">
      {p && (
        <span className="flex min-w-0 items-center gap-2">
          <Truck className="size-4 shrink-0" aria-hidden="true" />
          <span>{freeShipCode ? tx('شحنك مجاني بالكوبون', 'Free delivery with your coupon') : p.reached ? tx('شحنك مجاني', 'Your delivery is free') : tx(`أضف ${m(p.left)} للشحن المجاني`, `Add ${m(p.left)} for free delivery`)}</span>
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct} aria-label={tx(`التقدم نحو الشحن المجاني في ${l(th!.zone)}`, `Progress to free delivery in ${l(th!.zone)}`)}>
            <span className="block h-full rounded-full bg-brand-600" style={{ width: `${freeShipCode ? 100 : p.pct}%` }} />
          </span>
        </span>
      )}
      {cd && <span className="flex items-center gap-1.5"><Clock className="size-4 shrink-0" aria-hidden="true" />{cd.auto ? tx('ينتهي العرض خلال', 'Offer ends in') : <>{tx('كود', 'Code')} <bdi dir="ltr" className="font-semibold">{cd.code}</bdi> {tx('ينتهي خلال', 'ends in')}</>} <Countdown ends={cd.ends} now={now} /></span>}
    </div>
  );
}

/** Strip under the header on every store page. */
export function StoreBarTop() {
  const s = useBarSettings();
  const bag = useBag();
  const coupons = couponsStore.use();
  const cd = s ? countdownFor(s, coupons, Date.now()) : null;
  const now = useTick(!!cd);
  useEffect(() => { if (s?.top) countShown('bar', `bar:top:${location.hash.split('?')[0]}`); });
  if (!s || !s.top) return null;
  const show = (s.progress && bag.th) || cd;
  if (!show) return null;
  return <div className="border-b border-border bg-surface-2 px-4 py-2"><BarView goods={bag.goods} th={s.progress ? bag.th : undefined} cd={cd} now={now} freeShipCode={bag.freeShipCode} /></div>;
}

/** Product page: what free delivery looks like after adding this item. */
export function StoreBarProduct({ price }: { price: number }) {
  const tx = useTx();
  const { m } = useS();
  const s = useBarSettings();
  const bag = useBag();
  if (!s || !s.product || !s.progress || !bag.th || bag.freeShipCode) return null;
  const after = progressOf(bag.goods + price, bag.th.from);
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted" data-free-app="bar">
      <Truck className="size-4 shrink-0" aria-hidden="true" />
      {progressOf(bag.goods, bag.th.from).reached ? tx('حقيبتك وصلت للشحن المجاني', 'Your bag already ships free') : after.reached ? tx('أضفه ويصبح شحنك مجانيًا', 'Add it and your delivery is free') : tx(`بعد إضافته يبقى ${m(after.left)} للشحن المجاني`, `After adding it, ${m(after.left)} to go for free delivery`)}
    </p>
  );
}

/** Bag summary: the real offer's countdown (the bag already shows free-delivery progress). */
export function StoreBarBag() {
  const s = useBarSettings();
  const coupons = couponsStore.use();
  const cd = s && s.bag ? countdownFor(s, coupons, Date.now()) : null;
  const now = useTick(!!cd);
  if (!cd) return null;
  return <div className="rounded-xl bg-surface-2 px-3 py-2"><BarView goods={0} cd={cd} now={now} compact /></div>;
}
