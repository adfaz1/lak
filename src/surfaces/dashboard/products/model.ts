// Products section: screen rules only (no React). Reuses the catalogue domain in merchant/catalog.ts as the
// single source of truth (validation, drafts, variants, money parsing, bulk edit, CSV import) and adds what the
// new screens need: list filtering, per-warehouse initial stock, media ordering, previews and import batches.
import { LOC_IDS, type Channel, type L, type LocId } from '../../merchant/domain';
import {
  catKey, categoryTree, emptyDraft, parseCsv as parseCsvRows, fromDraft, margin, normaliseDigits, parseIntStrict, parseMoney, rebuildVariants, skusOf, toDraft, validateBulkRow, validateDraft,
  variantSku, type BulkRow, type Category, type CheckedRow, type DraftError, type ImportField, type Media, type Product, type ProductDraft, type ProductStatus, type VariantDraft,
} from '../../merchant/catalog';
import { available, levelOf, lowStock, type AdjReason, type Level, type StockLog } from '../../merchant/inventory';
import { productPhoto } from '../model/media';

export const STATUSES: ProductStatus[] = ['active', 'draft', 'archived'];
export const CHANNELS: Channel[] = ['online', 'market', 'app'];
export const PAGE_SIZE = 20;

/* ---------- List ---------- */

export type StatusTab = 'all' | ProductStatus;
export interface ListFilter { q: string; tab: StatusTab; category: string; channel: string; tag?: string }

export const readTab = (v: string | null): StatusTab => (v === 'active' || v === 'draft' || v === 'archived' ? v : 'all');
export const readChannel = (v: string | null): Channel | '' => (v === 'online' || v === 'market' || v === 'app' ? v : '');

/** Units that can still be sold across warehouses; null for digital products (no stock). */
export function stockOf(p: Product, levels: Level[]): number | null {
  if (p.type === 'digital') return null;
  const skus = new Set(skusOf(p));
  return levels.filter((l) => skus.has(l.sku)).reduce((s, l) => s + available(l), 0);
}
/** Whether any of the product's SKUs is at its reorder point in a warehouse. */
export function isLow(p: Product, levels: Level[]): boolean {
  if (p.type === 'digital') return false;
  const skus = new Set(skusOf(p));
  return lowStock(levels).some((l) => skus.has(l.sku));
}

/** How many of the product's SKUs are at or below their threshold in at least one warehouse. */
export function lowSkuCount(p: Product, levels: Level[]): number {
  if (p.type === 'digital') return 0;
  const skus = new Set(skusOf(p));
  return new Set(lowStock(levels).filter((l) => skus.has(l.sku)).map((l) => l.sku)).size;
}

/** Lowest and highest selling price across variants; `from` when they differ. */
export function priceRange(p: Product): { min: number; max: number; from: boolean } {
  const prices = p.variants.length ? p.variants.map((v) => v.price) : [p.price];
  const min = Math.min(...prices), max = Math.max(...prices);
  return { min, max, from: min !== max };
}

export const categoryKey = (c: L) => c.en.toLowerCase();
/** Categories present in the catalogue, in first-seen order. */
export function categoriesOf(products: Product[]): L[] {
  const seen = new Map<string, L>();
  for (const p of products) if (!seen.has(categoryKey(p.category))) seen.set(categoryKey(p.category), p.category);
  return [...seen.values()];
}

/** `cats` (optional): a parent category also lists its children's products. */
export function filterProducts(products: Product[], f: ListFilter, cats: Category[] = []): Product[] {
  const n = f.q.trim().toLowerCase();
  const parent = f.category ? cats.find((c) => catKey(c.name) === f.category) : undefined;
  const keys = new Set([f.category, ...(parent ? cats.filter((c) => c.parent === parent.id).map((c) => catKey(c.name)) : [])]);
  const tag = (f.tag ?? '').toLowerCase();
  return products.filter((p) => (f.tab === 'all' || p.status === f.tab)
    && (!f.category || keys.has(categoryKey(p.category)))
    && (!tag || (p.tags ?? []).some((t) => t.toLowerCase() === tag))
    && (!f.channel || p.channels[f.channel as Channel])
    && (!n || p.name.ar.includes(f.q.trim()) || p.name.en.toLowerCase().includes(n) || skusOf(p).some((s) => s.toLowerCase().includes(n)) || p.sku.toLowerCase().includes(n)));
}

/** Counts per status tab for the products that match everything except the tab. */
export function tabCounts(products: Product[], f: ListFilter, cats: Category[] = []): Record<StatusTab, number> {
  const base = filterProducts(products, { ...f, tab: 'all' }, cats);
  return { all: base.length, active: base.filter((p) => p.status === 'active').length, draft: base.filter((p) => p.status === 'draft').length, archived: base.filter((p) => p.status === 'archived').length };
}

export function paginate<T>(rows: T[], pageParam: string | null, size = PAGE_SIZE): { page: number; pages: number; rows: T[] } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(pageParam)) || 1));
  return { page, pages, rows: rows.slice((page - 1) * size, page * size) };
}

export const activeChannels = (p: { channels: Record<Channel, boolean> }): Channel[] => CHANNELS.filter((c) => p.channels[c]);

