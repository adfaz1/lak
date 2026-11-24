// Every setting a merchant may look for by its own label, so global search lands on the setting itself
// («الشراء كضيف» → Checkout, guest-checkout switch), not only on the category. `focus` is the section id the
// settings frame scrolls to; `query` opens the right tab. Add a row when a settings page gains a field.
import type { L } from '../../merchant/domain';
import type { CatId } from './model';

export interface SettingField { id: string; cat: CatId; label: L; section: L; keys: string; query?: Record<string, string>; focus?: string }

const f = (id: string, cat: CatId, ar: string, en: string, sar: string, sen: string, keys: string, focus?: string, query?: Record<string, string>): SettingField =>
  ({ id, cat, label: { ar, en }, section: { ar: sar, en: sen }, keys, focus, query });

export const SETTING_FIELDS: SettingField[] = [
  // Store details
  f('store-name', 'store', 'اسم المتجر', 'Store name', 'هوية المتجر', 'Store identity', 'store name title اسم', 'st-h'),
  f('store-category', 'store', 'فئة المتجر', 'Store category', 'هوية المتجر', 'Store identity', 'category industry فئة نشاط', 'st-h'),
  f('store-email', 'store', 'بريد التواصل', 'Contact email', 'التواصل', 'Contact', 'email contact بريد ايميل', 'st-c'),
  f('store-phone', 'store', 'جوال التواصل', 'Contact mobile', 'التواصل', 'Contact', 'phone mobile whatsapp جوال هاتف رقم', 'st-c'),
  f('store-social', 'store', 'حسابات التواصل الاجتماعي', 'Social media accounts', 'حسابات التواصل الاجتماعي', 'Social media', 'instagram x twitter snapchat tiktok social انستقرام سناب تيك توك', 'st-s'),
  f('store-timezone', 'store', 'المنطقة الزمنية', 'Time zone', 'التوقيت والوحدات', 'Time zone and units', 'timezone time zone توقيت ساعة', 'st-r'),
  f('store-weight', 'store', 'وحدة الوزن', 'Weight unit', 'التوقيت والوحدات', 'Time zone and units', 'weight unit kg وزن كيلو', 'st-r'),
  // Checkout
  f('checkout-guest', 'checkout', 'الشراء كضيف', 'Guest checkout', 'إتمام الطلب', 'Checkout', 'guest checkout without account ضيف بدون حساب تسجيل', 'ck-g'),
  f('checkout-cancel', 'checkout', 'إلغاء العميل لطلبه', 'Self-cancellation by shoppers', 'إتمام الطلب', 'Checkout', 'cancel self cancellation window إلغاء العميل مدة', 'ck-c'),
  f('checkout-cod-limit', 'checkout', 'حد الدفع عند الاستلام لكل عميل', 'COD limit per customer', 'إتمام الطلب', 'Checkout', 'cod limit per customer unpaid حد استلام', 'ck-d'),
  // Payments
  f('payments-cod-limits', 'payments', 'حدود الدفع عند الاستلام', 'Cash on delivery limits', 'المدفوعات', 'Payments', 'cod minimum maximum order أقل أعلى قيمة استلام', 'cod-h'),
  f('payments-bank', 'payments', 'حساب التحويل البنكي', 'Bank-transfer account', 'المدفوعات', 'Payments', 'bank transfer iban beneficiary تحويل بنكي آيبان مستفيد', 'bank-h', { section: 'bank' }),
  // Shipping
  f('shipping-methods', 'shipping', 'طرق الشحن والناقلون', 'Shipping methods & carriers', 'الشحن', 'Shipping', 'carrier method rate first kg free over ناقل طريقة سعر أول كيلو مجاني', undefined, { tab: 'methods' }),
  f('shipping-rules', 'shipping', 'قواعد الشحن', 'Shipping rules', 'الشحن', 'Shipping', 'rules conditions cart weight city قواعد شروط سلة وزن مدينة', undefined, { tab: 'rules' }),
  f('shipping-zones', 'shipping', 'المناطق ووعود التوصيل', 'Zones & delivery promises', 'الشحن', 'Shipping', 'zones cities preparation transit promise مناطق مدن تجهيز وعد', undefined, { tab: 'zones' }),
  f('shipping-cutoff', 'shipping', 'موعد طلبات نفس اليوم', 'Same-day cut-off', 'الشحن', 'Shipping', 'same day cutoff نفس اليوم آخر موعد', 'zn-cut', { tab: 'zones' }),
  f('shipping-intl', 'shipping', 'رمز HS وبلد المنشأ', 'HS code and country of origin', 'الشحن الدولي', 'International shipping', 'hs customs origin international جمارك منشأ دولي', undefined, { tab: 'intl' }),
  f('shipping-warehouse', 'shipping', 'المستودع حسب مدينة العميل', 'Warehouse by customer city', 'تشغيل الشحن', 'Shipping operations', 'warehouse city routing مستودع مدينة', 'op-wh', { tab: 'options' }),
  f('shipping-cod-rules', 'shipping', 'قواعد الدفع عند الاستلام في الشحن', 'Cash on delivery rules for shipping', 'تشغيل الشحن', 'Shipping operations', 'cod verification phone استلام تحقق', 'op-cod', { tab: 'options' }),
  // Domains, policies, notifications, language, account, team
  f('domain-free', 'domains', 'رابط المتجر المجاني', 'Free store link', 'النطاقات', 'Domains', 'slug link subdomain رابط', 'dm-free'),
  f('domain-own', 'domains', 'نطاقك الخاص', 'Your own domain', 'النطاقات', 'Domains', 'custom domain dns cname نطاق دومين', 'dm-own'),
  f('policy-returns', 'policies', 'سياسة الاسترجاع', 'Returns policy', 'السياسات', 'Policies', 'returns refund exchange استرجاع استبدال', undefined, { p: 'returns' }),
  f('policy-privacy', 'policies', 'سياسة الخصوصية', 'Privacy policy', 'السياسات', 'Policies', 'privacy data خصوصية بيانات', undefined, { p: 'privacy' }),
  f('notify-mine', 'notifications', 'تنبيهاتك لكل حدث', 'Your alerts per event', 'الإشعارات', 'Notifications', 'alerts new order low stock تنبيه طلب جديد مخزون', 'nt-h'),
  f('notify-customers', 'notifications', 'رسائل العملاء لكل حالة طلب', 'Customer messages per order state', 'الإشعارات', 'Notifications', 'customer sms whatsapp email template tracking رسائل عملاء قالب تتبع', undefined, { tab: 'customers' }),
  f('lang-admin', 'language', 'لغة لوحة التحكم', 'Dashboard language', 'اللغة والمنطقة', 'Language & region', 'language arabic english لغة عربي انجليزي', 'lg-a'),
  f('lang-store', 'language', 'لغات المتجر والعملة', 'Store languages and currency', 'اللغة والمنطقة', 'Language & region', 'currency riyal store languages عملة ريال', 'lg-s'),
  f('account-2fa', 'account', 'التحقق بخطوتين', 'Two-step verification', 'الأمان والأجهزة', 'Security & devices', '2fa otp two factor authenticator رمز خطوتين', undefined, { tab: 'security' }),
  f('account-password', 'account', 'كلمة المرور', 'Password', 'الأمان والأجهزة', 'Security & devices', 'password change كلمة مرور', undefined, { tab: 'security' }),
  f('team-invite', 'team', 'دعوة عضو', 'Invite a member', 'الفريق', 'Team', 'invite staff member employee دعوة موظف عضو', 'tm-h'),
  f('team-roles', 'team', 'الأدوار والصلاحيات', 'Roles and permissions', 'الفريق', 'Team', 'roles permissions access أدوار صلاحيات', 'pm-h'),
  // Verification
  f('kyc-entity', 'verification', 'نوع الكيان (فرد، مؤسسة، شركة، جهة خيرية)', 'Entity type (individual, sole, company, charity)', 'توثيق المتجر', 'Store verification', 'entity individual sole company charity كيان فرد مؤسسة شركة خيرية', 'kyc-entity'),
  f('kyc-cr', 'verification', 'السجل التجاري', 'Commercial registration', 'توثيق المتجر', 'Store verification', 'cr commercial registration سجل تجاري', 'kyc-details'),
  f('kyc-vat', 'verification', 'الرقم الضريبي', 'VAT number', 'توثيق المتجر', 'Store verification', 'vat tax number ضريبة رقم ضريبي', 'kyc-details'),
  f('kyc-payout-iban', 'verification', 'آيبان التحويلات', 'Payout IBAN', 'توثيق المتجر', 'Store verification', 'payout iban bank account تحويلات آيبان حساب', 'kyc-details'),
];
