import type { Cell, L, PlanId, Searchable } from './domain';

/* Site content in Arabic and English. Source: blueprint P01 (PDF pp. 2–6) and the plan matrix (PDF pp. 42–45).
   Everything here is draft copy for the prototype: no prices, no invented merchants, no unapproved metrics. */

const y: Cell = { k: 'yes' };
const n: Cell = { k: 'no' };
const tx = (ar: string, en: string): Cell => ({ k: 'text', v: { ar, en } });
const pend = (ar: string, en: string): Cell => ({ k: 'pending', v: { ar, en } });

/* ---------------- plans ---------------- */

export const PLANS: Record<PlanId, { name: string; tagline: L; cta: L }> = {
  basic: {
    name: 'Basic',
    tagline: { ar: 'أساسيات البيع: المنتجات والطلبات والعملاء والكوبونات، والدفع عند الاستلام والتحويل البنكي.', en: 'Selling essentials: products, orders, customers, coupons, cash on delivery and bank transfer.' },
    cta: { ar: 'ابدأ بباقة Basic', en: 'Start with Basic' },
  },
  plus: {
    name: 'Plus',
    tagline: { ar: 'يضيف الدفع الإلكتروني وبوالص الشحن والولاء والإعلانات ومنشئ الثيمات.', en: 'Adds online payments, shipping labels, loyalty, ads and the theme builder.' },
    cta: { ar: 'ابدأ بباقة Plus', en: 'Start with Plus' },
  },
  pro: {
    name: 'Pro',
    tagline: { ar: 'يضيف تعدد المتاجر وأدوار الفريق وشرائح العملاء والتسويق بالعمولة والمؤثرين.', en: 'Adds multiple stores, staff roles, customer segments, affiliate and influencer tools.' },
    cta: { ar: 'ابدأ بباقة Pro', en: 'Start with Pro' },
  },
  special: {
    name: 'Special',
    tagline: { ar: 'للمنشآت الكبيرة: ربط ERP وتكاملات خاصة ورسوم مرنة ومدير حساب مخصص.', en: 'For large businesses: ERP, custom integrations, flexible fees and a dedicated account manager.' },
    cta: { ar: 'تحدث مع فريق المبيعات', en: 'Talk to sales' },
  },
};

export type NoteId = 'unlimited' | 'commission' | 'vat' | 'rbac' | 'domain' | 'fleet';

export const NOTES: Record<NoteId, L> = {
  unlimited: { ar: '«غير محدود» وارد في المخطط؛ حدود الاستخدام العادل التقنية ستُحدد في شروط الباقة.', en: '“Unlimited” comes from the blueprint; technical fair-use limits will be set in the plan terms.' },
  commission: { ar: 'يقترح المخطط 0% عمولة مبيعات لـ Basic وPlus وPro ورسومًا تفاوضية لـ Special. هذا لا يحسم رسوم الدفع والشحن، وهي غير معتمدة بعد.', en: 'The blueprint proposes 0% sales commission on Basic, Plus and Pro and negotiated fees on Special. This does not settle payment and shipping fees, which are not approved yet.' },
  vat: { ar: 'الفواتير الضريبية والربط مع «فاتورة» هدف في المخطط. لا نصف الحالة بأنها ممتثلة قبل التحقق الرسمي.', en: 'Tax invoices and ZATCA e-invoicing are a blueprint target. We do not describe it as compliant before formal verification.' },
  rbac: { ar: 'عزل البيانات والصلاحيات الأساسية لازمة لكل حساب؛ الأدوار المخصصة هي ما يبدأ من Pro.', en: 'Data isolation and basic permissions apply to every account; custom roles are what starts at Pro.' },
  domain: { ar: 'يذكر المخطط نطاقًا مجانيًا لـ Pro وSpecial؛ الشروط والمدة بانتظار الاعتماد.', en: 'The blueprint lists a free domain on Pro and Special; terms and duration are awaiting approval.' },
  fleet: { ar: 'أسعار الشحن المخفضة تعتمد على عقود الناقلين، ولم تُعتمد بعد.', en: 'Discounted shipping rates depend on carrier contracts and are not approved yet.' },
};

export interface MatrixRow { id: string; label: L; cells: Cell[]; note?: NoteId }
export interface MatrixGroup { id: string; title: L; rows: MatrixRow[] }

