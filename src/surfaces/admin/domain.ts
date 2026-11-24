import type { L } from '../../core/lang';

/*
 * Platform super-admin (P02) — pure domain rules and fixtures.
 * Everything here is simulated. The role checks below drive what the prototype UI shows;
 * they are NOT a permission system. Real enforcement belongs on the server.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };
export type ErrorCode =
  | 'noPerm' | 'reasonRequired' | 'terminal' | 'docsIncomplete' | 'notActive' | 'notSuspended' | 'daysInvalid'
  | 'samePlan' | 'pendingExists' | 'selfApproval' | 'notPending' | 'writeNotAllowed' | 'sessionActive' | 'durationInvalid'
  | 'badTransition' | 'checksFailed' | 'titleRequired' | 'bodyRequired' | 'audienceEmpty' | 'scheduleInPast' | 'windowInvalid';

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T,>(error: ErrorCode): Result<T> => ({ ok: false, error });

export const MIN_REASON = 10;
export const hasReason = (r: string | undefined) => (r ?? '').trim().length >= MIN_REASON;

/* ---------- Roles ---------- */

export type RoleId = 'owner' | 'ops' | 'finance' | 'support';
export const ROLES: RoleId[] = ['owner', 'ops', 'finance', 'support'];

export const PERMS = [
  'overview.view', 'overview.money',
  'kyc.view', 'kyc.docs', 'kyc.decide',
  'stores.view', 'stores.suspend', 'stores.access', 'stores.accessWrite',
  'plans.view', 'plans.propose', 'plans.approve',
  'payments.view', 'payments.act',
  'shipping.view', 'shipping.act',
  'content.view', 'content.moderate',
  'health.view',
  'reports.view', 'reports.export',
  'announce.view', 'announce.schedule',
  'audit.view',
] as const;
export type Perm = (typeof PERMS)[number];

export const ROLE_PERMS: Record<RoleId, readonly Perm[]> = {
  owner: PERMS,
  ops: [
    'overview.view', 'kyc.view', 'kyc.docs', 'kyc.decide', 'stores.view', 'stores.suspend', 'stores.access',
    'plans.view', 'plans.propose', 'shipping.view', 'shipping.act', 'content.view', 'content.moderate', 'health.view',
    'reports.view', 'announce.view', 'announce.schedule', 'audit.view',
  ],
  finance: [
    'overview.view', 'overview.money', 'stores.view', 'plans.view', 'plans.approve', 'payments.view', 'payments.act',
    'reports.view', 'reports.export', 'audit.view',
  ],
  support: ['overview.view', 'kyc.view', 'stores.view', 'stores.access', 'shipping.view', 'content.view', 'health.view'],
};

export function can(role: RoleId, perm: Perm): boolean {
  return ROLE_PERMS[role].includes(perm);
}

export type Section = 'overview' | 'kyc' | 'stores' | 'plans' | 'payments' | 'shipping' | 'content' | 'health' | 'reports' | 'announcements' | 'audit';
export const SECTIONS: Section[] = ['overview', 'kyc', 'stores', 'plans', 'payments', 'shipping', 'content', 'health', 'reports', 'announcements', 'audit'];
export const SECTION_PERM: Record<Section, Perm> = {
  overview: 'overview.view', kyc: 'kyc.view', stores: 'stores.view', plans: 'plans.view', payments: 'payments.view',
  shipping: 'shipping.view', content: 'content.view', health: 'health.view', reports: 'reports.view',
  announcements: 'announce.view', audit: 'audit.view',
};
export const allowedSections = (role: RoleId) => SECTIONS.filter((s) => can(role, SECTION_PERM[s]));

/* ---------- Plans & entitlements (blueprint pp. 42–45 matrix; prices deliberately absent) ---------- */

export type PlanId = 'basic' | 'plus' | 'pro' | 'special';
export const PLANS: PlanId[] = ['basic', 'plus', 'pro', 'special'];
export const PLAN_NAME: Record<PlanId, string> = { basic: 'Basic', plus: 'Plus', pro: 'Pro', special: 'Special' };

export type Ent = boolean | number | 'unlimited' | 'limited' | 'full' | 'addon' | 'basic' | 'advanced' | 'connect' | 'connectRegister' | 'domainIncluded';
export type FeatureGroup = 'core' | 'payments' | 'shipping' | 'growth' | 'design' | 'team' | 'scale' | 'enterprise';
export interface Feature { id: string; group: FeatureGroup; label: L; v: Record<PlanId, Ent> }

const all = (e: Ent): Record<PlanId, Ent> => ({ basic: e, plus: e, pro: e, special: e });
const plusUp: Record<PlanId, Ent> = { basic: false, plus: true, pro: true, special: true };
const proUp: Record<PlanId, Ent> = { basic: false, plus: false, pro: true, special: true };
const specialOnly: Record<PlanId, Ent> = { basic: false, plus: false, pro: false, special: true };

