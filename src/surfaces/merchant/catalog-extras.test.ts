import { describe, expect, it } from 'vitest';
import { productFixtures, typeFixtures, type Product } from './catalog';
import { initialLevels } from './inventory';
import {
  addDays, assignCodes, bookSlots, buildOrderExtras, bundleStock, campaignCover, campaignState, campaignTake, catalogXFixtures, chartGaps, checkAnswers, checkBasket,
  checkValue, checkoutQuestions, emptySpecDraft, filterKeys, filterPreview, fromSpecDraft, generateSlots, limitsFor, orderExtrasText, parseCodes, restrictionOverlaps,
  similarBrands, stockFor, storeX, toSpecDraft, typeChangeLoss, validateCampaign, validateChart, validateFieldDef, validateRestriction, validateSpec, type Campaign,
} from './catalog-extras';
import { shipOptions, toStoreProducts } from '../storefront/bridge';

const TODAY = '2026-11-24';
const all = () => [...productFixtures(), ...typeFixtures()];
const byId = (id: string) => all().find((p) => p.id === id)!;
const levels = () => initialLevels(all().filter((p) => p.type === 'physical' || p.type === 'food').flatMap((p) => (p.variants.length ? p.variants.map((v) => v.sku) : [p.sku])));

describe('product types', () => {
  it('codes: one per line, repeats, already-sold and malformed codes are reported, Arabic digits accepted', () => {
    const r = parseCodes('ABCD-١٢٣٤\nabcd-1234\n\nXY\nSOLD-0001', [{ code: 'SOLD-0001', ref: '1001' }]);
    expect(r.codes).toEqual(['ABCD-1234']);
    expect(r.repeated).toEqual(['abcd-1234']);
    expect(r.bad).toEqual(['XY']);
    expect(r.alreadySold).toEqual(['SOLD-0001']);
  });
  it('each type asks for its own required fields', () => {
    const ctx = { today: TODAY, skus: new Set(['COF-SET-01', 'CUP-POR-06']), ownSkus: ['BND-1'] };
    expect(validateSpec('digital', emptySpecDraft(), ctx)['spec.file']).toBe('required');
    expect(validateSpec('code', emptySpecDraft(), ctx)['spec.codes']).toBe('required');
    expect(validateSpec('booking', emptySpecDraft(), ctx)['spec.slots']).toBe('required');
    expect(validateSpec('bundle', { ...emptySpecDraft(), bundle: [{ sku: 'COF-SET-01', qty: '1' }] }, ctx)['spec.bundle']).toBe('few');
    expect(validateSpec('bundle', { ...emptySpecDraft(), bundle: [{ sku: 'COF-SET-01', qty: '1' }, { sku: 'NOPE', qty: '1' }, { sku: 'BND-1', qty: '1' }] }, ctx)).toMatchObject({ 'spec.bundle.1': 'component', 'spec.bundle.2': 'self' });
    expect(validateSpec('food', { ...emptySpecDraft(), prepMinutes: 'x' }, ctx)['spec.prep']).toBe('number');
    expect(validateSpec('physical', emptySpecDraft(), ctx)).toEqual({});
  });
  it('booking slots: generated per day and time without duplicates; capacity cannot drop below bookings', () => {
    const s = generateSlots(TODAY, addDays(TODAY, 2), ['17:00', '19:30', '17:00', 'bad'], 4, [{ date: TODAY, time: '17:00' }], 's');
    expect(s).toHaveLength(5);
    const d = { ...emptySpecDraft(), slots: [{ id: 'a', date: TODAY, time: '17:00', cap: '1', booked: 2 }] };
    expect(validateSpec('booking', d, { today: TODAY, skus: new Set(), ownSkus: [] })['spec.slot.0.cap']).toBe('booked');
  });
  it('stock follows the type: codes left, open places, scarcest component, none for services', () => {
    const lv = levels();
    expect(stockFor(byId('p20'), lv, TODAY)).toBe(5);
    expect(stockFor(byId('p21'), lv, TODAY)).toBeNull();
    const booking = byId('p19');
    expect(stockFor(booking, lv, '2000-01-01')).toBe(booking.spec!.slots!.reduce((n, s) => n + Math.max(0, s.cap - s.booked), 0));
    expect(stockFor(byId('p22'), lv, TODAY)).toBe(bundleStock(byId('p22').spec!.bundle!, lv));
    expect(bundleStock([{ sku: 'COF-SET-01', qty: 1000 }], lv)).toBe(0);
  });
  it('a spec round-trips through the editor draft and keeps only its type’s keys', () => {
    const p = byId('p20');
    const back = fromSpecDraft('code', toSpecDraft(p.spec));
    expect(back?.codes?.map((c) => c.code)).toEqual(p.spec!.codes!.map((c) => c.code));
    expect(Object.keys(fromSpecDraft('food', toSpecDraft(byId('p23').spec))!)).toEqual(['prepMinutes', 'perishable', 'shelfDays']);
    expect(fromSpecDraft('physical', emptySpecDraft())).toBeUndefined();
  });
  it('changing type lists what is lost; same type loses nothing', () => {
    const spec = toSpecDraft(byId('p20').spec);
    expect(typeChangeLoss('code', 'code', { spec, weight: '', variants: 0, skuHasStock: false })).toEqual([]);
    const loss = typeChangeLoss('code', 'physical', { spec, weight: '', variants: 0, skuHasStock: false });
    expect(loss[0].en).toContain('5 unsold');
    expect(typeChangeLoss('physical', 'service', { spec: emptySpecDraft(), weight: '650', variants: 6, skuHasStock: true }).map((x) => x.en).join(' ')).toMatch(/weight.*Warehouse stock.*variants/);
  });
});