export const MATRIX: MatrixGroup[] = [
  {
    id: 'core', title: { ar: 'أساس المتجر', en: 'Store core' },
    rows: [
      { id: 'products', label: { ar: 'منتجات غير محدودة', en: 'Unlimited products' }, cells: [y, y, y, y], note: 'unlimited' },
      { id: 'customers', label: { ar: 'عملاء غير محدودين', en: 'Unlimited customers' }, cells: [y, y, y, y], note: 'unlimited' },
      { id: 'orders', label: { ar: 'طلبات غير محدودة', en: 'Unlimited orders' }, cells: [y, y, y, y], note: 'unlimited' },
      { id: 'commission', label: { ar: 'عمولة المبيعات', en: 'Sales commission' }, cells: [pend('مقترح 0%', 'Proposed 0%'), pend('مقترح 0%', 'Proposed 0%'), pend('مقترح 0%', 'Proposed 0%'), pend('تفاوضية', 'Negotiated')], note: 'commission' },
      { id: 'coupons', label: { ar: 'الكوبونات وأكواد الخصم', en: 'Coupons and discount codes' }, cells: [y, y, y, y] },
      { id: 'reviews', label: { ar: 'تقييمات العملاء والأسئلة', en: 'Customer reviews and Q&A' }, cells: [y, y, y, y] },
      { id: 'market', label: { ar: 'العرض التلقائي في سوق لك', en: 'LAK marketplace auto-listing' }, cells: [y, y, y, y] },
      { id: 'vat', label: { ar: 'ضريبة القيمة المضافة وفاتورة', en: 'VAT and ZATCA e-invoicing' }, cells: [y, y, y, y], note: 'vat' },
    ],
  },
  {
    id: 'pay', title: { ar: 'الدفع والشحن', en: 'Payments and shipping' },
    rows: [
      { id: 'cod', label: { ar: 'الدفع عند الاستلام', en: 'Cash on delivery' }, cells: [y, y, y, y] },
      { id: 'bank', label: { ar: 'التحويل البنكي', en: 'Bank transfer' }, cells: [y, y, y, y] },
      { id: 'online', label: { ar: 'الدفع الإلكتروني (مدى، البطاقات، Apple Pay…)', en: 'Online payments (mada, cards, Apple Pay…)' }, cells: [n, y, y, y] },
      { id: 'fleet', label: { ar: 'أسطول الشحن العالمي بأسعار مخفضة', en: 'Global shipping fleet at discounted rates' }, cells: [n, y, y, y], note: 'fleet' },
      { id: 'labels', label: { ar: 'بوالص شحن لك ومركز الجودة', en: 'LAK shipping labels and quality center' }, cells: [n, y, y, y] },
      { id: 'restrict', label: { ar: 'تقييد ظهور طرق الشحن', en: 'Restrict shipping visibility' }, cells: [n, n, y, y] },
      { id: 'bankoffers', label: { ar: 'عروض البنوك عند الدفع', en: 'Bank offers at checkout' }, cells: [n, n, y, y] },
      { id: 'flexfees', label: { ar: 'رسوم دفع مرنة', en: 'Flexible payment fees' }, cells: [n, n, n, y] },
    ],
  },
  {
    id: 'growth', title: { ar: 'النمو والتسويق', en: 'Growth and marketing' },
    rows: [
      { id: 'wallet', label: { ar: 'محفظة العميل', en: 'Customer wallet' }, cells: [n, y, y, y] },
      { id: 'gift', label: { ar: 'بطاقات الهدايا', en: 'Gift cards' }, cells: [n, y, y, y] },
      { id: 'loyalty', label: { ar: 'برنامج نقاط الولاء', en: 'Loyalty points' }, cells: [n, y, y, y] },
      { id: 'cashback', label: { ar: 'الاسترداد النقدي (كاش باك)', en: 'Cashback' }, cells: [n, y, y, y] },
      { id: 'ads', label: { ar: 'إعلانات لك (كل القنوات)', en: 'LAK Ads (all channels)' }, cells: [n, y, y, y] },
      { id: 'email', label: { ar: 'حملات البريد والرسائل النصية', en: 'Email and SMS campaigns' }, cells: [n, y, y, y] },
      { id: 'wholesale', label: { ar: 'سوق الجملة B2B', en: 'LAK Wholesale B2B marketplace' }, cells: [n, y, y, y] },
      { id: 'segments', label: { ar: 'شرائح العملاء', en: 'Customer segmentation' }, cells: [n, n, y, y] },
      { id: 'affiliate', label: { ar: 'التسويق بالعمولة', en: 'Affiliate program' }, cells: [n, n, y, y] },
      { id: 'influencer', label: { ar: 'حملات المؤثرين', en: 'Influencer campaigns' }, cells: [n, n, y, y] },
    ],
  },
  {
    id: 'design', title: { ar: 'التصميم والقنوات', en: 'Design and channels' },
    rows: [
      { id: 'domain', label: { ar: 'النطاق', en: 'Domain' }, cells: [tx('ربط', 'Connect'), tx('ربط أو تسجيل', 'Connect or register'), pend('نطاق مشمول', 'Included domain'), pend('نطاق مشمول', 'Included domain')], note: 'domain' },
      { id: 'builder', label: { ar: 'منشئ ثيمات لك', en: 'LAK theme builder' }, cells: [n, y, y, y] },
      { id: 'landing', label: { ar: 'صفحات الهبوط', en: 'Landing pages' }, cells: [n, y, y, y] },
      { id: 'code', label: { ar: 'أكواد CSS وJS مخصصة', en: 'Custom CSS / JS' }, cells: [n, y, y, y] },
      { id: '3d', label: { ar: 'عرض المنتج ثلاثي الأبعاد', en: '3D product view' }, cells: [n, n, y, y] },
      { id: 'bulk', label: { ar: 'تسعير الكميات', en: 'Bulk / quantity pricing' }, cells: [n, n, y, y] },
      { id: 'appmaker', label: { ar: 'صانع التطبيقات', en: 'App Maker (mobile app)' }, cells: [n, tx('إضافة', 'Add-on'), tx('إضافة', 'Add-on'), tx('إضافة', 'Add-on')] },
    ],
  },
  {
    id: 'ops', title: { ar: 'التشغيل والفريق', en: 'Operations and team' },
    rows: [
      { id: 'reports', label: { ar: 'التقارير الأساسية', en: 'Basic reports' }, cells: [y, y, y, y] },
      { id: 'advreports', label: { ar: 'التقارير والتحليلات المتقدمة', en: 'Advanced reports and analytics' }, cells: [n, tx('محدودة', 'Limited'), tx('كاملة', 'Full'), tx('كاملة', 'Full')] },
      { id: 'staff', label: { ar: 'حسابات الموظفين', en: 'Staff accounts' }, cells: [tx('1', '1'), tx('3', '3'), tx('غير محدود', 'Unlimited'), tx('غير محدود', 'Unlimited')] },
      { id: 'rbac', label: { ar: 'أدوار وصلاحيات مخصصة', en: 'Custom staff roles' }, cells: [n, n, y, y], note: 'rbac' },
      { id: 'stores', label: { ar: 'عدد المتاجر', en: 'Stores' }, cells: [tx('1', '1'), tx('1', '1'), tx('غير محدود', 'Unlimited'), tx('غير محدود', 'Unlimited')] },
      { id: 'warehouse', label: { ar: 'توجيه المستودع حسب المدينة', en: 'Auto-assign warehouse by city' }, cells: [n, n, y, y] },
      { id: 'booking', label: { ar: 'جدولة الطلبات والحجوزات', en: 'Order scheduling / booking' }, cells: [n, n, y, y] },
      { id: 'accounting', label: { ar: 'ربط أنظمة المحاسبة', en: 'Accounting integrations' }, cells: [n, y, y, y] },
      { id: 'erp', label: { ar: 'ربط ERP', en: 'ERP integration' }, cells: [n, n, tx('محدود', 'Limited'), tx('كامل', 'Full')] },
      { id: 'branch', label: { ar: 'الفروع المتقدمة', en: 'Multi-branch' }, cells: [n, n, tx('أساسي', 'Basic'), tx('متقدم', 'Advanced')] },
    ],
  },
  {
    id: 'support', title: { ar: 'الدعم', en: 'Support' },
    rows: [
      { id: 'manager', label: { ar: 'مدير حساب مخصص', en: 'Dedicated account manager' }, cells: [n, n, n, y] },
      { id: 'custom', label: { ar: 'تكاملات خاصة', en: 'Custom integrations' }, cells: [n, n, n, y] },
      { id: 'sla', label: { ar: 'دعم ذو أولوية باتفاقية مستوى خدمة', en: 'SLA-backed priority support' }, cells: [n, n, n, y] },
    ],
  },
];

