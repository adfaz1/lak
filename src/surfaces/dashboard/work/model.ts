// Daily work centre: one ranked queue of everything that needs someone in the store, built only from store data.
// Pure rules (no React). Every item says what is at stake, why it is here, and which tool fixes it, in context.
import { LOCATIONS, VIEWS, total, type L, type LocId, type Order } from '../../merchant/domain';
import { available, coverage, type History, type Level } from '../../merchant/inventory';
import { reconcile, type Payout, type Tx } from '../../merchant/finance';
import type { App, Provider, DomainSettings } from '../../merchant/workspace';
import type { Run, Automation } from '../../merchant/growth';
import { can, canSee, canSeeSettings, type Action, type Page, type Role, type SettingsCat } from '../../merchant/perms';
import { integrationIssues } from '../help/model';
import { TODAY } from '../analytics/model';

export type WorkKind = 'late' | 'payfail' | 'fulfil' | 'refunds' | 'stock' | 'settlement' | 'integration' | 'automation';
export type WorkCat = 'orders' | 'stock' | 'money' | 'integrations' | 'automations';
export const CATS: WorkCat[] = ['orders', 'stock', 'money', 'integrations', 'automations'];
export const CAT_OF: Record<WorkKind, WorkCat> = {
  late: 'orders', payfail: 'money', fulfil: 'orders', refunds: 'money', stock: 'stock', settlement: 'money', integration: 'integrations', automation: 'automations',
};

/** How the money figure of an item should be read. */
export type MoneyKind = 'orders' | 'lost' | 'refunds' | 'diff' | 'none';

export interface WorkAction { section: string; path?: string; query?: Record<string, string> }
export interface WorkItem {
  id: string;
  kind: WorkKind;
  severity: 1 | 2 | 3;
  /** Halalas at stake; how to read it is in moneyKind. */
  money: number;
  moneyKind: MoneyKind;
  orders: number;
  customers: number;
  skus: string[];
  oldestHours: number | null;
  /** Kind-specific facts the view turns into the "why" line. */
  facts: Record<string, string | number | null>;
  subject?: L;
  action: WorkAction;
  /** Who may see the item: the page it opens and, when set, an action or settings category. */
  page: Page;
  need?: Action[];
  settings?: SettingsCat;
  /** Changes when the underlying situation changes; a "done" item comes back when it does. */
  fingerprint: string;
}

export interface WorkInput {
  orders: Order[];
  levels: Level[];
  history: History[];
  payouts: Payout[];
  txs: Tx[];
  apps: App[];
  providers: Provider[];
  domain: DomainSettings;
  runs: Run[];
  automations: Automation[];
}

const sum = (os: Order[]) => os.reduce((s, o) => s + total(o), 0);
const oldest = (os: Order[]) => (os.length ? Math.max(...os.map((o) => o.hoursAgo)) : null);
const skusOf = (os: Order[]) => [...new Set(os.flatMap((o) => o.items.map((i) => i.sku)))];
const people = (os: Order[]) => new Set(os.map((o) => o.customerId ?? o.customer.en)).size;

/** Units the store is expected to sell in the next 7 days without stock to cover them. */
export const HORIZON_DAYS = 7;
/** Bank transfers normally land within 3 days of the payout date; later than that is worth a look. */
export const PAYOUT_GRACE_DAYS = 3;

/** Latest unit price seen for a SKU in the order book (null when it never sold). */
export function unitPrice(orders: Order[], sku: string): number | null {
  for (const o of orders) for (const i of o.items) if (i.sku === sku) return i.unit;
  return null;
}

