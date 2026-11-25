// Catalogue depth (Phase C, item 10): product types beyond physical/digital, custom fields for products and orders,
// pre-order campaigns, purchase restrictions, size charts, brands and the filters shoppers can use.
// Pure rules only: the dashboard (products/*), the online store (storefront/bridge.ts) and orders read them.
// Money is integer halalas; dates are Riyadh calendar dates as YYYY-MM-DD strings. Everything is simulated.
import type { Channel, L } from './domain';
import { catKey, normaliseDigits, parseIntStrict, skusOf, type Product, type ProductType } from './catalog';
import { available, type Level } from './inventory';

/* ───────────── Product types ───────────── */

export const PRODUCT_TYPES: ProductType[] = ['physical', 'food', 'digital', 'code', 'service', 'booking', 'bundle'];

/** What a type needs: shipping to an address, stock in warehouses, a weight typed by the merchant, returns. */
export interface TypeTraits { ships: boolean; warehouse: boolean; weight: boolean; returnable: boolean }
export const TRAITS: Record<ProductType, TypeTraits> = {
  physical: { ships: true, warehouse: true, weight: true, returnable: true },
  food: { ships: true, warehouse: true, weight: true, returnable: false },
  digital: { ships: false, warehouse: false, weight: false, returnable: false },
  code: { ships: false, warehouse: false, weight: false, returnable: false },
  service: { ships: false, warehouse: false, weight: false, returnable: false },
  booking: { ships: false, warehouse: false, weight: false, returnable: false },
  // A bundle ships its components: stock and weight come from them.
  bundle: { ships: true, warehouse: false, weight: false, returnable: true },
};
export const traits = (t: ProductType | undefined): TypeTraits => TRAITS[t ?? 'physical'] ?? TRAITS.physical;

export interface Slot { id: string; date: string; time: string; cap: number; booked: number }
export interface BundleItem { sku: string; qty: number }
export interface CodeEntry { code: string; /** Order reference the code was delivered with. */ ref?: string }
/** Type-specific data on a product. Only the keys of its type are kept on save. */
export interface ProductSpec {
  /** Digital download: the file the shopper gets a link to after payment (simulated upload). */
  file?: { name: string; size: number; limit: number | null; expiryDays: number | null };
  /** Digital code or card: the pool; unsold codes are the stock. */
  codes?: CodeEntry[];
  /** Service or booking length in minutes. */
  minutes?: number;
  /** Service: the shopper proposes a date at checkout. */
  appointment?: boolean;
  where?: 'store' | 'online' | 'customer';
  /** Booking: dated time slots with a capacity each. */
  slots?: Slot[];
  /** Bundle: component SKUs and quantity per bundle. */
  bundle?: BundleItem[];
  /** Food & drink. */
  prepMinutes?: number;
  perishable?: boolean;
  shelfDays?: number | null;
}

/** The editor's text version of a spec (everything as typed, Arabic digits accepted). */
export interface SpecDraft {
  fileName: string; fileSize: number; limit: string; expiryDays: string;
  codesText: string; sold: CodeEntry[];
  minutes: string; appointment: boolean; where: 'store' | 'online' | 'customer';
  slots: { id: string; date: string; time: string; cap: string; booked: number }[];
  bundle: { sku: string; qty: string }[];
  prepMinutes: string; perishable: boolean; shelfDays: string;
}

export function emptySpecDraft(): SpecDraft {
  return {
    fileName: '', fileSize: 0, limit: '3', expiryDays: '30', codesText: '', sold: [], minutes: '60', appointment: false, where: 'store',
    slots: [], bundle: [], prepMinutes: '60', perishable: true, shelfDays: '3',
  };
}
const num = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
export function toSpecDraft(s: ProductSpec | undefined): SpecDraft {
  const e = emptySpecDraft();
  if (!s) return e;
  return {
    ...e,
    fileName: s.file?.name ?? '', fileSize: s.file?.size ?? 0, limit: s.file ? num(s.file.limit) : e.limit, expiryDays: s.file ? num(s.file.expiryDays) : e.expiryDays,
    codesText: (s.codes ?? []).filter((c) => !c.ref).map((c) => c.code).join('\n'), sold: (s.codes ?? []).filter((c) => !!c.ref),
    minutes: s.minutes ? String(s.minutes) : e.minutes, appointment: !!s.appointment, where: s.where ?? 'store',
    slots: (s.slots ?? []).map((x) => ({ id: x.id, date: x.date, time: x.time, cap: String(x.cap), booked: x.booked })),
    bundle: (s.bundle ?? []).map((b) => ({ sku: b.sku, qty: String(b.qty) })),
    prepMinutes: s.prepMinutes !== undefined ? String(s.prepMinutes) : e.prepMinutes, perishable: s.perishable ?? true, shelfDays: s.prepMinutes !== undefined ? num(s.shelfDays) : e.shelfDays,
  };
}
const int = (s: string) => parseIntStrict(s.trim());

/** Unique codes typed one per line (spaces trimmed, case kept), the repeats, and the ones already sold. */
export function parseCodes(text: string, sold: CodeEntry[] = []): { codes: string[]; repeated: string[]; alreadySold: string[]; bad: string[] } {
  const seen = new Set<string>();
  const soldSet = new Set(sold.map((c) => c.code.toUpperCase()));
  const codes: string[] = [], repeated: string[] = [], alreadySold: string[] = [], bad: string[] = [];
  for (const raw of text.split(/[\n,،]+/)) {
    const c = normaliseDigits(raw.trim()).replace(/[^\S\n]/g, '');
    if (!c) continue;
    const k = c.toUpperCase();
    if (!/^[A-Za-z0-9-]{4,40}$/.test(c)) { bad.push(c); continue; }
    if (soldSet.has(k)) { alreadySold.push(c); continue; }
    if (seen.has(k)) { repeated.push(c); continue; }
    seen.add(k); codes.push(c);
  }
  return { codes, repeated, alreadySold, bad };
}

export function fromSpecDraft(type: ProductType, d: SpecDraft): ProductSpec | undefined {
  switch (type) {
    case 'digital': return { file: { name: d.fileName, size: d.fileSize, limit: int(d.limit) || null, expiryDays: int(d.expiryDays) || null } };
    case 'code': return { codes: [...d.sold, ...parseCodes(d.codesText, d.sold).codes.map((code) => ({ code }))] };
    case 'service': return { minutes: int(d.minutes) ?? 60, appointment: d.appointment, where: d.where };
    case 'booking': return { minutes: int(d.minutes) ?? 60, where: d.where, slots: d.slots.map((x) => ({ id: x.id, date: x.date, time: x.time, cap: int(x.cap) ?? 0, booked: x.booked })) };
    case 'bundle': return { bundle: d.bundle.map((b) => ({ sku: b.sku.trim(), qty: int(b.qty) ?? 1 })) };
    case 'food': return { prepMinutes: int(d.prepMinutes) ?? 0, perishable: d.perishable, shelfDays: int(d.shelfDays) || null };
    default: return undefined;
  }
}

export type SpecError = 'required' | 'number' | 'past' | 'repeated' | 'cap' | 'component' | 'self' | 'few' | 'codes' | 'time' | 'booked';
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/**
 * What a type requires before saving. Keys are `spec.<field>` (and `spec.slot.<i>.<field>`, `spec.bundle.<i>`) so the
 * editor's error summary can jump to them. `skus` = every SKU in the catalogue (for bundle components).
 */