export const PLAN_FAQ: { q: L; a: L }[] = [
  { q: { ar: 'لماذا لا تظهر الأسعار؟', en: 'Why are there no prices?' },
    a: { ar: 'أسعار الباقات وشروط التجديد لم تُعتمد بعد. سننشرها مع ما يشمله كل سعر وما لا يشمله، بدل وضع أرقام مؤقتة قد تتغير.', en: 'Plan prices and renewal terms are not approved yet. We will publish them together with what each price includes and excludes, rather than show placeholder numbers that may change.' } },
  { q: { ar: 'ما الفرق بين الدفع الشهري والسنوي؟', en: 'What is the difference between monthly and annual billing?' },
    a: { ar: 'سيتوفر الخياران لكل باقة. مقدار التوفير في الاشتراك السنوي يُعلن مع الأسعار المعتمدة.', en: 'Both options will be offered for each plan. The annual saving will be announced with the approved prices.' } },
  { q: { ar: 'هل توجد عمولة على المبيعات؟', en: 'Is there a commission on sales?' },
    a: { ar: 'يقترح مخطط المنصة 0% عمولة مبيعات لباقات Basic وPlus وPro. رسوم مزودي الدفع والشحن منفصلة وستُعرض قبل التفعيل.', en: 'The platform blueprint proposes 0% sales commission on Basic, Plus and Pro. Payment-provider and shipping fees are separate and will be shown before activation.' } },
  { q: { ar: 'هل أستطيع تغيير باقتي لاحقًا؟', en: 'Can I change my plan later?' },
    a: { ar: 'نعم، هذا جزء من التصميم. قواعد الترقية والتخفيض وأثرها على الفوترة ستُنشر مع الأسعار.', en: 'Yes, that is part of the design. Upgrade and downgrade rules and their billing effect will be published with the prices.' } },
  { q: { ar: 'ماذا تعني «إضافة» في صانع التطبيقات؟', en: 'What does “Add-on” mean for App Maker?' },
    a: { ar: 'صانع التطبيقات خدمة اختيارية فوق الباقة من Plus فأعلى، بتكلفة منفصلة لم تُعتمد بعد.', en: 'App Maker is an optional service on top of Plus and above, with a separate cost that is not approved yet.' } },
  { q: { ar: 'هل الفواتير الضريبية مشمولة؟', en: 'Are tax invoices included?' },
    a: { ar: 'الفواتير الضريبية والربط مع «فاتورة» مخطط لكل الباقات. سنوضح حالة التحقق الرسمي عند اكتماله.', en: 'Tax invoices and ZATCA e-invoicing are planned for every plan. We will state the formal verification status once it is complete.' } },
];

/* ---------------- sectors (home) ---------------- */

export const SECTORS: { id: string; name: L; needs: L; tools: L }[] = [
  { id: 'fashion', name: { ar: 'الأزياء', en: 'Fashion' }, needs: { ar: 'مقاسات وألوان لكل منتج، مخزون لكل متغير، وسياسة استبدال واضحة.', en: 'Sizes and colours per product, stock per variant, and a clear exchange policy.' }, tools: { ar: 'المتغيرات، المخزون حسب المتغير، الإرجاع والاستبدال', en: 'Variants, per-variant stock, returns and exchanges' } },
  { id: 'beauty', name: { ar: 'العناية والجمال', en: 'Beauty' }, needs: { ar: 'صور واضحة ومكونات، باقات منتجات، وتقييمات بصور من المشترين.', en: 'Clear photos and ingredients, product bundles, and photo reviews from buyers.' }, tools: { ar: 'الحزم، التقييمات، الكوبونات', en: 'Bundles, reviews, coupons' } },
  { id: 'electronics', name: { ar: 'الإلكترونيات', en: 'Electronics' }, needs: { ar: 'مواصفات دقيقة، أرقام تسلسلية، وخيارات تقسيط حسب المزود.', en: 'Precise specs, serial numbers, and instalment options depending on the provider.' }, tools: { ar: 'خصائص المنتج، الدفع بالتقسيط (مخطط)', en: 'Product attributes, instalments (planned)' } },
  { id: 'food', name: { ar: 'الأغذية', en: 'Food' }, needs: { ar: 'نوافذ توصيل، مناطق تغطية محدودة، وتوفر يتغير يوميًا.', en: 'Delivery windows, limited coverage zones, and availability that changes daily.' }, tools: { ar: 'مناطق الشحن، جدولة الطلبات (مخطط)', en: 'Shipping zones, order scheduling (planned)' } },
  { id: 'jewelry', name: { ar: 'المجوهرات', en: 'Jewelry' }, needs: { ar: 'قيمة طلب مرتفعة، تحقق من الدفع قبل التجهيز، وشحن مؤمّن.', en: 'High order values, payment verification before preparing, and insured shipping.' }, tools: { ar: 'حالات دفع منفصلة، حد الدفع عند الاستلام', en: 'Separate payment states, COD limits' } },
  { id: 'home', name: { ar: 'المنزل', en: 'Home' }, needs: { ar: 'منتجات ثقيلة الوزن، تكلفة شحن حسب الوزن، وتوفر في أكثر من مستودع.', en: 'Heavy items, weight-based shipping cost, and stock across warehouses.' }, tools: { ar: 'الشحن حسب الوزن، المستودعات', en: 'Weight-based shipping, warehouses' } },
  { id: 'digital', name: { ar: 'المنتجات الرقمية', en: 'Digital' }, needs: { ar: 'تسليم فوري بعد تأكيد الدفع، دون وزن أو شحن.', en: 'Instant delivery after payment is confirmed, with no weight or shipping.' }, tools: { ar: 'المنتج الرقمي، تأكيد الدفع', en: 'Digital products, payment confirmation' } },
  { id: 'charity', name: { ar: 'الجمعيات', en: 'Charity' }, needs: { ar: 'تسجيل كجهة خيرية، مبالغ تبرع مرنة، وإيصالات واضحة.', en: 'Registration as a charity, flexible donation amounts, and clear receipts.' }, tools: { ar: 'نوع حساب الجمعية (مخطط)', en: 'Charity account type (planned)' } },
];

/* ---------------- help center ---------------- */

