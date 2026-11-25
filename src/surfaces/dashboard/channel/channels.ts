// Every sales channel in the blueprint, in one list, with an honest status: built in this demo (and its live state),
// not built yet, or waiting on an owner decision; plus what each one needs. Pure rules, no React.
// Phase D (2026-11-25): POS, wholesale and ads are built as simulated tools (dashboard/pos, /wholesale, /ads).
// Source: skill §08 "Sales Channels" (marketplace, wholesale, App Maker, TikTok/Snapchat catalogue sync),
// §03 IA ("POS when available"), ecosystem (Lak Ads, POS as a separate platform).
import type { L } from '../../../core/lang';
import type { StoreStatus } from '../../merchant/workspace';

export type ChannelId = 'online' | 'app' | 'market' | 'pos' | 'wholesale' | 'tiktok' | 'snapchat' | 'ads';
/** built = works in this demo (simulated where external); notBuilt = no screen or flow yet; decision = waiting on the owner. */
export type Build = 'built' | 'notBuilt';
export type LiveState = 'live' | 'paused' | 'blocked' | 'off' | 'setup';
export interface ChannelRow {
  id: ChannelId;
  name: L;
  what: L;
  build: Build;
  /** For built channels: the merchant's current state on it. */
  state?: LiveState;
  /** Open business question that blocks or shapes the channel (owner decision). */
  decision?: L;
  /** What is needed before it can work (for the merchant, or for LAK to build it). */
  needs: L[];
  /** Plan named by the blueprint, when it names one. */
  plan?: string;
  href?: { section: string; path?: string };
  /** Products shown on the channel, when known. */
  products?: number;
}

export interface ChannelFacts {
  status: StoreStatus;
  onlineProducts: number;
  app: { addon: string; published: boolean; inApp: number };
  market: { state: 'live' | 'paused' | 'blocked'; listed: number };
  /** Phase D (channels group): POS shifts open, approved wholesale buyers, connected ad platforms. Optional for older callers. */
  pos?: { openShifts: number; pins: number };
  wholesale?: { approved: number; listed: number };
  ads?: { connected: number; live: number };
}

