// Print view (`#/dashboard/orders/print?doc=invoice|slip|label&refs=…`): simplified tax invoices (VAT 15%, seller VAT
// number, ZATCA phase-1 QR), packing slips (no prices for gifts) and shipping labels, one per page, for one or many orders.
// window.print() prints only the documents; the dashboard chrome is hidden by the print stylesheet below.
import { useState } from 'react';
import { FileText, Pencil, Printer, Settings2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, type Route } from '../../../core/router';
import { customersStore, invoiceConfigStore, logAction, ordersStore, settingsStore, testStore } from '../../merchant/stores';
import { CARRIERS, LOCATIONS, type Order } from '../../merchant/domain';
import { act, payView, placedAt, validVatNo } from '../../merchant/ops';
import { normaliseDigits } from '../../merchant/catalog';
import { Alert, Field, Input, Modal, PageHeader, Simulated, useToast } from '../../../ds/kit';
import { Badge, Button, Card, EmptyState, InfoHint, Money, Ref, Segmented, useTx } from '../../../ds/ui';
import { contactOf, orderPerms } from './model';
import { ohref, useActor } from './ui';
import { DOCS, printJobStore, type Doc } from './print-link';
import { qrPath } from './qr';
import { OrderExtrasPrint } from '../products/order-extras';

import { DEMO_VAT, InvoiceDoc, invoiceStore, useInvoiceSetup } from '../settings/invoice-doc';
// Seller details and the invoice document live with Settings → Invoice, so the settings preview is exactly what prints.
export { DEMO_VAT, invoiceStore };

