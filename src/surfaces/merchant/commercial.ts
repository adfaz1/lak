// LAK's own commercial surfaces (Phase D): the register of business decisions that block LAK features, plan limits
// and add-ons, the fee calculator, the LAK store credit, LAK's original theme presets, merchant service requests and
// packaging-material requests. Pure rules, no React. No LAK price, fee, rate, payout term or limit is invented here:
// every value LAK would set is either `null` (= «بانتظار الاعتماد») or typed by the merchant as a labelled example.
import type { L } from './domain';
import { PLANS, STAFF_LIMIT, type Plan } from './finance';
import type { ButtonStyle, HeaderLayout, Section, SectionKind, StoreFont, StoreIdentity } from './workspace';

/** Arabic-Indic and Persian digits → Latin; Arabic decimal/thousands separators normalised. */
export const latinDigits = (s: string) => s
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
  .replace(/٫/g, '.').replace(/[٬,\s]/g, '').trim();
/** A non-negative decimal typed by the merchant ("١٢٫٥", "12.5"); null when blank or not a number. */
export function parseNum(s: string): number | null {
  const v = latinDigits(s);
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

/* =====================================================================================================
 * Pending decisions register (`#/dashboard/settings/decisions`). One list; every «قرار مطلوب» marker links here.
 * ===================================================================================================== */

export type DecisionId =
  | 'plans' | 'txFees' | 'storeCredit' | 'affiliateNetwork' | 'influencers' | 'adsFees' | 'pos' | 'wholesale' | 'themeRevenue'
  | 'services' | 'packaging' | 'demoFreeShipping' | 'unifiedCart' | 'customerWallet' | 'cashback' | 'bookings';
export type DecisionArea = 'pricing' | 'marketplace' | 'channels' | 'policy';
export interface Where { label: L; path: string; query?: Record<string, string> }
export interface Decision {
  id: DecisionId; area: DecisionArea; title: L; question: L;
  /** What stays simulated or hidden until the owner decides. */
  blocks: L[];
  /** Options as framed by the source or the audit; none is pre-selected. */
  options: L[];
  /** Screens that show a «قرار مطلوب» marker for it (path below #/dashboard). */
  where: Where[];
  /** Blueprint / Salla-audit references. */
  refs: string;
}

const w = (ar: string, en: string, path: string, query?: Record<string, string>): Where => ({ label: { ar, en }, path, query });

export const DECISIONS: Decision[] = [
  {
    id: 'plans', area: 'pricing', refs: 'Blueprint p.43–44 · P02 Subscription · Salla 07 §7.8, 12',
    title: { ar: 'الباقات وأسعارها وحدودها', en: 'Plans, prices and limits' },
    question: { ar: 'ما أسعار Basic/Plus/Pro/Special شهريًا وسنويًا، وحدود الفروع والاستخدام العادل، وأي إضافات تُباع؟', en: 'What do Basic/Plus/Pro/Special cost monthly and yearly, what are branch and fair-use limits, and which add-ons are sold?' },
    blocks: [{ ar: 'تغيير الباقة فعليًا والتحصيل والتجديد والتناسب', en: 'Real plan changes, charging, renewal and proration' }, { ar: 'شراء الإضافات (موظفون، فروع، صانع التطبيقات)', en: 'Buying add-ons (staff, branches, App Maker)' }],
    options: [{ ar: 'Basic مجانية كما في المصدر، والبقية بسعر شهري وسنوي', en: 'Basic free as in the source; the others monthly and yearly' }, { ar: 'كل الباقات مدفوعة مع تجربة مجانية', en: 'All plans paid, with a free trial' }, { ar: 'سعر حسب حجم المبيعات', en: 'Price by sales volume' }],
    where: [w('الخطة والفوترة', 'Plan & billing', 'finance', { tab: 'billing' }), w('الفريق (حد المقاعد)', 'Team (seat limit)', 'settings/team')],
  },
  {
    id: 'txFees', area: 'pricing', refs: 'Blueprint p.43 «Sales Commission 0% / Custom», «Flexible Payment Fees» · Salla 07 §7.2',
    title: { ar: 'رسوم العمليات والعمولة وموعد التحويل', en: 'Transaction fees, commission and payout timing' },
    question: { ar: 'هل تأخذ لك رسمًا على الطلب فوق رسوم مزود الدفع؟ وما نسبة كل طريقة دفع وموعد التحويل للبنك؟', en: 'Does LAK charge per order on top of the payment provider? What is the rate per method and when are payouts sent?' },
    blocks: [{ ar: 'أرقام حاسبة الرسوم الحقيقية', en: 'Real numbers in the fee calculator' }, { ar: 'خصم رسوم لك في الحركات المالية', en: 'LAK fees in the ledger' }],
    options: [{ ar: '0% عمولة لك (Basic–Pro) ورسوم المزود فقط، كما في المصدر', en: '0% LAK commission (Basic–Pro), provider fees only, as in the source' }, { ar: 'نسبة صغيرة لكل طلب حسب الباقة', en: 'A small per-order rate by plan' }, { ar: 'رسوم تفاوضية لـ Special فقط', en: 'Negotiated fees for Special only' }],
    where: [w('حاسبة الرسوم', 'Fee calculator', 'finance', { tab: 'billing', part: 'fees' }), w('مزودو الدفع', 'Payment providers', 'settings/payments')],
  },
  {
    id: 'storeCredit', area: 'pricing', refs: 'Salla 07 §7.1 «رصيد المتجر» · MATRIX #88',
    title: { ar: 'رصيد لك وأسعار خدماته', en: 'LAK credit and service prices' },
    question: { ar: 'ما سعر الرسالة والبوليصة وخدمة الإعلانات من الرصيد؟ وهل الرصيد قابل للاسترداد وله صلاحية؟', en: 'What do a message, a label and ads cost from credit? Is credit refundable, and does it expire?' },
    blocks: [{ ar: 'الشحن الحقيقي للرصيد والخصم التلقائي', en: 'Real top-up and automatic deductions' }, { ar: 'أسعار الوحدات في الرصيد', en: 'Unit prices in the credit page' }],
    options: [{ ar: 'رصيد مسبق الدفع غير مسترد', en: 'Prepaid, non-refundable' }, { ar: 'رصيد مسترد عند إغلاق الحساب', en: 'Refundable when the account closes' }, { ar: 'فوترة لاحقة شهرية بدل الرصيد', en: 'Monthly post-paid billing instead of credit' }],
    where: [w('رصيد لك', 'LAK credit', 'finance', { tab: 'billing', part: 'credit' })],
  },
  {
    id: 'affiliateNetwork', area: 'marketplace', refs: 'Blueprint Affiliate Program (Pro+) · Salla 05',
    title: { ar: 'شبكة المسوقين بالعمولة المُدارة', en: 'Managed affiliate network' },
    question: { ar: 'هل تدير لك شبكة مسوقين مشتركة بين المتاجر وتأخذ رسمًا، أم يدير كل تاجر مسوقيه فقط؟', en: 'Does LAK run a shared affiliate network across stores for a fee, or does each merchant manage only their own affiliates?' },
    blocks: [{ ar: 'سوق المسوقين المشترك ورسوم لك عليه', en: 'The shared affiliate marketplace and LAK’s fee on it' }],
    options: [{ ar: 'مسوقو التاجر فقط (عمولة يحددها التاجر)', en: 'Merchant’s own affiliates only (merchant-set commission)' }, { ar: 'شبكة لك برسم على كل عملية', en: 'LAK network with a fee per sale' }],
    where: [w('التسويق', 'Marketing', 'marketing')],
  },
  {
    id: 'influencers', area: 'marketplace', refs: 'Blueprint Influencer Campaigns (Pro+) · Salla 05',
    title: { ar: 'سوق المؤثرين', en: 'Influencer marketplace' },
    question: { ar: 'هل تعرض لك مؤثرين معتمدين وتتوسط في الدفع؟ ومن يتحقق من هوياتهم وترخيصهم الإعلاني؟', en: 'Does LAK list vetted influencers and broker payment? Who verifies identity and advertising licences?' },
    blocks: [{ ar: 'قائمة المؤثرين (تبقى فارغة بلا أسماء)', en: 'The influencer list (stays empty, no names)' }],
    options: [{ ar: 'دليل فقط والتعاقد مباشر', en: 'Directory only; contract directly' }, { ar: 'وساطة كاملة برسم', en: 'Full brokerage for a fee' }],
    where: [w('التسويق', 'Marketing', 'marketing')],
  },
  {
    id: 'adsFees', area: 'pricing', refs: 'Blueprint Lak Ads (Plus+) · Salla 05, 01 · MATRIX #61',
    title: { ar: 'رسوم إعلانات لك', en: 'LAK ads fees' },
    question: { ar: 'هل تأخذ لك رسمًا منفصلًا عن إنفاق المنصات الإعلانية؟ وكم؟', en: 'Does LAK charge a fee separate from ad-platform spend? How much?' },
    blocks: [{ ar: 'فصل الميزانية عن رسوم لك في الحملات', en: 'Showing budget apart from LAK’s fee in campaigns' }],
    options: [{ ar: 'بلا رسم (الإنفاق فقط)', en: 'No fee (spend only)' }, { ar: 'نسبة من الإنفاق', en: 'A share of spend' }, { ar: 'رسم شهري ثابت للإدارة', en: 'A flat monthly management fee' }],
    where: [w('قنوات البيع', 'Sales channels', 'channel/all'), w('رصيد لك', 'LAK credit', 'finance', { tab: 'billing', part: 'credit' })],
  },
  {
    id: 'pos', area: 'channels', refs: 'Salla 08 «سلة بوينت» · MATRIX #111',
    title: { ar: 'تسعير نقاط البيع (POS)', en: 'POS pricing' },
    question: { ar: 'ما نطاق نقاط البيع: الأجهزة، الدفع الحضوري، والسعر لكل جهاز أو فرع؟', en: 'What is POS scope: devices, in-person payment, and price per device or branch?' },
    blocks: [{ ar: 'قناة نقاط البيع', en: 'The POS channel' }],
    options: [{ ar: 'كاشير مجاني ورسوم الدفع فقط', en: 'Free cashier, payment fees only' }, { ar: 'اشتراك لكل جهاز', en: 'Subscription per device' }],
    where: [w('قنوات البيع', 'Sales channels', 'channel/all')],
  },
  {
    id: 'wholesale', area: 'marketplace', refs: 'Blueprint Lak Wholesale B2B (Plus+, and "All plans" elsewhere) · MATRIX #114',
    title: { ar: 'سوق الجملة', en: 'Wholesale marketplace' },
    question: { ar: 'المصدر متناقض: الجملة لكل الباقات أم من Plus؟ وهل لك عمولة على صفقات الجملة؟', en: 'The source contradicts itself: wholesale on all plans or Plus+? Does LAK take a commission on wholesale deals?' },
    blocks: [{ ar: 'سوق الجملة بين التجار', en: 'The merchant-to-merchant wholesale market' }],
    options: [{ ar: 'من Plus بلا عمولة', en: 'Plus+ with no commission' }, { ar: 'لكل الباقات بعمولة', en: 'All plans, with commission' }],
    where: [w('قنوات البيع', 'Sales channels', 'channel/all')],
  },
  {
    id: 'themeRevenue', area: 'marketplace', refs: 'Salla 08 «متجر الثيمات» · MATRIX #103 · BP-P03-STP-003',
    title: { ar: 'متجر الثيمات وحصة الإيراد', en: 'Theme store and revenue share' },
    question: { ar: 'هل تُقبل ثيمات من مصممين خارجيين؟ بأي حصة إيراد ومراجعة جودة؟ وهل ثيمات لك مجانية لكل الباقات؟', en: 'Are third-party themes accepted, with what revenue share and quality review? Are LAK’s own themes free on all plans?' },
    blocks: [{ ar: 'ثيمات المصممين الخارجيين وأسعارها', en: 'Third-party themes and their prices' }],
    options: [{ ar: 'ثيمات لك فقط مجانًا', en: 'LAK themes only, free' }, { ar: 'سوق مفتوح بحصة إيراد', en: 'Open market with a revenue share' }],
    where: [w('متجر الثيمات', 'Theme store', 'storefront/themes')],
  },
  {
    id: 'services', area: 'marketplace', refs: 'Salla 09 «خدمات التاجر» · MATRIX #118',
    title: { ar: 'سوق خدمات التاجر', en: 'Merchant services marketplace' },
    question: { ar: 'من الشركاء المعتمدون (تصميم، تصوير، محتوى، تسويق)؟ وهل تتوسط لك في الدفع وتضمن التسليم؟', en: 'Who are the approved partners (design, photography, content, marketing)? Does LAK broker payment and guarantee delivery?' },
    blocks: [{ ar: 'قائمة الشركاء وعروض الأسعار (تبقى فارغة)', en: 'The partner list and quotes (stay empty)' }],
    options: [{ ar: 'دليل شركاء معتمدين وتعاقد مباشر', en: 'Directory of approved partners; direct contract' }, { ar: 'وساطة لك بضمان وعمولة', en: 'LAK brokerage with guarantee and commission' }],
    where: [w('خدمات التاجر', 'Merchant services', 'apps', { tab: 'services' })],
  },
  {
    id: 'packaging', area: 'marketplace', refs: 'Salla 11 §11.2 «مواد التغليف» · MATRIX #133',
    title: { ar: 'كتالوج مواد التغليف', en: 'Packaging catalogue' },
    question: { ar: 'هل تبيع لك مواد التغليف؟ ما المقاسات والأسعار والحد الأدنى والتوصيل؟', en: 'Does LAK sell packaging? Which sizes, prices, minimums and delivery?' },
    blocks: [{ ar: 'التسعير والتأكيد الحقيقي لطلبات التغليف', en: 'Pricing and real confirmation of packaging orders' }],
    options: [{ ar: 'كتالوج لك بمورد واحد', en: 'LAK catalogue with one supplier' }, { ar: 'ربط بموردين معتمدين', en: 'Link to approved suppliers' }],
    where: [w('مواد التغليف', 'Packaging materials', 'apps', { tab: 'packaging' })],
  },
  {
    id: 'demoFreeShipping', area: 'policy', refs: 'Demo store announcement «توصيل مجاني من 300 ر.س»',
    title: { ar: 'سياسة الشحن المجاني في المتجر التجريبي', en: 'Free-shipping policy of the demo store' },
    question: { ar: 'هل يبقى حد «توصيل مجاني من 300 ر.س» في المتجر التجريبي، أم يُحذف حتى لا يُفهم كعرض من لك؟', en: 'Should the demo store keep “free delivery from SAR 300”, or drop it so it is not read as a LAK offer?' },
    blocks: [{ ar: 'نص شريط الإعلان في المتجر التجريبي', en: 'The demo store’s announcement text' }],
    options: [{ ar: 'إبقاؤه مع وسم «مثال»', en: 'Keep it, labelled as an example' }, { ar: 'حذفه', en: 'Remove it' }],
    where: [w('المتجر الإلكتروني', 'Online store', 'storefront', { edit: 'announcement' }), w('قواعد الشحن', 'Shipping rules', 'settings/shipping', { tab: 'rules' })],
  },
  {
    id: 'unifiedCart', area: 'marketplace', refs: 'Blueprint Lak Marketplace · MATRIX #113',
    title: { ar: 'السلة الموحدة في سوق لك', en: 'Unified marketplace cart' },
    question: { ar: 'هل يشتري المتسوق من عدة متاجر بسلة ودفعة واحدة؟ ومن يتحمل الاسترداد والشحن المجزأ؟', en: 'Can a shopper buy from several stores in one cart and payment? Who owns refunds and split shipping?' },
    blocks: [{ ar: 'الدفع الموحد في سوق لك', en: 'Unified checkout in the LAK marketplace' }],
    options: [{ ar: 'سلة لكل متجر', en: 'One cart per store' }, { ar: 'سلة موحدة ولك تسوّي للتجار', en: 'Unified cart; LAK settles with merchants' }],
    where: [w('قنوات البيع', 'Sales channels', 'channel')],
  },
  {
    id: 'customerWallet', area: 'policy', refs: 'BP-P03-PMT-015, CUS-010 · MATRIX #60',
    title: { ar: 'محفظة العميل', en: 'Customer wallet' },
    question: { ar: 'من يموّل رصيد العميل، وما صلاحيته وحد استخدامه، وهل يُسترد نقدًا؟', en: 'Who funds customer balance, how long does it last, what are the usage limits, is it cash-refundable?' },
    blocks: [{ ar: 'رصيد العميل وسجله', en: 'Customer balance and its history' }],
    options: [{ ar: 'رصيد من الاسترداد فقط', en: 'Balance from refunds only' }, { ar: 'شحن من العميل أيضًا', en: 'Shopper top-ups too' }],
    where: [w('العملاء', 'Customers', 'customers')],
  },
  {
    id: 'cashback', area: 'policy', refs: 'BP-P03-ORD-018, PMT-017 · MATRIX #68',
    title: { ar: 'الكاش باك', en: 'Cashback' },
    question: { ar: 'هل التمويل من التاجر وحده؟ ومتى يُستحق (بعد التسليم أو انتهاء مهلة الاسترجاع)؟', en: 'Funded by the merchant alone? When is it earned (after delivery or after the return window)?' },
    blocks: [{ ar: 'برنامج الكاش باك', en: 'The cashback programme' }],
    options: [{ ar: 'تمويل التاجر بعد مهلة الاسترجاع', en: 'Merchant-funded after the return window' }, { ar: 'تمويل مشترك مع لك', en: 'Co-funded with LAK' }],
    where: [w('التسويق', 'Marketing', 'marketing')],
  },
  {
    id: 'bookings', area: 'policy', refs: 'BP-P03-ORD-026 · MATRIX #26',
    title: { ar: 'الحجوزات والمواعيد', en: 'Bookings and appointments' },
    question: { ar: 'هل الحجوزات ضمن Pro كما في المصدر؟ وما سياسة العربون والإلغاء؟', en: 'Are bookings Pro+ as in the source? What is the deposit and cancellation policy?' },
    blocks: [{ ar: 'تقويم الحجوزات للعملاء', en: 'Customer booking calendar' }],
    options: [{ ar: 'Pro فأعلى', en: 'Pro and above' }, { ar: 'إضافة مدفوعة', en: 'Paid add-on' }],
    where: [w('الطلبات', 'Orders', 'orders')],
  },
];
export const DECISION_IDS = DECISIONS.map((d) => d.id);
export const isDecision = (s: string | null | undefined): s is DecisionId => !!s && (DECISION_IDS as string[]).includes(s);
export const decisionById = (id: DecisionId) => DECISIONS.find((d) => d.id === id)!;
/** Hash route other sections link their «قرار مطلوب» marker to. */
export const decisionHref = (id?: DecisionId) => `#/dashboard/settings/decisions${id ? `?d=${id}` : ''}`;

/** Search across both languages, options and screens; optional area filter. */
export function filterDecisions(list: Decision[], f: { q?: string; area?: DecisionArea | '' }): Decision[] {
  const words = (f.q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((d) => {
    if (f.area && d.area !== f.area) return false;
    if (!words.length) return true;
    const hay = [d.title.ar, d.title.en, d.question.ar, d.question.en, ...d.blocks.flatMap((b) => [b.ar, b.en]), ...d.options.flatMap((o) => [o.ar, o.en]), ...d.where.flatMap((x) => [x.label.ar, x.label.en]), d.refs].join(' ').toLowerCase();
    return words.every((x) => hay.includes(x));
  });
}

/* =====================================================================================================
 * Plan limits and add-ons (blueprint p.43–44; prices are never set here).
 * ===================================================================================================== */

/** `null` = unlimited per the matrix (fair use pending); 'pending' = the source gives no number. */
export type Limit = number | null | 'pending';
export type LimitKey = 'staff' | 'stores' | 'branches' | 'products';
export const LIMIT_KEYS: LimitKey[] = ['staff', 'stores', 'branches', 'products'];
export const PLAN_LIMITS: Record<Plan, Record<LimitKey, Limit>> = {
  // Staff and stores are numbers in the matrix. Branches: "Multi-Branch (Advanced) ✗/✗/Basic/Advanced", so Basic/Plus
  // keep one location and Pro/Special have no number yet. Products: "Unlimited" on every plan (fair use pending).
  basic: { staff: STAFF_LIMIT.basic, stores: 1, branches: 1, products: null },
  plus: { staff: STAFF_LIMIT.plus, stores: 1, branches: 1, products: null },
  pro: { staff: STAFF_LIMIT.pro, stores: null, branches: 'pending', products: null },
  special: { staff: STAFF_LIMIT.special, stores: null, branches: 'pending', products: null },
};
export interface Usage { staff: number; stores: number; branches: number; products: number }
export type UsageState = 'ok' | 'near' | 'full' | 'over' | 'unlimited' | 'pending';
export function usageState(used: number, limit: Limit): UsageState {
  if (limit === null) return 'unlimited';
  if (limit === 'pending') return 'pending';
  if (used > limit) return 'over';
  if (used === limit) return 'full';
  return used / limit >= 0.8 ? 'near' : 'ok';
}
export function usageRows(plan: Plan, u: Usage) {
  return LIMIT_KEYS.map((k) => ({ key: k, used: u[k], limit: PLAN_LIMITS[plan][k], state: usageState(u[k], PLAN_LIMITS[plan][k]) }));
}
/** What happens to each limit when changing plan, with the amount that must be removed first on a downgrade. */
export function limitChanges(from: Plan, to: Plan, u: Usage) {
  return LIMIT_KEYS.map((k) => {
    const before = PLAN_LIMITS[from][k];
    const after = PLAN_LIMITS[to][k];
    const over = typeof after === 'number' ? Math.max(0, u[k] - after) : 0;
    return { key: k, before, after, used: u[k], over, changed: before !== after };
  });
}
export const planIndex = (p: Plan) => PLANS.indexOf(p);

export type AddOnId = 'appMaker' | 'extraStaff' | 'extraBranches';
export interface AddOn { id: AddOnId; title: L; desc: L; minPlan: Plan; source: 'blueprint' | 'proposal' }
export const ADDONS: AddOn[] = [
  { id: 'appMaker', minPlan: 'plus', source: 'blueprint', title: { ar: 'صانع التطبيقات', en: 'App Maker' }, desc: { ar: 'تطبيق جوال باسم متجرك', en: 'A mobile app in your store’s name' } },
  { id: 'extraStaff', minPlan: 'plus', source: 'proposal', title: { ar: 'مقاعد موظفين إضافية', en: 'Extra staff seats' }, desc: { ar: 'فوق حد الباقة', en: 'Above the plan limit' } },
  { id: 'extraBranches', minPlan: 'pro', source: 'proposal', title: { ar: 'فروع إضافية', en: 'Extra branches' }, desc: { ar: 'مستودعات وفروع استلام', en: 'Warehouses and pickup branches' } },
];
export const addOnAvailable = (a: AddOn, plan: Plan) => planIndex(plan) >= planIndex(a.minPlan);

/* =====================================================================================================
 * Fee calculator. Every rate is typed by the merchant (or filled with a labelled example); nothing is LAK's number.
 * ===================================================================================================== */

export type FeeMethod = 'mada' | 'card' | 'applepay' | 'bnpl' | 'cod';
export const FEE_METHODS: FeeMethod[] = ['mada', 'card', 'applepay', 'bnpl', 'cod'];
export interface FeeRate { pct: string; fixed: string }
export interface FeeInput {
  /** Average order value and orders per month, as typed. */
  aov: string; orders: string;
  /** Share of orders per method, in percent, as typed. */
  mix: Record<FeeMethod, string>;
  /** Share of order value refunded, in percent. */
  refundPct: string;
  /** Provider rate per method (merchant’s own contract, or example). */
  rates: Record<FeeMethod, FeeRate>;
  /** LAK’s fee: pending approval; the merchant can try a value. */
  lak: FeeRate;
  /** Days from sale to bank (provider settlement + LAK payout), as an example. */
  payoutDays: string;
}
export const emptyFeeInput = (): FeeInput => ({
  aov: '', orders: '', mix: { mada: '', card: '', applepay: '', bnpl: '', cod: '' }, refundPct: '',
  rates: { mada: { pct: '', fixed: '' }, card: { pct: '', fixed: '' }, applepay: { pct: '', fixed: '' }, bnpl: { pct: '', fixed: '' }, cod: { pct: '', fixed: '' } },
  lak: { pct: '', fixed: '' }, payoutDays: '',
});
/** Obviously labelled example numbers for trying the calculator («مثال للتجربة»). Not LAK’s fees, not a quote. */
export const exampleFeeInput = (): FeeInput => ({
  aov: '250', orders: '400', mix: { mada: '45', card: '20', applepay: '20', bnpl: '10', cod: '5' }, refundPct: '3',
  rates: { mada: { pct: '1', fixed: '0' }, card: { pct: '2.5', fixed: '1' }, applepay: { pct: '2', fixed: '0' }, bnpl: { pct: '6', fixed: '1.5' }, cod: { pct: '0', fixed: '10' } },
  lak: { pct: '1', fixed: '0' }, payoutDays: '3',
});
export type FeeErr = 'required' | 'number' | 'pct' | 'mix';
export interface FeeErrors { aov?: FeeErr; orders?: FeeErr; refundPct?: FeeErr; payoutDays?: FeeErr; mix?: FeeErr; rates?: Partial<Record<FeeMethod | 'lak', FeeErr>> }
const pctOk = (s: string) => { const v = parseNum(s); return v !== null && v <= 100; };
export function validateFees(i: FeeInput): FeeErrors {
  const e: FeeErrors = {};
  const need = (s: string): FeeErr | undefined => (!s.trim() ? 'required' : parseNum(s) === null ? 'number' : undefined);
  e.aov = need(i.aov); e.orders = need(i.orders);
  if (i.refundPct.trim() && !pctOk(i.refundPct)) e.refundPct = 'pct';
  if (i.payoutDays.trim() && parseNum(i.payoutDays) === null) e.payoutDays = 'number';
  const mix = FEE_METHODS.map((m) => (i.mix[m].trim() ? parseNum(i.mix[m]) : 0));
  if (mix.some((v) => v === null)) e.mix = 'number';
  else if (Math.abs((mix as number[]).reduce((a, b) => a + b, 0) - 100) > 0.01) e.mix = 'mix';
  const rates: NonNullable<FeeErrors['rates']> = {};
  for (const m of [...FEE_METHODS, 'lak'] as const) {
    const r = m === 'lak' ? i.lak : i.rates[m];
    if ((r.pct.trim() && !pctOk(r.pct)) || (r.fixed.trim() && parseNum(r.fixed) === null)) rates[m] = 'number';
  }
  if (Object.keys(rates).length) e.rates = rates;
  for (const k of Object.keys(e) as (keyof FeeErrors)[]) if (e[k] === undefined) delete e[k];
  return e;
}
export const feeOk = (e: FeeErrors) => Object.keys(e).length === 0;
const n0 = (s: string) => parseNum(s) ?? 0;
/** Halalas for one order of `aov` riyals at a rate. */
const feeOn = (amount: number, r: FeeRate) => Math.round(amount * n0(r.pct) / 100 + n0(r.fixed) * 100);
export interface FeeRow { method: FeeMethod; orders: number; gross: number; provider: number }
export interface FeeResult {
  gross: number; refunds: number; provider: number; lak: number | null; net: number;
  rows: FeeRow[]; effectivePct: number; payoutDays: number | null;
}
/** Monthly estimate in halalas. Provider fees are not returned on refunds (a common contract term; the merchant can see it separately). */
export function estimateFees(i: FeeInput): FeeResult {
  const aov = Math.round(n0(i.aov) * 100);
  const orders = Math.round(n0(i.orders));
  const rows: FeeRow[] = FEE_METHODS.map((m) => {
    const o = Math.round(orders * n0(i.mix[m]) / 100);
    return { method: m, orders: o, gross: o * aov, provider: o * feeOn(aov, i.rates[m]) };
  });
  const gross = rows.reduce((a, r) => a + r.gross, 0);
  const provider = rows.reduce((a, r) => a + r.provider, 0);
  const refunds = Math.round(gross * n0(i.refundPct) / 100);
  const lakSet = !!(i.lak.pct.trim() || i.lak.fixed.trim());
  const lak = lakSet ? rows.reduce((a, r) => a + r.orders * feeOn(aov, i.lak), 0) : null;
  const net = gross - refunds - provider - (lak ?? 0);
  return { gross, refunds, provider, lak, net, rows, effectivePct: gross ? Math.round(((provider + (lak ?? 0)) / gross) * 10000) / 100 : 0, payoutDays: i.payoutDays.trim() ? parseNum(i.payoutDays) : null };
}
/** The calendar date a sale on `saleIso` reaches the bank after `days` working days (Fri/Sat skipped). */
export function payoutDate(saleIso: string, days: number): string {
  const d = new Date(`${saleIso}T00:00:00Z`);
  let left = Math.max(0, Math.round(days));
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const wd = d.getUTCDay(); if (wd !== 5 && wd !== 6) left--; }
  return d.toISOString().slice(0, 10);
}

/* =====================================================================================================
 * LAK store credit: prepaid balance spent on LAK services. Simulated; unit prices are pending approval.
 * ===================================================================================================== */

export type CreditService = 'messages' | 'labels' | 'ads';
export const CREDIT_SERVICES: CreditService[] = ['messages', 'labels', 'ads'];
export type CreditKind = 'topup' | 'spend' | 'auto';
export interface CreditEntry {
  id: string; at: string; kind: CreditKind; amount: number; balance: number; by: string;
  service?: CreditService; qty?: number; note?: string;
}
export interface AutoTopUp { on: boolean; below: number; amount: number }
export interface CreditState { entries: CreditEntry[]; threshold: number; auto: AutoTopUp; unit: Partial<Record<CreditService, number>> }
export const creditFixture = (): CreditState => ({ entries: [], threshold: 5000, auto: { on: false, below: 5000, amount: 20000 }, unit: {} });
export const creditBalance = (s: CreditState) => s.entries[0]?.balance ?? 0;
export const TOPUP_MIN = 1000;
export const TOPUP_MAX = 5_000_000;
export type TopUpErr = 'required' | 'number' | 'min' | 'max';
/** Riyals typed by the merchant → halalas, or a reason. */
export function checkTopUp(input: string): { ok: true; v: number } | { ok: false; e: TopUpErr } {
  if (!input.trim()) return { ok: false, e: 'required' };
  if (!/^\d+(\.\d{1,2})?$/.test(latinDigits(input))) return { ok: false, e: 'number' };
  const v = Math.round(Number(latinDigits(input)) * 100);
  if (v < TOPUP_MIN) return { ok: false, e: 'min' };
  if (v > TOPUP_MAX) return { ok: false, e: 'max' };
  return { ok: true, v };
}
const nextCreditId = (s: CreditState) => `CR-${String(s.entries.length + 1).padStart(4, '0')}`;
function push(s: CreditState, e: Omit<CreditEntry, 'id' | 'balance'>): CreditState {
  const balance = creditBalance(s) + (e.kind === 'spend' ? -e.amount : e.amount);
  return { ...s, entries: [{ ...e, id: nextCreditId(s), balance }, ...s.entries] };
}
export function topUp(s: CreditState, amount: number, by: string, at = new Date().toISOString()): CreditState {
  return push(s, { kind: 'topup', amount, by, at });
}
/** Applies the auto top-up rule once when the balance is below its trigger. */
export function applyAuto(s: CreditState, at = new Date().toISOString()): CreditState {
  if (!s.auto.on || s.auto.amount <= 0 || creditBalance(s) >= s.auto.below) return s;
  return push(s, { kind: 'auto', amount: s.auto.amount, by: 'auto', at });
}
export type SpendErr = 'qty' | 'unit' | 'funds';
export function spendCost(qty: number, unit: number | undefined) { return unit === undefined ? null : qty * unit; }
export function checkSpend(s: CreditState, service: CreditService, qty: number): SpendErr | null {
  if (!Number.isInteger(qty) || qty <= 0) return 'qty';
  const unit = s.unit[service];
  if (unit === undefined || unit <= 0) return 'unit';
  const cost = qty * unit;
  const room = creditBalance(s) + (s.auto.on && creditBalance(s) - cost < s.auto.below ? s.auto.amount : 0);
  return cost > room ? 'funds' : null;
}
/** Deducts a service (auto top-up first when the rule would cover it). Caller checks `checkSpend` first. */
export function spend(s: CreditState, service: CreditService, qty: number, by: string, at = new Date().toISOString()): CreditState {
  const cost = qty * (s.unit[service] ?? 0);
  let next = s;
  if (next.auto.on && creditBalance(next) < cost) next = push(next, { kind: 'auto', amount: next.auto.amount, by: 'auto', at });
  next = push(next, { kind: 'spend', amount: cost, by, at, service, qty });
  return applyAuto(next, at);
}
export const isLow = (s: CreditState) => creditBalance(s) < s.threshold;
export type AutoErr = 'below' | 'amount';
export function checkAuto(a: { below: string; amount: string }): Partial<Record<AutoErr, TopUpErr>> {
  const e: Partial<Record<AutoErr, TopUpErr>> = {};
  const b = checkTopUp(a.below); if (!b.ok) e.below = b.e;
  const m = checkTopUp(a.amount); if (!m.ok) e.amount = m.e;
  return e;
}
export function filterCredit(list: CreditEntry[], f: { kind?: CreditKind | ''; service?: CreditService | '' }) {
  return list.filter((x) => (!f.kind || x.kind === f.kind) && (!f.service || x.service === f.service));
}

/* =====================================================================================================
 * LAK original theme presets (built from the identity editor; no third-party themes).
 * ===================================================================================================== */

export type PresetId = 'souq' | 'majalla' | 'asas';
export interface ThemePreset {
  id: PresetId; name: L; tagline: L;
  identity: { accent: string; font: StoreFont; button: ButtonStyle; header: HeaderLayout };
  /** Homepage order by section kind; kinds not listed keep their relative place after these. */
  order: SectionKind[];
  traits: L[];
}
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'souq', name: { ar: 'سوق', en: 'Souq' }, tagline: { ar: 'كثيف بالمنتجات، للتشكيلات الكبيرة', en: 'Product-dense, for large ranges' },
    identity: { accent: '#1f5f4a', font: 'system', button: 'square', header: 'classic' },
    order: ['announcement', 'categories', 'featured', 'offers', 'hero', 'grid', 'banner', 'testimonials', 'richtext', 'video', 'newsletter'],
    traits: [{ ar: 'الفئات أولًا ثم الأكثر مبيعًا', en: 'Categories first, then best sellers' }, { ar: 'خط النظام الواضح', en: 'Clear system typeface' }, { ar: 'أزرار مربعة', en: 'Square buttons' }],
  },
  {
    id: 'majalla', name: { ar: 'مجلّة', en: 'Majalla' }, tagline: { ar: 'قصة العلامة قبل المنتج', en: 'The brand story before the product' },
    identity: { accent: '#8a2f45', font: 'naskh', button: 'pill', header: 'centered' },
    order: ['announcement', 'hero', 'video', 'richtext', 'testimonials', 'featured', 'banner', 'grid', 'categories', 'offers', 'newsletter'],
    traits: [{ ar: 'بانر وفيديو ونص في الأعلى', en: 'Banner, video and text up top' }, { ar: 'خط نسخ للعناوين', en: 'Naskh headings' }, { ar: 'شعار في الوسط', en: 'Centred logo' }],
  },
  {
    id: 'asas', name: { ar: 'أساس', en: 'Asas' }, tagline: { ar: 'هادئ وسريع على الجوال', en: 'Quiet and fast on phones' },
    identity: { accent: '#2b4c7e', font: 'plex', button: 'soft', header: 'minimal' },
    order: ['announcement', 'hero', 'featured', 'grid', 'newsletter', 'categories', 'offers', 'banner', 'richtext', 'testimonials', 'video'],
    traits: [{ ar: 'رأس مختصر', en: 'Minimal header' }, { ar: 'أقل عدد أقسام ظاهرة أولًا', en: 'Fewest sections up front' }, { ar: 'لون كحلي هادئ', en: 'Calm navy accent' }],
  },
];
export const presetById = (id: string | null | undefined) => THEME_PRESETS.find((p) => p.id === id) ?? null;
/** Sections reordered by the preset's kind order (stable; unknown kinds keep their relative order at the end). */
export function orderSections(sections: Section[], order: SectionKind[]): Section[] {
  const rank = (k: SectionKind) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  return sections.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.kind) - rank(b.s.kind) || a.i - b.i).map((x) => x.s);
}
/** The identity a preset produces, keeping the merchant's logo and favicon. */
export const presetIdentity = (p: ThemePreset, cur: StoreIdentity): StoreIdentity => ({ ...cur, ...p.identity });
/** Which preset the identity currently matches, if any. */
export const matchingPreset = (id: StoreIdentity) => THEME_PRESETS.find((p) => (Object.keys(p.identity) as (keyof ThemePreset['identity'])[]).every((k) => id[k] === p.identity[k]))?.id ?? null;