/** Selection scope: what the bulk bar says the selection covers. */
export function selectionScope(selected: Set<string>, pageIds: string[], allIds: string[]): 'page' | 'all' | 'some' {
  if (allIds.length > pageIds.length && allIds.every((id) => selected.has(id))) return 'all';
  if (pageIds.length > 0 && pageIds.every((id) => selected.has(id)) && selected.size === pageIds.length) return 'page';
  return 'some';
}

/* ---------- Bulk edit ---------- */

export const bulkRowsFor = (products: Product[], ids: Set<string>): BulkRow[] =>
  products.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, price: (p.price / 100).toFixed(2), compareAt: p.compareAt === null ? '' : (p.compareAt / 100).toFixed(2), status: p.status }));

/** Every cell checked; the number of rows with at least one invalid cell. Nothing is saved while this is above zero. */
export function bulkCheck(rows: BulkRow[]) {
  const errors = rows.map(validateBulkRow);
  return { errors, invalidRows: errors.filter((e) => Object.keys(e).length > 0).length };
}

/** Rows whose values differ from the stored product (what saving would actually change). */
export function bulkChanged(products: Product[], rows: BulkRow[]): string[] {
  return rows.filter((r) => {
    const p = products.find((x) => x.id === r.id);
    if (!p) return false;
    const price = parseMoney(r.price), cmp = r.compareAt.trim() ? parseMoney(r.compareAt) : null;
    return price !== p.price || cmp !== p.compareAt || r.status !== p.status;
  }).map((r) => r.id);
}

/* ---------- Editor draft ---------- */

export type StockBy = Record<LocId, string>;
export interface EditVariant extends VariantDraft { stockBy: StockBy }
/** The catalogue draft plus what this editor adds: category and initial stock per warehouse. */
export interface EditDraft extends Omit<ProductDraft, 'variants'> { variants: EditVariant[]; category: L; stockBy: StockBy; tags: string[]; /** Name of the product this unsaved draft was copied from. */ copyOf?: string }

export const CATEGORIES: L[] = [
  { ar: 'أزياء', en: 'Fashion' }, { ar: 'عطور', en: 'Fragrance' }, { ar: 'حقائب', en: 'Bags' }, { ar: 'منزل', en: 'Home' },
  { ar: 'هدايا', en: 'Gifts' }, { ar: 'أغذية', en: 'Food' }, { ar: 'عام', en: 'General' },
];
/** One '0' per active location (locations are data, so a new branch gets its own initial-stock field). */
const zeroStock = (): StockBy => Object.fromEntries(LOC_IDS.map((l) => [l, '0']));

/** Fixture media ids that show the product's licensed photo; other media show the neutral placeholder. */
const FIXTURE_MEDIA: Record<string, string> = { m1: 'p1', m3: 'p2', m4: 'p3' };
export const photoMediaId = (productId: string) => `photo-${productId}`;
/** Object URLs created in this page lifetime. A saved draft from before a reload points at a dead URL; it shows the placeholder. */
const LIVE_URLS = new Set<string>();
export const rememberUrl = (u: string) => { LIVE_URLS.add(u); return u; };
export function mediaSrc(m: Media, size: 'thumb' | 'large' = 'thumb'): string | undefined {
  if (m.src) return LIVE_URLS.has(m.src) ? m.src : undefined;
  const pid = FIXTURE_MEDIA[m.id] ?? (m.id.startsWith('photo-') ? m.id.slice(6) : undefined);
  return productPhoto(pid, size);
}
/** A product's media; a product with a licensed photo but no media entry gets that photo as its first image. */
export function mediaOf(p: Product): Media[] {
  if (p.media.length || !productPhoto(p.id)) return p.media.map((m) => ({ ...m }));
  return [{ id: photoMediaId(p.id), label: { ar: 'صورة المنتج', en: 'Product photo' }, alt: p.name.en }];
}
/** Photo for list rows: the primary (first) image, or the licensed product photo. */
export const listPhoto = (p: Product) => (p.media.length ? mediaSrc(p.media[0]) : productPhoto(p.id));

export function toEditDraft(p: Product | undefined): EditDraft {
  if (!p) return { ...emptyDraft(), variants: [], category: CATEGORIES[0], stockBy: zeroStock(), tags: [] };
  const d = toDraft(p);
  return { ...d, media: mediaOf(p), variants: d.variants.map((v) => ({ ...v, stockBy: zeroStock() })), category: p.category, stockBy: zeroStock(), tags: [...(p.tags ?? [])] };
}

/** Rebuild the colour × size matrix (catalogue rule), keeping typed values and giving new rows per-warehouse stock. */
export function rebuildEditVariants(d: EditDraft): EditVariant[] {
  return rebuildVariants(d as ProductDraft).map((v) => ('stockBy' in v ? (v as EditVariant) : { ...v, stockBy: zeroStock() }));
}

const okStock = (s: string | undefined) => { const n = parseIntStrict((s ?? '').trim() || '0'); return n !== null && n >= 0; };

/**
 * Catalogue validation plus initial stock per warehouse. Initial stock is asked only for physical SKUs that do not
 * exist in inventory yet (`known`); existing stock changes go through Inventory with a reason.
 */
