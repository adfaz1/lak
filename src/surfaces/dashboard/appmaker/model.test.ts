import { describe, expect, it } from 'vitest';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { initialLevels } from '../../merchant/inventory';
import { apply, createRelease, type Release } from '../../appmaker/domain';
import { initialAccounts, initialDraft, initialListing, initialReleases } from '../../appmaker/fixtures';
import { dashboardPath } from '../../appmaker';
import {
  accentIssue, addToCart, appAccess, appCatalog, appCategories, attentionItems, cartCount, cartTotal, catalogSummary, contrast, effectivePlan,
  filterReleases, onColour, parseOs, parsePage, parseScreen, platformStatus, publishPlan, releaseGroup, searchCatalog, sectionProducts,
} from './model';

const T = '2026-11-24T10:00:00Z';
const products = productFixtures();
const levels = initialLevels(products.flatMap(skusOf));
const base = { plan: 'plus' as const, addon: 'active' as const, draft: initialDraft(), listing: initialListing(), accounts: initialAccounts(), releases: initialReleases() };

describe('routes', () => {
  it('parses pages, release ids and unknown paths', () => {
    expect(parsePage([])).toEqual({ page: 'overview' });
    expect(parsePage(['releases', 'r3'])).toEqual({ page: 'releases', id: 'r3' });
    expect(parsePage(['nope'])).toEqual({ page: 'overview', unknown: true });
    expect(parseScreen('cart')).toBe('cart');
    expect(parseScreen('x')).toBe('home');
    expect(parseOs('android')).toBe('android');
    expect(parseOs(null)).toBe('ios');
  });
  it('redirects old App Maker links into the dashboard section', () => {
    expect(dashboardPath([])).toBe('/dashboard/appmaker');
    expect(dashboardPath(['identity'])).toBe('/dashboard/appmaker/design');
    expect(dashboardPath(['plan'])).toBe('/dashboard/appmaker');
    expect(dashboardPath(['releases', 'r3'])).toBe('/dashboard/appmaker/releases/r3');
  });
});

describe('access and plan', () => {
  it('lets owner and marketing see, only the owner publish', () => {
    expect(appAccess('owner')).toEqual({ see: true, publish: true });
    expect(appAccess('marketing')).toEqual({ see: true, publish: false });
    expect(appAccess('fulfilment').see).toBe(false);
    expect(effectivePlan('plus', null)).toBe('plus');
    expect(effectivePlan('plus', 'basic')).toBe('basic');
  });
});

describe('app catalogue from the store', () => {
  const cat = appCatalog(products, levels);
  it('shows only active products with the app channel on, with licensed photos or none', () => {
    expect(cat.some((p) => p.id === 'p11')).toBe(false); // draft
    expect(cat.some((p) => p.id === 'p12')).toBe(false); // archived
    expect(cat.find((p) => p.id === 'p7')!.photo).toBeUndefined(); // no licensed photo
    expect(cat.find((p) => p.id === 'p1')!.photo).toBe('/products/thumb/p1.jpg');
    const off = products.map((p) => (p.id === 'p2' ? { ...p, channels: { ...p.channels, app: false } } : p));
    expect(appCatalog(off, levels).some((p) => p.id === 'p2')).toBe(false);
    expect(catalogSummary(off, levels).channelOff).toBe(1);
  });
  it('marks a product sold out when no unit is available', () => {
    const empty = levels.map((l) => (l.sku === 'OUD-100' ? { ...l, onHand: 0, reserved: 0 } : l));
    expect(appCatalog(products, empty).find((p) => p.id === 'p3')!.soldOut).toBe(true);
  });
  it('fills sections, categories and search from the catalogue', () => {
    expect(sectionProducts('featured', cat).every((p) => p.photo)).toBe(true);
    expect(sectionProducts('banner', cat)).toEqual([]);
    expect(appCategories(cat).map((c) => c.en)).toContain('Fragrance');
    expect(searchCatalog(cat, 'abaya', '').map((p) => p.id)).toEqual(['p1']);
    expect(searchCatalog(cat, '', 'Bags').every((p) => p.category.en === 'Bags')).toBe(true);
  });
  it('keeps a bounded cart', () => {
    let c = addToCart([], 'p1', 2);
    c = addToCart(c, 'p1', 9);
    expect(c).toEqual([{ id: 'p1', qty: 9 }]);
    expect(addToCart(c, 'p2', 0)).toBe(c);
    expect(cartCount(addToCart(c, 'p2', 1))).toBe(10);
    expect(cartTotal([{ id: 'p2', qty: 2 }], cat)).toBe(19600);
  });
});