export const ENTITLEMENTS: Feature[] = [
  { id: 'products', group: 'core', label: { ar: 'المنتجات', en: 'Products' }, v: all('unlimited') },
  { id: 'customers', group: 'core', label: { ar: 'العملاء', en: 'Customers' }, v: all('unlimited') },
  { id: 'orders', group: 'core', label: { ar: 'الطلبات', en: 'Orders' }, v: all('unlimited') },
  { id: 'coupons', group: 'core', label: { ar: 'الكوبونات وأكواد الخصم', en: 'Coupons & discount codes' }, v: all(true) },
  { id: 'reviews', group: 'core', label: { ar: 'تقييمات العملاء والأسئلة', en: 'Customer reviews & Q&A' }, v: all(true) },
  { id: 'marketplace', group: 'core', label: { ar: 'الإدراج التلقائي في سوق لك', en: 'LAK marketplace auto-listing' }, v: all(true) },
  { id: 'vat', group: 'core', label: { ar: 'ضريبة القيمة المضافة / الفوترة (هدف)', en: 'VAT / e-invoicing (target)' }, v: all(true) },
  { id: 'reportsBasic', group: 'core', label: { ar: 'التقارير الأساسية', en: 'Basic reports' }, v: all(true) },
  { id: 'cod', group: 'payments', label: { ar: 'الدفع عند الاستلام', en: 'Cash on delivery' }, v: all(true) },
  { id: 'bank', group: 'payments', label: { ar: 'التحويل البنكي', en: 'Bank transfer payments' }, v: all(true) },
  { id: 'online', group: 'payments', label: { ar: 'الدفع الإلكتروني (مدى، بطاقات، محافظ)', en: 'Online payments (mada, cards, wallets)' }, v: plusUp },
  { id: 'wallet', group: 'payments', label: { ar: 'محفظة العميل', en: 'Customer wallet' }, v: plusUp },
  { id: 'gift', group: 'payments', label: { ar: 'بطاقات الهدايا', en: 'Gift cards' }, v: plusUp },
  { id: 'bankOffers', group: 'payments', label: { ar: 'عروض البنوك عند الدفع', en: 'Bank offers at checkout' }, v: proUp },
  { id: 'flexFees', group: 'payments', label: { ar: 'رسوم دفع مرنة', en: 'Flexible payment fees' }, v: specialOnly },
  { id: 'fleet', group: 'shipping', label: { ar: 'أسطول شحن لك', en: 'LAK shipping fleet' }, v: plusUp },
  { id: 'labels', group: 'shipping', label: { ar: 'بوليصات لك ومركز الجودة', en: 'LAK labels + quality center' }, v: plusUp },
  { id: 'restrictShip', group: 'shipping', label: { ar: 'تقييد ظهور الشحن', en: 'Restrict shipping visibility' }, v: proUp },
  { id: 'warehouseCity', group: 'shipping', label: { ar: 'توجيه المخزن حسب المدينة', en: 'Auto-assign warehouse by city' }, v: proUp },
  { id: 'loyalty', group: 'growth', label: { ar: 'نقاط الولاء', en: 'Loyalty points' }, v: plusUp },
  { id: 'cashback', group: 'growth', label: { ar: 'الكاش باك', en: 'Cashback' }, v: plusUp },
  { id: 'ads', group: 'growth', label: { ar: 'إعلانات لك', en: 'LAK Ads' }, v: plusUp },
  { id: 'messaging', group: 'growth', label: { ar: 'حملات البريد والرسائل', en: 'Email / SMS campaigns' }, v: plusUp },
  { id: 'wholesale', group: 'growth', label: { ar: 'سوق الجملة', en: 'Wholesale B2B marketplace' }, v: plusUp },
  { id: 'segments', group: 'growth', label: { ar: 'شرائح العملاء', en: 'Customer segmentation' }, v: proUp },
  { id: 'affiliate', group: 'growth', label: { ar: 'برنامج الشركاء', en: 'Affiliate program' }, v: proUp },
  { id: 'influencers', group: 'growth', label: { ar: 'حملات المؤثرين', en: 'Influencer campaigns' }, v: proUp },
  { id: 'qtyPricing', group: 'growth', label: { ar: 'أسعار الكميات', en: 'Bulk / quantity pricing' }, v: proUp },
  { id: 'booking', group: 'growth', label: { ar: 'جدولة الطلبات والحجوزات', en: 'Order scheduling / booking' }, v: proUp },
  { id: 'themeBuilder', group: 'design', label: { ar: 'منشئ الثيمات', en: 'Theme builder' }, v: plusUp },
  { id: 'code', group: 'design', label: { ar: 'تخصيص CSS / JS', en: 'CSS / JS custom code' }, v: plusUp },
  { id: 'landing', group: 'design', label: { ar: 'صفحات الهبوط', en: 'Landing pages' }, v: plusUp },
  { id: 'domain', group: 'design', label: { ar: 'النطاق', en: 'Domain' }, v: { basic: 'connect', plus: 'connectRegister', pro: 'domainIncluded', special: 'domainIncluded' } },
  { id: 'threeD', group: 'design', label: { ar: 'عرض المنتج ثلاثي الأبعاد', en: '3D product view' }, v: proUp },
  { id: 'appMaker', group: 'design', label: { ar: 'صانع التطبيقات', en: 'App Maker (mobile app)' }, v: { basic: false, plus: 'addon', pro: 'addon', special: 'addon' } },
  { id: 'staff', group: 'team', label: { ar: 'حسابات الموظفين', en: 'Staff accounts' }, v: { basic: 1, plus: 3, pro: 'unlimited', special: 'unlimited' } },
  { id: 'rbac', group: 'team', label: { ar: 'أدوار وصلاحيات الموظفين', en: 'Staff roles & RBAC' }, v: proUp },
  { id: 'stores', group: 'scale', label: { ar: 'عدد المتاجر', en: 'Stores' }, v: { basic: 1, plus: 1, pro: 'unlimited', special: 'unlimited' } },
  { id: 'reportsAdv', group: 'scale', label: { ar: 'التقارير والتحليلات المتقدمة', en: 'Advanced reports & analytics' }, v: { basic: false, plus: 'limited', pro: 'full', special: 'full' } },
  { id: 'accounting', group: 'scale', label: { ar: 'تكاملات المحاسبة', en: 'Accounting integrations' }, v: plusUp },
  { id: 'erp', group: 'enterprise', label: { ar: 'تكامل ERP', en: 'ERP integration' }, v: { basic: false, plus: false, pro: 'limited', special: 'full' } },
  { id: 'branches', group: 'enterprise', label: { ar: 'الفروع المتقدمة', en: 'Multi-branch (advanced)' }, v: { basic: false, plus: false, pro: 'basic', special: 'advanced' } },
  { id: 'accountManager', group: 'enterprise', label: { ar: 'مدير حساب مخصص', en: 'Dedicated account manager' }, v: specialOnly },
  { id: 'customInt', group: 'enterprise', label: { ar: 'تكاملات خاصة', en: 'Custom integrations' }, v: specialOnly },
  { id: 'sla', group: 'enterprise', label: { ar: 'دعم بأولوية واتفاقية مستوى خدمة', en: 'SLA-backed priority support' }, v: specialOnly },
];

/** Ordinal used to classify a plan change as a gain or a loss per feature. */
export function entRank(e: Ent): number {
  if (e === false) return 0;
  if (e === true) return 2;
  if (typeof e === 'number') return e;
  return { unlimited: Number.POSITIVE_INFINITY, limited: 1, basic: 1, addon: 1, full: 2, advanced: 2, connect: 1, connectRegister: 2, domainIncluded: 3 }[e];
}

export interface DiffRow { feature: Feature; before: Ent; after: Ent; change: 'gain' | 'loss' | 'same' }
export function planDiff(fromPlan: PlanId, toPlan: PlanId): DiffRow[] {
  return ENTITLEMENTS.map((f) => {
    const before = f.v[fromPlan]; const after = f.v[toPlan];
    const a = entRank(before); const b = entRank(after);
    return { feature: f, before, after, change: b > a ? 'gain' : b < a ? 'loss' : 'same' };
  });
}

export function limitOf(plan: PlanId, featureId: 'staff' | 'stores'): number {
  const e = ENTITLEMENTS.find((f) => f.id === featureId)!.v[plan];
  return typeof e === 'number' ? e : Number.POSITIVE_INFINITY;
}

export interface PlanWarning { kind: 'staffOver' | 'featureInUse'; count?: number; limit?: number; feature?: Feature }
/** Consequences of moving a store to another plan that need an explicit decision before approval. */
export function planWarnings(store: Store, to: PlanId): PlanWarning[] {
  const w: PlanWarning[] = [];
  const staffLimit = limitOf(to, 'staff');
  if (store.staff > staffLimit) w.push({ kind: 'staffOver', count: store.staff, limit: staffLimit });
  for (const d of planDiff(store.plan, to)) {
    if (d.change === 'loss' && store.featuresInUse.includes(d.feature.id)) w.push({ kind: 'featureInUse', feature: d.feature });
  }
  return w;
}

/* ---------- Stores ---------- */

export type StoreStatus = 'active' | 'onboarding' | 'suspended';
export interface Suspension { kind: 'temporary' | 'indefinite'; days?: number; reason: string; by: RoleId; at: number }
export interface Store {
  id: string; name: L; merchant: L; category: L; city: L; plan: PlanId; status: StoreStatus;
  domain: { host: string; kind: 'custom' | 'platform'; state: 'verified' | 'pending' | 'failed' };
  platformPath: string; created: string; gmv30: number; orders30: number; openOrders: number; pendingPayout: number;
  errors24h: number; visits30: number; staff: number; products: number; tickets: number; lastOrder: string | null;
  featuresInUse: string[]; suspension?: Suspension;
}

