// Catalogue domain: products, variants, editor validation, bulk edit and CSV import.
// Money is integer halalas. All products are test fixtures.
import type { Channel, L } from './domain';

export type ProductStatus = 'active' | 'draft' | 'archived';
export type ProductType = 'physical' | 'digital';
export interface Media {
  id: string; label: L; alt: string;
  /** A local preview (object URL) for an image the merchant picked from their device in this session. */
  src?: string;
  /** The colour this image shows, so the storefront can switch to it when that variant is picked. */
  variant?: string;
}
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
  /** Free-form labels used by filters, bulk actions and smart collections. */
  tags?: string[];
  /** VAT applies unless this is false (e.g. a zero-rated item). Absent on older products = taxable. */
  taxable?: boolean;
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
    prod('p1', 'عباية سوداء مطرّزة', 'Embroidered black abaya', 'ABY-LIN', 29000, {
      compareAt: 34000, cost: 15500, colors: ['Black', 'Navy'], sizes: ['S', 'M', 'L'], variants: matrix('ABY-LIN', 29000, ['Black', 'Navy'], ['S', 'M', 'L']),
      desc: { ar: 'عباية سوداء بتطريز يدوي على الصدر والأكمام.', en: 'Black abaya with hand embroidery on the front and sleeves.' },
      media: [m('m1', 'صورة أمامية', 'Front photo', 'Black embroidered abaya on a mannequin, front view')], weight: 650,
    }),
    prod('p2', 'شال حرير موغا', 'Muga silk stole', 'SHL-SLK-01', 9800, { desc: { ar: 'شال من حرير موغا بلونه الذهبي الطبيعي، خفيف ويناسب المناسبات.', en: 'Muga silk stole in its natural golden tone, light and suited to occasions.' }, cost: 4200, media: [m('m3', 'صورة الشال', 'Shawl photo', 'Gold Muga silk stole, folded')], weight: 150 }),
    prod('p3', 'زجاجة عطر كوبالت', 'Cobalt perfume bottle', 'OUD-100', 12900, { desc: { ar: 'زجاجة عطر زجاجية بلون الكوبالت، سعة 100 مل، مع غطاء معدني.', en: 'Cobalt glass perfume bottle, 100 ml, with a metal cap.' }, cost: 6100, category: cat('عطور', 'Fragrance'), weight: 400, media: [m('m4', 'زجاجة العطر', 'Bottle', 'Cobalt blue glass perfume bottle')] }),
    prod('p4', 'حقيبة جلد بنية', 'Tan leather handbag', 'BAG-LTH-01', 42000, { desc: { ar: 'حقيبة يد من جلد طبيعي بني فاتح، بحزام كتف قابل للفصل.', en: 'Tan genuine-leather handbag with a detachable shoulder strap.' }, compareAt: 48000, category: cat('حقائب', 'Bags'), weight: 900 }),
    prod('p5', 'محفظة جلد', 'Leather wallet', 'WLT-LTH-01', 16100, { desc: { ar: 'محفظة جلد طبيعي بثماني خانات للبطاقات وجيب للعملات.', en: 'Genuine-leather wallet with eight card slots and a coin pocket.' }, cost: 7000, category: cat('حقائب', 'Bags'), weight: 200 }),
    prod('p6', 'دلّة وفناجين قهوة', 'Dallah and coffee cups', 'COF-SET-01', 24000, { desc: { ar: 'دلّة نحاسية مع ستة فناجين خزفية، مناسبة للضيافة اليومية.', en: 'Brass dallah with six ceramic cups for everyday hospitality.' }, cost: 13000, category: cat('منزل', 'Home'), weight: 1800 }),
    prod('p7', 'ثوب قطني', 'Cotton thobe', 'THB-COT', 18500, { desc: { ar: 'ثوب رجالي من القطن الخالص بقصة كلاسيكية وياقة مستديرة.', en: 'Men\'s thobe in pure cotton with a classic cut and round collar.' }, colors: ['White', 'Beige'], sizes: ['54', '56', '58'], variants: matrix('THB-COT', 18500, ['White', 'Beige'], ['54', '56', '58']), weight: 500 }),
    prod('p8', 'سجادة صلاة', 'Prayer mat', 'MAT-PRY-01', 8900, { desc: { ar: 'سجادة صلاة مبطنة بنقشة هادئة، سهلة الطي والحمل.', en: 'Padded prayer mat with a calm pattern, easy to fold and carry.' }, category: cat('منزل', 'Home'), weight: 700 }),
    prod('p9', 'مبخرة نحاسية', 'Brass incense burner', 'INC-BRS-01', 13500, { category: cat('منزل', 'Home'), weight: 1100, channels: { online: true, market: false, app: true } }),
    prod('p10', 'بطاقة هدية إلكترونية 100', 'E-gift card 100', 'GFT-100', 10000, { type: 'digital', weight: null, category: cat('هدايا', 'Gifts') }),
    prod('p11', 'تمر مجدول فاخر', 'Premium Medjool dates', 'DAT-BOX-01', 7500, { status: 'draft', category: cat('أغذية', 'Food'), weight: 1000, channels: { online: false, market: false, app: false } }),
    prod('p12', 'وشاح صوف زيتي', 'Olive wool scarf', 'SCF-WOL-01', 11000, { status: 'archived', weight: 250 }),
    // Added 2026-11-24 so the demo store does not look thin. Existing ids and SKUs above are unchanged.
    prod('p13', 'عطر عود ملكي 50 مل', 'Royal oud perfume 50 ml', 'OUD-ROY-50', 34500, {
      compareAt: 39000, cost: 16000, category: cat('عطور', 'Fragrance'), weight: 350,
      desc: { ar: 'عطر بخلاصة دهن العود الكمبودي مع لمسة ورد طائفي، يدوم طويلًا على الملابس.', en: 'Perfume built on Cambodian oud oil with a touch of Taif rose; long-lasting on fabric.' },
    }),
    prod('p14', 'بخور معمول فاخر', 'Premium mamoul bakhoor', 'BKH-MAM-01', 6500, {
      cost: 2800, category: cat('عطور', 'Fragrance'), weight: 120,
      desc: { ar: 'معمول بخور معجون بالعود والمسك في علبة 40 غرامًا، يكفي لنحو أربعين جلسة.', en: 'Bakhoor paste blended with oud and musk, 40 g tin, enough for about forty sessions.' },
    }),
    prod('p15', 'قميص كتان رجالي', 'Men\'s linen shirt', 'SHR-LIN', 15900, {
      cost: 7200, colors: ['White', 'Sand'], sizes: ['M', 'L', 'XL'], variants: matrix('SHR-LIN', 15900, ['White', 'Sand'], ['M', 'L', 'XL']), weight: 300,
      desc: { ar: 'قميص من الكتان الخالص بأكمام طويلة وقصة مريحة، يناسب الصيف والسفر.', en: 'Pure linen shirt with long sleeves and a relaxed cut, made for summer and travel.' },
    }),
    prod('p16', 'طقم فناجين خزف', 'Porcelain coffee cup set', 'CUP-POR-06', 9500, {
      cost: 4100, category: cat('منزل', 'Home'), weight: 900,
      desc: { ar: 'ستة فناجين قهوة عربية من الخزف الأبيض بحافة ذهبية، آمنة في غسالة الصحون.', en: 'Six white porcelain Arabic coffee cups with a gold rim, dishwasher safe.' },
    }),
    prod('p17', 'حقيبة ظهر جلدية', 'Leather backpack', 'BAG-BPK', 52000, {
      compareAt: 58000, cost: 24000, colors: ['Black', 'Tan'], sizes: [], variants: matrix('BAG-BPK', 52000, ['Black', 'Tan'], ['']).map((v) => ({ ...v, sku: `BAG-BPK-${v.color.slice(0, 3).toUpperCase()}` })),
      category: cat('حقائب', 'Bags'), weight: 1200,
      desc: { ar: 'حقيبة ظهر من جلد طبيعي بجيب مبطّن لحاسوب حتى 15 بوصة.', en: 'Genuine-leather backpack with a padded sleeve for laptops up to 15 inches.' },
    }),
    prod('p18', 'علبة هدية تمر وقهوة', 'Dates and coffee gift box', 'GFT-BOX-01', 18900, {
      cost: 9000, category: cat('هدايا', 'Gifts'), weight: 1400,
      desc: { ar: 'علبة هدية فيها نصف كيلو تمر سكري وقهوة عربية مطحونة 250 غرامًا وبطاقة إهداء.', en: 'Gift box with half a kilo of Sukkari dates, 250 g ground Arabic coffee and a gift card.' },
    }),
  ];
}

