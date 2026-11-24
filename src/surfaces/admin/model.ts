// P02 screen model: what each admin screen shows, as pure functions over the domain fixtures.
// No React here; every rule has a test in model.test.ts. Business rules stay in domain.ts.
import type { L, Lang } from '../../core/lang';
import {
  can, csvMoney, docsComplete, fundOf, gmv, isActiveStore, PLAN_NAME, REGION_REVENUE, SUBS_MONTHS, serviceStatus, toCsv,
  type Application, type AuditAction, type AuditEntry, type Dispute, type EntityType, type FailedDelivery, type KycStatus,
  type LedgerEntry, type LedgerKind, type PlanChange, type PlanId, type RoleId, type Section, type Service, type Store,
  type StoreStatus, type Submission,
} from './domain';
import { STORE_STATUS } from './i18n';

/* ---------- Pagination ---------- */

export const PAGE_SIZE = 8;
export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  return { page: p, pages, pageRows: rows.slice((p - 1) * size, p * size) };
}
const pageOf = (q: URLSearchParams) => Number(q.get('page') ?? '1') || 1;

/* ---------- Stores ---------- */

export type StoreView = 'all' | StoreStatus | 'attention';
export const STORE_VIEWS: StoreView[] = ['all', 'active', 'onboarding', 'suspended', 'attention'];
export type StoreFlag = 'errors' | 'domain' | 'payoutHold' | 'tickets';
/** Why a store needs a look from operations. Thresholds are fixture placeholders until approved. */
export function storeFlags(s: Store): StoreFlag[] {
  const f: StoreFlag[] = [];
  if (s.errors24h >= 5) f.push('errors');
  if (s.domain.state !== 'verified') f.push('domain');
  if (s.payoutHold) f.push('payoutHold');
  if (s.tickets >= 3) f.push('tickets');
  return f;
}

export interface StoreQuery { view: StoreView; q: string; plan: PlanId | ''; page: number }
export function readStoreQuery(q: URLSearchParams): StoreQuery {
  const v = q.get('view') ?? q.get('status') ?? 'all';
  const plan = q.get('plan') ?? '';
  return {
    view: (STORE_VIEWS as string[]).includes(v) ? (v as StoreView) : 'all',
    q: q.get('q') ?? '',
    plan: (['basic', 'plus', 'pro', 'special'] as string[]).includes(plan) ? (plan as PlanId) : '',
    page: pageOf(q),
  };
}
const inView = (s: Store, v: StoreView) => v === 'all' || (v === 'attention' ? storeFlags(s).length > 0 : s.status === v);
const matchStore = (s: Store, q: string) => {
  const t = q.trim().toLowerCase();
  return !t || [s.id, s.name.ar, s.name.en, s.merchant.ar, s.merchant.en, s.domain.host, s.city.ar, s.city.en].some((x) => x.toLowerCase().includes(t));
};
export function listStores(stores: Store[], q: StoreQuery, size = PAGE_SIZE) {
  const base = stores.filter((s) => matchStore(s, q.q) && (!q.plan || s.plan === q.plan));
  const counts = Object.fromEntries(STORE_VIEWS.map((v) => [v, base.filter((s) => inView(s, v)).length])) as Record<StoreView, number>;
  const rows = base.filter((s) => inView(s, q.view)).sort((a, b) => b.gmv30 - a.gmv30);
  return { rows, counts, filtered: !!(q.q.trim() || q.plan), ...paginate(rows, q.page, size) };
}

/** Selected stores as CSV (masked fields only). Money as plain decimals. */
export function storesCsv(stores: Store[], lang: Lang): string {
  const h = lang === 'ar'
    ? ['المعرف', 'المتجر', 'التاجر', 'الخطة', 'الحالة', 'المدينة', 'الطلبات 30 يومًا', 'المبيعات 30 يومًا (ر.س)']
    : ['ID', 'Store', 'Merchant', 'Plan', 'Status', 'City', 'Orders 30d', 'GMV 30d (SAR)'];
  return toCsv(h, stores.map((s) => [s.id, s.name[lang], s.merchant[lang], PLAN_NAME[s.plan], STORE_STATUS[s.status][lang], s.city[lang], s.orders30, csvMoney(s.gmv30)]));
}