export function validateEdit(d: EditDraft, taken: Set<string>, known: Set<string>): Record<string, DraftError> {
  const e = validateDraft({ ...d, stock: '0', variants: d.variants.map((v) => ({ ...v, stock: '0' })) }, taken);
  if (d.type === 'physical') {
    if (!d.variants.length && !known.has(d.sku.trim())) for (const loc of LOC_IDS) if (!okStock(d.stockBy[loc])) e[`stock.${loc}`] = 'stock';
    d.variants.forEach((v, i) => { if (!known.has(v.sku.trim())) for (const loc of LOC_IDS) if (!okStock(v.stockBy[loc])) e[`v.${i}.stock.${loc}`] = 'stock'; });
  }
  return e;
}

/** Field keys in page order so the error summary lists them as the merchant meets them. */
const ORDER = ['nameAr', 'nameEn', 'media', 'price', 'compareAt', 'cost', 'sku', 'stock', 'colors', 'sizes', 'v.', 'weight', 'slug'];
export function orderErrors(keys: string[]): string[] {
  const rank = (k: string) => { const i = ORDER.findIndex((f) => k === f || k.startsWith(f)); return i < 0 ? 99 : i; };
  const num = (k: string) => Number(k.split('.')[1]) || 0;
  return [...keys].sort((a, b) => rank(a) - rank(b) || num(a) - num(b) || a.localeCompare(b));
}
/** DOM id of the control that carries an error key. */
export const fieldId = (k: string) => `pe-${k.replace(/\./g, '-')}`;
export type SectionId = 'basics' | 'media' | 'pricing' | 'inventory' | 'variants' | 'shipping' | 'seo';
export function sectionOf(k: string): SectionId {
  if (k === 'nameAr' || k === 'nameEn') return 'basics';
  if (k.startsWith('media')) return 'media';
  if (k === 'price' || k === 'compareAt' || k === 'cost') return 'pricing';
  if (k === 'sku' || k.startsWith('stock')) return 'inventory';
  if (k === 'weight') return 'shipping';
  if (k === 'slug') return 'seo';
  return 'variants';
}

export function fromEditDraft(d: EditDraft, id: string, version: number): Product {
  const tags = normaliseTags(d.tags ?? []);
  return { ...fromDraft(d as ProductDraft, id, version, d.media), category: d.category, ...(tags.length ? { tags } : {}) };
}

/** Inventory levels for SKUs that do not exist yet, with the initial quantities typed per warehouse. */
export function levelsForNew(d: EditDraft, known: Set<string>): Level[] {
  if (d.type !== 'physical') return [];
  const fresh: { sku: string; by: StockBy }[] = d.variants.length
    ? d.variants.filter((v) => !known.has(v.sku.trim())).map((v) => ({ sku: v.sku.trim(), by: v.stockBy }))
    : known.has(d.sku.trim()) ? [] : [{ sku: d.sku.trim(), by: d.stockBy }];
  return fresh.flatMap((f) => LOC_IDS.map((loc) => ({ sku: f.sku, loc, onHand: parseIntStrict((f.by[loc] ?? '').trim() || '0') ?? 0, reserved: 0, incoming: 0, version: 1, threshold: 3 })));
}

export const nextProductId = (products: Product[]) => `p${Math.max(0, ...products.map((p) => Number(p.id.slice(1)) || 0)) + 1}`;

/* ---------- Media ---------- */

export function moveItem<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const n = [...list];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}
export const makePrimary = <T,>(list: T[], i: number): T[] => (i <= 0 || i >= list.length ? list : [list[i], ...list.slice(0, i), ...list.slice(i + 1)]);

/* ---------- Pricing and previews ---------- */