/** Colour names are stored as the merchant typed them; common ones get an Arabic label for display. */
const COLOR_AR: Record<string, string> = {
  black: 'أسود', navy: 'كحلي', white: 'أبيض', beige: 'بيج', olive: 'زيتي', sand: 'رملي', grey: 'رمادي', gray: 'رمادي', brown: 'بني', tan: 'بني فاتح',
  red: 'أحمر', blue: 'أزرق', green: 'أخضر', gold: 'ذهبي', pink: 'وردي', cream: 'كريمي', burgundy: 'عنابي', camel: 'جملي',
  ivory: 'عاجي', rose: 'وردي هادئ',
};
export const colorText = (c: string, lang: 'ar' | 'en'): string => (lang === 'ar' ? COLOR_AR[c.trim().toLowerCase()] ?? c : c);
/** "Black / L" in both languages. */
export const variantText = (color: string, size: string): L => ({
  ar: [color && colorText(color, 'ar'), size].filter(Boolean).join(' / '),
  en: [color, size].filter(Boolean).join(' / '),
});

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

export type ImportField = 'name' | 'sku' | 'price' | 'compareAt' | 'qty' | 'status' | 'ignore' | 'nameAr' | 'cost' | 'category';
export const IMPORT_FIELDS: ImportField[] = ['name', 'nameAr', 'sku', 'price', 'compareAt', 'cost', 'qty', 'status', 'category', 'ignore'];
export const REQUIRED_FIELDS: ImportField[] = ['name', 'sku', 'price'];
export const TEMPLATE_HEADERS = ['name', 'sku', 'price', 'compare_at_price', 'quantity', 'status'];

