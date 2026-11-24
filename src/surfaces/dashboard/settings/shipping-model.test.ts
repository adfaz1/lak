import { describe, expect, it } from 'vitest';
import { productFixtures } from '../../merchant/catalog';
import { locationFixtures } from '../../merchant/domain';
import { shippingFixture, zoneFixtures, type ShippingSetup } from '../../merchant/workspace';
import {
  bulkFill, impact, methodDraft, parseMethod, parseRule, promiseDates, quote, readiness, ruleDraft, summary, validHs, warehouseFor, zoneForCity, type CartIn,
} from './shipping-model';

const zones = zoneFixtures();
const products = productFixtures();
const locations = locationFixtures();
// 10:00 Riyadh on a Sunday (2026-11-22).
const MORNING = Date.parse('2026-11-22T07:00:00Z');
const EVENING = Date.parse('2026-11-22T15:00:00Z');
const light: CartIn = { goods: 15000, weightG: 1000, cats: ['fashion'], productIds: ['p1'] };
const o = { now: MORNING, locations, products };
const ids = (s: ShippingSetup, city: string, cart = light, opts = o) => quote(s, zones, { country: 'SA', city }, cart, opts).offers.map((x) => x.id);

describe('shipping quote', () => {
  it('shows standard, express and same-day in Riyadh, cheapest first, with zone pricing for standard', () => {
    const q = quote(shippingFixture(), zones, { country: 'SA', city: 'riyadh' }, light, o);
    expect(q.offers.map((x) => [x.id, x.price])).toEqual([['standard', 2500], ['express', 3900], ['sameday', 4900]]);
    expect(q.zone?.id).toBe('z1');
    expect(q.warehouse).toMatchObject({ id: 'ryd', auto: true });
    expect(q.hidden.find((h) => h.id === 'economy')?.why.en).toBe('Turned off');
  });
  it('promises same day before the cut-off and next day after it', () => {
    const am = quote(shippingFixture(), zones, { country: 'SA', city: 'riyadh' }, light, o).offers.find((x) => x.id === 'sameday')!;
    const pm = quote(shippingFixture(), zones, { country: 'SA', city: 'riyadh' }, light, { ...o, now: EVENING }).offers.find((x) => x.id === 'sameday')!;
    expect([am.today, am.handling]).toEqual([true, 0]);
    expect([pm.today, pm.handling]).toEqual([false, 1]);
    expect(promiseDates(am, MORNING).to).toBe(MORNING);
  });
  it('applies rules: free express over SAR 500 in Riyadh, express hidden for heavy carts', () => {
    const big = { ...light, goods: 60000 };
    expect(quote(shippingFixture(), zones, { country: 'SA', city: 'riyadh' }, big, o).offers.find((x) => x.id === 'express')).toMatchObject({ price: 0, base: 3900 });
    expect(quote(shippingFixture(), zones, { country: 'SA', city: 'jeddah' }, big, o).offers.find((x) => x.id === 'express')?.price).toBe(3900);
    const heavy = quote(shippingFixture(), zones, { country: 'SA', city: 'riyadh' }, { ...light, weightG: 16000 }, o);
    expect(heavy.hidden.find((h) => h.id === 'express')?.why.en).toContain('Hide express for heavy carts');
    expect(heavy.hidden.find((h) => h.id === 'sameday')?.why.en).toBe('Heavier than 10 kg');
  });
  it('limits carriers to the cities they serve and adds remote transit from the zone promise', () => {
    expect(ids(shippingFixture(), 'abha')).toEqual(['standard']);
    const abha = quote(shippingFixture(), zones, { country: 'SA', city: 'abha' }, light, o).offers[0];
    expect([abha.handling, abha.transit]).toEqual([2, [3, 5]]);
    expect(abha.price).toBe(2500);
  });
  it('uses the zone free-shipping threshold for zone-priced methods', () => {
    const q = quote(shippingFixture(), zones, { country: 'SA', city: 'riyadh' }, { ...light, goods: 30000 }, o).offers.find((x) => x.id === 'standard')!;
    expect(q.price).toBe(0);
    expect(quote(shippingFixture(), zones, { country: 'SA', city: 'riyadh' }, light, o).offers.find((x) => x.id === 'standard')?.freeFrom).toBe(30000);
  });
  it('shows refrigerated only for carts with fragrance, and international only abroad with ready products', () => {
    const s = shippingFixture();
    s.methods = s.methods.map((m) => (m.id === 'cold' || m.id === 'intl' ? { ...m, on: true } : m));
    expect(ids(s, 'riyadh')).not.toContain('cold');
    expect(ids(s, 'riyadh', { ...light, cats: ['fragrance'] })).toContain('cold');
    const abroad = quote(s, zones, { country: 'AE' }, light, o);
    expect(abroad.hidden.find((h) => h.id === 'intl')?.why.en).toContain('needs action');
    s.carriers = s.carriers.map((c) => (c.id === 'ce' ? { ...c, state: 'connected' } : c));
    expect(quote(s, zones, { country: 'AE' }, { ...light, productIds: ['p4'] }, o).hidden.find((h) => h.id === 'intl')?.why.en).toBe('1 product(s) not ready for customs');
    expect(quote(s, zones, { country: 'AE' }, light, o).offers.map((x) => x.id)).toEqual(['intl']);
  });
  it('offers showroom pickup only when the location allows pickup, in its city, without COD', () => {
    const s = shippingFixture();
    s.methods = s.methods.map((m) => (m.id === 'pickup' ? { ...m, on: true } : m));
    expect(quote(s, zones, { country: 'SA', city: 'riyadh' }, light, o).hidden.find((h) => h.id === 'pickup')?.why.en).toContain('doesn’t allow pickup');
    const locs = locations.map((l) => (l.id === 'ryd' ? { ...l, pickup: true } : l));
    const p = quote(s, zones, { country: 'SA', city: 'riyadh' }, light, { ...o, locations: locs }).offers.find((x) => x.id === 'pickup')!;
    expect([p.price, p.codOk]).toEqual([0, false]);
    expect(quote(s, zones, { country: 'SA', city: 'jeddah' }, light, { ...o, locations: locs }).offers.some((x) => x.id === 'pickup')).toBe(false);
  });
  it('applies COD rules and exceptions', () => {
    const s = shippingFixture();
    const std = (cart: CartIn, setup = s) => quote(setup, zones, { country: 'SA', city: 'riyadh' }, cart, o).offers.find((x) => x.id === 'standard')!;
    expect(std(light).codOk).toBe(true);
    expect(std({ ...light, cats: ['gifts'] }).codOk).toBe(false);
    expect(std(light, { ...s, cod: { ...s.cod, exceptCities: ['riyadh'] } }).codWhy?.en).toBe('Excluded in this city');
    expect(quote(s, zones, { country: 'SA', city: 'riyadh' }, light, o).offers.find((x) => x.id === 'sameday')?.codOk).toBe(false);
  });
  it('picks the warehouse by zone, falling back to the default when the chosen one cannot ship', () => {
    const s = shippingFixture();
    expect(warehouseFor(s, zoneForCity(zones, { ar: 'جدة', en: 'Jeddah' }), locations)?.id).toBe('jed');
    expect(warehouseFor({ ...s, autoWarehouse: false }, zones[1], locations)).toMatchObject({ id: 'ryd', auto: false });
    expect(warehouseFor(s, zones[1], locations.map((l) => (l.id === 'jed' ? { ...l, active: false } : l)))?.id).toBe('ryd');
  });
});

