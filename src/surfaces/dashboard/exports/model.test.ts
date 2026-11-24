import { describe, expect, it } from 'vitest';
import { allOrders } from '../../merchant/domain';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { initialLevels } from '../../merchant/inventory';
import { customerFixtures } from '../../merchant/workspace';
import { KEEP_FILES, addLog, blankTemplate, buildSheet, defaultTemplate, logFixtures, nextRun, safeCell, sheetCsv, templateFixtures, validateTemplate, type Data, type ExportLog } from './model';

const products = productFixtures();
const d: Data = { orders: allOrders(), products, levels: initialLevels(products.filter((p) => p.type !== 'digital').flatMap(skusOf)), customers: customerFixtures(), contact: true, now: Date.parse('2026-11-24T09:00:00Z') };

describe('templates', () => {
  it('validates name, columns, unique headers, range and schedule e-mail', () => {
    const all = templateFixtures();
    const t = blankTemplate('orders', 'TPL-009', 'me', '');
    expect(validateTemplate(t, all)).toContain('name');
    const named = { ...t, name: 'Stock count', entity: 'products' as const };
    expect(validateTemplate(named, all)).toContain('nameTaken');
    const dup = { ...t, name: 'x', cols: [{ key: 'ref', ar: 'رقم', en: 'n' }, { key: 'date', ar: 'رقم', en: 'm' }] };
    expect(validateTemplate(dup, all)).toContain('headerDup');
    expect(validateTemplate({ ...dup, headerLang: 'en' }, all)).not.toContain('headerDup');
    expect(validateTemplate({ ...t, name: 'x', period: { preset: 'custom', from: '٢٠٢٦-١١-١٠', to: '2026-11-01' } }, all)).toContain('range');
    expect(validateTemplate({ ...t, name: 'x', schedule: { ...t.schedule, freq: 'daily', email: 'nope' } }, all)).toContain('email');
    expect(validateTemplate({ ...t, name: 'x' }, all)).toEqual([]);
  });
  it('one row per order or per item, columns in the chosen order with custom headers', () => {
    const acc = templateFixtures()[0];
    const perItem = buildSheet(acc, d);
    const perOrder = buildSheet({ ...acc, rows: 'one' }, d);
    expect(perItem.head[0]).toBe('رقم الطلب');
    expect(perItem.rows.length).toBeGreaterThan(perOrder.rows.length);
    const flipped = buildSheet({ ...acc, cols: [...acc.cols].reverse(), headerLang: 'en' }, d);
    expect(flipped.head[0]).toBe('Total');
  });
  it('a caller scope wins over the template filters (list selection)', () => {
    const acc = templateFixtures()[0];
    const two = d.orders.slice(0, 2);
    expect(buildSheet({ ...acc, rows: 'one' }, d, { orders: two }).rows).toHaveLength(2);
  });
  it('masks contact columns for roles without contact access, and neutralises formulas', () => {
    const t = defaultTemplate('customers', 'en');
    const s = buildSheet(t, { ...d, contact: false });
    expect(s.masked).toBe(true);
    expect(String(s.rows[0][t.cols.findIndex((c) => c.key === 'email')])).toContain('•');
    expect(safeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(safeCell(-5)).toBe(-5);
    expect(sheetCsv(s).startsWith('﻿')).toBe(true);
  });
  it('products: per variant rows reuse the product export', () => {
    const stock = templateFixtures()[1];
    expect(buildSheet(stock, d).rows.length).toBeGreaterThan(buildSheet({ ...stock, rows: 'one' }, d).rows.length);
  });
});

describe('schedule and log', () => {
  it('next weekly run is the chosen weekday and hour (Riyadh)', () => {
    const at = nextRun({ freq: 'weekly', email: 'a@b.co', hour: 7, weekday: 0, day: 1 }, Date.parse('2026-11-24T09:00:00Z'))!;
    expect(at).toBe('2026-11-29T04:00:00.000Z');
    expect(nextRun({ freq: 'off', email: '', hour: 7, weekday: 0, day: 1 }, 0)).toBeNull();
  });
  it('keeps file content only for the newest entries', () => {
    let l: ExportLog[] = logFixtures();
    const t = templateFixtures()[0];
    for (let i = 0; i < KEEP_FILES + 2; i++) l = addLog(l, { id: `E${i}`, at: '', by: '', entity: 'orders', templateId: t.id, templateName: t.name, rows: 1, file: 'f', trigger: 'manual', status: 'ready', csv: 'x', snapshot: t });
    expect(l.filter((x) => x.csv).length).toBe(KEEP_FILES);
    expect(l[0].csv).toBe('x');
  });
});
