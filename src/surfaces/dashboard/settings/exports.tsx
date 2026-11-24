// Settings → Export templates (`#/dashboard/settings/exports`): one template model for orders, products and customers,
// each previewed with real rows before download, an optional scheduled e-mail (simulated) and the export log with
// re-download. Query: `tab=log`, `entity=`, `edit=<id>|new`, `page=`. Rules live in ../exports/model.ts.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Copy, Download, FileSpreadsheet, Mail, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, useRoute } from '../../../core/router';
import { canSee, type Page } from '../../merchant/perms';
import { currentActor, logAction, testStore } from '../../merchant/stores';
import { Badge, Button, Card, EmptyState, IconButton, InfoHint, Ref, Segmented, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, FilterChip, Input, Modal, Pagination, SaveBar, Select, Simulated, Switch, Tabs, useToast } from '../../../ds/kit';
import { useReviewMode } from '../../../core/review';
import { LeaveGuard, Section, useSave } from './common';
import { useSessionDraft } from './drafts';
import { exportLogStore, exportSimStore, templatesStore } from '../exports/store';
import { SheetPreview, download, exportsHref, runExport, useExportData } from '../exports/ui';
import {
  ENTITIES, ENTITY_LABEL, FIELDS, FREQS, HEADER_MAX, NAME_MAX, PERIODS, ROW_MODE_LABEL, addLog, blankTemplate, buildSheet, fieldOf, fileName, nextLogId, nextRun, nextTemplateId,
  sheetCsv, validateTemplate, type Entity, type ExportLog, type Freq, type PeriodPreset, type Template, type TemplateError,
} from '../exports/model';

const PAGE_OF: Record<Entity, Page> = { orders: 'orders', products: 'products', customers: 'customers' };
const isEntity = (v: string | null): v is Entity => !!v && (ENTITIES as string[]).includes(v);

export default function ExportsPage() {
  const tx = useTx();
  const route = useRoute();
  const q = route.query;
  const role = testStore.use().role;
  const allowed = ENTITIES.filter((e) => canSee(role, PAGE_OF[e]));
  const tab = q.get('tab') === 'log' ? 'log' : 'templates';
  const edit = q.get('edit');
  const base = Object.fromEntries(q.entries());
  if (edit) return <Editor id={edit} entity={isEntity(q.get('entity')) && allowed.includes(q.get('entity') as Entity) ? (q.get('entity') as Entity) : allowed[0]} allowed={allowed} />;
  return (
    <>
      <Tabs label={tx('التصدير', 'Exports')} items={[
        { href: exportsHref({ ...base, tab: undefined, page: undefined }), label: tx('القوالب', 'Templates'), current: tab === 'templates', count: templatesStore.get().filter((t) => allowed.includes(t.entity)).length },
        { href: exportsHref({ ...base, tab: 'log', page: undefined }), label: tx('سجل التصدير', 'Export log'), current: tab === 'log' },
      ]} />
      {tab === 'log' ? <LogTab allowed={allowed} /> : <TemplatesTab allowed={allowed} />}
    </>
  );
}

/* ---------- Templates ---------- */

const freqLabel = (f: Freq, tx: (a: string, b: string) => string) => ({ off: tx('بلا جدولة', 'Not scheduled'), daily: tx('يوميًا', 'Daily'), weekly: tx('أسبوعيًا', 'Weekly'), monthly: tx('شهريًا', 'Monthly') }[f]);
function useWhen() {
  const { lang } = useLang();
  return (iso: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso));
}

