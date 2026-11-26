import { describe, expect, it } from 'vitest';
import { linkCodeOf, linkErrors, linkStats, linkUrl, nextCode, slugUtm, storePath, type ShortLink } from './qr-model';

const link = (x: Partial<ShortLink> = {}): ShortLink => ({ id: 'L1', code: 'ABC123', label: 'لوحة المحل', kind: 'product', target: 'p1', utm: { source: 'shop_sign', medium: 'qr', campaign: 'winter' }, on: true, createdAt: '', by: '', ...x });

describe('short links', () => {
  it('builds the store URL with the link code and UTM tags', () => {
    expect(linkUrl('https://x.test/', link())).toBe('https://x.test/#/store/p/p1?lk=ABC123&utm_source=shop_sign&utm_medium=qr&utm_campaign=winter');
    expect(storePath('coupon', 'SAVE10')).toBe('');
    expect(storePath('landing', 'white-friday')).toBe('/lp/white-friday');
  });
  it('reads the code from the address (Arabic digits, lower case)', () => {
    expect(linkCodeOf(new URLSearchParams('lk=abc١٢٣'))).toBe('ABC123');
    expect(linkCodeOf(new URLSearchParams('lk=a'))).toBeUndefined();
  });
  it('validates and avoids taken codes', () => {
    expect(linkErrors(link(), [link({ id: 'L2' })], true)).toEqual(['codeTaken']);
    expect(linkErrors(link({ label: '', utm: { source: '', medium: 'qr', campaign: 'Bad Tag' } }), [], false)).toEqual(['label', 'target', 'source', 'campaign']);
    const c = nextCode([], 1);
    expect(c).toMatch(/^[A-Z0-9]{6}$/);
    expect(nextCode([c], 1)).not.toBe(c);
    expect(slugUtm('Winter Sale ٢٠٢٦')).toBe('winter-sale-2026');
  });
  it('attributes orders and revenue from the order book, skipping cancelled ones', () => {
    const s = linkStats('ABC123', { ABC123: 10 }, { '1001': 'ABC123', '1002': 'ABC123', '1003': 'ZZZ999' }, (r) => (r === '1001' ? 5000 : 0));
    expect(s).toEqual({ visits: 10, orders: 1, revenue: 5000, conversion: 0.1 });
  });
});
