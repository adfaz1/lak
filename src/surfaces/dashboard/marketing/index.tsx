// Marketing & offers (`#/dashboard/marketing`): coupons, abandoned-cart recovery, campaigns.
// Tabs live in the URL (`?tab=`); a coupon opens at `#/dashboard/marketing/coupons/<code|new>`.
import { Plus } from 'lucide-react';
import { link, type Route } from '../../../core/router';
import { canSee, can } from '../../merchant/perms';
import { cartsStore, couponsStore } from '../../merchant/stores';
import { audience } from '../../merchant/growth';
import { Card, ErrorState, LinkButton, Skeleton, useTx } from '../../../ds/ui';
import { PageHeader, Tabs } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { NoAccess, ReviewRole, useRole } from './access';
import { campaignsStore } from './model';
import { useSendRunner } from './send';
import Coupons from './coupons';
import CouponEditor from './coupon-editor';
import Carts from './carts';
import Campaigns from './campaigns';

export type Tab = 'coupons' | 'carts' | 'campaigns';
export const mhref = (q?: Record<string, string | undefined>) => link('/dashboard/marketing', q);

export default function Marketing({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  const state = useDashState();
  const coupons = couponsStore.use();
  const carts = cartsStore.use();
  const campaigns = campaignsStore.use();
  useSendRunner();

  if (!canSee(role, 'marketing')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('التسويق غير متاح لدورك', 'Marketing is not available for your role')} /></div>;
  if (route.path[0] === 'coupons' && route.path[1]) return <CouponEditor key={route.path[1]} code={route.path[1]} />;

  const q = route.query.get('tab');
  const tab: Tab = q === 'carts' || q === 'campaigns' ? q : 'coupons';
  const manage = can(role, 'marketing.manage');
  const send = can(role, 'marketing.send');
  const empty = state === 'empty';
  const cnt = (n: number) => (state === 'live' ? n : empty ? 0 : undefined);

  const actions = tab === 'coupons' && manage ? <LinkButton href={link('/dashboard/marketing/coupons/new')}><Plus className="size-4" aria-hidden="true" />{tx('كوبون جديد', 'New coupon')}</LinkButton>
    : tab === 'campaigns' && send && route.query.get('compose') !== '1' ? <LinkButton href={mhref({ tab: 'campaigns', compose: '1' })}><Plus className="size-4" aria-hidden="true" />{tx('رسالة جماعية', 'New broadcast')}</LinkButton>
      : undefined;

  const header = (
    <>
      <PageHeader title={tx('التسويق والعروض', 'Marketing & offers')} description={tx('عروض ورسائل بمعاينة قبل أي أثر', 'Offers and messages, previewed before any effect')} actions={actions} />
      <ReviewRole />
      <Tabs label={tx('أقسام التسويق', 'Marketing sections')} items={[
        { href: mhref(), label: tx('الكوبونات', 'Coupons'), current: tab === 'coupons', count: cnt(coupons.length) },
        { href: mhref({ tab: 'carts' }), label: tx('السلال المتروكة', 'Abandoned carts'), current: tab === 'carts', count: cnt(audience(carts, 'email', 4).eligible.length) },
        { href: mhref({ tab: 'campaigns' }), label: tx('الحملات', 'Campaigns'), current: tab === 'campaigns', count: cnt(campaigns.length) },
      ]} />
    </>
  );

  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<MarketingSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل التسويق', 'Marketing could not load')} onRetry={() => setDashState('live')}>
        {tx('عروضك وحملاتك لم تتغير، والكوبونات النشطة ما زالت تُقبل. المرجع SIM-MKT-503.', 'Your offers and campaigns did not change; active coupons are still accepted. Ref SIM-MKT-503.')}
      </ErrorState></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {header}
      {tab === 'coupons' && <Coupons route={route} empty={empty} canManage={manage} />}
      {tab === 'carts' && <Carts empty={empty} canSend={send} />}
      {tab === 'campaigns' && <Campaigns route={route} empty={empty} canSend={send} />}
    </div>
  );
}

function MarketingSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5" role="status" aria-label="Loading">
      <div className="flex gap-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-10 w-24" /></div>
      <div className="mt-6 space-y-5">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="h-5 w-28" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-16 rounded-full" /><Skeleton className="h-9 w-20 rounded-lg" /></div>)}</div>
    </div>
  );
}
