// Store assistant: fixed questions answered by deterministic rules over this store's data (no external AI).
// Each answer carries its numbers, the orders/products/channels behind them, the period and the source, and at most
// one proposed action as a draft that opens the right tool prefilled. Nothing here executes anything.
import { total, type Channel, type L, type LocId, type Order } from '../../merchant/domain';
import { change, periods, summarize, type Automation, type Cart, type DayStat } from '../../merchant/growth';
import type { History, Level } from '../../merchant/inventory';
import { can, canSee, type Action, type Page, type Role } from '../../merchant/perms';
import { conversionAnswer, lateAnswer, stockAnswer } from '../../merchant/workspace';
import { dayIndex } from '../analytics/model';
import { productIdForSku } from '../model/media';
import { unitPrice, HORIZON_DAYS } from '../work/model';

export type Question = 'sales' | 'stock' | 'late' | 'conversion';
export const QUESTIONS: Question[] = ['sales', 'stock', 'late', 'conversion'];
/** The page whose data a question reads; a role that cannot open it is not offered the question. */
export const QUESTION_PAGE: Record<Question, Page> = { sales: 'analytics', stock: 'inventory', late: 'orders', conversion: 'analytics' };
export const questionsFor = (role: Role): Question[] => QUESTIONS.filter((q) => canSee(role, QUESTION_PAGE[q]));
export const parseQuestion = (v: string | null, role: Role): Question | null => {
  const allowed = questionsFor(role);
  return v && (allowed as string[]).includes(v) ? (v as Question) : allowed[0] ?? null;
};

/* ---------- Proposals: a draft in the tool that does the work ---------- */

export type DraftKind = 'transfer' | 'automation' | 'carts' | 'orders' | 'analytics';
export interface Draft {
  kind: DraftKind;
  section: string;
  path?: string;
  query?: Record<string, string>;
  /** What the tool opens with; the merchant reviews and confirms there. */
  fields: { label: L; value: L }[];
  need: Action | null;
}

/* ---------- Sales: what changed and what is behind it ---------- */

export interface Mover { key: string; label?: L; sku?: string; cur: number; prev: number; diff: number; orders: number }
export interface SalesAnswer {
  kind: 'answer';
  days: number;
  range: { cur: [string, string]; prev: [string, string] };
  net: { cur: number; prev: number; delta: number | null };
  orders: { cur: number; prev: number; delta: number | null };
  aov: { cur: number | null; prev: number | null; delta: number | null };
  /** net change = effect of the number of orders + effect of the average order value (adds up exactly). */
  effects: { orders: number; aov: number };
  visits: { cur: number | null; prev: number | null; delta: number | null; conversion: [number | null, number | null]; missing: [number, number] };
  /** Order book, same complete days: who moved most (by revenue difference). */
  book: { cur: number; prev: number; orders: [number, number] };
  channels: Mover[];
  products: Mover[];
  draft: Draft | null;
}
export type Sales = SalesAnswer | { kind: 'insufficient'; days: number; have: number };

const bookRange = (orders: Order[], from: number, to: number) => orders.filter((o) => o.pay !== 'failed' && dayIndex(o) >= from && dayIndex(o) <= to);

function movers<K extends string>(cur: Order[], prev: Order[], keysOf: (o: Order) => { key: K; amount: number }[]): Mover[] {
  const m = new Map<string, Mover>();
  const add = (o: Order, side: 'cur' | 'prev') => {
    for (const k of keysOf(o)) {
      const x = m.get(k.key) ?? { key: k.key, cur: 0, prev: 0, diff: 0, orders: 0 };
      x[side] += k.amount;
      if (side === 'cur') x.orders += 1;
      m.set(k.key, x);
    }
  };
  cur.forEach((o) => add(o, 'cur'));
  prev.forEach((o) => add(o, 'prev'));
  return [...m.values()].map((x) => ({ ...x, diff: x.cur - x.prev }));
}

/**
 * Explains the change in net sales between two equal periods of complete days (same series as the home figures):
 * split into orders vs average order value, with visits and conversion on days that have visit data, and the
 * channels and products from the order book that moved most in the same direction. Correlation, not cause.
 */
