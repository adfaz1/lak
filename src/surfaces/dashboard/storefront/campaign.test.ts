import { describe, expect, it } from 'vitest';
import { couponFixtures } from '../../merchant/growth';
import type { Order } from '../../merchant/domain';
import {
  canAdd, countdownEnd, couponUsable, landingFixtures, lpErrors, lpResults, lpState, lpWarnings, moveBlock, newBlock, newLanding, publishLanding, riyadhMs, shareUrl, unpublishLanding, type LpCtx,
} from './landing-model';
import { applyImport, fromIssue, health, normPath, parseCsv, parseTarget, trace, flatten, type RCtx, type Redirect } from './redirects-model';
import { addComment, blogFixture, commentError, moderate, postErrors, postPieces, postState, productIdsIn, servedPosts } from './blog-model';

const NOW = riyadhMs('2026-11-24T12:00');
const ctx = (over: Partial<LpCtx> = {}): LpCtx => ({ coupons: couponFixtures(), collections: [{ id: 'col-eid', productIds: ['p6', 'p18'] }], liveProducts: ['p1', 'p2', 'p3', 'p4', 'p6', 'p13', 'p18'], langs: { ar: true, en: true }, now: NOW, ...over });

describe('landing pages', () => {
  it('derives state from publishing and the Riyadh window', () => {
    const [wf, ram] = landingFixtures();
    expect(lpState(wf, NOW)).toBe('live');
    expect(lpState(wf, riyadhMs('2026-12-01T00:00'))).toBe('ended');
    expect(lpState(wf, riyadhMs('2026-11-19T23:59'))).toBe('scheduled');
    expect(lpState(ram, NOW)).toBe('draft');
    expect(lpState(unpublishLanding(wf, '', ''), NOW)).toBe('off');
    expect(lpState(publishLanding(ram, '', ''), NOW)).toBe('scheduled');
  });
  it('countdown follows the linked coupon end unless it has its own', () => {
    const [wf] = landingFixtures();
    const b = wf.draft.blocks.find((x) => x.kind === 'countdown')!;
    expect(countdownEnd(b, wf, couponFixtures())).toBe(Date.parse('2026-11-30T23:59:59+03:00'));
    expect(countdownEnd({ ...b, until: '2026-11-28T18:00' }, wf, couponFixtures())).toBe(riyadhMs('2026-11-28T18:00'));
  });
  it('blocks publishing on bad slug, empty products, past countdown and coupon reveal without a code', () => {
    const [wf] = landingFixtures();
    const all = landingFixtures();
    expect(lpErrors(wf, all, ctx()).errors).toEqual([]);
    const bad = { ...wf, slug: 'cart', end: '', link: { kind: 'none' as const }, draft: { ...wf.draft, blocks: wf.draft.blocks.map((b) => (b.kind === 'products' ? { ...b, productIds: ['p12'] } : b)) } };
    const r = lpErrors(bad, all, ctx());
    expect(r.slug).toBe('reserved');
    expect(Object.values(r.blocks).sort()).toEqual(['noCoupon', 'noEnd', 'noProducts'].sort());
    expect(lpErrors({ ...wf, slug: 'ramadan' }, all, ctx()).slug).toBe('taken');
  });
  it('warns when the linked coupon cannot be used or ends first', () => {
    const [, ram] = landingFixtures();
    expect(lpWarnings(ram, ctx())).toContain('couponDraft');
    const nov = { ...ram, link: { kind: 'coupon' as const, code: 'NOV50' }, start: '', end: '2026-12-15T00:00' };
    expect(lpWarnings(nov, ctx())).toEqual(expect.arrayContaining(['couponLimit', 'couponEndsFirst']));
    expect(couponUsable(couponFixtures()[0], NOW)).toBe('ok');
  });
  it('adds single blocks once and moves blocks', () => {
    const p = newLanding([], '', 'x', { link: { kind: 'coupon', code: 'SHIPFREE' } });
    expect(p.draft.blocks.map((b) => b.kind)).toEqual(['hero', 'products', 'coupon']);
    expect(canAdd(p.draft.blocks, 'hero')).toBe(false);
    expect(canAdd(p.draft.blocks, 'faq')).toBe(true);
    const moved = moveBlock(p.draft.blocks, p.draft.blocks[2].id, -1);
    expect(moved.map((b) => b.kind)).toEqual(['hero', 'coupon', 'products']);
    expect(newBlock('products', 'collection').pick).toBe('linked');
  });
  it('attributes orders once by code or visit, skipping failed and cancelled', () => {
    const [wf] = landingFixtures();
    const o = (ref: string, extra: Partial<Order>): Order => ({ ref, items: [{ qty: 1, unit: 30000 }], fee: 0, pay: 'paid', ...extra } as unknown as Order);
    const orders = [o('1', { coupon: 'SHIPFREE' }), o('2', {}), o('3', { coupon: 'SHIPFREE', pay: 'failed' } as Partial<Order>), o('4', { coupon: 'OTHER' })];
    const r = lpResults(wf, orders, { 2: 'white-friday', 1: 'white-friday' }, { visits: 3, interest: 1 });
    expect(r.orders).toBe(2);
    expect(r.byVisit).toBe(2);
    expect(r.revenue).toBe(60000);
    expect(r.visits).toBe(1243);
  });
  it('builds tracked share links', () => {
    expect(shareUrl('https://x.lak.store', { slug: 'wf', utm: 'white-friday' }, 'whatsapp')).toBe('https://x.lak.store/lp/wf?utm_source=whatsapp&utm_medium=social&utm_campaign=white-friday');
  });
});

