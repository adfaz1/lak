// CSV import wizard (`#/dashboard/products/import`): template → file → mapping → validation → conflicts → confirm →
// background job → result and error report. Reuses the import rules in merchant/catalog.ts.
// Wizard state lives in a session store so the job keeps running if the merchant leaves the page.
import { useRef, useState, type ReactNode } from 'react';
import { Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Copy, Ban, RefreshCw, SkipForward, ArrowLeft, UploadCloud } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { createStore } from '../../../core/store';
import {
  IMPORT_FIELDS, REQUIRED_FIELDS, TEMPLATE_HEADERS, errorReportRows, parseCsv, planImport, sampleFile, suggestMapping, takenSkus, toCsv, validateImport,
  validateMapping, type ConflictPolicy, type ImportField, type ImportPlan, type RowProblem,
} from '../../merchant/catalog';
import { LOCATIONS, LOC_IDS, type LocId } from '../../merchant/domain';
import { can } from '../../merchant/perms';
import { categoriesStore, levelsStore, productsStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, ErrorState, InfoHint, LinkButton, Ref, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, DataTable, Modal, PageHeader, Select, Switch, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { applyImportBatchX, canStartImport, cellProblems, checkImportFile, extendImport, importWork, type CheckedRowX, type ImportFileProblem, type SaveRule } from './model';
import { NoAccess, ReviewTools, Stepper, downloadText, phref, useRole } from './common';

type FileKind = 'large' | 'small' | 'device';
interface Job { total: number; done: number; running: boolean; created: number; updated: number; plan: ImportPlan; file: FileKind }
interface State {
  step: number; file: FileKind | null; fileName: string; headers: string[]; rows: string[][]; mapping: ImportField[]; policy: ConflictPolicy;
  rule: SaveRule; loc: LocId; job: Job | null;
}
const init = (): State => ({ step: 0, file: null, fileName: '', headers: [], rows: [], mapping: [], policy: 'skip', rule: 'valid', loc: 'ryd', job: null });
const importStore = createStore.key('dashboard.productsImport')<State>(init);
let timer: ReturnType<typeof setInterval> | null = null;

function startJob(plan: ImportPlan, file: FileKind, loc: LocId) {
  const work = importWork(plan);
  importStore.set((s) => ({ ...s, step: 6, job: { total: work.length, done: 0, running: work.length > 0, created: 0, updated: 0, plan, file } }));
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    const s = importStore.get();
    if (!s.job || !s.job.running) { if (timer) clearInterval(timer); timer = null; return; }
    const batch = work.slice(s.job.done, s.job.done + 50);
    const r = applyImportBatchX(productsStore.get(), levelsStore.get(), batch as { kind: 'create' | 'update'; row: CheckedRowX }[], loc);
    productsStore.set(r.products);
    levelsStore.set(r.levels);
    const done = s.job.done + batch.length;
    importStore.set((x) => ({ ...x, job: x.job && { ...x.job, done, running: done < work.length, created: x.job.created + r.created, updated: x.job.updated + r.updated } }));
  }, 160);
}

