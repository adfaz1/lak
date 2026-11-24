// Store verification (KYC): who the merchant is legally, the documents that prove it, and one status that every
// screen reads (settings, payouts notice, work centre, search). Pure rules; the session store is verification-store.ts.
// Simulated: nothing is sent to a real reviewer. Formats follow Saudi conventions (ID with check digit, 10-digit CR,
// 15-digit VAT starting and ending with 3, SA IBAN via finance.checkIban); Arabic-Indic digits are accepted.
import type { L } from './domain';
import { checkIban, type IbanError } from './finance';

export type Entity = 'individual' | 'sole' | 'company' | 'charity';
export const ENTITIES: Entity[] = ['individual', 'sole', 'company', 'charity'];
export const ENTITY_LABEL: Record<Entity, L> = {
  individual: { ar: 'فرد', en: 'Individual' },
  sole: { ar: 'مؤسسة فردية', en: 'Sole proprietorship' },
  company: { ar: 'شركة', en: 'Company' },
  charity: { ar: 'جهة خيرية', en: 'Charity' },
};
export const ENTITY_HINT: Record<Entity, L> = {
  individual: { ar: 'تبيع باسمك بهوية أو وثيقة عمل حر', en: 'You sell in your own name with an ID or freelance licence' },
  sole: { ar: 'سجل تجاري باسم مالك واحد', en: 'A commercial registration with one owner' },
  company: { ar: 'سجل تجاري لشركة ومفوّض بالتوقيع', en: 'A company registration and an authorised signatory' },
  charity: { ar: 'ترخيص من المركز الوطني للقطاع غير الربحي', en: 'A licence from the non-profit sector regulator' },
};

export type DocKind = 'nationalId' | 'freelance' | 'cr' | 'articles' | 'authorizedId' | 'charityLicense' | 'vat' | 'iban';
export const DOC_LABEL: Record<DocKind, L> = {
  nationalId: { ar: 'صورة الهوية الوطنية أو الإقامة', en: 'National ID or iqama' },
  freelance: { ar: 'وثيقة العمل الحر', en: 'Freelance licence' },
  cr: { ar: 'السجل التجاري', en: 'Commercial registration' },
  articles: { ar: 'عقد التأسيس', en: 'Articles of association' },
  authorizedId: { ar: 'هوية المفوّض بالتوقيع', en: 'Authorised signatory ID' },
  charityLicense: { ar: 'ترخيص الجهة', en: 'Charity licence' },
  vat: { ar: 'شهادة ضريبة القيمة المضافة', en: 'VAT certificate' },
  iban: { ar: 'خطاب الآيبان من البنك', en: 'IBAN letter from the bank' },
};

export type VStatus = 'not_started' | 'submitted' | 'under_review' | 'needs_info' | 'verified' | 'rejected';
export const V_STATUSES: VStatus[] = ['not_started', 'submitted', 'under_review', 'needs_info', 'verified', 'rejected'];
export const STATUS_LABEL: Record<VStatus, L> = {
  not_started: { ar: 'لم يبدأ التوثيق', en: 'Not started' },
  submitted: { ar: 'أُرسل للمراجعة', en: 'Submitted' },
  under_review: { ar: 'قيد المراجعة', en: 'Under review' },
  needs_info: { ar: 'يحتاج استكمالًا', en: 'Needs more information' },
  verified: { ar: 'موثّق', en: 'Verified' },
  rejected: { ar: 'مرفوض', en: 'Rejected' },
};
export const STATUS_TONE: Record<VStatus, 'gray' | 'amber' | 'red' | 'green'> = {
  not_started: 'red', submitted: 'amber', under_review: 'amber', needs_info: 'red', verified: 'green', rejected: 'red',
};

export interface VFile { name: string; size: number; type: string; at: number }
export interface VForm {
  entity: Entity | '';
  /** Name exactly as on the ID, registration or licence. */
  legalName: string;
  /** National ID or iqama of the owner (individual, sole) or the authorised signatory (company, charity). */
  idNumber: string;
  crNumber: string;
  licenceNumber: string;
  vatRegistered: boolean;
  vatNumber: string;
  iban: string;
  docs: Partial<Record<DocKind, VFile>>;
}
export const emptyForm = (): VForm => ({ entity: '', legalName: '', idNumber: '', crNumber: '', licenceNumber: '', vatRegistered: false, vatNumber: '', iban: '', docs: {} });

