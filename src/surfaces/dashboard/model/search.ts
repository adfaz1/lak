// Global search across the store: typed commands, orders, products, customers, tools and the settings themselves.
// Pure: the shell passes the current data and renders the groups. Arabic is normalised (hamza,
// ta marbuta, alef maqsura, diacritics) and Arabic-Indic digits are accepted.
import { total, type Order, type L } from '../../merchant/domain';
import type { Product } from '../../merchant/catalog';
import type { Customer } from '../../merchant/workspace';
import { can, type Action, type Role } from '../../merchant/perms';
import { couponQuery, type CouponPrefill } from '../../merchant/prefill';
import { TOOLS, canUseTool, toolById, type Tool } from './tools';
import { SETTING_FIELDS, type SettingField } from '../settings/fields';
import { CATEGORIES, canOpen } from '../settings/model';

export function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
}
const digits = (s: string) => norm(s).replace(/\D/g, '');

export type HitKind = 'command' | 'order' | 'product' | 'customer' | 'tool' | 'setting';
export interface Hit { kind: HitKind; id: string; title: L; sub: L; path: string; query?: Record<string, string> }
export interface SearchResult { groups: { kind: HitKind; hits: Hit[]; more: number }[]; total: number }

export interface SearchData {
  orders: Order[]; products: Product[]; customers: Customer[]; role: Role; canSee: (section: string) => boolean;
  /** Warehouses a transfer command can name («إلى جدة»); omitted = Riyadh and Jeddah. */
  locations?: { id: string; name: L; city: L }[];
}

const words = (q: string) => norm(q).split(/\s+/).filter(Boolean);
const hasAll = (hay: string, ws: string[]) => ws.every((w) => hay.includes(w));

