// Products section: screen rules only (no React). Reuses the catalogue domain in merchant/catalog.ts as the
// single source of truth (validation, drafts, variants, money parsing, bulk edit, CSV import) and adds what the
// new screens need: list filtering, per-warehouse initial stock, media ordering, previews and import batches.
import { LOC_IDS, type Channel, type L, type LocId } from '../../merchant/domain';
import {
  emptyDraft, fromDraft, margin, parseIntStrict, parseMoney, rebuildVariants, skusOf, toDraft, validateBulkRow, validateDraft,
  type BulkRow, type CheckedRow, type DraftError, type Media, type Product, type ProductDraft, type ProductStatus, type VariantDraft,
} from '../../merchant/catalog';
import { available, lowStock, type Level } from '../../merchant/inventory';
import { productPhoto } from '../model/media';

export const STATUSES: ProductStatus[] = ['active', 'draft', 'archived'];
export const CHANNELS: Channel[] = ['online', 'market', 'app'];
export const PAGE_SIZE = 20;

/* ---------- List ---------- */

export type StatusTab = 'all' | ProductStatus;
export interface ListFilter { q: string; tab: StatusTab; category: string; channel: string }

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

export function filterProducts(products: Product[], f: ListFilter): Product[] {
  const n = f.q.trim().toLowerCase();
  return products.filter((p) => (f.tab === 'all' || p.status === f.tab)
    && (!f.category || categoryKey(p.category) === f.category)
    && (!f.channel || p.channels[f.channel as Channel])
    && (!n || p.name.ar.includes(f.q.trim()) || p.name.en.toLowerCase().includes(n) || skusOf(p).some((s) => s.toLowerCase().includes(n)) || p.sku.toLowerCase().includes(n)));
}

/** Counts per status tab for the products that match everything except the tab. */
export function tabCounts(products: Product[], f: ListFilter): Record<StatusTab, number> {
  const base = filterProducts(products, { ...f, tab: 'all' });
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
export interface EditDraft extends Omit<ProductDraft, 'variants'> { variants: EditVariant[]; category: L; stockBy: StockBy }

export const CATEGORIES: L[] = [
  { ar: 'أزياء', en: 'Fashion' }, { ar: 'عطور', en: 'Fragrance' }, { ar: 'حقائب', en: 'Bags' }, { ar: 'منزل', en: 'Home' },
  { ar: 'هدايا', en: 'Gifts' }, { ar: 'أغذية', en: 'Food' }, { ar: 'عام', en: 'General' },
];
const zeroStock = (): StockBy => ({ ryd: '0', jed: '0' });

/** Fixture media ids that show the product's licensed photo; other media show the neutral placeholder. */
const FIXTURE_MEDIA: Record<string, string> = { m1: 'p1', m3: 'p2', m4: 'p3' };
export const photoMediaId = (productId: string) => `photo-${productId}`;
export function mediaSrc(m: Media, size: 'thumb' | 'large' = 'thumb'): string | undefined {
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
  if (!p) return { ...emptyDraft(), variants: [], category: CATEGORIES[0], stockBy: zeroStock() };
  const d = toDraft(p);
  return { ...d, media: mediaOf(p), variants: d.variants.map((v) => ({ ...v, stockBy: zeroStock() })), category: p.category, stockBy: zeroStock() };
}

/** Rebuild the colour × size matrix (catalogue rule), keeping typed values and giving new rows per-warehouse stock. */
export function rebuildEditVariants(d: EditDraft): EditVariant[] {
  return rebuildVariants(d as ProductDraft).map((v) => ('stockBy' in v ? (v as EditVariant) : { ...v, stockBy: zeroStock() }));
}

const okStock = (s: string) => { const n = parseIntStrict(s.trim() || '0'); return n !== null && n >= 0; };

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
  return { ...fromDraft(d as ProductDraft, id, version, d.media), category: d.category };
}

/** Inventory levels for SKUs that do not exist yet, with the initial quantities typed per warehouse. */
export function levelsForNew(d: EditDraft, known: Set<string>): Level[] {
  if (d.type !== 'physical') return [];
  const fresh: { sku: string; by: StockBy }[] = d.variants.length
    ? d.variants.filter((v) => !known.has(v.sku.trim())).map((v) => ({ sku: v.sku.trim(), by: v.stockBy }))
    : known.has(d.sku.trim()) ? [] : [{ sku: d.sku.trim(), by: d.stockBy }];
  return fresh.flatMap((f) => LOC_IDS.map((loc) => ({ sku: f.sku, loc, onHand: parseIntStrict(f.by[loc].trim() || '0') ?? 0, reserved: 0, incoming: 0, version: 1, threshold: 3 })));
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
export function applyImportBatch(products: Product[], levels: Level[], batch: ImportWork[]): { products: Product[]; levels: Level[]; created: number; updated: number } {
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
  const newLevels: Level[] = batch.filter((w) => w.kind === 'create').flatMap((w) => LOC_IDS.map((loc) => ({ sku: w.row.sku, loc, onHand: loc === 'ryd' ? w.row.qty : 0, reserved: 0, incoming: 0, version: 1, threshold: 3 })));
  return { products: nextProducts, levels: [...levels, ...newLevels], created: created.length, updated: batch.length - created.length };
}
