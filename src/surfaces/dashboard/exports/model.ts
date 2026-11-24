// Export templates shared by orders, products and customers (Salla audit 02 §2.9 and 03 §3.11: two pages with the
// same name and only «name + columns»). One template model for every section: chosen columns in order, header names in
// Arabic and English, row per order or per item (per product or per variant), filters, a date range, and a simulated
// scheduled e-mail. Every export previews its first rows and is logged with who, when and how many rows.
// Pure rules, no React.
import type { L, Order } from '../../merchant/domain';
import type { Product } from '../../merchant/catalog';
import type { Level } from '../../merchant/inventory';
import type { Customer } from '../../merchant/workspace';
import { payView, liveSub } from '../../merchant/ops';
import { customerStats } from '../../merchant/workspace';
import { moneyBreakdown, methodOf, placedDay } from '../orders/model';
import { EXPORT_COLS, exportRows, type ExportCol } from '../products/model';
import { mask } from '../customers/model';
import { checkRange, presetRange, type Range } from '../analytics/range';

export type Entity = 'orders' | 'products' | 'customers';
export const ENTITIES: Entity[] = ['orders', 'products', 'customers'];
export const ENTITY_LABEL: Record<Entity, L> = { orders: { ar: 'الطلبات', en: 'Orders' }, products: { ar: 'المنتجات', en: 'Products' }, customers: { ar: 'العملاء', en: 'Customers' } };

export interface FieldDef { key: string; label: L; contact?: boolean; item?: boolean; money?: boolean }
const f = (key: string, ar: string, en: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label: { ar, en }, ...o });

export const ORDER_FIELDS: FieldDef[] = [
  f('ref', 'رقم الطلب', 'Order number'), f('date', 'التاريخ', 'Date'), f('customer', 'العميل', 'Customer'), f('phone', 'الجوال', 'Mobile', { contact: true }),
  f('email', 'البريد', 'Email', { contact: true }), f('city', 'المدينة', 'City'), f('channel', 'القناة', 'Channel'), f('payment', 'الدفع', 'Payment'),
  f('payMethod', 'طريقة الدفع', 'Payment method'), f('fulfilment', 'التجهيز', 'Fulfilment'), f('shipment', 'الشحن', 'Shipment'), f('subStatus', 'الحالة الفرعية', 'Sub-status'),
  f('items', 'الأصناف', 'Items'), f('units', 'القطع', 'Units'), f('subtotal', 'المجموع', 'Subtotal', { money: true }), f('discount', 'الخصم', 'Discount', { money: true }),
  f('coupon', 'الكوبون', 'Coupon'), f('shipping', 'الشحن (مبلغ)', 'Shipping fee', { money: true }), f('vat', 'الضريبة', 'VAT', { money: true }), f('total', 'الإجمالي', 'Total', { money: true }),
  f('refunded', 'المسترد', 'Refunded', { money: true }), f('tags', 'الوسوم', 'Tags'), f('assignee', 'المسؤول', 'Assignee'), f('cancelled', 'ملغى', 'Cancelled'),
  f('itemSku', 'SKU الصنف', 'Item SKU', { item: true }), f('itemName', 'اسم الصنف', 'Item name', { item: true }), f('itemVariant', 'خيار الصنف', 'Item option', { item: true }),
  f('itemQty', 'كمية الصنف', 'Item quantity', { item: true }), f('itemUnit', 'سعر الوحدة', 'Unit price', { item: true, money: true }), f('itemAmount', 'مبلغ الصنف', 'Line amount', { item: true, money: true }),
];
const PRODUCT_LABEL: Record<ExportCol, [string, string]> = {
  name: ['الاسم بالإنجليزية', 'English name'], nameAr: ['الاسم بالعربية', 'Arabic name'], sku: ['SKU', 'SKU'], variant: ['المتغير', 'Variant'], status: ['الحالة', 'Status'],
  price: ['السعر', 'Price'], compareAt: ['السعر قبل الخصم', 'Compare-at'], cost: ['التكلفة', 'Cost'], margin: ['الهامش %', 'Margin %'], available: ['المتاح', 'Available'],
  category: ['الفئة', 'Category'], channels: ['القنوات', 'Channels'], tags: ['الوسوم', 'Tags'],
};
export const PRODUCT_FIELDS: FieldDef[] = EXPORT_COLS.map((c) => f(c, PRODUCT_LABEL[c][0], PRODUCT_LABEL[c][1], { item: c === 'variant', money: c === 'price' || c === 'compareAt' || c === 'cost' }));
export const CUSTOMER_FIELDS: FieldDef[] = [
  f('id', 'المعرف', 'Id'), f('name', 'الاسم', 'Name'), f('city', 'المدينة', 'City'), f('email', 'البريد', 'Email', { contact: true }), f('phone', 'الجوال', 'Mobile', { contact: true }),
  f('emailConsent', 'موافقة البريد', 'Email consent'), f('smsConsent', 'موافقة الرسائل', 'SMS consent'), f('orders', 'طلبات مدفوعة', 'Paid orders'),
  f('spent', 'الإنفاق', 'Spent', { money: true }), f('since', 'عميل منذ', 'Customer since'), f('blocked', 'محظور', 'Blocked'),
];
export const FIELDS: Record<Entity, FieldDef[]> = { orders: ORDER_FIELDS, products: PRODUCT_FIELDS, customers: CUSTOMER_FIELDS };
export const fieldOf = (e: Entity, key: string) => FIELDS[e].find((x) => x.key === key);