/** Profit per item and margin, only when a cost is entered (never shown without a cost). */
export function profitOf(price: string, cost: string) {
  return margin(parseMoney(price), cost.trim() ? parseMoney(cost) : null);
}
export function discountPct(price: string, compareAt: string): number | null {
  const p = parseMoney(price), c = compareAt.trim() ? parseMoney(compareAt) : null;
  if (!p || !c || c <= p) return null;
  return Math.round(((c - p) * 100) / c);
}
/** Lowest variant price when variants differ ("from"), otherwise the base price. */
export function previewPrice(d: Pick<EditDraft, 'price' | 'variants'>): { amount: number | null; from: boolean } {
  const prices = d.variants.map((v) => parseMoney(v.price)).filter((p): p is number => p !== null && p > 0);
  if (prices.length && Math.min(...prices) !== Math.max(...prices)) return { amount: Math.min(...prices), from: true };
  const base = parseMoney(d.price);
  return { amount: base || null, from: false };
}
/** Why a product is not visible to shoppers on the online store, or null when it is. */
export function hiddenReason(d: Pick<EditDraft, 'status' | 'channels'>): 'draft' | 'archived' | 'offline' | null {
  if (d.status !== 'active') return d.status;
  return d.channels.online ? null : 'offline';
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
export function seoPreview(d: Pick<EditDraft, 'seoTitle' | 'seoDesc' | 'slug' | 'nameEn' | 'nameAr' | 'descEn' | 'descAr'>, lang: 'ar' | 'en') {
  const name = lang === 'ar' ? d.nameAr || d.nameEn : d.nameEn || d.nameAr;
  const desc = lang === 'ar' ? d.descAr || d.descEn : d.descEn || d.descAr;
  return { title: clip(d.seoTitle || name, 60), desc: clip(d.seoDesc || desc, 160), path: `/p/${d.slug || slugify(d.nameEn) || '…'}` };
}

/* ---------- Import ---------- */

export interface ImportWork { kind: 'create' | 'update'; row: CheckedRow }
export function importWork(plan: { create: CheckedRow[]; update: CheckedRow[] }): ImportWork[] {
  return [...plan.create.map((row) => ({ kind: 'create' as const, row })), ...plan.update.map((row) => ({ kind: 'update' as const, row }))];
}

/**
 * Apply one batch of an import. Creates go in as new products (stock at the Riyadh warehouse); updates change only
 * price and status, never name, images or stock.
 */
export function applyImportBatch(products: Product[], levels: Level[], batch: ImportWork[], defaultLoc: LocId = 'ryd'): { products: Product[]; levels: Level[]; created: number; updated: number } {
  let id = Number(nextProductId(products).slice(1));
  const created: Product[] = [];
  const updates = new Map<string, CheckedRow>();
  for (const w of batch) {
    if (w.kind === 'update') { updates.set(w.row.sku.toUpperCase(), w.row); continue; }
    const r = w.row;
    created.push({
      id: `p${id++}`, name: { ar: r.name, en: r.name }, desc: { ar: '', en: '' }, status: r.status, type: 'physical', price: r.price ?? 0, compareAt: r.compareAt, cost: null,
      sku: r.sku, barcode: '', weight: null, media: [], colors: [], sizes: [], variants: [], seo: { title: r.name, desc: '', slug: slugify(r.sku) },
      channels: { online: true, market: false, app: false }, category: { ar: 'مستورد', en: 'Imported' }, version: 1,
    });
  }
  const nextProducts = [...created, ...products.map((p) => { const u = updates.get(p.sku.toUpperCase()); return u ? { ...p, price: u.price ?? p.price, status: u.status, version: p.version + 1 } : p; })];
  const newLevels: Level[] = batch.filter((w) => w.kind === 'create').flatMap((w) => LOC_IDS.map((loc) => ({ sku: w.row.sku, loc, onHand: loc === defaultLoc ? w.row.qty : 0, reserved: 0, incoming: 0, version: 1, threshold: 3 })));
  return { products: nextProducts, levels: [...levels, ...newLevels], created: created.length, updated: batch.length - created.length };
}

/* ---------- Tags ---------- */

export const TAG_MAX = 30;
/** Trimmed, de-duplicated (case-insensitive), non-empty tags in the order typed. */
export function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) { const v = t.trim().slice(0, TAG_MAX); const k = v.toLowerCase(); if (v && !seen.has(k)) { seen.add(k); out.push(v); } }
  return out;
}
/** Every tag used in the catalogue, sorted. */
export const allTags = (products: Product[]) => [...new Set(products.flatMap((p) => p.tags ?? []))].sort((a, b) => a.localeCompare(b));

/* ---------- Categories in lists and the editor ---------- */

export interface CatOption { key: string; name: L; depth: 0 | 1; id: string | null }
/** The merchant's categories in tree order, plus any category a product still carries that is not in the list (e.g. "Imported"). */
export function categoryOptions(cats: Category[], products: Product[] = []): CatOption[] {
  const out: CatOption[] = categoryTree(cats).map(({ cat, depth }) => ({ key: catKey(cat.name), name: cat.name, depth, id: cat.id }));
  const known = new Set(out.map((o) => o.key));
  for (const p of products) { const k = catKey(p.category); if (!known.has(k)) { known.add(k); out.push({ key: k, name: p.category, depth: 0, id: null }); } }
  return out;
}
export const productsIn = (products: Product[], c: Category) => products.filter((p) => catKey(p.category) === catKey(c.name));
/** Products in a category and its children (what a parent category page lists). */
export function productsUnder(products: Product[], cats: Category[], c: Category): Product[] {
  const keys = new Set([c, ...cats.filter((x) => x.parent === c.id)].map((x) => catKey(x.name)));
  return products.filter((p) => keys.has(catKey(p.category)));
}
export const newCategoryId = (cats: Category[], en: string) => {
  const base = `c-${slugify(en) || 'category'}`;
  let id = base, i = 2;
  while (cats.some((c) => c.id === id)) id = `${base}-${i++}`;
  return id;
};
/** Swap a category with its previous/next sibling and renumber that level. */
export function moveCategory(cats: Category[], id: string, dir: -1 | 1): Category[] {
  const me = cats.find((c) => c.id === id);
  if (!me) return cats;
  const siblings = categoryTree(cats).map((t) => t.cat).filter((c) => (c.parent ?? null) === (me.parent ?? null));
  const i = siblings.findIndex((c) => c.id === id);
  const moved = moveItem(siblings, i, dir);
  if (moved === siblings) return cats;
  const order = new Map(moved.map((c, n) => [c.id, n]));
  return cats.map((c) => (order.has(c.id) && order.get(c.id) !== c.order ? { ...c, order: order.get(c.id)!, version: c.version + 1 } : c));
}
/** A category can be deleted only when nothing is in it and it has no children; otherwise products move first. */
export function deleteBlock(c: Category, cats: Category[], products: Product[]): 'children' | 'products' | null {
  if (cats.some((x) => x.parent === c.id)) return 'children';
  if (productsIn(products, c).length) return 'products';
  return null;
}