export const HELP_CATS: { id: string; name: L; blurb: L }[] = [
  { id: 'start', name: { ar: 'البدء', en: 'Getting started' }, blurb: { ar: 'إنشاء المتجر والتحقق واختيار الباقة', en: 'Creating a store, verification and plans' } },
  { id: 'orders', name: { ar: 'الطلبات', en: 'Orders' }, blurb: { ar: 'التجهيز والشحن والإرجاع', en: 'Preparing, shipping and returns' } },
  { id: 'payments', name: { ar: 'المدفوعات', en: 'Payments' }, blurb: { ar: 'طرق الدفع والتسويات والاسترداد', en: 'Methods, settlements and refunds' } },
  { id: 'products', name: { ar: 'المنتجات والمخزون', en: 'Products and stock' }, blurb: { ar: 'المتغيرات والمستودعات والتنبيهات', en: 'Variants, warehouses and alerts' } },
];

export interface Article extends Searchable { minutes: number }

export const ARTICLES: Article[] = [
  { id: 'create-store', cat: 'start', minutes: 3,
    title: { ar: 'إنشاء متجرك خطوة بخطوة', en: 'Creating your store, step by step' },
    summary: { ar: 'ما تحتاجه للبدء، وما يحدث بعد إنشاء الحساب.', en: 'What you need to start, and what happens after the account is created.' },
    body: [
      { ar: 'يبدأ التسجيل بثلاث معلومات: اسم المتجر، ونوع النشاط، ورقم الجوال. لا نطلب المستندات في هذه الخطوة.', en: 'Sign-up starts with three things: the store name, the type of business and a mobile number. We do not ask for documents at this step.' },
      { ar: 'بعد إنشاء الحساب تنتقل إلى التحقق من الهوية والنشاط. تُراجع الطلبات من فريق لك، ولا يُفعَّل الدفع الإلكتروني قبل اكتمالها.', en: 'After the account is created you move to identity and business verification. The LAK team reviews requests, and online payments are not activated before it completes.' },
      { ar: 'يمر المتجر بثلاث حالات: جاهز للمعاينة، ثم جاهز للاختبار، ثم جاهز للفتح. كل حالة تعتمد على الخدمات المفعلة فعلًا وليس على إكمال نموذج.', en: 'A store moves through three states: ready to preview, ready to test, then ready to open. Each depends on services that are actually active, not on finishing a form.' },
    ] },
  { id: 'verification', cat: 'start', minutes: 2,
    title: { ar: 'لماذا نطلب التحقق من المتجر؟', en: 'Why we ask you to verify your store' },
    summary: { ar: 'التحقق شرط لتفعيل الدفع الإلكتروني وبعض خدمات الشحن.', en: 'Verification is required to activate online payments and some shipping services.' },
    body: [
      { ar: 'مزودو الدفع يشترطون معرفة صاحب النشاط قبل تحويل أي أموال. لذلك نطلب المستندات في الوقت الذي تؤثر فيه على تفعيل الخدمة، ونشرح السبب في كل خطوة.', en: 'Payment providers require knowing the business owner before any money is transferred. So we ask for documents at the point they affect a service, and explain why at each step.' },
      { ar: 'المراجعة يدوية حاليًا. ستظهر لك حالة الطلب ومدة المراجعة المتوقعة وما ينقص إن طُلب استكمال.', en: 'Review is currently manual. You will see the request status, the expected review time and anything missing if more information is requested.' },
    ] },
  { id: 'choose-plan', cat: 'start', minutes: 2,
    title: { ar: 'اختيار الباقة المناسبة', en: 'Choosing the right plan' },
    summary: { ar: 'كيف تقرأ مصفوفة الباقات، ولماذا لا تظهر الأسعار بعد.', en: 'How to read the plan matrix, and why prices are not shown yet.' },
    body: [
      { ar: 'الفارق الأهم بين Basic وPlus هو الدفع الإلكتروني وبوالص الشحن. إن كنت تبيع بالدفع عند الاستلام فقط فقد تكفيك Basic في البداية.', en: 'The main difference between Basic and Plus is online payments and shipping labels. If you sell with cash on delivery only, Basic may be enough at the start.' },
      { ar: 'الأسعار بانتظار الاعتماد، وستُنشر مع شروط التجديد والرسوم.', en: 'Prices are awaiting approval and will be published with renewal terms and fees.' },
    ] },
  { id: 'prepare-order', cat: 'orders', minutes: 3,
    title: { ar: 'تجهيز طلب مدفوع', en: 'Preparing a paid order' },
    summary: { ar: 'من الطلب الجديد إلى إنشاء الشحنة، دون خلط الحالات.', en: 'From a new order to a created shipment, without mixing states.' },
    body: [
      { ar: 'لكل طلب ثلاث حالات مستقلة: الدفع، والتجهيز، والشحنة. الطلب المدفوع لا يعني أنه شُحن، وطباعة البوليصة لا تعني أن الناقل استلم الشحنة.', en: 'Every order has three independent states: payment, fulfilment and shipment. A paid order is not a shipped order, and printing a label does not mean the carrier has collected it.' },
      { ar: 'افتح قائمة «يحتاج تجهيزًا» لترى الطلبات المدفوعة التي لم يبدأ تجهيزها، الأقدم أولًا. لا تجهز طلبًا تعثر دفعه.', en: 'Open the “Needs preparing” view to see paid orders not yet prepared, oldest first. Do not prepare an order whose payment failed.' },
      { ar: 'يمكنك تجربة هذه الرحلة الآن في لوحة التاجر التجريبية.', en: 'You can try this journey now in the demo merchant workspace.' },
    ] },
  { id: 'returns', cat: 'orders', minutes: 3,
    title: { ar: 'الإرجاع والاسترداد: ما الفرق؟', en: 'Returns and refunds: what is the difference?' },
    summary: { ar: 'استلام المرتجع شيء، وإعادة المال شيء آخر.', en: 'Receiving a return is one thing; giving money back is another.' },
    body: [
      { ar: 'الإرجاع يتعلق بالبضاعة: طلب العميل، ثم الموافقة، ثم استلام المنتج وفحصه. الاسترداد يتعلق بالمال: مبلغه وطريقته وتأكيد المزود.', en: 'A return is about goods: the customer asks, you approve, then you receive and inspect the item. A refund is about money: the amount, the method and the provider’s confirmation.' },
      { ar: 'سيعرض النظام قبل تأكيد أي استرداد المبلغ والطريقة والأثر على التسوية.', en: 'Before you confirm any refund, the system will show the amount, the method and the effect on settlement.' },
    ] },
  { id: 'payment-methods', cat: 'payments', minutes: 3,
    title: { ar: 'تفعيل طرق الدفع', en: 'Activating payment methods' },
    summary: { ar: 'الدفع عند الاستلام والتحويل متاحان لكل الباقات؛ الدفع الإلكتروني يتطلب تفعيل مزود.', en: 'COD and bank transfer are on every plan; online payments need a provider to be activated.' },
    body: [
      { ar: 'الدفع عند الاستلام يمكن تقييده بحد أدنى وأعلى لقيمة الطلب. التحويل البنكي يعرض بيانات حسابك للعميل وتؤكد استلام المبلغ يدويًا.', en: 'Cash on delivery can be limited by a minimum and maximum order value. Bank transfer shows your account details to the customer and you confirm receipt manually.' },
      { ar: 'الدفع الإلكتروني (مدى والبطاقات والمحافظ والتقسيط) مخطط من Plus فأعلى، ويعتمد على موافقة كل مزود. ظهور اسم المزود لا يعني أنه مفعّل.', en: 'Online payments (mada, cards, wallets and instalments) are planned from Plus upward and depend on each provider’s approval. A provider’s name appearing does not mean it is active.' },
    ] },
  { id: 'settlements', cat: 'payments', minutes: 2,
    title: { ar: 'متابعة أموالك: محصَّل ومعلّق ومسترد', en: 'Following your money: collected, pending, refunded' },
    summary: { ar: 'كيف تعرف أين وصل كل مبلغ.', en: 'How to know where each amount is.' },
    body: [
      { ar: 'نفصل ثلاث حالات للأموال: ما حصّله المزود، وما ينتظر التسوية إلى حسابك، وما أُعيد للعملاء. لكل مبلغ مرجع يربطه بالطلب.', en: 'We separate three states of money: what the provider collected, what is waiting to settle to your account, and what was returned to customers. Each amount has a reference linking it to the order.' },
      { ar: 'مواعيد التسوية ورسوم المزودين تعتمد على العقود، ولم تُعتمد بعد.', en: 'Settlement timing and provider fees depend on contracts and are not approved yet.' },
    ] },
  { id: 'variants', cat: 'products', minutes: 2,
    title: { ar: 'المتغيرات والمخزون لكل متغير', en: 'Variants and per-variant stock' },
    summary: { ar: 'مقاس ولون لكل منتج، ورصيد مستقل لكل تركيبة.', en: 'Size and colour per product, with separate stock for each combination.' },
    body: [
      { ar: 'كل تركيبة (مثل: أسود، مقاس M) لها رمز SKU ورصيد خاص. عندما ينفد متغير يبقى المنتج متاحًا بالمتغيرات الأخرى.', en: 'Each combination (e.g. black, size M) has its own SKU and stock. When one variant sells out, the product stays available in the others.' },
    ] },
  { id: 'low-stock', cat: 'products', minutes: 2,
    title: { ar: 'تنبيهات انخفاض المخزون', en: 'Low-stock alerts' },
    summary: { ar: 'حدد مستوى التنبيه لكل منتج ولكل مستودع.', en: 'Set an alert level per product and per warehouse.' },
    body: [
      { ar: 'عندما يصل الرصيد المتاح إلى الحد الذي حددته يظهر المنتج في قائمة «يحتاج تدخلك». الرصيد المتاح هو الموجود ناقص المحجوز لطلبات لم تُشحن.', en: 'When available stock reaches the level you set, the product appears in “Needs your attention”. Available stock is on-hand minus what is reserved for orders not yet shipped.' },
    ] },
];

