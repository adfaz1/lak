// Service inbox (`#/dashboard/inbox`): pure rules for the one list of after-sale cases. Stored cases (merchant/inbox.ts)
// are merged with cases derived from data that already exists elsewhere: negative reviews and unanswered questions
// (marketing/reviews) and returns (orders/returns). A derived case is stored only once someone acts on it.
import { total, type L, type Order } from '../../merchant/domain';
import type { Customer } from '../../merchant/workspace';
import type { Review } from '../../merchant/growth';
import type { OrderReturn } from '../../merchant/ops';
import {
  CASE_STATUSES, CASE_TYPES, PRIORITIES, sla, suggestPriority,
  type Case, type CaseStatus, type CaseType, type Canned, type CannedVar, type Priority,
} from '../../merchant/inbox';
import { productIdForSku } from '../model/media';
import type { WorkItem } from '../work/model';

const H = 3_600_000;

/* ---------- Derived cases ---------- */

export interface Sources { orders: Order[]; reviews: Review[]; customers: Customer[] }
/** Review dates are days (YYYY-MM-DD); read them as 09:00 Riyadh. */
const dayAt = (d: string) => Date.parse(`${d}T09:00:00+03:00`) || 0;
export const customerOf = (customers: Customer[], id?: string, name?: L) =>
  (id ? customers.find((c) => c.id === id) : undefined) ?? (name ? customers.find((c) => c.name.en === name.en) : undefined);
const ordersOf = (orders: Order[], c: { id?: string; name: L }) => orders.filter((o) => (o.customerId && c.id ? o.customerId === c.id : o.customer.en === c.name.en));
/** The customer's most recent order that contains the product, if any. */
export function orderForProduct(orders: Order[], c: { id?: string; name: L } | undefined, productId: string, before = Infinity, now = Date.now()): Order | undefined {
  if (!c) return undefined;
  const list = ordersOf(orders, c).filter((o) => o.items.some((it) => productIdForSku(it.sku) === productId) && (o.placedAt ?? now - o.hoursAgo * H) <= before).sort((a, b) => a.hoursAgo - b.hoursAgo);
  return list.find((o) => o.ship === 'delivered') ?? list[0];
}
const RETURN_STATUS: Record<OrderReturn['stage'], CaseStatus> = { requested: 'new', approved: 'customer', received: 'us', inspected: 'us', rejected: 'resolved', refunded: 'resolved', exchanged: 'resolved' };
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Cases derived from reviews ≤3★, unanswered or answered questions, and returns. Ids are stable (CS-<source id>). */
export function derivedCases(s: Sources): Case[] {
  const out: Case[] = [];
  for (const r of s.reviews) {
    const isLow = r.kind === 'review' && (r.rating ?? 5) <= 3;
    if (!isLow && r.kind !== 'question') continue;
    const cust = customerOf(s.customers, r.customerId, r.author);
    const at = dayAt(r.at);
    const o = orderForProduct(s.orders, cust ? { id: cust.id, name: cust.name } : { name: r.author }, r.productId, at);
    const answered = !!r.reply;
    const type: CaseType = isLow ? 'review' : 'question';
    out.push({
      id: `CS-${r.id}`, type, status: answered ? 'resolved' : 'new', priority: suggestPriority(type, { rating: r.rating }),
      subject: isLow ? { ar: `تقييم ${r.rating}★`, en: `${r.rating}★ review` } : o ? { ar: 'سؤال من مشترٍ سابق', en: 'Question from a past buyer' } : { ar: 'سؤال قبل الشراء', en: 'Pre-purchase question' },
      source: 'review', sourceId: r.id, orderRef: o?.ref, customerId: cust?.id, customer: r.author, productId: r.productId,
      lang: hasArabic(r.text) ? 'ar' : 'en', openedAt: at, updatedAt: at, waitingSince: at, resolvedAt: answered ? at : undefined, firstReplyAt: answered ? at : undefined,
      messages: [
        { id: `CS-${r.id}-M1`, from: 'customer', text: r.text, lang: hasArabic(r.text) ? 'ar' : 'en', at, channel: 'store' },
        ...(r.reply ? [{ id: `CS-${r.id}-M2`, from: 'store' as const, text: r.reply.text, lang: hasArabic(r.reply.text) ? 'ar' as const : 'en' as const, at, by: r.reply.by, channel: 'store' as const, status: 'sent' as const }] : []),
      ],
      notes: [], actions: [], log: [{ what: 'opened', by: 'customer', at }],
    });
  }
  for (const o of s.orders) {
    for (const r of o.returns ?? []) {
      const cust = customerOf(s.customers, o.customerId, o.customer);
      const reasons = [...new Set(r.lines.map((l) => l.reason).filter(Boolean))].join(' · ');
      const units = r.lines.reduce((a, l) => a + l.qty, 0);
      const status = RETURN_STATUS[r.stage];
      out.push({
        id: `CS-${r.id}`, type: 'return', status, priority: 'normal', subject: { ar: `طلب إرجاع ${units} قطعة`, en: `Return request, ${units} item(s)` },
        source: 'return', sourceId: r.id, orderRef: o.ref, customerId: cust?.id, customer: o.customer, lang: o.lang ?? 'ar',
        openedAt: r.at, updatedAt: r.history.at(-1)?.at ?? r.at, waitingSince: r.history.at(-1)?.at ?? r.at, resolvedAt: status === 'resolved' ? r.history.at(-1)?.at : undefined,
        messages: [{ id: `CS-${r.id}-M1`, from: r.source === 'store' ? 'customer' : 'system', text: reasons || '—', lang: hasArabic(reasons) ? 'ar' : 'en', at: r.at, channel: 'store' }],
        notes: [], actions: [], log: [{ what: 'opened', by: r.source === 'store' ? 'customer' : r.history[0]?.actor ?? 'system', at: r.at }],
      });
    }
  }
  return out;
}

