// Store verification (`#/dashboard/settings/verification`, Salla audit #97): entity type → details with Saudi formats
// (Arabic digits accepted) → documents per entity (uploaded to this tab only) → preview → send for review.
// One status (merchant/verification-store.ts) drives this page, the payouts notice, the settings card and the work centre.
// Review mode simulates LAK's reviewer (under review, needs info with a reason, verified, rejected).
import { useRef, useState } from 'react';
import { BadgeCheck, Building2, Eye, FileCheck2, FileUp, FlaskConical, HandHeart, History, RefreshCw, Store, Trash2, User } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { Badge, Button, InfoHint, Ref, cn, useTx } from '../../../ds/ui';
import { Alert, Checkbox, Field, Input, Modal, Simulated, Switch, Textarea, useToast } from '../../../ds/kit';
import type { L } from '../../merchant/domain';
import { checkIban, formatIban, maskIban } from '../../merchant/finance';
import { testStore } from '../../merchant/stores';
import {
  DOC_LABEL, ENTITIES, ENTITY_HINT, ENTITY_LABEL, FIELD_LABEL, NEXT, STATUS_LABEL, STATUS_TONE, canEdit, checkFile, digitsOf, emptyForm, mask,
  requiredDocs, requiredFields, validateForm, type Decision, type DocKind, type Entity, type FieldKey, type VError, type VForm, type Verification,
} from '../../merchant/verification';
import { dropFile, fileUrl, keepFile, simulateDecision, simulateStart, submitVerification, verificationStore } from '../../merchant/verification-store';
import { useUnsaved } from '../unsaved';
import { useSessionDraft } from './drafts';
import { Section } from './common';
import { settingsSimStore } from './stores';
import { PayoutHoldNotice, VerificationBadge } from './verification-notice';

const ENTITY_ICON: Record<Entity, typeof User> = { individual: User, sole: Store, company: Building2, charity: HandHeart };

