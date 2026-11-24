import { describe, expect, it } from 'vitest';
import {
  categoryFixtures, collectionFixtures, collectionMembers, moveToCategory, parseCsv, planImport, productFixtures, renameCategory, skusOf, suggestMapping, validateCategory, validateImport,
} from '../../merchant/catalog';
import { initialLevels } from '../../merchant/inventory';
import {
  applyBulk, canStartImport, checkImage, checkImportFile, deleteBlock, duplicateDraft, exportRows, extendImport, filterProducts, moveCategory, parsePct, previewBulk,
  removeMedia, restoreMedia, stockOf, undoBulk, type BulkOp,
} from './model';

const products = productFixtures();
const levels = initialLevels(products.filter((p) => p.type !== 'digital').flatMap(skusOf));
const cats = categoryFixtures();
const stock = (p: (typeof products)[number]) => stockOf(p, levels);

describe('categories', () => {
  it('creates a subcategory and moves 20 products into it in one write', () => {
    const sub = { id: 'c-abayas', name: { ar: 'عبايات', en: 'Abayas' }, parent: 'c-fashion', slug: 'abayas', desc: { ar: '', en: '' }, seo: { title: '', desc: '' }, visible: true, order: 0, version: 1 };
    expect(validateCategory(sub, cats)).toEqual({});
    const many = Array.from({ length: 20 }, (_, i) => ({ ...products[0], id: `x${i}`, sku: `X-${i}` }));
    const r = moveToCategory([...products, ...many], new Set(many.map((p) => p.id)), sub.name);
    expect(r.moved).toBe(20);
    const all = [...cats, sub];
    expect(filterProducts(r.products, { q: '', tab: 'all', category: 'abayas', channel: '' }).length).toBe(20);
    // The parent lists its children's products too.
    expect(filterProducts(r.products, { q: '', tab: 'all', category: 'fashion', channel: '' }, all).length).toBeGreaterThan(20);
  });
  it('refuses duplicate names, nested grandchildren and bad handles', () => {
    expect(validateCategory({ id: 'n', name: { ar: 'عطور', en: 'Perfume' }, parent: null, slug: '' }, cats).nameAr).toBe('taken');
    expect(validateCategory({ id: 'n', name: { ar: 'جديد', en: 'fashion ' }, parent: null, slug: 'Bad Slug' }, cats)).toMatchObject({ nameEn: 'taken', slug: 'slug' });
    const withChild = [...cats, { ...cats[0], id: 'c-kid', name: { ar: 'ابن', en: 'Kid' }, parent: 'c-fashion' }];
    expect(validateCategory({ id: 'n', name: { ar: 'حفيد', en: 'Grandkid' }, parent: 'c-kid', slug: '' }, withChild).parent).toBe('parent');
  });
  it('renames on products, reorders siblings and blocks deleting a non-empty category', () => {
    const renamed = renameCategory(products, cats[2].name, { ar: 'شنط', en: 'Handbags' });
    expect(renamed.filter((p) => p.category.en === 'Handbags').map((p) => p.id)).toEqual(['p4', 'p5', 'p17']);
    const moved = moveCategory(cats, 'c-bags', -1);
    expect(moved.find((c) => c.id === 'c-bags')!.order).toBe(1);
    expect(moved.find((c) => c.id === 'c-fragrance')!.order).toBe(2);
    expect(deleteBlock(cats[2], cats, products)).toBe('products');
    expect(deleteBlock({ ...cats[0], id: 'c-empty', name: { ar: 'فارغة', en: 'Empty' } }, cats, products)).toBeNull();
  });
});

describe('collections', () => {
  it('smart "under SAR 100 and in stock" lists matching products only, and an incomplete rule matches nothing', () => {
    const smart = collectionFixtures()[1];
    const ids = collectionMembers(smart, products, stock).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['p8', 'p14', 'p16']));
    expect(ids).not.toContain('p1');
    expect(collectionMembers({ ...smart, rules: [{ field: 'price', op: 'lt', value: '' }] }, products, stock)).toEqual([]);
    expect(collectionMembers({ ...smart, match: 'any', rules: [{ field: 'category', op: 'is', value: 'bags' }, { field: 'tag', op: 'is', value: 'none' }] }, products, stock).map((p) => p.id)).toEqual(['p4', 'p5', 'p17']);
  });
  it('manual collections keep the merchant order and skip deleted products', () => {
    expect(collectionMembers({ ...collectionFixtures()[0], productIds: ['p18', 'gone', 'p6'] }, products, stock).map((p) => p.id)).toEqual(['p18', 'p6']);
  });
});