describe('custom fields', () => {
  const x = catalogXFixtures(TODAY);
  it('checks definitions: labels, at least two options, filters only for choice/number', () => {
    const f = { ...x.fields[0], id: 'new', label: { ar: 'الخامة', en: 'Fabric' }, options: [{ ar: 'قطن', en: 'Cotton' }] };
    expect(validateFieldDef(f, x.fields)).toEqual({ labelAr: 'taken', options: 'options' });
    expect(validateFieldDef({ ...f, label: { ar: 'س', en: 'Q' }, kind: 'text', filterable: true }, x.fields).filterable).toBe('filter');
  });
  it('checks answers (Arabic digits ok) and appointment dates in the past', () => {
    const num = x.fields.find((f) => f.kind === 'number')!;
    expect(checkValue(num, '١٤٢')).toBeNull();
    expect(checkValue(num, 'abc')).toBe('number');
    expect(checkValue({ ...num, required: true }, '')).toBe('required');
    const qs = checkoutQuestions(x.fields, [{ productId: 'p21', name: byId('p21').name, type: 'service', cat: byId('p21').category, appointment: true }]);
    expect(qs.map((q) => q.id)).toEqual(['o-measure', 'appt:p21']);
    expect(checkAnswers(qs, { 'appt:p21': '2000-01-01' }, TODAY)).toEqual({ 'appt:p21': 'past' });
  });
  it('order questions are asked only when the bag holds a linked type or category', () => {
    const gift = byId('p18');
    expect(checkoutQuestions(x.fields, [{ productId: 'p1', name: byId('p1').name, type: 'physical', cat: byId('p1').category }])).toEqual([]);
    expect(checkoutQuestions(x.fields, [{ productId: 'p18', name: gift.name, type: 'physical', cat: gift.category }]).map((q) => q.id)).toEqual(['o-gift-name']);
  });
});

describe('size charts, brands and filters', () => {
  const x = catalogXFixtures(TODAY);
  it('a chart reports sizes products sell that it does not cover', () => {
    const g = chartGaps(x.charts[0], all());
    expect(g.missing).toEqual(expect.arrayContaining(['54', '56', '58']));
    expect(validateChart({ ...x.charts[0], id: 'other' }, x.charts).cats).toBe('taken');
    expect(validateChart({ ...x.charts[0], rows: [{ label: { ar: 'ص', en: 'C' }, values: ['88-92', 'x'] }] }, x.charts)['row.0.1']).toBe('value');
  });
  it('flags brands typed twice', () => {
    expect(similarBrands([...x.brands, { ...x.brands[1], id: 'dup', name: { ar: 'بيت  العود', en: 'Al Oud House' } }])).toHaveLength(1);
  });
  it('filter preview counts values and hides filters with too few', () => {
    const items = [{ brand: 'b-oud', colors: [], sizes: [], inStock: true, price: 100 }, { brand: 'b-oud', colors: [], sizes: [], inStock: true, price: 50_000 }];
    const p = filterPreview(items, filterKeys(x.filters, x.fields), x.filters, { brands: x.brands, fields: x.fields });
    expect(p.find((f) => f.key === 'brand')).toMatchObject({ hiddenWhy: 'few', values: [{ value: 'b-oud', count: 2 }] });
    expect(p.find((f) => f.key === 'price')?.hiddenWhy).toBeNull();
    expect(filterKeys(x.filters, x.fields)).toContain('field:f-material');
  });
});

