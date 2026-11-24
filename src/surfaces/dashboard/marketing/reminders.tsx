// Reminders (`#/dashboard/marketing/reminders`): messages the store sends on its own. Two parts in the URL:
// the abandoned-cart sequence (default, `?step=` focuses a step) and reorder reminders (`?r=reorder`, `&rule=`).
import { BellRing } from 'lucide-react';
import { link, type Route } from '../../../core/router';
import { Card, EmptyState, useTx } from '../../../ds/ui';
import { Tabs } from '../../../ds/kit';
import { deliveriesStore, reminderProblems, reorderStore, sequenceStore } from './reminders-model';
import { couponsStore } from '../../merchant/stores';
import CartReminders from './reminders-carts';
import ReorderReminders from './reminders-reorder';

export default function Reminders({ route, empty, canManage, canSend }: { route: Route; empty: boolean; canManage: boolean; canSend: boolean }) {
  const tx = useTx();
  const seq = sequenceStore.use();
  const rules = reorderStore.use();
  const deliveries = deliveriesStore.use();
  const coupons = couponsStore.use();
  const part = route.query.get('r') === 'reorder' ? 'reorder' : 'carts';
  const probs = reminderProblems(seq, rules, deliveries, coupons);
  const nCart = probs.filter((p) => p.source === 'seq').length, nRe = probs.length - nCart;
  if (empty) return (
    <Card><EmptyState as="h2" icon={<BellRing className="size-6" aria-hidden="true" />} title={tx('لا تذكيرات بعد', 'No reminders yet')}>
      {tx('تذكير السلة يُرسل لمن ترك سلته، وتذكير إعادة الشراء لمن قارب منتجه على النفاد.', 'Cart reminders reach customers who left a cart; reorder reminders reach those running low.')}
    </EmptyState></Card>
  );
  return (
    <div className="space-y-6">
      <Tabs label={tx('نوع التذكير', 'Reminder type')} items={[
        { href: link('/dashboard/marketing/reminders'), label: tx('السلال المتروكة', 'Abandoned carts'), current: part === 'carts', count: nCart || undefined },
        { href: link('/dashboard/marketing/reminders', { r: 'reorder' }), label: tx('إعادة الشراء', 'Reorder'), current: part === 'reorder', count: nRe || undefined },
      ]} />
      {part === 'carts' ? <CartReminders route={route} canManage={canManage} canSend={canSend} /> : <ReorderReminders route={route} canManage={canManage} canSend={canSend} />}
    </div>
  );
}
