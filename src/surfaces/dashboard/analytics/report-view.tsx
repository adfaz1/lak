// Generic report view: headline metrics with definitions and comparison, notes, and tables that export as CSV.
// Every report in ./reports.ts renders through this, so definitions, "no data" and export behave the same everywhere.
import { Download, BarChart3 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { productsStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, Delta, EmptyState, InfoHint, Money, ProductImage, cn, useTx } from '../../../ds/ui';
import { Alert, useToast } from '../../../ds/kit';
import { productPhoto } from '../model/media';
import { downloadCsv } from '../finance/download';
import { useDay } from './period';
import { metricsCsv, tableCsv, type Cell, type Col, type Metric, type Report, type Table } from './reports';
import type { CompareMode, Range } from './range';

export function MetricValue({ m, v }: { m: Pick<Metric, 'unit'>; v: number | null }) {
  if (v === null) return null;
  if (m.unit === 'money') return <Money v={v} />;
  if (m.unit === 'percent') return <bdi dir="ltr">{v}%</bdi>;
  return <>{v.toLocaleString('en-US')}</>;
}

export function MetricCards({ metrics, compare }: { metrics: Metric[]; compare: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  return (
    <section aria-label={tx('مؤشرات التقرير', 'Report figures')} className={cn('grid grid-cols-2 gap-3 sm:gap-4', metrics.length % 4 === 0 ? 'lg:grid-cols-4' : metrics.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-3')}>
      {metrics.map((m, i) => (
        <div key={m.id} className={cn('rounded-2xl border border-border bg-surface p-4 sm:p-5', metrics.length % 2 === 1 && i === metrics.length - 1 && 'col-span-2 lg:col-span-1')}>
          <p className="flex items-center gap-1 text-[13px] font-medium text-muted">{m.label[lang]}<InfoHint>{m.hint[lang]}</InfoHint></p>
          <p className="mt-1 text-xl font-bold tracking-tight text-fg tabular-nums sm:text-2xl">
            {m.value === null ? <span className="text-base font-semibold text-muted">{tx('لا بيانات', 'No data')}</span> : <MetricValue m={m} v={m.value} />}
          </p>
          {compare && m.value !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {m.delta !== null ? <><Delta v={m.delta} invert={m.invert} /><span className="text-muted">{tx('مقابل', 'vs')} <MetricValue m={m} v={m.prev} /></span></>
                : m.prev === null ? <span className="text-muted">{tx('لا بيانات للمقارنة', 'No comparison data')}</span>
                  : <span className="text-muted">{tx('مقابل', 'vs')} <MetricValue m={m} v={m.prev} /></span>}
            </div>
          )}
          {m.href && m.act && <a href={m.href} className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{m.act[lang]}</a>}
        </div>
      ))}
    </section>
  );
}

function CellView({ c, v, pid, href, hint }: { c: Col; v: Cell; pid?: string; href?: string; hint?: Cell }) {
  const { lang } = useLang();
  const tx = useTx();
  const day = useDay();
  const products = productsStore.use();
  if (c.unit === 'product') {
    const name = typeof v === 'object' && v ? v[lang] : String(v ?? '');
    return <span className="flex w-[9rem] min-w-0 items-center gap-2.5 sm:w-[14rem]"><ProductImage src={pid ? productPhoto(pid) : undefined} alt={name} size={36} /><span className="truncate font-medium text-fg">{products.find((p) => p.id === pid)?.name[lang] ?? name}</span></span>;
  }
  if (c.unit === 'action') return v && typeof v === 'object' && href ? <a href={href} className="whitespace-nowrap text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{v[lang]}</a> : <span className="text-subtle">—</span>;
  if (v === null || v === undefined) return <span className="text-subtle" title={tx('لا بيانات', 'No data')}>—</span>;
  if (typeof v === 'object') return <span className="inline-flex items-center gap-1">{v[lang]}{hint && typeof hint === 'object' ? <InfoHint>{hint[lang]}</InfoHint> : null}</span>;
  if (c.unit === 'money' && typeof v === 'number') return <Money v={v} />;
  if (c.unit === 'percent') return <bdi dir="ltr" className="tabular-nums">{v}%</bdi>;
  if (c.unit === 'delta') return <Delta v={typeof v === 'number' ? v : null} />;
  if (c.unit === 'count' && typeof v === 'number') return <span className="tabular-nums">{v.toLocaleString('en-US')}</span>;
  if (c.key === 'day' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return <>{day(v)}</>;
  return <bdi>{v}</bdi>;
}

export function ReportTable({ t, meta, file }: { t: Table; meta: { from: string; to: string; cmp: string }; file: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const exportCsv = () => {
    downloadCsv(`${file}-${meta.from}-${meta.to}.csv`, tableCsv(t, lang, meta));
    toast({ tone: 'ok', text: tx(`نُزّل الجدول · ${t.rows.length} صف`, `Table downloaded · ${t.rows.length} rows`) });
  };
  const hide = (c: Col) => (c.hideOnPhone ? 'hidden md:table-cell' : '');
  return (
    <Card aria-labelledby={`h-${t.id}`}>
      <CardHeader id={`h-${t.id}`} title={t.title[lang]} hint={t.hint[lang]}
        action={<Button size="sm" variant="secondary" onClick={exportCsv} disabled={!t.rows.length}><Download className="size-4" aria-hidden="true" />CSV</Button>} />
      {t.rows.length === 0 ? <EmptyState icon={<BarChart3 className="size-6" aria-hidden="true" />} title={t.empty[lang]} /> : (
        <div className="scrollbar-thin max-h-[480px] overflow-auto border-t border-border">
          <table className="w-full min-w-0 text-sm">
            <caption className="sr-only">{t.title[lang]}</caption>
            <thead className="sticky top-0 z-10 bg-surface text-xs text-muted shadow-[0_1px_0_var(--border)]">
              <tr>
                {t.cols.map((c, i) => (
                  <th key={c.key} scope="col" className={cn('py-3 font-semibold', i === 0 ? 'ps-5 pe-3 text-start' : i === t.cols.length - 1 ? 'ps-3 pe-5' : 'px-3', c.end ? 'text-end' : 'text-start', hide(c))}>
                    <span className={cn('inline-flex items-center gap-1', c.end && 'flex-row-reverse')}>{c.label[lang]}{c.hint && <InfoHint>{c.hint[lang]}</InfoHint>}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.rows.map((r, ri) => (
                <tr key={ri} className={cn('hover:bg-surface-2/50', r._strong ? 'bg-surface-2/40 font-semibold' : '')}>
                  {t.cols.map((c, i) => {
                    const El = i === 0 ? 'th' : 'td';
                    return (
                      <El key={c.key} {...(i === 0 ? { scope: 'row' } : {})} className={cn('py-2.5', i === 0 ? 'max-w-[9.5rem] ps-5 pe-3 text-start font-medium text-fg sm:max-w-[14rem]' : i === t.cols.length - 1 ? 'ps-3 pe-5' : 'px-3', c.end ? 'text-end' : 'text-start', i > 0 && 'whitespace-nowrap', hide(c))}>
                        <CellView c={c} v={r[c.key]} pid={typeof r._pid === 'string' ? r._pid : undefined} href={typeof r[`_href:${c.key}`] === 'string' ? (r[`_href:${c.key}`] as string) : undefined} hint={i === 0 ? r._hint : undefined} />
                      </El>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function ReportView({ rep, range, cmp, compareOn, extra }: { rep: Report; range: Range; cmp: CompareMode; compareOn: boolean; extra?: React.ReactNode }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const meta = { from: range.from, to: range.to, cmp };
  const exportMetrics = () => { downloadCsv(`lak-${rep.id}-summary-${range.from}-${range.to}.csv`, metricsCsv(rep, lang, meta)); toast({ tone: 'ok', text: tx('نُزّل ملخص التقرير', 'Report summary downloaded') }); };
  return (
    <div className="space-y-6">
      <MetricCards metrics={rep.metrics} compare={compareOn} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge>{tx('المصدر: ', 'Source: ')}{rep.source[lang]}</Badge>
        <button type="button" onClick={exportMetrics} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline dark:text-brand-300"><Download className="size-3.5" aria-hidden="true" />{tx('نزّل الملخص CSV', 'Download summary CSV')}</button>
      </div>
      {rep.notes.map((n, i) => <Alert key={i} tone="info">{n[lang]}</Alert>)}
      {extra}
      {rep.tables.map((t) => <ReportTable key={t.id} t={t} meta={meta} file={`lak-${t.id}`} />)}
    </div>
  );
}