export function salesAnswer(series: DayStat[], orders: Order[], days: 7 | 30, ctx: { levels: Level[]; automations: Automation[]; role: Role }): Sales {
  const { cur, prev } = periods(series, days);
  if (prev.length < days || summarize(prev).orders === 0) return { kind: 'insufficient', days, have: series.length };
  const a = summarize(cur), b = summarize(prev);
  const ordersEffect = b.orders ? Math.round((a.orders - b.orders) * (b.net / b.orders)) : 0;
  const known = (d: DayStat[]) => d.filter((x) => x.sessions !== null);
  const sessions = (d: DayStat[]) => (known(d).length ? known(d).reduce((s, x) => s + (x.sessions ?? 0), 0) : null);
  const bc = bookRange(orders, 1, days), bp = bookRange(orders, days + 1, 2 * days);
  const down = a.net < b.net;
  const pick = (list: Mover[]) => list.filter((x) => (down ? x.diff < 0 : x.diff > 0)).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 3);
  const channels = pick(movers(bc, bp, (o) => [{ key: o.channel, amount: total(o) }]));
  const products = pick(movers(bc, bp, (o) => o.items.map((i) => ({ key: productIdForSku(i.sku) ?? i.sku, amount: i.qty * i.unit })))).map((m) => {
    const it = [...bc, ...bp].flatMap((o) => o.items).find((i) => (productIdForSku(i.sku) ?? i.sku) === m.key);
    return { ...m, label: it?.name, sku: it?.sku };
  });
  const net = { cur: a.net, prev: b.net, delta: change(a.net, b.net) };
  const conv: [number | null, number | null] = [a.conversion, b.conversion];
  return {
    kind: 'answer', days,
    range: { cur: [cur[0].date, cur[cur.length - 1].date], prev: [prev[0].date, prev[prev.length - 1].date] },
    net,
    orders: { cur: a.orders, prev: b.orders, delta: change(a.orders, b.orders) },
    aov: { cur: a.aov, prev: b.aov, delta: change(a.aov, b.aov) },
    effects: { orders: ordersEffect, aov: a.net - b.net - ordersEffect },
    visits: {
      cur: sessions(cur), prev: sessions(prev),
      // Totals over different numbers of days with visit data are not comparable: no change is shown then.
      delta: known(cur).length === known(prev).length ? change(sessions(cur), sessions(prev)) : null,
      conversion: conv, missing: [cur.length - known(cur).length, prev.length - known(prev).length],
    },
    book: { cur: bc.reduce((s, o) => s + total(o), 0), prev: bp.reduce((s, o) => s + total(o), 0), orders: [bc.length, bp.length] },
    channels, products,
    draft: down ? salesDraft({ conv, products, ...ctx }) : null,
  };
}

/** For a drop: restock a falling best seller that is short; otherwise a cart reminder (or the carts list if one runs). */
function salesDraft({ conv, products, levels, automations }: { conv: [number | null, number | null]; products: Mover[]; levels: Level[]; automations: Automation[] }): Draft | null {
  const short = products.find((p) => p.sku && levels.some((l) => l.sku === p.sku && l.onHand - l.reserved <= l.threshold));
  if (short?.sku) {
    const lv = levels.filter((l) => l.sku === short.sku).sort((x, y) => (x.onHand - x.reserved) - (y.onHand - y.reserved));
    return transferDraft(short.sku, lv[0].loc, null);
  }
  const convDown = conv[0] !== null && conv[1] !== null && conv[0] < conv[1];
  if (!convDown) return null;
  return cartDraft(automations);
}

export function cartDraft(automations: Automation[]): Draft {
  const running = automations.some((x) => x.trigger === 'cartAbandoned' && x.status === 'active');
  if (running) return { kind: 'carts', section: 'marketing', query: { tab: 'carts' }, need: 'marketing.send', fields: [{ label: { ar: 'الجمهور', en: 'Audience' }, value: { ar: 'السلال المتروكة المؤهلة بموافقة التواصل', en: 'Eligible abandoned carts with consent' } }, { label: { ar: 'الإرسال', en: 'Sending' }, value: { ar: 'بعد معاينة العدد والتكلفة', en: 'After previewing count and cost' } }] };
  return { kind: 'automation', section: 'automations', path: 'new', query: { tpl: 'tpl-cart' }, need: 'automation.manage', fields: [
    { label: { ar: 'القالب', en: 'Template' }, value: { ar: 'تذكير بالسلة المتروكة', en: 'Abandoned cart reminder' } },
    { label: { ar: 'الشرط', en: 'Condition' }, value: { ar: 'قيمة السلة من 100 ر.س', en: 'Cart value from SAR 100' } },
    { label: { ar: 'الحالة عند الفتح', en: 'Status when opened' }, value: { ar: 'مسودة، تحتاج تجربة آمنة قبل التفعيل', en: 'Draft; needs a safe test before activation' } },
  ] };
}

export function transferDraft(sku: string, to: LocId, qty: number | null): Draft {
  const from: LocId = to === 'ryd' ? 'jed' : 'ryd';
  const loc = (l: LocId): L => (l === 'ryd' ? { ar: 'مستودع الرياض', en: 'Riyadh warehouse' } : { ar: 'مستودع جدة', en: 'Jeddah warehouse' });
  return { kind: 'transfer', section: 'inventory', path: 'transfers/new', query: { sku, to }, need: 'inventory.transfer', fields: [
    { label: { ar: 'الصنف', en: 'SKU' }, value: { ar: sku, en: sku } },
    { label: { ar: 'من ← إلى', en: 'From → to' }, value: { ar: `${loc(from).ar} ← ${loc(to).ar}`, en: `${loc(from).en} → ${loc(to).en}` } },
    { label: { ar: 'الكمية المقترحة', en: 'Suggested quantity' }, value: qty ? { ar: `${qty} (تُعدّل في المسودة)`, en: `${qty} (set it in the draft)` } : { ar: 'تحددها في المسودة', en: 'You set it in the draft' } },
    { label: { ar: 'الحالة عند الفتح', en: 'Status when opened' }, value: { ar: 'مسودة، لا تتحرك وحدات قبل «أرسل»', en: 'Draft; no units move until you send it' } },
  ] };
}