function orderItems(orders: Order[]): WorkItem[] {
  const late = orders.filter(VIEWS.late);
  const needs = orders.filter(VIEWS.needs).filter((o) => !VIEWS.late(o));
  const payfail = orders.filter(VIEWS.payfail);
  const refunds = orders.filter((o) => o.refunds.some((r) => r.status === 'pending'));
  const refundSum = refunds.reduce((s, o) => s + o.refunds.filter((r) => r.status === 'pending').reduce((a, r) => a + r.amount, 0), 0);
  const fp = (os: Order[]) => os.map((o) => o.ref).join(',');
  const out: WorkItem[] = [];
  if (late.length) out.push({ id: 'orders-late', kind: 'late', severity: 3, money: sum(late), moneyKind: 'orders', orders: late.length, customers: people(late), skus: skusOf(late), oldestHours: oldest(late), facts: {}, action: { section: 'orders', query: { view: 'late', sort: 'old' } }, page: 'orders', need: ['order.fulfil'], fingerprint: fp(late) });
  if (payfail.length) out.push({ id: 'orders-payfail', kind: 'payfail', severity: 3, money: sum(payfail), moneyKind: 'orders', orders: payfail.length, customers: people(payfail), skus: skusOf(payfail), oldestHours: oldest(payfail), facts: {}, action: { section: 'orders', query: { view: 'payfail' } }, page: 'orders', need: ['order.refund', 'billing.manage'], fingerprint: fp(payfail) });
  if (needs.length) out.push({ id: 'orders-fulfil', kind: 'fulfil', severity: 2, money: sum(needs), moneyKind: 'orders', orders: needs.length, customers: people(needs), skus: skusOf(needs), oldestHours: oldest(needs), facts: {}, action: { section: 'orders', query: { view: 'needs', sort: 'old' } }, page: 'orders', need: ['order.fulfil'], fingerprint: fp(needs) });
  if (refunds.length) out.push({ id: 'orders-refunds', kind: 'refunds', severity: 2, money: refundSum, moneyKind: 'refunds', orders: refunds.length, customers: people(refunds), skus: skusOf(refunds), oldestHours: null, facts: {}, action: { section: 'orders', query: { view: 'returns' } }, page: 'orders', need: ['order.refund'], fingerprint: `${fp(refunds)}:${refundSum}` });
  return out;
}

/**
 * One item per SKU that is at or below its reorder point in any warehouse. With at least 14 days of sales history the
 * item estimates the sales at risk over the next 7 days (units short × latest price); without it, no estimate is made.
 * The fix is a transfer when the other warehouse can spare units, otherwise the low-stock list for that SKU.
 */
export function stockItems(levels: Level[], history: History[], orders: Order[]): WorkItem[] {
  const skus = [...new Set(levels.filter((l) => available(l) <= l.threshold).map((l) => l.sku))];
  return skus.map((sku): WorkItem => {
    const ls = levels.filter((l) => l.sku === sku);
    const totalAvail = ls.reduce((s, l) => s + Math.max(0, available(l)), 0);
    const cov = coverage(totalAvail, history.find((h) => h.sku === sku));
    const price = unitPrice(orders, sku);
    const short = cov.kind === 'days' ? Math.max(0, Math.ceil(cov.perDay * HORIZON_DAYS) - totalAvail) : 0;
    const lost = price !== null ? short * price : 0;
    const low = ls.filter((l) => available(l) <= l.threshold).sort((a, b) => available(a) - available(b))[0];
    const other = ls.find((l) => l.loc !== low.loc);
    const spare = other ? available(other) - other.threshold : 0;
    const out = totalAvail === 0;
    const action: WorkAction = spare >= 2
      ? { section: 'inventory', path: 'transfers/new', query: { sku, to: low.loc } }
      : { section: 'inventory', query: { tab: 'low', q: sku } };
    return {
      id: `stock-${sku}`, kind: 'stock', severity: out || lost > 0 ? 2 : 1, money: lost, moneyKind: lost > 0 ? 'lost' : 'none',
      orders: 0, customers: 0, skus: [sku], oldestHours: null,
      facts: { sku, loc: low.loc, available: available(low), total: totalAvail, cover: cov.kind === 'days' ? cov.days : null, history: cov.kind, short, spare: spare >= 2 ? spare : 0, from: other?.loc ?? null },
      action, page: 'inventory', need: spare >= 2 ? ['inventory.transfer'] : undefined,
      fingerprint: ls.map((l) => `${l.loc}:${available(l)}`).join(','),
    };
  });
}