/** "Active store": not suspended, published (not onboarding) and at least one order in the last 30 days. */
export function isActiveStore(s: Store, today: string): boolean {
  if (s.status !== 'active' || !s.lastOrder) return false;
  return daysBetween(s.lastOrder, today) <= 30;
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export interface StoreFilter { q: string; status: StoreStatus | ''; plan: PlanId | '' }
export function filterStores(stores: Store[], f: StoreFilter): Store[] {
  const q = f.q.trim().toLowerCase();
  return stores.filter((s) =>
    (!f.status || s.status === f.status) && (!f.plan || s.plan === f.plan) &&
    (!q || [s.id, s.name.ar, s.name.en, s.merchant.ar, s.merchant.en, s.domain.host, s.city.ar, s.city.en].some((x) => x.toLowerCase().includes(q))));
}

export interface SuspendInput { kind: 'temporary' | 'indefinite'; days?: number; reason: string }
export function suspendStore(s: Store, input: SuspendInput, role: RoleId, at: number): Result<Store> {
  if (!can(role, 'stores.suspend')) return fail('noPerm');
  if (s.status === 'suspended') return fail('notActive');
  if (!hasReason(input.reason)) return fail('reasonRequired');
  if (input.kind === 'temporary' && !(Number.isInteger(input.days) && input.days! >= 1 && input.days! <= 90)) return fail('daysInvalid');
  return ok({ ...s, status: 'suspended', suspension: { kind: input.kind, days: input.kind === 'temporary' ? input.days : undefined, reason: input.reason.trim(), by: role, at } });
}

export function reactivateStore(s: Store, reason: string, role: RoleId): Result<Store> {
  if (!can(role, 'stores.suspend')) return fail('noPerm');
  if (s.status !== 'suspended') return fail('notSuspended');
  if (!hasReason(reason)) return fail('reasonRequired');
  return ok({ ...s, status: s.lastOrder ? 'active' : 'onboarding', suspension: undefined });
}

/** What a suspension does. Data is preserved; nothing is deleted. */
export function suspensionImpact(s: Store) {
  return { storefrontOffline: true, checkoutClosed: true, openOrders: s.openOrders, pendingPayout: s.pendingPayout, products: s.products, dataPreserved: true };
}

/* ---------- KYC ---------- */

export type EntityType = 'individual' | 'sole' | 'corporate' | 'charity';
export type DocKind = 'nationalId' | 'cr' | 'vat' | 'iban' | 'authorizedId' | 'charityLicense' | 'govApproval';
export interface KycDoc { kind: DocKind; state: 'ok' | 'missing' | 'expired' | 'unreadable'; ref: string; expires?: string }
export type KycStatus = 'pending' | 'info' | 'approved' | 'rejected';
export interface KycEvent { kind: 'submitted' | 'info' | 'approve' | 'reject' | 'resubmitted'; at: number; by?: RoleId; reason?: string }
export interface Application {
  id: string; merchant: L; store: L; type: EntityType; city: L; category: L; plan: PlanId; submitted: string;
  email: string; phone: string; status: KycStatus; docs: KycDoc[]; flags: L[]; events: KycEvent[]; storeId?: string;
}

export const docsComplete = (a: Application) => a.docs.every((d) => d.state === 'ok');

export type KycDecision = 'approve' | 'reject' | 'info';
export function decideKyc(a: Application, decision: KycDecision, reason: string, role: RoleId, at: number): Result<Application> {
  if (!can(role, 'kyc.decide')) return fail('noPerm');
  if (a.status === 'approved' || a.status === 'rejected') return fail('terminal');
  if (!hasReason(reason)) return fail('reasonRequired');
  if (decision === 'approve' && !docsComplete(a)) return fail('docsIncomplete');
  const status: KycStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'info';
  return ok({ ...a, status, events: [...a.events, { kind: decision, at, by: role, reason: reason.trim() }] });
}

/** An approved application becomes a store in onboarding: it is not live until the merchant publishes. */
export function storeFromApplication(a: Application, id: string, today: string): Store {
  const slug = a.store.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id, name: a.store, merchant: a.merchant, category: a.category, city: a.city, plan: a.plan, status: 'onboarding',
    domain: { host: `${slug}.lak.example`, kind: 'platform', state: 'verified' }, platformPath: `platform.example/${slug}`,
    created: today, gmv30: 0, orders30: 0, openOrders: 0, pendingPayout: 0, errors24h: 0, visits30: 0, staff: 1, products: 0, tickets: 0,
    lastOrder: null, featuresInUse: [],
  };
}

/* ---------- Plan changes (propose → approve by a different role) ---------- */

export interface PlanChange {
  id: string; storeId: string; from: PlanId; to: PlanId; reason: string; effective: 'now' | 'renewal';
  proposedBy: RoleId; proposedAt: number; status: 'pending' | 'approved' | 'rejected'; decidedBy?: RoleId; decidedAt?: number; note?: string;
}

export function proposePlanChange(s: Store, to: PlanId, reason: string, effective: PlanChange['effective'], role: RoleId, at: number, id: string, existing: PlanChange[]): Result<PlanChange> {
  if (!can(role, 'plans.propose')) return fail('noPerm');
  if (s.plan === to) return fail('samePlan');
  if (existing.some((c) => c.storeId === s.id && c.status === 'pending')) return fail('pendingExists');
  if (!hasReason(reason)) return fail('reasonRequired');
  return ok({ id, storeId: s.id, from: s.plan, to, reason: reason.trim(), effective, proposedBy: role, proposedAt: at, status: 'pending' });
}

export function decidePlanChange(c: PlanChange, approve: boolean, role: RoleId, at: number, note: string): Result<PlanChange> {
  if (!can(role, 'plans.approve')) return fail('noPerm');
  if (c.status !== 'pending') return fail('notPending');
  if (c.proposedBy === role) return fail('selfApproval');
  if (!approve && !hasReason(note)) return fail('reasonRequired');
  return ok({ ...c, status: approve ? 'approved' : 'rejected', decidedBy: role, decidedAt: at, note: note.trim() || undefined });
}

/** Only an approved change effective now moves the store; "at renewal" waits for the billing cycle (backend). */
export function applyPlanChange(s: Store, c: PlanChange): Store {
  return c.status === 'approved' && c.effective === 'now' && c.storeId === s.id && s.plan === c.from ? { ...s, plan: c.to } : s;
}

/* ---------- Supported access ---------- */

export const ACCESS_MINUTES = [15, 30, 60] as const;
export interface AccessSession { id: string; storeId: string; reason: string; minutes: number; mode: 'read' | 'write'; by: RoleId; startedAt: number; endedAt?: number; end?: 'ended' | 'expired' }

export function startAccess(input: { storeId: string; reason: string; minutes: number; mode: 'read' | 'write' }, role: RoleId, now: number, id: string, current: AccessSession | null): Result<AccessSession> {
  if (!can(role, 'stores.access')) return fail('noPerm');
  if (input.mode === 'write' && !can(role, 'stores.accessWrite')) return fail('writeNotAllowed');
  if (current && isLive(current, now)) return fail('sessionActive');
  if (!(ACCESS_MINUTES as readonly number[]).includes(input.minutes)) return fail('durationInvalid');
  if (!hasReason(input.reason)) return fail('reasonRequired');
  return ok({ id, storeId: input.storeId, reason: input.reason.trim(), minutes: input.minutes, mode: input.mode, by: role, startedAt: now });
}
export const expiresAt = (s: AccessSession) => s.startedAt + s.minutes * 60_000;
export const isLive = (s: AccessSession, now: number) => !s.endedAt && now < expiresAt(s);
export const remainingMs = (s: AccessSession, now: number) => Math.max(0, expiresAt(s) - now);

/* ---------- Money oversight ---------- */