export function validateSpec(type: ProductType, d: SpecDraft, ctx: { today: string; skus: Set<string>; ownSkus: string[] }): Record<string, SpecError> {
  const e: Record<string, SpecError> = {};
  const pos = (s: string, min = 1, max = 100000) => { const n = int(s); return n !== null && n >= min && n <= max; };
  if (type === 'digital') {
    if (!d.fileName) e['spec.file'] = 'required';
    if (d.limit.trim() && !pos(d.limit, 1, 100)) e['spec.limit'] = 'number';
    if (d.expiryDays.trim() && !pos(d.expiryDays, 1, 365)) e['spec.expiry'] = 'number';
  }
  if (type === 'code') {
    const p = parseCodes(d.codesText, d.sold);
    if (p.bad.length || p.repeated.length || p.alreadySold.length) e['spec.codes'] = 'codes';
    else if (!p.codes.length && !d.sold.length) e['spec.codes'] = 'required';
  }
  if (type === 'service' || type === 'booking') { if (!pos(d.minutes, 5, 24 * 60)) e['spec.minutes'] = 'number'; }
  if (type === 'booking') {
    if (!d.slots.some((x) => x.date >= ctx.today)) e['spec.slots'] = 'required';
    const seen = new Set<string>();
    d.slots.forEach((x, i) => {
      if (!isDate(x.date)) e[`spec.slot.${i}.date`] = 'required';
      else if (x.date < ctx.today && x.booked === 0) e[`spec.slot.${i}.date`] = 'past';
      if (!isTime(x.time)) e[`spec.slot.${i}.time`] = 'time';
      const k = `${x.date} ${x.time}`;
      if (isDate(x.date) && isTime(x.time)) { if (seen.has(k)) e[`spec.slot.${i}.time`] = 'repeated'; seen.add(k); }
      const cap = int(x.cap);
      if (cap === null || cap < 1 || cap > 500) e[`spec.slot.${i}.cap`] = 'cap';
      else if (cap < x.booked) e[`spec.slot.${i}.cap`] = 'booked';
    });
  }
  if (type === 'bundle') {
    const parts = d.bundle.filter((b) => b.sku.trim());
    if (parts.length < 2) e['spec.bundle'] = 'few';
    const seen = new Set<string>();
    d.bundle.forEach((b, i) => {
      const k = b.sku.trim().toUpperCase();
      if (!k) return;
      if (ctx.ownSkus.some((s) => s.toUpperCase() === k)) e[`spec.bundle.${i}`] = 'self';
      else if (!ctx.skus.has(k)) e[`spec.bundle.${i}`] = 'component';
      else if (seen.has(k)) e[`spec.bundle.${i}`] = 'repeated';
      else if (!pos(b.qty, 1, 50)) e[`spec.bundle.${i}`] = 'number';
      seen.add(k);
    });
  }
  if (type === 'food') {
    if (!pos(d.prepMinutes, 0, 7 * 24 * 60)) e['spec.prep'] = 'number';
    if (d.shelfDays.trim() && !pos(d.shelfDays, 1, 3650)) e['spec.shelf'] = 'number';
  }
  return e;
}

/** Slots for every date from `from` to `to` (inclusive, at most 60 days) at each time, skipping ones that exist. */
export function generateSlots(from: string, to: string, times: string[], cap: number, existing: { date: string; time: string }[], idBase: string): SpecDraft['slots'] {
  if (!isDate(from) || !isDate(to) || to < from) return [];
  const have = new Set(existing.map((x) => `${x.date} ${x.time}`));
  const out: SpecDraft['slots'] = [];
  const clean = [...new Set(times.map((t) => t.trim()).filter(isTime))].sort();
  let day = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let i = 0; day <= end && i < 60; i++, day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    for (const time of clean) {
      if (have.has(`${date} ${time}`)) continue;
      out.push({ id: `${idBase}-${date.replace(/-/g, '')}-${time.replace(':', '')}`, date, time, cap: String(cap), booked: 0 });
    }
  }
  return out;
}