describe('brand colours', () => {
  it('computes WCAG contrast and flags unreadable accents', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(onColour('#1e1b18')).toBe('#ffffff');
    expect(onColour('#f6efe4')).toBe('#1e1b18');
    expect(accentIssue('#84603d')).toBeNull();
    expect(accentIssue('#d9b98c')).toBe('lowContrast');
    expect(accentIssue('blue')).toBe('invalid');
  });
});

describe('publish plan', () => {
  it('recommends a settings update for layout-only edits and blocks a needless version', () => {
    const p = publishPlan(base, ['ios', 'android']);
    expect(p.path).toBe('config');
    expect(p.configBlock).toBeNull();
    expect(p.version).toBe('1.2.0');
    expect(p.binaryBlock).toBeNull();
    const same = publishPlan({ ...base, draft: base.releases[2].config }, ['ios']);
    expect(same.path).toBe('none');
    expect(same.binaryBlock).toBe('noChange');
  });
  it('requires a new version for identity edits and only submits to connected stores', () => {
    const p = publishPlan({ ...base, draft: { ...base.draft, iconId: 'i3' }, accounts: { ios: 'missing', android: 'connected' } }, ['ios', 'android']);
    expect(p.path).toBe('binary');
    expect(p.configBlock).toBe('binaryChange');
    expect(p.platforms).toEqual(['android']);
  });
  it('blocks submission when not eligible, not ready or a version is in progress', () => {
    expect(publishPlan({ ...base, plan: 'basic' }, ['ios']).binaryBlock).toBe('notEligible');
    expect(publishPlan({ ...base, plan: 'basic' }, ['ios']).configBlock).toBe('notEligible');
    expect(publishPlan({ ...base, listing: { ...base.listing, screenshots: 0 } }, ['ios']).binaryBlock).toBe('notReady');
    const active = createRelease(base.releases, base.draft, ['ios'], T, 'r9');
    expect(publishPlan({ ...base, releases: [...base.releases, active] }, ['ios']).binaryBlock).toBe('active');
    expect(publishPlan({ ...base, releases: [] }, ['ios']).path).toBe('binary');
    expect(publishPlan({ ...base, releases: [] }, ['ios']).configBlock).toBe('noLive');
  });
});

describe('store status and history', () => {
  it('keeps the Apple rejection separate from what customers have', () => {
    const ios = platformStatus(base.releases, 'ios');
    expect(ios.live!.version).toBe('1.0.0');
    expect(ios.state).toBe('rejected');
    expect(platformStatus(base.releases, 'android').live!.version).toBe('1.1.0');
    expect(platformStatus([], 'ios')).toMatchObject({ live: null, latest: null, state: null });
  });
  it('lists actionable problems and drops ones superseded by a newer live version', () => {
    expect(attentionItems(base.releases).map((a) => [a.release.id, a.platform, a.issue])).toEqual([['r3', 'ios', 'APPLE_5_1_1']]);
    let r: Release = createRelease(base.releases, base.draft, ['ios'], T, 'r9');
    for (const e of [{ type: 'lak', outcome: 'approve' }, { type: 'build', platform: 'ios', outcome: 'ok' }, { type: 'upload', platform: 'ios', outcome: 'ok' }, { type: 'store', platform: 'ios', outcome: 'approve' }] as const) r = apply(r, e, T);
    expect(attentionItems([...base.releases, r])).toEqual([]);
  });
  it('groups and filters releases', () => {
    expect(base.releases.map(releaseGroup)).toEqual(['done', 'done', 'attention']);
    expect(filterReleases(base.releases, { kind: 'config', group: '', q: '' }).map((r) => r.id)).toEqual(['r2']);
    expect(filterReleases(base.releases, { kind: '', group: 'attention', q: '' }).map((r) => r.id)).toEqual(['r3']);
    expect(filterReleases(base.releases, { kind: '', group: '', q: '9.9' })).toEqual([]);
    expect(filterReleases(base.releases, { kind: '', group: '', q: '' }).map((r) => r.id)).toEqual(['r3', 'r2', 'r1']);
  });
});
