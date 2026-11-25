import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf } from './catalog';
import { initialLevels } from './inventory';
import { total } from './domain';
import { payView } from './ops';
import {
  checkQuote, checkTiers, decideBuyer, defaultSettings, invoiceLines, nextTier, priceQuote, quoteState, quoteToOrder, quoteTotals, tierWarnings,
  unitFor, validateBuyer, type Buyer, type PriceList, type Quote,
} from './wholesale';

const form = { company: 'شركة اختبار', cr: '1010123456', vat: '300000000000003', contact: 'أحمد', phone: '٠٥٠١٢٣٤٥٦٧', email: 'a@b.test', city: 'الرياض', address: 'حي العليا' };
const buyer: Buyer = { id: 'B-201', ...form, phone: '0501234567', group: 'g1', status: 'approved', terms: 'net30', source: 'merchant', at: 0 };
const list: PriceList = { group: 'g1', rows: [{ productId: 'p3', tiers: [{ min: 6, price: 9000 }, { min: 24, price: 8000 }] }] };

describe('wholesale buyers', () => {
  it('validates CR, VAT (3…3), mobile and email; one account per CR/VAT', () => {
    expect(validateBuyer(form, [])).toEqual({});
    expect(validateBuyer({ ...form, vat: '300000000000001' }, []).vat).toBe('pattern');
    expect(validateBuyer({ ...form, cr: '12345' }, []).cr).toBe('format');
    expect(validateBuyer({ ...form, phone: '123' }, []).phone).toBe('format');
    expect(validateBuyer(form, [buyer]).cr).toBe('taken');
  });
  it('needs a reason to reject', () => {
    expect(decideBuyer({ ...buyer, status: 'pending' }, 'rejected', 'سارة', '', 1)).toBeNull();
    expect(decideBuyer({ ...buyer, status: 'pending' }, 'approved', 'سارة', '', 1)?.status).toBe('approved');
  });
});

describe('price lists', () => {
  it('prices by the deepest tier reached and refuses below the MOQ', () => {
    expect(unitFor(list, 'p3', 5)).toEqual({ error: 'belowMoq', moq: 6 });
    expect(unitFor(list, 'p3', 10)).toEqual({ price: 9000, tier: 0 });
    expect(unitFor(list, 'p3', 30)).toEqual({ price: 8000, tier: 1 });
    expect(unitFor(list, 'p4', 30)).toEqual({ error: 'notListed' });
    expect(nextTier(list, 'p3', 10)).toEqual({ more: 14, price: 8000 });
  });
  it('checks tier order and warns on rising prices or below cost', () => {
    expect(checkTiers([{ min: 6, price: 9000 }, { min: 6, price: 8000 }])).toBe('order');
    expect(checkTiers([{ min: 0, price: 9000 }])).toBe('min');
    expect(tierWarnings([{ min: 1, price: 5000 }, { min: 10, price: 6000 }], { price: 12900, cost: 6100 })).toEqual(['rising', 'belowCost']);
  });
});

describe('quotes to orders', () => {
  const q: Quote = { id: 'Q-501', buyerId: 'B-201', lines: [{ productId: 'p3', sku: 'OUD-100', name: { ar: 'عطر', en: 'Perfume' }, qty: 2 }], note: '', status: 'requested', at: 0, source: 'merchant' };
  const levels = initialLevels(productFixtures().flatMap(skusOf));
  it('prices from the list, enforces MOQ, stock and minimum order', () => {
    expect(priceQuote(q, list).problems[0]).toMatchObject({ error: 'belowMoq', moq: 6 });
    const priced = priceQuote({ ...q, lines: [{ ...q.lines[0], qty: 3 }] }, { group: 'g1', rows: [{ productId: 'p3', tiers: [{ min: 1, price: 9000 }] }] }).lines;
    expect(checkQuote(priced, buyer, defaultSettings(), levels, 'net30').error).toBeNull();
    expect(checkQuote(priced, buyer, { ...defaultSettings(), minOrder: 100000 }, levels, 'net30').error).toBe('minOrder');
    expect(checkQuote(priced, { ...buyer, status: 'pending' }, defaultSettings(), levels, 'net30').error).toBe('buyer');
    expect(checkQuote([{ ...priced[0], qty: 999 }], buyer, defaultSettings(), levels, 'net30').error).toBe('stock');
  });
  it('expires when read after its validity', () => {
    const quoted: Quote = { ...q, status: 'quoted', quoted: { at: 0, by: 'x', validUntil: 10, shipping: 0, terms: 'net30', note: '' } };
    expect(quoteState(quoted, 5)).toBe('quoted');
    expect(quoteState(quoted, 11)).toBe('expired');
  });
  it('converts to a wholesale order awaiting transfer by the term, with a tax invoice matching the order total', () => {
    const lines = [{ ...q.lines[0], qty: 10, price: 9000 }];
    const o = quoteToOrder({ ...q, lines, status: 'accepted', quoted: { at: 0, by: 'x', validUntil: 10, shipping: 5000, terms: 'net30', note: '' } }, buyer, defaultSettings(), { orders: [{ ref: '10600' }], now: 1000, who: 'سارة', role: 'owner' });
    expect(o).toMatchObject({ ref: '10601', channel: 'wholesale', ful: 'none' });
    expect(payView(o)).toBe('bank_due');
    expect(o.payDue).toBe(1000 + 30 * 86_400_000);
    expect(o.wholesale?.vat).toBe('300000000000003');
    expect(o.items[0].reserved).toEqual({ ryd: 10 });
    const inv = invoiceLines(o);
    expect(inv.total).toBe(total(o));
    expect(quoteTotals(lines, 5000)).toEqual({ lines: 90000, shipping: 5000, net: 95000, vat: 14250, total: 109250 });
  });
});