/* ---------------- blog ---------------- */

export const BLOG_CATS: { id: string; name: L }[] = [
  { id: 'selling', name: { ar: 'البيع عبر الإنترنت', en: 'Selling online' } },
  { id: 'operations', name: { ar: 'التشغيل', en: 'Operations' } },
  { id: 'marketing', name: { ar: 'التسويق', en: 'Marketing' } },
];

export interface Post extends Searchable { minutes: number; lang: 'ar' | 'en' | 'both' }

export const POSTS: Post[] = [
  { id: 'first-ten-orders', cat: 'selling', minutes: 5, lang: 'both',
    title: { ar: 'أول عشرة طلبات: ما الذي يستحق اهتمامك فعلًا', en: 'Your first ten orders: what actually deserves your attention' },
    summary: { ar: 'السرعة في التجهيز ووضوح التواصل أهم من كثرة الإعدادات في البداية.', en: 'Fast preparation and clear communication matter more than many settings at the start.' },
    body: [
      { ar: 'في الأسابيع الأولى يكوّن العميل رأيه من تجربة واحدة: هل وصل الطلب كما وُعد؟ ركّز على أن يكون وقت التجهيز معروفًا ومكتوبًا في صفحة المنتج.', en: 'In the first weeks a customer forms an opinion from a single experience: did the order arrive as promised? Make sure preparation time is known and written on the product page.' },
      { ar: 'راجع كل طلب جديد في اليوم نفسه، وتأكد من حالة الدفع قبل التجهيز، وأبلغ العميل عند إنشاء الشحنة لا عند طباعة البوليصة فقط.', en: 'Review each new order the same day, confirm payment status before preparing, and notify the customer when the shipment is created, not just when the label is printed.' },
      { ar: 'أجّل الإعدادات المتقدمة حتى تعرف ما يطلبه عملاؤك فعلًا.', en: 'Leave advanced settings until you know what your customers actually ask for.' },
    ] },
  { id: 'cod-limits', cat: 'operations', minutes: 4, lang: 'both',
    title: { ar: 'الدفع عند الاستلام: متى تضع حدًا للطلب؟', en: 'Cash on delivery: when to set an order limit' },
    summary: { ar: 'حد أعلى لقيمة الطلب يقلل خسارة الشحنات المرفوضة.', en: 'An upper order limit reduces losses from refused deliveries.' },
    body: [
      { ar: 'الطلبات الكبيرة بالدفع عند الاستلام تحمل خطر الرفض عند الباب، وتكلفة الشحن ذهابًا وإيابًا يتحملها المتجر غالبًا.', en: 'Large cash-on-delivery orders carry the risk of refusal at the door, and the round-trip shipping cost usually falls on the store.' },
      { ar: 'ابدأ بحد يناسب متوسط سلتك، وراقب نسبة الرفض شهريًا قبل تعديله.', en: 'Start with a limit that fits your average basket, and watch the refusal rate monthly before changing it.' },
    ] },
  { id: 'product-photos', cat: 'selling', minutes: 4, lang: 'both',
    title: { ar: 'صور المنتج التي تجيب عن الأسئلة قبل طرحها', en: 'Product photos that answer questions before they are asked' },
    summary: { ar: 'المقاس والملمس والحجم الحقيقي أهم من الخلفية الجميلة.', en: 'Size, texture and real scale matter more than a pretty background.' },
    body: [
      { ar: 'أضف صورة تُظهر الحجم بالنسبة إلى اليد أو الجسم، وصورة قريبة للخامة، وصورة لكل لون متاح.', en: 'Add a photo showing scale against a hand or body, a close-up of the material, and one photo per available colour.' },
      { ar: 'اكتب نصًا بديلًا لكل صورة؛ يفيد من يستخدم قارئ الشاشة ويساعد محركات البحث.', en: 'Write alt text for each photo; it helps people using screen readers and helps search engines.' },
    ] },
  { id: 'coupon-math', cat: 'marketing', minutes: 6, lang: 'both',
    title: { ar: 'حسبة الكوبون قبل إطلاقه', en: 'Do the coupon maths before you launch it' },
    summary: { ar: 'خصم 20% على منتج هامشه 30% يترك لك أقل مما تتوقع.', en: 'A 20% discount on a 30% margin product leaves you less than you expect.' },
    body: [
      { ar: 'احسب صافي ما يبقى لك بعد الخصم ورسوم الدفع والشحن المجاني إن وجد. إن كان الصافي سالبًا فالكوبون يشتري طلبات خاسرة.', en: 'Work out what you keep after the discount, payment fees and any free shipping. If the result is negative, the coupon is buying loss-making orders.' },
      { ar: 'حدد للكوبون مدة وحد استخدام لكل عميل، وراقب الطلبات الناتجة عنه بشكل منفصل.', en: 'Give the coupon an end date and a per-customer limit, and track the orders it produces separately.' },
    ] },
  { id: 'utm-basics', cat: 'marketing', minutes: 5, lang: 'both',
    title: { ar: 'روابط UTM: اعرف من أين جاء الطلب', en: 'UTM links: know where an order came from' },
    summary: { ar: 'رابط واحد لكل قناة يجعل تقارير المصادر قابلة للمقارنة.', en: 'One link per channel makes source reports comparable.' },
    body: [
      { ar: 'أضف المصدر والوسيط واسم الحملة إلى كل رابط تنشره. بدون ذلك ستظهر الطلبات كأنها «مباشرة».', en: 'Add source, medium and campaign name to every link you share. Without them, orders show up as “direct”.' },
      { ar: 'تذكّر أن المنصات الإعلانية تحسب النتائج بطرق مختلفة، فلا تجمع أرقامها كأنها مصدر واحد.', en: 'Remember that ad platforms count results differently, so do not add their numbers together as if they were one source.' },
    ] },
];

