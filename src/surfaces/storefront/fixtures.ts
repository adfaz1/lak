/* Rule fixtures for the storefront's pure functions (domain.test.ts). The live store does NOT use them: it reads the
   merchant catalogue, coupons and settings through bridge.ts. */
import type { L } from '../../core/lang';
import { DAY, type Coupon, type Product, type Variant } from './domain';

export const CATEGORIES: { id: string; name: L; kind: string; tone: string }[] = [
  { id: 'abayas', name: { ar: 'عبايات', en: 'Abayas' }, kind: 'abaya', tone: 'black' },
  { id: 'dresses', name: { ar: 'فساتين', en: 'Dresses' }, kind: 'dress', tone: 'rose' },
  { id: 'perfume', name: { ar: 'عطور', en: 'Fragrance' }, kind: 'perfume', tone: 'amber' },
  { id: 'scarves', name: { ar: 'أوشحة وشيلات', en: 'Scarves & shaylas' }, kind: 'scarf', tone: 'sand' },
  { id: 'bags', name: { ar: 'حقائب', en: 'Bags' }, kind: 'bag', tone: 'camel' },
];

function build(
  id: string, cat: string, kind: string, name: L, blurb: L, details: L[], price: number,
  colors: string[], sizes: string[], rank: number, added: number,
  opts: { compareAt?: number; stock?: Record<string, number>; prices?: Record<string, number>; base?: number } = {},
): Product {
  const cs: (string | undefined)[] = colors.length ? colors : [undefined];
  const ss: (string | undefined)[] = sizes.length ? sizes : [undefined];
  const variants: Variant[] = [];
  for (const c of cs) for (const s of ss) {
    const vid = [c, s].filter(Boolean).join('-') || 'one';
    variants.push({ id: `${id}~${vid}`, color: c, size: s, price: opts.prices?.[s ?? ''] ?? price, stock: opts.stock?.[vid] ?? opts.base ?? 6 });
  }
  const catName = CATEGORIES.find((c) => c.id === cat)!.name;
  return { id, cat, catName, kind, name, blurb, details, compareAt: opts.compareAt, rank, added, colors, sizes, variants, returnable: cat !== 'perfume' };
}

const D = {
  linen: { ar: 'كتان مغسول ناعم الملمس', en: 'Soft washed linen' },
  care: { ar: 'غسيل يدوي بماء بارد، كيّ على حرارة منخفضة', en: 'Hand wash cold, low iron' },
  made: { ar: 'خياطة في ورشة الدار بالرياض', en: 'Sewn in the house workshop in Riyadh' },
  edp: { ar: 'أو دو بارفان، تركيز 15–18٪', en: 'Eau de parfum, 15–18% concentration' },
  noReturn: { ar: 'العطور المفتوحة لا تُسترجع لأسباب صحية', en: 'Opened fragrance cannot be returned for hygiene reasons' },
};