/* ---------- Duplicate ---------- */

/** A new-product draft copied from an existing product: draft status, a free SKU, no stock and no URL handle. */
export function duplicateDraft(p: Product, products: Product[]): EditDraft {
  const taken = new Set(products.flatMap((x) => [x.sku, ...x.variants.map((v) => v.sku)]).map((x) => x.toUpperCase()));
  let sku = `${p.sku}-COPY`.slice(0, 32);
  const clash = (base: string) => taken.has(base.toUpperCase()) || p.variants.some((v) => taken.has(variantSku(base, v.color, v.size).toUpperCase()));
  for (let i = 2; clash(sku); i++) sku = `${p.sku}-COPY${i}`.slice(0, 32);
  const d = toEditDraft(p);
  return {
    ...d, nameAr: `${p.name.ar} (نسخة)`, nameEn: `${p.name.en} (copy)`, status: 'draft', sku, slug: '', seoTitle: '', barcode: '',
    // Media ids are only unique within a product, so the copy keeps them (and with them the licensed photos).
    media: d.media.map((m) => ({ ...m })),
    variants: d.variants.map((v) => ({ ...v, sku: variantSku(sku, v.color, v.size), isNew: true, stock: '0', stockBy: Object.fromEntries(LOC_IDS.map((l) => [l, '0'])) })),
  };
}

/* ---------- Bulk operations (any field, with preview and undo) ---------- */

export type BulkField = 'price' | 'compareAt' | 'cost' | 'status' | 'category' | 'channel' | 'tag' | 'stock';
export const BULK_FIELDS: BulkField[] = ['price', 'compareAt', 'cost', 'stock', 'category', 'status', 'channel', 'tag'];
export type BulkMode = 'set' | 'pct' | 'add' | 'clear' | 'on' | 'off' | 'remove';
export interface BulkOp { field: BulkField; mode: BulkMode; value: string; loc?: LocId; channel?: Channel; reason?: AdjReason | '' }
export type BulkVal = number | null | string | boolean | string[] | L;
export type BulkOpError = 'money' | 'pct' | 'compareAt' | 'priceZero' | 'qty' | 'belowZero' | 'digital' | 'value' | 'reason' | 'loc';
export interface BulkPreviewRow { id: string; before: BulkVal; after: BulkVal; error: BulkOpError | null; changed: boolean }

/** "-10", "−10%", "١٠" → number of percent; null when not a number between −95 and +500. */
export function parsePct(input: string): number | null {
  const s = normaliseDigits(input.replace(/[−–]/g, '-').replace(/[%٪]/g, '')).replace(/^\+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n >= -95 && n <= 500 && n !== 0 ? n : null;
}
const scale = (h: number, pct: number) => Math.round((h * (100 + pct)) / 100);
const lowestPrice = (p: Product) => Math.min(...(p.variants.length ? p.variants.map((v) => v.price) : [p.price]));
/** On hand of every SKU of a product at a location. */
const onHandAt = (p: Product, levels: Level[], loc: LocId) => skusOf(p).reduce((s, sku) => s + (levelOf(levels, sku, loc)?.onHand ?? 0), 0);

/** Errors that make the whole operation invalid (before looking at rows). */
export function bulkOpError(op: BulkOp, cats: Category[]): BulkOpError | null {
  const v = op.value.trim();
  switch (op.field) {
    case 'price': return op.mode === 'pct' ? (parsePct(v) === null ? 'pct' : null) : (parseMoney(v) ? null : 'money');
    case 'compareAt': return op.mode === 'clear' ? null : op.mode === 'pct' ? (parsePct(v) === null || (parsePct(v) ?? 0) <= 0 ? 'pct' : null) : parseMoney(v) === null ? 'money' : null;
    case 'cost': return op.mode === 'clear' ? null : op.mode === 'pct' ? (parsePct(v) === null ? 'pct' : null) : parseMoney(v) === null ? 'money' : null;
    case 'status': return v === 'active' || v === 'draft' || v === 'archived' ? null : 'value';
    case 'category': return cats.some((c) => c.id === v) ? null : 'value';
    case 'channel': return op.channel ? null : 'value';
    case 'tag': return v && v.length <= TAG_MAX ? null : 'value';
    case 'stock': {
      if (!op.loc || !LOC_IDS.includes(op.loc)) return 'loc';
      const n = parseIntStrict(v.replace(/^\+/, ''));
      if (n === null || (op.mode === 'set' && n < 0) || (op.mode === 'add' && n === 0)) return 'qty';
      return op.reason ? null : 'reason';
    }
  }
}

/** Before/after for each selected product. Rows with an error are skipped on save; rows that would not change are left alone. */
export function previewBulk(products: Product[], levels: Level[], ids: string[], op: BulkOp, cats: Category[]): BulkPreviewRow[] {
  const v = op.value.trim();
  return ids.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p).map((p) => {
    let before: BulkVal = null, after: BulkVal = null, error: BulkOpError | null = null;
    switch (op.field) {
      case 'price': {
        before = p.price;
        after = op.mode === 'pct' ? scale(p.price, parsePct(v) ?? 0) : parseMoney(v) ?? p.price;
        if (after <= 0) error = 'priceZero';
        else if (p.compareAt !== null && p.compareAt <= after) error = 'compareAt';
        break;
      }
      case 'compareAt': {
        before = p.compareAt;
        after = op.mode === 'clear' ? null : op.mode === 'pct' ? scale(p.price, parsePct(v) ?? 0) : parseMoney(v);
        if (after !== null && after <= lowestPrice(p)) error = 'compareAt';
        break;
      }
      case 'cost': {
        before = p.cost;
        after = op.mode === 'clear' ? null : op.mode === 'pct' ? (p.cost === null ? null : scale(p.cost, parsePct(v) ?? 0)) : parseMoney(v);
        if (op.mode === 'pct' && p.cost === null) error = 'money';
        break;
      }
      case 'status': before = p.status; after = v; break;
      case 'category': { before = p.category; after = cats.find((c) => c.id === v)?.name ?? p.category; break; }
      case 'channel': before = !!op.channel && p.channels[op.channel]; after = op.mode === 'on'; break;
      case 'tag': {
        before = p.tags ?? [];
        after = op.mode === 'remove' ? before.filter((t) => t.toLowerCase() !== v.toLowerCase()) : normaliseTags([...before, v]);
        break;
      }
      case 'stock': {
        if (p.type === 'digital') { error = 'digital'; break; }
        const n = parseIntStrict(v.replace(/^\+/, '')) ?? 0;
        const loc = op.loc ?? '';
        before = onHandAt(p, levels, loc);
        const skus = skusOf(p);
        after = op.mode === 'set' ? n * skus.length : before + n * skus.length;
        if (op.mode === 'add' && skus.some((sku) => (levelOf(levels, sku, loc)?.onHand ?? 0) + n < 0)) error = 'belowZero';
        break;
      }
    }
    return { id: p.id, before, after, error, changed: !error && JSON.stringify(before) !== JSON.stringify(after) };
  });
}

