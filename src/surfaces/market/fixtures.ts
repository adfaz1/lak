/* Demo sellers and products. Every name, registration number and price is a test example. */
import type { ListingItem, Order, Product, Seller } from './domain';

const ALL = ['riyadh', 'jeddah', 'dammam', 'makkah'] as const;

export const SELLERS: Seller[] = [
  {
    id: 'nakhla', name: { ar: 'محمصة نخلة', en: 'Nakhla Roasters' }, legal: { ar: 'شركة نخلة للتحميص', en: 'Nakhla Roasting Co.' },
    cr: '1010-482113', vat: '310482113900003', city: 'riyadh', colour: '#5a3826', since: '2024',
    tagline: { ar: 'بن مختص يُحمّص أسبوعيًا في الرياض', en: 'Specialty coffee roasted weekly in Riyadh' },
    shipping: { same: 1500, other: 2900, freeOver: 20000, days: { same: [1, 2], other: [3, 5] }, ships: [...ALL], codFee: 1000 },
    returnsDays: 7,
  },
  {
    id: 'oud', name: { ar: 'دار الريحان للعطور', en: 'Dar Al Raihan Perfumes' }, legal: { ar: 'مؤسسة دار الريحان التجارية', en: 'Dar Al Raihan Trading Est.' },
    cr: '4030-219847', vat: '300219847600003', city: 'jeddah', colour: '#4b2e4f', since: '2023',
    tagline: { ar: 'عود ودهن عود وبخور من جدة', en: 'Oud, oils and incense from Jeddah' },
    shipping: { same: 1800, other: 3200, freeOver: 30000, days: { same: [1, 2], other: [2, 4] }, ships: [...ALL], codFee: null },
    returnsDays: 3,
  },
  {
    id: 'sadu', name: { ar: 'بيت السدو', en: 'Sadu House' }, legal: { ar: 'شركة بيت السدو للمفروشات', en: 'Sadu House Furnishings Co.' },
    cr: '2050-118320', vat: '310118320700003', city: 'dammam', colour: '#8c3b2a', since: '2022',
    tagline: { ar: 'مفروشات بنقوش السدو', en: 'Home textiles with Sadu weaving' },
    shipping: { same: 2000, other: 3500, freeOver: null, days: { same: [2, 3], other: [4, 6] }, ships: ['dammam', 'riyadh'], codFee: 1500 },
    returnsDays: 14,
  },
  {
    id: 'lamsa', name: { ar: 'لمسة للأطفال', en: 'Lamsa Kids' }, legal: { ar: 'مؤسسة لمسة الطفولة', en: 'Lamsa Childhood Est.' },
    cr: '1010-773204', vat: '300773204500003', city: 'riyadh', colour: '#2c6e6a', since: '2025',
    tagline: { ar: 'ملابس وألعاب قطنية للصغار', en: 'Cotton clothing and toys for little ones' },
    shipping: { same: 1200, other: 2500, freeOver: 15000, days: { same: [1, 2], other: [3, 5] }, ships: [...ALL], codFee: 800 },
    returnsDays: 14,
  },
  {
    id: 'raqmi', name: { ar: 'رقمي', en: 'Raqmi' }, legal: { ar: 'شركة رقمي للإلكترونيات', en: 'Raqmi Electronics Co.' },
    cr: '4030-650091', vat: '310650091200003', city: 'jeddah', colour: '#1f3a5f', since: '2024',
    tagline: { ar: 'ملحقات الجوال والصوت', en: 'Phone and audio accessories' },
    shipping: { same: 1500, other: 2500, freeOver: 25000, days: { same: [1, 1], other: [2, 3] }, ships: [...ALL], codFee: 1000 },
    returnsDays: 7,
  },
];

