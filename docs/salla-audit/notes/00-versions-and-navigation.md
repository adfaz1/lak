# 00 — النسختان ووسيلة التبديل والتنقل العام

**تاريخ الفحص:** 2026-11-24 — قراءة فقط، دون أي حفظ أو تأكيد.

## أي نسخة مفتوحة؟
- النسخة المفتوحة عند البدء هي **الجديدة**: شريط تنقل علوي أفقي (الكل، الرئيسية، الطلبات، المنتجات، التسويق، المتجر وقنوات البيع، التقارير) بدل القائمة الجانبية الكلاسيكية، مع أيقونات (بحث، تطبيقات، إشعارات، إعدادات) وقائمة الحساب يسارًا.
- **وسيلة التبديل الرسمية:** قائمة الحساب/المتجر (أعلى اليسار، اسم المتجر + شارة الباقة «برو») > «الأدوات والتفضيلات» > **«العودة للوحة التحكم السابقة»**.
- في نفس القائمة: «الباقة والدعم > باقة واشتراكات المتجر»، «المقترحات»، «تفضيلات الإشعارات»، مفتاح «English (Beta)»، «الملف الشخصي».

## قائمة «الكل» (خريطة النسخة الجديدة)
مجمّعة في مجموعتين:
- **الأقسام التشغيلية:** الطلبات، المنتجات، التسويق، المتجر الإلكتروني، قنوات البيع، العملاء، الموظفين، التقارير.
- **الإعدادات والأدوات:** مركز الدعم، الشحن، الدفع، الأدوات المساعدة، السجلات.

| المجموعة | العناصر (المسار) |
|---|---|
| الطلبات | إدارة الطلبات `/orders`، إعدادات الطلبات (حالات الطلب `/orders/statuses`، الإسناد التلقائي `/orders/auto-assignee`، تخصيص الفواتير `/orders/invoice-settings`، الحجوزات `/orders/reservations`، الحقول المخصصة `/orders/custom-fields`، خيارات الطلب `/orders/options`، قوالب التصدير `/orders/exports`، الوسوم التلقائية `/orders/auto-tags`)، تحديث حالة مجموعة طلبات |
| المنتجات | إدارة المنتجات `/products`، إعدادات المنتجات، التصنيفات والخيارات `/products/options`، محرر المنتجات `/products/editor`، إدارة المخزون `/products/quantities/bulk`، نقل المخزون `/products/inventory-transfer`، حملات الطلب المسبق `/products/campaigns`، قيود المنتج `/products/restrictions`، جرد المخزون `/products/quantities`، الاستيراد والتحديث `/importer`، الاستيراد والتصدير `/products/imports`، قوالب التصدير `/products/exports`، الفروع والمستودعات `/products/branches` |
| التسويق | إعلانات سلة `/marketing/ads/dashboard`، أدوات التتبع `/marketing/integration-tools/*`، السلات المتروكة `/marketing/carts`، الكوبونات `/marketing/coupons`، المؤثرين `/marketing/influencers`، العروض الترويجية `/marketing/offers`، الكاش باك `/marketing/offers/cashback`، الحملات التسويقية `/marketing/campaign/retargeting`، محفظة العميل `/marketing/customer_wallet`، التسويق بالعمولة `/marketing/affiliate`، SEO `/marketing/seo/homepage`، برنامج الولاء `/marketing/loyalty`، نظام الإهداء `/marketing/gift`، تذكيرات إعادة الشراء `/marketing/reorder-reminders` |
| المتجر الإلكتروني | تصميم المتجر `/themes` (شارة «الأكثر زيارة»)، متجر الثيمات `/themes/marketplace`، دومين المتجر `/manage/domain`، الصفحات التعريفية `/channel/pages`، روابط مخصصة `/manage/custom-urls` |
| قنوات البيع | سلة بوينت `/channel/sallapoint` (شارة «كاشير مجاني»)، تطبيق الجوال `/channel/mobile`، صفحات الهبوط `/themes/landing-pages`، محلي `/channel/mahally` |
| العملاء | إدارة العملاء `/customers`، إعدادات العملاء `/customers/settings`، إدارة المجموعات `/customers/groups`، استيراد العملاء `/customers/imports` |
| الموظفين | إدارة الموظفين `/users`، الأدوار الوظيفية `/users/roles`، أهداف الموظفين `/users/targets` |
| التقارير | أداء المتجر `/reports/performance`، التحليلات الذكية `/reports/smart-analysis`، التقارير `/reports` |
| مركز الدعم | الأسئلة والتقييمات `/feedback`، نظام الخدمة الذاتية `/tickets`، بوابة الجودة `/shipping/tickets`، سلة شات `/channel/chat`، الشكاوى `/manage/complaints` |
| الشحن | شركات الشحن `/shipping`، إعدادات الشحن، مواد التغليف `/shipping/packing`، أرشيف البوليصات `/shipping/logs`، مسارات الشحن `/shipping/setting/routes`، جاهزية الشحن الدولي `/shipping/international` |
| الدفع | طرق الدفع `/payments`، المحفظة `/payments/wallet`، قيود الدفع، إدارة الضرائب `/payments/taxes`، عمليات الدفع الإلكتروني `/payments/transactions`، توثيق المتجر `/payments/kyc` |
| الأدوات المساعدة | الأتمتة `/marketing/flows` (شارة «جديد»)، تطبيقاتي `/apps/installed`، متجر التطبيقات `/apps`، خدمات التاجر `/manage/experts`، أدوات المطور `/manage/webhooks`، برنامج الإحالة `/marketing/referrals` |
| السجلات | سجل العمليات `/logs/audit`، سجل التصدير `/logs/export`، سجل المخزون `/products/quantities/audit`، الطلبات المحذوفة `/orders/trash`، المنتجات المحذوفة `/products/trash`، بطاقات الهدايا `/products/gift-cards-logs`، البطاقات الرقمية `/products/card-logs`، الرسائل النصية `/logs/messages`، سجل الترجمة `/manage/languages/logs` |

## رأي
- **جيد:** قائمة «الكل» تعرض كامل النظام في شاشة واحدة (Mega-menu) وتسهّل الاكتشاف؛ الإعدادات لم تعد صفحة واحدة بل موزعة حسب المجال.
- **صعب:** بعض العناصر مكررة بأسماء مختلفة (قوالب التصدير في الطلبات والمنتجات؛ «الاستيراد والتحديث» مقابل «الاستيراد والتصدير»)؛ «إعدادات الطلبات/المنتجات/الشحن» و«قيود الدفع» عناوين فرعية تفتح لوحة إعدادات منبثقة (`?settings=`) وليست صفحات مستقلة؛ صفحات الهبوط تظهر تحت «قنوات البيع» رغم أنها جزء من الثيمات.