describe('bulk operations', () => {
  const ids = ['p1', 'p2', 'p4'];
  it('changes price by percent with a per-row preview and skips rows whose compare-at would no longer be higher', () => {
    expect(parsePct('−10%')).toBe(-10);
    expect(parsePct('٢٠')).toBe(20);
    expect(parsePct('0')).toBeNull();
    const rows = previewBulk(products, levels, ids, { field: 'price', mode: 'pct', value: '20' }, cats);
    expect(rows.find((r) => r.id === 'p2')).toMatchObject({ before: 9800, after: 11760, error: null, changed: true });
    expect(rows.find((r) => r.id === 'p1')!.error).toBe('compareAt'); // 290 → 348 is above the 340 compare-at
  });
  it('sets cost, category and channels, then undo restores exactly the previous products', () => {
    const op: BulkOp = { field: 'cost', mode: 'set', value: '50' };
    const r = applyBulk(products, levels, ids, op, cats, 'BULK-T1', 'You');
    expect(r.changed).toBe(3);
    expect(r.products.find((p) => p.id === 'p4')!.cost).toBe(5000);
    const u = undoBulk(r.products, r.levels, r.undo, 'You');
    expect(u.restored).toBe(3);
    expect(u.products.find((p) => p.id === 'p4')!.cost).toBeNull();
    const c = applyBulk(products, levels, ids, { field: 'category', mode: 'set', value: 'c-gifts' }, cats, 'B2', 'You');
    expect(c.products.filter((p) => ids.includes(p.id)).every((p) => p.category.en === 'Gifts')).toBe(true);
    const ch = applyBulk(products, levels, ['p9'], { field: 'channel', mode: 'on', value: '', channel: 'market' }, cats, 'B3', 'You');
    expect(ch.products.find((p) => p.id === 'p9')!.channels.market).toBe(true);
  });
  it('undo leaves a product that was edited again since', () => {
    const r = applyBulk(products, levels, ['p2'], { field: 'status', mode: 'set', value: 'draft' }, cats, 'B4', 'You');
    const later = r.products.map((p) => (p.id === 'p2' ? { ...p, price: 1, version: p.version + 1 } : p));
    expect(undoBulk(later, r.levels, r.undo, 'You')).toMatchObject({ restored: 0, skipped: 1 });
  });
  it('sets stock at a location per SKU with a logged reason; digital products are skipped', () => {
    const op: BulkOp = { field: 'stock', mode: 'set', value: '10', loc: 'jed', reason: 'count' };
    const rows = previewBulk(products, levels, ['p2', 'p10'], op, cats);
    expect(rows.find((x) => x.id === 'p10')!.error).toBe('digital');
    const r = applyBulk(products, levels, ['p2', 'p10'], op, cats, 'B5', 'You');
    expect(r.levels.find((l) => l.sku === 'SHL-SLK-01' && l.loc === 'jed')!.onHand).toBe(10);
    expect(r.log).toHaveLength(1);
    expect(r.log[0]).toMatchObject({ reason: 'count', before: 6, after: 10, ref: 'B5' });
    const u = undoBulk(r.products, r.levels, r.undo, 'You');
    expect(u.levels.find((l) => l.sku === 'SHL-SLK-01' && l.loc === 'jed')!.onHand).toBe(6);
    expect(u.log[0].delta).toBe(-4);
  });
});

describe('import from the merchant’s file, export and media', () => {
  it('rejects non-CSV, empty and one-column files with a reason', () => {
    expect(checkImportFile('catalog.xlsx', 100, 'x').problem).toBe('type');
    expect(checkImportFile('a.csv', 0, '').problem).toBe('empty');
    expect(checkImportFile('a.csv', 10, 'name\nabc').problem).toBe('oneColumn');
    expect(checkImportFile('a.csv', 10, 'name,sku').problem).toBe('noRows');
    const ok = checkImportFile('a.csv', 10, '﻿name;sku;price\nShirt;SH-1;"10,5"');
    expect(ok.problem).toBeNull();
    expect(ok.headers).toEqual(['name', 'sku', 'price']);
  });
  it('checks cost and category per cell, and "all or nothing" will not start with an invalid row', () => {
    const [head, ...rows] = parseCsv('name,name_ar,sku,price,cost,category\nShirt,قميص,NEW-1,100,40,Fashion\nMug,,NEW-2,30,abc,Kitchen\n');
    const mapping = suggestMapping(head);
    expect(mapping).toEqual(['name', 'nameAr', 'sku', 'price', 'cost', 'category']);
    const x = extendImport(rows, mapping, validateImport(rows, mapping, new Set()), cats);
    expect(x[0]).toMatchObject({ nameAr: 'قميص', cost: 4000, category: { en: 'Fashion' }, problems: [] });
    expect(x[1].problems.map((p) => p.code)).toEqual(['cost', 'category']);
    const plan = planImport(x, 'skip');
    expect(canStartImport(plan, 'valid')).toBe(true);
    expect(canStartImport(plan, 'all')).toBe(false);
  });
  it('exports chosen columns, one row per variant, with headers the importer understands', () => {
    const rows = exportRows([products[0]], levels, ['sku', 'price', 'cost', 'margin'], true);
    expect(rows[0]).toEqual(['sku', 'price', 'cost', 'margin_pct']);
    expect(rows).toHaveLength(7);
    expect(rows[1]).toEqual(['ABY-LIN-BLA-S', '290.00', '155.00', 46.6]);
    expect(suggestMapping(rows[0] as string[])).toEqual(['sku', 'price', 'cost', 'ignore']);
  });
  it('accepts images only up to 10 MB and undoes a removal at the same place', () => {
    expect(checkImage({ type: 'image/png', size: 1000 })).toBeNull();
    expect(checkImage({ type: 'application/pdf', size: 1000 })).toBe('type');
    expect(checkImage({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toBe('size');
    const list = [{ id: 'a', label: { ar: '', en: '' }, alt: 'A' }, { id: 'b', label: { ar: '', en: '' }, alt: 'B' }, { id: 'c', label: { ar: '', en: '' }, alt: 'C' }];
    const r = removeMedia(list, 1);
    expect(r.list.map((m) => m.id)).toEqual(['a', 'c']);
    expect(restoreMedia(r.list, r.removed!).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
  it('duplicates a product as a draft with free SKUs', () => {
    const d = duplicateDraft(products[0], products);
    expect(d).toMatchObject({ status: 'draft', sku: 'ABY-LIN-COPY', slug: '' });
    expect(d.variants[0].sku).toBe('ABY-LIN-COPY-BLA-S');
    expect(d.variants.every((v) => v.isNew)).toBe(true);
  });
});
