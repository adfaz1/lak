// Work-centre entry for store verification, built from the one verification status (merchant/verification.ts).
// The work centre owns its queue; it calls `verificationWorkItem(verificationStore.get())` and renders `title`/`why`/`cta`.
// Nothing to do while the store is verified or a review is running, so those return null.
import type { L } from '../../merchant/domain';
import { STATUS_LABEL, type Verification } from '../../merchant/verification';
import type { WorkItem } from '../work/model';

export type VerificationWorkItem = Omit<WorkItem, 'kind'> & { kind: 'verification'; title: L; why: L; cta: L };

/** `held` = payouts waiting because of verification (halalas), when the caller knows it; shown as the money at stake. */
export function verificationWorkItem(v: Verification, held = 0): VerificationWorkItem | null {
  if (v.status === 'verified' || v.status === 'submitted' || v.status === 'under_review') return null;
  const why: Record<'not_started' | 'needs_info' | 'rejected', L> = {
    not_started: { ar: 'التحويلات محجوزة حتى يُوثَّق المتجر', en: 'Payouts are held until the store is verified' },
    needs_info: { ar: `طُلب استكمال: ${v.reason ?? ''}`.trim(), en: `More information requested: ${v.reason ?? ''}`.trim() },
    rejected: { ar: `رُفض الطلب: ${v.reason ?? ''}`.trim(), en: `Application rejected: ${v.reason ?? ''}`.trim() },
  };
  const cta: Record<'not_started' | 'needs_info' | 'rejected', L> = {
    not_started: { ar: 'ابدأ التوثيق', en: 'Start verification' },
    needs_info: { ar: 'استكمل وأعد الإرسال', en: 'Complete and resubmit' },
    rejected: { ar: 'صحّح وأعد الإرسال', en: 'Correct and resubmit' },
  };
  const s = v.status;
  return {
    id: 'verification', kind: 'verification', severity: s === 'not_started' ? 2 : 3,
    money: held, moneyKind: held ? 'orders' : 'none', orders: 0, customers: 0, skus: [], oldestHours: null,
    facts: { status: s, reason: v.reason ?? null, ref: v.ref },
    subject: STATUS_LABEL[s],
    action: { section: 'settings', path: 'verification' }, page: 'settings', settings: 'billing',
    fingerprint: `${s}:${v.history[0]?.at ?? 0}`,
    title: { ar: 'توثيق المتجر', en: 'Store verification' }, why: why[s], cta: cta[s],
  };
}
