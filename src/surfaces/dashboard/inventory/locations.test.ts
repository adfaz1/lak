import { describe, expect, it } from 'vitest';
import { LOCATIONS, LOC_IDS, bindLocations, locationFixtures, type Location } from '../../merchant/domain';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { disableBlocks, initialLevels, lowStock, newLocationId, sendTransfer, setThresholds, syncStockAlerts, transferFixtures, validateLocation } from '../../merchant/inventory';
import { checkCount, levelRows, newTransfer, skuInfo, thresholdPreview } from './model';

const products = productFixtures();
const levels = initialLevels(products.filter((p) => p.type !== 'digital').flatMap(skusOf));
const info = skuInfo(products);

describe('locations as data', () => {
  it('adds "Dammam branch": named everywhere, listed in levels and usable in transfers; old ids keep working', () => {
    let list: Location[] = locationFixtures();
    bindLocations(() => list);
    const dmm = { name: { ar: 'فرع الدمام', en: 'Dammam branch' }, city: { ar: 'الدمام', en: 'Dammam' } };
    expect(validateLocation({ id: '', ...dmm }, list)).toEqual({});
    const id = newLocationId(dmm.city, list);
    expect(id).toBe('dammam');
    list = [...list, { id, ...dmm, kind: 'branch', address: '', ships: true, pickup: true, active: true, version: 1 }];
    expect([...LOC_IDS]).toEqual(['ryd', 'jed', 'dammam']);
    expect(LOCATIONS.dammam.ar).toBe('فرع الدمام');
    expect(LOCATIONS.ryd.en).toBe('Riyadh warehouse');
    expect(LOCATIONS.unknown.en).toBe('unknown');
    const rows = levelRows(levels, info, { q: 'OUD-100', loc: 'dammam' });
    expect(rows).toEqual([expect.objectContaining({ sku: 'OUD-100', loc: 'dammam', unstocked: true, onHand: 0 })]);
    const t = newTransfer(transferFixtures(), 'OUD-100', 'dammam', levels);
    expect(t).toMatchObject({ to: 'dammam', from: 'ryd' });
    const sent = sendTransfer(levels, { ...t, lines: [{ sku: 'OUD-100', qty: 2, received: 0 }] });
    expect(sent.error).toBeUndefined();
    expect(sent.levels.find((l) => l.sku === 'OUD-100' && l.loc === 'dammam')!.incoming).toBe(2);
    bindLocations(() => locationFixtures());
  });
  it('blocks disabling a location with stock, incoming units, open transfers, or the default one', () => {
    const all = locationFixtures();
    expect(disableBlocks(all[0], all, levels, [])).toEqual(expect.arrayContaining(['default', 'stock']));
    const empty = levels.filter((l) => l.loc !== 'jed');
    expect(disableBlocks(all[1], all, empty, [])).toEqual([]);
    expect(disableBlocks(all[1], all, empty, transferFixtures())).toEqual(['transfers']);
    expect(validateLocation({ id: 'x', name: { ar: 'مستودع جدة', en: '' }, city: { ar: '', en: '' } }, all)).toEqual({ nameAr: 'taken', nameEn: 'required', cityAr: 'required', cityEn: 'required' });
  });
});

describe('reorder points and alerts', () => {
  it('raising the threshold to 10 moves rows to low at once, with one alert per row and no repeat', () => {
    const key = { sku: 'WLT-LTH-01', loc: 'ryd' };
    expect(lowStock(levels).some((l) => l.sku === key.sku && l.loc === 'ryd')).toBe(false);
    expect(thresholdPreview(levels.filter((l) => l.sku === key.sku && l.loc === 'ryd'), 10)).toMatchObject({ becomeLow: 1 });
    const next = setThresholds(levels, [key], 10)!;
    expect(lowStock(next).some((l) => l.sku === key.sku && l.loc === 'ryd')).toBe(true);
    const first = syncStockAlerts(levels, [], 'earlier');
    const second = syncStockAlerts(next, first.alerts, 'now', 1);
    expect(second.raised.map((a) => `${a.sku}@${a.loc}`)).toEqual(['WLT-LTH-01@ryd']);
    expect(syncStockAlerts(next, second.alerts).raised).toEqual([]);
    const back = syncStockAlerts(setThresholds(next, [key], 3)!, second.alerts);
    expect(back.resolved).toBe(1);
    expect(setThresholds(levels, [key], -1)).toBeNull();
  });
});

describe('count import', () => {
  it('shows the difference per SKU and location and flags unknown SKUs, locations and repeats', () => {
    const known = new Set(levels.map((l) => l.sku));
    const rows = checkCount([['OUD-100', 'ryd', '7'], ['NOPE', 'ryd', '1'], ['OUD-100', 'mars', '1'], ['OUD-100', 'ryd', '٣'], ['BAG-LTH-01', 'Jeddah warehouse', 'x']], ['sku', 'location_id', 'on_hand'], levels, known);
    expect(rows[0]).toMatchObject({ before: 4, counted: 7, delta: 3, problem: null });
    expect(rows.slice(1).map((r) => r.problem)).toEqual(['sku', 'loc', 'dup', 'qty']);
  });
});
