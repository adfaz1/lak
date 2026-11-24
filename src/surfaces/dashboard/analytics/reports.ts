// Reports (owner requirement 4, BP-P03-ANA-001…011): sales, conversion funnel, products, customers, channels,
// coupons, abandoned carts and payments. Each report is data only: headline metrics with a definition, the same
// metrics for the comparison period, and tables a generic view renders and exports as CSV. No React.
import { total, subtotal, type Channel, type L, type Order } from '../../merchant/domain';
import type { Product } from '../../merchant/catalog';
import type { Cart, Coupon, DayStat } from '../../merchant/growth';
import { couponRedemptions } from '../../merchant/growth';
import type { Tx } from '../../merchant/finance';
import { toCsv } from '../../merchant/catalog';
import { productIdForSku } from '../model/media';
import { TODAY, addDays, covered, daysOf, inRange, orderDay, ordersIn, pct, type Range } from './range';

export type ReportId = 'sales' | 'funnel' | 'products' | 'customers' | 'channels' | 'coupons' | 'carts' | 'payments';
export const REPORTS: ReportId[] = ['sales', 'funnel', 'products', 'customers', 'channels', 'coupons', 'carts', 'payments'];
export const isReport = (v: string | null): v is ReportId => !!v && (REPORTS as string[]).includes(v);

export const REPORT_LABEL: Record<ReportId, L> = {
  sales: { ar: 'المبيعات', en: 'Sales' },
  funnel: { ar: 'قمع التحويل', en: 'Conversion funnel' },
  products: { ar: 'المنتجات', en: 'Products' },
  customers: { ar: 'العملاء', en: 'Customers' },
  channels: { ar: 'القنوات', en: 'Channels' },
  coupons: { ar: 'الكوبونات', en: 'Coupons' },
  carts: { ar: 'السلال المتروكة', en: 'Abandoned carts' },
  payments: { ar: 'المدفوعات', en: 'Payments' },
};

export type Unit = 'money' | 'count' | 'percent';
export interface Metric { id: string; label: L; hint: L; unit: Unit; value: number | null; prev: number | null; delta: number | null; invert?: boolean }
export type Cell = string | number | null | L;
export interface Col { key: string; label: L; hint?: L; unit: Unit | 'text' | 'delta' | 'product'; end?: boolean; hideOnPhone?: boolean }
export interface Table { id: string; title: L; hint: L; cols: Col[]; rows: Record<string, Cell>[]; empty: L }
export interface Report { id: ReportId; metrics: Metric[]; tables: Table[]; notes: L[]; source: L }

export interface Inputs {
  orders: Order[];
  series: DayStat[];
  products: Product[];
  carts: Cart[];
  coupons: Coupon[];
  txs: Tx[];
  /** Whether customer names may be shown (role can open customers). */
  names: boolean;
}

const l = (ar: string, en: string): L => ({ ar, en });
const metric = (id: string, label: L, hint: L, unit: Unit, value: number | null, prev: number | null, invert = false): Metric =>
  ({ id, label, hint, unit, value, prev, delta: pct(value, prev), invert });
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const ratio = (a: number, b: number) => (b ? Math.round((a * 1000) / b) / 10 : null);
const BOOK_START = (orders: Order[]) => orders.reduce((m, o) => (orderDay(o) < m ? orderDay(o) : m), TODAY);
/** The ledger (fees, refunds) starts with the first payout period. */
export const LEDGER_START = '2026-11-01';
const CH: Channel[] = ['online', 'market', 'app'];
export const CHANNEL_LABEL: Record<Channel, L> = { online: l('المتجر الإلكتروني', 'Online store'), market: l('سوق لك', 'LAK marketplace'), app: l('تطبيق المتجر', 'Store app') };

/* ---------- Sales (ANA-001/002, owner 4) ---------- */

function salesFigures(os: Order[], txs: Tx[], r: Range | null, products: Product[]) {
  const gross = sum(os, subtotal);
  const discounts = sum(os, (o) => o.discount ?? 0);
  const ledgerOk = !!r && r.from >= LEDGER_START;
  const inR = (t: Tx) => !!r && inRange(t.saleDay, r);
  const refunds = ledgerOk ? sum(txs.filter((t) => t.type === 'refund' && inR(t)), (t) => t.amount) : null;
  const fees = ledgerOk ? sum(txs.filter((t) => t.type === 'fee' && inR(t)), (t) => t.amount) : null;
  const net = gross - discounts - (refunds ?? 0);
  const shipping = sum(os, (o) => o.fee);
  let costed = 0, units = 0, cogs = 0, costedRevenue = 0;
  for (const o of os) for (const i of o.items) {
    units += i.qty;
    const p = products.find((x) => x.id === productIdForSku(i.sku));
    if (p?.cost != null) { costed += i.qty; cogs += i.qty * p.cost; costedRevenue += i.qty * i.unit; }
  }
  return { gross, discounts, refunds, fees, net, shipping, orders: os.length, aov: os.length ? Math.round((gross - discounts) / os.length) : null, cogs, costCoverage: units ? Math.round((costed * 100) / units) : null, margin: costed ? costedRevenue - cogs : null };
}