export function suggestMapping(headers: string[]): ImportField[] {
  return headers.map((h) => {
    const k = h.toLowerCase();
    if (k.includes('compare')) return 'compareAt';
    if (k.includes('sku')) return 'sku';
    if (k.includes('cost') || k.includes('تكلفة')) return 'cost';
    if (k.includes('categor') || k.includes('فئة')) return 'category';
    if (/name[ _-]?ar|arabic|بالعربية/.test(k)) return 'nameAr';
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

export type RowProblem = 'nameMissing' | 'skuMissing' | 'price' | 'compareAt' | 'qty' | 'status' | 'cost' | 'category';
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

/* ---------- Categories (tree) and collections ---------- */
// A product belongs to one category through `product.category` (its name in both languages), so every existing
// screen and the storefront keep working. Renaming a category renames it on its products too.

export interface Category {
  id: string;
  name: L;
  /** Parent category id; null for a top-level category. One level of nesting. */
  parent: string | null;
  slug: string;
  desc: L;
  seo: { title: string; desc: string };
  /** Shown in the storefront menu and listing. Hidden categories keep their products. */
  visible: boolean;
  /** Position among its siblings (0 first). */
  order: number;
  version: number;
}

const catFx = (id: string, ar: string, en: string, order: number, parent: string | null = null): Category => ({
  id, name: { ar, en }, parent, slug: en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), desc: { ar: '', en: '' },
  seo: { title: '', desc: '' }, visible: true, order, version: 1,
});
export function categoryFixtures(): Category[] {
  return [
    catFx('c-fashion', 'أزياء', 'Fashion', 0), catFx('c-fragrance', 'عطور', 'Fragrance', 1), catFx('c-bags', 'حقائب', 'Bags', 2),
    catFx('c-home', 'منزل', 'Home', 3), catFx('c-gifts', 'هدايا', 'Gifts', 4), catFx('c-food', 'أغذية', 'Food', 5), catFx('c-general', 'عام', 'General', 6),
  ];
}

/** The key products and categories are matched on (the English name, case-insensitive). */
export const catKey = (c: L) => c.en.trim().toLowerCase();
export const inCategory = (p: Product, c: Category) => catKey(p.category) === catKey(c.name);

export type CategoryError = 'required' | 'taken' | 'slug' | 'parent';
/** Names must be unique in both languages (products are matched by name); one level of nesting. */
export function validateCategory(c: Pick<Category, 'id' | 'name' | 'parent' | 'slug'>, all: Category[]): Partial<Record<'nameAr' | 'nameEn' | 'slug' | 'parent', CategoryError>> {
  const e: Partial<Record<'nameAr' | 'nameEn' | 'slug' | 'parent', CategoryError>> = {};
  const others = all.filter((x) => x.id !== c.id);
  if (!c.name.ar.trim()) e.nameAr = 'required';
  else if (others.some((x) => x.name.ar.trim() === c.name.ar.trim())) e.nameAr = 'taken';
  if (!c.name.en.trim()) e.nameEn = 'required';
  else if (others.some((x) => catKey(x.name) === catKey(c.name))) e.nameEn = 'taken';
  if (c.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)) e.slug = 'slug';
  else if (c.slug && others.some((x) => x.slug === c.slug)) e.slug = 'taken';
  if (c.parent) {
    const parent = others.find((x) => x.id === c.parent);
    if (!parent || parent.parent !== null || all.some((x) => x.parent === c.id)) e.parent = 'parent';
  }
  return e;
}

/** Categories in display order: each top-level category followed by its children. */
export function categoryTree(all: Category[]): { cat: Category; depth: 0 | 1 }[] {
  const by = (a: Category, b: Category) => a.order - b.order || a.name.en.localeCompare(b.name.en);
  const out: { cat: Category; depth: 0 | 1 }[] = [];
  for (const top of all.filter((c) => !c.parent || !all.some((x) => x.id === c.parent)).sort(by)) {
    out.push({ cat: top, depth: 0 });
    for (const ch of all.filter((c) => c.parent === top.id).sort(by)) out.push({ cat: ch, depth: 1 });
  }
  return out;
}

/** Rename a category and carry the new name onto its products (one write, so the storefront never sees a mix). */
export function renameCategory(products: Product[], from: L, to: L): Product[] {
  if (catKey(from) === catKey(to) && from.ar === to.ar) return products;
  return products.map((p) => (catKey(p.category) === catKey(from) ? { ...p, category: { ...to }, version: p.version + 1 } : p));
}

/** Move products to a category. Products already in it are left untouched (no version bump). */
export function moveToCategory(products: Product[], ids: Set<string>, to: L): { products: Product[]; moved: number } {
  let moved = 0;
  const next = products.map((p) => {
    if (!ids.has(p.id) || (catKey(p.category) === catKey(to) && p.category.ar === to.ar)) return p;
    moved++;
    return { ...p, category: { ...to }, version: p.version + 1 };
  });
  return { products: next, moved };
}

export type RuleField = 'price' | 'category' | 'tag' | 'stock' | 'status' | 'compareAt';
export type RuleOp = 'lt' | 'gt' | 'is' | 'isNot' | 'inStock' | 'outOfStock' | 'onSale';
export interface Rule { field: RuleField; op: RuleOp; value: string }
export interface Collection {
  id: string;
  name: L;
  kind: 'manual' | 'smart';
  /** Manual collections: product ids in display order. */
  productIds: string[];
  /** Smart collections: every rule (all) or any rule must match. */
  match: 'all' | 'any';
  rules: Rule[];
  visible: boolean;
  version: number;
}

export function collectionFixtures(): Collection[] {
  return [
    { id: 'col-eid', name: { ar: 'هدايا العيد', en: 'Eid gifts' }, kind: 'manual', productIds: ['p6', 'p18', 'p2', 'p13'], match: 'all', rules: [], visible: true, version: 1 },
    { id: 'col-under-100', name: { ar: 'أقل من 100 ريال ومتوفر', en: 'Under SAR 100, in stock' }, kind: 'smart', productIds: [], match: 'all',
      rules: [{ field: 'price', op: 'lt', value: '100' }, { field: 'stock', op: 'inStock', value: '' }], visible: true, version: 1 },
  ];
}

export type RuleError = 'money' | 'value';
export function validateRule(r: Rule): RuleError | null {
  if (r.field === 'price' && (r.op === 'lt' || r.op === 'gt')) { const m = parseMoney(r.value); return m === null || m === 0 ? 'money' : null; }
  if ((r.field === 'category' || r.field === 'tag' || r.field === 'status') && !r.value.trim()) return 'value';
  return null;
}

/** Whether a product matches one rule. `stockOf` gives sellable units (null for digital: always in stock). */
export function ruleMatches(p: Product, r: Rule, stockOf: (p: Product) => number | null): boolean {
  const low = Math.min(...(p.variants.length ? p.variants.map((v) => v.price) : [p.price]));
  switch (r.field) {
    case 'price': { const v = parseMoney(r.value) ?? 0; return r.op === 'lt' ? low < v : r.op === 'gt' ? low > v : false; }
    case 'compareAt': return p.compareAt !== null && p.compareAt > low;
    case 'category': { const hit = catKey(p.category) === r.value.trim().toLowerCase(); return r.op === 'isNot' ? !hit : hit; }
    case 'tag': { const hit = (p.tags ?? []).some((t) => t.toLowerCase() === r.value.trim().toLowerCase()); return r.op === 'isNot' ? !hit : hit; }
    case 'status': return r.op === 'isNot' ? p.status !== r.value : p.status === r.value;
    case 'stock': { const s = stockOf(p); const has = s === null || s > 0; return r.op === 'outOfStock' ? !has : has; }
    default: return false;
  }
}

/** Products in a collection, in order. Smart collections with an invalid rule match nothing (never "everything"). */
export function collectionMembers(c: Pick<Collection, 'kind' | 'productIds' | 'match' | 'rules'>, products: Product[], stockOf: (p: Product) => number | null): Product[] {
  if (c.kind === 'manual') return c.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  if (!c.rules.length || c.rules.some((r) => validateRule(r))) return [];
  return products.filter((p) => (c.match === 'all' ? c.rules.every((r) => ruleMatches(p, r, stockOf)) : c.rules.some((r) => ruleMatches(p, r, stockOf))));
}

/**
 * Storefront menu order: the merchant's category order (parents before their children); hidden categories, and the
 * children of hidden parents, are left out of the menu. Categories the merchant has not listed keep their place at the end.
 */
export function arrangeStoreCategories<T extends { name: L }>(list: T[], cats: Category[]): T[] {
  const order = new Map(categoryTree(cats).map((t, i) => [catKey(t.cat.name), i]));
  const hidden = new Set(cats.filter((c) => !c.visible || (c.parent && cats.find((x) => x.id === c.parent)?.visible === false)).map((c) => catKey(c.name)));
  return list.filter((x) => !hidden.has(catKey(x.name))).map((x, i) => ({ x, i }))
    .sort((a, b) => (order.get(catKey(a.x.name)) ?? 1000 + a.i) - (order.get(catKey(b.x.name)) ?? 1000 + b.i)).map((o) => o.x);
}