export type RowMode = 'one' | 'line';
/** What «one row per …» means for each entity. */
export const ROW_MODE_LABEL: Record<Entity, Record<RowMode, L>> = {
  orders: { one: { ar: 'سطر لكل طلب', en: 'One row per order' }, line: { ar: 'سطر لكل صنف', en: 'One row per item' } },
  products: { one: { ar: 'سطر لكل منتج', en: 'One row per product' }, line: { ar: 'سطر لكل متغير', en: 'One row per variant' } },
  customers: { one: { ar: 'سطر لكل عميل', en: 'One row per customer' }, line: { ar: 'سطر لكل عميل', en: 'One row per customer' } },
};

export type PeriodPreset = 'all' | '7' | '30' | '90' | 'mtd' | 'custom';
export const PERIODS: PeriodPreset[] = ['all', '7', '30', '90', 'mtd', 'custom'];
export type Freq = 'off' | 'daily' | 'weekly' | 'monthly';
export const FREQS: Freq[] = ['off', 'daily', 'weekly', 'monthly'];
export interface Schedule { freq: Freq; email: string; hour: number; weekday: number; day: number }
export interface Filters { pay?: string; ful?: string; ship?: string; ch?: string; status?: string; consent?: string }
export interface Col { key: string; ar: string; en: string }
export interface Template {
  id: string; name: string; entity: Entity; cols: Col[]; headerLang: 'ar' | 'en'; rows: RowMode; filters: Filters;
  period: { preset: PeriodPreset; from?: string; to?: string }; schedule: Schedule; version: number; updatedAt: string; by: string;
}

export const NAME_MAX = 40;
export const HEADER_MAX = 40;
export const MAX_TEMPLATES = 30;

export function blankTemplate(entity: Entity, id: string, by: string, now: string): Template {
  const keys: Record<Entity, string[]> = {
    orders: ['ref', 'date', 'customer', 'city', 'payment', 'total'],
    products: ['nameAr', 'sku', 'status', 'price', 'available'],
    customers: ['id', 'name', 'city', 'orders', 'spent'],
  };
  return {
    id, name: '', entity, cols: keys[entity].map((k) => ({ key: k, ar: fieldOf(entity, k)!.label.ar, en: fieldOf(entity, k)!.label.en })), headerLang: 'ar', rows: 'one', filters: {},
    period: { preset: 'all' }, schedule: { freq: 'off', email: '', hour: 7, weekday: 0, day: 1 }, version: 1, updatedAt: now, by,
  };
}
export const nextTemplateId = (list: Template[]) => `TPL-${String(list.reduce((m, t) => Math.max(m, Number(t.id.slice(4)) || 0), 0) + 1).padStart(3, '0')}`;

