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
  t('work', 'operate', 'مركز العمل اليومي', 'Daily work centre', 'كل ما يحتاج إجراءً مرتبًا بأثره', 'Everything that needs action, ranked by impact', 'work queue tasks todo inbox مهام طابور عمل يحتاجك', 'work'),
  t('assistant', 'operate', 'المساعد', 'Assistant', 'لماذا تغيّرت أرقامك، بالدليل واقتراح مسودة', 'Why your numbers changed, with evidence and a draft', 'assistant insights why explain مساعد لماذا تفسير رؤى', 'assistant'),
  t('orders', 'operate', 'كل الطلبات', 'All orders', 'البحث والتصفية والإجراءات الجماعية', 'Search, filter and bulk actions', 'orders طلبات طلب', 'orders'),
  t('orders-needs', 'operate', 'طلبات للتجهيز', 'Orders to fulfil', 'مدفوعة ولم تُجهّز بعد', 'Paid, not yet fulfilled', 'fulfil prepare pick pack تجهيز تغليف', 'orders', { view: 'needs' }),
  t('orders-late', 'operate', 'طلبات متأخرة', 'Late orders', 'مدفوعة منذ أكثر من 24 ساعة دون تجهيز', 'Paid more than 24 hours ago, not fulfilled', 'late delayed تأخر متأخر', 'orders', { view: 'late' }),
  t('orders-payfail', 'operate', 'دفع لم يكتمل', 'Payment not completed', 'طلبات فشل دفعها أو لم يُؤكَّد', 'Orders whose payment failed or is unconfirmed', 'payment failed declined دفع فشل مرفوض', 'orders', { view: 'payfail' }),
  t('orders-new', 'operate', 'طلب يدوي', 'Manual order', 'إنشاء طلب لعميل مع حجز المخزون', 'Create an order for a customer and hold stock', 'manual new create draft phone order طلب يدوي جديد إنشاء هاتف', 'orders/new', undefined, ['owner', 'fulfilment']),
  t('orders-returns', 'operate', 'المرتجعات والاستبدال', 'Returns & exchanges', 'طلب ← موافقة ← استلام ← فحص ← رد أو استبدال', 'Request → approve → receive → inspect → refund or exchange', 'returns rma exchange refund مرتجع استرجاع استبدال', 'orders/returns'),
  t('orders-shipped', 'operate', 'طلبات مشحونة', 'Shipped orders', 'صدر ملصقها أو في الطريق أو سُلّمت', 'Labelled, in transit or delivered', 'shipped transit delivered tracking شحن تتبع تسليم', 'orders', { view: 'shipped' }),
  t('orders-cancelled', 'operate', 'طلبات ملغاة', 'Cancelled orders', 'الطلبات الملغاة وسبب الإلغاء', 'Cancelled orders and why', 'cancelled cancel void ملغى إلغاء', 'orders', { view: 'cancelled' }),
  t('orders-cod', 'operate', 'الدفع عند الاستلام', 'Cash on delivery orders', 'طلبات تُحصّل عند التسليم', 'Orders collected on delivery', 'cod cash on delivery دفع عند الاستلام نقدي', 'orders', { method: 'cod' }),

  t('products', 'catalog', 'المنتجات', 'Products', 'الكتالوج والمتغيرات والقنوات', 'Catalogue, variants and channels', 'products catalog sku منتجات كتالوج', 'products'),
  t('product-new', 'catalog', 'إضافة منتج', 'Add a product', 'منتج جديد بمتغيراته وصوره', 'A new product with variants and images', 'new add create إضافة جديد', 'products/new'),
  t('product-import', 'catalog', 'استيراد منتجات CSV', 'Import products (CSV)', 'رفع ملف ومعاينة الأخطاء قبل الحفظ', 'Upload a file and preview errors before saving', 'import csv upload excel استيراد رفع ملف', 'products/import'),
  t('inventory', 'catalog', 'المخزون', 'Inventory', 'الكميات لكل مستودع والتعديل بسبب', 'Quantities per warehouse, adjust with a reason', 'stock inventory warehouse مخزون كمية مستودع', 'inventory'),
  t('inventory-low', 'catalog', 'مخزون منخفض', 'Low stock', 'ما بلغ حد التنبيه أو نفد', 'At or below the alert level, or sold out', 'low out of stock نقص نفد منخفض', 'inventory', { tab: 'low' }),
  t('inventory-transfers', 'catalog', 'التحويل بين المستودعات', 'Transfers between warehouses', 'نقل الكميات ومتابعة استلامها', 'Move stock and track receipt', 'transfer move تحويل نقل', 'inventory', { tab: 'transfers' }),
  t('inventory-log', 'catalog', 'سجل حركة المخزون', 'Stock movement log', 'كل تعديل بسببه ومن قام به', 'Every change with its reason and who made it', 'log history audit سجل حركة', 'inventory', { tab: 'log' }),
  t('product-categories', 'catalog', 'الفئات', 'Categories', 'شجرة الفئات وترتيب قائمة المتجر', 'Category tree and store menu order', 'categories category tree menu فئات فئة تصنيف قائمة', 'products/categories'),
  t('product-collections', 'catalog', 'المجموعات', 'Collections', 'مجموعات يدوية أو ذكية بشروط', 'Manual or rule-based collections', 'collections smart rules مجموعات مجموعة ذكية شروط', 'products/collections'),
  t('collection-new', 'catalog', 'إنشاء مجموعة', 'Create a collection', 'معاينة المنتجات المطابقة قبل الحفظ', 'Preview matching products before saving', 'new collection create إنشاء مجموعة جديدة', 'products/collections/new'),
  t('inventory-locations', 'catalog', 'المستودعات والفروع', 'Warehouses & branches', 'إضافة موقع وتعطيله بسبب', 'Add a location, disable it with a reason', 'locations warehouse branch store مستودع فرع موقع مواقع', 'inventory/locations'),
  t('inventory-count', 'catalog', 'استيراد جرد المخزون', 'Import a stock count', 'ملف جرد مع الفرق لكل صنف وموقع قبل الكتابة', 'A count file with the difference per SKU and location before writing', 'count stocktake import csv جرد عد استيراد', 'inventory/import'),

  t('customers', 'customers', 'العملاء', 'Customers', 'ملف كل عميل وطلباته وشرائحه', 'Each customer with orders and segments', 'customers clients عملاء عميل', 'customers'),
  t('coupons', 'customers', 'الكوبونات والعروض', 'Coupons & offers', 'إنشاء كوبون ومعاينة أثره', 'Create a coupon and preview its effect', 'coupon discount offer كوبون خصم عرض', 'marketing', undefined, GROWTH),
  t('carts', 'customers', 'السلات المتروكة', 'Abandoned carts', 'استرجاع السلات بموافقة العميل', 'Recover carts with the customer’s consent', 'abandoned cart recovery سلة متروكة', 'marketing', { tab: 'carts' }, GROWTH),
  t('campaigns', 'customers', 'الحملات', 'Campaigns', 'رسائل لشريحة بعد معاينة التكلفة', 'Messages to a segment after a cost preview', 'campaign sms email whatsapp حملة رسائل', 'marketing', { tab: 'campaigns' }, GROWTH),
  t('automations', 'customers', 'الأتمتة', 'Automations', 'شرط ← إجراء ← نتيجة، مع سجل التشغيل', 'Condition → action → result, with a run log', 'automation workflow trigger أتمتة سير عمل', 'automations', undefined, GROWTH),
  t('automation-runs', 'customers', 'سجل تشغيل الأتمتة', 'Automation run log', 'ما نُفّذ وما فشل وإعادة المحاولة', 'What ran, what failed, and retry', 'runs log retry سجل تشغيل فشل', 'automations', { tab: 'runs' }, GROWTH),
  t('automation-followup', 'customers', 'تشغيلات تحتاج متابعة', 'Runs needing follow-up', 'فشل لم تحله إعادة المحاولة', 'Failures a retry did not fix', 'follow up failed retry dead letter متابعة فشل', 'automations', { tab: 'runs', outcome: 'followup' }, GROWTH),
  t('offers-auto', 'customers', 'العروض التلقائية', 'Automatic offers', 'خصم بلا كود، واشترِ X واحصل على Y', 'Discounts with no code, and buy X get Y', 'automatic offer bogo buy get عرض تلقائي اشتر واحصل', 'marketing', { how: 'auto' }, GROWTH),
  t('offer-new-auto', 'customers', 'عرض تلقائي جديد', 'New automatic offer', 'خصم على تصنيف أو منتجات يُطبَّق في السلة', 'A category or product discount applied in the bag', 'new offer bogo category discount عرض جديد خصم تصنيف', 'marketing/coupons/new', { auto: '1' }, GROWTH),
  t('carts-recovered', 'customers', 'السلال المسترجعة', 'Recovered carts', 'السلال التي اشترى أصحابها بعد رسالة وإيرادها', 'Carts bought after a message, with revenue', 'recovered carts revenue سلال مسترجعة إيراد', 'marketing', { tab: 'carts', cview: 'recovered' }, GROWTH),
  t('loyalty', 'customers', 'برنامج الولاء', 'Loyalty programme', 'قواعد النقاط والأرصدة والاستبدال', 'Points rules, balances and redemption', 'loyalty points rewards ولاء نقاط مكافآت', 'marketing/loyalty', undefined, GROWTH),
  t('gift-cards', 'customers', 'بطاقات الهدايا', 'Gift cards', 'إصدار البطاقات وأرصدتها واستخدامها', 'Issue cards, balances and use', 'gift card voucher بطاقة هدية قسيمة', 'marketing/gift-cards', undefined, GROWTH),
  t('reviews', 'customers', 'التقييمات والأسئلة', 'Reviews & questions', 'اعتماد وإخفاء ورد وإبلاغ', 'Approve, hide, reply and report', 'reviews ratings questions moderation تقييمات أسئلة مراجعة', 'marketing/reviews', undefined, GROWTH),
  t('segment-new', 'customers', 'شريحة عملاء جديدة', 'New customer segment', 'قواعد على الإنفاق والطلبات والمدينة بعدد مباشر', 'Rules on spend, orders and city with a live count', 'segment audience rules شريحة جمهور', 'customers/segments/new', undefined, GROWTH),
  t('customers-import', 'customers', 'استيراد العملاء', 'Import customers', 'ملف CSV بمعاينة كل سطر', 'A CSV file with every row previewed', 'import customers csv استيراد عملاء', 'customers/import', undefined, GROWTH),

  t('finance', 'money', 'المالية', 'Finance', 'المحصّل والمعلّق والمتاح والمحوّل', 'Collected, pending, available and paid out', 'finance money balance مالية رصيد', 'finance', undefined, MONEY),
  t('payouts', 'money', 'التحويلات وكشوف المطابقة', 'Payouts & statements', 'كل تحويل وما يشمله من طلبات ورسوم', 'Each payout and the orders and fees it covers', 'payout statement settlement reconcile تحويل تسوية كشف', 'finance', { tab: 'payouts' }, MONEY),
  t('transactions', 'money', 'العمليات', 'Transactions', 'كل عملية دفع واسترداد ورسوم', 'Every payment, refund and fee', 'transactions ledger عمليات حركات', 'finance', { tab: 'transactions' }, MONEY),
  t('billing', 'money', 'الباقة والفواتير', 'Plan & billing', 'باقتك وفواتير لك', 'Your plan and LAK invoices', 'plan billing invoice subscription باقة فاتورة اشتراك', 'finance', { tab: 'billing' }, MONEY),
  t('invoices', 'money', 'الفواتير', 'Invoices', 'فواتير لك وفواتير مبيعاتك مع التصدير', 'LAK invoices and your sales invoices, with export', 'invoices tax vat zatca فواتير فاتورة ضريبية', 'finance', { tab: 'invoices' }, MONEY),
  t('sales-invoices', 'money', 'فواتير المبيعات', 'Sales invoices', 'فاتورة لكل طلب مدفوع', 'One invoice per paid order', 'sales invoice order فاتورة مبيعات', 'finance', { tab: 'invoices', kind: 'sales' }, MONEY),
  t('held-funds', 'money', 'المبالغ المحجوزة', 'Held funds', 'مبالغ يحتجزها المزود بسبب اعتراض', 'Funds the provider holds for a dispute', 'held dispute chargeback محجوز اعتراض', 'finance', { tab: 'transactions', status: 'held' }, MONEY),
  t('report-sales', 'money', 'تقرير المبيعات', 'Sales report', 'الإجمالي والخصومات والاستردادات والصافي والهامش', 'Gross, discounts, refunds, net and margin', 'sales report margin تقرير مبيعات هامش', 'analytics', { report: 'sales' }, ['owner', 'finance', 'marketing']),
  t('report-funnel', 'money', 'قمع التحويل', 'Conversion funnel', 'زيارة ثم سلة ثم دفع ثم طلب', 'Visit, cart, checkout, order', 'funnel conversion قمع تحويل', 'analytics', { report: 'funnel' }, ['owner', 'finance', 'marketing']),
  t('report-products', 'money', 'تقرير المنتجات', 'Products report', 'الأكثر والأقل مبيعًا والهامش', 'Best, worst and margin', 'products best worst margin منتجات', 'analytics', { report: 'products' }, ['owner', 'finance', 'marketing']),
  t('report-customers', 'money', 'تقرير العملاء', 'Customers report', 'جدد وعائدون وأفواج', 'New vs returning and cohorts', 'customers cohorts returning عملاء أفواج', 'analytics', { report: 'customers' }, ['owner', 'finance', 'marketing']),
  t('report-channels', 'money', 'تقرير القنوات', 'Channels report', 'كل قناة مقارنة بالفترة السابقة', 'Each channel vs the previous period', 'channels marketplace app قنوات', 'analytics', { report: 'channels' }, ['owner', 'finance', 'marketing']),
  t('report-coupons', 'money', 'تقرير الكوبونات', 'Coupons report', 'الطلبات والخصم والإيراد لكل كوبون', 'Orders, discount and revenue per coupon', 'coupons report كوبونات', 'analytics', { report: 'coupons' }, ['owner', 'finance', 'marketing']),
  t('report-carts', 'money', 'تقرير السلال المتروكة', 'Abandoned carts report', 'المفقود والمسترد ونسبة الاسترداد', 'Lost, recovered and recovery rate', 'abandoned carts سلال متروكة', 'analytics', { report: 'carts' }, ['owner', 'finance', 'marketing']),
  t('report-payments', 'money', 'تقرير المدفوعات', 'Payments report', 'نجاح الدفع والاستردادات والرسوم', 'Payment success, refunds and fees', 'payments success refunds fees مدفوعات', 'analytics', { report: 'payments' }, ['owner', 'finance', 'marketing']),
  t('bank-transfer', 'money', 'حساب التحويل البنكي', 'Bank-transfer account', 'الآيبان واسم المستفيد للعملاء', 'IBAN and beneficiary for shoppers', 'iban bank transfer آيبان تحويل بنكي', 'settings/payments', { section: 'bank' }, MONEY),
  t('analytics', 'money', 'التقارير والتحليلات', 'Reports & analytics', 'المبيعات والتحويل والقنوات بفترات مقارنة', 'Sales, conversion and channels with comparison', 'reports analytics sales تقارير تحليلات مبيعات', 'analytics', undefined, ['owner', 'finance', 'marketing']),

  t('storefront', 'store', 'المتجر الإلكتروني', 'Online store', 'الثيم وأقسام الصفحة الرئيسية والنشر', 'Theme, homepage sections and publishing', 'theme design storefront ثيم تصميم واجهة', 'storefront'),
  t('appmaker', 'store', 'تطبيق متجرك', 'Your store app', 'الهوية والمعاينة والنشر في المتاجر', 'Identity, preview and publishing to the stores', 'app ios android mobile تطبيق جوال', 'appmaker'),
  t('channel', 'store', 'سوق لك', 'LAK marketplace', 'المنتجات المعروضة في السوق وحالتها', 'Your products in the marketplace and their status', 'marketplace market سوق', 'channel'),
  t('domains', 'store', 'النطاق', 'Domain', 'الرابط المجاني ونطاقك الخاص', 'Free link and your own domain', 'domain dns نطاق دومين', 'settings/domains'),
  t('policies', 'store', 'السياسات', 'Policies', 'الاسترجاع والشحن والخصوصية', 'Returns, shipping and privacy', 'policy returns privacy سياسة استرجاع', 'settings/policies'),
  t('shipping', 'store', 'الشحن', 'Shipping', 'المناطق والأسعار والشحن المجاني', 'Zones, rates and free shipping', 'shipping zones rates شحن مناطق', 'settings/shipping'),
  t('payments', 'store', 'مزودو الدفع', 'Payment providers', 'مدى والبطاقات وApple Pay والتقسيط', 'mada, cards, Apple Pay and instalments', 'payment mada apple pay tabby tamara دفع', 'settings/payments', undefined, MONEY),
  t('checkout', 'store', 'إتمام الطلب', 'Checkout', 'الشراء كضيف والإلغاء والدفع عند الاستلام', 'Guest checkout, cancellation and COD', 'checkout guest cod إتمام ضيف', 'settings/checkout'),
  t('store-pages', 'store', 'صفحات المتجر', 'Store pages', 'من نحن وتواصل معنا وصفحاتك الخاصة', 'About, contact and your own pages', 'pages about contact page صفحات من نحن تواصل صفحة', 'storefront/pages'),
  t('store-menus', 'store', 'قوائم المتجر', 'Store menus', 'روابط رأس المتجر وتذييله وترتيبها', 'Header and footer links and their order', 'menu navigation header footer links قائمة قوائم تنقل روابط', 'storefront/menus'),
  t('seo', 'store', 'محركات البحث (SEO)', 'Search engines (SEO)', 'عنوان ووصف المتجر والمنتجات وخريطة الموقع', 'Store and product titles, descriptions and sitemap', 'seo sitemap robots google search meta بحث جوجل خريطة الموقع', 'storefront/seo'),
  t('channels', 'store', 'كل قنوات البيع', 'All sales channels', 'حالة كل قناة وما تحتاجه', 'Each channel’s status and what it needs', 'channels pos wholesale tiktok snapchat قنوات نقاط البيع جملة تيك توك سناب', 'channel/all'),

  t('team', 'team', 'الفريق والصلاحيات', 'Team & permissions', 'الأعضاء والأدوار والدعوات والسجل', 'Members, roles, invites and log', 'team staff roles permissions فريق موظف صلاحية دور', 'settings/team', undefined, ['owner']),
  t('apps', 'team', 'التطبيقات والتكاملات', 'Apps & integrations', 'حالة كل ربط وآخر مزامنة وأخطاؤها', 'Each connection’s status, last sync and errors', 'apps integrations sync تطبيقات ربط تكامل مزامنة', 'apps'),
  t('settings', 'team', 'كل الإعدادات', 'All settings', 'بيانات المتجر والإشعارات واللغة', 'Store details, notifications and language', 'settings preferences إعدادات', 'settings'),
  t('store-details', 'team', 'بيانات المتجر', 'Store details', 'الاسم والفئة ووسائل التواصل', 'Name, category and contact', 'store name contact اسم المتجر تواصل', 'settings/store'),
  t('notifications', 'team', 'الإشعارات', 'Notifications', 'تنبيهاتك لكل حدث', 'Your alerts per event', 'notifications alerts إشعار تنبيه', 'settings/notifications'),
  t('language', 'team', 'اللغة والمنطقة', 'Language & region', 'لغة اللوحة ولغات المتجر والتوقيت', 'Admin language, store languages and time zone', 'language region timezone لغة توقيت', 'settings/language'),
  t('account', 'team', 'حسابي', 'My account', 'ملفك الشخصي وتنبيهاتك', 'Your profile and alerts', 'profile account me ملف حسابي اسمي', 'settings/account'),
  t('account-alerts', 'team', 'تنبيهاتي', 'My alerts', 'تنبيهاتك لكل حدث وقناة', 'Your alerts per event and channel', 'alerts notifications preferences تنبيهات تفضيلات', 'settings/account', { tab: 'alerts' }),
  t('account-security', 'team', 'الأمان والأجهزة', 'Security & devices', 'التحقق بخطوتين والأجهزة المسجّلة', 'Two-step verification and signed-in devices', '2fa two-factor otp sessions devices logout تحقق خطوتين جلسات أجهزة خروج', 'settings/account', { tab: 'security' }),
  t('activity-log', 'team', 'سجل النشاط', 'Activity log', 'من فعل ماذا ومتى في الحساب', 'Who did what, and when, in the account', 'audit log activity history سجل نشاط تدقيق', 'settings/team', undefined, ['owner']),
  t('apps-attention', 'team', 'تكاملات تحتاج انتباهك', 'Integrations needing attention', 'ربط فشل أو انتهى تفويضه وطريقة إصلاحه', 'Failed or expired connections and how to fix them', 'integration error sync failed reconnect فشل مزامنة إعادة ربط', 'apps', { view: 'attention' }),

  t('help', 'help', 'المساعدة', 'Help', 'شروح قصيرة وطلب دعم', 'Short how-tos and support', 'help support دعم مساعدة', 'help'),
];

export const toolById = (id: string): Tool | undefined => TOOLS.find((x) => x.id === id);
/** The permission page a dashboard route belongs to. Channels follow the online-store permission. */
export function pageOf(path: string): Page | null {
  const head = path.split('/')[0];
  if (head === 'channel' || head === 'appmaker') return 'storefront';
  if (head === 'tools') return null;
  if (head === 'work' || head === 'assistant') return 'home';
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