export const slotLeft = (s: Pick<Slot, 'cap' | 'booked'>) => Math.max(0, s.cap - s.booked);
export const openSlots = (slots: Slot[] | undefined, today: string) => (slots ?? []).filter((s) => s.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
export const slotKey = (s: Pick<Slot, 'date' | 'time'>) => `${s.date} ${s.time}`;

/** Units a bundle can sell: for each component, its sellable units ÷ quantity per bundle; the lowest wins. */
export function bundleStock(items: BundleItem[], levels: Level[]): number {
  if (!items.length) return 0;
  return Math.min(...items.map((b) => Math.floor(levels.filter((l) => l.sku === b.sku).reduce((s, l) => s + Math.max(0, available(l)), 0) / Math.max(1, b.qty))));
}
/** Price of the components bought separately (for "you save"). */
export function bundleParts(items: BundleItem[], products: Product[]): { sku: string; qty: number; name: L | null; unit: number | null }[] {
  return items.map((b) => {
    const p = products.find((x) => x.sku === b.sku || x.variants.some((v) => v.sku === b.sku));
    const unit = p ? (p.variants.find((v) => v.sku === b.sku)?.price ?? p.price) : null;
    return { sku: b.sku, qty: b.qty, name: p?.name ?? null, unit };
  });
}
export function bundleSaving(items: BundleItem[], products: Product[], price: number | null): { sum: number; save: number } | null {
  const parts = bundleParts(items, products);
  if (!parts.length || parts.some((p) => p.unit === null) || price === null) return null;
  const sum = parts.reduce((s, p) => s + p.unit! * p.qty, 0);
  return { sum, save: sum - price };
}

/**
 * Sellable units of a product by type: warehouse stock (physical, food), unsold codes, open booking capacity,
 * the scarcest component (bundle); null = no limit (digital download, service).
 */
export function stockFor(p: Product, levels: Level[], today: string): number | null {
  const type = p.type ?? 'physical';
  if (type === 'digital' || type === 'service') return null;
  if (type === 'code') return (p.spec?.codes ?? []).filter((c) => !c.ref).length;
  if (type === 'booking') return openSlots(p.spec?.slots, today).reduce((s, x) => s + slotLeft(x), 0);
  if (type === 'bundle') return bundleStock(p.spec?.bundle ?? [], levels);
  const skus = new Set(skusOf(p));
  return levels.filter((l) => skus.has(l.sku)).reduce((s, l) => s + available(l), 0);
}

/** What changing an existing product's type throws away, so the merchant confirms knowingly. Empty = nothing lost. */
export function typeChangeLoss(from: ProductType, to: ProductType, d: { spec: SpecDraft; weight: string; variants: number; skuHasStock: boolean }): L[] {
  if (from === to) return [];
  const out: L[] = [];
  const s = d.spec;
  const codes = parseCodes(s.codesText, s.sold).codes.length;
  if (from === 'code' && (codes || s.sold.length)) out.push({ ar: `مخزون الأكواد (${codes} غير مباع) ويبقى سجل ${s.sold.length} كود مُسلَّم في طلباته`, en: `The code pool (${codes} unsold); ${s.sold.length} delivered codes stay on their orders` });
  if (from === 'digital' && s.fileName) out.push({ ar: `الملف «${s.fileName}» وحد التنزيل`, en: `The file “${s.fileName}” and its download limit` });
  if (from === 'booking' && s.slots.length) {
    const booked = s.slots.reduce((n, x) => n + x.booked, 0);
    out.push({ ar: `${s.slots.length} موعد${booked ? `، منها حجوزات قائمة (${booked}) تبقى في طلباتها` : ''}`, en: `${s.slots.length} slots${booked ? `; ${booked} existing bookings stay on their orders` : ''}` });
  }
  if (from === 'bundle' && s.bundle.length) out.push({ ar: `مكوّنات الحزمة (${s.bundle.length})`, en: `The bundle components (${s.bundle.length})` });
  if (from === 'food') out.push({ ar: 'وقت التحضير وقيد التوصيل المبرّد', en: 'Preparation time and the chilled-delivery rule' });
  if ((from === 'service' || from === 'booking') && to !== 'service' && to !== 'booking') out.push({ ar: 'مدة الخدمة ومكانها', en: 'Service length and place' });
  if (traits(from).weight && !traits(to).weight && d.weight.trim()) out.push({ ar: 'الوزن (لا يُطلب لهذا النوع)', en: 'The weight (not used by this type)' });
  if (traits(from).warehouse && !traits(to).warehouse && d.skuHasStock) out.push({ ar: 'مخزون المستودعات يبقى في المخزون لكنه لا يُباع من هذا المنتج', en: 'Warehouse stock stays in Inventory but is no longer sold by this product' });
  if (d.variants > 0 && (to === 'code' || to === 'booking' || to === 'bundle' || to === 'service' || to === 'digital')) out.push({ ar: `المتغيرات (${d.variants}) لا تُستخدم مع هذا النوع`, en: `The variants (${d.variants}) aren’t used by this type` });
  return out;
}

/* ───────────── Custom fields ───────────── */

export type FieldKind = 'text' | 'number' | 'choice' | 'date' | 'file';
export const FIELD_KINDS: FieldKind[] = ['text', 'number', 'choice', 'date', 'file'];
export interface CustomField {
  id: string;
  /** product = a detail the merchant fills per product, shown on the product page; order = asked at checkout. */
  scope: 'product' | 'order';
  label: L;
  help: L;
  kind: FieldKind;
  options: L[];
  required: boolean;
  /** Product types it applies to; [] = all. */
  types: ProductType[];
  /** Category keys (English name, lower case); [] = all. */
  cats: string[];
  active: boolean;
  /** Product fields: shoppers can filter the store by it (choice and number only). */
  filterable?: boolean;
  /** Order fields: printed on the invoice and packing slip. */
  onInvoice?: boolean;
}
export type FieldDefError = 'required' | 'options' | 'taken' | 'filter';
export function validateFieldDef(f: CustomField, all: CustomField[]): Partial<Record<'labelAr' | 'labelEn' | 'options' | 'filterable', FieldDefError>> {
  const e: Partial<Record<'labelAr' | 'labelEn' | 'options' | 'filterable', FieldDefError>> = {};
  const others = all.filter((x) => x.id !== f.id && x.scope === f.scope);
  if (!f.label.ar.trim()) e.labelAr = 'required';
  else if (others.some((x) => x.label.ar.trim() === f.label.ar.trim())) e.labelAr = 'taken';
  if (!f.label.en.trim()) e.labelEn = 'required';
  else if (others.some((x) => x.label.en.trim().toLowerCase() === f.label.en.trim().toLowerCase())) e.labelEn = 'taken';
  if (f.kind === 'choice') {
    const opts = f.options.filter((o) => o.ar.trim() || o.en.trim());
    const keys = opts.map((o) => o.en.trim().toLowerCase() || o.ar.trim());
    if (opts.length < 2 || opts.some((o) => !o.ar.trim() || !o.en.trim()) || new Set(keys).size !== keys.length) e.options = 'options';
  }
  if (f.filterable && (f.scope !== 'product' || (f.kind !== 'choice' && f.kind !== 'number'))) e.filterable = 'filter';
  return e;
}
export const fieldApplies = (f: CustomField, type: ProductType | undefined, cat: L) =>
  f.active && (!f.types.length || f.types.includes(type ?? 'physical')) && (!f.cats.length || f.cats.includes(catKey(cat)));

export type ValueError = 'required' | 'number' | 'date' | 'choice' | 'long';
/** Check one answer (or product value). Arabic digits are accepted for numbers. */
export function checkValue(f: CustomField, raw: string | undefined): ValueError | null {
  const v = (raw ?? '').trim();
  if (!v) return f.required ? 'required' : null;
  if (f.kind === 'number' && !/^-?\d+(\.\d+)?$/.test(normaliseDigits(v))) return 'number';
  if (f.kind === 'date' && !isDate(v)) return 'date';
  if (f.kind === 'choice' && !f.options.some((o) => o.en === v || o.ar === v)) return 'choice';
  if (v.length > 300) return 'long';
  return null;
}
/** How an answer reads in a language (choices are stored by their English label). */
export function valueText(f: Pick<CustomField, 'kind' | 'options'>, v: string, lang: 'ar' | 'en'): string {
  if (f.kind === 'choice') { const o = f.options.find((x) => x.en === v || x.ar === v); return o ? o[lang] : v; }
  if (f.kind === 'number') return normaliseDigits(v);
  return v;
}

/** Product fields that apply to a product, with the value it has. */
export function productFields(fields: CustomField[], p: Pick<Product, 'type' | 'category' | 'attrs'>): { field: CustomField; value: string }[] {
  return fields.filter((f) => f.scope === 'product' && fieldApplies(f, p.type, p.category)).map((f) => ({ field: f, value: p.attrs?.[f.id] ?? '' }));
}

/** A question the checkout asks: a merchant order field, or one a product type adds (service appointment). */
export interface Question { id: string; label: L; help: L; kind: FieldKind; options: L[]; required: boolean; onInvoice: boolean; why: L }
/** The questions a basket needs answered: order fields linked to any item's type or category, plus type questions. */
export function checkoutQuestions(fields: CustomField[], items: { name: L; type: ProductType; cat: L; appointment?: boolean; productId: string }[]): Question[] {
  const out: Question[] = [];
  for (const f of fields) {
    if (f.scope !== 'order' || !f.active) continue;
    const hit = items.find((i) => fieldApplies(f, i.type, i.cat));
    if (hit) out.push({ id: f.id, label: f.label, help: f.help, kind: f.kind, options: f.options, required: f.required, onInvoice: f.onInvoice !== false, why: f.types.length || f.cats.length ? { ar: `بسبب ${hit.name.ar}`, en: `Because of ${hit.name.en}` } : { ar: '', en: '' } });
  }
  for (const i of items) {
    if (i.type === 'service' && i.appointment && !out.some((q) => q.id === `appt:${i.productId}`)) {
      out.push({ id: `appt:${i.productId}`, label: { ar: `الموعد المفضّل · ${i.name.ar}`, en: `Preferred date · ${i.name.en}` }, help: { ar: 'يؤكده المتجر معك.', en: 'The store confirms it with you.' }, kind: 'date', options: [], required: true, onInvoice: true, why: { ar: '', en: '' } });
    }
  }
  return out;
}
export function checkAnswers(qs: Question[], answers: Record<string, string>, today: string): Record<string, ValueError | 'past'> {
  const e: Record<string, ValueError | 'past'> = {};
  for (const q of qs) {
    const err = checkValue({ ...q, scope: 'order', types: [], cats: [], active: true } as CustomField, answers[q.id]);
    if (err) e[q.id] = err;
    else if (q.kind === 'date' && q.id.startsWith('appt:') && (answers[q.id] ?? '') < today) e[q.id] = 'past';
  }
  return e;
}

/* ───────────── Brands ───────────── */

export interface Brand { id: string; name: L; slug: string; desc: L; /** Local preview (object URL) of an uploaded logo; '' = initials. */ logo: string; tone: string }
export const BRAND_TONES = ['#0f766e', '#7c3aed', '#b45309', '#be123c', '#1d4ed8', '#4d7c0f', '#334155'];
export type BrandError = 'required' | 'taken' | 'slug';
export function validateBrand(b: Pick<Brand, 'id' | 'name' | 'slug'>, all: Brand[]): Partial<Record<'nameAr' | 'nameEn' | 'slug', BrandError>> {
  const e: Partial<Record<'nameAr' | 'nameEn' | 'slug', BrandError>> = {};
  const others = all.filter((x) => x.id !== b.id);
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!b.name.ar.trim()) e.nameAr = 'required'; else if (others.some((x) => key(x.name.ar) === key(b.name.ar))) e.nameAr = 'taken';
  if (!b.name.en.trim()) e.nameEn = 'required'; else if (others.some((x) => key(x.name.en) === key(b.name.en))) e.nameEn = 'taken';
  if (b.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.slug)) e.slug = 'slug';
  else if (b.slug && others.some((x) => x.slug === b.slug)) e.slug = 'taken';
  return e;
}
/** Brands whose names differ only by spacing, case, "al-"/«ال» or a trailing "co" — likely the same brand typed twice. */
export function similarBrands(all: Brand[]): [Brand, Brand][] {
  const norm = (s: string) => s.toLowerCase().replace(/^(al[-\s]?|ال)/, '').replace(/\b(co|company|شركة)\b/g, '').replace(/[^a-z0-9؀-ۿ]/g, '');
  const out: [Brand, Brand][] = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (norm(all[i].name.en) === norm(all[j].name.en) || norm(all[i].name.ar) === norm(all[j].name.ar)) out.push([all[i], all[j]]);
  }
  return out;
}
export const brandCount = (products: Product[], id: string) => products.filter((p) => p.brand === id).length;
/** Move a brand's products to another brand (or none) — used by delete and merge. */
export function reassignBrand(products: Product[], from: string, to: string | null): Product[] {
  return products.map((p) => (p.brand === from ? { ...p, brand: to ?? undefined, version: p.version + 1 } : p));
}
export const brandInitials = (b: Pick<Brand, 'name'>, lang: 'ar' | 'en') => (b.name[lang] || b.name.en).trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* ───────────── Size charts ───────────── */