export default function ImportWizard() {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = useRole();
  const s = importStore.use();
  const [confirm, setConfirm] = useState(false);
  const set = (p: Partial<State>) => importStore.set((x) => ({ ...x, ...p }));
  const back = { href: phref(), label: tx('المنتجات', 'Products') };
  const steps = [tx('الملف النموذجي', 'Template'), tx('الملف', 'File'), tx('مطابقة الحقول', 'Map fields'), tx('التحقق', 'Validate'), tx('التعارض', 'Conflicts'), tx('التأكيد', 'Confirm'), tx('النتيجة', 'Result')];
  const header = <PageHeader back={back} title={tx('استيراد منتجات من CSV', 'Import products from CSV')} description={tx('لا يُكتب شيء قبل التأكيد.', 'Nothing is written before you confirm.')} />;

  if (!can(role, 'product.import')) return <NoAccess title={tx('لا تملك صلاحية الاستيراد', 'You can’t import products')} back={back}>{tx('الاستيراد متاح لمالك المتجر.', 'Importing is available to the store owner.')}</NoAccess>;
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-72 w-full rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر فتح الاستيراد', 'Import could not open')} onRetry={() => setDashState('live')}>{tx('لم يُستورد شيء. المرجع SIM-IMP-503.', 'Nothing was imported. Ref SIM-IMP-503.')}</ErrorState></Card></div>;

  const fieldName: Record<ImportField, string> = {
    name: tx('الاسم', 'Name'), sku: 'SKU', price: tx('السعر', 'Price'), compareAt: tx('السعر قبل الخصم', 'Compare-at price'),
    qty: tx('الكمية', 'Quantity'), status: tx('الحالة', 'Status'), ignore: tx('تجاهل العمود', 'Ignore column'),
    nameAr: tx('الاسم بالعربية', 'Arabic name'), cost: tx('التكلفة', 'Cost'), category: tx('الفئة', 'Category'),
  };
  const problem = (c: RowProblem | 'duplicate' | 'exists') => ({
    nameMissing: tx('الاسم مفقود', 'Name missing'), skuMissing: tx('SKU مفقود', 'SKU missing'), price: tx('سعر غير صالح', 'Invalid price'),
    compareAt: tx('السعر قبل الخصم غير صالح أو ليس أعلى', 'Compare-at invalid or not higher'), qty: tx('كمية غير صالحة', 'Invalid quantity'),
    status: tx('حالة غير معروفة', 'Unknown status'), cost: tx('تكلفة غير صالحة', 'Invalid cost'), category: tx('فئة غير موجودة في متجرك', 'Category not in your store'), duplicate: tx('مكرر في الملف؛ أُبقي السطر', 'Duplicate in file; kept line'), exists: tx('SKU موجود؛ تُخطّي', 'SKU exists; skipped'),
  })[c];

  const existing = takenSkus(productsStore.get());
  const checking = s.step >= 3 && s.step < 6;
  const checked = checking ? extendImport(s.rows, s.mapping, validateImport(s.rows, s.mapping, existing), categoriesStore.get()) : [];
  const plan = checking ? planImport(checked, s.policy) : s.job?.plan;
  const mapCheck = validateMapping(s.mapping);
  const loc = LOC_IDS.includes(s.loc) ? s.loc : LOC_IDS[0];
  const choose = (file: 'large' | 'small') => {
    const [headers, ...rows] = parseCsv(sampleFile(file, [...existing]));
    set({ file, fileName: file === 'large' ? 'catalog-1000.csv' : 'new-arrivals.csv', headers, rows, mapping: suggestMapping(headers), step: 2 });
  };
  const fromDevice = (name: string, headers: string[], rows: string[][]) => set({ file: 'device', fileName: name, headers, rows, mapping: suggestMapping(headers), step: 2 });
  const report = (p: ImportPlan) => downloadText('import-errors.csv', toCsv(errorReportRows(p, problem, lang === 'ar' ? ['السطر', 'SKU', 'الحقل', 'القيمة', 'المشكلة'] : ['line', 'sku', 'field', 'value', 'problem'])));
  const nav = (prev: number | null, next: { label: string; onClick: () => void; disabled?: boolean } | null) => (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
      {prev !== null ? <Button variant="ghost" onClick={() => set({ step: prev })}>{tx('رجوع', 'Back')}</Button> : <span />}
      {next && <Button onClick={next.onClick} disabled={next.disabled}>{next.label}<ArrowLeft className="size-4 ltr:rotate-180" aria-hidden="true" /></Button>}
    </div>
  );

  return (
    <div className="space-y-6">
      {header}
      <Stepper steps={steps} current={s.step} label={tx('خطوات الاستيراد', 'Import steps')} />

      {s.step === 0 && (
        <Card aria-labelledby="im-0">
          <CardHeader id="im-0" title={tx('ابدأ بالملف النموذجي', 'Start with the template')} />
          <div className="space-y-4 px-5 pb-5">
            <ul className="flex flex-wrap gap-2">
              {TEMPLATE_HEADERS.map((h, i) => <li key={h}><Badge tone={i < 3 ? 'brand' : 'gray'}><bdi dir="ltr">{h}</bdi>{i < 3 && ` · ${tx('مطلوب', 'required')}`}</Badge></li>)}
            </ul>
            <p className="flex items-center gap-1 text-sm text-muted">{tx('الحالة: active أو draft أو archived. الافتراضي مسودة.', 'Status: active, draft or archived. Default is draft.')}<InfoHint>{tx('السعر بالريال شامل الضريبة، مثل 149 أو 149.50. الكمية تُضاف لمستودع الرياض.', 'Price in riyals incl. VAT, e.g. 149 or 149.50. Quantity goes to the Riyadh warehouse.')}</InfoHint></p>
            <Button variant="secondary" onClick={() => downloadText('products-template.csv', toCsv([TEMPLATE_HEADERS, ['Linen shirt', 'SHR-LIN-01', '149.00', '179.00', '12', 'active']]))}><Download className="size-4" aria-hidden="true" />{tx('نزّل الملف النموذجي', 'Download template')}</Button>
          </div>
          {nav(null, { label: tx('التالي: اختر الملف', 'Next: choose file'), onClick: () => set({ step: 1 }) })}
        </Card>
      )}

      {s.step === 1 && (
        <Card aria-labelledby="im-1">
          <CardHeader id="im-1" title={tx('ارفع ملفك', 'Upload your file')} hint={tx('يُقرأ الملف في متصفحك فقط. لا يُرسل إلى أي خادم.', 'The file is read in your browser only. It is not sent to any server.')} />
          <div className="px-5 pb-4"><FilePicker onRead={fromDevice} /></div>
          <p className="px-5 pb-2 text-xs font-semibold text-muted">{tx('أو جرّب ملف مثال', 'Or try a sample file')}</p>
          <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
            {([['large', 'catalog-1000.csv', tx('1000 سطر · أخطاء ومكرر وتعارض', '1000 rows · errors, duplicates, conflicts')], ['small', 'new-arrivals.csv', tx('5 أسطر · أحدها SKU موجود', '5 rows · one existing SKU')]] as const).map(([k, name, desc]) => (
              <button key={k} type="button" onClick={() => choose(k)} className={cn('flex items-center gap-3 rounded-xl border p-4 text-start transition-colors hover:border-brand-300 hover:bg-brand-500/5', s.file === k ? 'border-brand-400' : 'border-border')}>
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><FileSpreadsheet className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-fg"><bdi dir="ltr">{name}</bdi></span><span className="block text-xs text-muted">{desc}</span></span>
              </button>
            ))}
          </div>
          {nav(0, null)}
        </Card>
      )}

      {s.step === 2 && (
        <Card aria-labelledby="im-2">
          <CardHeader id="im-2" title={tx('طابق الأعمدة بحقول المنتج', 'Match columns to product fields')} hint={tx('اقترحنا مطابقة من أسماء الأعمدة؛ راجعها.', 'We suggested a mapping from the column names; review it.')} />
          <p className="px-5 text-sm text-muted">{tx(`قُرئ ${s.rows.length} سطرًا من`, `Read ${s.rows.length} rows from`)} <Ref>{s.fileName}</Ref> · {tx('لم يُستورد شيء بعد', 'nothing imported yet')}</p>
          <ul className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {s.headers.map((h, i) => (
              <li key={`${h}-${i}`} className="rounded-xl border border-border p-3">
                <label htmlFor={`map-${i}`} className="flex items-baseline justify-between gap-2 text-sm"><span className="font-semibold text-fg"><bdi dir="ltr">{h}</bdi></span><span className="truncate text-xs text-subtle">{tx('مثال:', 'e.g.')} <bdi dir="ltr">{s.rows[0]?.[i] || '—'}</bdi></span></label>
                <Select id={`map-${i}`} className="mt-2" value={s.mapping[i]} onChange={(e) => set({ mapping: s.mapping.map((m, j) => (j === i ? e.target.value as ImportField : m)) })}>
                  {IMPORT_FIELDS.map((f) => <option key={f} value={f}>{fieldName[f]}{REQUIRED_FIELDS.includes(f) ? tx(' · مطلوب', ' · required') : ''}</option>)}
                </Select>
              </li>
            ))}
          </ul>
          {(mapCheck.missing.length > 0 || mapCheck.repeated.length > 0) && (
            <div className="px-5 pb-4"><Alert tone="bad">
              {mapCheck.missing.length > 0 && <p>{tx('حقول مطلوبة غير مطابقة: ', 'Required fields not mapped: ')}{mapCheck.missing.map((f) => fieldName[f]).join(tx('، ', ', '))}</p>}
              {mapCheck.repeated.length > 0 && <p>{tx('حقل مطابق لأكثر من عمود: ', 'Field mapped to more than one column: ')}{mapCheck.repeated.map((f) => fieldName[f]).join(tx('، ', ', '))}</p>}
            </Alert></div>
          )}
          {nav(1, { label: tx('تحقق من الأسطر', 'Validate rows'), onClick: () => set({ step: 3 }), disabled: mapCheck.missing.length > 0 || mapCheck.repeated.length > 0 })}
        </Card>
      )}

      {s.step === 3 && plan && (
        <Card aria-labelledby="im-3">
          <CardHeader id="im-3" title={tx('معاينة التحقق', 'Validation preview')} />
          <Tally items={[
            { tone: 'green', icon: <CheckCircle2 className="size-4" />, label: tx('جديد وصالح', 'New, valid'), n: plan.create.length },
            { tone: 'amber', icon: <RefreshCw className="size-4" />, label: tx('SKU موجود في متجرك', 'SKU already in your store'), n: plan.conflicts.length },
            { tone: 'amber', icon: <Copy className="size-4" />, label: tx('مكرر داخل الملف', 'Duplicate in file'), n: plan.duplicates.length },
            { tone: 'red', icon: <Ban className="size-4" />, label: tx('غير صالح', 'Invalid'), n: plan.invalid.length },
          ]} />
          {plan.invalid.length + plan.duplicates.length > 0 && <ProblemTable plan={plan} problem={problem} />}
          <CellGrid rows={checked} mapping={s.mapping} headers={s.headers} raw={s.rows} fieldName={fieldName} problem={problem} />
          <fieldset className="mx-5 mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('عند وجود أسطر غير صالحة', 'When some rows are invalid')}</legend>
            {([['valid', tx('استورد الصالح وتخطَّ غير الصالح', 'Import valid rows, skip invalid ones'), tx('غير الصالح في تقرير الأخطاء.', 'Invalid rows go to the error report.')],
              ['all', tx('لا تستورد شيئًا حتى يصح الملف كله', 'Import nothing until the whole file is valid'), tx('صحّح الملف وارفعه مرة أخرى.', 'Fix the file and upload it again.')]] as const).map(([v, title, desc]) => (
              <label key={v} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors', s.rule === v ? 'border-brand-400 bg-brand-500/5' : 'border-border hover:border-brand-300')}>
                <input type="radio" name="rule" className="mt-1 accent-brand-600" checked={s.rule === v} onChange={() => set({ rule: v })} />
                <span><span className="block text-sm font-semibold text-fg">{title}</span><span className="block text-xs text-muted">{desc}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
            <p className="flex-1 text-sm text-muted">{s.rule === 'valid' ? tx('الأسطر غير الصالحة لن تُستورد وتظهر في التقرير.', 'Invalid rows won’t be imported; they are in the report.') : plan.invalid.length ? tx(`${plan.invalid.length} أسطر غير صالحة: لن يبدأ الاستيراد.`, `${plan.invalid.length} invalid rows: the import won’t start.`) : tx('كل الأسطر صالحة.', 'Every row is valid.')}</p>
            <Button variant="secondary" size="sm" onClick={() => report(plan)}><Download className="size-4" aria-hidden="true" />{tx('تقرير الأخطاء', 'Error report')}</Button>
          </div>
          {nav(2, { label: tx('التالي: التعارض', 'Next: conflicts'), onClick: () => set({ step: 4 }) })}
        </Card>
      )}

      {s.step === 4 && plan && (
        <Card aria-labelledby="im-4">
          <CardHeader id="im-4" title={tx(`ماذا نفعل بـ ${plan.conflicts.length} SKU موجودة؟`, `What to do with ${plan.conflicts.length} existing SKUs?`)} hint={tx('المكرر داخل الملف: نُبقي أول سطر ونتخطى البقية.', 'Duplicates within the file: the first line is kept, the rest skipped.')} />
          <fieldset className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
            <legend className="sr-only">{tx('سياسة التعارض', 'Conflict policy')}</legend>
            {([['skip', <SkipForward key="s" className="size-5" />, tx('تخطَّ الموجود', 'Skip existing'), tx('لا تغيير على منتجاتك الحالية.', 'Your current products stay as they are.')],
              ['update', <RefreshCw key="u" className="size-5" />, tx('حدّث السعر والحالة', 'Update price and status'), tx('ومعهما التكلفة والفئة إن وُجدتا. الاسم والصور والمخزون لا تتغير.', 'Plus cost and category when in the file. Name, images and stock don’t change.')]] as const).map(([v, icon, title, desc]) => (
              <label key={v} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors', s.policy === v ? 'border-brand-400 bg-brand-500/5' : 'border-border hover:border-brand-300')}>
                <input type="radio" name="policy" className="mt-1 accent-brand-600" checked={s.policy === v} onChange={() => set({ policy: v })} />
                <span className="text-brand-600 dark:text-brand-300" aria-hidden="true">{icon}</span>
                <span><span className="block text-sm font-semibold text-fg">{title}</span><span className="block text-xs text-muted">{desc}</span></span>
              </label>
            ))}
          </fieldset>
          {s.mapping.includes('qty') && (
            <div className="flex flex-wrap items-center gap-2 px-5 pb-5 text-sm">
              <label htmlFor="im-loc" className="font-medium text-fg">{tx('الكمية تدخل في', 'Quantities go to')}</label>
              <Select id="im-loc" className="w-auto" value={loc} onChange={(e) => set({ loc: e.target.value })}>{LOC_IDS.map((l) => <option key={l} value={l}>{LOCATIONS[l][lang]}</option>)}</Select>
              <InfoHint>{tx('للمنتجات الجديدة فقط. تعديل مخزون الموجود يتم من المخزون بسبب.', 'New products only. Existing stock changes go through Inventory with a reason.')}</InfoHint>
            </div>
          )}
          {nav(3, { label: tx('التالي: التأكيد', 'Next: confirm'), onClick: () => set({ step: 5 }) })}
        </Card>
      )}

      {s.step === 5 && plan && (
        <Card aria-labelledby="im-5">
          <CardHeader id="im-5" title={tx('راجع قبل الاستيراد', 'Review before importing')} hint={tx('التراجع ليس تلقائيًا: يمكنك أرشفة المنتجات المنشأة لاحقًا، لكن تحديثات الأسعار لا تُعاد آليًا.', 'Undo is not automatic: you can archive created products later, but price updates are not reverted automatically.')} />
          <Tally items={[
            { tone: 'green', icon: <CheckCircle2 className="size-4" />, label: tx('سيُنشأ', 'Will be created'), n: plan.create.length },
            { tone: 'sky', icon: <RefreshCw className="size-4" />, label: tx('سيُحدَّث', 'Will be updated'), n: plan.update.length },
            { tone: 'gray', icon: <SkipForward className="size-4" />, label: tx('سيُتخطى', 'Will be skipped'), n: plan.skipExisting.length + plan.duplicates.length },
            { tone: 'red', icon: <Ban className="size-4" />, label: tx('غير صالح', 'Invalid'), n: plan.invalid.length },
          ]} />
          {!canStartImport(plan, s.rule) && plan.invalid.length > 0 && s.rule === 'all' && <div className="px-5 pb-4"><Alert tone="bad" title={tx('اخترت «لا شيء حتى يصح الملف كله»', 'You chose “nothing until the whole file is valid”')} action={<Button size="sm" variant="secondary" onClick={() => set({ rule: 'valid' })}>{tx('استورد الصالح فقط', 'Import valid rows only')}</Button>}>{tx(`صحّح ${plan.invalid.length} أسطر أو غيّر القاعدة.`, `Fix ${plan.invalid.length} rows or change the rule.`)}</Alert></div>}
          {nav(4, { label: tx('ابدأ الاستيراد', 'Start import'), onClick: () => setConfirm(true), disabled: !canStartImport(plan, s.rule) })}
        </Card>
      )}

      {s.step === 6 && s.job && <Result job={s.job} onReport={() => report(s.job!.plan)} onNew={() => importStore.set(init())} />}

      <ReviewTools />
      {confirm && plan && s.file && (
        <Modal title={tx('تأكيد الاستيراد', 'Confirm import')} onClose={() => setConfirm(false)}
          description={tx(`سيُكتب ${plan.create.length + plan.update.length} سطرًا في الكتالوج.`, `${plan.create.length + plan.update.length} rows will be written to your catalogue.`)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setConfirm(false); startJob(plan, s.file!, loc); }}>{tx(`استورد ${plan.create.length + plan.update.length} سطرًا`, `Import ${plan.create.length + plan.update.length} rows`)}</Button></>}>
          <ul className="space-y-1.5 text-sm text-muted">
            <li>{tx(`${plan.create.length} منتجًا جديدًا بحالة الملف (الافتراضي مسودة)`, `${plan.create.length} new products with the file’s status (draft by default)`)}</li>
            <li>{tx(`${plan.update.length} منتجًا موجودًا: السعر والحالة (والتكلفة والفئة إن وُجدتا)`, `${plan.update.length} existing products: price and status (and cost and category when given)`)}</li>
            {plan.invalid.length > 0 && <li>{tx(`${plan.invalid.length} سطرًا غير صالح يُتخطى ويبقى في التقرير`, `${plan.invalid.length} invalid rows are skipped and stay in the report`)}</li>}
            <li>{tx('يعمل في الخلفية؛ يمكنك مغادرة الصفحة.', 'Runs in the background; you can leave the page.')}</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}

function Tally({ items, flush }: { items: { tone: Tone; icon: ReactNode; label: string; n: number }[]; flush?: boolean }) {
  const tint: Record<Tone, string> = { green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-300', red: 'bg-red-500/10 text-red-600 dark:text-red-400', sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', gray: 'bg-surface-2 text-muted', brand: 'bg-brand-500/10 text-brand-700' };
  return (
    <dl className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', !flush && 'px-5 pb-5')}>
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tint[i.tone])} aria-hidden="true">{i.icon}</span>
          <div className="min-w-0"><dt className="truncate text-xs text-muted">{i.label}</dt><dd className="text-lg font-bold tabular-nums text-fg">{i.n.toLocaleString('en-US')}</dd></div>
        </div>
      ))}
    </dl>
  );
}

