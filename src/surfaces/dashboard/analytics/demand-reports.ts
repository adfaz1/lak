// Reports added after the Salla audit (06-reports, 14-old-version): the financial summary (Salla moved theirs to a page
// that never loaded), most searched terms and searches with no results (Salla dropped «الأكثر بحثًا»), returns and
// refunds by reason and product, «notify me» and wishlist demand, and the order sub-status report. Data only: each
// report has a definition per number, the comparison period, CSV tables and an action link where a number implies one.
import { subtotal, type L, type Order } from '../../merchant/domain';
import type { Product } from '../../merchant/catalog';
import { skusOf } from '../../merchant/catalog';
import { available, type Level } from '../../merchant/inventory';
import { liveSub, mainState, type SubStatus } from '../../merchant/ops';
import { normTerm, type NotifyRequest, type SearchEvent, type SearchRedirect, type WishEvent } from '../../merchant/demand';
import { link } from '../../../core/router';
import { productIdForSku } from '../model/media';
import { TODAY, inRange, orderDay, ordersIn, pct, type Range } from './range';
import { LEDGER_START, type Cell, type Inputs, type Metric, type Report, type Table, type Unit } from './reports';

const l = (ar: string, en: string): L => ({ ar, en });
const metric = (id: string, label: L, hint: L, unit: Unit, value: number | null, prev: number | null, invert = false, extra: Partial<Metric> = {}): Metric =>
  ({ id, label, hint, unit, value, prev, delta: pct(value, prev), invert, ...extra });
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const ratio = (a: number, b: number) => (b ? Math.round((a * 1000) / b) / 10 : null);
const ana = (q: Record<string, string | undefined>) => link('/dashboard/analytics', q);
const dash = (path: string, q?: Record<string, string | undefined>) => link(`/dashboard/${path}`, q);
const BOOK_START = (orders: Order[]) => orders.reduce((m, o) => (orderDay(o) < m ? orderDay(o) : m), TODAY);
const bookCovers = (orders: Order[], c: Range | null) => !!c && c.from >= BOOK_START(orders);

/* ---------- Financial summary ---------- */

export interface FinanceFigures {
  gross: number; discounts: number; shipping: number; refunds: number | null; collected: number; vat: number; fees: number | null; net: number;
  cogs: number | null; profit: number | null; costCoverage: number | null; orders: number;
}
/**
 * One period's money, every line defined once: collected = gross − discounts + shipping − refunds; VAT is the 15/115
 * share of what was collected (owed to ZATCA, not the merchant's); net revenue = collected − VAT − payment fees.
 * Estimated gross profit only when at least 80% of units sold have a cost.
 */
export function financeFigures(x: Pick<Inputs, 'orders' | 'txs' | 'products'>, r: Range): FinanceFigures {
  const os = ordersIn(x.orders, r);
  const gross = sum(os, subtotal);
  const discounts = sum(os, (o) => o.discount ?? 0);
  const shipping = sum(os, (o) => o.fee);
  const ledgerOk = r.from >= LEDGER_START;
  const tx = (type: string) => sum(x.txs.filter((t) => t.type === type && inRange(t.saleDay, r)), (t) => t.amount);
  const refunds = ledgerOk ? tx('refund') : null;
  const fees = ledgerOk ? tx('fee') : null;
  const collected = gross - discounts + shipping - (refunds ?? 0);
  const vat = Math.round((collected * 15) / 115);
  const net = collected - vat - (fees ?? 0);
  let units = 0, costed = 0, cogs = 0;
  for (const o of os) for (const i of o.items) {
    units += i.qty;
    const p = x.products.find((pp) => pp.id === productIdForSku(i.sku));
    if (p?.cost != null) { costed += i.qty; cogs += i.qty * p.cost; }
  }
  const costCoverage = units ? Math.round((costed * 100) / units) : null;
  const enough = (costCoverage ?? 0) >= 80;
  return { gross, discounts, shipping, refunds, collected, vat, fees, net, cogs: enough ? cogs : null, profit: enough ? net - cogs : null, costCoverage, orders: os.length };
}

