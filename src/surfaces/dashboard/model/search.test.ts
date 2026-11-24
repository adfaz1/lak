import { describe, expect, it } from 'vitest';
import { allOrders } from '../../merchant/domain';
import { productFixtures } from '../../merchant/catalog';
import { customerFixtures } from '../../merchant/workspace';
import { globalSearch, norm, seeAllPath, toolHits } from './search';
import { TOOLS } from './tools';

const orders = allOrders();
const data = { orders, products: productFixtures(), customers: customerFixtures(), role: 'owner' as const, canSee: () => true };
const group = (q: string, kind: string, d = data) => globalSearch(q, d).groups.find((g) => g.kind === kind);

describe('global search', () => {
  it('normalises Arabic spelling and Arabic-Indic digits', () => {
    expect(norm('إعدادات')).toBe(norm('اعدادات'));
    expect(norm('مخزنة')).toBe(norm('مخزنه'));
    expect(norm('١٠٤٧٩')).toBe('10479');
  });
  it('puts an exact order number first, typed with or without # or Arabic digits', () => {
    const ref = orders[0].ref;
    for (const q of [ref, `#${ref}`, ref.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d])]) {
      const r = globalSearch(q, data);
      expect(r.groups[0].kind).toBe('order');
      expect(r.groups[0].hits[0].id).toBe(ref);
    }
  });
  it('finds products by Arabic name, English name and SKU', () => {
    expect(group('عباية', 'product')?.hits[0].id).toBe('p1');
    expect(group('leather', 'product')?.hits.map((h) => h.id)).toEqual(['p4', 'p5']);
    expect(group('bag-lth', 'product')?.hits[0].id).toBe('p4');
  });
  it('finds customers by name and phone digits, and opens the profile', () => {
    const c = customerFixtures()[0];
    expect(group(c.name.ar, 'customer')?.hits[0]).toMatchObject({ id: c.id, path: `customers/${c.id}` });
    expect(group(c.phone.slice(-4), 'customer')?.hits.some((h) => h.id === c.id)).toBe(true);
  });
  it('finds tools and settings by keywords in either language', () => {
    expect(toolHits('مدى', 'owner').map((h) => h.id)).toContain('payments');
    expect(toolHits('transfer', 'owner').map((h) => h.id)).toContain('inventory-transfers');
    expect(toolHits('سلة متروكة', 'owner').map((h) => h.id)).toEqual(['carts']);
  });
  it('respects the role: hidden sections and tools never appear', () => {
    const r = globalSearch('عباية', { ...data, role: 'fulfilment', canSee: (s) => s !== 'products' });
    expect(r.groups.find((g) => g.kind === 'product')).toBeUndefined();
    expect(toolHits('payout', 'fulfilment')).toEqual([]);
  });
  it('caps each group and reports how many more, with a see-all link keeping the query', () => {
    const r = globalSearch('الرياض', data, 3);
    const o = r.groups.find((g) => g.kind === 'order')!;
    expect(o.hits).toHaveLength(3);
    expect(o.more).toBeGreaterThan(0);
    expect(seeAllPath('order', 'الرياض')).toEqual({ path: 'orders', query: { q: 'الرياض' } });
    expect(globalSearch('   ', data).total).toBe(0);
  });
  it('every tool has both languages and a unique id', () => {
    expect(new Set(TOOLS.map((x) => x.id)).size).toBe(TOOLS.length);
    for (const x of TOOLS) expect(x.label.ar && x.label.en && x.desc.ar && x.desc.en).toBeTruthy();
  });
});
