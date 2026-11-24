import { describe, expect, it } from 'vitest';
import { identityFixture, publishTheme, rollbackTheme, themeFixture } from '../../merchant/workspace';
import type { Review } from '../../merchant/growth';
import {
  ACCENT_PRESETS, accentReport, accessibleAccent, addSection, annIssues, diffDraft, draftIdentity, identityChanges, libraryBlock, linkError,
  nextSectionId, normHex, realReviews, removeSection, scheduleState, setIdentity,
} from './identity';
import { discardDraft, identityPending, pendingChanges, publish, publishBlock, rollbackTheme as rollback, sectionIssue, updateSection } from './model';
import { gridProducts, liveAnnouncement, liveIdentity, storeCss, testimonials } from '../../storefront/theme';
import { categoriesOf, toStoreProducts } from '../../storefront/bridge';
import { collectionFixtures, productFixtures, skusOf } from '../../merchant/catalog';
import { initialLevels, withStateFixtures } from '../../merchant/inventory';

const levelFixtures = () => withStateFixtures(initialLevels(productFixtures().filter((p) => p.type !== 'digital').flatMap(skusOf)));

describe('brand colour', () => {
  it('reads colours typed in any common form, Arabic digits included', () => {
    expect(normHex('84603D')).toBe('#84603d');
    expect(normHex('#863')).toBe('#886633');
    expect(normHex('#٨٤٦٠٣d')).toBe('#84603d');
    expect(normHex('brown')).toBeNull();
  });
  it('checks buttons, links and dark mode, and every preset passes', () => {
    for (const c of ACCENT_PRESETS) expect(accentReport(c).ok).toBe(true);
    const pale = accentReport('#f2c94c');
    expect(pale.ok).toBe(false);
    expect(pale.button).toBeLessThan(4.5);
  });
  it('suggests the nearest readable colour of the same hue', () => {
    const fixed = accessibleAccent('#f2c94c');
    expect(accentReport(fixed).ok).toBe(true);
    expect(fixed).not.toBe('#f2c94c');
    expect(accessibleAccent('#84603d')).toBe('#84603d');
  });
});

describe('identity draft and publishing', () => {
  it('edits the draft only; the live store keeps its look until publish', () => {
    let t = setIdentity(themeFixture(), { accent: '#1f5f4a', font: 'naskh' });
    expect(liveIdentity(t).accent).toBe('#84603d');
    expect(identityPending(t).map((c) => c.key)).toEqual(['accent', 'font']);
    expect(publishBlock(t)).toBeNull();
    t = publish(t, 'Green');
    expect(liveIdentity(t).accent).toBe('#1f5f4a');
    expect(identityPending(t)).toEqual([]);
    expect(storeCss(liveIdentity(t))).toContain('--color-brand-600:#1f5f4a');
  });
  it('rolls the identity back with the sections, as a new version', () => {
    let t = publish(setIdentity(themeFixture(), { accent: '#2b4c7e', button: 'pill' }), 'Blue');
    t = publish(setIdentity(t, { accent: '#8a2f45' }), 'Plum');
    const r = rollback(t, 8);
    expect(r.published.version).toBe(10);
    expect(liveIdentity(r)).toMatchObject({ accent: '#2b4c7e', button: 'pill' });
    expect(draftIdentity(r).accent).toBe('#2b4c7e');
  });
  it('keeps versions saved before identity existed on the starting look', () => {
    const t = rollbackTheme(publishTheme(setIdentity(themeFixture(), { accent: '#2b4c7e' }), 'x'), 7);
    expect(liveIdentity(t)).toEqual(identityFixture());
  });
  it('blocks publishing an unreadable colour value and discards identity edits with the draft', () => {
    const t = setIdentity(themeFixture(), { accent: 'nope' });
    expect(publishBlock(t)).toBe('invalid');
    expect(identityPending(discardDraft(t))).toEqual([]);
  });
  it('lists identity changes with before and after', () => {
    expect(identityChanges(identityFixture(), { ...identityFixture(), logo: 'm:a1' })).toEqual([{ key: 'logo', before: null, after: 'm:a1' }]);
  });
});