export interface VEvent { status: VStatus; at: number; by: string; note?: string }
export interface Verification {
  status: VStatus;
  /** What was last submitted (the review reads this, not the draft being edited). */
  form: VForm;
  ref: string | null;
  /** Reviewer's reason for needs_info / rejected, and the documents or fields it points at. */
  reason?: string;
  flagged?: (DocKind | FieldKey)[];
  history: VEvent[];
}

/* ---------- Requirements per entity ---------- */

export type FieldKey = 'entity' | 'legalName' | 'idNumber' | 'crNumber' | 'licenceNumber' | 'vatNumber' | 'iban';
export const FIELD_LABEL: Record<FieldKey, L> = {
  entity: { ar: 'نوع الكيان', en: 'Entity type' },
  legalName: { ar: 'الاسم النظامي', en: 'Legal name' },
  idNumber: { ar: 'رقم الهوية أو الإقامة', en: 'ID or iqama number' },
  crNumber: { ar: 'رقم السجل التجاري', en: 'Commercial registration number' },
  licenceNumber: { ar: 'رقم الترخيص', en: 'Licence number' },
  vatNumber: { ar: 'الرقم الضريبي', en: 'VAT number' },
  iban: { ar: 'الآيبان لاستلام التحويلات', en: 'IBAN for payouts' },
};

/** Fields each entity type must fill. VAT is added when the merchant says they are VAT-registered. */
export function requiredFields(f: Pick<VForm, 'entity' | 'vatRegistered'>): FieldKey[] {
  if (!f.entity) return ['entity'];
  const base: Record<Entity, FieldKey[]> = {
    individual: ['legalName', 'idNumber', 'iban'],
    sole: ['legalName', 'crNumber', 'idNumber', 'iban'],
    company: ['legalName', 'crNumber', 'idNumber', 'iban'],
    charity: ['legalName', 'licenceNumber', 'idNumber', 'iban'],
  };
  return ['entity', ...base[f.entity], ...(f.vatRegistered ? (['vatNumber'] as FieldKey[]) : [])];
}

/** Documents per entity type: required ones block submission, optional ones are offered. */
export function requiredDocs(f: Pick<VForm, 'entity' | 'vatRegistered'>): { kind: DocKind; required: boolean }[] {
  if (!f.entity) return [];
  const r = (kind: DocKind, required = true) => ({ kind, required });
  const vat = r('vat', f.vatRegistered);
  switch (f.entity) {
    case 'individual': return [r('nationalId'), r('iban'), r('freelance', false), ...(f.vatRegistered ? [vat] : [])];
    case 'sole': return [r('cr'), r('nationalId'), r('iban'), vat];
    case 'company': return [r('cr'), r('articles'), r('authorizedId'), r('iban'), vat];
    case 'charity': return [r('charityLicense'), r('authorizedId'), r('iban'), vat];
  }
}

/* ---------- Formats (Arabic digits accepted) ---------- */

/** Arabic-Indic and Persian digits to Latin; spaces and dashes removed. */
export const digitsOf = (s: string): string =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[\s\-_.]/g, '');