export interface SizeChart { id: string; name: L; cats: string[]; unit: 'cm' | 'in'; sizes: string[]; rows: { label: L; values: string[] }[]; note: L; active: boolean }
export type ChartError = 'required' | 'sizes' | 'rows' | 'value' | 'cats' | 'taken';
/** Values are a number or a range ("88" or "88-92"), Arabic digits accepted. */
export const okMeasure = (v: string) => /^\d{1,3}(\.\d)?(\s*[-–]\s*\d{1,3}(\.\d)?)?$/.test(normaliseDigits(v.trim()).replace('–', '-'));
export function validateChart(c: SizeChart, all: SizeChart[]): Record<string, ChartError> {
  const e: Record<string, ChartError> = {};
  if (!c.name.ar.trim()) e.nameAr = 'required';
  if (!c.name.en.trim()) e.nameEn = 'required';
  const sizes = c.sizes.map((s) => s.trim()).filter(Boolean);
  if (!sizes.length || new Set(sizes.map((s) => s.toUpperCase())).size !== sizes.length) e.sizes = 'sizes';
  if (!c.rows.length) e.rows = 'rows';
  c.rows.forEach((r, i) => {
    if (!r.label.ar.trim() || !r.label.en.trim()) e[`row.${i}.label`] = 'required';
    c.sizes.forEach((_, j) => { const v = r.values[j] ?? ''; if (v.trim() && !okMeasure(v)) e[`row.${i}.${j}`] = 'value'; });
  });
  if (!c.cats.length) e.cats = 'cats';
  else if (c.active && all.some((x) => x.id !== c.id && x.active && x.cats.some((k) => c.cats.includes(k)))) e.cats = 'taken';
  return e;
}
/** The active chart for a product's category. */
export const chartFor = (charts: SizeChart[], p: Pick<Product, 'category'>) => charts.find((c) => c.active && c.cats.includes(catKey(p.category)));
/** Sizes products in the chart's categories sell that the chart doesn't explain (and chart sizes no product sells). */
export function chartGaps(c: Pick<SizeChart, 'cats' | 'sizes'>, products: Product[]): { missing: string[]; unused: string[]; products: number } {
  const inCats = products.filter((p) => p.status !== 'archived' && c.cats.includes(catKey(p.category)));
  const sold = new Set(inCats.flatMap((p) => p.sizes.map((s) => s.trim().toUpperCase())).filter(Boolean));
  const have = new Set(c.sizes.map((s) => s.trim().toUpperCase()));
  return { missing: [...sold].filter((s) => !have.has(s)), unused: [...have].filter((s) => !sold.has(s)), products: inCats.length };
}

/* ───────────── Shopper filters ───────────── */

export type FilterKey = 'price' | 'availability' | 'brand' | 'color' | 'size' | `field:${string}`;
export interface FilterSettings { order: FilterKey[]; off: FilterKey[]; /** Hide a filter that would offer fewer than this many values. */ minValues: number }
export const BASE_FILTERS: FilterKey[] = ['price', 'availability', 'brand', 'color', 'size'];
export function filterKeys(s: FilterSettings, fields: CustomField[]): FilterKey[] {
  const fieldKeys = fields.filter((f) => f.scope === 'product' && f.active && f.filterable).map((f) => `field:${f.id}` as FilterKey);
  const known = [...BASE_FILTERS, ...fieldKeys];
  return [...s.order.filter((k) => known.includes(k)), ...known.filter((k) => !s.order.includes(k))];
}
/** A product as the filter preview needs it. */
export interface FilterItem { brand?: string; colors: string[]; sizes: string[]; attrs?: Record<string, string>; inStock: boolean; price: number }
/** Values each filter would offer for these products, with counts. A filter with too few values is marked hidden. */
export function filterPreview(items: FilterItem[], keys: FilterKey[], s: FilterSettings, ctx: { brands: Brand[]; fields: CustomField[] }): { key: FilterKey; on: boolean; values: { value: string; label: L; count: number }[]; hiddenWhy: 'off' | 'few' | null }[] {
  return keys.map((key) => {
    const counts = new Map<string, number>();
    const add = (v: string | undefined) => { if (v) counts.set(v, (counts.get(v) ?? 0) + 1); };
    let label = (v: string): L => ({ ar: v, en: v });
    if (key === 'brand') { items.forEach((i) => add(i.brand)); label = (v) => ctx.brands.find((b) => b.id === v)?.name ?? { ar: v, en: v }; }
    else if (key === 'color') items.forEach((i) => new Set(i.colors).forEach(add));
    else if (key === 'size') items.forEach((i) => new Set(i.sizes).forEach(add));
    else if (key === 'availability') { items.forEach((i) => add(i.inStock ? 'in' : 'out')); label = (v) => (v === 'in' ? { ar: 'متوفر', en: 'In stock' } : { ar: 'نفد', en: 'Sold out' }); }
    else if (key === 'price') { items.forEach((i) => add(i.price < 20_000 ? 'u200' : i.price <= 40_000 ? '200-400' : 'o400')); label = (v) => ({ u200: { ar: 'أقل من 200', en: 'Under 200' }, '200-400': { ar: '200–400', en: '200–400' }, o400: { ar: 'أكثر من 400', en: 'Over 400' } } as Record<string, L>)[v] ?? { ar: v, en: v }; }
    else {
      const f = ctx.fields.find((x) => `field:${x.id}` === key);
      items.forEach((i) => add(i.attrs?.[f?.id ?? ''] || undefined));
      if (f?.kind === 'choice') label = (v) => f.options.find((o) => o.en === v || o.ar === v) ?? { ar: v, en: v };
    }
    const values = [...counts.entries()].map(([value, count]) => ({ value, label: label(value), count })).sort((a, b) => b.count - a.count);
    const off = s.off.includes(key);
    const hiddenWhy = off ? 'off' as const : values.length < s.minValues ? 'few' as const : null;
    return { key, on: !hiddenWhy, values, hiddenWhy };
  });
}