function TemplatesTab({ allowed }: { allowed: Entity[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const route = useRoute();
  const when = useWhen();
  const ent = route.query.get('entity');
  const filter = isEntity(ent) ? ent : '';
  const list = templatesStore.use().filter((t) => allowed.includes(t.entity) && (!filter || t.entity === filter));
  const log = exportLogStore.use();
  const [run, setRun] = useState<Template | null>(null);
  const q = Object.fromEntries(route.query.entries());
  const set = (o: Record<string, string | undefined>) => replace(exportsHref({ ...q, ...o }));
  if (!allowed.length) return <Card><EmptyState as="h2" icon={<FileSpreadsheet className="size-6" aria-hidden="true" />} title={tx('دورك لا يصل لبيانات قابلة للتصدير', 'Your role has no data to export')} /></Card>;
  const remove = (t: Template) => {
    const before = templatesStore.get();
    templatesStore.set((l) => l.filter((x) => x.id !== t.id));
    logAction('settings', { ar: `حذف قالب التصدير «${t.name}»`, en: `Deleted export template “${t.name}”` });
    toast({ tone: 'info', text: tx(`حُذف «${t.name}»`, `“${t.name}” deleted`), action: { label: tx('تراجع', 'Undo'), run: () => templatesStore.set(before) } });
  };
  const copy = (t: Template) => {
    const all = templatesStore.get();
    const id = nextTemplateId(all);
    let name = `${t.name} (${tx('نسخة', 'copy')})`.slice(0, NAME_MAX);
    while (all.some((x) => x.entity === t.entity && x.name === name)) name = `${name.slice(0, NAME_MAX - 2)} 2`;
    templatesStore.set((l) => [...l, { ...t, id, name, schedule: { ...t.schedule, freq: 'off' }, version: 1, updatedAt: new Date().toISOString(), by: currentActor().name }]);
    logAction('settings', { ar: `نسخ قالب التصدير «${t.name}»`, en: `Duplicated export template “${t.name}”` });
    toast({ tone: 'ok', text: tx('نُسخ القالب؛ الجدولة متوقفة في النسخة', 'Template duplicated; scheduling is off in the copy') });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label={tx('القسم', 'Section')} value={filter} onChange={(v) => set({ entity: v || undefined })} options={allowed.map((e) => ({ value: e, label: ENTITY_LABEL[e][lang] }))} />
        <a href={exportsHref({ edit: 'new', entity: filter || allowed[0] })} className="ms-auto inline-flex h-10 items-center gap-2 rounded-xl bg-brand-gradient px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95"><Plus className="size-4" aria-hidden="true" />{tx('قالب جديد', 'New template')}</a>
      </div>
      {list.length === 0 ? (
        <Card><EmptyState as="h2" icon={<FileSpreadsheet className="size-6" aria-hidden="true" />} title={filter ? tx('لا قوالب لهذا القسم', 'No templates for this section') : tx('لا قوالب بعد', 'No templates yet')}
          action={<a href={exportsHref({ edit: 'new', entity: filter || allowed[0] })} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('أنشئ قالبًا', 'Create a template')}</a>}>
          {tx('القالب يحفظ الأعمدة وترتيبها وأسماءها والتصفية، ويعمل في الطلبات والمنتجات والعملاء.', 'A template keeps columns, their order and names, and filters; it works in orders, products and customers.')}
        </EmptyState></Card>
      ) : (
        <ul className="space-y-3">
          {list.map((t) => {
            const last = log.find((x) => x.templateId === t.id);
            const next = nextRun(t.schedule, Date.now());
            return (
              <li key={t.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300" aria-hidden="true"><FileSpreadsheet className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg"><bdi>{t.name}</bdi><Badge>{ENTITY_LABEL[t.entity][lang]}</Badge></p>
                    <p className="mt-1 text-xs text-muted">{tx(`${t.cols.length} عمودًا · ${ROW_MODE_LABEL[t.entity][t.rows].ar} · عناوين ${t.headerLang === 'ar' ? 'عربية' : 'إنجليزية'}`, `${t.cols.length} columns · ${ROW_MODE_LABEL[t.entity][t.rows].en} · ${t.headerLang === 'ar' ? 'Arabic' : 'English'} headers`)}</p>
                    <p className="mt-1 truncate text-xs text-subtle"><bdi>{t.cols.map((c) => c[t.headerLang]).join(' · ')}</bdi></p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {t.schedule.freq !== 'off' && next && <Badge tone="sky" icon={<CalendarClock className="size-3" aria-hidden="true" />}>{freqLabel(t.schedule.freq, tx)} · {tx('التالي', 'next')} {when(next)}</Badge>}
                      {last && <span className="text-muted">{tx('آخر تصدير', 'Last export')} {when(last.at)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => setRun(t)}><Download className="size-4" aria-hidden="true" />{tx('صدّر', 'Export')}</Button>
                    <a href={exportsHref({ edit: t.id, entity: t.entity })} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label={tx(`عدّل ${t.name}`, `Edit ${t.name}`)}><Pencil className="size-4" aria-hidden="true" /></a>
                    <IconButton label={tx(`انسخ ${t.name}`, `Duplicate ${t.name}`)} onClick={() => copy(t)}><Copy className="size-4" aria-hidden="true" /></IconButton>
                    <IconButton label={tx(`احذف ${t.name}`, `Delete ${t.name}`)} onClick={() => remove(t)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {run && <RunModal t={run} onClose={() => setRun(null)} />}
    </div>
  );
}

/** Preview the template's rows with its own filters and period, then download, or send the scheduled e-mail now. */
function RunModal({ t, onClose }: { t: Template; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const data = useExportData();
  const sim = exportSimStore.use();
  const sheet = useMemo(() => buildSheet(t, data), [t, data]);
  const dl = () => { runExport(t, sheet, 'manual'); toast({ tone: 'ok', text: tx(`نُزّل ${sheet.rows.length} سطرًا`, `${sheet.rows.length} rows downloaded`) }); onClose(); };
  const email = () => {
    const at = new Date().toISOString();
    const failed = sim.failEmail;
    exportLogStore.set((l) => addLog(l, { id: nextLogId(l), at, by: currentActor().name, entity: t.entity, templateId: t.id, templateName: t.name, rows: sheet.rows.length, file: fileName(t, at), trigger: 'scheduled', to: t.schedule.email, status: failed ? 'failed' : 'sent', csv: sheetCsv(sheet), snapshot: t }));
    logAction('settings', { ar: `أرسل تصدير «${t.name}» إلى ${t.schedule.email}`, en: `Sent export “${t.name}” to ${t.schedule.email}` });
    toast(failed ? { tone: 'bad', text: tx('تعذّر الإرسال (SIM-EXP-502). الملف في السجل؛ أعد الإرسال من هناك.', 'Could not send (SIM-EXP-502). The file is in the log; resend from there.') } : { tone: 'ok', text: tx(`أُرسل إلى ${t.schedule.email} (محاكاة)`, `Sent to ${t.schedule.email} (simulated)`) });
    onClose();
  };
  return (
    <Modal size="lg" title={tx(`تصدير «${t.name}»`, `Export “${t.name}”`)} onClose={onClose} description={tx('بتصفية القالب وفترته. راجع أول الأسطر قبل التنزيل.', 'With the template’s filters and period. Check the first rows before downloading.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button>
        {t.schedule.freq !== 'off' && <Button variant="secondary" onClick={email} disabled={!sheet.rows.length}><Mail className="size-4" aria-hidden="true" />{tx('أرسل بالبريد الآن', 'Email it now')}</Button>}
        <Button onClick={dl} disabled={!sheet.rows.length}><Download className="size-4" aria-hidden="true" />{tx(`نزّل ${sheet.rows.length} سطرًا`, `Download ${sheet.rows.length} rows`)}</Button>
      </>}>
      <SheetPreview sheet={sheet} />
      {t.schedule.freq !== 'off' && <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><Mail className="size-3.5" aria-hidden="true" /><bdi dir="ltr">{t.schedule.email}</bdi><Simulated /></p>}
    </Modal>
  );
}

/* ---------- Editor ---------- */

function Editor({ id, entity, allowed }: { id: string; entity: Entity; allowed: Entity[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const all = templatesStore.use();
  const existing = all.find((t) => t.id === id);
  const fresh = useMemo(() => blankTemplate(entity, nextTemplateId(all), currentActor().name, new Date().toISOString()), [entity]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = existing ?? fresh;
  const [d, setD, clearD] = useSessionDraft<Template>(`exports:${id}:${existing ? '' : entity}`, saved);
  const [tried, setTried] = useState(false);
  const [adding, setAdding] = useState('');
  const { saving, error, save, clearError } = useSave();
  const data = useExportData();
  const sheet = useMemo(() => buildSheet(d, data), [d, data]);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const errs = validateTemplate(d, all);
  const has = (e: TemplateError) => tried && errs.includes(e);
  const set = (p: Partial<Template>) => { setD({ ...d, ...p }); clearError(); };
  const back = exportsHref({ entity: existing?.entity });
  const toast = useToast();

  if (id !== 'new' && !existing) return <Card><EmptyState as="h2" icon={<FileSpreadsheet className="size-6" aria-hidden="true" />} title={tx('القالب غير موجود', 'Template not found')} action={<a href={exportsHref()} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('كل القوالب', 'All templates')}</a>} /></Card>;
  if (!allowed.includes(d.entity)) return <Card><EmptyState as="h2" title={tx('دورك لا يصل لهذا القسم', 'Your role cannot open this section')} /></Card>;

  const fields = FIELDS[d.entity];
  const itemOnly = d.entity === 'orders' && d.rows === 'one';
  const remaining = fields.filter((x) => !d.cols.some((c) => c.key === x.key) && !(itemOnly && x.item) && !(d.entity === 'products' && d.rows === 'one' && x.key === 'variant'));
  const move = (i: number, dir: -1 | 1) => { const cols = [...d.cols]; const j = i + dir; if (j < 0 || j >= cols.length) return; [cols[i], cols[j]] = [cols[j], cols[i]]; set({ cols }); };
  const setCol = (i: number, p: Partial<Template['cols'][number]>) => set({ cols: d.cols.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  const add = (key: string) => { const fd = fieldOf(d.entity, key); if (!fd) return; set({ cols: [...d.cols, { key, ar: fd.label.ar, en: fd.label.en }] }); setAdding(''); };
  const switchEntity = (e: Entity) => setD({ ...blankTemplate(e, d.id, d.by, d.updatedAt), name: d.name });
  const next = nextRun(d.schedule, Date.now());
  const when = (iso: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso));
  const WEEKDAYS = lang === 'ar' ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const msg = (e: TemplateError) => ({
    name: tx('اكتب اسمًا للقالب', 'Name the template'), nameLong: tx(`${NAME_MAX} حرفًا كحد أقصى`, `${NAME_MAX} characters at most`), nameTaken: tx('يوجد قالب بهذا الاسم في القسم نفسه', 'A template with this name exists in this section'),
    noCols: tx('اختر عمودًا واحدًا على الأقل', 'Choose at least one column'), header: tx('لكل عمود اسم في لغة العناوين', 'Every column needs a name in the header language'),
    headerLong: tx(`اسم العمود ${HEADER_MAX} حرفًا كحد أقصى`, `Column names are ${HEADER_MAX} characters at most`), headerDup: tx('اسمان متطابقان؛ يتداخل العمودان في Excel', 'Two identical names; the columns would collide in Excel'),
    range: tx('فترة غير صحيحة (من قبل إلى، وحتى أمس)', 'Invalid range (from before to, up to yesterday)'), email: tx('بريد غير صالح للإرسال المجدول', 'Not a valid e-mail for the schedule'), limit: tx('وصلت للحد (30 قالبًا)', 'Limit reached (30 templates)'),
  }[e]);
  const onSave = () => {
    setTried(true);
    if (errs.length) return;
    save(() => {
      const now = new Date().toISOString();
      const t: Template = { ...d, name: d.name.trim(), cols: d.cols.map((c) => ({ ...c, ar: c.ar.trim(), en: c.en.trim() })), schedule: { ...d.schedule, email: d.schedule.email.trim() }, version: existing ? existing.version + 1 : 1, updatedAt: now, by: currentActor().name };
      templatesStore.set((l) => (existing ? l.map((x) => (x.id === t.id ? t : x)) : [...l, t]));
      logAction('settings', { ar: `${existing ? 'عدّل' : 'أنشأ'} قالب التصدير «${t.name}» (${ENTITY_LABEL[t.entity].ar})`, en: `${existing ? 'Edited' : 'Created'} export template “${t.name}” (${t.entity})` }, { after: `v${t.version}` });
      clearD(); setTried(false);
      replace(exportsHref({ entity: t.entity }));
    }, tx('حُفظ القالب', 'Template saved'));
  };

  return (
    <>
      <LeaveGuard dirty={dirty} />
      <div className="flex flex-wrap items-center gap-2">
        <a href={back} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('← القوالب', '← Templates')}</a>
        <span className="text-sm font-semibold text-fg">{existing ? tx(`تعديل «${existing.name}»`, `Edit “${existing.name}”`) : tx('قالب جديد', 'New template')}</span>
        {existing && <Badge>v{existing.version}</Badge>}
      </div>
      <Section id="ex-basics" title={tx('القالب', 'Template')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tx('اسم القالب', 'Template name')} error={has('name') ? msg('name') : has('nameLong') ? msg('nameLong') : has('nameTaken') ? msg('nameTaken') : null} hint={<span className="tabular-nums">{d.name.length}/{NAME_MAX}</span>}>
            {(p) => <Input {...p} value={d.name} maxLength={NAME_MAX + 10} placeholder={tx('مثال: للمحاسب شهريًا', 'e.g. Monthly for the accountant')} onChange={(e) => set({ name: e.target.value })} />}
          </Field>
          <Field label={tx('القسم', 'Section')} hint={existing ? tx('لا يتغير بعد الإنشاء', 'Fixed once created') : undefined}>
            {(p) => <Select {...p} value={d.entity} disabled={!!existing} onChange={(e) => switchEntity(e.target.value as Entity)}>{allowed.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e][lang]}</option>)}</Select>}
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {d.entity !== 'customers' && <Segmented label={tx('الأسطر', 'Rows')} value={d.rows} onChange={(v: Template['rows']) => set({ rows: v, cols: v === 'one' ? d.cols.filter((c) => !(d.entity === 'orders' ? fieldOf('orders', c.key)?.item : c.key === 'variant')) : d.cols })}
            options={[{ value: 'one', label: ROW_MODE_LABEL[d.entity].one[lang] }, { value: 'line', label: ROW_MODE_LABEL[d.entity].line[lang] }]} />}
          <Segmented label={tx('لغة العناوين', 'Header language')} value={d.headerLang} onChange={(v: 'ar' | 'en') => set({ headerLang: v })} options={[{ value: 'ar', label: tx('عناوين عربية', 'Arabic headers') }, { value: 'en', label: tx('عناوين إنجليزية', 'English headers') }]} />
        </div>
      </Section>

      <Section id="ex-cols" title={<>{tx('الأعمدة وترتيبها', 'Columns and order')}<InfoHint>{tx('غيّر اسم العمود كما يريده محاسبك أو نظامك. الترتيب هنا هو ترتيب الملف.', 'Rename columns the way your accountant or system expects. The order here is the file’s order.')}</InfoHint></>} flush>
        {(has('noCols') || has('header') || has('headerDup') || has('headerLong')) && <div className="px-5 pb-3"><Alert tone="bad">{msg(errs.find((e) => ['noCols', 'header', 'headerDup', 'headerLong'].includes(e))!)}</Alert></div>}
        <ol className="divide-y divide-border border-y border-border">
          {d.cols.map((c, i) => {
            const fd = fieldOf(d.entity, c.key);
            const head = c[d.headerLang].trim().toLowerCase();
            const dup = !!head && d.cols.some((x, k) => k !== i && x[d.headerLang].trim().toLowerCase() === head);
            return (
              <li key={c.key} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[1.5rem_9rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                <span className="pt-2 text-xs font-bold text-subtle tabular-nums sm:pt-0">{i + 1}</span>
                <span className="pt-2 text-[13px] font-medium text-fg sm:pt-0">{fd?.label[lang] ?? c.key}{fd?.contact && !data.contact && <Badge tone="amber" className="ms-1">{tx('مخفي', 'masked')}</Badge>}</span>
                <div className="col-start-2 grid grid-cols-2 gap-2 sm:col-start-auto sm:contents">
                  <Input aria-label={tx(`اسم العمود ${i + 1} بالعربية`, `Column ${i + 1} name in Arabic`)} value={c.ar} dir="rtl" maxLength={HEADER_MAX + 10} aria-invalid={(tried && d.headerLang === 'ar' && (!c.ar.trim() || dup)) || undefined} onChange={(e) => setCol(i, { ar: e.target.value })} />
                  <Input aria-label={tx(`اسم العمود ${i + 1} بالإنجليزية`, `Column ${i + 1} name in English`)} value={c.en} dir="ltr" maxLength={HEADER_MAX + 10} aria-invalid={(tried && d.headerLang === 'en' && (!c.en.trim() || dup)) || undefined} onChange={(e) => setCol(i, { en: e.target.value })} />
                </div>
                <div className="col-start-3 row-start-1 flex items-center sm:col-start-auto sm:row-start-auto">
                  <IconButton label={tx('أعلى', 'Move up')} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden="true" /></IconButton>
                  <IconButton label={tx('أسفل', 'Move down')} disabled={i === d.cols.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden="true" /></IconButton>
                  <IconButton label={tx(`احذف ${fd?.label[lang] ?? c.key}`, `Remove ${fd?.label[lang] ?? c.key}`)} onClick={() => set({ cols: d.cols.filter((_, k) => k !== i) })}><X className="size-4" aria-hidden="true" /></IconButton>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3 pb-3">
          <Select aria-label={tx('أضف عمودًا', 'Add a column')} className="w-auto min-w-48" value={adding} onChange={(e) => add(e.target.value)} disabled={!remaining.length}>
            <option value="">{remaining.length ? tx('+ أضف عمودًا', '+ Add a column') : tx('كل الأعمدة مضافة', 'All columns added')}</option>
            {remaining.map((x) => <option key={x.key} value={x.key}>{x.label[lang]}</option>)}
          </Select>
          {itemOnly && <span className="text-xs text-muted">{tx('أعمدة الأصناف تظهر عند «سطر لكل صنف».', 'Item columns appear with “one row per item”.')}</span>}
        </div>
      </Section>

      <Section id="ex-filter" title={<>{tx('التصفية والفترة', 'Filters and period')}<InfoHint>{tx('تُطبَّق عند التصدير من هنا أو بالجدولة. من قائمة الطلبات، السجلات هي ما اخترته هناك.', 'Applied when exporting from here or on schedule. From the orders list, the records are what you chose there.')}</InfoHint></>}>
        {d.entity === 'orders' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx('الدفع', 'Payment')}>{(p) => <Select {...p} value={d.filters.pay ?? ''} onChange={(e) => set({ filters: { ...d.filters, pay: e.target.value || undefined } })}>
              <option value="">{tx('الكل', 'All')}</option><option value="paid">{tx('مدفوع', 'Paid')}</option><option value="failed">{tx('فشل', 'Failed')}</option><option value="cod_due">{tx('عند الاستلام', 'Cash on delivery')}</option><option value="refunded">{tx('مسترد', 'Refunded')}</option>
            </Select>}</Field>
            <Field label={tx('التجهيز', 'Fulfilment')}>{(p) => <Select {...p} value={d.filters.ful ?? ''} onChange={(e) => set({ filters: { ...d.filters, ful: e.target.value || undefined } })}>
              <option value="">{tx('الكل', 'All')}</option><option value="none">{tx('لم يبدأ', 'Not started')}</option><option value="partial">{tx('جزئي', 'Partial')}</option><option value="done">{tx('مكتمل', 'Done')}</option>
            </Select>}</Field>
            <Field label={tx('القناة', 'Channel')}>{(p) => <Select {...p} value={d.filters.ch ?? ''} onChange={(e) => set({ filters: { ...d.filters, ch: e.target.value || undefined } })}>
              <option value="">{tx('الكل', 'All')}</option><option value="online">{tx('المتجر الإلكتروني', 'Online store')}</option><option value="market">{tx('سوق لك', 'LAK marketplace')}</option><option value="app">{tx('تطبيق المتجر', 'Store app')}</option>
            </Select>}</Field>
            <Field label={tx('الفترة', 'Period')}>{(p) => <Select {...p} value={d.period.preset} onChange={(e) => set({ period: { ...d.period, preset: e.target.value as PeriodPreset } })}>
              {PERIODS.map((x) => <option key={x} value={x}>{{ all: tx('كل الطلبات', 'All orders'), '7': tx('آخر 7 أيام', 'Last 7 days'), '30': tx('آخر 30 يومًا', 'Last 30 days'), '90': tx('آخر 90 يومًا', 'Last 90 days'), mtd: tx('هذا الشهر', 'This month'), custom: tx('مخصص', 'Custom') }[x]}</option>)}
            </Select>}</Field>
            {d.period.preset === 'custom' && <>
              <Field label={tx('من', 'From')} error={has('range') ? msg('range') : null}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" placeholder="2026-11-01" value={d.period.from ?? ''} onChange={(e) => set({ period: { ...d.period, from: e.target.value } })} />}</Field>
              <Field label={tx('إلى', 'To')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" placeholder="2026-11-23" value={d.period.to ?? ''} onChange={(e) => set({ period: { ...d.period, to: e.target.value } })} />}</Field>
            </>}
          </div>
        )}
        {d.entity === 'products' && (
          <Field label={tx('الحالة', 'Status')}>{(p) => <Select {...p} value={d.filters.status ?? ''} onChange={(e) => set({ filters: { ...d.filters, status: e.target.value || undefined } })}>
            <option value="">{tx('الكل', 'All')}</option><option value="active">{tx('نشط', 'Active')}</option><option value="draft">{tx('مسودة', 'Draft')}</option><option value="archived">{tx('مؤرشف', 'Archived')}</option>
          </Select>}</Field>
        )}
        {d.entity === 'customers' && (
          <Field label={tx('الموافقة', 'Consent')}>{(p) => <Select {...p} value={d.filters.consent ?? ''} onChange={(e) => set({ filters: { ...d.filters, consent: e.target.value || undefined } })}>
            <option value="">{tx('الكل', 'All')}</option><option value="email">{tx('وافق على البريد', 'Agreed to e-mail')}</option><option value="sms">{tx('وافق على الرسائل', 'Agreed to SMS')}</option>
          </Select>}</Field>
        )}
      </Section>

      <Section id="ex-schedule" title={<>{tx('الإرسال المجدول', 'Scheduled e-mail')}<Simulated /></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tx('التكرار', 'Repeat')}>{(p) => <Select {...p} value={d.schedule.freq} onChange={(e) => set({ schedule: { ...d.schedule, freq: e.target.value as Freq } })}>{FREQS.map((x) => <option key={x} value={x}>{freqLabel(x, tx)}</option>)}</Select>}</Field>
          {d.schedule.freq !== 'off' && <>
            <Field label={tx('إلى بريد', 'To e-mail')} error={has('email') ? msg('email') : null}>{(p) => <Input {...p} type="email" dir="ltr" value={d.schedule.email} placeholder="accounts@example.com" onChange={(e) => set({ schedule: { ...d.schedule, email: e.target.value } })} />}</Field>
            {d.schedule.freq === 'weekly' && <Field label={tx('اليوم', 'Day')}>{(p) => <Select {...p} value={d.schedule.weekday} onChange={(e) => set({ schedule: { ...d.schedule, weekday: Number(e.target.value) } })}>{WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}</Select>}</Field>}
            {d.schedule.freq === 'monthly' && <Field label={tx('يوم الشهر', 'Day of month')} hint={tx('حتى 28', 'Up to 28')}>{(p) => <Select {...p} value={d.schedule.day} onChange={(e) => set({ schedule: { ...d.schedule, day: Number(e.target.value) } })}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</Select>}</Field>}
            <Field label={tx('الساعة (الرياض)', 'Time (Riyadh)')}>{(p) => <Select {...p} value={d.schedule.hour} onChange={(e) => set({ schedule: { ...d.schedule, hour: Number(e.target.value) } })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}</Select>}</Field>
          </>}
        </div>
        {d.schedule.freq !== 'off' && next && <p className="mt-3 text-xs text-muted">{tx('الإرسال التالي', 'Next send')}: <b className="text-fg">{when(next)}</b> · {tx('يصل ملف CSV مرفقًا ويُسجّل في سجل التصدير.', 'A CSV arrives attached and is recorded in the export log.')}</p>}
      </Section>

      <Section id="ex-preview" title={tx('معاينة بأسطر حقيقية', 'Preview with real rows')}>
        <SheetPreview sheet={sheet} />
      </Section>
      <SaveBar dirty={dirty || !!error} saving={saving} error={error ?? (tried && errs.length ? tx('صحّح ما هو معلّم ثم احفظ', 'Fix what is marked, then save') : undefined)} onSave={onSave}
        onDiscard={() => { clearD(); setTried(false); clearError(); if (!existing) { replace(back); toast({ tone: 'info', text: tx('أُلغي القالب الجديد', 'New template discarded') }); } }} />
    </>
  );
}

/* ---------- Log ---------- */

const PER_PAGE = 20;
function LogTab({ allowed }: { allowed: Entity[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const route = useRoute();
  const review = useReviewMode();
  const sim = exportSimStore.use();
  const when = useWhen();
  const data = useExportData();
  const q = Object.fromEntries(route.query.entries());
  const ent = route.query.get('entity');
  const filter = isEntity(ent) ? ent : '';
  const trig = route.query.get('trigger') ?? '';
  const all = exportLogStore.use().filter((x) => allowed.includes(x.entity) && (!filter || x.entity === filter) && (!trig || x.trigger === trig));
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(route.query.get('page')) || 1));
  const rows = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const set = (o: Record<string, string | undefined>) => replace(exportsHref({ ...q, page: undefined, ...o }));

  const again = (x: ExportLog) => {
    if (x.csv) { download(x.file, x.csv); toast({ tone: 'ok', text: tx('نُزّل الملف كما صدر', 'File downloaded as it was produced') }); return; }
    const scope = x.scope ? { orders: x.entity === 'orders' ? data.orders.filter((o) => x.scope!.includes(o.ref)) : undefined, products: x.entity === 'products' ? data.products.filter((p) => x.scope!.includes(p.id)) : undefined, customers: x.entity === 'customers' ? data.customers.filter((c) => x.scope!.includes(c.id)) : undefined } : undefined;
    const sheet = buildSheet(x.snapshot, data, scope);
    download(x.file, sheetCsv(sheet));
    logAction('settings', { ar: `أعاد توليد ملف التصدير ${x.id}`, en: `Regenerated export file ${x.id}` });
    toast({ tone: 'info', text: tx(`انتهى حفظ الملف الأصلي؛ أُعيد توليده بالقالب نفسه من بيانات اليوم (${sheet.rows.length} سطرًا).`, `The original file expired; regenerated with the same template from today’s data (${sheet.rows.length} rows).`) });
  };
  const resend = (x: ExportLog) => {
    exportLogStore.set((l) => l.map((y) => (y.id === x.id ? { ...y, status: sim.failEmail ? 'failed' : 'sent' } : y)));
    logAction('settings', { ar: `أعاد إرسال التصدير ${x.id} إلى ${x.to}`, en: `Resent export ${x.id} to ${x.to}` });
    toast(sim.failEmail ? { tone: 'bad', text: tx('فشل الإرسال مرة أخرى (SIM-EXP-502)', 'Sending failed again (SIM-EXP-502)') } : { tone: 'ok', text: tx(`أُعيد الإرسال إلى ${x.to} (محاكاة)`, `Resent to ${x.to} (simulated)`) });
  };
  const trigLabel = (x: ExportLog) => x.trigger === 'scheduled' ? tx('مجدول', 'Scheduled') : x.trigger === 'section' ? tx('من القائمة', 'From the list') : tx('يدوي', 'Manual');
  const status = (x: ExportLog) => x.status === 'failed' ? <Badge tone="red">{tx('فشل الإرسال', 'Send failed')}</Badge> : x.status === 'sent' ? <Badge tone="green">{tx('أُرسل', 'Sent')}</Badge> : <Badge>{tx('نُزّل', 'Downloaded')}</Badge>;
  const action = (x: ExportLog) => (
    <span className="inline-flex items-center gap-1">
      {x.status === 'failed' && <Button size="sm" variant="secondary" onClick={() => resend(x)}><RotateCcw className="size-4" aria-hidden="true" />{tx('أعد الإرسال', 'Resend')}</Button>}
      <Button size="sm" variant="ghost" onClick={() => again(x)}><Download className="size-4" aria-hidden="true" />{x.csv ? tx('نزّل مرة أخرى', 'Download again') : tx('أعد التوليد', 'Regenerate')}</Button>
    </span>
  );
  return (
    <div className="space-y-4">
      {review && (
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-xs font-medium text-muted">
          {tx('حاكِ فشل إرسال البريد المجدول', 'Simulate a failed scheduled e-mail')}
          <Switch checked={sim.failEmail} onChange={(v) => exportSimStore.set({ failEmail: v })} label={tx('حاكِ فشل إرسال البريد المجدول', 'Simulate a failed scheduled e-mail')} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label={tx('القسم', 'Section')} value={filter} onChange={(v) => set({ entity: v || undefined })} options={allowed.map((e) => ({ value: e, label: ENTITY_LABEL[e][lang] }))} />
        <FilterChip label={tx('المصدر', 'Source')} value={trig} onChange={(v) => set({ trigger: v || undefined })} options={[{ value: 'manual', label: tx('يدوي', 'Manual') }, { value: 'section', label: tx('من القائمة', 'From the list') }, { value: 'scheduled', label: tx('مجدول', 'Scheduled') }]} />
        <InfoHint>{tx(`آخر 6 ملفات تُحفظ كما صدرت؛ الأقدم يُعاد توليده بالقالب نفسه من بيانات اليوم.`, 'The last 6 files are kept as produced; older ones regenerate with the same template from today’s data.')}</InfoHint>
      </div>
      <Card>
        {all.length === 0 ? (
          <EmptyState as="h2" icon={<FileSpreadsheet className="size-6" aria-hidden="true" />} title={filter || trig ? tx('لا تصدير يطابق', 'No exports match') : tx('لم تصدّر شيئًا بعد', 'Nothing exported yet')}
            action={filter || trig ? <Button variant="secondary" onClick={() => set({ entity: undefined, trigger: undefined })}>{tx('امسح التصفية', 'Clear filters')}</Button> : <a href={exportsHref()} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('القوالب', 'Templates')}</a>} />
        ) : (
          <>
            <DataTable label={tx('سجل التصدير', 'Export log')} rows={rows} rowKey={(x) => x.id}
              columns={[
                { key: 'at', header: tx('الوقت', 'When'), cell: (x) => <span className="whitespace-nowrap">{when(x.at)}</span> },
                { key: 'tpl', header: tx('القالب', 'Template'), cell: (x) => <span className="block min-w-0"><bdi className="font-medium text-fg">{x.templateName}</bdi><span className="block text-xs text-muted">{ENTITY_LABEL[x.entity][lang]} · <Ref>{x.id}</Ref></span></span> },
                { key: 'rows', header: tx('الأسطر', 'Rows'), align: 'end', cell: (x) => <span className="tabular-nums">{x.rows}</span> },
                { key: 'src', header: tx('المصدر', 'Source'), hideBelow: 'lg', cell: (x) => <span className="text-xs">{trigLabel(x)}{x.to && <bdi dir="ltr" className="block text-muted">{x.to}</bdi>}</span> },
                { key: 'by', header: tx('بواسطة', 'By'), hideBelow: 'lg', cell: (x) => x.by },
                { key: 'st', header: tx('الحالة', 'Status'), cell: status },
                { key: 'act', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', cell: action },
              ]}
              card={(x) => (
                <div className="space-y-1.5">
                  <p className="flex flex-wrap items-center justify-between gap-2"><bdi className="text-sm font-semibold text-fg">{x.templateName}</bdi>{status(x)}</p>
                  <p className="text-xs text-muted">{when(x.at)} · {ENTITY_LABEL[x.entity][lang]} · {tx(`${x.rows} سطرًا`, `${x.rows} rows`)} · {trigLabel(x)}</p>
                  {action(x)}
                </div>
              )} />
            <Pagination page={page} pages={pages} total={all.length} hrefFor={(p) => exportsHref({ ...q, page: String(p) })} />
          </>
        )}
      </Card>
    </div>
  );
}

export const exportsLink = () => link('/dashboard/settings/exports');