export function templateFixtures(): Template[] {
  const now = '2026-11-02T08:00:00.000Z';
  const acc: Template = {
    ...blankTemplate('orders', 'TPL-001', 'المالك', now), name: 'للمحاسب — سطر لكل صنف', headerLang: 'ar', rows: 'line', period: { preset: '30' }, filters: { pay: 'paid' },
    cols: ['ref', 'date', 'itemSku', 'itemName', 'itemQty', 'itemUnit', 'itemAmount', 'vat', 'total'].map((k) => ({ key: k, ...fieldOf('orders', k)!.label })),
    schedule: { freq: 'weekly', email: 'accounts@darnuwa.test', hour: 7, weekday: 0, day: 1 },
  };
  const stock: Template = {
    ...blankTemplate('products', 'TPL-002', 'فيصل', now), name: 'Stock count', headerLang: 'en', rows: 'line', filters: { status: 'active' },
    cols: [{ key: 'sku', ar: 'SKU', en: 'sku' }, { key: 'nameAr', ar: 'الاسم', en: 'name_ar' }, { key: 'variant', ar: 'المتغير', en: 'variant' }, { key: 'available', ar: 'المتاح', en: 'on_hand' }],
  };
  return [acc, stock];
}

export type TemplateError = 'name' | 'nameLong' | 'nameTaken' | 'noCols' | 'header' | 'headerLong' | 'headerDup' | 'range' | 'email' | 'limit';
/** Problems that block saving. Header names must be unique in the chosen language so spreadsheet columns never collide. */
export function validateTemplate(t: Template, all: Template[]): TemplateError[] {
  const out: TemplateError[] = [];
  const name = t.name.trim();
  if (!name) out.push('name');
  else if (name.length > NAME_MAX) out.push('nameLong');
  else if (all.some((x) => x.id !== t.id && x.entity === t.entity && x.name.trim().toLowerCase() === name.toLowerCase())) out.push('nameTaken');
  if (!all.some((x) => x.id === t.id) && all.length >= MAX_TEMPLATES) out.push('limit');
  if (!t.cols.length) out.push('noCols');
  const heads = t.cols.map((c) => c[t.headerLang].trim());
  if (heads.some((h) => !h)) out.push('header');
  if (t.cols.some((c) => c.ar.length > HEADER_MAX || c.en.length > HEADER_MAX)) out.push('headerLong');
  if (new Set(heads.map((h) => h.toLowerCase())).size !== heads.length) out.push('headerDup');
  if (t.period.preset === 'custom' && !checkRange(t.period.from ?? '', t.period.to ?? '').ok) out.push('range');
  if (t.schedule.freq !== 'off' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t.schedule.email.trim())) out.push('email');
  return out;
}

/** The date range a template covers today (orders only; products and customers are a snapshot). */
export function periodRange(t: Pick<Template, 'period'>): Range | null {
  const p = t.period;
  if (p.preset === 'all') return null;
  if (p.preset === 'custom') { const r = checkRange(p.from ?? '', p.to ?? ''); return r.ok ? r.range : null; }
  return presetRange(p.preset);
}

export interface Data { orders: Order[]; products: Product[]; levels: Level[]; customers: Customer[]; contact: boolean; now: number }

/** Records the template selects, before columns: its filters and its date range. `scoped` = the caller already chose them. */
export function selectOrders(t: Template, orders: Order[], now: number, scoped = false): Order[] {
  if (scoped) return orders;
  const r = periodRange(t);
  const fl = t.filters;
  return orders.filter((o) => (!fl.pay || payView(o) === fl.pay) && (!fl.ful || o.ful === fl.ful) && (!fl.ship || o.ship === fl.ship) && (!fl.ch || o.channel === fl.ch)
    && (!r || (placedDay(o, now) >= r.from && placedDay(o, now) <= r.to)));
}

/** A cell that would start a spreadsheet formula is prefixed with ' so opening the file never runs anything. */
export const safeCell = (v: string | number): string | number => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const money = (h: number) => (h / 100).toFixed(2);
const yes = (b: boolean, lang: 'ar' | 'en') => (b ? (lang === 'ar' ? 'نعم' : 'yes') : (lang === 'ar' ? 'لا' : 'no'));

