import { describe, expect, it } from 'vitest';
import { CURRENCY_DEFAULTS, approx, currencyErrors, formatApprox, parseRate, pendingCurrencies, shownCurrencies, type CurrencySettings } from './currency-model';

const withRate = (rounding: CurrencySettings['rounding'] = 'exact'): CurrencySettings => ({
  ...CURRENCY_DEFAULTS, rounding,
  rates: { ...CURRENCY_DEFAULTS.rates, AED: { on: true, mode: 'manual', rate: '1.02' }, KWD: { on: true, mode: 'manual', rate: '١٢٫٢' }, QAR: { on: true, mode: 'auto', rate: '' } },
});

describe('gulf currencies', () => {
  it('parses rates with Arabic digits and rejects nonsense', () => {
    expect(parseRate('١٢٫٢')).toBe(12.2);
    expect(parseRate('0')).toBeNull();
    expect(parseRate('abc')).toBeNull();
  });
  it('shows manual currencies with a rate; automatic ones wait for approval', () => {
    const s = withRate();
    expect(shownCurrencies(s)).toEqual(['AED', 'KWD']);
    expect(pendingCurrencies(s)).toEqual(['QAR']);
    expect(currencyErrors({ ...s, rates: { ...s.rates, BHD: { on: true, mode: 'manual', rate: '' } } })).toEqual(['BHD']);
  });
  it('converts and rounds', () => {
    expect(approx(10200, 'AED', withRate())).toBe(100);
    expect(approx(10000, 'KWD', withRate())).toBe(8.197);
    expect(approx(10000, 'AED', withRate('nearest'))).toBe(98);
    expect(approx(10000, 'AED', withRate('up'))).toBe(99);
    expect(formatApprox(8.197, 'KWD', withRate(), 'en')).toBe('KWD 8.197');
    expect(formatApprox(98, 'AED', withRate('nearest'), 'ar')).toBe('98 د.إ');
  });
});
