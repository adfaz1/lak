import { describe, expect, it } from 'vitest';
import { allOrders } from '../../merchant/domain';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { cartFixtures, couponFixtures } from '../../merchant/growth';
import { financeFixtures } from '../../merchant/finance';
import { initialLevels } from '../../merchant/inventory';
import { addNotify, addSearch, addWish, normTerm, notifyFixtures, redirectFor, searchFixtures, setRedirect, wishFixtures } from '../../merchant/demand';
import { subStatusFixtures, setSubStatus } from '../../merchant/ops';
import { history } from './model';
import { compareRange, presetRange, range } from './range';
import { buildReport, tableCsv, type Inputs } from './reports';
import { financeFigures, matchesNow, reasonOf, returnRecords, termStats } from './demand-reports';

const products = productFixtures();
const base: Inputs = {
  orders: allOrders(), series: history(), products, carts: cartFixtures(), coupons: couponFixtures(), txs: financeFixtures().txs, names: true,
  searches: searchFixtures(), redirects: [], notify: notifyFixtures(), wishes: wishFixtures(),
  levels: initialLevels(products.filter((p) => p.type !== 'digital').flatMap(skusOf)), subs: subStatusFixtures(),
};
const r = presetRange('30');

describe('search terms', () => {
  it('groups spelling variants and Arabic digits, and ignores immediate repeats', () => {
    expect(normTerm('  عبايه  ')).toBe(normTerm('عباية'));
    expect(normTerm('أحمد ٢')).toBe('احمد 2');
    let l = addSearch([], 'عباية', 3, '2026-11-24', 'ar');
    l = addSearch(l, 'عبايه', 3, '2026-11-24', 'ar');
    expect(l).toHaveLength(1);
    expect(addSearch(l, '   ', 0, '2026-11-24', 'ar')).toBe(l);
  });
  it('ranks terms, counts the comparison period and flags terms that still find nothing', () => {
    const rows = termStats(base.searches!, r, compareRange(r, 'prev'));
    expect(rows[0].term).toBe(normTerm('عباية'));
    expect(rows[0].prev).not.toBeNull();
    const rep = buildReport('search', base, r, compareRange(r, 'prev'));
    const zero = rep.tables.find((t) => t.id === 'search-zero')!;
    expect(zero.rows.some((x) => x.term === 'شماغ' && typeof x['_href:go'] === 'string')).toBe(true);
    // The dates product is a draft, but the gift box with dates is live, so «تمر» finds it now.
    expect(matchesNow('تمر', products)).toBe(1);
    expect(matchesNow('عسل', products)).toBe(0);
    expect(matchesNow('عباية', products)).toBeGreaterThan(0);
  });
  it('a redirect resolves the term and removes its action', () => {
    const red = setRedirect([], { term: normTerm('شماغ'), raw: 'شماغ', target: { kind: 'category', id: 'fashion', name: { ar: 'أزياء', en: 'Fashion' } }, by: 'owner', at: '' });
    expect(redirectFor(red, 'شماغ ')?.target.id).toBe('fashion');
    const rep = buildReport('search', { ...base, redirects: red }, r, null);
    const row = rep.tables[0].rows.find((x) => x.term === 'شماغ')!;
    expect(row.now).toMatchObject({ en: 'Redirected to Fashion' });
    expect(rep.metrics.find((m) => m.id === 'lost')!.value).toBeLessThan(buildReport('search', base, r, null).metrics.find((m) => m.id === 'lost')!.value!);
  });
});

describe('financial summary', () => {
  it('collected − VAT − fees = net, every line defined, and CSV drops action columns', () => {
    const f = financeFigures(base, presetRange('mtd'));
    expect(f.gross - f.discounts + f.shipping - (f.refunds ?? 0)).toBe(f.collected);
    expect(f.collected - f.vat - (f.fees ?? 0)).toBe(f.net);
    expect(f.vat).toBe(Math.round((f.collected * 15) / 115));
    const rep = buildReport('finance', base, presetRange('mtd'), null);
    const csv = tableCsv(rep.tables[0], 'en', { from: 'a', to: 'b', cmp: 'off' });
    expect(csv).not.toContain('Action');
    expect(csv).toContain('Net revenue');
  });
  it('refunds and fees are no data (not zero) before the ledger starts', () => {
    const f = financeFigures(base, range('2026-09-01', '2026-09-30'));
    expect(f.refunds).toBeNull();
    expect(f.fees).toBeNull();
  });
});

describe('returns', () => {
  it('reads stored reason keys and storefront text alike', () => {
    expect(reasonOf('size')).toBe('size');
    expect(reasonOf('مقاس غير مناسب · Wrong size')).toBe('size');
    expect(reasonOf('غير مطابق للوصف · Not as described')).toBe('notAsDescribed');
    expect(reasonOf('mind')).toBe('changedMind');
  });
  it('seeded history is stable and the report splits by reason and product', () => {
    expect(returnRecords(base.orders)).toEqual(returnRecords(base.orders));
    const rep = buildReport('returns', base, presetRange('90'), compareRange(presetRange('90'), 'prev'));
    expect(rep.tables[0].rows.length).toBeGreaterThan(0);
    const rate = rep.metrics.find((m) => m.id === 'rate')!.value!;
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(10);
  });
});

describe('demand', () => {
  it('offers the alert when stock is back and restock when it is not', () => {
    const rep = buildReport('demand', base, presetRange('90'), null);
    const rows = rep.tables[0].rows;
    const oud = rows.find((x) => x._pid === 'p3')!;
    expect(oud.waiting).toBeGreaterThan(0);
    expect(String(oud['_href:go'])).toContain('alert=p3');
    const none = rows.find((x) => x._pid === 'p2')!; // all already alerted
    expect(none.waiting).toBe(0);
    expect(none.go).toBeNull();
    const out = buildReport('demand', { ...base, levels: base.levels!.map((l) => (l.sku === 'OUD-100' ? { ...l, onHand: 0, reserved: 0 } : l)) }, presetRange('90'), null);
    expect(String(out.tables[0].rows.find((x) => x._pid === 'p3')!['_href:go'])).toContain('inventory');
  });
  it('records storefront requests and wishlist events', () => {
    expect(addNotify([], 'p1', 'ABY-LIN-BLA-M', '2026-11-24')[0]).toMatchObject({ state: 'waiting', sku: 'ABY-LIN-BLA-M' });
    expect(addWish([], 'p4', 'remove', '2026-11-24')[0].kind).toBe('remove');
  });
});

describe('sub-statuses', () => {
  it('counts orders carrying each sub-status now, with a link to the filtered orders', () => {
    const subs = subStatusFixtures();
    const o = base.orders.find((x) => x.pay === 'paid' && x.ship === 'none' && !x.cancelled)!;
    const set = setSubStatus(o, subs[0], { name: 'سارة', role: 'owner' }, Date.now() - 50 * 3600000);
    const rep = buildReport('substatus', { ...base, orders: base.orders.map((x) => (x.ref === o.ref ? set : x)) }, r, null);
    const row = rep.tables[0].rows.find((x) => typeof x.name === 'object' && (x.name as { en: string }).en === subs[0].name.en)!;
    expect(row.now).toBe(1);
    expect(row.stuck).toBe(1);
    expect(String(row['_href:go'])).toContain('sub=SS-1');
    expect(rep.tables[0].rows.some((x) => (x.name as { en: string }).en === 'Customer contacted')).toBe(false); // excluded from reports
  });
});
