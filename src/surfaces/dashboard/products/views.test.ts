import { describe, expect, it } from 'vitest';
import { categoryFixtures, productFixtures, skusOf, type Product } from '../../merchant/catalog';
import { initialLevels } from '../../merchant/inventory';
import { toEditDraft } from './model';
import { draftInput, isUncategorised, productQuality, quality } from './quality';
import {
  DEFAULT_COLS, applyQuick, canPin, deleteView, quickCounts, quickMatch, readCols, readQuick, readSort, restoreView, sameQuery, saveView, sortProducts,
  toggleQuick, updateView, validateViewName, viewQuery, viewsFor, writeCols, writeQuick, type SavedView,
} from './views';

const products = productFixtures();
const cats = categoryFixtures();
const levels = initialLevels(products.filter((p) => p.type !== 'digital').flatMap(skusOf));
const ctx = { levels, cats };
const byId = (id: string) => products.find((p) => p.id === id)!;

describe('product quality', () => {
  it('lists exactly what is missing, biggest effect first, with the field that fixes it', () => {
    const q = productQuality({ ...byId('p9'), id: 'p999' }, cats); // no description, no photo (id without a licensed photo)
    expect(q.missing.map((m) => m.key)).toEqual(expect.arrayContaining(['image', 'descAr', 'descEn', 'cost']));
    expect(q.missing[0].key).toBe('image');
    expect(q.missing.find((m) => m.key === 'descAr')!.field).toBe('descAr');
    for (let i = 1; i < q.missing.length; i++) expect(q.missing[i - 1].weight).toBeGreaterThanOrEqual(q.missing[i].weight);
    expect(q.level).toBe('poor');
  });
  it('scores a complete product higher and never above 100', () => {
    const good = productQuality(byId('p1'), cats);
    expect(good.score).toBeGreaterThan(productQuality({ ...byId('p9'), id: 'p999' }, cats).score);
    const full: Product = { ...byId('p1'), barcode: '6281000000001', media: [1, 2, 3].map((i) => ({ id: `m${i}`, label: { ar: '', en: '' }, alt: 'x' })), seo: { ...byId('p1').seo, desc: 'd' } };
    expect(productQuality(full, cats)).toMatchObject({ score: 100, missing: [], level: 'good' });
  });
  it('skips checks that do not apply (weight and barcode for digital, alt text without images)', () => {
    const keys = productQuality(byId('p10'), cats).items.map((i) => i.key);
    expect(keys).not.toContain('weight');
    expect(keys).not.toContain('barcode');
    expect(keys).not.toContain('alt');
  });
  it('points the alt-text fix at the first image without one', () => {
    const p: Product = { ...byId('p1'), media: [{ id: 'a', label: { ar: '', en: '' }, alt: 'ok' }, { id: 'b', label: { ar: '', en: '' }, alt: ' ' }] };
    expect(productQuality(p, cats).missing.find((m) => m.key === 'alt')!.field).toBe('media.1');
  });
  it('scores an unsaved draft the same way, so the editor updates as the merchant types', () => {
    const d = toEditDraft(byId('p9'));
    const before = quality(draftInput(d), cats).score;
    const after = quality(draftInput({ ...d, descAr: 'مبخرة نحاسية مصنوعة يدويًا بنقوش تقليدية.', cost: '60' }), cats).score;
    expect(after).toBeGreaterThan(before);
  });
  it('treats the import fallback and unknown categories as uncategorised', () => {
    expect(isUncategorised({ ar: 'مستورد', en: 'Imported' }, cats)).toBe(true);
    expect(isUncategorised(byId('p1').category, cats)).toBe(false);
    expect(isUncategorised({ ar: 'س', en: 'Something new' }, cats)).toBe(true);
  });
});

describe('quick filters', () => {
  it('reads only known filters, in a stable order, and toggles', () => {
    expect(readQuick('low,bogus,noImage,low')).toEqual(['noImage', 'low']);
    expect(writeQuick(toggleQuick(['low'], 'noImage'))).toBe('noImage,low');
    expect(writeQuick(toggleQuick(['low'], 'low'))).toBeUndefined();
  });
  it('matches each filter by the catalogue and stock rules', () => {
    expect(quickMatch(byId('p11'), 'hidden', ctx)).toBe(true); // draft, no channels
    expect(quickMatch(byId('p12'), 'hidden', ctx)).toBe(false); // archived is its own tab
    expect(quickMatch(byId('p1'), 'discounted', ctx)).toBe(true);
    expect(quickMatch(byId('p10'), 'shipping', ctx)).toBe(false);
    expect(quickMatch(byId('p10'), 'soldOut', ctx)).toBe(false); // digital never sells out
    expect(quickMatch(byId('p9'), 'noDesc', ctx)).toBe(true);
    expect(quickMatch({ ...byId('p9'), price: 0 }, 'noPrice', ctx)).toBe(true);
    expect(quickMatch(byId('p1'), 'taxable', ctx)).toBe(true);
    expect(quickMatch({ ...byId('p1'), taxable: false }, 'noTax', ctx)).toBe(true);
    const out = initialLevels(['OUD-100']).map((l) => ({ ...l, onHand: 0, reserved: 0 }));
    expect(quickMatch(byId('p3'), 'soldOut', { levels: out, cats })).toBe(true);
    expect(quickMatch(byId('p3'), 'low', { levels: out, cats })).toBe(false); // sold out is not "low"
  });
  it('combines filters with AND and counts each on its own', () => {
    const both = applyQuick(products, ['noDesc', 'shipping'], ctx);
    expect(both.every((p) => p.type === 'physical' && (!p.desc.ar || !p.desc.en))).toBe(true);
    const c = quickCounts(products, ctx);
    expect(c.shipping).toBe(products.filter((p) => p.type === 'physical').length);
    expect(applyQuick(products, [], ctx)).toBe(products);
  });
});

