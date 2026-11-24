/* Demo merchant for App Maker. Every name, product and price here is a test example. */
import type { L } from '../../core/lang';
import type { Accounts, AppConfig, Listing, Release } from './domain';

export const MERCHANT: { name: L; domain: string } = {
  name: { ar: 'محمصة نخلة', en: 'Nakhla Roasters' },
  domain: 'nakhla.lak.sa',
};

export interface CatalogItem { id: string; name: L; price: number; tone: string; cat: L; desc: L }

/** The merchant's catalogue as the preview shows it (synced from the store in the real product). */
export const CATALOG: CatalogItem[] = [
  { id: 'c1', name: { ar: 'إثيوبيا يرغاتشيفي', en: 'Ethiopia Yirgacheffe' }, price: 6900, tone: '#c9a27a', cat: { ar: 'تقطير', en: 'Filter' },
    desc: { ar: 'تحميص فاتح بنكهة الياسمين والليمون. 250 غرامًا.', en: 'Light roast with jasmine and lemon notes. 250 g.' } },
  { id: 'c2', name: { ar: 'خلطة الإسبريسو', en: 'House espresso blend' }, price: 5800, tone: '#6f4a31', cat: { ar: 'إسبريسو', en: 'Espresso' },
    desc: { ar: 'تحميص متوسط داكن للحليب والإسبريسو. 250 غرامًا.', en: 'Medium-dark roast for milk drinks and espresso. 250 g.' } },
  { id: 'c3', name: { ar: 'كولومبيا هويلا', en: 'Colombia Huila' }, price: 6400, tone: '#a8714a', cat: { ar: 'تقطير', en: 'Filter' },
    desc: { ar: 'نكهة الكراميل والتفاح الأحمر. 250 غرامًا.', en: 'Caramel and red apple notes. 250 g.' } },
  { id: 'c4', name: { ar: 'قمع تقطير V60', en: 'V60 dripper' }, price: 8900, tone: '#d8d2c8', cat: { ar: 'أدوات', en: 'Tools' },
    desc: { ar: 'قمع سيراميك مقاس 02.', en: 'Ceramic dripper, size 02.' } },
  { id: 'c5', name: { ar: 'صندوق الهدايا', en: 'Gift box' }, price: 19900, tone: '#7c8b6f', cat: { ar: 'هدايا', en: 'Gifts' },
    desc: { ar: 'ثلاثة أنواع من البن مع بطاقة إهداء.', en: 'Three coffees with a gift card.' } },
  { id: 'c6', name: { ar: 'السعودي الخولاني', en: 'Saudi Khawlani' }, price: 9500, tone: '#8a5a3c', cat: { ar: 'إسبريسو', en: 'Espresso' },
    desc: { ar: 'بن جازان بتحميص متوسط. 250 غرامًا.', en: 'Jazan-grown coffee, medium roast. 250 g.' } },
];

export const CATEGORIES: L[] = [
  { ar: 'إسبريسو', en: 'Espresso' }, { ar: 'تقطير', en: 'Filter' }, { ar: 'أدوات', en: 'Tools' }, { ar: 'هدايا', en: 'Gifts' },
];

/** Generated icon tiles. `fg`/`bg` are merchant colours; `mark` picks the glyph drawn by the tile renderer. */
export interface IconTile { id: string; bg: string; fg: string; mark: 'letter' | 'bean' | 'palm' | 'cup' | 'ring' | 'letterOutline' }
export const ICONS: IconTile[] = [
  { id: 'i1', bg: '#5a3826', fg: '#f3e6d4', mark: 'letter' },
  { id: 'i2', bg: '#f3e6d4', fg: '#5a3826', mark: 'bean' },
  { id: 'i3', bg: '#2f4a3a', fg: '#f3e6d4', mark: 'palm' },
  { id: 'i4', bg: '#c68b59', fg: '#fffaf3', mark: 'cup' },
  { id: 'i5', bg: '#1f1a17', fg: '#d9a66c', mark: 'ring' },
  { id: 'i6', bg: '#fffaf3', fg: '#8a5a3c', mark: 'letterOutline' },
];

export const SPLASHES = ['#5a3826', '#f3e6d4', '#2f4a3a', '#1f1a17', '#c68b59'];
export const ACCENTS = ['#8a5a3c', '#2f4a3a', '#b5562b', '#1f1a17'];

const liveConfig: AppConfig = {
  name: { ar: 'نخلة', en: 'Nakhla' },
  iconId: 'i1',
  splash: '#5a3826',
  accent: '#8a5a3c',
  productLayout: 'grid',
  sections: [
    { id: 's1', type: 'hero', title: { ar: 'محصول الموسم وصل', en: 'This season’s harvest is in' } },
    { id: 's2', type: 'categories', title: { ar: 'تسوق حسب النوع', en: 'Shop by type' } },
    { id: 's3', type: 'featured', title: { ar: 'مختارات المحمصة', en: 'Roaster’s picks' } },
  ],
  features: { push: true, wishlist: true, loyalty: false, reviews: true, accountDeletion: false },
};