export function salesReport(x: Inputs, r: Range, c: Range | null): Report {
  const start = BOOK_START(x.orders);
  const cOk = covered(c, start);
  const a = salesFigures(ordersIn(x.orders, r), x.txs, r, x.products);
  const b = cOk ? salesFigures(ordersIn(x.orders, c), x.txs, c, x.products) : null;
  const enough = (a.costCoverage ?? 0) >= 80;
  const metrics = [
    metric('gross', l('إجمالي المبيعات', 'Gross sales'), l('سعر المنتجات المباعة × الكمية، شامل الضريبة، قبل الخصومات والاستردادات. بلا الشحن.', 'Price × quantity of products sold, VAT included, before discounts and refunds. Shipping excluded.'), 'money', a.gross, b?.gross ?? null),
    metric('discounts', l('الخصومات', 'Discounts'), l('خصومات الكوبونات والعروض على الطلبات.', 'Coupon and offer discounts on orders.'), 'money', a.discounts, b?.discounts ?? null, true),
    metric('refunds', l('الاستردادات', 'Refunds'), l('مبالغ أعيدت للعملاء في السجل المالي لأيام الفترة. السجل يبدأ 1 نوفمبر؛ قبله «لا بيانات».', 'Money returned to customers in the ledger for the period. The ledger starts 1 Nov; before that: no data.'), 'money', a.refunds, b?.refunds ?? null, true),
    metric('net', l('صافي المبيعات', 'Net sales'), l('الإجمالي − الخصومات − الاستردادات. ليس ربحًا.', 'Gross − discounts − refunds. Not profit.'), 'money', a.net, b?.net ?? null),
    metric('shipping', l('الشحن المحصّل', 'Shipping charged'), l('رسوم الشحن التي دفعها العملاء، منفصلة عن المبيعات.', 'Shipping fees customers paid, kept apart from sales.'), 'money', a.shipping, b?.shipping ?? null),
    metric('fees', l('رسوم الدفع', 'Payment fees'), l('رسوم المعالجة في السجل المالي (نسبة اختبار).', 'Processing fees in the ledger (test rate).'), 'money', a.fees, b?.fees ?? null, true),
    metric('orders', l('الطلبات', 'Orders'), l('الطلبات المدفوعة في أيام الفترة؛ الدفع الفاشل لا يُحسب.', 'Paid orders on the days of the period; failed payments excluded.'), 'count', a.orders, b?.orders ?? null),
    metric('margin', l('هامش تقديري', 'Estimated margin'), l(`مبيعات المنتجات التي لها تكلفة − تكلفتها. يغطي ${a.costCoverage ?? 0}% من القطع. لا يشمل الشحن والرسوم والمصاريف.`, `Sales of products with a cost − that cost. Covers ${a.costCoverage ?? 0}% of units. Excludes shipping, fees and expenses.`), 'money', enough ? a.margin : null, enough && b ? b.margin : null),
  ];
  const days = daysOf(r).reverse();
  const rows = days.map((d) => {
    const os = x.orders.filter((o) => o.pay !== 'failed' && orderDay(o) === d);
    const g = sum(os, subtotal), disc = sum(os, (o) => o.discount ?? 0);
    return { day: d, orders: os.length, gross: g, discounts: disc, net: g - disc, shipping: sum(os, (o) => o.fee) };
  });
  return {
    id: 'sales', metrics,
    tables: [{
      id: 'sales-daily', title: l('يومًا بيوم', 'Day by day'), hint: l('من دفتر الطلبات. الاستردادات تُسجَّل بتاريخها في السجل المالي، لذا لا تظهر في الأيام.', 'From the order book. Refunds are recorded on their own date in the ledger, so they are not split by day.'),
      cols: [
        { key: 'day', label: l('اليوم', 'Day'), unit: 'text' },
        { key: 'orders', label: l('الطلبات', 'Orders'), unit: 'count', end: true },
        { key: 'gross', label: l('الإجمالي', 'Gross'), unit: 'money', end: true, hideOnPhone: true },
        { key: 'discounts', label: l('الخصومات', 'Discounts'), unit: 'money', end: true, hideOnPhone: true },
        { key: 'net', label: l('بعد الخصم', 'After discounts'), unit: 'money', end: true },
        { key: 'shipping', label: l('الشحن', 'Shipping'), unit: 'money', end: true, hideOnPhone: true },
      ],
      rows, empty: l('لا طلبات في الفترة', 'No orders in this period'),
    }],
    notes: [
      ...(enough ? [] : [l(`الهامش التقديري غير معروض: التكلفة مسجلة لـ${a.costCoverage ?? 0}% من القطع فقط (المطلوب 80%). أضف التكلفة في المنتجات.`, `Estimated margin not shown: cost is recorded for only ${a.costCoverage ?? 0}% of units (80% needed). Add costs in Products.`)]),
      ...(a.refunds === null ? [l('الاستردادات والرسوم: «لا بيانات» قبل بداية السجل المالي (1 نوفمبر)، فالصافي هنا قبل الاستردادات.', 'Refunds and fees: no data before the ledger starts (1 Nov), so net here is before refunds.')] : []),
    ],
    source: l('دفتر الطلبات والسجل المالي', 'Order book and ledger'),
  };
}

/* ---------- Conversion funnel (owner 4, OWN-MNY-07) ---------- */