export const FIN_LINES: { id: keyof FinanceFigures; label: L; hint: L; sign: '+' | '−' | '='; invert?: boolean; href?: (q: Record<string, string | undefined>) => string; act?: L }[] = [
  { id: 'gross', sign: '+', label: l('إجمالي المبيعات', 'Gross sales'), hint: l('سعر المنتجات × الكمية في الطلبات المدفوعة، شامل الضريبة، قبل الخصم. بلا الشحن.', 'Product price × quantity in paid orders, VAT included, before discounts. Shipping excluded.'), href: (q) => ana({ ...q, report: 'sales' }), act: l('المبيعات', 'Sales') },
  { id: 'discounts', sign: '−', invert: true, label: l('الخصومات', 'Discounts'), hint: l('خصومات الكوبونات والعروض على الطلبات نفسها.', 'Coupon and offer discounts on the same orders.'), href: (q) => ana({ ...q, report: 'coupons' }), act: l('الكوبونات', 'Coupons') },
  { id: 'shipping', sign: '+', label: l('الشحن المحصّل', 'Shipping charged'), hint: l('رسوم الشحن التي دفعها العملاء. ليست تكلفة الناقل.', 'Shipping fees customers paid. Not the carrier’s cost.') },
  { id: 'refunds', sign: '−', invert: true, label: l('الاستردادات', 'Refunds'), hint: l('مبالغ أُعيدت للعملاء في السجل المالي لأيام الفترة. السجل يبدأ 1 نوفمبر؛ قبله «لا بيانات».', 'Money returned to customers in the ledger for the period. The ledger starts 1 Nov; before that: no data.'), href: (q) => ana({ ...q, report: 'returns' }), act: l('الأسباب', 'Reasons') },
  { id: 'collected', sign: '=', label: l('المحصّل من العملاء', 'Collected from customers'), hint: l('الإجمالي − الخصومات + الشحن − الاستردادات.', 'Gross − discounts + shipping − refunds.') },
  { id: 'vat', sign: '−', label: l('ضريبة القيمة المضافة', 'VAT'), hint: l('15/115 من المحصّل. تُسدَّد للهيئة، وليست من إيرادك.', '15/115 of what was collected. Owed to ZATCA; not your revenue.') },
  { id: 'fees', sign: '−', invert: true, label: l('رسوم الدفع', 'Payment fees'), hint: l('رسوم المعالجة في السجل المالي لأيام الفترة (نسبة اختبار).', 'Processing fees in the ledger for the period (test rate).'), href: () => dash('finance', { tab: 'transactions' }), act: l('الحركات', 'Transactions') },
  { id: 'net', sign: '=', label: l('صافي الإيراد', 'Net revenue'), hint: l('المحصّل − الضريبة − رسوم الدفع. قبل تكلفة البضاعة والمصاريف؛ ليس ربحًا.', 'Collected − VAT − payment fees. Before cost of goods and expenses; not profit.') },
  { id: 'cogs', sign: '−', invert: true, label: l('تكلفة البضاعة (تقديرية)', 'Cost of goods (estimate)'), hint: l('تكلفة الوحدة × الكمية من بطاقة المنتج. تظهر فقط إذا كانت التكلفة مسجلة لـ80% من القطع على الأقل.', 'Unit cost × quantity from the product. Shown only when at least 80% of units have a cost.'), href: () => dash('products'), act: l('أضف التكاليف', 'Add costs') },
  { id: 'profit', sign: '=', label: l('ربح إجمالي تقديري', 'Estimated gross profit'), hint: l('صافي الإيراد − تكلفة البضاعة. لا يشمل الإعلانات والرواتب والإيجار.', 'Net revenue − cost of goods. Excludes ads, salaries and rent.') },
];

export function financeReport(x: Inputs, r: Range, c: Range | null, q: Record<string, string | undefined> = {}): Report {
  const a = financeFigures(x, r);
  const b = c && bookCovers(x.orders, c) ? financeFigures(x, c) : null;
  const pick = (f: FinanceFigures | null, id: keyof FinanceFigures) => (f ? (f[id] as number | null) : null);
  const metrics = (['gross', 'collected', 'vat', 'net'] as const).map((id) => {
    const d = FIN_LINES.find((z) => z.id === id)!;
    return metric(id, d.label, d.hint, 'money', pick(a, id), pick(b, id), d.invert);
  });
  const statement: Table = {
    id: 'finance-statement', title: l('من المبيعات إلى صافي الإيراد', 'From sales to net revenue'),
    hint: l('كل سطر بتعريفه. الإشارة تبيّن هل يُضاف أو يُطرح.', 'Every line with its definition. The sign shows whether it adds or subtracts.'),
    cols: [
      { key: 'line', label: l('البند', 'Line'), unit: 'text' },
      { key: 'sign', label: l('', ''), unit: 'text', end: true },
      { key: 'value', label: l('الفترة', 'Period'), unit: 'money', end: true },
      { key: 'prev', label: l('المقارنة', 'Comparison'), unit: 'money', end: true, hideOnPhone: true },
      { key: 'change', label: l('التغير', 'Change'), unit: 'delta', end: true, hideOnPhone: true },
      { key: 'go', label: l('إجراء', 'Action'), unit: 'action', end: true },
    ],
    rows: FIN_LINES.map((d) => {
      const v = pick(a, d.id), p = pick(b, d.id);
      return {
        line: d.label, sign: d.sign, value: v, prev: p, change: pct(v, p), _hint: d.hint,
        // «Add costs» only while the estimate is hidden for missing costs.
        ...(d.href && d.act && !(d.id === 'cogs' && v !== null) ? { go: d.act, '_href:go': d.href(q) } : { go: null }), _strong: d.sign === '=' ? 1 : 0,
      };
    }),
    empty: l('لا طلبات في الفترة', 'No orders in this period'),
  };
  const notes: L[] = [];
  if (a.refunds === null) notes.push(l('الاستردادات والرسوم: «لا بيانات» قبل بداية السجل المالي (1 نوفمبر)، فالمحصّل والصافي هنا قبل الاستردادات والرسوم.', 'Refunds and fees: no data before the ledger starts (1 Nov), so collected and net here are before refunds and fees.'));
  if (a.cogs === null) notes.push(l(`التكلفة والربح التقديري غير معروضين: التكلفة مسجلة لـ${a.costCoverage ?? 0}% من القطع (المطلوب 80%).`, `Cost and estimated profit not shown: cost is recorded for ${a.costCoverage ?? 0}% of units (80% needed).`));
  return { id: 'finance', metrics, tables: [statement], notes, source: l('دفتر الطلبات والسجل المالي', 'Order book and ledger') };
}

