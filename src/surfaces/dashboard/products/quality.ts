// Product quality (Salla audit MATRIX #35): instead of a bare percentage, every check says what is missing, why it
// matters and which field fixes it. Pure rules; the list, the editor and the quick filters all read this.
import { catKey, type Category, type Media, type Product } from '../../merchant/catalog';
import type { L } from '../../merchant/domain';
import { productPhoto } from '../model/media';
import { parseIntStrict, parseMoney } from '../../merchant/catalog';
import type { EditDraft, SectionId } from './model';

export type QualityKey = 'price' | 'nameEn' | 'descAr' | 'descEn' | 'image' | 'alt' | 'images3' | 'category' | 'cost' | 'seo' | 'weight' | 'barcode';
/** What the check affects, shown next to the missing item. */
export type QualityImpact = 'sales' | 'shoppers' | 'search' | 'access' | 'profit' | 'shipping' | 'marketplace';
export interface QualityItem { key: QualityKey; ok: boolean; weight: number; impact: QualityImpact; section: SectionId; /** Error/field key in the editor (`fieldId`). */ field: string }
export interface Quality { score: number; items: QualityItem[]; missing: QualityItem[]; level: 'good' | 'fair' | 'poor' }

/** Normalised input so a saved product and an unsaved editor draft are scored the same way. */
export interface QualityInput {
  price: number | null; nameEn: string; descAr: string; descEn: string; media: Media[]; hasPhoto: boolean; category: L;
  cost: number | null; seoTitle: string; seoDesc: string; physical: boolean; weight: number | null; barcode: string;
}

/** Categories that mean "not really categorised": the import fallback and anything not in the merchant's list. */
const FALLBACK = new Set(['imported', 'general', 'uncategorised', 'uncategorized']);
export function isUncategorised(c: L, cats: Category[]): boolean {
  const k = catKey(c);
  return !k || FALLBACK.has(k) || (cats.length > 0 && !cats.some((x) => catKey(x.name) === k));
}

const W: Record<QualityKey, [number, QualityImpact, SectionId, string]> = {
  price: [14, 'sales', 'pricing', 'price'],
  image: [16, 'shoppers', 'media', 'media'],
  descAr: [12, 'shoppers', 'basics', 'descAr'],
  descEn: [6, 'shoppers', 'basics', 'descEn'],
  nameEn: [6, 'search', 'basics', 'nameEn'],
  category: [10, 'shoppers', 'basics', 'category'],
  alt: [6, 'access', 'media', 'media.0'],
  images3: [6, 'shoppers', 'media', 'media'],
  seo: [8, 'search', 'seo', 'seoDesc'],
  cost: [6, 'profit', 'pricing', 'cost'],
  weight: [6, 'shipping', 'shipping', 'weight'],
  barcode: [4, 'marketplace', 'inventory', 'barcode'],
};

export function quality(x: QualityInput, cats: Category[]): Quality {
  const images = x.media.length + (x.media.length === 0 && x.hasPhoto ? 1 : 0);
  const missingAlt = x.media.findIndex((m) => !m.alt.trim());
  const checks: [QualityKey, boolean, boolean?][] = [
    ['price', (x.price ?? 0) > 0],
    ['image', images > 0],
    ['descAr', x.descAr.trim().length >= 20],
    ['descEn', x.descEn.trim().length >= 20],
    ['nameEn', !!x.nameEn.trim()],
    ['category', !isUncategorised(x.category, cats)],
    ['alt', missingAlt < 0, images > 0],
    ['images3', images >= 3, images > 0],
    ['seo', !!x.seoDesc.trim() || x.descAr.trim().length + x.descEn.trim().length >= 40],
    ['cost', x.cost !== null],
    ['weight', !!x.weight && x.weight > 0, x.physical],
    ['barcode', !!x.barcode.trim(), x.physical],
  ];
  const items: QualityItem[] = checks.filter(([, , applies]) => applies !== false).map(([key, ok]) => {
    const [weight, impact, section, field] = W[key];
    return { key, ok, weight, impact, section, field: key === 'alt' && missingAlt >= 0 ? `media.${missingAlt}` : field };
  });
  const total = items.reduce((s, i) => s + i.weight, 0);
  const got = items.filter((i) => i.ok).reduce((s, i) => s + i.weight, 0);
  const score = total ? Math.round((got * 100) / total) : 100;
  // Biggest effect first, so the first fix is the one that matters most.
  const missing = items.filter((i) => !i.ok).sort((a, b) => b.weight - a.weight);
  return { score, items, missing, level: score >= 85 ? 'good' : score >= 60 ? 'fair' : 'poor' };
}

export const productInput = (p: Product): QualityInput => ({
  price: p.price, nameEn: p.name.en, descAr: p.desc.ar, descEn: p.desc.en, media: p.media, hasPhoto: !!productPhoto(p.id), category: p.category,
  cost: p.cost, seoTitle: p.seo.title, seoDesc: p.seo.desc, physical: p.type === 'physical', weight: p.weight, barcode: p.barcode,
});
export const draftInput = (d: EditDraft): QualityInput => ({
  price: parseMoney(d.price), nameEn: d.nameEn, descAr: d.descAr, descEn: d.descEn, media: d.media, hasPhoto: false, category: d.category,
  cost: d.cost.trim() ? parseMoney(d.cost) : null, seoTitle: d.seoTitle, seoDesc: d.seoDesc, physical: d.type === 'physical',
  weight: parseIntStrict(d.weight.trim() || 'x'), barcode: d.barcode,
});
export const productQuality = (p: Product, cats: Category[]) => quality(productInput(p), cats);