/* ───────────── Pre-order campaigns ───────────── */

export interface Campaign {
  id: string; name: L; productIds: string[];
  starts: string; ends: string;
  /** Most units taken by the campaign; null = no cap. */
  cap: number | null;
  pay: 'full' | 'deposit';
  /** Percent paid now when `pay` is deposit. */
  depositPct: number;
  /** Expected ship date shown to shoppers. */
  shipDate: string;
  /** Units ordered through the campaign so far. */
  taken: number;
  paused: boolean;
}
export type CampaignState = 'scheduled' | 'live' | 'full' | 'ended' | 'paused';
export function campaignState(c: Campaign, today: string): CampaignState {
  if (c.paused) return 'paused';
  if (today > c.ends) return 'ended';
  if (today < c.starts) return 'scheduled';
  if (c.cap !== null && c.taken >= c.cap) return 'full';
  return 'live';
}
export type CampaignError = 'required' | 'dates' | 'ship' | 'cap' | 'deposit' | 'overlap' | 'past';
export function validateCampaign(c: Campaign, all: Campaign[], today: string, isNew: boolean): Partial<Record<'nameAr' | 'nameEn' | 'products' | 'starts' | 'ends' | 'shipDate' | 'cap' | 'deposit', CampaignError>> {
  const e: Partial<Record<'nameAr' | 'nameEn' | 'products' | 'starts' | 'ends' | 'shipDate' | 'cap' | 'deposit', CampaignError>> = {};
  if (!c.name.ar.trim()) e.nameAr = 'required';
  if (!c.name.en.trim()) e.nameEn = 'required';
  if (!c.productIds.length) e.products = 'required';
  if (!isDate(c.starts)) e.starts = 'required'; else if (isNew && c.starts < today) e.starts = 'past';
  if (!isDate(c.ends)) e.ends = 'required'; else if (isDate(c.starts) && c.ends < c.starts) e.ends = 'dates';
  if (!isDate(c.shipDate)) e.shipDate = 'required'; else if (isDate(c.starts) && c.shipDate < c.starts) e.shipDate = 'ship';
  if (c.cap !== null && (c.cap < 1 || c.cap > 100000 || c.cap < c.taken)) e.cap = 'cap';
  if (c.pay === 'deposit' && (c.depositPct < 10 || c.depositPct > 90)) e.deposit = 'deposit';
  const clash = all.find((x) => x.id !== c.id && !x.paused && x.productIds.some((id) => c.productIds.includes(id)) && !(x.ends < c.starts || c.ends < x.starts));
  if (clash && !e.products) e.products = 'overlap';
  return e;
}
/** The campaign taking pre-orders for a product today, if any. */
export function liveCampaign(list: Campaign[], productId: string, today: string): Campaign | undefined {
  return list.find((c) => c.productIds.includes(productId) && campaignState(c, today) === 'live');
}
export const campaignLeft = (c: Campaign) => (c.cap === null ? null : Math.max(0, c.cap - c.taken));
export const depositOf = (c: Pick<Campaign, 'pay' | 'depositPct'>, amount: number) => (c.pay === 'deposit' ? Math.round((amount * c.depositPct) / 100) : amount);
/** Incoming stock (open transfers and purchase receipts) against the campaign's cap: what is promised but not covered. */
export function campaignCover(c: Campaign, products: Product[], levels: Level[]): { incoming: number; onHand: number; promised: number; uncovered: number } {
  const skus = new Set(products.filter((p) => c.productIds.includes(p.id)).flatMap(skusOf));
  const ls = levels.filter((l) => skus.has(l.sku));
  const incoming = ls.reduce((s, l) => s + l.incoming, 0);
  const onHand = ls.reduce((s, l) => s + Math.max(0, available(l)), 0);
  const promised = c.cap ?? c.taken;
  return { incoming, onHand, promised, uncovered: Math.max(0, promised - incoming - onHand) };
}

/* ───────────── Purchase restrictions ───────────── */

export interface Restriction {
  id: string; name: L; active: boolean;
  productIds: string[]; cats: string[];
  /** Most units one customer can buy across their orders; null = no limit. */
  maxPerCustomer: number | null;
  /** Fewest units per order; null = 1. */
  minQty: number | null;
  cities: { mode: 'all' | 'only' | 'except'; list: string[] };
  /** Minimum age the shopper confirms at checkout; null = none. */
  age: number | null;
  /** Channels the products are hidden from. */
  hideOn: Channel[];
}
export type RestrictionError = 'required' | 'scope' | 'rule' | 'minmax' | 'number' | 'cities';
export function validateRestriction(r: Restriction): Partial<Record<'nameAr' | 'nameEn' | 'scope' | 'rule' | 'max' | 'min' | 'cities', RestrictionError>> {
  const e: Partial<Record<'nameAr' | 'nameEn' | 'scope' | 'rule' | 'max' | 'min' | 'cities', RestrictionError>> = {};
  if (!r.name.ar.trim()) e.nameAr = 'required';
  if (!r.name.en.trim()) e.nameEn = 'required';
  if (!r.productIds.length && !r.cats.length) e.scope = 'scope';
  if (r.maxPerCustomer === null && r.minQty === null && r.cities.mode === 'all' && r.age === null && !r.hideOn.length) e.rule = 'rule';
  if (r.maxPerCustomer !== null && (r.maxPerCustomer < 1 || r.maxPerCustomer > 999)) e.max = 'number';
  if (r.minQty !== null && (r.minQty < 2 || r.minQty > 999)) e.min = 'number';
  if (r.maxPerCustomer !== null && r.minQty !== null && r.minQty > r.maxPerCustomer) e.min = 'minmax';
  if (r.cities.mode !== 'all' && !r.cities.list.length) e.cities = 'cities';
  return e;
}
export const restrictionCovers = (r: Restriction, p: Pick<Product, 'id' | 'category'>) => r.productIds.includes(p.id) || r.cats.includes(catKey(p.category));
/** Every active rule on a product combined: the strictest of each limit applies. */
export interface Limits { max: number | null; min: number | null; age: number | null; only: string[] | null; except: string[]; hideOn: Channel[]; from: string[] }
export function limitsFor(list: Restriction[], p: Pick<Product, 'id' | 'category'>): Limits {
  const rs = list.filter((r) => r.active && restrictionCovers(r, p));
  const pick = (vals: (number | null)[], f: (...n: number[]) => number) => { const v = vals.filter((x): x is number => x !== null); return v.length ? f(...v) : null; };
  let only: string[] | null = null;
  for (const r of rs.filter((x) => x.cities.mode === 'only')) only = only === null ? [...r.cities.list] : only.filter((c) => r.cities.list.includes(c));
  return {
    max: pick(rs.map((r) => r.maxPerCustomer), Math.min), min: pick(rs.map((r) => r.minQty), Math.max), age: pick(rs.map((r) => r.age), Math.max),
    only, except: [...new Set(rs.filter((r) => r.cities.mode === 'except').flatMap((r) => r.cities.list))],
    hideOn: [...new Set(rs.flatMap((r) => r.hideOn))], from: rs.map((r) => r.id),
  };
}
export type BasketProblem = { productId: string; name: L; kind: 'max' | 'min' | 'city'; limit: number; have: number };
/**
 * Check a basket against the merchant's rules. `prior` = units of each product this customer already bought
 * (paid orders); city is the delivery city id once known. Age is a confirmation, returned as the highest age asked.
 */