/** Payouts whose transfer does not match their statement, or that are still in transit well after their date. */
export function settlementItems(payouts: Payout[], txs: Tx[], today = TODAY): WorkItem[] {
  const out: WorkItem[] = [];
  const days = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
  for (const p of payouts) {
    const r = reconcile(p, txs);
    const orderRefs = new Set(txs.filter((t) => t.payoutId === p.id && t.orderRef).map((t) => t.orderRef));
    if (r.matches === false) {
      out.push({ id: `payout-diff-${p.id}`, kind: 'settlement', severity: 3, money: Math.abs(r.diff), moneyKind: 'diff', orders: orderRefs.size, customers: 0, skus: [], oldestHours: null, facts: { payout: p.id, problem: 'diff', diff: r.diff }, action: { section: 'finance', path: `payouts/${p.id}` }, page: 'finance', fingerprint: `${p.id}:${r.diff}` });
    } else if (p.status === 'in_transit' && days(today, p.date) > PAYOUT_GRACE_DAYS) {
      out.push({ id: `payout-late-${p.id}`, kind: 'settlement', severity: 2, money: p.amount ?? r.net, moneyKind: 'orders', orders: orderRefs.size, customers: 0, skus: [], oldestHours: days(today, p.date) * 24, facts: { payout: p.id, problem: 'late', date: p.date }, action: { section: 'finance', path: `payouts/${p.id}` }, page: 'finance', fingerprint: `${p.id}:${p.status}` });
    }
  }
  return out;
}

/** Broken apps, payment providers that need action, and a failed domain: each opens the screen that fixes it. */
export function integrationItems(apps: App[], providers: Provider[], domain: DomainSettings): WorkItem[] {
  return integrationIssues(apps, providers, domain).map((i): WorkItem => {
    const base = { id: `int-${i.id}`, kind: 'integration' as const, money: 0, moneyKind: 'none' as const, orders: 0, customers: 0, skus: [], oldestHours: null, subject: i.name, fingerprint: `${i.id}:${i.state}` };
    if (i.kind === 'app') return { ...base, severity: i.level === 'error' ? 3 : 2, facts: { what: 'app', state: i.state, area: i.sections[0] ?? null }, action: { section: 'apps', path: i.fix.path }, page: 'apps', need: ['apps.manage'] };
    if (i.kind === 'provider') return { ...base, severity: 3, facts: { what: 'provider', state: i.state }, action: { section: 'settings', path: 'payments' }, page: 'settings', settings: 'payments' };
    return { ...base, severity: 2, facts: { what: 'domain', state: i.state }, action: { section: 'settings', path: 'domains' }, page: 'settings', settings: 'domains' };
  });
}

/** Failed automation runs, one item per automation, with the latest failure reason. */
export function automationItems(runs: Run[], automations: Automation[]): WorkItem[] {
  const failed = runs.filter((r) => r.outcome === 'failed');
  const ids = [...new Set(failed.map((r) => r.automation))];
  return ids.map((id): WorkItem => {
    const mine = failed.filter((r) => r.automation === id);
    const a = automations.find((x) => x.id === id);
    return {
      id: `auto-${id}`, kind: 'automation', severity: 1, money: 0, moneyKind: 'none', orders: 0, customers: mine.length, skus: [], oldestHours: null,
      subject: a?.name ?? { ar: id, en: id }, facts: { automation: id, failed: mine.length, reasonAr: mine[0].reason.ar, reasonEn: mine[0].reason.en },
      action: { section: 'automations', query: { tab: 'runs', outcome: 'failed', automation: id } }, page: 'automations', need: ['automation.manage'],
      fingerprint: mine.map((r) => r.id).join(','),
    };
  });
}

/** Ranked by severity, then money at stake, then age. */
export function rank(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => b.severity - a.severity || b.money - a.money || (b.oldestHours ?? 0) - (a.oldestHours ?? 0) || a.id.localeCompare(b.id));
}