/* ---------------- marketing guide ---------------- */

export const GUIDE: { id: string; title: L; why: L; tasks: { id: string; label: L }[]; where: L; status: 'demo' | 'planned' | 'none' }[] = [
  { id: 'offer', title: { ar: 'اعرف عميلك وعرضك', en: 'Know your customer and offer' },
    why: { ar: 'التسويق يبدأ بجملة واحدة تشرح لمن تبيع ولماذا يشتري منك.', en: 'Marketing starts with one sentence explaining who you sell to and why they buy from you.' },
    tasks: [
      { id: 'offer-1', label: { ar: 'اكتب جملة تصف عميلك الأساسي', en: 'Write one sentence describing your main customer' } },
      { id: 'offer-2', label: { ar: 'حدد ثلاثة منتجات تمثل متجرك', en: 'Pick three products that represent your store' } },
      { id: 'offer-3', label: { ar: 'اكتب وعد التوصيل الذي تستطيع الالتزام به', en: 'Write the delivery promise you can keep' } },
    ],
    where: { ar: 'لا يحتاج أداة؛ استخدم ورقة أو ملاحظة.', en: 'No tool needed; use paper or a note.' }, status: 'none' },
  { id: 'basics', title: { ar: 'جهّز المتجر قبل جلب الزوار', en: 'Prepare the store before bringing visitors' },
    why: { ar: 'الإعلان لمتجر ناقص يدفع ثمن زيارات لا تشتري.', en: 'Advertising an unfinished store pays for visits that do not buy.' },
    tasks: [
      { id: 'basics-1', label: { ar: 'أضف سياسة الإرجاع والشحن', en: 'Add your return and shipping policies' } },
      { id: 'basics-2', label: { ar: 'أضف صورًا وأوصافًا كاملة للمنتجات الثلاثة', en: 'Complete photos and descriptions for the three products' } },
      { id: 'basics-3', label: { ar: 'جرّب طلبًا كاملًا بنفسك', en: 'Place a full test order yourself' } },
    ],
    where: { ar: 'لوحة التاجر: الطلبات (معاينة). المنتجات والسياسات: مخطط.', en: 'Merchant workspace: orders (demo). Products and policies: planned.' }, status: 'demo' },
  { id: 'launch', title: { ar: 'أطلق عرضًا محسوبًا', en: 'Launch a calculated offer' },
    why: { ar: 'العرض الجيد له مدة وحد ونتيجة تقاس.', en: 'A good offer has an end date, a limit and a measurable result.' },
    tasks: [
      { id: 'launch-1', label: { ar: 'احسب صافي الربح بعد الخصم', en: 'Calculate net margin after the discount' } },
      { id: 'launch-2', label: { ar: 'أنشئ كوبونًا بمدة وحد استخدام', en: 'Create a coupon with an end date and usage limit' } },
      { id: 'launch-3', label: { ar: 'اربطه برابط UTM خاص', en: 'Tie it to its own UTM link' } },
    ],
    where: { ar: 'الكوبونات: كل الباقات (مخطط في المعاينة).', en: 'Coupons: every plan (planned in this preview).' }, status: 'planned' },
  { id: 'channels', title: { ar: 'اختر قناة واحدة وابدأ بها', en: 'Pick one channel and start there' },
    why: { ar: 'قناة واحدة تعرفها جيدًا أفضل من خمس قنوات بنصف جهد.', en: 'One channel you know well beats five channels at half effort.' },
    tasks: [
      { id: 'channels-1', label: { ar: 'اختر القناة التي يوجد فيها عميلك', en: 'Choose the channel where your customer is' } },
      { id: 'channels-2', label: { ar: 'حدد ميزانية تجربة لأسبوعين', en: 'Set a two-week test budget' } },
      { id: 'channels-3', label: { ar: 'سجّل النتائج قبل زيادة الإنفاق', en: 'Record results before increasing spend' } },
    ],
    where: { ar: 'إعلانات لك: من Plus (مخطط).', en: 'LAK Ads: Plus and above (planned).' }, status: 'planned' },
  { id: 'retain', title: { ar: 'أعد العميل مرة ثانية', en: 'Bring the customer back' },
    why: { ar: 'العميل العائد لا يكلفك إعلانًا جديدًا.', en: 'A returning customer does not cost you a new ad.' },
    tasks: [
      { id: 'retain-1', label: { ar: 'أرسل رسالة شكر بعد التسليم', en: 'Send a thank-you after delivery' } },
      { id: 'retain-2', label: { ar: 'اطلب تقييمًا بعد مدة مناسبة', en: 'Ask for a review after a suitable time' } },
      { id: 'retain-3', label: { ar: 'جرّب نقاط الولاء لعملائك المتكررين', en: 'Try loyalty points for repeat customers' } },
    ],
    where: { ar: 'التقييمات: كل الباقات. الولاء والرسائل: من Plus (مخطط).', en: 'Reviews: every plan. Loyalty and messages: Plus and above (planned).' }, status: 'planned' },
  { id: 'measure', title: { ar: 'قِس وعدّل', en: 'Measure and adjust' },
    why: { ar: 'قرار واحد مبني على رقم أفضل من عشرة مبنية على انطباع.', en: 'One decision based on a number beats ten based on a feeling.' },
    tasks: [
      { id: 'measure-1', label: { ar: 'قارن الطلبات حسب المصدر شهريًا', en: 'Compare orders by source monthly' } },
      { id: 'measure-2', label: { ar: 'أوقف ما لا يحقق ربحًا صافيًا', en: 'Stop what does not make net profit' } },
      { id: 'measure-3', label: { ar: 'دوّن ما تعلمته للحملة التالية', en: 'Write down what you learned for the next campaign' } },
    ],
    where: { ar: 'التقارير الأساسية: كل الباقات (مخطط).', en: 'Basic reports: every plan (planned).' }, status: 'planned' },
];