export default function PrintView({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const who = useActor();
  const perms = orderPerms(testStore.use().role);
  const all = ordersStore.use();
  const job = printJobStore.use();
  const seller = invoiceStore.use();
  const store = settingsStore.use().store;
  const cfg = invoiceConfigStore.use();
  const inv = useInvoiceSetup();
  const [edit, setEdit] = useState(false);
  const doc = (DOCS as string[]).includes(route.query.get('doc') ?? '') ? (route.query.get('doc') as Doc) : 'invoice';
  const refs = route.query.get('job') && route.query.get('job') === job.id ? job.refs : (route.query.get('refs') ?? '').split(',').filter(Boolean);
  const orders = refs.map((r) => all.find((o) => o.ref === r)).filter((o): o is Order => !!o);
  const usable = orders.filter((o) => (doc === 'invoice' ? o.pay !== 'failed' : doc === 'label' ? o.ship !== 'none' && !o.cancelled : !o.cancelled));
  const skipped = orders.length - usable.length;
  const back = { href: refs.length === 1 ? ohref(refs[0]) : ohref(), label: refs.length === 1 ? `#${refs[0]}` : tx('الطلبات', 'Orders') };
  const name = { invoice: tx('فواتير ضريبية مبسطة', 'Simplified tax invoices'), slip: tx('قوائم التعبئة', 'Packing slips'), label: tx('ملصقات الشحن', 'Shipping labels') }[doc];
  const setDoc = (d: Doc) => { const q = Object.fromEntries(route.query.entries()); replace(ohref('print', { ...q, doc: d })); };

  const print = () => {
    const now = Date.now();
    if (doc !== 'slip') {
      ordersStore.set((list) => list.map((o) => (usable.some((u) => u.ref === o.ref) ? act(o, doc === 'invoice' ? 'invoicePrinted' : 'labelPrinted', who, now, { ref: doc === 'invoice' ? `INV-${o.ref}` : o.fulfilments.at(-1)?.ref ?? `SIM-${o.ref}-1` }) : o)));
    } else {
      ordersStore.set((list) => list.map((o) => (usable.some((u) => u.ref === o.ref) ? { ...o, slips: o.slips + 1, log: [...o.log, { when: 'now' as const, who: 'you' as const, kind: 'slipPrinted' as const, actor: who.name, role: who.role, at: now }] } : o)));
    }
    logAction('orders', { ar: `طباعة ${usable.length} ${doc === 'invoice' ? 'فاتورة' : doc === 'label' ? 'ملصق' : 'قائمة تعبئة'}`, en: `Printed ${usable.length} ${doc}s` }, { target: usable.slice(0, 10).map((o) => o.ref).join(',') });
    toast({ tone: 'ok', text: tx(`أُرسل ${usable.length} مستند للطباعة وسُجّل في كل طلب`, `${usable.length} documents sent to print and logged on each order`) });
    window.setTimeout(() => window.print(), 50);
  };

  if (!perms.see) return <div className="space-y-6"><PageHeader back={back} title={name} /><Card><EmptyState as="h2" title={tx('لا تملك صلاحية عرض الطلبات', 'You do not have access to orders')} /></Card></div>;

  return (
    <div className="space-y-6">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .lak-print, .lak-print * { visibility: visible !important; }
        .lak-print { position: absolute; inset: 0; margin: 0; padding: 0; }
        .lak-doc { break-after: page; box-shadow: none !important; border: none !important; margin: 0 !important; }
        .lak-noprint { display: none !important; }
        @page { margin: 12mm; }
      }`}</style>
      <div className="lak-noprint space-y-4">
        <PageHeader back={back} title={name} description={tx(`${usable.length} مستند`, `${usable.length} ${usable.length === 1 ? 'document' : 'documents'}`)}
          actions={<Button onClick={print} disabled={!usable.length} className="bg-brand-gradient hover:opacity-95"><Printer className="size-4" aria-hidden="true" />{tx('اطبع', 'Print')}</Button>} />
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label={tx('نوع المستند', 'Document')} value={doc} onChange={setDoc} options={[{ value: 'invoice', label: tx('الفاتورة', 'Invoice') }, { value: 'slip', label: tx('قائمة التعبئة', 'Packing slip') }, { value: 'label', label: tx('الملصق', 'Label') }]} />
          {doc === 'invoice' && <Button variant="ghost" size="sm" onClick={() => setEdit(true)}><Pencil className="size-4" aria-hidden="true" />{tx('بيانات البائع', 'Seller details')}</Button>}
          {doc === 'invoice' && <a href="#/dashboard/settings/invoice" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-fg"><Settings2 className="size-4" aria-hidden="true" />{tx('تخصيص الفاتورة', 'Customise invoice')}</a>}
        </div>
        {doc === 'invoice' && <Alert tone="info" title={<span className="flex items-center gap-2">{tx('مستند للطباعة فقط', 'Printable document only')}<InfoHint>{tx('الربط مع منصة فاتورة (المرحلة الثانية: التوقيع والإبلاغ للهيئة) يحتاج خادمًا.', 'Integration with the FATOORA platform (phase 2: signing and reporting) needs a server.')}</InfoHint></span>}>
          {tx('رمز QR بصيغة المرحلة الأولى. الإبلاغ الإلكتروني للهيئة غير مفعّل بعد.', 'QR in phase-1 format. Electronic reporting to ZATCA is not active yet.')}{seller.vatNo === DEMO_VAT && <> {tx('الرقم الضريبي تجريبي.', 'The VAT number is a demo value.')}</>}
        </Alert>}
        {doc === 'label' && <Alert tone="info">{tx('ملصق تجريبي للمعاينة، لا يصلح لدى الناقل. ملف الناقل الحقيقي يحتاج ربطًا من الخادم.', 'A preview label, not valid at the carrier. The real carrier file needs a server integration.')} <Simulated /></Alert>}
        {skipped > 0 && <Alert tone="warn">{tx(`استُبعد ${skipped}: ${doc === 'invoice' ? 'لم يُدفع' : doc === 'label' ? 'بلا ملصق أو ملغى' : 'ملغى'}`, `${skipped} skipped: ${doc === 'invoice' ? 'not paid' : doc === 'label' ? 'no label or cancelled' : 'cancelled'}`)}</Alert>}
      </div>

      {!usable.length ? (
        <Card className="lak-noprint"><EmptyState as="h2" icon={<FileText className="size-6" aria-hidden="true" />} title={tx('لا مستندات للطباعة', 'Nothing to print')}>{tx('اختر طلبات من القائمة ثم «اطبع».', 'Choose orders in the list, then Print.')}</EmptyState></Card>
      ) : (
        <div className="lak-print space-y-6">
          {usable.map((o) => (
            <article key={o.ref} className="lak-doc mx-auto max-w-[210mm] overflow-hidden rounded-2xl border border-border bg-white p-6 text-[13px] text-neutral-900 shadow-sm sm:p-8" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              {doc === 'invoice' && <InvoiceDoc o={o} seller={inv.seller} cfg={cfg} accent={inv.accentFor(cfg)} logo={inv.logo} langs={inv.langsFor(cfg, o)} customers={inv.customers} />}
              {doc === 'slip' && <SlipDoc o={o} store={store.name} />}
              {(doc === 'invoice' || doc === 'slip') && <OrderExtrasPrint o={o} lang={inv.langsFor(cfg, o)[0]} />}
              {doc === 'label' && <LabelDoc o={o} store={store.name} />}
            </article>
          ))}
        </div>
      )}
      {edit && <SellerModal onClose={() => setEdit(false)} />}
    </div>
  );
}

function SellerModal({ onClose }: { onClose: () => void }) {
  const tx = useTx();
  const cur = invoiceStore.get();
  const [vat, setVat] = useState(cur.vatNo);
  const [cr, setCr] = useState(cur.cr);
  const [addr, setAddr] = useState(cur.address);
  const ok = validVatNo(vat);
  return (
    <Modal title={tx('بيانات البائع في الفاتورة', 'Seller details on invoices')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!ok || !addr.trim()} onClick={() => { invoiceStore.set({ vatNo: normaliseDigits(vat), cr: normaliseDigits(cr), address: addr.trim() }); onClose(); }}>{tx('احفظ', 'Save')}</Button></>}>
      <Field label={tx('الرقم الضريبي', 'VAT registration number')} hint={tx('15 رقمًا يبدأ وينتهي بـ 3', '15 digits, starts and ends with 3')} error={!ok ? tx('رقم ضريبي غير صحيح', 'Not a valid VAT number') : null}>
        {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={vat} onChange={(e) => setVat(e.target.value)} />}
      </Field>
      <Field label={tx('السجل التجاري', 'Commercial registration')} optional>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={cr} onChange={(e) => setCr(e.target.value)} />}</Field>
      <Field label={tx('العنوان', 'Address')}>{(p) => <Input {...p} value={addr} onChange={(e) => setAddr(e.target.value)} />}</Field>
    </Modal>
  );
}

function Qr({ text, size = 112, label }: { text: string; size?: number; label: string }) {
  const q = qrPath(text);
  return <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${q.size} ${q.size}`} shapeRendering="crispEdges" className="shrink-0 bg-white"><path d={q.d} fill="#000" /></svg>;
}