function useErrText() {
  const tx = useTx();
  return (k: FieldKey | DocKind, e: VError): string => {
    if (e === 'required') return tx('مطلوب', 'Required');
    if (e === 'missingDoc') return tx('ارفع هذا الملف', 'Upload this file');
    if (k === 'legalName') return tx('الاسم قصير جدًا', 'Too short');
    if (k === 'idNumber') return e === 'prefix' ? tx('يبدأ بـ 1 للمواطن أو 2 للمقيم', 'Starts with 1 (citizen) or 2 (resident)') : e === 'checksum' ? tx('الرقم غير صحيح، راجع الخانات', 'Not a valid number; check the digits') : tx('10 أرقام', '10 digits');
    if (k === 'crNumber') return tx('10 أرقام', '10 digits');
    if (k === 'licenceNumber') return tx('من 1 إلى 8 أرقام', '1 to 8 digits');
    if (k === 'vatNumber') return e === 'pattern' ? tx('يبدأ وينتهي بالرقم 3', 'Starts and ends with 3') : tx('15 رقمًا', '15 digits');
    if (k === 'iban') return ({ empty: tx('مطلوب', 'Required'), country: tx('يبدأ بـ SA', 'Starts with SA'), length: tx('24 خانة', '24 characters'), chars: tx('حروف وأرقام فقط', 'Letters and digits only'), checksum: tx('رقم الآيبان غير صحيح', 'Not a valid IBAN') } as Record<string, string>)[e] ?? tx('غير صحيح', 'Invalid');
    return tx('غير صحيح', 'Invalid');
  };
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (at: number, lang: 'ar' | 'en') => new Date(at).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function VerificationPage() {
  const tx = useTx();
  const v = verificationStore.use();
  const role = testStore.use().role;
  const owner = role === 'owner';
  const open = canEdit(v.status);
  const base = v.status === 'not_started' ? emptyForm() : v.form;
  const [draft, setDraft, clearDraft] = useSessionDraft<VForm>('verification', base);
  const dirty = open && owner && JSON.stringify(draft) !== JSON.stringify(base);
  useUnsaved(dirty, { ar: 'بيانات توثيق المتجر', en: 'Store verification details' });

  return (
    <>
      <ReviewerSim v={v} />
      <StatusCard v={v} />
      {open && owner && <VerificationForm v={v} draft={draft} setDraft={setDraft} clearDraft={clearDraft} dirty={dirty} />}
      {open && !owner && <Alert tone="info" title={tx('المالك فقط يرسل طلب التوثيق', 'Only the owner submits verification')}>{tx('يمكنك متابعة الحالة هنا. البيانات النظامية والآيبان يرسلها مالك المتجر.', 'You can follow the status here. The store owner sends the legal details and IBAN.')}</Alert>}
      {!open && <SubmittedDetails v={v} />}
      <HistoryCard v={v} />
    </>
  );
}

/* ---------- Status ---------- */

function StatusCard({ v }: { v: Verification }) {
  const tx = useTx();
  const { lang } = useLang();
  const steps: { id: 'send' | 'review' | 'done'; label: string }[] = [
    { id: 'send', label: tx('إرسال البيانات', 'Send details') }, { id: 'review', label: tx('مراجعة لك', 'LAK review') }, { id: 'done', label: tx('موثّق', 'Verified') },
  ];
  const at = { not_started: 0, needs_info: 0, rejected: 0, submitted: 1, under_review: 1, verified: 3 }[v.status];
  const verifiedAt = v.history.find((h) => h.status === 'verified')?.at;
  return (
    <Section id="kyc-status" title={tx('حالة التوثيق', 'Verification status')} hint={<InfoHint>{tx('حالة واحدة تقرؤها كل الشاشات: الإعدادات والتحويلات ومركز العمل. التحويلات لا تبدأ قبل «موثّق».', 'One status every screen reads: settings, payouts and the work centre. Payouts start only once it is “Verified”.')}</InfoHint>}
      action={<span className="flex items-center gap-2"><VerificationBadge />{v.ref && <Ref>{v.ref}</Ref>}</span>}>
      <ol className="mb-4 grid grid-cols-3 gap-2" aria-label={tx('مراحل التوثيق', 'Verification steps')}>
        {steps.map((s, i) => {
          const done = i < at; const cur = i === at;
          return (
            <li key={s.id} aria-current={cur ? 'step' : undefined} className="min-w-0">
              <span className={cn('block h-1.5 rounded-full', done ? 'bg-emerald-500' : cur ? 'bg-brand-500' : 'bg-surface-2')} />
              <span className={cn('mt-1.5 block truncate text-xs', done || cur ? 'font-semibold text-fg' : 'text-subtle')}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      {v.status === 'needs_info' && <div className="mb-3"><Alert tone="bad" title={tx('طلبنا استكمالًا', 'We asked for more information')}>{v.reason}{v.flagged?.length ? <> · {v.flagged.map((k) => (k in DOC_LABEL ? DOC_LABEL[k as DocKind] : FIELD_LABEL[k as FieldKey])[lang]).join(tx('، ', ', '))}</> : null}</Alert></div>}
      {v.status === 'rejected' && <div className="mb-3"><Alert tone="bad" title={tx('رُفض الطلب', 'The application was rejected')}>{v.reason} {tx('صحّح البيانات وأعد الإرسال، أو تواصل مع الدعم.', 'Correct the details and resubmit, or contact support.')}</Alert></div>}
      {v.status === 'verified'
        ? <Alert tone="ok" title={tx('المتجر موثّق والتحويلات تعمل', 'The store is verified and payouts are on')}>{verifiedAt ? tx(`وُثّق في ${when(verifiedAt, 'ar')}. `, `Verified on ${when(verifiedAt, 'en')}. `) : ''}{tx(`تُحوَّل المبالغ إلى ${maskIban(v.form.iban)}. لتغيير البيانات النظامية تواصل مع الدعم.`, `Payouts go to ${maskIban(v.form.iban)}. To change legal details, contact support.`)}</Alert>
        : <PayoutHoldNotice action={false} />}
    </Section>
  );
}

/* ---------- Form ---------- */

function VerificationForm({ v, draft, setDraft, clearDraft, dirty }: { v: Verification; draft: VForm; setDraft: (f: VForm) => void; clearDraft: () => void; dirty: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const errText = useErrText();
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const errors = validateForm(draft);
  const nErr = Object.keys(errors).length;
  const need = new Set(requiredFields(draft));
  const flagged = new Set(v.status === 'needs_info' ? v.flagged ?? [] : []);
  const set = (p: Partial<VForm>) => setDraft({ ...draft, ...p });
  const err = (k: FieldKey | DocKind) => (tried && errors[k] ? errText(k, errors[k]!) : null);
  const person = draft.entity === 'company' || draft.entity === 'charity' ? tx('هوية المفوّض بالتوقيع', 'Authorised signatory ID') : tx('رقم هوية المالك أو إقامته', 'Owner’s ID or iqama number');
  const iban = checkIban(digitsOf(draft.iban));

  const field = (k: Exclude<FieldKey, 'entity'>, label: string, opts: { hint?: string; ltr?: boolean; numeric?: boolean; placeholder?: string } = {}) => need.has(k) && (
    <Field label={<>{label}{flagged.has(k) && <Badge tone="red">{tx('مطلوب تصحيحه', 'Needs a fix')}</Badge>}</>} hint={opts.hint} error={err(k)}>
      {(p) => <Input {...p} dir={opts.ltr ? 'ltr' : undefined} inputMode={opts.numeric ? 'numeric' : undefined} placeholder={opts.placeholder} value={draft[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<VForm>)} autoComplete="off" />}
    </Field>
  );

  const send = () => {
    setSending(true); setSendError(null);
    window.setTimeout(() => {
      setSending(false);
      if (settingsSimStore.get().failSave) { setSendError(tx('تعذّر الإرسال (SIM-KYC-503). بياناتك وملفاتك محفوظة في هذه الجلسة؛ أعد المحاولة.', 'Couldn’t send (SIM-KYC-503). Your details and files are kept in this session; try again.')); return; }
      const r = submitVerification(draft);
      if (!r.ok) { setSendError(r.error === 'state' ? tx('تغيّرت حالة التوثيق. حدّث الصفحة.', 'The verification status changed. Refresh the page.') : tx('بعض البيانات غير مكتملة.', 'Some details are incomplete.')); return; }
      clearDraft(); setPreview(false); setTried(false);
      toast({ tone: 'ok', text: tx(`أُرسل طلب التوثيق ${r.v.ref}`, `Verification ${r.v.ref} sent for review`) });
    }, 700);
  };

  return (
    <>
      <Section id="kyc-entity" title={tx('١. نوع الكيان', '1. Entity type')} hint={<InfoHint>{tx('يحدد النوعُ البيانات والوثائق المطلوبة. اختر ما يطابق الاسم الذي ستستلم به التحويلات.', 'The type decides which details and documents are needed. Pick the one that matches the name payouts will be made to.')}</InfoHint>}>
        <div role="radiogroup" aria-label={tx('نوع الكيان', 'Entity type')} className="grid gap-2 sm:grid-cols-2">
          {ENTITIES.map((e) => {
            const I = ENTITY_ICON[e]; const on = draft.entity === e;
            return (
              <button key={e} type="button" role="radio" aria-checked={on} onClick={() => set({ entity: e, vatRegistered: e === 'company' ? true : draft.vatRegistered })}
                className={cn('flex items-start gap-3 rounded-xl border p-3 text-start transition-colors', on ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-300')}>
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', on ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'bg-surface-2 text-muted')}><I className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-fg">{ENTITY_LABEL[e][lang]}</span><span className="block text-xs text-muted">{ENTITY_HINT[e][lang]}</span></span>
              </button>
            );
          })}
        </div>
        {tried && errors.entity && <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{tx('اختر نوع الكيان', 'Choose the entity type')}</p>}
      </Section>

      {draft.entity && (
        <Section id="kyc-details" title={tx('٢. البيانات النظامية', '2. Legal details')} hint={<InfoHint>{tx('الأرقام العربية والإنجليزية مقبولة. نعرض آخر 4 أرقام فقط في السجل والمعاينة.', 'Arabic or Latin digits both work. Only the last 4 digits are shown in previews and the log.')}</InfoHint>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{field('legalName', draft.entity === 'individual' ? tx('الاسم كما في الهوية', 'Name as on the ID') : tx('الاسم النظامي كما في السجل أو الترخيص', 'Legal name as on the registration or licence'))}</div>
            {field('crNumber', FIELD_LABEL.crNumber[lang], { ltr: true, numeric: true, hint: tx('10 أرقام', '10 digits') })}
            {field('licenceNumber', FIELD_LABEL.licenceNumber[lang], { ltr: true, numeric: true })}
            {field('idNumber', person, { ltr: true, numeric: true, hint: tx('10 أرقام تبدأ بـ 1 أو 2', '10 digits starting with 1 or 2') })}
            <div className="sm:col-span-2">
              {field('iban', FIELD_LABEL.iban[lang], { ltr: true, placeholder: 'SA00 0000 0000 0000 0000 0000', hint: iban.ok ? `${iban.bank?.[lang] ?? tx('بنك غير معروف', 'Unknown bank')} · ${formatIban(iban.iban)}` : tx('باسم الكيان نفسه', 'In the entity’s own name') })}
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={draft.vatRegistered} onChange={(x) => set({ vatRegistered: x })} label={tx('مسجّل في ضريبة القيمة المضافة', 'VAT-registered')} />
              <span className="text-sm text-fg">{tx('مسجّل في ضريبة القيمة المضافة', 'VAT-registered')}</span>
            </div>
            {field('vatNumber', FIELD_LABEL.vatNumber[lang], { ltr: true, numeric: true, hint: tx('15 رقمًا تبدأ وتنتهي بـ 3', '15 digits, starts and ends with 3') })}
          </div>
        </Section>
      )}

      {draft.entity && <DocsSection draft={draft} set={set} tried={tried} errors={errors} flagged={flagged} />}

      {draft.entity && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => { setTried(true); if (!nErr) { setSendError(null); setPreview(true); } }}><FileCheck2 className="size-4" aria-hidden="true" />{tx('راجع وأرسل للتوثيق', 'Review and send for verification')}</Button>
          {tried && nErr > 0 && <span role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{tx(`${nErr} حقول أو ملفات تحتاج تصحيحًا`, `${nErr} fields or files need attention`)}</span>}
          {dirty && !(tried && nErr) && <span className="text-xs text-muted">{tx('مسودتك محفوظة في هذه الجلسة', 'Your draft is kept in this session')}</span>}
        </div>
      )}

      {preview && (
        <Modal size="lg" title={tx('مراجعة طلب التوثيق', 'Review your verification')} onClose={() => !sending && setPreview(false)}
          description={<span className="inline-flex flex-wrap items-center gap-2">{tx('هذا ما يراه فريق المراجعة.', 'This is what the review team sees.')}<Simulated /></span>}
          footer={<><Button variant="secondary" disabled={sending} onClick={() => setPreview(false)}>{tx('عدّل', 'Edit')}</Button><Button disabled={sending} onClick={send}>{sending ? tx('يُرسل…', 'Sending…') : sendError ? <><RefreshCw className="size-4" aria-hidden="true" />{tx('أعد المحاولة', 'Try again')}</> : tx('أرسل للمراجعة', 'Send for review')}</Button></>}>
          <div className="space-y-4">
            {sendError && <Alert tone="bad">{sendError}</Alert>}
            <FormSummary f={draft} />
            <ul className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-[13px] text-fg">
              <li>{tx('• تراجع «لك» الطلب عادةً خلال يومي عمل.', '• LAK usually reviews within two business days.')}</li>
              <li>{tx('• التحويلات تبقى محجوزة حتى التوثيق؛ المبيعات تُحصَّل وتبقى معلّقة.', '• Payouts stay held until verified; sales are still collected and stay pending.')}</li>
              <li>{tx('• لا يمكن التعديل أثناء المراجعة. إن طلبنا استكمالًا يصلك السبب هنا.', '• You can’t edit during review. If we need more, the reason appears here.')}</li>
              <li>{tx('• العملاء لا يرون شيئًا من هذه البيانات.', '• Shoppers see none of these details.')}</li>
            </ul>
          </div>
        </Modal>
      )}
    </>
  );
}

function DocsSection({ draft, set, tried, errors, flagged }: { draft: VForm; set: (p: Partial<VForm>) => void; tried: boolean; errors: ReturnType<typeof validateForm>; flagged: Set<string> }) {
  const tx = useTx();
  const { lang } = useLang();
  const inputs = useRef<Partial<Record<DocKind, HTMLInputElement | null>>>({});
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [fileErr, setFileErr] = useState<Partial<Record<DocKind, string>>>({});
  const docs = requiredDocs(draft);
  const pick = (kind: DocKind, f: File | undefined) => {
    if (!f) return;
    const e = checkFile(f);
    if (e) { setFileErr((x) => ({ ...x, [kind]: e === 'type' ? tx('PDF أو JPG أو PNG فقط', 'PDF, JPG or PNG only') : e === 'size' ? tx('أكبر من 5 ميجابايت', 'Larger than 5 MB') : tx('الملف فارغ', 'The file is empty') })); return; }
    setFileErr((x) => ({ ...x, [kind]: undefined }));
    setBusy(kind);
    // Simulated upload: the file stays in this tab (object URL); only its name, size and type are kept in the session.
    window.setTimeout(() => {
      keepFile(kind, f);
      set({ docs: { ...draft.docs, [kind]: { name: f.name, size: f.size, type: f.type || 'application/octet-stream', at: Date.now() } } });
      setBusy(null);
    }, 500);
  };
  const remove = (kind: DocKind) => { dropFile(kind); const d = { ...draft.docs }; delete d[kind]; set({ docs: d }); };

  return (
    <Section id="kyc-docs" flush title={tx('٣. الوثائق', '3. Documents')} hint={<InfoHint>{tx('PDF أو JPG أو PNG حتى 5 ميجابايت. الملفات تبقى في هذا التبويب فقط (محاكاة) ولا تُرفع لخادم.', 'PDF, JPG or PNG up to 5 MB. Files stay in this tab only (simulated) and are not uploaded to a server.')}</InfoHint>}
      action={<Simulated />}>
      <ul className="divide-y divide-border">
        {docs.map(({ kind, required }) => {
          const f = draft.docs[kind];
          const url = f ? fileUrl(kind) : null;
          const problem = fileErr[kind] ?? (tried && errors[kind] ? tx('ارفع هذا الملف', 'Upload this file') : null);
          return (
            <li key={kind} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3', flagged.has(kind) && 'bg-red-500/5')}>
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', f ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-surface-2 text-muted')}>{f ? <BadgeCheck className="size-4" aria-hidden="true" /> : <FileUp className="size-4" aria-hidden="true" />}</span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{DOC_LABEL[kind][lang]}{!required && <span className="text-xs font-normal text-subtle">{tx('(اختياري)', '(optional)')}</span>}{flagged.has(kind) && <Badge tone="red">{tx('مطلوب تصحيحه', 'Needs a fix')}</Badge>}</p>
                <p className="truncate text-xs text-muted">{busy === kind ? tx('يُرفع…', 'Uploading…') : f ? <><bdi>{f.name}</bdi> · <bdi dir="ltr">{kb(f.size)}</bdi>{!url && tx(' · أعد الرفع للمعاينة', ' · re-upload to preview')}</> : tx('لم يُرفع بعد', 'Not uploaded yet')}</p>
                {problem && <p role="alert" className="mt-0.5 text-xs font-medium text-red-600 dark:text-red-400">{problem}</p>}
              </div>
              <input ref={(el) => { inputs.current[kind] = el; }} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" data-doc={kind}
                onChange={(e) => { pick(kind, e.target.files?.[0]); e.target.value = ''; }} />
              <span className="flex items-center gap-1">
                {url && <a href={url} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label={tx(`اعرض ${DOC_LABEL[kind].ar}`, `View ${DOC_LABEL[kind].en}`)}><Eye className="size-4" aria-hidden="true" /></a>}
                {f && <button type="button" onClick={() => remove(kind)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label={tx(`احذف ${DOC_LABEL[kind].ar}`, `Remove ${DOC_LABEL[kind].en}`)}><Trash2 className="size-4" aria-hidden="true" /></button>}
                <Button size="sm" variant={f ? 'ghost' : 'secondary'} disabled={busy === kind} onClick={() => inputs.current[kind]?.click()}>{f ? tx('استبدل', 'Replace') : tx('ارفع', 'Upload')}</Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** What was (or will be) sent, masked: used in the preview and the read-only view. */
function FormSummary({ f }: { f: VForm }) {
  const tx = useTx();
  const { lang } = useLang();
  const need = new Set(requiredFields(f));
  const rows: { label: L | string; value: React.ReactNode }[] = [
    { label: FIELD_LABEL.entity, value: f.entity ? ENTITY_LABEL[f.entity][lang] : '—' },
    { label: FIELD_LABEL.legalName, value: f.legalName },
    ...(need.has('crNumber') ? [{ label: FIELD_LABEL.crNumber, value: <Ref>{digitsOf(f.crNumber)}</Ref> }] : []),
    ...(need.has('licenceNumber') ? [{ label: FIELD_LABEL.licenceNumber, value: <Ref>{digitsOf(f.licenceNumber)}</Ref> }] : []),
    { label: FIELD_LABEL.idNumber, value: <Ref>{mask(f.idNumber)}</Ref> },
    { label: FIELD_LABEL.vatNumber, value: f.vatRegistered ? <Ref>{digitsOf(f.vatNumber)}</Ref> : tx('غير مسجّل', 'Not registered') },
    { label: FIELD_LABEL.iban, value: <Ref>{maskIban(digitsOf(f.iban))}</Ref> },
  ];
  const docs = requiredDocs(f).filter((d) => f.docs[d.kind]);
  return (
    <div className="space-y-3">
      <dl className="divide-y divide-border rounded-xl border border-border text-[13px]">
        {rows.map((r) => {
          const label = typeof r.label === 'string' ? r.label : r.label[lang];
          return <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2"><dt className="text-muted">{label}</dt><dd className="font-medium text-fg">{r.value}</dd></div>;
        })}
      </dl>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-subtle">{tx(`الوثائق (${docs.length})`, `Documents (${docs.length})`)}</p>
        <ul className="flex flex-wrap gap-2">{docs.map((d) => <li key={d.kind}><Badge tone="gray" icon={<FileCheck2 className="size-3.5" aria-hidden="true" />}>{DOC_LABEL[d.kind][lang]}</Badge></li>)}</ul>
      </div>
    </div>
  );
}

function SubmittedDetails({ v }: { v: Verification }) {
  const tx = useTx();
  return (
    <Section id="kyc-sent" title={v.status === 'verified' ? tx('البيانات الموثّقة', 'Verified details') : tx('البيانات المرسلة', 'Details sent')}
      hint={<InfoHint>{tx('للقراءة فقط أثناء المراجعة وبعد التوثيق. التغيير بعد التوثيق يمر عبر الدعم لأنه يغيّر حساب التحويلات.', 'Read-only during review and after verification. Changes after verification go through support because they change the payout account.')}</InfoHint>}>
      <FormSummary f={v.form} />
    </Section>
  );
}

function HistoryCard({ v }: { v: Verification }) {
  const tx = useTx();
  const { lang } = useLang();
  if (!v.history.length) return null;
  return (
    <Section id="kyc-log" flush title={<><History className="size-4 text-muted" aria-hidden="true" />{tx('السجل', 'History')}</>}>
      <ul className="divide-y divide-border">
        {v.history.map((h, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13px]">
            <Badge tone={STATUS_TONE[h.status]}>{STATUS_LABEL[h.status][lang]}</Badge>
            <span className="text-muted">{h.by.startsWith('LAK') ? tx('فريق لك (محاكاة)', 'LAK team (simulated)') : h.by}</span>
            {h.note && <span className="min-w-0 flex-1 truncate text-fg">{h.note}</span>}
            <span className="ms-auto text-xs tabular-nums text-subtle">{when(h.at, lang)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- Review mode: LAK's reviewer, simulated ---------- */

function ReviewerSim({ v }: { v: Verification }) {
  const tx = useTx();
  const { lang } = useLang();
  const review = useReviewMode();
  const [ask, setAsk] = useState<'needs_info' | 'rejected' | null>(null);
  const [reason, setReason] = useState('');
  const [marks, setMarks] = useState<string[]>([]);
  const [err, setErr] = useState(false);
  if (!review) return null;
  const go = (to: Decision) => {
    if (to === 'needs_info' || to === 'rejected') { setAsk(to); setReason(''); setMarks([]); setErr(false); return; }
    simulateDecision(to);
  };
  const confirm = () => {
    if (!ask) return;
    const r = simulateDecision(ask, reason, marks as (DocKind | FieldKey)[]);
    if (!r.ok) { setErr(true); return; }
    setAsk(null);
  };
  const label: Record<Decision, string> = { under_review: tx('ابدأ المراجعة', 'Start review'), needs_info: tx('اطلب استكمالًا', 'Ask for more'), verified: tx('وثّق', 'Verify'), rejected: tx('ارفض', 'Reject') };
  const options = v.form.entity ? [...requiredDocs(v.form).map((d) => ({ k: d.kind as string, l: DOC_LABEL[d.kind] })), ...requiredFields(v.form).filter((k) => k !== 'entity' && !requiredDocs(v.form).some((d) => d.kind === (k as string))).map((k) => ({ k: k as string, l: FIELD_LABEL[k] }))] : [];
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-border bg-surface px-4 py-3" role="region" aria-label={tx('مراجع لك (محاكاة)', 'LAK reviewer (simulated)')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted"><FlaskConical className="size-4" aria-hidden="true" />{tx('مراجع لك (محاكاة)', 'LAK reviewer (simulated)')}</span>
        {(NEXT[v.status] as Decision[]).map((d) => <Button key={d} size="sm" variant={d === 'verified' ? 'soft' : 'secondary'} onClick={() => go(d)}>{label[d]}</Button>)}
        {!NEXT[v.status].length && <span className="text-xs text-subtle">{v.status === 'verified' ? tx('لا قرار متاح: موثّق', 'No decision: verified') : tx('بانتظار إرسال التاجر', 'Waiting for the merchant to send')}</span>}
        <span className="ms-auto flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => simulateStart('not_started')}>{tx('ابدأ من الصفر', 'Start empty')}</Button>
          <Button size="sm" variant="ghost" onClick={() => simulateStart('verified')}>{tx('موثّق (البيانات التجريبية)', 'Verified (demo data)')}</Button>
        </span>
      </div>
      {ask && (
        <Modal title={ask === 'needs_info' ? tx('طلب استكمال', 'Ask for more information') : tx('رفض الطلب', 'Reject the application')} onClose={() => setAsk(null)}
          footer={<><Button variant="secondary" onClick={() => setAsk(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant={ask === 'rejected' ? 'danger' : 'primary'} onClick={confirm}>{label[ask]}</Button></>}>
          <div className="space-y-4">
            <Field label={tx('السبب الذي يراه التاجر', 'Reason the merchant sees')} error={err && !reason.trim() ? tx('اكتب السبب', 'Write the reason') : null}>
              {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tx('مثال: خطاب الآيبان غير مقروء', 'e.g. The IBAN letter is unreadable')} />}
            </Field>
            {ask === 'needs_info' && options.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('ما يحتاج تصحيحًا', 'What needs fixing')}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((o) => <label key={o.k} className="flex items-center gap-2 text-[13px] text-fg"><Checkbox checked={marks.includes(o.k)} onChange={(c) => setMarks(c ? [...marks, o.k] : marks.filter((x) => x !== o.k))} label={o.l[lang]} />{o.l[lang]}</label>)}
                </div>
              </fieldset>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
