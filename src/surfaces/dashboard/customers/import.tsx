// Import customers (`#/dashboard/customers/import`): choose or paste a CSV, see every row with its problems before
// anything changes, then add the valid rows and get a report. Existing customers (same mobile or email) are skipped.
import { useState } from 'react';
import { Upload, FileDown, CheckCircle2, AlertTriangle } from 'lucide-react';
import { link } from '../../../core/router';
import { customerEventsStore, customersStore, logAction } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, LinkButton, Ref, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, Modal, PageHeader, Textarea, useToast, type Column } from '../../../ds/kit';
import { downloadCsv } from '../finance/download';
import { useUnsaved } from '../unsaved';
import { TODAY } from '../marketing/model';
import { IMPORT_TEMPLATE, applyImport, parseImport, type ImportProblem, type ImportRow } from './model';

export default function ImportCustomers() {
  const tx = useTx();
  const toast = useToast();
  const customers = customersStore.use();
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<{ added: string[]; skipped: number } | null>(null);
  const parsed = text.trim() ? parseImport(text, customers) : null;
  const ok = parsed?.rows.filter((r) => !r.problems.length) ?? [];
  const bad = (parsed?.rows.length ?? 0) - ok.length;
  useUnsaved(!!text.trim() && !report, { ar: 'ملف الاستيراد', en: 'Import file' });
  const why: Record<ImportProblem, string> = {
    name: tx('الاسم مفقود', 'Name missing'), email: tx('بريد غير صالح', 'Invalid email'), phone: tx('جوال سعودي غير صالح', 'Invalid Saudi mobile'), contact: tx('لا بريد ولا جوال', 'No email or mobile'),
    consent: tx('الموافقة yes أو no', 'Consent must be yes or no'), duplicate: tx('عميل موجود', 'Existing customer'), repeated: tx('مكرر في الملف', 'Repeated in the file'),
  };
  const onFile = async (f: File | undefined) => { if (f) setText(await f.text()); };
  const run = () => {
    if (!parsed) return;
    const r = applyImport(customersStore.get(), parsed.rows, TODAY);
    customersStore.set(r.customers);
    customerEventsStore.set((all) => {
      const n = { ...all };
      for (const c of r.added) n[c.id] = [{ id: `E${Date.now()}-${c.id}`, kind: 'imported', text: tx('أُضيف من ملف استيراد؛ الموافقات كما وردت في الملف', 'Added from an import file; consent as given in the file'), by: tx('أنت', 'You'), at: Date.now() }];
      return n;
    });
    logAction('marketing', { ar: `استورد ${r.added.length} عميلًا`, en: `Imported ${r.added.length} customers` }, { after: String(r.added.length) });
    setReport({ added: r.added.map((c) => c.id), skipped: parsed.rows.length - r.added.length });
    setConfirm(false);
    setText('');
    toast({ tone: 'ok', text: tx(`أُضيف ${r.added.length} عميلًا`, `${r.added.length} customers added`) });
  };
  const cols: Column<ImportRow>[] = [
    { key: 'l', header: tx('السطر', 'Line'), cell: (r) => <span className="tabular-nums text-muted">{r.line}</span> },
    { key: 'n', header: tx('الاسم', 'Name'), cell: (r) => <span className="font-medium text-fg">{r.name || '—'}</span> },
    { key: 'c', header: tx('التواصل', 'Contact'), hideBelow: 'lg', cell: (r) => <span className="text-[13px] text-muted"><bdi dir="ltr">{[r.email, r.phone].filter(Boolean).join(' · ') || '—'}</bdi></span> },
    { key: 'p', header: tx('النتيجة', 'Result'), cell: (r) => r.problems.length ? <span className="flex flex-wrap gap-1">{r.problems.map((p) => <Badge key={p} tone={p === 'duplicate' || p === 'repeated' ? 'gray' : 'red'}>{why[p]}{p === 'duplicate' && r.existing ? ` · ${r.existing}` : ''}</Badge>)}</span> : <Badge tone="green">{tx('سيُضاف', 'Will be added')}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: link('/dashboard/customers'), label: tx('العملاء', 'Customers') }} title={tx('استيراد العملاء', 'Import customers')} description={tx('معاينة كل سطر قبل أي تغيير', 'Every row previewed before any change')}
        actions={<Button variant="secondary" onClick={() => downloadCsv('customers-template.csv', IMPORT_TEMPLATE)}><FileDown className="size-4" aria-hidden="true" />{tx('نموذج الملف', 'Template')}</Button>} />
      {report && (
        <Alert tone="ok" title={tx(`أُضيف ${report.added.length} عميلًا، وتُرك ${report.skipped}`, `${report.added.length} added, ${report.skipped} skipped`)}
          action={<LinkButton variant="secondary" size="sm" href={link('/dashboard/customers', { sort: 'recent' })}>{tx('العملاء', 'Customers')}</LinkButton>}>
          {report.added.length > 0 && <>{tx('المعرفات: ', 'Ids: ')}<Ref>{report.added.slice(0, 8).join(', ')}{report.added.length > 8 ? '…' : ''}</Ref></>}
        </Alert>
      )}
      <Card aria-labelledby="h-file">
        <CardHeader id="h-file" title={tx('الملف', 'File')} hint={tx('CSV بأعمدة: name, email, phone, city, email_consent, sms_consent. الموافقة «yes» فقط إذا وافق العميل فعلًا ولديك إثبات.', 'CSV with columns: name, email, phone, city, email_consent, sms_consent. Consent is “yes” only if the customer really agreed and you have proof.')} />
        <div className="space-y-4 px-5 pb-5">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-sm font-medium text-muted hover:border-brand-300 hover:text-fg">
            <Upload className="size-5" aria-hidden="true" />{tx('اختر ملف CSV', 'Choose a CSV file')}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <Field label={tx('أو الصق المحتوى', 'Or paste the content')}>{(p) => <Textarea {...p} rows={5} dir="ltr" value={text} onChange={(e) => { setText(e.target.value); setReport(null); }} placeholder={IMPORT_TEMPLATE} />}</Field>
        </div>
      </Card>
      {parsed && (
        <Card aria-labelledby="h-prev">
          <CardHeader id="h-prev" title={tx('المعاينة', 'Preview')}
            action={<span className="flex flex-wrap items-center gap-2 text-xs"><Badge tone="green" icon={<CheckCircle2 className="size-3" aria-hidden="true" />}>{tx(`${ok.length} صالح`, `${ok.length} valid`)}</Badge>{bad > 0 && <Badge tone="amber" icon={<AlertTriangle className="size-3" aria-hidden="true" />}>{tx(`${bad} يُترك`, `${bad} skipped`)}</Badge>}</span>} />
          {parsed.missingColumns.length ? (
            <div className="px-5 pb-5"><Alert tone="bad" title={tx('أعمدة ناقصة', 'Missing columns')}><Ref>{parsed.missingColumns.join(', ')}</Ref></Alert></div>
          ) : (
            <>
              <div className="border-t border-border"><DataTable label={tx('معاينة الاستيراد', 'Import preview')} rows={parsed.rows.slice(0, 100)} columns={cols} rowKey={(r) => String(r.line)}
                card={(r) => <div className="space-y-1"><p className="flex justify-between gap-2 text-sm"><span className="font-medium text-fg">{r.name || '—'}</span><span className="text-xs text-muted">{tx('سطر', 'line')} {r.line}</span></p>{r.problems.length ? <p className="flex flex-wrap gap-1">{r.problems.map((p) => <Badge key={p} tone="red">{why[p]}</Badge>)}</p> : <Badge tone="green">{tx('سيُضاف', 'Will be added')}</Badge>}</div>} /></div>
              <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
                <Button disabled={!ok.length} onClick={() => setConfirm(true)}>{tx(`أضف ${ok.length} عميلًا`, `Add ${ok.length} customers`)}</Button>
                {bad > 0 && <span className="text-[13px] text-muted">{tx('الأسطر ذات المشاكل لا تُضاف؛ صحّح الملف وأعد رفعه.', 'Rows with problems are not added; fix the file and upload it again.')}</span>}
              </div>
            </>
          )}
        </Card>
      )}
      {confirm && (
        <Modal title={tx(`إضافة ${ok.length} عميلًا`, `Add ${ok.length} customers`)} onClose={() => setConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}>{tx('أضف', 'Add')}</Button></>}>
          <ul className="space-y-1.5 text-sm text-fg">
            <li>{tx(`يُضاف ${ok.length} عميلًا جديدًا بمعرفات جديدة.`, `${ok.length} new customers are added with new ids.`)}</li>
            <li>{tx(`موافقة البريد: ${ok.filter((r) => r.consentEmail).length} · موافقة الرسائل: ${ok.filter((r) => r.consentSms).length}`, `Email consent: ${ok.filter((r) => r.consentEmail).length} · SMS consent: ${ok.filter((r) => r.consentSms).length}`)}</li>
            <li>{tx('لا تُرسل أي رسالة للعملاء.', 'No message is sent to customers.')}</li>
            {bad > 0 && <li>{tx(`${bad} سطرًا لا يُضاف.`, `${bad} rows are not added.`)}</li>}
          </ul>
        </Modal>
      )}
    </div>
  );
}
