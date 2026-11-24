// The online store reads the merchant's shipping setup (dashboard → Settings → Shipping) at checkout and on product pages.
import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf } from '../merchant/catalog';
import { locationFixtures } from '../merchant/domain';
import { initialLevels } from '../merchant/inventory';
import { shippingFixture, zoneFixtures } from '../merchant/workspace';
import { computeTotals, deliveryEstimate, payEligibility } from './domain';
import { reserve, shipFrom, shipOptions } from './bridge';

const MORNING = Date.parse('2026-11-22T07:00:00Z');
const cfg = { zones: zoneFixtures(), shipping: shippingFixture() };
const locations = locationFixtures();
const line = (cat: string, amount: number, weight: number) => ({ productId: 'p1', cat, qty: 1, amount, weight });

describe('store shipping from the merchant setup', () => {
  it('lists every method the setup offers for the city, cheapest first, with the zone promise', () => {
    const opts = shipOptions(cfg, 'riyadh', [line('fashion', 15000, 1000)], { now: MORNING, locations });
    expect(opts.map((o) => [o.id, o.cost])).toEqual([['standard', 2500], ['express', 3900], ['sameday', 4900]]);
    const sameDay = opts.find((o) => o.id === 'sameday')!;
    expect(deliveryEstimate(sameDay, 'riyadh', MORNING)).toMatchObject({ from: MORNING, to: MORNING, handling: 0 });
    expect(shipOptions(cfg, 'abha', [line('fashion', 15000, 1000)], { now: MORNING })).toHaveLength(1);
    expect(shipOptions(cfg, undefined, [line('fashion', 15000, 1000)], { now: MORNING })).toEqual([]);
  });
  it('applies merchant rules with the goods after discount, and computeTotals agrees', () => {
    const big = shipOptions(cfg, 'riyadh', [line('fashion', 60000, 1000)], { now: MORNING });
    expect(big.find((o) => o.id === 'express')?.cost).toBe(0);
    const std = big.find((o) => o.id === 'standard')!;
    expect(computeTotals([{ amount: 60000 }], { ship: std }).shipping).toBe(0);
    const discounted = shipOptions(cfg, 'riyadh', [line('fashion', 60000, 1000)], { now: MORNING, goods: 20000 });
    expect(discounted.find((o) => o.id === 'express')?.cost).toBe(3900);
  });
  it('blocks cash on delivery when the method or the cart is excluded', () => {
    const opts = shipOptions(cfg, 'riyadh', [line('gifts', 15000, 1000)], { now: MORNING });
    const std = opts.find((o) => o.id === 'standard')!;
    expect(payEligibility('cod', { total: 17500, applePayDevice: false, openCod: 0, ship: std.id, codOk: std.codOk, codFee: 0 })).toBe('ship_cod');
    const ok = shipOptions(cfg, 'riyadh', [line('fashion', 15000, 1000)], { now: MORNING }).find((o) => o.id === 'standard')!;
    expect(payEligibility('cod', { total: 17500, applePayDevice: false, openCod: 0, ship: ok.id, codOk: ok.codOk, codFee: 0 })).toBeNull();
  });
  it('reserves stock from the warehouse picked for the customer zone first', () => {
    const levels = initialLevels(productFixtures().filter((p) => p.type !== 'digital').flatMap(skusOf));
    expect(shipFrom(cfg, 'jeddah', locations)).toBe('jed');
    const sku = levels.find((l) => l.loc === 'jed' && l.onHand - l.reserved > 0)!.sku;
    expect(reserve(levels, sku, 1, 'jed').picks).toEqual({ jed: 1 });
  });
});