/** Is the case's source closed elsewhere (question answered, return finished)? Then a stored copy reads resolved. */
function sourceClosed(c: Case, derived: Map<string, Case>): Case | undefined {
  if (!c.sourceId) return undefined;
  const d = derived.get(c.id);
  return d && d.status === 'resolved' && c.status !== 'resolved' ? { ...c, status: 'resolved', resolvedAt: d.resolvedAt ?? c.updatedAt } : undefined;
}

/** Every case: stored ones (including derived ones someone acted on) plus derived ones not yet stored, newest first. */
export function buildCases(stored: Case[], s: Sources): Case[] {
  const derived = derivedCases(s);
  const dmap = new Map(derived.map((c) => [c.id, c]));
  const ids = new Set(stored.map((c) => c.id));
  const merged = [...stored.map((c) => sourceClosed(c, dmap) ?? c), ...derived.filter((c) => !ids.has(c.id))];
  return merged.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Write one changed case into the stored list (adds a derived case the first time someone acts on it). */
export function upsert(list: Case[], c: Case): Case[] {
  return list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list];
}

/* ---------- Context: what Salla leaves on other pages ---------- */

export interface CaseContext {
  order?: Order;
  customer?: Customer;
  value: { orders: number; spent: number; aov: number | null; lastHours: number | null; refunded: number; openCases: number; pastCases: number };
}
export function caseContext(c: Case, all: Case[], s: Sources): CaseContext {
  const order = c.orderRef ? s.orders.find((o) => o.ref === c.orderRef) : undefined;
  const customer = customerOf(s.customers, c.customerId ?? order?.customerId, c.customer);
  const who = { id: customer?.id, name: customer?.name ?? c.customer };
  const mine = ordersOf(s.orders, who);
  const paid = mine.filter((o) => o.pay !== 'failed');
  const refunded = mine.reduce((a, o) => a + o.refunds.filter((r) => r.status === 'confirmed').reduce((x, r) => x + r.amount, 0), 0);
  const spent = paid.reduce((a, o) => a + total(o), 0) - refunded;
  const same = all.filter((x) => x.id !== c.id && (x.customer.en === c.customer.en || (!!customer && x.customerId === customer.id)));
  return {
    order, customer,
    value: {
      orders: mine.length, spent, aov: paid.length ? Math.round(spent / paid.length) : null,
      lastHours: mine.length ? Math.min(...mine.map((o) => o.hoursAgo)) : null, refunded,
      openCases: same.filter((x) => x.status !== 'resolved').length, pastCases: same.filter((x) => x.status === 'resolved').length,
    },
  };
}

