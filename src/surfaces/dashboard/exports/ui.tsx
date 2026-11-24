// Shared export UI: the data a template reads (role-aware), a preview of the first rows, the download that logs itself,
// and the dialog the orders, products and customers lists open instead of a fixed-column CSV.
import { useMemo, useState } from 'react';
import { Download, EyeOff, FileSpreadsheet, Settings2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { can } from '../../merchant/perms';
import { currentActor, customersStore, levelsStore, logAction, ordersStore, productsStore, testStore } from '../../merchant/stores';
import type { Order } from '../../merchant/domain';
import type { Product } from '../../merchant/catalog';
import type { Customer } from '../../merchant/workspace';
import { Badge, Button, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Modal, Select, useToast } from '../../../ds/kit';
import { exportLogStore, templatesStore } from './store';
import { ENTITY_LABEL, ROW_MODE_LABEL, addLog, buildSheet, defaultTemplate, fileName, nextLogId, sheetCsv, type Data, type Entity, type Sheet, type Template, type Trigger } from './model';

export const exportsHref = (q?: Record<string, string | undefined>) => link('/dashboard/settings/exports', q);

/** Everything a template reads, as the current role may see it (contact details masked without customer.contact). */
export function useExportData(): Data {
  const orders = ordersStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const customers = customersStore.use();
  const role = testStore.use().role;
  return useMemo(() => ({ orders, products, levels, customers, contact: can(role, 'customer.contact'), now: Date.now() }), [orders, products, levels, customers, role]);
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download a sheet and record it in the export log (and the account activity log). Returns the log id. */
export function runExport(t: Template, sheet: Sheet, trigger: Trigger, scope?: string[]): string {
  const at = new Date().toISOString();
  const csv = sheetCsv(sheet);
  const file = fileName(t, at);
  const id = nextLogId(exportLogStore.get());
  download(file, csv);
  exportLogStore.set((l) => addLog(l, { id, at, by: currentActor().name, entity: t.entity, templateId: t.id, templateName: t.name, rows: sheet.rows.length, file, trigger, status: 'ready', csv, snapshot: t, scope }));
  const area = t.entity === 'orders' ? 'orders' : t.entity === 'products' ? 'products' : 'store';
  logAction(area, { ar: `صدّر ${sheet.rows.length} سطرًا من ${ENTITY_LABEL[t.entity].ar} بقالب «${t.name}»`, en: `Exported ${sheet.rows.length} ${t.entity} rows with “${t.name}”` }, { target: id });
  return id;
}

/** The first rows of a sheet as they will appear in the file. Scrolls inside its own box on phones. */
export function SheetPreview({ sheet, max = 5 }: { sheet: Sheet; max?: number }) {
  const tx = useTx();
  return (
    <div>
      <div className="scrollbar-thin max-h-64 overflow-auto rounded-xl border border-border" tabIndex={0} role="region" aria-label={tx('معاينة أول الأسطر', 'Preview of the first rows')}>
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-surface-2 text-muted"><tr>{sheet.head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-start font-semibold"><bdi>{h || '—'}</bdi></th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {sheet.rows.slice(0, max).map((r, ri) => <tr key={ri}>{r.map((v, i) => <td key={i} className="max-w-[14rem] truncate whitespace-nowrap px-3 py-1.5 text-fg"><bdi>{String(v)}</bdi></td>)}</tr>)}
          </tbody>
        </table>
        {sheet.rows.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted">{tx('لا أسطر تطابق.', 'No rows match.')}</p>}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{tx(`أول ${Math.min(max, sheet.rows.length)} من ${sheet.rows.length} سطرًا`, `First ${Math.min(max, sheet.rows.length)} of ${sheet.rows.length} rows`)}</span>
        {sheet.masked && <Badge tone="amber" icon={<EyeOff className="size-3" aria-hidden="true" />}>{tx('التواصل مخفي لدورك', 'Contact hidden for your role')}</Badge>}
      </p>
    </div>
  );
}

/**
 * Export from a list: choose the default columns or a saved template, preview the first rows, then download.
 * The list's selection or filters define the records; the template defines columns, headers and row layout.
 */
export function ExportDialog({ entity, records, scopeLabel, onClose }: {
  entity: Entity; records: { orders?: Order[]; products?: Product[]; customers?: Customer[] }; scopeLabel: string; onClose: (rows: number | null) => void;
}) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const data = useExportData();
  const all = templatesStore.use().filter((t) => t.entity === entity);
  const [id, setId] = useState('default');
  const t = id === 'default' ? defaultTemplate(entity, lang) : all.find((x) => x.id === id) ?? defaultTemplate(entity, lang);
  const sheet = useMemo(() => buildSheet(t, data, records), [t, data, records]);
  const go = () => {
    const scope = records.orders?.map((o) => o.ref) ?? records.products?.map((p) => p.id) ?? records.customers?.map((c) => c.id);
    runExport(t, sheet, 'section', scope);
    toast({ tone: 'ok', text: tx(`نُزّل ${sheet.rows.length} سطرًا · في سجل التصدير`, `${sheet.rows.length} rows downloaded · in the export log`) });
    onClose(sheet.rows.length);
  };
  return (
    <Modal size="lg" title={tx(`تصدير ${ENTITY_LABEL[entity].ar}`, `Export ${ENTITY_LABEL[entity].en.toLowerCase()}`)} description={scopeLabel} onClose={() => onClose(null)}
      footer={<>
        <a href={exportsHref({ entity })} className="me-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300"><Settings2 className="size-4" aria-hidden="true" />{tx('إدارة القوالب', 'Manage templates')}</a>
        <Button variant="secondary" onClick={() => onClose(null)}>{tx('إلغاء', 'Cancel')}</Button>
        <Button onClick={go} disabled={!sheet.rows.length}><Download className="size-4" aria-hidden="true" />{tx(`نزّل ${sheet.rows.length} سطرًا`, `Download ${sheet.rows.length} rows`)}</Button>
      </>}>
      <Field label={tx('القالب', 'Template')}>
        {(p) => (
          <Select {...p} value={id} onChange={(e) => setId(e.target.value)}>
            <option value="default">{tx('الأعمدة الافتراضية', 'Default columns')}</option>
            {all.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        )}
      </Field>
      <p className={cn('flex flex-wrap items-center gap-2 text-xs text-muted')}>
        <FileSpreadsheet className="size-4" aria-hidden="true" />
        <span>{tx(`${t.cols.length} عمودًا · ${ROW_MODE_LABEL[entity][t.rows].ar} · عناوين ${t.headerLang === 'ar' ? 'عربية' : 'إنجليزية'}`, `${t.cols.length} columns · ${ROW_MODE_LABEL[entity][t.rows].en} · ${t.headerLang === 'ar' ? 'Arabic' : 'English'} headers`)}</span>
      </p>
      {id !== 'default' && (t.period.preset !== 'all' || Object.values(t.filters).some(Boolean)) && <Alert tone="info">{tx('التصفية والفترة في القالب لا تُطبّق هنا: السجلات هي ما اخترته في القائمة.', 'The template’s filters and period are not applied here: the records are what you chose in the list.')}</Alert>}
      <SheetPreview sheet={sheet} />
      <p className="text-xs text-muted">{tx('ملف CSV بترميز UTF-8 يفتح في Excel بالعربية. لا يتغير شيء في البيانات.', 'A UTF-8 CSV that opens in Excel with Arabic intact. Nothing in your data changes.')}</p>
    </Modal>
  );
}

/**
 * The products list's quick column picker as a one-off template: same import-compatible headers, previewed and logged
 * like any template export.
 */
export function quickProductExport(rows: Product[], cols: string[], perVariant: boolean, headers: Record<string, string>, data: Data): { t: Template; sheet: Sheet } {
  const t: Template = { ...defaultTemplate('products', 'en'), id: 'quick', name: 'Quick export', rows: perVariant ? 'line' : 'one', cols: cols.map((k) => ({ key: k, ar: headers[k] ?? k, en: headers[k] ?? k })) };
  return { t, sheet: buildSheet(t, data, { products: rows }) };
}