export function channelRows(f: ChannelFacts): ChannelRow[] {
  const online: LiveState = !f.status.published ? 'off' : f.status.maintenance || !f.status.accepting ? 'paused' : 'live';
  const app: LiveState = f.app.addon !== 'active' ? 'off' : f.app.published ? 'live' : 'setup';
  return [
    { id: 'online', name: { ar: 'المتجر الإلكتروني', en: 'Online store' }, what: { ar: 'متجرك على رابطك ونطاقك', en: 'Your store at your link and domain' }, build: 'built', state: online, needs: [], href: { section: 'storefront' }, products: f.onlineProducts, plan: 'All' },
    { id: 'app', name: { ar: 'تطبيق متجرك', en: 'Your store app' }, what: { ar: 'تطبيق iOS وAndroid باسم متجرك', en: 'iOS and Android app with your brand' }, build: 'built', state: app,
      decision: { ar: 'سعر الإضافة وفوترتها لم يُعتمدا', en: 'Add-on price and billing not approved' }, needs: app === 'live' ? [] : [{ ar: 'حسابا مطوّر Apple وGoogle ونشر أول إصدار', en: 'Apple and Google developer accounts, then a first release' }], href: { section: 'appmaker' }, products: f.app.inApp, plan: 'Plus+' },
    { id: 'market', name: { ar: 'سوق «لك»', en: 'LAK marketplace' }, what: { ar: 'منتجاتك في سوق المتسوقين عبر المتاجر', en: 'Your products in the cross-store shopper marketplace' }, build: 'built', state: f.market.state,
      decision: { ar: 'المصدر يقول «إدراج تلقائي»، والمنفّذ «مراجعة قبل الظهور»؛ والعمولة غير معتمدة', en: 'Source says “auto-listed”, built as “review first”; commission not approved' },
      needs: f.market.state === 'blocked' ? [{ ar: 'أكمل شروط الأهلية', en: 'Complete the eligibility checks' }] : [], href: { section: 'channel' }, products: f.market.listed, plan: 'All' },
    { id: 'pos', name: { ar: 'نقاط البيع (POS)', en: 'Point of sale (POS)' }, what: { ar: 'البيع في المحل بنفس المخزون', en: 'Sell in-store from the same stock' }, build: 'built',
      state: !f.pos ? 'setup' : f.pos.openShifts ? 'live' : f.pos.pins ? 'paused' : 'setup',
      decision: { ar: 'أجهزة الدفع ورسوم العمليات الحضورية وسعر POS في الباقات غير معتمدة', en: 'Terminals, in-person fees and POS plan price not approved' },
      needs: [{ ar: 'ربط جهاز دفع حقيقي والعمل دون اتصال بعد قرار النطاق', en: 'A real card terminal and offline mode, after the scope decision' }], href: { section: 'pos' } },
    { id: 'wholesale', name: { ar: 'الجملة (B2B)', en: 'Wholesale (B2B)' }, what: { ar: 'مشترو منشآت بأسعار بالكمية وعروض أسعار وفاتورة ضريبية', en: 'Business buyers with quantity pricing, quotes and tax invoices' }, build: 'built',
      state: !f.wholesale ? 'setup' : f.wholesale.approved ? 'live' : 'setup',
      decision: { ar: 'سوق «لك» للجملة بين المتاجر وباقته (المصدر متناقض) وعمولته غير معتمدة', en: 'LAK cross-store wholesale marketplace, its plan (source conflicts) and commission not approved' },
      needs: [{ ar: 'استضافة نموذج طلب الحساب في المتجر', en: 'Host the buyer application form on the storefront' }], href: { section: 'wholesale' }, products: f.wholesale?.listed },
    { id: 'tiktok', name: { ar: 'كتالوج TikTok', en: 'TikTok catalogue' }, what: { ar: 'مزامنة المنتجات مع TikTok Shop', en: 'Sync products to TikTok Shop' }, build: 'notBuilt',
      needs: [{ ar: 'اعتماد شريك من TikTok وربط حساب بتفويض', en: 'TikTok partner approval and account authorisation' }] },
    { id: 'snapchat', name: { ar: 'كتالوج Snapchat', en: 'Snapchat catalogue' }, what: { ar: 'مزامنة المنتجات مع إعلانات Snapchat', en: 'Sync products to Snapchat ads' }, build: 'notBuilt',
      needs: [{ ar: 'اعتماد شريك من Snap وربط حساب بتفويض', en: 'Snap partner approval and account authorisation' }] },
    { id: 'ads', name: { ar: 'الإعلانات', en: 'Ads' }, what: { ar: 'تتبع وحملات Google وTikTok وSnapchat وMeta وX من مكان واحد', en: 'Tracking and Google, TikTok, Snapchat, Meta and X campaigns in one place' }, build: 'built',
      state: !f.ads ? 'setup' : f.ads.live ? 'live' : 'setup',
      decision: { ar: 'رسوم «لك» لإدارة الحملات ورصيد الإعلانات غير محددة', en: 'LAK campaign-management fees and ad credit not set' },
      needs: [{ ar: 'عقود المنصات وواجهاتها الرسمية (الربط والإطلاق الآن محاكاة)', en: 'Platform agreements and official APIs (connection and launch are simulated now)' }], href: { section: 'ads' } },
  ];
}

export type ChannelFilter = 'all' | 'built' | 'notBuilt' | 'decision';
export const filterChannels = (rows: ChannelRow[], f: ChannelFilter) =>
  rows.filter((r) => f === 'all' || (f === 'decision' ? !!r.decision : r.build === f));
export const channelCounts = (rows: ChannelRow[]) => ({ all: rows.length, built: rows.filter((r) => r.build === 'built').length, notBuilt: rows.filter((r) => r.build === 'notBuilt').length, decision: rows.filter((r) => r.decision).length });
