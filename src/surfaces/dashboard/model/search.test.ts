import { describe, expect, it } from 'vitest';
import { allOrders } from '../../merchant/domain';
import { productFixtures } from '../../merchant/catalog';
import { customerFixtures } from '../../merchant/workspace';
import { globalSearch, norm, seeAllPath, toolHits, type SearchData } from './search';
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
    expect(group('leather', 'product')?.hits.map((h) => h.id)).toEqual(['p4', 'p5', 'p17']);
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
    // The carts list comes first; the reminder sequence for abandoned carts is found by the same words.
    expect(toolHits('سلة متروكة', 'owner').map((h) => h.id)).toEqual(['carts', 'cart-reminders']);
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

describe('tool registry', () => {
  it('matches a route to its most specific tool', async () => {
    const { matchTool } = await import('./tools');
    expect(matchTool(['inventory'], new URLSearchParams('tab=low'))?.id).toBe('inventory-low');
    expect(matchTool(['inventory'], new URLSearchParams(''))?.id).toBe('inventory');
    expect(matchTool(['orders', '10479'], new URLSearchParams(''))).toBeUndefined();
  });
  it('follows role permissions: fulfilment sees no finance or customer tools', async () => {
    const { TOOLS, canUseTool } = await import('./tools');
    const ids = TOOLS.filter((x) => canUseTool(x, 'fulfilment')).map((x) => x.id);
    expect(ids).toContain('orders-needs');
    expect(ids).not.toContain('payouts');
    expect(ids).not.toContain('customers');
  });
});

describe('commands', () => {
  const cmd = (q: string, d: SearchData = data) => globalSearch(q, d).groups.find((g) => g.kind === 'command')?.hits ?? [];
  const order = orders.find((o) => o.pay === 'paid')!;
  it('opens a prefilled coupon draft from Arabic or English, with value and code', () => {
    const [ar] = cmd('كوبون جديد ١٥٪');
    expect(ar).toMatchObject({ id: 'cmd-coupon', path: 'marketing/coupons/new', query: { cp: '1', type: 'percent', value: '15' } });
    const [en] = cmd('new coupon SUMMER20 50 SAR');
    expect(en.query).toMatchObject({ code: 'SUMMER20', type: 'fixed', value: '50' });
    expect(cmd('كوبون شحن مجاني')[0].query).toMatchObject({ type: 'freeShip' });
    expect(cmd('new coupon')[0].query).toBeUndefined();
  });
  it('manual order, add product and transfer with SKU, quantity and destination', () => {
    expect(cmd('طلب يدوي')[0]).toMatchObject({ id: 'cmd-manual-order', path: 'orders/new' });
    expect(cmd('أضف منتج')[0]).toMatchObject({ id: 'cmd-product', path: 'products/new' });
    expect(cmd('add product')[0].id).toBe('cmd-product');
    const t = cmd('تحويل مخزون bag-lth-01 ٥ إلى جدة')[0];
    expect(t).toMatchObject({ id: 'cmd-transfer', path: 'inventory/transfers/new', query: { sku: 'BAG-LTH-01', qty: '5', to: 'jed' } });
    expect(cmd('transfer stock')[0].query).toBeUndefined();
  });
  it('refund, open and invoice an order by number; nothing for an unknown number', () => {
    expect(cmd(`refund ${order.ref}`)[0]).toMatchObject({ id: `cmd-refund-${order.ref}`, path: `orders/${order.ref}`, query: { act: 'refund' } });
    expect(cmd(`استرداد #${order.ref.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d])}`)[0].id).toBe(`cmd-refund-${order.ref}`);
    expect(cmd(`order ${order.ref}`)[0]).toMatchObject({ path: `orders/${order.ref}` });
    expect(cmd(`فاتورة ${order.ref}`)[0]).toMatchObject({ path: 'orders/print', query: { doc: 'invoice', refs: order.ref } });
    expect(cmd('refund 99999')).toEqual([]);
    // Commands come first, then the order itself.
    expect(globalSearch(`refund ${order.ref}`, data).groups.map((g) => g.kind).slice(0, 2)).toEqual(['command', 'order']);
  });
  it('is role-aware: no refund for fulfilment, no coupon or transfer for finance', () => {
    const as = (role: 'fulfilment' | 'finance' | 'marketing') => ({ ...data, role });
    expect(cmd(`refund ${order.ref}`, as('fulfilment'))).toEqual([]);
    expect(cmd('كوبون جديد', as('finance'))).toEqual([]);
    expect(cmd('كوبون جديد', as('marketing'))[0].id).toBe('cmd-coupon');
    expect(cmd('تحويل مخزون', as('finance'))).toEqual([]);
    expect(cmd('طلب يدوي', as('marketing'))).toEqual([]);
  });
  it('plain words are not commands', () => {
    expect(cmd('عباية')).toEqual([]);
    expect(cmd(order.ref)).toEqual([]);
  });
});

describe('settings by their own labels', () => {
  it('finds guest checkout and lands on that section', async () => {
    const { settingHits } = await import('./search');
    const h = settingHits('الشراء كضيف', 'owner')[0];
    expect(h).toMatchObject({ kind: 'setting', id: 'checkout-guest', path: 'settings/checkout', query: { focus: 'ck-g' } });
    expect(settingHits('guest checkout', 'owner')[0].id).toBe('checkout-guest');
    expect(settingHits('الرقم الضريبي', 'owner').map((x) => x.id)).toContain('kyc-vat');
    expect(settingHits('zzz-none', 'owner')).toEqual([]);
    expect(settingHits('cutoff', 'owner')[0]).toMatchObject({ path: 'settings/shipping', query: { tab: 'zones', focus: 'zn-cut' } });
  });
  it('hides settings the role cannot open', async () => {
    const { settingHits } = await import('./search');
    expect(settingHits('الشراء كضيف', 'marketing')).toEqual([]);
    expect(settingHits('الرقم الضريبي', 'fulfilment')).toEqual([]);
    expect(settingHits('الرقم الضريبي', 'finance').length).toBeGreaterThan(0);
  });
  it('every setting field points at a real category', async () => {
    const { SETTING_FIELDS } = await import('../settings/fields');
    const { isCat } = await import('../settings/model');
    for (const f of SETTING_FIELDS) expect(isCat(f.cat)).toBe(true);
    expect(new Set(SETTING_FIELDS.map((f) => f.id)).size).toBe(SETTING_FIELDS.length);
  });
});