/** Demo funnel stages for a day with visit data: carts and checkouts at fixed-seed rates around typical values. */
export function funnelDay(d: DayStat): { visits: number; carts: number; checkouts: number; orders: number } | null {
  if (d.sessions === null) return null;
  const h = [...d.date].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 1000, 7) / 1000;
  const checkouts = Math.max(d.orders, Math.round(d.orders * (1.6 + h * 0.5)));
  const carts = Math.max(checkouts, Math.round(checkouts * (2.4 + h * 0.6)));
  return { visits: Math.max(carts, d.sessions), carts, checkouts, orders: d.orders };
}
function funnelOf(series: DayStat[], r: Range | null) {
  if (!r) return null;
  const ds = series.filter((d) => inRange(d.date, r));
  if (ds.length < r.days) return null;
  const known = ds.map(funnelDay).filter((x): x is NonNullable<typeof x> => !!x);
  if (!known.length) return { visits: null, carts: null, checkouts: null, orders: null, known: 0, days: ds.length };
  return { visits: sum(known, (k) => k.visits), carts: sum(known, (k) => k.carts), checkouts: sum(known, (k) => k.checkouts), orders: sum(known, (k) => k.orders), known: known.length, days: ds.length };
}
export function funnelReport(x: Inputs, r: Range, c: Range | null): Report {
  const a = funnelOf(x.series, r) ?? { visits: null, carts: null, checkouts: null, orders: null, known: 0, days: r.days };
  const b = funnelOf(x.series, c);
  const step = (n: number | null, d: number | null) => (n === null || d === null ? null : ratio(n, d));
  const STEPS = [
    { id: 'visits', label: l('زيارات', 'Visits'), hint: l('جلسات المتجر في الأيام التي فيها بيانات زيارات.', 'Store sessions on days with visit data.') },
    { id: 'carts', label: l('أضافوا للسلة', 'Added to cart'), hint: l('جلسات أُضيف فيها منتج للسلة.', 'Sessions where a product was added to the cart.') },
    { id: 'checkouts', label: l('بدأوا الدفع', 'Started checkout'), hint: l('جلسات وصلت صفحة الدفع.', 'Sessions that reached checkout.') },
    { id: 'orders', label: l('طلبوا', 'Ordered'), hint: l('طلبات أُنشئت في الأيام نفسها.', 'Orders placed on the same days.') },
  ] as const;
  const rows = STEPS.map((s, i) => {
    const v = a[s.id], p = b ? b[s.id] : null;
    const prevStep = i ? a[STEPS[i - 1].id] : null;
    return { step: s.label, count: v, fromPrev: i ? step(v, prevStep) : null, fromVisits: step(v, a.visits), prev: p, delta: pct(v, p) };
  });
  const conv = step(a.orders, a.visits), convPrev = b ? step(b.orders, b.visits) : null;
  return {
    id: 'funnel',
    metrics: [
      metric('conversion', l('معدل التحويل', 'Conversion rate'), l('الطلبات ÷ الزيارات، على الأيام التي فيها بيانات زيارات فقط.', 'Orders ÷ visits, on days with visit data only.'), 'percent', conv, convPrev),
      metric('cartRate', l('نسبة الإضافة للسلة', 'Add-to-cart rate'), l('أضافوا للسلة ÷ الزيارات.', 'Added to cart ÷ visits.'), 'percent', step(a.carts, a.visits), b ? step(b.carts, b.visits) : null),
      metric('checkoutRate', l('إتمام الدفع', 'Checkout completion'), l('طلبوا ÷ بدأوا الدفع.', 'Ordered ÷ started checkout.'), 'percent', step(a.orders, a.checkouts), b ? step(b.orders, b.checkouts) : null),
      metric('visits', l('الزيارات', 'Visits'), STEPS[0].hint, 'count', a.visits, b?.visits ?? null),
    ],
    tables: [{
      id: 'funnel-steps', title: l('مراحل القمع', 'Funnel steps'), hint: l(`محسوب على ${a.known} من ${a.days} أيام فيها بيانات زيارات؛ الأيام الأخرى مستبعدة من كل المراحل لتبقى قابلة للمقارنة.`, `Computed on ${a.known} of ${a.days} days with visit data; other days are left out of every step so steps stay comparable.`),
      cols: [
        { key: 'step', label: l('المرحلة', 'Step'), unit: 'text' },
        { key: 'count', label: l('العدد', 'Count'), unit: 'count', end: true },
        { key: 'fromPrev', label: l('من المرحلة السابقة', 'From previous step'), hint: l('نسبة من وصلوا هذه المرحلة من المرحلة التي قبلها.', 'Share that reached this step from the one before.'), unit: 'percent', end: true },
        { key: 'fromVisits', label: l('من الزيارات', 'From visits'), unit: 'percent', end: true, hideOnPhone: true },
        { key: 'prev', label: l('فترة المقارنة', 'Comparison'), unit: 'count', end: true, hideOnPhone: true },
        { key: 'delta', label: l('التغير', 'Change'), unit: 'delta', end: true },
      ],
      rows, empty: l('لا بيانات زيارات في الفترة', 'No visit data in this period'),
    }],
    notes: [l('السلة وبدء الدفع بيانات تجريبية مشتقة من الزيارات حتى يُفعَّل التتبع في المتجر. لا تقسيم حسب القناة: الزيارات غير مصنفة بالقناة.', 'Cart and checkout steps are demo data derived from visits until store tracking is on. No split by channel: visits are not tagged by channel.')],
    source: l('إحصاءات المتجر', 'Store statistics'),
  };
}

/* ---------- Products (ANA-003, owner 4) ---------- */

