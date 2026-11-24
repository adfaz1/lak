// Every sales channel in the blueprint, in one list, with an honest status: built in this demo (and its live state),
// not built yet, or waiting on an owner decision; plus what each one needs. Pure rules, no React.
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
    { id: 'pos', name: { ar: 'نقاط البيع (POS)', en: 'Point of sale (POS)' }, what: { ar: 'البيع في المحل بنفس المخزون', en: 'Sell in-store from the same stock' }, build: 'notBuilt',
      decision: { ar: 'المخطط يذكره كمنصة منفصلة؛ النطاق والأجهزة غير محددة', en: 'Listed as a separate platform; scope and hardware not defined' },
      needs: [{ ar: 'قرار نطاق: أجهزة، تزامن المخزون دون اتصال، الدفع الحضوري', en: 'Scope decision: hardware, offline stock sync, in-person payments' }] },
    { id: 'wholesale', name: { ar: '«لك» للجملة (B2B)', en: 'LAK Wholesale (B2B)' }, what: { ar: 'كتالوج بأسعار الجملة وطلبات بالكميات', en: 'Wholesale-price catalogue and bulk orders' }, build: 'notBuilt',
      decision: { ar: 'الباقة متناقضة في المصدر (كل الباقات / Plus+)', en: 'Plan conflicts in the source (all plans / Plus+)' },
      needs: [{ ar: 'قاعدة باقة رسمية، ثم شرائح الأسعار وحد الطلب والفواتير B2B', en: 'An official plan rule, then price tiers, minimums and B2B invoices' }] },
    { id: 'tiktok', name: { ar: 'كتالوج TikTok', en: 'TikTok catalogue' }, what: { ar: 'مزامنة المنتجات مع TikTok Shop', en: 'Sync products to TikTok Shop' }, build: 'notBuilt',
      needs: [{ ar: 'اعتماد شريك من TikTok وربط حساب بتفويض', en: 'TikTok partner approval and account authorisation' }] },
    { id: 'snapchat', name: { ar: 'كتالوج Snapchat', en: 'Snapchat catalogue' }, what: { ar: 'مزامنة المنتجات مع إعلانات Snapchat', en: 'Sync products to Snapchat ads' }, build: 'notBuilt',
      needs: [{ ar: 'اعتماد شريك من Snap وربط حساب بتفويض', en: 'Snap partner approval and account authorisation' }] },
    { id: 'ads', name: { ar: 'إعلانات «لك»', en: 'LAK Ads' }, what: { ar: 'حملات Google وTikTok وSnapchat وMeta وX من مكان واحد', en: 'Google, TikTok, Snapchat, Meta and X campaigns in one place' }, build: 'notBuilt',
      decision: { ar: 'رسوم «لك» منفصلة عن إنفاق المنصات لم تُحدد', en: 'LAK fees, separate from platform spend, not set' },
      needs: [{ ar: 'عقود المنصات وفصل الميزانية عن الرسوم', en: 'Platform agreements and budget separated from fees' }] },
  ];
}

export type ChannelFilter = 'all' | 'built' | 'notBuilt' | 'decision';
export const filterChannels = (rows: ChannelRow[], f: ChannelFilter) =>
  rows.filter((r) => f === 'all' || (f === 'decision' ? !!r.decision : r.build === f));
export const channelCounts = (rows: ChannelRow[]) => ({ all: rows.length, built: rows.filter((r) => r.build === 'built').length, notBuilt: rows.filter((r) => r.build === 'notBuilt').length, decision: rows.filter((r) => r.decision).length });