/* ---------- Stock, late orders, conversion ---------- */

export interface StockRow { sku: string; total: number; days: number; perDay: number; lostWeek: number | null; byLoc: Record<LocId, number> }
export function stockInsight(levels: Level[], history: History[], orders: Order[]) {
  const ans = stockAnswer(levels, history);
  const rows: StockRow[] = ans.atRisk.map((r) => {
    const perDay = r.cov.kind === 'days' ? r.cov.perDay : 0;
    const price = unitPrice(orders, r.sku);
    const short = Math.max(0, Math.ceil(perDay * HORIZON_DAYS) - r.total);
    return { sku: r.sku, total: r.total, days: r.cov.kind === 'days' ? r.cov.days : 0, perDay, lostWeek: price === null ? null : short * price, byLoc: r.byLoc };
  });
  const p = ans.proposal;
  return { rows, unknown: ans.unknown.map((u) => ({ sku: u.sku, kind: u.cov.kind })), draft: p ? transferDraft(p.sku, p.to, p.qty) : null };
}

export function lateInsight(orders: Order[], automations: Automation[]) {
  const ans = lateAnswer(orders);
  const late = orders.filter((o) => ans.refs.includes(o.ref));
  const value = late.reduce((s, o) => s + total(o), 0);
  const byChannel = (['online', 'market', 'app'] as Channel[]).map((c) => ({ channel: c, count: late.filter((o) => o.channel === c).length })).filter((x) => x.count);
  const alerting = automations.some((x) => x.trigger === 'orderLate' && x.status === 'active');
  const draft: Draft | null = !ans.count ? null : alerting
    ? { kind: 'orders', section: 'orders', query: { view: 'late', sort: 'old' }, need: 'order.fulfil', fields: [{ label: { ar: 'القائمة', en: 'List' }, value: { ar: 'المتأخرة، الأقدم أولًا', en: 'Late, oldest first' } }] }
    : { kind: 'automation', section: 'automations', path: 'new', query: { tpl: 'tpl-late' }, need: 'automation.manage', fields: [
      { label: { ar: 'القالب', en: 'Template' }, value: { ar: 'طلب متأخر ينبّه الموظف', en: 'Late order alerts staff' } },
      { label: { ar: 'الشرط', en: 'Condition' }, value: { ar: 'مدفوع ولم يُجهّز بعد 24 ساعة', en: 'Paid and not fulfilled after 24 hours' } },
      { label: { ar: 'الحالة عند الفتح', en: 'Status when opened' }, value: { ar: 'مسودة، تحتاج تجربة آمنة قبل التفعيل', en: 'Draft; needs a safe test before activation' } },
    ] };
  return { count: ans.count, oldest: ans.oldest, refs: ans.refs.slice(0, 5), value, byChannel, alerting, draft };
}

export function conversionInsight(series: DayStat[], carts: Cart[], automations: Automation[]) {
  const ans = conversionAnswer(series);
  const cur = series.slice(-7);
  const missingDates = cur.filter((d) => d.sessions === null).map((d) => d.date);
  const openCarts = carts.filter((c) => !c.purchased && !c.optedOut);
  const cartValue = openCarts.reduce((s, c) => s + c.value, 0);
  if (ans.kind === 'insufficient') return { kind: 'insufficient' as const, missing: ans.missing, days: ans.days, missingDates, carts: openCarts.length, cartValue, draft: null };
  return { kind: 'answer' as const, cur: ans.cur, prev: ans.prev, delta: change(ans.cur, ans.prev), missingDates, carts: openCarts.length, cartValue, draft: ans.cur !== null && ans.prev !== null && ans.cur < ans.prev ? cartDraft(automations) : null };
}

/** Whether a role can open a proposal's draft; otherwise the view shows who can, and the manual path. */
export const canDraft = (role: Role, d: Draft) => !d.need || can(role, d.need);

/* ---------- Log of drafts the assistant opened (session) ---------- */

export interface DraftLog { id: string; question: Question; kind: DraftKind; who: string; at: number }
export const logDraft = (log: DraftLog[], question: Question, kind: DraftKind, who: string, at: number): DraftLog[] =>
  [{ id: `AS-${log.length + 1}`, question, kind, who, at }, ...log].slice(0, 20);