/* =====================================================================================================
 * Merchant service requests (no vendors are listed until partners are approved).
 * ===================================================================================================== */

export type ServiceCat = 'design' | 'photo' | 'content' | 'marketing' | 'setup' | 'dev';
export const SERVICE_CATS: ServiceCat[] = ['design', 'photo', 'content', 'marketing', 'setup', 'dev'];
export type ServiceStatus = 'open' | 'cancelled';
export interface ServiceRequest {
  id: string; cat: ServiceCat; need: string; budgetMin: number; budgetMax: number; deadline: string;
  status: ServiceStatus; at: string; by: string;
}
export interface ServiceDraft { cat: ServiceCat | ''; need: string; min: string; max: string; deadline: string }
export const emptyServiceDraft = (): ServiceDraft => ({ cat: '', need: '', min: '', max: '', deadline: '' });
export const NEED_MIN = 20;
export const NEED_MAX = 600;
export type ServiceErrors = Partial<Record<'cat' | 'need' | 'min' | 'max' | 'deadline', 'required' | 'short' | 'long' | 'number' | 'order' | 'past'>>;
export function validateService(d: ServiceDraft, today: string): ServiceErrors {
  const e: ServiceErrors = {};
  if (!d.cat) e.cat = 'required';
  const need = d.need.trim();
  if (!need) e.need = 'required'; else if (need.length < NEED_MIN) e.need = 'short'; else if (need.length > NEED_MAX) e.need = 'long';
  const min = parseNum(d.min); const max = parseNum(d.max);
  if (!d.min.trim()) e.min = 'required'; else if (min === null) e.min = 'number';
  if (!d.max.trim()) e.max = 'required'; else if (max === null) e.max = 'number';
  if (min !== null && max !== null && min > max) e.max = 'order';
  if (!d.deadline) e.deadline = 'required'; else if (d.deadline <= today) e.deadline = 'past';
  return e;
}
export function makeService(d: ServiceDraft, list: ServiceRequest[], by: string, at = new Date().toISOString()): ServiceRequest {
  return { id: `SRV-${String(list.length + 1).padStart(3, '0')}`, cat: d.cat as ServiceCat, need: d.need.trim(), budgetMin: Math.round(parseNum(d.min)! * 100), budgetMax: Math.round(parseNum(d.max)! * 100), deadline: d.deadline, status: 'open', at, by };
}

