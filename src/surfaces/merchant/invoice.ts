// Invoice customisation for the simplified tax invoice (orders → print, Settings → Invoice). The merchant chooses the
// look, extra information, notes, a stamp/signature, the language rule and when the invoice is sent; the ZATCA
// phase-1 fields stay on every invoice and cannot be switched off. Pure rules, no React.
import type { L, Order } from './domain';
import { payView, type NoticeEvent } from './ops';

export type InvoiceLang = 'customer' | 'bilingual' | 'ar' | 'en';
export const INVOICE_LANGS: InvoiceLang[] = ['customer', 'bilingual', 'ar', 'en'];
export type LogoPos = 'start' | 'center' | 'end';
export type LogoSize = 's' | 'm' | 'l';
export const LOGO_PX: Record<LogoSize, number> = { s: 40, m: 56, l: 76 };
export type ColourSource = 'identity' | 'custom' | 'mono';
/** When the invoice goes to the customer (through the «Invoice» customer message channels). */
export type SendOn = 'manual' | 'paid' | 'delivered';
export const SEND_ON: SendOn[] = ['manual', 'paid', 'delivered'];

/** Fields ZATCA phase 1 requires on a simplified tax invoice. Always printed; shown locked in the settings. */
export type LockedField = 'title' | 'sellerName' | 'sellerAddress' | 'vatNo' | 'invoiceNo' | 'issueDate' | 'lines' | 'vatAmount' | 'totalInclVat' | 'qr';
export const LOCKED_FIELDS: { id: LockedField; label: L }[] = [
  { id: 'title', label: { ar: 'عنوان «فاتورة ضريبية مبسطة»', en: '“Simplified tax invoice” title' } },
  { id: 'sellerName', label: { ar: 'اسم البائع', en: 'Seller name' } },
  { id: 'sellerAddress', label: { ar: 'عنوان البائع', en: 'Seller address' } },
  { id: 'vatNo', label: { ar: 'الرقم الضريبي للبائع', en: 'Seller VAT number' } },
  { id: 'invoiceNo', label: { ar: 'رقم الفاتورة', en: 'Invoice number' } },
  { id: 'issueDate', label: { ar: 'تاريخ ووقت الإصدار', en: 'Issue date and time' } },
  { id: 'lines', label: { ar: 'الأصناف والكميات والمبالغ', en: 'Items, quantities and amounts' } },
  { id: 'vatAmount', label: { ar: 'مبلغ ضريبة القيمة المضافة', en: 'VAT amount' } },
  { id: 'totalInclVat', label: { ar: 'الإجمالي شامل الضريبة', en: 'Total including VAT' } },
  { id: 'qr', label: { ar: 'رمز QR (المرحلة الأولى)', en: 'QR code (phase 1)' } },
];

/** Information the merchant may show or hide. */
export type OptionalField = 'sku' | 'variant' | 'unitPrice' | 'lineVat' | 'excl' | 'cr' | 'orderRef' | 'customerName' | 'customerCity' | 'customerPhone' | 'payMethod' | 'coupon' | 'storeContact';
export const PRODUCT_FIELDS: OptionalField[] = ['sku', 'variant', 'unitPrice', 'lineVat'];
export const ORDER_FIELDS: OptionalField[] = ['orderRef', 'customerName', 'customerCity', 'customerPhone', 'payMethod', 'coupon', 'excl'];
export const STORE_FIELDS: OptionalField[] = ['cr', 'storeContact'];
export const FIELD_LABEL: Record<OptionalField, L> = {
  sku: { ar: 'رمز المنتج (SKU)', en: 'Product code (SKU)' }, variant: { ar: 'الخيار (اللون/المقاس)', en: 'Option (colour/size)' },
  unitPrice: { ar: 'سعر الوحدة', en: 'Unit price' }, lineVat: { ar: 'ضريبة كل صنف', en: 'VAT per line' }, excl: { ar: 'الإجمالي غير شامل الضريبة', en: 'Total excluding VAT' },
  cr: { ar: 'السجل التجاري', en: 'Commercial registration' }, orderRef: { ar: 'رقم الطلب', en: 'Order number' }, customerName: { ar: 'اسم العميل', en: 'Customer name' },
  customerCity: { ar: 'مدينة العميل', en: 'Customer city' }, customerPhone: { ar: 'جوال العميل', en: 'Customer mobile' }, payMethod: { ar: 'طريقة الدفع', en: 'Payment method' },
  coupon: { ar: 'رمز الكوبون', en: 'Coupon code' }, storeContact: { ar: 'بريد وجوال المتجر', en: 'Store email and mobile' },
};

