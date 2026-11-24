// Count import (`#/dashboard/inventory/import`): upload a stock count (sku, location_id, on_hand) → the difference per SKU
// and location against what the system holds now → confirm → every changed line is an adjustment with reason "count".
// Nothing is written before the confirmation. Rules: ./model (checkCount) and merchant/inventory.ts (adjust).
import { useMemo, useState } from 'react';
import { CheckCircle2, Download, Ban, Equal } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { LOCATIONS } from '../../merchant/domain';
import { toCsv } from '../../merchant/catalog';
import { adjust } from '../../merchant/inventory';
import { can } from '../../merchant/perms';
import { levelsStore, productsStore, stockLogStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, ErrorState, LinkButton, Ref, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, Input, Modal, PageHeader, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { NoAccess, ReviewTools, Stepper, downloadText, ihref, useRole } from '../products/common';
import { FilePicker } from '../products/import';
import { checkCount, infoFor, levelRows, levelsCsv, nextAdjId, skuInfo, type CountRow } from './model';
import { SkuCell } from './parts';

type Stage = { name: string; headers: string[]; rows: string[][] } | null;
/** The uploaded file stays for this session, so leaving the page and coming back keeps the preview. */
let kept: Stage = null;

export default function CountImport() {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = useRole();
  const toast = useToast();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const info = useMemo(() => skuInfo(products), [products]);
  const [file, setFile] = useState<Stage>(kept);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<{ lines: number; units: number; conflicts: number } | null>(null);
  const back = { href: ihref(), label: tx('المخزون', 'Inventory') };
  const header = <PageHeader back={back} title={tx('استيراد جرد', 'Import a stock count')} description={tx('لا يُكتب شيء قبل التأكيد.', 'Nothing is written before you confirm.')} />;
  if (!can(role, 'inventory.adjust')) return <NoAccess title={tx('لا تملك صلاحية تعديل المخزون', 'You can’t adjust stock')} back={back}>{tx('اطلب الصلاحية من مالك المتجر.', 'Ask the store owner for access.')}</NoAccess>;
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<Skeleton className="h-64 rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر فتح الاستيراد', 'Import could not open')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-CNT-503.', 'Nothing changed. Ref SIM-CNT-503.')}</ErrorState></Card></div>;

  const known = new Set(levels.map((l) => l.sku).concat(products.flatMap((p) => [p.sku, ...p.variants.map((v) => v.sku)])).map((s) => s.toUpperCase()));
  const rows = file ? checkCount(file.rows, file.headers, levels, known) : [];
  const bad = rows.filter((r) => r.problem);
  const changes = rows.filter((r) => !r.problem && r.delta !== 0);
  const same = rows.filter((r) => !r.problem && r.delta === 0);
  const setStage = (s: Stage) => { kept = s; setFile(s); setDone(null); };
  const template = () => downloadText('stock-count.csv', toCsv(levelsCsv(levelRows(levels, info, { q: '', loc: '' }), (id) => LOCATIONS[id].en)));
  const problemText = (p: CountRow['problem']) => p && ({ sku: tx('SKU غير موجود', 'Unknown SKU'), loc: tx('موقع غير معروف أو معطّل', 'Unknown or disabled location'), qty: tx('كمية غير صالحة', 'Invalid quantity'), dup: tx('مكرر في الملف', 'Repeated in the file') })[p];

  const apply = () => {
    let ls = levelsStore.get();
    const log = [...stockLogStore.get()];
    let lines = 0, units = 0, conflicts = 0;
    for (const r of changes) {
      const id = nextAdjId(log);
      const cur = ls.find((l) => l.sku === r.sku && l.loc === r.loc);
      const base = cur ? ls : [...ls, { sku: r.sku, loc: r.loc, onHand: 0, reserved: 0, incoming: 0, version: 0, threshold: 3 }];
      const now = base.find((l) => l.sku === r.sku && l.loc === r.loc)!;
      // The difference is recomputed against the level as it is now, so a sale since the preview is not overwritten blindly.
      if (now.onHand !== r.before) { conflicts++; continue; }
      const res = adjust(base, r.sku, r.loc, r.delta, 'count', now.version, 'You', id, note.trim() || (file?.name ?? ''));
      if (res.error) { conflicts++; continue; }
      ls = res.levels;
      log.unshift(res.log!);
      lines++; units += Math.abs(r.delta);
    }
    levelsStore.set(ls);
    stockLogStore.set(log);
    setConfirm(false);
    setDone({ lines, units, conflicts });
    kept = null;
    toast({ tone: 'ok', text: tx(`سُجّل ${lines} تعديل جرد`, `${lines} count adjustments logged`) });
  };

  const cols: Column<CountRow>[] = [
    { key: 'p', header: tx('المنتج', 'Product'), cell: (r) => <SkuCell sku={r.sku} info={infoFor(info, r.sku)} sub={LOCATIONS[r.loc][lang]} />, className: 'max-w-80' },
    { key: 'b', header: tx('في النظام', 'In system'), align: 'end', cell: (r) => <span className="tabular-nums text-muted">{r.before}</span> },
    { key: 'c', header: tx('المعدود', 'Counted'), align: 'end', cell: (r) => <span className="font-semibold tabular-nums">{r.counted}</span> },
    { key: 'd', header: tx('الفرق', 'Difference'), align: 'end', cell: (r) => <bdi dir="ltr" className={cn('font-bold tabular-nums', r.delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{r.delta > 0 ? '+' : ''}{r.delta}</bdi> },
  ];
  const step = done ? 2 : file ? 1 : 0;

  return (
    <div className="space-y-6">
      {header}
      <Stepper steps={[tx('الملف', 'File'), tx('مراجعة الفروق', 'Review differences'), tx('النتيجة', 'Result')]} current={step} label={tx('خطوات استيراد الجرد', 'Count import steps')} />
      {done ? (
        <Card>
          <CardHeader title={tx('اكتمل استيراد الجرد', 'Count import finished')} />
          <div className="space-y-4 px-5 pb-5">
            <Alert tone={done.conflicts ? 'warn' : 'ok'} title={tx(`${done.lines} سطرًا عُدّل · ${done.units} وحدة`, `${done.lines} lines adjusted · ${done.units} units`)}>
              {done.conflicts ? tx(`${done.conflicts} أسطر تغيّرت بعد المعاينة فلم نكتب فوقها. أعد رفع الملف لها.`, `${done.conflicts} lines changed after the preview, so we did not overwrite them. Upload the file again for them.`) : tx('كل سطر في السجل بسبب «تصحيح جرد».', 'Every line is in the log with the reason “Count correction”.')}
            </Alert>
            <div className="flex flex-wrap gap-2"><LinkButton href={ihref('', { tab: 'log' })}>{tx('افتح سجل الحركة', 'Open the stock log')}</LinkButton><Button variant="ghost" onClick={() => setStage(null)}>{tx('جرد جديد', 'New count')}</Button></div>
          </div>
        </Card>
      ) : !file ? (
        <Card>
          <CardHeader title={tx('ارفع ملف الجرد', 'Upload the count file')} hint={tx('الأعمدة: sku وlocation_id وon_hand. يُقرأ في متصفحك فقط.', 'Columns: sku, location_id, on_hand. Read in your browser only.')} action={<Button variant="secondary" size="sm" onClick={template}><Download className="size-4" aria-hidden="true" />{tx('نزّل المستويات الحالية', 'Download current levels')}</Button>} />
          <div className="px-5 pb-5"><FilePicker onRead={(name, headers, r) => setStage({ name, headers, rows: r })} /></div>
        </Card>
      ) : (
        <Card>
          <CardHeader title={<>{tx('الفروق قبل الكتابة', 'Differences before writing')} · <Ref>{file.name}</Ref></>} action={<Button variant="ghost" size="sm" onClick={() => setStage(null)}>{tx('ملف آخر', 'Another file')}</Button>} />
          <dl className="grid grid-cols-3 gap-3 px-5 pb-4">
            {([[tx('سيتغير', 'Will change'), changes.length, 'text-brand-700 dark:text-brand-300', CheckCircle2], [tx('مطابق', 'Matches'), same.length, 'text-muted', Equal], [tx('مشكلة', 'Problem'), bad.length, 'text-red-600 dark:text-red-400', Ban]] as const).map(([l, n, c, I]) => (
              <div key={l} className="flex items-center gap-3 rounded-xl border border-border p-3"><I className={cn('size-5 shrink-0', c)} aria-hidden="true" /><div><dt className="text-xs text-muted">{l}</dt><dd className="text-lg font-bold tabular-nums text-fg">{n}</dd></div></div>
            ))}
          </dl>
          {bad.length > 0 && (
            <div className="px-5 pb-4"><Alert tone="bad" title={tx(`${bad.length} أسطر لن تُكتب`, `${bad.length} lines won’t be written`)}>
              <ul className="mt-1 space-y-0.5">{bad.slice(0, 6).map((r) => <li key={r.line}>{tx('السطر', 'Line')} {r.line} · <bdi dir="ltr">{r.sku || '—'}</bdi> · {problemText(r.problem)}</li>)}</ul>
            </Alert></div>
          )}
          {changes.length > 0 ? <div className="border-t border-border"><DataTable label={tx('الفروق', 'Differences')} rows={changes.slice(0, 100)} columns={cols} rowKey={(r) => `${r.sku}@${r.loc}`}
            card={(r) => <div className="flex items-center justify-between gap-2"><SkuCell sku={r.sku} info={infoFor(info, r.sku)} sub={LOCATIONS[r.loc][lang]} /><span className="text-end text-xs text-muted"><bdi dir="ltr" className="tabular-nums">{r.before} → {r.counted}</bdi><br /><Badge tone={r.delta > 0 ? 'green' : 'red'}><bdi dir="ltr">{r.delta > 0 ? '+' : ''}{r.delta}</bdi></Badge></span></div>} /></div>
            : <p className="border-t border-border px-5 py-6 text-center text-sm text-muted">{tx('لا فروق: كل الأسطر الصالحة مطابقة للنظام.', 'No differences: every valid line matches the system.')}</p>}
          <div className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-4">
            <Field label={tx('ملاحظة للسجل', 'Note for the log')} optional className="min-w-0 flex-1">{(p) => <Input {...p} value={note} placeholder={tx('مثل: جرد نهاية الشهر', 'e.g. Month-end count')} onChange={(e) => setNote(e.target.value)} />}</Field>
            <Button onClick={() => setConfirm(true)} disabled={changes.length === 0}>{tx(`سجّل ${changes.length} تعديلًا`, `Record ${changes.length} adjustments`)}</Button>
          </div>
        </Card>
      )}
      <ReviewTools />
      {confirm && (
        <Modal title={tx('تأكيد تعديلات الجرد', 'Confirm count adjustments')} onClose={() => setConfirm(false)}
          description={tx(`${changes.length} سطرًا بسبب «تصحيح جرد». الفرق يُعاد حسابه لحظة الكتابة.`, `${changes.length} lines with reason “Count correction”. Each difference is re-checked at write time.`)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={apply}>{tx('سجّل التعديلات', 'Record adjustments')}</Button></>}>
          <ul className="space-y-1 text-sm text-muted">
            <li>{tx(`زيادة: ${changes.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0)} وحدة`, `Up: ${changes.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0)} units`)}</li>
            <li>{tx(`نقص: ${-changes.filter((r) => r.delta < 0).reduce((s, r) => s + r.delta, 0)} وحدة`, `Down: ${-changes.filter((r) => r.delta < 0).reduce((s, r) => s + r.delta, 0)} units`)}</li>
            {bad.length > 0 && <li>{tx(`${bad.length} سطرًا فيه مشكلة لن يُكتب`, `${bad.length} lines with a problem are not written`)}</li>}
          </ul>
        </Modal>
      )}
    </div>
  );
}