/** The draft differs from what installed apps show by one new section: a config-only change. */
export function initialDraft(): AppConfig {
  return {
    ...liveConfig,
    sections: [
      ...liveConfig.sections,
      { id: 's4', type: 'banner', title: { ar: 'شحن مجاني فوق 200 ر.س', en: 'Free shipping over SAR 200' } },
    ],
  };
}

export function initialListing(): Listing {
  return {
    subtitle: { ar: 'بن مختص محمص في الرياض', en: 'Specialty coffee from Riyadh' },
    description: {
      ar: 'تطبيق محمصة نخلة: اطلب البن المختص والأدوات، وتابع طلبك، واحفظ مفضلتك. التحميص أسبوعي والتوصيل داخل المملكة.',
      en: 'The Nakhla Roasters app: order specialty coffee and brewing tools, track your order and keep a wishlist. Roasted weekly, delivered across Saudi Arabia.',
    },
    keywords: 'coffee, specialty, قهوة, بن, V60',
    category: 'shopping',
    supportUrl: 'https://nakhla.lak.sa/help',
    privacyUrl: 'https://nakhla.lak.sa/privacy',
    reviewNotes: '',
    screenshots: 3,
  };
}

export const initialAccounts = (): Accounts => ({ ios: 'connected', android: 'connected' });

/** Build history. Release 1.1.0 is the QA21 case: the iOS build succeeded and uploaded, then Apple rejected it. */
export function initialReleases(): Release[] {
  const v100: AppConfig = liveConfig;
  return [
    {
      id: 'r1', kind: 'binary', version: '1.0.0', rev: 0, createdAt: '2026-09-02T09:10:00Z', lak: 'approved',
      platforms: { ios: { state: 'published', build: 1 }, android: { state: 'published', build: 1 } },
      config: { ...v100, features: { ...v100.features, reviews: false } },
      log: [
        { at: '2026-09-02T09:10:00Z', kind: 'submitted' },
        { at: '2026-09-06T11:00:00Z', kind: 'lakApproved' },
        { at: '2026-09-06T11:24:00Z', kind: 'buildOk', platform: 'ios', build: 1 },
        { at: '2026-09-06T11:19:00Z', kind: 'buildOk', platform: 'android', build: 1 },
        { at: '2026-09-06T11:40:00Z', kind: 'uploadOk', platform: 'ios', build: 1 },
        { at: '2026-09-06T11:31:00Z', kind: 'uploadOk', platform: 'android', build: 1 },
        { at: '2026-09-08T16:05:00Z', kind: 'storeApproved', platform: 'android', build: 1 },
        { at: '2026-09-09T08:12:00Z', kind: 'storeApproved', platform: 'ios', build: 1 },
      ],
    },
    {
      id: 'r2', kind: 'config', version: '1.0.0', rev: 1, createdAt: '2026-10-01T07:30:00Z', lak: 'none',
      platforms: { ios: { state: 'not_included', build: 0 }, android: { state: 'not_included', build: 0 } },
      config: { ...v100, features: { ...v100.features, reviews: false }, productLayout: 'grid' },
      log: [{ at: '2026-10-01T07:30:00Z', kind: 'configApplied' }],
    },
    {
      id: 'r3', kind: 'binary', version: '1.1.0', rev: 0, createdAt: '2026-11-10T10:00:00Z', lak: 'approved',
      platforms: { ios: { state: 'rejected', build: 3, issue: 'APPLE_5_1_1' }, android: { state: 'published', build: 2 } },
      config: liveConfig,
      log: [
        { at: '2026-11-10T10:00:00Z', kind: 'submitted' },
        { at: '2026-11-13T09:00:00Z', kind: 'lakApproved' },
        { at: '2026-11-13T09:21:00Z', kind: 'buildFail', platform: 'ios', build: 2, issue: 'IOS_CERT_EXPIRED' },
        { at: '2026-11-13T09:18:00Z', kind: 'buildOk', platform: 'android', build: 2 },
        { at: '2026-11-13T09:30:00Z', kind: 'uploadOk', platform: 'android', build: 2 },
        { at: '2026-11-14T08:02:00Z', kind: 'rebuild', platform: 'ios', build: 3 },
        { at: '2026-11-14T08:26:00Z', kind: 'buildOk', platform: 'ios', build: 3 },
        { at: '2026-11-14T08:41:00Z', kind: 'uploadOk', platform: 'ios', build: 3 },
        { at: '2026-11-15T13:10:00Z', kind: 'storeApproved', platform: 'android', build: 2 },
        { at: '2026-11-17T19:44:00Z', kind: 'storeRejected', platform: 'ios', build: 3, issue: 'APPLE_5_1_1' },
      ],
    },
  ];
}