describe('international readiness', () => {
  it('scores five fields and accepts Arabic digits in HS codes', () => {
    expect(validHs('٦٢٠٤.٤٩')).toBe(true);
    expect(validHs('62')).toBe(false);
    const p1 = products.find((p) => p.id === 'p1')!;
    expect(readiness(p1, shippingFixture().intl.p1).pct).toBe(100);
    expect(readiness(products.find((p) => p.id === 'p3')!, shippingFixture().intl.p3)).toEqual({ pct: 80, missing: ['descAr'] });
  });
  it('bulk fill only fills empty fields and skips digital products', () => {
    const intl = shippingFixture().intl;
    const r = bulkFill(intl, products, ['p1', 'p3', 'p4', 'p10'], { hs: true, origin: 'SA', desc: true });
    expect(r.changed).toEqual(['p3', 'p4']);
    expect(r.intl.p3.hs).toBe('7013.99');
    expect(r.intl.p4).toEqual({ hs: '4202.21', origin: 'SA', descAr: 'حقيبة جلد بنية', descEn: 'Tan leather handbag' });
    expect(r.intl.p10).toBeUndefined();
  });
});

describe('drafts', () => {
  it('parses a method with Arabic digits and requires cities for same-day', () => {
    const m = shippingFixture().methods.find((x) => x.id === 'express')!;
    const r = parseMethod({ ...methodDraft(m), price: '٤٥', maxKg: '١٢' }, true);
    expect(r.ok && [r.method.price, r.method.maxKg]).toEqual([4500, 12]);
    const sd = shippingFixture().methods.find((x) => x.id === 'sameday')!;
    expect(parseMethod({ ...methodDraft(sd), cities: [] }, true)).toMatchObject({ ok: false, errors: { cities: true } });
  });
  it('rejects a free/hide rule without any condition and an inverted range', () => {
    expect(parseRule({ ...ruleDraft(null, 'r9'), nameAr: 'كل شيء مجاني' }, true)).toMatchObject({ ok: false, errors: { when: true } });
    expect(parseRule({ ...ruleDraft(null, 'r9'), nameAr: 'x', cartMin: '500', cartMax: '100' }, true)).toMatchObject({ ok: false, errors: { range: true } });
    const ok = parseRule({ ...ruleDraft(null, 'r9'), nameAr: 'رسوم الوزن', kgMin: '٥', then: 'surcharge', value: '15' }, true);
    expect(ok.ok && ok.rule).toMatchObject({ when: { kgMin: 5 }, then: { kind: 'surcharge', v: 1500 } });
  });
  it('previews the impact of a change across cities and sample carts', () => {
    const before = shippingFixture();
    const after = { ...before, methods: before.methods.map((m) => (m.id === 'sameday' ? { ...m, cities: ['riyadh', 'jeddah'] } : m)) };
    const ch = impact(before, after, zones, o);
    expect(ch.every((c) => c.city === 'jeddah' && c.before === null && c.after === 4900)).toBe(true);
    expect(ch.map((c) => c.cart)).toEqual(['light', 'big']);
  });
  it('summarises methods, rules and readiness', () => {
    expect(summary(shippingFixture(), products)).toMatchObject({ methodsOn: 3, methods: 7, rulesOn: 2, ready: 1, carriersAction: 1 });
  });
});
