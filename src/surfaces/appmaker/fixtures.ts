/* Demo merchant for App Maker: the same demo store as the merchant dashboard (fashion and home goods).
   Every name and text here is a test example. Product data is not kept here: the dashboard preview reads
   the store catalogue (merchant/catalog.ts) so the app shows the store's own products and licensed photos. */
import type { Accounts, AppConfig, Listing, Release } from './domain';

/** Generated icon tiles. `fg`/`bg` are merchant colours; `mark` picks the glyph drawn by the tile renderer. */
export interface IconTile { id: string; bg: string; fg: string; mark: 'letter' | 'letterOutline' | 'ring' | 'arch' | 'stripe' | 'dot' }
export const ICONS: IconTile[] = [
  { id: 'i1', bg: '#1e1b18', fg: '#f6efe4', mark: 'letter' },
  { id: 'i2', bg: '#f6efe4', fg: '#84603d', mark: 'arch' },
  { id: 'i3', bg: '#84603d', fg: '#fffdf9', mark: 'letterOutline' },
  { id: 'i4', bg: '#2f4a3a', fg: '#f6efe4', mark: 'stripe' },
  { id: 'i5', bg: '#1e1b18', fg: '#d9b98c', mark: 'ring' },
  { id: 'i6', bg: '#fffdf9', fg: '#1e1b18', mark: 'dot' },
];

/** Colour presets taken from the store theme (storefront palette), not from LAK's brand. */
export const SPLASHES = ['#1e1b18', '#f6efe4', '#84603d', '#2f4a3a', '#fffdf9'];
export const ACCENTS = ['#84603d', '#1e1b18', '#2f4a3a', '#9a2f1d', '#3f5a8a'];

const liveConfig: AppConfig = {
  name: { ar: 'دار نُوى', en: 'Dar Nuwa' },
  iconId: 'i1',
  splash: '#1e1b18',
  accent: '#84603d',
  productLayout: 'grid',
  sections: [
    { id: 's1', type: 'hero', title: { ar: 'تشكيلة الشتاء وصلت', en: 'The winter edit is here' } },
    { id: 's2', type: 'categories', title: { ar: 'تسوّق حسب الفئة', en: 'Shop by category' } },
    { id: 's3', type: 'featured', title: { ar: 'مختاراتنا', en: 'Our picks' } },
  ],
  features: { push: true, wishlist: true, loyalty: false, reviews: true, accountDeletion: false },
};

/** The draft differs from what installed apps show by one new section: a config-only change. */
export function initialDraft(): AppConfig {
  return {
    ...liveConfig,
    sections: [
      ...liveConfig.sections,
      { id: 's4', type: 'banner', title: { ar: 'عرض نهاية الأسبوع', en: 'Weekend offer' } },
    ],
  };
}

export function initialListing(): Listing {
  return {
    subtitle: { ar: 'عبايات وعطور ومستلزمات المنزل', en: 'Abayas, fragrance and home' },
    description: {
      ar: 'تطبيق دار نُوى: تسوّق العبايات والشالات والعطور ومستلزمات المنزل، واحفظ مفضلتك، وتابع طلباتك من مكان واحد.',
      en: 'The Dar Nuwa app: shop abayas, stoles, fragrance and home goods, keep a wishlist and follow your orders in one place.',
    },
    keywords: 'abaya, fragrance, عباية, عطور, شال',
    category: 'shopping',
    supportUrl: 'https://dar-nuwa.lak.sa/help',
    privacyUrl: 'https://dar-nuwa.lak.sa/privacy',
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
