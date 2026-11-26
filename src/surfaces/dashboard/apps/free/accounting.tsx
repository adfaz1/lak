// Accounting export app (`#/dashboard/apps/free/accounting?from=&to=`): journal entries for a period (sales, VAT,
// discounts, shipping, payment fees, refunds, payouts) on the merchant's chart of accounts, a balance check, a CSV
// download recorded with who and when, and a simulated scheduled export.
import { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Download, FileSpreadsheet, Scale, XCircle } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import { link, replace, useRoute } from '../../../../core/router';
import { currentActor, financeStore, logAction, ordersStore, testStore } from '../../../merchant/stores';
import { canSee } from '../../../merchant/perms';
import { Badge, Button, Card, CardHeader, EmptyState, Money, Ref, Segmented, useTx } from '../../../../ds/ui';
import { Alert, Field, Input, Modal, SaveBar, Select, Simulated, useToast } from '../../../../ds/kit';
import { download } from '../../exports/ui';
import { freeAppsStore, saveAppSettings } from './registry';
import {
  ACCOUNT_KEYS, ACCOUNT_ROLE, accountingSettingsOf, byAccount, fileName, journal, journalCsv, mapErrors, monthRange, nextRun, riyadhDay, totals, validEmail,
  type AccountingSettings, type ExportRecord, type Freq,
} from './accounting-model';
import { AppStates, Stat, Stats, useAppForm } from './integrations-ui';

