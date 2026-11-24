// Custom URLs (`#/dashboard/storefront/redirects`): an old address in the store sends shoppers to a product, category,
// page, landing page, blog post or an https link, as a permanent (301) or temporary (302) redirect. Loops, chains and
// targets that stopped existing are found before shoppers hit them. Pure rules only (no React, no stores).

export type RTarget =
  | { kind: 'product'; id: string } | { kind: 'category'; id: string } | { kind: 'page'; id: string }
  | { kind: 'landing'; id: string } | { kind: 'post'; id: string } | { kind: 'url'; url: string };
export type RKind = RTarget['kind'];
export const R_KINDS: RKind[] = ['product', 'category', 'page', 'landing', 'post', 'url'];
export interface Redirect { id: string; from: string; to: RTarget; code: 301 | 302; on: boolean; hits: number; at: string; by: string }

/** Everything a redirect can lead to, from the merchant's data. `served` = a shopper can open it now. */
export interface RCtx {
  products: { id: string; name: string; served: boolean; archived: boolean }[];
  categories: { id: string; name: string }[];
  pages: { id: string; slug: string; name: string; served: boolean }[];
  landings: { id: string; slug: string; name: string; served: boolean }[];
  posts: { id: string; slug: string; name: string; served: boolean }[];
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const latin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

/**
 * The path part of what the merchant typed: full store links become paths, query and hash are dropped, a trailing slash
 * is removed, Latin letters are lower-cased and Arabic digits become Latin. "" when nothing usable is left.
 */
export function normPath(input: string): string {
  let v = latin(input.trim());
  if (!v) return '';
  v = v.replace(/^https?:\/\/[^/]+/i, '');
  v = v.replace(/^#\/store/, '');
  v = v.split(/[?#]/)[0];
  try { v = decodeURI(v); } catch { /* keep as typed */ }
  if (!v.startsWith('/')) v = `/${v}`;
  v = v.replace(/\/{2,}/g, '/');
  if (v.length > 1) v = v.replace(/\/+$/, '');
  return v.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** Paths the store itself serves; a redirect from one of them would never run (the real page wins). */
export function servedPath(path: string, ctx: RCtx): boolean {
  const [a, b] = path.split('/').filter(Boolean);
  if (!a) return true;
  if (['cart', 'checkout', 'account', 'track', 'search', 'blog'].includes(a) && !b) return true;
  if (a === 'c') return b === 'all' || ctx.categories.some((c) => c.id === b);
  if (a === 'p') return ctx.products.some((p) => p.id === b && p.served);
  if (a === 'page') return ['shipping', 'returns', 'privacy', 'terms'].includes(b ?? '') || ctx.pages.some((p) => p.slug === b && p.served);
  if (a === 'lp') return ctx.landings.some((p) => p.slug === b && p.served);
  if (a === 'blog') return ctx.posts.some((p) => p.slug === b && p.served);
  if (['order', 'returns'].includes(a)) return true;
  return false;
}

export type FromIssue = 'empty' | 'format' | 'served' | 'duplicate' | null;
export function fromIssue(from: string, list: Redirect[], ctx: RCtx, selfId?: string): FromIssue {
  if (!from || from === '/') return 'empty';
  if (/\s/.test(from) || from.length > 200) return 'format';
  if (servedPath(from, ctx)) return 'served';
  if (list.some((r) => r.from === from && r.id !== selfId)) return 'duplicate';
  return null;
}

/** Store path of a target ("/p/p1"), or the https link; null when the target no longer exists. */
export function targetPath(t: RTarget, ctx: RCtx): string | null {
  switch (t.kind) {
    case 'product': return ctx.products.some((p) => p.id === t.id) ? `/p/${t.id}` : null;
    case 'category': return ctx.categories.some((c) => c.id === t.id) ? `/c/${t.id}` : null;
    case 'page': { const p = ctx.pages.find((x) => x.id === t.id); return p ? `/page/${p.slug}` : null; }
    case 'landing': { const p = ctx.landings.find((x) => x.id === t.id); return p ? `/lp/${p.slug}` : null; }
    case 'post': { const p = ctx.posts.find((x) => x.id === t.id); return p ? `/blog/${p.slug}` : null; }
    case 'url': return t.url;
  }
}
export const isExternal = (t: RTarget) => t.kind === 'url';
export const validHttps = (u: string) => { try { const x = new URL(u.trim()); return x.protocol === 'https:' && x.hostname.includes('.') && !/\s/.test(u.trim()); } catch { return false; } };

export type TargetIssue = 'missing' | 'archived' | 'hidden' | 'url' | null;
/** Why a target would not work for a shopper now (archived product, unpublished page, removed category, bad link). */
export function targetIssue(t: RTarget, ctx: RCtx): TargetIssue {
  switch (t.kind) {
    case 'product': { const p = ctx.products.find((x) => x.id === t.id); return !p ? 'missing' : p.archived ? 'archived' : p.served ? null : 'hidden'; }
    case 'category': return ctx.categories.some((c) => c.id === t.id) ? null : 'missing';
    case 'page': { const p = ctx.pages.find((x) => x.id === t.id); return !p ? 'missing' : p.served ? null : 'hidden'; }
    case 'landing': { const p = ctx.landings.find((x) => x.id === t.id); return !p ? 'missing' : p.served ? null : 'hidden'; }
    case 'post': { const p = ctx.posts.find((x) => x.id === t.id); return !p ? 'missing' : p.served ? null : 'hidden'; }
    case 'url': return validHttps(t.url) ? null : 'url';
  }
}

export const MAX_HOPS = 10;
export interface Trace { hops: { from: string; to: string; code: 301 | 302 }[]; final: string | null; external: boolean; loop: boolean; tooLong: boolean; broken: TargetIssue; served: boolean; matched: boolean }
/** Follow redirects from a path the way the store would (only paths the store does not serve itself are redirected). */
export function trace(path: string, list: Redirect[], ctx: RCtx): Trace {
  const on = list.filter((r) => r.on);
  const hops: Trace['hops'] = [];
  const seen = new Set<string>();
  let cur = path;
  let broken: TargetIssue = null;
  while (true) {
    if (servedPath(cur, ctx)) return { hops, final: cur, external: false, loop: false, tooLong: false, broken, served: true, matched: hops.length > 0 };
    const r = on.find((x) => x.from === cur);
    if (!r) return { hops, final: hops.length ? cur : null, external: false, loop: false, tooLong: false, broken: hops.length ? 'missing' : null, served: false, matched: hops.length > 0 };
    if (seen.has(cur)) return { hops, final: null, external: false, loop: true, tooLong: false, broken, served: false, matched: true };
    seen.add(cur);
    const to = targetPath(r.to, ctx);
    hops.push({ from: cur, to: to ?? '—', code: r.code });
    broken = targetIssue(r.to, ctx);
    if (!to) return { hops, final: null, external: false, loop: false, tooLong: false, broken: 'missing', served: false, matched: true };
    if (isExternal(r.to)) return { hops, final: to, external: true, loop: false, tooLong: false, broken, served: false, matched: true };
    if (hops.length >= MAX_HOPS) return { hops, final: null, external: false, loop: false, tooLong: true, broken, served: false, matched: true };
    cur = to;
  }
}

export type RHealth = 'ok' | 'loop' | 'chain' | 'broken' | 'off';
/** One redirect's health: off, part of a loop, the first step of a chain (its target is itself redirected), or broken. */
export function health(r: Redirect, list: Redirect[], ctx: RCtx): RHealth {
  if (!r.on) return 'off';
  const t = trace(r.from, list, ctx);
  if (t.loop || t.tooLong) return 'loop';
  if (t.hops.length > 1 && (t.served || t.external) && !t.broken) return 'chain';
  if (targetIssue(r.to, ctx) && !(t.hops.length > 1 && t.served)) return 'broken';
  if (t.hops.length > 1) return 'chain';
  return 'ok';
}
/** For a chain: point straight at the final destination (one hop instead of several). */
export function flatten(r: Redirect, list: Redirect[], ctx: RCtx): RTarget | null {
  const t = trace(r.from, list, ctx);
  if (t.hops.length < 2 || t.loop || !t.final) return null;
  const last = list.find((x) => x.on && x.from === t.hops[t.hops.length - 1].from);
  return last ? last.to : null;
}

/** Read a store path or link as a target ("/p/p1", "/c/fragrance", "/page/about", "/lp/x", "/blog/x", "https://…"). */
export function parseTarget(input: string, ctx: RCtx): RTarget | null {
  const v = latin(input.trim());
  if (/^https?:\/\//i.test(v) && !/^https?:\/\/[^/]*lak\.store/i.test(v)) return validHttps(v) ? { kind: 'url', url: v } : null;
  const p = normPath(v);
  const [a, b] = p.split('/').filter(Boolean);
  if (!a || !b) return null;
  if (a === 'p' && ctx.products.some((x) => x.id === b)) return { kind: 'product', id: b };
  if (a === 'c' && ctx.categories.some((x) => x.id === b)) return { kind: 'category', id: b };
  if (a === 'page') { const x = ctx.pages.find((y) => y.slug === b); return x ? { kind: 'page', id: x.id } : null; }
  if (a === 'lp') { const x = ctx.landings.find((y) => y.slug === b); return x ? { kind: 'landing', id: x.id } : null; }
  if (a === 'blog') { const x = ctx.posts.find((y) => y.slug === b); return x ? { kind: 'post', id: x.id } : null; }
  return null;
}

export type RowState = 'new' | 'update' | 'error';
export type RowError = 'from' | 'served' | 'to' | 'code' | 'repeat' | 'columns';
export interface ImportRow { line: number; raw: string; from: string; to: RTarget | null; code: 301 | 302; state: RowState; error?: RowError; replaces?: string }
export const IMPORT_MAX = 500;
/**
 * Preview a CSV of "old path, new target, code" (header optional; code defaults to 301; comma, semicolon or tab).
 * Rows whose old path already has a redirect update it; nothing is written until the merchant confirms.
 */
export function parseCsv(text: string, list: Redirect[], ctx: RCtx): ImportRow[] {
  const lines = latin(text).replace(/\r/g, '').split('\n');
  const out: ImportRow[] = [];
  const seen = new Set<string>();
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /^(from|old|source|المسار|القديم|من)/i.test(cells[0] ?? '')) return;
    if (out.length >= IMPORT_MAX) return;
    const row: ImportRow = { line: i + 1, raw: line, from: normPath(cells[0] ?? ''), to: null, code: 301, state: 'new' };
    if (cells.length < 2) { out.push({ ...row, state: 'error', error: 'columns' }); return; }
    const code = (cells[2] ?? '').trim();
    if (code && code !== '301' && code !== '302') { out.push({ ...row, state: 'error', error: 'code' }); return; }
    row.code = code === '302' ? 302 : 301;
    const fi = fromIssue(row.from, [], ctx);
    if (fi === 'empty' || fi === 'format') { out.push({ ...row, state: 'error', error: 'from' }); return; }
    if (fi === 'served') { out.push({ ...row, state: 'error', error: 'served' }); return; }
    if (seen.has(row.from)) { out.push({ ...row, state: 'error', error: 'repeat' }); return; }
    const to = parseTarget(cells[1] ?? '', ctx);
    if (!to) { out.push({ ...row, state: 'error', error: 'to' }); return; }
    seen.add(row.from);
    const existing = list.find((r) => r.from === row.from);
    out.push({ ...row, to, state: existing ? 'update' : 'new', replaces: existing?.id });
  });
  return out;
}
/** Apply the valid rows of a preview. */
export function applyImport(list: Redirect[], rows: ImportRow[], at: string, by: string): Redirect[] {
  let next = [...list];
  let n = nextRedirectNum(list);
  for (const r of rows) {
    if (r.state === 'error' || !r.to) continue;
    if (r.replaces) next = next.map((x) => (x.id === r.replaces ? { ...x, to: r.to!, code: r.code, on: true, at, by } : x));
    else next = [{ id: `r${n++}`, from: r.from, to: r.to, code: r.code, on: true, hits: 0, at, by }, ...next];
  }
  return next;
}
export const nextRedirectNum = (list: Redirect[]) => Math.max(0, ...list.map((r) => Number(r.id.slice(1)) || 0)) + 1;
export const toCsv = (list: Redirect[], ctx: RCtx) => ['from,to,code', ...list.map((r) => `${r.from},${targetPath(r.to, ctx) ?? ''},${r.code}`)].join('\n');

export function redirectFixtures(): Redirect[] {
  const by = 'سارة';
  return [
    { id: 'r1', from: '/products/black-abaya', to: { kind: 'product', id: 'p1' }, code: 301, on: true, hits: 412, at: '2026-10-02T08:00:00.000Z', by },
    { id: 'r2', from: '/collections/perfumes', to: { kind: 'category', id: 'fragrance' }, code: 301, on: true, hits: 198, at: '2026-10-02T08:00:00.000Z', by },
    { id: 'r3', from: '/wool-scarf', to: { kind: 'product', id: 'p12' }, code: 301, on: true, hits: 37, at: '2026-10-15T10:00:00.000Z', by },
    { id: 'r4', from: '/sale', to: { kind: 'landing', id: 'lp1' }, code: 302, on: true, hits: 0, at: '2026-11-19T09:40:00.000Z', by },
    { id: 'r5', from: '/instagram', to: { kind: 'url', url: 'https://www.instagram.com/' }, code: 302, on: false, hits: 5, at: '2026-11-01T09:00:00.000Z', by },
    { id: 'r6', from: '/ramadan-offers', to: { kind: 'landing', id: 'lp2' }, code: 302, on: true, hits: 0, at: '2026-11-22T12:15:00.000Z', by },
  ];
}