/* ---------------- legal drafts ---------------- */

export interface LegalDoc { id: 'terms' | 'privacy' | 'affiliate'; title: L; sections: { id: string; h: L; p: L }[] }

export const LEGAL: LegalDoc[] = [
  { id: 'terms', title: { ar: 'شروط الاستخدام', en: 'Terms of service' }, sections: [
    { id: 'scope', h: { ar: 'نطاق الخدمة', en: 'Scope of service' }, p: { ar: 'سيحدد هذا القسم الخدمات التي تقدمها لك للتاجر، وما يخرج عن مسؤوليتها مثل خدمات مزودي الدفع والشحن الخارجيين.', en: 'This section will define the services LAK provides to merchants, and what falls outside its responsibility, such as external payment and shipping providers.' } },
    { id: 'account', h: { ar: 'الحساب والتحقق', en: 'Account and verification' }, p: { ar: 'سيشرح متطلبات إنشاء الحساب والتحقق من الهوية والنشاط، ومتى يمكن تعليق الحساب وكيف يُبلَّغ التاجر.', en: 'Will explain account and identity/business verification requirements, when an account may be suspended and how the merchant is notified.' } },
    { id: 'billing', h: { ar: 'الاشتراك والفوترة', en: 'Subscription and billing' }, p: { ar: 'سيتضمن الأسعار المعتمدة وقواعد التجديد والترقية والتخفيض والاسترداد. لم تُعتمد بعد.', en: 'Will include approved prices and the rules for renewal, upgrades, downgrades and refunds. Not approved yet.' } },
    { id: 'data', h: { ar: 'بيانات المتجر وعملائه', en: 'Store and customer data' }, p: { ar: 'سيبين ملكية التاجر لبياناته وبيانات عملائه، وحدود استخدام لك لها، وطريقة التصدير عند إنهاء الحساب.', en: 'Will set out that merchants own their data and their customers’ data, the limits on LAK’s use of it, and how to export it when closing an account.' } },
    { id: 'ending', h: { ar: 'إنهاء الخدمة', en: 'Ending the service' }, p: { ar: 'سيشرح خطوات الإنهاء ومهل الإشعار ومصير الطلبات والأموال المعلقة.', en: 'Will explain termination steps, notice periods and what happens to pending orders and funds.' } },
  ] },
  { id: 'privacy', title: { ar: 'سياسة الخصوصية', en: 'Privacy policy' }, sections: [
    { id: 'collect', h: { ar: 'البيانات التي نجمعها', en: 'Data we collect' }, p: { ar: 'سيعدّد البيانات التي تُجمع من التجار وزوار الموقع، والغرض من كل نوع.', en: 'Will list the data collected from merchants and website visitors, and the purpose of each type.' } },
    { id: 'use', h: { ar: 'كيف نستخدمها', en: 'How we use it' }, p: { ar: 'سيشرح الاستخدامات المسموحة، ومتى نطلب موافقتك، وكيف تسحبها.', en: 'Will explain permitted uses, when we ask for your consent, and how to withdraw it.' } },
    { id: 'share', h: { ar: 'المشاركة مع أطراف أخرى', en: 'Sharing with others' }, p: { ar: 'سيحدد مزودي الخدمة الذين قد يتلقون بيانات، مثل مزودي الدفع والشحن، ولماذا.', en: 'Will name the service providers that may receive data, such as payment and shipping providers, and why.' } },
    { id: 'rights', h: { ar: 'حقوقك', en: 'Your rights' }, p: { ar: 'سيشرح حق الاطلاع والتصحيح والحذف وطريقة تقديم الطلب. الالتزام بالأنظمة المعمول بها يحتاج مراجعة مختصة قبل النشر.', en: 'Will explain the rights to access, correct and delete, and how to request them. Alignment with applicable law needs specialist review before publishing.' } },
    { id: 'cookies', h: { ar: 'ملفات تعريف الارتباط', en: 'Cookies' }, p: { ar: 'هذه المعاينة تحفظ تفضيل اللغة فقط في متصفحك. السياسة النهائية ستشرح أي أدوات قياس تُستخدم.', en: 'This preview only stores your language preference in your browser. The final policy will explain any analytics tools used.' } },
  ] },
  { id: 'affiliate', title: { ar: 'اتفاقية التسويق بالعمولة', en: 'Affiliate agreement' }, sections: [
    { id: 'join', h: { ar: 'الانضمام', en: 'Joining' }, p: { ar: 'سيحدد من يمكنه الانضمام كمسوّق لمنصة لك وشروط القبول.', en: 'Will define who can join as a LAK affiliate and the acceptance criteria.' } },
    { id: 'earn', h: { ar: 'متى تُستحق العمولة', en: 'When commission is earned' }, p: { ar: 'تُستحق العمولة عند حدث محدد مثل اشتراك مدفوع، لا عند النقرة. النسبة والقواعد بانتظار الاعتماد.', en: 'Commission is earned on a defined event such as a paid subscription, not on a click. Rates and rules are awaiting approval.' } },
    { id: 'hold', h: { ar: 'المبالغ المعلقة والمتاحة والمدفوعة', en: 'Pending, available and paid amounts' }, p: { ar: 'تبقى العمولة معلقة خلال فترة الاسترداد، ثم تصبح متاحة، ثم تُدفع. تُلغى إن استُرد الاشتراك.', en: 'Commission stays pending during the refund period, then becomes available, then is paid. It is cancelled if the subscription is refunded.' } },
    { id: 'conduct', h: { ar: 'قواعد الترويج', en: 'Promotion rules' }, p: { ar: 'سيمنع الادعاءات غير المثبتة عن المنصة، والإعلان على اسم لك دون إذن.', en: 'Will prohibit unproven claims about the platform and bidding on the LAK name without permission.' } },
  ] },
];