export type ProductSort = 'best' | 'worst' | 'margin';
export const parseProductSort = (v: string | null): ProductSort => (v === 'worst' || v === 'margin' ? v : 'best');
export function productsReport(x: Inputs, r: Range, c: Range | null, sort: ProductSort = 'best'): Report {
  const cOk = covered(c, BOOK_START(x.orders));
  const agg = (os: Order[]) => {
    const m = new Map<string, { units: number; revenue: number }>();
    for (const o of os) for (const i of o.items) {
      const id = productIdForSku(i.sku) ?? i.sku;
      const cur = m.get(id) ?? { units: 0, revenue: 0 };
      cur.units += i.qty; cur.revenue += i.qty * i.unit;
      m.set(id, cur);
    }
    return m;
  };
  const a = agg(ordersIn(x.orders, r)), b = cOk ? agg(ordersIn(x.orders, c)) : null;
  const all = [...a.values()].reduce((s, v) => s + v.revenue, 0);
  const listed = x.products.filter((p) => p.status === 'active' && p.type !== 'digital');
  const ids = new Set([...listed.map((p) => p.id), ...a.keys()]);
  const rows = [...ids].map((id) => {
    const p = x.products.find((q) => q.id === id);
    const s = a.get(id) ?? { units: 0, revenue: 0 };
    const cost = p?.cost ?? null;
    const margin = cost === null ? null : s.revenue - s.units * cost;
    const prev = b ? (b.get(id)?.revenue ?? 0) : null;
    return { _pid: id, product: p?.name ?? l(id, id), units: s.units, revenue: s.revenue, share: all ? Math.round((s.revenue * 1000) / all) / 10 : 0, margin, marginPct: margin === null || !s.revenue ? null : Math.round((margin * 1000) / s.revenue) / 10, prev, delta: pct(s.revenue, prev) };
  });
  rows.sort((p, q) => (sort === 'worst' ? p.revenue - q.revenue : sort === 'margin' ? (q.margin ?? -Infinity) - (p.margin ?? -Infinity) : q.revenue - p.revenue));
  const noSales = rows.filter((r0) => r0.units === 0).length;
  const noCost = rows.filter((r0) => r0.margin === null).length;
  return {
    id: 'products',
    metrics: [
      metric('revenue', l('مبيعات المنتجات', 'Product sales'), l('السعر × الكمية في الطلبات المدفوعة للفترة، قبل الخصومات.', 'Price × quantity in paid orders of the period, before discounts.'), 'money', all, b ? [...b.values()].reduce((s, v) => s + v.revenue, 0) : null),
      metric('units', l('القطع المباعة', 'Units sold'), l('مجموع الكميات في الطلبات المدفوعة.', 'Total quantity in paid orders.'), 'count', [...a.values()].reduce((s, v) => s + v.units, 0), b ? [...b.values()].reduce((s, v) => s + v.units, 0) : null),
      metric('noSales', l('منتجات بلا مبيعات', 'Products with no sales'), l('منتجات نشطة لم تُبع أي قطعة منها في الفترة.', 'Active products with no unit sold in the period.'), 'count', noSales, null, true),
    ],
    tables: [{
      id: 'products', title: sort === 'worst' ? l('الأقل مبيعًا', 'Lowest selling') : sort === 'margin' ? l('الأعلى هامشًا', 'Highest margin') : l('الأكثر مبيعًا', 'Best selling'),
      hint: l('الهامش = المبيعات − الكمية × التكلفة المسجلة. منتج بلا تكلفة: «—». ليس ربحًا: لا يشمل الشحن والرسوم والخصومات.', 'Margin = sales − units × recorded cost. Product without a cost: “—”. Not profit: excludes shipping, fees and discounts.'),
      cols: [
        { key: 'product', label: l('المنتج', 'Product'), unit: 'product' },
        { key: 'units', label: l('القطع', 'Units'), unit: 'count', end: true, hideOnPhone: true },
        { key: 'revenue', label: l('المبيعات', 'Sales'), unit: 'money', end: true },
        { key: 'share', label: l('الحصة', 'Share'), unit: 'percent', end: true, hideOnPhone: true },
        { key: 'margin', label: l('الهامش', 'Margin'), hint: l('تقديري، من التكلفة المسجلة في المنتج.', 'Estimated, from the cost recorded on the product.'), unit: 'money', end: true, hideOnPhone: true },
        { key: 'marginPct', label: l('الهامش %', 'Margin %'), unit: 'percent', end: true, hideOnPhone: true },
        { key: 'delta', label: l('التغير', 'Change'), hint: l('تغير المبيعات عن فترة المقارنة.', 'Change in sales vs the comparison period.'), unit: 'delta', end: true },
      ],
      rows, empty: l('لا منتجات نشطة', 'No active products'),
    }],
    notes: noCost ? [l(`${noCost} منتج بلا تكلفة مسجلة، فلا هامش له.`, `${noCost} product(s) have no recorded cost, so no margin.`)] : [],
    source: l('دفتر الطلبات والمنتجات', 'Order book and products'),
  };
}

/* ---------- Customers (ANA-004, owner 4) ---------- */