export interface Sheet { head: string[]; rows: (string | number)[][]; masked: boolean }

/**
 * The file a template produces. Contact columns are masked when the role cannot see contact details; the sheet says so.
 * `scope` = records the caller already selected (e.g. the orders chosen in the list); otherwise the template's filters apply.
 */
export function buildSheet(t: Template, d: Data, scope?: { orders?: Order[]; products?: Product[]; customers?: Customer[] }): Sheet {
  const lang = t.headerLang;
  const head = t.cols.map((c) => c[lang].trim());
  const masked = !d.contact && t.cols.some((c) => fieldOf(t.entity, c.key)?.contact);
  if (t.entity === 'orders') {
    const os = selectOrders(t, scope?.orders ?? d.orders, d.now, !!scope?.orders);
    const rows: (string | number)[][] = [];
    for (const o of os) {
      const m = moneyBreakdown(o);
      const c = d.customers.find((x) => x.id === o.customerId) ?? d.customers.find((x) => x.name.en === o.customer.en);
      const phone = o.contact?.phone ?? c?.phone ?? '';
      const email = o.contact?.email ?? c?.email ?? '';
      const val: Record<string, string | number> = {
        ref: o.ref, date: placedDay(o, d.now), customer: o.customer[lang], phone: d.contact || !phone ? phone : mask(phone, 'sms'), email: d.contact || !email ? email : mask(email, 'email'),
        city: o.city[lang], channel: o.channel, payment: payView(o), payMethod: methodOf(o) ?? '', fulfilment: o.ful, shipment: o.ship, subStatus: liveSub(o)?.name[lang] ?? '',
        items: o.items.map((i) => `${i.sku} x${i.qty}`).join(' | '), units: m.units, subtotal: money(m.subtotal), discount: money(m.discount), coupon: o.coupon ?? '',
        shipping: money(m.shipping), vat: money(m.vat), total: money(m.total), refunded: money(m.refunded), tags: (o.tags ?? []).join(' | '), assignee: o.assignee ?? '', cancelled: o.cancelled ? yes(true, lang) : '',
      };
      const lines = t.rows === 'line' ? o.items : [null];
      for (const it of lines) {
        const iv: Record<string, string | number> = it ? { itemSku: it.sku, itemName: it.name[lang], itemVariant: it.variant?.[lang] ?? '', itemQty: it.qty, itemUnit: money(it.unit), itemAmount: money(it.qty * it.unit) }
          : { itemSku: '', itemName: '', itemVariant: '', itemQty: '', itemUnit: '', itemAmount: '' };
        rows.push(t.cols.map((cc) => safeCell({ ...val, ...iv }[cc.key] ?? '')));
      }
    }
    return { head, rows, masked };
  }
  if (t.entity === 'products') {
    const ps = scope?.products ?? d.products.filter((p) => !t.filters.status || p.status === t.filters.status);
    const keys = t.cols.map((c) => c.key as ExportCol);
    const out = exportRows(ps, d.levels, keys, t.rows === 'line');
    return { head, rows: out.slice(1).map((r) => r.map(safeCell)), masked };
  }
  const cs = (scope?.customers ?? d.customers).filter((c) => !t.filters.consent || (t.filters.consent === 'email' ? c.consent.email : c.consent.sms));
  const rows = cs.map((c) => {
    const s = customerStats(c, d.orders);
    const val: Record<string, string | number> = {
      id: c.id, name: c.name[lang], city: c.city[lang], email: d.contact ? c.email : mask(c.email, 'email'), phone: d.contact ? c.phone : mask(c.phone, 'sms'),
      emailConsent: yes(c.consent.email, lang), smsConsent: yes(c.consent.sms, lang), orders: s.paidCount, spent: money(s.spent), since: c.since, blocked: yes(!!c.blocked, lang),
    };
    return t.cols.map((cc) => safeCell(val[cc.key] ?? ''));
  });
  return { head, rows, masked };
}