/* ---------- List: views, filters, URL ---------- */

export type InboxView = 'open' | 'mine' | 'unassigned' | 'breach' | 'carrier' | 'resolved' | 'all';
export const VIEWS: InboxView[] = ['open', 'mine', 'unassigned', 'breach', 'carrier', 'resolved', 'all'];
export type InboxSort = 'due' | 'new' | 'old' | 'priority';
export const SORTS: InboxSort[] = ['due', 'new', 'old', 'priority'];
export const PAGE_SIZE = 20;

export interface InboxQuery { view: InboxView; type: CaseType | ''; status: CaseStatus | ''; prio: Priority | ''; who: string; q: string; sort: InboxSort; page: number }
const pick = <T extends string>(v: string | null, list: readonly T[]): T | '' => (v && (list as readonly string[]).includes(v) ? (v as T) : '');
export function readQuery(q: URLSearchParams): InboxQuery {
  return {
    view: pick(q.get('view'), VIEWS) || 'open', type: pick(q.get('type'), CASE_TYPES), status: pick(q.get('status'), CASE_STATUSES), prio: pick(q.get('prio'), PRIORITIES),
    who: q.get('who') ?? '', q: q.get('q') ?? '', sort: pick(q.get('sort'), SORTS) || 'due', page: Math.max(1, Number(q.get('page')) || 1),
  };
}
/** URL params for a query; defaults are left out so links stay short. */
export function toParams(q: InboxQuery, over: Partial<InboxQuery> = {}): Record<string, string | undefined> {
  const x = { ...q, ...over };
  return {
    view: x.view === 'open' ? undefined : x.view, type: x.type || undefined, status: x.status || undefined, prio: x.prio || undefined,
    who: x.who || undefined, q: x.q || undefined, sort: x.sort === 'due' ? undefined : x.sort, page: x.page > 1 ? String(x.page) : undefined,
  };
}
export const activeFilters = (q: InboxQuery) => [q.type, q.status, q.prio, q.who].filter(Boolean).length;