const custKey = (o: Order) => o.customerId ?? o.customer.en;
export function customersReport(x: Inputs, r: Range, c: Range | null): Report {
  const paid = x.orders.filter((o) => o.pay !== 'failed');
  const first = new Map<string, string>();
  for (const o of paid) { const k = custKey(o), d = orderDay(o); if (!first.has(k) || d < first.get(k)!) first.set(k, d); }
  const start = BOOK_START(x.orders);
  const cOk = covered(c, start);
  const split = (rr: Range) => {
    const os = ordersIn(x.orders, rr);
    const by = new Map<string, { name: L; orders: number; spend: number }>();
    for (const o of os) { const k = custKey(o); const cur = by.get(k) ?? { name: o.customer, orders: 0, spend: 0 }; cur.orders++; cur.spend += total(o); by.set(k, cur); }
    const keys = [...by.keys()];
    const isNew = (k: string) => inRange(first.get(k)!, rr);
    const newK = keys.filter(isNew), retK = keys.filter((k) => !isNew(k));
    return { by, customers: keys.length, newC: newK.length, returning: retK.length, newRev: sum(newK, (k) => by.get(k)!.spend), retRev: sum(retK, (k) => by.get(k)!.spend), repeat: ratio(keys.filter((k) => by.get(k)!.orders > 1).length, keys.length) };
  };
  const a = split(r), b = cOk && c ? split(c) : null;
  const top = [...a.by.entries()].sort((p, q) => q[1].spend - p[1].spend).slice(0, 10)
    .map(([k, v], i) => ({ customer: x.names ? v.name : l(`عميل ${i + 1}`, `Customer ${i + 1}`), orders: v.orders, spend: v.spend, type: inRange(first.get(k)!, r) ? l('جديد', 'New') : l('عائد', 'Returning') }));
  // Cohorts by month of first order: share of the cohort that ordered again in each later month.
  const months = [...new Set(paid.map((o) => orderDay(o).slice(0, 7)))].sort();
  const cohorts = months.map((m) => {
    const members = [...first.entries()].filter(([, d]) => d.slice(0, 7) === m).map(([k]) => k);
    const row: Record<string, Cell> = { cohort: m, size: members.length };
    months.filter((mm) => mm > m).slice(0, 4).forEach((mm, i) => {
      const back = members.filter((k) => paid.some((o) => custKey(o) === k && orderDay(o).slice(0, 7) === mm)).length;
      row[`m${i + 1}`] = members.length ? Math.round((back * 1000) / members.length) / 10 : null;
    });
    return row;
  }).filter((row) => (row.size as number) > 0);
  return {
    id: 'customers',
    metrics: [
      metric('customers', l('عملاء اشتروا', 'Buying customers'), l('عملاء لهم طلب مدفوع واحد على الأقل في الفترة.', 'Customers with at least one paid order in the period.'), 'count', a.customers, b?.customers ?? null),
      metric('new', l('عملاء جدد', 'New customers'), l('أول طلب مدفوع لهم كان في الفترة.', 'Their first paid order was in the period.'), 'count', a.newC, b?.newC ?? null),
      metric('returning', l('عملاء عائدون', 'Returning customers'), l('اشتروا في الفترة ولهم طلب قبلها.', 'Bought in the period and had ordered before.'), 'count', a.returning, b?.returning ?? null),
      metric('repeat', l('نسبة تكرار الشراء', 'Repeat purchase rate'), l('عملاء لهم أكثر من طلب في الفترة ÷ كل العملاء المشترين.', 'Customers with more than one order in the period ÷ all buying customers.'), 'percent', a.repeat, b?.repeat ?? null),
      metric('newRev', l('مبيعات العملاء الجدد', 'Sales from new'), l('قيمة طلبات العملاء الجدد في الفترة، شامل الشحن.', 'Order value of new customers in the period, shipping included.'), 'money', a.newRev, b?.newRev ?? null),
      metric('retRev', l('مبيعات العائدين', 'Sales from returning'), l('قيمة طلبات العملاء العائدين في الفترة، شامل الشحن.', 'Order value of returning customers in the period, shipping included.'), 'money', a.retRev, b?.retRev ?? null),
    ],
    tables: [
      {
        id: 'customers-top', title: l('الأعلى إنفاقًا', 'Top spenders'), hint: x.names ? l('حسب قيمة الطلبات المدفوعة في الفترة.', 'By paid order value in the period.') : l('الأسماء مخفية لدورك.', 'Names are hidden for your role.'),
        cols: [
          { key: 'customer', label: l('العميل', 'Customer'), unit: 'text' },
          { key: 'type', label: l('النوع', 'Type'), unit: 'text', hideOnPhone: true },
          { key: 'orders', label: l('الطلبات', 'Orders'), unit: 'count', end: true },
          { key: 'spend', label: l('الإنفاق', 'Spend'), unit: 'money', end: true },
        ],
        rows: top, empty: l('لا عملاء اشتروا في الفترة', 'No buying customers in this period'),
      },
      {
        id: 'customers-cohorts', title: l('الأفواج حسب شهر أول طلب', 'Cohorts by first-order month'), hint: l('لكل فوج: نسبة من عادوا واشتروا في الشهر الأول والثاني والثالث والرابع بعده. خلية فارغة = الشهر لم يأتِ بعد.', 'For each cohort: share that came back and bought 1, 2, 3 and 4 months later. Empty = that month has not come yet.'),
        cols: [
          { key: 'cohort', label: l('الفوج', 'Cohort'), unit: 'text' },
          { key: 'size', label: l('العدد', 'Size'), unit: 'count', end: true },
          { key: 'm1', label: l('+1 شهر', '+1 mo'), unit: 'percent', end: true },
          { key: 'm2', label: l('+2', '+2'), unit: 'percent', end: true },
          { key: 'm3', label: l('+3', '+3'), unit: 'percent', end: true, hideOnPhone: true },
          { key: 'm4', label: l('+4', '+4'), unit: 'percent', end: true, hideOnPhone: true },
        ],
        rows: cohorts, empty: l('لا طلبات بعد', 'No orders yet'),
      },
    ],
    notes: [l(`دفتر الطلبات يبدأ ${start}؛ «جديد» يعني أول طلب داخل الدفتر. العمر والجنس لا يُستنتجان.`, `The order book starts ${start}; “new” means first order within the book. Age and gender are never inferred.`)],
    source: l('دفتر الطلبات', 'Order book'),
  };
}

/* ---------- Channels (owner 4, OWN-MNY-10) ---------- */

