import { describe, expect, it } from 'vitest';
import { themeFixture } from '../merchant/workspace';
import { publishTheme, moveSection } from '../merchant/workspace';
import { SCALE_STEPS, brandScale, contrast, darkPalette, headingText, lightPalette, liveSections, luminance, sectionOf, storeCss } from './theme';
import { photoFor } from './photos';

describe('merchant brand scale', () => {
  const s = brandScale('#84603d');
  it('keeps the accent at 600 and gets darker step by step', () => {
    expect(s[600]).toBe('#84603d');
    const l = SCALE_STEPS.map((k) => luminance(s[k]));
    for (let i = 1; i < l.length; i++) expect(l[i]).toBeLessThan(l[i - 1]);
  });
  it('gives readable white text on primary buttons and readable brand text on the page', () => {
    expect(contrast(s[600], '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s[700], lightPalette().surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s[300], darkPalette().surface)).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps body text readable in both palettes', () => {
    for (const p of [lightPalette(), darkPalette()]) {
      expect(contrast(p.fg, p.surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.muted, p.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('scopes the override to the storefront body so it never leaks into other surfaces', () => {
    const css = storeCss();
    expect(css.startsWith('body[data-sf] .lak{')).toBe(true);
    expect(css).toContain('--color-brand-600:#84603d');
    expect(css).toContain('body[data-sf] .lak.dark{');
  });
});

describe('homepage sections from the published theme', () => {
  it('shows only visible published sections, in published order, and ignores the unpublished draft', () => {
    const t = themeFixture();
    expect(liveSections(t).map((s) => s.kind)).toEqual(['announcement', 'hero', 'featured', 'categories', 'newsletter']);
    const draft = { ...t, draft: moveSection(t.draft, 's4', -1) };
    expect(liveSections(draft).map((s) => s.id)).toEqual(liveSections(t).map((s) => s.id));
    const published = publishTheme(draft, 'reorder');
    expect(liveSections(published).map((s) => s.kind).slice(1, 4)).toEqual(['hero', 'categories', 'featured']);
    expect(sectionOf(t, 'offers')).toBeUndefined();
  });
  it('translates the fixture headings and shows merchant-typed headings as written', () => {
    expect(headingText('الأكثر مبيعًا', 'en')).toBe('Best sellers');
    expect(headingText('الأكثر مبيعًا', 'ar')).toBe('الأكثر مبيعًا');
    expect(headingText('Eid edit', 'ar')).toBe('Eid edit');
  });
});

describe('product photos', () => {
  it('uses a licensed photo only where it shows that product, and says which colour it shows', () => {
    expect(photoFor('embroidered-abaya')?.src).toBe('/products/p1.jpg');
    expect(photoFor('leather-tote', 'black')?.shownColor).toBe('camel');
    expect(photoFor('leather-tote', 'camel')?.shownColor).toBeUndefined();
    expect(photoFor('satin-dress')).toBeUndefined();
    expect(photoFor('night-oud', undefined, 'thumb')?.src).toBe('/products/thumb/p3.jpg');
  });
});