/* ---------- KYC ---------- */

export interface AppQuery { status: KycStatus | ''; type: EntityType | ''; q: string; page: number }
export function readAppQuery(q: URLSearchParams): AppQuery {
  const st = q.get('status') ?? '';
  const ty = q.get('type') ?? '';
  return {
    status: (['pending', 'info', 'approved', 'rejected'] as string[]).includes(st) ? (st as KycStatus) : '',
    type: (['individual', 'sole', 'corporate', 'charity'] as string[]).includes(ty) ? (ty as EntityType) : '',
    q: q.get('q') ?? '', page: pageOf(q),
  };
}
/** Oldest first: the queue is worked in order of arrival. */
export function listApps(apps: Application[], q: AppQuery) {
  const t = q.q.trim().toLowerCase();
  const base = apps.filter((a) => (!q.type || a.type === q.type) && (!t || [a.id, a.store.ar, a.store.en, a.merchant.ar, a.merchant.en].some((x) => x.toLowerCase().includes(t))));
  const counts: Record<KycStatus | '', number> = { '': base.length, pending: 0, info: 0, approved: 0, rejected: 0 };
  base.forEach((a) => { counts[a.status] += 1; });
  const rows = base.filter((a) => !q.status || a.status === q.status).sort((a, b) => a.submitted.localeCompare(b.submitted));
  return { rows, counts, filtered: !!(t || q.type), ...paginate(rows, q.page) };
}
export const docsSummary = (a: Application) => ({ ok: a.docs.filter((d) => d.state === 'ok').length, total: a.docs.length, complete: docsComplete(a) });

/* ---------- Overview ---------- */

export type AttentionId = 'kyc' | 'plans' | 'disputes' | 'payouts' | 'deliveries' | 'content' | 'health';
export interface AttentionItem { id: AttentionId; n: number; section: Section; query?: Record<string, string> }
export interface PlatformData { stores: Store[]; apps: Application[]; changes: PlanChange[]; disputes: Dispute[]; deliveries: FailedDelivery[]; content: Submission[]; services: Service[] }
/** Work waiting for this role, money and merchant decisions first. Hidden sections are never counted. */
export function attention(role: RoleId, d: PlatformData): AttentionItem[] {
  const all: (AttentionItem & { perm: Parameters<typeof can>[1] })[] = [
    { id: 'disputes', perm: 'payments.view', section: 'payments', query: { tab: 'disputes' }, n: d.disputes.filter((x) => x.state === 'open' || x.state === 'awaitingMerchant').length },
    { id: 'plans', perm: 'plans.view', section: 'plans', query: { tab: 'changes' }, n: d.changes.filter((c) => c.status === 'pending').length },
    { id: 'kyc', perm: 'kyc.view', section: 'kyc', query: { status: 'pending' }, n: d.apps.filter((a) => a.status === 'pending').length },
    { id: 'payouts', perm: 'payments.view', section: 'payments', query: { tab: 'payouts' }, n: d.stores.filter((s) => s.payoutHold).length },
    { id: 'deliveries', perm: 'shipping.view', section: 'shipping', query: { tab: 'failed' }, n: d.deliveries.filter((x) => x.state === 'failed').length },
    { id: 'content', perm: 'content.view', section: 'content', query: { state: 'review' }, n: d.content.filter((c) => c.state === 'review').length },
    { id: 'health', perm: 'health.view', section: 'health', n: d.services.filter((s) => serviceStatus(s) !== 'ok').length },
  ];
  return all.filter((x) => x.n > 0 && can(role, x.perm)).map(({ perm: _p, ...x }) => x);
}

export function platformCounters(stores: Store[], today: string) {
  const live = stores.filter((s) => s.status !== 'suspended');
  return {
    active: stores.filter((s) => isActiveStore(s, today)).length,
    total: stores.length,
    onboarding: stores.filter((s) => s.status === 'onboarding').length,
    suspended: stores.filter((s) => s.status === 'suspended').length,
    orders30: live.reduce((n, s) => n + s.orders30, 0),
    errors24h: stores.reduce((n, s) => n + s.errors24h, 0),
  };
}