export function channelsReport(x: Inputs, r: Range, c: Range | null): Report {
  const cOk = covered(c, BOOK_START(x.orders));
  const a = ordersIn(x.orders, r), b = cOk ? ordersIn(x.orders, c) : null;
  const all = sum(a, total);
  const rows = CH.map((ch) => {
    const os = a.filter((o) => o.channel === ch), ps = b?.filter((o) => o.channel === ch) ?? null;
    const rev = sum(os, total), prev = ps ? sum(ps, total) : null;
    return { channel: CHANNEL_LABEL[ch], orders: os.length, revenue: rev, share: all ? Math.round((rev * 1000) / all) / 10 : 0, aov: os.length ? Math.round(rev / os.length) : null, prevOrders: ps?.length ?? null, prev, delta: pct(rev, prev) };
  }).sort((p, q) => q.revenue - p.revenue);
  const top = rows[0];
  const topPrev = b && top ? (() => { const pAll = sum(b, total); return pAll ? Math.round((sum(b.filter((o) => CHANNEL_LABEL[o.channel] === top.channel), total) * 1000) / pAll) / 10 : null; })() : null;
  return {
    id: 'channels',
    metrics: [
      metric('revenue', l('قيمة الطلبات', 'Order value'), l('مجموع قيمة الطلبات المدفوعة شامل الشحن، كل القنوات.', 'Total paid order value incl. shipping, all channels.'), 'money', all, b ? sum(b, total) : null),
      metric('orders', l('الطلبات', 'Orders'), l('الطلبات المدفوعة في الفترة، كل القنوات.', 'Paid orders in the period, all channels.'), 'count', a.length, b?.length ?? null),
      metric('topShare', l(`حصة ${top?.channel.ar ?? ''}`, `${top?.channel.en ?? ''} share`), l('حصة أكبر قناة من قيمة الطلبات.', 'Share of order value from the largest channel.'), 'percent', top?.share ?? null, topPrev),
    ],
    tables: [{
      id: 'channels', title: l('حسب القناة', 'By channel'), hint: l('الحصة من قيمة الطلبات. التحويل لكل قناة يحتاج زيارات مصنفة بالقناة: «لا بيانات».', 'Share of order value. Conversion per channel needs visits tagged by channel: no data.'),
      cols: [
        { key: 'channel', label: l('القناة', 'Channel'), unit: 'text' },
        { key: 'orders', label: l('الطلبات', 'Orders'), unit: 'count', end: true, hideOnPhone: true },
        { key: 'revenue', label: l('القيمة', 'Value'), unit: 'money', end: true },
        { key: 'share', label: l('الحصة', 'Share'), unit: 'percent', end: true, hideOnPhone: true },
        { key: 'aov', label: l('متوسط الطلب', 'Avg order'), unit: 'money', end: true, hideOnPhone: true },
        { key: 'prev', label: l('فترة المقارنة', 'Comparison'), unit: 'money', end: true, hideOnPhone: true },
        { key: 'delta', label: l('التغير', 'Change'), unit: 'delta', end: true },
      ],
      rows, empty: l('لا طلبات في الفترة', 'No orders in this period'),
    }],
    notes: [],
    source: l('دفتر الطلبات', 'Order book'),
  };
}

/* ---------- Coupons (ANA-009) ---------- */

export function couponsReport(x: Inputs, r: Range, c: Range | null): Report {
  const red = couponRedemptions(x.orders, x.coupons, TODAY);
  const cOk = covered(c, BOOK_START(x.orders));
  const of = (rr: Range | null) => (rr ? red.filter((d) => inRange(addDays(TODAY, -Math.floor(d.hoursAgo / 24)), rr)) : []);
  const a = of(r), b = cOk ? of(c) : null;
  const codes = [...new Set([...x.coupons.map((k) => k.code), ...a.map((d) => d.code)])];
  const rows = codes.map((code) => {
    const k = x.coupons.find((q) => q.code === code);
    const mine = a.filter((d) => d.code === code), prev = b?.filter((d) => d.code === code) ?? null;
    const rev = sum(mine, (d) => d.revenue);
    return { code, orders: mine.length, discount: sum(mine, (d) => d.discount), revenue: rev, aov: mine.length ? Math.round(rev / mine.length) : null, prevOrders: prev?.length ?? null, delta: pct(mine.length, prev?.length ?? null), lifetime: k?.used ?? null };
  }).sort((p, q) => q.revenue - p.revenue);
  const disc = sum(a, (d) => d.discount), rev = sum(a, (d) => d.revenue);
  return {
    id: 'coupons',
    metrics: [
      metric('orders', l('طلبات بكوبون', 'Orders with a coupon'), l('طلبات مدفوعة استُخدم فيها كوبون في الفترة.', 'Paid orders that used a coupon in the period.'), 'count', a.length, b?.length ?? null),
      metric('discount', l('قيمة الخصم الممنوح', 'Discount given'), l('مجموع ما خصمته الكوبونات من هذه الطلبات.', 'Total taken off these orders by coupons.'), 'money', disc, b ? sum(b, (d) => d.discount) : null, true),
      metric('revenue', l('الإيراد المرتبط', 'Linked revenue'), l('قيمة الطلبات التي استخدمت كوبونًا بعد الخصم. ليس إيرادًا إضافيًا بالضرورة.', 'Value of orders that used a coupon, after discount. Not necessarily extra revenue.'), 'money', rev, b ? sum(b, (d) => d.revenue) : null),
      metric('cost', l('الخصم ÷ الإيراد', 'Discount ÷ revenue'), l('كم ريالًا تخصم مقابل كل 100 ريال من الطلبات المرتبطة.', 'Riyals discounted per 100 riyals of linked orders.'), 'percent', ratio(disc, rev), b ? ratio(sum(b, (d) => d.discount), sum(b, (d) => d.revenue)) : null, true),
    ],
    tables: [{
      id: 'coupons', title: l('حسب الكوبون', 'By coupon'), hint: l('«الاستخدام الكلي» عدّاد الكوبون منذ إنشائه، بلا تقسيم بالفترة.', '“Lifetime uses” is the coupon counter since creation, not split by period.'),
      cols: [
        { key: 'code', label: l('الكود', 'Code'), unit: 'text' },
        { key: 'orders', label: l('الطلبات', 'Orders'), unit: 'count', end: true },
        { key: 'discount', label: l('الخصم', 'Discount'), unit: 'money', end: true },
        { key: 'revenue', label: l('الإيراد المرتبط', 'Linked revenue'), unit: 'money', end: true, hideOnPhone: true },
        { key: 'aov', label: l('متوسط الطلب', 'Avg order'), unit: 'money', end: true, hideOnPhone: true },
        { key: 'delta', label: l('تغير الطلبات', 'Orders change'), unit: 'delta', end: true, hideOnPhone: true },
        { key: 'lifetime', label: l('الاستخدام الكلي', 'Lifetime uses'), unit: 'count', end: true, hideOnPhone: true },
      ],
      rows, empty: l('لا كوبونات', 'No coupons'),
    }],
    notes: red.some((d) => d.demo) ? [l('استخدامات الطلبات القديمة بيانات تجريبية؛ طلبات المتجر الجديدة تحمل كوبونها الفعلي.', 'Uses on older orders are demo data; new store orders carry their actual coupon.')] : [],
    source: l('دفتر الطلبات والكوبونات', 'Order book and coupons'),
  };
}