export interface Revenue { subscriptions30: number; addons30: number; oneTime30: number; mrrSubscriptions: number; mrrAddons: number }
/** LAK's own revenue. Merchant sales (GMV) are merchant funds and are never part of it; one-time fees are not recurring. */
export function revenueSummary(r: Revenue) {
  const mrr = r.mrrSubscriptions + r.mrrAddons;
  return { lakRevenue30: r.subscriptions30 + r.addons30 + r.oneTime30, recurring30: r.subscriptions30 + r.addons30, mrr, arr: mrr * 12 };
}
export const gmv = (stores: Store[]) => stores.reduce((sum, s) => sum + s.gmv30, 0);

export type LedgerKind = 'sale' | 'refund' | 'chargeback' | 'payout' | 'subscription';
export interface LedgerEntry { ref: string; at: string; storeId: string; kind: LedgerKind; method: string; amount: number; status: 'captured' | 'pending' | 'failed' | 'reversed' | 'settled'; flag?: L }
/** Which book an entry belongs to. LAK invoices are LAK revenue; everything else is merchant money LAK processes. */
export const fundOf = (k: LedgerKind): 'merchant' | 'lak' => (k === 'subscription' ? 'lak' : 'merchant');

export type DisputeState = 'open' | 'awaitingMerchant' | 'submitted' | 'won' | 'lost';
export const DISPUTE_NEXT: Record<DisputeState, DisputeState[]> = {
  open: ['awaitingMerchant'], awaitingMerchant: ['submitted'], submitted: ['won', 'lost'], won: [], lost: [],
};
export interface Dispute { id: string; txn: string; storeId: string; amount: number; reason: L; state: DisputeState; due: string; kind: 'chargeback' | 'dispute' | 'refundEscalation' }
export function advanceDispute(d: Dispute, to: DisputeState, role: RoleId): Result<Dispute> {
  if (!can(role, 'payments.act')) return fail('noPerm');
  if (!DISPUTE_NEXT[d.state].includes(to)) return fail('badTransition');
  return ok({ ...d, state: to });
}

/* ---------- Shipping ---------- */

export interface Carrier { id: string; name: L; cities: number; slaDays: number; onTime: number; status: 'operational' | 'degraded' | 'down'; complaints: number; asOf: string }
export type DeliveryState = 'failed' | 'reattempt' | 'returning' | 'resolved';
export const DELIVERY_NEXT: Record<DeliveryState, DeliveryState[]> = { failed: ['reattempt', 'returning'], reattempt: ['resolved', 'returning'], returning: ['resolved'], resolved: [] };
export interface FailedDelivery { id: string; storeId: string; carrierId: string; city: L; reason: L; attempts: number; state: DeliveryState; since: string }
export function advanceDelivery(d: FailedDelivery, to: DeliveryState, role: RoleId): Result<FailedDelivery> {
  if (!can(role, 'shipping.act')) return fail('noPerm');
  if (!DELIVERY_NEXT[d.state].includes(to)) return fail('badTransition');
  return ok({ ...d, state: to, attempts: to === 'reattempt' ? d.attempts + 1 : d.attempts });
}

/* ---------- Content moderation ---------- */

export type ReviewState = 'review' | 'approved' | 'rejected' | 'suspended';
export type ModAction = 'approve' | 'reject' | 'suspend' | 'reinstate';
export interface Submission { id: string; kind: 'theme' | 'app'; name: L; developer: L; version: string; submitted: string; installs: number; checks: { label: L; ok: boolean }[]; scopes: L[]; state: ReviewState; note?: string }
const MOD: Record<ModAction, [ReviewState, ReviewState]> = { approve: ['review', 'approved'], reject: ['review', 'rejected'], suspend: ['approved', 'suspended'], reinstate: ['suspended', 'approved'] };
export function moderate(s: Submission, action: ModAction, reason: string, role: RoleId): Result<Submission> {
  if (!can(role, 'content.moderate')) return fail('noPerm');
  const [fromState, to] = MOD[action];
  if (s.state !== fromState) return fail('badTransition');
  if (action === 'approve' && s.checks.some((c) => !c.ok)) return fail('checksFailed');
  if (action !== 'approve' && !hasReason(reason)) return fail('reasonRequired');
  return ok({ ...s, state: to, note: reason.trim() || undefined });
}
export const modActions = (s: Submission): ModAction[] => (Object.keys(MOD) as ModAction[]).filter((a) => MOD[a][0] === s.state);

/* ---------- Announcements (scheduled only; never sent) ---------- */

export interface Audience { type: 'all' | 'plans' | 'stores'; plans: PlanId[]; storeIds: string[] }
export interface AnnouncementDraft { kind: 'update' | 'maintenance'; title: L; body: L; audience: Audience; at: string; windowEnd: string }
export interface Announcement extends AnnouncementDraft { id: string; status: 'scheduled' | 'cancelled'; by: RoleId; created: number }

/** Recipients: suspended stores are excluded because their admin is not the right channel for platform updates. */
export function audienceStores(stores: Store[], a: Audience): Store[] {
  return stores.filter((s) => s.status !== 'suspended' && (a.type === 'all' || (a.type === 'plans' ? a.plans.includes(s.plan) : a.storeIds.includes(s.id))));
}

export function validateAnnouncement(d: AnnouncementDraft, stores: Store[], now: string): ErrorCode[] {
  const e: ErrorCode[] = [];
  if (!d.title.ar.trim() || !d.title.en.trim()) e.push('titleRequired');
  if (!d.body.ar.trim() || !d.body.en.trim()) e.push('bodyRequired');
  if (audienceStores(stores, d.audience).length === 0) e.push('audienceEmpty');
  if (!d.at || d.at <= now) e.push('scheduleInPast');
  if (d.kind === 'maintenance' && (!d.windowEnd || d.windowEnd <= d.at)) e.push('windowInvalid');
  return e;
}

/* ---------- CSV ---------- */