export interface StampImage { url: string; name: string }
export interface InvoiceConfig {
  /** Must keep the legal wording; the merchant may add to it (e.g. the store's name). */
  title: L;
  /** Optional line under the seller block, e.g. «صادرة من فرع الرياض». */
  issuedBy: L;
  logo: { show: boolean; pos: LogoPos; size: LogoSize };
  colour: { source: ColourSource; custom: string };
  show: Record<OptionalField, boolean>;
  notes: L;
  terms: L;
  /** Session object URLs (simulated upload). Printed at the end of the invoice. */
  stamp: StampImage | null;
  signature: StampImage | null;
  lang: InvoiceLang;
  sendOn: SendOn;
  version: number;
  savedAt?: string;
  savedBy?: string;
}

export const LEGAL_TITLE = { ar: 'فاتورة ضريبية مبسطة', en: 'Simplified Tax Invoice' };
export function invoiceConfigFixture(): InvoiceConfig {
  return {
    title: { ...LEGAL_TITLE }, issuedBy: { ar: '', en: '' },
    logo: { show: true, pos: 'start', size: 'm' }, colour: { source: 'identity', custom: '#5b3fd6' },
    show: { sku: true, variant: true, unitPrice: true, lineVat: true, excl: true, cr: true, orderRef: true, customerName: true, customerCity: true, customerPhone: false, payMethod: true, coupon: true, storeContact: false },
    notes: { ar: '', en: '' }, terms: { ar: '', en: '' }, stamp: null, signature: null, lang: 'customer', sendOn: 'manual', version: 1,
  };
}

export const NOTE_MAX = 300;
export const TERMS_MAX = 600;
export const TITLE_MAX = 60;
export type InvoiceError = 'titleAr' | 'titleEn' | 'titleLong' | 'notesLong' | 'termsLong' | 'colour' | 'contrast' | 'issuedLong';

const hex = /^#[0-9a-f]{6}$/i;
function luminance(h: string): number {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Contrast of a colour against the white invoice paper (WCAG ratio). */
export const contrastOnWhite = (h: string) => (hex.test(h) ? Math.round((1.05 / (luminance(h) + 0.05)) * 10) / 10 : 0);

/** The accent the invoice prints with: the store identity colour, the merchant's own, or black. */
export function invoiceAccent(cfg: Pick<InvoiceConfig, 'colour'>, identityAccent: string): string {
  if (cfg.colour.source === 'mono') return '#111111';
  const c = cfg.colour.source === 'custom' ? cfg.colour.custom : identityAccent;
  // Too light to read on white paper: fall back to black rather than print unreadable headings.
  return hex.test(c) && contrastOnWhite(c) >= 3 ? c : '#111111';
}

/** Problems that block saving. The legal title words cannot be removed; colours must stay readable on paper. */
export function validateInvoice(c: InvoiceConfig): InvoiceError[] {
  const out: InvoiceError[] = [];
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (!norm(c.title.ar).includes(LEGAL_TITLE.ar)) out.push('titleAr');
  if (!norm(c.title.en).toLowerCase().includes(LEGAL_TITLE.en.toLowerCase())) out.push('titleEn');
  if (c.title.ar.length > TITLE_MAX || c.title.en.length > TITLE_MAX) out.push('titleLong');
  if (c.issuedBy.ar.length > 80 || c.issuedBy.en.length > 80) out.push('issuedLong');
  if (c.notes.ar.length > NOTE_MAX || c.notes.en.length > NOTE_MAX) out.push('notesLong');
  if (c.terms.ar.length > TERMS_MAX || c.terms.en.length > TERMS_MAX) out.push('termsLong');
  if (c.colour.source === 'custom') {
    if (!hex.test(c.colour.custom)) out.push('colour');
    else if (contrastOnWhite(c.colour.custom) < 3) out.push('contrast');
  }
  return out;
}

/** Languages to print: the customer's (their order, else the store default), both, or a fixed one. */
export function invoiceLangs(cfg: Pick<InvoiceConfig, 'lang'>, orderLang: 'ar' | 'en' | undefined, storeDefault: 'ar' | 'en'): ('ar' | 'en')[] {
  if (cfg.lang === 'bilingual') return ['ar', 'en'];
  if (cfg.lang === 'customer') return [orderLang ?? storeDefault];
  return [cfg.lang];
}

/** Whether this write should send the invoice to the customer under the merchant's rule. Never twice per order. */
export function invoiceDue(cfg: Pick<InvoiceConfig, 'sendOn'>, before: Order | undefined, after: Order, events: NoticeEvent[]): boolean {
  if (cfg.sendOn === 'manual' || after.cancelled) return false;
  if ((after.messages ?? []).some((m) => m.event === 'invoice')) return false;
  if (cfg.sendOn === 'paid') return events.includes('paid') || (!before && payView(after) === 'paid');
  return events.includes('delivered');
}

/** Short descriptions of what changed between two saved configs, for the activity log. */
export function invoiceChanges(a: InvoiceConfig, b: InvoiceConfig): string[] {
  const keys: (keyof InvoiceConfig)[] = ['title', 'issuedBy', 'logo', 'colour', 'show', 'notes', 'terms', 'stamp', 'signature', 'lang', 'sendOn'];
  return keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])) as string[];
}