describe('announcement bar', () => {
  const day = (iso: string) => Date.parse(`${iso}T09:00:00Z`);
  it('validates links, colour contrast and schedule order', () => {
    expect(linkError('/c/abayas')).toBeNull();
    expect(linkError('https://example.com/eid')).toBeNull();
    expect(linkError('http://example.com')).toBe('invalid');
    expect(linkError('javascript:alert(1)')).toBe('invalid');
    const a = themeFixture().draft[0];
    expect(annIssues(a)).toEqual([]);
    expect(annIssues({ ...a, bg: '#ffffff', fg: '#f6efe4' })).toEqual(['colours']);
    expect(annIssues({ ...a, start: '2026-12-10', end: '2026-12-01' })).toEqual(['schedule']);
    expect(sectionIssue({ ...a, link: 'www' })).toBe('link');
  });
  it('shows only inside its schedule, by Riyadh day', () => {
    let t = updateSection(themeFixture(), 's1', { start: '2026-12-01', end: '2026-12-03' });
    t = publish(t, 'Sale');
    expect(liveAnnouncement(t, day('2026-11-30'))).toBeUndefined();
    expect(liveAnnouncement(t, day('2026-12-02'))?.id).toBe('s1');
    expect(liveAnnouncement(t, day('2026-12-04'))).toBeUndefined();
    expect(scheduleState(t.published.sections[0], day('2026-11-30'))).toBe('upcoming');
    expect(scheduleState(t.published.sections[0], day('2026-12-05'))).toBe('ended');
    expect(scheduleState({}, day('2026-12-05'))).toBe('always');
  });
});

describe('section library', () => {
  const reviews = (status: Review['status']): Review[] => [{ id: 'r', kind: 'review', productId: 'p1', author: { ar: 'سارة العتيبي', en: 'Sarah Alotaibi' }, rating: 5, text: 'جميلة', at: '2026-11-20', status, verified: true, log: [] }];
  it('offers testimonials only when real published reviews exist, and single sections once', () => {
    const t = themeFixture();
    expect(libraryBlock('testimonials', t.draft, realReviews(reviews('pending')))).toBe('noReviews');
    expect(libraryBlock('testimonials', t.draft, realReviews(reviews('published')))).toBeNull();
    expect(libraryBlock('hero', t.draft, 0)).toBe('already');
    expect(libraryBlock('grid', t.draft, 0)).toBeNull();
  });
  it('adds before the newsletter with a fresh id, and tracks added and removed sections', () => {
    let t = addSection(themeFixture(), { kind: 'grid', heading: 'عبايات', source: 'cat:abayas' });
    expect(nextSectionId(themeFixture())).toBe('s8');
    expect(t.draft.map((s) => s.id).slice(-2)).toEqual(['s8', 's7']);
    t = removeSection(t, 's4');
    t = removeSection(t, 's1');
    expect(t.draft.some((s) => s.id === 's1')).toBe(true);
    expect(pendingChanges(t).map((c) => [c.id, c.kind])).toEqual([['s8', 'added'], ['s4', 'removed']]);
    expect(diffDraft(t.published.sections, t.draft).filter((c) => c.kind === 'moved')).toEqual([]);
  });
  it('requires what each section needs before publishing', () => {
    const t = themeFixture();
    expect(sectionIssue({ id: 'x', kind: 'grid', visible: true, heading: 'A' })).toBe('source');
    expect(sectionIssue({ id: 'x', kind: 'banner', visible: true, heading: 'A' })).toBe('image');
    expect(sectionIssue({ id: 'x', kind: 'richtext', visible: true, heading: 'A', body: ' ' })).toBe('body');
    expect(publishBlock(addSection(t, { kind: 'banner', heading: 'Eid' }))).toBe('invalid');
  });
  it('fills product grids from a category or a collection, and testimonials only from published reviews', () => {
    const mp = productFixtures();
    const lv = levelFixtures();
    const store = toStoreProducts(mp, lv);
    const cat = categoriesOf(store)[0];
    expect(gridProducts(`cat:${cat.id}`, store, mp, lv, collectionFixtures()).length).toBe(cat.count);
    expect(gridProducts('col:col-eid', store, mp, lv, collectionFixtures()).length).toBeGreaterThan(0);
    expect(gridProducts('col:missing', store, mp, lv, collectionFixtures())).toEqual([]);
    expect(testimonials(reviews('pending'), { maskNames: true })).toEqual([]);
    expect(testimonials(reviews('published'), { maskNames: true })[0].author.en).toBe('Sarah A.');
  });
});