/** Halalas to a plain decimal string for spreadsheets (no grouping, no float maths). */
export function csvMoney(h: number): string {
  const sign = h < 0 ? '-' : '';
  const a = Math.abs(h);
  return `${sign}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`; // spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/* ---------- Audit ---------- */

export type AuditAction =
  | 'roleSwitched' | 'kycApprove' | 'kycReject' | 'kycInfo' | 'docViewed' | 'storeSuspended' | 'storeReactivated'
  | 'accessStarted' | 'accessEnded' | 'accessExpired' | 'planProposed' | 'planApproved' | 'planRejected'
  | 'disputeMoved' | 'deliveryMoved' | 'contentModerated' | 'reportExported' | 'announcementScheduled' | 'announcementCancelled';
export interface AuditEntry { id: string; at: number; role: RoleId; action: AuditAction; target: string; targetLabel: L; reason?: string; detail?: L }

/* ---------- Fixtures ---------- */

export const TODAY = '2026-11-24';
/** Fixture snapshot time (Riyadh). Health and counters say "data as of" this moment. */
export const DATA_AS_OF = '2026-11-24T09:30:00+03:00';

const st = (p: Partial<Store> & Pick<Store, 'id' | 'name' | 'merchant' | 'category' | 'city' | 'plan' | 'status'>): Store => ({
  domain: { host: `${p.id}.lak.example`, kind: 'platform', state: 'verified' }, platformPath: `platform.example/${p.id}`,
  created: '2025-03-01', gmv30: 0, orders30: 0, openOrders: 0, pendingPayout: 0, errors24h: 0, visits30: 0, staff: 1, products: 0, tickets: 0,
  lastOrder: null, featuresInUse: [], ...p,
});

export function storeFixtures(): Store[] {
  return [
    st({ id: 's-1001', name: { ar: 'دار العود', en: 'Dar Al Oud' }, merchant: { ar: 'شركة دار العود التجارية', en: 'Dar Al Oud Trading Co.' }, category: { ar: 'عطور', en: 'Perfume' }, city: { ar: 'الرياض', en: 'Riyadh' }, plan: 'pro', status: 'active',
      domain: { host: 'daraloud.example', kind: 'custom', state: 'verified' }, platformPath: 'platform.example/daraloud', created: '2024-02-11',
      gmv30: 18_420_000, orders30: 612, openOrders: 38, pendingPayout: 4_215_050, errors24h: 3, visits30: 48_200, staff: 6, products: 340, tickets: 2, lastOrder: '2026-11-24', featuresInUse: ['affiliate', 'segments', 'loyalty'] }),
    st({ id: 's-1002', name: { ar: 'تمور النخيل', en: 'Nakheel Dates' }, merchant: { ar: 'عبدالله السبيعي', en: 'Abdullah Al-Subaie' }, category: { ar: 'أغذية', en: 'Food' }, city: { ar: 'بريدة', en: 'Buraydah' }, plan: 'plus', status: 'active',
      domain: { host: 'nakheel-dates.example', kind: 'custom', state: 'verified' }, created: '2024-09-03',
      gmv30: 6_215_500, orders30: 288, openOrders: 14, pendingPayout: 1_120_000, errors24h: 0, visits30: 15_900, staff: 3, products: 42, tickets: 0, lastOrder: '2026-11-23', featuresInUse: ['loyalty', 'wholesale'] }),
    st({ id: 's-1003', name: { ar: 'لمسة للعبايات', en: 'Lamsa Abayas' }, merchant: { ar: 'مؤسسة لمسة', en: 'Lamsa Est.' }, category: { ar: 'أزياء', en: 'Fashion' }, city: { ar: 'جدة', en: 'Jeddah' }, plan: 'plus', status: 'active',
      gmv30: 9_870_000, orders30: 401, openOrders: 22, pendingPayout: 2_034_500, errors24h: 1, visits30: 31_400, staff: 3, products: 186, tickets: 1, lastOrder: '2026-11-24', featuresInUse: ['messaging'] }),
    st({ id: 's-1004', name: { ar: 'بيت القهوة', en: 'Bayt Al Qahwa' }, merchant: { ar: 'سلمان الدوسري', en: 'Salman Al-Dosari' }, category: { ar: 'قهوة', en: 'Coffee' }, city: { ar: 'الدمام', en: 'Dammam' }, plan: 'basic', status: 'active',
      gmv30: 1_284_000, orders30: 97, openOrders: 5, pendingPayout: 0, visits30: 4_100, products: 28, lastOrder: '2026-11-22' }),
    st({ id: 's-1005', name: { ar: 'ركن التقنية', en: 'Techno Corner' }, merchant: { ar: 'شركة ركن التقنية', en: 'Techno Corner Co.' }, category: { ar: 'إلكترونيات', en: 'Electronics' }, city: { ar: 'الرياض', en: 'Riyadh' }, plan: 'pro', status: 'suspended',
      domain: { host: 'technocorner.example', kind: 'custom', state: 'verified' }, gmv30: 0, orders30: 0, openOrders: 9, pendingPayout: 2_870_000, staff: 4, products: 512, tickets: 6, lastOrder: '2026-11-02',
      suspension: { kind: 'temporary', days: 14, reason: 'Chargeback rate above review threshold; evidence requested from merchant.', by: 'finance', at: Date.parse('2026-11-18T11:00:00+03:00') } }),
    st({ id: 's-1006', name: { ar: 'متجر سنابل الخيري', en: 'Sanabel Charity Store' }, merchant: { ar: 'جمعية سنابل الخيرية', en: 'Sanabel Charity' }, category: { ar: 'خيري', en: 'Charity' }, city: { ar: 'المدينة المنورة', en: 'Madinah' }, plan: 'basic', status: 'active',
      gmv30: 0, orders30: 0, visits30: 620, products: 12, lastOrder: '2026-10-09' }),
    st({ id: 's-1007', name: { ar: 'مؤسسة الأفق الأخضر لمستلزمات الحدائق والري والزراعة المنزلية', en: 'Green Horizon Est. for Garden, Irrigation & Home Farming Supplies' }, merchant: { ar: 'مؤسسة الأفق الأخضر', en: 'Green Horizon Est.' }, category: { ar: 'حدائق', en: 'Garden' }, city: { ar: 'الخرج', en: 'Al Kharj' }, plan: 'plus', status: 'active',
      domain: { host: 'green-horizon-garden-irrigation.example', kind: 'custom', state: 'pending' }, gmv30: 2_310_000, orders30: 76, openOrders: 4, pendingPayout: 410_000, errors24h: 7, visits30: 6_800, staff: 2, products: 920, tickets: 3, lastOrder: '2026-11-20' }),
    st({ id: 's-1008', name: { ar: 'كوكب الأطفال', en: 'Kids Planet' }, merchant: { ar: 'شركة كوكب الأطفال القابضة', en: 'Kids Planet Holding' }, category: { ar: 'ألعاب', en: 'Toys' }, city: { ar: 'الخبر', en: 'Al Khobar' }, plan: 'special', status: 'active',
      domain: { host: 'kidsplanet.example', kind: 'custom', state: 'verified' }, created: '2023-11-20', gmv30: 41_960_000, orders30: 1_874, openOrders: 121, pendingPayout: 9_880_000, errors24h: 12, visits30: 156_000, staff: 18, products: 2_430, tickets: 4, lastOrder: '2026-11-24', featuresInUse: ['erp', 'branches', 'affiliate', 'segments'] }),
    st({ id: 's-1009', name: { ar: 'ورد', en: 'Ward Flowers' }, merchant: { ar: 'ريم القحطاني', en: 'Reem Al-Qahtani' }, category: { ar: 'زهور', en: 'Flowers' }, city: { ar: 'الرياض', en: 'Riyadh' }, plan: 'basic', status: 'onboarding', created: '2026-11-19', products: 3 }),
    st({ id: 's-1010', name: { ar: 'أثر للكتب', en: 'Athar Books' }, merchant: { ar: 'مكتبة أثر', en: 'Athar Bookshop' }, category: { ar: 'كتب', en: 'Books' }, city: { ar: 'أبها', en: 'Abha' }, plan: 'plus', status: 'active',
      domain: { host: 'atharbooks.example', kind: 'custom', state: 'failed' }, gmv30: 845_000, orders30: 63, openOrders: 2, pendingPayout: 96_000, errors24h: 2, visits30: 3_900, staff: 2, products: 1_120, tickets: 1, lastOrder: '2026-11-21' }),
    st({ id: 's-1011', name: { ar: 'نقطة الرياضة', en: 'Nuqta Sport' }, merchant: { ar: 'شركة نقطة للتجارة', en: 'Nuqta Trading' }, category: { ar: 'رياضة', en: 'Sports' }, city: { ar: 'جدة', en: 'Jeddah' }, plan: 'pro', status: 'active',
      gmv30: 7_402_000, orders30: 330, openOrders: 17, pendingPayout: 1_560_000, errors24h: 0, visits30: 22_700, staff: 5, products: 610, tickets: 0, lastOrder: '2026-11-24', featuresInUse: ['qtyPricing'] }),
    st({ id: 's-1012', name: { ar: 'صفا للمنزل', en: 'Safa Home' }, merchant: { ar: 'خالد العتيبي', en: 'Khaled Al-Otaibi' }, category: { ar: 'منزل', en: 'Home' }, city: { ar: 'الطائف', en: 'Taif' }, plan: 'basic', status: 'suspended',
      openOrders: 1, products: 64, lastOrder: '2026-10-28', suspension: { kind: 'indefinite', reason: 'Merchant asked to pause the store while relocating the warehouse.', by: 'ops', at: Date.parse('2026-10-30T15:20:00+03:00') } }),
  ];
}

const ev = (iso: string): KycEvent => ({ kind: 'submitted', at: Date.parse(iso) });
export function applicationFixtures(): Application[] {
  return [
    { id: 'a-2051', merchant: { ar: 'فهد الغامدي', en: 'Fahad Al-Ghamdi' }, store: { ar: 'عسل الروابي', en: 'Rawabi Honey' }, type: 'sole', city: { ar: 'الباحة', en: 'Al Baha' }, category: { ar: 'أغذية', en: 'Food' }, plan: 'plus', submitted: '2026-11-23T10:12:00+03:00',
      email: 'f•••@example.com', phone: '+966 5• ••• ••47', status: 'pending', flags: [], events: [ev('2026-11-23T10:12:00+03:00')],
      docs: [{ kind: 'nationalId', state: 'ok', ref: '10•• ••• •812' }, { kind: 'cr', state: 'ok', ref: '58•• ••• •031', expires: '2027-08-14' }, { kind: 'iban', state: 'ok', ref: 'SA•• •••• •••• •••• 4410' }] },
    { id: 'a-2052', merchant: { ar: 'شركة تمام للإلكترونيات', en: 'Tamam Electronics LLC' }, store: { ar: 'تمام', en: 'Tamam' }, type: 'corporate', city: { ar: 'الرياض', en: 'Riyadh' }, category: { ar: 'إلكترونيات', en: 'Electronics' }, plan: 'pro', submitted: '2026-11-22T16:40:00+03:00',
      email: 'o•••@example.com', phone: '+966 1• ••• ••90', status: 'pending', flags: [{ ar: 'شهادة ضريبة القيمة المضافة منتهية', en: 'VAT certificate expired' }], events: [ev('2026-11-22T16:40:00+03:00')],
      docs: [{ kind: 'cr', state: 'ok', ref: '10•• ••• •557', expires: '2028-01-02' }, { kind: 'vat', state: 'expired', ref: '31•• ••• •••• ••03', expires: '2026-10-31' }, { kind: 'authorizedId', state: 'ok', ref: '10•• ••• •209' }, { kind: 'iban', state: 'ok', ref: 'SA•• •••• •••• •••• 7781' }] },
    { id: 'a-2053', merchant: { ar: 'جمعية إحسان الخيرية', en: 'Ihsan Charity Association' }, store: { ar: 'متجر إحسان', en: 'Ihsan Store' }, type: 'charity', city: { ar: 'مكة المكرمة', en: 'Makkah' }, category: { ar: 'خيري', en: 'Charity' }, plan: 'basic', submitted: '2026-11-21T09:05:00+03:00',
      email: 'i•••@example.org', phone: '+966 1• ••• ••15', status: 'pending', flags: [], events: [ev('2026-11-21T09:05:00+03:00')],
      docs: [{ kind: 'charityLicense', state: 'ok', ref: 'NC-•••-1188' }, { kind: 'govApproval', state: 'missing', ref: '—' }, { kind: 'iban', state: 'ok', ref: 'SA•• •••• •••• •••• 0062' }] },
    { id: 'a-2054', merchant: { ar: 'نورة الحربي', en: 'Noura Al-Harbi' }, store: { ar: 'شموع نورة', en: 'Noura Candles' }, type: 'individual', city: { ar: 'حائل', en: "Ha'il" }, category: { ar: 'حرف يدوية', en: 'Handmade' }, plan: 'basic', submitted: '2026-11-19T20:30:00+03:00',
      email: 'n•••@example.com', phone: '+966 5• ••• ••03', status: 'info', flags: [],
      events: [ev('2026-11-19T20:30:00+03:00'), { kind: 'info', at: Date.parse('2026-11-20T10:00:00+03:00'), by: 'ops', reason: 'National ID photo is unreadable; please upload a clear scan.' }],
      docs: [{ kind: 'nationalId', state: 'unreadable', ref: '11•• ••• •340' }, { kind: 'iban', state: 'ok', ref: 'SA•• •••• •••• •••• 5503' }] },
    { id: 'a-2055', merchant: { ar: 'شركة موج للأزياء', en: 'Mawj Fashion Co.' }, store: { ar: 'موج', en: 'Mawj Swimwear' }, type: 'corporate', city: { ar: 'جدة', en: 'Jeddah' }, category: { ar: 'أزياء', en: 'Fashion' }, plan: 'plus', submitted: '2026-11-24T07:55:00+03:00',
      email: 's•••@example.com', phone: '+966 1• ••• ••28', status: 'pending',
      flags: [{ ar: 'الحساب البنكي نفسه مستخدم في طلب سابق مرفوض — تحقق قبل القرار (ليس اتهامًا)', en: 'Same bank account appears on an earlier rejected application — verify before deciding (not an accusation)' }],
      events: [ev('2026-11-24T07:55:00+03:00')],
      docs: [{ kind: 'cr', state: 'ok', ref: '40•• ••• •772', expires: '2027-03-30' }, { kind: 'vat', state: 'ok', ref: '30•• ••• •••• ••11', expires: '2027-06-30' }, { kind: 'authorizedId', state: 'ok', ref: '10•• ••• •615' }, { kind: 'iban', state: 'ok', ref: 'SA•• •••• •••• •••• 9014' }] },
    { id: 'a-2047', merchant: { ar: 'ريم القحطاني', en: 'Reem Al-Qahtani' }, store: { ar: 'ورد', en: 'Ward Flowers' }, type: 'individual', city: { ar: 'الرياض', en: 'Riyadh' }, category: { ar: 'زهور', en: 'Flowers' }, plan: 'basic', submitted: '2026-11-17T12:00:00+03:00',
      email: 'r•••@example.com', phone: '+966 5• ••• ••71', status: 'approved', flags: [], storeId: 's-1009',
      events: [ev('2026-11-17T12:00:00+03:00'), { kind: 'approve', at: Date.parse('2026-11-19T09:10:00+03:00'), by: 'ops', reason: 'All documents valid and matching the applicant.' }],
      docs: [{ kind: 'nationalId', state: 'ok', ref: '10•• ••• •998' }, { kind: 'iban', state: 'ok', ref: 'SA•• •••• •••• •••• 1207' }] },
  ];
}

export function revenueFixture(): Revenue {
  return { subscriptions30: 38_640_000, addons30: 4_120_000, oneTime30: 1_385_000, mrrSubscriptions: 38_640_000, mrrAddons: 4_120_000 };
}

export function ledgerFixtures(): LedgerEntry[] {
  return [
    { ref: 'TX-88412', at: '2026-11-24T09:12:00+03:00', storeId: 's-1001', kind: 'sale', method: 'mada •••• 4821', amount: 74_750, status: 'captured' },
    { ref: 'TX-88409', at: '2026-11-24T08:57:00+03:00', storeId: 's-1008', kind: 'sale', method: 'Visa •••• 1190', amount: 1_249_900, status: 'pending', flag: { ar: 'مبلغ أعلى من المعتاد لهذا المتجر', en: 'Amount above this store’s usual range' } },
    { ref: 'TX-88401', at: '2026-11-24T08:31:00+03:00', storeId: 's-1003', kind: 'sale', method: 'Apple Pay •••• 0442', amount: 46_000, status: 'failed' },
    { ref: 'TX-88398', at: '2026-11-24T08:02:00+03:00', storeId: 's-1011', kind: 'refund', method: 'mada •••• 7730', amount: -18_900, status: 'settled' },
    { ref: 'TX-88377', at: '2026-11-23T22:40:00+03:00', storeId: 's-1005', kind: 'chargeback', method: 'Mastercard •••• 5512', amount: -389_900, status: 'reversed' },
    { ref: 'PO-1204', at: '2026-11-23T18:00:00+03:00', storeId: 's-1002', kind: 'payout', method: 'SA•• •••• 4410', amount: -1_870_000, status: 'settled' },
    { ref: 'INV-30551', at: '2026-11-23T03:00:00+03:00', storeId: 's-1001', kind: 'subscription', method: 'Visa •••• 8803', amount: 0, status: 'captured' },
    { ref: 'INV-30549', at: '2026-11-23T03:00:00+03:00', storeId: 's-1010', kind: 'subscription', method: 'mada •••• 3317', amount: 0, status: 'failed', flag: { ar: 'تعذر التحصيل — المحاولة التالية خلال 3 أيام (قاعدة مقترحة)', en: 'Collection failed — next retry in 3 days (proposed rule)' } },
    { ref: 'TX-88342', at: '2026-11-23T15:25:00+03:00', storeId: 's-1007', kind: 'sale', method: 'Cash on delivery', amount: 32_500, status: 'pending' },
    { ref: 'TX-88310', at: '2026-11-23T11:02:00+03:00', storeId: 's-1004', kind: 'sale', method: 'Bank transfer', amount: 21_000, status: 'captured' },
  ];
}

export function disputeFixtures(): Dispute[] {
  return [
    { id: 'DP-311', txn: 'TX-88377', storeId: 's-1005', amount: 389_900, reason: { ar: 'العميل يقول إن المنتج لم يصل', en: 'Customer says item not received' }, state: 'awaitingMerchant', due: '2026-11-29', kind: 'chargeback' },
    { id: 'DP-312', txn: 'TX-87920', storeId: 's-1005', amount: 129_900, reason: { ar: 'عملية غير مصرح بها', en: 'Unauthorised transaction' }, state: 'open', due: '2026-12-03', kind: 'chargeback' },
    { id: 'DP-308', txn: 'TX-86211', storeId: 's-1003', amount: 46_000, reason: { ar: 'المنتج مختلف عن الوصف', en: 'Item not as described' }, state: 'submitted', due: '2026-11-26', kind: 'dispute' },
    { id: 'DP-305', txn: 'TX-85540', storeId: 's-1008', amount: 215_000, reason: { ar: 'استرداد متأخر طلب العميل تصعيده', en: 'Late refund escalated by customer' }, state: 'open', due: '2026-11-27', kind: 'refundEscalation' },
    { id: 'DP-297', txn: 'TX-83002', storeId: 's-1001', amount: 74_750, reason: { ar: 'خصم مكرر', en: 'Duplicate charge' }, state: 'won', due: '2026-11-10', kind: 'dispute' },
  ];
}

export function carrierFixtures(): Carrier[] {
  return [
    { id: 'c-a', name: { ar: 'ناقل تجريبي أ', en: 'Test carrier A' }, cities: 214, slaDays: 2, onTime: 9420, status: 'operational', complaints: 6, asOf: DATA_AS_OF },
    { id: 'c-b', name: { ar: 'ناقل تجريبي ب', en: 'Test carrier B' }, cities: 168, slaDays: 3, onTime: 8810, status: 'degraded', complaints: 19, asOf: DATA_AS_OF },
    { id: 'c-c', name: { ar: 'ناقل تجريبي ج', en: 'Test carrier C' }, cities: 41, slaDays: 1, onTime: 9650, status: 'operational', complaints: 2, asOf: DATA_AS_OF },
    { id: 'c-d', name: { ar: 'ناقل تجريبي د', en: 'Test carrier D' }, cities: 95, slaDays: 4, onTime: 0, status: 'down', complaints: 4, asOf: '2026-11-24T06:10:00+03:00' },
  ];
}

export function deliveryFixtures(): FailedDelivery[] {
  return [
    { id: 'SH-50021', storeId: 's-1001', carrierId: 'c-b', city: { ar: 'الرياض', en: 'Riyadh' }, reason: { ar: 'العميل لم يرد على الاتصال', en: 'Customer did not answer' }, attempts: 2, state: 'failed', since: '2026-11-23' },
    { id: 'SH-50017', storeId: 's-1003', carrierId: 'c-b', city: { ar: 'مكة المكرمة', en: 'Makkah' }, reason: { ar: 'العنوان غير مكتمل', en: 'Incomplete address' }, attempts: 1, state: 'failed', since: '2026-11-23' },
    { id: 'SH-49980', storeId: 's-1008', carrierId: 'c-a', city: { ar: 'الدمام', en: 'Dammam' }, reason: { ar: 'رفض الاستلام عند الدفع', en: 'Refused at cash collection' }, attempts: 1, state: 'returning', since: '2026-11-21' },
    { id: 'SH-49961', storeId: 's-1011', carrierId: 'c-d', city: { ar: 'جدة', en: 'Jeddah' }, reason: { ar: 'الناقل متوقف — الشحنة لم تُستلم من المستودع', en: 'Carrier down — not collected from warehouse' }, attempts: 0, state: 'failed', since: '2026-11-24' },
    { id: 'SH-49940', storeId: 's-1002', carrierId: 'c-a', city: { ar: 'تبوك', en: 'Tabuk' }, reason: { ar: 'تأخر عن مدة الخدمة', en: 'Past SLA window' }, attempts: 1, state: 'reattempt', since: '2026-11-20' },
  ];
}

const chk = (ar: string, en: string, ok = true) => ({ label: { ar, en }, ok });
export function submissionFixtures(): Submission[] {
  return [
    { id: 'th-77', kind: 'theme', name: { ar: 'سدو', en: 'Sadu' }, developer: { ar: 'استوديو نقش', en: 'Naqsh Studio' }, version: '1.0.0', submitted: '2026-11-22', installs: 0, state: 'review',
      scopes: [], checks: [chk('تخطيط من اليمين لليسار', 'RTL layout'), chk('تباين النص', 'Text contrast'), chk('ميزانية الأداء', 'Performance budget'), chk('خطوط مرخّصة', 'Licensed fonts')] },
    { id: 'ap-31', kind: 'app', name: { ar: 'تقييمات بلس', en: 'Reviews Plus' }, developer: { ar: 'شركة رصد', en: 'Rasd Co.' }, version: '2.3.0', submitted: '2026-11-21', installs: 0, state: 'review',
      scopes: [{ ar: 'قراءة الطلبات', en: 'Read orders' }, { ar: 'قراءة العملاء', en: 'Read customers' }, { ar: 'كتابة التقييمات', en: 'Write reviews' }],
      checks: [chk('فحص أمني', 'Security scan'), chk('نطاق الصلاحيات مبرر', 'Scopes justified'), chk('رابط سياسة الخصوصية', 'Privacy policy link', false), chk('دعم العربية', 'Arabic support')] },
    { id: 'ap-29', kind: 'app', name: { ar: 'تنبيهات الطلبات', en: 'Order alerts' }, developer: { ar: 'مطور راسل', en: 'Rasel Dev' }, version: '1.4.2', submitted: '2026-11-20', installs: 0, state: 'review',
      scopes: [{ ar: 'قراءة الطلبات', en: 'Read orders' }], checks: [chk('فحص أمني', 'Security scan'), chk('نطاق الصلاحيات مبرر', 'Scopes justified'), chk('رابط سياسة الخصوصية', 'Privacy policy link'), chk('دعم العربية', 'Arabic support')] },
    { id: 'th-70', kind: 'theme', name: { ar: 'سوق بسيط', en: 'Minimal Souq' }, developer: { ar: 'فريق لك', en: 'LAK team' }, version: '3.1.0', submitted: '2026-09-02', installs: 1_284, state: 'approved', scopes: [],
      checks: [chk('تخطيط من اليمين لليسار', 'RTL layout'), chk('تباين النص', 'Text contrast'), chk('ميزانية الأداء', 'Performance budget'), chk('خطوط مرخّصة', 'Licensed fonts')] },
    { id: 'ap-22', kind: 'app', name: { ar: 'مزامنة المحاسبة', en: 'Ledger Sync' }, developer: { ar: 'شركة دفتر', en: 'Daftar Co.' }, version: '5.0.1', submitted: '2026-06-14', installs: 342, state: 'approved',
      scopes: [{ ar: 'قراءة الطلبات', en: 'Read orders' }, { ar: 'قراءة المدفوعات', en: 'Read payments' }], checks: [chk('فحص أمني', 'Security scan'), chk('نطاق الصلاحيات مبرر', 'Scopes justified'), chk('رابط سياسة الخصوصية', 'Privacy policy link'), chk('دعم العربية', 'Arabic support')] },
    { id: 'ap-18', kind: 'app', name: { ar: 'نوافذ منبثقة', en: 'Popup Boost' }, developer: { ar: 'مطور خارجي', en: 'Third-party dev' }, version: '0.9.8', submitted: '2026-04-02', installs: 57, state: 'suspended', note: 'Injected scripts slowed storefront checkout.',
      scopes: [{ ar: 'تعديل واجهة المتجر', en: 'Edit storefront' }], checks: [chk('فحص أمني', 'Security scan'), chk('ميزانية الأداء', 'Performance budget', false)] },
  ];
}

export interface Service { id: string; name: L; uptime: number; p95: number; errors: number; calls24h: number }
/** Uptime and error rate are basis points (99.95% = 9995; 0.12% = 12). */
export const SERVICES: Service[] = [
  { id: 'storefront', name: { ar: 'واجهات المتاجر', en: 'Storefronts' }, uptime: 9996, p95: 420, errors: 8, calls24h: 4_820_000 },
  { id: 'checkout', name: { ar: 'إتمام الشراء', en: 'Checkout' }, uptime: 9991, p95: 690, errors: 21, calls24h: 312_000 },
  { id: 'payments', name: { ar: 'محوّل المدفوعات', en: 'Payments adapter' }, uptime: 9978, p95: 1_240, errors: 64, calls24h: 98_400 },
  { id: 'orders', name: { ar: 'واجهة الطلبات البرمجية', en: 'Orders API' }, uptime: 9998, p95: 180, errors: 4, calls24h: 1_105_000 },
  { id: 'search', name: { ar: 'البحث', en: 'Search' }, uptime: 9940, p95: 2_100, errors: 152, calls24h: 2_260_000 },
  { id: 'media', name: { ar: 'الوسائط والتخزين', en: 'Media & storage' }, uptime: 9999, p95: 95, errors: 1, calls24h: 6_930_000 },
  { id: 'notify', name: { ar: 'الإشعارات', en: 'Notifications' }, uptime: 9987, p95: 340, errors: 37, calls24h: 210_000 },
  { id: 'webhooks', name: { ar: 'الويب هوك للشركاء', en: 'Partner webhooks' }, uptime: 9993, p95: 510, errors: 18, calls24h: 455_000 },
];
/** Fixture thresholds — to be replaced by the approved SLOs. */
export function serviceStatus(s: Service): 'ok' | 'degraded' | 'down' {
  if (s.uptime < 9900) return 'down';
  if (s.uptime < 9950 || s.errors > 100 || s.p95 > 1_500) return 'degraded';
  return 'ok';
}

export interface SubsMonth { month: string; signups: number; cancellations: number; upgrades: number; downgrades: number }
export const SUBS_MONTHS: SubsMonth[] = [
  { month: '2026-08', signups: 182, cancellations: 41, upgrades: 26, downgrades: 9 },
  { month: '2026-09', signups: 205, cancellations: 38, upgrades: 31, downgrades: 12 },
  { month: '2026-10', signups: 231, cancellations: 44, upgrades: 29, downgrades: 8 },
  { month: '2026-11', signups: 167, cancellations: 30, upgrades: 22, downgrades: 7 },
];

export interface RegionRevenue { region: L; subscriptions: number; addons: number; oneTime: number }
export const REGION_REVENUE: RegionRevenue[] = [
  { region: { ar: 'المنطقة الوسطى', en: 'Central region' }, subscriptions: 15_120_000, addons: 1_840_000, oneTime: 520_000 },
  { region: { ar: 'المنطقة الغربية', en: 'Western region' }, subscriptions: 11_480_000, addons: 1_210_000, oneTime: 430_000 },
  { region: { ar: 'المنطقة الشرقية', en: 'Eastern region' }, subscriptions: 7_960_000, addons: 760_000, oneTime: 285_000 },
  { region: { ar: 'المناطق الأخرى', en: 'Other regions' }, subscriptions: 4_080_000, addons: 310_000, oneTime: 150_000 },
];

export interface SecurityEvent { at: string; kind: L; source: string; count: number; note: L }
export const SECURITY_EVENTS: SecurityEvent[] = [
  { at: '2026-11-24T08:44:00+03:00', kind: { ar: 'محاولات دخول فاشلة للوحة الإدارة', en: 'Failed admin sign-ins' }, source: '203.0.113.24', count: 9, note: { ar: 'الحساب مقفل 15 دقيقة تلقائيًا (قاعدة مقترحة)', en: 'Account auto-locked 15 min (proposed rule)' } },
  { at: '2026-11-24T07:10:00+03:00', kind: { ar: 'تجاوز حد الطلبات لواجهة شريك', en: 'Partner API rate limit hit' }, source: 'ap-22', count: 1_420, note: { ar: 'طلبات زائدة رُفضت بالرمز 429', en: 'Excess calls rejected with 429' } },
  { at: '2026-11-23T23:58:00+03:00', kind: { ar: 'دخول إداري من جهاز جديد', en: 'Admin sign-in from new device' }, source: '198.51.100.7', count: 1, note: { ar: 'تم التحقق بالعامل الثاني', en: 'Second factor verified' } },
];

export function announcementFixtures(): Announcement[] {
  return [{
    id: 'an-9', kind: 'maintenance', status: 'scheduled', by: 'ops', created: Date.parse('2026-11-20T12:00:00+03:00'),
    title: { ar: 'صيانة مجدولة لإتمام الشراء', en: 'Scheduled checkout maintenance' },
    body: { ar: 'قد يتوقف إتمام الشراء في المتاجر لمدة تصل إلى ساعتين. لن تتأثر بيانات متجرك.', en: 'Store checkout may be unavailable for up to two hours. Your store data is not affected.' },
    audience: { type: 'all', plans: [], storeIds: [] }, at: '2026-12-02T02:00', windowEnd: '2026-12-02T04:00',
  }];
}