describe('pre-orders and restrictions', () => {
  const x = catalogXFixtures(TODAY);
  const c: Campaign = x.campaigns[0];
  it('campaign states and validation (dates, cap, overlap)', () => {
    expect(campaignState(c, TODAY)).toBe('live');
    expect(campaignState({ ...c, taken: 40 }, TODAY)).toBe('full');
    expect(campaignState(c, addDays(c.ends, 1))).toBe('ended');
    expect(validateCampaign({ ...c, id: 'n2' }, x.campaigns, TODAY, false).products).toBe('overlap');
    expect(validateCampaign({ ...c, cap: 5 }, x.campaigns, TODAY, false).cap).toBe('cap');
    expect(validateCampaign({ ...c, pay: 'deposit', depositPct: 95 }, x.campaigns, TODAY, false).deposit).toBe('deposit');
  });
  it('coverage: promised units against incoming and on-hand stock', () => {
    const cov = campaignCover(c, all(), levels());
    expect(cov.promised).toBe(40);
    expect(cov.uncovered).toBe(Math.max(0, 40 - cov.incoming - cov.onHand));
  });
  it('the strictest limit wins; basket problems for max (with earlier purchases), min and city; age is asked', () => {
    const extra = { ...x.restrictions[0], id: 'r-x', maxPerCustomer: 5 };
    expect(limitsFor([...x.restrictions, extra], byId('p13')).max).toBe(2);
    expect(restrictionOverlaps([...x.restrictions, extra], all())).toHaveLength(1);
    const r = checkBasket([{ productId: 'p13', qty: 1 }, { productId: 'p23', qty: 1 }, { productId: 'p14', qty: 1 }], { products: all(), rules: x.restrictions, city: 'dammam', prior: { p13: 2 } });
    expect(r.problems.map((p) => p.kind).sort()).toEqual(['city', 'max', 'min']);
    expect(r.age).toBe(18);
    expect(validateRestriction({ ...x.restrictions[0], maxPerCustomer: 1, minQty: 3 }).min).toBe('minmax');
    expect(validateRestriction({ ...x.restrictions[0], productIds: [], maxPerCustomer: null }).rule).toBe('rule');
  });
});

describe('checkout to order', () => {
  const x = catalogXFixtures(TODAY);
  it('codes are delivered once per order and a short pool is reported', () => {
    const lines = [{ productId: 'p20', sku: 'CLB-OUD-1M', qty: 2 }];
    const a = assignCodes(all(), lines, '2001');
    expect(a.codes[0].codes).toHaveLength(2);
    const again = assignCodes(a.products, lines, '2001');
    expect(again.codes[0].codes).toEqual(a.codes[0].codes);
    expect(again.products.find((p) => p.id === 'p20')!.spec!.codes!.filter((c) => !c.ref)).toHaveLength(3);
    expect(assignCodes(a.products, [{ ...lines[0], qty: 9 }], '2002').short).toBe(6);
  });
  it('bookings take places; pre-orders count once; extras carry deposit, balance and answers', () => {
    const slot = byId('p19').spec!.slots![0];
    const booked = bookSlots(all(), [{ productId: 'p19', date: slot.date, time: slot.time, qty: 2 }]);
    expect(booked.find((p) => p.id === 'p19')!.spec!.slots![0].booked).toBe(slot.booked + 2);
    const lv = levels();
    const store = toStoreProducts(all(), lv, x, TODAY);
    const p13 = store.find((p) => p.id === 'p13')!;
    expect(p13.x?.preorder?.left).toBe(28);
    expect(p13.variants[0].stock).toBe(28);
    const qs = checkoutQuestions(x.fields, [{ productId: 'p18', name: byId('p18').name, type: 'physical', cat: byId('p18').category }]);
    const e = buildOrderExtras([{ productId: 'p13', vid: p13.variants[0].id, sku: 'OUD-ROY-50', qty: 1, amount: 34500 }], store, qs, { 'o-gift-name': 'نورة' }, 18);
    expect(e.preorder).toMatchObject({ deposit: 10350, balance: 24150 });
    expect(e.fields?.[0].value.ar).toBe('نورة');
    expect(orderExtrasText(e, 'en')).toContain('Gift recipient’s name: نورة');
    expect(campaignTake(x.campaigns, [{ productId: 'p13', qty: 1 }], e)[0].taken).toBe(13);
  });
  it('the store: booking slots are options, restricted products hide, services need no delivery, perishables travel chilled', () => {
    const lv = levels();
    const hidden = { ...x, restrictions: [{ ...x.restrictions[0], hideOn: ['online' as const] }] };
    expect(toStoreProducts(all(), lv, hidden, TODAY).some((p) => p.id === 'p13')).toBe(false);
    const store = toStoreProducts(all(), lv, x, '2000-01-01');
    const b = store.find((p) => p.id === 'p19')!;
    expect(b.sizes).toEqual(byId('p19').spec!.slots!.map((s) => `${s.date} ${s.time}`));
    const none = shipOptions({ zones: [] as never, shipping: undefined }, 'riyadh', [{ productId: 'p21', cat: 'fashion', qty: 1, amount: 6000, ships: false }], { now: Date.now() });
    expect(none.map((m) => m.id)).toEqual(['none']);
    const sx = storeX(byId('p23') as Product, x, TODAY, all());
    expect(sx).toMatchObject({ perishable: true, limits: { min: 2, only: ['riyadh', 'jeddah'] } });
  });
});
