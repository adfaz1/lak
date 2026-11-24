// Registry of every merchant tool the dashboard offers. One source for the global search, the tool
// directory, favourites and recents. A tool is a place the merchant can open (a section, a tab, a
// saved view or a flow), not a button inside a page. Sections add their tools here as they are built.
import type { L } from '../../merchant/domain';
import { canSee, type Page, type Role } from '../../merchant/perms';

export type ToolGroup = 'operate' | 'catalog' | 'customers' | 'money' | 'store' | 'team' | 'help';

export const GROUPS: { id: ToolGroup; label: L }[] = [
  { id: 'operate', label: { ar: 'الطلبات والتشغيل', en: 'Orders & operations' } },
  { id: 'catalog', label: { ar: 'المنتجات والمخزون', en: 'Products & inventory' } },
  { id: 'customers', label: { ar: 'العملاء والنمو', en: 'Customers & growth' } },
  { id: 'money', label: { ar: 'الأموال والتقارير', en: 'Money & reports' } },
  { id: 'store', label: { ar: 'المتجر وقنوات البيع', en: 'Store & sales channels' } },
  { id: 'team', label: { ar: 'الفريق والتكاملات', en: 'Team & integrations' } },
  { id: 'help', label: { ar: 'المساعدة', en: 'Help' } },
];

export interface Tool {
  id: string;
  group: ToolGroup;
  label: L;
  desc: L;
  /** Extra words people search with, both languages. */
  keys: string;
  /** Route below #/dashboard, and optional query. */
  path: string;
  query?: Record<string, string>;
  /** Roles that may open it; omitted = everyone (pages still enforce their own rules). */
  roles?: Role[];
}

const t = (id: string, group: ToolGroup, ar: string, en: string, dar: string, den: string, keys: string, path: string, query?: Record<string, string>, roles?: Role[]): Tool =>
  ({ id, group, label: { ar, en }, desc: { ar: dar, en: den }, keys, path, query, roles });

const MONEY: Role[] = ['owner', 'finance'];
const GROWTH: Role[] = ['owner', 'marketing'];