/** Stores per plan, for the plan-distribution bars. */
export function planDistribution(stores: Store[]) {
  const total = stores.length || 1;
  return (['basic', 'plus', 'pro', 'special'] as PlanId[]).map((p) => {
    const n = stores.filter((s) => s.plan === p).length;
    return { plan: p, n, sharePct: Math.round((n * 100) / total) };
  });
}

/* ---------- Global search (respects role) ---------- */

export interface SearchHit { kind: 'store' | 'application' | 'dispute' | 'transaction'; id: string; label: L; sub: L; section: Section; path: string; query?: Record<string, string> }
export function searchAll(role: RoleId, query: string, d: { stores: Store[]; apps: Application[]; disputes: Dispute[]; ledger: LedgerEntry[] }, limit = 8): SearchHit[] {
  const t = query.trim().toLowerCase();
  if (t.length < 2) return [];
  const name = (id: string): L => d.stores.find((s) => s.id === id)?.name ?? { ar: id, en: id };
  const hits: SearchHit[] = [];
  if (can(role, 'stores.view')) d.stores.filter((s) => matchStore(s, t)).forEach((s) => hits.push({ kind: 'store', id: s.id, label: s.name, sub: s.merchant, section: 'stores', path: s.id }));
  if (can(role, 'kyc.view')) d.apps.filter((a) => [a.id, a.store.ar, a.store.en, a.merchant.ar, a.merchant.en].some((x) => x.toLowerCase().includes(t)))
    .forEach((a) => hits.push({ kind: 'application', id: a.id, label: a.store, sub: a.merchant, section: 'kyc', path: a.id }));
  if (can(role, 'payments.view')) {
    d.disputes.filter((x) => x.id.toLowerCase().includes(t) || x.txn.toLowerCase().includes(t))
      .forEach((x) => hits.push({ kind: 'dispute', id: x.id, label: { ar: x.id, en: x.id }, sub: name(x.storeId), section: 'payments', path: '', query: { tab: 'disputes', q: x.id } }));
    d.ledger.filter((e) => e.ref.toLowerCase().includes(t))
      .forEach((e) => hits.push({ kind: 'transaction', id: e.ref, label: { ar: e.ref, en: e.ref }, sub: name(e.storeId), section: 'payments', path: '', query: { q: e.ref } }));
  }
  return hits.slice(0, limit);
}

/* ---------- Payments ---------- */

export type Fund = 'merchant' | 'lak';
export interface LedgerQuery { kind: LedgerKind | ''; fund: Fund | ''; q: string; page: number }
export function readLedgerQuery(q: URLSearchParams): LedgerQuery {
  const k = q.get('kind') ?? ''; const f = q.get('fund') ?? '';
  return {
    kind: (['sale', 'refund', 'chargeback', 'payout', 'subscription'] as string[]).includes(k) ? (k as LedgerKind) : '',
    fund: f === 'merchant' || f === 'lak' ? f : '', q: q.get('q') ?? '', page: pageOf(q),
  };
}
export function listLedger(ledger: LedgerEntry[], q: LedgerQuery) {
  const t = q.q.trim().toLowerCase();
  const rows = ledger.filter((e) => (!q.kind || e.kind === q.kind) && (!q.fund || fundOf(e.kind) === q.fund) && (!t || e.ref.toLowerCase().includes(t) || e.storeId.includes(t)))
    .sort((a, b) => b.at.localeCompare(a.at));
  return { rows, filtered: !!(q.kind || q.fund || t), ...paginate(rows, q.page) };
}
/** Disputes ordered by deadline, closed ones last. */
export function listDisputes(disputes: Dispute[], q: string) {
  const t = q.trim().toLowerCase();
  const closed = (d: Dispute) => d.state === 'won' || d.state === 'lost';
  return disputes.filter((d) => !t || d.id.toLowerCase().includes(t) || d.txn.toLowerCase().includes(t))
    .sort((a, b) => Number(closed(a)) - Number(closed(b)) || a.due.localeCompare(b.due));
}
export const payoutRows = (stores: Store[]) => stores.filter((s) => s.pendingPayout > 0).sort((a, b) => Number(!!b.payoutHold) - Number(!!a.payoutHold) || b.pendingPayout - a.pendingPayout);

