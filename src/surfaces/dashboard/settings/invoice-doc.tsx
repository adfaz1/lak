// The simplified tax invoice as printed and previewed: one component for orders → print and Settings → Invoice, so
// the preview is exactly what prints. ZATCA phase-1 fields (title, seller name/address/VAT number, invoice number,
// issue time, lines, VAT, total incl. VAT, QR) are always rendered, whatever the settings say.
import type { ReactNode } from 'react';
import { createStore } from '../../../core/store';
import type { Order } from '../../merchant/domain';
import { payView, placedAt, zatcaTlv } from '../../merchant/ops';
import { LOGO_PX, invoiceAccent, invoiceLangs, type InvoiceConfig } from '../../merchant/invoice';
import { customersStore, noticesStore, settingsStore, themeStore } from '../../merchant/stores';
import { liveIdentity, mediaSrc } from '../../storefront/theme';
import { mediaStore } from '../storefront/state';
import type { Customer } from '../../merchant/workspace';
import { Money, Ref, cn } from '../../../ds/ui';
import { contactOf, invoiceOf, methodOf } from '../orders/model';
import { qrPath } from '../orders/qr';

/** Seller details printed on invoices (same session key as before). The default VAT number is a demo value and is labelled. */
export const DEMO_VAT = '310123456700003';
export const invoiceStore = createStore.key('dashboard.orders.invoice')(() => ({ vatNo: DEMO_VAT, cr: '1010123456', address: 'الرياض، حي السلي، المدينة الصناعية الثانية' }));

/** Everything an invoice needs besides the order and the config: seller, published identity colour and logo, customers. */
export function useInvoiceSetup() {
  const seller = invoiceStore.use();
  const store = settingsStore.use().store;
  const identity = liveIdentity(themeStore.use());
  const media = mediaStore.use();
  const customers = customersStore.use();
  const defaultLang = noticesStore.use().defaultLang;
  return {
    seller: { ...seller, name: store.name, demoVat: seller.vatNo === DEMO_VAT, email: store.email, phone: store.phone } as Seller,
    identityAccent: identity.accent, logo: mediaSrc(identity.logo, media), customers,
    accentFor: (cfg: InvoiceConfig) => invoiceAccent(cfg, identity.accent),
    langsFor: (cfg: InvoiceConfig, o: Order) => invoiceLangs(cfg, o.lang, defaultLang),
  };
}

export interface Seller { name: string; vatNo: string; cr: string; address: string; demoVat: boolean; email?: string; phone?: string }

