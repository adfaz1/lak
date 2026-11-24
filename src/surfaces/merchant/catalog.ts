// Catalogue domain: products, variants, editor validation, bulk edit and CSV import.
// Money is integer halalas. All products are test fixtures.
import type { Channel, L } from './domain';

export type ProductStatus = 'active' | 'draft' | 'archived';
export type ProductType = 'physical' | 'digital';
export interface Media { id: string; label: L; alt: string }
export interface Variant { color: string; size: string; sku: string; price: number }
export interface Product {
  id: string;
  name: L;
  desc: L;
  status: ProductStatus;
  type: ProductType;
  price: number;
  compareAt: number | null;
  cost: number | null;
  sku: string;
  barcode: string;
  /** Grams. Not required for digital products. */
  weight: number | null;
  media: Media[];
  colors: string[];
  sizes: string[];
  variants: Variant[];
  seo: { title: string; desc: string; slug: string };
  channels: Record<Channel, boolean>;
  category: L;
  version: number;
}

const CH_ALL: Record<Channel, boolean> = { online: true, market: true, app: true };
const cat = (ar: string, en: string): L => ({ ar, en });
const m = (id: string, ar: string, en: string, alt = ''): Media => ({ id, label: { ar, en }, alt });

function prod(id: string, ar: string, en: string, sku: string, price: number, extra: Partial<Product> = {}): Product {
  return {
    id, name: { ar, en }, desc: { ar: '', en: '' }, status: 'active', type: 'physical', price, compareAt: null, cost: null, sku, barcode: '',
    weight: 500, media: [], colors: [], sizes: [], variants: [], seo: { title: en, desc: '', slug: en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') },
    channels: { ...CH_ALL }, category: cat('أزياء', 'Fashion'), version: 1, ...extra,
  };
}

const matrix = (base: string, price: number, colors: string[], sizes: string[]): Variant[] =>
  colors.flatMap((c) => sizes.map((s) => ({ color: c, size: s, sku: variantSku(base, c, s), price })));

export function productFixtures(): Product[] {
  return [
    prod('p1', 'عباية كتّان صيفية', 'Summer linen abaya', 'ABY-LIN', 29000, {
      compareAt: 34000, cost: 15500, colors: ['Black', 'Navy'], sizes: ['S', 'M', 'L'], variants: matrix('ABY-LIN', 29000, ['Black', 'Navy'], ['S', 'M', 'L']),
      desc: { ar: 'عباية خفيفة من الكتان بقصة واسعة.', en: 'A light linen abaya with a relaxed cut.' },
      media: [m('m1', 'صورة أمامية', 'Front photo', 'Black linen abaya, front view'), m('m2', 'صورة جانبية', 'Side photo', '')], weight: 650,
    }),
    prod('p2', 'شال حرير', 'Silk shawl', 'SHL-SLK-01', 9800, { cost: 4200, media: [m('m3', 'صورة الشال', 'Shawl photo', 'Silk shawl folded')], weight: 150 }),
    prod('p3', 'عطر عود 100 مل', 'Oud perfume 100 ml', 'OUD-100', 12900, { cost: 6100, category: cat('عطور', 'Fragrance'), weight: 400, media: [m('m4', 'زجاجة العطر', 'Bottle', 'Oud perfume bottle')] }),
    prod('p4', 'حقيبة يد جلد', 'Leather handbag', 'BAG-LTH-01', 42000, { compareAt: 48000, category: cat('حقائب', 'Bags'), weight: 900 }),
    prod('p5', 'محفظة جلد', 'Leather wallet', 'WLT-LTH-01', 16100, { cost: 7000, category: cat('حقائب', 'Bags'), weight: 200 }),
    prod('p6', 'طقم قهوة عربية', 'Arabic coffee set', 'COF-SET-01', 24000, { cost: 13000, category: cat('منزل', 'Home'), weight: 1800 }),
    prod('p7', 'ثوب قطني', 'Cotton thobe', 'THB-COT', 18500, { colors: ['White', 'Beige'], sizes: ['54', '56', '58'], variants: matrix('THB-COT', 18500, ['White', 'Beige'], ['54', '56', '58']), weight: 500 }),
    prod('p8', 'سجادة صلاة', 'Prayer mat', 'MAT-PRY-01', 8900, { category: cat('منزل', 'Home'), weight: 700 }),
    prod('p9', 'مبخرة نحاسية', 'Brass incense burner', 'INC-BRS-01', 13500, { category: cat('منزل', 'Home'), weight: 1100, channels: { online: true, market: false, app: true } }),
    prod('p10', 'بطاقة هدية إلكترونية 100', 'E-gift card 100', 'GFT-100', 10000, { type: 'digital', weight: null, category: cat('هدايا', 'Gifts') }),
    prod('p11', 'علبة تمور فاخرة', 'Premium dates box', 'DAT-BOX-01', 7500, { status: 'draft', category: cat('أغذية', 'Food'), weight: 1000, channels: { online: false, market: false, app: false } }),
    prod('p12', 'وشاح صوف شتوي', 'Winter wool scarf', 'SCF-WOL-01', 11000, { status: 'archived', weight: 250 }),
  ];
}

/** Every stock-keeping unit of a product: its variants, or the product itself. */
export const skusOf = (p: Product): string[] => (p.variants.length ? p.variants.map((v) => v.sku) : [p.sku]);

export function variantSku(base: string, color: string, size: string): string {
  const part = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 3) || 'X';
  return `${base}-${part(color)}-${part(size)}`;
}

