// Shared labels, tones and links for the automations screens.
import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, MinusCircle, ShoppingCart, Boxes, AlarmClock } from 'lucide-react';
import { link } from '../../../core/router';
import type { Automation, AutoStatus, RunOutcome, Trigger } from '../../merchant/growth';
import { useTx, type Tone } from '../../../ds/ui';

export const ahref = (path = '', q?: Record<string, string | undefined>) => link(`/dashboard/automations${path ? `/${path}` : ''}`, q);
export const A_TONE: Record<AutoStatus, Tone> = { active: 'green', paused: 'amber', draft: 'gray' };
export const R_TONE: Record<RunOutcome, Tone> = { succeeded: 'green', failed: 'red', skipped: 'gray' };
export const T_ICON: Record<Trigger, ReactNode> = { cartAbandoned: <ShoppingCart className="size-5" />, lowStock: <Boxes className="size-5" />, orderLate: <AlarmClock className="size-5" /> };

export function useNames() {
  const tx = useTx();
  return {
    status: (s: AutoStatus) => ({ active: tx('نشطة', 'Active'), paused: tx('موقوفة', 'Paused'), draft: tx('مسودة', 'Draft') })[s],
    trigger: (t: Trigger) => ({ cartAbandoned: tx('سلة متروكة', 'Cart abandoned'), lowStock: tx('مخزون منخفض', 'Low stock'), orderLate: tx('طلب متأخر في التجهيز', 'Order late to fulfil') })[t],
    action: (a: Automation['actions'][number]) => ({ sendEmail: tx('بريد للعميل الموافق', 'Email the consenting customer'), sendSms: tx('رسالة نصية للعميل الموافق', 'SMS the consenting customer'), createTask: tx('مهمة للفريق', 'Team task'), notifyStaff: tx('تنبيه موظف التجهيز', 'Alert fulfilment staff') })[a],
    outcome: (o: RunOutcome) => ({ succeeded: tx('نجح', 'Succeeded'), failed: tx('فشل', 'Failed'), skipped: tx('تُخطّي', 'Skipped') })[o],
  };
}
export const OutcomeIcon = ({ o }: { o: RunOutcome }) => (o === 'succeeded' ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : o === 'failed' ? <XCircle className="size-3.5" aria-hidden="true" /> : <MinusCircle className="size-3.5" aria-hidden="true" />);

