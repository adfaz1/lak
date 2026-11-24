import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { initialLevels, type Level } from '../../merchant/inventory';
import {
  checkRemoval, comboKey, fillColumn, fromEditDraft, imageForColor, missingCombos, rebuildEditVariants, removeCombo, restoreCombo, setColorImage, toEditDraft,
  variantStock, variantsWithValue, type EditDraft,
} from './model';

const products = productFixtures();
const levels = initialLevels(products.filter((p) => p.type !== 'digital').flatMap(skusOf));
const abaya = () => toEditDraft(products.find((p) => p.id === 'p1')!); // Black, Navy × S, M, L
const known = new Set(levels.map((l) => l.sku));

describe('variant matrix', () => {
  it('removes one combination and never brings it back on a rebuild', () => {
    const d = abaya();
    const i = d.variants.findIndex((v) => v.color === 'Navy' && v.size === 'S');
    const r = removeCombo(d, i);
    expect(r.variants).toHaveLength(5);
    expect(r.skip).toEqual([comboKey('Navy', 'S')]);
    const withXl: EditDraft = { ...d, ...r, sizes: [...d.sizes, 'XL'] };
    const rebuilt = rebuildEditVariants(withXl);
    expect(rebuilt).toHaveLength(7); // 2×4 − the removed one
    expect(rebuilt.some((v) => v.color === 'Navy' && v.size === 'S')).toBe(false);
    const back = restoreCombo({ ...d, ...r }, d.variants[i]);
    expect(back.variants.map((v) => v.sku)).toEqual(d.variants.map((v) => v.sku)); // same place
    expect(back.skip).toEqual([]);
  });
  it('a saved product with a missing combination opens with it skipped', () => {
    const p = products.find((x) => x.id === 'p1')!;
    const saved = fromEditDraft({ ...abaya(), ...removeCombo(abaya(), 0) }, 'p1', 2);
    expect(saved.variants).toHaveLength(5);
    expect(missingCombos(saved.colors, saved.sizes, saved.variants)).toEqual([comboKey(p.variants[0].color, p.variants[0].size)]);
    expect(toEditDraft(saved).skip).toEqual([comboKey('Black', 'S')]);
  });
  it('blocks removing a variant that orders or a transfer still need, and asks to confirm shelf stock', () => {
    const d = abaya();
    const sku = 'ABY-LIN-BLA-M';
    const held: Level[] = levels.map((l) => (l.sku === sku && l.loc === 'ryd' ? { ...l, reserved: 1 } : l));
    const v = d.variants.filter((x) => x.sku === sku);
    expect(checkRemoval(held, v).blocked[0]).toMatchObject({ why: 'held', units: 1 });
    const paying: Level[] = levels.map((l) => (l.sku === sku ? { ...l, reserved: 0, awaitingPay: l.loc === 'jed' ? 1 : 0 } : l));
    expect(checkRemoval(paying, v).blocked[0].why).toBe('held');
    const coming: Level[] = levels.map((l) => (l.sku === sku ? { ...l, reserved: 0, incoming: 2 } : l));
    expect(checkRemoval(coming, v).blocked[0].why).toBe('incoming');
    const shelf: Level[] = levels.map((l) => (l.sku === sku ? { ...l, reserved: 0 } : l));
    expect(checkRemoval(shelf, v)).toMatchObject({ blocked: [], withStock: [{ onHand: variantStock(shelf, sku).onHand }] });
    expect(checkRemoval(held, [{ ...v[0], isNew: true }]).blocked).toEqual([]);
    expect(variantsWithValue(d, 'colors', 0).map((x) => x.color)).toEqual(['Black', 'Black', 'Black']);
  });
  it('fills a column for all variants or one colour, with Arabic digits, and leaves existing stock alone', () => {
    const d = abaya();
    const r = fillColumn(d, 'price', '٢٧٥', { color: 'Navy' }, known);
    expect(r.error).toBeUndefined();
    expect(r.changed).toBe(3);
    expect(r.variants.filter((v) => v.color === 'Navy').every((v) => v.price === '275')).toBe(true);
    expect(r.variants.filter((v) => v.color === 'Black').every((v) => v.price === '290.00')).toBe(true);
    expect(fillColumn(d, 'price', 'abc', {}, known).error).toBe('money');
    const s = fillColumn(d, 'stock.ryd', '4', {}, known);
    expect([s.changed, s.skipped]).toEqual([0, 6]); // all SKUs exist already
    const fresh: EditDraft = { ...d, sizes: [...d.sizes, 'XL'] };
    fresh.variants = rebuildEditVariants(fresh);
    const s2 = fillColumn(fresh, 'stock.ryd', '٤', { size: 'XL' }, known);
    expect(s2.changed).toBe(2);
    expect(s2.variants.filter((v) => v.size === 'XL').every((v) => v.stockBy.ryd === '4')).toBe(true);
    expect(fillColumn(fresh, 'stock.ryd', '-1', {}, known).error).toBe('stock');
    const k = fillColumn({ ...fresh, sku: 'ABY-NEW' }, 'sku', '', {}, known);
    expect(k.variants.filter((v) => v.isNew).every((v) => v.sku.startsWith('ABY-NEW-'))).toBe(true);
    expect(k.skipped).toBe(6); // saved SKUs are not renamed (orders and stock refer to them)
  });
  it('assigns one image per colour', () => {
    const media = [{ id: 'a', label: { ar: '', en: '' }, alt: 'a' }, { id: 'b', label: { ar: '', en: '' }, alt: 'b', variant: 'Navy' }, { id: 'c', label: { ar: '', en: '' }, alt: 'c' }];
    expect(imageForColor(media, 'Navy')!.id).toBe('b');
    expect(imageForColor(media, 'Black')!.id).toBe('a');
    const next = setColorImage(media, 'Navy', 'c');
    expect(next.find((m) => m.id === 'c')!.variant).toBe('Navy');
    expect(next.find((m) => m.id === 'b')!.variant).toBeUndefined();
  });
  it('keeps the taxable flag through the editor', () => {
    const p = products.find((x) => x.id === 'p3')!;
    expect(toEditDraft(p).taxable).toBe(true);
    expect(fromEditDraft({ ...toEditDraft(p), taxable: false }, 'p3', 2).taxable).toBe(false);
    expect('taxable' in fromEditDraft(toEditDraft(p), 'p3', 2)).toBe(false);
  });
});