/* ---------- Parsing ---------- */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Normalise Arabic-Indic digits and the Arabic decimal separator so merchants can type either. */
export function normaliseDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, '.').replace(/[,،\s]/g, '');
}

/** Parse a money input like "290" or "290.50" into halalas. Returns null when not a valid non-negative amount. */
export function parseMoney(input: string): number | null {
  const s = normaliseDigits(input);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

export function parseIntStrict(input: string): number | null {
  const s = normaliseDigits(input);
  return /^-?\d+$/.test(s) ? Number(s) : null;
}

export const moneyInput = (h: number | null) => (h === null ? '' : (h / 100).toFixed(2));

/* ---------- Editor draft and validation (QA07) ---------- */

export interface VariantDraft { color: string; size: string; sku: string; price: string; stock: string; isNew: boolean }
export interface ProductDraft {
  nameAr: string; nameEn: string; descAr: string; descEn: string;
  type: ProductType; status: ProductStatus;
  price: string; compareAt: string; cost: string;
  sku: string; barcode: string; weight: string; stock: string;
  media: Media[]; colors: string[]; sizes: string[]; variants: VariantDraft[];
  seoTitle: string; seoDesc: string; slug: string;
  channels: Record<Channel, boolean>;
}

export function emptyDraft(): ProductDraft {
  return {
    nameAr: '', nameEn: '', descAr: '', descEn: '', type: 'physical', status: 'draft', price: '', compareAt: '', cost: '',
    sku: '', barcode: '', weight: '', stock: '0', media: [], colors: [], sizes: [], variants: [], seoTitle: '', seoDesc: '', slug: '',
    channels: { online: true, market: false, app: false },
  };
}

export function toDraft(p: Product): ProductDraft {
  return {
    nameAr: p.name.ar, nameEn: p.name.en, descAr: p.desc.ar, descEn: p.desc.en, type: p.type, status: p.status,
    price: moneyInput(p.price), compareAt: moneyInput(p.compareAt), cost: moneyInput(p.cost), sku: p.sku, barcode: p.barcode,
    weight: p.weight === null ? '' : String(p.weight), stock: '', media: p.media.map((x) => ({ ...x })), colors: [...p.colors], sizes: [...p.sizes],
    variants: p.variants.map((v) => ({ color: v.color, size: v.size, sku: v.sku, price: moneyInput(v.price), stock: '', isNew: false })),
    seoTitle: p.seo.title, seoDesc: p.seo.desc, slug: p.seo.slug, channels: { ...p.channels },
  };
}

/** Values repeated (ignoring case and spaces) in an option list. */
export function duplicateValues(list: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of list) { const k = v.trim().toLowerCase(); if (seen.has(k)) dup.add(v.trim()); seen.add(k); }
  return [...dup];
}

/** Rebuild the colour × size matrix, keeping values already typed for combinations that still exist. */
export function rebuildVariants(d: ProductDraft): VariantDraft[] {
  const colors = d.colors.map((c) => c.trim()).filter(Boolean);
  const sizes = d.sizes.map((s) => s.trim()).filter(Boolean);
  if (!colors.length && !sizes.length) return [];
  const cs = colors.length ? colors : [''];
  const ss = sizes.length ? sizes : [''];
  const keyOf = (c: string, s: string) => `${c.toLowerCase()}|${s.toLowerCase()}`;
  const old = new Map(d.variants.map((v) => [keyOf(v.color, v.size), v]));
  const out: VariantDraft[] = [];
  const done = new Set<string>();
  for (const c of cs) for (const s of ss) {
    const k = keyOf(c, s);
    if (done.has(k)) continue;
    done.add(k);
    out.push(old.get(k) ?? { color: c, size: s, sku: variantSku(d.sku || 'SKU', c, s), price: d.price, stock: '0', isNew: true });
  }
  return out;
}