export interface BulkUndo { id: string; field: BulkField; products: { before: Product; afterVersion: number }[]; levels: { before: Level; afterVersion: number }[] }
export interface BulkResult { products: Product[]; levels: Level[]; log: StockLog[]; undo: BulkUndo; changed: number }

/** Apply the operation to the rows that change and have no error. Returns what undo needs (the exact previous records). */
export function applyBulk(products: Product[], levels: Level[], ids: string[], op: BulkOp, cats: Category[], ref: string, who: string): BulkResult {
  const rows = previewBulk(products, levels, ids, op, cats).filter((r) => r.changed);
  const want = new Map(rows.map((r) => [r.id, r]));
  const undo: BulkUndo = { id: ref, field: op.field, products: [], levels: [] };
  const log: StockLog[] = [];
  let nextLevels = levels;
  const v = op.value.trim();
  const nextProducts = products.map((p) => {
    const r = want.get(p.id);
    if (!r) return p;
    if (op.field === 'stock') {
      const n = parseIntStrict(v.replace(/^\+/, '')) ?? 0;
      const loc = op.loc!;
      skusOf(p).forEach((sku, i) => {
        const cur = levelOf(nextLevels, sku, loc) ?? { sku, loc, onHand: 0, reserved: 0, incoming: 0, version: 0, threshold: 3 };
        const after = op.mode === 'set' ? n : cur.onHand + n;
        if (after === cur.onHand) return;
        const next: Level = { ...cur, onHand: after, version: cur.version + 1 };
        nextLevels = levelOf(nextLevels, sku, loc) ? nextLevels.map((l) => (l.sku === sku && l.loc === loc ? next : l)) : [...nextLevels, next];
        undo.levels.push({ before: cur, afterVersion: next.version });
        log.push({ id: `${ref}-${p.id}-${i + 1}`, sku, loc, delta: after - cur.onHand, before: cur.onHand, after, reason: op.reason || 'other', who, ref, note: ref });
      });
      return p;
    }
    let next: Product = p;
    const pct = parsePct(v) ?? 0;
    switch (op.field) {
      case 'price':
        next = op.mode === 'pct'
          ? { ...p, price: r.after as number, variants: p.variants.map((x) => ({ ...x, price: scale(x.price, pct) })) }
          : { ...p, price: r.after as number, variants: p.variants.map((x) => (x.price === p.price ? { ...x, price: r.after as number } : x)) };
        break;
      case 'compareAt': next = { ...p, compareAt: r.after as number | null }; break;
      case 'cost': next = { ...p, cost: r.after as number | null }; break;
      case 'status': next = { ...p, status: r.after as ProductStatus }; break;
      case 'category': next = { ...p, category: { ...(r.after as L) } }; break;
      case 'channel': next = { ...p, channels: { ...p.channels, [op.channel!]: r.after as boolean } }; break;
      case 'tag': next = { ...p, tags: r.after as string[] }; break;
    }
    next = { ...next, version: p.version + 1 };
    undo.products.push({ before: p, afterVersion: next.version });
    return next;
  });
  return { products: nextProducts, levels: nextLevels, log, undo, changed: rows.length };
}

/**
 * Put back what a bulk edit changed, record by record. A product or level edited again since (version moved on) is left
 * as it is and counted as skipped, so undo never overwrites someone's later work. Stock undo is logged as its own movement.
 */
