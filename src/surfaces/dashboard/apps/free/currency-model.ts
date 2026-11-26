// Gulf currency switcher free app: pure rules. Shoppers see approximate prices in a GCC currency; the order is
// always charged in SAR. Rates are what the merchant types (1 unit of the currency = X SAR); an automatic rate
// source is not approved in this version, so a currency set to "automatic" stays hidden until it has a rate.

export type Gcc = 'AED' | 'KWD' | 'QAR' | 'BHD' | 'OMR';
export const GCC: Gcc[] = ['AED', 'KWD', 'QAR', 'BHD', 'OMR'];
export const GCC_INFO: Record<Gcc, { ar: string; en: string; sym: { ar: string; en: string }; decimals: 2 | 3 }> = {
  AED: { ar: 'درهم إماراتي', en: 'UAE dirham', sym: { ar: 'د.إ', en: 'AED' }, decimals: 2 },
  KWD: { ar: 'دينار كويتي', en: 'Kuwaiti dinar', sym: { ar: 'د.ك', en: 'KWD' }, decimals: 3 },
  QAR: { ar: 'ريال قطري', en: 'Qatari riyal', sym: { ar: 'ر.ق', en: 'QAR' }, decimals: 2 },
  BHD: { ar: 'دينار بحريني', en: 'Bahraini dinar', sym: { ar: 'د.ب', en: 'BHD' }, decimals: 3 },
  OMR: { ar: 'ريال عماني', en: 'Omani rial', sym: { ar: 'ر.ع', en: 'OMR' }, decimals: 3 },
};

export type Rounding = 'exact' | 'nearest' | 'up';
export const ROUNDINGS: Rounding[] = ['exact', 'nearest', 'up'];
export interface CurRate { on: boolean; mode: 'manual' | 'auto'; rate: string }
export interface CurrencySettings extends Record<string, unknown> {
  rates: Record<Gcc, CurRate>;
  rounding: Rounding;
  /** When the merchant last changed a rate (ISO). */
  ratesAt?: string;
}
const off = (): CurRate => ({ on: false, mode: 'manual', rate: '' });
export const CURRENCY_DEFAULTS: CurrencySettings = { rates: { AED: off(), KWD: off(), QAR: off(), BHD: off(), OMR: off() }, rounding: 'exact' };
export const currencySettingsOf = (raw: Partial<CurrencySettings> | undefined): CurrencySettings => ({
  ...CURRENCY_DEFAULTS, ...raw, rates: { ...CURRENCY_DEFAULTS.rates, ...(raw?.rates ?? {}) },
});

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/٫/g, '.').replace(/,/g, '.');
/** SAR per one unit of the currency; null when empty or not a sensible positive number (0.01–100). */
export function parseRate(s: string): number | null {
  const t = toLatin(s).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0.01 && n <= 100 ? n : null;
}
export type RateError = 'empty' | 'invalid';
export function rateError(r: CurRate): RateError | null {
  if (!r.on || r.mode === 'auto') return null;
  if (!r.rate.trim()) return 'empty';
  return parseRate(r.rate) === null ? 'invalid' : null;
}
export const currencyErrors = (s: CurrencySettings) => GCC.flatMap((c) => (rateError(s.rates[c]) ? [c] : []));

/** Currencies shoppers can pick: switched on with a valid manual rate. Automatic ones wait for approval. */
export const shownCurrencies = (s: CurrencySettings): Gcc[] => GCC.filter((c) => s.rates[c].on && s.rates[c].mode === 'manual' && parseRate(s.rates[c].rate) !== null);
export const pendingCurrencies = (s: CurrencySettings): Gcc[] => GCC.filter((c) => s.rates[c].on && s.rates[c].mode === 'auto');

/** Approximate amount in the currency for a SAR price in halalas, after the rounding rule. */
export function approx(halalas: number, cur: Gcc, s: CurrencySettings): number | null {
  const rate = parseRate(s.rates[cur].rate);
  if (rate === null) return null;
  const v = halalas / 100 / rate;
  const d = GCC_INFO[cur].decimals;
  if (s.rounding === 'nearest') return Math.round(v);
  if (s.rounding === 'up') return Math.ceil(v - 1e-9);
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
export function formatApprox(v: number, cur: Gcc, s: CurrencySettings, lang: 'ar' | 'en'): string {
  const d = s.rounding === 'exact' ? GCC_INFO[cur].decimals : 0;
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  return lang === 'ar' ? `${n} ${GCC_INFO[cur].sym.ar}` : `${GCC_INFO[cur].sym.en} ${n}`;
}
