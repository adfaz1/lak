// Invoices (owner requirement 4, OWN-MNY-03, BP-P03-PMT-019): LAK's invoices to the merchant with a printable copy,
// and the merchant's sales invoices (one per paid order) linking to the orders section's printable tax invoice.
import { Download, FileText, Printer, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { ordersStore, settingsStore, testStore } from '../../merchant/stores';
import { canSee } from '../../merchant/perms';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, Ref, Segmented, useTx } from '../../../ds/ui';
import { Alert, DataTable, PageHeader, Pagination, SearchInput, Simulated, useToast, type Column } from '../../../ds/kit';
import { printHref } from '../orders/print-link';
import { sectionHref } from '../pages';
import { downloadCsv } from './download';
import { PeriodFilter } from './period-filter';
import {
  VAT_RATE, filterSalesInvoices, invoiceTotals, lakInvoices, lakInvoicesCsv, paginate, periodName, salesInvoices, salesInvoicesCsv,
  type LakInvoice, type SalesInvoice,
} from './model';

const href = (path = '', q?: Record<string, string | undefined>) => link(`/dashboard/finance${path ? `/${path}` : ''}`, q);
const day = (iso: string, lang: 'ar' | 'en') => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function Invoices({ route, empty }: { route: Route; empty: boolean }) {
  const tx = useTx();
  const kind = route.query.get('kind') === 'sales' ? 'sales' : 'lak';
  return (
    <div className="border-t border-border">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 sm:px-5">
        <Segmented label={tx('نوع الفواتير', 'Invoice type')} value={kind} onChange={(v) => replace(href('', { tab: 'invoices', kind: v === 'lak' ? undefined : v }))}
          options={[{ value: 'lak', label: tx('فواتير لك لك', 'LAK’s invoices to you') }, { value: 'sales', label: tx('فواتير مبيعاتك', 'Your sales invoices') }]} />
      </div>
      {kind === 'lak' ? <LakList empty={empty} /> : <SalesList route={route} empty={empty} />}
    </div>
  );
}

function statusBadge(i: LakInvoice, tx: ReturnType<typeof useTx>) {
  return i.status === 'paid' ? <Badge tone="green">{tx('مدفوعة', 'Paid')}</Badge> : <Badge tone="amber">{tx('مستحقة', 'Due')}</Badge>;
}

