// Product types in the panel: manual orders (no shipping for non-shippable lines, booking slot, codes on paid,
// bundles hold their parts), inventory (no warehouse stock for downloads/services, codes left, slots, bundle stock)
// and international readiness (shippable products only).
import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf, typeFixtures } from '../../merchant/catalog';
import { allOrders } from '../../merchant/domain';
import { initialLevels } from '../../merchant/inventory';
import { customerFixtures, zoneFixtures } from '../../merchant/workspace';
import { riyadhToday } from '../../merchant/catalog-extras';
import { noticeEvents } from '../../merchant/ops';
import { createManual, deliveryOf, emptyManual, manualQuote, nextAction, skuOptions } from './model';
import { levelRows, skuInfo, typedRows } from '../inventory/model';
import { customsItem } from '../settings/shipping-model';

const ME = { name: 'سارة', role: 'owner' };
const NOW = Date.parse('2026-11-24T12:00:00Z');
const today = riyadhToday();
const products = [...productFixtures(), ...typeFixtures()];
const levels = initialLevels(products.filter((p) => p.type === 'physical' || p.type === 'food').flatMap(skusOf));
const opts = skuOptions(products, levels, today);
const customers = customerFixtures();
const zones = zoneFixtures();
const opt = (sku: string) => opts.find((o) => o.sku === sku)!;

describe('manual order with product types', () => {
  it('lists every type with its own stock measure', () => {
    expect(opt('GFT-100')).toMatchObject({ noShip: 'digital', unlimited: true });
    expect(opt('SRV-ALT-01')).toMatchObject({ noShip: 'service', unlimited: true });
    expect(opt('CLB-OUD-1M')).toMatchObject({ noShip: 'code', total: 5 });
    expect(opt('SES-BLD-01').slots!.length).toBeGreaterThan(0);
    expect(opt('BND-HOS-01').bundle).toHaveLength(3);
    // Exchanges keep warehouse products only.
    expect(skuOptions(products, levels, today, true).some((o) => o.noShip || o.bundle)).toBe(false);
  });
  it('asks no city or address when nothing ships; a booking needs a slot; no COD without delivery', () => {
    const base = { ...emptyManual(), customerId: 'C-1005' };
    const q = manualQuote({ ...base, lines: [{ sku: 'CLB-OUD-1M', qty: '1' }, { sku: 'SES-BLD-01', qty: '1' }] }, opts, zones, customers);
    expect(q.ships).toBe(false);
    expect(q.shipping).toBe(0);
    expect(q.errors).toEqual(['slot']);
    const cod = manualQuote({ ...base, pay: 'cod', lines: [{ sku: 'CLB-OUD-1M', qty: '١' }] }, opts, zones, customers);
    expect(cod.errors).toEqual(['codNoShip']);
    const mixed = manualQuote({ ...base, lines: [{ sku: 'CLB-OUD-1M', qty: '1' }, { sku: 'OUD-100', qty: '1' }] }, opts, zones, customers);
    expect(mixed.errors).toEqual(expect.arrayContaining(['city', 'address']));
    const full = opt('SES-BLD-01').slots!.find((s) => s.left === 0);
    if (full) expect(manualQuote({ ...base, lines: [{ sku: 'SES-BLD-01', qty: '1', slot: full.id }] }, opts, zones, customers).errors).toEqual(['stock']);
  });
  it('creates a paid code + booking order: codes given and sent, place booked, nothing held, done on create', () => {
    const slot = opt('SES-BLD-01').slots!.find((s) => s.left > 0)!;
    const d = { ...emptyManual(), customerId: 'C-1005', pay: 'cash' as const, lines: [{ sku: 'CLB-OUD-1M', qty: '2' }, { sku: 'SES-BLD-01', qty: '1', slot: slot.id }] };
    const r = createManual(d, { orders: allOrders(), levels, customers, products }, opts, zones, ME, NOW);
    expect(r.errors).toEqual([]);
    const o = r.order!;
    expect(o).toMatchObject({ pay: 'paid', ful: 'done', ship: 'none', fee: 0 });
    expect(o.address).toBeUndefined();
    expect(o.items.map((i) => i.noShip)).toEqual(['code', 'booking']);
    expect(o.extras?.codes?.[0].codes).toHaveLength(2);
    expect(o.extras?.bookings?.[0]).toMatchObject({ date: slot.date, time: slot.time, qty: 1 });
    expect(r.levels).toBe(levels);
    expect(r.products!.find((p) => p.id === 'p20')!.spec!.codes!.filter((c) => c.ref === o.ref)).toHaveLength(2);
    const booked = r.products!.find((p) => p.id === 'p19')!.spec!.slots!.find((s) => s.id === slot.id)!;
    expect(booked.booked).toBe(products.find((p) => p.id === 'p19')!.spec!.slots!.find((s) => s.id === slot.id)!.booked + 1);
    expect(deliveryOf(o)).toBe('scheduled');
    expect(nextAction(o).reason).toBe('scheduled');
    expect(noticeEvents(undefined, o).map((e) => e.event)).toEqual(['placed', 'digitalDelivered']);
  });
  it('a payment link gives no codes yet; a bundle holds each part and lists it under the bundle', () => {
    const link = createManual({ ...emptyManual(), customerId: 'C-1005', pay: 'link', lines: [{ sku: 'CLB-OUD-1M', qty: '1' }] }, { orders: allOrders(), levels, customers, products }, opts, zones, ME, NOW);
    expect(link.order!.extras?.codes).toBeUndefined();
    expect(link.order!.ful).toBe('none');
    const b = createManual({ ...emptyManual(), customerId: 'C-1005', city: 'Riyadh', address: 'Al Olaya', lines: [{ sku: 'BND-HOS-01', qty: '1' }] }, { orders: allOrders(), levels, customers, products }, opts, zones, ME, NOW);
    expect(b.errors).toEqual([]);
    expect(b.order!.items.map((i) => [i.sku, i.unit > 0])).toEqual([['BND-HOS-01', true], ['COF-SET-01', false], ['CUP-POR-06', false], ['BKH-MAM-01', false]]);
    expect(b.order!.items.slice(1).every((i) => Object.values(i.reserved ?? {}).reduce((a, n) => a! + n!, 0) === 1)).toBe(true);
  });
});