function ProblemTable({ plan, problem }: { plan: ImportPlan; problem: (c: RowProblem | 'duplicate' | 'exists') => string }) {
  const tx = useTx();
  const rows = [...plan.invalid, ...plan.duplicates].sort((a, b) => a.line - b.line).slice(0, 8);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'line', header: tx('السطر', 'Line'), cell: (r) => <span className="tabular-nums text-muted">{r.line}</span> },
    { key: 'sku', header: 'SKU', cell: (r) => <Ref>{r.sku || '—'}</Ref> },
    { key: 'p', header: tx('المشكلة', 'Problem'), cell: (r) => (r.problems.length ? r.problems.map((p) => `${problem(p.code)}${p.value ? ` (${p.value})` : ''}`).join(tx('، ', ', ')) : `${problem('duplicate')} ${r.dupOf}`) },
  ];
  return (
    <div className="mx-5 mb-4 overflow-hidden rounded-xl border border-border">
      <p className="flex items-center gap-1.5 border-b border-border bg-surface-2/60 px-4 py-2 text-xs font-semibold text-muted"><AlertTriangle className="size-3.5" aria-hidden="true" />{tx(`أول ${rows.length} أسطر فيها مشكلة`, `First ${rows.length} rows with a problem`)}</p>
      <DataTable label={tx('أسطر فيها مشكلة', 'Rows with a problem')} rows={rows} columns={cols} rowKey={(r) => String(r.line)} />
    </div>
  );
}