function orderHits(orders: Order[], q: string): Hit[] {
  const ws = words(q.replace('#', ''));
  const d = digits(q);
  const scored = orders.map((o) => {
    const ref = o.ref;
    let score = 0;
    if (d && ref === d) score = 100;
    else if (d.length >= 3 && ref.includes(d)) score = 60;
    else if (hasAll(norm(`${o.customer.ar} ${o.customer.en} ${o.city.ar} ${o.city.en}`), ws)) score = 40;
    return { o, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.o.hoursAgo - b.o.hoursAgo);
  return scored.map(({ o }) => ({ kind: 'order' as const, id: o.ref, title: { ar: `#${o.ref}`, en: `#${o.ref}` }, sub: { ar: `${o.customer.ar} · ${o.city.ar}`, en: `${o.customer.en} · ${o.city.en}` }, path: `orders/${o.ref}` }));
}

function productHits(products: Product[], q: string): Hit[] {
  const ws = words(q);
  return products.filter((p) => {
    const skus = [p.sku, ...p.variants.map((v) => v.sku)].join(' ');
    return hasAll(norm(`${p.name.ar} ${p.name.en} ${skus} ${p.category.ar} ${p.category.en}`), ws);
  }).map((p) => ({ kind: 'product' as const, id: p.id, title: p.name, sub: { ar: `${p.sku} · ${p.category.ar}`, en: `${p.sku} · ${p.category.en}` }, path: `products/${p.id}` }));
}

function customerHits(customers: Customer[], q: string): Hit[] {
  const ws = words(q);
  const d = digits(q);
  return customers.filter((c) => (d.length >= 4 && digits(c.phone).includes(d)) || hasAll(norm(`${c.name.ar} ${c.name.en} ${c.email} ${c.city.ar} ${c.city.en}`), ws))
    .map((c) => ({ kind: 'customer' as const, id: c.id, title: c.name, sub: { ar: `${c.city.ar} · ${c.id}`, en: `${c.city.en} · ${c.id}` }, path: `customers/${c.id}` }));
}

export function toolHits(q: string, role: Role, tools: Tool[] = TOOLS): Hit[] {
  const ws = words(q);
  return tools.filter((x) => canUseTool(x, role) && hasAll(norm(`${x.label.ar} ${x.label.en} ${x.desc.ar} ${x.desc.en} ${x.keys}`), ws))
    .map((x) => ({ kind: 'tool' as const, id: x.id, title: x.label, sub: x.desc, path: x.path, query: x.query }));
}

/** Settings found by the label of the setting itself; only categories the role can open. */
export function settingHits(q: string, role: Role, fields: SettingField[] = SETTING_FIELDS): Hit[] {
  const ws = words(q);
  return fields.filter((x) => canOpen(role, x.cat) && hasAll(norm(`${x.label.ar} ${x.label.en} ${x.section.ar} ${x.section.en} ${x.keys}`), ws)).map((x) => {
    const cat = CATEGORIES.find((c) => c.id === x.cat)!;
    return { kind: 'setting' as const, id: x.id, title: x.label, sub: { ar: `الإعدادات · ${cat.title.ar}`, en: `Settings · ${cat.title.en}` }, path: `settings/${x.cat}`, query: { ...x.query, ...(x.focus ? { focus: x.focus } : {}) } };
  });
}

/* ---------- Commands: typed intents that open a tool prefilled ---------- */

/** A command hit. `tool` decides who may see it (canUseTool), `need` the action the tool will ask for. */
interface Intent { id: string; tool: string; need?: Action; title: L; sub: L; path: string; query?: Record<string, string> }
const has = (n: string, re: RegExp) => re.test(n);
const ref = (n: string) => n.match(/#?(\d{4,})/)?.[1] ?? null;

function couponIntent(raw: string, n: string): Intent | null {
  if (!has(n, /(كوبون|كود خصم|كود الخصم|قسيمه|coupon|promo ?code|discount code)/)) return null;
  const p: CouponPrefill = {};
  const pct = n.match(/(\d{1,2})\s*(%|٪|percent|بالميه|في الميه)/) ?? n.match(/(?:خصم|off|discount)\s*(\d{1,2})(?!\d)/);
  const sar = n.match(/(\d{1,5})\s*(ر\.?س|ريال|sar|riyals?)/);
  if (has(n, /(شحن مجاني|free ?shipping)/)) p.type = 'freeShip';
  else if (sar) { p.type = 'fixed'; p.value = sar[1]; }
  else if (pct && +pct[1] >= 1 && +pct[1] <= 90) { p.type = 'percent'; p.value = pct[1]; }
  const stop = new Set(['NEW', 'COUPON', 'CODE', 'PROMO', 'DISCOUNT', 'OFF', 'SAR', 'FREE', 'SHIPPING', 'CREATE', 'ADD', 'PERCENT', 'RIYAL', 'RIYALS']);
  const code = raw.split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).find((w) => /^[A-Z][A-Z0-9]{3,15}$/.test(w) && !stop.has(w));
  if (code) p.code = code;
  const bits: L[] = [];
  if (p.type === 'percent') bits.push({ ar: `خصم ${p.value}%`, en: `${p.value}% off` });
  if (p.type === 'fixed') bits.push({ ar: `خصم ${p.value} ر.س`, en: `SAR ${p.value} off` });
  if (p.type === 'freeShip') bits.push({ ar: 'شحن مجاني', en: 'Free shipping' });
  if (p.code) bits.push({ ar: `الكود ${p.code}`, en: `code ${p.code}` });
  const filled = Object.keys(p).length > 0;
  return {
    id: 'cmd-coupon', tool: 'coupons', need: 'marketing.manage', title: { ar: 'أنشئ كوبونًا جديدًا', en: 'Create a new coupon' },
    sub: { ar: [...bits.map((b) => b.ar), filled ? 'مسودة معبّأة تراجعها قبل الحفظ' : 'مسودة فارغة'].join(' · '), en: [...bits.map((b) => b.en), filled ? 'prefilled draft you review before saving' : 'empty draft'].join(' · ') },
    path: 'marketing/coupons/new', query: filled ? couponQuery(p) : undefined,
  };
}

function transferIntent(raw: string, n: string, data: SearchData): Intent | null {
  const skus = [...new Set(data.products.flatMap((p) => [p.sku, ...p.variants.map((v) => v.sku)]))];
  const sku = raw.split(/\s+/).map((w) => w.toUpperCase()).find((w) => skus.includes(w)) ?? null;
  const verb = has(n, /(تحويل مخزون|نقل مخزون|حول مخزون|انقل|stock transfer|transfer stock|move stock|new transfer)/) || (!!sku && has(n, /(تحويل|حول|transfer|move)/));
  if (!verb) return null;
  const locs = data.locations ?? [{ id: 'ryd', name: { ar: 'مستودع الرياض', en: 'Riyadh warehouse' }, city: { ar: 'الرياض', en: 'Riyadh' } }, { id: 'jed', name: { ar: 'مستودع جدة', en: 'Jeddah warehouse' }, city: { ar: 'جدة', en: 'Jeddah' } }];
  const to = locs.find((l) => [l.city.ar, l.city.en, l.name.ar, l.name.en].some((x) => n.includes(norm(x)))) ?? null;
  const rest = sku ? n.replace(norm(sku), ' ') : n;
  const qtyM = rest.match(/(?:^|\s)(\d{1,5})(?:\s*(?:قطع|قطعه|وحده|وحدات|units?|pcs))?(?=\s|$)/);
  const qty = qtyM ? Number(qtyM[1]) : null;
  const query: Record<string, string> = {};
  if (sku) query.sku = sku;
  if (to) query.to = to.id;
  if (sku && qty) query.qty = String(qty);
  const bits = [sku && { ar: sku, en: sku }, qty && sku && { ar: `${qty} وحدة`, en: `${qty} units` }, to && { ar: `إلى ${to.name.ar}`, en: `to ${to.name.en}` }].filter(Boolean) as L[];
  return {
    id: 'cmd-transfer', tool: 'inventory-transfers', need: 'inventory.transfer', title: { ar: 'تحويل مخزون بين المستودعات', en: 'Transfer stock between warehouses' },
    sub: { ar: [...bits.map((b) => b.ar), 'مسودة، لا تتحرك وحدات قبل «أرسل»'].join(' · '), en: [...bits.map((b) => b.en), 'draft; nothing moves until you send it'].join(' · ') },
    path: 'inventory/transfers/new', query: Object.keys(query).length ? query : undefined,
  };
}

/** Intents in either language. Order intents only appear for an order that exists. */
export function commandHits(q: string, data: SearchData): Hit[] {
  const n = norm(q);
  const raw = q.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!n) return [];
  const out: Intent[] = [];
  const order = (() => { const r = ref(n); return r ? data.orders.find((o) => o.ref === r) ?? null : null; })();
  const who = (o: Order): L => ({ ar: `${o.customer.ar} · ${(total(o) / 100).toLocaleString('en-US')} ر.س`, en: `${o.customer.en} · SAR ${(total(o) / 100).toLocaleString('en-US')}` });
  if (order && has(n, /(refund|استرداد|استرجاع مبلغ|رد مبلغ|ارجاع مبلغ)/)) out.push({ id: `cmd-refund-${order.ref}`, tool: 'orders', need: 'order.refund', title: { ar: `استرداد مبلغ للطلب #${order.ref}`, en: `Refund order #${order.ref}` }, sub: { ar: `${who(order).ar} · تراجع المبلغ قبل التأكيد`, en: `${who(order).en} · review the amount before confirming` }, path: `orders/${order.ref}`, query: { act: 'refund' } });
  else if (order && has(n, /(return|exchange|ارجاع|مرتجع|استبدال)/)) out.push({ id: `cmd-return-${order.ref}`, tool: 'orders-returns', need: 'order.fulfil', title: { ar: `إرجاع أو استبدال للطلب #${order.ref}`, en: `Return or exchange for order #${order.ref}` }, sub: who(order), path: `orders/${order.ref}`, query: { act: 'return' } });
  else if (order && has(n, /(invoice|فاتوره)/)) out.push({ id: `cmd-invoice-${order.ref}`, tool: 'orders', title: { ar: `اطبع فاتورة الطلب #${order.ref}`, en: `Print the invoice for order #${order.ref}` }, sub: { ar: `${who(order).ar} · معاينة دون إرسال للعميل`, en: `${who(order).en} · preview, nothing is sent to the customer` }, path: 'orders/print', query: { doc: 'invoice', refs: order.ref } });
  else if (order && has(n, /(order|طلب|الطلب)/)) out.push({ id: `cmd-order-${order.ref}`, tool: 'orders', title: { ar: `افتح الطلب #${order.ref}`, en: `Open order #${order.ref}` }, sub: who(order), path: `orders/${order.ref}` });

  if (has(n, /(طلب يدوي|طلب جديد|انشئ طلب|اضف طلب|manual order|new order|create order|draft order)/)) out.push({ id: 'cmd-manual-order', tool: 'orders-new', need: 'order.fulfil', title: { ar: 'أنشئ طلبًا يدويًا', en: 'Create a manual order' }, sub: { ar: 'عميل ← منتجات ← توصيل ← دفع، مسودة حتى «إنشاء»', en: 'Customer → items → delivery → payment; a draft until “Create”' }, path: 'orders/new' });
  if (has(n, /(اضف منتج|اضافه منتج|منتج جديد|انشئ منتج|add (a )?product|new product|create (a )?product)/)) out.push({ id: 'cmd-product', tool: 'product-new', need: 'product.edit', title: { ar: 'أضف منتجًا', en: 'Add a product' }, sub: { ar: 'الاسم والسعر والمتغيرات والصور، يُحفظ مسودة', en: 'Name, price, variants and images; saved as a draft' }, path: 'products/new' });
  const coupon = couponIntent(raw, n); if (coupon) out.push(coupon);
  const transfer = transferIntent(raw, n, data); if (transfer) out.push(transfer);
  if (has(n, /(حمله جديده|ارسل حمله|new campaign|send (a )?campaign)/)) out.push({ id: 'cmd-campaign', tool: 'campaigns', need: 'marketing.send', title: { ar: 'حملة جديدة', en: 'New campaign' }, sub: { ar: 'شريحة ورسالة، ومعاينة العدد والتكلفة قبل الإرسال', en: 'Segment and message, with count and cost preview before sending' }, path: 'marketing', query: { tab: 'campaigns', compose: '1' } });
  if (has(n, /(شريحه جديده|new segment)/)) out.push({ id: 'cmd-segment', tool: 'segment-new', title: { ar: 'شريحة عملاء جديدة', en: 'New customer segment' }, sub: { ar: 'قواعد بعدد مباشر', en: 'Rules with a live count' }, path: 'customers/segments/new' });
  if (has(n, /(اتمته جديده|new automation)/)) out.push({ id: 'cmd-automation', tool: 'automations', need: 'automation.manage', title: { ar: 'مسار أتمتة جديد', en: 'New automation' }, sub: { ar: 'مسودة تحتاج تجربة آمنة قبل التفعيل', en: 'A draft that needs a safe test before activation' }, path: 'automations/new' });
  if (has(n, /(توثيق|وثق|kyc|verify|verification)/)) out.push({ id: 'cmd-verify', tool: 'verification', title: { ar: 'توثيق المتجر', en: 'Verify the store' }, sub: { ar: 'الكيان والوثائق؛ التحويلات تبدأ بعد التوثيق', en: 'Entity and documents; payouts start once verified' }, path: 'settings/verification' });

  return out.filter((c) => { const t = toolById(c.tool); return (!t || canUseTool(t, data.role)) && (!c.need || can(data.role, c.need)); })
    .map((c) => ({ kind: 'command' as const, id: c.id, title: c.title, sub: c.sub, path: c.path, query: c.query }));
}

/** Grouped results, each group capped; `more` says how many were left out so the UI can offer "see all". */
export function globalSearch(q: string, data: SearchData, cap = 5): SearchResult {
  if (!norm(q)) return { groups: [], total: 0 };
  const all: [HitKind, Hit[]][] = [
    ['command', commandHits(q, data)],
    ['tool', toolHits(q, data.role)],
    ['setting', settingHits(q, data.role)],
    ['order', data.canSee('orders') ? orderHits(data.orders, q) : []],
    ['product', data.canSee('products') ? productHits(data.products, q) : []],
    ['customer', data.canSee('customers') ? customerHits(data.customers, q) : []],
  ];
  // An exact order number or a SKU-like query puts that group first.
  const d = digits(q);
  // Commands stay on top when the query reads as one («refund 10479»).
  if (d && data.orders.some((o) => o.ref === d)) all.sort((a, b) => rank(a[0]) - rank(b[0]));
  const groups = all.filter(([, h]) => h.length).map(([kind, hits]) => ({ kind, hits: hits.slice(0, cap), more: Math.max(0, hits.length - cap) }));
  return { groups, total: all.reduce((s, [, h]) => s + h.length, 0) };
}

const rank = (k: HitKind) => (k === 'command' ? -2 : k === 'order' ? -1 : 0);

/** Where "see all" goes for a group: the section's own search, keeping the query. */
export function seeAllPath(kind: HitKind, q: string): { path: string; query: Record<string, string> } | null {
  if (kind === 'order') return { path: 'orders', query: { q } };
  if (kind === 'product') return { path: 'products', query: { q } };
  if (kind === 'customer') return { path: 'customers', query: { q } };
  if (kind === 'setting') return { path: 'settings', query: { q } };
  return null;
}