export type DraftError = 'required' | 'money' | 'compareAt' | 'skuTaken' | 'skuFormat' | 'weight' | 'slug' | 'alt' | 'duplicate' | 'stock' | 'skuRepeated';

export function validateDraft(d: ProductDraft, takenSkus: Set<string>): Record<string, DraftError> {
  const e: Record<string, DraftError> = {};
  if (!d.nameAr.trim()) e.nameAr = 'required';
  if (!d.nameEn.trim()) e.nameEn = 'required';
  const price = parseMoney(d.price);
  if (price === null || price === 0) e.price = 'money';
  if (d.compareAt.trim()) {
    const c = parseMoney(d.compareAt);
    if (c === null) e.compareAt = 'money';
    else if (price !== null && c <= price) e.compareAt = 'compareAt';
  }
  if (d.cost.trim() && parseMoney(d.cost) === null) e.cost = 'money';
  const skuOk = (s: string) => /^[A-Za-z0-9-]{3,32}$/.test(s);
  if (!d.sku.trim()) e.sku = 'required';
  else if (!skuOk(d.sku)) e.sku = 'skuFormat';
  else if (takenSkus.has(d.sku.toUpperCase())) e.sku = 'skuTaken';
  if (d.type === 'physical') {
    const w = parseIntStrict(d.weight);
    if (w === null || w <= 0 || w > 30000) e.weight = 'weight';
  }
  if (!d.variants.length) {
    const st = parseIntStrict(d.stock || '0');
    if (st === null || st < 0) e.stock = 'stock';
  }
  if (d.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug)) e.slug = 'slug';
  d.media.forEach((md, i) => { if (!md.alt.trim()) e[`media.${i}`] = 'alt'; });
  if (duplicateValues(d.colors).length) e.colors = 'duplicate';
  if (duplicateValues(d.sizes).length) e.sizes = 'duplicate';
  const seen = new Set<string>();
  d.variants.forEach((v, i) => {
    const k = v.sku.toUpperCase();
    if (!skuOk(v.sku)) e[`v.${i}.sku`] = 'skuFormat';
    else if (seen.has(k)) e[`v.${i}.sku`] = 'skuRepeated';
    else if (takenSkus.has(k)) e[`v.${i}.sku`] = 'skuTaken';
    seen.add(k);
    const vp = parseMoney(v.price);
    if (vp === null || vp === 0) e[`v.${i}.price`] = 'money';
    if (v.isNew) { const s = parseIntStrict(v.stock || '0'); if (s === null || s < 0) e[`v.${i}.stock`] = 'stock'; }
  });
  return e;
}

/** SKUs used by other products (so a product can keep its own). */
export function takenSkus(products: Product[], exceptId?: string): Set<string> {
  return new Set(products.filter((p) => p.id !== exceptId).flatMap((p) => [p.sku, ...p.variants.map((v) => v.sku)]).map((s) => s.toUpperCase()));
}

export function fromDraft(d: ProductDraft, id: string, version: number, media: Media[] = d.media): Product {
  return {
    id, name: { ar: d.nameAr.trim(), en: d.nameEn.trim() }, desc: { ar: d.descAr, en: d.descEn }, status: d.status, type: d.type,
    price: parseMoney(d.price) ?? 0, compareAt: d.compareAt.trim() ? parseMoney(d.compareAt) : null, cost: d.cost.trim() ? parseMoney(d.cost) : null,
    sku: d.sku.trim(), barcode: d.barcode.trim(), weight: d.type === 'physical' ? parseIntStrict(d.weight) : null, media,
    colors: d.colors.map((c) => c.trim()).filter(Boolean), sizes: d.sizes.map((s) => s.trim()).filter(Boolean),
    variants: d.variants.map((v) => ({ color: v.color, size: v.size, sku: v.sku.trim(), price: parseMoney(v.price) ?? 0 })),
    seo: { title: d.seoTitle, desc: d.seoDesc, slug: d.slug }, channels: { ...d.channels }, category: { ar: 'عام', en: 'General' }, version,
  };
}

/** Gross margin per unit, only when a cost exists. Never shown as profit. */
export function margin(price: number | null, cost: number | null): { amount: number; pct: number } | null {
  if (price === null || cost === null || price <= 0) return null;
  return { amount: price - cost, pct: Math.round(((price - cost) * 1000) / price) / 10 };
}