export default function AccountingApp() {
  const tx = useTx();
  const role = testStore.use().role;
  if (!canSee(role, 'finance')) return <Card><EmptyState title={tx('تحتاج صلاحية المالية', 'You need Finance access')}>{tx('القيود تعرض المبيعات والرسوم والتحويلات. اطلبها من مالك المتجر.', 'Entries show sales, fees and payouts. Ask the store owner for access.')}</EmptyState></Card>;
  return <AppStates><Screen /></AppStates>;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PREVIEW = 40;

function Screen() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const route = useRoute();
  const today = riyadhDay(Date.now());
  const def = monthRange(today, 0);
  const qf = route.query.get('from') ?? '';
  const qt = route.query.get('to') ?? '';
  const from = DAY_RE.test(qf) ? qf : def.from;
  const to = DAY_RE.test(qt) ? qt : def.to;
  const badRange = from > to;
  const setRange = (r: { from: string; to: string }) => replace(link('/dashboard/apps/free/accounting', r));
  const preset = from === def.from && to === def.to ? 'this' : (() => { const l = monthRange(today, -1); return from === l.from && to === l.to ? 'last' : 'custom'; })();

  const apps = freeAppsStore.use();
  const saved = accountingSettingsOf(apps.accounting?.settings as Partial<AccountingSettings>);
  type Form = Pick<AccountingSettings, 'map' | 'format' | 'customName' | 'schedule'>;
  const f = useAppForm<Form>('accounting', { map: saved.map, format: saved.format, customName: saved.customName, schedule: saved.schedule }, { ar: 'إعدادات الربط المحاسبي', en: 'Accounting settings' });
  const d = f.draft;
  const mErrs = mapErrors(d.map);
  const emailBad = d.schedule.freq !== 'off' && !validEmail(d.schedule.email);
  const customBad = d.format === 'custom' && !d.customName.trim();
  const formBad = mErrs.length > 0 || emailBad || customBad;

  const orders = ordersStore.use();
  const fin = financeStore.use();
  const lines = useMemo(() => (badRange ? [] : journal(orders, fin.txs, fin.payouts, from, to, Date.now())), [orders, fin, from, to, badRange]);
  const t = totals(lines);
  const accounts = byAccount(lines);
  const [confirm, setConfirm] = useState(false);
  const file = fileName(from, to, saved);
  const blocked = !lines.length ? tx('لا قيود في هذه الفترة', 'No entries in this period') : !t.balanced ? tx('القيود غير متوازنة', 'Entries don’t balance') : f.dirty ? tx('احفظ دليل الحسابات أولًا', 'Save the chart of accounts first') : null;

  const doExport = () => {
    const csv = journalCsv(lines, saved.map);
    download(file, csv);
    const rec: ExportRecord = { id: `JE-${String(saved.exports.length + 1).padStart(4, '0')}`, at: new Date().toISOString(), by: currentActor().name, from, to, lines: lines.length, debit: t.debit, credit: t.credit, file };
    saveAppSettings('accounting', { exports: [rec, ...saved.exports].slice(0, 20) });
    logAction('apps', { ar: `صدّر قيود اليومية ${from} – ${to} (${lines.length} سطرًا)`, en: `Exported journal entries ${from} – ${to} (${lines.length} lines)` }, { target: 'accounting' });
    setConfirm(false);
    toast({ tone: 'ok', text: tx('نُزّل الملف وسُجّل في سجل التصدير أدناه', 'Downloaded and recorded in the export history below') });
  };

  const save = () => {
    if (formBad) return;
    f.commit({ ...d, customName: d.customName.trim(), schedule: { ...d.schedule, email: d.schedule.email.trim() } }, { ar: 'حفظ دليل الحسابات وجدولة التصدير', en: 'Saved chart of accounts and export schedule' });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader id="ac-period" title={tx('قيود الفترة', 'Entries for the period')} hint={tx('المبيعات حسب تاريخ الطلب، والرسوم حسب يوم البيع، والتحويلات حسب تاريخ التحويل. الأسعار شاملة الضريبة ١٥٪.', 'Sales by order date, fees by sale day, payouts by payout date. Prices include 15% VAT.')}
          action={t.balanced && lines.length ? <Badge tone="green" icon={<Scale className="size-3.5" aria-hidden="true" />}>{tx('متوازنة', 'Balanced')}</Badge> : lines.length ? <Badge tone="red">{tx('غير متوازنة', 'Unbalanced')}</Badge> : undefined} />
        <div className="space-y-4 px-5 pb-5">
          <div className="flex flex-wrap items-end gap-3">
            <Segmented label={tx('الفترة', 'Period')} value={preset} onChange={(v) => { if (v === 'this') setRange(def); else if (v === 'last') setRange(monthRange(today, -1)); }} options={[{ value: 'this', label: tx('هذا الشهر', 'This month') }, { value: 'last', label: tx('الشهر الماضي', 'Last month') }, { value: 'custom', label: tx('مخصص', 'Custom') }]} />
            <Field label={tx('من', 'From')} className="w-40">{(p) => <Input {...p} type="date" value={from} max={today} onChange={(e) => e.target.value && setRange({ from: e.target.value, to })} />}</Field>
            <Field label={tx('إلى', 'To')} className="w-40" error={badRange ? tx('بعد تاريخ البداية', 'After the start date') : null}>{(p) => <Input {...p} type="date" value={to} max={today} onChange={(e) => e.target.value && setRange({ from, to: e.target.value })} />}</Field>
          </div>
          <Stats>
            <Stat label={tx('قيود', 'Entries')} value={t.entries} />
            <Stat label={tx('مدين', 'Debit')} value={<Money v={t.debit} />} />
            <Stat label={tx('دائن', 'Credit')} value={<Money v={t.credit} />} />
            <Stat label={tx('الفرق', 'Difference')} value={<Money v={t.debit - t.credit} />} tone={t.balanced ? 'ok' : 'bad'} />
          </Stats>
          {!t.balanced && lines.length > 0 && <Alert tone="bad" title={tx('لا يمكن التصدير', 'Can’t export')}>{tx('قيود غير متوازنة: ', 'Unbalanced entries: ')}<Ref>{t.unbalanced.slice(0, 5).join(', ')}</Ref></Alert>}
          {!lines.length ? <EmptyState icon={<FileSpreadsheet className="size-6" aria-hidden="true" />} title={badRange ? tx('صحّح الفترة', 'Fix the period') : tx('لا قيود في هذه الفترة', 'No entries in this period')}>{!badRange && tx('جرّب الشهر الماضي.', 'Try last month.')}</EmptyState> : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-surface-2 text-xs text-muted"><tr><th className="px-3 py-2 text-start font-medium">{tx('الحساب', 'Account')}</th><th className="px-3 py-2 text-start font-medium">{tx('دوره', 'Role')}</th><th className="px-3 py-2 text-end font-medium">{tx('مدين', 'Debit')}</th><th className="px-3 py-2 text-end font-medium">{tx('دائن', 'Credit')}</th></tr></thead>
                  <tbody className="divide-y divide-border">{accounts.map((a) => (
                    <tr key={a.key}><td className="px-3 py-2"><Ref>{saved.map[a.key].code}</Ref> <span className="text-fg">{saved.map[a.key].name}</span></td><td className="px-3 py-2 text-muted">{ACCOUNT_ROLE[a.key][lang]}</td><td className="px-3 py-2 text-end">{a.debit ? <Money v={a.debit} /> : '—'}</td><td className="px-3 py-2 text-end">{a.credit ? <Money v={a.credit} /> : '—'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <details className="rounded-xl border border-border">
                <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-fg">{tx(`أسطر القيود (أول ${Math.min(PREVIEW, lines.length)} من ${lines.length})`, `Entry lines (first ${Math.min(PREVIEW, lines.length)} of ${lines.length})`)}</summary>
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="bg-surface-2 text-muted"><tr><th className="px-3 py-2 text-start font-medium">{tx('التاريخ', 'Date')}</th><th className="px-3 py-2 text-start font-medium">{tx('القيد', 'Entry')}</th><th className="px-3 py-2 text-start font-medium">{tx('الحساب', 'Account')}</th><th className="px-3 py-2 text-end font-medium">{tx('مدين', 'Debit')}</th><th className="px-3 py-2 text-end font-medium">{tx('دائن', 'Credit')}</th></tr></thead>
                    <tbody className="divide-y divide-border">{lines.slice(0, PREVIEW).map((l, i) => (
                      <tr key={i}><td className="px-3 py-1.5"><Ref>{l.date}</Ref></td><td className="px-3 py-1.5"><Ref>{l.entry}</Ref></td><td className="px-3 py-1.5"><Ref>{saved.map[l.key].code}</Ref> {saved.map[l.key].name}</td><td className="px-3 py-1.5 text-end">{l.debit ? <Money v={l.debit} /> : ''}</td><td className="px-3 py-1.5 text-end">{l.credit ? <Money v={l.credit} /> : ''}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </details>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setConfirm(true)} disabled={!!blocked}><Download className="size-4" aria-hidden="true" />{tx('صدّر ملف CSV', 'Export CSV')}</Button>
            {blocked && <span className="text-xs text-muted">{blocked}</span>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader id="ac-map" title={tx('دليل الحسابات', 'Chart of accounts')} hint={tx('اكتب رمز واسم الحساب كما في نظامك المحاسبي. يمكن أن يخدم حساب واحد أكثر من دور.', 'Type each account’s code and name as in your accounting system. One account may serve several roles.')} />
        <div className="space-y-4 px-5 pb-5">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {ACCOUNT_KEYS.map((k) => {
              const e = mErrs.filter((x) => x.key === k).map((x) => x.error);
              return (
                <li key={k} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.2fr)] sm:items-start">
                  <span className="pt-2 text-sm text-fg">{ACCOUNT_ROLE[k][lang]}</span>
                  <Field label={tx('الرمز', 'Code')} error={e.includes('code') ? tx('١–١٢ حرفًا أو رقمًا', '1–12 letters or digits') : null}>{(p) => <Input {...p} dir="ltr" value={d.map[k].code} onChange={(ev) => f.set({ map: { ...d.map, [k]: { ...d.map[k], code: ev.target.value } } })} />}</Field>
                  <Field label={tx('الاسم', 'Name')} error={e.includes('name') ? tx('اكتب الاسم', 'Enter a name') : null}>{(p) => <Input {...p} value={d.map[k].name} onChange={(ev) => f.set({ map: { ...d.map, [k]: { ...d.map[k], name: ev.target.value } } })} />}</Field>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={tx('صيغة الملف', 'File format')} className="w-56">{(p) => <Select {...p} value={d.format} onChange={(e) => f.set({ format: e.target.value as Form['format'] })}><option value="generic">{tx('قيود يومية CSV عامة', 'Generic journal CSV')}</option><option value="custom">{tx('باسم نظامي المحاسبي', 'Named for my accounting system')}</option></Select>}</Field>
            {d.format === 'custom' && <Field label={tx('اسم نظامك', 'Your system’s name')} className="w-56" error={customBad ? tx('اكتب الاسم', 'Enter the name') : null}>{(p) => <Input {...p} dir="auto" value={d.customName} onChange={(e) => f.set({ customName: e.target.value })} />}</Field>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader id="ac-sched" title={tx('تصدير مجدول', 'Scheduled export')} hint={tx('يُرسل ملف الفترة السابقة إلى البريد في موعده. الإرسال محاكاة في هذه المعاينة.', 'Sends the previous period’s file by email on schedule. Sending is simulated in this preview.')} action={<Simulated />} />
        <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
          <Field label={tx('التكرار', 'Frequency')} className="w-40">{(p) => <Select {...p} value={d.schedule.freq} onChange={(e) => f.set({ schedule: { ...d.schedule, freq: e.target.value as Freq } })}><option value="off">{tx('متوقف', 'Off')}</option><option value="weekly">{tx('أسبوعي (الاثنين)', 'Weekly (Monday)')}</option><option value="monthly">{tx('شهري (أول الشهر)', 'Monthly (1st)')}</option></Select>}</Field>
          {d.schedule.freq !== 'off' && <Field label={tx('بريد المحاسب', 'Accountant email')} className="w-64" error={emailBad ? tx('بريد غير صحيح', 'Invalid email') : null}>{(p) => <Input {...p} dir="ltr" type="email" value={d.schedule.email} onChange={(e) => f.set({ schedule: { ...d.schedule, email: e.target.value } })} />}</Field>}
          {saved.schedule.freq !== 'off' && <p className="flex items-center gap-1.5 pb-2 text-sm text-muted"><CalendarClock className="size-4" aria-hidden="true" />{tx('التالي', 'Next')} <Ref>{nextRun(saved.schedule.freq, today)}</Ref> → <Ref>{saved.schedule.email}</Ref></p>}
        </div>
      </Card>

      <Card>
        <CardHeader id="ac-log" title={tx('سجل التصدير', 'Export history')} />
        <div className="px-5 pb-5">
          {!saved.exports.length ? <EmptyState icon={<FileSpreadsheet className="size-6" aria-hidden="true" />} title={tx('لم تُصدّر قيودًا بعد', 'No entries exported yet')} /> : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {saved.exports.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  {x.debit === x.credit ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /> : <XCircle className="size-4 text-red-600" aria-hidden="true" />}
                  <Ref>{x.file}</Ref>
                  <span className="text-muted">{tx(`${x.lines} سطرًا`, `${x.lines} lines`)} · <Money v={x.debit} /></span>
                  <span className="ms-auto text-xs text-muted">{x.by} · <Ref>{x.at.slice(0, 16).replace('T', ' ')}</Ref></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <SaveBar dirty={f.dirty} saving={f.saving} onSave={save} onDiscard={() => { f.discard(); toast({ tone: 'info', text: tx('تُجوهلت التعديلات', 'Edits discarded') }); }}
        error={formBad && f.dirty ? tx('صحّح الحقول المعلّمة قبل الحفظ', 'Fix the marked fields before saving') : undefined} />

      {confirm && (
        <Modal title={tx('تصدير قيود اليومية', 'Export journal entries')} onClose={() => setConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={doExport}><Download className="size-4" aria-hidden="true" />{tx('نزّل', 'Download')}</Button></>}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted">{tx('الفترة', 'Period')}</dt><dd><Ref>{from} – {to}</Ref></dd></div>
            <div><dt className="text-xs text-muted">{tx('الملف', 'File')}</dt><dd className="break-all"><Ref>{file}</Ref></dd></div>
            <div><dt className="text-xs text-muted">{tx('القيود / الأسطر', 'Entries / lines')}</dt><dd><Ref>{t.entries} / {lines.length}</Ref></dd></div>
            <div><dt className="text-xs text-muted">{tx('مدين = دائن', 'Debit = credit')}</dt><dd><Money v={t.debit} /></dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted">{tx('الأعمدة: التاريخ، القيد، رمز الحساب، اسمه، مدين، دائن، البيان.', 'Columns: date, entry, account code, account name, debit, credit, memo.')}</p>
        </Modal>
      )}
    </div>
  );
}
