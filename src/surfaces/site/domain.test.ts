import { describe, expect, it } from 'vitest';
import {
  fold, hasErrors, isEmail, lowestPlan, normalizeDigits, normalizeSaudiMobile, progress, related, searchItems,
  simRef, toBilling, validateContact, validateSignup, type Searchable,
} from './domain';

describe('phone', () => {
  it('normalizes common Saudi mobile forms', () => {
    for (const raw of ['0501234567', '501234567', '966501234567', '+966 50 123 4567', '00966-50-123-4567', '٠٥٠١٢٣٤٥٦٧']) {
      expect(normalizeSaudiMobile(raw)).toBe('+966501234567');
    }
  });
  it('rejects landlines, short numbers and letters', () => {
    for (const raw of ['0112345678', '05012345', '05012345678', 'abc', '', '+971501234567']) {
      expect(normalizeSaudiMobile(raw)).toBeNull();
    }
  });
  it('converts Eastern Arabic digits', () => {
    expect(normalizeDigits('۱۲٣')).toBe('123');
  });
});

describe('signup validation', () => {
  const ok = { storeName: 'متجر الورد', activity: 'beauty', phone: '0551234567', plan: '', terms: true };
  it('accepts a complete draft', () => expect(validateSignup(ok)).toEqual({}));
  it('flags each missing field', () => {
    expect(validateSignup({ storeName: ' ', activity: '', phone: '', plan: '', terms: false }))
      .toEqual({ storeName: 'required', activity: 'required', phone: 'required', terms: 'terms' });
  });
  it('enforces name length and phone format', () => {
    const e = validateSignup({ ...ok, storeName: 'a', phone: '12345' });
    expect(e).toEqual({ storeName: 'tooShort', phone: 'phone' });
    expect(validateSignup({ ...ok, storeName: 'x'.repeat(61) }).storeName).toBe('tooLong');
    expect(validateSignup({ ...ok, storeName: 'x'.repeat(60) }).storeName).toBeUndefined();
  });
});

describe('contact validation', () => {
  const ok = { name: 'Sara', email: 'sara@example.com', phone: '', topic: 'sales', message: 'I want to know more about plans please.' };
  it('accepts a valid message with optional phone empty', () => expect(hasErrors(validateContact(ok))).toBe(false));
  it('validates email, optional phone and message length', () => {
    const e = validateContact({ ...ok, email: 'sara@', phone: '123', message: 'short' });
    expect(e).toEqual({ email: 'email', phone: 'phone', message: 'tooShort' });
  });
  it('email helper', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a b@c.com')).toBe(false);
  });
});

describe('search', () => {
  const items: Searchable[] = [
    { id: 'a', cat: 'orders', title: { ar: 'تجهيز الطلب', en: 'Preparing an order' }, summary: { ar: '', en: '' }, body: [{ ar: 'الاسترداد منفصل', en: 'Refund is separate' }] },
    { id: 'b', cat: 'payments', title: { ar: 'طرق الدفع', en: 'Payment methods' }, summary: { ar: 'تفعيل مزود', en: 'Provider activation' }, body: [] },
    { id: 'c', cat: 'orders', title: { ar: 'الإرجاع والاسترداد', en: 'Returns and refunds' }, summary: { ar: '', en: '' }, body: [] },
  ];
  it('folds Arabic variants', () => expect(fold('الإسترداد')).toBe(fold('الاسترداد')));
  it('matches either language and ranks title hits first', () => {
    expect(searchItems(items, 'refund').map((i) => i.id)).toEqual(['c', 'a']);
    expect(searchItems(items, 'الدفع').map((i) => i.id)).toEqual(['b']);
  });
  it('filters by category and returns all for empty query', () => {
    expect(searchItems(items, '', 'orders').map((i) => i.id)).toEqual(['a', 'c']);
    expect(searchItems(items, 'nothing-here')).toEqual([]);
  });
  it('related prefers same category', () => {
    expect(related(items, items[0], 2).map((i) => i.id)).toEqual(['c', 'b']);
  });
});

describe('plans & misc', () => {
  it('billing defaults to monthly', () => {
    expect(toBilling('annual')).toBe('annual');
    expect(toBilling('weird')).toBe('monthly');
    expect(toBilling(null)).toBe('monthly');
  });
  it('lowest plan', () => {
    expect(lowestPlan([{ k: 'no' }, { k: 'yes' }, { k: 'yes' }, { k: 'yes' }])).toBe('plus');
    expect(lowestPlan([{ k: 'no' }, { k: 'no' }, { k: 'no' }, { k: 'no' }])).toBeNull();
  });
  it('progress and refs', () => {
    expect(progress({ a: true, b: false, z: true }, ['a', 'b', 'c'])).toEqual({ done: 1, total: 3 });
    expect(simRef('CT', 7)).toBe('CT-SIM-0007');
  });
});

describe('screenshots and guide', async () => {
  const { shotSrc, guideIndex } = await import('./domain');
  it('picks the language capture and dark only where one exists', () => {
    expect(shotSrc('home', 'ar')).toBe('/site/home-ar.jpg');
    expect(shotSrc('home', 'en', true)).toBe('/site/home-en-dark.jpg');
    expect(shotSrc('orders', 'en', true)).toBe('/site/orders-en.jpg');
  });
  it('clamps the guide step', () => {
    expect(guideIndex('3', 6)).toBe(2);
    expect(guideIndex('0', 6)).toBe(0);
    expect(guideIndex('9', 6)).toBe(0);
    expect(guideIndex('x', 6)).toBe(0);
    expect(guideIndex(null, 6)).toBe(0);
  });
});
