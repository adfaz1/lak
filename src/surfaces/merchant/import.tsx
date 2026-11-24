import { useLang } from '../../core/lang';
import { createStore } from '../../core/store';
import { Alert, Badge, Dialog, Field, PageHeader, Sim } from '../../core/ui';
import { LOC_IDS } from './domain';
import {
  IMPORT_FIELDS, REQUIRED_FIELDS, TEMPLATE_HEADERS, errorReportRows, parseCsv, planImport, productFixtures, sampleFile, suggestMapping, takenSkus,
  toCsv, validateImport, validateMapping, type CheckedRow, type ConflictPolicy, type ImportField, type ImportPlan, type Product, type RowProblem,
} from './catalog';
import { can } from './perms';
import { levelsStore, productsStore, testStore } from './stores';
import { ActionLocked, Icon, Progress, Steps, downloadText, mhref, useTx } from './kit';

type FileKind = 'large' | 'small';
interface Job { total: number; done: number; running: boolean; created: number; updated: number; plan: ImportPlan }
interface State { step: number; file: FileKind | null; headers: string[]; rows: string[][]; mapping: ImportField[]; policy: ConflictPolicy; confirm: boolean; job: Job | null }
const init = (): State => ({ step: 0, file: null, headers: [], rows: [], mapping: [], policy: 'skip', confirm: false, job: null });
/** Wizard state lives in a module store so the background job keeps running if you leave the page. */
const importStore = createStore.key('merchant.importStore')<State>(init);
let timer: ReturnType<typeof setInterval> | null = null;

function startJob(plan: ImportPlan) {
  const work: { kind: 'create' | 'update'; row: CheckedRow }[] = [...plan.create.map((row) => ({ kind: 'create' as const, row })), ...plan.update.map((row) => ({ kind: 'update' as const, row }))];
  importStore.set((s) => ({ ...s, step: 6, confirm: false, job: { total: work.length, done: 0, running: true, created: 0, updated: 0, plan } }));
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    const s = importStore.get();
    if (!s.job || !s.job.running) { if (timer) clearInterval(timer); timer = null; return; }
    const batch = work.slice(s.job.done, s.job.done + 60);
    const products = productsStore.get();
    let nextId = Math.max(0, ...products.map((p) => Number(p.id.slice(1)) || 0)) + 1;
    const base = productFixtures()[1];
    const created: Product[] = [];
    const updates = new Map<string, CheckedRow>();
    for (const w of batch) {
      if (w.kind === 'create') {
        created.push({ ...base, id: `p${nextId++}`, name: { ar: w.row.name, en: w.row.name }, sku: w.row.sku, price: w.row.price ?? 0, compareAt: w.row.compareAt, status: w.row.status,
          media: [], cost: null, seo: { title: w.row.name, desc: '', slug: w.row.sku.toLowerCase() }, category: { ar: 'مستورد', en: 'Imported' }, version: 1 });
      } else updates.set(w.row.sku.toUpperCase(), w.row);
    }
    productsStore.set((ps) => [...created, ...ps.map((p) => { const u = updates.get(p.sku.toUpperCase()); return u ? { ...p, price: u.price ?? p.price, status: u.status, version: p.version + 1 } : p; })]);
    const fresh = batch.filter((w) => w.kind === 'create');
    if (fresh.length) levelsStore.set((ls) => [...ls, ...fresh.flatMap((w) => LOC_IDS.map((loc) => ({ sku: w.row.sku, loc, onHand: loc === 'ryd' ? w.row.qty : 0, reserved: 0, incoming: 0, version: 1, threshold: 3 })))]);
    const done = s.job.done + batch.length;
    importStore.set((x) => ({ ...x, job: x.job && { ...x.job, done, running: done < work.length, created: x.job.created + fresh.length, updated: x.job.updated + (batch.length - fresh.length) } }));
  }, 150);
}

