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