/* ---------- Abandoned carts (ANA-010) ---------- */

export function cartsReport(x: Inputs, r: Range, c: Range | null): Report {
  const day = (k: Cart) => addDays(TODAY, -Math.floor(k.hoursAgo / 24));
  const earliest = x.carts.reduce((m, k) => (day(k) < m ? day(k) : m), TODAY);
  const of = (rr: Range) => x.carts.filter((k) => inRange(day(k), rr));
  const cOk = !!c && c.from >= earliest;
  const fig = (ks: Cart[]) => {
    const rec = ks.filter((k) => k.purchased), lost = ks.filter((k) => !k.purchased);
    return { carts: ks.length, value: sum(ks, (k) => k.value), recovered: rec.length, recoveredValue: sum(rec, (k) => k.value), lost: sum(lost, (k) => k.value), rate: ratio(rec.length, ks.length), contacted: ks.filter((k) => k.contactedByAutomation).length };
  };
  const a = fig(of(r)), b = cOk && c ? fig(of(c)) : null;
  const rows = daysOf(r).reverse().map((d) => { const f = fig(x.carts.filter((k) => day(k) === d)); return { day: d, carts: f.carts, value: f.value, recovered: f.recovered, recoveredValue: f.recoveredValue }; }).filter((row) => row.carts > 0);
  return {
    id: 'carts',
    metrics: [
      metric('carts', l('سلال متروكة', 'Abandoned carts'), l('سلال فيها منتجات وبيانات تواصل ولم يكتمل طلبها خلال ساعة.', 'Carts with products and contact details whose order was not completed within an hour.'), 'count', a.carts, b?.carts ?? null, true),
      metric('lost', l('قيمة غير مستردة', 'Value not recovered'), l('قيمة السلال التي لم تتحول إلى طلب.', 'Value of carts that did not become an order.'), 'money', a.lost, b?.lost ?? null, true),
      metric('recoveredValue', l('قيمة مستردة', 'Recovered value'), l('قيمة السلال التي اكتمل طلبها لاحقًا، بعد رسالة أو بدونها.', 'Value of carts later completed, with or without a message.'), 'money', a.recoveredValue, b?.recoveredValue ?? null),
      metric('rate', l('نسبة الاسترداد', 'Recovery rate'), l('سلال اكتملت ÷ كل السلال المتروكة.', 'Completed carts ÷ all abandoned carts.'), 'percent', a.rate, b?.rate ?? null),
      metric('contacted', l('تواصلت معها الأتمتة', 'Contacted by automation'), l('سلال أرسلت لها الأتمتة رسالة.', 'Carts an automation sent a message to.'), 'count', a.contacted, b?.contacted ?? null),
    ],
    tables: [{
      id: 'carts-daily', title: l('يومًا بيوم', 'Day by day'), hint: l('أيام بلا سلال لا تظهر.', 'Days without carts are not listed.'),
      cols: [
        { key: 'day', label: l('اليوم', 'Day'), unit: 'text' },
        { key: 'carts', label: l('السلال', 'Carts'), unit: 'count', end: true },
        { key: 'value', label: l('القيمة', 'Value'), unit: 'money', end: true },
        { key: 'recovered', label: l('اكتملت', 'Completed'), unit: 'count', end: true },
        { key: 'recoveredValue', label: l('قيمة مستردة', 'Recovered'), unit: 'money', end: true, hideOnPhone: true },
      ],
      rows, empty: l('لا سلال متروكة في الفترة', 'No abandoned carts in this period'),
    }],
    notes: [l(`السلال محفوظة من ${earliest} فقط؛ المقارنة قبل ذلك «لا بيانات». المنتجات الأكثر تركًا غير متاحة: السلة تحفظ قيمتها فقط.`, `Carts are kept from ${earliest} only; comparisons before that show no data. Most-abandoned products are unavailable: a cart stores its value only.`)],
    source: l('السلال المتروكة', 'Abandoned carts'),
  };
}

/* ---------- Payments (ANA-006) ---------- */

