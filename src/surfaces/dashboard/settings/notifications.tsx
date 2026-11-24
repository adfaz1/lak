// Merchant notifications: per event, email and SMS.
import { useState } from 'react';
import { settingsStore } from '../../merchant/stores';
import { NOTIFY_EVENTS, type Notify, type NotifyEvent } from '../../merchant/workspace';
import { InfoHint, useTx } from '../../../ds/ui';
import { SaveBar, Switch } from '../../../ds/kit';
import { notifyCount, notifyError, same } from './model';
import { LeaveGuard, Section, useSave } from './common';

const EVENT: Record<NotifyEvent, [string, string]> = {
  newOrder: ['طلب جديد', 'New order'], paymentFailed: ['تعثّر دفع', 'Payment failed'], lowStock: ['مخزون منخفض', 'Low stock'],
  payout: ['إيداع تسوية', 'Payout sent'], review: ['تقييم جديد', 'New review'],
};

export default function NotificationsPage() {
  const tx = useTx();
  const saved = settingsStore.use().notify;
  const [n, setN] = useState<Notify>(saved);
  const { saving, error, save, clearError } = useSave();
  const dirty = !same(n, saved);
  const bad = notifyError(n);
  const c = notifyCount(n);
  const toggle = (e: NotifyEvent, ch: 'email' | 'sms', v: boolean) => { setN({ ...n, [e]: { ...n[e], [ch]: v } }); clearError(); };
  return (
    <Section id="nt-h" flush title={tx('تنبيهاتك', 'Your alerts')}
      hint={<InfoHint>{tx('تصل إليك وإلى بريد التواصل في بيانات المتجر. ليست رسائل للعملاء.', 'Sent to you and the contact email in store details. These are not customer messages.')}</InfoHint>}
      action={<span className="text-xs text-muted tabular-nums">{tx(`${c.email} بريد · ${c.sms} رسائل`, `${c.email} email · ${c.sms} SMS`)}</span>}>
      <LeaveGuard dirty={dirty} />
      <table className="w-full text-sm">
        <caption className="sr-only">{tx('التنبيهات حسب الحدث والقناة', 'Alerts by event and channel')}</caption>
        <thead><tr className="border-y border-border text-xs text-muted"><th scope="col" className="px-5 py-2.5 text-start font-semibold">{tx('الحدث', 'Event')}</th><th scope="col" className="w-20 px-3 py-2.5 font-semibold">{tx('بريد', 'Email')}</th><th scope="col" className="w-20 px-5 py-2.5 font-semibold">{tx('رسائل', 'SMS')}</th></tr></thead>
        <tbody className="divide-y divide-border">
          {NOTIFY_EVENTS.map((e) => (
            <tr key={e}>
              <th scope="row" className="px-5 py-3 text-start font-medium text-fg">{tx(...EVENT[e])}{e === 'paymentFailed' && bad && <span className="mt-0.5 block text-xs font-medium text-red-600 dark:text-red-400">{tx('أبقِ قناة واحدة على الأقل', 'Keep at least one channel on')}</span>}</th>
              <td className="px-3 py-3"><span className="flex justify-center"><Switch checked={n[e].email} onChange={(v) => toggle(e, 'email', v)} label={tx(`${EVENT[e][0]} بالبريد`, `${EVENT[e][1]} by email`)} /></span></td>
              <td className="px-5 py-3"><span className="flex justify-center"><Switch checked={n[e].sms} onChange={(v) => toggle(e, 'sms', v)} label={tx(`${EVENT[e][0]} برسالة`, `${EVENT[e][1]} by SMS`)} /></span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <SaveBar dirty={dirty} saving={saving} error={error ?? (bad ? tx('تعثّر الدفع يحتاج قناة واحدة على الأقل', 'Payment failed needs at least one channel') : undefined)}
        onDiscard={() => { setN(saved); clearError(); }} onSave={() => { if (bad) return; save(() => settingsStore.set((x) => ({ ...x, notify: n })), tx('حُفظت التنبيهات', 'Alerts saved')); }} />
    </Section>
  );
}