const PRIO_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export function inView(c: Case, v: InboxView, me: string, now: number): boolean {
  switch (v) {
    case 'open': return c.status !== 'resolved';
    case 'mine': return c.status !== 'resolved' && c.assignee === me;
    case 'unassigned': return c.status !== 'resolved' && !c.assignee;
    case 'breach': { const s = sla(c, now).state; return s === 'breached' || s === 'soon'; }
    case 'carrier': return c.status === 'carrier';
    case 'resolved': return c.status === 'resolved';
    default: return true;
  }
}
const norm = (s: string) => s.toLowerCase().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/^#/, '').trim();
export function matchesText(c: Case, q: string): boolean {
  const t = norm(q);
  if (!t) return true;
  const hay = [c.id, c.orderRef ?? '', c.customer.ar, c.customer.en, c.subject.ar, c.subject.en, c.ship?.tracking ?? '', c.ship?.ticket?.id ?? '', ...c.messages.map((m) => m.text)].join(' ').toLowerCase();
  return hay.includes(t);
}
/** Due first: breached, then by time left; paused and resolved last. */
export function sortCases(list: Case[], sort: InboxSort, now: number): Case[] {
  const left = (c: Case) => { const s = sla(c, now); return s.state === 'done' ? Infinity : s.state === 'paused' ? 1e15 : s.leftMs ?? 1e14; };
  const cmp: Record<InboxSort, (a: Case, b: Case) => number> = {
    due: (a, b) => left(a) - left(b) || PRIO_RANK[a.priority] - PRIO_RANK[b.priority],
    new: (a, b) => b.openedAt - a.openedAt,
    old: (a, b) => a.openedAt - b.openedAt,
    priority: (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || left(a) - left(b),
  };
  return [...list].sort(cmp[sort]);
}
export interface ListResult { counts: Record<InboxView, number>; rows: Case[]; pageRows: Case[]; page: number; pages: number; filtered: boolean }
export function listCases(all: Case[], q: InboxQuery, me: string, now: number): ListResult {
  const base = all.filter((c) => (!q.type || c.type === q.type) && (!q.status || c.status === q.status) && (!q.prio || c.priority === q.prio)
    && (!q.who || (q.who === '-' ? !c.assignee : c.assignee === q.who)) && matchesText(c, q.q));
  const counts = Object.fromEntries(VIEWS.map((v) => [v, base.filter((c) => inView(c, v, me, now)).length])) as Record<InboxView, number>;
  const rows = sortCases(base.filter((c) => inView(c, q.view, me, now)), q.sort, now);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(q.page, pages);
  return { counts, rows, pageRows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages, filtered: activeFilters(q) > 0 || !!q.q.trim() };
}
/** Ids a bulk action covers: the selected rows on this page, or every matching row. */
export const selectionIds = (rows: Case[], selected: ReadonlySet<string>, allMatching: boolean) => (allMatching ? rows.map((c) => c.id) : rows.filter((c) => selected.has(c.id)).map((c) => c.id));

/* ---------- Saved views (per viewer, session) ---------- */

export interface SavedInboxView { id: string; name: string; params: Record<string, string> }
export const VIEW_NAME_MAX = 30;
export function viewParams(q: InboxQuery): Record<string, string> {
  return Object.fromEntries(Object.entries(toParams(q, { page: 1 })).filter((e): e is [string, string] => !!e[1]));
}
export const sameParams = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};
export type ViewNameError = 'empty' | 'long' | 'taken';
export function viewNameError(name: string, views: SavedInboxView[]): ViewNameError | null {
  const n = name.trim();
  if (!n) return 'empty';
  if (n.length > VIEW_NAME_MAX) return 'long';
  if (views.some((v) => v.name.trim().toLowerCase() === n.toLowerCase())) return 'taken';
  return null;
}

/* ---------- Bulk ---------- */

export type BulkKind = 'assign' | 'close';
/** Cases a bulk action would change, and why the others are skipped. */
export function bulkPlan(all: Case[], ids: string[], kind: BulkKind, assignee?: string) {
  const chosen = all.filter((c) => ids.includes(c.id));
  const skip = (c: Case) => (kind === 'close' ? (c.status === 'resolved' ? 'resolved' : null) : c.assignee === assignee ? 'same' : null);
  const eligible = chosen.filter((c) => !skip(c));
  const skipped = chosen.length - eligible.length;
  /** Closing these leaves work open elsewhere (open return, escalated carrier ticket). */
  const loose = kind === 'close' ? eligible.filter((c) => c.status === 'carrier' || (c.type === 'return' && c.source === 'return')).map((c) => c.id) : [];
  return { eligible, skipped, loose };
}

/* ---------- Composer ---------- */

/** Canned replies that fit the case type, most specific first. */
export const cannedFor = (list: Canned[], t: CaseType) => [...list.filter((c) => c.types.includes(t))].sort((a, b) => a.types.length - b.types.length);
export function cannedVars(c: Case, lang: 'ar' | 'en', store: string, product?: L, trackBase = '#/store/track/'): Partial<Record<CannedVar, string>> {
  return {
    customer: c.customer[lang].split(' ')[0], order: c.orderRef ? `#${c.orderRef}` : lang === 'ar' ? 'طلبك' : 'your order', store,
    tracking: c.orderRef ? `${trackBase}${c.orderRef}` : undefined, product: product?.[lang],
  };
}
/** The reply is written mostly in the other language than the customer reads. */
export function scriptMismatch(text: string, lang: 'ar' | 'en'): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 8) return false;
  const ar = (letters.match(/[؀-ۿ]/g) ?? []).length / letters.length;
  return lang === 'ar' ? ar < 0.3 : ar > 0.5;
}

