// Inbox vocabulary in both languages, and small display pieces (type icon, status badge, SLA chip).
import { AlarmClock, CheckCircle2, CircleHelp, MessageCircle, PauseCircle, RotateCcw, ShieldAlert, Star, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { sla, type Case, type CaseStatus, type CaseType, type Priority, type ShipIssue } from '../../merchant/inbox';
import { Badge, cn, useTx, type Tone } from '../../../ds/ui';
import { span } from './model';

export function useInboxText() {
  const tx = useTx();
  return {
    type: (t: CaseType) => ({ complaint: tx('شكوى', 'Complaint'), return: tx('طلب إرجاع', 'Return request'), question: tx('سؤال منتج', 'Product question'), shipping: tx('مشكلة شحن', 'Shipping problem'), review: tx('تقييم منخفض', 'Low review'), message: tx('رسالة', 'Message') })[t],
    status: (s: CaseStatus) => ({ new: tx('جديدة', 'New'), us: tx('بانتظارنا', 'Waiting on us'), customer: tx('بانتظار العميل', 'Waiting on customer'), carrier: tx('لدى شركة الشحن', 'With the carrier'), resolved: tx('محلولة', 'Resolved') })[s],
    prio: (p: Priority) => ({ urgent: tx('عاجلة', 'Urgent'), high: tx('عالية', 'High'), normal: tx('عادية', 'Normal'), low: tx('منخفضة', 'Low') })[p],
    issue: (i: ShipIssue) => ({ late: tx('متأخر', 'Late'), lost: tx('مفقود', 'Lost'), damaged: tx('متضرر', 'Damaged') })[i],
    view: (v: string) => ({ open: tx('المفتوحة', 'Open'), mine: tx('المسندة لي', 'Mine'), unassigned: tx('غير مسندة', 'Unassigned'), breach: tx('تجاوزت المهلة', 'Past due'), carrier: tx('لدى الناقل', 'With carrier'), resolved: tx('محلولة', 'Resolved'), all: tx('الكل', 'All') } as Record<string, string>)[v] ?? v,
    sort: (s: string) => ({ due: tx('الأقرب للمهلة', 'Due soonest'), new: tx('الأحدث', 'Newest'), old: tx('الأقدم', 'Oldest'), priority: tx('الأولوية', 'Priority') } as Record<string, string>)[s] ?? s,
    channel: (c: string) => ({ email: tx('بريد', 'Email'), sms: tx('رسالة نصية', 'SMS'), whatsapp: tx('واتساب', 'WhatsApp'), store: tx('المتجر', 'Store') } as Record<string, string>)[c] ?? c,
    source: (s: Case['source']) => ({ store: tx('من صفحة الطلب في المتجر', 'From the store order page'), email: tx('بالبريد', 'By email'), whatsapp: tx('بواتساب', 'By WhatsApp'), review: tx('من التقييمات', 'From reviews'), return: tx('من المرتجعات', 'From returns'), staff: tx('أضافها الفريق', 'Logged by staff') })[s],
  };
}

export const STATUS_TONE: Record<CaseStatus, Tone> = { new: 'brand', us: 'amber', customer: 'gray', carrier: 'sky', resolved: 'green' };
export const PRIO_TONE: Record<Priority, Tone> = { urgent: 'red', high: 'amber', normal: 'gray', low: 'gray' };

const TYPE_ICON: Record<CaseType, typeof Star> = { complaint: ShieldAlert, return: RotateCcw, question: CircleHelp, shipping: Truck, review: Star, message: MessageCircle };
const TYPE_TINT: Record<CaseType, string> = {
  complaint: 'bg-red-500/10 text-red-700 dark:text-red-300', return: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', question: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  shipping: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', review: 'bg-orange-500/10 text-orange-700 dark:text-orange-300', message: 'bg-surface-2 text-muted',
};
export function TypeIcon({ t, className }: { t: CaseType; className?: string }) {
  const I = TYPE_ICON[t];
  return <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', TYPE_TINT[t], className)} aria-hidden="true"><I className="size-4" /></span>;
}

export function StatusBadge({ s }: { s: CaseStatus }) {
  const T = useInboxText();
  return <Badge tone={STATUS_TONE[s]}>{T.status(s)}</Badge>;
}

/** "3h 10m left", "overdue 5h", "paused", "resolved". */
export function useSlaText() {
  const tx = useTx();
  return (c: Case, now: number): { text: string; tone: Tone; icon: ReactNode } => {
    const s = sla(c, now);
    const fmt = (ms: number) => { const x = span(ms); return x.d ? tx(`${x.d} ي ${x.h} س`, `${x.d}d ${x.h}h`) : x.h ? tx(`${x.h} س ${x.m} د`, `${x.h}h ${x.m}m`) : tx(`${x.m} د`, `${x.m}m`); };
    const carrier = c.status === 'carrier';
    if (s.state === 'done') return { text: tx('محلولة', 'Resolved'), tone: 'green', icon: <CheckCircle2 className="size-3.5" aria-hidden="true" /> };
    if (s.state === 'breached') return { text: carrier ? tx(`الناقل متأخر ${fmt(s.leftMs!)}`, `Carrier overdue ${fmt(s.leftMs!)}`) : tx(`تجاوزت المهلة ${fmt(s.leftMs!)}`, `Overdue ${fmt(s.leftMs!)}`), tone: 'red', icon: <AlarmClock className="size-3.5" aria-hidden="true" /> };
    if (s.state === 'paused') return { text: carrier ? tx('بانتظار الناقل', 'Waiting on carrier') : tx('المهلة متوقفة', 'Clock paused'), tone: 'gray', icon: <PauseCircle className="size-3.5" aria-hidden="true" /> };
    return { text: carrier ? tx(`رد الناقل خلال ${fmt(s.leftMs!)}`, `Carrier due in ${fmt(s.leftMs!)}`) : tx(`باقٍ ${fmt(s.leftMs!)}`, `${fmt(s.leftMs!)} left`), tone: s.state === 'soon' ? 'amber' : 'sky', icon: <AlarmClock className="size-3.5" aria-hidden="true" /> };
  };
}
export function SlaChip({ c, now }: { c: Case; now: number }) {
  const t = useSlaText()(c, now);
  return <Badge tone={t.tone} icon={t.icon}>{t.text}</Badge>;
}