function Result({ job, onReport, onNew }: { job: Job; onReport: () => void; onNew: () => void }) {
  const tx = useTx();
  const pct = job.total ? Math.round((job.done * 100) / job.total) : 100;
  const notImported = job.plan.invalid.length + job.plan.duplicates.length + job.plan.skipExisting.length;
  return (
    <Card aria-labelledby="im-6">
      <CardHeader id="im-6" title={job.running ? tx('جارٍ الاستيراد في الخلفية…', 'Importing in the background…') : tx('اكتمل الاستيراد', 'Import finished')} />
      <div className="space-y-4 px-5 pb-5" aria-live="polite">
        <div>
          <div className="flex justify-between text-xs text-muted"><span className="tabular-nums">{job.done.toLocaleString('en-US')} / {job.total.toLocaleString('en-US')}</span><span className="tabular-nums">{pct}%</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done} aria-label={tx('تقدم الاستيراد', 'Import progress')}>
            <div className="h-full rounded-full bg-brand-gradient transition-[width] duration-150" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Tally flush items={[
          { tone: 'green', icon: <CheckCircle2 className="size-4" />, label: tx('أُنشئ', 'Created'), n: job.created },
          { tone: 'sky', icon: <RefreshCw className="size-4" />, label: tx('حُدّث', 'Updated'), n: job.updated },
          { tone: 'gray', icon: <SkipForward className="size-4" />, label: tx('تُخطّي', 'Skipped'), n: job.plan.skipExisting.length + job.plan.duplicates.length },
          { tone: 'red', icon: <Ban className="size-4" />, label: tx('لم يُستورد (أخطاء)', 'Not imported (errors)'), n: job.plan.invalid.length },
        ]} />
        {job.running ? <p className="text-sm text-muted">{tx('يمكنك مغادرة الصفحة؛ يستمر الاستيراد في هذه الجلسة.', 'You can leave this page; the import continues in this session.')}</p> : (
          <>
            {notImported > 0
              ? <Alert tone="warn" title={tx(`${notImported} سطرًا لم يُستورد`, `${notImported} rows were not imported`)}>{tx('التقرير يذكر السطر والحقل والسبب.', 'The report gives the line, field and reason.')}</Alert>
              : <Alert tone="ok">{tx('استُورد كل الأسطر.', 'Every row was imported.')}</Alert>}
            <div className="flex flex-wrap gap-2">
              <LinkButton href={phref('', { q: job.file === 'large' ? 'IMP-' : undefined })}>{tx('افتح المنتجات', 'Open products')}</LinkButton>
              {notImported > 0 && <Button variant="secondary" onClick={onReport}><Download className="size-4" aria-hidden="true" />{tx('نزّل تقرير الأخطاء', 'Download error report')}</Button>}
              <Button variant="ghost" onClick={onNew}>{tx('استيراد جديد', 'New import')}</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/** File input plus drop zone. Reads the merchant's own CSV with FileReader; nothing leaves the browser. */
export function FilePicker({ onRead }: { onRead: (name: string, headers: string[], rows: string[][]) => void }) {
  const tx = useTx();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ name: string; problem: ImportFileProblem | 'read' } | null>(null);
  const msg = (p: ImportFileProblem | 'read') => ({
    type: tx('الملف ليس CSV. احفظه من Excel بصيغة CSV UTF-8.', 'Not a CSV file. Save it from Excel as “CSV UTF-8”.'),
    size: tx('الملف أكبر من 5 ميغابايت. قسّمه إلى ملفين.', 'The file is over 5 MB. Split it into two files.'),
    empty: tx('الملف فارغ.', 'The file is empty.'),
    binary: tx('لا يمكن قراءة الملف كنص. قد يكون ملف Excel (xlsx) أُعيدت تسميته.', 'The file can’t be read as text. It may be an Excel (xlsx) file renamed.'),
    oneColumn: tx('وجدنا عمودًا واحدًا فقط. تأكد أن الفاصل فاصلة.', 'Only one column found. Check the file uses commas.'),
    noRows: tx('في الملف سطر العناوين فقط، بلا منتجات.', 'The file has a header row only, no products.'),
    tooMany: tx('أكثر من 5000 سطر. قسّم الملف.', 'More than 5,000 rows. Split the file.'),
    read: tx('تعذّرت قراءة الملف. جرّب مرة أخرى.', 'The file could not be read. Try again.'),
  })[p];
  const take = (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    const pre = checkImportFile(f.name, f.size, 'x,y\nx,y');
    if (pre.problem === 'type' || pre.problem === 'size') { setErr({ name: f.name, problem: pre.problem }); return; }
    setBusy(true);
    const reader = new FileReader();
    reader.onerror = () => { setBusy(false); setErr({ name: f.name, problem: 'read' }); };
    reader.onload = () => {
      setBusy(false);
      const r = checkImportFile(f.name, f.size, typeof reader.result === 'string' ? reader.result : null);
      if (r.problem) { setErr({ name: f.name, problem: r.problem }); return; }
      onRead(f.name, r.headers, r.rows);
    };
    reader.readAsText(f, 'utf-8');
  };
  return (
    <div className="space-y-3">
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}
        className={cn('flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors', over ? 'border-brand-400 bg-brand-500/5' : 'border-border')}>
        <span className="grid size-12 place-items-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><UploadCloud className="size-6" aria-hidden="true" /></span>
        <p className="text-sm font-semibold text-fg">{busy ? tx('جارٍ قراءة الملف…', 'Reading the file…') : tx('اسحب ملف CSV هنا', 'Drag a CSV file here')}</p>
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>{tx('اختر ملفًا من جهازك', 'Choose a file from your device')}</Button>
        <p className="text-xs text-muted">{tx('CSV حتى 5 ميغابايت و5000 سطر', 'CSV up to 5 MB and 5,000 rows')}</p>
        <input ref={input} type="file" accept=".csv,text/csv,.txt" className="sr-only" tabIndex={-1} aria-label={tx('ملف CSV', 'CSV file')} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {err && <Alert tone="bad" title={<bdi dir="ltr">{err.name}</bdi>}>{msg(err.problem)}</Alert>}
    </div>
  );
}

/** Every mapped cell of the first rows, invalid cells marked, with a switch to show only rows that have a problem. */
function CellGrid({ rows, mapping, raw, fieldName, problem }: { rows: CheckedRowX[]; mapping: ImportField[]; headers: string[]; raw: string[][]; fieldName: Record<ImportField, string>; problem: (c: RowProblem | 'duplicate' | 'exists') => string }) {
  const tx = useTx();
  const [onlyBad, setOnlyBad] = useState(true);
  const cols = mapping.map((f, i) => ({ f, i })).filter((c) => c.f !== 'ignore');
  const list = rows.map((r, idx) => ({ r, idx })).filter(({ r }) => !onlyBad || r.problems.length > 0 || r.dupOf !== null);
  const shown = list.slice(0, 50);
  return (
    <div className="mx-5 mb-4 overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/60 px-4 py-2">
        <p className="text-xs font-semibold text-muted">{tx(`معاينة الخلايا · ${shown.length} من ${list.length}`, `Cell preview · ${shown.length} of ${list.length}`)}</p>
        <label className="flex items-center gap-2 text-xs text-muted"><Switch checked={onlyBad} onChange={setOnlyBad} label={tx('الأسطر التي فيها مشكلة فقط', 'Rows with a problem only')} />{tx('فيها مشكلة فقط', 'Problems only')}</label>
      </div>
      {shown.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">{tx('لا أسطر فيها مشكلة.', 'No rows with a problem.')}</p> : (
        <div className="scrollbar-thin max-h-96 overflow-auto">
          <table className="w-full min-w-[640px] text-[13px]" aria-label={tx('معاينة الخلايا', 'Cell preview')}>
            <thead className="sticky top-0 bg-surface"><tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="px-3 py-2 text-start font-semibold">{tx('السطر', 'Line')}</th>
              {cols.map((c) => <th key={c.i} scope="col" className="px-3 py-2 text-start font-semibold">{fieldName[c.f]}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {shown.map(({ r, idx }) => {
                const bad = cellProblems(r);
                return (
                  <tr key={r.line}>
                    <th scope="row" className="px-3 py-2 text-start font-normal tabular-nums text-muted">{r.line}{r.dupOf !== null && <span className="ms-1"><Badge tone="amber" className="h-5 px-1.5 text-[10px]">{tx('مكرر', 'Dup')}</Badge></span>}</th>
                    {cols.map((c) => {
                      const code = bad[c.f] as RowProblem | undefined;
                      const v = raw[idx]?.[c.i] ?? '';
                      return (
                        <td key={c.i} className={cn('max-w-48 px-3 py-2 align-top', code && 'bg-red-500/8')}>
                          <span className={cn('block truncate', code ? 'font-semibold text-red-700 dark:text-red-300' : 'text-fg')}><bdi>{v || '—'}</bdi></span>
                          {code && <span className="block text-[11px] text-red-700 dark:text-red-300">{problem(code)}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