/* ---------- Bulk edit ---------- */

export interface BulkRow { id: string; price: string; compareAt: string; status: ProductStatus }
export type BulkCellError = 'money' | 'compareAt';
export function validateBulkRow(r: BulkRow): Partial<Record<'price' | 'compareAt', BulkCellError>> {
  const e: Partial<Record<'price' | 'compareAt', BulkCellError>> = {};
  const p = parseMoney(r.price);
  if (p === null || p === 0) e.price = 'money';
  if (r.compareAt.trim()) {
    const c = parseMoney(r.compareAt);
    if (c === null) e.compareAt = 'money';
    else if (p !== null && c <= p) e.compareAt = 'compareAt';
  }
  return e;
}

/** Apply bulk edits only when every row is valid; returns null otherwise so nothing is half-saved. */
export function applyBulkEdit(products: Product[], rows: BulkRow[]): Product[] | null {
  if (rows.some((r) => Object.keys(validateBulkRow(r)).length)) return null;
  const by = new Map(rows.map((r) => [r.id, r]));
  return products.map((p) => {
    const r = by.get(p.id);
    if (!r) return p;
    const price = parseMoney(r.price)!;
    return {
      ...p, price, status: r.status, compareAt: r.compareAt.trim() ? parseMoney(r.compareAt) : null, version: p.version + 1,
      variants: p.variants.map((v) => (v.price === p.price ? { ...v, price } : v)),
    };
  });
}

/* ---------- CSV ---------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toCsv(rows: (string | number)[][]): string {
  const q = (v: string | number) => { const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}

/* ---------- Import (QA08) ---------- */

export type ImportField = 'name' | 'sku' | 'price' | 'compareAt' | 'qty' | 'status' | 'ignore';
export const IMPORT_FIELDS: ImportField[] = ['name', 'sku', 'price', 'compareAt', 'qty', 'status', 'ignore'];
export const REQUIRED_FIELDS: ImportField[] = ['name', 'sku', 'price'];
export const TEMPLATE_HEADERS = ['name', 'sku', 'price', 'compare_at_price', 'quantity', 'status'];

export function suggestMapping(headers: string[]): ImportField[] {
  return headers.map((h) => {
    const k = h.toLowerCase();
    if (k.includes('compare')) return 'compareAt';
    if (k.includes('sku')) return 'sku';
    if (k.includes('price') || k.includes('سعر')) return 'price';
    if (k.includes('qty') || k.includes('quantity') || k.includes('كمية')) return 'qty';
    if (k.includes('status') || k.includes('حالة')) return 'status';
    if (k.includes('name') || k.includes('title') || k.includes('اسم')) return 'name';
    return 'ignore';
  });
}

export function validateMapping(mapping: ImportField[]): { missing: ImportField[]; repeated: ImportField[] } {
  const used: ImportField[] = mapping.filter((f) => f !== 'ignore');
  return {
    missing: REQUIRED_FIELDS.filter((f) => !used.includes(f)),
    repeated: [...new Set(used.filter((f, i) => used.indexOf(f) !== i))],
  };
}

export type RowProblem = 'nameMissing' | 'skuMissing' | 'price' | 'compareAt' | 'qty' | 'status';
export interface CheckedRow {
  line: number;
  name: string; sku: string; price: number | null; compareAt: number | null; qty: number; status: ProductStatus;
  problems: { field: ImportField; code: RowProblem; value: string }[];
  /** Line number of the first row in the file with the same SKU. */
  dupOf: number | null;
  exists: boolean;
}