const two = (ar: string, en: string) => <span className="block leading-tight"><span className="block font-semibold">{ar}</span><span className="block text-[11px] text-neutral-500" dir="ltr">{en}</span></span>;
const dateStr = (at: number, lang: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(at);

function SlipDoc({ o, store }: { o: Order; store: string }) {
  const { lang } = useLang();
  const c = contactOf(o, customersStore.get());
  const locOf = (i: number) => [...new Set([...o.fulfilments.filter((f) => f.qty[i]).map((f) => f.loc), ...Object.keys(o.items[i].reserved ?? {})])].map((l) => LOCATIONS[l][lang]).join(' · ');
  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-neutral-300 pb-3">
        <div>{two('قائمة التعبئة', 'Packing slip')}<p className="mt-1 text-neutral-600">{store}</p></div>
        <div className="text-end"><p className="text-lg font-bold"><Ref>#{o.ref}</Ref></p><p className="text-[11px] text-neutral-500">{dateStr(placedAt(o, Date.now()), lang)}</p></div>
      </header>
      <section className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><p className="text-[11px] font-semibold uppercase text-neutral-500">{lang === 'ar' ? 'إلى' : 'Ship to'}</p><p className="font-semibold">{o.gift?.to || o.address?.name || o.customer[lang]}</p><p>{c.address}</p><p>{c.city[lang]}</p></div>
        {o.gift && <div className="rounded border border-neutral-300 p-2"><p className="font-semibold">{lang === 'ar' ? 'هدية — بلا أسعار' : 'Gift — no prices'}</p>{o.gift.message && <p className="mt-1">«{o.gift.message}»</p>}</div>}
      </section>
      {(o.customerNote || o.address?.notes) && <p className="mt-3 rounded bg-neutral-100 px-3 py-2"><b>{lang === 'ar' ? 'ملاحظة العميل: ' : 'Customer note: '}</b>{o.customerNote ?? o.address?.notes}</p>}
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[30rem] border-collapse text-[12px]">
        <thead><tr className="border-y border-neutral-300 bg-neutral-50">
          <th className="w-8 px-2 py-2" aria-label="✓" /><th className="px-2 py-2 text-start">{lang === 'ar' ? 'الصنف' : 'Item'}</th><th className="px-2 py-2 text-start">SKU</th><th className="px-2 py-2 text-start">{lang === 'ar' ? 'الموقع' : 'Location'}</th><th className="px-2 py-2 text-end">{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
        </tr></thead>
        <tbody>{o.items.map((it, i) => (
          <tr key={i} className="border-b border-neutral-200">
            <td className="px-2 py-2"><span className="inline-block size-4 rounded border border-neutral-500" aria-hidden="true" /></td>
            <td className="px-2 py-2">{it.name[lang]}{it.variant && <span className="text-neutral-500"> · {it.variant[lang]}</span>}</td>
            <td className="px-2 py-2"><Ref>{it.sku}</Ref></td>
            <td className="px-2 py-2">{locOf(i) || '—'}</td>
            <td className="px-2 py-2 text-end text-[14px] font-bold tabular-nums">{it.qty}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="mt-4 text-[11px] text-neutral-500">{lang === 'ar' ? `${o.items.reduce((s, i) => s + i.qty, 0)} قطع. تحقّق من كل سطر قبل الإغلاق.` : `${o.items.reduce((s, i) => s + i.qty, 0)} items. Check every line before sealing.`}</p>
    </>
  );
}

function LabelDoc({ o, store }: { o: Order; store: string }) {
  const { lang } = useLang();
  const c = contactOf(o, customersStore.get());
  const parcels = o.fulfilments.length ? o.fulfilments.filter((f) => f.ship !== 'none') : [{ ref: `SIM-${o.ref}-1`, loc: 'ryd', qty: o.items.map((i) => i.qty), carrier: 'a' as const, tracking: undefined }];
  const cod = payView(o) === 'cod_due';
  return (
    <div className="space-y-6">
      {parcels.map((f) => (
        <div key={f.ref} className="mx-auto max-w-[105mm] border-2 border-black p-3 text-[12px]">
          <div className="flex items-center justify-between border-b-2 border-black pb-2"><span className="font-bold">{f.carrier ? CARRIERS[f.carrier].name[lang] : (lang === 'ar' ? 'الناقل' : 'Carrier')}</span><Badge tone="amber">{lang === 'ar' ? 'تجريبي' : 'TEST'}</Badge></div>
          <div className="grid grid-cols-2 gap-2 border-b border-black py-2">
            <div><p className="text-[10px] font-bold uppercase">{lang === 'ar' ? 'من' : 'From'}</p><p>{store}</p><p>{LOCATIONS[f.loc][lang]}</p></div>
            <div><p className="text-[10px] font-bold uppercase">{lang === 'ar' ? 'إلى' : 'To'}</p><p className="font-bold">{o.gift?.to || o.address?.name || o.customer[lang]}</p><p>{c.address}</p><p>{c.city[lang]}</p>{c.phone && <p dir="ltr" className="tabular-nums">{c.phone}</p>}</div>
          </div>
          <div className="flex items-center gap-3 py-2">
            <Qr text={f.tracking ?? f.ref} size={96} label={lang === 'ar' ? 'رمز الشحنة' : 'Shipment code'} />
            <div className="min-w-0 space-y-1"><p className="text-[10px] font-bold uppercase">{lang === 'ar' ? 'المرجع' : 'Reference'}</p><p className="font-mono text-base font-bold" dir="ltr">{f.tracking ?? f.ref}</p><p>{lang === 'ar' ? 'الطلب' : 'Order'} <Ref>#{o.ref}</Ref> · {f.qty.reduce((a, b) => a + b, 0)} {lang === 'ar' ? 'قطع' : 'pcs'}</p></div>
          </div>
          {cod && <p className="border-t-2 border-black pt-2 text-center text-[14px] font-bold">{lang === 'ar' ? 'تحصيل عند الاستلام: ' : 'COLLECT ON DELIVERY: '}<Money v={o.items.reduce((s, i) => s + i.qty * i.unit, 0) - (o.discount ?? 0) + o.fee} /></p>}
        </div>
      ))}
    </div>
  );
}