/* =====================================================================================================
 * Packaging materials: catalogue of item types (no prices) and requests with a simulated status flow.
 * ===================================================================================================== */

export type PackKind = 'box' | 'mailer' | 'bag' | 'label' | 'tape' | 'filler';
export interface PackItem { id: string; kind: PackKind; name: L; sizes: L[]; unit: L; step: number }
export const PACK_ITEMS: PackItem[] = [
  { id: 'box', kind: 'box', name: { ar: 'كرتون شحن', en: 'Shipping box' }, sizes: [{ ar: 'صغير', en: 'Small' }, { ar: 'متوسط', en: 'Medium' }, { ar: 'كبير', en: 'Large' }], unit: { ar: 'حبة', en: 'pcs' }, step: 25 },
  { id: 'mailer', kind: 'mailer', name: { ar: 'ظرف مبطّن', en: 'Padded mailer' }, sizes: [{ ar: 'A5', en: 'A5' }, { ar: 'A4', en: 'A4' }], unit: { ar: 'حبة', en: 'pcs' }, step: 50 },
  { id: 'bag', kind: 'bag', name: { ar: 'كيس شحن بلاستيكي', en: 'Poly shipping bag' }, sizes: [{ ar: 'صغير', en: 'Small' }, { ar: 'متوسط', en: 'Medium' }, { ar: 'كبير', en: 'Large' }], unit: { ar: 'حبة', en: 'pcs' }, step: 100 },
  { id: 'label', kind: 'label', name: { ar: 'ملصقات حرارية للبوليصة', en: 'Thermal label rolls' }, sizes: [{ ar: '10×15 سم', en: '10×15 cm' }], unit: { ar: 'لفّة', en: 'rolls' }, step: 1 },
  { id: 'tape', kind: 'tape', name: { ar: 'شريط لاصق', en: 'Packing tape' }, sizes: [{ ar: 'شفاف', en: 'Clear' }, { ar: 'بني', en: 'Brown' }], unit: { ar: 'لفّة', en: 'rolls' }, step: 6 },
  { id: 'filler', kind: 'filler', name: { ar: 'حشو حماية', en: 'Protective filler' }, sizes: [{ ar: 'فقاعات', en: 'Bubble wrap' }, { ar: 'ورق', en: 'Paper' }], unit: { ar: 'لفّة', en: 'rolls' }, step: 1 },
];
export type PackStatus = 'submitted' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export const PACK_FLOW: PackStatus[] = ['submitted', 'confirmed', 'preparing', 'shipped', 'delivered'];
export interface PackLine { item: string; size: number; qty: number }
export interface PackEvent { status: PackStatus; at: string; by: string; note?: string }
export interface PackOrder { id: string; lines: PackLine[]; city: string; status: PackStatus; events: PackEvent[] }
export const QTY_MAX = 100_000;
export type QtyErr = 'number' | 'step' | 'max';
/** A quantity typed by the merchant ("٥٠"); blank = 0 (not ordered). */
export function checkQty(input: string, item: PackItem): { ok: true; v: number } | { ok: false; e: QtyErr } {
  if (!input.trim()) return { ok: true, v: 0 };
  const v = parseNum(input);
  if (v === null || !Number.isInteger(v)) return { ok: false, e: 'number' };
  if (v > QTY_MAX) return { ok: false, e: 'max' };
  if (v % item.step !== 0) return { ok: false, e: 'step' };
  return { ok: true, v };
}
export const packKey = (item: string, size: number) => `${item}:${size}`;
export function linesFrom(qty: Record<string, string>): { lines: PackLine[]; errors: Record<string, QtyErr> } {
  const lines: PackLine[] = []; const errors: Record<string, QtyErr> = {};
  for (const [k, raw] of Object.entries(qty)) {
    const [item, s] = k.split(':'); const it = PACK_ITEMS.find((x) => x.id === item); if (!it) continue;
    const r = checkQty(raw, it);
    if (!r.ok) errors[k] = r.e; else if (r.v > 0) lines.push({ item, size: Number(s), qty: r.v });
  }
  return { lines, errors };
}
export function makePackOrder(lines: PackLine[], city: string, list: PackOrder[], by: string, at = new Date().toISOString()): PackOrder {
  return { id: `PK-${String(list.length + 1).padStart(3, '0')}`, lines, city, status: 'submitted', events: [{ status: 'submitted', at, by }] };
}
export const nextPackStatus = (s: PackStatus): PackStatus | null => { const i = PACK_FLOW.indexOf(s); return i < 0 || i === PACK_FLOW.length - 1 ? null : PACK_FLOW[i + 1]; };
/** Cancelling is possible until preparation starts. */
export const canCancelPack = (s: PackStatus) => s === 'submitted' || s === 'confirmed';
export function advancePack(o: PackOrder, by: string, at = new Date().toISOString()): PackOrder {
  const n = nextPackStatus(o.status); if (!n) return o;
  return { ...o, status: n, events: [...o.events, { status: n, at, by }] };
}
export function cancelPack(o: PackOrder, by: string, note: string, at = new Date().toISOString()): PackOrder {
  if (!canCancelPack(o.status)) return o;
  return { ...o, status: 'cancelled', events: [...o.events, { status: 'cancelled', at, by, note }] };
}
export const packUnits = (lines: PackLine[]) => lines.reduce((a, l) => a + l.qty, 0);