function Qr({ text, size = 112, label }: { text: string; size?: number; label: string }) {
  const q = qrPath(text);
  return <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${q.size} ${q.size}`} shapeRendering="crispEdges" className="shrink-0 bg-white"><path d={q.d} fill="#000" /></svg>;
}
const fmtTime = (at: number) => new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
const dateStr = (at: number, lang: 'ar' | 'en') => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(at);
const PAY: Record<string, [string, string]> = { card: ['بطاقة', 'Card'], applepay: ['Apple Pay', 'Apple Pay'], bnpl: ['ادفع لاحقًا', 'Pay later'], cod: ['عند الاستلام', 'Cash on delivery'], bank: ['تحويل بنكي', 'Bank transfer'], manual: ['يدوي', 'Manual'] };

export function InvoiceDoc({ o, seller, cfg, accent, logo, langs, customers, now = Date.now() }: {
  o: Order; seller: Seller; cfg: InvoiceConfig; accent: string; logo?: string; langs: ('ar' | 'en')[]; customers: Customer[]; now?: number;
}) {
  const main = langs[0];
  const both = langs.length > 1;
  /** A label in the invoice language(s): bilingual prints Arabic with English under it. */
  const L = (ar: string, en: string, cls?: string): ReactNode => (both
    ? <span className={cn('inline-block leading-tight', cls)}><span className="block">{ar}</span><span className="block text-[10px] font-normal text-neutral-500" dir="ltr">{en}</span></span>
    : <span className={cls}>{main === 'ar' ? ar : en}</span>);
  const t = (v: { ar: string; en: string }) => (both ? `${v.ar}${v.en.trim() ? ` · ${v.en}` : ''}` : v[main]);
  const inv = invoiceOf(o);
  const at = placedAt(o, now);
  const customer = contactOf(o, customers);
  const tlv = zatcaTlv(seller.name, seller.vatNo, fmtTime(at), inv.total, inv.vat);
  const show = cfg.show;
  const r = (v: number) => <Money v={v} />;
  const size = LOGO_PX[cfg.logo.size];
  const mark = cfg.logo.show ? (logo
    ? <img src={logo} alt={seller.name} style={{ height: size, maxWidth: size * 3 }} className="object-contain" />
    : <span className="font-bold leading-none" style={{ color: accent, fontSize: size * 0.42 }}>{seller.name}</span>) : null;
  const pay = methodOf(o);
  const title = cfg.title;
  const notes = t(cfg.notes).trim();
  const terms = t(cfg.terms).trim();
  const issued = t(cfg.issuedBy).trim();
  const cols: { k: string; ar: string; en: string; end?: boolean; on: boolean }[] = [
    { k: 'item', ar: 'الصنف', en: 'Item', on: true }, { k: 'qty', ar: 'الكمية', en: 'Qty', end: true, on: true },
    { k: 'unit', ar: 'سعر الوحدة', en: 'Unit price', end: true, on: show.unitPrice }, { k: 'vat', ar: 'الضريبة', en: 'VAT', end: true, on: show.lineVat },
    { k: 'total', ar: 'المجموع', en: 'Amount', end: true, on: true },
  ];
  const sellerBlock = (
    <div className={cn('min-w-0 space-y-0.5', cfg.logo.pos === 'center' && 'text-center')}>
      <p className="text-lg font-bold">{seller.name}</p>
      <p className="text-neutral-600">{seller.address}</p>
      <p>{L('الرقم الضريبي', 'VAT No.')}: <bdi dir="ltr" className="font-semibold tabular-nums">{seller.vatNo}</bdi>{seller.demoVat && <span className="ms-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">{main === 'ar' ? 'تجريبي' : 'demo'}</span>}</p>
      {show.cr && seller.cr && <p>{L('السجل التجاري', 'CR No.')}: <bdi dir="ltr" className="tabular-nums">{seller.cr}</bdi></p>}
      {show.storeContact && (seller.email || seller.phone) && <p className="text-neutral-600"><bdi dir="ltr">{[seller.email, seller.phone].filter(Boolean).join(' · ')}</bdi></p>}
      {issued && <p className="text-neutral-600">{issued}</p>}
    </div>
  );
  return (
    <div dir={main === 'ar' ? 'rtl' : 'ltr'} lang={main} className="text-[13px] text-neutral-900">
      <div className="h-1.5 rounded-full" style={{ background: accent }} aria-hidden="true" />
      <header className={cn('mt-4 flex gap-4 border-b border-neutral-300 pb-4', cfg.logo.pos === 'center' ? 'flex-col items-center' : 'items-start justify-between', cfg.logo.pos === 'end' && 'flex-row-reverse')}>
        <div className={cn('flex min-w-0 gap-3', cfg.logo.pos === 'center' ? 'flex-col items-center' : 'items-start')}>
          {mark}
          {sellerBlock}
        </div>
        <Qr text={tlv} size={cfg.logo.pos === 'center' ? 96 : 104} label={main === 'ar' ? 'رمز الفاتورة (هيئة الزكاة)' : 'Invoice QR (ZATCA)'} />
      </header>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-base font-bold leading-tight" style={{ color: accent }}>
          {both ? <><span className="block">{title.ar}</span><span className="block text-[12px] font-semibold" dir="ltr">{title.en}</span></> : title[main]}
        </h2>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[12px]">
          <dt className="text-neutral-500">{L('رقم الفاتورة', 'Invoice no.')}</dt><dd><Ref>{inv.no}</Ref></dd>
          <dt className="text-neutral-500">{L('تاريخ الإصدار', 'Issue date')}</dt><dd>{dateStr(at, main)}</dd>
          {show.orderRef && <><dt className="text-neutral-500">{L('الطلب', 'Order')}</dt><dd><Ref>#{o.ref}</Ref></dd></>}
          {show.customerName && <><dt className="text-neutral-500">{L('العميل', 'Customer')}</dt><dd>{o.customer[main]}{show.customerCity && customer.city[main] ? ` · ${customer.city[main]}` : ''}</dd></>}
          {!show.customerName && show.customerCity && <><dt className="text-neutral-500">{L('المدينة', 'City')}</dt><dd>{customer.city[main]}</dd></>}
          {show.customerPhone && customer.phone && <><dt className="text-neutral-500">{L('الجوال', 'Mobile')}</dt><dd><bdi dir="ltr">{customer.phone}</bdi></dd></>}
          {show.payMethod && pay && <><dt className="text-neutral-500">{L('الدفع', 'Payment')}</dt><dd>{both ? `${PAY[pay][0]} · ${PAY[pay][1]}` : PAY[pay][main === 'ar' ? 0 : 1]}</dd></>}
        </dl>
      </div>
      {o.cancelled && <p className="mt-3 rounded border border-red-400 px-3 py-1 text-center font-bold text-red-700">{main === 'ar' ? 'طلب ملغى — يصدر إشعار دائن عند الاسترداد' : 'Cancelled order — a credit note is issued on refund'}</p>}
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[26rem] border-collapse text-[12px]">
        <thead><tr className="border-y border-neutral-300" style={{ background: `${accent}14` }}>
          {cols.filter((c) => c.on).map((c, i) => <th key={c.k} className={cn('px-2 py-2 font-semibold', i === 0 ? 'text-start' : 'text-end')}>{L(c.ar, c.en)}</th>)}
        </tr></thead>
        <tbody>
          {inv.lines.map((ln, i) => (
            <tr key={i} className="border-b border-neutral-200">
              <td className="px-2 py-2">{ln.name[main]}{both && <span className="block text-[11px] text-neutral-500" dir="ltr">{ln.name.en}</span>}{show.variant && ln.variant && <span className="text-neutral-500"> · {ln.variant[main]}</span>}{show.sku && <span className="block text-[11px] text-neutral-500"><Ref>{ln.sku}</Ref></span>}</td>
              <td className="px-2 py-2 text-end tabular-nums">{ln.qty}</td>
              {show.unitPrice && <td className="px-2 py-2 text-end">{r(ln.unit)}</td>}
              {show.lineVat && <td className="px-2 py-2 text-end">{r(ln.vat)}</td>}
              <td className="px-2 py-2 text-end font-semibold">{r(ln.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <dl className="ms-auto mt-4 w-full max-w-xs space-y-1 text-[12px]">
        <div className="flex justify-between gap-3"><dt className="text-neutral-600">{L('المجموع', 'Subtotal')}</dt><dd>{r(inv.subtotal)}</dd></div>
        {inv.discount > 0 && <div className="flex justify-between gap-3"><dt className="text-neutral-600">{L('الخصم', 'Discount')}{show.coupon && o.coupon ? <bdi dir="ltr"> ({o.coupon})</bdi> : null}</dt><dd className="inline-flex">−{r(inv.discount)}</dd></div>}
        <div className="flex justify-between gap-3"><dt className="text-neutral-600">{L('الشحن', 'Shipping')}</dt><dd>{r(inv.shipping)}</dd></div>
        {show.excl && <div className="flex justify-between gap-3"><dt className="text-neutral-600">{L('الإجمالي غير شامل الضريبة', 'Total excl. VAT')}</dt><dd>{r(inv.excl)}</dd></div>}
        <div className="flex justify-between gap-3"><dt className="text-neutral-600">{L('ضريبة القيمة المضافة 15%', 'VAT 15%')}</dt><dd>{r(inv.vat)}</dd></div>
        <div className="flex justify-between gap-3 border-t pt-1.5 text-[14px] font-bold" style={{ borderColor: accent }}><dt>{L('الإجمالي شامل الضريبة', 'Total incl. VAT')}</dt><dd>{r(inv.total)}</dd></div>
      </dl>
      {(notes || terms) && (
        <div className="mt-5 space-y-2 border-t border-neutral-200 pt-3 text-[12px]">
          {notes && <p className="whitespace-pre-line"><b>{L('ملاحظات: ', 'Notes: ')}</b>{notes}</p>}
          {terms && <p className="whitespace-pre-line text-neutral-600"><b>{L('الشروط: ', 'Terms: ')}</b>{terms}</p>}
        </div>
      )}
      {(cfg.stamp || cfg.signature) && (
        <div className="mt-5 flex flex-wrap items-end justify-end gap-6">
          {cfg.signature && <figure className="text-center"><img src={cfg.signature.url} alt={main === 'ar' ? 'التوقيع' : 'Signature'} className="h-14 max-w-[10rem] object-contain" /><figcaption className="text-[10px] text-neutral-500">{L('التوقيع', 'Signature')}</figcaption></figure>}
          {cfg.stamp && <figure className="text-center"><img src={cfg.stamp.url} alt={main === 'ar' ? 'الختم' : 'Stamp'} className="size-20 object-contain opacity-90" /><figcaption className="text-[10px] text-neutral-500">{L('الختم', 'Stamp')}</figcaption></figure>}
        </div>
      )}
      <p className="mt-6 text-[11px] text-neutral-500">{payView(o) === 'cod_due' ? L('الدفع عند الاستلام.', 'Payment on delivery.') : L('مدفوعة.', 'Paid.')} {L('الأسعار شاملة ضريبة القيمة المضافة.', 'Prices include VAT.')}</p>
    </div>
  );
}
