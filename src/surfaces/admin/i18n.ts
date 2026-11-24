import type { L } from '../../core/lang';
import type {
  AuditAction, DeliveryState, DisputeState, DocKind, Ent, EntityType, ErrorCode, FeatureGroup, KycStatus, LedgerKind,
  ModAction, ReviewState, RoleId, Section, StoreStatus,
} from './domain';

/* Enum labels: bilingual records, read with [lang]. */
export const ROLE_LABEL: Record<RoleId, L> = {
  owner: { ar: 'المالك', en: 'Owner' },
  ops: { ar: 'العمليات', en: 'Operations' },
  finance: { ar: 'المالية', en: 'Finance' },
  support: { ar: 'الدعم (قراءة فقط)', en: 'Support (read-only)' },
};
export const ROLE_PERSON: Record<RoleId, L> = {
  owner: { ar: 'سارة — المالك', en: 'Sara — Owner' },
  ops: { ar: 'ماجد — العمليات', en: 'Majed — Operations' },
  finance: { ar: 'لينا — المالية', en: 'Lina — Finance' },
  support: { ar: 'يوسف — الدعم', en: 'Yousef — Support' },
};
export const ROLE_DESC: Record<RoleId, L> = {
  owner: { ar: 'كل الأقسام والإجراءات، بما فيها الوصول المفوّض بالكتابة.', en: 'Every section and action, including write-mode supported access.' },
  ops: { ar: 'قبول التجار، المتاجر، الشحن، المحتوى، الإعلانات. لا يرى الأموال ولا يعتمد تغيير الخطة.', en: 'Merchant review, stores, shipping, content, announcements. No money views; cannot approve plan changes.' },
  finance: { ar: 'المدفوعات والنزاعات، اعتماد تغيير الخطط، التقارير والتصدير. لا يرى وثائق KYC.', en: 'Payments and disputes, plan-change approval, reports and export. No KYC documents.' },
  support: { ar: 'عرض فقط: المتاجر وحالة الطلبات والشحن والصحة، وجلسة وصول بالقراءة فقط.', en: 'View only: stores, application status, shipping, health, and read-only supported access.' },
};

export const SECTION_LABEL: Record<Section, L> = {
  overview: { ar: 'نظرة عامة', en: 'Overview' },
  kyc: { ar: 'طلبات التجار', en: 'Merchant applications' },
  stores: { ar: 'التجار والمتاجر', en: 'Merchants & stores' },
  plans: { ar: 'الاشتراكات والباقات', en: 'Subscriptions & plans' },
  payments: { ar: 'الأموال والنزاعات', en: 'Payments & disputes' },
  shipping: { ar: 'الشحن والجودة', en: 'Shipping & quality' },
  content: { ar: 'الثيمات والتطبيقات', en: 'Themes & apps' },
  health: { ar: 'حالة المنصة', en: 'Platform health' },
  reports: { ar: 'التقارير', en: 'Reports' },
  announcements: { ar: 'الإعلانات التشغيلية', en: 'Announcements' },
  audit: { ar: 'سجل الإجراءات', en: 'Audit log' },
};

