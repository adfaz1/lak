// LAK's own free apps (built in, no third-party developer). One registry for the catalogue, install/uninstall,
// permissions and what each app changes in the store. Each app's settings screen lives in its own file and is
// wired in `screens.tsx`. Install state is session data (simulated); nothing reaches an external service.
import { createStore } from '../../../../core/store';
import type { L } from '../../../merchant/domain';

export type FreeAppId =
  | 'whatsapp' | 'livechat' | 'popup' | 'bar' | 'upsell'
  | 'proof' | 'google' | 'accounting' | 'currency' | 'qr';

export type FreeCat = 'messages' | 'conversion' | 'insight' | 'ops';

export interface FreeApp {
  id: FreeAppId;
  cat: FreeCat;
  name: L;
  /** One line: the merchant outcome. */
  pitch: L;
  /** What the app reads or does; shown before install. */
  permissions: L[];
  /** What changes for shoppers once on; empty when nothing shows in the store. */
  storeEffects: L[];
  /** Needs an outside account to work for real (e.g. WhatsApp Business, Google). */
  external?: L;
}

const l = (ar: string, en: string): L => ({ ar, en });

export const FREE_CATS: { id: FreeCat; label: L }[] = [
  { id: 'messages', label: l('التواصل مع العملاء', 'Talk to customers') },
  { id: 'conversion', label: l('رفع المبيعات', 'Sell more') },
  { id: 'insight', label: l('القياس والتسويق', 'Measure & market') },
  { id: 'ops', label: l('التشغيل', 'Operations') },
];