/** Calculator inputs from the merchant's own orders: average value, count and method mix (orders without a recorded
 *  method count as card; bank transfers carry no provider fee and are left out of the mix). Rates stay as typed. */
export function feeFromOrders(orders: { method?: 'card' | 'applepay' | 'bnpl' | 'cod' | 'bank'; total: number; refunded: boolean }[]): Pick<FeeInput, 'aov' | 'orders' | 'mix' | 'refundPct'> & { counted: number; unknown: number } {
  const paid = orders.filter((o) => o.method !== 'bank');
  const count = paid.length;
  const sum = paid.reduce((a, o) => a + o.total, 0);
  const by: Record<FeeMethod, number> = { mada: 0, card: 0, applepay: 0, bnpl: 0, cod: 0 };
  let unknown = 0;
  for (const o of paid) { if (!o.method) unknown++; by[(o.method ?? 'card') as FeeMethod]++; }
  const pct = (v: number) => (count ? String(Math.round((v * 1000) / count) / 10) : '');
  const mix = Object.fromEntries(FEE_METHODS.map((m) => [m, by[m] ? pct(by[m]) : ''])) as Record<FeeMethod, string>;
  // Rounding can leave the mix at 99.9 or 100.1; put the difference on the largest share so it totals 100.
  const sumMix = FEE_METHODS.reduce((a, m) => a + (parseNum(mix[m]) ?? 0), 0);
  const top = FEE_METHODS.reduce((a, m) => (by[m] > by[a] ? m : a), FEE_METHODS[0]);
  if (count && Math.abs(sumMix - 100) > 0.001) mix[top] = String(Math.round(((parseNum(mix[top]) ?? 0) + 100 - sumMix) * 10) / 10);
  const refunded = paid.filter((o) => o.refunded).reduce((a, o) => a + o.total, 0);
  return { aov: count ? (Math.round(sum / count) / 100).toFixed(2) : '', orders: String(count), mix, refundPct: sum ? String(Math.round((refunded * 1000) / sum) / 10) : '0', counted: count, unknown };
}