export function undoBulk(products: Product[], levels: Level[], u: BulkUndo, who: string): { products: Product[]; levels: Level[]; log: StockLog[]; restored: number; skipped: number } {
  let restored = 0, skipped = 0;
  const pb = new Map(u.products.map((x) => [x.before.id, x]));
  const nextProducts = products.map((p) => {
    const x = pb.get(p.id);
    if (!x) return p;
    if (p.version !== x.afterVersion) { skipped++; return p; }
    restored++;
    return { ...x.before, version: p.version + 1 };
  });
  const log: StockLog[] = [];
  let nextLevels = levels;
  u.levels.forEach((x, i) => {
    const cur = levelOf(nextLevels, x.before.sku, x.before.loc);
    if (!cur || cur.version !== x.afterVersion) { skipped++; return; }
    restored++;
    nextLevels = nextLevels.map((l) => (l === cur ? { ...cur, onHand: x.before.onHand, version: cur.version + 1 } : l));
    log.push({ id: `${u.id}-U${i + 1}`, sku: cur.sku, loc: cur.loc, delta: x.before.onHand - cur.onHand, before: cur.onHand, after: x.before.onHand, reason: 'other', who, ref: u.id, note: `Undo ${u.id}` });
  });
  return { products: nextProducts, levels: nextLevels, log, restored, skipped };
}

/* ---------- Media upload (local previews) ---------- */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export type FileProblem = 'type' | 'size' | 'empty';
/** Checked before any upload starts: images only, under 10 MB. */
export function checkImage(f: { type: string; size: number }): FileProblem | null {
  if (!IMAGE_TYPES.includes(f.type)) return 'type';
  if (f.size === 0) return 'empty';
  if (f.size > MAX_IMAGE_BYTES) return 'size';
  return null;
}
/** Alt text suggested from a file name ("black-abaya_front.jpg" → "black abaya front"); the merchant still confirms it. */
export const altFromName = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Remove an image; returns what undo needs to put it back at the same position. */
export function removeMedia(list: Media[], i: number): { list: Media[]; removed: { item: Media; index: number } | null } {
  if (i < 0 || i >= list.length) return { list, removed: null };
  return { list: list.filter((_, j) => j !== i), removed: { item: list[i], index: i } };
}
export function restoreMedia(list: Media[], r: { item: Media; index: number }): Media[] {
  if (list.some((m) => m.id === r.item.id)) return list;
  const n = [...list];
  n.splice(Math.min(r.index, n.length), 0, r.item);
  return n;
}

/* ---------- Import: extra columns, per-cell problems and partial save ---------- */

export interface CheckedRowX extends CheckedRow { nameAr: string; cost: number | null; category: L | null }
/** Adds Arabic name, cost and category to the catalogue's row checks. An unknown category is a cell error, never a silent new one. */
export function extendImport(rows: string[][], mapping: ImportField[], checked: CheckedRow[], cats: Category[]): CheckedRowX[] {
  const col = (f: ImportField) => mapping.indexOf(f);
  const get = (r: string[], f: ImportField) => (col(f) >= 0 ? (r[col(f)] ?? '').trim() : '');
  return checked.map((c, i) => {
    const r = rows[i] ?? [];
    const problems = [...c.problems];
    const rawCost = get(r, 'cost');
    const cost = rawCost ? parseMoney(rawCost) : null;
    if (rawCost && cost === null) problems.push({ field: 'cost', code: 'cost', value: rawCost });
    const rawCat = get(r, 'category');
    let category: L | null = null;
    if (rawCat) {
      const hit = cats.find((x) => catKey(x.name) === rawCat.toLowerCase() || x.name.ar === rawCat || x.slug === rawCat.toLowerCase());
      if (hit) category = hit.name; else problems.push({ field: 'category', code: 'category', value: rawCat });
    }
    const nameAr = get(r, 'nameAr');
    const name = c.name || nameAr;
    const fixed = !c.name && nameAr ? problems.filter((p) => p.code !== 'nameMissing') : problems;
    return { ...c, name, nameAr, cost, category, problems: fixed };
  });
}
/** Problem code per mapped cell, for the cell-level preview grid. */
export function cellProblems(row: CheckedRow): Partial<Record<ImportField, string>> {
  const out: Partial<Record<ImportField, string>> = {};
  for (const p of row.problems) out[p.field] = p.code;
  return out;
}
export type SaveRule = 'valid' | 'all';
/** Whether the import may start: "valid rows only" always can (when something is valid); "all or nothing" needs zero invalid rows. */
export const canStartImport = (plan: { create: unknown[]; update: unknown[]; invalid: unknown[] }, rule: SaveRule) =>
  plan.create.length + plan.update.length > 0 && (rule === 'valid' || plan.invalid.length === 0);

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export type ImportFileProblem = 'type' | 'size' | 'empty' | 'noRows' | 'oneColumn' | 'tooMany' | 'binary';
/** Checks a CSV the merchant picked from their device, before mapping. */
export function checkImportFile(name: string, size: number, text: string | null): { problem: ImportFileProblem | null; headers: string[]; rows: string[][] } {
  const none = { headers: [], rows: [] };
  if (!/\.(csv|txt)$/i.test(name)) return { problem: 'type', ...none };
  if (size > MAX_IMPORT_BYTES) return { problem: 'size', ...none };
  if (text === null || !text.trim()) return { problem: 'empty', ...none };
  if (/\u0000/.test(text.slice(0, 2000))) return { problem: 'binary', ...none };
  const all = parseCsvSafe(text);
  const [headers = [], ...rows] = all;
  if (headers.length < 2) return { problem: 'oneColumn', headers, rows };
  if (!rows.length) return { problem: 'noRows', headers, rows };
  if (rows.length > MAX_IMPORT_ROWS) return { problem: 'tooMany', headers, rows };
  return { problem: null, headers: headers.map((h) => h.replace(/^﻿/, '').trim()), rows };
}
/** CSV parsing that also accepts semicolon-separated files (common when Excel uses a comma decimal). */
export function parseCsvSafe(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const first = clean.split(/\r?\n/, 1)[0] ?? '';
  const semi = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length;
  const src = semi ? clean.replace(/"[^"]*"|;/g, (m) => (m === ';' ? ',' : m)) : clean;
  return parseCsvRows(src);
}