export const PRODUCTS: Product[] = [
  { id: 'p1', seller: 'nakhla', name: { ar: 'خلطة الإسبريسو 250غ', en: 'House espresso blend 250g' }, brand: 'Nakhla', cat: 'coffee', price: 5800, stock: 40, art: 'bag', tone: '#6f4a31',
    desc: { ar: 'تحميص متوسط داكن بنكهة الشوكولاتة والبندق. مناسب للحليب والإسبريسو.', en: 'Medium-dark roast with chocolate and hazelnut notes. Great with milk and as espresso.' } },
  { id: 'p2', seller: 'nakhla', name: { ar: 'كولومبيا هويلا 250غ', en: 'Colombia Huila 250g' }, brand: 'Nakhla', cat: 'coffee', price: 6400, stock: 18, art: 'bag', tone: '#a8714a',
    desc: { ar: 'نكهة الكراميل والتفاح الأحمر، تحميص متوسط للتقطير.', en: 'Caramel and red apple notes; medium roast for filter.' } },
  { id: 'p3', seller: 'nakhla', name: { ar: 'قمع تقطير V60 سيراميك', en: 'V60 ceramic dripper' }, brand: 'Hario', cat: 'coffee', price: 8900, stock: 6, art: 'dripper', tone: '#e9e2d8',
    desc: { ar: 'قمع سيراميك مقاس 02 لتحضير القهوة المقطرة.', en: 'Size 02 ceramic dripper for pour-over coffee.' } },
  { id: 'p4', seller: 'oud', name: { ar: 'دهن عود كمبودي 3مل', en: 'Cambodian oud oil 3ml' }, brand: 'Dar Al Raihan', cat: 'perfume', price: 45000, stock: 5, art: 'bottle', tone: '#4b2e4f',
    desc: { ar: 'دهن عود مركز بعبوة زجاجية مع عود تطبيق.', en: 'Concentrated oud oil in a glass vial with applicator.' } },
  { id: 'p5', seller: 'oud', name: { ar: 'بخور معمول ملكي 50غ', en: 'Royal mamool incense 50g' }, brand: 'Dar Al Raihan', cat: 'perfume', price: 12000, stock: 22, art: 'candle', tone: '#8a6a3a',
    desc: { ar: 'معمول بالعود والورد الطائفي.', en: 'Mamool blended with oud and Taif rose.' } },
  { id: 'p6', seller: 'oud', name: { ar: 'عطر ورد الطائف 50مل', en: 'Taif rose eau de parfum 50ml' }, brand: 'Raihan Atelier', cat: 'perfume', price: 26500, stock: 0, art: 'bottle', tone: '#b4566e',
    desc: { ar: 'عطر بخلاصة ورد الطائف والمسك.', en: 'Taif rose absolute with musk.' } },
  { id: 'p7', seller: 'sadu', name: { ar: 'وسادة سدو حمراء 45سم', en: 'Red Sadu cushion 45cm' }, brand: 'Sadu House', cat: 'home', price: 14900, stock: 12, art: 'cushion', tone: '#8c3b2a',
    desc: { ar: 'غطاء منسوج بنقش السدو مع حشوة.', en: 'Woven Sadu-pattern cover, insert included.' } },
  { id: 'p8', seller: 'sadu', name: { ar: 'شمعة العنبر', en: 'Amber candle' }, brand: 'Sadu House', cat: 'home', price: 7500, stock: 30, art: 'candle', tone: '#c08a3e',
    desc: { ar: 'شمعة صويا برائحة العنبر، تشتعل 40 ساعة تقريبًا.', en: 'Soy candle with amber scent, about 40 hours burn.' } },
  { id: 'p9', seller: 'lamsa', name: { ar: 'طقم قطني للرضع', en: 'Cotton baby set' }, brand: 'Lamsa', cat: 'kids', price: 9900, stock: 25, art: 'shirt', tone: '#9cc5c1',
    desc: { ar: 'قطعتان من القطن العضوي، مقاسات 0–12 شهرًا.', en: 'Two-piece organic cotton set, sizes 0–12 months.' } },
  { id: 'p10', seller: 'lamsa', name: { ar: 'جمل محشو', en: 'Plush camel' }, brand: 'Lamsa', cat: 'kids', price: 6500, stock: 14, art: 'toy', tone: '#d6b48a',
    desc: { ar: 'لعبة محشوة ناعمة بطول 30 سم.', en: 'Soft plush toy, 30 cm tall.' } },
  { id: 'p11', seller: 'raqmi', name: { ar: 'سماعات لاسلكية', en: 'Wireless earbuds' }, brand: 'Sawt', cat: 'tech', price: 19900, stock: 9, art: 'headphones', tone: '#1f3a5f',
    desc: { ar: 'سماعات بلوتوث مع علبة شحن، ضمان سنة من البائع.', en: 'Bluetooth earbuds with charging case; one-year seller warranty.' } },
  { id: 'p12', seller: 'raqmi', name: { ar: 'كابل USB-C مضفر 2م', en: 'Braided USB-C cable 2m' }, brand: 'Sawt', cat: 'tech', price: 4900, stock: 60, art: 'cable', tone: '#3e6c9e',
    desc: { ar: 'كابل شحن سريع بطول مترين.', en: 'Two-metre fast-charging cable.' } },
  { id: 'p13', seller: 'sadu', name: { ar: 'دلّة عربية مع فناجين', en: 'Arabic dallah with cups' }, brand: 'Sadu House', cat: 'home', price: 21000, stock: 7, art: 'gift', tone: '#b08a4a',
    desc: { ar: 'دلّة ضيافة عربية مع فناجين صغيرة.', en: 'Arabic serving dallah with small cups.' } },
  { id: 'p14', seller: 'oud', name: { ar: 'مبخرة نحاسية', en: 'Brass incense burner' }, brand: 'Dar Al Raihan', cat: 'perfume', price: 11500, stock: 11, art: 'candle', tone: '#a77b3c',
    desc: { ar: 'مبخرة من النحاس للبخور والعود.', en: 'Brass burner for incense and oud chips.' } },
];

