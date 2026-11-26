// Storefront side of the Gulf currency switcher: the header picker, the approximate price next to each SAR price, and
// the note that payment is in SAR. Shown only while the app is installed and on, with at least one currency that has
// a rate. Imports nothing from the storefront so its price component can use it without a cycle.
import { useLang } from '../../../../core/lang';
import { freeAppsStore, type FreeAppId, type Installed } from './registry';
import { approx, currencySettingsOf, formatApprox, shownCurrencies, GCC_INFO, type CurrencySettings, type Gcc } from './currency-model';
import { shopperCurrencyStore } from './integrations-state';

function useActive(): { s: CurrencySettings; list: Gcc[]; cur: Gcc | null } | null {
  const apps = freeAppsStore.use();
  const chosen = shopperCurrencyStore.use();
  return activeFrom(apps, chosen);
}
function activeFrom(apps: Partial<Record<FreeAppId, Installed>>, chosen: string) {
  if (!apps.currency?.on) return null;
  const s = currencySettingsOf(apps.currency.settings as Partial<CurrencySettings>);
  const list = shownCurrencies(s);
  if (!list.length) return null;
  return { s, list, cur: (list as string[]).includes(chosen) ? (chosen as Gcc) : null };
}

export function CurrencyPicker() {
  const { lang } = useLang();
  const a = useActive();
  if (!a) return null;
  const label = lang === 'ar' ? 'عملة العرض (الدفع بالريال)' : 'Display currency (you pay in SAR)';
  return (
    <label className="relative inline-flex h-10 items-center" data-free-app="currency">
      <span className="sr-only">{label}</span>
      <select title={label} value={a.cur ?? 'SAR'} onChange={(e) => shopperCurrencyStore.set(e.target.value)}
        className="h-9 appearance-none rounded-lg border border-border bg-surface ps-2 pe-2 text-[13px] font-semibold text-fg hover:bg-surface-2" dir="ltr">
        <option value="SAR">SAR</option>
        {a.list.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}

/** "≈ 102 د.إ" after a SAR price when the shopper picked another currency. */
export function ApproxPrice({ v }: { v: number }) {
  const { lang } = useLang();
  const a = useActive();
  if (!a?.cur) return null;
  const n = approx(v, a.cur, a.s);
  if (n === null) return null;
  return <span className="text-[0.8em] font-normal text-muted" title={lang === 'ar' ? 'سعر تقريبي؛ الدفع بالريال' : 'Approximate; you pay in SAR'}><bdi>≈ {formatApprox(n, a.cur, a.s, lang)}</bdi></span>;
}

export function CurrencyNote() {
  const { lang } = useLang();
  const a = useActive();
  if (!a?.cur) return null;
  const name = GCC_INFO[a.cur][lang];
  return (
    <p className="bg-amber-500/10 px-4 py-1.5 text-center text-[12px] text-amber-900 dark:text-amber-200" role="note" data-free-app="currency">
      {lang === 'ar' ? `الأسعار بـ${name} تقريبية؛ يتم الدفع بالريال السعودي.` : `Prices in ${name} are approximate; you pay in Saudi riyals.`}
      <button type="button" className="ms-2 font-semibold underline underline-offset-2" onClick={() => shopperCurrencyStore.set('SAR')}>{lang === 'ar' ? 'اعرض بالريال' : 'Show in SAR'}</button>
    </p>
  );
}