/** CSV with a UTF-8 byte-order mark so Excel opens Arabic correctly. */
export function sheetCsv(s: Sheet): string {
  const q = (v: string | number) => { const x = String(v); return /[",\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  return '﻿' + [s.head, ...s.rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}

/** The built-in layout of each section, as a template, so «default columns» goes through the same preview and log. */
export function defaultTemplate(entity: Entity, lang: 'ar' | 'en'): Template {
  const keys: Record<Entity, string[]> = {
    orders: ['ref', 'date', 'customer', 'city', 'channel', 'payment', 'payMethod', 'fulfilment', 'shipment', 'items', 'units', 'subtotal', 'discount', 'shipping', 'total', 'vat', 'refunded', 'tags'],
    products: ['name', 'nameAr', 'sku', 'status', 'price', 'compareAt', 'cost', 'available', 'category'],
    customers: ['id', 'name', 'city', 'email', 'phone', 'emailConsent', 'smsConsent', 'orders', 'spent', 'blocked'],
  };
  const t = blankTemplate(entity, 'default', 'system', '');
  return { ...t, name: lang === 'ar' ? 'الأعمدة الافتراضية' : 'Default columns', headerLang: lang, cols: keys[entity].map((k) => ({ key: k, ...fieldOf(entity, k)!.label })) };
}

/* ---------- Schedule (simulated e-mail) ---------- */

const RIYADH = 3 * 3600000;
/** Next send time (UTC ISO) after `now` for a schedule in Riyadh time. Null when off. */
export function nextRun(s: Schedule, now: number): string | null {
  if (s.freq === 'off') return null;
  const local = new Date(now + RIYADH);
  const at = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), s.hour, 0, 0));
  for (let i = 0; i < 400; i++) {
    const ok = at.getTime() > local.getTime() && (s.freq === 'daily' || (s.freq === 'weekly' && at.getUTCDay() === s.weekday) || (s.freq === 'monthly' && at.getUTCDate() === Math.min(s.day, 28)));
    if (ok) return new Date(at.getTime() - RIYADH).toISOString();
    at.setUTCDate(at.getUTCDate() + 1);
  }
  return null;
}

/* ---------- Export log ---------- */

export type Trigger = 'manual' | 'scheduled' | 'section';
export interface ExportLog {
  id: string; at: string; by: string; entity: Entity; templateId: string; templateName: string; rows: number; file: string; trigger: Trigger;
  /** Scheduled sends: the recipient and the simulated delivery result. */
  to?: string; status: 'ready' | 'sent' | 'failed';
  /** The file as produced, kept for re-download while it is among the most recent ones; older entries regenerate. */
  csv?: string;
  /** The template as it was, so a regenerated file uses the same columns, filters and range. */
  snapshot: Template;
  /** Records the export covered when the caller chose them (refs/ids), so a regenerated file covers the same ones. */
  scope?: string[];
}
export const KEEP_FILES = 6;
export const LOG_CAP = 100;
export const nextLogId = (list: ExportLog[]) => `EXP-${String(list.reduce((m, x) => Math.max(m, Number(x.id.slice(4)) || 0), 0) + 1).padStart(4, '0')}`;
/** Newest first; only the most recent files keep their content (storage stays small), the rest can be regenerated. */
export function addLog(list: ExportLog[], e: ExportLog): ExportLog[] {
  return [e, ...list].slice(0, LOG_CAP).map((x, i) => (i < KEEP_FILES ? x : { ...x, csv: undefined }));
}
export const fileName = (t: Pick<Template, 'entity' | 'name'>, at: string) =>
  `${t.entity}-${(t.name.trim() || 'export').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'export'}-${at.slice(0, 10)}.csv`;

export function logFixtures(): ExportLog[] {
  const t = templateFixtures()[0];
  return [
    { id: 'EXP-0002', at: '2026-11-22T04:00:00.000Z', by: 'جدولة', entity: 'orders', templateId: t.id, templateName: t.name, rows: 212, file: fileName(t, '2026-11-22'), trigger: 'scheduled', to: t.schedule.email, status: 'sent', snapshot: t },
    { id: 'EXP-0001', at: '2026-11-15T04:00:00.000Z', by: 'جدولة', entity: 'orders', templateId: t.id, templateName: t.name, rows: 198, file: fileName(t, '2026-11-15'), trigger: 'scheduled', to: t.schedule.email, status: 'sent', snapshot: t },
  ];
}