export const FREE_APPS: FreeApp[] = [
  { id: 'whatsapp', cat: 'messages', name: l('واتساب للأعمال', 'WhatsApp Business'), pitch: l('رسائل حالة الطلب واسترجاع السلات وزر واتساب في المتجر', 'Order updates, cart recovery and a WhatsApp button in your store'),
    permissions: [l('قراءة الطلبات وحالاتها', 'Read orders and their status'), l('إرسال رسائل للعملاء الموافقين باسم متجرك', 'Message consenting customers as your store')],
    storeEffects: [l('زر واتساب عائم في المتجر', 'A floating WhatsApp button in the store')], external: l('حساب واتساب للأعمال (واجهة Meta الرسمية)', 'A WhatsApp Business account (Meta’s official API)') },
  { id: 'livechat', cat: 'messages', name: l('الدردشة المباشرة', 'Live chat'), pitch: l('محادثة في المتجر تصل إلى صندوق خدمة العملاء', 'Chat in your store that lands in your customer-service inbox'),
    permissions: [l('إنشاء محادثات في صندوق خدمة العملاء', 'Create conversations in the customer-service inbox')],
    storeEffects: [l('نافذة دردشة في المتجر بساعات العمل التي تحددها', 'A chat window in the store during your hours')] },
  { id: 'popup', cat: 'conversion', name: l('نافذة الترحيب وجمع المشتركين', 'Welcome pop-up & sign-ups'), pitch: l('خصم ترحيبي مقابل البريد أو الجوال بموافقة صريحة', 'A welcome discount for an email or mobile, with clear consent'),
    permissions: [l('إنشاء كوبون لكل مشترك', 'Create a coupon per sign-up'), l('إضافة المشتركين للعملاء مع الموافقة', 'Add sign-ups to customers with their consent')],
    storeEffects: [l('نافذة تظهر وفق القواعد التي تحددها', 'A pop-up shown by your rules')] },
  { id: 'bar', cat: 'conversion', name: l('شريط الشحن المجاني والعدّاد', 'Free-shipping bar & countdown'), pitch: l('يُظهر للعميل كم بقي للشحن المجاني ووقت انتهاء العرض الحقيقي', 'Shows how far the shopper is from free shipping and when a real offer ends'),
    permissions: [l('قراءة إعدادات الشحن والعروض', 'Read shipping settings and offers')],
    storeEffects: [l('شريط تقدّم في الحقيبة وصفحة المنتج', 'A progress bar in the bag and on product pages'), l('عدّاد لعرض فعلي فقط', 'A countdown for a real offer only')] },
  { id: 'upsell', cat: 'conversion', name: l('منتجات مقترحة وتُشترى معًا', 'Recommendations & bought together'), pitch: l('اقتراحات من طلباتك الفعلية لرفع متوسط الطلب', 'Suggestions from your real orders to raise order value'),
    permissions: [l('قراءة الطلبات والمنتجات', 'Read orders and products')],
    storeEffects: [l('«يُشترى معه عادة» في صفحة المنتج', '“Often bought with” on product pages'), l('اقتراح في الحقيبة', 'A suggestion in the bag')] },
  { id: 'proof', cat: 'conversion', name: l('إثبات اجتماعي صادق', 'Honest social proof'), pitch: l('مشتريات حديثة وكميات حقيقية دون أرقام مختلقة', 'Recent purchases and real stock, never made-up numbers'),
    permissions: [l('قراءة الطلبات والمخزون (دون أسماء كاملة)', 'Read orders and stock (no full names)')],
    storeEffects: [l('تنبيه «اشترى أحدهم من الرياض قبل ساعتين»', '“Someone in Riyadh bought this 2 hours ago”'), l('«بقي ٣ قطع» عند انخفاض المخزون فعلًا', '“3 left” only when stock is really low')] },
  { id: 'google', cat: 'insight', name: l('Google Analytics و Merchant Center', 'Google Analytics & Merchant Center'), pitch: l('قياس الزيارات والمبيعات وعرض منتجاتك في Google', 'Measure visits and sales, and list products on Google'),
    permissions: [l('إرسال أحداث الزيارة والشراء عند موافقة الزائر', 'Send visit and purchase events when the visitor consents'), l('قراءة المنتجات لملف المنتجات', 'Read products for the product feed')],
    storeEffects: [l('وسم القياس بعد موافقة الزائر على ملفات الارتباط', 'Measurement tag after cookie consent')], external: l('حساب Google Analytics و Merchant Center', 'Google Analytics and Merchant Center accounts') },
  { id: 'accounting', cat: 'ops', name: l('الربط المحاسبي', 'Accounting export'), pitch: l('قيود المبيعات والضريبة والرسوم والمستردات جاهزة لمحاسبك', 'Sales, VAT, fees and refunds ready for your accountant'),
    permissions: [l('قراءة الطلبات والمستردات والتحويلات', 'Read orders, refunds and payouts')], storeEffects: [] },
  { id: 'currency', cat: 'ops', name: l('محوّل العملات الخليجية', 'Gulf currency switcher'), pitch: l('أسعار تقريبية بعملة الزائر، والدفع بالريال', 'Approximate prices in the visitor’s currency, payment in riyals'),
    permissions: [l('عرض أسعار المنتجات بعملات أخرى', 'Show product prices in other currencies')],
    storeEffects: [l('اختيار العملة في رأس المتجر مع تنبيه أن الدفع بالريال', 'A currency picker in the header, noting payment is in SAR')] },
  { id: 'qr', cat: 'insight', name: l('رموز QR وروابط مختصرة', 'QR codes & short links'), pitch: l('لكل لوحة محل أو منشور أو مؤثر رابط يُقاس أثره', 'A measurable link for every shop sign, flyer or influencer'),
    permissions: [l('إنشاء روابط تؤدي لمتجرك وقراءة الطلبات المنسوبة إليها', 'Create links to your store and read orders attributed to them')], storeEffects: [] },
];

export const freeAppById = (id: string) => FREE_APPS.find((a) => a.id === id);

export interface Installed { on: boolean; installedAt: string; settings: Record<string, unknown> }
/** Installed free apps and their settings (session, simulated). Each app reads/writes its own `settings` object. */
export const freeAppsStore = createStore.key('dashboard.freeApps')<Partial<Record<FreeAppId, Installed>>>(() => ({}));

export const isOn = (s: Partial<Record<FreeAppId, Installed>>, id: FreeAppId) => !!s[id]?.on;
export function appSettings<T extends Record<string, unknown>>(s: Partial<Record<FreeAppId, Installed>>, id: FreeAppId, defaults: T): T {
  return { ...defaults, ...((s[id]?.settings as Partial<T>) ?? {}) };
}
export function saveAppSettings(id: FreeAppId, patch: Record<string, unknown>) {
  freeAppsStore.set((s) => (s[id] ? { ...s, [id]: { ...s[id]!, settings: { ...s[id]!.settings, ...patch } } } : s));
}
