import { describe, expect, it } from 'vitest';
import { parseCsv, planImport, productFixtures, sampleFile, skusOf, suggestMapping, takenSkus, validateImport } from '../../merchant/catalog';
import { initialLevels } from '../../merchant/inventory';
import {
  applyImportBatch, bulkChanged, bulkCheck, bulkRowsFor, categoriesOf, discountPct, filterProducts, fromEditDraft, hiddenReason, importWork, isLow,
  levelsForNew, listPhoto, makePrimary, mediaOf, mediaSrc, moveItem, nextProductId, orderErrors, paginate, previewPrice, priceRange, profitOf,
  rebuildEditVariants, selectionScope, seoPreview, slugify, stockOf, tabCounts, toEditDraft, validateEdit,
} from './model';

const products = productFixtures();
const levels = initialLevels(products.flatMap(skusOf));
const known = new Set(levels.map((l) => l.sku));
const p = (id: string) => products.find((x) => x.id === id)!;

describe('list', () => {
  const all = { q: '', tab: 'all' as const, category: '', channel: '' };
  it('filters by status tab, category, channel and search (name or any variant SKU)', () => {
    expect(filterProducts(products, { ...all, tab: 'draft' }).map((x) => x.id)).toEqual(['p11']);
    expect(filterProducts(products, { ...all, category: 'bags' }).map((x) => x.id)).toEqual(['p4', 'p5']);
    expect(filterProducts(products, { ...all, channel: 'market' }).some((x) => x.id === 'p9')).toBe(false);
    expect(filterProducts(products, { ...all, q: 'abaya' }).map((x) => x.id)).toEqual(['p1']);
    expect(filterProducts(products, { ...all, q: 'thb-cot-whi' }).map((x) => x.id)).toEqual(['p7']);
    expect(filterProducts(products, { ...all, q: 'عباية' }).map((x) => x.id)).toEqual(['p1']);
  });
  it('counts tabs over the other filters', () => {
    const c = tabCounts(products, { ...all, category: 'fashion' });
    expect(c.all).toBe(c.active + c.draft + c.archived);
    expect(c.archived).toBe(1);
  });
  it('lists categories once each', () => {
    const cats = categoriesOf(products).map((c) => c.en);
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats).toContain('Fragrance');
  });
  it('takes available stock from inventory levels; digital has none', () => {
    expect(stockOf(p('p10'), levels)).toBeNull();
    expect(stockOf(p('p3'), levels)).toBe(3); // OUD-100: ryd 4−1, jed 0
    expect(isLow(p('p3'), levels)).toBe(true);
  });
  it('shows "from" only when variant prices differ', () => {
    expect(priceRange(p('p1')).from).toBe(false);
    const q = { ...p('p1'), variants: p('p1').variants.map((v, i) => (i === 0 ? { ...v, price: 25000 } : v)) };
    expect(priceRange(q)).toEqual({ min: 25000, max: 29000, from: true });
  });
  it('paginates and clamps the page', () => {
    const r = paginate(Array.from({ length: 45 }, (_, i) => i), '9', 20);
    expect(r).toMatchObject({ page: 3, pages: 3 });
    expect(r.rows).toEqual([40, 41, 42, 43, 44]);
    expect(paginate([], null).pages).toBe(1);
  });
  it('says whether the selection is this page or all results', () => {
    expect(selectionScope(new Set(['a', 'b']), ['a', 'b'], ['a', 'b', 'c'])).toBe('page');
    expect(selectionScope(new Set(['a', 'b', 'c']), ['a', 'b'], ['a', 'b', 'c'])).toBe('all');
    expect(selectionScope(new Set(['a']), ['a', 'b'], ['a', 'b', 'c'])).toBe('some');
  });
  it('uses the primary image for the row photo', () => {
    expect(listPhoto(p('p4'))).toBe('/products/thumb/p4.jpg');
    expect(listPhoto({ ...p('p1'), media: [{ id: 'up-1', label: { ar: '', en: '' }, alt: 'x' }, ...p('p1').media] })).toBeUndefined();
  });
});

describe('bulk edit', () => {
  it('checks every cell and reports changed rows only', () => {
    const rows = bulkRowsFor(products, new Set(['p1', 'p2']));
    expect(bulkCheck(rows).invalidRows).toBe(0);
    expect(bulkChanged(products, rows)).toEqual([]);
    const bad = rows.map((r, i) => (i === 0 ? { ...r, price: 'abc' } : { ...r, compareAt: '10' }));
    expect(bulkCheck(bad).invalidRows).toBe(2);
    const changed = rows.map((r) => (r.id === 'p2' ? { ...r, status: 'draft' as const } : r));
    expect(bulkChanged(products, changed)).toEqual(['p2']);
  });
});