export const STORE_STATUS: Record<StoreStatus, L> = {
  active: { ar: 'يعمل', en: 'Live' }, onboarding: { ar: 'قيد الإعداد', en: 'Onboarding' }, suspended: { ar: 'معلّق', en: 'Suspended' },
};
export const KYC_STATUS: Record<KycStatus, L> = {
  pending: { ar: 'بانتظار المراجعة', en: 'Awaiting review' }, info: { ar: 'بانتظار استكمال التاجر', en: 'Waiting on merchant' },
  approved: { ar: 'مقبول', en: 'Approved' }, rejected: { ar: 'مرفوض', en: 'Rejected' },
};
export const ENTITY: Record<EntityType, L> = {
  individual: { ar: 'فرد', en: 'Individual' }, sole: { ar: 'مؤسسة فردية', en: 'Sole proprietorship' },
  corporate: { ar: 'شركة', en: 'Corporate' }, charity: { ar: 'جهة خيرية', en: 'Charity' },
};
export const DOC: Record<DocKind, L> = {
  nationalId: { ar: 'الهوية الوطنية', en: 'National ID' }, cr: { ar: 'السجل التجاري', en: 'Commercial registration' },
  vat: { ar: 'شهادة ضريبة القيمة المضافة', en: 'VAT certificate' }, iban: { ar: 'خطاب الحساب البنكي (IBAN)', en: 'Bank account letter (IBAN)' },
  authorizedId: { ar: 'هوية المفوّض بالتوقيع', en: 'Authorised signatory ID' }, charityLicense: { ar: 'ترخيص الجهة الخيرية', en: 'Charity licence' },
  govApproval: { ar: 'موافقة الجهة الحكومية', en: 'Government approval' },
};
export const DOC_STATE: Record<'ok' | 'missing' | 'expired' | 'unreadable', L> = {
  ok: { ar: 'سليم', en: 'Valid' }, missing: { ar: 'غير مرفوع', en: 'Missing' }, expired: { ar: 'منتهي', en: 'Expired' }, unreadable: { ar: 'غير مقروء', en: 'Unreadable' },
};
export const DISPUTE_STATE: Record<DisputeState, L> = {
  open: { ar: 'جديد', en: 'Open' }, awaitingMerchant: { ar: 'بانتظار أدلة التاجر', en: 'Awaiting merchant evidence' },
  submitted: { ar: 'أُرسل للمزود', en: 'Submitted to provider' }, won: { ar: 'كُسب', en: 'Won' }, lost: { ar: 'خُسر', en: 'Lost' },
};
export const DISPUTE_ACTION: Record<DisputeState, L> = {
  open: { ar: 'إعادة فتح', en: 'Reopen' }, awaitingMerchant: { ar: 'اطلب أدلة من التاجر', en: 'Request merchant evidence' },
  submitted: { ar: 'أرسل الرد للمزود', en: 'Submit response to provider' }, won: { ar: 'سجّل النتيجة: كُسب', en: 'Record result: won' }, lost: { ar: 'سجّل النتيجة: خُسر', en: 'Record result: lost' },
};
export const DISPUTE_KIND: Record<'chargeback' | 'dispute' | 'refundEscalation', L> = {
  chargeback: { ar: 'استرجاع بنكي', en: 'Chargeback' }, dispute: { ar: 'نزاع', en: 'Dispute' }, refundEscalation: { ar: 'تصعيد استرداد', en: 'Refund escalation' },
};
export const LEDGER_KIND: Record<LedgerKind, L> = {
  sale: { ar: 'بيع', en: 'Sale' }, refund: { ar: 'استرداد', en: 'Refund' }, chargeback: { ar: 'استرجاع بنكي', en: 'Chargeback' },
  payout: { ar: 'تحويل للتاجر', en: 'Merchant payout' }, subscription: { ar: 'فاتورة اشتراك لك', en: 'LAK subscription invoice' },
};
export const LEDGER_STATUS: Record<'captured' | 'pending' | 'failed' | 'reversed' | 'settled', L> = {
  captured: { ar: 'محصّل', en: 'Captured' }, pending: { ar: 'قيد التحقق', en: 'Pending' }, failed: { ar: 'فشل', en: 'Failed' },
  reversed: { ar: 'معكوس', en: 'Reversed' }, settled: { ar: 'مُسوّى', en: 'Settled' },
};
export const DELIVERY_STATE: Record<DeliveryState, L> = {
  failed: { ar: 'فشل التسليم', en: 'Delivery failed' }, reattempt: { ar: 'إعادة محاولة مجدولة', en: 'Re-attempt scheduled' },
  returning: { ar: 'عائدة للتاجر', en: 'Returning to merchant' }, resolved: { ar: 'مُغلقة', en: 'Resolved' },
};
export const DELIVERY_ACTION: Record<DeliveryState, L> = {
  failed: { ar: 'فشل', en: 'Failed' }, reattempt: { ar: 'جدولة إعادة محاولة', en: 'Schedule re-attempt' },
  returning: { ar: 'إرجاع للتاجر', en: 'Return to merchant' }, resolved: { ar: 'إغلاق', en: 'Mark resolved' },
};
export const CARRIER_STATUS: Record<'operational' | 'degraded' | 'down', L> = {
  operational: { ar: 'يعمل', en: 'Operational' }, degraded: { ar: 'أداء متراجع', en: 'Degraded' }, down: { ar: 'متوقف', en: 'Down' },
};
export const REVIEW_STATE: Record<ReviewState, L> = {
  review: { ar: 'بانتظار المراجعة', en: 'In review' }, approved: { ar: 'منشور', en: 'Published' }, rejected: { ar: 'مرفوض', en: 'Rejected' }, suspended: { ar: 'معلّق', en: 'Suspended' },
};
export const MOD_ACTION: Record<ModAction, L> = {
  approve: { ar: 'اعتماد ونشر', en: 'Approve & publish' }, reject: { ar: 'رفض', en: 'Reject' }, suspend: { ar: 'تعليق', en: 'Suspend' }, reinstate: { ar: 'إعادة النشر', en: 'Reinstate' },
};
export const GROUP: Record<FeatureGroup, L> = {
  core: { ar: 'الأساسيات', en: 'Core' }, payments: { ar: 'الدفع', en: 'Payments' }, shipping: { ar: 'الشحن', en: 'Shipping' },
  growth: { ar: 'التسويق والنمو', en: 'Marketing & growth' }, design: { ar: 'التصميم والقنوات', en: 'Design & channels' },
  team: { ar: 'الفريق', en: 'Team' }, scale: { ar: 'التوسع والتقارير', en: 'Scale & reports' }, enterprise: { ar: 'المؤسسات', en: 'Enterprise' },
};
export const SERVICE_STATUS: Record<'ok' | 'degraded' | 'down', L> = {
  ok: { ar: 'سليم', en: 'Healthy' }, degraded: { ar: 'متراجع', en: 'Degraded' }, down: { ar: 'متوقف', en: 'Down' },
};

