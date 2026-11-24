// Global search across the store: orders, products, customers and tools (settings included).
// Pure: the shell passes the current data and renders the groups. Arabic is normalised (hamza,
// ta marbuta, alef maqsura, diacritics) and Arabic-Indic digits are accepted.
import type { Order, L } from '../../merchant/domain';
import type { Product } from '../../merchant/catalog';
import type { Customer } from '../../merchant/workspace';
import type { Role } from '../../merchant/perms';
import { TOOLS, canUseTool, type Tool } from './tools';

export function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
}
const digits = (s: string) => norm(s).replace(/\D/g, '');

export type HitKind = 'order' | 'product' | 'customer' | 'tool';
export interface Hit { kind: HitKind; id: string; title: L; sub: L; path: string; query?: Record<string, string> }
export interface SearchResult { groups: { kind: HitKind; hits: Hit[]; more: number }[]; total: number }

export interface SearchData { orders: Order[]; products: Product[]; customers: Customer[]; role: Role; canSee: (section: string) => boolean }

const words = (q: string) => norm(q).split(/\s+/).filter(Boolean);
const hasAll = (hay: string, ws: string[]) => ws.every((w) => hay.includes(w));

function orderHits(orders: Order[], q: string): Hit[] {
  const ws = words(q.replace('#', ''));
  const d = digits(q);
  const scored = orders.map((o) => {
    const ref = o.ref;
    let score = 0;
    if (d && ref === d) score = 100;
    else if (d.length >= 3 && ref.includes(d)) score = 60;
    else if (hasAll(norm(`${o.customer.ar} ${o.customer.en} ${o.city.ar} ${o.city.en}`), ws)) score = 40;
    return { o, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.o.hoursAgo - b.o.hoursAgo);
  return scored.map(({ o }) => ({ kind: 'order' as const, id: o.ref, title: { ar: `#${o.ref}`, en: `#${o.ref}` }, sub: { ar: `${o.customer.ar} · ${o.city.ar}`, en: `${o.customer.en} · ${o.city.en}` }, path: `orders/${o.ref}` }));
}

function productHits(products: Product[], q: string): Hit[] {
  const ws = words(q);
  return products.filter((p) => {
    const skus = [p.sku, ...p.variants.map((v) => v.sku)].join(' ');
    return hasAll(norm(`${p.name.ar} ${p.name.en} ${skus} ${p.category.ar} ${p.category.en}`), ws);
  }).map((p) => ({ kind: 'product' as const, id: p.id, title: p.name, sub: { ar: `${p.sku} · ${p.category.ar}`, en: `${p.sku} · ${p.category.en}` }, path: `products/${p.id}` }));
}

function customerHits(customers: Customer[], q: string): Hit[] {
  const ws = words(q);
  const d = digits(q);
  return customers.filter((c) => (d.length >= 4 && digits(c.phone).includes(d)) || hasAll(norm(`${c.name.ar} ${c.name.en} ${c.email} ${c.city.ar} ${c.city.en}`), ws))
    .map((c) => ({ kind: 'customer' as const, id: c.id, title: c.name, sub: { ar: `${c.city.ar} · ${c.id}`, en: `${c.city.en} · ${c.id}` }, path: `customers/${c.id}` }));
}

export function toolHits(q: string, role: Role, tools: Tool[] = TOOLS): Hit[] {
  const ws = words(q);
  return tools.filter((x) => canUseTool(x, role) && hasAll(norm(`${x.label.ar} ${x.label.en} ${x.desc.ar} ${x.desc.en} ${x.keys}`), ws))
    .map((x) => ({ kind: 'tool' as const, id: x.id, title: x.label, sub: x.desc, path: x.path, query: x.query }));
}

/** Grouped results, each group capped; `more` says how many were left out so the UI can offer "see all". */
export function globalSearch(q: string, data: SearchData, cap = 5): SearchResult {
  if (!norm(q)) return { groups: [], total: 0 };
  const all: [HitKind, Hit[]][] = [
    ['tool', toolHits(q, data.role)],
    ['order', data.canSee('orders') ? orderHits(data.orders, q) : []],
    ['product', data.canSee('products') ? productHits(data.products, q) : []],
    ['customer', data.canSee('customers') ? customerHits(data.customers, q) : []],
  ];
  // An exact order number or a SKU-like query puts that group first.
  const d = digits(q);
  if (d && data.orders.some((o) => o.ref === d)) all.sort((a) => (a[0] === 'order' ? -1 : 0));
  const groups = all.filter(([, h]) => h.length).map(([kind, hits]) => ({ kind, hits: hits.slice(0, cap), more: Math.max(0, hits.length - cap) }));
  return { groups, total: all.reduce((s, [, h]) => s + h.length, 0) };
}

/** Where "see all" goes for a group: the section's own search, keeping the query. */
export function seeAllPath(kind: HitKind, q: string): { path: string; query: Record<string, string> } | null {
  if (kind === 'order') return { path: 'orders', query: { q } };
  if (kind === 'product') return { path: 'products', query: { q } };
  if (kind === 'customer') return { path: 'customers', query: { q } };
  return null;
}