/* ---------- Audit ---------- */

export interface AuditQuery { action: AuditAction | ''; role: RoleId | ''; page: number }
export function listAudit(entries: AuditEntry[], q: AuditQuery) {
  const rows = entries.filter((e) => (!q.action || e.action === q.action) && (!q.role || e.role === q.role));
  return { rows, filtered: !!(q.action || q.role), ...paginate(rows, q.page, 12) };
}

/* ---------- Reports ---------- */

export type ReportId = 'merchants' | 'revenue' | 'subs' | 'sales';
export const REPORTS: ReportId[] = ['merchants', 'revenue', 'subs', 'sales'];

export function categorySales(stores: Store[]) {
  const total = gmv(stores);
  const keys = [...new Set(stores.map((s) => s.category.en))];
  return keys.map((en) => {
    const list = stores.filter((s) => s.category.en === en);
    const g = list.reduce((a, s) => a + s.gmv30, 0);
    return { key: en, label: list[0].category, stores: list.length, gmv: g, shareBp: total ? Math.round((g * 10_000) / total) : 0 };
  }).sort((a, b) => b.gmv - a.gmv);
}
export const regionTotal = (r: (typeof REGION_REVENUE)[number]) => r.subscriptions + r.addons + r.oneTime;
export const bpText = (bp: number) => `${(bp / 100).toFixed(1)}%`;

const H: Record<ReportId, Record<Lang, string[]>> = {
  merchants: { ar: ['المعرف', 'المتجر', 'الخطة', 'الحالة', 'الطلبات 30 يومًا', 'المبيعات 30 يومًا (ر.س)', 'تذاكر مفتوحة'], en: ['ID', 'Store', 'Plan', 'Status', 'Orders 30d', 'GMV 30d (SAR)', 'Open tickets'] },
  revenue: { ar: ['المنطقة', 'الاشتراكات (ر.س)', 'الإضافات (ر.س)', 'رسوم لمرة واحدة (ر.س)', 'الإجمالي (ر.س)'], en: ['Region', 'Subscriptions (SAR)', 'Add-ons (SAR)', 'One-time fees (SAR)', 'Total (SAR)'] },
  subs: { ar: ['الشهر', 'اشتراكات جديدة', 'إلغاءات', 'ترقيات', 'تخفيضات'], en: ['Month', 'Sign-ups', 'Cancellations', 'Upgrades', 'Downgrades'] },
  sales: { ar: ['الفئة', 'المتاجر', 'المبيعات 30 يومًا (ر.س)', 'الحصة'], en: ['Category', 'Stores', 'GMV 30d (SAR)', 'Share'] },
};
/** The exact rows a report exports. The screen and the CSV come from the same function. */
export function reportRows(id: ReportId, stores: Store[], lang: Lang): { headers: string[]; rows: (string | number)[][] } {
  const headers = H[id][lang];
  if (id === 'merchants') return { headers, rows: [...stores].sort((a, b) => b.gmv30 - a.gmv30).map((s) => [s.id, s.name[lang], PLAN_NAME[s.plan], STORE_STATUS[s.status][lang], s.orders30, csvMoney(s.gmv30), s.tickets]) };
  if (id === 'revenue') return { headers, rows: REGION_REVENUE.map((r) => [r.region[lang], csvMoney(r.subscriptions), csvMoney(r.addons), csvMoney(r.oneTime), csvMoney(regionTotal(r))]) };
  if (id === 'subs') return { headers, rows: SUBS_MONTHS.map((m) => [m.month, m.signups, m.cancellations, m.upgrades, m.downgrades]) };
  return { headers, rows: categorySales(stores).map((c) => [c.label[lang], c.stores, csvMoney(c.gmv), bpText(c.shareBp)]) };
}
export const reportCsv = (id: ReportId, stores: Store[], lang: Lang) => { const r = reportRows(id, stores, lang); return { csv: toCsv(r.headers, r.rows), count: r.rows.length }; };
export const csvName = (id: string, date: string) => `lak-${id}-${date}.csv`;

/** Clock text for a supported-access countdown. */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