export function checkBasket(lines: { productId: string; qty: number }[], ctx: { products: Pick<Product, 'id' | 'category' | 'name'>[]; rules: Restriction[]; city?: string; prior?: Record<string, number> }): { problems: BasketProblem[]; age: number | null } {
  const per = new Map<string, number>();
  lines.forEach((l) => per.set(l.productId, (per.get(l.productId) ?? 0) + l.qty));
  const problems: BasketProblem[] = [];
  let age: number | null = null;
  for (const [id, qty] of per) {
    const p = ctx.products.find((x) => x.id === id);
    if (!p) continue;
    const lim = limitsFor(ctx.rules, p);
    const before = ctx.prior?.[id] ?? 0;
    if (lim.max !== null && qty + before > lim.max) problems.push({ productId: id, name: p.name, kind: 'max', limit: Math.max(0, lim.max - before), have: qty });
    if (lim.min !== null && qty < lim.min) problems.push({ productId: id, name: p.name, kind: 'min', limit: lim.min, have: qty });
    if (ctx.city && ((lim.only && !lim.only.includes(ctx.city)) || lim.except.includes(ctx.city))) problems.push({ productId: id, name: p.name, kind: 'city', limit: 0, have: qty });
    if (lim.age !== null) age = Math.max(age ?? 0, lim.age);
  }
  return { problems, age };
}
/** Two active rules setting different limits on the same product: the merchant sees which one wins. */
export function restrictionOverlaps(list: Restriction[], products: Pick<Product, 'id' | 'category' | 'name'>[]): { product: L; rules: string[] }[] {
  const out: { product: L; rules: string[] }[] = [];
  for (const p of products) {
    const rs = list.filter((r) => r.active && restrictionCovers(r, p) && (r.maxPerCustomer !== null || r.minQty !== null));
    if (rs.length > 1) out.push({ product: p.name, rules: rs.map((r) => r.id) });
  }
  return out;
}

/* ───────────── Order extras (what the checkout adds to an order) ───────────── */

export interface OrderExtras {
  /** Answers to checkout questions, with the label as it was asked (renaming the field never rewrites an order). */
  fields?: { id: string; label: L; value: L; onInvoice: boolean }[];
  preorder?: { campaignId: string; name: L; shipDate: string; pay: 'full' | 'deposit'; deposit: number; balance: number };
  /** Codes delivered (simulated email) per SKU. */
  codes?: { sku: string; codes: string[] }[];
  bookings?: { sku: string; date: string; time: string; qty: number }[];
  /** Bundle lines with the components they ship. */
  bundles?: { sku: string; parts: { sku: string; qty: number }[] }[];
  /** Download links sent (simulated). */
  downloads?: { sku: string; file: string; limit: number | null; expiryDays: number | null }[];
  /** The shopper confirmed this minimum age at checkout. */
  age?: number;
}
/** Assign unsold codes to an order (first in, first out). Short = the pool ran out (the order needs manual follow-up). */
export function assignCodes(products: Product[], lines: { productId: string; sku: string; qty: number }[], ref: string): { products: Product[]; codes: { sku: string; codes: string[] }[]; short: number } {
  let short = 0;
  const codes: { sku: string; codes: string[] }[] = [];
  let next = products;
  for (const l of lines) {
    const p = next.find((x) => x.id === l.productId);
    if (!p || p.type !== 'code') continue;
    const pool = p.spec?.codes ?? [];
    // Idempotent: codes already given to this order are not given twice.
    const mine = pool.filter((c) => c.ref === ref).map((c) => c.code);
    const need = Math.max(0, l.qty - mine.length);
    const free = pool.filter((c) => !c.ref).slice(0, need).map((c) => c.code);
    short += need - free.length;
    const freeSet = new Set(free);
    next = next.map((x) => (x === p ? { ...p, spec: { ...p.spec, codes: pool.map((c) => (freeSet.has(c.code) ? { ...c, ref } : c)) }, version: p.version + 1 } : x));
    codes.push({ sku: l.sku, codes: [...mine, ...free] });
  }
  return { products: next, codes, short };
}
/** Book slot capacity for an order's booking lines. */
export function bookSlots(products: Product[], bookings: { productId: string; date: string; time: string; qty: number }[]): Product[] {
  return products.map((p) => {
    const mine = bookings.filter((b) => b.productId === p.id);
    if (!mine.length || p.type !== 'booking') return p;
    return { ...p, spec: { ...p.spec, slots: (p.spec?.slots ?? []).map((s) => { const b = mine.find((x) => x.date === s.date && x.time === s.time); return b ? { ...s, booked: s.booked + b.qty } : s; }) }, version: p.version + 1 };
  });
}

/* ───────────── Delivery of a bag (checkout, manual orders, the order page) ───────────── */

/** Types that need no delivery address: sent by email (download, code) or done at an appointment (service, booking). */
export type NoShipKind = 'digital' | 'code' | 'service' | 'booking';
export const noShipKind = (t: ProductType | undefined): NoShipKind | undefined => (t && !traits(t).ships ? (t as NoShipKind) : undefined);
/** After payment a download or code is delivered at once (simulated email); a service or booking is scheduled. */
export const noShipState = (k: NoShipKind): 'delivered' | 'scheduled' => (k === 'digital' || k === 'code' ? 'delivered' : 'scheduled');
/**
 * What a bag asks the shopper for: an address only when something ships; an email when a download or code is sent by
 * email. `mode` = everything ships, nothing ships, or both (the address is for the shippable part only).
 */