/* ---------------- service pages ---------------- */

export const PAYMENT_METHODS: { name: L; kind: L; plan: string }[] = [
  { name: { ar: 'الدفع عند الاستلام', en: 'Cash on delivery' }, kind: { ar: 'مع حد أدنى وأعلى لقيمة الطلب', en: 'With min/max order value limits' }, plan: 'Basic+' },
  { name: { ar: 'التحويل البنكي', en: 'Bank transfer' }, kind: { ar: 'تأكيد يدوي لاستلام المبلغ', en: 'Manual confirmation of receipt' }, plan: 'Basic+' },
  { name: { ar: 'مدى', en: 'mada' }, kind: { ar: 'بطاقات الخصم السعودية', en: 'Saudi debit cards' }, plan: 'Plus+' },
  { name: { ar: 'Visa / Mastercard / Amex', en: 'Visa / Mastercard / Amex' }, kind: { ar: 'البطاقات الدولية', en: 'International cards' }, plan: 'Plus+' },
  { name: { ar: 'Apple Pay', en: 'Apple Pay' }, kind: { ar: 'محفظة على الأجهزة المدعومة', en: 'Wallet on supported devices' }, plan: 'Plus+' },
  { name: { ar: 'STC Pay', en: 'STC Pay' }, kind: { ar: 'محفظة جوال سعودية', en: 'Saudi mobile wallet' }, plan: 'Plus+' },
  { name: { ar: 'Tabby، Tamara، Madfu، Emkan', en: 'Tabby, Tamara, Madfu, Emkan' }, kind: { ar: 'تقسيط حسب شروط المزود', en: 'Instalments under provider terms' }, plan: 'Plus+' },
  { name: { ar: 'PayPal، MIS Pay، Mokafa', en: 'PayPal, MIS Pay, Mokafa' }, kind: { ar: 'محافظ دولية وخليجية ونقاط', en: 'International/GCC wallets and points' }, plan: 'Plus+' },
];

export const MARKETING_TOOLS: { id: string; name: L; what: L; plan: string; href?: string }[] = [
  { id: 'ads', name: { ar: 'إعلانات لك', en: 'LAK Ads' }, what: { ar: 'إدارة حملات Google وTikTok وSnapchat وMeta وX من مكان واحد، مع فصل إنفاق المنصة عن رسوم لك.', en: 'Run Google, TikTok, Snapchat, Meta and X campaigns from one place, with platform spend kept separate from LAK fees.' }, plan: 'Plus+', href: 'ads' },
  { id: 'loyalty', name: { ar: 'الولاء والكاش باك', en: 'Loyalty and cashback' }, what: { ar: 'نقاط تُكتسب على الطلبات المسلّمة، وتبقى معلقة حتى انتهاء مهلة الإرجاع.', en: 'Points earned on delivered orders, held as pending until the return window closes.' }, plan: 'Plus+' },
  { id: 'affiliate', name: { ar: 'التسويق بالعمولة', en: 'Affiliate program' }, what: { ar: 'روابط للمسوقين، وعمولة تُستحق عند حدث محدد وتُلغى إن استُرد الطلب.', en: 'Links for affiliates, with commission earned on a defined event and cancelled if the order is refunded.' }, plan: 'Pro+' },
  { id: 'influencer', name: { ar: 'منصة المؤثرين', en: 'Influencer platform' }, what: { ar: 'بحث وبريف واتفاق ومتابعة برابط خاص، والموافقة على الدفع صلاحية مستقلة.', en: 'Search, brief, agreement and tracking via a unique link, with payment approval as a separate permission.' }, plan: 'Pro+' },
  { id: 'seo', name: { ar: 'أدوات SEO', en: 'SEO tools' }, what: { ar: 'عناوين ووصف لكل صفحة ومنتج، وخريطة موقع، ومدونة. لا نعد بترتيب معين في نتائج البحث.', en: 'Titles and descriptions per page and product, a sitemap and a blog. We do not promise any search ranking.' }, plan: 'Basic+' },
  { id: 'messages', name: { ar: 'البريد والرسائل', en: 'Email and SMS' }, what: { ar: 'رسائل ترحيب وسلة متروكة وعودة المخزون، مع معاينة الجمهور قبل الإرسال.', en: 'Welcome, abandoned-cart and back-in-stock messages, with an audience preview before sending.' }, plan: 'Plus+' },
];

export const AD_CHANNELS: { name: string; what: L }[] = [
  { name: 'Google / YouTube', what: { ar: 'بحث وتسوق وفيديو', en: 'Search, Shopping and video' } },
  { name: 'TikTok', what: { ar: 'حملات ومزامنة الكتالوج', en: 'Campaigns and catalog sync' } },
  { name: 'Snapchat', what: { ar: 'حملات ومزامنة الكتالوج', en: 'Campaigns and catalog sync' } },
  { name: 'Meta', what: { ar: 'Instagram وFacebook', en: 'Instagram and Facebook' } },
  { name: 'X', what: { ar: 'حملات ترويجية', en: 'Promoted campaigns' } },
];

export const CONTACT_TOPICS: { id: string; name: L }[] = [
  { id: 'sales', name: { ar: 'استفسار عن الباقات', en: 'Question about plans' } },
  { id: 'support', name: { ar: 'دعم فني لمتجري', en: 'Technical support for my store' } },
  { id: 'issue', name: { ar: 'الإبلاغ عن مشكلة', en: 'Report an issue' } },
  { id: 'story', name: { ar: 'ترشيح متجري كقصة نجاح', en: 'Nominate my store as a story' } },
  { id: 'partner', name: { ar: 'شراكة أو تسويق بالعمولة', en: 'Partnership or affiliate' } },
];