export const AUDIT_ACTION: Record<AuditAction, L> = {
  roleSwitched: { ar: 'تبديل دور العرض', en: 'Viewing role switched' },
  kycApprove: { ar: 'قبول طلب تاجر', en: 'Application approved' },
  kycReject: { ar: 'رفض طلب تاجر', en: 'Application rejected' },
  kycInfo: { ar: 'طلب استكمال من التاجر', en: 'More info requested' },
  docViewed: { ar: 'عرض وثيقة مقيدة', en: 'Restricted document viewed' },
  storeSuspended: { ar: 'تعليق متجر', en: 'Store suspended' },
  storeReactivated: { ar: 'إعادة تفعيل متجر', en: 'Store reactivated' },
  accessStarted: { ar: 'بدء جلسة وصول مفوّض', en: 'Supported access started' },
  accessEnded: { ar: 'إنهاء جلسة الوصول', en: 'Supported access ended' },
  accessExpired: { ar: 'انتهاء مدة جلسة الوصول', en: 'Supported access expired' },
  planProposed: { ar: 'اقتراح تغيير خطة', en: 'Plan change proposed' },
  planApproved: { ar: 'اعتماد تغيير خطة', en: 'Plan change approved' },
  planRejected: { ar: 'رفض تغيير خطة', en: 'Plan change rejected' },
  disputeMoved: { ar: 'تحديث نزاع', en: 'Dispute updated' },
  deliveryMoved: { ar: 'تحديث شحنة متعثرة', en: 'Failed delivery updated' },
  contentModerated: { ar: 'قرار مراجعة محتوى', en: 'Content moderated' },
  reportExported: { ar: 'تصدير تقرير', en: 'Report exported' },
  announcementScheduled: { ar: 'جدولة إعلان', en: 'Announcement scheduled' },
  announcementCancelled: { ar: 'إلغاء إعلان', en: 'Announcement cancelled' },
  payoutHeld: { ar: 'إيقاف تحويل مستحقات', en: 'Payout held' },
  payoutReleased: { ar: 'استئناف تحويل مستحقات', en: 'Payout released' },
};