export type IdError = 'format' | 'prefix' | 'checksum';
/** Saudi national ID (starts with 1) or iqama (starts with 2): 10 digits with a Luhn-style check digit. */
export function checkSaudiId(input: string): { ok: true; value: string; kind: 'citizen' | 'resident' } | { ok: false; error: IdError } {
  const s = digitsOf(input);
  if (!/^\d{10}$/.test(s)) return { ok: false, error: 'format' };
  if (s[0] !== '1' && s[0] !== '2') return { ok: false, error: 'prefix' };
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(s[i]);
    if (i % 2 === 0) { const x = d * 2; sum += Math.floor(x / 10) + (x % 10); } else sum += d;
  }
  return sum % 10 === 0 ? { ok: true, value: s, kind: s[0] === '1' ? 'citizen' : 'resident' } : { ok: false, error: 'checksum' };
}
/** Commercial registration: 10 digits (older city-coded numbers and the unified 7xxxxxxxxx both). */
export const checkCr = (input: string) => { const s = digitsOf(input); return /^\d{10}$/.test(s) ? { ok: true as const, value: s } : { ok: false as const, error: 'format' as const }; };
/** VAT registration number: 15 digits, first and last digit 3. */
export function checkVat(input: string): { ok: true; value: string } | { ok: false; error: 'format' | 'pattern' } {
  const s = digitsOf(input);
  if (!/^\d{15}$/.test(s)) return { ok: false, error: 'format' };
  return s[0] === '3' && s[14] === '3' ? { ok: true, value: s } : { ok: false, error: 'pattern' };
}
export const checkLicence = (input: string) => { const s = digitsOf(input); return /^\d{1,8}$/.test(s) ? { ok: true as const, value: s } : { ok: false as const, error: 'format' as const }; };