function LakList({ empty }: { empty: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const list = empty ? [] : lakInvoices();
  if (!list.length) return <EmptyState icon={<FileText className="size-6" aria-hidden="true" />} title={tx('لا فواتير بعد', 'No invoices yet')}>{tx('تصدر أول فاتورة في بداية أول فترة اشتراك.', 'The first invoice is issued at the start of your first billing period.')}</EmptyState>;
  const exportCsv = () => { downloadCsv('lak-invoices-2026-11-24.csv', lakInvoicesCsv(list)); toast({ tone: 'ok', text: tx(`نُزّلت ${list.length} فواتير`, `${list.length} invoices downloaded`) }); };
  const columns: Column<LakInvoice>[] = [
    { key: 'id', header: tx('رقم الفاتورة', 'Invoice'), cell: (i) => <Ref>{i.id}</Ref> },
    { key: 'period', header: tx('الفترة', 'Period'), cell: (i) => <span className="text-muted">{day(i.period.from, lang)} – {day(i.period.to, lang)}</span> },
    { key: 'status', header: tx('الحالة', 'Status'), cell: (i) => statusBadge(i, tx) },
    { key: 'vat', header: <span className="inline-flex items-center gap-1">{tx('الضريبة', 'VAT')}<InfoHint>{tx(`ضريبة القيمة المضافة ${VAT_RATE}% تضاف على المبلغ قبل الضريبة.`, `${VAT_RATE}% VAT added on top of the amount before VAT.`)}</InfoHint></span>, align: 'end', hideBelow: 'md', cell: (i) => <Money v={invoiceTotals(i).vat} /> },
    { key: 'total', header: tx('الإجمالي', 'Total'), align: 'end', cell: (i) => <Money v={invoiceTotals(i).total} className="font-semibold text-fg" /> },
  ];
  return (
    <div className="pt-3">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
        <p className="flex items-center gap-1.5 text-xs text-muted"><Badge tone="amber">{tx('مبالغ تجريبية', 'Test amounts')}</Badge><InfoHint>{tx('أسعار الخطط غير معتمدة بعد؛ المبالغ للمعاينة ولم يُحصَّل شيء.', 'Plan prices are not approved yet; amounts are for preview and nothing was charged.')}</InfoHint></p>
        <Button variant="secondary" className="ms-auto" onClick={exportCsv}><Download className="size-4" aria-hidden="true" />{tx(`تصدير CSV · ${list.length}`, `Export CSV · ${list.length}`)}</Button>
      </div>
      <div className="border-t border-border">
        <DataTable label={tx('فواتير لك', 'LAK invoices')} rows={list} columns={columns} rowKey={(i) => i.id} href={(i) => href(`invoices/${i.id}`)}
          card={(i) => (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg"><Ref>{i.id}</Ref></p>
                <p className="mt-0.5 text-xs text-muted">{day(i.period.from, lang)} – {day(i.period.to, lang)}</p>
                <div className="mt-1.5">{statusBadge(i, tx)}</div>
              </div>
              <Money v={invoiceTotals(i).total} className="text-sm font-semibold text-fg" />
            </div>
          )} />
      </div>
    </div>
  );
}

function SalesList({ route, empty }: { route: Route; empty: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const orders = ordersStore.use();
  const role = testStore.use().role;
  const q = route.query.get('q') ?? '';
  const from = route.query.get('from') ?? '', to = route.query.get('to') ?? '';
  const all = empty ? [] : salesInvoices(orders);
  const rows = filterSalesInvoices(all, q, from, to);
  const pg = paginate(rows, Number(route.query.get('page')) || 1);
  const qs = (o: Record<string, string | undefined>) => ({ tab: 'invoices', kind: 'sales', q: q || undefined, from: from || undefined, to: to || undefined, ...o });
  const go = (o: Record<string, string | undefined>) => replace(href('', qs({ ...o, page: undefined })));
  const seeOrders = canSee(role, 'orders');
  if (!all.length) return <EmptyState icon={<FileText className="size-6" aria-hidden="true" />} title={tx('لا فواتير مبيعات بعد', 'No sales invoices yet')}>{tx('تصدر فاتورة لكل طلب مدفوع.', 'An invoice is issued for every paid order.')}</EmptyState>;
  const exportCsv = () => { downloadCsv(periodName('lak-sales-invoices', from, to), salesInvoicesCsv(rows)); toast({ tone: 'ok', text: tx(`صُدّرت ${rows.length} فاتورة`, `Exported ${rows.length} invoices`) }); };
  const open = (i: SalesInvoice) => (seeOrders ? printHref('invoice', [i.orderRef]) : undefined);
  const columns: Column<SalesInvoice>[] = [
    { key: 'n', header: tx('رقم الفاتورة', 'Invoice'), cell: (i) => <Ref>{i.number}</Ref> },
    { key: 'o', header: tx('الطلب', 'Order'), hideBelow: 'md', cell: (i) => (seeOrders ? <a href={sectionHref('orders', i.orderRef)} onClick={(e) => e.stopPropagation()} className="text-brand-700 hover:underline dark:text-brand-300"><Ref>#{i.orderRef}</Ref></a> : <Ref>#{i.orderRef}</Ref>) },
    { key: 'd', header: tx('التاريخ', 'Date'), cell: (i) => <span className="text-muted">{day(i.day, lang)}</span> },
    { key: 'r', header: tx('ملاحظة', 'Note'), hideBelow: 'lg', cell: (i) => (i.refunded ? <Badge tone="amber">{tx('عليها استرداد', 'Has a refund')}</Badge> : <span className="text-subtle">—</span>) },
    { key: 'v', header: <span className="inline-flex items-center gap-1">{tx('منها الضريبة', 'Incl. VAT')}<InfoHint>{tx('15% مشمولة في السعر.', '15% included in the price.')}</InfoHint></span>, align: 'end', hideBelow: 'md', cell: (i) => <Money v={i.vat} /> },
    { key: 't', header: tx('الإجمالي', 'Total'), align: 'end', cell: (i) => <Money v={i.total} className="font-semibold text-fg" /> },
  ];
  return (
    <div className="pt-3">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
        <SearchInput value={q} onChange={(v) => go({ q: v || undefined })} placeholder={tx('ابحث برقم الفاتورة أو الطلب', 'Search invoice or order number')} />
        <PeriodFilter from={from} to={to} onChange={(f, t) => go({ from: f || undefined, to: t || undefined })} />
        <Button variant="secondary" className="ms-auto" onClick={exportCsv} disabled={!rows.length}><Download className="size-4" aria-hidden="true" />{tx(`تصدير CSV · ${rows.length}`, `Export CSV · ${rows.length}`)}</Button>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface-2/40 px-5 py-2.5 text-xs text-muted" role="status">
        {tx(`${rows.length} فاتورة`, `${rows.length} invoices`)}
        <InfoHint>{tx('الفاتورة الضريبية المطبوعة تُفتح من الطلب نفسه. التصدير يشمل كل النتائج المصفاة بلا بيانات العملاء.', 'The printable tax invoice opens from the order itself. Export covers all filtered results, without customer data.')}</InfoHint>
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا فواتير تطابق البحث', 'No invoices match')} action={<LinkButton variant="secondary" href={href('', { tab: 'invoices', kind: 'sales' })}>{tx('امسح التصفية', 'Clear filters')}</LinkButton>} />
      ) : (
        <div className="border-t border-border">
          <DataTable label={tx('فواتير المبيعات', 'Sales invoices')} rows={pg.rows} columns={columns} rowKey={(i) => i.number} href={seeOrders ? (i) => open(i)! : undefined}
            card={(i) => (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg"><Ref>{i.number}</Ref></p>
                  <p className="mt-0.5 text-xs text-muted">{day(i.day, lang)}{i.refunded && <> · {tx('عليها استرداد', 'Has a refund')}</>}</p>
                </div>
                <Money v={i.total} className="text-sm font-semibold text-fg" />
              </div>
            )} />
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(p) => href('', qs({ page: p > 1 ? String(p) : undefined }))} />
        </div>
      )}
    </div>
  );
}

/** Printable LAK invoice (simulated). The browser's print dialog saves it as PDF. */
export function InvoicePrint({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const settings = settingsStore.use();
  const back = { href: href('', { tab: 'invoices' }), label: tx('الفواتير', 'Invoices') };
  const inv = lakInvoices().find((i) => i.id === id);
  if (!inv) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('فاتورة', 'Invoice')} />
      <Card><EmptyState as="h2" icon={<FileText className="size-6" aria-hidden="true" />} title={tx('لا توجد فاتورة بهذا الرقم', 'No invoice with this number')} action={<LinkButton variant="secondary" href={back.href}>{tx('كل الفواتير', 'All invoices')}</LinkButton>}><Ref>{id}</Ref></EmptyState></Card>
    </div>
  );
  const t = invoiceTotals(inv);
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader back={back} title={<>{tx('فاتورة', 'Invoice')} <Ref>{inv.id}</Ref></>} meta={<>{statusBadge(inv, tx)}<Simulated /></>}
          actions={<Button onClick={() => window.print()}><Printer className="size-4" aria-hidden="true" />{tx('اطبع أو احفظ PDF', 'Print or save PDF')}</Button>} />
      </div>
      <Alert tone="warn" title={tx('نموذج للمعاينة', 'Preview sample')}>{tx('ليست فاتورة ضريبية معتمدة: المبالغ تجريبية والربط مع زاتكا (فاتورة) يحتاج مزوّدًا وخادمًا.', 'Not an approved tax invoice: amounts are test values and the ZATCA (Fatoora) link needs a provider and a server.')}</Alert>
      <Card aria-labelledby="h-inv" className="mx-auto max-w-3xl print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 id="h-inv" className="text-xl font-bold text-fg">{tx('فاتورة ضريبية', 'Tax invoice')}</h2>
            <p className="mt-1 text-sm text-muted"><Ref>{inv.id}</Ref></p>
          </div>
          <div className="text-end text-sm">
            <p className="font-semibold text-fg">{tx('منصة لك', 'LAK platform')}</p>
            <p className="text-muted">{tx('الرقم الضريبي: يُعتمد لاحقًا', 'VAT number: pending approval')}</p>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-3 px-6 py-5 text-sm sm:grid-cols-2">
          {[
            [tx('إلى', 'Billed to'), settings.store.name],
            [tx('فترة الفوترة', 'Billing period'), `${day(inv.period.from, lang)} – ${day(inv.period.to, lang)}`],
            [tx('تاريخ الإصدار', 'Issued'), day(inv.issued, lang)],
            [tx('تاريخ الاستحقاق', 'Due'), day(inv.due, lang)],
          ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-border pb-2"><dt className="text-muted">{k}</dt><dd className="text-end font-medium text-fg">{v}</dd></div>)}
        </dl>
        <CardHeader title={tx('البنود', 'Lines')} />
        <ul className="divide-y divide-border border-y border-border">
          {inv.lines.map((l, i) => <li key={i} className="flex items-center justify-between gap-3 px-6 py-3 text-sm"><span className="text-fg">{l.label[lang]}</span><Money v={l.amount} /></li>)}
        </ul>
        <dl className="space-y-2 px-6 py-5 text-sm">
          <div className="flex justify-between"><dt className="text-muted">{tx('المجموع قبل الضريبة', 'Subtotal before VAT')}</dt><dd><Money v={t.subtotal} /></dd></div>
          <div className="flex justify-between"><dt className="text-muted">{tx(`ضريبة القيمة المضافة ${VAT_RATE}%`, `VAT ${VAT_RATE}%`)}</dt><dd><Money v={t.vat} /></dd></div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-fg"><dt>{tx('الإجمالي', 'Total')}</dt><dd><Money v={t.total} /></dd></div>
        </dl>
        <p className="px-6 pb-6 text-xs text-muted">{inv.status === 'paid' ? tx('دُفعت بالبطاقة المحفوظة •••• 1142 (محاكاة).', 'Paid with the saved card •••• 1142 (simulated).') : tx('تُحصَّل تلقائيًا بالبطاقة المحفوظة في تاريخ الاستحقاق (محاكاة).', 'Charged automatically to the saved card on the due date (simulated).')}</p>
      </Card>
    </div>
  );
}