const rctx: RCtx = {
  products: [{ id: 'p1', name: 'a', served: true, archived: false }, { id: 'p12', name: 'b', served: false, archived: true }],
  categories: [{ id: 'all', name: 'all' }, { id: 'fragrance', name: 'f' }],
  pages: [{ id: 'pg1', slug: 'about', name: 'about', served: true }],
  landings: [{ id: 'lp1', slug: 'white-friday', name: 'wf', served: true }, { id: 'lp2', slug: 'ramadan', name: 'r', served: false }],
  posts: [],
};
const R = (id: string, from: string, to: Redirect['to'], on = true): Redirect => ({ id, from, to, code: 301, on, hits: 0, at: '', by: '' });

describe('custom URLs', () => {
  it('normalises what merchants paste', () => {
    expect(normPath('https://dar-nuwa.lak.store/Old-Abaya/?utm=x')).toBe('/old-abaya');
    expect(normPath('sale//٢٠٢٦/')).toBe('/sale/2026');
    expect(normPath('  ')).toBe('');
  });
  it('rejects paths the store serves and duplicates', () => {
    const list = [R('r1', '/old', { kind: 'product', id: 'p1' })];
    expect(fromIssue('/p/p1', list, rctx)).toBe('served');
    expect(fromIssue('/page/about', list, rctx)).toBe('served');
    expect(fromIssue('/p/p12', list, rctx)).toBeNull();
    expect(fromIssue('/old', list, rctx)).toBe('duplicate');
    expect(fromIssue('/old', list, rctx, 'r1')).toBeNull();
  });
  it('follows chains, finds loops, flags archived targets and flattens chains', () => {
    const list = [R('r1', '/a', { kind: 'url', url: 'https://x.test/' }), R('r2', '/b', { kind: 'product', id: 'p12' }), R('r3', '/p/p12', { kind: 'product', id: 'p1' })];
    expect(trace('/b', list, rctx).hops.map((h) => h.to)).toEqual(['/p/p12', '/p/p1']);
    expect(health(list[1], list, rctx)).toBe('chain');
    expect(flatten(list[1], list, rctx)).toEqual({ kind: 'product', id: 'p1' });
    expect(health(R('x', '/c', { kind: 'product', id: 'p12' }), [R('x', '/c', { kind: 'product', id: 'p12' })], rctx)).toBe('broken');
    expect(health(R('y', '/d', { kind: 'landing', id: 'lp2' }), [R('y', '/d', { kind: 'landing', id: 'lp2' })], rctx)).toBe('broken');
    const loop = [R('l1', '/p/p12', { kind: 'landing', id: 'lp2' }), R('l2', '/lp/ramadan', { kind: 'product', id: 'p12' })];
    expect(trace('/p/p12', loop, rctx).loop).toBe(true);
    expect(health(loop[0], loop, rctx)).toBe('loop');
    expect(trace('/a', list, rctx).external).toBe(true);
    expect(trace('/nothing', list, rctx).matched).toBe(false);
  });
  it('previews a CSV row by row and applies only valid rows', () => {
    const list = [R('r1', '/old', { kind: 'product', id: 'p1' })];
    const rows = parseCsv('from,to,code\n/old,/c/fragrance,302\n/new,/lp/white-friday\n/p/p1,/p/p1\n/x,/p/nope\n/new,/p/p1\n/y,https://ig.test/,307\nonlyone', list, rctx);
    expect(rows.map((r) => r.state === 'error' ? r.error : r.state)).toEqual(['update', 'new', 'served', 'to', 'repeat', 'code', 'columns']);
    expect(parseTarget('https://dar.lak.store/p/p1', rctx)).toEqual({ kind: 'product', id: 'p1' });
    const next = applyImport(list, rows, 't', 'me');
    expect(next).toHaveLength(2);
    expect(next.find((r) => r.from === '/old')?.code).toBe(302);
  });
});

describe('blog', () => {
  it('serves live and due articles only, newest first', () => {
    const b = blogFixture();
    expect(postState(b.posts[1], NOW)).toBe('scheduled');
    expect(postState(b.posts[2], NOW)).toBe('draft');
    expect(servedPosts(b, NOW).map((p) => p.id)).toEqual(['bp1']);
    expect(servedPosts(b, riyadhMs('2026-11-29T00:00')).map((p) => p.id)).toEqual(['bp2', 'bp1']);
    expect(servedPosts({ ...b, settings: { ...b.settings, on: false } }, NOW)).toEqual([]);
  });
  it('places products inside the text and checks they are on sale', () => {
    const b = blogFixture();
    expect(postPieces('a\n\n@p:p1\n\nb').map((x) => x.kind)).toEqual(['text', 'product', 'text']);
    expect(productIdsIn(b.posts[0].draft.body.ar)).toEqual(['p1']);
    const p = { ...b.posts[0], draft: { ...b.posts[0].draft, body: { ar: 'x\n@p:p12', en: 'y' } } };
    expect(postErrors(p, b, { ar: true, en: true }, ['p1']).products).toBe('p12');
    expect(postErrors(b.posts[2], b, { ar: true, en: true }, ['p1'])).toMatchObject({ titleEn: 'required', bodyEn: 'required' });
  });
  it('moderates comments and rejects links', () => {
    const b = blogFixture();
    const post = b.posts[0];
    expect(commentError('Sara', 'see https://spam.test', post, b)).toBe('link');
    expect(commentError('', 'hi', post, b)).toBe('name');
    const after = addComment(b, post.id, 'Sara', 'Lovely', 'en', 't');
    expect(after.comments.at(-1)?.state).toBe('pending');
    const ok = moderate(after, [after.comments.at(-1)!.id], 'approved');
    expect(ok.comments.at(-1)?.state).toBe('approved');
    expect(commentError('S', 'x', { ...post, comments: false }, b)).toBe('closed');
  });
});