export const MAX_FILE = 5 * 1024 * 1024;
export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export type FileError = 'type' | 'size' | 'empty';
export function checkFile(f: { name: string; size: number; type: string }): FileError | null {
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  if (!FILE_TYPES.includes(f.type) && !['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) return 'type';
  if (f.size <= 0) return 'empty';
  return f.size > MAX_FILE ? 'size' : null;
}

export type VError = 'required' | IdError | 'pattern' | IbanError | 'missingDoc';
/** Every problem that blocks submission, keyed by field or document. */
export function validateForm(f: VForm): Partial<Record<FieldKey | DocKind, VError>> {
  const e: Partial<Record<FieldKey | DocKind, VError>> = {};
  for (const k of requiredFields(f)) {
    const v = k === 'entity' ? f.entity : f[k];
    if (!String(v).trim()) { e[k] = 'required'; continue; }
    if (k === 'idNumber') { const r = checkSaudiId(v); if (!r.ok) e[k] = r.error; }
    if (k === 'crNumber' && !checkCr(v).ok) e[k] = 'format';
    if (k === 'licenceNumber' && !checkLicence(v).ok) e[k] = 'format';
    if (k === 'vatNumber') { const r = checkVat(v); if (!r.ok) e[k] = r.error; }
    if (k === 'iban') { const r = checkIban(digitsOf(v)); if (!r.ok) e[k] = r.error; }
  }
  if (f.legalName.trim() && f.legalName.trim().length < 3) e.legalName = 'format';
  for (const d of requiredDocs(f)) if (d.required && !f.docs[d.kind]) e[d.kind] = 'missingDoc';
  return e;
}

/** Form ready to send: digits normalised, documents not asked for by this entity dropped. */
export function cleanForm(f: VForm): VForm {
  const kinds = new Set(requiredDocs(f).map((d) => d.kind));
  const docs = Object.fromEntries(Object.entries(f.docs).filter(([k]) => kinds.has(k as DocKind))) as VForm['docs'];
  const need = new Set(requiredFields(f));
  const keep = (k: FieldKey, v: string) => (need.has(k) ? digitsOf(v) : '');
  return {
    ...f, legalName: f.legalName.trim(), idNumber: keep('idNumber', f.idNumber), crNumber: keep('crNumber', f.crNumber),
    licenceNumber: keep('licenceNumber', f.licenceNumber), vatNumber: keep('vatNumber', f.vatNumber), iban: need.has('iban') ? digitsOf(f.iban).toUpperCase() : '', docs,
  };
}

/** ID and IBAN as they appear in previews and history: only the last four digits. */
export const mask = (s: string) => (s ? `•••• ${digitsOf(s).slice(-4)}` : '');

/* ---------- Status: one source for every screen ---------- */

/** What the merchant may do now. Verified details change only through support (they are what payouts are paid to). */
export const canEdit = (s: VStatus) => s === 'not_started' || s === 'needs_info' || s === 'rejected';
/** Payouts wait until the store is verified. Sales are still collected and shown as pending. */
export const payoutsHeld = (s: VStatus) => s !== 'verified';
export const isVerified = (s: VStatus) => s === 'verified';

/** Reviewer decisions allowed from each status (review mode simulates LAK's reviewer). */
export const NEXT: Record<VStatus, VStatus[]> = {
  not_started: [], submitted: ['under_review'], under_review: ['needs_info', 'verified', 'rejected'], needs_info: [], verified: [], rejected: [],
};
export type Decision = 'under_review' | 'needs_info' | 'verified' | 'rejected';

export function nextRef(at: number): string { return `KYC-${String(at).slice(-6)}`; }

/** Submit (or resubmit) the cleaned form. Refused when the status does not allow editing or the form has errors. */
export function submit(v: Verification, form: VForm, by: string, at: number): { ok: true; v: Verification } | { ok: false; error: 'state' | 'invalid' } {
  if (!canEdit(v.status)) return { ok: false, error: 'state' };
  if (Object.keys(validateForm(form)).length) return { ok: false, error: 'invalid' };
  const clean = cleanForm(form);
  return { ok: true, v: { status: 'submitted', form: clean, ref: v.ref ?? nextRef(at), history: [{ status: 'submitted', at, by }, ...v.history] } };
}

/** A reviewer decision. needs_info and rejected need a reason; needs_info can point at what to fix. */
export function decide(v: Verification, to: Decision, by: string, at: number, reason = '', flagged: (DocKind | FieldKey)[] = []): { ok: true; v: Verification } | { ok: false; error: 'state' | 'reason' } {
  if (!NEXT[v.status].includes(to)) return { ok: false, error: 'state' };
  if ((to === 'needs_info' || to === 'rejected') && !reason.trim()) return { ok: false, error: 'reason' };
  const keep = to === 'needs_info' || to === 'rejected';
  return { ok: true, v: { ...v, status: to, reason: keep ? reason.trim() : undefined, flagged: to === 'needs_info' ? flagged : undefined, history: [{ status: to, at, by, note: keep ? reason.trim() : undefined }, ...v.history] } };
}

/** One summary for every place that mentions verification (settings card, payouts notice, work centre, search). */
export interface VSummary { status: VStatus; label: L; tone: (typeof STATUS_TONE)[VStatus]; held: boolean; next: L }
export function summary(v: Verification): VSummary {
  const next: Record<VStatus, L> = {
    not_started: { ar: 'وثّق متجرك لتبدأ التحويلات', en: 'Verify your store to start payouts' },
    submitted: { ar: 'بانتظار بدء المراجعة', en: 'Waiting for review to start' },
    under_review: { ar: 'نراجع وثائقك', en: 'Your documents are being reviewed' },
    needs_info: { ar: 'استكمل ما طُلب وأعد الإرسال', en: 'Provide what was asked and resubmit' },
    verified: { ar: 'التحويلات تعمل', en: 'Payouts are on' },
    rejected: { ar: 'صحّح البيانات وأعد الإرسال', en: 'Correct your details and resubmit' },
  };
  return { status: v.status, label: STATUS_LABEL[v.status], tone: STATUS_TONE[v.status], held: payoutsHeld(v.status), next: next[v.status] };
}

/* ---------- Fixtures ---------- */

/** The demo store has been paid out before, so it starts verified with the documents it was verified with. */
export function verificationFixture(): Verification {
  const at = Date.UTC(2026, 9, 2, 9);
  const file = (name: string): VFile => ({ name, size: 412_000, type: 'application/pdf', at });
  return {
    status: 'verified', ref: 'KYC-260412',
    form: {
      entity: 'sole', legalName: 'مؤسسة لمسة للأزياء', idNumber: '1000000008', crNumber: '1010123456', licenceNumber: '', vatRegistered: true,
      vatNumber: '300000000000003', iban: 'SA0380000000608010167519',
      docs: { cr: file('commercial-registration.pdf'), nationalId: file('owner-id.pdf'), iban: file('iban-letter.pdf'), vat: file('vat-certificate.pdf') },
    },
    history: [
      { status: 'verified', at: at + 2 * 86_400_000, by: 'LAK' },
      { status: 'under_review', at: at + 86_400_000, by: 'LAK' },
      { status: 'submitted', at, by: 'Owner' },
    ],
  };
}
export const notStartedFixture = (): Verification => ({ status: 'not_started', form: emptyForm(), ref: null, history: [] });
