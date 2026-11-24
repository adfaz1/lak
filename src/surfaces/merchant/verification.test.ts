import { describe, expect, it } from 'vitest';
import {
  checkCr, checkFile, checkSaudiId, checkVat, cleanForm, decide, digitsOf, emptyForm, mask, notStartedFixture, payoutsHeld, requiredDocs, requiredFields,
  submit, summary, validateForm, verificationFixture, type VForm,
} from './verification';

const file = { name: 'x.pdf', size: 1000, type: 'application/pdf', at: 1 };
const solo = (p: Partial<VForm> = {}): VForm => ({
  ...emptyForm(), entity: 'sole', legalName: 'مؤسسة تجربة', idNumber: '1000000008', crNumber: '1010123456', iban: 'SA0380000000608010167519',
  docs: { cr: file, nationalId: file, iban: file }, ...p,
});

describe('verification formats', () => {
  it('reads Arabic-Indic and Persian digits, spaces and dashes', () => {
    expect(digitsOf('١٠٠٠ ٠٠٠-٠٠٨')).toBe('1000000008');
    expect(digitsOf('۱۰۱۰۱۲۳۴۵۶')).toBe('1010123456');
  });
  it('checks Saudi ID / iqama: length, prefix and check digit', () => {
    expect(checkSaudiId('1000000008')).toMatchObject({ ok: true, kind: 'citizen' });
    expect(checkSaudiId('٢٠٠٠٠٠٠٠٠٦')).toMatchObject({ ok: true, kind: 'resident' });
    expect(checkSaudiId('1000000009')).toEqual({ ok: false, error: 'checksum' });
    expect(checkSaudiId('3000000008')).toEqual({ ok: false, error: 'prefix' });
    expect(checkSaudiId('12345')).toEqual({ ok: false, error: 'format' });
  });
  it('checks CR (10 digits) and VAT (15 digits, 3…3)', () => {
    expect(checkCr('١٠١٠١٢٣٤٥٦').ok).toBe(true);
    expect(checkCr('101012345').ok).toBe(false);
    expect(checkVat('300000000000003').ok).toBe(true);
    expect(checkVat('٣٠٠٠٠٠٠٠٠٠٠٠٠٠٣').ok).toBe(true);
    expect(checkVat('100000000000003')).toEqual({ ok: false, error: 'pattern' });
    expect(checkVat('30000')).toEqual({ ok: false, error: 'format' });
  });
  it('accepts PDF, JPG and PNG up to 5 MB', () => {
    expect(checkFile({ name: 'a.pdf', size: 10, type: 'application/pdf' })).toBeNull();
    expect(checkFile({ name: 'a.docx', size: 10, type: 'application/msword' })).toBe('type');
    expect(checkFile({ name: 'a.png', size: 6 * 1024 * 1024, type: 'image/png' })).toBe('size');
  });
  it('masks IDs to the last four digits', () => expect(mask('١٠٠٠٠٠٠٠٠٨')).toBe('•••• 0008'));
});

describe('requirements per entity', () => {
  it('asks each entity for its own fields and documents', () => {
    expect(requiredFields({ entity: 'individual', vatRegistered: false })).toEqual(['entity', 'legalName', 'idNumber', 'iban']);
    expect(requiredFields({ entity: 'charity', vatRegistered: true })).toContain('licenceNumber');
    expect(requiredFields({ entity: 'charity', vatRegistered: true })).toContain('vatNumber');
    expect(requiredDocs({ entity: 'company', vatRegistered: false }).filter((d) => d.required).map((d) => d.kind)).toEqual(['cr', 'articles', 'authorizedId', 'iban']);
    expect(requiredDocs({ entity: 'individual', vatRegistered: false }).find((d) => d.kind === 'freelance')?.required).toBe(false);
    expect(requiredDocs({ entity: '', vatRegistered: false })).toEqual([]);
  });
  it('blocks a form with a missing document or a bad number, and passes a complete one', () => {
    expect(validateForm(solo())).toEqual({});
    expect(validateForm(solo({ docs: { cr: file, nationalId: file } }))).toEqual({ iban: 'missingDoc' });
    expect(validateForm(solo({ idNumber: '1000000009', vatRegistered: true, vatNumber: '12' }))).toMatchObject({ idNumber: 'checksum', vatNumber: 'format', vat: 'missingDoc' });
    expect(validateForm(emptyForm())).toEqual({ entity: 'required' });
  });
  it('cleans before sending: Latin digits, upper-case IBAN, no fields or files the entity does not need', () => {
    const c = cleanForm(solo({ idNumber: '١٠٠٠٠٠٠٠٠٨', iban: 'sa03 8000 0000 6080 1016 7519', licenceNumber: '55', docs: { cr: file, nationalId: file, iban: file, articles: file } }));
    expect(c.idNumber).toBe('1000000008');
    expect(c.iban).toBe('SA0380000000608010167519');
    expect(c.licenceNumber).toBe('');
    expect(Object.keys(c.docs).sort()).toEqual(['cr', 'iban', 'nationalId']);
  });
});

describe('status is one source', () => {
  it('starts verified for the demo store (it has been paid out) with a complete record', () => {
    const v = verificationFixture();
    expect(v.status).toBe('verified');
    expect(validateForm(v.form)).toEqual({});
    expect(summary(v).held).toBe(false);
  });
  it('holds payouts in every status except verified', () => {
    for (const s of ['not_started', 'submitted', 'under_review', 'needs_info', 'rejected'] as const) expect(payoutsHeld(s)).toBe(true);
  });
  it('submit → under review → needs info (reason required) → resubmit → verified', () => {
    let v = notStartedFixture();
    expect(submit(v, emptyForm(), 'A', 1)).toEqual({ ok: false, error: 'invalid' });
    const s = submit(v, solo(), 'A', 100);
    expect(s.ok && s.v.status).toBe('submitted');
    v = (s as { v: typeof v }).v;
    expect(v.ref).toMatch(/^KYC-/);
    expect(submit(v, solo(), 'A', 101)).toEqual({ ok: false, error: 'state' });
    expect(decide(v, 'verified', 'R', 2)).toEqual({ ok: false, error: 'state' });
    v = (decide(v, 'under_review', 'R', 3) as { v: typeof v }).v;
    expect(decide(v, 'needs_info', 'R', 4, '  ')).toEqual({ ok: false, error: 'reason' });
    v = (decide(v, 'needs_info', 'R', 4, 'IBAN letter is unreadable', ['iban']) as { v: typeof v }).v;
    expect(v).toMatchObject({ status: 'needs_info', reason: 'IBAN letter is unreadable', flagged: ['iban'] });
    expect(summary(v).held).toBe(true);
    v = (submit(v, solo(), 'A', 5) as { v: typeof v }).v;
    expect(v.reason).toBeUndefined();
    v = (decide((decide(v, 'under_review', 'R', 6) as { v: typeof v }).v, 'verified', 'R', 7) as { v: typeof v }).v;
    expect(v.status).toBe('verified');
    expect(v.history.map((h) => h.status)).toEqual(['verified', 'under_review', 'submitted', 'needs_info', 'under_review', 'submitted']);
  });
});