/** Validate data rows (header excluded) against a mapping. Lines are numbered as in the file (header = line 1). */
export function validateImport(rows: string[][], mapping: ImportField[], existing: Set<string>): CheckedRow[] {
  const col = (f: ImportField) => mapping.indexOf(f);
  const get = (r: string[], f: ImportField) => (col(f) >= 0 ? (r[col(f)] ?? '').trim() : '');
  const first = new Map<string, number>();
  return rows.map((r, i) => {
    const line = i + 2;
    const problems: CheckedRow['problems'] = [];
    const name = get(r, 'name');
    const sku = get(r, 'sku');
    if (!name) problems.push({ field: 'name', code: 'nameMissing', value: '' });
    if (!sku) problems.push({ field: 'sku', code: 'skuMissing', value: '' });
    const rawPrice = get(r, 'price');
    const price = parseMoney(rawPrice);
    if (price === null || price === 0) problems.push({ field: 'price', code: 'price', value: rawPrice });
    const rawCmp = get(r, 'compareAt');
    const compareAt = rawCmp ? parseMoney(rawCmp) : null;
    if (rawCmp && (compareAt === null || (price !== null && compareAt <= price))) problems.push({ field: 'compareAt', code: 'compareAt', value: rawCmp });
    const rawQty = get(r, 'qty');
    const qty = rawQty ? parseIntStrict(rawQty) : 0;
    if (qty === null || qty < 0) problems.push({ field: 'qty', code: 'qty', value: rawQty });
    const rawStatus = get(r, 'status').toLowerCase();
    const status: ProductStatus | null = !rawStatus ? 'draft' : rawStatus === 'active' || rawStatus === 'draft' || rawStatus === 'archived' ? rawStatus : null;
    if (!status) problems.push({ field: 'status', code: 'status', value: rawStatus });
    const key = sku.toUpperCase();
    let dupOf: number | null = null;
    if (sku) { if (first.has(key)) dupOf = first.get(key)!; else first.set(key, line); }
    return { line, name, sku, price, compareAt, qty: qty ?? 0, status: status ?? 'draft', problems, dupOf, exists: !!sku && existing.has(key) };
  });
}

export type ConflictPolicy = 'skip' | 'update';
export function planImport(rows: CheckedRow[], policy: ConflictPolicy) {
  const invalid = rows.filter((r) => r.problems.length);
  const ok = rows.filter((r) => !r.problems.length);
  const duplicates = ok.filter((r) => r.dupOf !== null);
  const unique = ok.filter((r) => r.dupOf === null);
  const conflicts = unique.filter((r) => r.exists);
  return {
    create: unique.filter((r) => !r.exists),
    update: policy === 'update' ? conflicts : [],
    skipExisting: policy === 'skip' ? conflicts : [],
    duplicates,
    invalid,
    conflicts,
  };
}
export type ImportPlan = ReturnType<typeof planImport>;

/** Rows for the downloadable error report: every invalid row (one line per problem) and every skipped row. */
export function errorReportRows(plan: ImportPlan, label: (code: RowProblem | 'duplicate' | 'exists') => string, header: string[]): (string | number)[][] {
  const out: (string | number)[][] = [header];
  for (const r of plan.invalid) for (const p of r.problems) out.push([r.line, r.sku, p.field, p.value, label(p.code)]);
  for (const r of plan.duplicates) out.push([r.line, r.sku, 'sku', r.sku, `${label('duplicate')} ${r.dupOf}`]);
  for (const r of plan.skipExisting) out.push([r.line, r.sku, 'sku', r.sku, label('exists')]);
  return out;
}

/** The two sample files the wizard can "upload". Generated deterministically; no real file is read. */
export function sampleFile(kind: 'large' | 'small', existingSkus: string[]): string {
  if (kind === 'small') {
    return toCsv([
      ['name', 'sku', 'price', 'qty'],
      ['Linen shirt', 'SHR-LIN-01', '149', '12'],
      ['Cotton socks (3 pairs)', 'SCK-COT-03', '39.90', '40'],
      ['Leather belt', 'BLT-LTH-01', '120', '8'],
      ['Canvas tote', 'TOT-CNV-01', '85', '15'],
      ['Silk shawl', 'SHL-SLK-01', '98', '5'],
    ]);
  }
  const head = ['Product name', 'SKU code', 'Price (SAR)', 'Compare at', 'Quantity', 'Status'];
  const names = ['Linen shirt', 'Cotton thobe', 'Prayer beads', 'Oud oil 12 ml', 'Ceramic mug', 'Gift box', 'Wool scarf', 'Canvas tote'];
  const rows: (string | number)[][] = [head];
  for (let i = 1; i <= 1000; i++) {
    let name = `${names[i % names.length]} ${String(i).padStart(4, '0')}`;
    let sku = `IMP-${String(i).padStart(4, '0')}`;
    let price = String(50 + (i % 40) * 5);
    let qty = String(i % 25);
    const compare = i % 9 === 0 ? String(60 + (i % 40) * 5) : '';
    const status = i % 4 === 0 ? 'draft' : 'active';
    if (i % 97 === 0) price = 'abc';
    if (i % 113 === 5) name = '';
    if (i % 151 === 7) qty = '-3';
    if (i % 50 === 49) sku = `IMP-${String(i - 10).padStart(4, '0')}`;
    if (i % 67 === 3 && existingSkus.length) sku = existingSkus[Math.floor(i / 67) % existingSkus.length];
    rows.push([name, sku, price, compare, qty, status]);
  }
  return toCsv(rows);
}