export function bagNeeds(lines: { ships?: boolean; type?: ProductType }[]): { address: boolean; email: boolean; mode: 'ship' | 'none' | 'mixed' } {
  const ship = lines.filter((l) => l.ships !== false).length;
  const none = lines.length - ship;
  const email = lines.some((l) => l.ships === false && (l.type === 'digital' || l.type === 'code'));
  return { address: ship > 0 || !lines.length, email, mode: !none ? 'ship' : ship ? 'mixed' : 'none' };
}
/** The codes and download links of an order as message text (what the simulated delivery email carries). */
export function deliveryText(e: OrderExtras | undefined, ref: string, lang: 'ar' | 'en'): string {
  if (!e) return '';
  const out: string[] = [];
  for (const c of e.codes ?? []) if (c.codes.length) out.push(`${lang === 'ar' ? 'الأكواد' : 'Codes'}: ${c.codes.join(', ')}`);
  for (const d of e.downloads ?? []) {
    const terms = [d.limit ? (lang === 'ar' ? `${d.limit} تنزيلات` : `${d.limit} downloads`) : '', d.expiryDays ? (lang === 'ar' ? `صالح ${d.expiryDays} يومًا` : `valid ${d.expiryDays} days`) : ''].filter(Boolean).join(lang === 'ar' ? '، ' : ', ');
    out.push(`${lang === 'ar' ? 'رابط التنزيل' : 'Download'} ${d.file}: https://dl.example/SIM-${ref}/${encodeURIComponent(d.file)}${terms ? ` (${terms})` : ''}`);
  }
  return out.join(' · ');
}
/** True when an order carries codes or download links the customer receives on payment. */
export const hasDigitalDelivery = (e: OrderExtras | undefined) => !!e && ((e.codes ?? []).some((c) => c.codes.length > 0) || (e.downloads ?? []).length > 0);

/* ───────────── What the online store reads (storefront/bridge.ts) ───────────── */

/** Everything the store shows or enforces for one product beyond name, price and stock. */
export interface StoreX {
  type: ProductType;
  ships: boolean;
  perishable?: boolean; prepMinutes?: number; shelfDays?: number | null;
  minutes?: number; appointment?: boolean; where?: 'store' | 'online' | 'customer';
  file?: { name: string; limit: number | null; expiryDays: number | null };
  bundle?: { sku: string; qty: number; name: L | null }[];
  /** What the components cost bought apart, when every component is priced. */
  partsSum?: number;
  brand?: { id: string; name: L; logo: string; tone: string };
  /** Product custom fields with a value (file fields show the file name; the download itself is simulated). */
  attrs: { id: string; label: L; value: L; kind: FieldKind }[];
  /** Raw field values for filtering. */
  attrValues: Record<string, string>;
  chart?: SizeChart;
  preorder?: { campaignId: string; name: L; shipDate: string; pay: 'full' | 'deposit'; depositPct: number; left: number | null };
  limits?: Pick<Limits, 'max' | 'min' | 'age' | 'only' | 'except'>;
}
export function storeX(p: Product, x: CatalogX, today: string, products: Product[]): StoreX {
  const t = traits(p.type);
  const s = p.spec ?? {};
  const brand = x.brands.find((b) => b.id === p.brand);
  const attrs = productFields(x.fields, p).filter((a) => a.value.trim()).map((a) => ({ id: a.field.id, label: a.field.label, kind: a.field.kind, value: a.field.kind === 'choice' ? (a.field.options.find((o) => o.en === a.value || o.ar === a.value) ?? { ar: a.value, en: a.value }) : { ar: a.value, en: a.value } }));
  const camp = liveCampaign(x.campaigns, p.id, today);
  const lim = limitsFor(x.restrictions, p);
  const parts = p.type === 'bundle' ? bundleParts(s.bundle ?? [], products) : undefined;
  const sum = parts && parts.every((q) => q.unit !== null) ? parts.reduce((a, q) => a + q.unit! * q.qty, 0) : undefined;
  return {
    type: p.type ?? 'physical', ships: t.ships,
    ...(p.type === 'food' ? { perishable: s.perishable !== false, prepMinutes: s.prepMinutes, shelfDays: s.shelfDays ?? null } : {}),
    ...(p.type === 'service' || p.type === 'booking' ? { minutes: s.minutes, appointment: !!s.appointment, where: s.where } : {}),
    ...(p.type === 'digital' && s.file ? { file: { name: s.file.name, limit: s.file.limit, expiryDays: s.file.expiryDays } } : {}),
    ...(parts ? { bundle: parts.map((q) => ({ sku: q.sku, qty: q.qty, name: q.name })), partsSum: sum } : {}),
    ...(brand ? { brand: { id: brand.id, name: brand.name, logo: brand.logo, tone: brand.tone } } : {}),
    attrs, attrValues: { ...(p.attrs ?? {}) },
    ...(chartFor(x.charts, p) && p.sizes.length ? { chart: chartFor(x.charts, p) } : {}),
    ...(camp ? { preorder: { campaignId: camp.id, name: camp.name, shipDate: camp.shipDate, pay: camp.pay, depositPct: camp.depositPct, left: campaignLeft(camp) } } : {}),
    ...(lim.from.length ? { limits: { max: lim.max, min: lim.min, age: lim.age, only: lim.only, except: lim.except } } : {}),
  };
}
/** Hidden from the online store by a restriction. */
export const hiddenOnline = (p: Pick<Product, 'id' | 'category'>, x: Pick<CatalogX, 'restrictions'>) => limitsFor(x.restrictions, p).hideOn.includes('online');

/* ───────────── Store state and fixtures ───────────── */