/** Apply one batch including the extra columns. Creates use the Arabic name when given, cost and category; updates also take cost and category when mapped. */
export function applyImportBatchX(products: Product[], levels: Level[], batch: { kind: 'create' | 'update'; row: CheckedRowX }[], defaultLoc: LocId = LOC_IDS[0]): { products: Product[]; levels: Level[]; created: number; updated: number } {
  const r = applyImportBatch(products, levels, batch, defaultLoc);
  const by = new Map(batch.map((w) => [w.row.sku.toUpperCase(), w]));
  const out = r.products.map((p) => {
    const w = by.get(p.sku.toUpperCase());
    if (!w) return p;
    const x = w.row;
    if (w.kind === 'create') return { ...p, name: { ar: x.nameAr || x.name, en: x.name }, cost: x.cost, ...(x.category ? { category: { ...x.category } } : {}) };
    return { ...p, ...(x.cost !== null ? { cost: x.cost } : {}), ...(x.category ? { category: { ...x.category } } : {}), ...(x.compareAt !== null ? { compareAt: x.compareAt } : {}) };
  });
  return { ...r, products: out };
}

/* ---------- Export with chosen columns ---------- */

export type ExportCol = 'name' | 'nameAr' | 'sku' | 'variant' | 'status' | 'price' | 'compareAt' | 'cost' | 'margin' | 'available' | 'category' | 'channels' | 'tags';
export const EXPORT_COLS: ExportCol[] = ['name', 'nameAr', 'sku', 'variant', 'status', 'price', 'compareAt', 'cost', 'margin', 'available', 'category', 'channels', 'tags'];
export const DEFAULT_EXPORT: ExportCol[] = ['name', 'nameAr', 'sku', 'status', 'price', 'compareAt', 'cost', 'available', 'category'];
/** Header names match the import template, so an exported file can be edited and imported back. */
export const EXPORT_HEADER: Record<ExportCol, string> = {
  name: 'name', nameAr: 'name_ar', sku: 'sku', variant: 'variant', status: 'status', price: 'price', compareAt: 'compare_at_price', cost: 'cost',
  margin: 'margin_pct', available: 'quantity', category: 'category', channels: 'channels', tags: 'tags',
};
const money = (h: number | null) => (h === null ? '' : (h / 100).toFixed(2));
/** One row per product, or one per variant (each with its own SKU, price and stock). */
export function exportRows(products: Product[], levels: Level[], cols: ExportCol[], perVariant: boolean): (string | number)[][] {
  const out: (string | number)[][] = [cols.map((c) => EXPORT_HEADER[c])];
  for (const p of products) {
    const units = perVariant && p.variants.length ? p.variants.map((v) => ({ sku: v.sku, price: v.price, variant: [v.color, v.size].filter(Boolean).join(' / '), skus: [v.sku] })) : [{ sku: p.sku, price: p.price, variant: '', skus: skusOf(p) }];
    for (const u of units) {
      const avail = p.type === 'digital' ? '' : levels.filter((l) => u.skus.includes(l.sku)).reduce((s, l) => s + available(l), 0);
      const m = margin(u.price, p.cost);
      const val: Record<ExportCol, string | number> = {
        name: p.name.en, nameAr: p.name.ar, sku: u.sku, variant: u.variant, status: p.status, price: money(u.price), compareAt: money(p.compareAt), cost: money(p.cost),
        margin: m ? m.pct : '', available: avail, category: p.category.en, channels: CHANNELS.filter((c) => p.channels[c]).join('|'), tags: (p.tags ?? []).join('|'),
      };
      out.push(cols.map((c) => val[c]));
    }
  }
  return out;
}

/* ---------- Pricing summary ---------- */

/** Catalogue pricing health: products without a cost and the average margin of those with one. */
export function pricingSummary(products: Product[]): { withCost: number; noCost: number; avgMarginPct: number | null } {
  const live = products.filter((p) => p.status !== 'archived');
  const ms = live.map((p) => margin(p.price, p.cost)).filter((m): m is { amount: number; pct: number } => !!m);
  return { withCost: ms.length, noCost: live.length - ms.length, avgMarginPct: ms.length ? Math.round((ms.reduce((s, m) => s + m.pct, 0) / ms.length) * 10) / 10 : null };
}