describe('editor draft', () => {
  it('round-trips a product and keeps its category', () => {
    const d = toEditDraft(p('p3'));
    const back = fromEditDraft(d, 'p3', 2);
    expect(back.category).toEqual(p('p3').category);
    expect(back.price).toBe(p('p3').price);
    expect(back.version).toBe(2);
  });
  it('gives a product with a licensed photo but no media that photo as its first image', () => {
    expect(mediaOf(p('p4'))[0].id).toBe('photo-p4');
    expect(mediaSrc(mediaOf(p('p4'))[0], 'large')).toBe('/products/p4.jpg');
    expect(mediaOf(p('p7'))).toEqual([]);
    expect(mediaSrc(p('p1').media[0])).toBe('/products/thumb/p1.jpg');
  });
  it('asks initial stock per warehouse only for new physical SKUs', () => {
    const d = { ...toEditDraft(undefined), nameAr: 'قميص', nameEn: 'Shirt', price: '100', sku: 'SHR-NEW-01', weight: '300', stockBy: { ryd: '5', jed: '-1' } };
    const e = validateEdit(d, takenSkus(products), known);
    expect(e['stock.jed']).toBe('stock');
    expect(e['stock.ryd']).toBeUndefined();
    expect(validateEdit({ ...d, type: 'digital' }, takenSkus(products), known)['stock.jed']).toBeUndefined();
    const existing = toEditDraft(p('p3'));
    expect(Object.keys(validateEdit(existing, takenSkus(products, 'p3'), known))).toEqual([]);
  });
  it('builds the colour × size matrix with per-warehouse stock and creates levels only for new SKUs', () => {
    const base = { ...toEditDraft(undefined), sku: 'TEE', price: '50', colors: ['Red', 'Blue'], sizes: ['S'] };
    const v = rebuildEditVariants(base);
    expect(v.map((x) => x.sku)).toEqual(['TEE-RED-S', 'TEE-BLU-S']);
    v[0].stockBy = { ryd: '4', jed: '2' };
    const again = rebuildEditVariants({ ...base, variants: v, sizes: ['S', 'M'] });
    expect(again.find((x) => x.sku === 'TEE-RED-S')!.stockBy).toEqual({ ryd: '4', jed: '2' });
    const lv = levelsForNew({ ...base, variants: v }, new Set(['TEE-BLU-S']));
    expect(lv.map((l) => [l.sku, l.loc, l.onHand])).toEqual([['TEE-RED-S', 'ryd', 4], ['TEE-RED-S', 'jed', 2]]);
  });
  it('requires alt text for every image and orders errors as they appear on the page', () => {
    const d = { ...toEditDraft(p('p1')), nameEn: '', price: '0', media: [...p('p1').media, { id: 'up-1', label: { ar: '', en: '' }, alt: ' ' }] };
    const keys = orderErrors(Object.keys(validateEdit(d, takenSkus(products, 'p1'), known)));
    expect(keys).toEqual(['nameEn', 'media.1', 'price']);
  });
  it('reorders media with buttons and sets a primary image', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(makePrimary(['a', 'b', 'c'], 2)).toEqual(['c', 'a', 'b']);
  });
  it('numbers new products after the highest id', () => {
    expect(nextProductId(products)).toBe('p13');
  });
});

describe('pricing and previews', () => {
  it('shows profit and margin only with a cost', () => {
    expect(profitOf('290', '155')).toEqual({ amount: 13500, pct: 46.6 });
    expect(profitOf('290', '')).toBeNull();
  });
  it('computes the discount badge only when compare-at is higher', () => {
    expect(discountPct('290', '340')).toBe(15);
    expect(discountPct('290', '200')).toBeNull();
  });
  it('previews the lowest variant price and visibility', () => {
    const d = toEditDraft(p('p1'));
    expect(previewPrice(d)).toEqual({ amount: 29000, from: false });
    expect(previewPrice({ ...d, variants: d.variants.map((v, i) => (i ? v : { ...v, price: '250' })) })).toEqual({ amount: 25000, from: true });
    expect(hiddenReason(d)).toBeNull();
    expect(hiddenReason({ ...d, channels: { ...d.channels, online: false } })).toBe('offline');
    expect(hiddenReason({ ...d, status: 'draft' })).toBe('draft');
  });
  it('builds a search preview with a slug fallback and clipping', () => {
    const s = seoPreview({ seoTitle: '', seoDesc: '', slug: '', nameEn: 'Tan Leather Bag', nameAr: 'حقيبة', descEn: 'x'.repeat(200), descAr: '' }, 'en');
    expect(s.path).toBe('/p/tan-leather-bag');
    expect(s.desc.length).toBe(160);
    expect(slugify('  Oud  Oil 12ml! ')).toBe('oud-oil-12ml');
  });
});

describe('import batches', () => {
  it('creates new products with stock at Riyadh and updates only price and status', () => {
    const existing = takenSkus(products);
    const [head, ...rows] = parseCsv(sampleFile('small', [...existing]));
    const plan = planImport(validateImport(rows, suggestMapping(head), existing), 'update');
    const work = importWork(plan);
    expect(plan.update.map((r) => r.sku)).toEqual(['SHL-SLK-01']);
    const r = applyImportBatch(products, levels, work);
    expect(r.created).toBe(4);
    expect(r.updated).toBe(1);
    expect(r.products.find((x) => x.sku === 'SHR-LIN-01')).toMatchObject({ price: 14900, status: 'draft', media: [] });
    const shawl = r.products.find((x) => x.sku === 'SHL-SLK-01')!;
    expect(shawl.price).toBe(9800);
    expect(shawl.name).toEqual(p('p2').name);
    expect(shawl.version).toBe(2);
    expect(r.levels.filter((l) => l.sku === 'SHR-LIN-01').map((l) => l.onHand)).toEqual([12, 0]);
    expect(new Set(r.products.map((x) => x.id)).size).toBe(r.products.length);
  });
});