export const ERR: Record<ErrorCode, L> = {
  noPerm: { ar: 'دورك الحالي لا يملك صلاحية هذا الإجراء.', en: 'Your current role cannot do this.' },
  reasonRequired: { ar: 'اكتب سببًا واضحًا من 10 أحرف على الأقل؛ يُحفظ في السجل.', en: 'Write a clear reason of at least 10 characters; it is saved to the audit log.' },
  terminal: { ar: 'هذا الطلب حُسم سابقًا ولا يمكن تغيير قراره.', en: 'This application is already decided.' },
  docsIncomplete: { ar: 'لا يمكن القبول ووثيقة ناقصة أو منتهية أو غير مقروءة. اطلب الاستكمال بدلًا من ذلك.', en: 'Cannot approve while a document is missing, expired or unreadable. Request more info instead.' },
  notActive: { ar: 'المتجر معلّق بالفعل.', en: 'The store is already suspended.' },
  notSuspended: { ar: 'المتجر ليس معلّقًا.', en: 'The store is not suspended.' },
  daysInvalid: { ar: 'مدة التعليق المؤقت من 1 إلى 90 يومًا.', en: 'A temporary suspension lasts 1 to 90 days.' },
  samePlan: { ar: 'اختر خطة مختلفة عن الخطة الحالية.', en: 'Choose a plan different from the current one.' },
  pendingExists: { ar: 'يوجد طلب تغيير خطة بانتظار الاعتماد لهذا المتجر.', en: 'This store already has a plan change awaiting approval.' },
  selfApproval: { ar: 'لا يعتمد مقترح التغيير طلبه بنفسه. يحتاج موافقة دور آخر.', en: 'The proposer cannot approve their own change. Another role must approve.' },
  notPending: { ar: 'هذا الطلب لم يعد بانتظار الاعتماد.', en: 'This request is no longer pending.' },
  writeNotAllowed: { ar: 'وضع الكتابة متاح للمالك فقط.', en: 'Write mode is available to the Owner only.' },
  sessionActive: { ar: 'توجد جلسة وصول نشطة. أنهِها أولًا.', en: 'A supported access session is already active. End it first.' },
  durationInvalid: { ar: 'اختر مدة من الخيارات المتاحة.', en: 'Choose one of the allowed durations.' },
  badTransition: { ar: 'لا يمكن الانتقال إلى هذه الحالة من الحالة الحالية.', en: 'That state is not reachable from the current one.' },
  checksFailed: { ar: 'فحص واحد على الأقل لم ينجح. ارفض مع السبب أو انتظر نسخة مصححة.', en: 'At least one check failed. Reject with a reason or wait for a fixed version.' },
  titleRequired: { ar: 'اكتب العنوان بالعربية والإنجليزية.', en: 'Write the title in Arabic and English.' },
  bodyRequired: { ar: 'اكتب النص بالعربية والإنجليزية.', en: 'Write the message in Arabic and English.' },
  audienceEmpty: { ar: 'الجمهور المختار لا يضم أي متجر.', en: 'The selected audience has no stores.' },
  scheduleInPast: { ar: 'اختر وقتًا لاحقًا لوقت البيانات الحالي.', en: 'Choose a time after the current data time.' },
  windowInvalid: { ar: 'نهاية نافذة الصيانة يجب أن تكون بعد بدايتها.', en: 'The maintenance window must end after it starts.' },
  noPayout: { ar: 'لا مستحقات معلّقة لهذا المتجر.', en: 'This store has no pending payout.' },
  alreadyHeld: { ar: 'التحويل موقوف بالفعل.', en: 'The payout is already on hold.' },
  notHeld: { ar: 'التحويل غير موقوف.', en: 'The payout is not on hold.' },
};

export function entLabel(e: Ent, lang: 'ar' | 'en'): string {
  const m: Record<string, L> = {
    true: { ar: 'متاح', en: 'Included' }, false: { ar: 'غير متاح', en: 'Not included' }, unlimited: { ar: 'غير محدود*', en: 'Unlimited*' },
    limited: { ar: 'محدود', en: 'Limited' }, full: { ar: 'كامل', en: 'Full' }, addon: { ar: 'إضافة مدفوعة', en: 'Paid add-on' },
    basic: { ar: 'أساسي', en: 'Basic' }, advanced: { ar: 'متقدم', en: 'Advanced' }, connect: { ar: 'ربط نطاق قائم', en: 'Connect existing' },
    connectRegister: { ar: 'ربط أو تسجيل', en: 'Connect or register' }, domainIncluded: { ar: 'نطاق مشمول (مقترح المصدر)', en: 'Domain included (source proposal)' },
  };
  return typeof e === 'number' ? String(e) : m[String(e)][lang];
}