export function ImportWizard() {
  const tx = useTx();
  const { lang } = useLang();
  const s = importStore.use();
  const role = testStore.use().role;
  const set = (p: Partial<State>) => importStore.set((x) => ({ ...x, ...p }));
  const fieldName: Record<ImportField, string> = {
    name: tx('الاسم', 'Name'), sku: 'SKU', price: tx('السعر', 'Price'), compareAt: tx('السعر قبل الخصم', 'Compare-at price'),
    qty: tx('الكمية', 'Quantity'), status: tx('الحالة', 'Status'), ignore: tx('تجاهل العمود', 'Ignore column'),
    nameAr: tx('الاسم بالعربية', 'Arabic name'), cost: tx('التكلفة', 'Cost'), category: tx('الفئة', 'Category'),
  };
  const problem = (c: RowProblem | 'duplicate' | 'exists') => ({
    nameMissing: tx('الاسم مفقود', 'Name missing'), skuMissing: tx('SKU مفقود', 'SKU missing'), price: tx('سعر غير صالح', 'Invalid price'),
    compareAt: tx('السعر قبل الخصم غير صالح أو ليس أعلى من السعر', 'Compare-at invalid or not above price'), qty: tx('كمية غير صالحة', 'Invalid quantity'), cost: tx('تكلفة غير صالحة', 'Invalid cost'), category: tx('فئة غير معروفة', 'Unknown category'),
    status: tx('حالة غير معروفة', 'Unknown status'), duplicate: tx('مكرر في الملف؛ أُبقي السطر', 'Duplicate in file; kept line'), exists: tx('SKU موجود ومُتخطّى حسب السياسة', 'SKU exists; skipped by policy'),
  })[c];
  if (!can(role, 'product.import')) return <><a className="back" href={mhref('products')}>{tx('العودة إلى المنتجات', 'Back to products')}</a><ActionLocked>{tx('دورك لا يشمل استيراد المنتجات.', 'Your role does not include importing products.')}</ActionLocked></>;

  const existing = takenSkus(productsStore.get());
  const checked = s.step >= 3 && s.step < 6 ? validateImport(s.rows, s.mapping, existing) : [];
  const plan = s.step >= 3 && s.step < 6 ? planImport(checked, s.policy) : s.job?.plan;
  const mapCheck = validateMapping(s.mapping);
  const stepNames = [tx('الملف النموذجي', 'Template'), tx('الرفع', 'Upload'), tx('مطابقة الحقول', 'Map fields'), tx('التحقق', 'Validate'), tx('سياسة التعارض', 'Conflicts'), tx('التأكيد', 'Confirm'), tx('النتيجة', 'Result')];
  const upload = (file: FileKind) => {
    const [headers, ...rows] = parseCsv(sampleFile(file, [...existing]));
    set({ file, headers, rows, mapping: suggestMapping(headers), step: 2 });
  };
  const report = () => plan && downloadText('import-errors.csv', toCsv(errorReportRows(plan, problem, lang === 'ar' ? ['السطر', 'SKU', 'الحقل', 'القيمة', 'المشكلة'] : ['line', 'sku', 'field', 'value', 'problem'])));

  return (
    <>
      <a className="back" href={mhref('products')}>{tx('العودة إلى المنتجات', 'Back to products')}</a>
      <PageHeader title={tx('استيراد منتجات من CSV', 'Import products from CSV')} sub={tx('«تم الرفع» لا يعني «نجح الاستيراد». لا يُكتب شيء قبل التأكيد.', '“Uploaded” does not mean “imported”. Nothing is written before you confirm.')} />
      <Steps steps={stepNames} current={s.step} label={tx('خطوات الاستيراد', 'Import steps')} />

      {s.step === 0 && (
        <section className="card pad" aria-labelledby="im-0">
          <h2 id="im-0">{tx('ابدأ بالملف النموذجي', 'Start with the template')}</h2>
          <p>{tx('الأعمدة المطلوبة: الاسم وSKU والسعر. الاختيارية: السعر قبل الخصم والكمية والحالة (active/draft/archived).', 'Required columns: name, SKU, price. Optional: compare-at price, quantity, status (active/draft/archived).')}</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => downloadText('products-template.csv', toCsv([TEMPLATE_HEADERS, ['Linen shirt', 'SHR-LIN-01', '149.00', '179.00', '12', 'active']]))}><Icon name="download" size={16} /> {tx('نزّل الملف النموذجي', 'Download template')}</button>
            <button type="button" className="btn primary" onClick={() => set({ step: 1 })}>{tx('التالي: الرفع', 'Next: upload')}</button>
          </div>
        </section>
      )}

      {s.step === 1 && (
        <section className="card pad" aria-labelledby="im-1">
          <h2 id="im-1">{tx('اختر ملفًا', 'Choose a file')} <Sim /></h2>
          <p className="small muted">{tx('في هذه المعاينة نرفع ملف مثال مولّدًا، ولا نقرأ ملفات من جهازك.', 'In this preview a generated sample file is used; no file is read from your device.')}</p>
          <div className="m-choice">
            <button type="button" className="radio" onClick={() => upload('large')}><span className="grow strong"><bdi dir="ltr">catalog-1000.csv</bdi></span><span className="small">{tx('1000 سطر، فيه أخطاء ومكرر وتعارض مع منتجاتك', '1000 rows with errors, duplicates and conflicts with your catalogue')}</span></button>
            <button type="button" className="radio" onClick={() => upload('small')}><span className="grow strong"><bdi dir="ltr">new-arrivals.csv</bdi></span><span className="small">{tx('5 أسطر، أحدها SKU موجود', '5 rows, one with an existing SKU')}</span></button>
          </div>
          <button type="button" className="btn" onClick={() => set({ step: 0 })}>{tx('رجوع', 'Back')}</button>
        </section>
      )}

      {s.step === 2 && (
        <section className="card pad" aria-labelledby="im-2">
          <h2 id="im-2">{tx('طابق أعمدة الملف بحقول المنتج', 'Match file columns to product fields')}</h2>
          <p className="small">{tx(`رُفع ${s.rows.length} سطرًا (غير مستورد بعد). اقترحنا مطابقة؛ راجعها.`, `${s.rows.length} rows uploaded (not imported yet). We suggested a mapping; review it.`)}</p>
          <div className="m-mapgrid">
            {s.headers.map((h, i) => (
              <Field key={h + i} id={`map-${i}`} label={<><bdi dir="ltr">{h}</bdi> <span className="small muted">{tx('مثال:', 'e.g.')} <bdi dir="ltr">{s.rows[0]?.[i] ?? ''}</bdi></span></>}>
                <select id={`map-${i}`} className="input" value={s.mapping[i]} onChange={(e) => set({ mapping: s.mapping.map((m, j) => (j === i ? e.target.value as ImportField : m)) })}>
                  {IMPORT_FIELDS.map((f) => <option key={f} value={f}>{fieldName[f]}{REQUIRED_FIELDS.includes(f) ? tx(' (مطلوب)', ' (required)') : ''}</option>)}
                </select>
              </Field>
            ))}
          </div>
          {mapCheck.missing.length > 0 && <p className="error" role="alert">{tx('حقول مطلوبة غير مطابقة: ', 'Required fields not mapped: ')}{mapCheck.missing.map((f) => fieldName[f]).join(tx('، ', ', '))}</p>}
          {mapCheck.repeated.length > 0 && <p className="error" role="alert">{tx('حقل مطابق لأكثر من عمود: ', 'Field mapped to more than one column: ')}{mapCheck.repeated.map((f) => fieldName[f]).join(tx('، ', ', '))}</p>}
          <div className="actions">
            <button type="button" className="btn primary" disabled={mapCheck.missing.length > 0 || mapCheck.repeated.length > 0} onClick={() => set({ step: 3 })}>{tx('تحقق من الأسطر', 'Validate rows')}</button>
            <button type="button" className="btn" onClick={() => set({ step: 1 })}>{tx('اختر ملفًا آخر', 'Choose another file')}</button>
          </div>
        </section>
      )}

      {s.step === 3 && plan && (
        <section className="card pad" aria-labelledby="im-3">
          <h2 id="im-3">{tx('معاينة التحقق', 'Validation preview')}</h2>
          <ul className="m-tally">
            <li><Badge tone="success">{tx('جديد صالح', 'New, valid')}</Badge> <bdi>{plan.create.length}</bdi></li>
            <li><Badge tone="warning">{tx('SKU موجود في متجرك', 'SKU already in your store')}</Badge> <bdi>{plan.conflicts.length}</bdi></li>
            <li><Badge tone="warning">{tx('مكرر داخل الملف', 'Duplicate in file')}</Badge> <bdi>{plan.duplicates.length}</bdi></li>
            <li><Badge tone="danger">{tx('غير صالح', 'Invalid')}</Badge> <bdi>{plan.invalid.length}</bdi></li>
          </ul>
          {plan.invalid.length + plan.duplicates.length > 0 && (
            <div className="table-wrap">
              <table className="m-compact">
                <caption className="sr">{tx('أول الأسطر التي فيها مشكلة', 'First rows with a problem')}</caption>
                <thead><tr><th scope="col">{tx('السطر', 'Line')}</th><th scope="col">SKU</th><th scope="col">{tx('المشكلة', 'Problem')}</th></tr></thead>
                <tbody>
                  {[...plan.invalid, ...plan.duplicates].sort((a, b) => a.line - b.line).slice(0, 10).map((r) => (
                    <tr key={r.line}><td><bdi>{r.line}</bdi></td><td><bdi dir="ltr">{r.sku || '—'}</bdi></td>
                      <td>{r.problems.length ? r.problems.map((p) => `${problem(p.code)}${p.value ? ` (${p.value})` : ''}`).join(tx('، ', ', ')) : `${problem('duplicate')} ${r.dupOf}`}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted">{tx('الأسطر غير الصالحة لن تُستورد وستظهر في تقرير الأخطاء. يمكنك تصحيح الملف وإعادة رفعه.', 'Invalid rows will not be imported and will appear in the error report. You can fix the file and upload it again.')}</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => set({ step: 4 })}>{tx('التالي: سياسة التعارض', 'Next: conflict policy')}</button>
            <button type="button" className="btn" onClick={() => set({ step: 2 })}>{tx('عدّل المطابقة', 'Edit mapping')}</button>
          </div>
        </section>
      )}

      {s.step === 4 && plan && (
        <section className="card pad" aria-labelledby="im-4">
          <h2 id="im-4">{tx(`ماذا نفعل بـ ${plan.conflicts.length} SKU موجودة؟`, `What to do with ${plan.conflicts.length} existing SKUs?`)}</h2>
          <fieldset>
            <legend className="sr">{tx('سياسة التعارض', 'Conflict policy')}</legend>
            <label className="radio"><input type="radio" name="pol" checked={s.policy === 'skip'} onChange={() => set({ policy: 'skip' })} /><span className="grow"><span className="strong">{tx('تخطَّ الموجود', 'Skip existing')}</span><br /><span className="small">{tx('لا تغيير على منتجاتك الحالية.', 'Your current products are not changed.')}</span></span></label>
            <label className="radio"><input type="radio" name="pol" checked={s.policy === 'update'} onChange={() => set({ policy: 'update' })} /><span className="grow"><span className="strong">{tx('حدّث السعر والحالة', 'Update price and status')}</span><br /><span className="small">{tx('الاسم والصور والمخزون لا تتغير.', 'Name, images and stock are not changed.')}</span></span></label>
          </fieldset>
          <p className="small muted">{tx('المكرر داخل الملف: نُبقي أول سطر ونتخطى البقية.', 'Duplicates within the file: the first line is kept, the rest skipped.')}</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => set({ step: 5 })}>{tx('التالي: التأكيد', 'Next: confirm')}</button>
            <button type="button" className="btn" onClick={() => set({ step: 3 })}>{tx('رجوع', 'Back')}</button>
          </div>
        </section>
      )}

      {s.step === 5 && plan && (
        <section className="card pad" aria-labelledby="im-5">
          <h2 id="im-5">{tx('راجع قبل الاستيراد', 'Review before importing')}</h2>
          <ul className="m-list">
            <li>{tx(`سيُنشأ ${plan.create.length} منتجًا (بحالة الملف؛ الافتراضي مسودة).`, `${plan.create.length} products will be created (with the file’s status; draft by default).`)}</li>
            <li>{tx(`سيُحدَّث ${plan.update.length} منتجًا موجودًا.`, `${plan.update.length} existing products will be updated.`)}</li>
            <li>{tx(`سيُتخطى ${plan.skipExisting.length + plan.duplicates.length} سطرًا و${plan.invalid.length} غير صالح.`, `${plan.skipExisting.length + plan.duplicates.length} rows will be skipped and ${plan.invalid.length} are invalid.`)}</li>
          </ul>
          <p className="small muted">{tx('التراجع ليس تلقائيًا: يمكنك أرشفة المنتجات المنشأة لاحقًا من القائمة، لكن التحديثات على الأسعار لا تُعاد آليًا.', 'Undo is not automatic: you can archive created products later from the list, but price updates are not reverted automatically.')}</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => set({ confirm: true })}>{tx('ابدأ الاستيراد', 'Start import')}</button>
            <button type="button" className="btn" onClick={() => set({ step: 4 })}>{tx('رجوع', 'Back')}</button>
          </div>
          {s.confirm && (
            <Dialog title={tx('تأكيد الاستيراد', 'Confirm import')} onClose={() => set({ confirm: false })}
              footer={<><button type="button" className="btn primary" onClick={() => startJob(plan)}>{tx(`استورد ${plan.create.length + plan.update.length} سطرًا`, `Import ${plan.create.length + plan.update.length} rows`)}</button><button type="button" className="btn" onClick={() => set({ confirm: false })}>{tx('إلغاء', 'Cancel')}</button></>}>
              <p>{tx('سيعمل الاستيراد في الخلفية؛ يمكنك مغادرة الصفحة والعودة لرؤية النتيجة.', 'The import runs in the background; you can leave and come back for the result.')}</p>
            </Dialog>
          )}
        </section>
      )}

      {s.step === 6 && s.job && (
        <section className="card pad" aria-labelledby="im-6" aria-live="polite">
          <h2 id="im-6">{s.job.running ? tx('جارٍ الاستيراد في الخلفية…', 'Importing in the background…') : tx('اكتمل الاستيراد', 'Import finished')}</h2>
          <Progress value={s.job.done} max={s.job.total} label={tx('تقدم الاستيراد', 'Import progress')} />
          <ul className="m-tally">
            <li><Badge tone="success">{tx('أُنشئ', 'Created')}</Badge> <bdi>{s.job.created}</bdi></li>
            <li><Badge tone="info">{tx('حُدّث', 'Updated')}</Badge> <bdi>{s.job.updated}</bdi></li>
            <li><Badge>{tx('تُخطّي', 'Skipped')}</Badge> <bdi>{s.job.plan.skipExisting.length + s.job.plan.duplicates.length}</bdi></li>
            <li><Badge tone="danger">{tx('لم يُستورد (أخطاء)', 'Not imported (errors)')}</Badge> <bdi>{s.job.plan.invalid.length}</bdi></li>
          </ul>
          {!s.job.running && (
            <>
              {(s.job.plan.invalid.length + s.job.plan.duplicates.length + s.job.plan.skipExisting.length) > 0
                ? <Alert tone="warning">{tx('بعض الأسطر لم تُستورد. نزّل التقرير لمعرفة السطر والحقل والسبب.', 'Some rows were not imported. Download the report for the line, field and reason.')}</Alert>
                : <Alert tone="success">{tx('استُورد كل الأسطر.', 'Every row was imported.')}</Alert>}
              <div className="actions">
                <button type="button" className="btn" onClick={report}><Icon name="download" size={16} /> {tx('نزّل تقرير الأخطاء (CSV)', 'Download error report (CSV)')}</button>
                <a className="btn primary" href={mhref('products', { q: s.file === 'large' ? 'IMP-' : '' })}>{tx('افتح المنتجات المستوردة', 'Open imported products')}</a>
                <button type="button" className="btn" onClick={() => importStore.set(init())}>{tx('استيراد جديد', 'New import')}</button>
              </div>
            </>
          )}
          {s.job.running && <p className="small muted">{tx('يمكنك مغادرة الصفحة؛ يستمر الاستيراد في هذه الجلسة.', 'You can leave this page; the import continues in this session.')}</p>}
        </section>
      )}
    </>
  );
}