export function workQueue(i: WorkInput): WorkItem[] {
  return rank([
    ...orderItems(i.orders),
    ...stockItems(i.levels, i.history, i.orders),
    ...settlementItems(i.payouts, i.txs),
    ...integrationItems(i.apps, i.providers, i.domain),
    ...automationItems(i.runs, i.automations),
  ]);
}

/** A role sees an item only when it can open the page and do at least one of the actions it needs. */
export function canWork(role: Role, item: WorkItem): boolean {
  if (!canSee(role, item.page)) return false;
  if (item.settings && !canSeeSettings(role, item.settings)) return false;
  return !item.need || item.need.some((a) => can(role, a));
}
export const forRole = (role: Role, items: WorkItem[]) => items.filter((x) => canWork(role, x));

/* ---------- Snooze / done, with a log ---------- */

export type LogAct = 'done' | 'snooze' | 'reopen';
export interface LogRow { id: string; item: string; kind: WorkKind; subject?: L; act: LogAct; who: string; at: number; until?: number }
export interface QueueState { done: Record<string, string>; snoozed: Record<string, number>; log: LogRow[] }
export const emptyQueueState = (): QueueState => ({ done: {}, snoozed: {}, log: [] });

export type Show = 'open' | 'snoozed' | 'done';
export const SHOWS: Show[] = ['open', 'snoozed', 'done'];
/** Done holds while the situation is unchanged; snooze holds until its time. */
export function statusOf(st: QueueState, item: WorkItem, now: number): Show {
  if (st.done[item.id] === item.fingerprint) return 'done';
  if ((st.snoozed[item.id] ?? 0) > now) return 'snoozed';
  return 'open';
}
export function split(st: QueueState, items: WorkItem[], now: number): Record<Show, WorkItem[]> {
  const out: Record<Show, WorkItem[]> = { open: [], snoozed: [], done: [] };
  for (const x of items) out[statusOf(st, x, now)].push(x);
  return out;
}

const row = (st: QueueState, item: WorkItem, act: LogAct, who: string, at: number, until?: number): LogRow =>
  ({ id: `WL-${st.log.length + 1}`, item: item.id, kind: item.kind, subject: item.subject, act, who, at, until });

export function markDone(st: QueueState, item: WorkItem, who: string, now: number): QueueState {
  const snoozed = { ...st.snoozed }; delete snoozed[item.id];
  return { done: { ...st.done, [item.id]: item.fingerprint }, snoozed, log: [row(st, item, 'done', who, now), ...st.log] };
}
export function snooze(st: QueueState, item: WorkItem, until: number, who: string, now: number): QueueState {
  const done = { ...st.done }; delete done[item.id];
  return { done, snoozed: { ...st.snoozed, [item.id]: until }, log: [row(st, item, 'snooze', who, now, until), ...st.log] };
}
export function reopen(st: QueueState, item: WorkItem, who: string, now: number): QueueState {
  const done = { ...st.done }; delete done[item.id];
  const snoozed = { ...st.snoozed }; delete snoozed[item.id];
  return { done, snoozed, log: [row(st, item, 'reopen', who, now), ...st.log] };
}

export type SnoozeFor = '1h' | '4h' | 'tomorrow';
export const SNOOZES: SnoozeFor[] = ['1h', '4h', 'tomorrow'];
/** "Tomorrow" means 08:00 local time on the next day. */
export function snoozeUntil(choice: SnoozeFor, now: Date): number {
  if (choice === '1h') return now.getTime() + 3600000;
  if (choice === '4h') return now.getTime() + 4 * 3600000;
  const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0);
  return d.getTime();
}

export function parseCat(v: string | null): WorkCat | null { return v && (CATS as string[]).includes(v) ? (v as WorkCat) : null; }
export function parseShow(v: string | null): Show { return v === 'snoozed' || v === 'done' ? v : 'open'; }
export const countBy = (items: WorkItem[]) => Object.fromEntries(CATS.map((c) => [c, items.filter((x) => CAT_OF[x.kind] === c).length])) as Record<WorkCat, number>;
export const locName = (loc: string): L => LOCATIONS[loc as LocId] ?? { ar: loc, en: loc };
