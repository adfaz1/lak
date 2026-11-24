// Prefill through the URL: the assistant and global-search commands open a tool with values already typed in.
// The tool still validates and the merchant confirms there; nothing is saved by opening a prefilled link.
import type { CouponDraft, CouponType } from './growth';

const latin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** Query keys a coupon draft accepts. `cp` marks a prefilled link so the editor applies it once. */
export interface CouponPrefill { code?: string; type?: CouponType; value?: string; min?: string; per?: string; ends?: string; scope?: 'category' | 'product'; ids?: string[] }
const TYPES: CouponType[] = ['percent', 'fixed', 'freeShip', 'bogo'];

export function couponQuery(p: CouponPrefill): Record<string, string> {
  const q: Record<string, string> = { cp: '1' };
  if (p.code) q.code = p.code;
  if (p.type) q.type = p.type;
  if (p.value) q.value = p.value;
  if (p.min) q.min = p.min;
  if (p.per) q.per = p.per;
  if (p.ends) q.ends = p.ends;
  if (p.scope && p.ids?.length) { q.scope = p.scope; q.ids = p.ids.join(','); }
  return q;
}

/** Fields to lay over an empty coupon draft, or null when the link is not a prefill. Unknown values are ignored. */
export function couponPrefill(query: URLSearchParams): Partial<CouponDraft> | null {
  if (query.get('cp') !== '1') return null;
  const out: Partial<CouponDraft> = {};
  const code = (query.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  if (code) out.code = code;
  const type = query.get('type') as CouponType | null;
  if (type && TYPES.includes(type)) out.type = type;
  const num = (k: string) => { const v = latin(query.get(k) ?? '').replace(/[^\d.]/g, ''); return v || undefined; };
  if (num('value')) out.value = num('value');
  if (num('min')) out.minSpend = num('min');
  if (num('per')) out.limitPerCustomer = num('per');
  const ends = query.get('ends') ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(ends)) out.ends = ends;
  const scope = query.get('scope');
  const ids = (query.get('ids') ?? '').split(',').filter(Boolean);
  if ((scope === 'category' || scope === 'product') && ids.length) { out.scopeKind = scope; out.scopeIds = ids; }
  return Object.keys(out).length ? out : null;
}

/** A positive whole quantity from a link (`qty`), Arabic digits accepted; null when absent or not a number. */
export function prefillQty(query: URLSearchParams, max = 100_000): number | null {
  const v = Number(latin(query.get('qty') ?? '').trim());
  return Number.isInteger(v) && v > 0 && v <= max ? v : null;
}