export interface CatalogX {
  brands: Brand[];
  fields: CustomField[];
  charts: SizeChart[];
  filters: FilterSettings;
  campaigns: Campaign[];
  restrictions: Restriction[];
}
export const riyadhToday = (now = Date.now()) => new Date(now + 3 * 3_600_000).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const l = (ar: string, en: string): L => ({ ar, en });
export function catalogXFixtures(today = riyadhToday()): CatalogX {
  return {
    brands: [
      { id: 'b-nuwa', name: l('دار نُوى', 'Dar Nuwa'), slug: 'dar-nuwa', desc: l('علامة المتجر للأزياء والإكسسوارات.', 'The store’s own fashion and accessories label.'), logo: '', tone: BRAND_TONES[0] },
      { id: 'b-oud', name: l('بيت العود', 'Oud House'), slug: 'oud-house', desc: l('عطور ودهن عود وبخور.', 'Perfume, oud oil and bakhoor.'), logo: '', tone: BRAND_TONES[2] },
      { id: 'b-leather', name: l('جلديات الحِرفة', 'Hirfa Leather'), slug: 'hirfa-leather', desc: l('حقائب ومحافظ من جلد طبيعي.', 'Genuine-leather bags and wallets.'), logo: '', tone: BRAND_TONES[3] },
    ],
    fields: [
      { id: 'f-material', scope: 'product', label: l('الخامة', 'Material'), help: l('', ''), kind: 'choice', options: [l('قطن', 'Cotton'), l('كتان', 'Linen'), l('حرير', 'Silk'), l('جلد طبيعي', 'Genuine leather'), l('كريب', 'Crepe')], required: false, types: ['physical'], cats: ['fashion', 'bags'], active: true, filterable: true },
      { id: 'f-origin', scope: 'product', label: l('بلد الصنع', 'Made in'), help: l('', ''), kind: 'text', options: [], required: false, types: [], cats: [], active: true },
      { id: 'f-concentration', scope: 'product', label: l('التركيز', 'Concentration'), help: l('', ''), kind: 'choice', options: [l('ماء عطر', 'Eau de parfum'), l('عطر مركّز', 'Extrait'), l('دهن', 'Oil')], required: false, types: [], cats: ['fragrance'], active: true, filterable: true },
      { id: 'f-care', scope: 'product', label: l('دليل العناية', 'Care guide'), help: l('ملف PDF يظهر رابطه في صفحة المنتج.', 'A PDF linked from the product page.'), kind: 'file', options: [], required: false, types: ['physical'], cats: ['fashion'], active: true },
      { id: 'o-gift-name', scope: 'order', label: l('اسم المُهدى إليه', 'Gift recipient’s name'), help: l('يُكتب على بطاقة الإهداء.', 'Written on the gift card.'), kind: 'text', options: [], required: false, types: [], cats: ['gifts'], active: true, onInvoice: true },
      { id: 'o-delivery-day', scope: 'order', label: l('يوم التوصيل المفضّل', 'Preferred delivery day'), help: l('نحاول الالتزام به، وليس وعدًا.', 'We try to keep to it; not a promise.'), kind: 'date', options: [], required: false, types: ['food'], cats: [], active: true, onInvoice: true },
      { id: 'o-measure', scope: 'order', label: l('طول العباية (سم)', 'Abaya length (cm)'), help: l('للتفصيل على المقاس.', 'For made-to-measure.'), kind: 'number', options: [], required: false, types: ['service'], cats: [], active: true, onInvoice: true },
    ],
    charts: [
      {
        id: 'sc-fashion', name: l('مقاسات الأزياء', 'Fashion sizes'), cats: ['fashion'], unit: 'cm', active: true,
        sizes: ['S', 'M', 'L', 'XL'],
        rows: [{ label: l('الصدر', 'Chest'), values: ['88-92', '96-100', '104-108', '112-116'] }, { label: l('الطول', 'Length'), values: ['138', '142', '146', '150'] }, { label: l('الكم', 'Sleeve'), values: ['58', '60', '62', '63'] }],
        note: l('قِس فوق ملابس خفيفة. بين مقاسين؟ اختر الأكبر.', 'Measure over light clothing. Between sizes? Pick the larger.'),
      },
    ],
    filters: { order: ['price', 'brand', 'size', 'color', 'availability'], off: [], minValues: 2 },
    campaigns: [
      { id: 'pc-1', name: l('إصدار عود رمضان', 'Ramadan oud release'), productIds: ['p13'], starts: addDays(today, -3), ends: addDays(today, 20), cap: 40, pay: 'deposit', depositPct: 30, shipDate: addDays(today, 28), taken: 12, paused: false },
    ],
    restrictions: [
      { id: 'r-1', name: l('حد العطور المحدودة', 'Limited perfume cap'), active: true, productIds: ['p13'], cats: [], maxPerCustomer: 2, minQty: null, cities: { mode: 'all', list: [] }, age: null, hideOn: [] },
      { id: 'r-2', name: l('البخور: تأكيد العمر', 'Bakhoor: age confirmation'), active: true, productIds: ['p14'], cats: [], maxPerCustomer: null, minQty: null, cities: { mode: 'all', list: [] }, age: 18, hideOn: ['market'] },
      { id: 'r-3', name: l('الحلويات الطازجة داخل الرياض وجدة', 'Fresh sweets: Riyadh and Jeddah only'), active: true, productIds: ['p23'], cats: [], maxPerCustomer: null, minQty: 2, cities: { mode: 'only', list: ['riyadh', 'jeddah'] }, age: null, hideOn: [] },
    ],
  };
}

/* ───────────── Checkout → order (storefront/state.ts) ───────────── */

/** A store product as the checkout sees it (structural, so the storefront domain stays separate). */
export interface ExtrasProduct { id: string; name: L; x?: StoreX; variants: { id: string; size?: string }[] }
/** What a basket adds to its order: answers, pre-order terms (deposit and balance), bookings, bundles, downloads, age. */
export function buildOrderExtras(
  lines: { productId: string; vid: string; sku?: string; qty: number; amount: number }[], products: ExtrasProduct[],
  qs: Question[], answers: Record<string, string>, age: number | null,
): OrderExtras {
  const byId = new Map(products.map((p) => [p.id, p]));
  const fields = qs.filter((q) => (answers[q.id] ?? '').trim()).map((q) => ({
    id: q.id, label: q.label, onInvoice: q.onInvoice,
    value: { ar: valueText(q, answers[q.id].trim(), 'ar'), en: valueText(q, answers[q.id].trim(), 'en') },
  }));
  const pre = lines.filter((l) => byId.get(l.productId)?.x?.preorder);
  const po = pre.length ? byId.get(pre[0].productId)!.x!.preorder! : undefined;
  const preAmount = pre.reduce((s, l) => s + l.amount, 0);
  const deposit = po ? depositOf(po, preAmount) : 0;
  const bookings = lines.flatMap((l) => {
    const p = byId.get(l.productId);
    if (p?.x?.type !== 'booking') return [];
    const size = p.variants.find((v) => v.id === l.vid)?.size ?? '';
    const [date, time] = size.split(' ');
    return date && time ? [{ sku: l.sku ?? '', date, time, qty: l.qty }] : [];
  });
  const bundles = lines.flatMap((l) => { const b = byId.get(l.productId)?.x?.bundle; return b ? [{ sku: l.sku ?? '', parts: b.map((q) => ({ sku: q.sku, qty: q.qty * l.qty })) }] : []; });
  const downloads = lines.flatMap((l) => { const f = byId.get(l.productId)?.x?.file; return f ? [{ sku: l.sku ?? '', file: f.name, limit: f.limit, expiryDays: f.expiryDays }] : []; });
  return {
    ...(fields.length ? { fields } : {}),
    ...(po ? { preorder: { campaignId: po.campaignId, name: po.name, shipDate: po.shipDate, pay: po.pay, deposit, balance: preAmount - deposit } } : {}),
    ...(bookings.length ? { bookings } : {}), ...(bundles.length ? { bundles } : {}), ...(downloads.length ? { downloads } : {}),
    ...(age ? { age } : {}),
  };
}
/** Units each campaign took in an order (counted once, when the order is paid). */
export function campaignTake(list: Campaign[], lines: { productId: string; qty: number }[], extras: OrderExtras | undefined): Campaign[] {
  const id = extras?.preorder?.campaignId;
  if (!id) return list;
  const c = list.find((x) => x.id === id);
  if (!c) return list;
  const qty = lines.filter((l) => c.productIds.includes(l.productId)).reduce((s, l) => s + l.qty, 0);
  return qty ? list.map((x) => (x === c ? { ...c, taken: c.taken + qty } : x)) : list;
}
/** Answers and catalogue facts of an order as one line of text (CSV export, search). */
export function orderExtrasText(e: OrderExtras | undefined, lang: 'ar' | 'en'): string {
  if (!e) return '';
  const parts: string[] = [];
  for (const f of e.fields ?? []) parts.push(`${f.label[lang]}: ${f.value[lang]}`);
  if (e.preorder) parts.push(`${lang === 'ar' ? 'طلب مسبق' : 'Pre-order'} ${e.preorder.shipDate}${e.preorder.pay === 'deposit' ? ` (${lang === 'ar' ? 'دفعة' : 'deposit'} ${(e.preorder.deposit / 100).toFixed(2)})` : ''}`);
  for (const b of e.bookings ?? []) parts.push(`${lang === 'ar' ? 'حجز' : 'Booking'} ${b.date} ${b.time} x${b.qty}`);
  for (const c of e.codes ?? []) parts.push(`${c.sku}: ${c.codes.length} ${lang === 'ar' ? 'كود' : 'codes'}`);
  if (e.age) parts.push(`${lang === 'ar' ? 'أكّد العمر' : 'Age confirmed'} ${e.age}+`);
  return parts.join(' | ');
}