describe('sort and columns', () => {
  it('sorts by price, stock (digital last) and quality', () => {
    const asc = sortProducts(products, 'priceAsc', ctx);
    for (let i = 1; i < asc.length; i++) expect(asc[i - 1].price <= asc[i].price || asc[i - 1].variants.length > 0 || asc[i].variants.length > 0).toBe(true);
    expect(sortProducts(products, 'stockAsc', ctx).at(-1)!.type).toBe('digital');
    const q = sortProducts(products, 'qualityAsc', ctx).map((p) => productQuality(p, cats).score);
    for (let i = 1; i < q.length; i++) expect(q[i - 1]).toBeLessThanOrEqual(q[i]);
    expect(sortProducts(products, 'catalogue', ctx)).toBe(products);
    expect(readSort('x')).toBe('catalogue');
  });
  it('keeps the default columns out of the address', () => {
    expect(readCols(null)).toEqual(DEFAULT_COLS);
    expect(readCols('price,sku,zzz')).toEqual(['sku', 'price']);
    expect(writeCols(DEFAULT_COLS)).toBeUndefined();
    expect(writeCols(['price', 'sku'])).toBe('sku,price');
  });
});

describe('saved views', () => {
  const q = (o: Record<string, string>) => viewQuery((k) => o[k] ?? null);
  it('keeps only view keys and compares addresses by what they show', () => {
    expect(q({ q: ' oud ', page: '3', qf: 'low', view: 'V-1' })).toEqual({ q: 'oud', qf: 'low' });
    expect(sameQuery(q({ qf: 'low' }), q({ qf: 'low', page: '2' }))).toBe(true);
    expect(sameQuery(q({ qf: 'low' }), q({ qf: 'low', sort: 'name' }))).toBe(false);
  });
  it('validates names per viewer and limits pinned tabs', () => {
    let views: SavedView[] = [];
    const r1 = saveView(views, { owner: 'u1', name: ' Low ', query: { qf: 'low' }, pinned: true }, 1);
    if ('error' in r1) throw new Error(r1.error);
    views = r1.views;
    expect(r1.view).toMatchObject({ id: 'V-1', name: 'Low' });
    expect(validateViewName('low', views, 'u1')).toBe('taken');
    expect(validateViewName('low', views, 'u2')).toBeNull(); // another viewer's views are separate
    expect(validateViewName('', views, 'u1')).toBe('required');
    expect(validateViewName('x'.repeat(31), views, 'u1')).toBe('long');
    for (let i = 0; i < 5; i++) { const r = saveView(views, { owner: 'u1', name: `v${i}`, query: {}, pinned: true }, 1); if ('error' in r) throw new Error(r.error); views = r.views; }
    expect(canPin(views, 'u1')).toBe(false);
    expect(saveView(views, { owner: 'u1', name: 'one more', query: {}, pinned: true }, 1)).toEqual({ error: 'pins' });
    expect(viewsFor(views, 'u2')).toEqual([]);
  });
  it('renames, unpins, deletes and restores in place', () => {
    const base: SavedView[] = [{ id: 'V-1', owner: 'u1', name: 'A', query: {}, pinned: true, at: 0 }, { id: 'V-2', owner: 'u1', name: 'B', query: {}, pinned: false, at: 0 }];
    expect(updateView(base, 'V-2', { name: 'a' })).toEqual({ error: 'taken' });
    const r = updateView(base, 'V-1', { name: 'Alpha', pinned: false });
    if ('error' in r) throw new Error(r.error);
    expect(r.views[0]).toMatchObject({ name: 'Alpha', pinned: false });
    const gone = deleteView(base, 'V-1');
    expect(restoreView(gone, base[0], 0).map((v) => v.id)).toEqual(['V-1', 'V-2']);
    expect(updateView(base, 'nope', {})).toEqual({ error: 'missing' });
  });
});
