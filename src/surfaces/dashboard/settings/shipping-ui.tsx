// Shared pieces of the shipping tool: live setup, honest save + activity log, chip pickers, impact preview.
import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { locationsStore, logAction, productsStore, settingsStore } from '../../merchant/stores';
import type { L } from '../../merchant/domain';
import type { ShippingSetup } from '../../merchant/workspace';
import { Money, cn, useTx } from '../../../ds/ui';
import { useDashState } from '../review';
import { SAMPLE_CARTS, catKey, cityName, setupOf, type Change } from './shipping-model';

export type ShipTab = 'methods' | 'rules' | 'zones' | 'simulate' | 'intl' | 'options';
export const SHIP_TABS: ShipTab[] = ['methods', 'rules', 'zones', 'simulate', 'intl', 'options'];
export const shipHref = (tab: ShipTab, q?: Record<string, string | undefined>) => link('/dashboard/settings/shipping', { tab: tab === 'methods' ? undefined : tab, ...q });

/** The live shipping setup and what it depends on (zones, locations, products). Review "empty" shows no zones. */
export function useShipping() {
  const s = settingsStore.use();
  const locations = locationsStore.use();
  const products = productsStore.use();
  const empty = useDashState() === 'empty';
  const setup = useMemo(() => setupOf(s.shipping), [s.shipping]);
  return { setup, zones: empty ? [] : s.zones, locations, products };
}
/** Write the setup (the online store reads it at once) and record who changed what. */
export function commitShipping(next: ShippingSetup, what: L, extra: { target?: string; before?: string; after?: string } = {}) {
  settingsStore.set((x) => ({ ...x, shipping: next }));
  logAction('settings', what, extra);
}

/** Product categories in the catalogue, as keys with names. */
export function useCategories() {
  const products = productsStore.use();
  return useMemo(() => {
    const out: { id: string; name: L }[] = [];
    for (const p of products) if (p.status !== 'archived' && !out.some((c) => c.id === catKey(p.category))) out.push({ id: catKey(p.category), name: p.category });
    return out;
  }, [products]);
}

/** Toggle chips for a small set of values (cities, categories, methods). */
export function ChipPicker({ options, value, onChange, label }: { options: { id: string; name: L }[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  const { lang } = useLang();
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button key={o.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={cn('inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors', on ? 'border-brand-400 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border bg-surface text-muted hover:text-fg')}>
            {on && <Check className="size-3.5" aria-hidden="true" />}{o.name[lang]}
          </button>
        );
      })}
    </div>
  );
}

/** "1–2 business days" with Arabic plural forms kept simple. */
export function useDays() {
  const tx = useTx();
  return (a: number, b: number) => {
    if (b === 0) return tx('اليوم', 'Today');
    const r = a === b ? `${a}` : `${a}–${b}`;
    return tx(`${r} ${b <= 2 && a === b ? (b === 1 ? 'يوم عمل' : 'يوما عمل') : 'أيام عمل'}`, `${r} business day${b === 1 ? '' : 's'}`);
  };
}

/** What a change does at checkout, by city and sample cart. Empty = no shopper-visible change. */
export function ImpactList({ changes }: { changes: Change[] }) {
  const tx = useTx();
  const { lang } = useLang();
  if (!changes.length) return <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted">{tx('لن يتغير شيء يراه العملاء في السلال التجريبية.', 'Nothing shoppers see changes for the sample carts.')}</p>;
  const shown = changes.slice(0, 8);
  const cell = (v: number | null) => (v === null ? <span className="text-muted">{tx('مخفية', 'Hidden')}</span> : v === 0 ? <span className="text-emerald-700 dark:text-emerald-400">{tx('مجاني', 'Free')}</span> : <Money v={v} />);
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-fg">{tx(`${changes.length} تغيير يراه العملاء`, `${changes.length} changes shoppers will see`)}</p>
      <ul className="divide-y divide-border rounded-xl border border-border text-[13px]">
        {shown.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
            <span className="min-w-0 flex-1 basis-40"><span className="font-medium text-fg">{cityName(c.city)[lang]}</span> · {c.method[lang]}<span className="block text-xs text-muted">{SAMPLE_CARTS.find((s) => s.id === c.cart)?.label[lang]}</span></span>
            <span className="flex items-center gap-1.5 tabular-nums">{cell(c.before)}<span aria-hidden="true" className="text-subtle">{lang === 'ar' ? '←' : '→'}</span>{cell(c.after)}</span>
          </li>
        ))}
      </ul>
      {changes.length > shown.length && <p className="text-xs text-muted">{tx(`و${changes.length - shown.length} تغييرًا آخر`, `and ${changes.length - shown.length} more`)}</p>}
    </div>
  );
}
