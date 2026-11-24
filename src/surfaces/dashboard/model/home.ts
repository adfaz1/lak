// Merchant home: business rules only (no React). Every figure on the screen comes from here and is unit-tested.
// Reuses the merchant domain as the single source of truth for order states and saved views.
import { VIEWS, total, type Order } from '../../merchant/domain';
import { available, lowStock, type Level } from '../../merchant/inventory';
import { change, periods, summarize, type DayStat } from '../../merchant/growth';
import { productIdForSku } from './media';
import { canSee, type Page, type Role } from '../../merchant/perms';

export type PeriodDays = 7 | 30;

export interface Metric { id: 'net' | 'orders' | 'aov' | 'conversion'; value: number | null; delta: number | null; unit: 'money' | 'count' | 'percent' }

/** Four headline figures for complete days of the period, compared with the previous equal period. */
export function headline(series: DayStat[], days: PeriodDays): Metric[] {
  const { cur, prev } = periods(series, days);
  const a = summarize(cur), b = summarize(prev);
  return [
    { id: 'net', value: a.net, delta: change(a.net, b.net), unit: 'money' },
    { id: 'orders', value: a.orders, delta: change(a.orders, b.orders), unit: 'count' },
    { id: 'aov', value: a.aov, delta: change(a.aov, b.aov), unit: 'money' },
    { id: 'conversion', value: a.conversion, delta: change(a.conversion, b.conversion), unit: 'percent' },
  ];
}

export type TaskId = 'late' | 'payfail' | 'fulfil' | 'refunds' | 'stock';
export interface Task { id: TaskId; severity: 1 | 2 | 3; count: number; value: number; oldestHours: number | null; skus: string[] }

const sum = (os: Order[]) => os.reduce((s, o) => s + total(o), 0);
const oldest = (os: Order[]) => (os.length ? Math.max(...os.map((o) => o.hoursAgo)) : null);
const skusOf = (os: Order[]) => [...new Set(os.flatMap((o) => o.items.map((i) => i.sku)))];

/**
 * What needs the merchant now, ranked by risk: money not collected and late fulfilment first (severity 3),
 * then today's fulfilment and pending refunds (2), then stock (1). Within a severity, larger value first.
 * Late orders are excluded from "to fulfil" so nothing is counted twice.
 */
export function tasks(orders: Order[], levels: Level[]): Task[] {
  const late = orders.filter(VIEWS.late);
  const needs = orders.filter(VIEWS.needs).filter((o) => !VIEWS.late(o));
  const payfail = orders.filter(VIEWS.payfail);
  const refunds = orders.filter((o) => o.refunds.some((r) => r.status === 'pending'));
  const low = lowStock(levels);
  const out: Task[] = [
    { id: 'late', severity: 3, count: late.length, value: sum(late), oldestHours: oldest(late), skus: skusOf(late) },
    { id: 'payfail', severity: 3, count: payfail.length, value: sum(payfail), oldestHours: oldest(payfail), skus: skusOf(payfail) },
    { id: 'fulfil', severity: 2, count: needs.length, value: sum(needs), oldestHours: oldest(needs), skus: skusOf(needs) },
    { id: 'refunds', severity: 2, count: refunds.length, value: refunds.reduce((s, o) => s + o.refunds.filter((r) => r.status === 'pending').reduce((a, r) => a + r.amount, 0), 0), oldestHours: null, skus: skusOf(refunds) },
    { id: 'stock', severity: 1, count: low.length, value: 0, oldestHours: null, skus: [...new Set(low.map((l) => l.sku))] },
  ];
  return out.filter((t) => t.count > 0).sort((x, y) => y.severity - x.severity || y.value - x.value);
}

/** The section each task opens; a role only sees tasks it can act on. */
export const TASK_PAGE: Record<TaskId, Page> = { late: 'orders', payfail: 'orders', fulfil: 'orders', refunds: 'orders', stock: 'inventory' };
export const tasksFor = (role: Role, list: Task[]): Task[] => list.filter((t) => canSee(role, TASK_PAGE[t.id]));

