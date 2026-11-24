import { describe, expect, it } from 'vitest';
import { productFixtures } from '../../merchant/catalog';
import { initialLevels } from '../../merchant/inventory';
import { skusOf } from '../../merchant/catalog';
import { policyFixtures } from '../../merchant/workspace';
import { linkContext, servedPage, socialLinks } from '../../storefront/bridge';
import {
  contentFixture, inlineRuns, lenTone, menuDiff, menuErrors, moveItem, newPage, pageErrors, pageState, productSeoRows, publishMenus, publishPage,
  resolveMenu, robotsTxt, sitemapUrls, slugIssue, snippet, toBlocks,
} from './content';

const products = productFixtures();
const levels = initialLevels(products.filter((p) => p.type !== 'digital').flatMap(skusOf));
const c = contentFixture(Date.parse('2026-11-24T12:00:00Z'));
const ctx = linkContext(products, levels, c.pages, policyFixtures());

describe('rich text', () => {
  it('parses headings, lists, paragraphs and bold without HTML', () => {
    expect(toBlocks('## Title\nline one\nline two\n\n- a\n- b')).toEqual([{ type: 'h', text: 'Title' }, { type: 'p', text: 'line one line two' }, { type: 'ul', items: ['a', 'b'] }]);
    expect(inlineRuns('a **b** <script>')).toEqual([{ bold: false, text: 'a ' }, { bold: true, text: 'b' }, { bold: false, text: ' <script>' }]);
  });
});

describe('pages', () => {
  it('shows only published, visible pages to shoppers; drafts stay private', () => {
    expect(servedPage(c.pages, 'about')?.id).toBe('about');
    expect(servedPage(c.pages, 'size-guide')).toBeUndefined();
    const live = publishPage(c.pages[2], 'now');
    expect(servedPage([live], 'size-guide')?.id).toBe('pg3');
    expect(pageState({ ...live, draft: { ...live.draft, title: { ar: 'جديد', en: 'New' } } })).toBe('liveWithDraft');
    expect(servedPage([{ ...live, hidden: true }], 'size-guide')).toBeUndefined();
  });
  it('validates slugs: format, reserved store routes and duplicates', () => {
    expect(slugIssue('Bad Slug', c.pages)).toBe('format');
    expect(slugIssue('returns', c.pages)).toBe('reserved');
    expect(slugIssue('about', c.pages, 'pg3')).toBe('taken');
    expect(slugIssue('faq', c.pages)).toBeNull();
  });
  it('needs a title and body in every store language to publish', () => {
    const p = newPage(c.pages, 'now');
    expect(pageErrors(p, c.pages, { ar: true, en: true })).toMatchObject({ titleAr: 'required', titleEn: 'required', body: 'required' });
    const filled = { ...p, draft: { title: { ar: 'الأسئلة', en: '' }, body: { ar: 'نص', en: '' } } };
    expect(pageErrors(filled, c.pages, { ar: true, en: false })).toEqual({});
  });
});

describe('menus', () => {
  it('resolves links to store paths and skips unpublished or missing targets', () => {
    const items = [
      { id: 'a', label: { ar: '', en: '' }, target: { kind: 'category' as const, id: 'bags' } },
      { id: 'b', label: { ar: '', en: '' }, target: { kind: 'page' as const, id: 'pg3' } },
      { id: 'c', label: { ar: 'خصوصية', en: 'Privacy' }, target: { kind: 'policy' as const, id: 'privacy' } },
      { id: 'd', label: { ar: '', en: '' }, target: { kind: 'policy' as const, id: 'returns' } },
      { id: 'e', label: { ar: 'إنستغرام', en: 'Instagram' }, target: { kind: 'url' as const, url: 'https://instagram.com/darnuwa' } },
    ];
    const r = resolveMenu(items, ctx);
    expect(r.map((x) => x.id)).toEqual(['a', 'd', 'e']);
    expect(r[0]).toMatchObject({ path: '/c/bags', label: { en: 'Bags' } });
    expect(r[1].path).toBe('/page/returns');
    expect(r[2]).toMatchObject({ path: null, url: 'https://instagram.com/darnuwa' });
  });
  it('reorders, diffs and publishes as a new version', () => {
    const h = c.menus.draft.header;
    const moved = moveItem(h, 0, 2);
    expect(moved.map((x) => x.id).slice(0, 3)).toEqual(['h2', 'h3', 'h1']);
    expect(menuDiff(h, moved, ctx).map((d) => d.kind)).toEqual(['moved']);
    const pub = publishMenus({ ...c.menus, draft: { ...c.menus.draft, header: moved } }, 'now');
    expect(pub.version).toBe(c.menus.version + 1);
    expect(pub.live.header[2].id).toBe('h1');
  });
  it('rejects http links and over-long labels', () => {
    const e = menuErrors({ header: [{ id: 'x', label: { ar: 'أ'.repeat(31), en: '' }, target: { kind: 'all' } }], footer: [{ id: 'y', label: { ar: '', en: '' }, target: { kind: 'url', url: 'http://x.com' } }] });
    expect(e.items).toEqual({ x: 'label', y: 'url' });
  });
});

describe('SEO', () => {
  it('rates lengths and cuts snippets like a search result', () => {
    expect(lenTone('', 60)).toBe('empty');
    expect(lenTone('x'.repeat(61), 60)).toBe('long');
    expect(snippet('abcdef', 4)).toBe('abc…');
  });
  it('flags products without descriptions and repeated slugs', () => {
    const list = productFixtures();
    list[1] = { ...list[1], seo: { ...list[1].seo, slug: list[0].seo.slug, desc: 'ok' } };
    const rows = productSeoRows(list);
    expect(rows[0].issues).toContain('noDesc');
    expect(rows[1].issues).toContain('dupSlug');
  });
  it('lists only live URLs in the sitemap and blocks everything when indexing is off', () => {
    const urls = sitemapUrls('https://dar-nuwa.lak.store', { ...ctx, productSlugs: {} });
    expect(urls).toContain('https://dar-nuwa.lak.store/page/about');
    expect(urls).toContain('https://dar-nuwa.lak.store/page/returns');
    expect(urls.some((u) => u.endsWith('/page/size-guide') || u.endsWith('/page/privacy'))).toBe(false);
    expect(robotsTxt('https://x.test', false)).toBe('User-agent: *\nDisallow: /');
    expect(robotsTxt('https://x.test', true)).toContain('Sitemap: https://x.test/sitemap.xml');
  });
  it('shows only https social links in a fixed order', () => {
    expect(socialLinks({ tiktok: 'https://tiktok.com/@a', instagram: 'https://instagram.com/a', x: 'javascript:alert(1)' }).map((s) => s.id)).toEqual(['instagram', 'tiktok']);
  });
});