/* ---------- Search ---------- */

/** Whether an active online product matches every word of the term now (name, category or tags, either language). */
export function matchesNow(term: string, products: Product[]): number {
  const words = normTerm(term).split(' ').filter(Boolean);
  if (!words.length) return 0;
  return products.filter((p) => p.status === 'active' && p.channels.online && words.every((w) => normTerm([p.name.ar, p.name.en, p.category.ar, p.category.en, ...(p.tags ?? [])].join(' ')).includes(w))).length;
}

export interface TermRow { term: string; raw: string; count: number; prev: number | null; zero: number; lastResults: number; lastDay: string }
export function termStats(list: SearchEvent[], r: Range, c: Range | null): TermRow[] {
  const m = new Map<string, TermRow>();
  for (const e of list) {
    if (!inRange(e.day, r)) continue;
    const row = m.get(e.term) ?? { term: e.term, raw: e.raw, count: 0, prev: c ? 0 : null, zero: 0, lastResults: e.results, lastDay: e.day };
    row.count++;
    if (e.results === 0) row.zero++;
    if (e.day >= row.lastDay) { row.lastDay = e.day; row.lastResults = e.results; row.raw = e.raw; }
    m.set(e.term, row);
  }
  if (c) for (const e of list) if (inRange(e.day, c) && m.has(e.term)) m.get(e.term)!.prev! += 1;
  return [...m.values()].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

export function searchReport(x: Inputs, r: Range, c: Range | null, q: Record<string, string | undefined> = {}): Report {
  const list = x.searches ?? [];
  const seedStart = list.reduce((mm, e) => (e.day < mm ? e.day : mm), TODAY);
  const cOk = !!c && c.from >= seedStart;
  const inR = list.filter((e) => inRange(e.day, r));
  const inC = cOk ? list.filter((e) => inRange(e.day, c)) : null;
  const zero = (es: SearchEvent[]) => es.filter((e) => e.results === 0).length;
  const rows = termStats(list, r, cOk ? c : null);
  const redirects = x.redirects ?? [];
  const metrics = [
    metric('searches', l('عمليات البحث', 'Searches'), l('بحث استقر عليه المتسوق في المتجر (لا يُحسب كل حرف). البحث نفسه مرتين متتاليتين في اليوم يُحسب مرة.', 'Searches a shopper settled on in the store (not every keystroke). The same term twice in a row on a day counts once.'), 'count', inR.length, inC?.length ?? null),
    metric('terms', l('كلمات مختلفة', 'Distinct terms'), l('بعد توحيد الهمزات والتاء المربوطة والحروف الكبيرة والمسافات.', 'After unifying hamza, ta marbuta, case and spaces.'), 'count', rows.length, inC ? new Set(inC.map((e) => e.term)).size : null),
    metric('zeroRate', l('بحث بلا نتائج', 'Searches with no results'), l('نسبة عمليات البحث التي لم يرَ فيها المتسوق أي منتج.', 'Share of searches where the shopper saw no product.'), 'percent', ratio(zero(inR), inR.length), inC ? ratio(zero(inC), inC.length) : null, true),
    metric('lost', l('كلمات تحتاج منتجًا أو توجيهًا', 'Terms needing a product or redirect'), l('كلمات آخر بحث فيها بلا نتائج، ولا تجد منتجًا الآن، ولا توجيه لها.', 'Terms whose last search found nothing, that match no product now and have no redirect.'), 'count',
      rows.filter((t) => t.lastResults === 0 && !matchesNow(t.term, x.products) && !redirects.some((d) => d.term === t.term)).length, null, true),
  ];
  const actionFor = (t: TermRow): Record<string, Cell> => {
    if (t.lastResults > 0) return {};
    if (redirects.some((d) => d.term === t.term) || matchesNow(t.term, x.products)) return {};
    return { go: l('أنشئ منتجًا أو وجّه', 'Create product or redirect'), '_href:go': ana({ ...q, report: 'search', fix: t.term }) };
  };
  const top: Table = {
    id: 'search-top', title: l('الأكثر بحثًا', 'Most searched'), hint: l('مرتبة بعدد عمليات البحث في الفترة. «النتائج» = ما رآه المتسوق في آخر بحث.', 'Ranked by searches in the period. “Results” = what the shopper saw on the last search.'),
    cols: [
      { key: 'term', label: l('الكلمة', 'Term'), unit: 'text' },
      { key: 'count', label: l('مرات البحث', 'Searches'), unit: 'count', end: true },
      { key: 'share', label: l('الحصة', 'Share'), unit: 'percent', end: true, hideOnPhone: true },
      { key: 'change', label: l('التغير', 'Change'), unit: 'delta', end: true, hideOnPhone: true },
      { key: 'results', label: l('النتائج', 'Results'), unit: 'count', end: true },
      { key: 'go', label: l('إجراء', 'Action'), unit: 'action', end: true },
    ],
    rows: rows.slice(0, 25).map((t) => ({ term: t.raw, count: t.count, share: ratio(t.count, inR.length), change: pct(t.count, t.prev), results: t.lastResults, go: null, ...actionFor(t) })),
    empty: l('لا عمليات بحث في الفترة', 'No searches in this period'),
  };
  const zeroRows = rows.filter((t) => t.zero > 0 && t.lastResults === 0);
  const noRes: Table = {
    id: 'search-zero', title: l('بحثوا ولم يجدوا', 'Searched, found nothing'), hint: l('كلمات آخر بحث فيها بلا نتائج. «الآن» يعيد الفحص على كتالوجك الحالي.', 'Terms whose last search found nothing. “Now” re-checks your current catalogue.'),
    cols: [
      { key: 'term', label: l('الكلمة', 'Term'), unit: 'text' },
      { key: 'count', label: l('مرات البحث', 'Searches'), unit: 'count', end: true },
      { key: 'last', label: l('آخر بحث', 'Last searched'), unit: 'text', end: true, hideOnPhone: true },
      { key: 'now', label: l('الآن', 'Now'), unit: 'text', end: true },
      { key: 'go', label: l('إجراء', 'Action'), unit: 'action', end: true },
    ],
    rows: zeroRows.map((t) => {
      const red = redirects.find((d) => d.term === t.term);
      const n = matchesNow(t.term, x.products);
      const now = red ? l(`موجّه إلى ${red.target.name.ar}`, `Redirected to ${red.target.name.en}`) : n ? l(`يجد ${n} منتج الآن`, `Finds ${n} now`) : l('لا يجد شيئًا', 'Still nothing');
      return { term: t.raw, count: t.count, last: t.lastDay, now, go: red ? l('عدّل التوجيه', 'Edit redirect') : n ? null : l('أنشئ منتجًا أو وجّه', 'Create product or redirect'), ...(red || !n ? { '_href:go': ana({ ...q, report: 'search', fix: t.term }) } : {}) };
    }),
    empty: l('كل عمليات البحث في الفترة وجدت منتجات', 'Every search in this period found products'),
  };
  return {
    id: 'search', metrics, tables: [noRes, top],
    notes: list.some((e) => e.seed) ? [l('السجل قبل اليوم بيانات تجريبية؛ عمليات البحث في متجرك خلال هذه الجلسة تُضاف إليه.', 'History before today is demo data; searches in your store during this session are added to it.')] : [],
    source: l('بحث المتسوقين في المتجر الإلكتروني', 'Shopper searches in the online store'),
  };
}

/* ---------- Returns and refunds ---------- */

export type ReturnReason = 'size' | 'damaged' | 'notAsDescribed' | 'changedMind' | 'late' | 'other';
export const RETURN_REASONS: ReturnReason[] = ['size', 'damaged', 'notAsDescribed', 'changedMind', 'late', 'other'];
export const REASON_LABEL: Record<ReturnReason, L> = {
  size: l('مقاس غير مناسب', 'Wrong size'), damaged: l('تالف أو معيب', 'Damaged or faulty'), notAsDescribed: l('غير مطابق للوصف', 'Not as described'),
  changedMind: l('غيّر رأيه', 'Changed mind'), late: l('تأخر التوصيل', 'Arrived late'), other: l('سبب آخر', 'Other'),
};
/** Reasons are stored as keys (dashboard refunds) or bilingual text (storefront returns); read both. */
export function reasonOf(s: string): ReturnReason {
  const t = s.toLowerCase();
  if (/size|مقاس/.test(t)) return 'size';
  if (/damag|تالف|معيب|fault/.test(t)) return 'damaged';
  if (/described|not_as|مطابق/.test(t)) return 'notAsDescribed';
  if (/mind|changed|رأي/.test(t)) return 'changedMind';
  if (/late|تأخ/.test(t)) return 'late';
  return 'other';
}

export interface ReturnRecord { ref: string; day: string; sku: string; units: number; amount: number; reason: ReturnReason; kind: 'refund' | 'return'; seed?: boolean }
const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const SEED_REASONS: ReturnReason[] = ['size', 'size', 'size', 'damaged', 'notAsDescribed', 'notAsDescribed', 'changedMind', 'late'];
/**
 * Returns and refunds by line: what this session recorded on orders (refunds with a reason, storefront return
 * requests) plus a seeded history on about 3% of older paid orders, marked as demo data.
 */
export function returnRecords(orders: Order[]): ReturnRecord[] {
  const out: ReturnRecord[] = [];
  for (const o of orders) {
    const day = orderDay(o);
    for (const rf of o.refunds) {
      if (rf.status === 'failed') continue;
      const lines = rf.qty.map((n, i) => ({ n, i })).filter((z) => z.n > 0);
      const share = lines.length ? Math.round(rf.amount / lines.length) : rf.amount;
      for (const z of lines.length ? lines : [{ n: 0, i: 0 }]) out.push({ ref: o.ref, day, sku: o.items[z.i]?.sku ?? '', units: z.n, amount: share, reason: reasonOf(rf.reason), kind: 'refund' });
    }
    for (const rt of o.returns ?? []) {
      if (rt.stage === 'rejected' || rt.refundId) continue;
      for (const ln of rt.lines) out.push({ ref: o.ref, day, sku: o.items[ln.idx]?.sku ?? '', units: ln.qty, amount: (o.items[ln.idx]?.unit ?? 0) * ln.qty, reason: reasonOf(ln.reason), kind: 'return' });
    }
    if (!o.refunds.length && !(o.returns ?? []).length && o.pay !== 'failed' && o.hoursAgo > 72 && hash(o.ref) % 100 < 3) {
      const h = hash(`${o.ref}r`);
      const it = o.items[h % o.items.length];
      out.push({ ref: o.ref, day, sku: it.sku, units: 1, amount: it.unit, reason: SEED_REASONS[h % SEED_REASONS.length], kind: 'refund', seed: true });
    }
  }
  return out;
}

export function returnsReport(x: Inputs, r: Range, c: Range | null): Report {
  const all = returnRecords(x.orders);
  const cOk = bookCovers(x.orders, c);
  const recs = (rg: Range) => all.filter((z) => inRange(z.day, rg));
  const a = recs(r), b = cOk && c ? recs(c) : null;
  const paid = (rg: Range) => ordersIn(x.orders, rg).length;
  const ordersWith = (rs: ReturnRecord[]) => new Set(rs.map((z) => z.ref)).size;
  const topReason = (rs: ReturnRecord[]) => RETURN_REASONS.map((k) => ({ k, n: sum(rs.filter((z) => z.reason === k), (z) => Math.max(1, z.units)) })).sort((p, q2) => q2.n - p.n)[0];
  const top = topReason(a);
  const metrics = [
    metric('rate', l('معدل الإرجاع', 'Return rate'), l('الطلبات التي فيها استرداد أو طلب إرجاع ÷ الطلبات المدفوعة في الفترة.', 'Orders with a refund or a return request ÷ paid orders in the period.'), 'percent', ratio(ordersWith(a), paid(r)), b && c ? ratio(ordersWith(b), paid(c)) : null, true),
    metric('amount', l('قيمة المرتجع والمسترد', 'Returned and refunded value'), l('قيمة القطع المرتجعة أو المبالغ المستردة بسعر البيع شامل الضريبة.', 'Value of returned units or refunded amounts at the selling price, VAT included.'), 'money', sum(a, (z) => z.amount), b ? sum(b, (z) => z.amount) : null, true),
    metric('units', l('القطع', 'Units'), l('القطع المرتجعة أو المستردة. الاسترداد بلا قطع (مثل الشحن) لا يُحسب هنا.', 'Units returned or refunded. A refund with no units (e.g. shipping) is not counted here.'), 'count', sum(a, (z) => z.units), b ? sum(b, (z) => z.units) : null, true),
    metric('top', l('السبب الأول', 'Top reason'), l(`نسبة القطع بسبب «${REASON_LABEL[top?.k ?? 'other'].ar}» من كل المرتجع.`, `Share of units for “${REASON_LABEL[top?.k ?? 'other'].en}” of everything returned.`), 'percent', a.length && top ? ratio(top.n, sum(a, (z) => Math.max(1, z.units))) : null, null, true),
  ];
  const byReason: Table = {
    id: 'returns-reason', title: l('حسب السبب', 'By reason'), hint: l('كل سطر مرتجع أو مسترد بسببه المسجل.', 'Every returned or refunded line by its recorded reason.'),
    cols: [
      { key: 'reason', label: l('السبب', 'Reason'), unit: 'text' },
      { key: 'units', label: l('القطع', 'Units'), unit: 'count', end: true },
      { key: 'amount', label: l('القيمة', 'Value'), unit: 'money', end: true },
      { key: 'share', label: l('الحصة', 'Share'), unit: 'percent', end: true, hideOnPhone: true },
      { key: 'prev', label: l('المقارنة', 'Comparison'), unit: 'count', end: true, hideOnPhone: true },
    ],
    rows: RETURN_REASONS.map((k) => {
      const rs = a.filter((z) => z.reason === k);
      return { reason: REASON_LABEL[k], units: sum(rs, (z) => z.units), amount: sum(rs, (z) => z.amount), share: ratio(sum(rs, (z) => z.units), sum(a, (z) => z.units)), prev: b ? sum(b.filter((z) => z.reason === k), (z) => z.units) : null, _n: rs.length };
    }).filter((row) => (row._n as number) > 0 || (row.prev ?? 0) > 0),
    empty: l('لا مرتجعات ولا استردادات في الفترة', 'No returns or refunds in this period'),
  };
  const sold = new Map<string, number>();
  for (const o of ordersIn(x.orders, r)) for (const i of o.items) { const pid = productIdForSku(i.sku) ?? i.sku; sold.set(pid, (sold.get(pid) ?? 0) + i.qty); }
  const byProduct = new Map<string, ReturnRecord[]>();
  for (const z of a) { const pid = productIdForSku(z.sku) ?? z.sku; byProduct.set(pid, [...(byProduct.get(pid) ?? []), z]); }
  const prodTable: Table = {
    id: 'returns-product', title: l('حسب المنتج', 'By product'), hint: l('معدل الإرجاع = القطع المرتجعة ÷ القطع المباعة في الفترة.', 'Return rate = units returned ÷ units sold in the period.'),
    cols: [
      { key: 'product', label: l('المنتج', 'Product'), unit: 'product' },
      { key: 'units', label: l('مرتجع', 'Returned'), unit: 'count', end: true },
      { key: 'sold', label: l('مباع', 'Sold'), unit: 'count', end: true, hideOnPhone: true },
      { key: 'rate', label: l('المعدل', 'Rate'), unit: 'percent', end: true },
      { key: 'reason', label: l('السبب الأول', 'Top reason'), unit: 'text', hideOnPhone: true },
      { key: 'go', label: l('إجراء', 'Action'), unit: 'action', end: true },
    ],
    rows: [...byProduct.entries()].map(([pid, rs]) => {
      const p = x.products.find((pp) => pp.id === pid);
      const units = sum(rs, (z) => z.units);
      const t = topReason(rs);
      return {
        product: p?.name ?? pid, _pid: pid, units, sold: sold.get(pid) ?? 0, rate: ratio(units, sold.get(pid) ?? 0), reason: t ? REASON_LABEL[t.k] : null,
        go: p ? (t?.k === 'size' ? l('راجع المقاسات', 'Check sizing') : t?.k === 'notAsDescribed' ? l('راجع الوصف', 'Check description') : l('افتح المنتج', 'Open product')) : null,
        ...(p ? { '_href:go': dash(`products/${pid}`) } : {}),
      };
    }).sort((p, q2) => (q2.units as number) - (p.units as number)),
    empty: l('لا مرتجعات في الفترة', 'No returns in this period'),
  };
  return {
    id: 'returns', metrics, tables: [byReason, prodTable],
    notes: [l('الأسباب من طلبات الإرجاع في المتجر ومن نافذة الاسترداد. السجل الأقدم بيانات تجريبية.', 'Reasons come from store return requests and the refund dialog. Older history is demo data.')],
    source: l('الطلبات والمرتجعات والاستردادات', 'Orders, returns and refunds'),
  };
}

/* ---------- Notify-me and wishlist demand ---------- */

const availableNow = (levels: Level[], skus: string[]) => levels.filter((v) => skus.includes(v.sku)).reduce((s, v) => s + Math.max(0, available(v)), 0);

export function demandReport(x: Inputs, r: Range, c: Range | null, q: Record<string, string | undefined> = {}): Report {
  const req = x.notify ?? [];
  const wish = x.wishes ?? [];
  const levels = x.levels ?? [];
  const firstDay = [...req.map((z) => z.day), ...wish.map((z) => z.day)].reduce((m, d) => (d < m ? d : m), TODAY);
  const cOk = !!c && c.from >= firstDay;
  const n = (rg: Range, xs: { day: string }[]) => xs.filter((z) => inRange(z.day, rg)).length;
  const waiting = req.filter((z) => z.state === 'waiting');
  const skusOfReq = (z: NotifyRequest) => { const p = x.products.find((pp) => pp.id === z.productId); return z.sku ? [z.sku] : p ? skusOf(p) : []; };
  const groups = new Map<string, NotifyRequest[]>();
  for (const z of req) { const k = `${z.productId}|${z.sku}`; groups.set(k, [...(groups.get(k) ?? []), z]); }
  const notifyRows = [...groups.entries()].map(([k, zs]) => {
    const [pid, sku] = k.split('|');
    const p = x.products.find((pp) => pp.id === pid);
    const w = zs.filter((z) => z.state === 'waiting').length;
    const av = p?.type === 'digital' ? null : availableNow(levels, skusOfReq(zs[0]));
    const canAlert = w > 0 && (av === null || av > 0);
    return {
      product: p?.name ?? pid, _pid: pid, sku: sku || l('أي خيار', 'Any option'), waiting: w, period: n(r, zs), prev: cOk && c ? n(c, zs) : null, available: av,
      go: w === 0 ? null : canAlert ? l('أرسل تنبيه التوفر', 'Send back-in-stock alert') : l('أعد التخزين', 'Restock'),
      ...(w === 0 ? {} : { '_href:go': canAlert ? ana({ ...q, report: 'demand', alert: k }) : dash('inventory', { q: sku || p?.sku }) }),
    };
  }).sort((a, b) => b.waiting - a.waiting || b.period - a.period);
  const wishBy = new Map<string, WishEvent[]>();
  for (const z of wish) wishBy.set(z.productId, [...(wishBy.get(z.productId) ?? []), z]);
  const wishRows = [...wishBy.entries()].map(([pid, zs]) => {
    const p = x.products.find((pp) => pp.id === pid);
    const add = (rg: Range) => zs.filter((z) => z.kind === 'add' && inRange(z.day, rg)).length;
    const rem = zs.filter((z) => z.kind === 'remove' && inRange(z.day, r)).length;
    const av = p && p.type !== 'digital' ? availableNow(levels, skusOf(p)) : null;
    return {
      product: p?.name ?? pid, _pid: pid, adds: add(r), removes: rem, net: add(r) - rem, prev: cOk && c ? add(c) : null, change: cOk && c ? pct(add(r), add(c)) : null, available: av,
      go: p ? (av === 0 ? l('أعد التخزين', 'Restock') : l('افتح المنتج', 'Open product')) : null, ...(p ? { '_href:go': av === 0 ? dash('inventory', { q: p.sku }) : dash(`products/${pid}`) } : {}),
    };
  }).filter((row) => row.adds > 0 || row.removes > 0).sort((a, b) => b.adds - a.adds);
  const metrics = [
    metric('waiting', l('بانتظار التوفر الآن', 'Waiting for stock now'), l('طلبات «أعلمني عند التوفر» التي لم يُرسل لها تنبيه بعد، لكل الفترات.', '«Notify me» requests not yet alerted, all time.'), 'count', waiting.length, null),
    metric('newNotify', l('طلبات «أعلمني» جديدة', 'New «notify me» requests'), l('طلبات سجّلها المتسوقون في أيام الفترة على منتجات نافدة.', 'Requests shoppers made on sold-out products during the period.'), 'count', n(r, req), cOk && c ? n(c, req) : null),
    metric('wishAdds', l('إضافات المفضلة', 'Wishlist adds'), l('مرات إضافة منتج للمفضلة في الفترة (الحذف لا يُطرح هنا).', 'Times a product was added to a wishlist in the period (removals not subtracted).'), 'count', wish.filter((z) => z.kind === 'add' && inRange(z.day, r)).length, cOk && c ? wish.filter((z) => z.kind === 'add' && inRange(z.day, c)).length : null),
    metric('readyToAlert', l('جاهز للتنبيه', 'Ready to alert'), l('منتجات عليها انتظار وعادت متاحة: أرسل التنبيه ليشتري المنتظرون.', 'Products with people waiting that are back in stock: send the alert so they can buy.'), 'count', notifyRows.filter((row) => row.waiting > 0 && (row.available === null || (row.available ?? 0) > 0)).length, null),
  ];
  return {
    id: 'demand', metrics,
    tables: [
      {
        id: 'demand-notify', title: l('أعلمني عند التوفر', 'Notify me when available'), hint: l('لكل SKU: المنتظرون الآن، وطلبات الفترة، والمتاح الآن في كل المستودعات.', 'Per SKU: people waiting now, requests in the period, and available now across warehouses.'),
        cols: [
          { key: 'product', label: l('المنتج', 'Product'), unit: 'product' },
          { key: 'sku', label: l('SKU', 'SKU'), unit: 'text', hideOnPhone: true },
          { key: 'waiting', label: l('منتظرون', 'Waiting'), unit: 'count', end: true },
          { key: 'period', label: l('في الفترة', 'In period'), unit: 'count', end: true, hideOnPhone: true },
          { key: 'available', label: l('المتاح الآن', 'Available now'), unit: 'count', end: true },
          { key: 'go', label: l('إجراء', 'Action'), unit: 'action', end: true },
        ],
        rows: notifyRows, empty: l('لا طلبات «أعلمني»', 'No «notify me» requests'),
      },
      {
        id: 'demand-wish', title: l('المفضلة', 'Wishlists'), hint: l('إضافة وحذف لكل منتج في الفترة، والمقارنة بإضافات فترة المقارنة.', 'Adds and removes per product in the period, compared with adds in the comparison period.'),
        cols: [
          { key: 'product', label: l('المنتج', 'Product'), unit: 'product' },
          { key: 'adds', label: l('إضافات', 'Adds'), unit: 'count', end: true },
          { key: 'removes', label: l('حذف', 'Removes'), unit: 'count', end: true, hideOnPhone: true },
          { key: 'change', label: l('التغير', 'Change'), unit: 'delta', end: true, hideOnPhone: true },
          { key: 'available', label: l('المتاح الآن', 'Available now'), unit: 'count', end: true, hideOnPhone: true },
          { key: 'go', label: l('إجراء', 'Action'), unit: 'action', end: true },
        ],
        rows: wishRows, empty: l('لا نشاط في المفضلة في الفترة', 'No wishlist activity in this period'),
      },
    ],
    notes: [l('لا نحفظ هنا بيانات المتسوقين؛ التنبيه يُرسل لمن طلبه من نظام الرسائل. السجل الأقدم بيانات تجريبية.', 'No shopper details are kept here; the alert goes to those who asked through messaging. Older history is demo data.')],
    source: l('المتجر الإلكتروني: «أعلمني» والمفضلة', 'Online store: «notify me» and wishlists'),
  };
}

/* ---------- Sub-statuses ---------- */

export const PARENT_LABEL: Record<SubStatus['parent'], L> = { awaitingPay: l('بانتظار الدفع', 'Awaiting payment'), processing: l('قيد التجهيز', 'Processing'), ready: l('جاهز للشحن', 'Ready to ship') };
const H = 3600000;
/** Order sub-statuses: orders carrying each now (subCounts rules: live sub only), how long they have sat, and how often it was set in the period. */
export function substatusReport(x: Inputs, r: Range, c: Range | null, now = Date.now()): Report {
  const subs = x.subs ?? [];
  const live = x.orders.map((o) => ({ o, s: liveSub(o) })).filter((z): z is { o: Order; s: NonNullable<ReturnType<typeof liveSub>> } => !!z.s);
  const dayOf = (at: number) => new Date(at + 3 * H).toISOString().slice(0, 10);
  const setIn = (rg: Range) => sum(x.orders, (o) => (o.activity ?? []).filter((a) => a.kind === 'subStatusSet' && inRange(dayOf(a.at), rg)).length);
  const reported = subs.filter((s) => s.inReports);
  const ages = live.filter((z) => reported.some((s) => s.id === z.s.id)).map((z) => (now - z.s.at) / H);
  const metrics = [
    metric('now', l('طلبات في حالة فرعية الآن', 'Orders in a sub-status now'), l('طلبات تحمل حالة فرعية محسوبة في التقارير، وما زالت في حالتها الرئيسية.', 'Orders carrying a sub-status counted in reports, still in its main state.'), 'count', ages.length, null),
    metric('oldest', l('أقدم انتظار (ساعات)', 'Longest wait (hours)'), l('منذ وُضعت الحالة الفرعية على أقدم طلب ما زال فيها.', 'Since the sub-status was set on the oldest order still in it.'), 'count', ages.length ? Math.round(Math.max(...ages)) : null, null, true),
    metric('set', l('مرات التعيين في الفترة', 'Times set in the period'), l('كل تعيين لحالة فرعية (يدويًا أو بقاعدة) في أيام الفترة، من سجل الطلب.', 'Every time a sub-status was set (by hand or a rule) on the days of the period, from the order log.'), 'count', setIn(r), c ? setIn(c) : null),
    metric('defined', l('حالات فرعية محسوبة', 'Sub-statuses counted'), l('الحالات الفرعية غير المؤرشفة التي اخترت أن تُحسب في التقارير.', 'Non-archived sub-statuses you chose to count in reports.'), 'count', reported.filter((s) => !s.archived).length, null),
  ];
  const rows = reported.map((s) => {
    const mine = live.filter((z) => z.s.id === s.id);
    const hrs = mine.map((z) => (now - z.s.at) / H);
    return {
      name: s.name, parent: PARENT_LABEL[s.parent], now: mine.length, avg: hrs.length ? Math.round(sum(hrs, (h) => h) / hrs.length) : null,
      stuck: mine.filter((z) => mainState(z.o) === s.parent && (now - z.s.at) / H > 48).length,
      go: mine.length ? l('افتح الطلبات', 'Open orders') : null, ...(mine.length ? { '_href:go': dash('orders', { sub: s.id }) } : {}),
    };
  });
  return {
    id: 'substatus', metrics,
    tables: [{
      id: 'substatus-list', title: l('حسب الحالة الفرعية', 'By sub-status'), hint: l('العدد الآن من الطلبات نفسها التي تعدّها صفحة حالات الطلب.', 'Counts now from the same orders the order-statuses page counts.'),
      cols: [
        { key: 'name', label: l('الحالة الفرعية', 'Sub-status'), unit: 'text' },
        { key: 'parent', label: l('تحت', 'Under'), unit: 'text', hideOnPhone: true },
        { key: 'now', label: l('الآن', 'Now'), unit: 'count', end: true },
        { key: 'avg', label: l('متوسط الانتظار (س)', 'Avg wait (h)'), unit: 'count', end: true, hideOnPhone: true },
        { key: 'stuck', label: l('أكثر من 48 ساعة', 'Over 48 h'), unit: 'count', end: true, hideOnPhone: true },
        { key: 'go', label: l('إجراء', 'Action'), unit: 'action', end: true },
      ],
      rows, empty: l('لا حالات فرعية محسوبة في التقارير', 'No sub-statuses counted in reports'),
    }],
    notes: [
      ...(subs.some((s) => !s.inReports) ? [l('بعض الحالات الفرعية مستبعدة من التقارير باختيارك (ملاحظة عمل داخلية).', 'Some sub-statuses are excluded from reports by your choice (internal working notes).')] : []),
      ...(ages.length === 0 ? [l('لا يحمل أي طلب حالة فرعية الآن. عيّنها من الطلبات أو بقاعدة تشغيل.', 'No order carries a sub-status now. Set one from Orders or with an operating rule.')] : []),
    ],
    source: l('الطلبات وسجلها', 'Orders and their log'),
  };
}

export type { SearchRedirect };