export const TOOLS: Tool[] = [
  t('orders', 'operate', 'كل الطلبات', 'All orders', 'البحث والتصفية والإجراءات الجماعية', 'Search, filter and bulk actions', 'orders طلبات طلب', 'orders'),
  t('orders-needs', 'operate', 'طلبات للتجهيز', 'Orders to fulfil', 'مدفوعة ولم تُجهّز بعد', 'Paid, not yet fulfilled', 'fulfil prepare pick pack تجهيز تغليف', 'orders', { view: 'needs' }),
  t('orders-late', 'operate', 'طلبات متأخرة', 'Late orders', 'مدفوعة منذ أكثر من 24 ساعة دون تجهيز', 'Paid more than 24 hours ago, not fulfilled', 'late delayed تأخر متأخر', 'orders', { view: 'late' }),
  t('orders-payfail', 'operate', 'دفع لم يكتمل', 'Payment not completed', 'طلبات فشل دفعها أو لم يُؤكَّد', 'Orders whose payment failed or is unconfirmed', 'payment failed declined دفع فشل مرفوض', 'orders', { view: 'payfail' }),

  t('products', 'catalog', 'المنتجات', 'Products', 'الكتالوج والمتغيرات والقنوات', 'Catalogue, variants and channels', 'products catalog sku منتجات كتالوج', 'products'),
  t('product-new', 'catalog', 'إضافة منتج', 'Add a product', 'منتج جديد بمتغيراته وصوره', 'A new product with variants and images', 'new add create إضافة جديد', 'products/new'),
  t('product-import', 'catalog', 'استيراد منتجات CSV', 'Import products (CSV)', 'رفع ملف ومعاينة الأخطاء قبل الحفظ', 'Upload a file and preview errors before saving', 'import csv upload excel استيراد رفع ملف', 'products/import'),
  t('inventory', 'catalog', 'المخزون', 'Inventory', 'الكميات لكل مستودع والتعديل بسبب', 'Quantities per warehouse, adjust with a reason', 'stock inventory warehouse مخزون كمية مستودع', 'inventory'),
  t('inventory-low', 'catalog', 'مخزون منخفض', 'Low stock', 'ما بلغ حد التنبيه أو نفد', 'At or below the alert level, or sold out', 'low out of stock نقص نفد منخفض', 'inventory', { tab: 'low' }),
  t('inventory-transfers', 'catalog', 'التحويل بين المستودعات', 'Transfers between warehouses', 'نقل الكميات ومتابعة استلامها', 'Move stock and track receipt', 'transfer move تحويل نقل', 'inventory', { tab: 'transfers' }),
  t('inventory-log', 'catalog', 'سجل حركة المخزون', 'Stock movement log', 'كل تعديل بسببه ومن قام به', 'Every change with its reason and who made it', 'log history audit سجل حركة', 'inventory', { tab: 'log' }),

  t('customers', 'customers', 'العملاء', 'Customers', 'ملف كل عميل وطلباته وشرائحه', 'Each customer with orders and segments', 'customers clients عملاء عميل', 'customers'),
  t('coupons', 'customers', 'الكوبونات والعروض', 'Coupons & offers', 'إنشاء كوبون ومعاينة أثره', 'Create a coupon and preview its effect', 'coupon discount offer كوبون خصم عرض', 'marketing', undefined, GROWTH),
  t('carts', 'customers', 'السلات المتروكة', 'Abandoned carts', 'استرجاع السلات بموافقة العميل', 'Recover carts with the customer’s consent', 'abandoned cart recovery سلة متروكة', 'marketing', { tab: 'carts' }, GROWTH),
  t('campaigns', 'customers', 'الحملات', 'Campaigns', 'رسائل لشريحة بعد معاينة التكلفة', 'Messages to a segment after a cost preview', 'campaign sms email whatsapp حملة رسائل', 'marketing', { tab: 'campaigns' }, GROWTH),
  t('automations', 'customers', 'الأتمتة', 'Automations', 'شرط ← إجراء ← نتيجة، مع سجل التشغيل', 'Condition → action → result, with a run log', 'automation workflow trigger أتمتة سير عمل', 'automations', undefined, GROWTH),
  t('automation-runs', 'customers', 'سجل تشغيل الأتمتة', 'Automation run log', 'ما نُفّذ وما فشل وإعادة المحاولة', 'What ran, what failed, and retry', 'runs log retry سجل تشغيل فشل', 'automations', { tab: 'runs' }, GROWTH),

  t('finance', 'money', 'المالية', 'Finance', 'المحصّل والمعلّق والمتاح والمحوّل', 'Collected, pending, available and paid out', 'finance money balance مالية رصيد', 'finance', undefined, MONEY),
  t('payouts', 'money', 'التحويلات وكشوف المطابقة', 'Payouts & statements', 'كل تحويل وما يشمله من طلبات ورسوم', 'Each payout and the orders and fees it covers', 'payout statement settlement reconcile تحويل تسوية كشف', 'finance', { tab: 'payouts' }, MONEY),
  t('transactions', 'money', 'العمليات', 'Transactions', 'كل عملية دفع واسترداد ورسوم', 'Every payment, refund and fee', 'transactions ledger عمليات حركات', 'finance', { tab: 'transactions' }, MONEY),
  t('billing', 'money', 'الباقة والفواتير', 'Plan & billing', 'باقتك وفواتير لك', 'Your plan and LAK invoices', 'plan billing invoice subscription باقة فاتورة اشتراك', 'finance', { tab: 'billing' }, MONEY),
  t('analytics', 'money', 'التقارير والتحليلات', 'Reports & analytics', 'المبيعات والتحويل والقنوات بفترات مقارنة', 'Sales, conversion and channels with comparison', 'reports analytics sales تقارير تحليلات مبيعات', 'analytics', undefined, ['owner', 'finance', 'marketing']),

  t('storefront', 'store', 'المتجر الإلكتروني', 'Online store', 'الثيم وأقسام الصفحة الرئيسية والنشر', 'Theme, homepage sections and publishing', 'theme design storefront ثيم تصميم واجهة', 'storefront'),
  t('appmaker', 'store', 'تطبيق متجرك', 'Your store app', 'الهوية والمعاينة والنشر في المتاجر', 'Identity, preview and publishing to the stores', 'app ios android mobile تطبيق جوال', 'appmaker'),
  t('channel', 'store', 'سوق لك', 'LAK marketplace', 'المنتجات المعروضة في السوق وحالتها', 'Your products in the marketplace and their status', 'marketplace market سوق', 'channel'),
  t('domains', 'store', 'النطاق', 'Domain', 'الرابط المجاني ونطاقك الخاص', 'Free link and your own domain', 'domain dns نطاق دومين', 'settings/domains'),
  t('policies', 'store', 'السياسات', 'Policies', 'الاسترجاع والشحن والخصوصية', 'Returns, shipping and privacy', 'policy returns privacy سياسة استرجاع', 'settings/policies'),
  t('shipping', 'store', 'الشحن', 'Shipping', 'المناطق والأسعار والشحن المجاني', 'Zones, rates and free shipping', 'shipping zones rates شحن مناطق', 'settings/shipping'),
  t('payments', 'store', 'مزودو الدفع', 'Payment providers', 'مدى والبطاقات وApple Pay والتقسيط', 'mada, cards, Apple Pay and instalments', 'payment mada apple pay tabby tamara دفع', 'settings/payments', undefined, MONEY),
  t('checkout', 'store', 'إتمام الطلب', 'Checkout', 'الشراء كضيف والإلغاء والدفع عند الاستلام', 'Guest checkout, cancellation and COD', 'checkout guest cod إتمام ضيف', 'settings/checkout'),

  t('team', 'team', 'الفريق والصلاحيات', 'Team & permissions', 'الأعضاء والأدوار والدعوات والسجل', 'Members, roles, invites and log', 'team staff roles permissions فريق موظف صلاحية دور', 'settings/team', undefined, ['owner']),
  t('apps', 'team', 'التطبيقات والتكاملات', 'Apps & integrations', 'حالة كل ربط وآخر مزامنة وأخطاؤها', 'Each connection’s status, last sync and errors', 'apps integrations sync تطبيقات ربط تكامل مزامنة', 'apps'),
  t('settings', 'team', 'كل الإعدادات', 'All settings', 'بيانات المتجر والإشعارات واللغة', 'Store details, notifications and language', 'settings preferences إعدادات', 'settings'),
  t('store-details', 'team', 'بيانات المتجر', 'Store details', 'الاسم والفئة ووسائل التواصل', 'Name, category and contact', 'store name contact اسم المتجر تواصل', 'settings/store'),
  t('notifications', 'team', 'الإشعارات', 'Notifications', 'تنبيهاتك لكل حدث', 'Your alerts per event', 'notifications alerts إشعار تنبيه', 'settings/notifications'),
  t('language', 'team', 'اللغة والمنطقة', 'Language & region', 'لغة اللوحة ولغات المتجر والتوقيت', 'Admin language, store languages and time zone', 'language region timezone لغة توقيت', 'settings/language'),

  t('help', 'help', 'المساعدة', 'Help', 'شروح قصيرة وطلب دعم', 'Short how-tos and support', 'help support دعم مساعدة', 'help'),
];

export const toolById = (id: string): Tool | undefined => TOOLS.find((x) => x.id === id);
/** The permission page a dashboard route belongs to. Channels follow the online-store permission. */
export function pageOf(path: string): Page | null {
  const head = path.split('/')[0];
  if (head === 'channel' || head === 'appmaker') return 'storefront';
  if (head === 'tools') return null;
  return head as Page;
}
/** A tool is usable when the role can open its section and, if narrowed further, is listed. */
export const canUseTool = (tool: Tool, role: Role): boolean => {
  const page = pageOf(tool.path);
  return (!page || canSee(role, page)) && (!tool.roles || tool.roles.includes(role));
};

/** The most specific tool for a route: same path, and every query key of the tool present with the same value. */
export function matchTool(path: string[], query: URLSearchParams, tools: Tool[] = TOOLS): Tool | undefined {
  const p = path.join('/');
  const fits = tools.filter((x) => x.path === p && Object.entries(x.query ?? {}).every(([k, v]) => query.get(k) === v));
  return fits.sort((a, b) => Object.keys(b.query ?? {}).length - Object.keys(a.query ?? {}).length)[0];
}