/**
 * Licensed photos (src/surfaces/dashboard/model/media.ts) that show exactly this product's kind of item.
 * Every other product renders the neutral placeholder; no photo is reused for a different product.
 */
export const PHOTO: Record<string, string> = { p6: 'p3', p13: 'p6', p14: 'p9' };

export function initialOrders(): Order[] {
  return [
    {
      ref: 'MK-20418', seller: 'lamsa', city: 'riyadh', createdAt: '2026-11-15T12:20:00Z', deliveredAt: '2026-11-17T15:10:00Z',
      lines: [{ productId: 'p9', name: PRODUCTS[8].name, price: 9900, qty: 1 }],
      subtotal: 9900, shipping: 1200, codFee: 0, total: 11100, method: 'card', pay: 'paid', ful: 'fulfilled', ship: 'delivered', ret: 'none',
    },
    {
      ref: 'MK-20377', seller: 'raqmi', city: 'riyadh', createdAt: '2026-10-28T09:02:00Z', deliveredAt: '2026-10-30T13:45:00Z',
      lines: [{ productId: 'p12', name: PRODUCTS[11].name, price: 4900, qty: 2 }],
      subtotal: 9800, shipping: 2500, codFee: 1000, total: 13300, method: 'cod', pay: 'collected', ful: 'fulfilled', ship: 'delivered', ret: 'none',
    },
  ];
}

export type NoteKind = 'orderPlaced' | 'shipped' | 'delivered' | 'returnRequested' | 'restock';
export interface Note { id: string; at: string; kind: NoteKind; ref?: string; productId?: string; read: boolean }

export function initialNotes(): Note[] {
  return [
    { id: 'n2', at: '2026-11-17T15:10:00Z', kind: 'delivered', ref: 'MK-20418', read: false },
    { id: 'n1', at: '2026-11-16T08:00:00Z', kind: 'shipped', ref: 'MK-20418', read: true },
    { id: 'n0', at: '2026-10-30T13:45:00Z', kind: 'delivered', ref: 'MK-20377', read: true },
  ];
}

/** The merchant-side listing view belongs to Nakhla Roasters (the same demo merchant as App Maker). */
export const MY_STORE = 'nakhla';

export function initialListing(): ListingItem[] {
  return [
    { id: 'p1', name: PRODUCTS[0].name, cat: 'coffee', stock: 40, images: 4, descLength: 82, price: 5800, review: 'approved' },
    { id: 'p2', name: PRODUCTS[1].name, cat: 'coffee', stock: 18, images: 3, descLength: 64, price: 6400, review: 'approved' },
    { id: 'p3', name: PRODUCTS[2].name, cat: 'coffee', stock: 6, images: 2, descLength: 48, price: 8900, review: 'approved' },
    { id: 'm4', name: { ar: 'إثيوبيا يرغاتشيفي 250غ', en: 'Ethiopia Yirgacheffe 250g' }, cat: 'coffee', stock: 20, images: 3, descLength: 70, price: 6900, review: 'pending' },
    { id: 'm5', name: { ar: 'السعودي الخولاني 250غ', en: 'Saudi Khawlani 250g' }, cat: 'coffee', stock: 0, images: 2, descLength: 55, price: 9500, review: 'approved' },
    { id: 'm6', name: { ar: 'قهوة باردة 1 لتر', en: 'Cold brew 1L' }, cat: 'coffee', stock: 12, images: 0, descLength: 12, price: 3900, review: 'none' },
    { id: 'm7', name: { ar: 'ميزان قهوة «الأفضل في المملكة»', en: 'Coffee scale “best in KSA”' }, cat: 'coffee', stock: 8, images: 2, descLength: 40, price: 15900, review: 'rejected', rejectReason: 'claim' },
    { id: 'm8', name: { ar: 'بطاقة هدية رقمية', en: 'Digital gift card' }, cat: 'giftcards', stock: 999, images: 1, descLength: 40, price: 10000, review: 'none' },
    { id: 'm9', name: { ar: 'فحم معسل', en: 'Hookah charcoal' }, cat: 'tobacco', stock: 30, images: 1, descLength: 35, price: 2500, review: 'none' },
    { id: 'm10', name: { ar: 'مطحنة يدوية', en: 'Hand grinder' }, cat: 'coffee', stock: 5, images: 3, descLength: 60, price: 24900, review: 'none' },
  ];
}