export function catalogue(): Product[] {
  return [
    build('linen-abaya', 'abayas', 'abaya', { ar: 'عباية كتان يومية', en: 'Everyday linen abaya' },
      { ar: 'قصة مستقيمة خفيفة لأيام الخريف، بجيوب جانبية مخفية.', en: 'A light straight cut for autumn days, with hidden side pockets.' },
      [D.linen, D.care, D.made], 42_900, ['black', 'sand', 'olive'], ['52', '54', '56', '58'], 1, 9,
      { stock: { 'olive-58': 0, 'sand-52': 2, 'black-56': 3 } }),
    build('crepe-abaya', 'abayas', 'abaya', { ar: 'عباية كريب بأكمام واسعة', en: 'Wide-sleeve crepe abaya' },
      { ar: 'كريب ياباني ينسدل بثقل جميل، مع حافة أكمام مزدوجة.', en: 'Japanese crepe with a heavy drape and double-layer cuffs.' },
      [{ ar: 'كريب ياباني 100٪ بوليستر', en: '100% polyester Japanese crepe' }, D.care, D.made], 58_900, ['black', 'navy'], ['54', '56', '58'], 2, 6,
      { compareAt: 69_900, stock: { 'navy-54': 0 } }),
    build('embroidered-abaya', 'abayas', 'abaya', { ar: 'عباية مفتوحة بتطريز يدوي', en: 'Hand-embroidered open abaya' },
      { ar: 'تطريز يدوي على الأطراف بخيط حريري بلون الليل.', en: 'Hand embroidery along the edges in night-toned silk thread.' },
      [{ ar: 'تطريز يدوي يستغرق ثلاثة أيام لكل قطعة', en: 'Each piece takes three days to embroider' }, D.care, D.made], 74_900, ['black'], ['52', '54', '56', '58'], 3, 2,
      { base: 0 }),
    build('satin-dress', 'dresses', 'dress', { ar: 'فستان ماكسي ساتان', en: 'Satin maxi dress' },
      { ar: 'ساتان مطفي بطول كامل وأكمام طويلة وحزام قابل للفك.', en: 'Matte satin, full length, long sleeves and a removable belt.' },
      [{ ar: 'ساتان مطفي مع بطانة قطنية', en: 'Matte satin with cotton lining' }, D.care], 36_900, ['rose', 'olive', 'black'], ['XS', 'S', 'M', 'L', 'XL'], 4, 8,
      { stock: { 'rose-XS': 0, 'rose-M': 1, 'black-XL': 0 } }),
    build('shirt-dress', 'dresses', 'dress', { ar: 'فستان قميص قطني', en: 'Cotton shirt dress' },
      { ar: 'قطن بوبلين مقرمش بأزرار أمامية كاملة.', en: 'Crisp cotton poplin with a full button front.' },
      [{ ar: 'قطن 100٪', en: '100% cotton' }, D.care], 27_900, ['ivory', 'navy'], ['S', 'M', 'L'], 7, 10),
    build('night-oud', 'perfume', 'perfume', { ar: 'عطر عود الليل', en: 'Night Oud' },
      { ar: 'عود دافئ مع زعفران وجلد ناعم. يدوم على القماش.', en: 'Warm oud with saffron and soft leather. Lasts on fabric.' },
      [D.edp, { ar: 'المكونات: عود، زعفران، جلد، عنبر', en: 'Notes: oud, saffron, leather, amber' }, D.noReturn], 39_500, [], ['50ml', '100ml'], 5, 7,
      { prices: { '50ml': 39_500, '100ml': 59_500 }, stock: { '50ml': 7, '100ml': 3 } }),
    build('white-musk', 'perfume', 'perfume', { ar: 'مسك أبيض', en: 'White musk' },
      { ar: 'مسك نظيف ناعم للاستخدام اليومي.', en: 'A clean, soft musk for every day.' },
      [D.edp, { ar: 'المكونات: مسك، زهر القطن، خشب الصندل', en: 'Notes: musk, cotton flower, sandalwood' }, D.noReturn], 24_500, [], ['50ml', '100ml'], 6, 5,
      { prices: { '50ml': 24_500, '100ml': 36_500 }, stock: { '50ml': 12, '100ml': 0 } }),
    build('taif-rose', 'perfume', 'perfume', { ar: 'ورد الطائف', en: 'Taif rose' },
      { ar: 'ورد طائفي مقطّر مع لمسة من الهيل.', en: 'Distilled Taif rose with a touch of cardamom.' },
      [D.edp, { ar: 'المكونات: ورد طائفي، هيل، مسك', en: 'Notes: Taif rose, cardamom, musk' }, D.noReturn], 45_500, [], ['50ml'], 8, 4),
    build('silk-scarf', 'scarves', 'scarf', { ar: 'وشاح حرير مطبوع', en: 'Printed silk scarf' },
      { ar: 'حرير توِل بطباعة هندسية مستوحاة من النوافذ النجدية.', en: 'Silk twill printed with a geometric motif from Najdi windows.' },
      [{ ar: 'حرير 100٪، 90×90 سم', en: '100% silk, 90×90 cm' }, D.care], 18_900, ['sand', 'rose', 'navy'], [], 9, 3,
      { stock: { 'rose': 0 } }),
    build('crepe-shayla', 'scarves', 'scarf', { ar: 'شيلة كريب', en: 'Crepe shayla' },
      { ar: 'شيلة كريب لا تنزلق، بحواف مخيطة يدويًا.', en: 'A non-slip crepe shayla with hand-finished edges.' },
      [{ ar: 'كريب خفيف، 70×180 سم', en: 'Light crepe, 70×180 cm' }, D.care], 9_900, ['black', 'ivory', 'camel', 'olive'], [], 10, 11),
    build('leather-tote', 'bags', 'bag', { ar: 'حقيبة جلد يدوية', en: 'Leather tote' },
      { ar: 'جلد بقري مدبوغ نباتيًا يتسع لجهاز محمول 13 بوصة.', en: 'Vegetable-tanned leather that fits a 13-inch laptop.' },
      [{ ar: 'جلد بقري طبيعي', en: 'Full-grain cowhide' }, { ar: 'الأبعاد: 38×30×12 سم', en: 'Size: 38×30×12 cm' }], 64_900, ['camel', 'black'], [], 11, 1,
      { stock: { camel: 1, black: 4 } }),
    build('evening-clutch', 'bags', 'bag', { ar: 'حقيبة سهرة', en: 'Evening clutch' },
      { ar: 'حقيبة صغيرة بإغلاق مغناطيسي وسلسلة قابلة للإزالة.', en: 'A small clutch with a magnetic clasp and removable chain.' },
      [{ ar: 'ساتان على هيكل صلب', en: 'Satin on a rigid frame' }], 32_900, ['black', 'ivory'], [], 12, 12,
      { compareAt: 38_900 }),
  ];
}


export function coupons(now: number): Coupon[] {
  return [
    { code: 'WELCOME10', kind: 'percent', value: 10, minSubtotal: 20_000, expires: now + 30 * DAY, limit: 500, used: 41 },
    { code: 'AUTUMN15', kind: 'percent', value: 15, expires: now - 5 * DAY, used: 310 },
    { code: 'OUD50', kind: 'fixed', value: 5_000, cat: 'perfume', used: 7 },
    { code: 'VIP100', kind: 'fixed', value: 10_000, limit: 200, used: 200 },
  ];
}

