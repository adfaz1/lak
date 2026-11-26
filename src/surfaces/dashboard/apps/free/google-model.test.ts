import { describe, expect, it } from 'vitest';
import { GOOGLE_DEFAULTS, feedHealth, feedIssues, googleErrors, sentEvents, validGa4, validGtin, validMc } from './google-model';
import { productFixtures, type Product } from '../../../merchant/catalog';

describe('google ids', () => {
  it('validates GA4 and Merchant Center formats (Arabic digits accepted)', () => {
    expect(validGa4('g-ab12cd34ef')).toBe(true);
    expect(validGa4('UA-12345-1')).toBe(false);
    expect(validMc('١٢٣٤٥٦٧٨')).toBe(true);
    expect(validMc('12-34')).toBe(false);
    expect(googleErrors({ ga4: 'G-1', mc: '' })).toEqual(['ga4']);
    expect(googleErrors({ ga4: '', mc: '' })).toEqual([]);
  });
  it('sends nothing without consent or a valid id', () => {
    const s = { ...GOOGLE_DEFAULTS, ga4: 'G-AB12CD34EF' };
    expect(sentEvents(s, false)).toEqual([]);
    expect(sentEvents({ ...s, ga4: '' }, true)).toEqual([]);
    expect(sentEvents({ ...s, events: { ...s.events, purchase: false } }, true)).not.toContain('purchase');
  });
});

describe('product feed health', () => {
  it('checks GTIN check digits', () => {
    expect(validGtin('4006381333931')).toBe(true);
    expect(validGtin('4006381333932')).toBe(false);
    expect(validGtin('96385074')).toBe(true);
  });
  it('lists missing GTIN, brand, description and image', () => {
    const p = { ...productFixtures()[0], barcode: '', brand: undefined, desc: { ar: '', en: '' }, media: [] } as Product;
    expect(feedIssues(p, [])).toEqual(['gtin', 'brand', 'description', 'image']);
    const ok = { ...p, barcode: '4006381333931', brand: 'b1', desc: { ar: 'و'.repeat(30), en: '' }, media: productFixtures()[0].media.length ? productFixtures()[0].media : [{ id: 'm', label: { ar: '', en: '' }, alt: '' }] } as Product;
    expect(feedIssues(ok, ['b1'])).toEqual([]);
    const h = feedHealth([p, ok, { ...ok, status: 'draft' } as Product], ['b1']);
    expect([h.total, h.ready, h.by.gtin]).toEqual([2, 1, 1]);
  });
});