describe('inventory and international readiness by type', () => {
  it('levels never list download, code, service or booking SKUs', () => {
    const withStray = initialLevels([...products.filter((p) => p.type === 'physical').flatMap(skusOf), 'CLB-OUD-1M', 'GFT-100']);
    const rows = levelRows(withStray, skuInfo(products), { q: '', loc: '' });
    expect(rows.some((r) => r.sku === 'CLB-OUD-1M' || r.sku === 'GFT-100')).toBe(false);
    expect(rows.some((r) => r.sku === 'OUD-100')).toBe(true);
  });
  it('codes show codes left, bookings their slots, bundles stock from parts; downloads and services no limit', () => {
    const rows = typedRows(products, levels, today);
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(by('p20').codes).toEqual({ left: 5, sold: 0 });
    expect(by('p19').slots!.every((s) => s.left >= 0 && s.left <= s.cap)).toBe(true);
    expect(by('p22').bundle!.parts.map((x) => x.sku)).toEqual(['COF-SET-01', 'CUP-POR-06', 'BKH-MAM-01']);
    expect(by('p22').bundle!.stock).toBe(Math.min(...by('p22').bundle!.parts.map((x) => x.available)));
    expect(by('p10')).toMatchObject({ type: 'digital' });
    expect(by('p10').codes).toBeUndefined();
    expect(typedRows(products, levels, today, 'oud club').map((r) => r.id)).toEqual(['p20']);
  });
  it('international readiness lists physical goods and food only', () => {
    expect(products.filter(customsItem).map((p) => p.type)).not.toContain('code');
    expect(['physical', 'food', 'bundle', 'digital', 'service', 'booking', 'code'].map((type) => customsItem({ type: type as never }))).toEqual([true, true, false, false, false, false, false]);
  });
});
