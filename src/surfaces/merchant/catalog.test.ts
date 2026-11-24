import { describe, expect, it } from 'vitest';
import {
  applyBulkEdit, duplicateValues, emptyDraft, errorReportRows, parseCsv, parseMoney, planImport, productFixtures, rebuildVariants,
  sampleFile, suggestMapping, takenSkus, toCsv, toDraft, validateBulkRow, validateDraft, validateImport, validateMapping, margin,
} from './catalog';

describe('money input', () => {
  it('parses halalas from Latin and Arabic digits without floats', () => {
    expect(parseMoney('290')).toBe(29000);
    expect(parseMoney('290.5')).toBe(29050);
    expect(parseMoney('٢٩٠٫٥٠')).toBe(29050);
    expect(parseMoney('1,250.99')).toBe(125099);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('12.345')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
  it('shows margin only when a cost exists', () => {
    expect(margin(29000, 15500)).toEqual({ amount: 13500, pct: 46.6 });
    expect(margin(29000, null)).toBeNull();
  });
});

describe('product editor validation (QA07)', () => {
  const products = productFixtures();
  it('requires names, a price and a valid SKU; weight only for physical goods', () => {
    const d = emptyDraft();
    const e = validateDraft(d, takenSkus(products));
    expect(e).toMatchObject({ nameAr: 'required', nameEn: 'required', price: 'money', sku: 'required', weight: 'weight' });
    const digital = validateDraft({ ...d, type: 'digital' }, takenSkus(products));
    expect(digital.weight).toBeUndefined();
  });
  it('rejects compare-at not above price, taken SKUs, bad slugs and missing alt text', () => {
    const d = { ...toDraft(products[1]), compareAt: '50', slug: 'Bad Slug' };
    const e = validateDraft(d, takenSkus(products, products[1].id));
    expect(e.compareAt).toBe('compareAt');
    expect(e.slug).toBe('slug');
    expect(validateDraft(toDraft(products[1]), takenSkus(products)).sku).toBe('skuTaken');
    expect(validateDraft(toDraft(products[0]), takenSkus(products, 'p1'))['media.1']).toBe('alt');
  });
  it('builds a colour × size matrix, keeps typed values and blocks duplicate option values', () => {
    const d = { ...emptyDraft(), sku: 'TEE', price: '50', colors: ['Red', 'Blue'], sizes: ['S', 'M'] };
    const v = rebuildVariants(d);
    expect(v.map((x) => x.sku)).toEqual(['TEE-RED-S', 'TEE-RED-M', 'TEE-BLU-S', 'TEE-BLU-M']);
    const edited = { ...d, variants: v.map((x, i) => (i === 0 ? { ...x, price: '55' } : x)), sizes: ['S', 'M', 'L'] };
    const again = rebuildVariants(edited);
    expect(again.length).toBe(6);
    expect(again[0].price).toBe('55');
    expect(duplicateValues(['Red', ' red', 'Blue'])).toEqual(['red']);
  });
});

describe('bulk edit', () => {
  it('flags invalid cells and saves nothing until all are valid', () => {
    const p = productFixtures();
    expect(validateBulkRow({ id: 'p2', price: '0', compareAt: '', status: 'active' }).price).toBe('money');
    expect(validateBulkRow({ id: 'p2', price: '100', compareAt: '90', status: 'active' }).compareAt).toBe('compareAt');
    expect(applyBulkEdit(p, [{ id: 'p2', price: 'x', compareAt: '', status: 'active' }])).toBeNull();
    const next = applyBulkEdit(p, [{ id: 'p2', price: '110', compareAt: '', status: 'draft' }])!;
    const p2 = next.find((x) => x.id === 'p2')!;
    expect(p2.price).toBe(11000);
    expect(p2.status).toBe('draft');
    expect(p2.version).toBe(2);
  });
});

describe('CSV', () => {
  it('round-trips quotes, commas and new lines', () => {
    const rows = [['a', 'b,c', 'say "hi"', 'x\ny']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('import (QA08)', () => {
  const existing = takenSkus(productFixtures());
  const text = sampleFile('large', [...existing]);
  const [head, ...rows] = parseCsv(text);
  const mapping = suggestMapping(head);
  it('suggests a mapping that covers the required fields', () => {
    expect(rows.length).toBe(1000);
    expect(mapping).toEqual(['name', 'sku', 'price', 'compareAt', 'qty', 'status']);
    expect(validateMapping(mapping)).toEqual({ missing: [], repeated: [] });
    expect(validateMapping(['name', 'name', 'ignore'])).toEqual({ missing: ['sku', 'price'], repeated: ['name'] });
  });
  it('finds invalid rows, in-file duplicates and conflicts with the catalogue', () => {
    const checked = validateImport(rows, mapping, existing);
    const skip = planImport(checked, 'skip');
    const update = planImport(checked, 'update');
    const total = skip.create.length + skip.skipExisting.length + skip.duplicates.length + skip.invalid.length;
    expect(total).toBe(1000);
    expect(skip.invalid.length).toBeGreaterThan(10);
    expect(skip.duplicates.length).toBeGreaterThan(10);
    expect(skip.conflicts.length).toBeGreaterThan(5);
    expect(update.update.length).toBe(skip.conflicts.length);
    expect(update.skipExisting.length).toBe(0);
    const bad = checked.find((r) => r.line === 98)!; // data row 97: price "abc"
    expect(bad.problems.map((p) => p.code)).toContain('price');
  });
  it('writes one error-report line per problem and per skipped row', () => {
    const plan = planImport(validateImport(rows, mapping, existing), 'skip');
    const report = errorReportRows(plan, (c) => c, ['line', 'sku', 'field', 'value', 'problem']);
    const problems = plan.invalid.reduce((s, r) => s + r.problems.length, 0);
    expect(report.length).toBe(1 + problems + plan.duplicates.length + plan.skipExisting.length);
  });
});