export const METHOD_LABEL: Record<string, L> = { card: l('بطاقة', 'Card'), applepay: l('Apple Pay', 'Apple Pay'), bnpl: l('ادفع لاحقًا', 'Pay later'), cod: l('عند الاستلام', 'Cash on delivery'), none: l('غير مسجّلة', 'Not recorded') };
export function paymentsReport(x: Inputs, r: Range, c: Range | null): Report {
  const cOk = covered(c, BOOK_START(x.orders));
  const att = (rr: Range) => x.orders.filter((o) => inRange(orderDay(o), rr));
  const fig = (rr: Range) => {
    const os = att(rr);
    const paid = os.filter((o) => o.pay !== 'failed');
    const ledger = rr.from >= LEDGER_START;
    const inR = (t: Tx) => inRange(t.saleDay, rr);
    const refunds = ledger ? x.txs.filter((t) => t.type === 'refund' && inR(t)) : null;
    const fees = ledger ? sum(x.txs.filter((t) => t.type === 'fee' && inR(t)), (t) => t.amount) : null;
    const settledSales = ledger ? sum(x.txs.filter((t) => t.type === 'sale' && inR(t)), (t) => t.amount) : null;
    return { attempts: os.length, failed: os.length - paid.length, success: ratio(paid.length, os.length), refunds: refunds?.length ?? null, refundAmount: refunds ? sum(refunds, (t) => t.amount) : null, fees, feeRate: fees !== null && settledSales ? ratio(fees, settledSales) : null, paid };
  };
  const a = fig(r), b = cOk && c ? fig(c) : null;
  const methods = Object.keys(METHOD_LABEL).map((m) => {
    const os = a.paid.filter((o) => (o.payment?.method ?? 'none') === m);
    return { method: METHOD_LABEL[m], orders: os.length, value: sum(os, total), share: a.paid.length ? Math.round((os.length * 1000) / a.paid.length) / 10 : 0 };
  }).filter((row) => row.orders > 0);
  return {
    id: 'payments',
    metrics: [
      metric('success', l('نجاح الدفع', 'Payment success'), l('طلبات مدفوعة ÷ كل الطلبات التي حاولت الدفع في الفترة.', 'Paid orders ÷ all orders that attempted payment in the period.'), 'percent', a.success, b?.success ?? null),
      metric('failed', l('دفع فاشل', 'Failed payments'), l('طلبات رُفض دفعها أو لم يكتمل.', 'Orders whose payment was declined or not completed.'), 'count', a.failed, b?.failed ?? null, true),
      metric('refunds', l('الاستردادات', 'Refunds'), l('عدد الاستردادات في السجل المالي للفترة.', 'Number of refunds in the ledger for the period.'), 'count', a.refunds, b?.refunds ?? null, true),
      metric('refundAmount', l('مبلغ الاستردادات', 'Refunded'), l('مجموع المبالغ المستردة في السجل المالي.', 'Total refunded in the ledger.'), 'money', a.refundAmount, b?.refundAmount ?? null, true),
      metric('feeRate', l('نسبة الرسوم', 'Fee rate'), l('رسوم الدفع ÷ المبيعات المسجلة في السجل المالي (نسبة اختبار).', 'Payment fees ÷ sales recorded in the ledger (test rate).'), 'percent', a.feeRate, b?.feeRate ?? null, true),
    ],
    tables: [{
      id: 'payments-methods', title: l('حسب طريقة الدفع', 'By payment method'), hint: l('طلبات دفتر الطلبات القديمة لا تحمل طريقة الدفع: «غير مسجلة». نسبة الاحتيال والاعتراضات تحتاج بوابة دفع حقيقية.', 'Older orders in the book do not carry a method: “not recorded”. Fraud and dispute rates need a real payment gateway.'),
      cols: [
        { key: 'method', label: l('الطريقة', 'Method'), unit: 'text' },
        { key: 'orders', label: l('الطلبات', 'Orders'), unit: 'count', end: true },
        { key: 'value', label: l('القيمة', 'Value'), unit: 'money', end: true },
        { key: 'share', label: l('الحصة', 'Share'), unit: 'percent', end: true },
      ],
      rows: methods, empty: l('لا طلبات مدفوعة في الفترة', 'No paid orders in this period'),
    }],
    notes: a.refunds === null ? [l('الاستردادات والرسوم: «لا بيانات» قبل بداية السجل المالي (1 نوفمبر).', 'Refunds and fees: no data before the ledger starts (1 Nov).')] : [],
    source: l('دفتر الطلبات والسجل المالي', 'Order book and ledger'),
  };
}

export function buildReport(id: ReportId, x: Inputs, r: Range, c: Range | null, opts: { sort?: ProductSort } = {}): Report {
  switch (id) {
    case 'sales': return salesReport(x, r, c);
    case 'funnel': return funnelReport(x, r, c);
    case 'products': return productsReport(x, r, c, opts.sort);
    case 'customers': return customersReport(x, r, c);
    case 'channels': return channelsReport(x, r, c);
    case 'coupons': return couponsReport(x, r, c);
    case 'carts': return cartsReport(x, r, c);
    case 'payments': return paymentsReport(x, r, c);
  }
}

/* ---------- CSV ---------- */

const csvCell = (v: Cell, unit: Col['unit'], lang: 'ar' | 'en'): string | number => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return v[lang];
  if (unit === 'money' && typeof v === 'number') return (v / 100).toFixed(2);
  return v;
};
/** A table as CSV in the viewer's language: the rows shown for the chosen period, money in SAR with two decimals. */
export function tableCsv(t: Table, lang: 'ar' | 'en', meta: { from: string; to: string; cmp: string }): string {
  const head = t.cols.map((c) => c.label[lang] + (c.unit === 'money' ? ' (SAR)' : c.unit === 'percent' || c.unit === 'delta' ? ' (%)' : ''));
  return toCsv([
    [lang === 'ar' ? 'الفترة' : 'Period', `${meta.from} → ${meta.to}`, lang === 'ar' ? 'المقارنة' : 'Comparison', meta.cmp],
    head,
    ...t.rows.map((row) => t.cols.map((c) => csvCell(row[c.key], c.unit, lang))),
  ]);
}
/** Headline metrics of a report as CSV (value, comparison and change). */
export function metricsCsv(rep: Report, lang: 'ar' | 'en', meta: { from: string; to: string; cmp: string }): string {
  const fmt = (m: Metric, v: number | null) => (v === null ? (lang === 'ar' ? 'لا بيانات' : 'no data') : m.unit === 'money' ? (v / 100).toFixed(2) : v);
  return toCsv([
    [lang === 'ar' ? 'الفترة' : 'Period', `${meta.from} → ${meta.to}`, lang === 'ar' ? 'المقارنة' : 'Comparison', meta.cmp],
    [lang === 'ar' ? 'المؤشر' : 'Metric', lang === 'ar' ? 'القيمة' : 'Value', lang === 'ar' ? 'فترة المقارنة' : 'Comparison', lang === 'ar' ? 'التغير %' : 'Change %', lang === 'ar' ? 'الوحدة' : 'Unit'],
    ...rep.metrics.map((m) => [m.label[lang], fmt(m, m.value), fmt(m, m.prev), m.delta ?? '', m.unit === 'money' ? 'SAR' : m.unit]),
  ]);
}
