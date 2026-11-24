// Session store for store verification: the only place the verification status lives. Settings, the payouts
// notice, the work centre and search all read it through `summary()`. Simulated: no reviewer, no file storage.
import { createStore } from '../../core/store';
import { currentActor, logAction } from './stores';
import { STATUS_LABEL, decide, notStartedFixture, submit, verificationFixture, type Decision, type DocKind, type FieldKey, type VForm, type Verification } from './verification';

export const verificationStore = createStore.key('merchant.verification')<Verification>(verificationFixture);

/** Uploaded files for this tab: object URLs are not saved with the session, so after a reload only the names remain. */
const urls = new Map<string, string>();
export const fileUrl = (key: string) => urls.get(key) ?? null;
export function keepFile(key: string, file: Blob): string {
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  const u = URL.createObjectURL(file);
  urls.set(key, u);
  return u;
}
export function dropFile(key: string) { const u = urls.get(key); if (u) URL.revokeObjectURL(u); urls.delete(key); }

export function submitVerification(form: VForm): ReturnType<typeof submit> {
  const v = verificationStore.get();
  const r = submit(v, form, currentActor().name, Date.now());
  if (!r.ok) return r;
  verificationStore.set(r.v);
  logAction('settings', v.status === 'not_started' ? { ar: 'أرسل طلب توثيق المتجر', en: 'Submitted store verification' } : { ar: 'أعاد إرسال طلب توثيق المتجر', en: 'Resubmitted store verification' }, { target: r.v.ref ?? undefined, before: STATUS_LABEL[v.status].en, after: STATUS_LABEL.submitted.en });
  return r;
}

/** Review mode only: what LAK's reviewer would decide. Logged as the simulated reviewer. */
export function simulateDecision(to: Decision, reason = '', flagged: (DocKind | FieldKey)[] = []): ReturnType<typeof decide> {
  const v = verificationStore.get();
  const r = decide(v, to, 'LAK (simulated)', Date.now(), reason, flagged);
  if (!r.ok) return r;
  verificationStore.set(r.v);
  logAction('settings', { ar: `مراجعة التوثيق (محاكاة): ${STATUS_LABEL[to].ar}`, en: `Verification review (simulated): ${STATUS_LABEL[to].en}` }, { target: v.ref ?? undefined, before: STATUS_LABEL[v.status].en, after: STATUS_LABEL[to].en });
  return r;
}

/** Review mode only: jump to the start (empty form) or back to the verified demo record. */
export function simulateStart(which: 'not_started' | 'verified') {
  verificationStore.set(which === 'verified' ? verificationFixture() : notStartedFixture());
}