/* ---------- SLA text ---------- */

/** Hours and minutes in a duration (absolute), for "2h 10m left" / "overdue 5h". */
export function span(ms: number): { d: number; h: number; m: number } {
  const t = Math.abs(ms);
  const d = Math.floor(t / (24 * H));
  const h = Math.floor((t % (24 * H)) / H);
  const m = Math.floor((t % H) / 60_000);
  return { d, h, m };
}

/* ---------- Work centre ---------- */

/** A work item for the daily work centre. Kind 'inbox' is new; the work centre owner wires its rendering. */
export type InboxWorkItem = Omit<WorkItem, 'kind'> & { kind: 'inbox' };
/**
 * Cases that need someone now: breached SLA (ours or the carrier's) or escalated to the carrier. One item per
 * group so the queue stays short; each opens the inbox on the matching view. Facts: count, oldest overdue hours, ids.
 */
export function inboxWorkItems(cases: Case[], orders: Order[], now = Date.now()): InboxWorkItem[] {
  const open = cases.filter((c) => c.status !== 'resolved');
  const breached = open.filter((c) => sla(c, now).state === 'breached');
  const escalated = open.filter((c) => c.status === 'carrier' && sla(c, now).state !== 'breached');
  const money = (list: Case[]) => list.reduce((s, c) => s + (orders.find((o) => o.ref === c.orderRef) ? total(orders.find((o) => o.ref === c.orderRef)!) : 0), 0);
  const overdueH = (list: Case[]) => (list.length ? Math.max(...list.map((c) => Math.round(-(sla(c, now).leftMs ?? 0) / H))) : null);
  const item = (id: string, list: Case[], severity: 1 | 2 | 3, view: string, subject: L): InboxWorkItem => ({
    id, kind: 'inbox', severity, money: money(list), moneyKind: 'orders', orders: new Set(list.map((c) => c.orderRef).filter(Boolean)).size,
    customers: new Set(list.map((c) => c.customer.en)).size, skus: [], oldestHours: list.length ? Math.round((now - Math.min(...list.map((c) => c.openedAt))) / H) : null,
    facts: { count: list.length, overdueHours: view === 'breach' ? overdueH(list) : null, ids: list.slice(0, 3).map((c) => c.id).join(', ') }, subject,
    action: { section: 'inbox', query: { view } }, page: 'orders', need: [], fingerprint: `${id}:${list.map((c) => c.id).sort().join(',')}`,
  });
  const out: InboxWorkItem[] = [];
  if (breached.length) out.push(item('inbox-breach', breached, 3, 'breach', { ar: 'حالات تجاوزت مهلة الرد', en: 'Cases past their reply time' }));
  if (escalated.length) out.push(item('inbox-carrier', escalated, 2, 'carrier', { ar: 'بلاغات لدى شركة الشحن', en: 'Tickets with the carrier' }));
  return out;
}

/* ---------- Export ---------- */

export function casesCsv(list: Case[], lang: 'ar' | 'en', now: number): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = lang === 'ar' ? ['الحالة', 'النوع', 'الوضع', 'الأولوية', 'الطلب', 'العميل', 'المسؤول', 'فُتحت', 'المهلة'] : ['Case', 'Type', 'Status', 'Priority', 'Order', 'Customer', 'Assignee', 'Opened', 'SLA'];
  const rows = list.map((c) => [c.id, c.type, c.status, c.priority, c.orderRef ?? '', c.customer[lang], c.assignee ?? '', new Date(c.openedAt).toISOString(), sla(c, now).state]);
  return '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