export interface TopProduct { sku: string; productId: string | undefined; name: Order['items'][number]['name']; units: number; revenue: number }
/** Best sellers by revenue across paid orders (failed payments excluded). */
export function topProducts(orders: Order[], limit = 5): TopProduct[] {
  const m = new Map<string, TopProduct>();
  for (const o of orders) {
    if (o.pay === 'failed') continue;
    for (const i of o.items) {
      const key = productIdForSku(i.sku) ?? i.sku;
      const cur = m.get(key) ?? { sku: i.sku, productId: productIdForSku(i.sku), name: i.name, units: 0, revenue: 0 };
      cur.units += i.qty; cur.revenue += i.qty * i.unit;
      m.set(key, cur);
    }
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export interface StockAlert { sku: string; productId: string | undefined; loc: Level['loc']; available: number; threshold: number }
export function stockAlerts(levels: Level[], limit = 5): StockAlert[] {
  return lowStock(levels)
    .map((l) => ({ sku: l.sku, productId: productIdForSku(l.sku), loc: l.loc, available: available(l), threshold: l.threshold }))
    .sort((a, b) => a.available - b.available)
    .slice(0, limit);
}

/** Paid sales of orders created today (orders younger than 12 hours in the fixture clock). */
export const salesToday = (orders: Order[]) => sum(orders.filter((o) => o.hoursAgo < 12 && o.pay !== 'failed'));

export interface ChannelShare { channel: Order['channel']; orders: number; share: number }
/** Today's orders by sales channel, as shares of the total (0 when there are none). */
export function channelsToday(orders: Order[]): ChannelShare[] {
  const today = orders.filter((o) => o.hoursAgo < 12);
  const ids: Order['channel'][] = ['online', 'market', 'app'];
  return ids.map((c) => {
    const n = today.filter((o) => o.channel === c).length;
    return { channel: c, orders: n, share: today.length ? Math.round((n * 100) / today.length) : 0 };
  });
}

/* ---------- Per-role workspace: what this viewer pins on the home ---------- */

export type FigureId = Metric['id'] | 'toFulfil' | 'available';
export const FIGURE_IDS: FigureId[] = ['net', 'orders', 'aov', 'conversion', 'toFulfil', 'available'];
/** Figures from the finance ledger need the finance page; the fulfilment count needs orders. */
export const figureAllowed = (role: Role, id: FigureId) =>
  id === 'available' ? canSee(role, 'finance') : id === 'toFulfil' ? canSee(role, 'orders') : true;

export type CardId = 'work' | 'today' | 'assistant' | 'sales' | 'top' | 'recent' | 'stock';
export const CARD_IDS: CardId[] = ['work', 'today', 'assistant', 'sales', 'top', 'recent', 'stock'];
/** Columns a card takes on the 3-column desktop grid (phones stack everything). */
export const CARD_SPAN: Record<CardId, 1 | 2 | 3> = { work: 2, today: 1, assistant: 3, sales: 2, top: 1, recent: 2, stock: 1 };
/** Cards that show data a role cannot open elsewhere are not offered to it. */
export const cardAllowed = (role: Role, id: CardId) =>
  id === 'recent' ? canSee(role, 'orders') : id === 'stock' ? canSee(role, 'inventory') : true;

export interface Workspace { figures: FigureId[]; cards: CardId[]; shortcuts: string[]; views: string[] }
export const MAX_SHORTCUTS = 6;
export const MAX_VIEWS = 4;

/** Sensible starting point per role (owner request: fulfilment → queue and stock; finance → money; marketing → growth). */
export const DEFAULT_WS: Record<Role, Workspace> = {
  owner: { figures: ['net', 'orders', 'aov', 'conversion'], cards: ['work', 'today', 'assistant', 'sales', 'top', 'recent', 'stock'], shortcuts: ['product-new', 'coupons', 'payouts', 'apps'], views: ['orders-late', 'inventory-low'] },
  fulfilment: { figures: ['toFulfil', 'orders'], cards: ['work', 'stock', 'recent', 'today'], shortcuts: ['orders-needs', 'inventory-transfers', 'inventory'], views: ['orders-late', 'inventory-low'] },
  finance: { figures: ['net', 'available', 'aov', 'orders'], cards: ['work', 'today', 'assistant', 'sales'], shortcuts: ['payouts', 'transactions', 'billing'], views: ['orders-payfail'] },
  marketing: { figures: ['net', 'conversion', 'aov', 'orders'], cards: ['assistant', 'sales', 'top', 'work', 'today'], shortcuts: ['coupons', 'carts', 'campaigns', 'automations'], views: ['automation-runs'] },
};

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
/**
 * Clean a stored workspace against what this role may use now (stored data can be stale or hand-edited):
 * unknown or forbidden entries are dropped, limits applied; anything unreadable falls back to the role default.
 * `toolOk` says whether a tool id exists and is usable by the role; views must be tools with a filter.
 */
export function sanitizeWs(raw: unknown, role: Role, toolOk: (id: string, view: boolean) => boolean): Workspace {
  const d = DEFAULT_WS[role];
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Record<keyof Workspace, unknown>>;
  const strs = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null);
  const figures = strs(r.figures)?.filter((x): x is FigureId => (FIGURE_IDS as string[]).includes(x) && figureAllowed(role, x as FigureId));
  const cards = strs(r.cards)?.filter((x): x is CardId => (CARD_IDS as string[]).includes(x) && cardAllowed(role, x as CardId));
  const shortcuts = strs(r.shortcuts)?.filter((x) => toolOk(x, false));
  const views = strs(r.views)?.filter((x) => toolOk(x, true));
  return {
    figures: uniq(figures ?? d.figures),
    cards: uniq(cards ?? d.cards),
    shortcuts: uniq(shortcuts ?? d.shortcuts).slice(0, MAX_SHORTCUTS),
    views: uniq(views ?? d.views).slice(0, MAX_VIEWS),
  };
}

/** Move an entry one place earlier (-1) or later (+1); out of range leaves the list as it is. */
export function moveIn<T>(list: T[], id: T, dir: -1 | 1): T[] {
  const i = list.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
/** Add or remove an entry, keeping the order; additions go last and respect a limit. */
export function toggleIn<T>(list: T[], id: T, max = Infinity): T[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return list.length >= max ? list : [...list, id];
}
export const sameWs = (a: Workspace, b: Workspace) => JSON.stringify(a) === JSON.stringify(b);
